# 抓取 PRTS 卫戍协议「干员数据库」，提取每个参战干员的阶（Ⅰ~Ⅵ），生成 operator_tiers.json
import json, re, urllib.request, urllib.parse, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = "卫戍协议：盟约 下半/PRTS盟约记录"
url = "https://prts.wiki/api.php?action=parse&page=" + urllib.parse.quote(PAGE) + "&format=json&prop=wikitext&section=8"
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://prts.wiki/",
})
data = json.load(urllib.request.urlopen(req, timeout=40))
wikitext = data["parse"]["wikitext"]["*"]

roman = {"Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5, "Ⅵ": 6}
tier_map = {}
current = None
for line in wikitext.split("\n"):
    m = re.search(r"([ⅠⅡⅢⅣⅤⅥ])\}\}阶干员", line)
    if m:
        current = roman[m.group(1)]
        continue
    if current is None:
        continue
    for m2 in re.finditer(r"干员=([^|}\n]+)", line):
        name = m2.group(1).strip()
        if name:
            tier_map[name] = current

out_path = ROOT / "web" / "operator_tiers.json"
io.open(str(out_path), "w", encoding="utf-8").write(json.dumps(tier_map, ensure_ascii=False, indent=1))
print("operators with tier:", len(tier_map))
for t in range(1, 7):
    names = [k for k, v in tier_map.items() if v == t]
    print(f"  {t}阶({len(names)}):", "、".join(names))
