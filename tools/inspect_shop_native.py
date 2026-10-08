"""Reproduce bounded JP 36.7.22 shop/round native evidence under ignored work/."""
from pathlib import Path
import hashlib, json
from inspect_autochess_native import Snapshot

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/client-logic/native-economy'
METHODS={19815,183407,202888,66646,66681,66682,66683,66684,66689,66692,66693,66720,66726,66753,
         66316,67530,149896,149980,150001,152102,152105,152195,152196,
         25013,66328,66329,66675,66678,67310,67311,67312,67325,79733,81454}
TYPES={'Torappu.AutoChessBattleMiscConfig','Torappu.AutoChessBattleMiscConfig+TrainingRoundInfo',
       'Torappu.AutoChessBattleMiscConfig+TrainingShopInfo','Torappu.ActAutoChessData+ActAutoChessTrapShopChessData',
       'Torappu.ActAutoChessData+ActAutoChessTrapChessData','Torappu.Battle.AutoChess.ShopData',
       'Torappu.Battle.AutoChess.AutoChessDataBridgeLocalPlayer','Torappu.Battle.AutoChess.LocalSave',
       'Torappu.Battle.AutoChess.RunTimeScenePlayerData','Torappu.Battle.AutoChess.BossBattleData',
       'Torappu.Battle.AutoChess.AutoChessMapAreaManager','Torappu.Battle.Action.Nodes+CheckBlocked'}

def main():
    s=Snapshot()
    digest=hashlib.sha256(s.data).hexdigest()
    if digest!='d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af':
        raise ValueError('Native snapshot changed; method IDs and offsets must be revalidated')
    OUT.mkdir(parents=True,exist_ok=True)
    methods=[m for m in s.methods if m['index'] in METHODS]
    assert {m['index'] for m in methods}==METHODS
    records=[]
    for m in methods:
        lines=s.assembly(m['address']);name=str(m['index'])+'_'+m['name']+'.asm'
        (OUT/name).write_text('; '+m['type']+'::'+m['name']+'\n'+'\n'.join(lines)+'\n',encoding='utf8')
        records.append(dict(index=m['index'],type=m['type'],method=m['name'],rva=hex(m['address']),
                            instructions=len(lines),file=name))
    layouts=[s.layout(t) for t in s.types if t['fullName'] in TYPES]
    result=dict(source=str(s.path.relative_to(ROOT)),sha256=digest,version='JP 36.7.22',methods=records,
                layouts=layouts,signatures=s.signatures(methods),
                boundary='Disassembly and fields require semantic review. Short/protected bodies, XLua overrides, generic sharing and server decisions remain unresolved; this is not C# source.')
    (OUT/'shop-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('SHOP NATIVE:',len(methods),'methods,',len(layouts),'field layouts;',sum(m['instructions']<8 for m in records),'short/protected bodies retained as gaps')

if __name__=='__main__':main()
