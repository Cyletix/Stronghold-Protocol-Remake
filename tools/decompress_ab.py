# -*- coding: utf-8 -*-
"""
Arknights AssetBundle (.ab) 解压器 —— 打通 OBB → UnityFS → SerializedFile 管线。

关键结论（M2c-3，已验证）：
- UnityFS v8 的 data block codec=4/5 不是 LZHAM，而是 **LZ4 字节序变种**：
  1. token 高低 4 位交换（标准「高4=literal/低4=match」，AK 变种「低4=literal/高4=match」）。
  2. match offset 大小端交换（标准小端，AK 变种大端）。
- 变换回标准 LZ4 后即可用 lz4.block 解压（见 MooncellWiki/UnityPy commit 781badde6d636，Kengxxiao）。

用法：
  python tools/decompress_ab.py <input.ab> [output_dir]
"""
import sys, io, struct, zipfile
from pathlib import Path
import lz4.block


def cstr(buf, off):
    end = buf.index(b"\x00", off)
    return buf[off:end].decode("utf-8", "replace"), end + 1


def read_long_length(data: bytearray, pos: int):
    """LZ4 extended length（连续 255）。"""
    l = 0
    while True:
        b = data[pos]
        pos += 1
        l += b
        if b != 255:
            break
    return l, pos


def decompress_ak(compressed_data: bytes, uncompressed_size: int) -> bytes:
    """AK LZ4 变种 → 标准 LZ4 还原 → 解压。"""
    ip = 0
    op = 0
    data = bytearray(compressed_data)
    while True:
        literal_length = data[ip] & 0x0F
        match_length = (data[ip] & 0xF0) >> 4
        data[ip] = (literal_length << 4 | match_length) & 0xFF
        ip += 1
        if literal_length == 15:
            l, ip = read_long_length(data, ip)
            literal_length += l
        op += literal_length
        ip += literal_length
        if uncompressed_size == op:  # end of block
            break
        offset = data[ip + 1] | (data[ip] << 8)  # 大端
        data[ip] = offset & 0xFF
        data[ip + 1] = (offset >> 8) & 0xFF
        ip += 2
        if match_length == 15:
            m, ip = read_long_length(data, ip)
            match_length += m
        match_length += 4  # MINMATCH
        op += match_length
    return lz4.block.decompress(bytes(data), uncompressed_size=uncompressed_size)


def decompress_block(compressed: bytes, uncompressed_size: int, codec: int) -> bytes:
    if codec == 0:  # None
        return compressed
    if codec in (2, 3):  # LZ4 / LZ4HC
        return lz4.block.decompress(compressed, uncompressed_size=uncompressed_size)
    if codec in (4, 5):  # AK LZ4 变种
        return decompress_ak(compressed, uncompressed_size)
    raise NotImplementedError(f"codec={codec} 未支持")


def parse_ab(data: bytes):
    """解析 UnityFS v8 .ab，返回 node 列表（每个 node 是解压后的字节）。"""
    assert data[:7] == b"UnityFS", "非 UnityFS"
    p = 8
    struct.unpack_from(">I", data, p)[0]; p += 4
    _, p = cstr(data, p); _, p = cstr(data, p)
    p += 8  # size
    cis = struct.unpack_from(">I", data, p)[0]; p += 4
    uis = struct.unpack_from(">I", data, p)[0]; p += 4
    flags = struct.unpack_from(">I", data, p)[0]; p += 4
    bs = (p + 15) // 16 * 16
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

    # 解压所有 block，拼成完整数据
    data_start = (bs + cis + 15) // 16 * 16
    pos = data_start
    full = bytearray()
    for us, cs, codec in blocks:
        full += decompress_block(data[pos:pos + cs], us, codec)
        pos += cs

    # 按 node 切分
    result = []
    for off, sz, path in nodes:
        result.append((path, bytes(full[off:off + sz])))
    return result


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    if len(sys.argv) < 2:
        print("用法: python tools/decompress_ab.py <input.ab> [output_dir]")
        return
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("work/ab_extracted") / src.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    data = src.read_bytes()
    nodes = parse_ab(data)
    print(f"{src.name}: {len(nodes)} 个 node")
    for path, blob in nodes:
        outp = out_dir / Path(path).name
        outp.write_bytes(blob)
        print(f"  {path} → {outp} ({len(blob)} 字节)")


if __name__ == "__main__":
    main()
