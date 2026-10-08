"""Complete self-cast skill families and their source-owned dormant modes.

This module consumes focused frozen contracts, not the full enemy inventory.
Zero-output dormant actions are represented by disabled channels: no synthetic
attack timestamp or minimum-damage packet is created for a blank animation.
"""
from copy import deepcopy
import hashlib
from pathlib import Path
import struct

from enemy_skill_dispatch import (ROOT, SKILL_FIXED, ENEMY_SKILL, finite, field_contract,
    reference_component, read, zeros)
from enemy_mode_blocked_provider import BUFF_DEFAULTS, ATTRIBUTE_KEYS
from enemy_mode_events import compile_mode_events

RULE = 'always-trigger-self-cast-complete-lifecycle-v1'
DORMANT_RULE = 'zero-output-blank-animation-mode-action-v1'
MELEE = 'Torappu.Battle.Abilities.MeleeAttack'
EMPTY = 'Torappu.Battle.Abilities.EmptyAnimatedAbility'
ALWAYS = 'Torappu.Battle.AlwaysTrigger'
BUFF_TO_OWNER = 'Torappu.Battle.Abilities.BuffToOwner'
PASSIVE = 'Torappu.Battle.Abilities.PassiveBuffAbility'
CONTRACT = ROOT / 'work/enemy-awake-contract.json'

DORMANT_FIXED = zeros('''_interruptAbilityOnDetach _ignoreIfOwnerDead _forceAsDmgOrHealAbility
    _interuptIfTargetDead _selectTargetTiming _timeMode _allowNoTarget _cooldown _preDelay _escapeTime
    _faceToDefault _faceToFront _faceToFirstCastTarget _checkFaceToFirstCastTargetDownAttack
    _forceFaceToDirection _onlyPlayEndAnimWhenIsLastAbility _ignorePalsyInterrupt _atkScale
    _epDamageRatio _useDynamicAttackType _deliveryParaWhenReplaceActionNode _extraDamageType
    _alwaysPutIncludeTargetFirst''',
    _selector={'m_FileID': 0, 'm_PathID': 0}, _metadata={'namedAsAlias': '', 'blackboardPrefix': ''},
    _attachPassiveBuffsOnDummy=1, _waitForAttackEvent=1, _resetCdStrategy=1,
    _selectTargetSource=1, _alwaysIncludeTarget=1, _animKey='', _endAnimKey='',
    _downAnimKey='', _downEndAnimKey='', _upAnimKey='', _upEndAnimKey='',
    _cooldownKey='duration', _faceToTarget=1, _activeBuffs=[], _maxAnimScale=-1,
    _affectedBySlowDown=1, _atkScaleKey='atk_scale', _attackType=1,
    _elementDamageType=1, _damageType=1)


def dormant_mode_profiles(record, modes, missing_modes, script_types):
    """Resolve complete all-empty/dormant modes only; preserve every other gap."""
    output, unresolved, selections = deepcopy(modes), deepcopy(missing_modes), []
    if not record or record.get('complete') is not True:
        return output, unresolved, selections
    indices = [mode.get('modeIndex') for mode in record.get('modes', [])]
    if any(type(index) is not int or index < 0 for index in indices) or len(set(indices)) != len(indices):
        return output, unresolved, selections
    for mode in record.get('modes', []):
        index = mode.get('modeIndex')
        if type(index) is not int or index < 0 or str(index) in output:
            continue
        channels, selected = {}, []
        for key in ('combat', 'attack'):
            channel = mode.get('channels', {}).get(key, {})
            if channel.get('status') == 'absent':
                channels[key] = None
            elif (channel.get('status') == 'direct-damage-root'
                    and script_types.get(str(channel.get('scriptPathID'))) == MELEE
                    and field_contract(channel.get('fields'), DORMANT_FIXED) is None):
                channels[key] = None
                selected.append(dict(channel=key, pathID=str(channel.get('pathID')),
                    sourceFields=deepcopy(channel['fields']), rule=DORMANT_RULE,
                    evidenceLevel='Inferred',
                    basis='Complete source MeleeAttack has zero ATK scale, no attack animation, no Buffs or extra packets. Represent its lack of executable output as a disabled channel.'))
            else:
                break
        else:
            if selected:
                output[str(index)] = dict(modeIndex=index, channels=channels, sourceNoBasicAttack=True)
                unresolved.pop(str(index), None)
                selections.append(dict(modeIndex=index, channels=selected))
    return output, unresolved, selections


