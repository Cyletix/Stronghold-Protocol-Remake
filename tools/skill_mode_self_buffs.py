"""Bounded self Buff actions compiled from complete graphs, never skill IDs."""
from collections import Counter
from copy import deepcopy
import json

BOUNDARIES=[
    'The complete serialized self Buff/action fields are checked; JP graph plus CN levels remains cross-snapshot inference.',
    'All admitted ActiveBuffAbility pre-delays are zero. The uninterruptible-on-pre-delay boolean is preserved without claiming positive-delay scheduling.',
    'Finite root Buff duration resolves duration from the skill blackboard before the raw skill duration; a raw duration of -1 does not make an explicitly finite Buff infinite.',
    'One-shot BlockDamage then FinishBuff uses the current positive-incoming-damage/other-shield ordering, finishing only its own Buff. Native full event/other-shield precedence is not newly proved.',
    'Derived self status keeps its source/parent lifetime and shares one override selection with incoming Aura Buffs. DEFAULT grouping and tie rules retain the existing Aura simulation boundary.',
    'Source DEF penetration is sampled by the current physical damage consumer, ratio before fixed penetration. Native complete damage ordering is not newly recovered.',
    'Finite periodic ModifyCost uses the source interval/count and the battle onSkillDp sink. Wait-first means one interval before the first tick; exact source frame phase remains a simulation convention.',
]


def exact(value,expected,variable=(),path=''):
    from skill_mode_compiler import require
    require(set(value)==set(expected)|set(variable),'unknown-self-buff-fields',path)
    for key,item in expected.items():
        require(value[key]==item,'unsupported-self-buff-field',path+'/'+key,value[key])


def events(c,buff):
    from skill_mode_compiler import require
    t=c.templates.get(buff['templateKey'])
    require(t is not None,'missing-self-buff-template',buff['templateKey'])
    exact(t,{'templateKey':buff['templateKey'],'effectKey':'','onEventPriority':0},('eventToActions',),'self/template')
    exact(t['eventToActions'],{},('_items',),'self/events')
    out=[]
    for e in t['eventToActions']['_items']:
        exact(e,{},('key','value'),'self/event')
        exact(e['value'],{'SerializedObjectReferences':[]},('decodedActions','SerializedState'),'self/event/value')
        require(json.loads(e['value']['SerializedState'])==e['value']['decodedActions'],'self-buff-decoded-action-drift')
        out.append((e['key'],e['value']['decodedActions']))
    return out


def derived(c,node,consumed):
    from skill_mode_compiler import C,require,digest
    from skill_aura_compiler import AuraCompiler
    exact(node,{'$type':C+'Action.Nodes+CreateBuff','_buffOwner':'BUFF_OWNER','_useSpecialBuffSource':False,
        '_specialBuffSource':'BUFF_SOURCE','_isDerivedBuff':True,'_finishDerivedBuffIfParentFinish':True,
        '_inherateSourceProjectileFromParentBuff':False,'_hookEffectKeyFromSourceProjectile':False},('_buff',),'self/derived')
    original=node['_buff'];normalized=deepcopy(original)
    for key,expected,value in [('statusResistable','AUTOMATIC',2),('overrideType','DEFAULT',0),
            ('onEventPriority','DEFAULT',0),('lifeTimeType','LIMITED',1),('triggerLifeType','IMMEDIATELY',0)]:
        require(normalized.get(key)==expected,'unsupported-derived-reference-enum',key)
        normalized[key]=value
    for key in ('overrideKey','overrideEffectKey','audioSignal','durationKey'):
        require(normalized.get(key) is None,'unsupported-derived-reference-control',key)
        normalized[key]=''
    require(normalized.get('loadFromDB') is True,'unsupported-derived-inline-body')
    a=AuraCompiler(c,c.hit_buffs.shared.database)
    ir=a.buff(normalized,'self',consumed)
    require(ir['lifetime']=={'kind':'until_detach'} and not ir['effects'] and ir['mode'] is None
        and ir['modifiers'] and all(m['attribute']=='one_minus_status_resistance' and m['formula']=='final_scaler'
                                   for m in ir['modifiers']),'unsupported-derived-body')
    ir.update(lifetime={'kind':'until_parent_finish'},sourceLifetime='until_detach',sourceEvent=0)
    ir['source']['createActionSha256']=digest(node)
    return ir


