# 提取干员英文名（appellation），生成 appellation.json
import json, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = Path(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata") / "excel"
ct = json.load(open(root / "character_table.json", encoding="utf-8"))

out = {}
for charId, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if not prof or prof == "TOKEN":
        continue
    out[charId] = d.get("appellation", "")

io.open(ROOT / "web" / "appellation.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("appellations:", len(out))
