"""Compile complete source-owned cooldown / direct area melee skills.

Only a focused frozen source contract can extend the fixed EnemySkill queue.
Accepting a source BOSS component does not claim its other skills or phase logic,
and never takes ownership from a dedicated executor.
"""
from copy import deepcopy

from enemy_skill_dispatch import (ROOT, SKILL_FIXED, ENEMY_SKILL, TRIGGER,
    TRIGGER_FIXED, EMITTER, EMITTER_FIELDS, DAMAGE_TYPES, finite, field_contract,
    reference_component, read)
from enemy_self_cast_skills import DORMANT_FIXED, MELEE
from enemy_periodic_abilities import (ADVANCED,
    SELECTOR_FIXED as PERIODIC_SELECTOR_FIXED, compile_circle_range)

RULE = 'selector-cooldown-direct-area-melee-complete-group-v1'
CONTRACT = ROOT / 'work/enemy-area-melee-contract.json'
ACTION_VARIABLE = {'_selector', '_animKey', '_atkScale', '_damageType'}
ACTION_FIXED = {key: value for key, value in DORMANT_FIXED.items() if key not in ACTION_VARIABLE}
ACTION_FIXED.update(_selectTargetTiming=1, _selectTargetSource=1,
    _allowNoTarget=1, _maxAnimScale=1, _elementDamageType=0, _endAnimKey='Idle')
SELECTOR_FIXED = dict(PERIODIC_SELECTOR_FIXED, _abnormalFlag=20, _abnormalCombo=1)
CIRCLE_RANGE = 'Torappu.Battle.CircleRange'
ACTION_SCHEMA_DIFFERENCES = [
    {'path': '/_affectedBySlowDown', 'onlyIn': 'CN', 'value': 1},
    {'path': '/_checkFaceToFirstCastTargetDownAttack', 'onlyIn': 'CN', 'value': 0}]
SELECTOR_SCHEMA_DIFFERENCES = [
    {'path': '/_excludeAbnormalFlag', 'onlyIn': 'CN', 'value': 46},
    {'path': '/_excludeSomeAbnormalFlags', 'onlyIn': 'CN', 'value': 0},
    {'path': '/_ignoreMotionMode', 'onlyIn': 'CN', 'value': 0}]


def load_area_melee_contract(candidates):
    if not CONTRACT.is_file():
        return {}
    contract = read(CONTRACT)
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return {}
    # Reuse the frozen queue's already checked source receipts. Do not rescan
    # the 189-enemy catalog, original bundles or native code on every build.
    expected = {'priority': candidates['inputs']['prioritySha256'],
        **{key: candidates['sourceAnchors'][key]['sha256'] for key in ('catalog', 'ownership', 'encounters')}}
    inputs = contract.get('inputs', {})
    if any(inputs.get(key, {}).get('sha256') != value for key, value in expected.items()):
        raise ValueError('Area melee source contract belongs to changed frozen queue inputs.')
    frozen = contract.get('candidates', {})
    if not frozen or any(candidates['candidates'].get(key) != row for key, row in frozen.items()):
        raise ValueError('Area melee source components do not match the fixed EnemySkill queue.')
    return contract


def owned_component(owner, indices, allowed_schema=()):
    return (owner.get('status') == 'shared-fields-match'
        and owner.get('ownershipOverlayEligible') and owner.get('jpEnabled') == 1
        and not owner.get('sharedFieldDifferences')
        and owner.get('schemaDifferences') in ([], list(allowed_schema))
        and owner.get('modeIndicesFromAncestorGameObjects') == indices)


