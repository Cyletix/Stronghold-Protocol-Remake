import json
from collections import deque
from pathlib import Path

# 重建 web/battle_levels.json 的怪物路线：
# 旧路线数据 startPosition 落在禁格、endPosition 落在紫传送门(tile_telin)，
# 导致怪物走到紫格里消失。这里改为「红门(tile_start) → 蓝门(tile_end)」的 BFS 路线，
# 中间经过紫传送门(tile_telin → 配对 tile_telout) 时按分段(segs)断开，引擎会做瞬间传送。
ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
IN = WEB / "battle_levels.json"


def walkable(p, motion="WALK"):
    # p 为 passableMask：ALL / WALK_ONLY / FLY_ONLY / FORBIDDEN
    if motion == "FLY":
        return p in ("ALL", "FLY_ONLY")
    return p in ("ALL", "WALK_ONLY")


def compute_routes(level):
    grid = level["grid"]
    passable = level["passable"]
    rows = level["rows"]
    cols = level["cols"]
    starts, ends, telins, telouts = [], [], [], []
    for r in range(rows):
        for c in range(cols):
            k = grid[r][c]
            if k == "tile_start":
                starts.append((r, c))
            elif k == "tile_end":
                ends.append((r, c))
            elif k == "tile_telin":
                telins.append((r, c))
            elif k == "tile_telout":
                telouts.append((r, c))
    telins.sort()
    telouts.sort()
    pair = dict(zip(telins, telouts))  # 紫门入口(telin) → 出口(telout)，按行列顺序配对

    def bfs(a, b):
        prev = {a: None}
        q = deque([a])
        while q:
            cur = q.popleft()
            if cur == b:
                break
            # 踩上 telin 必须传送（只走传送边，不走四邻接穿过紫门）
            if cur in pair:
                n = pair[cur]
                if n not in prev:
                    prev[n] = cur
                    q.append(n)
                continue
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (cur[0] + dr, cur[1] + dc)
                if n in prev:
                    continue
                if 0 <= n[0] < rows and 0 <= n[1] < cols and walkable(passable[n[0]][n[1]]):
                    prev[n] = cur
                    q.append(n)
        if b not in prev:
            return None
        path = []
        c = b
        while c is not None:
            path.append(c)
            c = prev[c]
        path.reverse()
        return path

    routes = []
    for st in starts:
        best = None
        for en in ends:
            p = bfs(st, en)
            if p is not None and (best is None or len(p) < len(best)):
                best = p
        if best is None:
            continue
        # 在 telin → telout 传送边界处切分成多个 seg（引擎在 seg 之间做瞬间传送，不连线）
        segs = []
        cur = []
        for i, node in enumerate(best):
            cur.append({"r": node[0], "c": node[1]})
            if node in pair and i + 1 < len(best) and best[i + 1] == pair[node]:
                segs.append(cur)
                cur = []
        if cur:
            segs.append(cur)
        routes.append({"motion": "WALK", "segs": segs})
    return routes


def main():
    data = json.load(open(IN, encoding="utf-8"))
    for lv in data["levels"]:
        lv["level"]["routes"] = compute_routes(lv["level"])
    json.dump(data, open(IN, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("rebuilt routes ->", IN.name)
    for lv in data["levels"]:
        g = lv["level"]["grid"]
        for i, rt in enumerate(lv["level"]["routes"]):
            segs = rt["segs"]
            sp = segs[0][0]
            en = segs[-1][-1]
            n = sum(len(s) for s in segs)
            print(
                "  ",
                lv["id"],
                "route",
                i,
                "segs",
                len(segs),
                "waypoints",
                n,
                "spawn",
                (sp["r"], sp["c"]),
                g[sp["r"]][sp["c"]],
                "leak",
                (en["r"], en["c"]),
                g[en["r"]][en["c"]],
            )


if __name__ == "__main__":
    main()
