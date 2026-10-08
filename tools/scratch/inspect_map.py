import json
from collections import Counter
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData\zh_CN\gamedata"
lv = json.load(open(root + "\\levels\\activities\\act1vautochess\\level_act1vautochess_01-01.json", encoding="utf-8"))
md = lv["mapData"]; mp = md["map"]; tiles = md["tiles"]
grid = [[tiles[c]["tileKey"] if c < len(tiles) else "?" for c in r] for r in mp]
abbr = {"tile_forbidden":"#","tile_floor":"F","tile_start":"S","tile_end":"E","tile_wall":"#","tile_hole":".","tile_fence":"|"}
print("grid (top row first):")
for r in grid:
    print("  ", " ".join(abbr.get(t, t[5:9]) for t in r))
print("tileKey 分布:", dict(Counter(t for row in grid for t in row)))
print("=== route[0] full ===")
print(json.dumps(lv["routes"][0], ensure_ascii=False)[:900])
eh = json.load(open(root + "\\excel\\enemy_handbook_table.json", encoding="utf-8"))
print("=== enemy_handbook top-level keys ===")
print(list(eh.keys()))