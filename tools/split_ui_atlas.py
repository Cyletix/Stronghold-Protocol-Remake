# 生成 BattleUI_atlas0 的编号索引图 + SpriteSheet 坐标表（供用户对照校准 + 游戏用 drawImage 调用）
import numpy as np, io, sys
from PIL import Image, ImageDraw
from scipy import ndimage
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
WEB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\web")
im = Image.open(WEB / "ui" / "BattleUI_atlas0.png").convert("RGBA")
a = np.array(im)[:, :, 3] > 100
lbl, n = ndimage.label(a)
objs = ndimage.find_objects(lbl)

boxes = []
for sl in objs:
    if sl is None:
        continue
    y0, y1 = sl[0].start, sl[0].stop
    x0, x1 = sl[1].start, sl[1].stop
    w, h = x1 - x0, y1 - y0
    if w < 12 or h < 12:
        continue
    boxes.append((x0, y0, w, h))
boxes.sort(key=lambda t: (t[1], t[0]))

# 编号索引图（水平排列，上方标编号）
CELL = 90
idx = Image.new("RGBA", (len(boxes) * CELL, CELL + 26), (30, 30, 40, 255))
dd = ImageDraw.Draw(idx)
for i, (x0, y0, w, h) in enumerate(boxes):
    crop = im.crop((x0, y0, x0 + w, y0 + h))
    crop.thumbnail((CELL - 6, CELL - 6))
    idx.paste(crop, (i * CELL + (CELL - crop.width) // 2, 24), crop)
    dd.text((i * CELL + CELL // 2, 4), str(i), fill=(255, 255, 255))
idx.convert("RGB").save(WEB / "ui" / "sliced" / "BattleUI_index.png")

# SpriteSheet 坐标表
with open(WEB / "ui_atlas.js", "w", encoding="utf-8") as f:
    f.write("// BattleUI_atlas0.png 的图标坐标（SpriteSheet），索引 0 = 编号\n")
    f.write("const UI_ATLAS = " + repr([[x0, y0, w, h] for (x0, y0, w, h) in boxes]) + ";\n")

print("图标数:", len(boxes))
print("索引图:", WEB / "ui" / "sliced" / "BattleUI_index.png")
print("坐标表:", WEB / "ui_atlas.js")
