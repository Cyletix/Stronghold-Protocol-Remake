"""Bounded, read-only native analysis of inspected JP 36.7.22 IL2CPP binary.

Outputs annotated disassembly and native field layouts below ignored work/.
Neither this tool nor its outputs claim to recover the original C# source.
"""
from __future__ import annotations
import argparse, bisect, collections, hashlib, json, re, struct
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/client-logic/native-enemy"


class Snapshot:
    def __init__(self):
        self.path = ROOT / "work/apk-extracted/lib/arm64-v8a/libil2cpp.so"
        self.data = self.path.read_bytes()
        assert self.data[:6] == b"\x7fELF\x02\x01"
        assert struct.unpack_from("<H", self.data, 18)[0] == 183
        phoff = struct.unpack_from("<Q", self.data, 32)[0]
        stride, count = struct.unpack_from("<HH", self.data, 54)
        self.segments = [struct.unpack_from("<II6Q", self.data, phoff+i*stride) for i in range(count)]
        self.types = json.loads((ROOT / "work/client-logic/metadata/types.json").read_text(encoding="utf-8"))
        self.byval = {t["byvalTypeIndex"]: t for t in self.types}
        for t in self.types:
            t.setdefault("fullName", (t["namespace"]+"." if t["namespace"] else "")+t["name"])
        count, table = self.words(0xa177248+104, 2)
        assert count == 82
        modules = {}
        self.unreadable_modules = []
        for pointer in self.words(table, count):
            name, count, table = self.words(pointer, 3)
            try:
                module_name = self.string(name)
                assert module_name.endswith(".dll") or module_name == "__Generated"
            except (AssertionError, UnicodeDecodeError):
                self.unreadable_modules.append(dict(rva=hex(pointer), nameRva=hex(name), count=count))
                continue
            modules[module_name] = self.words(table, count) if count else []
        self.names = collections.defaultdict(list)
        self.methods = []
        for t in self.types:
            if t["assembly"] not in modules:
                continue
            for m in t["methods"]:
                address = modules[t["assembly"]][(int(m["token"], 16)&0xffffff)-1]
                if address:
                    name = t["fullName"]+"::"+m["name"]
                    self.names[address].append(name)
                    self.methods.append(dict(m, type=t["fullName"], address=address))
        self.addresses = sorted(self.names)
        self.dis = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
        self.meta = self.words(0xa462ae0, 16)

    def type_info(self, index):
        pointer = self.words(self.meta[7]+index*8, 1)[0]
        data, bits = self.words(pointer, 2)
        kind = (bits >> 16)&255
        result = dict(il2CppTypeIndex=index, kind=kind, attrs=bits&65535,
                      byref=bool(bits&(1<<30)))
        if kind in (0x11, 0x12, 0x0e, 0x1c) and data < len(self.types):
            result.update(typeName=self.types[data]["fullName"], definitionIndex=data)
        elif kind in (2,3,4,5,6,7,8,9,10,11,12,13):
            result["typeName"]={2:"bool",3:"char",4:"sbyte",5:"byte",6:"short",7:"ushort",8:"int",9:"uint",10:"long",11:"ulong",12:"float",13:"double"}[kind]
        return result

    def offset(self, address):
        for p in self.segments:
            if p[0] == 1 and p[3] <= address < p[3]+p[5]:
                return p[2]+address-p[3]
        raise ValueError(f"Unmapped file-backed RVA {address:#x}")

    def words(self, address, count):
        assert 0 <= count < 1000000
        return struct.unpack_from("<"+str(count)+"Q", self.data, self.offset(address))

    def string(self, address):
        start = self.offset(address)
        end = self.data.find(b"\0", start)
        assert 0 <= end-start < 1024
        return self.data[start:end].decode("utf-8")

    def layout(self, t):
        count, pointers = self.meta[10:12]
        assert count == len(self.types)
        pointer = self.words(pointers+t["typeIndex"]*8, 1)[0]
        offsets = struct.unpack_from("<"+str(len(t["fields"]))+"i", self.data, self.offset(pointer)) if t["fields"] else []
        return dict(type=t["fullName"], typeIndex=t["typeIndex"],
                    fields=[dict(f, rawOffset=off, offset=off if -1 <= off < 0x100000 else None,
                                 offsetStatus="plausible" if -1 <= off < 0x100000 else "protected-or-invalid",
                                 nativeType=self.type_info(f["typeIndex"]))
                            for f, off in zip(t["fields"], offsets)])

    def assembly(self, address, end=None):
        if end is None:
            i = bisect.bisect_right(self.addresses, address)
            end = min(self.addresses[i] if i < len(self.addresses) else address+0x4000, address+0x10000)
        start = self.offset(address)
        result = []
        for ins in self.dis.disasm(self.data[start:start+end-address], address):
            line = f"{ins.address:016x}  {ins.mnemonic:<10} {ins.op_str}"
            if ins.mnemonic in ("bl", "b") and ins.op_str.startswith("#0x"):
                callee = int(ins.op_str[1:], 16)
                if callee in self.names:
                    line += " ; "+" | ".join(self.names[callee][:5])
            result.append(line)
        return result

    def signatures(self, methods):
        raw = (ROOT/"work/client-logic/metadata/global-metadata.candidate.dat").read_bytes()
        header = struct.unpack_from("<64I", raw)
        sections = [header[i:i+2] for i in range(2, 64, 2)]
        def name(index):
            begin = sections[2][0]+index
            return raw[begin:raw.find(b"\0", begin)].decode("utf-8")
        result = []
        for method in methods:
            row = struct.unpack_from("<6I4H", raw, sections[5][0]+method["index"]*32)
            assert name(row[0]) == method["name"]
            parameters = []
            for j in range(row[9]):
                p = struct.unpack_from("<3I", raw, sections[10][0]+(row[3]+j)*12)
                assert p[1] >> 24 == 8
                parameters.append(dict(name=name(p[0]), token=hex(p[1]), nativeType=self.type_info(p[2])))
            result.append(dict(type=method["type"], method=method["name"], rva=hex(method["address"]),
                               returnType=self.type_info(row[2]), parameters=parameters))
        return result

    def helper_evidence(self):
        names = {m["index"]: (t["fullName"], m["name"]) for t in self.types for m in t["methods"]}
        result = []
        # Caller loads the address of an IL2CPP metadata-usage storage slot.
        for slot in [0xa6ec918, 0xa624a60, 0xa5f4100, 0xa5cb5c8]:
            storage = self.words(slot, 1)[0]
            encoded = self.words(storage, 1)[0]
            kind, index = encoded >> 29, (encoded&0x1fffffff) >> 1
            record = dict(slotRva=hex(slot), storageRva=hex(storage), encoded=hex(encoded), kind=kind)
            if kind == 6 and index < self.meta[8]:
                spec = struct.unpack_from("<3i", self.data, self.offset(self.meta[9])+index*12)
                record.update(methodSpecIndex=index, rawMethodSpec=spec)
                if spec[0] in names:
                    record.update(type=names[spec[0]][0], method=names[spec[0]][1], status="resolved-from-method-usage")
                else:
                    record["status"] = "method-spec-unresolved"
            result.append(record)
        return result