def compile_loaded_owner(c,original,consumed):
    """Finite DB self contributions share Aura override, not derived lifetime.

    Reuse the common complete Buff field and modifier contracts. The finite
    local-duration reference is a separately checked source contract; it is
    never rewritten into an infinite Aura reference just to pass validation.
    """
    from skill_mode_compiler import require,numeric,digest
    from skill_aura_compiler import AuraCompiler,BUFF_BASE,BUFF_VARIABLE,ATTR_FIELDS,exact as check
    fixed={k:v for k,v in BUFF_BASE.items() if k not in BUFF_VARIABLE}
    check(original,fixed,BUFF_VARIABLE,'finite owner DB reference')
    require(original['loadFromDB']==1 and original['lifeTimeType']==1 and original['templateKey']=='empty'
        and not original['priorityBBKeys'] and original['attributes']=={k:[] for k in ATTR_FIELDS},
        'unsupported-finite-owner-placeholder')
    require(original['disableOverride']==0 and original['independentCharacterSource']==0
        and original['stripBlackboardParamsWithBuffKey']==0 and original['isDamageMissable']==0
        and all(original[k]=='' for k in ('overrideKey','overrideEffectKey','audioSignal')),
        'unsupported-finite-owner-reference-controls')
    board=original['blackboard'];key=original['durationKey']
    require(isinstance(key,str) and key and len(board)==1 and set(board[0])=={'key','value','valueStr'}
        and board[0]['key']==key and board[0]['valueStr']=='' and numeric(board[0]['value']) and board[0]['value']>0,
        'unsupported-finite-owner-local-duration')
    loaded=c.hit_buffs.shared.database.get(original['buffKey'])
    require(isinstance(loaded,dict),'missing-finite-owner-database')
    expected=dict(fixed,isGroundBoundable=False,statusResistable='AUTOMATIC',overrideType='DEFAULT',
                  onEventPriority='DEFAULT',triggerLifeType='IMMEDIATELY')
    check(loaded,expected,BUFF_VARIABLE,'finite owner database')
    require(loaded['loadFromDB'] is False and loaded['lifeTimeType']=='LIMITED' and loaded['durationKey']==key
        and loaded['blackboard'] in (None,[]) and loaded['templateKey']=='empty' and loaded['buffKey']==original['buffKey']
        and loaded['overrideEffectKey'] in (None,'') and loaded['audioSignal'] in (None,'')
        and loaded['stripBlackboardParamsWithBuffKey'] is False and loaded['isDamageMissable'] is False,
        'unsupported-finite-owner-database-controls')
    for name in ('independentCharacterSource','disableOverride'):
        require(type(loaded[name]) is bool,'invalid-finite-owner-stacking')
    require(isinstance(loaded['overrideKey'],str) and loaded['overrideKey'] and isinstance(loaded['priorityBBKeys'],list)
        and all(isinstance(k,str) and k for k in loaded['priorityBBKeys']),'invalid-finite-owner-priority')
    attrs=loaded['attributes'];require(set(attrs)==ATTR_FIELDS and
        all(not value for k,value in attrs.items() if k!='attributeModifiers'),'unsupported-finite-owner-status-flags')
    a=AuraCompiler(c,c.hit_buffs.shared.database)
    modifiers=[a.modifier(m,loaded,consumed,'finite owner/modifier') for m in attrs['attributeModifiers'] or []]
    require(len(modifiers)==1 and modifiers[0]['attribute']=='one_minus_status_resistance'
        and modifiers[0]['formula']=='final_scaler','unsupported-finite-owner-modifier')
    consumed.update(loaded['priorityBBKeys'])
    require(c.templates['empty']=={'templateKey':'empty','effectKey':'','onEventPriority':0,'eventToActions':{'_items':[]}},
            'eventful-finite-owner-template')
    source=dict(referenceSha256=digest(original),databaseKey=loaded['buffKey'],databaseSha256=digest(loaded),
        templateSha256=digest(c.templates['empty']),localDurationKey=key,
        lifetimeBinding='verified serialized local blackboard and matching DB duration key')
    return dict(id=original['buffKey'],scope='self',lifetime={'kind':'timed','duration':{'constant':board[0]['value']}},
        stacking={'max_stacks':1},modifiers=[],override_buff=dict(id=loaded['buffKey'],scope='self',modifiers=modifiers,
            stacking=dict(maxStacks=1,independentSource=loaded['independentCharacterSource'],disableOverride=loaded['disableOverride'],
                overrideKey=loaded['overrideKey'],priority=loaded['priority'],priorityKeys=loaded['priorityBBKeys'],
                nativeOverrideDispatch='unverified-protected-default-table'),source=source),source=source)


