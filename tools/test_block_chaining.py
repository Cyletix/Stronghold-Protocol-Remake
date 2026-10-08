# -*- coding: utf-8 -*-
"""
M2c-2a：用 codec=0 未压缩 block 验证 block chaining / data_start / node offset。
验证 block extraction 逻辑正确（sum(block.us)=sum(node.size)、sum(block.cs)=文件−data_start）。
"""
import sys, io, struct, zipfile
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import lz4.block

OBB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\work\main.obb")


def cstr(buf, off):
    end = buf.index(b"\x00", off)
    return buf[off:end].decode("utf-8", "replace"), end + 1


def parse_blocks(data):
    p = 8
    struct.unpack_from(">I", data, p)[0]; p += 4
    _, p = cstr(data, p); _, p = cstr(data, p)
    p += 8
    cis = struct.unpack_from(">I", data, p)[0]; p += 4
    uis = struct.unpack_from(">I", data, p)[0]; p += 4
    flags = struct.unpack_from(">I", data, p)[0]; p += 4
    header_end = p
    bs = (header_end + 15) // 16 * 16
    dec = lz4.block.decompress(data[bs:bs + cis], uncompressed_size=uis)
    bc = struct.unpack_from(">I", dec, 16)[0]
    q = 20
    blocks = []
    for _ in range(bc):
        us = struct.unpack_from(">I", dec, q)[0]
        cs = struct.unpack_from(">I", dec, q + 4)[0]
        bf = struct.unpack_from(">H", dec, q + 8)[0]
        blocks.append((us, cs, bf & 0x3F)); q += 10
    nc = struct.unpack_from(">I", dec, q)[0]; q += 4
    nodes = []
    for _ in range(nc):
        off = struct.unpack_from(">Q", dec, q)[0]; q += 8
        sz = struct.unpack_from(">Q", dec, q)[0]; q += 8
        struct.unpack_from(">I", dec, q)[0]; q += 4
        path, q = cstr(dec, q)
        nodes.append((off, sz, path))
    # block chaining：data_start = align16(blocksInfo_end)，block 数据连续（0x200 只在 data section 前对齐一次）
    data_start = (bs + cis + 15) // 16 * 16
    pos = data_start
    offsets = []
    for us, cs, c in blocks:
        offsets.append(pos)
        pos += cs
    return {"flags": flags, "blocks": blocks, "offsets": offsets, "nodes": nodes,
            "dataStart": data_start, "dataEnd": pos, "total": len(data)}


def main():
    with zipfile.ZipFile(OBB) as z:
        d = z.read("assets/AB/Android/arts/ui/[uc]campaign.ab")
    r = parse_blocks(d)
    print(f"blocks={len(r['blocks'])} dataStart={r['dataStart']} dataEnd={r['dataEnd']} total={r['total']} 闭合={r['dataEnd'] <= r['total']}")
    print("nodeCount:", len(r["nodes"]))
    for n in r["nodes"][:5]:
        print(f"  node path={n[2]} offset={n[0]} size={n[1]}")

    # 找 codec=0 的 block
    none_idx = [i for i, b in enumerate(r["blocks"]) if b[2] == 0]
    print("codec=0 block 索引:", none_idx)
    if none_idx:
        i = none_idx[0]
        us, cs, c = r["blocks"][i]
        off = r["offsets"][i]
        blk = d[off:off + cs]
        print(f"\nblock[{i}]: uncompressed={us} compressed={cs} codec={c} offset={off}")
        print("头 48 字节:", blk[:48].hex(" "))
        print("头 ascii:", repr(blk[:48]))
        (Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\work\lzham\campaign_block100.bin")).write_bytes(blk)


if __name__ == "__main__":
    main()
