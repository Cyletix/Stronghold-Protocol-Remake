# -*- coding: utf-8 -*-
"""
扫描 OBB 里所有 .ab 的 block codec 分布。
codec: 0=None, 1=LZMA, 2=LZ4, 3=LZ4HC, 4/5=AK LZ4 字节序变种（非 LZHAM）。
"""
import sys, io, struct, zipfile
from pathlib import Path
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import lz4.block

OBB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\work\main.obb")


def cstr(buf, off):
    end = buf.index(b"\x00", off)
    return buf[off:end].decode("utf-8", "replace"), end + 1


def block_codecs(data):
    if data[:7] != b"UnityFS":
        return None
    p = 8
    ver = struct.unpack_from(">I", data, p)[0]; p += 4
    _, p = cstr(data, p); _, p = cstr(data, p)
    p += 8
    cis = struct.unpack_from(">I", data, p)[0]; p += 4
    uis = struct.unpack_from(">I", data, p)[0]; p += 4
    flags = struct.unpack_from(">I", data, p)[0]; p += 4
    bs = (p + 15) // 16 * 16
    if bs + cis > len(data):
        return None
    try:
        dec = lz4.block.decompress(data[bs:bs + cis], uncompressed_size=uis)
    except Exception:
        return None
    bc = struct.unpack_from(">I", dec, 16)[0]
    q = 20
    codes = []
    for _ in range(bc):
        struct.unpack_from(">I", dec, q)[0]
        cs = struct.unpack_from(">I", dec, q + 4)[0]
        bf = struct.unpack_from(">H", dec, q + 8)[0]
        codes.append(bf & 0x3F); q += 10
    return codes


def main():
    z = zipfile.ZipFile(OBB)
    names = [n for n in z.namelist() if n.endswith(".ab")]
    print(f".ab 文件总数: {len(names)}")
    file_codec = Counter()   # 每个文件「是否含某 codec」
    block_codec = Counter()  # 每个 block 的 codec
    block_total = 0
    codec4_files = []
    for n in names:
        d = z.read(n)
        codes = block_codecs(d)
        if codes is None:
            continue
        block_total += len(codes)
        present = set(codes)
        for c in present:
            file_codec[c] += 1
        for c in codes:
            block_codec[c] += 1
        if 4 in present:
            codec4_files.append(n.split("/")[-1])
    print(f"\nblock 总数: {block_total}")
    print("block codec 分布:", {k: block_codec[k] for k in sorted(block_codec)})
    print("含某 codec 的文件数:", {k: file_codec[k] for k in sorted(file_codec)})
    print(f"\n含 codec=4 的文件数: {file_codec.get(4, 0)}")
    print("示例（前 15 个）:", codec4_files[:15])


if __name__ == "__main__":
    main()
