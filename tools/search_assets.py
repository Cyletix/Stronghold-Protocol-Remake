# -*- coding: utf-8 -*-
"""
资产搜索工具：查 work/inventory.sqlite。

用法：
  python tools/search_assets.py skill                    # 全对象表模糊搜索
  python tools/search_assets.py profession --kind image   # 只看图片/精灵
  python tools/search_assets.py skill --kind image
  python tools/search_assets.py --kind text               # 只看 TextAsset
  python tools/search_assets.py --kind image --min-width 512 --min-height 512
  python tools/search_assets.py char --min-width 512
  python tools/search_assets.py enemy --bundle ui

kind: image / text / audio / mesh / animation / font（对应分类视图）
输出：bundle path / type / name / size / path_id
"""
import sys, io, argparse, sqlite3
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent))
from asset_db import DB, KIND_TABLE, connect


def main():
    ap = argparse.ArgumentParser(description="搜索 Arknights AssetBundle 资源索引")
    ap.add_argument("keyword", nargs="?", help="名称/路径模糊搜索")
    ap.add_argument("--kind", choices=list(KIND_TABLE), help="分类（image/text/audio/mesh/animation/font）")
    ap.add_argument("--type", help="对象类型过滤（如 Sprite/Texture2D/TextAsset）")
    ap.add_argument("--min-width", type=int, help="最小宽度")
    ap.add_argument("--min-height", type=int, help="最小高度")
    ap.add_argument("--bundle", help="bundle 路径模糊过滤")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    table = KIND_TABLE.get(args.kind, "objects")
    # view 里已有 bundle 列；objects 表要 join
    if table == "objects":
        base = "objects o JOIN bundles b ON b.id = o.bundle_id"
        name_col, path_col = "o.name", "b.path"
        width_col, height_col = "o.width", "o.height"
    else:
        base = table + " o"
        name_col, path_col = "o.name", "o.bundle"
        width_col, height_col = "o.width", "o.height"

    conn = connect(DB)
    q = f"SELECT {path_col}, o.type, {name_col}, {width_col}, {height_col}, o.path_id FROM {base} WHERE 1=1"
    params = []
    if args.type:
        q += " AND o.type = ?"; params.append(args.type)
    if args.keyword:
        q += f" AND ({name_col} LIKE ? OR {path_col} LIKE ?)"
        k = f"%{args.keyword}%"; params += [k, k]
    if args.min_width is not None:
        q += f" AND {width_col} >= ?"; params.append(args.min_width)
    if args.min_height is not None:
        q += f" AND {height_col} >= ?"; params.append(args.min_height)
    if args.bundle:
        q += f" AND {path_col} LIKE ?"; params.append(f"%{args.bundle}%")
    q += f" ORDER BY {path_col}, o.type LIMIT ?"; params.append(args.limit)

    rows = conn.execute(q, params).fetchall()
    conn.close()

    print(f"（kind={args.kind or 'all'}）命中 {len(rows)} 条（limit={args.limit}）\n")
    for path, typ, name, w, h, pid in rows:
        size = f"{w}×{h}" if w is not None and h is not None else "-"
        print(f"{path}\t{typ}\t{name}\t{size}\tpath_id={pid}")


if __name__ == "__main__":
    main()
