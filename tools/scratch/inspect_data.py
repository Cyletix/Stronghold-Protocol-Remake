import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
def dump(path, label):
    print("=== %s ===" % label)
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, dict):
        print("dict keys (%d):" % len(d), list(d.keys())[:25])
        for k in list(d.keys())[:2]:
            v = d[k]
            if isinstance(v, dict): print("  [%s] dict keys:" % k, list(v.keys())[:25])
            elif isinstance(v, list): print("  [%s] list len=%d" % (k, len(v)))
            else: print("  [%s]" % k, repr(v)[:60])
    elif isinstance(d, list):
        print("list len=%d" % len(d))
        if d and isinstance(d[0], dict): print("  item[0] keys:", list(d[0].keys())[:30])
dump(os.path.join(root, "levels/activities/act1vautochess/level_act1vautochess_01-01.json"), "level_act1vautochess_01-01")
dump(os.path.join(root, "levels/activities/act1autochess/level_autochess_enemy_data.json"), "enemy_data")
dump(os.path.join(root, "excel/battle_equip_table.json"), "battle_equip_table")
act = json.load(open(os.path.join(root, "excel/activity_table.json"), encoding="utf-8"))
print("=== activity_table top keys ===", list(act.keys()))
for topk, topv in act.items():
    if isinstance(topv, dict):
        for k in topv:
            if "autochess" in str(k).lower():
                print("  autochess in section", topk, "->", k)