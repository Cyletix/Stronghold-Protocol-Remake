"""Complete source owner-to-blockees effects, discovered without skill IDs."""
from collections import Counter
from copy import deepcopy


BOUNDARIES = [
    'Cached source components and recursive Buff actions are checked in full; JP graph/CN level binding remains cross-snapshot inference.',
    'Owner-to-blockees membership uses the existing simulation blockerId relation. Maintained status belongs to its source and ends on unblock, source detach or death.',
    'BlockedToggleChecker blockMinCnt=0/blockMaxCnt=0/useBlockAsMin=0 is admitted only as this exact field tuple. Mapping it to all current blockees is inferred jointly from the source graph and CN skill description; the native threshold/getter implementation was not recovered or re-extracted in this batch.',
    'Periodic waitFirst=false emits once at activation and then on the source interval. Exact native event-frame phase is not claimed.',
    'Periodic damage reads live owner ATK and uses ordinary damage, damage statistics and kill consumers. It is a Buff action, not a basic attack or attack-recovery SP event.',
    'AdvancedApplyDamage ignoreForSp=false is preserved. The current enemy damage path has no general defensive-SP consumer, so enemy defensive-SP recovery is not claimed. Large-step catch-up uses the current frame membership and live attributes rather than rewinding historical snapshots.',
    'The current shared hit model handles sleep, untargetability, damage modifiers and resurrection; native protected cancellation/event ordering remains a simulation boundary.',
]


def actions(template, event):
    from skill_mode_compiler import require
    require(set(template)=={'templateKey','effectKey','onEventPriority','eventToActions'}
            and template['effectKey']=='' and template['onEventPriority']==0,
            'unsupported-blockee-template-controls')
    events=template['eventToActions']
    require(set(events)=={'_items'} and len(events['_items'])==1 and events['_items'][0]['key']==event,
            'unsupported-blockee-template-events')
    value=events['_items'][0]['value']
    require(set(value)=={'SerializedState','SerializedObjectReferences','decodedActions'}
            and not value['SerializedObjectReferences'],'unsupported-blockee-template-references')
    return value['decodedActions']


def exact(value, expected, variable=(), path=''):
    from skill_mode_compiler import require
    require(set(value)==set(expected)|set(variable),'unknown-blockee-fields',path,
            dict(extra=sorted(set(value)-set(expected)-set(variable)),missing=sorted(set(expected)-set(value))))
    for key,item in expected.items():
        require(value[key]==item,'unsupported-blockee-field',path+'/'+key,value[key])


def immediate_child(c,buff):
    """Normalize only the explicit JSON enum spellings in decoded action data."""
    from skill_mode_compiler import shape,require
    normalized=deepcopy(buff)
    for key,expected,value in [('statusResistable','AUTOMATIC',2),('overrideType','DEFAULT',0),
            ('onEventPriority','DEFAULT',0),('lifeTimeType','IMMEDIATELY',0),
            ('triggerLifeType','IMMEDIATELY',0)]:
        require(normalized.get(key)==expected,'unsupported-blockee-child-enum',key,normalized.get(key))
        normalized[key]=value
    for key in ('overrideKey','overrideEffectKey','audioSignal','durationKey'):
        require(normalized.get(key) is None,'unsupported-blockee-child-control',key,normalized.get(key))
        normalized[key]=''
    expected=deepcopy(c.buff)
    expected.update(lifeTimeType=0,triggerLifeType=0,durationKey='',templateKey=buff['templateKey'],
                    buffKey=buff['buffKey'],blackboard=[],overrideKey='',overrideEffectKey='',audioSignal='')
    expected['attributes']={key:[] for key in expected['attributes']}
    shape(normalized,expected,(), 'blockee/immediate-child')
    require(isinstance(buff['buffKey'],str) and buff['buffKey'],'missing-blockee-buff-key')


