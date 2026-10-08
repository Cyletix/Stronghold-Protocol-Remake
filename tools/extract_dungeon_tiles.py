#!/usr/bin/env python
# -*- coding: utf-8 -*-
# E6：导出 ArknightR dungeontile（卫戍协议地图地块贴图）到 web/ui/tiles/
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from pathlib import Path
from UnityPy import Environment
B = Path(r"D:\下载\Games\ArknightR\ArknightR_Data\StreamingAssets\aa\StandaloneWindows64\defaultlocalgroup_assets_assets\bundles\dungeontile")
OUT = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\web\ui\tiles")
OUT.mkdir(parents=True, exist_ok=True)
seen = {}
for m in sorted(B.glob("*.bundle")):
    env = Environment()
    env.load_file(str(m))
    for o in env.objects:
        if o.type.name != "Texture2D":
            continue
        try:
            tex = o.read()
        except Exception:
            continue
        name = tex.m_Name
        if name in seen:
            continue
        tex.image.save(str(OUT / f"{name}.png"))
        seen[name] = (tex.m_Width, tex.m_Height)
for n, (w, h) in sorted(seen.items()):
    print(f"{n:16s} {w}x{h}")
print("saved ->", OUT)
