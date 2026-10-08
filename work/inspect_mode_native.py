from pathlib import Path
import json,sys
sys.path.insert(0,str(Path('tools').resolve()))
from inspect_autochess_native import Snapshot
s=Snapshot(); out=Path('work/client-logic/native-economy');out.mkdir(exist_ok=True)
chosen={66646,66681,66682,66683,66684,66689,66693,66720,66753}
methods=[m for m in s.methods if m['index'] in chosen]
for m in methods:
 (out/(str(m['index'])+'_'+m['name']+'.asm')).write_text('; '+m['type']+'::'+m['name']+'\n'+'\n'.join(s.assembly(m['address']))+'\n',encoding='utf-8')
types=[t for t in s.types if t['fullName'].endswith('AutoChessDataBridgeLocalPlayer') or t['fullName'].endswith('AutoChessDataBridgeMultiPlayer')]
(out/'layouts.json').write_text(json.dumps([s.layout(t) for t in types],ensure_ascii=False,indent=2),encoding='utf-8')
(out/'signatures.json').write_text(json.dumps(s.signatures(methods),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'index':m['index'],'name':m['name'],'rva':hex(m['address'])} for m in methods]))
