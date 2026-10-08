import re
path = r"D:\OneDrive\Project\卫戍协议复刻\work\apk-extracted\lib\arm64-v8a\libil2cpp.so"
data = open(path, 'rb').read()
strings = set(m.decode('ascii', 'ignore') for m in re.findall(rb'[\x20-\x7e]{5,}', data))
kw = re.compile(r'https?://|login|auth|token|session|account|socket|tcp|port|proto|arknights|yostar|ak-webview|gs\.|autochess|auto_chess|garrison|host|server|\.jp\b|\.com\b|\.net\b|\.cn\b', re.I)
interesting = sorted(s for s in strings if kw.search(s))
out_path = r"D:\OneDrive\Project\卫戍协议复刻\work\libil2cpp_strings.txt"
open(out_path, 'w', encoding='utf-8').write('\n'.join(interesting))
print("total printable strings:", len(strings))
print("interesting written:", len(interesting))
urls = sorted(s for s in strings if re.search(r'https?://', s))
print("=== URLs (%d) ===" % len(urls))
for u in urls[:80]:
    print(u)
print("=== strings w/ arknights ===")
for s in sorted(x for x in strings if 'arknights' in x.lower())[:40]:
    print(s)
print("=== strings w/ autochess ===")
for s in sorted(x for x in strings if 'autochess' in x.lower())[:40]:
    print(s)