import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
files = sorted(os.listdir(root))
print("=== all excel files (%d) ===" % len(files))
print(files)
gc = json.load(open(os.path.join(root, "gamedata_const.json"), encoding="utf-8"))
print("=== gamedata_const type", type(gc).__name__)
if isinstance(gc, dict):
    acks = [k for k in gc if "autochess" in str(k).lower()]
    print("autochess keys (%d):" % len(acks), acks)
    for k in acks[:15]:
        print("  [%s] = %s" % (k, repr(gc[k])[:200]))
for fn in ["skill_table.json", "display_meta_table.json", "item_table.json", "zone_table.json", "stage_table.json"]:
    try:
        d = json.load(open(os.path.join(root, fn), encoding="utf-8"))
    except Exception as e:
        print("ERR", fn, e); continue
    if isinstance(d, dict):
        acks = [k for k in d if "autochess" in str(k).lower()]
        print("=== %s autochess keys (%d):" % (fn, len(acks)), acks[:25])
    else:
        print("=== %s type %s len %d ===" % (fn, type(d).__name__, len(d)))