def compile_area_melee_skill(candidate, enemy_context, modes, initial_mode, contract,
                             *, timing_of, animations, aliases):
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return reject('missing-complete-area-melee-contract')
    if candidate.get('id') not in contract.get('candidates', {}):
        return reject('not-in-focused-area-melee-contract')
    enums = contract.get('metadataEnums', {})
    for typename, name, value in (
            ('Torappu.Battle.AbilityStandard+SelectTargetSource', 'FROM_OWNER', 1),
            ('Torappu.Battle.AbilityStandard+SelectTargetTiming', 'BEFORE_SPELL_START', 1),
            ('Torappu.Battle.Abilities.AbstractAnimatedAbility+TimeMode', 'FROM_ATTACK_SPEED', 0)):
        if enums.get(typename, {}).get(name, {}).get('value') != value:
            return reject('unresolved-area-melee-native-enum-contract')
    if enemy_context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-executor-retains-skill-ownership')
    if candidate.get('triggerType') != 'SelectorTrigger':
        return reject('unsupported-area-melee-trigger')
    owner, provider = candidate.get('ownership', {}), candidate.get('provider', {})
    indices = candidate.get('modeIndices')
    if (not indices or any(type(index) is not int or index < 0 or str(index) not in modes for index in indices)
            or indices != sorted(set(indices)) or indices != provider.get('modeIndices')
            or type(initial_mode) is not int or initial_mode not in indices):
        return reject('area-melee-requires-compiled-initial-owner-mode')
    if (not owned_component(owner, indices) or not provider.get('structurallyMounted')
            or provider.get('structuralLocation') != 'mode-subtree'
            or owner.get('componentKey') != candidate.get('sourceRef', {}).get('componentKey')):
        return reject('unresolved-or-inactive-area-melee-owner')
    sf = candidate.get('skillFields', {})
    if field_contract(sf, SKILL_FIXED, {'_trigger'}):
        return reject('unsupported-complete-area-melee-skill-fields')
    members = candidate.get('sameGameObjectComponents', {})
    required = {ENEMY_SKILL: [], MELEE: [], EMITTER: []}
    for key, component in members.items():
        typename = component.get('scriptType')
        if typename not in required or component.get('serializedGraphs'):
            return reject('unsupported-complete-area-melee-sibling:' + str(typename))
        required[typename].append((key, component))
    if len(required[ENEMY_SKILL]) != 1 or len(required[MELEE]) != 1:
        return reject('ambiguous-area-melee-skill-or-action')
    if set(candidate.get('abilityTypes', [])) != {key.rsplit('.', 1)[-1]
            for key, rows in required.items() if key != ENEMY_SKILL and rows}:
        return reject('incomplete-declared-area-melee-ability-group')
    if (required[ENEMY_SKILL][0][0] != candidate['sourceRef']['componentKey']
            or required[ENEMY_SKILL][0][1].get('fields') != sf):
        return reject('area-melee-skill-declaration-binding-mismatch')
    for _, emitter in required[EMITTER]:
        fields = emitter.get('fields', {})
        if (set(fields) != EMITTER_FIELDS
                or any(fields[key] for key in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor'))):
            return reject('area-melee-presentation-affects-lifecycle')
    action_key, component = required[MELEE][0]
    fields = component.get('fields', {})
    if field_contract(fields, ACTION_FIXED, ACTION_VARIABLE):
        return reject('unsupported-complete-area-melee-action-fields')
    if candidate.get('buffDeclarations') or candidate.get('actionTypes'):
        return reject('unhandled-area-melee-buffs-or-extra-actions')
    dependencies = candidate.get('componentDependencies', {})
    trigger_ref = reference_component(sf['_trigger'], dependencies)
    selector_ref = reference_component(fields['_selector'], dependencies)
    if not trigger_ref or trigger_ref[1].get('scriptType') != TRIGGER:
        return reject('unresolved-area-melee-selector-trigger')
    if not selector_ref or selector_ref[1].get('scriptType') != ADVANCED:
        return reject('unresolved-area-melee-advanced-selector')
    if set(dependencies) != {trigger_ref[0], selector_ref[0]} or any(
            row.get('serializedGraphs') for row in dependencies.values()):
        return reject('unhandled-area-melee-selector-dependencies')
    trigger, selector = trigger_ref[1]['fields'], selector_ref[1]['fields']
    if field_contract(trigger, TRIGGER_FIXED, {'_minTargetNum'}):
        return reject('unsupported-area-melee-trigger-fields')
    minimum = trigger['_minTargetNum']
    if type(minimum) is not int or not 1 <= minimum <= 64:
        return reject('invalid-area-melee-trigger-minimum')
    if field_contract(selector, SELECTOR_FIXED):
        return reject('unsupported-complete-area-melee-selector-fields')
    bindings = candidate.get('databaseSkillBindings', [])
    if len(bindings) != 1:
        return reject('ambiguous-area-melee-database-skill-binding')
    source = bindings[0]
    skill_key = source.get('prefabKey')
    if (not isinstance(skill_key, str) or not skill_key or skill_key.casefold() != candidate.get('name', '').casefold()
            or sum(row == source for row in enemy_context.get('sourceSkills') or []) != 1):
        return reject('area-melee-source-skill-name-or-parameters-mismatch')
    if set(source) != {'prefabKey', 'priority', 'cooldown', 'initCooldown', 'spCost', 'blackboard'}:
        return reject('unclassified-area-melee-database-skill-fields')
    if (not finite(source['priority']) or type(source['spCost']) is not int or source['spCost'] != 0
            or not finite(source['cooldown']) or source['cooldown'] < 0
            or not finite(source['initCooldown']) or source['initCooldown'] < 0):
        return reject('unsupported-area-melee-cooldown-or-sp-parameters')
    board = {}
    if not isinstance(source['blackboard'], list):
        return reject('invalid-area-melee-blackboard')
    for entry in source['blackboard']:
        if (set(entry) - {'key', 'value', 'valueStr'} or entry.get('key') not in {'atk_scale', 'range_radius'}
                or entry.get('key') in board or entry.get('valueStr') is not None or not finite(entry.get('value'))):
            return reject('unhandled-area-melee-blackboard-key-or-value')
        board[entry['key']] = entry['value']
    if (not finite(fields['_atkScale']) or fields['_atkScale'] <= 0
            or board.get('atk_scale', fields['_atkScale']) <= 0 or fields['_damageType'] not in DAMAGE_TYPES):
        return reject('invalid-area-melee-damage-parameters')
    if 'range_radius' not in board or board['range_radius'] <= 0:
        return reject('requires-explicit-positive-source-area-melee-range-radius')
    # Geometry, native event/selection contracts and animation are bound below;
    # source BOSS rank alone never widens these structural requirements.
    return compile_bound_action(candidate, enemy_context, modes, contract, required,
        trigger_ref, selector_ref, board, timing_of, animations, aliases)


def compile_bound_action(candidate, enemy_context, modes, contract, required,
                         trigger_ref, selector_ref, board, timing_of, animations, aliases):
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    binding = contract.get('bindings', {}).get(candidate['id'], {})
    ownership = binding.get('ownership', {})
    catalog = contract.get('catalog', {}).get(candidate['enemyId'], {}).get('components', {})
    if not binding.get('bindingComplete') or not contract.get('runtimeContract'):
        return reject('area-melee-source-binding-not-complete')
    action_key, action_component = required[MELEE][0]
    fields = action_component['fields']
    indices = candidate['modeIndices']
    source = candidate['databaseSkillBindings'][0]
    skill_owner = candidate['ownership']
    for key, component in candidate['sameGameObjectComponents'].items():
        owner = ownership.get('components', {}).get(key, {})
        schema = ACTION_SCHEMA_DIFFERENCES if component['scriptType'] == MELEE else ()
        if (catalog.get(key) != component or not owned_component(owner, indices, schema)
                or owner.get('gameObjectPathID') != skill_owner.get('gameObjectPathID')):
            return reject('incomplete-area-melee-action-ownership')
    selector_key, selector_component = selector_ref
    selector_owner = ownership.get('components', {}).get(selector_key, {})
    if (not owned_component(selector_owner, indices, SELECTOR_SCHEMA_DIFFERENCES)
            or skill_owner['gameObjectPathID'] not in [row.get('pathID') for row in selector_owner.get('ancestorGameObjects', [])]):
        return reject('area-melee-selector-not-owned-by-source-skill')
    rows = binding.get('selectorComponents', [])
    components = {row.get('componentKey'): row.get('component', {}) for row in rows}
    range_key = binding.get('roles', {}).get('physicsRange')
    if (len(rows) != 3 or len(components) != 3
            or set(components) != {range_key, selector_key, trigger_ref[0]}
            or components.get(selector_key) != selector_component or components.get(trigger_ref[0]) != trigger_ref[1]):
        return reject('incomplete-area-melee-selector-range-trigger-group')
    range_component = components.get(range_key, {})
    if (range_component.get('scriptType') != CIRCLE_RANGE
            or field_contract(range_component.get('fields'), {'_extendable': 0, '_scaleble': 0})):
        return reject('unsupported-complete-area-melee-circle-range')
    for key, component in components.items():
        owner = ownership.get('components', {}).get(key, {})
        schema = SELECTOR_SCHEMA_DIFFERENCES if key == selector_key else ()
        if (catalog.get(key) != component or component.get('serializedGraphs')
                or not owned_component(owner, indices, schema)
                or owner.get('gameObjectPathID') != selector_owner.get('gameObjectPathID')):
            return reject('incomplete-area-melee-selector-component-ownership')
    source_range = binding.get('sourceRange', {})
    geometry_keys = {'shape', 'radius', 'offset', 'allAncestorScalesIdentity'}
    if (set(source_range) != geometry_keys | {'effectiveRadiusFromDatabase', 'radiusKey'}
            or source_range.get('effectiveRadiusFromDatabase') != board['range_radius']
            or source_range.get('radiusKey') != 'range_radius'):
        return reject('area-melee-effective-radius-disagrees-with-source-binding')
    geometry_binding = dict(binding, sourceRange={key: source_range[key] for key in geometry_keys})
    geometry, error = compile_circle_range(geometry_binding, selector_key, ownership)
    if error:
        return reject('area-melee-' + error)
    # Check the actual Unity GO inventory as well as the classified components,
    # so an unclassified collider/provider cannot disappear from the contract.
    go = binding.get('selectorGameObject', {})
    go_fields = go.get('fields', {})
    siblings = binding.get('selectorGameObjectSiblings', [])
    expected_ids = {str(row['pathID']) for row in components.values()} | {
        str(binding['colliders'][0]['pathId']), str(binding['transformChain'][0]['pathId'])}
    if (go.get('pathId') != selector_owner.get('gameObjectPathID') or go.get('unityType') != 'GameObject'
            or field_contract(go_fields, {'m_Layer': 12, 'm_Tag': 0, 'm_IsActive': True}, {'m_Name', 'm_Component'})
            or len(siblings) != len(expected_ids) or {str(row.get('pathId')) for row in siblings} != expected_ids
            or go_fields['m_Component'] is None or len(go_fields['m_Component']) != len(expected_ids)
            or {str(row.get('component', {}).get('m_PathID')) for row in go_fields['m_Component']} != expected_ids
            or any(row.get('component', {}).get('m_FileID') != 0 for row in go_fields['m_Component'])):
        return reject('unhandled-area-melee-unity-selector-sibling')
    raw_by_id = {str(row['pathId']): row for row in siblings}
    for exact in (binding['colliders'][0], binding['transformChain'][0]):
        if any(raw_by_id[str(exact['pathId'])].get(key) != exact.get(key) for key in ('pathId', 'unityType', 'fields')):
            return reject('area-melee-geometry-sibling-disagreement')
    for key, component in components.items():
        raw = raw_by_id[str(component['pathID'])]
        raw_fields = raw.get('fields', {})
        fields_cn = component['fields']
        removed = {row['path'][1:] for row in ownership['components'][key].get('schemaDifferences', [])}
        expected_fields = {k: v for k, v in fields_cn.items() if k not in removed}
        expected_fields.update(m_GameObject={'m_FileID': 0, 'm_PathID': selector_owner['gameObjectPathID']},
            m_Enabled=1, m_Script={'m_FileID': 1, 'm_PathID': component['scriptPathID']}, m_Name='')
        if raw.get('unityType') != 'MonoBehaviour' or raw_fields != expected_fields:
            return reject('area-melee-raw-selector-component-disagreement')
    radius = board['range_radius']
    if not finite(radius) or radius <= 0:
        return reject('invalid-area-melee-range-radius')
    timing = timing_of(animations, fields, aliases, action_component.get('scriptPathID'))
    if (not timing or timing.get('hits') or not finite(timing.get('duration')) or timing['duration'] <= 0
            or not finite(timing.get('hit')) or not 0 <= timing['hit'] <= timing['duration']
            or timing.get('observedHits', [timing.get('hit')]) != [timing.get('hit')]):
        return reject('unresolved-single-event-area-melee-animation')
    source_animation = contract.get('animationBindings', {}).get(candidate['enemyId'], {})
    frozen_timing = timing_of(source_animation.get('source', {}).get('animations', {}), fields,
        {}, action_component.get('scriptPathID'))
    receipt = source_animation.get('timing', {})
    if (timing != frozen_timing or source_animation.get('animation') != fields['_animKey']
            or any(timing.get(key) != receipt.get(key) for key in ('animation', 'duration', 'hit'))
            or receipt.get('hitTimes') != [timing['hit']]
            or receipt.get('events') != [{'t': timing['hit'], 'event': 'OnAttack'}]):
        return reject('area-melee-animation-disagrees-with-frozen-source')
    timing_binding = contract.get('timingBindings', {}).get(candidate['id'], {})
    runtime = contract['runtimeContract']
    if (timing_binding.get('animationBinding') != candidate['enemyId']
            or timing_binding.get('timeMode') != fields['_timeMode']
            or timing_binding.get('sourceTimeMode') != 'FROM_ATTACK_SPEED'
            or timing_binding.get('maxAnimScale') != fields['_maxAnimScale']
            or timing_binding.get('minAnimScale') != .1
            or any(timing_binding.get(key) != timing[key] for key in ('duration', 'hit'))
            or timing_binding.get('hitTimes') != [timing['hit']]
            or runtime.get('cooldownReset', {}).get('at') != 'successful-cast-start'
            or runtime.get('initialTimer', {}).get('waitFirstPeriod') is not True):
        return reject('unsupported-native-area-melee-timer-or-playback-contract')
    cast = runtime.get('cast', {})
    if (cast.get('selectorSource') != 'FROM_OWNER' or cast.get('selectTargetTiming') != 'BEFORE_SPELL_START'
            or cast.get('alwaysIncludeTarget') is not True or cast.get('allowNoTarget') is not True
            or cast.get('interruptIfTargetDead') is not False or cast.get('interruptOnDetach') is not False):
        return reject('unsupported-native-area-melee-target-selection-contract')
    targeting = runtime.get('targeting', {})
    include = targeting.get('alwaysIncludeTargetRule', {})
    if (targeting.get('shape') != 'circle' or targeting.get('center') != 'owner-current-position'
            or targeting.get('rangeRadius', {}).get('key') != 'range_radius'
            or include.get('then') != 'if list nonempty remove its last element; append inputTarget'
            or include.get('ignoreRangeForIncludedInput') is not True
            or include.get('ignoreCamouflageForIncludedInput') is not True):
        return reject('unsupported-native-area-melee-range-or-input-target-contract')
    action = dict(timing=timing, atkScale=fields['_atkScale'], atkScaleKey=fields['_atkScaleKey'],
        damageType=DAMAGE_TYPES[fields['_damageType']], delivery='direct',
        timeMode=fields['_timeMode'], maxAnimScale=fields['_maxAnimScale'], minAnimScale=.1,
        affectedBySlowDown=bool(fields['_affectedBySlowDown']),
        selectTargetTiming=fields['_selectTargetTiming'], selectTargetSource=fields['_selectTargetSource'],
        alwaysIncludeTarget=bool(fields['_alwaysIncludeTarget']), allowNoTarget=bool(fields['_allowNoTarget']),
        alwaysPutIncludeTargetFirst=bool(fields['_alwaysPutIncludeTargetFirst']),
        interruptOnDetach=bool(fields['_interruptAbilityOnDetach']),
        sourceTimeMode='FROM_ATTACK_SPEED', sourceTargetTiming='BEFORE_SPELL_START', sourceTargetSource='FROM_OWNER')
    selector = selector_component['fields']
    selection = dict(id=candidate['id'], candidateId=candidate['id'], enemyId=candidate['enemyId'],
        kind='selector-cooldown-area-melee', skillKey=source['prefabKey'], modeIndices=indices,
        priority=source['priority'], spCost=0, cooldown=source['cooldown'], initCooldown=source['initCooldown'],
        cooldownStarts='cast-start',
        blackboard=board, allowedBlackboardKeys=['atk_scale', 'range_radius'],
        trigger=dict(kind='selector', minTargets=trigger_ref[1]['fields']['_minTargetNum'], keepTarget=False, searchTargetTick=-1),
        selector=dict(kind='advanced-circle', sourceRule='owner-circle-all-opponents-v1',
            range=dict(kind='circle', radius=dict(key='range_radius', default=radius), sourceColliderRadius=geometry['radius']),
            includeTargetPolicy='replace-last-if-absent',
            targetSide=selector['_targetSide'], targetMotion=selector['_targetMotion'], targetCategory=selector['_targetCategory'],
            postFilter=selector['_postFilter'], ignoreHitRange=False, ignoreTargetFree=False),
        action=action, flags={key[1:]: value for key, value in SKILL_FIXED.items()},
        sourceRef=candidate['sourceRef'], sourceRefs=[candidate['sourceRef'],
            dict(path=str(CONTRACT.relative_to(ROOT)), sourceFingerprint=contract['sourceFingerprint'],
                candidateId=candidate['id'], roles=dict(meleeAbility=action_key, trigger=trigger_ref[0],
                    selector=selector_key, circleRange=range_key))],
        initiallyMounted=True, nameBindingEvidenceLevel='Inferred', ownershipEvidenceLevel='Inferred',
        sourceRank=enemy_context.get('sourceLevelType'), dedicatedExecutorOwnershipRetained=True,
        enemyImplementationComplete=False, automaticModeTransitionComplete=False,
        presentation=[deepcopy(row['fields']) for _, row in required[EMITTER]], originalVisualsComplete=False,
        boundary='Complete source-owned cooldown area-melee component only. Positive source range_radius is required; owner-mode-range fallback is not substituted with the collider radius. Native cooldown reset at successful cast start, timing scale clamp, owner reselection and base-class input replacement are bound. Cross-snapshot mounting, cast/mode timer progression and the unreadable Melee override bridge remain explicit inferences. No sibling skills or whole enemy lifecycle are completed.')
    return dict(accepted=True, selection=selection, rejections=[])
