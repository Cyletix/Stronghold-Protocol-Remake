import json, io
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = str((_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata") / "excel")
out_path = str(ROOT / "web" / "mode_data.json")
ct = json.load(open(root + "\\character_table.json", encoding="utf-8"))
rmap = {"TIER_1":1,"TIER_2":2,"TIER_3":3,"TIER_4":4,"TIER_5":5,"TIER_6":6}
ops = []
for charId, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if not prof or prof == "TOKEN":
        continue
    ops.append({"charId": charId, "name": d.get("name", ""), "rarity": rmap.get(d.get("rarity"), 1),
                "profession": prof, "subProfession": d.get("subProfessionId", ""), "position": d.get("position", ""),
                "nationId": d.get("nationId", ""), "groupId": d.get("groupId") or "", "teamId": d.get("teamId") or ""})
act = json.load(open(root + "\\activity_table.json", encoding="utf-8"))
acd = act["autoChessData"]
bonds = [{"bondId": bid, "name": b.get("name", ""), "bondType": b.get("bondType", ""), "powerIdList": b.get("powerIdList", []), "bondOrder": b.get("bondOrder", 0), "isPower": b.get("isPower", False)} for bid, b in acd["bondInfoDict"].items()]
bands = [{"bandId": bid, "name": b.get("bandName", ""), "icon": b.get("bandIconId", "")} for bid, b in acd["bandDataDict"].items()]
bosses = [{"bossId": bid, "enemyId": b.get("enemyId", ""), "handbookEnemyId": b.get("handbookEnemyId", "")} for bid, b in acd["bossInfoDict"].items()]
enemy_types = [{"type": t, "name": e.get("name", "")} for t, e in acd["enemyTypeDatas"].items()]
charm = json.load(open(root + "\\charm_table.json", encoding="utf-8"))
charms = [{"id": c.get("id"), "name": c.get("name", ""), "sort": c.get("sort", 0)} for c in charm.get("charmList", [])]
# 敌人池（randomEnemyAttributeDict 324）：genWaves 无特训类型时的兜底敌人池
enemy_pool = [{"enemyId": e.get("enemyKey"), "level": e.get("level", 0), "isFly": e.get("isFlyEnemy", False),
               "extraEnemyKeyList": e.get("extraEnemyKeyList"), "effectiveness": e.get("enemyBattleEffectivenessFactor", 1)}
              for e in (acd.get("randomEnemyAttributeDict") or {}).values() if isinstance(e, dict)]
# 赛季具体数据（act2autochess）：各模式可用/禁用盟约、禁用敌人、难度/模式因子
season = act.get("activity", {}).get("AUTOCHESS_SEASON", {}).get("act2autochess", {})
modes = []
for mid, m in (season.get("modeDataDict") or {}).items():
    if not isinstance(m, dict):
        continue
    modes.append({"modeId": m.get("modeId"), "name": m.get("name", ""), "code": m.get("code", ""),
                  "modeType": m.get("modeType", ""), "modeDifficulty": m.get("modeDifficulty", ""),
                  "activeBondIdList": m.get("activeBondIdList", []), "inactiveBondIdList": m.get("inactiveBondIdList", []),
                  "inactiveEnemyKey": m.get("inactiveEnemyKey", []), "specialPhaseTime": m.get("specialPhaseTime")})
out = {"operators": ops, "bonds": bonds, "bands": bands, "bosses": bosses, "enemyTypes": enemy_types, "charms": charms,
       "enemyPool": enemy_pool,
       "modes": modes, "difficultyFactorInfo": season.get("difficultyFactorInfo", {}), "modeFactorInfo": season.get("modeFactorInfo", {})}
io.open(out_path, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=1))
print("operators:", len(ops), "bonds:", len(bonds), "bands:", len(bands), "bosses:", len(bosses), "enemyTypes:", len(enemy_types), "charms:", len(charms), "enemyPool:", len(enemy_pool), "modes:", len(modes))
print("written:", out_path)