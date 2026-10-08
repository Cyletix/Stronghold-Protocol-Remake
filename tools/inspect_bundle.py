# -*- coding: utf-8 -*-
"""
M1：证明 OBB 内 .ab 的 container 层（byte-level 识别 + UnityFS header/flags 解析）。

不假定 codec；只输出观测到的 magic / formatVersion / unityVersion / flags / codec，
以及 UnityPy 能否打开，建立成功/失败样本矩阵 → bundle_inventory.json。
"""
import sys, io, os, struct, json, zipfile
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
WORK = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\work")
OBB = WORK / "main.obb"

COMPRESSION = {0: "None", 1: "LZMA", 2: "LZ4", 3: "LZ4HC", 4: "AK_LZ4变种(非LZHAM)", 5: "AK_LZ4变种(非LZHAM)"}


def cstr(data, off):
    end = data.index(b"\x00", off)
    return data[off:end].decode("utf-8", "replace"), end + 1


def parse_unityfs(data):
    """解析 UnityFS header，返回 dict；非 UnityFS 返回 None。"""
    if len(data) < 20:
        return None
    if data[:8] != b"UnityFS\x00":
        return None
    fmt = struct.unpack_from(">I", data, 8)[0]
    p = 12
    uver, p = cstr(data, p)
    urev, p = cstr(data, p)
    if p + 20 > len(data):
        return None
    bundle_size = struct.unpack_from(">Q", data, p)[0]; p += 8
    comp_info_size = struct.unpack_from(">I", data, p)[0]; p += 4
    uncomp_info_size = struct.unpack_from(">I", data, p)[0]; p += 4
    flags = struct.unpack_from(">I", data, p)[0]; p += 4
    codec = flags & 0x3F
    return {
        "formatVersion": fmt,
        "unityVersion": uver,
        "unityRevision": urev,
        "bundleSize": bundle_size,
        "compressedBlocksInfoSize": comp_info_size,
        "uncompressedBlocksInfoSize": uncomp_info_size,
        "flags": flags,
        "codecId": codec,
        "codecName": COMPRESSION.get(codec, f"unknown({codec})"),
        "headerEnd": p,
    }


def parse_blocks_info(data, hdr):
    """按 UnityFS 流程解压 BlocksInfo，解析 hash/blockCount/blocks/nodeTable，返回 block 级 codec 列表。"""
    import lz4.block
    header_end = hdr["headerEnd"]
    # version>=7（unityRevision 2021.3.x）需 align 16
    start = (header_end + 15) // 16 * 16
    cis = hdr["compressedBlocksInfoSize"]
    uis = hdr["uncompressedBlocksInfoSize"]
    comp = data[start:start + cis]
    try:
        dec = lz4.block.decompress(comp, uncompressed_size=uis)
    except Exception as e:
        return {"error": f"LZ4 解压 BlocksInfo 失败: {str(e)[:80]}", "blocksInfoStart": start}
    if len(dec) != uis:
        return {"error": f"解压长度 {len(dec)} != uncompressedBlocksInfoSize {uis}", "blocksInfoStart": start}
    hh = dec[0:16]
    block_count = struct.unpack_from(">I", dec, 16)[0]
    q = 20
    blocks = []
    for i in range(block_count):
        us = struct.unpack_from(">I", dec, q)[0]
        cs = struct.unpack_from(">I", dec, q + 4)[0]
        bf = struct.unpack_from(">H", dec, q + 8)[0]
        blocks.append({"uncompressedSize": us, "compressedSize": cs, "flags": bf, "codecId": bf & 0x3F,
                       "codecName": COMPRESSION.get(bf & 0x3F, f"unknown({bf & 0x3F})")})
        q += 10
    node_count = struct.unpack_from(">I", dec, q)[0]; q += 4
    nodes = []
    for i in range(node_count):
        off = struct.unpack_from(">Q", dec, q)[0]; q += 8
        sz = struct.unpack_from(">Q", dec, q)[0]; q += 8
        nf = struct.unpack_from(">I", dec, q)[0]; q += 4
        path, q = cstr(dec, q)
        nodes.append({"offset": off, "size": sz, "flags": nf, "path": path})
    return {"blocksInfoStart": start, "hash": hh.hex(), "blockCount": block_count,
            "blocks": blocks, "nodeCount": node_count, "nodes": nodes}



def try_unitypy(path):
    try:
        from UnityPy import Environment
        env = Environment()
        env.load_file(str(path))
        objs = list(env.objects)
        types = {}
        for o in objs:
            types[o.type.name] = types.get(o.type.name, 0) + 1
        return {"ok": True, "objects": len(objs), "types": types}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def main():
    rows = []

    # 1) 已有样本
    for rel in ["sample_ab/sample.ab", "test_ab/emoticon_autochess_basic.ab"]:
        p = WORK / rel
        if p.exists():
            rows.append(("file", rel, p))

    # 2) 从 OBB 取几个 .ab 样本（不同大小）
    if OBB.exists():
        with zipfile.ZipFile(OBB) as z:
            names = [n for n in z.namelist() if n.endswith(".ab")]
            # 按压缩后大小排序，取最小/中间/最大各 1 个 + 前 2 个
            infos = [(z.getinfo(n).file_size, n) for n in names]
            infos.sort()
            picks = set()
            if infos:
                picks.add(infos[0][1])                       # 最小
                picks.add(infos[len(infos)//2][1])           # 中位
                picks.add(infos[-1][1])                      # 最大
                for _, n in infos[:2]:
                    picks.add(n)                             # 前 2 个小文件
            for n in list(picks)[:6]:
                rows.append(("obb", n, OBB))
        print(f"OBB 内 .ab 条目数: {len(names)}")

    inventory = []
    for kind, name, src in rows:
        if kind == "file":
            data = src.read_bytes()
        else:
            with zipfile.ZipFile(src) as z:
                data = z.read(name)
        hdr = parse_unityfs(data)
        binfo = parse_blocks_info(data, hdr) if hdr else None
        if kind == "file":
            up = try_unitypy(src)
        else:
            tmp = WORK / "_inspect_tmp.ab"
            tmp.write_bytes(data)
            try:
                up = try_unitypy(tmp)
            finally:
                try:
                    tmp.unlink(missing_ok=True)
                except OSError:
                    pass

        rec = {
            "source": kind,
            "name": name,
            "size": len(data),
            "magic": data[:8].decode("latin1"),
            "header": hdr,
            "blocksInfo": binfo,
            "unitypy": up,
        }
        inventory.append(rec)
        codec = hdr["codecName"] if hdr else "N/A"
        block_codecs = ""
        if binfo and "blocks" in binfo:
            block_codecs = ",".join(sorted({b["codecName"] for b in binfo["blocks"]}))
        elif binfo and "error" in binfo:
            block_codecs = f"ERR:{binfo['error'][:40]}"
        print(f"[{kind}] {name[:40]} size={len(data)} header_codec={codec} block_codec=[{block_codecs}] blockCount={binfo.get('blockCount') if binfo else '?'}")

    out = WORK / "bundle_inventory.json"
    out.write_text(json.dumps(inventory, ensure_ascii=False, indent=1), encoding="utf-8")
    print("写入:", out)


if __name__ == "__main__":
    main()
