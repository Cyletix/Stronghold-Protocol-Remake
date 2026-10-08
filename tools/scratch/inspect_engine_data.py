import json
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
excel = root + "\\excel"
ct = json.load(open(excel + "\\character_table.json", encoding="utf-8"))
op = None; opid = None
for k, v in ct.items():
    if isinstance(v, dict) and v.get("rarity") == "TIER_6" and v.get("profession") and v.get("profession") != "TOKEN":
        op = v; opid = k; break
print("=== 干员 ", opid, op["name"], " ===")
p0 = op["phases"][0]
print("phase0 字段:", list(p0.keys()))
akf = p0.get("attributesKeyFrames", [])
if akf:
    d = akf[0]["data"]
    print("属性键:", list(d.keys()))
    print("属性值(1级):", json.dumps({k:d[k] for k in ["maxHp","atk","def","magicResistance","cost","blockCnt","baseAttackTime","respawnTime"]}, ensure_ascii=False))
print("技能引用:", [s.get("skillId") for s in op.get("skills", [])])
print("天赋:", [ (t.get("candidates") or [{}])[0].get("name") for t in op.get("talents", []) ])
st = json.load(open(excel + "\\skill_table.json", encoding="utf-8"))
sk = st[op["skills"][0]["skillId"]]
print("=== 技能结构 ===")
print("字段:", list(sk.keys())[:25])
print("样例:", json.dumps({k:sk[k] for k in ["spData","duration","description"] if k in sk}, ensure_ascii=False)[:300])
lv = json.load(open(root + "\\levels\\activities\\act1vautochess\\level_act1vautochess_01-01.json", encoding="utf-8"))
print("=== 关卡JSON(网格/路线/波次) ===")
print("mapData 字段:", list(lv["mapData"].keys()))
print("routes 数量:", len(lv["routes"]))
print("waves 结构:", json.dumps(lv["waves"][0] if lv["waves"] else {}, ensure_ascii=False)[:250])
print("enemies 结构:", json.dumps(lv["enemies"][0] if lv["enemies"] else {}, ensure_ascii=False)[:250])