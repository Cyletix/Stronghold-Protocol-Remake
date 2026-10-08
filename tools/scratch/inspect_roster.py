import json, os, glob
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
excel = os.path.join(root, "excel")
print("=== excel files containing autochess ===")
for fp in sorted(glob.glob(os.path.join(excel, "*.json"))):
    try:
        txt = open(fp, encoding="utf-8").read().lower()
    except Exception:
        continue
    if "autochess" in txt:
        print("  ", os.path.basename(fp))
act = json.load(open(os.path.join(excel, "activity_table.json"), encoding="utf-8"))
acd = act["autoChessData"]
def a(s, n=110):
    r = repr(s)
    return r[:n] + ("..." if len(r) > n else "")
cd = acd.get("constData", {})
print("=== constData keys (%d) ===" % len(cd))
print("  ", list(cd.keys()))
for k in list(cd.keys())[:12]:
    print("   [%s] = %s" % (k, a(cd[k])))
bd = acd.get("bandDataDict", {})
bk = list(bd.keys())[0]
b = bd[bk]
print("=== band sample [%s] keys ===" % bk, list(b.keys()) if isinstance(b, dict) else type(b).__name__)
if isinstance(b, dict):
    for k2, v2 in b.items():
        print("    %s = %s" % (k2, a(v2)))
bond = acd.get("bondInfoDict", {})
bk2 = list(bond.keys())[0]
print("=== bond sample [%s] keys ===" % bk2, list(bond[bk2].keys()) if isinstance(bond[bk2], dict) else type(bond[bk2]).__name__)
boss = acd.get("bossInfoDict", {})
bk3 = list(boss.keys())[0]
print("=== boss sample [%s] keys ===" % bk3, list(boss[bk3].keys()) if isinstance(boss[bk3], dict) else type(boss[bk3]).__name__)
st = json.load(open(os.path.join(excel, "stage_table.json"), encoding="utf-8"))
if isinstance(st, dict):
    acks = [k for k in st if "autochess" in str(k).lower()]
    print("=== stage_table autochess keys (%d) ===" % len(acks), acks[:30])