import json, random
from collections import Counter
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata\excel"
ct = json.load(open(root + "\\character_table.json", encoding="utf-8"))
playable = [(k, v) for k, v in ct.items() if isinstance(v, dict) and v.get("profession") and v.get("profession") != "TOKEN"]
print("总数(非TOKEN):", len(playable))
random.seed(42)
sample = random.sample(playable, 10)
print("=== 随机抽 10 个 ===")
for k, v in sample:
    print("  ", k, "|", v.get("name"), "|", v.get("rarity"), "|", v.get("profession"), "| notObtainable=", v.get("isNotObtainable"), "| spChar=", v.get("isSpChar"))
c1 = Counter(bool(v.get("isNotObtainable")) for k, v in playable)
c2 = Counter(bool(v.get("isSpChar")) for k, v in playable)
print("isNotObtainable 分布:", dict(c1))
print("isSpChar 分布:", dict(c2))
formal = [v for k, v in playable if not v.get("isNotObtainable")]
print("排除 isNotObtainable 后:", len(formal))