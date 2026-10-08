import struct
path = r"D:\OneDrive\Project\卫戍协议复刻\work\apk-extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat"
data = open(path, 'rb').read()
fsize = len(data)
magic = bytes([0xAF, 0x1B, 0xB1, 0xFA])
ct = data[:8]
print("ciphertext[0:8]:", ct.hex())
for ver in range(24, 33):
    plain_prefix = magic + bytes([ver, 0, 0, 0])
    key = bytes([p ^ c for p, c in zip(plain_prefix, ct)])
    dec = bytes([b ^ key[i % 8] for i, b in enumerate(data[:128])])
    if dec[0:4] != magic:
        continue
    ver2 = struct.unpack_from('<i', dec, 4)[0]
    strlit_off = struct.unpack_from('<i', dec, 8)[0]
    strlit_size = struct.unpack_from('<i', dec, 12)[0]
    str_off = struct.unpack_from('<i', dec, 24)[0]
    str_size = struct.unpack_from('<i', dec, 28)[0]
    ok = (strlit_off >= 0 and strlit_off + strlit_size <= fsize and str_off >= 0 and str_off + str_size <= fsize and strlit_off < str_off)
    print("ver=%d key=%s ver2=%d strlit_off=%d strlit_size=%d str_off=%d str_size=%d ok=%s" % (ver, key.hex(), ver2, strlit_off, strlit_size, str_off, str_size, ok))