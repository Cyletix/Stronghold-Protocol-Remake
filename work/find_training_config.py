from pathlib import Path
import sqlite3,json,sys,zipfile
c=sqlite3.connect('work/inventory.sqlite');print(c.execute("select name,sql from sqlite_master where type='table'").fetchall())
d=json.loads(Path('work/client-logic/script-types.json').read_text(encoding='utf8')); print(type(d),str(d)[:180]);
sys.path.insert(0,str(Path('tools').resolve())); from extract_client_logic import load_bundle,safe
z=zipfile.ZipFile('work/main.obb')
for b in ['assets/AB/Android/config/common.ab','assets/AB/Android/battle/[pack]common.ab']:
 env=load_bundle(z.read(b)); print(b,'objects',len(env.objects))
 for o in env.objects:
  if o.type.name not in ['MonoBehaviour','TextAsset','AssetBundle']:continue
  t=safe(o.read_typetree()); name=t.get('m_Name','')
  if any(x in str(t) for x in ['trainingRoundInfos','trainingShopInfos','AutoChessBattleMiscConfig']) or 'autochess' in name.lower():
   p=Path('work/client-logic/native-economy')/(str(o.path_id)+'.json');p.write_text(json.dumps(t,ensure_ascii=False,indent=2),encoding='utf8');print('MATCH',str(o.path_id),o.type.name,name,str(t)[:230])
