"""Extract serialized client logic, not descriptive skill approximations.

All large outputs stay under ignored work/. No runtime/checklist mutations.
python -B tools/extract_client_logic.py
python -B tools/extract_client_logic.py --recover-metadata --enemies --operators
"""
from __future__ import annotations
import argparse, collections, hashlib, json, struct, zipfile
from pathlib import Path
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parents[1]
METADATA_SHA256 = "c3c1a306ef5945be72a68f8c0974ca13429116039c848032e6c373ecd6316ca8"
NATIVE_SHA256 = "d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af"
def sha(b): return hashlib.sha256(b).hexdigest()
def save(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
def safe(v):
    if isinstance(v, bytes): return {"bytesHex": v.hex()}
    if isinstance(v, dict):
        return {k: str(x) if k == "m_PathID" else safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [safe(x) for x in v]
    return v
def walk(v):
    if isinstance(v, dict):
        yield v
        for x in v.values(): yield from walk(x)
    elif isinstance(v, list):
        for x in v: yield from walk(x)
def expand(v):
    if isinstance(v, dict):
        result = {k: expand(x) for k, x in v.items()}
        if isinstance(v.get("SerializedState"), str) and v["SerializedState"]:
            result["decodedActions"] = json.loads(v["SerializedState"])
        return result
    if isinstance(v, list): return [expand(x) for x in v]
    return v
def load_bundle(blob):
    env = Environment()
    for name, b in parse_ab(blob):
        if name.endswith(".resS"): continue
        f = parse_file(EndianBinaryReader(b), env, name)
        env.register_cab(name, f)
        env.files[name] = f
    return env

def metadata(out, recover):
    source = ROOT / "work/apk-extracted/assets/bin/Data/Managed/Metadata/global-metadata.dat"
    source_raw = source.read_bytes()
    if sha(source_raw) != METADATA_SHA256:
        raise ValueError("Metadata snapshot differs from the verified decryption profile")
    raw = source_raw
    # This profile is for the inspected JP 36.7.22 snapshot, not a generic decryptor.
    expected = "94437212184b9eec"
    if raw[:8].hex() != expected:
        raise ValueError("Unrecognized metadata profile; do not guess a decryption")
    decoded = bytearray(raw)
    for start in range(0, len(raw), 0x10000):
        left, right = start+0x1000, min(start+0x5000,len(raw))
        decoded[left:right] = bytes(x^102 for x in raw[left:right])
    decoded[:0x1000] = bytes(x^102 for x in raw[:0x1000])
    raw = bytes(decoded)
    header = raw[:256]
    h = struct.unpack("<64I", header)
    sections = [tuple(h[i:i+2]) for i in range(2,64,2)]
    for off,size in sections:
        assert 256 <= off <= len(raw) and off+size <= len(raw)
    for (off,size),(nxt,_) in zip(sections,sections[1:]):
        assert off+size <= nxt
    so,ss = sections[2]
    strings = raw[so:so+ss]
    def string(index):
        assert 0 <= index < len(strings)
        end = strings.find(b"\0",index)
        assert end >= index
        return strings[index:end].decode("utf-8")
    def rows(section, fmt, xor=0):
        off,size=sections[section]; stride=struct.calcsize(fmt)
        assert size % stride == 0
        blob=raw[off:off+size]
        if xor: blob=bytes(x^xor for x in blob)
        return list(struct.iter_unpack(fmt,blob))
    types=rows(19,"<16I8H2I")
    methods=rows(5,"<6I4H")
    fields=rows(11,"<3I")
    parameters=rows(10,"<3I")
    images=rows(20,"<10I")
    for row in methods:
        string(row[0]); assert row[1]<len(types) and row[5]>>24==6
    for row in fields:
        string(row[0]); assert row[2]>>24==4
    for row in parameters:
        string(row[0]); assert row[1]>>24==8
    image_names={}
    for row in images:
        name=string(row[0])
        assert row[2]+row[3]<=len(types)
        for i in range(row[2],row[2]+row[3]): image_names[i]=name
    index=[]
    for i,row in enumerate(types):
        name,namespace=string(row[0]),string(row[1])
        assert row[-1]>>24==2
        start,count=row[9],row[16]
        fstart,fcount=row[8],row[18]
        own_methods=methods[start:start+count] if count else []
        own_fields=fields[fstart:fstart+fcount] if fcount else []
        assert len(own_methods)==count and len(own_fields)==fcount
        assert all(m[1]==i for m in own_methods)
        index.append({"typeIndex":i,"assembly":image_names.get(i),
            "name":name,"namespace":namespace,"byvalTypeIndex":row[2],
            "parentIl2CppTypeIndex":row[4], "declaringIl2CppTypeIndex":row[3], "token":hex(row[-1]),
            "methods":[{"index":start+j,"name":string(m[0]),"token":hex(m[5]),
                "returnTypeIndex":m[2],"parameterCount":m[9],
                "parameters":[{"name":string(p[0]),"token":hex(p[1]),"typeIndex":p[2]} for p in parameters[m[3]:m[3]+m[9]]]} for j,m in enumerate(own_methods)],
            "fields":[{"index":fstart+j,"name":string(f[0]),"typeIndex":f[1]}
                for j,f in enumerate(own_fields)]})
    byval={t["byvalTypeIndex"]:t for t in index}
    def fullname(t, trail=None):
        trail=set() if trail is None else trail
        assert t["typeIndex"] not in trail
        trail.add(t["typeIndex"])
        parent=byval.get(t["declaringIl2CppTypeIndex"])
        if parent is not None: return fullname(parent,trail)+"+"+t["name"]
        return (t["namespace"]+"." if t["namespace"] else "")+t["name"]
    for t in index: t["fullName"]=fullname(t)
    save(out/"metadata/types.json", index)
    relevant=[t for t in index if "Battle" in t["fullName"] or "AutoChess" in t["fullName"] or "Garrison" in t["fullName"]]
    save(out/"metadata/battle-types.json",relevant)
    result={"source":str(source.relative_to(ROOT)),"sourceSha256":sha(source_raw),
        "headerSectionCount":len(sections),"types":len(types),"methods":len(methods),
        "fields":len(fields),"parameters":len(parameters),"images":len(images),"battleOrModeTypes":len(relevant),
        "validation":"All type/field/method tokens, names, image/type ranges, and method ownership validated.",
        "boundary":"Metadata declarations are not native method bodies. Parent indices need binary type resolution.",
        "candidateRecovered":False}
    if recover:
        # Per-section masks established from this snapshot's structural samples.
        # Keep an explicitly named candidate until Il2CppDumper validates it.
        candidate=bytearray(raw)
        candidate[:256]=header
        struct.pack_into("<II",candidate,0,0xFAB11BAF,29)
        masks="XOR 0x66: first 4 KiB and offsets 0x1000..0x4fff within each 64 KiB block. First block 0x1000..0x4fff remains unverified."
        (out/"metadata/global-metadata.candidate.dat").write_bytes(candidate)
        no_literals=bytearray(candidate)
        struct.pack_into("<I",no_literals,12,0)
        (out/"metadata/global-metadata.no-literals.dat").write_bytes(no_literals)
        result.update(candidateRecovered=True,candidateVersion=29,candidateXorSections=masks,
                      candidateSha256=sha(candidate), unresolvedRegions=[{"offset":4096,"size":16384,"purpose":"string literal descriptors, not method names or bodies"}], noLiteralsCandidate="global-metadata.no-literals.dat")
    save(out/"metadata/summary.json",result)
    return result


def native_symbols(out):
    """Bind metadata method tokens through the inspected ELF codegen module table.

    The registration RVA was independently found by Il2CppDumper. Cross-check
    module names, method tokens/counts and executable segments. No code executes.
    """
    from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
    source=ROOT/"work/apk-extracted/lib/arm64-v8a/libil2cpp.so"
    data=source.read_bytes()
    if sha(data) != NATIVE_SHA256:
        raise ValueError("Native snapshot differs from the verified registration profile")
    assert data[:6]==b"\x7fELF\x02\x01"
    assert struct.unpack_from("<H",data,18)[0]==183
    phoff=struct.unpack_from("<Q",data,32)[0]
    phsize,phnum=struct.unpack_from("<HH",data,54)
    segments=[struct.unpack_from("<II6Q",data,phoff+i*phsize) for i in range(phnum)]
    def offset(addr):
        for p in segments:
            if p[0]==1 and p[3]<=addr<p[3]+p[5]: return p[2]+addr-p[3]
        raise ValueError("Address outside ELF file-backed segments: "+hex(addr))
    def words(addr,count):
        assert 0<=count<1000000
        return struct.unpack_from("<"+str(count)+"Q",data,offset(addr))
    def string(addr):
        pos=offset(addr);end=data.find(b"\0",pos)
        assert 0<=end-pos<512
        return data[pos:end].decode("utf-8")
    reg=0xa177248
    count,pointer=words(reg+104,2)
    assert count==82, "Registration no longer matches inspected JP snapshot"
    modules={}; unresolved_modules=[]
    for ptr in words(pointer,count):
        r=words(ptr,3)
        try:
            name=string(r[0])
            assert name.endswith(".dll") and name not in modules
        except (AssertionError, UnicodeDecodeError):
            unresolved_modules.append({"rva":hex(ptr),"nameRva":hex(r[0]),"reason":"module name unreadable or unsupported by this extractor"})
            continue
        modules[name]={"rva":hex(ptr),"methodPointerCount":r[1],
            "pointers":words(r[2],r[1]) if r[1] else []}
    types=json.loads((out/"metadata/types.json").read_text(encoding="utf-8"))
    methods=[];counts=collections.Counter()
    for t in types:
        module=modules.get(t["assembly"])
        if module is None:
            counts["unboundAssemblyMethods"]+=len(t["methods"])
            continue
        for m in t["methods"]:
            token=int(m["token"],16)&0xffffff
            assert 0<token<=module["methodPointerCount"]
            addr=module["pointers"][token-1]
            executable=bool(addr and any(p[0]==1 and p[1]&1 and p[3]<=addr<p[3]+p[5] for p in segments))
            counts["total"]+=1
            counts["nonzero" if addr else "zero"]+=1
            if addr: counts["executable" if executable else "outsideExecutable"]+=1
            methods.append({"assembly":t["assembly"],"type":t["fullName"],
                "name":m["name"],"methodIndex":m["index"],"token":m["token"],
                "rva":hex(addr),"fileOffset":offset(addr) if executable else None})
    assert counts["outsideExecutable"]==0
    save(out/"metadata/method-addresses.json",methods)
    names=collections.defaultdict(list)
    for m in methods:
        if m["rva"]!="0x0": names[int(m["rva"],16)].append(m["type"]+"::"+m["name"])
    addresses=sorted(names)
    import bisect
    selected=[]
    dis=Cs(CS_ARCH_ARM64,CS_MODE_ARM)
    for m in methods:
        wanted=(m["type"]=="Torappu.Battle.AutoChess.AutoChessLevelEnemyManager" and m["name"] in ["_ApplyRealActionData","_GetSpEnemyActionData"])
        wanted= wanted or (m["type"] in ["Torappu.Battle.Action.Nodes+SwitchMode","Torappu.Battle.Action.Nodes+CreateBuff","Torappu.Battle.BasicSkill"] and m["name"] in ["Execute","OnExecute","OnCast","OnStart"])
        wanted= wanted or (m["type"]=="Torappu.Battle.Projectiles.GdglowHitBehaviour" and m["name"] in ["Init","OnHitTarget","DealHitTarget","EmitProjectile"])
        wanted= wanted or (m["type"]=="Torappu.RandomExtensions" and m["name"]=="DicePRD")
        if not wanted or m["fileOffset"] is None: continue
        addr=int(m["rva"],16);idx=bisect.bisect_right(addresses,addr)
        end=min(addresses[idx] if idx<len(addresses) else addr+512,addr+16384)
        lines=[]
        for ins in dis.disasm(data[m["fileOffset"]:m["fileOffset"]+end-addr],addr):
            line=f"{ins.address:016x}  {ins.mnemonic:<10} {ins.op_str}"
            if ins.mnemonic in ["bl","b"] and ins.op_str.startswith("#0x"):
                callee=int(ins.op_str[1:],16)
                if callee in names: line+=" ; "+" | ".join(names[callee][:3])
            lines.append(line)
        dest=out/"metadata/asm"/(str(m["methodIndex"])+".asm")
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text("; "+m["type"]+"::"+m["name"]+"\n; Boundary inferred from next named pointer, maximum 16 KiB.\n"+"\n".join(lines)+"\n",encoding="utf-8")
        selected.append({**m,"instructions":len(lines),"output":str(dest.relative_to(ROOT))})
    result={"source":str(source.relative_to(ROOT)),"sha256":sha(data),
        "registrationRva":hex(reg),"modules":len(modules),"unresolvedModules":unresolved_modules,"counts":dict(counts),
        "samples":selected,
        "boundary":"Native addresses and selected disassembly recovered; not recovered C# source. Zero pointers include methods without standalone native bodies. Generic sharing/call-indirect edges require further analysis."}
    save(out/"metadata/native-summary.json",result)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out",default="work/client-logic")
    parser.add_argument("--recover-metadata",action="store_true")
    parser.add_argument("--enemies",action="store_true",help="Also export every enemy prefab bundle")
    parser.add_argument("--operators",action="store_true",help="Also export all operator/token/trap charpack logic")
    parser.add_argument("--native-only",action="store_true",help="Rebuild only metadata/native indexes and disassembly samples")
    args=parser.parse_args()
    out=(ROOT/args.out).resolve()
    # This tool deliberately cannot write research assets into shipping directories.
    assert out.is_relative_to((ROOT/"work").resolve()), "Output must stay inside work/"
    meta=metadata(out,args.recover_metadata)
    native=native_symbols(out)
    if args.native_only:
        print(json.dumps(native,ensure_ascii=False))
        return
    catalog=json.loads((ROOT/"docs/checklists/implementation-checklist.json").read_text(encoding="utf-8"))
    wanted={s["id"] for op in catalog["operators"] for s in op["skills"]}
    fixed={s["id"] for op in catalog["operators"] if op["fixed"] for s in op["skills"]}
    mode={s["id"] for op in catalog["operators"] if op["scope"]!="library" for s in op["skills"]}
    summary={"schemaVersion":1,"source":"work/main.obb","sourceVersion":"JP 36.7.22 (local XAPK label; bundle hashes authoritative)","metadata":meta,
        "native":native,"bundles":[],"boundary":"Serialized fields/actions are client evidence; unresolved native semantics and version differences are not implemented or validated gameplay."}
    all_skills={}; shapes={}; templates={}; action_counts=collections.Counter()
    component_scripts=collections.Counter()
    z=zipfile.ZipFile(ROOT/"work/main.obb")
    selected=[p for p in z.namelist() if p.startswith("assets/AB/Android/battle/prefabs/[uc]") and p.endswith(".ab")]
    selected.append("assets/AB/Android/config/buff_template_holder.ab")
    if args.enemies:
        selected.extend(p for p in z.namelist() if p.startswith("assets/AB/Android/battle/enm_pfb_") and p.endswith(".ab"))
    if args.operators:
        selected.extend(p for p in z.namelist() if p.startswith("assets/AB/Android/charpack/") and p.endswith(".ab"))
    for bundle_number,bundle in enumerate(sorted(selected),1):
        blob=z.read(bundle); env=load_bundle(blob)
        nodes={}; gameobjects={}; transforms={}; asset_container=[]
        for o in env.objects:
            if o.type.name=="AssetBundle":
                asset_container=safe(o.read_typetree().get("m_Container",[]))
            if o.type.name not in {"MonoBehaviour","GameObject","Transform","Rigidbody2D","CircleCollider2D","BoxCollider2D","CapsuleCollider2D"}: continue
            tree=expand(o.read_typetree())
            node={"pathId":str(o.path_id),"unityType":o.type.name,"fields":safe(tree)}
            if o.type.name=="MonoBehaviour":
                # Top-level field layout only: never equate a shape to identical behavior.
                shape=sha(json.dumps(list(tree),separators=(",",":")).encode())[:16]
                node["fieldShape"]=shape
                info=shapes.setdefault(shape,{"fields":list(tree),"componentCount":0,"scriptPointers":set()})
                info["componentCount"]+=1
                ptr=tree.get("m_Script",{})
                info["scriptPointers"].add(str(ptr.get("m_PathID",0)))
                component_scripts[str(ptr.get("m_PathID",0))]+=1
            nodes[str(o.path_id)]=node
            if o.type.name=="GameObject": gameobjects[str(o.path_id)]=tree
            if o.type.name=="Transform": transforms[str(o.path_id)]=tree
            for item in tree.get("_templates",[]):
                key=item["templateKey"]
                assert key not in templates
                templates[key]=safe(item)
                for nested in walk(item):
                    if "$type" in nested: action_counts[nested["$type"]]+=1
        hierarchy={}
        for pid,tree in gameobjects.items():
            tref=next((str(c["component"]["m_PathID"]) for c in tree["m_Component"] if str(c["component"]["m_PathID"]) in transforms),None)
            parent=None
            if tref:
                father=str(transforms[tref].get("m_Father",{}).get("m_PathID",0))
                if father in transforms: parent=str(transforms[father]["m_GameObject"]["m_PathID"])
            hierarchy[pid]=parent
        roots={pid:t["m_Name"] for pid,t in gameobjects.items() if t.get("m_Name","").startswith(("skchr_","skcom_"))}
        owners={}
        for pid in gameobjects:
            current=pid; visited=set()
            while current is not None:
                if current in visited: raise ValueError("Cyclic transform hierarchy")
                visited.add(current)
                if current in roots:
                    owners[pid]=roots[current]; break
                current=hierarchy.get(current)
        records={}
        for pid,name in roots.items():
            record={"rootPathId":pid,"bundle":bundle,"nodeIds":[],"fieldShapes":set(),
                "templateKeys":set(),"externalReferences":[]}
            records[name]=record
        for pid,node in nodes.items():
            go=pid if node["unityType"]=="GameObject" else str(node["fields"].get("m_GameObject",{}).get("m_PathID",0))
            owner=owners.get(go)
            if owner not in records: continue
            rec=records[owner]; rec["nodeIds"].append(pid)
            if "fieldShape" in node: rec["fieldShapes"].add(node["fieldShape"])
            for item in walk(node["fields"]):
                if item.get("templateKey"): rec["templateKeys"].add(item["templateKey"])
                if "m_FileID" in item and item["m_FileID"] and item.get("m_PathID")!="0":
                    rec["externalReferences"].append(item)
        for name,rec in records.items():
            for k in ("fieldShapes","templateKeys"): rec[k]=sorted(rec[k])
            rec["nodeIds"].sort()
            if name in all_skills: raise ValueError("Duplicate skill root "+name)
            all_skills[name]=rec
        relative=bundle.removeprefix("assets/AB/Android/")+".json"
        dest=out/"bundles"/relative
        save(dest,{"bundle":bundle,"sha256":sha(blob),
            "externals":{k:[getattr(x,"path",str(x)) for x in getattr(f,"externals",[])] for k,f in env.files.items()},
            "assetContainer":asset_container,"nodes":nodes})
        summary["bundles"].append({"bundle":bundle,"sha256":sha(blob),"compressedBytes":len(blob),
            "output":str(dest.relative_to(ROOT)),"nodes":len(nodes),
            "monoBehaviours":sum(n["unityType"]=="MonoBehaviour" for n in nodes.values()),"skills":len(records)})
        if bundle_number % 25 == 0 or records or bundle_number==len(selected):
            print(f"[{bundle_number}/{len(selected)}]",bundle, "nodes",len(nodes),"skills",len(records),flush=True)
    found=set(all_skills)
    source_path=ROOT/"data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json"
    skill_blob=source_path.read_bytes()
    skill_table=json.loads(skill_blob)
    bindings={}
    for sid in sorted(wanted):
        levels=skill_table[sid]["levels"]
        prefabs=sorted({level["prefabId"] for level in levels if level.get("prefabId")})
        bindings[sid]={"prefabs":prefabs,
            "levelPrefabs":[level.get("prefabId") for level in levels],
            "matched":bool(prefabs) and all(p in found for p in prefabs),
            "missing":sorted(set(prefabs)-found)}
    matched={sid for sid,v in bindings.items() if v["matched"]}
    save(out/"skill-bindings.json",{"source":str(source_path.relative_to(ROOT)),
        "sha256":sha(skill_blob),"bindings":bindings})
    summary["coverage"]={
        "skillRoots":len(found),"catalogUniqueSkills":len(wanted),
        "catalogMatched":len(matched),"catalogMissing":sorted(wanted-matched),
        "fixedUniqueSkills":len(fixed),"fixedMatched":len(fixed&matched),
        "modeUniqueSkills":len(mode),"modeMatched":len(mode&matched),
        "templates":len(templates),"actionNodeTypes":len(action_counts),
        "actionNodeInstances":sum(action_counts.values()),"fieldShapes":len(shapes),
        "scriptPointers":len(component_scripts),
        "templateRefsMissing":sorted({k for v in all_skills.values() for k in v["templateKeys"]}-set(templates))
    }
    summary["coverage"]["catalogWithoutPrefab"]=[sid for sid,v in bindings.items() if not v["prefabs"]]
    summary["coverage"]["catalogMissingResources"]=[sid for sid,v in bindings.items() if v["missing"]]
    direct={k for v in all_skills.values() for k in v["templateKeys"]}
    reachable=set(); pending=list(direct)
    while pending:
        key=pending.pop()
        if key in reachable or key not in templates: continue
        reachable.add(key)
        for item in walk(templates[key]):
            if item.get("templateKey") and item["templateKey"] not in reachable:
                pending.append(item["templateKey"])
    reachable_actions=collections.Counter(item["$type"] for key in reachable for item in walk(templates[key]) if "$type" in item)
    summary["skillTemplateReachability"]={"directTemplates":len(direct),"transitiveTemplates":len(reachable),
        "actionTypes":len(reachable_actions),"actionInstances":sum(reachable_actions.values()),
        "boundary":"Only templateKey references starting in skill prefab hierarchies. Does not include every character mode, native callback, or dynamic template key.",
        "topActionTypes":reachable_actions.most_common(30)}
    save(out/"skill-template-reachability.json",{"templates":sorted(reachable),"actions":dict(reachable_actions.most_common())})
    summary["topActionNodes"]=action_counts.most_common(30)
    # Preserve sequential event action arrays; counts are a prioritization aid only.
    save(out/"buff-templates.json",templates)
    for value in shapes.values(): value["scriptPointers"]=sorted(value["scriptPointers"])
    save(out/"component-shapes.json",shapes)
    save(out/"skill-index.json",all_skills)
    save(out/"action-node-counts.json",dict(action_counts.most_common()))
    save(out/"summary.json",summary)
    print(json.dumps({"coverage":summary["coverage"],"metadata":meta,"topActionNodes":summary["topActionNodes"][:12]},ensure_ascii=False),flush=True)
if __name__=="__main__": main()

