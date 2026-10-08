"""Source-owned finite sequence stages, with explicit child completion.

This is a capability compiler, not a skill-ID table. Other group kinds and
unconsumed child actions stay rejected by their exact source node.
"""
from collections import Counter
from copy import deepcopy
import json

ANIMATIONS='work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator/data_character_spine_events.json'
TIMING_SOURCES=[ANIMATIONS,'work/client-logic/metadata/types.json',
    'work/client-logic/native-enemy-timing-gates/AbstractAnimatedAbility.UpdatePlaybackSpeed.asm',
    'work/client-logic/native-enemy-timing-gates/AbstractAnimatedAbility.get_preDelay.asm',
    'work/client-logic/native-enemy-timing-gates/EasyToStartAbility+OnWaitForPreDelayd__16.MoveNext.asm']


BOUNDARIES = [
    'The complete cached group, ordered references, child fields, Buff definitions and selected mode graphs are serialized source facts. JP graph/CN level binding remains cross-snapshot inference.',
    'A waiting ActiveBuff child with checkBuffEarlyFinish and channel fireAttackFinishEvent advances once its own Buffs finish. Mapping the animation finish event to that semantic instant is an inferred simulation contract; native coroutine/end-animation frames have not been recovered in this batch.',
    'Sequence progress is driven by the active child instances, not by truncating to the root skill-table duration. Later child Buffs and modes do not exist before their stage starts. Total duration is only the sum of proven finite child clocks used as a forecast.',
    'Interruption/death cancels the remaining sequence and restores the existing base consumer. Source detach flags are retained; exact protected native cancellation event ordering is not claimed.',
    'Only pure finite owner attributes plus fully compiled attack/heal mode leaves are admitted. Parallel/first-success scheduling, one-shot target actions, nested groups and independent child lifecycles remain explicit gaps.',
]


def healing_timing(c,fields,base):
    from skill_mode_compiler import ROOT,require,numeric,digest
    owners=[ch['charId'] for ch in c.character_cache.values() if ch['modes'][0]['pathId']==base['pathId']]
    require(len(owners)==1,'ambiguous-heal-animation-owner')
    if not hasattr(c,'flow_animations'):
        c.flow_animations=json.loads((ROOT/ANIMATIONS).read_text(encoding='utf-8'))
        metadata=json.loads((ROOT/'work/client-logic/metadata/types.json').read_text(encoding='utf-8'))
        mapping={t['byvalTypeIndex']:t for t in metadata}
        node=next(t for t in metadata if t['fullName']=='Torappu.Battle.Abilities.RangedHeal');chain=[]
        while node['fullName']!='Torappu.Battle.Abilities.AbstractAnimatedAbility':
            require(not any(m['name'] in ('GetDuration','UpdatePlaybackSpeed','get_preDelay','get_cooldown') for m in node['methods']),
                    'heal-overrides-base-animation-timing')
            chain.append({'name':node['fullName'],'byvalTypeIndex':node['byvalTypeIndex']})
            node=mapping[node['parentIl2CppTypeIndex']]
        c.heal_animation_chain=chain
    animation=c.flow_animations.get(owners[0],{}).get('animations',{}).get(fields['_animKey'])
    require(animation is not None,'missing-exact-heal-animation',fields['_animKey'])
    events=[e['t'] for e in animation['events'] if e['event']=='OnAttack'];cap=fields['_maxAnimScale']
    require(numeric(animation['duration']) and animation['duration']>0 and len(events)==1
            and numeric(events[0]) and 0<events[0]<=animation['duration'] and fields['_timeMode']==0
            and fields['_waitForAttackEvent']==1 and numeric(cap) and (cap==-1 or cap>=.1),
            'unsupported-heal-animation-event-contract')
    return dict(rule='native-attack-time-capped-animation',eventTime=events[0],animationDuration=animation['duration'],
        minScale=.1,maxScale=cap,waitForAttackEvent=True,sourcePreDelay=fields['_preDelay'],
        source=dict(charId=owners[0],animationKey=fields['_animKey'],animationSha256=digest(animation),
            pointer=ANIMATIONS+'#/'+owners[0]+'/animations/'+fields['_animKey'],inheritance=c.heal_animation_chain,
            boundary='Exact cached animation name; four-decimal extracted event times and cross-snapshot binding. Native event wait ignores serialized preDelay; cast-start playback scaling uses the verified shared base rule.'))


