import json
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
ed = json.load(open(root + "\\levels\\enemydata\\enemy_database.json", encoding="utf-8"))
print("enemy_database type:", type(ed).__name__)
def find(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "enemy_1099_nbkght" or (isinstance(v, dict) and v.get("enemyId") == "enemy_1099_nbkght"):
                return v
            r = find(v)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r is not None:
                return r
    return None
e = find(ed)
if e is not None:
    print("enemy_1099_nbkght 战斗属性:")
    print(json.dumps(e, ensure_ascii=False)[:700])
else:
    if isinstance(ed, dict):
        k = list(ed.keys())
        print("top keys:", k[:5], "... total", len(k))
        print("sample value:", json.dumps(ed[k[0]], ensure_ascii=False)[:300])
    elif isinstance(ed, list):
        print("list len:", len(ed), "[0]:", json.dumps(ed[0], ensure_ascii=False)[:300])