def load_self_cast_contract(candidates, source_hashes):
    if not CONTRACT.is_file():
        return {}
    contract = read(CONTRACT)
    if not contract.get('sourceFingerprint') or not contract.get('bindingComplete'):
        return {}
    # The source queue is not edited when a new shared family is attached.
    # This focused contract retains its own source anchors and full inputs.
    inputs = contract.get('inputs', {})
    expected = {'priority': candidates['inputs']['prioritySha256'],
        **{key: candidates['sourceAnchors'][key]['sha256'] for key in ('catalog', 'ownership', 'encounters')}}
    if any(inputs.get(key, {}).get('sha256') != value for key, value in expected.items()):
        raise ValueError('Focused self-cast contract belongs to changed source inputs; refresh that contract.')
    descriptor = inputs.get('templates', {})
    path = ROOT / descriptor.get('path', '')
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != descriptor.get('sha256'):
        raise ValueError('Focused self-cast Buff graph source changed; refresh that contract.')
    return contract


def empty_attributes(flags=()):
    return {key: list(flags) if key == 'abnormalFlags' else [] for key in ATTRIBUTE_KEYS}


def plain_buff(buff, *, flags=(), **overrides):
    expected = {**BUFF_DEFAULTS, 'attributes': empty_attributes(flags), 'blackboard': [], **overrides}
    return field_contract(buff, expected, {'buffKey', 'templateKey'}) is None


def empty_graph(graph):
    return (isinstance(graph, dict) and set(graph) == {'templateKey', 'effectKey', 'onEventPriority', 'eventToActions'}
            and graph['effectKey'] == '' and graph['onEventPriority'] == 'DEFAULT'
            and graph['eventToActions'] == {})


EMPTY_FIELDS = {key: value for key, value in DORMANT_FIXED.items() if key not in
    {'_atkScale', '_atkScaleKey', '_attackType', '_elementDamageType', '_epDamageRatio',
     '_useDynamicAttackType', '_deliveryParaWhenReplaceActionNode', '_damageType',
     '_extraDamageType', '_alwaysPutIncludeTargetFirst', '_animKey'}}
EMPTY_FIELDS.update(_timeMode=1, _alwaysIncludeTarget=0, _allowNoTarget=1, _faceToTarget=0, _maxAnimScale=1)
SELF_SKILL_FIELDS = dict(SKILL_FIXED, _maxTriggerTime=1, _addEnemyIdToSignalId=0)
BUFF_ACTION_FIELDS = dict(_extraCondition=0, _extraConditionTiming=4, _maxTarget=1,
                         _loadMaxTargetFromBlackboard=1, _onlyRunOnce=0)
PASSIVE_FIELDS = dict(_selector={'m_FileID': 0, 'm_PathID': 0},
    _metadata={'namedAsAlias': '', 'blackboardPrefix': ''}, _interruptAbilityOnDetach=0,
    _attachPassiveBuffsOnDummy=1, _ignoreIfOwnerDead=0, _forceAsDmgOrHealAbility=0)
NODE_PREFIX = 'Torappu.Battle.Action.Nodes+'


def node(name, **values):
    return {'$type': NODE_PREFIX + name + ', Assembly-CSharp', **values}


