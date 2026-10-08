# 抓取 PRTS 卫戍协议「策略报告」，提取每个开局策略（发起人=bandName）的血量/策略名/效果，生成 band_data.json
import json, re, urllib.request, urllib.parse, io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = "卫戍协议：盟约 下半/PRTS盟约记录"
url = "https://prts.wiki/api.php?action=parse&page=" + urllib.parse.quote(PAGE) + "&format=json&prop=wikitext&section=4"
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://prts.wiki/",
})
data = json.load(urllib.request.urlopen(req, timeout=40))
wikitext = data["parse"]["wikitext"]["*"]

bands = {}
cur = {}
for line in wikitext.split("\n"):
    m = re.match(r"\s*\|\s*发起人\s*=\s*(.*)", line)
    if m:
        cur = {"发起人": m.group(1).strip()}
        continue
    if "发起人" not in cur:
        continue
    m = re.match(r"\s*\|\s*策略\s*=\s*(.*)", line)
    if m:
        cur["策略"] = m.group(1).strip().replace("<br>", " / ")
        continue
    m = re.match(r"\s*\|\s*血量\s*=\s*(\d+)", line)
    if m:
        cur["血量"] = int(m.group(1))
        continue
    m = re.match(r"\s*\|\s*效果\s*=\s*(.*)", line)
    if m:
        cur["效果"] = m.group(1).strip().replace("<br>", " ").replace("{{color|#ff6237|", "").replace("{{color|gray|", "").replace("{{color|#0098DC|", "").replace("}}", "")
        continue
    if line.strip() == "}}" and "发起人" in cur and "血量" in cur:
        bands[cur["发起人"]] = {"策略": cur.get("策略", cur["发起人"]), "血量": cur["血量"], "效果": cur.get("效果", "")}
        cur = {}

out_path = ROOT / "web" / "band_data.json"
io.open(str(out_path), "w", encoding="utf-8").write(json.dumps(bands, ensure_ascii=False, indent=1))
print("bands:", len(bands))
for k, v in bands.items():
    print(f"  {k} [{v['策略']}] 血量{v['血量']} {v['效果'][:30]}")
