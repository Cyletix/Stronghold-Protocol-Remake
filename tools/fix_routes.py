import json, io
from collections import deque
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
_shared = ROOT.parent / "ArknightsGameData" / "zh_CN" / "gamedata"
root = str(_shared if _shared.exists() else ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata")
lv = json.load(open(root + "\\levels\\activities\\act1vautochess\\level_act1vautochess_01-01.json", encoding="utf-8"))
md = lv["mapData"]; mp = md["map"]; tiles = md["tiles"]
def passable(r, c):
    if 0 <= r < len(mp) and 0 <= c < len(mp[r]):
        idx = mp[r][c]
        if idx is not None and idx < len(tiles): return tiles[idx].get("passableMask", "ALL")
    return "FORBIDDEN"
def can_walk(r, c, motion):
    m = passable(r, c)
    if motion == "FLY": return m in ("ALL", "FLY_ONLY")
    return m in ("ALL", "WALK_ONLY")
# 四邻接 BFS；起点/终点允许作为锚点(即便不可走)，用于出生/漏怪落位。
def bfs(a, b, motion):
    if a == b: return [a]
    prev = {a: None}; q = deque([a])
    while q:
        cur = q.popleft()
        if cur == b: break
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            n = (cur[0]+dr, cur[1]+dc)
            if n == b or (n not in prev and can_walk(n[0], n[1], motion)):
                if n not in prev: prev[n] = cur; q.append(n)
    if b not in prev: return None
    p = []; c = b
    while c is not None: p.append(c); c = prev[c]
    return p[::-1]

# 把一段的连续路点用 BFS 展开成沿可通行格的步进（正交，不再斜穿地形）；保留 wait。
def build_segment(seg, motion):
    if not seg: return []
    out = [dict(seg[0])]
    for i in range(1, len(seg)):
        a = (out[-1]["r"], out[-1]["c"]); b = (seg[i]["r"], seg[i]["c"])
        p = bfs(a, b, motion)
        cells = p[1:] if p else [tuple(b)]
        for j, (cr, cc) in enumerate(cells):
            wp = {"r": cr, "c": cc}
            if j == len(cells)-1 and seg[i].get("wait"): wp["wait"] = seg[i]["wait"]
            out.append(wp)
    return out

def build_route(r):
    sp = r.get("startPosition") or {"row": 0, "col": 0}
    ep = r.get("endPosition") or {"row": 0, "col": 0}
    start = [sp.get("row", 0), sp.get("col", 0)]
    end   = [ep.get("row", 0), ep.get("col", 0)]
    motion = r.get("motionMode", "WALK")
    segs = []; cur = [{"r": start[0], "c": start[1]}]
    for cp in r.get("checkpoints", []):
        t = cp.get("type")
        pos = cp.get("position") or {}
        rr, cc = pos.get("row", 0), pos.get("col", 0)
        if t == "MOVE": cur.append({"r": rr, "c": cc})
        elif t == "WAIT_FOR_SECONDS": cur[-1]["wait"] = cp.get("time", 0)
        elif t == "DISAPPEAR":
            if cur: segs.append(cur)
            cur = None
        elif t == "APPEAR_AT_POS": cur = [{"r": rr, "c": cc}]
    if cur is None: cur = []
    if cur:
        last = cur[-1]
        if last["r"] != end[0] or last["c"] != end[1]:
            cur.append({"r": end[0], "c": end[1]})
    if cur: segs.append(cur)
    return {"motion": motion, "segs": [build_segment(s, motion) for s in segs]}

routes = [build_route(r) for r in lv["routes"]]
bdp = str(ROOT / "web" / "battle_data.json")
bd = json.load(open(bdp, encoding="utf-8"))
bd["level"]["routes"] = routes
io.open(bdp, "w", encoding="utf-8").write(json.dumps(bd, ensure_ascii=False))
print("routes fixed. count:", len(routes))
for i, rt in enumerate(routes):
    n = sum(len(s) for s in rt["segs"])
    print("  route", i, "segs", len(rt["segs"]), "waypoints", n,
          "spawn", rt["segs"][0][0], "leak", rt["segs"][-1][-1], "motion", rt["motion"])
