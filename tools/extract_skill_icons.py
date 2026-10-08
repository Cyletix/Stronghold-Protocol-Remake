#!/usr/bin/env python
# -*- coding: utf-8 -*-
# 从 SkillIcon 图集切出个体技能图标（几何可靠），并解析 FairyGUI 包(skillicon_fui.bytes)的字符串表。
# 产出：
#   web/ui/skillicons/skill_icon_{seq:04d}.png   按图集打包顺序编号的个体图标
#   web/ui/skill_icon_map.json                  {tiles:[{page,x,y,w,h}], namesInFguiOrder:[...]}
# 说明：图集 6 页连通块 225*5+74=1199，与 FairyGUI 字符串表内 skill_icon_* 数目 1199 完全一致。
#       namesInFguiOrder 为字符串表中 skill_icon_* 的出现顺序（≈ 条目顺序），供后续解码 item 记录建立 name→rect。
import re, sys, io, json
from pathlib import Path
from PIL import Image
import numpy as np
from scipy import ndimage

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
WEB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\web")
UI = WEB / "ui"
FUI = (UI / "skillicon_fui.bytes").read_bytes()
OUT = UI / "skillicons"
OUT.mkdir(exist_ok=True)
PAGES = ["SkillIcon_atlas0.png", "SkillIcon_atlas0_1.png", "SkillIcon_atlas0_2.png",
         "SkillIcon_atlas0_3.png", "SkillIcon_atlas0_4.png", "SkillIcon_atlas0_5.png"]

# ---------- 1) 解析 FairyGUI 字符串表：条目录 = [len:2BE][utf8] ----------
L = len(FUI)
def decode_table(start):
    pos, out = start, []
    while pos + 2 <= L:
        n = int.from_bytes(FUI[pos:pos+2], "big")
        pos += 2
        if n == 0 or n > 300 or pos + n > L:
            return None, pos, out
        out.append(FUI[pos:pos+n].decode("utf-8", "replace"))
        pos += n
    if pos == L:
        return True, pos, out
    return None, pos, out

first = FUI.find(b"skill_icon_")
table = None
for back in range(0, 300, 2):
    ok, endpos, t = decode_table(first - back)
    if ok:
        table = t
        break
if table is None:
    raise RuntimeError("no string table")
names_fgui = [s for s in table if s.startswith("skill_icon_")]

# ---------- 2) 图集 alpha 连通域切块，按打包顺序编号 ----------
def page_boxes(path):
    im = Image.open(UI / path).convert("RGBA")
    a = np.array(im)[:, :, 3] > 100
    lbl, n = ndimage.label(a)
    boxes = []
    for sl in ndimage.find_objects(lbl):
        if sl is None:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        if (y1 - y0) < 12 or (x1 - x0) < 12:
            continue
        boxes.append((x0, y0, x1 - x0, y1 - y0))
    boxes.sort(key=lambda b: (b[1], b[0]))
    return im, boxes

tiles = []
for p in PAGES:
    im, boxes = page_boxes(p)
    for (x0, y0, w, h) in boxes:
        tiles.append({"page": p, "x": x0, "y": y0, "w": w, "h": h})
        crop = im.crop((x0, y0, x0 + w, y0 + h))
        crop.save(OUT / f"skill_icon_{len(tiles)-1:04d}.png")

# ---------- 3) 写清单 ----------
(UI / "skill_icon_map.json").write_text(
    json.dumps({"count": len(tiles), "tiles": tiles,
                "namesInFguiOrder": names_fgui, "fguiTableSize": len(table)},
               ensure_ascii=False, indent=1), encoding="utf-8")
print("string table entries:", len(table), "| skill_icon names:", len(names_fgui))
print("atlas tiles:", len(tiles))
print("icons written:", len(list(OUT.glob('*.png'))))
print("manifest:", UI / "skill_icon_map.json")