def compile_hp_listener(member, candidate, contract):
    """Compile the full mode passive plus its exact ordered HP-filter graph."""
    reject = lambda reason: (None, reason)
    record, ownership = member['catalog'], member['ownership']
    templates = contract.get('templates', {})
    listeners = []
    for key, component in record['components'].items():
        if component.get('scriptType') != PASSIVE:
            continue
        for buff in component.get('fields', {}).get('_buffs', []):
            graph = templates.get(buff.get('templateKey'), {})
            actions = graph.get('eventToActions', {}).get('ON_BUFF_TRIGGER', [])
            if actions and actions[0].get('$type') == NODE_PREFIX + 'FilterByTargetHpRatio, Assembly-CSharp':
                listeners.append((key, component, buff, graph))
    if len(listeners) != 1:
        return reject('ambiguous-full-hp-listener-provider')
    key, component, listener, graph = listeners[0]
    owner = ownership.get('components', {}).get(key, {})
    # CN decimal output and JP raw float32 decoding differ textually for .01.
    # Normalize only this actual serialized float field, never arbitrary source
    # differences or missing ownership. The original frozen overlay is retained.
    differences = owner.get('sharedFieldDifferences', [])
    precision_only = (len(differences) == 1 and differences[0].get('path') == '/_buffs/0/triggerInterval'
        and finite(differences[0].get('CN')) and finite(differences[0].get('JP'))
        and struct.pack('<f', differences[0]['CN']) == struct.pack('<f', differences[0]['JP']))
    ancestors = {row.get('pathID') for row in owner.get('ancestorGameObjects', [])}
    inferred_modes = [mode['modeIndex'] for mode in ownership.get('modeGameObjects', [])
                      if mode.get('gameObjectPathID') in ancestors]
    allowed_schema = [{'path': f'/_buffs/{index}/isGroundBoundable', 'onlyIn': 'CN', 'value': 0} for index in (0, 1)]
    owner_ok = ((owner.get('status') == 'shared-fields-match' and owner.get('ownershipOverlayEligible') and not differences)
                or (owner.get('status') == 'shared-field-mismatch' and precision_only))
    if (not owner_ok or owner.get('jpEnabled') != 1 or owner.get('hierarchyStatus') != 'resolved'
            or inferred_modes != candidate['modeIndices'] or owner.get('schemaDifferences') not in ([], allowed_schema)):
        return reject('unresolved-hp-listener-mode-owner')
    fields = component['fields']
    if field_contract(fields, PASSIVE_FIELDS, {'_buffs'}) or len(fields['_buffs']) != 2:
        return reject('unsupported-complete-hp-listener-siblings')
    if fields['_buffs'][0] != listener or not plain_buff(listener, flags=[11], triggerLifeType=2,
            triggerInterval=.01, waitFirstTriggerInterval=0):
        return reject('unsupported-complete-hp-listener-buff')
    sleep = fields['_buffs'][1]
    if not plain_buff(sleep, flags=[22], lifeTimeType=1, durationKey='unmove_duration'):
        return reject('unsupported-complete-sleep-buff')
    if not empty_graph(templates.get(sleep.get('templateKey'))):
        return reject('unhandled-sleep-buff-actions')
    actions = graph.get('eventToActions', {}).get('ON_BUFF_TRIGGER', [])
    if (set(graph) != {'templateKey', 'effectKey', 'onEventPriority', 'eventToActions'}
            or graph['effectKey'] != '' or graph['onEventPriority'] != 'DEFAULT'
            or set(graph['eventToActions']) != {'ON_BUFF_TRIGGER'} or len(actions) != 6):
        return reject('unsupported-complete-hp-listener-graph')
    mark_keys = actions[1].get('_buffKeys', [])
    if len(mark_keys) != 1 or not isinstance(mark_keys[0], str) or not mark_keys[0]:
        return reject('unresolved-awake-marker')
    mark_key = mark_keys[0]
    expected = [
        node('FilterByTargetHpRatio', _targetType='TARGET', _condType='LT', _value=0.0,
             _useSourceHpRatio=False, _sourceType='SOURCE', _blackboardPrefix=None),
        node('CheckContainsBuff', _targetType='BUFF_OWNER', _buffKeys=[mark_key], isAND=False,
             _loadFromBlackboard=False, _checkBuffSource=False, _buffSourceType='BUFF_SOURCE', _checkSourceHost=False),
        node('IfNot'), node('CheckEnemyUnbalanced', _targetType='BUFF_OWNER'), node('IfNot'),
        node('TriggerEnemySkill', _skillName=candidate['databaseSkillBindings'][0]['prefabKey'],
             _checkSkillActive=False, _checkSkillReady=False, _ownerType='BUFF_OWNER', _targetType='BUFF_OWNER',
             _interruptCurAbility=True, _interruptCurAbilityUnlessItIsExpectedAbility=False,
             _assignCombatAbility=False, _forceFindTargetBySkillSelector=False,
             _clearPalsyingBuffBeforeTrigger=True, _tryCastDirectlyWhenNoTarget=False)]
    if actions != expected:
        return reject('unsupported-ordered-hp-listener-actions')
    talents = [talent for talent in ownership.get('talentAndSkillComponents', {}).values()
               if talent.get('gameObjectPathID') == owner.get('gameObjectPathID')
               and talent.get('scriptResolution', {}).get('type') == 'Torappu.Battle.Talent']
    if len(talents) != 1 or talents[0].get('cnMatchStatus') != 'shared-fields-match':
        return reject('unresolved-hp-listener-parameter-scope')
    talent = talents[0]
    ancestors = talent.get('ancestorGameObjects', [])
    namespace = talent['fields'].get('_overwriteTalentKey') or (ancestors[0].get('name', '') if ancestors else '')
    if not namespace or talent['fields'].get('_defaultModeIndex') != -1:
        return reject('unsupported-hp-listener-talent-scope')
    source_board = member['priority'].get('sourceTalentBlackboard') or []
    matched = [prefix for prefix in (namespace, namespace.lower())
               if all(sum(row.get('key') == prefix + '.' + name for row in source_board) == 1
                      for name in ('hp_ratio', 'unmove_duration'))]
    matched = sorted(set(matched))
    if len(matched) != 1:
        return reject('ambiguous-hp-listener-blackboard-namespace')
    namespace = matched[0]
    values = {row['key']: row.get('value') for row in source_board}
    hp_key, duration_key = namespace + '.hp_ratio', namespace + '.unmove_duration'
    hp, duration = values[hp_key], values[duration_key]
    if not finite(hp) or not 0 < hp <= 1 or not finite(duration) or duration < 0:
        return reject('invalid-hp-listener-blackboard-parameters')
    return dict(kind='hp-listener-self-cast', modeIndex=candidate['modeIndices'][0],
        interval=listener['triggerInterval'], waitFirstInterval=bool(listener['waitFirstTriggerInterval']),
        hpRatio=dict(key=hp_key, default=hp), sleepDuration=dict(key=duration_key, default=duration),
        skillKey=candidate['databaseSkillBindings'][0]['prefabKey'], awakeMark=mark_key,
        flags=['DISARMED', 'UNMOVABLE_PRIVATE'],
        call={**{key[1:]: value for key, value in expected[-1].items() if key.startswith('_') and key not in
            {'_skillName', '_ownerType', '_targetType'}}, 'target': 'owner'},
        condition=dict(comparison='LT', requireNotUnbalanced=True, requireMarkAbsent=True),
        sourceRef=dict(path=str(CONTRACT.relative_to(ROOT)), enemyId=candidate['enemyId'], componentKey=key),
        scopeEvidenceLevel='Inferred', sleepLifetimeEvidenceLevel='Inferred-mode-attachment'), None


