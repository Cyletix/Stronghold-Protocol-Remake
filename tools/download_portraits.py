# 从 PRTS 下载参战干员立绘（立绘_{名}_1.png，精英0全身立绘），覆盖 ArknightR 错误的 Spine 小人贴图
import json, hashlib, urllib.request, urllib.parse, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
web = ROOT / "web"
out_dir = web / "portraits"
out_dir.mkdir(exist_ok=True)

tiers = json.load(open(web / "operator_tiers.json", encoding="utf-8"))
bd = json.load(open(web / "battle_data.json", encoding="utf-8"))
name2char = {o["name"]: o["charId"] for o in bd["operators"]}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
           "Accept": "image/avif,image/webp,*/*", "Referer": "https://prts.wiki/"}


def dl(fn):
    h = hashlib.md5(fn.encode("utf-8")).hexdigest()
    url = f"https://media.prts.wiki/{h[0]}/{h[0:2]}/{urllib.parse.quote(fn)}"
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20).read()


ok = 0
fail = []
for i, name in enumerate(tiers):
    charId = name2char.get(name)
    if not charId:
        continue
    out = out_dir / f"{charId}.png"
    fn = f"立绘_{name}_1.png"   # 精英0全身立绘
    got = False
    for attempt in range(3):
        try:
            b = dl(fn)
            if len(b) > 1000:
                out.write_bytes(b)
                ok += 1
                got = True
                break
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    if not got:
        fail.append(name)
    time.sleep(0.35)   # 限流保护
    if (i + 1) % 10 == 0:
        print(f"进度 {i+1}/{len(tiers)} (成功 {ok})", flush=True)

print(f"portraits: {ok}/{len(tiers)}")
print("fail:", fail[:40])
