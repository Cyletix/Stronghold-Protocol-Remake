# -*- coding: utf-8 -*-
"""
资产普查：基于 inventory.sqlite 做语义聚类，不重新扫描 OBB。
按关键词对 bundle/对象做统计，输出各类的资源概况（供 docs/asset-map.md）。
"""
import sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from asset_db import connect, DB

KEYWORDS = [
    "profession", "skill", "char", "portrait", "avatar", "enemy",
    "token", "item", "dungeon", "tile", "map", "campaign",
    "autochess", "chess", "icon", "btn", "hud", "battle", "ui",
]


def survey(conn, kw):
    rows = conn.execute(
        """
        SELECT b.path, o.type, o.name, o.width, o.height
        FROM objects o JOIN bundles b ON b.id = o.bundle_id
        WHERE o.name LIKE ? OR b.path LIKE ?
        """,
        (f"%{kw}%", f"%{kw}%"),
    ).fetchall()
    if not rows:
        return None
    bundles = sorted({r[0] for r in rows})
    type_cnt = Counter(r[1] for r in rows)
    # 只统计有名字的
    named = [r for r in rows if r[2]]
    names = Counter(r[2] for r in named)
    sizes = [r for r in named if r[3] is not None and r[4] is not None]
    ws = [r[3] for r in sizes]
    hs = [r[4] for r in sizes]
    return {
        "kw": kw,
        "bundles": len(bundles),
        "objects": len(rows),
        "type_cnt": type_cnt,
        "top_names": names.most_common(12),
        "size_range": (min(ws), max(ws), min(hs), max(hs)) if sizes else None,
        "sample_bundles": bundles[:8],
    }


def main():
    conn = connect(DB)
    for kw in KEYWORDS:
        r = survey(conn, kw)
        if not r:
            print(f"### {kw}: 无命中\n")
            continue
        sr = r["size_range"]
        sr_txt = f"{sr[0]}~{sr[1]}×{sr[2]}~{sr[3]}" if sr else "-"
        print(f"### {kw}: {r['bundles']} bundle / {r['objects']} 对象，尺寸 {sr_txt}")
        print(f"    类型: {dict(r['type_cnt'])}")
        print(f"    典型名: {[n for n,_ in r['top_names']]}")
        print(f"    示例 bundle: {r['sample_bundles']}")
        print()
    conn.close()


if __name__ == "__main__":
    main()
