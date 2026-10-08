"""Bind source levels to shared execution programs; no APP extraction or ID allowlist."""
import argparse
from collections import defaultdict
import hashlib
import json
import re
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT.parent/'src'),str(ROOT.parent/'tools')]
from arkresearch.client_logic import ClientLogicStore
from arkresearch.client_program import ProgramCompiler,SCHEMA_VERSION,BUNDLE_DOCUMENT,validate_program,required_blackboard_keys,ATTRIBUTES,SELF_FLAGS
from build_client_stat_buffs import supported_mode
from garrison_skill_scope import load_scope

OUTPUT=ROOT/'web/client_program_data.js'
REPORT=ROOT/'work/client-program-batch-report.json'
BATCH_RULE='garrison-self-programs-hp-ratio-until-detach-heal-free-v1'
FROZEN_RECEIPT='work/client-program-batch-evidence-20260918.json'

def frozen_receipts():
    path=ROOT/FROZEN_RECEIPT
    if not path.is_file():return {'path':FROZEN_RECEIPT,'present':False}
    raw=path.read_bytes();receipt=json.loads(raw)
    result={'path':FROZEN_RECEIPT,'sha256':hashlib.sha256(raw).hexdigest(),'present':True}
    for section in ('verification','classification'):
        inputs=receipt[section]['inputs']
        changed=[p for p,digest in inputs.items() if not (ROOT/p).is_file() or hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=digest]
        result[section]={'inputsMatch':not changed,'changedInputs':changed}
    result['boundary']='Frozen evidence remains separately readable. Only matching listed inputs retain applicability; this is not final combined-runtime or package validation.'
    return result

def previous_profiles():
    text=OUTPUT.read_text(encoding='utf-8')
    return json.loads(text.split('window.ArkClientProgramData=',1)[1].rsplit(';',1)[0])['profiles']

def compile_scoped(evidence,prefabs):
    compiler=ProgramCompiler(evidence,supported_attributes=ATTRIBUTES,supported_lifetimes=('timed','until_detach'),supported_flags=SELF_FLAGS)
    programs={};rejections={}
    for prefab in sorted(prefabs,key=lambda value:value or ''):
        if prefab not in evidence.prefabs:
            rejections[prefab]={'reason':'missing_source_prefab','blockers':[]};continue
        program,rejection=compiler.compile_prefab(prefab)
        if program is not None:programs[prefab]=program
        else:rejections[prefab]=rejection
    return dict(schema_version=SCHEMA_VERSION,programs=programs,rejections=rejections,
        source=dict(evidence_id=evidence.evidence_id,source_version=evidence.manifest['source_version'],
            evidence_database_sha256=evidence.manifest['database']['sha256'],
            artifact_hashes={key:evidence.manifest['artifacts'][key]['sha256'] for key in (BUNDLE_DOCUMENT,'skill-index.json','buff-templates.json')},
            script_supplement=compiler.scripts.manifest['supplement_id'],
            boundary='Executable expression mapping with explicit model boundaries, not complete native execution recovery. Rejected component fields remain research input.'))

def existing_mode_supported(mode,char_ids,database_sha256):
    if mode.get('kind')!='all_serialized_modes_preserve_existing_combat':return supported_mode(mode,char_ids,database_sha256)
    if mode.get('evidence_database_sha256')!=database_sha256 or not set(char_ids)<=set(mode.get('characters',[])):return False
    proofs=mode.get('proofs',[])
    if sorted(p.get('char_id','') for p in proofs)!=sorted(mode.get('characters',[])):return False
    for proof in proofs:
        ids=proof.get('mode_path_ids',[]);hashes=proof.get('mode_graph_sha256',[]);digest=proof.get('combat_graph_sha256','')
        if (not ids or len(set(ids))!=len(ids) or not re.fullmatch('[a-f0-9]{64}',digest)
            or hashes!=[digest]*len(ids) or type(proof.get('selected_mode')) is not int
            or not 0<=proof['selected_mode']<len(ids)
            or not all(isinstance(i,str) and re.fullmatch('-?[1-9][0-9]*',i) for i in [proof.get('character_path_id'),*ids])):return False
    return True

