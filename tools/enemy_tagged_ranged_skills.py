"""Compile complete tagged-selector / loaded active-Buff ranged skills.

SP acquisition, target filters, active Buff loading and projectile execution are
one required source group. No enemy name chooses an implementation, and source
BOSS rank never overrides a dedicated executor's ownership.
"""
from copy import deepcopy

from enemy_skill_dispatch import (ROOT, SKILL_FIXED, ENEMY_SKILL, TRIGGER, TRIGGER_FIXED,
    RANGED, EMITTER, EMITTER_FIELDS, ACTION_FIXED as RANGED_FIXED,
    ACTION_VARIABLE as RANGED_VARIABLE, DAMAGE_TYPES, finite, field_contract,
    reference_component, read)
from enemy_area_melee_skills import owned_component, SELECTOR_SCHEMA_DIFFERENCES
from enemy_periodic_abilities import SELECTOR_FIXED as ADVANCED_FIXED, compile_circle_range
from enemy_chain_projectiles import (MOVEMENT, SIMPLE, FIXED_FIELDS as CHAIN_FIXED,
    VISUAL_FIELDS as PROJECTILE_VISUAL_FIELDS, UNITY_FIELDS)
from enemy_mode_blocked_provider import BUFF_DEFAULTS, ATTRIBUTE_KEYS
from enemy_self_cast_skills import DORMANT_FIXED, MELEE

RULE = 'selector-sp-tagged-ranged-complete-active-buff-group-v1'
CONTRACT = ROOT / 'work/enemy-tagged-ranged-contract.json'
TAGGED = 'Torappu.Battle.AdvancedSelectorWithTagAndBuffKey'
CIRCLE_RANGE = 'Torappu.Battle.CircleRange'
EFFECT = 'Torappu.Battle.Projectiles.EffectBehaviour'
SKILL_FIELDS = dict(SKILL_FIXED, _addEnemyIdToSignalId=0)
ACTION_FIXED = {key: value for key, value in RANGED_FIXED.items() if key != '_activeBuffs'}
ACTION_FIXED.update(_selectTargetSource=1)
ACTION_VARIABLE = set(RANGED_VARIABLE) | {'_activeBuffs'}
SELECTOR_FIXED = dict(ADVANCED_FIXED, _targetMotion=1, _postFilter=4,
    _abnormalFlag=20, _abnormalCombo=1, _limitTargetNum=1,
    _tagExcluded=1, _filterTagList=[], _buffKeyExcluded=1, _buffKey='',
    _buffs=[], _checkOrInsteadOfAnd=0, _filterBuffSource=0, _filterTokenHost=0)
SELECTOR_VARIABLE = {'_filterTag', '_maxNum'}
SELECTOR_FIXED.pop('_maxNum')
LOADED_BUFF_FIXED = dict(BUFF_DEFAULTS, loadFromDB=1, lifeTimeType=1,
    attributes=dict.fromkeys(ATTRIBUTE_KEYS, []), blackboard=[], templateKey='empty')
ACTION_SCHEMA_DIFFERENCES = [
    {'path': '/_activeBuffs/0/isGroundBoundable', 'onlyIn': 'CN', 'value': 0},
    {'path': '/_affectedBySlowDown', 'onlyIn': 'CN', 'value': 1},
    {'path': '/_checkFaceToFirstCastTargetDownAttack', 'onlyIn': 'CN', 'value': 0}]
PROJECTILE_FIXED = {
    MOVEMENT: dict(CHAIN_FIXED[MOVEMENT], _rotateToTarget=0),
    SIMPLE: dict(CHAIN_FIXED[SIMPLE], _clearMainEffectWhenReached=1, _hitNumType=1,
        _alwaysHitTraceTargetInTheEnd=1, _bodyTransform={'m_FileID': 0, 'm_PathID': '0'})}


def load_tagged_ranged_contract(candidates, database_sha256):
    if not CONTRACT.is_file():
        return {}
    contract = read(CONTRACT)
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return {}
    expected = {'priority': candidates['inputs']['prioritySha256'], 'enemyDatabase': database_sha256,
        **{key: candidates['sourceAnchors'][key]['sha256'] for key in ('catalog', 'ownership', 'encounters')}}
    if any(contract.get('inputs', {}).get(key, {}).get('sha256') != value for key, value in expected.items()):
        raise ValueError('Tagged ranged contract belongs to changed frozen source inputs.')
    frozen = contract.get('candidates', {})
    if not frozen or any(candidates['candidates'].get(key) != value for key, value in frozen.items()):
        raise ValueError('Tagged ranged components do not match the fixed EnemySkill queue.')
    return contract


