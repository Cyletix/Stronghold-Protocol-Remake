import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
cm = json.load(open(os.path.join(root, "char_meta_table.json"), encoding="utf-8"))
for k in ["charIdMasterListMap", "charMasterDataMap", "spCharMissions"]:
    v = cm.get(k)
    print("=== %s type=%s ===" % (k, type(v).__name__))
    if isinstance(v, dict):
        ks = list(v.keys())
        print("  keys (%d):" % len(ks), ks[:20])
        k0 = ks[0]
        print("  sample [%s] = %s" % (k0, repr(v[k0])[:350]))
    elif isinstance(v, list):
        print("  len=%d" % len(v))
        if v:
            print("  [0] =", repr(v[0])[:350])