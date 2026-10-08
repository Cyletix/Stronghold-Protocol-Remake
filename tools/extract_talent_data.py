# 提取干员天赋（character_table.talents[].candidates[].unlockCondition.phase + blackboard）
# 生成 talent_data.json：charId → [[{phase,potential,name,description,rangeId,blackboard}], ...]（段位=天赋，每天赋含多候选）
import json, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = Path(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata") / "excel"

ct = json.load(open(root / "character_table.json", encoding="utf-8"))


def phase_num(ph):
    return {"PHASE_0": 0, "PHASE_1": 1, "PHASE_2": 2, "PHASE_3": 3}.get(ph, 0)


out = {}
for charId, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if not prof or prof == "TOKEN":
        continue
    talents = []
    for t in d.get("talents", []) or []:
        cands = []
        for c in (t.get("candidates", []) or []):
            uc = c.get("unlockCondition") or {}
            cands.append({
                "phase": phase_num(uc.get("phase")),
                "level": uc.get("level", 1),
                "potential": c.get("requiredPotentialRank", 0),
                "name": c.get("name") or "",
                "description": c.get("description") or "",
                "rangeId": c.get("rangeId") or None,
                "blackboard": c.get("blackboard") or [],
            })
        if cands:
            talents.append(cands)
    if talents:
        out[charId] = talents

io.open(ROOT / "web" / "talent_data.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("operators with talents:", len(out))
