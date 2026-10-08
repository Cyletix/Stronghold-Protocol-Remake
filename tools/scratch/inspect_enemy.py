import json
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
eh = json.load(open(root + "\\enemy_handbook_table.json", encoding="utf-8"))
ed = eh.get("enemyData", {})
print("enemyData type:", type(ed).__name__, "count:", len(ed) if isinstance(ed, dict) else "")
for k in ["enemy_1099_nbkght", "enemy_1103_wdkght"]:
    if isinstance(ed, dict) and k in ed:
        print("=== " + k + " ===")
        print(json.dumps(ed[k], ensure_ascii=False)[:600])
    else:
        print(k, "NOT found; sample keys:", list(ed.keys())[:8] if isinstance(ed, dict) else "")