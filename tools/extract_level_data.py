# 提取干员各精英化阶段各等级的关键帧属性（用于练度界面插值），生成 level_data.json
import json, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = Path(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata") / "excel"

ct = json.load(open(root / "character_table.json", encoding="utf-8"))


def unwrap(v):
    return v["m_value"] if isinstance(v, dict) and "m_value" in v else v


out = {}
for charId, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if not prof or prof == "TOKEN":
        continue
    phases = []
    for p in d.get("phases", []):
        maxLevel = p.get("maxLevel", 1)
        kfs = []
        k0 = None
        for kf in p.get("attributesKeyFrames", []):
            data = kf.get("data", {})
            if k0 is None:
                k0 = data
            kfs.append({
                "level": kf.get("level", 1),
                "atk": unwrap(data.get("atk", 0)),
                "maxHp": unwrap(data.get("maxHp", 0)),
                "def": unwrap(data.get("def", 0)),
            })
        # blockCnt / respawnTime / magicRes 在同一阶段内为常量，取首个关键帧的 data
        blockCnt = unwrap((k0 or {}).get("blockCnt", 1)) if k0 else 1
        respawnTime = unwrap((k0 or {}).get("respawnTime", 70)) if k0 else 70
        magicRes = unwrap((k0 or {}).get("magicResistance", 0)) if k0 else 0
        phases.append({"maxLevel": maxLevel, "keyFrames": kfs, "blockCnt": blockCnt, "respawnTime": respawnTime, "magicRes": magicRes, "cost": unwrap((k0 or {}).get("cost", 0))})
    out[charId] = phases

io.open(ROOT / "web" / "level_data.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("operators with level data:", len(out))
