import json
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
ct = json.load(open(root + "\\character_table.json", encoding="utf-8"))
k0 = list(ct.keys())[0]
print("character_table count:", len(ct))
print("sample key:", k0)
print("sample fields:", list(ct[k0].keys()))
for f in ["name","appellation","rarity","profession","subProfessionId","position","nationId","groupId","teamId"]:
    if f in ct[k0]:
        print("  ", f, "=", repr(ct[k0][f])[:80])
act = json.load(open(root + "\\activity_table.json", encoding="utf-8"))
acd = act["autoChessData"]
bond = acd["bondInfoDict"]
bk = list(bond.keys())[0]
print("=== bond sample ===")
print(json.dumps(bond[bk], ensure_ascii=False)[:400])
band = acd["bandDataDict"]
bk2 = list(band.keys())[0]
print("=== band sample ===")
print(json.dumps(band[bk2], ensure_ascii=False)[:300])
print("=== effectTypeDataDict sample (BOND) ===")
print(json.dumps(acd["effectTypeDataDict"].get("BOND"), ensure_ascii=False)[:300])
print("=== bondInfoDict keys ===")
print(list(bond.keys()))