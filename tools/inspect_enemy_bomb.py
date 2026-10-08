"""Pin the existing Boomb source group; only missing native methods are read once."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/enemy-bomb-contract.json'
NATIVE=ROOT/'work/client-logic/native-enemy-bomb'
METHODS={72585,72586,77537,77538,77541,77542}

def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))

def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--native',action='store_true')
    options=args.parse_args()
    paths=['work/enemy-skill-dispatch-candidates.json','work/client-logic/script-types.json',
        'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json',
        'work/enemy-animation-supplement.json']
    inputs={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
    candidates=read(paths[0])['candidates']
    candidate=next(v for v in candidates.values() if v['enemyId']=='enemy_1040_bombd')
    scripts=read(paths[1])['matches'];bundle=read(paths[2])
    asset=next((name,ref) for name,ref in bundle['assetContainer'] if name.endswith('/projectile_bombd.prefab'))
    go=asset[1]['asset']['m_PathID']
    assert len(bundle['externals'])==1, 'Resolve projectile CAB before using external file IDs'
    external_files=next(iter(bundle['externals'].values()))
    nodes={pid:node for pid,node in bundle['nodes'].items()
        if node.get('fields',{}).get('m_GameObject',{}).get('m_PathID')==go}
    for node in nodes.values():
        if node['unityType']!='MonoBehaviour':continue
        ref=node['fields']['m_Script'];cab=external_files[ref['m_FileID']-1]
        if isinstance(cab,dict):cab=cab.get('pathName',cab.get('path',''))
        table=next(x['scripts'] for x in scripts if x['cab'].lower() in str(cab).lower())
        script=table[ref['m_PathID']]
        node['scriptType']=script['m_Namespace']+'.'+script['m_Name']
    if options.native and not (NATIVE/'evidence.json').exists():
        from inspect_autochess_native import Snapshot
        snapshot=Snapshot()
        digest=hashlib.sha256(snapshot.data).hexdigest()
        assert digest=='d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af'
        NATIVE.mkdir(parents=True,exist_ok=True)
        methods=[m for m in snapshot.methods if m['index'] in METHODS]
        assert {m['index'] for m in methods}==METHODS
        records=[]
        for method in methods:
            lines=snapshot.assembly(method['address']);name=f"{method['index']}_{method['name']}.asm"
            (NATIVE/name).write_text('; '+method['type']+'::'+method['name']+'\n'+'\n'.join(lines)+'\n',encoding='utf8')
            records.append(dict(index=method['index'],method=method['name'],type=method['type'],
                address=hex(method['address']),instructions=len(lines),file=name))
        types={m['type'] for m in methods}
        evidence=dict(sha256=digest,methods=records,layouts=[snapshot.layout(t) for t in snapshot.types if t['fullName'] in types])
        (NATIVE/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    native=read('work/client-logic/native-enemy-bomb/evidence.json') if (NATIVE/'evidence.json').exists() else None
    result=dict(schemaVersion=1,sourceVersion='CN frozen skill group + JP 36.7.22 projectile + attributed Spine',
        inputs=inputs,candidate=candidate,projectile=dict(asset=asset,nodes=nodes),
        animation=read(paths[3])['enemies']['enemy_1040_bombd'],native=native,
        boundary='Source group, not whole-skill acceptance. Cross-version application, root skill mounting and final BuffAfterAffecting transition remain separate from source timing/geometry parameters.')
    if OUT.exists():
        old=read('work/enemy-bomb-contract.json')
        for key in ('verified','inferred','remaining','validation'):
            if key in old:result[key]=old[key]
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(dict(output=str(OUT),components=len(nodes),nativeMethods=native and native['methods']),ensure_ascii=False))

if __name__=='__main__':main()
