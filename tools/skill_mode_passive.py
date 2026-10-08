"""Whole PassiveSkill graphs, with permanent owner or finite on-hit Buffs."""
from copy import deepcopy
import json


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import C,A,ROOT,require,shape,numeric,exactly_one,digest,BOUNDARIES
    if not any(r['type']==C+'PassiveSkill' for r in rows):return None
    contract=json.loads((ROOT/'work/skill-passive-source-contract.json').read_text(encoding='utf-8'))
    prototypes={}
    for member in contract['members'].values():
        for node in member['components']:prototypes.setdefault(node['type'],node['fields'])
    require(len(rows)==2 and {r['type'] for r in rows}<={C+'PassiveSkill',A+'PassiveBuffAbility',A+'PassiveAttachmentAbility'},
            'unsupported-passive-companions')
    require(all(r.get('node_id') is not None for r in rows) and len({str(r['node_id']) for r in rows})==2,
            'invalid-passive-component-identities')
    controller=exactly_one(rows,C+'PassiveSkill');body=next(r for r in rows if r is not controller)
    cast=controller['fields'];fields=body['fields'];kind=body['type']
    require(kind in (A+'PassiveBuffAbility',A+'PassiveAttachmentAbility'),'unsupported-passive-body')
    shape(cast,prototypes[C+'PassiveSkill'],('_defaultModeIndex','_attackBlackboardModeIndex','_rangeIdModeIndex'),'PassiveSkill')
    require(all(type(cast[k]) is int for k in ('_defaultModeIndex','_attackBlackboardModeIndex','_rangeIdModeIndex'))
            and cast['_defaultModeIndex']>=-1 and cast['_attackBlackboardModeIndex']==cast['_rangeIdModeIndex']==cast['_defaultModeIndex'],
            'unsupported-passive-mode-routing')
    owner=cast.get('m_GameObject')
    require(isinstance(owner,dict) and set(owner)=={'m_FileID','m_PathID'} and type(owner['m_FileID']) is int
            and owner['m_FileID']==0 and isinstance(owner['m_PathID'],(str,int)) and not isinstance(owner['m_PathID'],bool)
            and str(owner['m_PathID']).lstrip('-').isdigit() and int(owner['m_PathID'])!=0
            and owner==fields.get('m_GameObject'),'passive-owner-mismatch')
    shape(fields,prototypes[kind],('_buffs','_additiveActiveBuffs') if kind.endswith('AttachmentAbility') else ('_buffs',),'passive/body')
    levels=skill.get('levels')
    require(isinstance(levels,list) and levels,'invalid-passive-levels')
    for lv in levels:
        require(isinstance(lv,dict) and isinstance(lv.get('blackboard'),list),'invalid-passive-blackboard')
        require(all(isinstance(b,dict) and isinstance(b.get('key'),str) and b['key'] and numeric(b.get('value'))
                    and b.get('valueStr') in (None,'') for b in lv['blackboard']),'invalid-passive-blackboard')
        sp=lv.get('spData')
        require(isinstance(sp,dict) and set(sp)=={'spType','levelUpCost','maxChargeTime','spCost','initSp','increment'}
                and type(sp['spType']) is int and sp['spType']==8
                and all(numeric(sp[k]) and sp[k]==0 for k in ('spCost','initSp','maxChargeTime','increment'))
                and lv.get('prefabId')==prefab and lv.get('skillType')=='PASSIVE' and lv.get('durationType')=='NONE'
                and lv.get('rangeId') is None and numeric(lv.get('duration')) and lv['duration'] in (-1,0),
                'invalid-passive-level-controller')
    keys={b['key'] for b in levels[0]['blackboard']};consumed=set()
    owner_buffs=[];plan=None;selection=None;mode=None;actor=None;selector=None;character=None
    if kind==A+'PassiveBuffAbility':
        require(bool(fields['_buffs']),'empty-passive-owner-body')
        for index,raw in enumerate(fields['_buffs']):
            out=c.buff_body(raw,consumed,'passive/buff/'+str(index))
            require(out['lifetime']=={'kind':'until_detach'} and not out.get('flags') and
                    out['modifiers'] and all(m['attribute'] in ('atk','def') for m in out['modifiers']),
                    'unsupported-passive-owner-lifetime-or-attribute')
            owner_buffs.append(out)
        require(len({b['id'] for b in owner_buffs})==len(owner_buffs),'duplicate-passive-owner-buff')
    else:
        require(not fields['_buffs'] and bool(fields['_additiveActiveBuffs']),'unsupported-passive-attachment-body')
    mode_index=cast['_defaultModeIndex'] if cast['_defaultModeIndex']>=0 else None
    action='inherit'
    if mode_index is not None:
        character=c.character(char_id);mode=c.mode(character,mode_index)
        action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
        require(action=='attack' and actor['type']==A+'MeleeAttack' and not plan.get('hitBuffs'),
                'unsupported-passive-attack-combination')
    if kind==A+'PassiveAttachmentAbility':
        require(plan is not None and mode_index is not None,'passive-attachment-without-source-mode')
        try:plan['hitBuffs']=c.hit_buffs.compile(fields['_additiveActiveBuffs'],levels,False,consumed,namespace='')
        except Exception as e:
            if hasattr(e,'category'):require(False,'unsupported-passive-hit-buff',sid,str(e))
            raise
    require(consumed==keys,'unconsumed-passive-blackboard',sid,dict(source=sorted(keys),consumed=sorted(consumed)))
    for lv in levels:
        bb={b['key']:b['value'] for b in lv['blackboard']}
        require(set(bb)==keys and len(bb)==len(lv['blackboard']) and all(numeric(v) for v in bb.values()),'invalid-passive-blackboard')
        for b in owner_buffs:
            for m in b['modifiers']:
                value=m['value'];v=value.get('constant',bb.get(value.get('key')))
                require(numeric(v) and (m['formula']!='final_scaler' or v>=-1),'invalid-passive-owner-value')
    source=dict(graphSha256=digest(rows),sourceLevelsSha256=digest(levels),prefabId=prefab,
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        controller=deepcopy(cast),modeGraphSha256=digest(mode) if mode else None,
        characterPathId=character['characterPathId'] if character else None,
        bundleSha256=character['bundleSha256'] if character else None,
        model_boundaries=BOUNDARIES+contract['boundaries'],passiveContract='work/skill-passive-source-contract.json')
    control=dict(kind='passive_skill',activation='passive',duration_policy='until_detach',pre_delay=0,
        attach_in_dummy=True,emit_skill_started=False,wait_for_casting=False,wait_for_attack_event=False)
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),
        capability='passive-skill',activation='passive',modeIndex=mode_index,modeBuffIndex=None,
        lifetime={'kind':'until_detach'},action=action,plan=plan,selector=selection,disarmed=False,channeling=None,source=source)
    return profile,dict(controller=control,buffs=owner_buffs,source=source)
