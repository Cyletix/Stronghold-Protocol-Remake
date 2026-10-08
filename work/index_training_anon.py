from pathlib import Path
import zipfile,sys,json,hashlib
sys.path.insert(0,str(Path('tools').resolve()));from extract_client_logic import load_bundle
rows=[]
with zipfile.ZipFile('work/main.obb')as z:
 for name in [p for p in z.namelist()if '/anon/'in p]:
  blob=z.read(name);env=load_bundle(blob);texts=[];asset=None
  for o in env.objects:
   if o.type.name=='AssetBundle':asset=o.read_typetree().get('m_Name')
   if o.type.name=='TextAsset':
    t=o.read_typetree();texts.append({'pathId':str(o.path_id),'name':t['m_Name'],'bytes':len(t['m_Script'])})
  rows.append({'bundle':name,'sha256':hashlib.sha256(blob).hexdigest(),'asset':asset,'texts':texts})
Path('work/client-logic/native-economy/anonymous-text-assets.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
for r in rows:
 if r['texts']:print(r['bundle'].rsplit('/',1)[-1],r['asset'],[(x['name'],x['bytes']) for x in r['texts']])
