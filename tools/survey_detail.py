# -*- coding: utf-8 -*-
"""专项资产探查：职业图标 variant、技能图标 hub、autochess/chess 相关。"""
import sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from asset_db import connect, DB


def sprites_in(conn, path_frag):
    rows = conn.execute(
        "SELECT o.type, o.name, o.width, o.height FROM objects o "
        "JOIN bundles b ON b.id = o.bundle_id WHERE b.path LIKE ? AND o.type IN ('Sprite','Texture2D')",
        (f"%{path_frag}%",),
    ).fetchall()
    sp = [r for r in rows if r[0] == "Sprite"]
    tx = [r for r in rows if r[0] == "Texture2D"]
    sizes = sorted({(r[2], r[3]) for r in sp if r[2]})
    names = sorted({r[1] for r in sp if r[1]})
    return len(sp), len(tx), sizes, names


def main():
    conn = connect(DB)

    print("=== 职业图标各 hub（Sprite 数量/尺寸/名称）===")
    for hub in [
        "profession_icons_hub", "profession_icons_v2_hub", "profession_hub",
        "profession_large_hub", "profession_no_shadow_hub", "friend_assist_profession_hub",
    ]:
        nsp, ntx, sizes, names = sprites_in(conn, hub)
        print(f"{hub}: Sprite {nsp} / Texture2D {ntx}，尺寸 {sizes}")
        print(f"    {names}")

    print("\n=== 技能图标 hub ===")
    for hub in ["hub_skillicon", "skills/icon_hub", "building/skills"]:
        nsp, ntx, sizes, names = sprites_in(conn, hub)
        print(f"{hub}: Sprite {nsp} / Texture2D {ntx}，尺寸 {sizes}")
        print(f"    前 15 名: {names[:15]}")

    print("\n=== autochess / chess 相关 Sprite + TextAsset ===")
    rows = conn.execute(
        "SELECT b.path, o.type, o.name, o.width, o.height FROM objects o "
        "JOIN bundles b ON b.id = o.bundle_id "
        "WHERE (o.name LIKE '%autochess%' OR o.name LIKE '%chess%' OR o.name LIKE '%SiegeChess%') "
        "AND o.type IN ('Sprite','Texture2D','TextAsset')",
    ).fetchall()
    for path, typ, name, w, h in rows:
        print(f"  {typ}\t{name}\t{w}×{h}\t{path.split('/')[-1]}")


    print("\n=== skill_icon / image_skill_icon 相关 ===")
    for pat in ["%skill_icon%", "%image_skill_icon%"]:
        rows = conn.execute(
            "SELECT b.path, o.type, o.name, o.width, o.height FROM objects o "
            "JOIN bundles b ON b.id = o.bundle_id WHERE o.name LIKE ? AND o.type IN ('Sprite','Texture2D')",
            (pat,),
        ).fetchall()
        print(f"  [{pat}] 命中 {len(rows)}")
        seen = set()
        for p, t, n, w, h in rows:
            key = (p.split("/")[-1], n)
            if key in seen:
                continue
            seen.add(key)
            print(f"    {t}\t{n}\t{w}×{h}\t{p.split('/')[-1]}")
            if len(seen) >= 20:
                break

    print("\n=== 卫戍协议 token / 盟约 / 招募相关 ===")
    for pat in ["%token%", "%bond%", "%covenant%", "%recruit%"]:
        rows = conn.execute(
            "SELECT b.path, o.type, o.name, o.width, o.height FROM objects o "
            "JOIN bundles b ON b.id = o.bundle_id WHERE (o.name LIKE ? OR b.path LIKE ?) "
            "AND o.type IN ('Sprite','Texture2D','TextAsset') LIMIT 15",
            (pat, pat),
        ).fetchall()
        print(f"  [{pat}] 命中 {len(rows)}")
        seen = set()
        for p, t, n, w, h in rows:
            key = (n, t)
            if key in seen:
                continue
            seen.add(key)
            print(f"    {t}\t{n}\t{w}×{h}\t{p.split('/')[-1]}")


if __name__ == "__main__":
    main()