def pulse(c,buff,consumed):
    from skill_mode_compiler import C,require,digest,numeric
    source=actions(c.templates[buff['templateKey']],2)
    require(len(source)==1,'unsupported-blockee-pulse-actions')
    spawn=source[0]
    exact(spawn,{'$type':C+'Action.Nodes+CreateBuffToBlockee','_buffOwner':'BUFF_OWNER',
                 '_isDerivedBuff':False,'_finishDerivedBuffIfParentFinish':False},('_buff',),'blockee/spawn')
    child=spawn['_buff'];immediate_child(c,child)
    require(child['templateKey'] in c.templates,'missing-blockee-child-template')
    body=actions(c.templates[child['templateKey']],0)
    require(len(body)==2,'unsupported-blockee-damage-body')
    damage,effect=body
    fixed={'$type':C+'Action.Nodes+AdvancedApplyDamage','_sourceType':'SOURCE','_targetType':'TARGET',
        '_damageType':'MAGICAL','_defaultAtkScale':1.,'_applyWay':'NONE','_baseOnHostAtk':False,
        '_emitSourceOnCalculateDamage':False,'_attackType':'NORMAL','_forceUseProjectileCachedAtk':False,
        '_ignoreForSp':False,'_ignoreMissFlag':'NONE','_ignoreCancelReasonMask':'NONE','_modifierKey':'',
        '_assignRealDamageToBB':False,'_assignFinalDamageToBB':False,'_skipModifierEvent':False,
        '_noSource':False,'_onlyUseSourceOnCalculateDamage':False,'_getCachedAtkFromBlackboard':False,
        '_cachedAtkKey':'atk','_setSharedFlag':False,'_sharedFlagIndex':'IS_CONTINUOUS'}
    exact(damage,fixed,('_atkScaleVar',),'blockee/damage')
    require(isinstance(damage['_atkScaleVar'],str) and damage['_atkScaleVar'],'invalid-blockee-scale-key')
    exact(effect,{'$type':C+'Action.Nodes+CreateEffect','_targetType':'BUFF_OWNER','_sourceType':'BUFF_SOURCE',
        '_useSourceFaceVactor':False,'_useSourceToTargetDirection':False,'_useConstDirection':False,
        '_constDirection':'UP','_createEffectHoldBySource':False,'_useAttackPlaybackSpeed':False,
        '_manualSetPlaybackSpeed':False,'_blackboardKey':'','_playbackSpeed':1.},('_effectKey',),'blockee/effect')
    require(isinstance(effect['_effectKey'],str),'invalid-blockee-effect-key')
    require(buff['lifeTimeType']==1 and buff['triggerLifeType']==2 and buff['waitFirstTriggerInterval'] in (0,1)
            and buff['triggerInterval']==-1 and buff['firstTriggerInterval']==-1,'unsupported-blockee-pulse-lifetime')
    board=buff['blackboard']
    require(len(board)==1 and set(board[0])=={'key','value','valueStr'} and board[0]['key']=='interval'
            and board[0]['valueStr']=='' and numeric(board[0]['value']) and board[0]['value']>0,
            'unsupported-blockee-pulse-clock')
    normalized=deepcopy(buff)
    normalized.update(templateKey='empty',blackboard=[],triggerLifeType=0,waitFirstTriggerInterval=1)
    owner=c.buff_body(normalized,consumed,'blockee/owner')
    consumed.add(damage['_atkScaleVar'])
    result=dict(kind='periodic-blockee-damage',buffKey=child['buffKey'],
        interval={'constant':board[0]['value']},waitFirst=bool(buff['waitFirstTriggerInterval']),
        damageType='arts',scale={'key':damage['_atkScaleVar']},sourceDamage=deepcopy(damage),
        source=dict(ownerBuffSha256=digest(buff),childBuffSha256=digest(child),
            templateKeys=[buff['templateKey'],child['templateKey']],effectKey=effect['_effectKey']))
    return owner,result


