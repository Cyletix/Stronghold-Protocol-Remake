#!/usr/bin/env python
# -*- coding: utf-8 -*-
# 补齐「卫戍协议」实战敌人的头像（PRTS media 规律：头像_敌人_{名}.png，MD5 分目录）
# 以 web/mode_data.json.enemyPool 为当前运行时权威集合，并兼容扫描关卡 wave 的 SPAWN 敌人 id。
# 用法：python tools/download_all_enemy_avatars.py [LIMIT]   # LIMIT 为本次最多下载数（默认全部）
import concurrent.futures
import json, hashlib, urllib.request, urllib.parse, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GD = ROOT / "data" / "ArknightsGameData" / "zh_CN" / "gamedata" / "levels" / "activities"
BD = json.load(open(ROOT / "web" / "battle_data.json", encoding="utf-8"))
EN = BD["enemies"]
MODE_DATA = json.load(open(ROOT / "web" / "mode_data.json", encoding="utf-8"))
OUT = ROOT / "web" / "enemy_avatars"
OUT.mkdir(exist_ok=True)

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else None

# 关卡数据名与 PRTS 媒体文件名不一致的少数别名（以对应敌人页/媒体页为据）。
MEDIA_NAME_OVERRIDES = {
    "enemy_1169_duphlx": ["深池方阵战士"],
    "enemy_1509_mousek": ["“鼠王”"],
    "enemy_9012_acloon": ["“炎佑”"],
    "enemy_9023_acdums": ["“余音”"],
}


def collect_ids():
    ids = set()
    for item in MODE_DATA.get("enemyPool", []):
        if isinstance(item, str):
            ids.add(item)
            continue
        eid = item.get("enemyId") or item.get("id")
        if eid:
            ids.add(eid)
        for extra in item.get("extraEnemyKeyList") or []:
            if extra:
                ids.add(extra)
    for season in ("act1autochess", "act1vautochess"):
        d = GD / season
        if not d.exists():
            continue
        for f in d.glob("level_*.json"):
            try:
                js = json.load(open(f, encoding="utf-8"))
            except Exception:
                continue
            for w in js.get("waves", []):
                for fr in w.get("fragments", []):
                    for a in fr.get("actions", []):
                        k = a.get("key") or ""
                        if k.startswith("enemy_"):
                            ids.add(k)
    return sorted(ids)


def fetch(eid):
    """返回 True=成功下载；False=该 id 来源失败。"""
    name = (EN.get(eid) or {}).get("name")
    if not name:
        return False
    names = MEDIA_NAME_OVERRIDES.get(eid, []) + name.split("/")
    for nv in names:       # 重名用 / 分隔则拆开逐个试
        if not nv.strip():
            continue
        fn = f"头像_敌人_{nv.strip()}.png"
        h = hashlib.md5(fn.encode("utf-8")).hexdigest()
        url = f"https://media.prts.wiki/{h[0]}/{h[0:2]}/{urllib.parse.quote(fn)}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=8).read()
            if len(data) > 200 and data[:3] != b"\xef\xbf\xbd":
                (OUT / f"{eid}.png").write_bytes(data)
                print("OK ", eid, name, len(data))
                return True
            print("BAD", eid, name, "len", len(data))
        except Exception as e:
            print("FAIL", eid, name, nv, repr(e)[:80])
    return False


def main():
    ids = collect_ids()
    missing = [e for e in ids if not (OUT / f"{e}.png").exists()]
    print("total enemies:", len(ids), "| already have:", len(ids) - len(missing), "| missing:", len(missing))
    targets = missing[:LIMIT] if LIMIT else missing
    ok = 0
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        jobs = {pool.submit(fetch, eid): eid for eid in targets}
        for job in concurrent.futures.as_completed(jobs):
            eid = jobs[job]
            try:
                if job.result():
                    ok += 1
                else:
                    failed.append(eid)
            except Exception:
                failed.append(eid)
    print("done, attempted:", len(targets), "| downloaded:", ok, "| failed:", len(failed))
    if failed:
        print("failed ids:", ",".join(sorted(failed)))


if __name__ == "__main__":
    main()
