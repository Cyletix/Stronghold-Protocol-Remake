import json, hashlib, urllib.request, urllib.parse, os, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
web = ROOT / "web"
avdir = web / "avatars"
avdir.mkdir(exist_ok=True)
data = json.load(open(web / "battle_data.json", encoding="utf-8"))
ops = data["operators"]
ok, fail, skip = 0, 0, 0
fail_list = []
for i, op in enumerate(ops):
    name = op["name"]; cid = op["charId"]
    fname = "头像_%s.png" % name
    h = hashlib.md5(fname.encode("utf-8")).hexdigest()
    url = "https://media.prts.wiki/%s/%s/%s" % (h[0], h[0:2], urllib.parse.quote(fname))
    out = avdir / (cid + ".png")
    if out.exists() and out.stat().st_size > 1000:
        skip += 1; continue
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            b = urllib.request.urlopen(req, timeout=40).read()
            if len(b) > 1000:
                out.write_bytes(b); ok += 1; break
        except Exception as e:
            if attempt == 1:
                fail += 1; fail_list.append(name)
            time.sleep(0.5)
    if (i+1) % 50 == 0:
        print("进度 %d/%d (成功 %d 失败 %d)" % (i+1, len(ops), ok, fail))
print("完成: 成功 %d, 失败 %d, 已存在跳过 %d" % (ok, fail, skip))
print("失败名单:", fail_list[:30])