def compile_tagged_ranged_skill(candidate, enemy_context, modes, initial_mode, contract,
                                *, timing_of, projectile_of, animations, aliases, speeds):
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    if (not contract.get('bindingComplete') or not contract.get('sourceFingerprint')
            or candidate.get('id') not in contract.get('candidates', {})):
        return reject('missing-complete-tagged-ranged-source-contract')
    for typename, name, value in (
            ('Torappu.Battle.AbilityStandard+SelectTargetSource', 'FROM_OWNER', 1),
            ('Torappu.Battle.AbilityStandard+SelectTargetTiming', 'AT_BEGINING', 0),
            ('Torappu.Battle.Abilities.AbstractAnimatedAbility+TimeMode', 'FROM_ATTACK_SPEED', 0)):
        if contract.get('metadataEnums', {}).get(typename, {}).get(name, {}).get('value') != value:
            return reject('unresolved-tagged-ranged-native-enums')
    if enemy_context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-executor-retains-tagged-skill-ownership')
    if candidate.get('triggerType') != 'SelectorTrigger':
        return reject('unsupported-tagged-ranged-trigger')
    indices = candidate.get('modeIndices')
    owner, provider = candidate.get('ownership', {}), candidate.get('provider', {})
    if (not indices or any(type(index) is not int or index < 0 or str(index) not in modes for index in indices)
            or sorted(set(indices)) != indices or type(initial_mode) is not int or initial_mode not in indices
            or indices != provider.get('modeIndices') or not owned_component(owner, indices)
            or not provider.get('structurallyMounted') or provider.get('structuralLocation') != 'mode-subtree'
            or owner.get('componentKey') != candidate.get('sourceRef', {}).get('componentKey')):
        return reject('unresolved-or-inactive-tagged-ranged-owner')
    sf = candidate.get('skillFields', {})
    if field_contract(sf, SKILL_FIELDS, {'_trigger'}):
        return reject('unsupported-complete-tagged-ranged-skill-fields')
    required = {ENEMY_SKILL: [], RANGED: [], EMITTER: []}
    for key, component in candidate.get('sameGameObjectComponents', {}).items():
        typename = component.get('scriptType')
        if typename not in required or component.get('serializedGraphs'):
            return reject('unsupported-complete-tagged-ranged-sibling:' + str(typename))
        required[typename].append((key, component))
    if len(required[ENEMY_SKILL]) != 1 or len(required[RANGED]) != 1:
        return reject('ambiguous-tagged-ranged-skill-or-action')
    if (required[ENEMY_SKILL][0][0] != candidate['sourceRef']['componentKey']
            or required[ENEMY_SKILL][0][1].get('fields') != sf):
        return reject('tagged-ranged-skill-declaration-binding-mismatch')
    if set(candidate.get('abilityTypes', [])) != {key.rsplit('.', 1)[-1]
            for key, rows in required.items() if key != ENEMY_SKILL and rows}:
        return reject('incomplete-declared-tagged-ranged-ability-group')
    for _, emitter in required[EMITTER]:
        fields = emitter.get('fields', {})
        if (set(fields) != EMITTER_FIELDS
                or any(fields[key] for key in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor'))):
            return reject('tagged-ranged-presentation-affects-lifecycle')
    action_key, component = required[RANGED][0]
    fields = component.get('fields', {})
    if field_contract(fields, ACTION_FIXED, ACTION_VARIABLE):
        return reject('unsupported-complete-tagged-ranged-action-fields')
    buffs = fields['_activeBuffs']
    if (not isinstance(buffs, list) or len(buffs) != 1 or field_contract(buffs[0], LOADED_BUFF_FIXED, {'buffKey'})
            or buffs[0].get('buffKey') != 'stun' or candidate.get('actionTypes')):
        return reject('unsupported-complete-loaded-active-buff-set')
    declarations = candidate.get('buffDeclarations', [])
    if declarations != [dict(componentKey=action_key, fieldPath='/_activeBuffs/0', fields=buffs[0], templateRef='empty')]:
        return reject('incomplete-tagged-ranged-buff-declarations')
    dependencies = candidate.get('componentDependencies', {})
    trigger_ref = reference_component(sf['_trigger'], dependencies)
    selector_ref = reference_component(fields['_selector'], dependencies)
    if not trigger_ref or trigger_ref[1].get('scriptType') != TRIGGER:
        return reject('unresolved-tagged-ranged-selector-trigger')
    if not selector_ref or selector_ref[1].get('scriptType') != TAGGED:
        return reject('unresolved-tagged-ranged-selector')
    if set(dependencies) != {trigger_ref[0], selector_ref[0]} or any(
            row.get('serializedGraphs') for row in dependencies.values()):
        return reject('unhandled-tagged-ranged-selector-dependencies')
    trigger, selector = trigger_ref[1]['fields'], selector_ref[1]['fields']
    if field_contract(trigger, TRIGGER_FIXED, {'_minTargetNum'}):
        return reject('unsupported-tagged-ranged-trigger-fields')
    if field_contract(selector, SELECTOR_FIXED, SELECTOR_VARIABLE):
        return reject('unsupported-complete-tagged-ranged-selector-fields')
    minimum, maximum = trigger['_minTargetNum'], selector['_maxNum']
    tag = selector['_filterTag']
    if (type(minimum) is not int or type(maximum) is not int or not 1 <= minimum <= maximum <= 64
            or not isinstance(tag, str) or not tag):
        return reject('invalid-tagged-ranged-selector-count-or-tag')
    sources = candidate.get('databaseSkillBindings', [])
    if len(sources) != 1:
        return reject('ambiguous-tagged-ranged-database-skill-binding')
    source = sources[0]
    key = source.get('prefabKey')
    if (not isinstance(key, str) or not key or key.casefold() != candidate.get('name', '').casefold()
            or sum(row == source for row in enemy_context.get('sourceSkills') or []) != 1):
        return reject('tagged-ranged-source-skill-name-or-parameters-mismatch')
    if set(source) != {'prefabKey', 'priority', 'cooldown', 'initCooldown', 'spCost', 'blackboard'}:
        return reject('unclassified-tagged-ranged-database-skill-fields')
    if (not finite(source['priority']) or type(source['spCost']) is not int or source['spCost'] <= 0
            or source['cooldown'] != 0 or source['initCooldown'] != 0):
        return reject('unsupported-tagged-ranged-cooldown-or-sp-parameters')
    board = {}
    if not isinstance(source['blackboard'], list):
        return reject('invalid-tagged-ranged-blackboard')
    for entry in source['blackboard']:
        if (set(entry) - {'key', 'value', 'valueStr'} or entry.get('key') not in {'atk_scale', 'stun', 'max_target'}
                or entry.get('key') in board or entry.get('valueStr') is not None or not finite(entry.get('value'))):
            return reject('unhandled-tagged-ranged-blackboard-key-or-value')
        board[entry['key']] = entry['value']
    scale, targets = board.get('atk_scale', fields['_atkScale']), board.get('max_target', maximum)
    if (not finite(fields['_atkScale']) or fields['_atkScale'] <= 0 or scale <= 0
            or targets != int(targets) or not minimum <= targets <= 64
            or not finite(board.get('stun')) or board['stun'] < 0
            or fields['_damageType'] not in DAMAGE_TYPES or not fields['_projectileKey']):
        return reject('invalid-tagged-ranged-damage-target-or-stun-parameter')
    return compile_bound_tagged_group(candidate, enemy_context, modes, contract, required,
        trigger_ref, selector_ref, board, timing_of, projectile_of, animations, aliases, speeds)


def compile_bound_tagged_group(candidate, enemy_context, modes, contract, required,
        trigger_ref, selector_ref, board, timing_of, projectile_of, animations, aliases, speeds):
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    binding = contract.get('bindings', {}).get(candidate['id'], {})
    if not binding.get('bindingComplete') or not contract.get('runtimeContract'):
        return reject('tagged-ranged-complete-source-binding-pending')
    ownership = contract.get('ownership', {}).get(candidate['enemyId'], {})
    catalog = contract.get('catalog', {}).get(candidate['enemyId'], {}).get('components', {})
    skill_owner = candidate['ownership']
    for key, component in candidate['sameGameObjectComponents'].items():
        owner = ownership.get('components', {}).get(key, {})
        schema = ACTION_SCHEMA_DIFFERENCES if component['scriptType'] == RANGED else ()
        if (catalog.get(key) != component or not owned_component(owner, candidate['modeIndices'], schema)
                or owner.get('gameObjectPathID') != skill_owner.get('gameObjectPathID')):
            return reject('incomplete-tagged-ranged-action-ownership')
    for key, component in (trigger_ref, selector_ref):
        owner = ownership.get('components', {}).get(key, {})
        schema = SELECTOR_SCHEMA_DIFFERENCES if component['scriptType'] == TAGGED else ()
        if (catalog.get(key) != component or not owned_component(owner, candidate['modeIndices'], schema)
                or skill_owner['gameObjectPathID'] not in [row.get('pathID') for row in owner.get('ancestorGameObjects', [])]):
            return reject('incomplete-tagged-ranged-selector-ownership')
    action_key, component = required[RANGED][0]
    fields = component['fields']
    timing = timing_of(animations, fields, aliases, component.get('scriptPathID'))
    if (not timing or timing.get('hits') or not finite(timing.get('duration')) or timing['duration'] <= 0
            or not finite(timing.get('hit')) or not 0 <= timing['hit'] <= timing['duration']
            or timing.get('observedHits', [timing.get('hit')]) != [timing.get('hit')]):
        return reject('unresolved-single-event-tagged-ranged-animation')
    source_animation = contract.get('animationBindings', {}).get(candidate['enemyId'], {})
    frozen = timing_of(source_animation.get('source', {}).get('animations', {}), fields,
        {}, component.get('scriptPathID'))
    if timing != frozen:
        return reject('tagged-ranged-animation-disagrees-with-frozen-source')
    tb = contract.get('timingBindings', {}).get(candidate['id'], {})
    if (tb.get('animationBinding') != candidate['enemyId'] or tb.get('timeMode') != 0
            or tb.get('minAnimScale') != .1 or tb.get('maxAnimScale') != fields['_maxAnimScale']
            or any(tb.get(key) != timing.get(key) for key in ('animation', 'duration', 'hit'))
            or tb.get('hitTimes') != [timing['hit']]):
        return reject('unsupported-tagged-ranged-native-timing-contract')
    projectile, error = projectile_of([fields], speeds)
    if not projectile or error:
        return reject('missing-tagged-ranged-projectile-contract')
    geometry, error = compile_tagged_selector(candidate, binding, ownership, catalog, trigger_ref, selector_ref)
    if error:
        return reject(error)
    projectile, error = compile_tagged_projectile(contract, fields['_projectileKey'], projectile)
    if error:
        return reject(error)
    sp, error = compile_attack_recovery(candidate, modes, contract)
    if error:
        return reject(error)
    stun, error = compile_loaded_stun(contract, fields['_activeBuffs'][0], board)
    if error:
        return reject(error)
    source = candidate['databaseSkillBindings'][0]
    db_rows = contract['database'][candidate['enemyId']]['Value']
    range_values = [row['enemyData']['rangeRadius']['m_value'] for row in db_rows
        if row.get('enemyData', {}).get('rangeRadius', {}).get('m_defined')]
    if not range_values or any(not finite(value) or value <= 0 for value in range_values):
        return reject('missing-positive-source-owner-range')
    selector = selector_ref[1]['fields']
    action = dict(timing=timing, atkScale=fields['_atkScale'], atkScaleKey=fields['_atkScaleKey'],
        damageType=DAMAGE_TYPES[fields['_damageType']], delivery='projectile', projectile=projectile,
        activeBuffs=[stun], timeMode=0, minAnimScale=.1, maxAnimScale=fields['_maxAnimScale'],
        affectedBySlowDown=True, selectTargetTiming=0, selectTargetSource=1,
        alwaysIncludeTarget=True, allowNoTarget=False, interruptOnDetach=False,
        sourceTimeMode='FROM_ATTACK_SPEED', sourceTargetTiming='AT_BEGINING', sourceTargetSource='FROM_OWNER')
    selection = dict(id=candidate['id'], candidateId=candidate['id'], enemyId=candidate['enemyId'],
        kind='selector-sp-tagged-ranged', skillKey=source['prefabKey'], modeIndices=candidate['modeIndices'],
        priority=source['priority'], spCost=source['spCost'], cooldown=0, initCooldown=0,
        cooldownStarts='cast-start', blackboard=board, allowedBlackboardKeys=['atk_scale', 'max_target', 'stun'],
        trigger=dict(kind='selector', minTargets=trigger_ref[1]['fields']['_minTargetNum'], keepTarget=False, searchTargetTick=-1),
        selector=dict(kind='advanced-tagged', sourceRule='owner-range-ground-hatred-exclude-tags-v1',
            maxTargets=dict(key=selector['_maxTargetKey'], default=selector['_maxNum']),
            range=dict(kind='owner-mode', default=range_values[0], sourceColliderRadius=geometry['radius']),
            excludeTags=[selector['_filterTag']], targetSide=selector['_targetSide'], targetMotion=selector['_targetMotion'],
            targetCategory=selector['_targetCategory'], postFilter=selector['_postFilter'],
            ignoreHitRange=False, ignoreTargetFree=False),
        action=action, flags={key[1:]: value for key, value in SKILL_FIELDS.items()}, spContract=sp,
        sourceRef=candidate['sourceRef'], sourceRefs=[candidate['sourceRef'],
            dict(path=str(CONTRACT.relative_to(ROOT)), sourceFingerprint=contract['sourceFingerprint'],
                candidateId=candidate['id'], roles=dict(rangedAbility=action_key,
                    trigger=trigger_ref[0], selector=selector_ref[0], projectile=fields['_projectileKey'], loadedBuff='stun'))],
        initiallyMounted=True, nameBindingEvidenceLevel='Inferred', ownershipEvidenceLevel='Inferred',
        sourceRank=enemy_context.get('sourceLevelType'), dedicatedExecutorOwnershipRetained=True,
        enemyImplementationComplete=False, automaticModeTransitionComplete=False,
        presentation=[deepcopy(row['fields']) for _, row in required[EMITTER]], originalVisualsComplete=False,
        boundary='Complete source SP/tagged selector/loaded active stun/projectile skill group only. Native first spell output and source attack recovery-stop gate are bound; range replacement and loaded Buff semantics retain their source records. Cross-snapshot mounting, target ordering/locking, status application and projectile expiration bridging remain explicit inferences. Other skills, talents and whole enemy phases remain pending.')
    return dict(accepted=True, selection=selection, rejections=[])


def compile_tagged_selector(candidate, binding, ownership, catalog, trigger_ref, selector_ref):
    reject = lambda reason: (None, reason)
    roles = binding.get('roles', {})
    rows = binding.get('selectorComponents', [])
    components = {row.get('componentKey'): row.get('component', {}) for row in rows}
    selector_key, selector_component = selector_ref
    range_key = roles.get('range')
    if (len(rows) != 3 or len(components) != 3 or roles.get('selector') != selector_key
            or set(components) != {range_key, selector_key, trigger_ref[0]}
            or components.get(selector_key) != selector_component or components.get(trigger_ref[0]) != trigger_ref[1]):
        return reject('incomplete-tagged-selector-range-trigger-group')
    range_component = components.get(range_key, {})
    if (range_component.get('scriptType') != CIRCLE_RANGE
            or field_contract(range_component.get('fields'), {'_extendable': 0, '_scaleble': 0})):
        return reject('unsupported-tagged-selector-circle-range-fields')
    selector_owner = ownership['components'][selector_key]
    for row in rows:
        key, component = row['componentKey'], row['component']
        owner = ownership.get('components', {}).get(key, {})
        schema = SELECTOR_SCHEMA_DIFFERENCES if key == selector_key else ()
        if (catalog.get(key) != component or component.get('serializedGraphs')
                or owner != row.get('ownership') or not owned_component(owner, candidate['modeIndices'], schema)
                or owner.get('gameObjectPathID') != selector_owner.get('gameObjectPathID')):
            return reject('incomplete-tagged-selector-component-ownership')
    sr = binding.get('sourceRange', {})
    keys = {'shape', 'radius', 'offset', 'allAncestorScalesIdentity'}
    if (set(sr) != keys | {'effectiveRadius', 'sourceModeRadius', 'geometryRole', 'runtimeRule', 'evidenceLevel', 'native'}
            or not finite(sr.get('effectiveRadius')) or sr['effectiveRadius'] <= 0
            or sr['effectiveRadius'] != sr['sourceModeRadius'] or sr['geometryRole'] != 'serialized fallback only'):
        return reject('unresolved-tagged-source-owner-range-replacement')
    geometry, error = compile_circle_range(dict(binding, sourceRange={key: sr[key] for key in keys}), selector_key, ownership)
    if error:
        return reject('tagged-selector-' + error)
    go = binding.get('selectorGameObject', {})
    go_fields = go.get('fields', {})
    siblings = binding.get('selectorGameObjectSiblings', [])
    expected_ids = {str(row['pathID']) for row in components.values()} | {
        str(binding['colliders'][0]['pathId']), str(binding['transformChain'][0]['pathId'])}
    if (go.get('pathId') != selector_owner.get('gameObjectPathID') or go.get('unityType') != 'GameObject'
            or field_contract(go_fields, {'m_Layer': 12, 'm_Tag': 0, 'm_IsActive': True}, {'m_Name', 'm_Component'})
            or len(siblings) != len(expected_ids) or {str(row.get('pathId')) for row in siblings} != expected_ids
            or not isinstance(go_fields.get('m_Component'), list) or len(go_fields['m_Component']) != len(expected_ids)
            or {str(row.get('component', {}).get('m_PathID')) for row in go_fields['m_Component']} != expected_ids
            or any(row.get('component', {}).get('m_FileID') != 0 for row in go_fields['m_Component'])):
        return reject('unhandled-tagged-selector-unity-sibling')
    raw_by_id = {str(row['pathId']): row for row in siblings}
    for exact in (binding['colliders'][0], binding['transformChain'][0]):
        if any(raw_by_id[str(exact['pathId'])].get(key) != exact.get(key) for key in ('pathId', 'unityType', 'fields')):
            return reject('tagged-selector-geometry-sibling-disagreement')
    for key, component in components.items():
        raw = raw_by_id[str(component['pathID'])]
        removed = {row['path'][1:] for row in ownership['components'][key].get('schemaDifferences', [])}
        expected = {key: value for key, value in component['fields'].items() if key not in removed}
        expected.update(m_GameObject={'m_FileID': 0, 'm_PathID': selector_owner['gameObjectPathID']},
            m_Enabled=1, m_Script={'m_FileID': 1, 'm_PathID': component['scriptPathID']}, m_Name='')
        if raw.get('unityType') != 'MonoBehaviour' or raw.get('fields') != expected:
            return reject('tagged-selector-raw-component-disagreement')
    return geometry, None


def compile_tagged_projectile(contract, projectile_key, imported_projectile):
    reject = lambda reason: (None, reason)
    binding = contract.get('projectileBindings', {}).get(projectile_key, {})
    nodes = binding.get('nodes', [])
    type_map = binding.get('scriptTypes', {})
    owner_id = binding.get('prefabGameObjectPathId')
    if not owner_id or len(nodes) != 5 or len({row.get('pathId') for row in nodes}) != 5:
        return reject('incomplete-tagged-projectile-unity-group')
    game_objects = [row for row in nodes if row.get('unityType') == 'GameObject']
    transforms = [row for row in nodes if row.get('unityType') == 'Transform']
    if len(game_objects) != 1 or len(transforms) != 1 or game_objects[0].get('pathId') != owner_id:
        return reject('unresolved-tagged-projectile-root')
    go, transform = game_objects[0], transforms[0]
    go_fields = go.get('fields', {})
    if (field_contract(go_fields, {'m_Layer': 14, 'm_Tag': 0, 'm_IsActive': True, 'm_Name': projectile_key}, {'m_Component'})
            or len(go_fields['m_Component']) != 4
            or {str(row.get('component', {}).get('m_PathID')) for row in go_fields['m_Component']} != {str(row['pathId']) for row in nodes if row is not go}
            or any(row.get('component', {}).get('m_FileID') != 0 for row in go_fields['m_Component'])):
        return reject('unhandled-tagged-projectile-root-components')
    if field_contract(transform.get('fields'), dict(m_GameObject={'m_FileID': 0, 'm_PathID': owner_id},
            m_LocalRotation={'x': 0, 'y': 0, 'z': 0, 'w': 1}, m_LocalPosition={'x': 0, 'y': 0, 'z': 0},
            m_LocalScale={'x': 1, 'y': 1, 'z': 1}, m_Children=[], m_Father={'m_FileID': 0, 'm_PathID': '0'})):
        return reject('unsupported-tagged-projectile-transform')
    typed = {}
    for node in nodes:
        if node in (go, transform):
            continue
        fields = node.get('fields', {})
        script = fields.get('m_Script', {})
        typename = type_map.get(str(script.get('m_PathID')))
        if (node.get('unityType') != 'MonoBehaviour' or typename not in {MOVEMENT, SIMPLE, EFFECT}
                or typename in typed or script.get('m_FileID') != 1 or fields.get('m_Enabled') != 1
                or fields.get('m_GameObject') != {'m_FileID': 0, 'm_PathID': owner_id} or fields.get('m_Name') != ''):
            return reject('unowned-or-unknown-tagged-projectile-behaviour')
        body = {key: value for key, value in fields.items() if key not in UNITY_FIELDS}
        if typename == EFFECT:
            if set(body) != PROJECTILE_VISUAL_FIELDS[EFFECT]:
                return reject('unknown-tagged-projectile-effect-fields')
            # Renderer-only arrays remain source-attributed presentation.
        elif field_contract(body, PROJECTILE_FIXED[typename], {'_speed'} if typename == MOVEMENT else {'_lifeTime', '_mainEffect'}):
            return reject('unsupported-complete-tagged-projectile-behaviour')
        typed[typename] = body
    if set(typed) != {MOVEMENT, SIMPLE, EFFECT}:
        return reject('missing-tagged-projectile-behaviour')
    speed, life = typed[MOVEMENT]['_speed'], typed[SIMPLE]['_lifeTime']
    if (not finite(speed) or speed <= 0 or not finite(life) or life <= 0
            or imported_projectile != {'key': projectile_key, 'speed': speed}):
        return reject('invalid-or-conflicting-tagged-projectile-speed-or-lifetime')
    return dict(imported_projectile, lifeTime=life, alwaysHitTraceTargetInTheEnd=True,
        forceReachedWhenTimeup=True, stopWhenSourceInvalid=False, maxHitNum=1), None


def compile_attack_recovery(candidate, modes, contract):
    """Use the actual SpData controller event, not the horn Buff charge model."""
    reject = lambda reason: (None, reason)
    rows = contract.get('database', {}).get(candidate['enemyId'], {}).get('Value', [])
    sources = [row.get('enemyData', {}).get('spData') for row in rows
        if row.get('enemyData', {}).get('spData') is not None]
    if not sources or any(row != sources[0] for row in sources):
        return reject('unresolved-or-level-varying-source-attack-sp')
    source = sources[0]
    if (set(source) != {'spType', 'maxSp', 'initSp', 'increment'}
            or source['spType'] != 'INCREASE_WHEN_ATTACK'
            or not finite(source['maxSp']) or source['maxSp'] <= 0
            or not finite(source['initSp']) or not 0 <= source['initSp'] <= source['maxSp']
            or not finite(source['increment']) or source['increment'] <= 0
            or candidate['databaseSkillBindings'][0]['spCost'] > source['maxSp']):
        return reject('unsupported-source-attack-sp-data')
    runtime = contract.get('spContract', {})
    if (runtime.get('sourceSpType') != source['spType'] or runtime.get('initialSp') != source['initSp']
            or runtime.get('maxSp') != source['maxSp'] or runtime.get('regenPerSecond') != 0
            or runtime.get('sharedAcrossModes') is not True or runtime.get('spend') != 'cast-start'
            or 'basicAttackGain' in runtime):
        return reject('unsupported-source-sp-controller-lifecycle')
    gain = runtime.get('attackRecovery', {})
    if (gain.get('event') != 'ON_OUTPUT_ATTACK_OR_HEAL' or gain.get('amount') != source['increment']
            or gain.get('force') is not False or sorted(gain.get('channels', [])) != ['attack', 'combat']
            or gain.get('modeIndices') != sorted(int(key) for key in modes)
            or not set(candidate['modeIndices']).issubset(gain.get('modeIndices', []))
            or gain.get('scope') != 'source-ability-output' or any(gain.get(key) is not True for key in
                ('checkSpType', 'oncePerCast', 'requiresSuccessfulOutput', 'skillEmitsEvent',
                 'stoppedWhileSkillRegistered', 'respectsSpRecoveryStopped'))):
        return reject('unsupported-source-attack-output-recovery-event')
    binding = contract.get('spBindings', {})
    if binding.get('databaseSpData') != source:
        return reject('source-sp-binding-disagrees-with-database')
    ownership = contract['ownership'][candidate['enemyId']]
    catalog = contract['catalog'][candidate['enemyId']]['components']
    mounted = set()
    for row in binding.get('normalAbilities', []):
        index, channel = row.get('modeIndex'), row.get('channel')
        component = row.get('component', {})
        fields = component.get('fields', {})
        owner = ownership.get('components', {}).get(row.get('componentKey'), {})
        compiled = modes.get(str(index), {}).get('channels', {}).get(channel)
        if ((index, channel) in mounted or catalog.get(row.get('componentKey')) != component
                or owner != row.get('ownership') or not owned_component(owner, [index], ACTION_SCHEMA_DIFFERENCES[1:])
                or not compiled or component.get('serializedGraphs')):
            return reject('incomplete-source-output-normal-ability-ownership')
        if component.get('scriptType') == RANGED:
            if field_contract(fields, RANGED_FIXED, RANGED_VARIABLE):
                return reject('unsupported-source-output-ranged-ability')
            if (compiled.get('delivery') != 'projectile'
                    or compiled.get('projectile', {}).get('key') != fields['_projectileKey']):
                return reject('source-output-ranged-channel-mismatch')
        elif component.get('scriptType') == MELEE:
            mf = dict(DORMANT_FIXED, _selectTargetSource=2, _atkScale=1,
                _elementDamageType=0, _maxAnimScale=-1, _animKey='Attack', _endAnimKey='Idle')
            if field_contract(fields, mf) or compiled.get('delivery') != 'direct':
                return reject('unsupported-source-output-melee-ability')
        else:
            return reject('unknown-source-output-normal-ability-type')
        if (compiled.get('damageType') != DAMAGE_TYPES[fields['_damageType']]
                or compiled.get('atkScale') != fields['_atkScale']
                or compiled.get('timing', {}).get('animation') != fields['_animKey']):
            return reject('source-output-normal-ability-channel-mismatch')
        mounted.add((index, channel))
    expected = {(int(index), channel) for index, mode in modes.items()
        for channel, action in mode.get('channels', {}).items() if action}
    if mounted != expected:
        return reject('missing-source-output-normal-channel')
    output = deepcopy(runtime)
    output['attackRecovery']['event'] = 'output-attack-or-heal'
    output['attackRecovery']['channels'] = ['combat', 'attack']
    output['stopRecoveryWhileCasting'] = True
    return output, None


def compile_loaded_stun(contract, declaration, board):
    reject = lambda reason: (None, reason)
    binding = contract.get('buffBindings', {}).get('stun', {})
    if (binding.get('sourceDeclaration') != declaration or binding.get('templateKey') != 'empty'
            or binding.get('statusResistible') is not True or binding.get('isDamageMissable') is not True):
        return reject('unresolved-loaded-stun-source-binding')
    for typename, name, value in (
            ('Torappu.BuffData+OverrideType', 'DEFAULT', 0),
            ('Torappu.BuffData+StatusResistable', 'AUTOMATIC', 2), ('Torappu.AbnormalFlag', 'STUNNED', 0)):
        if contract.get('metadataEnums', {}).get(typename, {}).get(name, {}).get('value') != value:
            return reject('unresolved-loaded-stun-native-enums')
    mapping = {'0': 'attributes', '1': 'buffKey', '4': 'isDamageMissable', '10': 'statusResistable',
        '11': 'templateKey', '15': 'maxStackCnt', '18': 'maxValidStackCnt', '20': 'overrideEffectKey',
        '24': 'lifeTimeType', '26': 'durationKey', '30': 'triggerInterval',
        '31': 'waitFirstTriggerInterval', '32': 'firstTriggerInterval', '33': 'priority'}
    raw, named = binding.get('raw', {}), binding.get('named', {})
    if set(raw) != set(mapping) or raw.get('0') != {'0': [0]}:
        return reject('unhandled-complete-stun-database-fields')
    decoded = {mapping[key]: value for key, value in raw.items()}
    decoded['attributes'] = {'abnormalFlags': [0]}
    expected_named = dict(attributes={'abnormalFlags': [0]}, buffKey='stun', isDamageMissable=True,
        statusResistable=2, templateKey='empty', maxStackCnt=1, maxValidStackCnt=-1,
        overrideEffectKey='buff_stun', lifeTimeType=1, durationKey='stun', triggerInterval=-1,
        waitFirstTriggerInterval=True, firstTriggerInterval=-1, priority=-1)
    expected_effective = dict(BUFF_DEFAULTS, blackboard=[], **expected_named)
    if named != decoded or named != expected_named or binding.get('effective') != expected_effective:
        return reject('unsupported-complete-loaded-stun-effective-data')
    if contract.get('templates', {}).get('empty') != dict(templateKey='empty', effectKey='', onEventPriority='DEFAULT', eventToActions={}):
        return reject('unhandled-loaded-stun-template-actions')
    duration = binding.get('duration', {})
    if (duration.get('key') != named['durationKey'] or duration.get('namespace') != 'skill-blackboard-no-prefix'
            or duration.get('explicitZero') != 'no-buff' or binding.get('stackPolicy', {}).get('kind') != 'max-active-expiry'):
        return reject('unsupported-loaded-stun-duration-or-stacking-contract')
    return dict(kind='stun', buffKey=named['buffKey'], duration=dict(key=named['durationKey'], default=board['stun']),
        statusResistible=True, isDamageMissable=True, sourceStatusResistable='AUTOMATIC', sourceOverrideType='DEFAULT',
        maxStackCnt=1, applyAt='projectile-hit', durationZero='no-stun', expiryMerge='max',
        expiryMergeEvidenceLevel='Inferred'), None
