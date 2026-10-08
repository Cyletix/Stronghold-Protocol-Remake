import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
act = json.load(open(os.path.join(root, "excel/activity_table.json"), encoding="utf-8"))
acd = act["autoChessData"]
def a(s, n=130):
    r = repr(s)
    return r[:n] + ("..." if len(r) > n else "")
vi = acd.get("versionInfoDict", {})
print("=== versionInfoDict ===")
for k, v in vi.items():
    if isinstance(v, dict):
        print(" [%s] keys:" % k, list(v.keys()))
        for k2, v2 in list(v.items())[:10]:
            print("      %s = %s" % (k2, a(v2)))
    else:
        print(" [%s] = %s" % (k, a(v)))
et = acd.get("effectTypeDataDict", {})
print("=== effectTypeDataDict ===")
for k in list(et.keys())[:14]:
    v = et[k]
    if isinstance(v, dict):
        print(" [%s] keys:" % k, list(v.keys())[:10])
    else:
        print(" [%s] = %s" % (k, a(v)))
end = acd.get("enemyTypeDatas", {})
print("=== enemyTypeDatas sample ===")
for k in list(end.keys())[:3]:
    v = end[k]
    print(" [%s] keys:" % k, (list(v.keys()) if isinstance(v, dict) else a(v)))
ss = acd.get("shopStateTokenDict", {})
print("=== shopStateTokenDict keys ===", list(ss.keys())[:20])
lv = json.load(open(os.path.join(root, "levels/activities/act1vautochess/level_act1vautochess_01-01.json"), encoding="utf-8"))
for f in ["predefines", "hardPredefines", "excludeCharIdList"]:
    v = lv.get(f)
    if isinstance(v, list):
        print("=== level %s: list len=%d ===" % (f, len(v)))
        if v:
            print("   sample[0]:", a(v[0]))
    else:
        print("=== level %s: %s ===" % (f, a(v)))