def compile_self_cast_skill(candidate, member, modes, initial_mode, contract, animations):
    """Compile the complete animation/mark/switch skill and its actual caller."""
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return reject('missing-complete-self-cast-source-contract')
    context = member['priority']
    if context.get('sourceLevelType') == 'BOSS' or context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-or-boss-lifecycle-not-supported')
    if candidate.get('triggerType') != 'AlwaysTrigger' or candidate.get('abilityTypes') != ['BuffToOwner', 'EmptyAnimatedAbility']:
        return reject('unsupported-complete-self-cast-family')
    owner, provider = candidate.get('ownership', {}), candidate.get('provider', {})
    indices = candidate.get('modeIndices')
    if (owner.get('status') != 'shared-fields-match' or not owner.get('ownershipOverlayEligible')
            or owner.get('jpEnabled') != 1 or owner.get('sharedFieldDifferences') or owner.get('schemaDifferences')
            or not provider.get('structurallyMounted') or provider.get('structuralLocation') != 'mode-subtree'
            or not indices or len(indices) != 1 or indices != owner.get('modeIndicesFromAncestorGameObjects')
            or indices != provider.get('modeIndices') or indices != [initial_mode]
            or str(initial_mode) not in modes):
        return reject('unresolved-initial-self-cast-mode-owner')
    if any(value is not None for value in modes[str(initial_mode)].get('channels', {}).values()):
        return reject('self-cast-requires-complete-dormant-mode')
    source_modes = [mode for mode in member['catalog'].get('cachedChannels', {}).get('modes', [])
                    if mode.get('modeIndex') == initial_mode]
    if len(source_modes) != 1 or source_modes[0].get('channels', {}).get('attack', {}).get('status') != 'absent':
        return reject('unresolved-dormant-normal-trigger-context')
    root = source_modes[0]['channels'].get('combat', {})
    source_components = member['catalog']['components']
    roots = [(key, row) for key, row in source_components.items() if str(row.get('pathID')) == str(root.get('pathID'))]
    if len(roots) != 1:
        return reject('ambiguous-dormant-normal-root')
    root_key, source_root = roots[0]
    ownerships = member['ownership'].get('components', {})
    root_owner = ownerships.get(root_key, {})
    siblings = [(key, row) for key, row in source_components.items()
                if ownerships.get(key, {}).get('gameObjectPathID') == root_owner.get('gameObjectPathID')]
    if (root_owner.get('status') != 'shared-fields-match' or not root_owner.get('ownershipOverlayEligible')
            or root_owner.get('jpEnabled') != 1 or root_owner.get('sharedFieldDifferences')
            or source_root.get('fields') != DORMANT_FIXED or len(siblings) != 2
            or sorted(row['scriptType'] for _, row in siblings) != sorted([MELEE, 'Torappu.Battle.NeverTrigger'])):
        return reject('unresolved-complete-dormant-never-trigger-group')
    never_key, never = next((key, row) for key, row in siblings if row['scriptType'] == 'Torappu.Battle.NeverTrigger')
    if (never.get('fields') != {} or never.get('serializedGraphs')
            or ownerships[never_key].get('status') != 'shared-fields-match'
            or ownerships[never_key].get('jpEnabled') != 1):
        return reject('unsupported-dormant-never-trigger')
    skill_fields = candidate.get('skillFields', {})
    if field_contract(skill_fields, SELF_SKILL_FIELDS, {'_trigger'}):
        return reject('unsupported-self-cast-skill-flags')
    components = candidate.get('sameGameObjectComponents', {})
    groups = {ENEMY_SKILL: [], EMPTY: [], BUFF_TO_OWNER: []}
    for key, component in components.items():
        if component.get('scriptType') not in groups or component.get('serializedGraphs'):
            return reject('unsupported-self-cast-complete-siblings')
        groups[component['scriptType']].append((key, component))
    if len(groups[ENEMY_SKILL]) != 1 or len(groups[EMPTY]) != 1 or len(groups[BUFF_TO_OWNER]) != 2:
        return reject('incomplete-self-cast-component-group')
    if (groups[ENEMY_SKILL][0][0] != candidate['sourceRef']['componentKey']
            or groups[ENEMY_SKILL][0][1].get('fields') != skill_fields):
        return reject('self-cast-declaration-mismatch')
    dependencies = candidate.get('componentDependencies', {})
    trigger = reference_component(skill_fields['_trigger'], dependencies)
    if (not trigger or set(dependencies) != {trigger[0]} or trigger[1].get('scriptType') != ALWAYS
            or trigger[1].get('fields') != {} or trigger[1].get('serializedGraphs')):
        return reject('unresolved-source-always-trigger')
    basic = groups[EMPTY][0][1]['fields']
    if field_contract(basic, EMPTY_FIELDS, {'_animKey'}):
        return reject('unsupported-empty-animated-ability-fields')
    animation = animations.get(basic['_animKey'], {})
    duration = animation.get('duration')
    if not basic['_animKey'] or not finite(duration) or duration <= 0 or animation.get('events'):
        return reject('unresolved-complete-self-cast-animation')
    bindings = candidate.get('databaseSkillBindings', [])
    if len(bindings) != 1:
        return reject('ambiguous-self-cast-name-binding')
    binding = bindings[0]
    if (set(binding) != {'prefabKey', 'priority', 'cooldown', 'initCooldown', 'spCost', 'blackboard'}
            or binding.get('prefabKey', '').casefold() != candidate.get('name', '').casefold()
            or binding.get('spCost') != 0 or binding.get('cooldown') != 0 or binding.get('initCooldown') != 0
            or binding.get('blackboard') not in (None, []) or not finite(binding.get('priority'))
            or sum(row == binding for row in context.get('sourceSkills') or []) != 1):
        return reject('unsupported-self-cast-database-parameters')
    lifecycle, error = compile_hp_listener(member, candidate, contract)
    if error:
        return reject(error)
    if any(lifecycle.get(key) != value for key, value in contract.get('runtimeContract', {}).items()):
        return reject('self-cast-runtime-contract-disagrees-with-full-source')
    events, declarations = {}, []
    for key, component in groups[BUFF_TO_OWNER]:
        fields = component['fields']
        if (field_contract(fields, BUFF_ACTION_FIELDS, {'_runActionOnEvent', '_buffs'})
                or len(fields['_buffs']) != 1 or fields['_runActionOnEvent'] not in (2, 3)):
            return reject('unsupported-full-self-cast-buff-event')
        buff = fields['_buffs'][0]
        declarations.append((key, buff))
        graph = contract.get('templates', {}).get(buff.get('templateKey'))
        if fields['_runActionOnEvent'] == 2:
            if (not plain_buff(buff, triggerLifeType=2) or buff['buffKey'] != lifecycle['awakeMark']
                    or not empty_graph(graph) or 'ON_CAST_START' in events):
                return reject('unsupported-complete-self-cast-start-marker')
            events['ON_CAST_START'] = [dict(kind='add-managed-mark', buffKey=buff['buffKey'])]
        else:
            board = buff.get('blackboard')
            if (not isinstance(board, list) or len(board) != 1 or board[0].get('key') != 'mode'
                    or set(board[0]) - {'key', 'value', 'valueStr'} or board[0].get('valueStr') not in (None, '')
                    or not finite(board[0].get('value')) or board[0]['value'] != int(board[0]['value'])):
                return reject('unsupported-self-cast-switch-parameters')
            if not plain_buff(buff, lifeTimeType=0, blackboard=board):
                return reject('unsupported-complete-self-cast-finish-buff')
            compiled = compile_mode_events(graph, board, [int(key) for key in modes], initial_mode,
                                           accepted_target_scope='TARGET', accepted_events={'ON_BUFF_START'})
            commands = compiled.get('events', {}).get('ON_BUFF_START')
            if (not compiled['accepted'] or set(compiled.get('events', {})) != {'ON_BUFF_START'}
                    or not commands or any(row.get('restartFSM') for row in commands) or 'ON_CAST_END' in events):
                return reject('unsupported-complete-self-cast-finish-graph')
            events['ON_CAST_END'] = commands
    expected_declarations = {(row['componentKey'], row['fieldPath']): row['fields']
                             for row in candidate.get('buffDeclarations', [])}
    if (len(expected_declarations) != 2 or any(expected_declarations.get((key, '/_buffs/0')) != buff
                                             for key, buff in declarations)
            or set(events) != {'ON_CAST_START', 'ON_CAST_END'}):
        return reject('incomplete-self-cast-buff-declarations')
    selection = dict(id=candidate['id'], candidateId=candidate['id'], enemyId=candidate['enemyId'],
        kind='always-self-cast', skillKey=binding['prefabKey'], modeIndices=indices,
        priority=binding['priority'], spCost=0, cooldown=0, initCooldown=0, blackboard={}, allowedBlackboardKeys=[],
        sourceTrigger='AlwaysTrigger', trigger=dict(kind='source-listener'), selector=dict(kind='self'),
        action=dict(kind='empty-animation', animation=basic['_animKey'], duration=duration, timeMode=1,
                    affectedBySlowDown=bool(basic['_affectedBySlowDown']),
                    interruptOnDetach=bool(basic['_interruptAbilityOnDetach'])),
        events=events, selfCastLifecycle=lifecycle,
        flags={key[1:]: value for key, value in SELF_SKILL_FIELDS.items()},
        sourceRef=candidate['sourceRef'], sourceRefs=[candidate['sourceRef'],
            dict(path=str(CONTRACT.relative_to(ROOT)), sourceFingerprint=contract.get('sourceFingerprint'))],
        initiallyMounted=True, nameBindingEvidenceLevel='Inferred', ownershipEvidenceLevel='Inferred',
        enemyImplementationComplete=False, automaticModeTransitionComplete=False,
        remainingMechanisms=['mode-1-passive-attributes', 'mode-1-periodic-self-damage', 'mode-1-scream-and-element-damage'],
        originalVisualsComplete=False)
    return dict(accepted=True, selection=selection, rejections=[])
