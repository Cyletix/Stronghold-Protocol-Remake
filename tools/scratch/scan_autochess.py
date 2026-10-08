import re
path = r"D:\OneDrive\Project\卫戍协议复刻\work\apk-extracted\assets\bin\Data\Managed\Metadata\global-metadata.dat"
data = open(path, 'rb').read()
ascii_strings = [m.decode('ascii','ignore') for m in re.findall(rb'[\x20-\x7e]{4,}', data)]
ac = sorted(set(s for s in ascii_strings if 'autochess' in s.lower()))
print("=== autochess strings (%d) ===" % len(ac))
for s in ac:
    print(s)
ep = sorted(set(s for s in ascii_strings if re.search(r'arknights|yostar|gs\.|ak-webview|hypergryph|login|/api/', s, re.I)))
print("=== endpoint/auth-ish strings (%d) ===" % len(ep))
for s in ep[:60]:
    print(s)