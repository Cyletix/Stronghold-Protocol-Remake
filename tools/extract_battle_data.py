import json, io
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = str(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata")
excel = root + "\\excel"
REAL = {"WARRIOR","SNIPER","TANK","MEDIC","SUPPORT","CASTER","SPECIAL","PIONEER"}
def unwrap(v):
    return v["m_value"] if isinstance(v, dict) and "m_value" in v else v
ct = json.load(open(excel + "\\character_table.json", encoding="utf-8"))
rmap = {"TIER_1":1,"TIER_2":2,"TIER_3":3,"TIER_4":4,"TIER_5":5,"TIER_6":6}
ops = []
for cid, d in ct.items():
    if not isinstance(d, dict):
        continue
    prof = d.get("profession")
    if prof not in REAL:
        continue
    stats = {}
    try:
        akf = d["phases"][0]["attributesKeyFrames"]
        if akf:
            stats = akf[0].get("data", {})
    except Exception:
        pass
    ops.append({"charId": cid, "name": d.get("name", ""), "rarity": rmap.get(d.get("rarity"), 1),
        "profession": prof, "subProfession": d.get("subProfessionId", ""), "position": d.get("position", ""),
        "nationId": d.get("nationId", ""), "groupId": d.get("groupId") or "", "teamId": d.get("teamId") or "",
        "maxHp": unwrap(stats.get("maxHp", 1000)), "atk": unwrap(stats.get("atk", 100)), "def": unwrap(stats.get("def", 0)),
        "magicRes": unwrap(stats.get("magicResistance", 0)), "cost": unwrap(stats.get("cost", 10)),
        "blockCnt": unwrap(stats.get("blockCnt", 1)), "attackTime": unwrap(stats.get("baseAttackTime", 1.5)),
        "respawnTime": unwrap(stats.get("respawnTime", 6))})
ed = json.load(open(root + "\\levels\\enemydata\\enemy_database.json", encoding="utf-8"))
enemies = {}
for item in ed.get("enemies", []):
    key = item.get("Key")
    if not key or not item.get("Value"):
        continue
    v0 = item["Value"][0]; ed0 = v0.get("enemyData", {})
    attrs = ed0.get("attributes", {})
    def g(f, d=0): return unwrap(attrs.get(f, d))
    nm = ed0.get("name")
    motion = unwrap(ed0.get("motion", {}))
    tags = unwrap(ed0.get("enemyTags", {}))
    enemies[key] = {"enemyId": key, "name": unwrap(nm) if nm else key, "maxHp": g("maxHp",1000), "atk": g("atk",100),
        "def": g("def",0), "magicRes": g("magicResistance",0), "moveSpeed": g("moveSpeed",1.0),
        "attackTime": g("baseAttackTime", g("attackTime",1.0)), "massLevel": g("massLevel",1), "lifePointReduce": g("lifePointReduce",1),
        "blockCnt": g("blockCnt",0), "cost": g("cost",0),
        "rangeRadius": unwrap(ed0.get("rangeRadius", {})), "motion": motion,
        "flying": motion == "FLY" or (isinstance(tags, list) and "drone" in tags)}
lv = json.load(open(root + "\\levels\\activities\\act1vautochess\\level_act1vautochess_01-01.json", encoding="utf-8"))
md = lv["mapData"]; mp = md["map"]; tiles = md["tiles"]
grid = [[tiles[c]["tileKey"] if c < len(tiles) else "tile_forbidden" for c in r] for r in mp]
buildable = [[tiles[c].get("buildableType","NONE") if c < len(tiles) else "NONE" for c in r] for r in mp]
passable = [[tiles[c].get("passableMask","ALL") if c < len(tiles) else "ALL" for c in r] for r in mp]
height = [[tiles[c].get("heightType","") if c < len(tiles) else "" for c in r] for r in mp]
routes = [[[p.get("row",0), p.get("col",0)] for p in rt.get("checkpoints",[])] for rt in lv["routes"]]
waves = []
for w in lv["waves"]:
    for fr in w.get("fragments", []):
        for a in fr.get("actions", []):
            if a.get("actionType") == "SPAWN":
                waves.append({"enemyId": a.get("key"), "count": a.get("count",1), "interval": a.get("interval",5.0),
                              "routeIndex": a.get("routeIndex",0), "preDelay": fr.get("preDelay",0)+w.get("preDelay",0)})
level = {"levelId": "act1vautochess_01-01", "rows": len(grid), "cols": len(grid[0]), "grid": grid, "buildable": buildable, "passable": passable, "height": height, "routes": routes, "waves": waves}
out = {"operators": ops, "enemies": enemies, "level": level}
io.open(str(ROOT / "web" / "battle_data.json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("operators:", len(ops), "enemies:", len(enemies), "waves:", len(waves))