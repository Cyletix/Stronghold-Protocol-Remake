"""Join strict maintained-aura graphs to the existing skill-mode provider."""
from copy import deepcopy
import json

AURA_BOUNDARIES=[
    'Finite CastSkill wrappers and AttachOrDetachSkill hold their attached Aura until source skill expiry/interruption; native coroutine frame phase is not claimed.',
    'Owner Buffs with until-detach source lifetime are capped by the containing finite Aura controller. Target membership and source-owned withdrawal are handled by the shared maintained-aura consumer.',
    'Mode waitForAttackEvent 0/1 follows the existing simulation attack cadence; the serialized event policy is retained. Healing mount-point enums are presentation metadata under the existing immediate-heal model.',
    'Native priority is RoundToInt(1000*sum(abs(blackboard[priorityKey]))). Higher-priority selection, exact source identity for independent instances and protected DEFAULT override dispatch retain the shared simulation convention; readable override-key pieces are retained in the bounded native contract.',
]


def compile_aura(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import ROOT,A,Rejected,require,numeric,digest,BOUNDARIES
    from skill_aura_compiler import AuraCompiler
    if not hasattr(c,'auras'):
        database=json.loads((ROOT/'data/ArknightsGameData/zh_CN/gamedata/buff_table.json').read_text(encoding='utf-8-sig'))
        c.auras=AuraCompiler(c,database)
    levels=skill['levels'];ir=c.auras.compile(rows,levels);control=ir['controller'];consumed=set(ir['consumedKeys'])
    require(all(not b['effects'] for b in ir['ownerBuffs']),'unsupported-aura-owner-actions')
    require(bool(ir['ownerBuffs']),'aura-without-owner-lifetime-anchor')
    character=c.character(char_id);mode=actor=selector=None;index=None
    if ir['mode']:
        index=ir['mode']['index'];mode=c.mode(character,index)
        require(control['attackBlackboardModeIndex'] in (-1,index) and control['rangeIdModeIndex'] in (-1,index),
                'aura-other-mode-parameter-owner')
        action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
    else:
        require(control['attackBlackboardModeIndex']==control['rangeIdModeIndex']==-1,
                'non-mode-aura-parameter-routing')
        action='inherit';plan=None;selection=None
    keys={b['key'] for b in levels[0]['blackboard']}
    require(keys==consumed,'unconsumed-aura-blackboard',sid,dict(source=sorted(keys),consumed=sorted(consumed)))
    # Report missing semantic parameters before downstream delivery gaps, while
    # still refusing every unimplemented effect in an otherwise closed graph.
    require(all(not b['effects'] for b in ir['buffs']),'unsupported-aura-target-actions')
    require(actor is None or actor['type'] in (A+'MeleeAttack',A+'MultiMeleeAttack',A+'RangedHeal'),
            'unsupported-aura-projectile-delivery')
    require(not any(k.startswith('attack@') for k in consumed) or control['attackBlackboardModeIndex']==index,
            'aura-attack-blackboard-owner-mismatch')
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']};sp=level['spData']
        require(set(bb)==keys and len(bb)==len(level['blackboard']) and all(numeric(v) for v in bb.values()),
                'changed-aura-blackboard')
        require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO') and level['durationType']=='NONE'
                and numeric(level['duration']) and level['duration']>0 and sp['spType'] in
                ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE') and sp['spCost']>0,
                'unsupported-aura-level-controller')
        require(level['rangeId'] is None or index is not None and control['rangeIdModeIndex']==index,
                'aura-range-mode-binding-mismatch')
        if plan:
            get=lambda v:bb[v['key']] if isinstance(v,dict) and 'key' in v else v['constant'] if isinstance(v,dict) else v
            require(numeric(get(plan['targets'])) and 1<=get(plan['targets'])<=64 and int(get(plan['targets']))==get(plan['targets'])
                    and numeric(get(plan['hits'])) and 1<=get(plan['hits'])<=32 and int(get(plan['hits']))==get(plan['hits'])
                    and get(plan['scale'])>0,'invalid-aura-mode-plan')
    buffs=[];mode_buff_index=None
    for i,b in enumerate(ir['ownerBuffs']):
        stacking=b['stacking']
        require(stacking['maxStacks']==1 and not stacking['independentSource'] and not stacking['disableOverride']
                and not stacking['priorityKeys'] and stacking['overrideKey']==b['id'],
                'unsupported-aura-owner-stacking')
        require(all(m['attribute'] in ('atk','def','magic_resistance','attack_speed') for m in b['modifiers']),
                'unsupported-aura-owner-modifier')
        buffs.append(dict(id=b['id'],scope='self',lifetime={'kind':'timed','duration':{'key':'duration'}},
            stacking={'max_stacks':1},modifiers=deepcopy(b['modifiers']),
            source={**b['source'],'originalLifetime':b['lifetime'],'cappedByFiniteController':True}))
        if b['mode']:mode_buff_index=i
    source=dict(graphSha256=digest(rows),modeGraphSha256=digest(mode) if mode else None,prefabId=prefab,
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        characterPathId=character['characterPathId'],modePathId=mode['pathId'] if mode else None,
        bundle=character['bundle'],bundleSha256=character['bundleSha256'],sourceLevelsSha256=digest(levels),
        attackNode=actor['node_id'] if actor else None,selectorNode=selector['node_id'] if selector else None,
        controller=deepcopy(control),
        actorPresentation=dict(waitForAttackEvent=actor['fields'].get('_waitForAttackEvent'),
            preDelay=actor['fields'].get('_preDelay'),mountPointType=actor['fields'].get('_mountPointType')) if actor else None,
        sourceVersion=c.evidence.manifest['source_version'],
        nativeAuraContract='work/client-logic/native-aura-overrides/contract.json',
        evidenceLevels=dict(serializedGraph='Verified',levelToGraph='cross-snapshot inference',nativeFrameEquivalence='unverified'),
        model_boundaries=BOUNDARIES+AURA_BOUNDARIES)
    controller=dict(kind='attach_or_detach_skill_auras' if control['kind']=='attach-or-detach' else 'cast_skill_active_buffs',
        activation='cast',duration_policy='max_buff_duration',source_aura_controller=control['kind'],
        allow_no_target=True,sp_recovery_while_active=False,pre_delay=0,wait_for_casting=False,
        wait_for_attack_event=control.get('wrapperWaitForAttackEvent',False),
        interrupt_on_detach=control.get('wrapperInterruptOnDetach',True))
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),
        activation='cast',capability='maintained-aura',modeIndex=index,modeBuffIndex=mode_buff_index,
        lifetime={'kind':'timed','duration':{'key':'duration'}},action=action,plan=plan,selector=selection,
        disarmed=False,channeling=control.get('channel'),source=source)
    aura={k:deepcopy(ir[k]) for k in ('kind','range','selection','buffs','membership','sourceGraphSha256')}
    return profile,dict(controller=controller,buffs=buffs,auras=[aura],source=source)
