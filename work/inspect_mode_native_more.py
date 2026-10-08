from pathlib import Path
import json,sys
sys.path.insert(0,str(Path('tools').resolve()))
from inspect_autochess_native import Snapshot
s=Snapshot(); out=Path('work/client-logic/native-economy')
methods=[m for m in s.methods if ('AutoChessDataBridgeLocalPlayer' == m['type'].split('.')[-1] and m['name']=='OnMessage') or ('AutoChessDataCenter' == m['type'].split('.')[-1] and m['name'] in ['UpdateData','UpdateShopData']) or ('AutoChessDataBridgeMultiPlayer' == m['type'].split('.')[-1] and m['name']=='ReqShopUpgrade')]
for m in methods:
 (out/(str(m['index'])+'_'+m['name']+'.asm')).write_text('; '+m['type']+'::'+m['name']+'\n'+'\n'.join(s.assembly(m['address']))+'\n',encoding='utf-8')
print(json.dumps([{'index':m['index'],'type':m['type'],'name':m['name'],'rva':hex(m['address'])} for m in methods]))
for t in s.types:
 if t['fullName'].endswith(('AutoChessDataCenter','AutoChessBattleMiscConfig','TrainingRoundInfo','TrainingShopInfo','LocalSave','AutoChessShopData','AutoChessShopItem')):
  layout=s.layout(t); (out/(t['name']+'-layout.json')).write_text(json.dumps(layout,indent=2),encoding='utf8')
  print(t['fullName'],[(f['name'],hex(f['offset']) if f['offset'] is not None else None,f['nativeType'].get('typeName')) for f in layout['fields']])
