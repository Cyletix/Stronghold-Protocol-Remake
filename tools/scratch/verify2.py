import json
from collections import Counter
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
ct = json.load(open(root + "\\character_table.json", encoding="utf-8"))
REAL = {"WARRIOR","SNIPER","TANK","MEDIC","SUPPORT","CASTER","SPECIAL","PIONEER"}
c = Counter(v.get("profession") for v in ct.values() if isinstance(v, dict) and v.get("profession"))
print("职业分布:", dict(c))
real = [v for v in ct.values() if isinstance(v, dict) and v.get("profession") in REAL]
print("8大职业真实干员:", len(real))
print("其中 notObtainable 的:", sum(1 for v in real if v.get("isNotObtainable")))
print("其中 isSpChar 的:", sum(1 for v in real if v.get("isSpChar")))