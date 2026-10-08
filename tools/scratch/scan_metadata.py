import re
path = r"D:\OneDrive\Project\卫戍协议复刻\work\apk-extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat"
data = open(path, 'rb').read()
print("size:", len(data))
ascii_strings = set(m.decode('ascii','ignore') for m in re.findall(rb'[\x20-\x7e]{4,}', data))
utf16_strings = set()
for m in re.findall(rb'(?:[\x20-\x7e]\x00){4,}', data):
    s = m.decode('utf-16-le', 'ignore')
    if s.strip():
        utf16_strings.add(s.strip())
all_s = ascii_strings | utf16_strings
kw = re.compile(r'https?://|login|auth|token|session|account|socket|tcp|port|proto|arknights|yostar|gs\.|ak-webview|autochess|auto_chess|garrison|battle|server|host|\.jp\b|\.com\b', re.I)
interesting = sorted(s for s in all_s if kw.search(s))
out = r"D:\OneDrive\Project\卫戍协议复刻\work\metadata_strings.txt"
open(out, 'w', encoding='utf-8').write('\n'.join(interesting))
print("ascii:", len(ascii_strings), "utf16:", len(utf16_strings), "interesting:", len(interesting))
urls = sorted(s for s in all_s if re.search(r'https?://', s))
print("=== URLs (%d) ===" % len(urls))
for u in urls[:80]:
    print(u)