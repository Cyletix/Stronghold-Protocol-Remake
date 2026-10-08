# -*- coding: utf-8 -*-
"""
把 work/inventory.json（历史快照）迁移到 work/inventory.sqlite。
一次性脚本；以后 build_inventory.py 直接写 SQLite。
"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from asset_db import connect, DB, ROOT

JSON = ROOT / "work" / "inventory.json"


def main():
    conn = connect(DB)
    conn.execute("DELETE FROM objects")
    conn.execute("DELETE FROM bundles")

    data = json.load(open(JSON, encoding="utf-8"))
    for b in data:
        cur = conn.execute("INSERT INTO bundles(path) VALUES(?)", (b["path"],))
        bid = cur.lastrowid
        rows = [
            (bid, o.get("path_id"), o["type"], o.get("name"), o.get("width"), o.get("height"))
            for o in b["objects"]
        ]
        conn.executemany(
            "INSERT INTO objects(bundle_id,path_id,type,name,width,height) VALUES(?,?,?,?,?,?)",
            rows,
        )
    conn.commit()

    nb = conn.execute("SELECT COUNT(*) FROM bundles").fetchone()[0]
    no = conn.execute("SELECT COUNT(*) FROM objects").fetchone()[0]
    print(f"完成：{nb} 个 bundle，{no} 个对象 → {DB}")
    conn.close()


if __name__ == "__main__":
    main()
