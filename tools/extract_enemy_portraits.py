#!/usr/bin/env python
# -*- coding: utf-8 -*-
# 【E2 调查结论】卫戍协议敌人立绘（web/enemy_portraits）
# 可用来源结论：
#   - PRTS 无敌人立绘：`立绘_敌人_*` / `敌人_*` 在 media.prts.wiki 均 404，只有 `头像_敌人_*`(158px，已在 E1 全量补齐)。
#   - ArknightR `bundles/units/{eid}_*.bundle` 的 Enemy 贴图是 **Spine 纹理图集**（alpha 连通块 26~123 个，身体部件散落），
#     并非干净单帧整只怪立绘——与干员立绘弃用 ArknightR 属同类问题。且 bundle 为共享（一个包含多个敌人贴图，
#     如 enemy_1099_nbkght_2 与 enemy_1031_mrogue_2 同包），旧 `extract_biggest_texture` 会抓错敌人，须按 tex.m_Name 匹配。
#   - `enemy_handbook_table.json` 仅提供能力文本(abilityList/damageType/enemyLevel)，无立绘图片引用。
# 结论：E2 现实阻塞 = 无干净敌人立绘来源；详情/图鉴请改用 PRTS 头像(web/enemy_avatars/，已 E1 补齐)。
# 本脚本：仅作为「按纹理名匹配提取 ArknightR Spine 图集」的参考实现（产出为图集，不作立绘用）。
import sys, io, json
from pathlib import Path
from UnityPy import Environment
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

UNIT = Path(r"D:\下载\Games\ArknightR\ArknightR_Data\StreamingAssets\aa\StandaloneWindows64\defaultlocalgroup_assets_assets\bundles\units")
WEB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\web")
OUT = WEB / "enemy_portraits"
OUT.mkdir(exist_ok=True)

# 需要的敌人 = act1autochess + act1vautochess 关卡 wave 的 SPAWN 敌人
GD = Path(r"data\ArknightsGameData\zh_CN\gamedata\levels\activities")
ids = set()
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
ids = sorted(ids)


def match_bundle_texture(eid):
    """在 ArknightR units 中找 m_Name 与 eid 匹配(精确/前缀)的贴图；返回(最大匹配 Texture2D, w, h)。"""
    best = None
    for pat_mode in ("precise", "loose"):
        for m in UNIT.glob(f"{eid}_*.bundle"):
            try:
                env = Environment()
                env.load_file(str(m))
            except Exception:
                continue
            for o in env.objects:
                if o.type.name != "Texture2D":
                    continue
                try:
                    tex = o.read()
                    name = tex.m_Name
                except Exception:
                    continue
                ok = (name == eid or name.startswith(eid + "_")) if pat_mode == "precise" else name.startswith(eid)
                if not ok:
                    continue
                if best is None or tex.m_Width * tex.m_Height > best[0] * best[1]:
                    best = (tex.m_Width, tex.m_Height, tex)
        if best or pat_mode == "precise":
            if best:
                break
    return best


def main():
    ok, miss = [], []
    for eid in ids:
        if (OUT / f"{eid}.png").exists():
            continue
        best = match_bundle_texture(eid)
        if best and best[0] * best[1] >= 128 * 128:
            w, h, tex = best
            tex.image.save(str(OUT / f"{eid}.png"))
            ok.append((eid, w, h))
        else:
            miss.append(eid)
    print("extracted spine-atlas textures:", len(ok))
    print("missing:", len(miss), miss)


if __name__ == "__main__":
    main()
