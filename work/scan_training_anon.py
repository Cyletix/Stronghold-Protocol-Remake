from pathlib import Path
import zipfile,sys,json,hashlib
sys.path.insert(0,str(Path('tools').resolve()));from decompress_ab import parse_ab
out=Path('work/client-logic/native-economy'); rows=[]; needles=[b'trainingRoundInfos',b'trainingShopInfos',b'AutoChessBattleMiscConfig',b'autochess_battle',b'autochess_misc']
with zipfile.ZipFile('work/main.obb')as z:
 for name in [p for p in z.namelist()if '/anon/'in p]:
  blob=z.read(name); r={'bundle':name,'sha256':hashlib.sha256(blob).hexdigest(),'hits':[]}
  try:
   for cab,data in parse_ab(blob):
    hits=[n.decode()for n in needles if n in data]
    if hits:r['hits'].append({'cab':cab,'keys':hits});print(name,cab,hits,flush=True)
  except Exception as e:r['error']=str(e)
  rows.append(r)
(out/'anonymous-config-scan.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print('SCANNED',len(rows),'HITS',sum(bool(r['hits'])for r in rows))
