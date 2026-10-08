from pathlib import Path
import json,urllib.request,hashlib,concurrent.futures,time
base=Path('work/external-ready-data-20260914/Tim23333-Arknights_timer');tree=json.loads((base/'emulator-package-tree.json').read_text(encoding='utf-8'))
commit='d2f6d76a7172cedc7583fc0a4eb998699abf25f5';prefix='Ark_emulator/ark_emulator/';dest=base/'snapshot'/prefix
def fetch(row):
 name=row['path'];rel=Path(name)
 if row['type']!='blob' or rel.is_absolute() or '..' in rel.parts:raise ValueError('Invalid tree entry')
 path=dest/rel;url='https://raw.githubusercontent.com/Tim23333/Arknights_timer/'+commit+'/'+prefix+name
 if path.exists():blob=path.read_bytes()
 else:
  cached=base/('Ark_emulator__ark_emulator__'+name)
  if cached.exists():blob=cached.read_bytes()
  else:
   req=urllib.request.Request(url,headers={'User-Agent':'ArknightsResearch-source-audit'})
   with urllib.request.urlopen(req,timeout=60) as r:blob=r.read()
  path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(blob)
 git=hashlib.sha1(b'blob '+str(len(blob)).encode()+b'\x00'+blob).hexdigest()
 if git!=row['sha'] or len(blob)!=row['size']:raise ValueError('Git blob mismatch: '+name)
 return {'path':prefix+name,'url':url,'bytes':len(blob),'gitBlob':git,'sha256':hashlib.sha256(blob).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:files=list(pool.map(fetch,tree['tree']))
manifest={'repository':'https://github.com/Tim23333/Arknights_timer','commit':commit,'scope':'Complete published Ark_emulator/ark_emulator directory; no external code executed','files':files}
(base/'download-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':len(files),'bytes':sum(f['bytes'] for f in files),'manifest':str(base/'download-manifest.json')}))
