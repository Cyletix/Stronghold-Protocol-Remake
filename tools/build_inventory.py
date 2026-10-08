# -*- coding: utf-8 -*-
"""
扫描 OBB 里全部 .ab，生成资源索引 SQLite（work/inventory.sqlite）。

每个 bundle 记录其对象（type / name / 尺寸），只枚举元数据（不读纹理像素）。
主数据源为 SQLite（供 tools/search_assets.py 查询），不再生成巨型 JSON。

用法：
  python tools/build_inventory.py          # 全量
  python tools/build_inventory.py 20       # 前 20 个（测试）
"""
import sys, io, zipfile
from pathlib import Path
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, str(Path(__file__).parent))
from decompress_ab import parse_ab
from asset_db import connect, DB
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent.parent
OBB = ROOT / "work" / "main.obb"


def describe_object(obj) -> tuple:
    """返回 (path_id, type, name, width, height)。"""
    typ = obj.type.name
    name = None
    w = h = None
    try:
        data = obj.read()
        name = getattr(data, "m_Name", None)
    except Exception:
        pass
    if typ == "Texture2D":
        try:
            t = obj.read()
            w, h = t.m_Width, t.m_Height
        except Exception:
            pass
    elif typ == "Sprite":
        try:
            r = obj.read().m_Rect
            w, h = int(r.width), int(r.height)
        except Exception:
            pass
    return (obj.path_id, typ, name, w, h)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    z = zipfile.ZipFile(OBB)
    names = [n for n in z.namelist() if n.endswith(".ab")]
    if limit:
        names = names[:limit]
    print(f".ab 总数: {len(names)}")

    conn = connect(DB)
    conn.execute("DELETE FROM objects")
    conn.execute("DELETE FROM bundles")

    type_counter = Counter()
    errors = []

    for idx, name in enumerate(names, 1):
        try:
            ab = z.read(name)
            nodes = parse_ab(ab)
            ser = next((blob for p, blob in nodes if not p.endswith(".resS")), None)
            if ser is None:
                continue
            env = Environment()
            f = parse_file(EndianBinaryReader(ser), env, "CAB")
            env.register_cab("CAB", f)
            env.files["CAB"] = f
            objects = [describe_object(o) for o in env.objects]
        except Exception as e:
            errors.append((name, str(e)[:120]))
            continue

        cur = conn.execute("INSERT INTO bundles(path) VALUES(?)", (name,))
        bid = cur.lastrowid
        conn.executemany(
            "INSERT INTO objects(bundle_id,path_id,type,name,width,height) VALUES(?,?,?,?,?,?)",
            [(bid,) + o for o in objects],
        )
        for o in objects:
            type_counter[o[1]] += 1

        if idx % 200 == 0:
            conn.commit()
            print(f"  进度 {idx}/{len(names)}  对象累计 {sum(type_counter.values())}")

    conn.commit()
    nb = conn.execute("SELECT COUNT(*) FROM bundles").fetchone()[0]
    no = conn.execute("SELECT COUNT(*) FROM objects").fetchone()[0]
    conn.close()

    print(f"\n完成，写 {DB}：{nb} 个 bundle，{no} 个对象，{len(errors)} 个错误")
    print("\n对象类型分布:")
    for t, n in type_counter.most_common():
        print(f"  {t}: {n}")
    if errors:
        print(f"\n前 5 个错误:")
        for name, e in errors[:5]:
            print(f"  {name}: {e}")


if __name__ == "__main__":
    main()