def save(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", action="append", default=[])
    parser.add_argument("--address", action="append", default=[])
    args = parser.parse_args()
    snap = Snapshot()
    requested = args.type or ["AutoChessLevelEnemyManager"]
    chosen = [t for t in snap.types if any(k in t["fullName"] for k in requested)]
    save("layouts.json", [snap.layout(t) for t in chosen])
    save("metadata-registration.json", [hex(v) for v in snap.meta])
    save("unreadable-modules.json", snap.unreadable_modules)
    save("helper-evidence.json", snap.helper_evidence())
    methods = [m for m in snap.methods if any(m["type"] == t["fullName"] for t in chosen)]
    save("signatures.json", snap.signatures(methods))
    for m in methods:
        name = str(m["index"])+"_"+re.sub(r"[^A-Za-z0-9_]", "_", m["name"])+".asm"
        (OUT/name).write_text("; "+m["type"]+"::"+m["name"]+"\n"+"\n".join(snap.assembly(m["address"]))+"\n", encoding="utf-8")
    for requested_address in args.address:
        address = int(requested_address, 0)
        (OUT/(hex(address)+".asm")).write_text("\n".join(snap.assembly(address))+"\n", encoding="utf-8")
    helpers = {0x543a99c:0x543b088, 0x5438970:0x5438a8c, 0x5438a8c:0x5438f20,
               0x52eae64:0x52eaf68, 0x7b91908:0x7b91920, 0x32aa24c:0x32aa2c0,
               0x32aa1f8:0x32aa24c, 0x32aa1b4:0x32aa1f8, 0x39b1ae8:0x39b1af4,
               0x52fbd3c:0x52fbea0}
    for begin, end in helpers.items():
        (OUT/(hex(begin)+".asm")).write_text("\n".join(snap.assembly(begin,end))+"\n",encoding="utf-8")
    save("native-constants.json", {"mathUtilLE":{"rva":"0x8057228","float32":struct.unpack_from("<f",snap.data,snap.offset(0x8057228))[0]}})
    save("index.json", dict(snapshot="JP 36.7.22", source=str(snap.path.relative_to(ROOT)),
        sha256=hashlib.sha256(snap.data).hexdigest(), codeRegistration="0xa177248", metadataRegistration="0xa462ae0",
        methods=[dict(m, rva=hex(m["address"])) for m in methods],
        boundary="Method-token mapping and native field offsets. C# source and hotfix overrides are not recovered here."))
    print(json.dumps(dict(types=len(chosen), methods=len(methods), output=str(OUT)), ensure_ascii=False))


if __name__ == "__main__":
    main()