def build_with_report():
    evidence=ClientLogicStore('jp-36.7.22-client-logic')
    paths=['data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json','data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json','web/battle_levels.json']
    skills,characters,battle=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in paths]
    identities={}
    for character in battle['operators']:
        for row in characters[character['charId']]['skills']:
            identities.setdefault(row['skillId'],set()).add(character['charId'])
    previous=previous_profiles();scope=load_scope()
    eligible=set(scope['skillIds'])|set(previous)
    compiled=compile_scoped(evidence,{level['prefabId'] for sid in eligible if sid in identities for level in skills[sid]['levels']})
    profiles={};rejected={}
    for skill_id,char_ids in sorted(identities.items()):
        if skill_id not in eligible:continue
        levels=skills[skill_id]['levels'];prefabs={x['prefabId'] for x in levels}
        if not any(p in compiled['programs'] for p in prefabs):
            rejected[skill_id]=sorted({compiled['rejections'][p]['reason'] for p in prefabs})[0];continue
        if len(prefabs)!=1:
            rejected[skill_id]='level_prefab_changes';continue
        prefab=next(iter(prefabs));program=compiled['programs'][prefab];validate_program(program)
        if program.get('mode_graph') and not existing_mode_supported(program['mode_graph'],sorted(char_ids),evidence.manifest['database']['sha256']):
            rejected[skill_id]='unsupported_web_mode_contract';continue
        keys=set(required_blackboard_keys(program));source_keys=None
        for level in levels:
            bb={x['key']:x['value'] for x in level['blackboard']}
            if len(bb)!=len(level['blackboard']) or any(type(v) not in (int,float) or not -1e6<v<1e6 for v in bb.values()):
                rejected[skill_id]='invalid_blackboard';break
            actual=set(bb)
            if actual-keys or keys-(actual|{'duration'}):
                rejected[skill_id]='unconsumed_or_missing_blackboard_keys';break
            if source_keys is not None and source_keys!=actual:
                rejected[skill_id]='level_blackboard_changes';break
            source_keys=actual
            if level['skillType'] not in ('MANUAL','AUTO') or level['spData']['spCost']<=0:
                rejected[skill_id]='unsupported_skill_activation';break
            context={'duration':level['duration'],**bb}
            def value(expr):return expr['constant'] if 'constant' in expr else context[expr['key']]
            if any(m['attribute']=='ability_range_forward_extend' and
                   (m['formula']!='addition' or value(m['value'])<0 or int(value(m['value']))!=value(m['value']))
                   for b in program['buffs'] for m in b['modifiers']):
                rejected[skill_id]='unsupported_forward_range_modifier';break
            if any(b['lifetime']['kind']=='until_detach' for b in program['buffs']) and level['duration']!=-1:
                rejected[skill_id]='infinite_buff_without_infinite_skill_duration';break
            if any(value(b['lifetime']['duration'])<=0 for b in program['buffs'] if b['lifetime']['kind']=='timed'):
                rejected[skill_id]='nonpositive_buff_duration';break
        else:
            profiles[skill_id]={'prefabId':prefab,'charIds':sorted(char_ids),'blackboardKeys':sorted(source_keys),'levelCount':len(levels)}
    used={p['prefabId'] for p in profiles.values()}
    removed=sorted(set(previous)-set(profiles))
    if removed:raise ValueError('Existing client program profiles must not silently disappear: '+','.join(removed))
    result={'version':1,'programSchemaVersion':compiled['schema_version'],'source':compiled['source'],
            'sources':{**{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths},**scope['sources']},
            'programs':{p:compiled['programs'][p] for p in sorted(used)},'profiles':profiles,'rejected':rejected,
            'boundary':'Executable self Buff program bodies. Native source fields and explicit local timing/dispatch models remain distinct; other controllers, targets, events and mode graphs retain blockers.'}
    baseline=set(previous)
    if REPORT.exists():
        prior=json.loads(REPORT.read_text(encoding='utf-8'))
        if prior.get('batchRule')==BATCH_RULE:baseline=set(prior['baselineProfileIds'])
    fields=defaultdict(set)
    for sid in sorted(set(scope['skillIds'])&set(identities)):
        for prefab in {level['prefabId'] for level in skills[sid]['levels']}:
            for blocker in compiled['rejections'].get(prefab,{}).get('blockers',[]):
                key=blocker['reason']+':'+re.sub(r'\[\d+\]','[]',blocker.get('path',''))
                fields[key].add(sid)
    evidence_paths={'noDirectHealGetter':'work/client-logic/native-self-heal/Entity.get_isHealFree.4e062f0.asm',
                    'noDirectHealConsumer':'work/client-logic/native-self-heal/Entity.OnTakeHeal.4e158a4.asm',
                    'lifeTypeEnum':'work/client-logic/native-enemy-block/evidence.json'}
    report={'schemaVersion':1,'batchRule':BATCH_RULE,'rule':'Complete self Buff source programs; new bindings restricted to Garrison identity scope; existing bindings preserved.',
        'source':compiled['source'],'sources':result['sources'],
        'baselineProfileIds':sorted(baseline),
        'stats':{'scopeSkills':len(scope['skillIds']),'compiledPrefabs':len(compiled['programs'])+len(compiled['rejections']),
                 'retainedProfiles':len(baseline),'profiles':len(profiles),'programs':len(used),'levels':sum(p['levelCount'] for p in profiles.values())},
        'addedProfiles':{sid:profiles[sid] for sid in sorted(set(profiles)-baseline)},'removedProfiles':removed,
        'garrisonProfiles':sorted(set(profiles)&set(scope['skillIds'])),
        'publicCapabilities':{
            'hpRatioRecovery':{'sourceAttributeType':19,'formula':'max(0,flatRecovery)+currentMaxHp*max(0,ratioRecovery)','consumer':'web/src/simulation/client-programs.js#advance','dispatch':'single recoveryAt cursor, each Buff expiry cut; mode programs share this consumer'},
            'untilDetach':{'sourceLifeTimeType':2,'sourceLifeTime':0,'boundSkillDuration':-1,'consumer':'start/stop/tick','boundary':'Explicit Web opt-in; default parent compiler stays timed-only. Unknown mode graphs still block complete programs.'},
            'noDirectHeal':{'sourceFlag':7,'runtimeFlag':'no_direct_heal','getterRva':'0x4e062f0','consumerRva':'0x4e158a4','boundary':'Source OnTakeHeal checks ignoreHealFree and target isHealFree, no source==target bypass. Existing simulator regeneration is the separate allowed path; arbitrary native override-Heal flags are not newly implemented.'}},
        'evidence':{key:{'path':path,'sha256':hashlib.sha256((ROOT/path).read_bytes()).hexdigest()} for key,path in evidence_paths.items()},
        'remainingFieldGroups':[{'key':key,'skills':sorted(ids),'count':len(ids)} for key,ids in sorted(fields.items(),key=lambda pair:(-len(pair[1]),pair[0]))],
        'remainingBlockers':rejected,
        'frozenEvidence':frozen_receipts(),
        'boundary':'Mode programs remain a separate merged provider. Unknown controls, attributes, flags and action graphs reject the complete program.'}
    return result,report

def build():return build_with_report()[0]

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    result,report=build_with_report();text='// Generated by tools/build_client_programs.py; shared source programs.\nwindow.ArkClientProgramData='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n'
    path=OUTPUT
    if args.check:
        if path.read_text(encoding='utf-8')!=text:raise ValueError('Client program data drift')
    else:
        path.write_text(text,encoding='utf-8')
        (ROOT/'work/client-program-batch-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'skills':len(result['profiles']),'programs':len(result['programs']),'levels':sum(p['levelCount'] for p in result['profiles'].values()),'added':sorted(report['addedProfiles']),'rejected':len(result['rejected'])},ensure_ascii=False))