def maintained(c,character,index):
    from skill_mode_compiler import A,C,require,clean,shape,digest
    mode=character['modes'][index];base=character['modes'][0]
    require(not base['fields']['_generalAbilities'] and len(mode['fields']['_generalAbilities'])==1,
            'unsupported-blockee-general-transition')
    ref=mode['fields']['_generalAbilities'][0];node=c.reader.node(character['bundle'],ref)
    rows=[dict(node_id=n['pathId'],type=c.reader.name(character['bundle'],n),fields=n['fields'])
          for n in c.reader.companions(character['bundle'],node)]
    require(Counter(r['type'] for r in rows)==Counter([A+'ToggleablePassiveBuffAbility',A+'BlockedToggleChecker']),
            'unsupported-blockee-general-components')
    toggle=next(r for r in rows if r['type']==A+'ToggleablePassiveBuffAbility');checker=next(r for r in rows if r['type']==A+'BlockedToggleChecker')
    require(ref['m_PathID']==toggle['node_id'] and toggle['fields']['_checker']==dict(m_FileID=0,m_PathID=checker['node_id']),
            'blockee-checker-reference-mismatch')
    exact(clean(toggle['fields']),{'m_Enabled':1,'_selector':{'m_FileID':0,'m_PathID':'0'},
        '_metadata':{'namedAsAlias':'','blackboardPrefix':''},'_interruptAbilityOnDetach':0,
        '_attachPassiveBuffsOnDummy':1,'_ignoreIfOwnerDead':0,'_forceAsDmgOrHealAbility':0,
        '_buffs':[],'_unmanagedBuffsWhenToggleOn':[],'_setToggleFalseOnDetached':0,'_isInverseToggle':0},
        ('_checker',),'blockee/toggle')
    fields=clean(checker['fields'])
    exact(fields,{'m_Enabled':1,'_blockMinCnt':0,'_blockMaxCnt':0,'_useBlockAsMin':0},('_buffsToBlockee',),'blockee/checker')
    require(len(fields['_buffsToBlockee'])==1,'unsupported-blockee-status-count')
    buff=fields['_buffsToBlockee'][0];attrs=buff['attributes']
    require(attrs=={k:([0] if k=='abnormalFlags' else []) for k in c.buff['attributes']}
            and buff['templateKey']=='empty' and buff['lifeTimeType']==2
            and isinstance(buff['durationKey'],str),'unsupported-maintained-blockee-status')
    normalized=deepcopy(buff);normalized['attributes']['abnormalFlags']=[];normalized['durationKey']=''
    c.buff_body(normalized,set(),'blockee/status')
    result=dict(kind='maintained-blockee-status',buffKey=buff['buffKey'],status='stun',
        membership='owner-blockees',removeOnLeave=True,removeOnDetach=True,sourceScoped=True,
        source=dict(generalGraphSha256=digest(rows),checker=deepcopy(fields),statusBuffSha256=digest(buff)))
    return result,rows


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    """Return None for unrelated families; once matched, reject any unclosed field."""
    from skill_mode_compiler import A,C,require,shape,digest,numeric,BOUNDARIES as COMMON
    active_rows=[r for r in rows if r['type']==A+'ActiveBuffAbility']
    if len(active_rows)!=1:return None
    active=active_rows[0]['fields'];buffs=active.get('_buffs',[])
    pulse_candidate=any(any(a.get('$type')==C+'Action.Nodes+CreateBuffToBlockee'
         for e in c.templates.get(b.get('templateKey'),{}).get('eventToActions',{}).get('_items',[])
         for a in e['value'].get('decodedActions',[])) for b in buffs)
    switches=[(i,b) for i,b in enumerate(buffs) if b.get('templateKey') in ('switch_mode','switch_mode_restart_fsm')]
    character=mode=None;index=None;general_candidate=False
    if len(switches)==1:
        board=switches[0][1]['blackboard'];indices=[b['value'] for b in board if b['key']=='mode']
        if len(indices)<=1 and (not indices or numeric(indices[0]) and int(indices[0])==indices[0]):
            index=int(indices[0]) if indices else 1;character=c.character(char_id)
            if 0<index<len(character['modes']):
                for ref in character['modes'][index]['fields']['_generalAbilities']:
                    node=c.reader.node(character['bundle'],ref)
                    general_candidate|=bool(node and c.reader.name(character['bundle'],node)==A+'ToggleablePassiveBuffAbility'
                        and any(c.reader.name(character['bundle'],n)==A+'BlockedToggleChecker'
                                for n in c.reader.companions(character['bundle'],node)))
    if not pulse_candidate and not general_candidate:return None
    require(not(pulse_candidate and general_candidate),'mixed-blockee-source-contracts')
    require(Counter(r['type'] for r in rows)==Counter([C+'CastSkill',A+'ActiveBuffAbility']),
            'unsupported-blockee-skill-components')
    cast=next(r['fields'] for r in rows if r['type']==C+'CastSkill')
    shape(cast,c.cast,('_switchToState','_attackBlackboardModeIndex'),'blockee/CastSkill')
    require(cast['_switchToState']==(1 if general_candidate else 0) and cast['_attackBlackboardModeIndex']==-1,
            'unsupported-blockee-cast-routing')
    shape(active,c.active,('_buffs','_interruptAbilityOnDetach','_waitForAttackEvent'),'blockee/ActiveBuff')
    require(active['_interruptAbilityOnDetach'] in (0,1) and active['_waitForAttackEvent'] in (0,1),
            'unsupported-blockee-activation')
    require(len(buffs)==1,'unsupported-blockee-owner-buff-count')
    consumed=set();actor=selector=None;mode_graph=None
    if pulse_candidate:
        require(not switches,'unsupported-blockee-pulse-switch')
        owner,blockee=pulse(c,buffs[0],consumed)
        action='inherit';plan=selection=None;index=None;mode_buff_index=None
    else:
        require(switches[0][0]==0,'unsupported-blockee-switch-index')
        c.template(buffs[0]['templateKey']);board=buffs[0]['blackboard']
        require(len(board)==1 and board[0]==dict(key='mode',value=index,valueStr=''),'unsupported-blockee-mode-board')
        owner=c.buff_body(buffs[0],consumed,'blockee/owner',mode=True)
        blockee,general=maintained(c,character,index)
        mode_graph=deepcopy(character['modes'][index]);checked=deepcopy(character)
        checked['modes'][index]['fields']['_generalAbilities']=[]
        mode=c.mode(checked,index)
        action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
        require(actor['type'] in (A+'MeleeAttack',A+'MultiMeleeAttack') and not any(k.startswith('attack@') for k in consumed),
                'unsupported-blockee-attack-parameter-owner')
        mode_buff_index=0
    levels=skill['levels'];keys={b['key'] for b in levels[0]['blackboard']}
    require(consumed==keys,'unconsumed-blockee-blackboard',sid,dict(source=sorted(keys),consumed=sorted(consumed)))
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']};sp=level['spData']
        require(set(bb)==keys and len(bb)==len(level['blackboard']) and all(numeric(v) for v in bb.values()),'changed-blockee-blackboard')
        require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO') and level['durationType']=='NONE'
                and numeric(level['duration']) and level['duration']>0 and level['rangeId'] is None
                and sp['spType'] in ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE')
                and sp['spCost']>0 and owner['lifetime']['kind']=='timed','unsupported-blockee-level-controller')
        if pulse_candidate:require(bb[blockee['scale']['key']]>0,'invalid-blockee-damage-scale')
        for m in owner['modifiers']:
            v=bb[m['value']['key']] if 'key' in m['value'] else m['value']['constant']
            require(m['attribute']!='block_cnt' or m['formula']=='addition' and int(v)==v and v>=0,
                    'invalid-blockee-block-count')
    source=dict(graphSha256=digest(rows),modeGraphSha256=digest(mode_graph) if mode_graph else None,
        prefabId=prefab,sourceLevelsSha256=digest(levels),
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        sourceVersion=c.evidence.manifest['source_version'],blockee=deepcopy(blockee['source']),
        evidenceLevels=dict(serializedFields='Verified',blockeeRelationAndChecker='Inferred from fields plus CN description',
                            periodicFirstFrame='Simulation',nativeCheckerThreshold='not recovered',enemyDefensiveSp='not implemented'),
        model_boundaries=COMMON+BOUNDARIES)
    if character:source.update(bundle=character['bundle'],bundleSha256=character['bundleSha256'],
        characterPathId=character['characterPathId'],modePathId=mode_graph['pathId'],
        attackNode=actor['node_id'],selectorNode=selector['node_id'])
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),
        activation='cast',capability='blockee-effects',modeIndex=index,modeBuffIndex=mode_buff_index,
        lifetime={'kind':'timed','duration':{'key':'duration'}},action=action,plan=plan,selector=selection,
        disarmed=False,channeling=None,source=source)
    controller=dict(kind='cast_skill_active_buffs',activation='cast',duration_policy='max_buff_duration',
        allow_no_target=True,sp_recovery_while_active=False,pre_delay=0,
        interrupt_on_detach=bool(active['_interruptAbilityOnDetach']),wait_for_casting=False,
        wait_for_attack_event=bool(active['_waitForAttackEvent']))
    return profile,dict(controller=controller,buffs=[owner],blockees=[blockee],source=source)
