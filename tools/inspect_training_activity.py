"""Inspect the identified same-version activity object, without rescanning bundles.

Uses the parent's pinned FlatBuffers schema and to_object adapter. Outputs only
the source facts needed by the unresolved training NPC / equipment branch.
Run with ../.venv/Scripts/python.exe -B tools/inspect_training_activity.py.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.request
import zipfile
from extract_client_logic import load_bundle

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/client-logic/native-economy'
BUNDLE='assets/AB/Android/anon/68fb0f95608049bd69ae23ad3908072f.bin'
BUNDLE_SHA='35288e3a2650d477f0306e8fa0a4d048b60859afb522670254e2584c7e8ad75b'
PAYLOAD_SHA='9095a8cb54867ce4c6a18fa662bd308ead83eca28acf3a447369ca57de6ee8b8'
REV='f3b905b8e547311510b1c4b893e489f9fc526530'
SCHEMA_SHA='d7df55e67bfe1f841f5bf5aa21f1d88bdc641a8ff2ac8f0b689da556be41515b'
SCHEMA_URL='https://raw.githubusercontent.com/isHarryh/Ark-FBS-Py/'+REV+'/CN/activity_table.py'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    schema=OUT/'activity_table_schema.py'
    if not schema.exists():
        if args.check:raise ValueError('Missing pinned schema; run without --check first')
        raw=urllib.request.urlopen(SCHEMA_URL,timeout=30).read()
        if sha(raw)!=SCHEMA_SHA:raise ValueError('Pinned schema hash mismatch')
        schema.write_bytes(raw)
    if sha(schema.read_bytes())!=SCHEMA_SHA:raise ValueError('Schema differs from inspected version')
    with zipfile.ZipFile(ROOT/'work/main.obb')as archive:blob=archive.read(BUNDLE)
    if sha(blob)!=BUNDLE_SHA:raise ValueError('Activity bundle changed; revalidate source')
    env=load_bundle(blob)
    assets=[o.read_typetree() for o in env.objects if o.type.name=='AssetBundle']
    assert len(assets)==1 and assets[0]['m_Name']=='gamedata/excel/activity_table556f56.ab'
    objects=[o for o in env.objects if o.type.name=='TextAsset' and str(o.path_id)=='3507569230508595151']
    assert len(objects)==1
    tree=objects[0].read_typetree();assert tree['m_Name']=='activity_table556f56'
    raw=tree['m_Script'].encode('utf8','surrogateescape')
    if sha(raw)!=PAYLOAD_SHA:raise ValueError('Activity TextAsset changed')
    spec=importlib.util.spec_from_file_location('inspected_training_activity_schema',schema)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    sys.path.insert(0,str(ROOT.parent/'src'))
    from arkresearch.apk import to_object
    activity=module.ROOT_TYPE.GetRootAs(raw[128:],0).Activity()
    seasons={}
    for i in range(activity.AutochessSeasonLength()):
        row=activity.AutochessSeason(i);seasons[row.Key().decode()]=to_object(row.Value())
    assert set(seasons)=={'act1autochess'}
    act=seasons['act1autochess'];wanted='chess_item_3_11_e_a'
    assert wanted not in act['trapShopChessDatas'] and wanted not in act['trapChessDataDict']
    cn=json.loads((ROOT/'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').read_text(encoding='utf8'))['activity']['AUTOCHESS_SEASON']['act1autochess']
    npc_ids=['chess_char_5_01_a','chess_char_1_01_a','chess_char_4_01_a']
    for id in npc_ids:
        for key in ['charId','defaultSkillIndex','defaultUniEquipId','goldenChessId']:
            assert act['charShopChessDatas'][id][key]==cn['charShopChessDatas'][id][key]
    evidence={'source':{'version':'JP 36.7.22','bundle':BUNDLE,'bundleSha256':BUNDLE_SHA,'pathId':'3507569230508595151','textAsset':'activity_table556f56','payloadSha256':PAYLOAD_SHA,'encoding':'FlatBuffers after 128-byte signature','schemaUrl':SCHEMA_URL,'schemaSha256':SCHEMA_SHA},
              'objectPath':'activity.AUTOCHESS_SEASON.act1autochess',
              'counts':{k:len(act[k]) for k in ['charShopChessDatas','charChessDataDict','trapShopChessDatas','trapChessDataDict']},
              'missingTrainingItem':{'chessId':wanted,'trapShopChessDatas':None,'trapChessDataDict':None},
              'bossPartnerChessBindings':{id:act['charShopChessDatas'][id]for id in npc_ids},
              'boundary':'Exact JP source confirms the item is missing in both dictionaries and the three boss partner chess identities bind to the current CN source. This does not establish coordinate conversion call order, player ownership rules, NPC full stat parity or XLua overrides.'}
    text=json.dumps(evidence,ensure_ascii=False,indent=2)+'\n';out=OUT/'training-activity-evidence.json'
    if args.check:
        assert out.read_text(encoding='utf8')==text,'Training activity evidence is stale'
    else:out.write_text(text,encoding='utf8')
    print('PASS same-version training activity: absent equipment ID confirmed; 3 boss-partner chess bindings exact')

if __name__=='__main__':main()
