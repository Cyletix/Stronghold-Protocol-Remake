"""Discover and compile complete timed mode contracts within the garrison scope."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from garrison_skill_scope import load_scope
from skill_mode_compiler import ModeCompiler, Rejected, BOUNDARIES, digest
from compile_client_modes import ModeCompileError

ROOT=Path(__file__).resolve().parents[1]
CONTRACT='work/operator-mode-next-group.json'
REPORT='work/skill-mode-batch-report.json'


def build():
    paths=[CONTRACT,'work/client-logic/program-compilation.json','work/client-logic/buff-templates.json',
           'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json']
    reference,graphs,templates,skills=[json.loads((ROOT/path).read_text(encoding='utf-8')) for path in paths]
    scope=load_scope();compiler=ModeCompiler(reference,graphs,templates)
    owners={sid:[row['charId'] for row in scope['identities'] if sid in row['skillIds']] for sid in scope['skillIds']}
    profiles,programs,accepted,rejections={},{},{},{}
    for sid in scope['skillIds']:
        skill=skills[sid];prefabs={level['prefabId'] for level in skill['levels']}
        try:
            if len(prefabs)!=1 or not next(iter(prefabs)):
                raise Rejected('missing-or-changing-level-prefab',sid,sorted(str(p) for p in prefabs))
            if len(owners[sid])!=1:
                raise Rejected('shared-skill-has-multiple-mode-owners',sid,owners[sid])
            prefab=next(iter(prefabs))
            profile,program=compiler.compile(sid,skill,owners[sid][0],prefab)
            profiles[sid]=profile;programs[prefab]=program
            accepted[sid]=dict(charIds=owners[sid],fixed=any(cid in scope['fixedCharIds'] for cid in owners[sid]),
                               action=profile['action'],lifetime=profile['lifetime']['kind'],
                               source=profile['source'],levelCount=profile['levelCount'])
        except Rejected as error:
            rejections[sid]=dict(charIds=owners[sid],prefabIds=sorted(str(p) for p in prefabs),**error.record)
        except ModeCompileError as error:
            rejections[sid]=dict(charIds=owners[sid],prefabIds=sorted(str(p) for p in prefabs),
                                 reason='unresolved-character-mode-reference',path='character/modes',actual=str(error))
    sources={path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in paths}
    sources.update(scope['sources'])
    for path in ['tools/build_skill_mode_data.py','tools/skill_mode_compiler.py','tools/garrison_skill_scope.py',
                 'tools/next_attack_compiler.py','tools/enemy_chain_projectiles.py','tools/enemy_hit_sequences.py',
                 'tools/skill_mode_hit_buffs.py','tools/next_attack_hit_buffs.py','tools/direct_skill_compiler.py',
                 'tools/operator_chain_projectiles.py','data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json',
                 'tools/skill_mode_appear.py','work/skill-mode-appear-contract.json',
                 'tools/skill_mode_aura.py','tools/skill_aura_compiler.py',
                 'tools/skill_mode_ammo.py','work/skill-ammo-controller-contract.json',
                 'tools/skill_mode_blockees.py','tools/skill_mode_self_buffs.py','tools/skill_mode_end_effects.py',
                 'tools/skill_mode_passive.py','work/skill-passive-source-contract.json','tools/skill_mode_flow.py',
                 'tools/skill_mode_flow_warmup.py','work/client-logic/native-enemy-block/evidence.json',
                 'work/client-logic/native-block-target-limit/contract.json','tools/skill_mode_toggle.py','work/skill-controller-public-closures-20260918.json',
                 'work/client-logic/native-toggle-skill/evidence.json',
                 'work/client-logic/native-toggle-skill/IsAvailable.asm','work/client-logic/native-toggle-skill/DoCast.asm',
                 'work/client-logic/native-toggle-skill/UseSkill.asm','work/client-logic/native-toggle-skill/OnTick.asm',
                 'work/client-logic/native-toggle-skill/_SetToggledInternal.asm','work/client-logic/native-toggle-skill/_DoSwitchMode.asm',
                 'work/client-logic/native-enemy-bomb/evidence.json',
                 'work/client-logic/native-enemy-bomb/77537_SetData.asm','work/client-logic/native-enemy-bomb/77538_OnEvent.asm',
                 'work/client-logic/native-enemy-bomb/77541_OnTick.asm','work/client-logic/native-enemy-bomb/77542_OnStopAffect.asm',
                 'work/client-logic/native-enemy-skill-sp/Torappu.Battle.AbilityStandard_Event-enum.json',
                 'work/client-logic/native-ammo-controller/contract.json','work/client-logic/skill-ammo-target-enums.json',
                 'work/client-logic/native-ammo-selector/contract.json',
                 'work/client-logic/native-aura-overrides/contract.json',
                 'work/client-logic/native-deployment-buffs/contract.json',
                 'data/ArknightsGameData/zh_CN/gamedata/buff_table.json','work/client-logic/native-buff-refresh/contract.json',
                 'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json','work/client-logic/script-types.json',
                 'work/client-logic/skill-target-timing-enum.json',
                 'work/client-logic/selector-post-filter-enum.json',
                 'work/client-logic/native-enemy-hit-sequence/evidence.json',
                 'work/client-logic/native-skill-modes/evidence.json',
                 'work/client-logic/native-skill-modes/Action.Nodes.SwitchMode.Execute.2646d88.asm']:
        sources[path]=hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    from skill_mode_flow import TIMING_SOURCES
    for path in TIMING_SOURCES:sources[path]=hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    sources['client-logic-database']=compiler.evidence.manifest['database']['sha256']
    prior={row['skillId'] for row in reference['rows']}
    report=dict(schemaVersion=1,rule='garrison-complete-timed-mode-contracts-v2',sources=sources,
                scope=dict(charIds=scope['charIds'],fixedCharIds=scope['fixedCharIds'],skillIds=scope['skillIds']),
                counts=dict(scannedSkills=len(scope['skillIds']),acceptedSkills=len(profiles),
                    acceptedFixedSkills=sum(row['fixed'] for row in accepted.values()),
                    acceptedSourceLevels=sum(row['levelCount'] for row in accepted.values()),
                    acceptedByAction=dict(Counter(row['action'] for row in accepted.values())),
                    acceptedByLifetime=dict(Counter(row['lifetime'] for row in accepted.values())),
                    addedModeProviderSkills=len(set(profiles)-prior),priorReviewedPreserved=len(set(profiles)&prior),
                    rejectedSkills=len(rejections)),
                accepted=accepted,rejections=rejections,
                rejectionCounts=dict(Counter(row['reason'] for row in rejections.values())),
                boundary=BOUNDARIES)
    data=dict(version=2,sourceFingerprint=digest(sources),profiles=profiles,programs=programs,
              sources=sources,boundary=BOUNDARIES)
    return data,report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--preview',action='store_true',help='Compile and print counts/rejections without writing')
    args=parser.parse_args();data,report=build()
    if args.preview:
        print(json.dumps(dict(counts=report['counts'],accepted=list(data['profiles']),
                              rejectionCounts=report['rejectionCounts']),ensure_ascii=False));return
    # This is a regression guard, never a candidate allowlist.
    old=json.loads((ROOT/CONTRACT).read_text(encoding='utf-8'))
    prior={row['skillId'] for row in old['rows']}
    previous=ROOT/'web/skill_mode_data.js'
    if previous.is_file():
        prior.update(json.loads(previous.read_text(encoding='utf-8').split('window.ArkSkillModeData=',1)[1].rsplit(';',1)[0])['profiles'])
    missing=prior-data['profiles'].keys()
    if missing:
        raise ValueError('Previously reviewed mode contracts rejected: '+json.dumps({sid:report['rejections'][sid] for sid in sorted(missing)}))
    outputs={'web/skill_mode_data.js':'// Generated by tools/build_skill_mode_data.py; garrison source timed modes.\nwindow.ArkSkillModeData='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',
             REPORT:json.dumps(report,ensure_ascii=False,indent=2)+'\n'}
    for path,content in outputs.items():
        target=ROOT/path
        if args.check:
            if not target.is_file() or target.read_text(encoding='utf-8')!=content:raise ValueError('Skill mode data drift: '+path)
        else:target.write_text(content,encoding='utf-8')
    print(json.dumps(report['counts'],ensure_ascii=False))


if __name__=='__main__':main()
