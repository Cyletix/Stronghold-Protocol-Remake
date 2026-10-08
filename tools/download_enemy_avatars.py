# 下载卫戍协议战斗用到的敌人头像（PRTS media 规律：头像_敌人_{名}.png，MD5 分目录）
import json, hashlib, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
bd = json.load(open(ROOT / "web" / "battle_data.json", encoding="utf-8"))
md = json.load(open(ROOT / "web" / "mode_data.json", encoding="utf-8"))

enemy_ids = set(["enemy_1422_lrsldr", "enemy_1427_lrnazg", "enemy_1425_lrcmra", "enemy_1005_yokai"])
for b in md.get("bosses", []):
    if b.get("enemyId"):
        enemy_ids.add(b["enemyId"])

out_dir = ROOT / "web" / "enemy_avatars"
out_dir.mkdir(exist_ok=True)


def download(enemy_id):
    name = (bd["enemies"].get(enemy_id) or {}).get("name")
    if not name:
        return
    fn = f"头像_敌人_{name}.png"
    h = hashlib.md5(fn.encode("utf-8")).hexdigest()
    url = f"https://media.prts.wiki/{h[0]}/{h[0:2]}/{urllib.parse.quote(fn)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        (out_dir / f"{enemy_id}.png").write_bytes(data)
        print("OK", enemy_id, name, len(data))
    except Exception as e:
        print("FAIL", enemy_id, name, repr(e))


for eid in sorted(enemy_ids):
    download(eid)
print("done ->", out_dir)
