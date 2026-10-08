"""Complete two-state ToggleSkill graphs with attached owner attributes.

The frozen closure table supplies serialized schemas, never candidate IDs.
Selected mode actors and every level are checked through the shared compiler.
"""
from copy import deepcopy
from functools import lru_cache
import hashlib
import json

CONTRACT='work/skill-controller-public-closures-20260918.json'
NATIVE_CONTRACT='work/client-logic/native-toggle-skill/evidence.json'
BOUNDARIES=[
    'ToggleSkill serialized on/off mode indices, attached Buffs and level SP/range values are verified source fields.',
    'Native ToggleSkill.DoCast consumes spCost on either transition before switching modes; _SetToggledInternal attaches or detaches the passive ability.',
    'Current simulation mode restoration uses the existing base attack consumer; full base talents/modules and exact native animation phases are separate.',
    'Toggle SP recharge and explicit recast timing are simulation lifecycle mappings; the serialized ordinary affecting-SP flag alone does not establish native toggle recharge timing.',
]


@lru_cache(maxsize=1)
def schemas():
    from skill_mode_compiler import ROOT,C,A
    data=json.loads((ROOT/CONTRACT).read_text(encoding='utf-8'))
    return {kind:next(n['fields'] for n in data['componentDictionary'].values() if n['type']==kind)
            for kind in (C+'ToggleSkill',A+'PassiveBuffAbility')}


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import ROOT,C,A,require,shape,numeric,exactly_one,digest,BOUNDARIES as COMMON_BOUNDARIES
    if not any(r['type']==C+'ToggleSkill' for r in rows):return None
    require(len(rows)==2 and {r['type'] for r in rows}=={C+'ToggleSkill',A+'PassiveBuffAbility'},
            'unsupported-toggle-companions')
    require(all(r.get('node_id') is not None for r in rows) and len({str(r['node_id']) for r in rows})==2,
            'invalid-toggle-component-identities')
    controller=exactly_one(rows,C+'ToggleSkill');body=exactly_one(rows,A+'PassiveBuffAbility')
    cast=controller['fields'];fields=body['fields']
    shape(cast,schemas()[C+'ToggleSkill'],('_beginAnim','_attackBlackboardModeIndex','_rangeIdModeIndex','_switchToMode'),'ToggleSkill')
    index=cast['_switchToMode']
    require(type(index) is int and index>0 and all(type(cast[k]) is int and cast[k]==index
            for k in ('_attackBlackboardModeIndex','_rangeIdModeIndex')),
            'unsupported-toggle-mode-routing')
    require(isinstance(cast['_beginAnim'],str) and cast['_defaultModeIndex']==-1
            and cast['_switchToModeDown']==0 and cast['_downMode']==-1
            and cast['_restartFSM']==0 and cast['_useAbilityHandleToggle']==0,
            'unsupported-toggle-controller')
    shape(fields,schemas()[A+'PassiveBuffAbility'],('_buffs',),'toggle/body')
    owner=cast.get('m_GameObject')
    require(isinstance(owner,dict) and set(owner)=={'m_FileID','m_PathID'} and type(owner['m_FileID']) is int
            and owner['m_FileID']==0 and isinstance(owner['m_PathID'],(str,int)) and not isinstance(owner['m_PathID'],bool)
            and str(owner['m_PathID']).lstrip('-').isdigit() and int(owner['m_PathID'])!=0
            and owner==fields.get('m_GameObject'),'toggle-owner-mismatch')
    levels=skill.get('levels');require(isinstance(levels,list) and levels,'invalid-toggle-levels')
    keys=None
    for lv in levels:
        require(isinstance(lv,dict) and isinstance(lv.get('blackboard'),list),'invalid-toggle-blackboard')
        bb=lv['blackboard']
        require(all(isinstance(b,dict) and isinstance(b.get('key'),str) and b['key'] and numeric(b.get('value'))
                    and b.get('valueStr') in (None,'') for b in bb),'invalid-toggle-blackboard')
        current={b['key'] for b in bb}
        if keys is None:keys=current
        require(current==keys and len(bb)==len(current),'invalid-toggle-blackboard')
        sp=lv.get('spData')
        require(isinstance(sp,dict) and set(sp)=={'spType','levelUpCost','maxChargeTime','spCost','initSp','increment'}
                and sp['spType']=='INCREASE_WITH_TIME' and numeric(sp['spCost']) and sp['spCost']>0
                and sp['maxChargeTime']==1 and numeric(sp['initSp']) and 0<=sp['initSp']<=sp['spCost']
                and numeric(sp['increment']) and sp['increment']==1
                and lv.get('prefabId')==prefab and lv.get('skillType')=='MANUAL' and lv.get('durationType')=='NONE'
                and numeric(lv.get('duration')) and lv['duration']==0
                and isinstance(lv.get('rangeId'),str) and bool(lv['rangeId']),
                'invalid-toggle-level-controller')
    require(isinstance(fields['_buffs'],list) and fields['_buffs'],'empty-toggle-buffs')
    consumed=set();buffs=[]
    for i,raw in enumerate(fields['_buffs']):
        out=c.buff_body(raw,consumed,'toggle/buff/'+str(i))
        require(out['lifetime']=={'kind':'until_detach'} and not out.get('flags')
                and all(m['attribute'] in ('atk','def','block_cnt','hp_recovery_per_sec_by_max_hp_ratio')
                        for m in out['modifiers']),'unsupported-toggle-owner-buff')
        buffs.append(out)
    require(len({b['id'] for b in buffs})==len(buffs) and any(b['modifiers'] for b in buffs),
            'invalid-toggle-buff-identities')
    character=c.character(char_id);mode=c.mode(character,index)
    action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
    require(action=='attack' and actor['type']==A+'MeleeAttack' and not plan.get('hitBuffs')
            and not plan.get('delivery'),'unsupported-toggle-mode-body')
    require(consumed==keys,'unconsumed-toggle-blackboard',sid,dict(source=sorted(keys),consumed=sorted(consumed)))
    for lv in levels:
        bb={b['key']:b['value'] for b in lv['blackboard']}
        for b in buffs:
            for m in b['modifiers']:
                e=m['value'];v=e.get('constant',bb.get(e.get('key')))
                require(numeric(v) and (m['formula']!='final_scaler' or v>=-1),'invalid-toggle-owner-value')
                if m['attribute']=='hp_recovery_per_sec_by_max_hp_ratio':require(v>=0,'negative-toggle-recovery')
                if m['attribute']=='block_cnt':require(int(v)==v and v>=0,'invalid-toggle-block-count')
        get=lambda e:e if numeric(e) else e.get('constant',bb.get(e.get('key')))
        require(numeric(get(plan['targets'])) and int(get(plan['targets']))==get(plan['targets']) and 1<=get(plan['targets'])<=64
                and numeric(get(plan['hits'])) and int(get(plan['hits']))==get(plan['hits']) and 1<=get(plan['hits'])<=32
                and numeric(get(plan['scale'])) and get(plan['scale'])>0,'invalid-toggle-level-attack')
    native=json.loads((ROOT/NATIVE_CONTRACT).read_text(encoding='utf-8'))
    methods={m['method']:m for m in native['methods'] if m['type']==C+'ToggleSkill'}
    require({'DoCast','_SetToggledInternal','_DoSwitchMode','IsAvailable','UseSkill','OnTick'}<=set(methods),
            'missing-native-toggle-contract')
    native_paths=[NATIVE_CONTRACT]+['work/client-logic/native-toggle-skill/'+m['file'] for m in methods.values()]
    native_sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in native_paths}
    source=dict(graphSha256=digest(rows),sourceLevelsSha256=digest(levels),modeGraphSha256=digest(mode),prefabId=prefab,
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        characterPathId=character['characterPathId'],modePathId=mode['pathId'],bundleSha256=character['bundleSha256'],
        controller=deepcopy(cast),attackNode=actor['node_id'],selectorNode=selector['node_id'],
        sourceVersion=c.evidence.manifest['source_version'],closureContract=CONTRACT,
        nativeSources=native_sources,nativeBinarySha256=native['binarySha256'],
        evidenceLevels=dict(serializedGraph='Verified',currentSimulationMapping='Inferred',nativeFrameEquivalence='unverified'),
        model_boundaries=COMMON_BOUNDARIES+BOUNDARIES)
    toggle=dict(onModeIndex=index,offModeIndex=0,restartFSM=False,useAbilityHandleToggle=False)
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),
        capability='toggle-skill',activation='toggle',modeIndex=index,modeBuffIndex=None,
        lifetime={'kind':'until_toggle'},action=action,plan=plan,selector=selection,disarmed=False,channeling=None,source=source)
    program=dict(controller=dict(kind='toggle_skill',activation='toggle',duration_policy='until_toggle',pre_delay=0,
        wait_for_casting=False,wait_for_attack_event=False,allow_no_target=True,sp_recovery_while_active=False,toggle=toggle),
        buffs=buffs,source=source)
    return profile,program
