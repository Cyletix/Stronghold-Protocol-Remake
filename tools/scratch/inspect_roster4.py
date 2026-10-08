import json, os
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
def dump(fn):
    d = json.load(open(os.path.join(root, fn), encoding="utf-8"))
    print("=== %s type=%s ===" % (fn, type(d).__name__))
    if isinstance(d, dict):
        ks = list(d.keys())
        print("  keys (%d):" % len(ks), ks[:25])
        k0 = ks[0]
        v0 = d[k0]
        if isinstance(v0, dict):
            print("  sample [%s] keys:" % k0, list(v0.keys()))
            for k2, v2 in list(v0.items())[:15]:
                print("     %s = %s" % (k2, repr(v2)[:130]))
        else:
            print("  sample [%s] = %s" % (k0, repr(v0)[:130]))
    elif isinstance(d, list):
        print("  list len=%d" % len(d))
        if d:
            print("  [0] =", repr(d[0])[:200])
for fn in ["char_master_table.json", "char_meta_table.json", "charm_table.json", "special_operator_table.json", "tech_buff_table.json"]:
    try:
        dump(fn)
    except Exception as e:
        print("ERR", fn, e)