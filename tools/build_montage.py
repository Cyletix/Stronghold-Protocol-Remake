from PIL import Image, ImageDraw
from pathlib import Path

d = Path('web/ui/sliced/tmp')
ims = [Image.open(d / f'id_{i:02d}.png').convert('RGBA') for i in range(29)]
CELL = 160
cols = 10
rows = (len(ims) + cols - 1) // cols
W = cols * CELL
H = rows * (CELL + 30)
out = Image.new('RGB', (W, H), (40, 40, 50))
dd = ImageDraw.Draw(out)
for i, im in enumerate(ims):
    im2 = im.copy()
    im2.thumbnail((CELL - 8, CELL - 8))
    cx = (i % cols) * CELL
    cy = (i // cols) * (CELL + 30)
    out.paste(im2, (cx + (CELL - im2.width) // 2, cy + 26), im2)
    dd.text((cx + CELL // 2, cy + 8), str(i), fill=(255, 255, 255), anchor='mm')
out.save('draft/_montage_big.png')
print('ok', out.size)
