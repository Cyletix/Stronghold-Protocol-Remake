"""Closed replacement main actor + once-per-spell selector-triggered extra heal.

Prove the group, listener, alias and complete extra leaf before projecting the
main actor into the existing replacement compiler. No skill-ID dispatch.
"""
from copy import deepcopy
import json
from next_attack_compiler import (P,NULL,CONTROLLERS,CONTROLLER_FIXED,ATTACK_FIXED,
    ATTACK_VARIABLE,SELECTOR_FIXED,RANGE,TRIGGER,EFFECT,EFFECT_FIELDS,body,contract,
    require,finite,digest,zeros)
from next_attack_hit_buffs import BUFF_FIXED,N,FINISH

GROUP=P+'Abilities.AbilityParallelGroup'
LISTENER=P+'Skills.BuffDuringSkill'
HEAL=P+'Abilities.Heal'
MELEE=P+'Abilities.MeleeAttack'
SELECTOR=P+'AdvancedSelector'

def compile_compound(sid,rows,levels,char_ids,projectiles,buff_compiler):
    require(rows and len({r['node_id'] for r in rows})==len(rows),'compound-graph','missing/duplicate nodes')
    typed={t:[r for r in rows if r['type']==t] for t in {r['type'] for r in rows}}
    allowed=CONTROLLERS|{GROUP,LISTENER,HEAL,MELEE,SELECTOR,RANGE,TRIGGER,EFFECT}
    require(not set(typed)-allowed,'compound-companions',','.join(sorted(set(typed)-allowed)))
    def one(t):
        require(len(typed.get(t,[]))==1,'compound-graph','one '+t)
        return typed[t][0]
    controllers=[r for r in rows if r['type'] in CONTROLLERS]
    require(len(controllers)==1,'compound-graph','one controller');controller=controllers[0]
    group,listener,heal,attack,selector,ran,trig=map(one,[GROUP,LISTENER,HEAL,MELEE,SELECTOR,RANGE,TRIGGER])
    for r in rows:body(r)
    ref=lambda r:{'m_FileID':0,'m_PathID':r['node_id']}
    owner=lambda r:r['fields']['m_GameObject']
    require(owner(group)==owner(controller)==owner(listener),'compound-owner','root group/listener')
    contract(body(group),zeros('''_interruptAbilityOnDetach _ignoreIfOwnerDead _forceAsDmgOrHealAbility
        _alsoInterruptSubAbilities _useEscaptime _alsoCheckChildrenAffecting _finishAllAbilitiesIfOneFinish''',
        _selector=NULL,_metadata={'namedAsAlias':'','blackboardPrefix':''},_attachPassiveBuffsOnDummy=1,
        _abilities=[ref(attack)],_mainAbility=NULL,_timeMode=1),label='parallel main actor')
    cf=dict(CONTROLLER_FIXED,_extraAbilities=[ref(heal)],_cancelIfSearchTargetFailed=1,_rangeToShow=ref(selector))
    contract(body(controller),cf,label='compound controller')
    contract(body(listener),{}, {'_buffs'},'skill listener')
    buffs=body(listener)['_buffs'];require(len(buffs)==1,'compound-listener','one once-spell listener')
    buff=buffs[0];bf=dict(BUFF_FIXED,durationKey='',triggerLifeType=0,triggerCnt=0,triggerInterval=-1,firstTriggerInterval=-1)
    bf.pop('blackboard')
    contract(buff,bf,{'buffKey','templateKey','blackboard'},'listener Buff')
    require(isinstance(buff['buffKey'],str) and buff['buffKey'],'compound-listener','Buff identity')
    alias=body(heal)['_metadata'];require(set(alias)=={'namedAsAlias','blackboardPrefix'} and
        isinstance(alias['namedAsAlias'],str) and alias['namedAsAlias'] and alias['blackboardPrefix']=='',
        'compound-alias','one named extra ability')
    require(buff['blackboard']==[dict(key='ability_name',value=0,valueStr=alias['namedAsAlias'])],
        'compound-alias','listener names the registered extra leaf')
    template=buff_compiler.templates.get(buff['templateKey']);require(isinstance(template,dict),'compound-listener','missing template')
    contract(template,dict(templateKey=buff['templateKey'],effectKey='',onEventPriority=0),{'eventToActions'},'spell template')
    events=template['eventToActions'];require(set(events)=={'_items'} and len(events['_items'])==1,'compound-listener','one event')
    event=events['_items'][0];require(set(event)=={'key','value'} and event['key']==18,'compound-listener','ON_ABILITY_SPELL_ON')
    actions=[dict(_sourceType='SOURCE',_targetType='SOURCE',_abilityName='',_excludeTarget=False,
        _excludeTargetType='TARGET',_checkCanUseAbilityFlag=False,_returnFalseIfNoTarget=False,
        **{'$type':N+'TriggerAbilityUseSelector'}),{'$type':N+'AlwaysNext'},FINISH]
    contract(event['value'],dict(SerializedObjectReferences=[],decodedActions=actions),{'SerializedState'},'spell actions')
    require(json.loads(event['value']['SerializedState'])==actions,'compound-listener','serialized/decoded disagreement')
    # FROM_INPUT receives the selector result through TriggerAbilityUseSelector;
    # empty animation/timeMode2 is an event-driven extra, not a second active cast.
    hf=dict(ATTACK_FIXED)
    for key in ('_elementDamageType','_epDamageRatio','_useDynamicAttackType','_deliveryParaWhenReplaceActionNode','_extraDamageType','_atkScale','_attackType'):hf.pop(key)
    hf.update(_selector=ref(selector),_metadata=alias,_interruptAbilityOnDetach=0,_selectTargetTiming=0,_selectTargetSource=2,
        _timeMode=2,_alwaysIncludeTarget=1,_allowNoTarget=0,_animKey='',_endAnimKey='',_downAnimKey='',_downEndAnimKey='',
        _upAnimKey='',_upEndAnimKey='',_faceToTarget=0,_maxAnimScale=-1,
        **zeros('_isCont _isHpRatio _hasNoActionNode _ignoreHealFree _applyEPHeal _applyHealScaleToEPHealScale'))
    contract(body(heal),hf,{'_preDelay'},'event heal leaf')
    require(finite(body(heal)['_preDelay']) and body(heal)['_preDelay']>=0,'compound-heal','invalid source preDelay')
    sf=dict(SELECTOR_FIXED,_targetSide=1,_targetMotion=3,_postFilter=3,_abnormalFlag=20,_abnormalCombo=1,
        _limitTargetNum=1,_maxTargetKey='max_target',_maxNum=1)
    contract(body(selector),sf,label='extra heal selector')
    require(owner(selector)==owner(ran)==owner(trig),'compound-owner','selector/range/trigger')
    contract(body(ran),{'_extendable':0},label='heal range')
    contract(body(trig),dict(_keepTarget=0,_minTargetNum=1,_overrideSearchTargetTick=-1),label='heal trigger')
    for visual in typed.get(EFFECT,[]):
        require(owner(visual) in (owner(heal),owner(attack)),'compound-owner','visual not owned by admitted leaf')
        contract(body(visual),{},EFFECT_FIELDS,'leaf visual')
    require(levels and all(lv.get('rangeId') and sum(b['key']=='heal_scale' for b in lv['blackboard'])==1 and
        all(b.get('valueStr') in (None,'') for b in lv['blackboard']) and
        all(finite(b['value']) and b['value']>0 for b in lv['blackboard'] if b['key']=='heal_scale') for lv in levels),
        'compound-heal','complete positive heal scale and explicit source range per level')
    projected=deepcopy([controller,attack]+[r for r in typed.get(EFFECT,[]) if owner(r)==owner(attack)])
    projected[0]['fields'].update(deepcopy(CONTROLLER_FIXED));projected[0]['fields']['m_GameObject']=deepcopy(owner(attack))
    attack_levels=deepcopy(levels)
    for lv in attack_levels:lv['blackboard']=[b for b in lv['blackboard'] if b['key']!='heal_scale']
    from next_attack_compiler import compile_replacement
    result=compile_replacement(sid,projected,attack_levels,char_ids,projectiles,buff_compiler)
    result.update(blackboardKeys=sorted(result['blackboardKeys']+['heal_scale']),
        spellExtras=[dict(kind='heal',event='ON_ABILITY_SPELL_ON',once=True,scaleKey='heal_scale',targetCount=1,
            range='skill',selector='lowest-hp-ratio',includeOwner=True,alias=alias['namedAsAlias'])])
    result['source'].update(graphSha256=digest(rows),componentIds=[r['node_id'] for r in rows],sourceLevelsSha256=digest(levels),
        compound=dict(groupNode=group['node_id'],listenerNode=listener['node_id'],healNode=heal['node_id'],
            templateKey=buff['templateKey'],templateSha256=digest(template)),
        compoundBoundary='Serialized group/listener/alias/event facts. Extra heal at main spell emission once, before body damage, uses live noncritical owner ATK and current wounded-ally selector. Native listener recursion/finish order and Heal event bridge are not proven; ordinary replacement animation timing remains the existing model.')
    return result
