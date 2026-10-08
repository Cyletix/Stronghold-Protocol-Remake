# 从 ArknightR 第三方版本提取必要素材（干员立绘大图 + 敌人立绘），加入本项目
import sys, io, json
from pathlib import Path
from UnityPy import Environment

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ARKR = Path(r"D:\下载\Games\ArknightR")
UNITS = ARKR / "ArknightR_Data" / "StreamingAssets" / "aa" / "StandaloneWindows64" / "defaultlocalgroup_assets_assets" / "bundles" / "units"
PROJ = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻")
WEB = PROJ / "web"

bd = json.load(open(WEB / "battle_data.json", encoding="utf-8"))
tiers = json.load(open(WEB / "operator_tiers.json", encoding="utf-8"))
md = json.load(open(WEB / "mode_data.json", encoding="utf-8"))

name2char = {o["name"]: o["charId"] for o in bd["operators"]}
char_ids = [name2char[n] for n in tiers if n in name2char]

enemy_ids = set(["enemy_1422_lrsldr", "enemy_1427_lrnazg", "enemy_1425_lrcmra", "enemy_1005_yokai"])
for b in md.get("bosses", []):
    if b.get("enemyId"):
        enemy_ids.add(b["enemyId"])


def extract_biggest_texture(bundle_path, out_path):
    try:
        env = Environment()
        env.load_file(str(bundle_path))
        best = None
        for o in env.objects:
            if o.type.name != "Texture2D":
                continue
            try:
                tex = o.read()
                w, h = tex.m_Width, tex.m_Height
                if best is None or w * h > best[0] * best[1]:
                    best = (w, h, tex)
            except Exception:
                pass
        if best and best[0] * best[1] >= 128 * 128:
            best[2].image.save(str(out_path))
            return True
    except Exception:
        pass
    return False


# 干员立绘
out_dir = WEB / "portraits"
out_dir.mkdir(exist_ok=True)
ok = 0
for cid in char_ids:
    matches = sorted(UNITS.glob(f"{cid}_*.bundle"))
    if not matches:
        continue
    if extract_biggest_texture(matches[0], out_dir / f"{cid}.png"):
        ok += 1
print(f"portraits: {ok}/{len(char_ids)}")

# 敌人立绘
out_dir2 = WEB / "enemy_portraits"
out_dir2.mkdir(exist_ok=True)
ok2 = 0
for eid in sorted(enemy_ids):
    matches = sorted(UNITS.glob(f"{eid}_*.bundle"))
    if not matches:
        print("  missing enemy bundle:", eid)
        continue
    if extract_biggest_texture(matches[0], out_dir2 / f"{eid}.png"):
        ok2 += 1
print(f"enemy portraits: {ok2}/{len(enemy_ids)}")
