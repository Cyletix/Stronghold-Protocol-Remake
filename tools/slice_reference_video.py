"""Extract timestamped reference frames; never modifies the source video."""
import argparse, json, subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('out');p.add_argument('--times',required=True);p.add_argument('--prefix',default='overview');args=p.parse_args()
out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
times=[float(t) for t in args.times.split(',')]
def capture(t):
    dest=out/f'{args.prefix}-{int(t):04d}.jpg'
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',args.video,'-frames:v','1','-q:v','2',str(dest)],check=True,creationflags=0x08000000)
    return {'seconds':t,'file':dest.name}
with ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(capture,times))
for start in range(0,len(rows),12):
    batch=rows[start:start+12];sheet=Image.new('RGB',(1280,((len(batch)+2)//3)*266),'#111827');draw=ImageDraw.Draw(sheet)
    for n,row in enumerate(batch):
        x=(n%3)*426;y=(n//3)*266
        with Image.open(out/row['file']) as im:sheet.paste(im.resize((426,240)),(x,y+26))
        t=int(row['seconds']);draw.text((x+8,y+5),f'{t//60:02d}:{t%60:02d}',fill='white')
    sheet.save(out/f'{args.prefix}-sheet-{start//12+1}.jpg',quality=92)
(out/f'{args.prefix}-index.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(f'{len(rows)} frames, {(len(rows)+11)//12} sheets -> {out}')
