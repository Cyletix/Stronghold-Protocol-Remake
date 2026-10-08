import json
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
excel = root + "\\excel"
lv = json.load(open(root + "\\levels\\activities\\act1vautochess\\level_act1vautochess_01-01.json", encoding="utf-8"))
md = lv["mapData"]
mp = md["map"]
print("map size:", len(mp), "x", len(mp[0]))
print("map first 8 rows:")
for r in mp[:8]:
    print("  ", r)
print("=== tiles (first 6) ===")
for t in md.get("tiles", [])[:6]:
    print("  ", json.dumps(t, ensure_ascii=False)[:220])
print("=== route[0] (first 300 chars) ===")
print(json.dumps(lv["routes"][0], ensure_ascii=False)[:300])
print("=== waves[0] (first 500 chars) ===")
print(json.dumps(lv["waves"][0], ensure_ascii=False)[:500])
print("=== enemies (first 2) ===")
print(json.dumps(lv["enemies"][:2], ensure_ascii=False)[:400])
print("=== enemyDbRefs (first 6) ===")
print(json.dumps(lv["enemyDbRefs"][:6], ensure_ascii=False)[:300])
eh = json.load(open(excel + "\\enemy_handbook_table.json", encoding="utf-8"))
k0 = list(eh.keys())[0]
print("=== enemy_handbook sample ===")
print("key:", k0)
print(json.dumps(eh[k0], ensure_ascii=False)[:400])