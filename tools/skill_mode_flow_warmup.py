"""Whole owner-animation -> finite-mode flows, with cast-owned persistent Buffs.

Admission is by complete graph/actions, never skill identity. The source
animation has no attack event: animation-finish scheduling is an explicitly
inferred bridge, not a claim about recovered native coroutine frames.
"""
from copy import deepcopy
import json

ENUM_SOURCE='work/client-logic/native-enemy-block/evidence.json'
BOUNDARIES=[
    'The complete owner-animation, casting companion, two-child sequence, mode Buff and nested create/finish actions are serialized source facts. Animation-finish advancement uses the exact cached animation duration as an inferred simulation bridge; this animation has no OnAttack event and native event fallback/within-frame ordering is not newly proved.',
    'The casting companion creates a separate indefinite owner attribute Buff at warmup entry. It survives the casting immunity companion and is removed by the final mode Buff finish action, not by warmup completion. Recovery and attributes therefore begin during warmup.',
    'Casting immunity covers STUNNED, FROZEN and SILENCED only, according to cached native enum values 0,16,12. It ends with the warmup. LEVITATE is value 25 and is not admitted as an immunity.',
    'Source final mode finish restores the base mode, applies owner stun, then removes the persistent attribute Buff. Live final-stage completion/interruption maps to the existing once-only owner status consumer; death/removal discards all attached state and no end status survives redeployment. This cancellation/destruction ordering is an inferred simulation boundary.',
    'Face-front actions affect character animation presentation; this closed family has no skill range override and retains its logical direction and fully compiled mode selector. No gameplay range rotation is inferred from animator face-front.',
]


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import A,C,ROOT,require,shape,clean,numeric,exactly_one,digest,BOUNDARIES as COMMON
    from skill_mode_flow import sequence,ANIMATIONS
    from skill_mode_self_buffs import exact,events
    from skill_mode_end_effects import status
    from next_attack_hit_buffs import BUFF_FIXED,ATTRS
    kinds={r['type'] for r in rows}
    if not {A+'AnimatedActionToOwnerAbility',A+'BuffDuringCasting',A+'AbilitySequenceGroup'}<=kinds:return None
    allowed={C+'CastSkill',A+'AnimatedActionToOwnerAbility',A+'BuffDuringCasting',A+'AbilitySequenceGroup',A+'ActiveBuffAbility',A+'UberEffectEmitter'}
    require(kinds==allowed and len(rows)==len(allowed),'unsupported-warmup-companions')
    require(all(isinstance(r.get('node_id'),str) and r['node_id'] for r in rows)
            and len({r['node_id'] for r in rows})==len(rows),'invalid-warmup-identities')
    get=lambda suffix:exactly_one(rows,(C if suffix=='CastSkill' else A)+suffix)
    castrow,group,actor,active,companion,visual=[get(k) for k in ('CastSkill','AbilitySequenceGroup','AnimatedActionToOwnerAbility','ActiveBuffAbility','BuffDuringCasting','UberEffectEmitter')]
    for row in rows:
        owner=row['fields'].get('m_GameObject')
        require(isinstance(owner,dict) and set(owner)=={'m_FileID','m_PathID'} and owner['m_FileID']==0
                and isinstance(owner['m_PathID'],str) and owner['m_PathID']!='0','invalid-warmup-owner')
    require(castrow['fields']['m_GameObject']==group['fields']['m_GameObject']
            and companion['fields']['m_GameObject']==visual['fields']['m_GameObject']==actor['fields']['m_GameObject']
            and len({r['fields']['m_GameObject']['m_PathID'] for r in (group,actor,active)})==3,'warmup-companion-owner-mismatch')
    control=deepcopy(group['fields'])
    require(control.get('_alwaysNext')==1 and control.get('_ignoreIfOwnerDead')==1,'unsupported-warmup-control')
    control['_alwaysNext']=control['_ignoreIfOwnerDead']=0
    sequence(control)
    require(control['_abilities']==[{'m_FileID':0,'m_PathID':r['node_id']} for r in (actor,active)],'warmup-child-order')
    f=actor['fields'];null={'m_FileID':0,'m_PathID':'0'}
    fixed=dict(m_Enabled=1,_selector=null,_metadata={'namedAsAlias':'','blackboardPrefix':''},
        _interruptAbilityOnDetach=0,_attachPassiveBuffsOnDummy=1,_ignoreIfOwnerDead=0,_forceAsDmgOrHealAbility=0,
        _waitForAttackEvent=1,_interuptIfTargetDead=0,_resetCdStrategy=1,_selectTargetSource=1,_selectTargetTiming=0,
        _timeMode=1,_alwaysIncludeTarget=0,_allowNoTarget=1,_endAnimKey='',_downAnimKey='',_downEndAnimKey='',
        _upAnimKey='',_upEndAnimKey='',_cooldown=0.,_cooldownKey='duration',_preDelay=0.,_escapeTime=0.,
        _faceToTarget=0,_faceToDefault=0,_faceToFront=1,_faceToFirstCastTarget=0,_forceFaceToDirection=0,
        _activeBuffs=[],_maxAnimScale=-1.,_onlyPlayEndAnimWhenIsLastAbility=0,_ignorePalsyInterrupt=0,
        _actions={'SerializedState':'[]','SerializedObjectReferences':[],'decodedActions':[]})
    exact(clean(f),fixed,('_animKey',),'warmup/animation')
    require(isinstance(f['_animKey'],str) and f['_animKey'],'missing-warmup-animation-key')
    animations=json.loads((ROOT/ANIMATIONS).read_text(encoding='utf-8'))
    anim=animations.get(char_id,{}).get('animations',{}).get(f['_animKey'])
    require(isinstance(anim,dict) and set(anim)=={'duration','events'} and numeric(anim['duration']) and anim['duration']>0
            and isinstance(anim['events'],list) and all(set(e)=={'t','event'} and e['event']=='OnPlayAudio'
                and numeric(e['t']) and 0<=e['t']<=anim['duration'] for e in anim['events']),
            'unsupported-warmup-animation-contract')
    c.visual(visual,'warmup/visual')
    shape(active['fields'],c.active,('_buffs','_waitForAttackEvent','_interruptAbilityOnDetach'),'warmup/active')
    require(active['fields']['_waitForAttackEvent']==0 and active['fields']['_interruptAbilityOnDetach']==0
            and len(active['fields']['_buffs'])==1,'unsupported-warmup-active-controls')
    exact(clean(companion['fields']),{'m_Enabled':1},('_buffs',),'warmup/casting')
    require(len(companion['fields']['_buffs'])==1,'unsupported-warmup-casting-buff-count')
    casting=companion['fields']['_buffs'][0];mode_buff=active['fields']['_buffs'][0];consumed=set()
    enum=json.loads((ROOT/ENUM_SOURCE).read_text(encoding='utf-8'))['abnormalFlags']
    require({k:enum[k] for k in ('STUNNED','FROZEN','SILENCED')}=={'STUNNED':0,'FROZEN':16,'SILENCED':12},'changed-warmup-immunity-enums')
    require(casting['attributes']==dict(ATTRS,abnormalImmunes=[0,16,12]) and casting['lifeTimeType']==2
            and casting['durationKey']=='' and not casting['blackboard'],'unsupported-warmup-casting-body')
    cast_copy=deepcopy(casting);cast_copy['attributes']=deepcopy(ATTRS);cast_copy['templateKey']='empty'
    cast_ir=c.buff_body(cast_copy,set(),'warmup/casting-body')
    require(cast_ir['lifetime']=={'kind':'until_detach'} and not cast_ir['modifiers'],'unsupported-warmup-casting-lifecycle')
    ev=events(c,casting)
    require(len(ev)==1 and ev[0][0]==0 and len(ev[0][1])==1,'unsupported-warmup-create-events')
    create=ev[0][1][0]
    exact(create,{'$type':C+'Action.Nodes+CreateBuff','_buffOwner':'BUFF_OWNER','_useSpecialBuffSource':False,
        '_specialBuffSource':'BUFF_SOURCE','_isDerivedBuff':False,'_finishDerivedBuffIfParentFinish':False,
        '_inherateSourceProjectileFromParentBuff':False,'_hookEffectKeyFromSourceProjectile':False},('_buff',),'warmup/create')
    raw=create['_buff'];normalized=deepcopy(raw)
    for key,expected,value in [('statusResistable','AUTOMATIC',2),('overrideType','DEFAULT',0),
            ('onEventPriority','DEFAULT',0),('lifeTimeType','INFINITY',2),('triggerLifeType','IMMEDIATELY',0)]:
        require(normalized.get(key)==expected,'unsupported-warmup-inline-enum',key);normalized[key]=value
    for key in ('overrideKey','overrideEffectKey','audioSignal','durationKey'):
        require(normalized.get(key) is None,'unsupported-warmup-inline-control',key);normalized[key]=''
    require(normalized['attributes']['abnormalAntis'] is None,'unsupported-warmup-inline-antis')
    normalized['attributes']['abnormalAntis']=[]
    attr_map={'ATK':1,'DEF':2,'BLOCK_CNT':5,'HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO':19}
    form_map={'MULTIPLIER':1,'ADDITION':0}
    for modifier in normalized['attributes']['attributeModifiers']:
        require(modifier['attributeType'] in attr_map and modifier['formulaItem'] in form_map
                and modifier.get('loadFromBlackboard') is True and modifier.get('value')==0,'unsupported-warmup-persistent-attribute')
        modifier['attributeType']=attr_map[modifier['attributeType']];modifier['formulaItem']=form_map[modifier['formulaItem']]
    persistent=c.buff_body(normalized,consumed,'warmup/persistent')
    require(persistent['lifetime']=={'kind':'until_detach'} and {(m['attribute'],m['formula']) for m in persistent['modifiers']}=={
        ('atk','multiplier'),('def','multiplier'),('block_cnt','addition'),('hp_recovery_per_sec_by_max_hp_ratio','addition')},
        'unsupported-warmup-persistent-body')
    persistent['source']={'buffSha256':digest(raw),'createActionSha256':digest(create)}
    end=events(c,mode_buff);require([e[0] for e in end]==[0,1] and len(end[0][1])==2 and len(end[1][1])==4,'unsupported-warmup-mode-events')
    enter,leave=end[0][1],end[1][1];N=C+'Action.Nodes+'
    require(enter[0]=={'$type':N+'ForceCharacterAnimatorFaceFront','_FroceFaceFront':True}
            and leave[1]=={'$type':N+'ForceCharacterAnimatorFaceFront','_FroceFaceFront':False},'unsupported-warmup-facing-actions')
    require(enter[1]=={'$type':N+'SwitchMode','_modeIndex':0,'_loadModeFromBlackboard':True,'_restoreDefault':False,'_restartFSM':True,'_targetType':'TARGET'}
            and leave[0]=={'$type':N+'SwitchMode','_modeIndex':0,'_loadModeFromBlackboard':False,'_restoreDefault':True,'_restartFSM':True,'_targetType':'TARGET'},
            'unsupported-warmup-mode-switch-actions')
    exact(leave[2],{'$type':N+'CreateBuffById','_buffOwner':'BUFF_OWNER','_isDerivedBuff':False,
        '_loadFromBlackboard':False,'_finishDerivedBuffIfParentFinish':False},('_buffKey',),'warmup/final-status')
    exact(leave[3],{'$type':N+'FinishBuffsById','_buffKey':persistent['id'],'_loadFromBlackboard':False,
        '_decCntIfStack':False,'_updateOverrideMap':True,'_targetType':'BUFF_OWNER','_checkBuffSource':False,
        '_sourceType':'BUFF_SOURCE','_alsoClearNullSource':False,'_finishHostBuff':False,'_decCntKey':None,'_decCnt':1},path='warmup/persistent-finish')
    require(persistent['id']!=mode_buff['buffKey'] and persistent['id']!=casting['buffKey'],'duplicate-warmup-buff-identity')
    normalized=deepcopy(mode_buff);normalized['templateKey']='switch_mode_restart_fsm'
    from skill_mode_flow import finite_buff
    mode_ir,index,disarm=finite_buff(c,normalized,consumed,'warmup/mode-buff')
    require(index is not None and not disarm and not mode_ir['modifiers'] and mode_buff['durationKey']=='','unsupported-warmup-mode-buff')
    mode_ir['source']['buffSha256']=digest(mode_buff)
    status_raw=dict(BUFF_FIXED,attributes=deepcopy(ATTRS),loadFromDB=1,lifeTimeType=1,triggerLifeType=0,triggerCnt=0,
        triggerInterval=-1,firstTriggerInterval=-1,durationKey='',buffKey=leave[2]['_buffKey'],templateKey='empty')
    effect=status(c,status_raw,skill['levels'],consumed,'warmup/final-status')
    effect['source'].update(createActionSha256=digest(leave[2]),trigger='mode-buff-ON_FINISH',
        boundary='By-ID lookup checked through the existing status compiler; the synthetic lookup placeholder is not a serialized source component.')
    cast=castrow['fields'];shape(cast,c.cast,('_switchToState','_attackBlackboardModeIndex','_rangeIdModeIndex','_defaultModeIndex'),'warmup/CastSkill')
    require(cast['_switchToState']==1 and cast['_defaultModeIndex']==-1 and cast['_attackBlackboardModeIndex']==index
            and cast['_rangeIdModeIndex']==-1,'unsupported-warmup-cast-routing')
    character=c.character(char_id);mode=c.mode(character,index)
    action,plan,selection,attack,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
    require(action=='attack' and attack['type']==A+'MeleeAttack' and not plan.get('hitBuffs'),'unsupported-warmup-mode-delivery')
    levels=skill['levels'];keys={b['key'] for b in levels[0]['blackboard']}
    require(keys==consumed,'unconsumed-warmup-blackboard',sid,{'source':sorted(keys),'consumed':sorted(consumed)})
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']}
        require(len(bb)==len(level['blackboard']) and set(bb)==keys and all(numeric(v) for v in bb.values())
                and all(b.get('valueStr') in (None,'') for b in level['blackboard']),'invalid-warmup-blackboard')
        require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO') and level['durationType']=='NONE'
                and level['rangeId'] is None and numeric(level['duration']) and level['duration']>0
                and level['spData']['spCost']>0 and level['spData']['spType'] in ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE'),
                'unsupported-warmup-level-controller')
        require(all(bb[m['value']['key']]>=0 for m in persistent['modifiers'])
                and float(bb['block_cnt']).is_integer(),'invalid-warmup-owner-parameters')
    source=dict(graphSha256=digest(rows),prefabId=prefab,sourceLevelsSha256=digest(levels),
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        characterPathId=character['characterPathId'],bundle=character['bundle'],bundleSha256=character['bundleSha256'],
        modeGraphsSha256=[digest(mode)],sourceVersion=c.evidence.manifest['source_version'],
        evidenceLevels={'serializedGraph':'Verified','warmupCompletion':'Inferred'},model_boundaries=COMMON+BOUNDARIES,
        templates={b['templateKey']:digest(c.templates[b['templateKey']]) for b in (casting,mode_buff)},
        animation=dict(pointer=ANIMATIONS+'#/'+char_id+'/animations/'+f['_animKey'],sha256=digest(anim),duration=anim['duration']),
        immunityEnumSource=ENUM_SOURCE)
    flow=dict(kind='sequence',persistentBuffIndexes=[0],stages=[
        dict(id=actor['node_id'],buffIndexes=[],mode=dict(action='none',plan=None,selector=None,modeIndex=None,disarmed=True,channeling=None),
             completion=dict(kind='animation-finished',duration={'constant':anim['duration']}),castingImmunities=['stun','frozen','silence']),
        dict(id=active['node_id'],buffIndexes=[1],mode=dict(action=action,plan=plan,selector=selection,modeIndex=index,disarmed=False,channeling=None),
             completion=dict(kind='buffs-expired',checkEarlyFinish=False,waitForCasting=False,attackFinishEvent=False))],
        sourceControls=clean(group['fields']),finishPolicy='all-children-complete',interruptionPolicy='cancel-remaining',
        finalizer=dict(kind='owner-status',buffs=[effect],triggerStage=1))
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),activation='cast',
        capability='ability-flow',modeIndex=None,action='inherit',plan=None,selector=None,disarmed=False,channeling=None,
        lifetime={'kind':'flow'},source=source)
    program=dict(controller=dict(kind='cast_skill_flow',activation='cast',duration_policy='child_completion',allow_no_target=True,
        sp_recovery_while_active=False,pre_delay=0,wait_for_casting=True,wait_for_attack_event=False,interrupt_on_detach=False),
        buffs=[persistent,mode_ir],flow=flow,source=source)
    return profile,program
