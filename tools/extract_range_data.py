# 提取干员真实攻击范围（character_table.phases[i].rangeId → range_table.grids），生成 range_data.json
# 关键：攻击范围随精英化阶段变化（精0/精1/精2），需按阶段分别存储供模式层按账号练度选用
import json, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = Path(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata") / "excel"

ct = json.load(open(root / "character_table.json", encoding="utf-8"))
rt = json.load(open(root / "range_table.json", encoding="utf-8"))

out = {}
for charId, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if not prof or prof == "TOKEN":
        continue
    phases = []
    for p in d.get("phases", []):
        rangeId = (p or {}).get("rangeId")
        r = rt.get(rangeId)
        if not rangeId or not r:
            # 缺失/无范围阶段：沿用上一个已知范围，保证索引对齐（精0/精1/精2）
            if phases:
                phases.append(dict(phases[-1]))
            continue
        phases.append({"rangeId": rangeId, "grids": r["grids"]})
    if not phases:
        continue
    out[charId] = phases   # 数组，索引 = 精英化阶段 0/1/2

io.open(ROOT / "web" / "range_data.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("operators with range:", len(out))