def sequence(fields):
    from skill_mode_compiler import clean,require
    f=clean(fields)
    expected=dict(m_Enabled=1,_selector={'m_FileID':0,'m_PathID':'0'},
        _metadata={'namedAsAlias':'','blackboardPrefix':''},_interruptAbilityOnDetach=0,
        _attachPassiveBuffsOnDummy=1,_ignoreIfOwnerDead=0,_forceAsDmgOrHealAbility=0,
        _alwaysNext=0,_forceNextIfCastFail=0,_checkCanUseSubAbility=0,_useLongestAbilityCooldown=0,
        _fireCastStartEventWhenCast=0,_stopMoveNextWhenNotCasting=0,_alsoInterruptCurrentSubAbility=0,
        _interruptableSubAbilityIndice=[],_alsoStopSubAbilityAffect=0,_alsoResetSubAbilityCooldown=0,
        _setDataExceptRedundance=0,_interruptIfTargetDead=0,_castToInputPosIfTargetInvalid=0,
        _timeMode=1,_enableLoop=0,_abilityLoopSettings=[])
    require(set(f)==set(expected)|{'_abilities'},'unknown-sequence-fields','flow/group',
            {'extra':sorted(set(f)-set(expected)-{'_abilities'}),'missing':sorted(set(expected)-set(f))})
    for key,value in expected.items():
        require(f[key]==value,'unsupported-sequence-control','flow/group/'+key,f[key])
    refs=f['_abilities']
    require(isinstance(refs,list) and 2<=len(refs)<=16 and all(set(ref)=={'m_FileID','m_PathID'}
            and ref['m_FileID']==0 and isinstance(ref['m_PathID'],str) and ref['m_PathID']!='0' for ref in refs),
            'invalid-sequence-children')
    require(len({r['m_PathID'] for r in refs})==len(refs),'repeated-sequence-child')
    return deepcopy(f)


def channel(c,row):
    from skill_mode_compiler import require,digest
    original=row['fields'];require(original.get('_fireAttackFinishEvent')==1,
                                   'sequence-channel-missing-child-finish-event')
    normalized=deepcopy(row);normalized['fields']['_fireAttackFinishEvent']=0
    out=c.channel(normalized)
    out.update(eventDriven=True,fireAttackFinishEvent=True,sourceSha256=digest(original))
    return out


def finite_buff(c,raw,consumed,path):
    from skill_mode_compiler import require,numeric,digest
    require(not raw['loadFromDB'] and raw['templateKey'] in ('empty','switch_mode','switch_mode_restart_fsm'),
            'unsupported-flow-buff-template',path,raw.get('templateKey'))
    switch=raw['templateKey']!='empty';index=None
    if switch:
        c.template(raw['templateKey']);bb=raw['blackboard']
        require(not bb or len(bb)==1 and set(bb[0])=={'key','value','valueStr'} and bb[0]['key']=='mode'
                and bb[0]['valueStr']=='' and numeric(bb[0]['value']) and int(bb[0]['value'])==bb[0]['value'],
                'unsupported-flow-local-blackboard',path)
        index=int(bb[0]['value']) if bb else 1
    else:
        require(not raw['blackboard'],'unsupported-flow-local-blackboard',path)
        require(c.templates['empty']==dict(templateKey='empty',effectKey='',onEventPriority=0,eventToActions={'_items':[]}),
                'changed-empty-flow-template')
    require(raw['lifeTimeType']==1 and raw['lifeTime']==0 and raw['triggerLifeType']==0,
            'unsupported-flow-buff-lifetime',path)
    key=raw['durationKey'] or 'duration'
    require(isinstance(key,str) and bool(key) and (not raw['stripBlackboardParamsWithBuffKey']),
            'unsupported-flow-buff-clock',path)
    flags=raw['attributes']['abnormalFlags']
    require(flags in ([],[11]),'unsupported-flow-buff-flags',path,flags)
    normalized=deepcopy(raw);normalized['durationKey']='duration'
    out=c.buff_body(normalized,consumed,path,mode=switch or flags==[11])
    require(not any(k in out for k in ('flags','override_buff','periodic_actions','derived_buffs')),
            'unsupported-flow-buff-effects',path)
    require(all(m['attribute'] in ('atk','def','magic_resistance','attack_speed','base_attack_time','block_cnt')
                for m in out['modifiers']),'unsupported-flow-attribute-lifecycle',path)
    out['lifetime']={'kind':'timed','duration':{'key':key}}
    if key!='duration':consumed.add(key)
    out['source']={'buffSha256':digest(raw),'sourceDurationKey':raw['durationKey']}
    return out,index,flags==[11]


