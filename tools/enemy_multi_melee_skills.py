"""Frozen input-target multi-melee + cast-scoped attribute Buff source groups.

This binds the complete ability body, not its independent Reborn caller. Timing
of subsequent coroutine outputs remains a recorded engine bridge inference.
"""
from copy import deepcopy
import struct

from enemy_skill_dispatch import (ROOT, SKILL_FIXED, ENEMY_SKILL, TRIGGER,
    TRIGGER_FIXED, EMITTER, EMITTER_FIELDS, finite, field_contract, reference_component, read)
from enemy_self_cast_skills import DORMANT_FIXED
from enemy_area_melee_skills import owned_component
from enemy_tagged_ranged_skills import compile_attack_recovery, ACTION_SCHEMA_DIFFERENCES
from enemy_mode_blocked_provider import BUFF_DEFAULTS, ATTRIBUTE_KEYS

RULE = 'selector-sp-input-target-multi-melee-cast-buff-v1'
CONTRACT = ROOT / 'work/enemy-multi-melee-contract.json'
MULTI = 'Torappu.Battle.Abilities.MultiMeleeAttack'
CAST_BUFF = 'Torappu.Battle.Abilities.BuffDuringCasting'
SKILL_FIELDS = dict(SKILL_FIXED, _addEnemyIdToSignalId=0)
ACTION_VARIABLE = {'_animKey', '_activeBuffs', '_additionalTimes', '_triggerDelta'}
ACTION_FIXED = {k:v for k,v in DORMANT_FIXED.items() if k not in ACTION_VARIABLE}
ACTION_FIXED.update(_selectTargetSource=2, _endAnimKey='Idle', _atkScale=1, _elementDamageType=0,
    _waitAttackEventForAllAttacks=0, _splitDamage=0, _minPostDelay=0,
    _onlyFeedActiveBuffToLastOne=1, _onlyFeedActiveBuffToFirstOne=0,
    _addSpellCntToAllSignalId=0, _addSpellCntToLastSignalId=0,
    _onlyTrigAudioSignalForFirstSpell=0, _onlyTrigAudioSignalForFirstHit=0,
    _addSpellCntToAllHitSignalId=0, _refreshInputTargetOnCheckSpell=0,
    _refreshInputTargetTrigger={'m_FileID':0, 'm_PathID':0},
    _refreshTimesOnCastStart=0, _refreshTimesOnCheckAnotherSpell=0)
BUFF_FIXED = dict(BUFF_DEFAULTS, blackboard=[], attributes=dict.fromkeys(ATTRIBUTE_KEYS, []))
CAST_ATTRIBUTES = dict.fromkeys(ATTRIBUTE_KEYS, []) | {'attributeModifiers':[
    dict(attributeType=17, formulaItem=0, value=0, loadFromBlackboard=1, fetchBaseValueFromSourceEntity=0)]}
EFFECT_FIXED = {'$type':'Torappu.Battle.Action.Nodes+CreateEffect, Assembly-CSharp',
    '_targetType':'TARGET', '_sourceType':'SOURCE', '_useSourceFaceVactor':False,
    '_useSourceToTargetDirection':False, '_useConstDirection':False, '_constDirection':'UP',
    '_createEffectHoldBySource':False, '_createEffectConstDirectionHoldBySource':False,
    '_useAttackPlaybackSpeed':False, '_manualSetPlaybackSpeed':False,
    '_blackboardKey':'', '_playbackSpeed':1}


def owned_interval_component(owner, skill_owner, fields, indices):
    if owned_component(owner,indices,ACTION_SCHEMA_DIFFERENCES):
        return True
    # The CN export rounds 0.2 while the JP reader retains its exact float32.
    # Accept only that proven serialization difference and the same resolved
    # GameObject as the independently validated skill; never soften other fields.
    value = fields.get('_triggerDelta')
    if not finite(value) or abs(value) > 1e6:
        return False
    expected = [dict(path='/_triggerDelta',CN=value,JP=struct.unpack('<f',struct.pack('<f',value))[0])]
    return (owner.get('status') == 'shared-field-mismatch' and owner.get('sharedFieldDifferences') == expected
        and owner.get('schemaDifferences') == ACTION_SCHEMA_DIFFERENCES and owner.get('jpEnabled') == 1
        and owner.get('hierarchyStatus') == 'resolved' and owner.get('jpNodeSha256')
        and owner.get('gameObjectPathID') == skill_owner.get('gameObjectPathID')
        and owner.get('ancestorGameObjects') == skill_owner.get('ancestorGameObjects'))


