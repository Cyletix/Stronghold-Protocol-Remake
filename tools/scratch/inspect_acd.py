import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
act = json.load(open(os.path.join(root, "excel/activity_table.json"), encoding="utf-8"))
acd = act.get("autoChessData", {})
print("autoChessData type:", type(acd).__name__)
if isinstance(acd, dict):
    print("autoChessData keys:", list(acd.keys())[:40])
    for k in list(acd.keys())[:8]:
        v = acd[k]
        if isinstance(v, dict): print("  [%s] dict keys:" % k, list(v.keys())[:20])
        elif isinstance(v, list): print("  [%s] list len=%d" % (k, len(v)))
        else: print("  [%s]" % k, repr(v)[:60])
lv = json.load(open(os.path.join(root, "levels/activities/act1vautochess/level_act1vautochess_01-01.json"), encoding="utf-8"))
oc = lv.get("operaConfig", {})
print("operaConfig type:", type(oc).__name__, "keys:", list(oc.keys())[:20] if isinstance(oc, dict) else "")