def compile_buff(c,buff,consumed):
    from skill_mode_compiler import C,require,digest
    body=events(c,buff);normal=deepcopy(buff);normal['templateKey']='empty'
    extras={}
    if body:
        require(len(body)==1,'unsupported-self-buff-events')
        event,nodes=body[0]
        if event==10 and len(nodes)==2 and nodes[0].get('$type')==C+'Action.Nodes+BlockDamage':
            exact(nodes[0],{'$type':C+'Action.Nodes+BlockDamage','_filterDamageType':False,'_damageMask':'NONE',
                '_useDynamicVar':False,'_allowNegativeDynamicVar':False,'_useFixedValue':False,'_showDamageNumber':False,
                '_specifyBlockEffect':None,'_useSource':False,'_sourceType':'SOURCE','_filterApplyWay':False,
                '_applyWayFilter':'NONE','_showShieldUI':False},path='self/block')
            exact(nodes[1],{'$type':C+'Action.Nodes+FinishBuff','_decCntIfStack':False,'_updateOverrideMap':True},path='self/finish')
            extras['damage_block_once']=dict(kind='all-damage-once',sourceEvent=10,finishOwnBuff=True)
        elif event==0 and len(nodes)==1 and nodes[0].get('$type')==C+'Action.Nodes+CreateBuff':
            extras['derived_buffs']=[derived(c,nodes[0],consumed)]
        elif event==2 and len(nodes)==1 and nodes[0].get('$type')==C+'Action.Nodes+ModifyCost':
            exact(nodes[0],{'$type':C+'Action.Nodes+ModifyCost','_sourceType':'SOURCE',
                '_forceToDisplayNumber':False,'_forceToDisplayNegativeNumber':False},('_blackboardKey',),'self/cost')
            key=nodes[0]['_blackboardKey'];require(isinstance(key,str) and key,'invalid-self-cost-key')
            require(buff['triggerLifeType']==1 and buff['triggerCnt']==0 and buff['triggerInterval']==-1
                and buff['waitFirstTriggerInterval']==1 and buff['firstTriggerInterval']==-1,
                'unsupported-finite-self-clock')
            normal['triggerLifeType']=0
            consumed.update([key,'interval','trig_cnt'])
            extras['periodic_actions']=dict(sourceEvent=2,interval={'key':'interval'},count={'key':'trig_cnt'},
                waitFirst=True,actions=[dict(kind='cost',value={'key':key})])
        else:require(False,'unsupported-self-buff-actions',buff['templateKey'],[event,[n.get('$type') for n in nodes]])
    out=c.buff_body(normal,consumed,'self/'+buff['buffKey'])
    require(out['lifetime']['kind']=='timed','unsupported-self-parent-lifetime')
    out.update(extras)
    out['source']=dict(buffSha256=digest(buff),templateKey=buff['templateKey'],templateSha256=digest(c.templates[buff['templateKey']]))
    return out


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import A,C,require,shape,digest,numeric,BOUNDARIES as COMMON
    active_rows=[r for r in rows if r['type']==A+'ActiveBuffAbility']
    if len(active_rows)!=1:return None
    active=active_rows[0]['fields'];raw=active.get('_buffs',[])
    # A specific new capability is necessary, so ordinary existing self-stat
    # providers are not pointlessly migrated to the mode provider.
    if any(b.get('templateKey') in ('switch_mode','switch_mode_restart_fsm') for b in raw):return None
    kinds={a.get('$type') for b in raw for e in c.templates.get(b.get('templateKey'),{}).get('eventToActions',{}).get('_items',[])
           for a in e['value'].get('decodedActions',[])}
    attrs={m['attributeType'] for b in raw for m in b['attributes']['attributeModifiers']}
    if not attrs&{17,25} and not kinds&{C+'Action.Nodes+'+n for n in ('BlockDamage','CreateBuff','ModifyCost')}:return None
    require(Counter(r['type'] for r in rows)==Counter([C+'CastSkill',A+'ActiveBuffAbility']),
            'unsupported-self-buff-skill-components')
    cast=next(r['fields'] for r in rows if r['type']==C+'CastSkill')
    shape(cast,c.cast,('_switchToState','_attackBlackboardModeIndex','_defaultModeIndex','_rangeIdModeIndex',
                       '_uninterruptibleOnAbilityPredelay'),'self/CastSkill')
    require(cast['_switchToState']==0 and cast['_defaultModeIndex']==-1 and cast['_rangeIdModeIndex']==-1
        and type(cast['_attackBlackboardModeIndex']) is int and cast['_attackBlackboardModeIndex']>=-1
        and cast['_uninterruptibleOnAbilityPredelay'] in (0,1),'unsupported-self-cast-routing')
    shape(active,c.active,('_buffs','_interruptAbilityOnDetach'),'self/ActiveBuff')
    require(active['_interruptAbilityOnDetach'] in (0,1) and active['_preDelay']==0,'unsupported-self-activation')
    consumed=set();buffs=[compile_buff(c,b,consumed) for b in raw]
    require(buffs and len({b['id'] for b in buffs})==len(buffs),'duplicate-self-buff-identity')
    levels=skill['levels'];keys={b['key'] for b in levels[0]['blackboard']}
    if 'duration' in keys:consumed.add('duration')
    require(consumed==keys and not any(k.startswith('attack@') for k in keys),'unconsumed-self-blackboard',sid,
            dict(source=sorted(keys),consumed=sorted(consumed)))
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']};sp=level['spData'];duration=bb.get('duration',level['duration'])
        require(set(bb)==keys and len(bb)==len(level['blackboard']) and all(numeric(v) for v in bb.values()),'changed-self-blackboard')
        require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO') and level['durationType']=='NONE'
            and numeric(duration) and duration>0 and level['rangeId'] is None
            and sp['spType'] in ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE')
            and sp['spCost']>0,'unsupported-self-level-controller')
        for b in buffs:
            for m in b['modifiers']:
                v=bb[m['value']['key']] if 'key' in m['value'] else m['value']['constant']
                require(numeric(v),'invalid-self-modifier')
                require(m['attribute']!='def_penetrate' or m['formula']=='addition' and 0<=v<=1,'invalid-def-penetration')
                require(m['attribute']!='def_penetrate_fixed' or m['formula']=='addition' and v>=0,'invalid-fixed-def-penetration')
            for child in b.get('derived_buffs',[]):
                for m in child['modifiers']:
                    v=bb[m['value']['key']];require(0<=(1+v if v<0 else v)<=1,'invalid-derived-status-resistance')
            if 'periodic_actions' in b:
                p=b['periodic_actions'];count=bb[p['count']['key']]
                require(int(count)==count and 0<count<=9007199254740991 and bb[p['interval']['key']]>0
                    and all(bb[a['value']['key']]>=0 for a in p['actions']),'invalid-finite-self-clock')
    source=dict(graphSha256=digest(rows),prefabId=prefab,sourceLevelsSha256=digest(levels),
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        sourceVersion=c.evidence.manifest['source_version'],selfBuffs=[b['source'] for b in buffs],
        controller=dict(attackBlackboardModeIndex=cast['_attackBlackboardModeIndex'],
            uninterruptibleOnAbilityPredelay=bool(cast['_uninterruptibleOnAbilityPredelay']),preDelay=0),
        evidenceLevels=dict(serializedFields='Verified',currentSimulationMapping='Inferred',nativeFrameEquivalence='unverified'),
        model_boundaries=COMMON+BOUNDARIES)
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),activation='cast',
        capability='bounded-self-buffs',modeIndex=None,modeBuffIndex=None,lifetime={'kind':'timed','duration':{'key':'duration'}},
        action='inherit',plan=None,selector=None,disarmed=False,channeling=None,source=source)
    controller=dict(kind='cast_skill_active_buffs',activation='cast',duration_policy='max_buff_duration',
        allow_no_target=True,sp_recovery_while_active=False,pre_delay=0,interrupt_on_detach=bool(active['_interruptAbilityOnDetach']),
        wait_for_casting=False,wait_for_attack_event=True)
    return profile,dict(controller=controller,buffs=buffs,source=source)