def load_multi_melee_contract(candidates, database_sha256):
    if not CONTRACT.is_file():
        return {}
    contract = read(CONTRACT)
    expected = {'priority':candidates['inputs']['prioritySha256'], 'enemyDatabase':database_sha256,
        **{key:candidates['sourceAnchors'][key]['sha256'] for key in ('catalog','ownership','encounters')}}
    if (not contract.get('bindingComplete') or not contract.get('sourceFingerprint')
            or any(contract.get('inputs',{}).get(key,{}).get('sha256') != value for key,value in expected.items())
            or not contract.get('candidates')
            or any(candidates['candidates'].get(key) != row for key,row in contract['candidates'].items())):
        raise ValueError('Multi-melee contract disagrees with the frozen source queue.')
    return contract


def compile_multi_melee_skill(candidate, enemy_context, modes, initial_mode, contract,
                             *, animation_of, animations, aliases):
    reject = lambda reason:dict(accepted=False, selection=None, rejections=[reason])
    if (not contract.get('bindingComplete') or not contract.get('sourceFingerprint')
            or contract.get('candidates',{}).get(candidate.get('id')) != candidate):
        return reject('missing-complete-multi-melee-contract')
    if enemy_context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-executor-retains-skill-ownership')
    for typename,name,value in (
            ('Torappu.Battle.AbilityStandard+SelectTargetSource','INPUT_TARGET',2),
            ('Torappu.Battle.AbilityStandard+SelectTargetTiming','AT_BEGINING',0),
            ('Torappu.Battle.Abilities.AbstractAnimatedAbility+TimeMode','FROM_ATTACK_SPEED',0),
            ('Torappu.AttributeType','DEF_PENETRATE',17),
            ('Torappu.AttributeModifierData+AttributeModifier+FormulaItemType','ADDITION',0)):
        if contract.get('metadataEnums',{}).get(typename,{}).get(name,{}).get('value') != value:
            return reject('unresolved-multi-melee-native-enums')
    indices,provider,owner = candidate.get('modeIndices'),candidate.get('provider',{}),candidate.get('ownership',{})
    if (not indices or indices != sorted(set(indices)) or indices != provider.get('modeIndices')
            or any(type(i) is not int or i < 0 or str(i) not in modes for i in indices)
            or type(initial_mode) is not int or str(initial_mode) not in modes
            or not provider.get('structurallyMounted') or provider.get('structuralLocation') != 'mode-subtree'
            or not owned_component(owner,indices) or owner.get('componentKey') != candidate['sourceRef']['componentKey']):
        return reject('unresolved-multi-melee-owner')
    sf = candidate.get('skillFields',{})
    if candidate.get('triggerType') != 'SelectorTrigger' or field_contract(sf,SKILL_FIELDS,{'_trigger'}):
        return reject('unsupported-multi-melee-skill-or-trigger')
    group = {t:[] for t in (ENEMY_SKILL,MULTI,CAST_BUFF,EMITTER)}
    catalog = contract['catalog'][candidate['enemyId']]['components']
    ownership = contract['ownership'][candidate['enemyId']]['components']
    for key,component in candidate.get('sameGameObjectComponents',{}).items():
        t = component.get('scriptType')
        schema = ACTION_SCHEMA_DIFFERENCES if t == MULTI else ([
            dict(path='/_buffs/0/isGroundBoundable',onlyIn='CN',value=0)] if t == CAST_BUFF else [])
        is_owned = owned_interval_component(ownership.get(key,{}),owner,component.get('fields',{}),indices) if t == MULTI else owned_component(ownership.get(key,{}),indices,schema)
        if (t not in group or component.get('serializedGraphs') or catalog.get(key) != component
                or not is_owned
                or ownership[key].get('gameObjectPathID') != owner.get('gameObjectPathID')):
            return reject('unsupported-or-unowned-complete-multi-melee-sibling')
        group[t].append((key,component))
    if any(len(group[t]) != 1 for t in (ENEMY_SKILL,MULTI,CAST_BUFF)):
        return reject('ambiguous-multi-melee-source-group')
    if (group[ENEMY_SKILL][0][0] != candidate['sourceRef']['componentKey']
            or group[ENEMY_SKILL][0][1]['fields'] != sf or candidate.get('actionTypes')
            or set(candidate.get('abilityTypes',[])) != {t.rsplit('.',1)[-1] for t,rows in group.items() if rows and t != ENEMY_SKILL}):
        return reject('incomplete-multi-melee-source-group')
    for _,component in group[EMITTER]:
        f = component['fields']
        if set(f) != EMITTER_FIELDS or any(f[k] for k in ('_convertCastEndToAttachFinish','_recalculatePlaybackSpeed','_preDelayFactor')):
            return reject('multi-melee-presentation-affects-lifecycle')
    action_key,component = group[MULTI][0]
    f = component['fields']
    if field_contract(f,ACTION_FIXED,ACTION_VARIABLE):
        return reject('unsupported-complete-multi-melee-action-fields')
    if (type(f['_additionalTimes']) is not int or not 1 <= f['_additionalTimes'] < 64
            or not finite(f['_triggerDelta']) or f['_triggerDelta'] <= 0):
        return reject('invalid-multi-melee-interval-or-count')
    deps = candidate.get('componentDependencies',{})
    trigger = reference_component(sf['_trigger'],deps)
    if (not trigger or set(deps) != {trigger[0]} or trigger[1].get('scriptType') != TRIGGER
            or trigger[1].get('serializedGraphs') or catalog.get(trigger[0]) != trigger[1]
            or not owned_component(ownership.get(trigger[0],{}),indices)
            or owner['gameObjectPathID'] not in [r.get('pathID') for r in ownership[trigger[0]].get('ancestorGameObjects',[])]
            or field_contract(trigger[1].get('fields'),dict(TRIGGER_FIXED,_minTargetNum=1))):
        return reject('unresolved-multi-melee-input-target-trigger')
    sources = candidate.get('databaseSkillBindings',[])
    if len(sources) != 1:
        return reject('ambiguous-multi-melee-database-binding')
    source = sources[0]
    if (set(source) != {'prefabKey','priority','cooldown','initCooldown','spCost','blackboard'}
            or not isinstance(source['prefabKey'],str) or not source['prefabKey']
            or source['prefabKey'].casefold() != candidate.get('name','').casefold()
            or sum(row == source for row in enemy_context.get('sourceSkills') or []) != 1
            or not finite(source['priority']) or type(source['spCost']) is not int or source['spCost'] <= 0
            or source['cooldown'] != 0 or source['initCooldown'] != 0):
        return reject('unsupported-multi-melee-source-skill-data')
    board = {}
    for row in source['blackboard']:
        if (set(row)-{'key','value','valueStr'} or row.get('key') not in {'times','def_penetrate','atk_scale'}
                or row['key'] in board or row.get('valueStr') is not None or not finite(row.get('value'))):
            return reject('unsupported-multi-melee-blackboard')
        board[row['key']] = row['value']
    count = board.get('times',f['_additionalTimes']+1)
    if (count != int(count) or not 2 <= count <= 64 or not 0 <= board.get('def_penetrate',-1) <= 1
            or board.get('atk_scale',f['_atkScale']) <= 0):
        return reject('invalid-multi-melee-blackboard-value')
    cast_key,cast = group[CAST_BUFF][0]
    if set(cast['fields']) != {'_buffs'} or len(cast['fields']['_buffs']) != 1 or len(f['_activeBuffs']) != 1:
        return reject('unsupported-complete-cast-or-hit-buff-set')
    cast_buff,hit_buff = cast['fields']['_buffs'][0],f['_activeBuffs'][0]
    if (field_contract(cast_buff,dict(BUFF_FIXED,attributes=CAST_ATTRIBUTES,lifeTimeType=2,templateKey='empty'),{'buffKey'})
            or not cast_buff['buffKey'] or field_contract(hit_buff,dict(BUFF_FIXED,lifeTimeType=0),{'buffKey','templateKey'})
            or not hit_buff['buffKey'] or not hit_buff['templateKey']):
        return reject('unsupported-complete-cast-or-hit-buff-fields')
    declarations = [dict(componentKey=action_key,fieldPath='/_activeBuffs/0',fields=hit_buff,templateRef=hit_buff['templateKey']),
        dict(componentKey=cast_key,fieldPath='/_buffs/0',fields=cast_buff,templateRef='empty')]
    if candidate.get('buffDeclarations') != declarations:
        return reject('incomplete-multi-melee-buff-declarations')
    empty = dict(templateKey='empty',effectKey='',onEventPriority='DEFAULT',eventToActions={})
    template = contract.get('templates',{}).get(hit_buff['templateKey'],{})
    events = template.get('eventToActions',{})
    if (contract.get('templates',{}).get('empty') != empty
            or set(template) != set(empty) or template['templateKey'] != hit_buff['templateKey']
            or template['effectKey'] != '' or template['onEventPriority'] != 'DEFAULT'
            or set(events) != {'ON_BUFF_START'} or len(events['ON_BUFF_START']) != 1
            or field_contract(events['ON_BUFF_START'][0],EFFECT_FIXED,{'_effectKey'})
            or not events['ON_BUFF_START'][0]['_effectKey']):
        return reject('unsupported-complete-multi-melee-hit-effect-template')
    timing = animation_of(animations,f['_animKey'],aliases,allow_multiple=True)
    frozen = animation_of(contract['animationBindings'][candidate['enemyId']]['source']['animations'],f['_animKey'],{},allow_multiple=True)
    if (not timing or timing != frozen or not finite(timing.get('duration')) or timing['duration'] <= 0
            or len(timing.get('observedHits',[])) != 1
            or not 0 <= timing['observedHits'][0] <= timing['duration']):
        return reject('unresolved-single-event-multi-melee-animation')
    timing = dict(timing,hit=timing['observedHits'][0],hitSequenceContract='first-event-then-fixed-interval-v1')
    sp,error = compile_attack_recovery(candidate,modes,contract)
    if error:
        return reject(error)
    action = dict(timing=timing,atkScale=f['_atkScale'],atkScaleKey=f['_atkScaleKey'],damageType='phys',delivery='direct',
        timeMode=0,minAnimScale=.1,maxAnimScale=-1,affectedBySlowDown=True,interruptOnDetach=False,
        repeat=dict(key='times',default=f['_additionalTimes']+1,interval=f['_triggerDelta'],clock='cast-clock',evidenceLevel='Inferred'),
        castBuff=dict(buffKey=cast_buff['buffKey'],kind='def-penetrate',key='def_penetrate',default=board['def_penetrate'],
            scope='casting',lifetime='cast-start-to-finish'),
        finalHitEffect=dict(effectKey=events['ON_BUFF_START'][0]['_effectKey'],isDamageMissable=False),
        selectTargetSource=2,selectTargetTiming=0,alwaysIncludeTarget=True,allowNoTarget=False)
    selection = dict(id=candidate['id'],candidateId=candidate['id'],enemyId=candidate['enemyId'],
        kind='selector-sp-multi-melee',skillKey=source['prefabKey'],modeIndices=indices,
        priority=source['priority'],spCost=source['spCost'],cooldown=0,initCooldown=0,cooldownStarts='cast-start',
        blackboard=board,allowedBlackboardKeys=['atk_scale','def_penetrate','times'],
        trigger=dict(kind='selector',minTargets=1,keepTarget=False,searchTargetTick=-1),
        selector=dict(kind='input-blocker',maxTargets=dict(key=None,default=1)),action=action,
        flags={key[1:]:value for key,value in SKILL_FIELDS.items()},spContract=sp,
        sourceRef=candidate['sourceRef'],sourceRefs=[candidate['sourceRef'],dict(path=str(CONTRACT.relative_to(ROOT)),
            sourceFingerprint=contract['sourceFingerprint'],candidateId=candidate['id'])],
        initiallyMounted=initial_mode in indices,automaticModeTransitionComplete=False,enemyImplementationComplete=False,
        presentation=[deepcopy(row['fields']) for _,row in group[EMITTER]],originalVisualsComplete=False,
        boundary='Complete cast Buff and interval melee body only. Reborn entry is pending; no automatic encounter phase claim. '
            'Repeated-hit interval, input-blocker bridge and cross-snapshot ownership are Inferred, not native timing equivalence.')
    return dict(accepted=True,selection=selection,rejections=[])
