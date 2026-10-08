import json, hashlib, urllib.request, urllib.parse, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
web = ROOT / "web"
avdir = web / "avatars"
avdir.mkdir(exist_ok=True)
data = json.load(open(web / "battle_data.json", encoding="utf-8"))
ops = data["operators"]
missing = []
for op in ops:
    out = avdir / (op["charId"] + ".png")
    if not out.exists() or out.stat().st_size <= 1000:
        missing.append(op)
print("缺失:", len(missing))
ok, fail = 0, 0
faillist = []
for op in missing:
    name = op["name"]
    fname = "头像_%s.png" % name
    h = hashlib.md5(fname.encode("utf-8")).hexdigest()
    url = "https://media.prts.wiki/%s/%s/%s" % (h[0], h[0:2], urllib.parse.quote(fname))
    out = avdir / (op["charId"] + ".png")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        b = urllib.request.urlopen(req, timeout=40).read()
        if len(b) > 1000:
            out.write_bytes(b); ok += 1
        else:
            fail += 1; faillist.append(name)
    except Exception:
        fail += 1; faillist.append(name)
    time.sleep(0.15)
print("补下载成功:", ok, "失败:", fail)
print("失败名单:", faillist[:40])