import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
cmt = json.load(open(os.path.join(root, "char_master_table.json"), encoding="utf-8"))
for mk, mv in cmt.items():
    cands = mv.get("candidates", [])
    print("=== %s: %d candidates ===" % (mk, len(cands)))
    if cands:
        c0 = cands[0]
        print("  candidate[0] keys:", list(c0.keys()))
        print("  candidate[0] =", repr(c0)[:450])
dm = json.load(open(os.path.join(root, "display_meta_table.json"), encoding="utf-8"))
print("=== display_meta_table type=%s ===" % type(dm).__name__)
if isinstance(dm, dict):
    ks = list(dm.keys())
    print("  keys (%d):" % len(ks), ks[:30])
    for k, v in dm.items():
        s = json.dumps(v, ensure_ascii=True).lower()
        if "autochess" in s:
            print("  [%s] has autochess: %s" % (k, repr(v)[:180]))