def maybe_compile(c,sid,skill,char_id,prefab,rows):
    from skill_mode_compiler import A,C,require,exactly_one,shape,numeric,digest,BOUNDARIES as COMMON
    from skill_mode_flow_warmup import maybe_compile as compile_warmup
    warmup=compile_warmup(c,sid,skill,char_id,prefab,rows)
    if warmup is not None:return warmup
    groups=[r for r in rows if r['type'] in {A+'AbilitySequenceGroup',A+'AbilityParallelGroup',A+'AbilityFirstSucceedGroup'}]
    if not groups:return None
    require(len(groups)==1 and groups[0]['type']==A+'AbilitySequenceGroup',
            'unsupported-flow-control-kind','flow/groups',[r['type'] for r in groups])
    group=groups[0];control=sequence(group['fields']);byid={r['node_id']:r for r in rows}
    allowed={C+'CastSkill',A+'AbilitySequenceGroup',A+'ActiveBuffAbility',A+'ThreePartChannelingAnimation',A+'UberEffectEmitter'}
    require(not {r['type'] for r in rows}-allowed,'unsupported-flow-companions','flow/components',
            sorted({r['type'] for r in rows}-allowed))
    castrow=exactly_one(rows,C+'CastSkill');cast=castrow['fields']
    shape(cast,c.cast,('_switchToState','_attackBlackboardModeIndex','_rangeIdModeIndex','_defaultModeIndex'),'flow/CastSkill')
    require(cast['_switchToState']==1 and cast['_defaultModeIndex'] in (-1,0)
            and cast['m_GameObject']==group['fields']['m_GameObject'],'unsupported-flow-cast-controller')
    levels=skill['levels'];consumed=set();buffs=[];stages=[];visited={group['node_id'],castrow['node_id']}
    character=c.character(char_id);indices=set();mode_sources=[]
    for i,ref in enumerate(control['_abilities']):
        require(ref['m_PathID'] in byid,'missing-flow-child','flow/'+str(i),ref)
        node=byid[ref['m_PathID']];f=node['fields'];path='flow/child/'+str(i)
        require(node['type']==A+'ActiveBuffAbility','unsupported-flow-leaf',path,node['type'])
        shape(f,c.active,('_buffs','_waitForCasting','_waitForAttackEvent','_interruptAbilityOnDetach','_checkBuffEarlyFinish'),path)
        require(f['_interruptAbilityOnDetach']==0 and f['_waitForAttackEvent']==0 and f['_waitForCasting'] in (0,1)
                and f['_checkBuffEarlyFinish'] in (0,1) and f['_buffs'],'unsupported-flow-active-controls',path)
        companions=[r for r in rows if r['fields']['m_GameObject']==f['m_GameObject'] and r is not node]
        # Root group/cast may share the last child's GameObject; those are
        # already consumed controller nodes, not additional child payloads.
        companions=[r for r in companions if r['node_id'] not in (group['node_id'],castrow['node_id'])]
        visual=[];channels=[]
        for other in companions:
            if other['type']==A+'UberEffectEmitter':c.visual(other,path+'/emitter');visual.append(other['node_id'])
            elif other['type']==A+'ThreePartChannelingAnimation':channels.append(channel(c,other))
            else:require(False,'unsupported-flow-child-companion',path,other['type'])
            visited.add(other['node_id'])
        require(len(channels)<=1,'multiple-flow-child-channels',path)
        if i<len(control['_abilities'])-1:
            require(f['_waitForCasting']==1 and f['_checkBuffEarlyFinish']==1 and len(channels)==1,
                    'unproven-flow-child-completion',path)
        else:require(f['_waitForCasting']==0 and f['_checkBuffEarlyFinish']==0 and not channels,
                     'unsupported-flow-final-child-completion',path)
        indexes=[];mode_index=None;disarm=False
        for j,raw in enumerate(f['_buffs']):
            out,index,flag=finite_buff(c,raw,consumed,path+'/buff/'+str(j))
            require(index is None or mode_index is None,'multiple-flow-child-mode-switches',path)
            if index is not None:mode_index=index;indices.add(index)
            disarm|=flag;indexes.append(len(buffs));buffs.append(out)
        require(not disarm or mode_index is None,'disarmed-flow-child-switches-mode',path)
        actor=selector=mode=None
        if mode_index is not None:
            mode=c.mode(character,mode_index)
            action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
            require(actor['type'] in (A+'RangedHeal',A+'MeleeAttack',A+'MultiMeleeAttack'),
                    'unsupported-flow-mode-delivery',path,actor['type'])
        else:action='none' if disarm else 'inherit';plan=selection=None
        stages.append(dict(id=node['node_id'],buffIndexes=indexes,mode=dict(action=action,plan=plan,selector=selection,
            modeIndex=mode_index,disarmed=disarm,channeling=channels[0] if channels else None),
            completion=dict(kind='buffs-expired',checkEarlyFinish=bool(f['_checkBuffEarlyFinish']),
                waitForCasting=bool(f['_waitForCasting']),attackFinishEvent=bool(channels)),
            source=dict(nodeSha256=digest(node),visualNodes=visual,modeGraphSha256=digest(mode) if mode else None,
                attackNode=actor['node_id'] if actor else None,selectorNode=selector['node_id'] if selector else None)))
        visited.add(node['node_id']);mode_sources.append(mode)
    require(visited==set(byid),'unconsumed-flow-components','flow/components',sorted(set(byid)-visited))
    require(len({b['id'] for b in buffs})==len(buffs),'duplicate-flow-buff-identity')
    require(len(indices)==1 and cast['_attackBlackboardModeIndex'] in (-1,*indices)
            and cast['_rangeIdModeIndex'] in (-1,*indices),'unsupported-flow-mode-routing')
    keys={b['key'] for b in levels[0]['blackboard']}
    require(keys==consumed,'unconsumed-flow-blackboard',sid,{'source':sorted(keys),'consumed':sorted(consumed)})
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']};allbb={'duration':level['duration'],**bb}
        require(set(bb)==keys and len(bb)==len(level['blackboard']) and all(numeric(v) for v in bb.values()),'changed-flow-blackboard')
        require(level['prefabId']==prefab and level['skillType'] in ('MANUAL','AUTO') and level['durationType']=='NONE'
                and level['duration']>0 and level['spData']['spCost']>0 and level['spData']['spType'] in
                ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE'),'unsupported-flow-level-controller')
        require(level['rangeId'] is None or cast['_rangeIdModeIndex'] in indices,'flow-range-mode-binding-mismatch')
        for b in buffs:
            v=allbb.get(b['lifetime']['duration']['key']);require(numeric(v) and v>0,'invalid-flow-child-duration')
        for stage in stages:
            p=stage['mode']['plan']
            if p:
                get=lambda x:x.get('constant',bb.get(x.get('key'))) if isinstance(x,dict) else x
                require(all(numeric(get(p[k])) and get(p[k])>0 for k in ('hits','targets','scale','rangedScale'))
                        and int(get(p['hits']))==get(p['hits']) and 1<=get(p['hits'])<=32
                        and int(get(p['targets']))==get(p['targets']) and 1<=get(p['targets'])<=64,'invalid-flow-mode-plan')
    flow=dict(kind='sequence',stages=stages,sourceControls=control,
              finishPolicy='all-children-complete',interruptionPolicy='cancel-remaining')
    source=dict(graphSha256=digest(rows),prefabId=prefab,sourceLevelsSha256=digest(levels),
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        characterPathId=character['characterPathId'],bundle=character['bundle'],bundleSha256=character['bundleSha256'],
        modeGraphsSha256=[digest(m) for m in mode_sources if m],
        sourceVersion=c.evidence.manifest['source_version'],evidenceLevels={'serializedGraph':'Verified','childCompletionMapping':'Inferred'},
        model_boundaries=COMMON+BOUNDARIES)
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),activation='cast',
        capability='ability-flow',modeIndex=None,action='inherit',plan=None,selector=None,disarmed=False,channeling=None,
        lifetime={'kind':'flow'},source=source)
    program=dict(controller=dict(kind='cast_skill_flow',activation='cast',duration_policy='child_completion',allow_no_target=True,
        sp_recovery_while_active=False,pre_delay=0,wait_for_casting=True,wait_for_attack_event=False,interrupt_on_detach=False),
        buffs=buffs,flow=flow,source=source)
    return profile,program
