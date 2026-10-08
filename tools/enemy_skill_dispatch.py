"""Compile complete frozen enemy skill components into one shared scheduler IR.

Only the fixed garrison queue is consumed. No enemy ID selects an implementation;
unknown siblings, source fields and selector semantics reject the whole skill.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path

from enemy_mode_blocked_provider import BUFF_DEFAULTS, ATTRIBUTE_KEYS

ROOT = Path(__file__).resolve().parents[1]
PRIORITY = ROOT / 'work/garrison-skill-dispatch-priority.json'
CACHE = ROOT / 'work/enemy-skill-dispatch-candidates.json'
SP_CONTRACT = ROOT / 'work/enemy-skill-sp-contract.json'
RULE = 'selector-triggered-sp-cost-ranged-skill-v1'
RANGED = 'Torappu.Battle.Abilities.RangedAttack'
SELECTOR = 'Torappu.Battle.BlockedOrAdvancedSelector'
TRIGGER = 'Torappu.Battle.SelectorTrigger'
ENEMY_SKILL = 'Torappu.Battle.EnemySkill'
EMITTER = 'Torappu.Battle.Abilities.UberEffectEmitter'


def zeros(names, **fixed):
    return {**dict.fromkeys(names.split(), 0), **fixed}


SKILL_FIXED = zeros('''_checkParentActive _resetMainAbilityCdWhenCastEnd
    _ignoreSilence _immuneStunWhenAffecting _castLikeAttack''', _familyMask=3,
    _maxTriggerTime=-1, _resetCdWaitFirstPeriod=1, _overwriteInitCooldown=-1,
    _addEnemyIdToSignalId=1)
TRIGGER_FIXED = dict(_keepTarget=0, _overrideSearchTargetTick=-1)
SELECTOR_FIXED = zeros('''_ignoreTargetFree _onlyIgnoreSomeOfTargetFreeCase
    _ignoreAllyTargetFree _ignoreHealFree _ignoreMotionMode _forceIgnoreCamouflage
    _needProfessionMask _professionMask _excludeSomeAbnormalFlags _excludeOwner
    _sortByTauntAtLast _ignoreHitRange _checkUnitType _unitTypeMask
    _abilityInputTargetAsSortSource _limitedMaxTargetNumToBlockedCnt _allowZeroBlockCntLimit''',
    _targetSide=2, _targetMotion=3, _targetCategory=1, _postFilter=4,
    _abnormalFlag=29, _abnormalCombo=2, _excludeAbnormalFlag=46,
    _limitTargetNum=1, _maxTargetKey='max_target')
ACTION_FIXED = zeros('''_interruptAbilityOnDetach _ignoreIfOwnerDead _forceAsDmgOrHealAbility
    _selectTargetTiming _timeMode _allowNoTarget _cooldown _preDelay _escapeTime
    _faceToDefault _faceToFront _faceToFirstCastTarget _checkFaceToFirstCastTargetDownAttack
    _forceFaceToDirection _onlyPlayEndAnimWhenIsLastAbility _ignorePalsyInterrupt
    _epDamageRatio _elementDamageType _useDynamicAttackType _deliveryParaWhenReplaceActionNode
    _useMountGroup _waitForProjectileInvalid _notClearProjectileWhenCastEnd
    _fireAttackFinishWhenProjectileInvalid _minPostDelayWhenProjectileInvalid
    _waitForAnimEndWhenProjectileInvalid _projectileDestination _extraDamageType
    _emitToInputPosWhenTargetIsInvalid _emitToInputRootTileWhenTargetIsInvalid _useCachedAtkOnly
    _transferSource _fireCreateProjectileEvent''',
    _metadata={'namedAsAlias': '', 'blackboardPrefix': ''}, _attachPassiveBuffsOnDummy=1,
    _waitForAttackEvent=1, _interuptIfTargetDead=0, _resetCdStrategy=1,
    _selectTargetSource=2, _alwaysIncludeTarget=1, _cooldownKey='duration',
    _faceToTarget=1, _activeBuffs=[], _maxAnimScale=1, _affectedBySlowDown=1,
    _atkScaleKey='atk_scale', _attackType=1, _mountPointType=2,
    _mountGroup={'loopType': 0, 'mountPoints': []}, _extraProjectileKeys=[])
ACTION_VARIABLE = set('''_selector _animKey _endAnimKey _downAnimKey _downEndAnimKey
    _upAnimKey _upEndAnimKey _projectileKey _atkScale _damageType'''.split())
EMITTER_FIELDS = set('''_hitEffects _castEffects _attachEffects _inputTargetEffects
    _castTargetEffects _convertCastEndToAttachFinish _recalculatePlaybackSpeed _preDelayFactor'''.split())
DAMAGE_TYPES = {1: 'phys', 2: 'arts', 3: 'true'}
CHARGE_TYPE = 'Torappu.Battle.Abilities.BuffToOwner'
CHARGE_FIXED = dict(_extraCondition=0, _extraConditionTiming=4, _maxTarget=1,
    _loadMaxTargetFromBlackboard=1, _runActionOnEvent=4, _onlyRunOnce=0)
MODIFY_SP_FIXED = {'$type': 'Torappu.Battle.Action.Nodes+ModifySp, Assembly-CSharp',
    '_targetType': 'BUFF_OWNER', '_modifyByRatio': False, '_modifyRatio': 0.0,
    '_modifyByRatioBasedOnCurSP': False, '_modifyBySpCost': False,
    '_dontCheckSpType': True, '_spMask': 'ALL', '_forceFlag': True,
    '_dontShowSpUI': True, '_spString': 'sp', '_isMinis': False, '_customModifierKey': ''}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def field_contract(fields, fixed, variable=()):
    if not isinstance(fields, dict) or set(fields) != set(fixed) | set(variable):
        return 'unrecognized-or-missing-fields'
    if any(fields[key] != value for key, value in fixed.items()):
        return 'unsupported-field-values'
    return None


def reference_component(reference, components):
    if (not isinstance(reference, dict) or set(reference) != {'m_FileID', 'm_PathID'}
            or reference['m_FileID'] != 0 or not reference['m_PathID']):
        return None
    found = [(key, value) for key, value in components.items()
             if str(value.get('pathID')) == str(reference['m_PathID'])]
    return found[0] if len(found) == 1 else None


def frozen_input_matches(path, expected, kind):
    if not path.is_file():
        return False
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() == expected:
        return True
    if kind not in ('encounters', 'source-battles'):
        return False
    # Source tags were added for operator selectors. The frozen EnemySkill
    # cohort uses the original encounter/level records; preserve its exact anchor
    # only when removing this additive field reproduces the pinned file hash.
    value = json.loads(raw)
    records = [value] if kind == 'encounters' else value.get('levels', {}).values()
    for record in records:
        for enemy in record.get('enemies', {}).values():
            enemy.pop('sourceTags', None)
    if kind == 'source-battles':
        for season in value.get('seasons', {}).values():
            for enemy in season.get('decisionEnemies', {}).values():
                enemy.pop('sourceTags', None)
    original = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    return hashlib.sha256(original).hexdigest() == expected


def load_candidates(source_hashes, catalog_sources):
    """Freeze the 27 already classified declarations; unchanged inputs reuse it.

    This reads only the priority receipt. Its referenced catalog/ownership hashes
    anchor the frozen complete component groups, not a fresh scan of 189 enemies.
    """
    priority_hash = hashlib.sha256(PRIORITY.read_bytes()).hexdigest()
    observed = dict(prioritySha256=priority_hash,
        compilerSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        sourceHashes=dict(source_hashes))
    if CACHE.is_file():
        cached = read(CACHE)
        if cached.get('inputs') == observed:
            return cached, True
    priority = read(PRIORITY)
    if priority.get('nextSharedContract', {}).get('id') != 'selector-triggered-sp-cost-ranged-skill':
        raise ValueError('The frozen skill queue no longer names the supported shared contract.')
    source_files = priority.get('inputs', {})
    # A source refresh needs explicit queue refresh, never silently stale owners.
    for key in ('catalog', 'ownership', 'encounters'):
        descriptor = source_files.get(key, {})
        path = ROOT / descriptor.get('path', '')
        if not frozen_input_matches(path, descriptor.get('sha256'), key):
            raise ValueError(f'Frozen skill {key} input changed; refresh its fixed queue explicitly.')
    catalog_sources = {Path(key).name: value for key, value in catalog_sources.items()}
    if catalog_sources.get('data_enemy_prefab_catalog_current.json') != source_hashes.get('data_enemy_prefab_catalog_current.json'):
        raise ValueError('Frozen skill components belong to a different prefab source.')
    candidates = deepcopy(priority['skills'])
    enemy_context = {key: {field: value.get(field) for field in
        ('sourceLevelType', 'dedicatedBossProfile', 'sourceSkills', 'initialMode')}
        for key, value in priority['enemies'].items()}
    semantic = dict(candidates=candidates, enemies=enemy_context,
        sourceAnchors={key: source_files[key] for key in ('catalog', 'ownership', 'encounters')})
    result = dict(schemaVersion=1, rule=RULE, inputs=observed,
        sourceFingerprint=fingerprint(semantic), **semantic,
        boundary='Frozen complete components; structural owner/name binding remains Inferred. Compilation is not whole-enemy or automatic phase completion.')
    CACHE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result, False


def load_sp_contract(candidates, database_sha256):
    if not SP_CONTRACT.is_file():
        return {}
    contract = read(SP_CONTRACT)
    inputs = contract.get('inputs', {})
    expected = {'priority': candidates['inputs']['prioritySha256'],
        'enemyDatabase': database_sha256,
        **{key: candidates['sourceAnchors'][key]['sha256'] for key in ('catalog', 'ownership')}}
    if any(inputs.get(key, {}).get('sha256') != value for key, value in expected.items()):
        raise ValueError('SP binding belongs to changed source inputs; refresh its focused contract.')
    buff_source = inputs.get('buffTemplates', {})
    path = ROOT / buff_source.get('path', '')
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != buff_source.get('sha256'):
        raise ValueError('SP charge Buff source changed; refresh its focused contract.')
    return contract


def compile_sp_contract(candidate, modes, sp_contract):
    """Bind the source SP data and every normal-action charge sibling together."""
    reject = lambda reason: (None, reason)
    if not sp_contract or not sp_contract.get('sourceFingerprint'):
        return reject('missing-enemy-sp-and-cast-contract')
    binding = sp_contract.get('bindings', {}).get(candidate['enemyId'], {})
    if (not binding.get('bindingComplete') or candidate['id'] not in binding.get('candidateSkillIDs', [])
            or binding.get('enemyId') != candidate['enemyId']):
        return reject('missing-complete-source-sp-binding')
    runtime = binding.get('runtimeContract')
    if not runtime or runtime != sp_contract.get('runtimeContract'):
        return reject('unresolved-runtime-sp-contract')
    source = binding.get('sourceSpData', {})
    if (set(source) != {'spType', 'maxSp', 'initSp', 'increment'}
            or source.get('spType') != 'INCREASE_WITH_TIME' or source.get('increment') != 0
            or not finite(source.get('maxSp')) or source['maxSp'] <= 0
            or not finite(source.get('initSp')) or not 0 <= source['initSp'] <= source['maxSp']
            or runtime.get('initialSp') != source['initSp'] or runtime.get('maxSp') != source['maxSp']
            or runtime.get('regenPerSecond') != 0 or runtime.get('sourceSpType') != source['spType']
            or runtime.get('sharedAcrossModes') is not True or runtime.get('spend') != 'cast-start'):
        return reject('unsupported-source-sp-acquisition-contract')
    graph = binding.get('chargeTemplate', {})
    if (set(graph) != {'templateKey', 'effectKey', 'onEventPriority', 'eventToActions'}
            or graph.get('effectKey') != '' or graph.get('onEventPriority') != 'DEFAULT'
            or set(graph.get('eventToActions', {})) != {'ON_BUFF_START'}
            or len(graph['eventToActions']['ON_BUFF_START']) != 1):
        return reject('unsupported-complete-sp-charge-template')
    node = graph['eventToActions']['ON_BUFF_START'][0]
    if (field_contract(node, MODIFY_SP_FIXED, {'_modifyValue'})
            or not finite(node.get('_modifyValue')) or node['_modifyValue'] <= 0):
        return reject('unsupported-sp-charge-action')
    gain = runtime.get('basicAttackGain', {})
    if (gain.get('event') != 'ON_SPELL_ON' or gain.get('amount') != node['_modifyValue']
            or gain.get('force') is not True or gain.get('checkSpType') is not False
            or gain.get('scope') != 'source-normal-ability-siblings' or gain.get('oncePerCast') is not True
            or gain.get('spellOnChargedBySkill') is not False):
        return reject('unresolved-normal-action-sp-event-contract')
    declared, seen_components = set(), set()
    for charge in binding.get('normalAttackChargeBindings', []):
        fields = charge.get('fields', {})
        owner = charge.get('ownership', {})
        if (field_contract(fields, CHARGE_FIXED, {'_buffs'}) or len(fields.get('_buffs', [])) != 1
                or owner.get('status') != 'shared-fields-match' or not owner.get('ownershipOverlayEligible')
                or owner.get('jpEnabled') != 1 or owner.get('sharedFieldDifferences')):
            return reject('unsupported-or-unowned-normal-sp-charge-component')
        allowed_schema = [{'path': '/_buffs/0/isGroundBoundable', 'onlyIn': 'CN', 'value': 0}]
        if owner.get('schemaDifferences') not in ([], allowed_schema):
            return reject('unresolved-sp-charge-cross-snapshot-fields')
        buff = fields['_buffs'][0]
        fixed_buff = dict(BUFF_DEFAULTS, lifeTimeType=0,
            attributes=dict.fromkeys(ATTRIBUTE_KEYS, []), blackboard=[])
        if (field_contract(buff, fixed_buff, {'buffKey', 'templateKey'})
                or not buff['buffKey'] or buff['templateKey'] != graph['templateKey']):
            return reject('unsupported-complete-normal-charge-buff')
        siblings = charge.get('siblingComponents', {})
        kinds = [row.get('scriptType') for row in siblings.values()]
        if (kinds.count(CHARGE_TYPE) != 1 or kinds.count(RANGED) != 1
                or set(kinds) - {CHARGE_TYPE, RANGED, EMITTER}
                or siblings.get(charge.get('componentKey'), {}).get('fields') != fields
                or siblings.get(charge.get('normalAbilityComponentKey'), {}).get('fields') != charge.get('normalAbilityFields')):
            return reject('unsupported-complete-normal-ability-siblings')
        for row in siblings.values():
            if row['scriptType'] == EMITTER and (set(row.get('fields', {})) != EMITTER_FIELDS
                    or any(row['fields'][k] for k in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor'))):
                return reject('normal-presentation-affects-cast-lifecycle')
        normal = charge['normalAbilityFields']
        if field_contract(normal, ACTION_FIXED, ACTION_VARIABLE):
            return reject('unsupported-charged-normal-action')
        if charge['componentKey'] in seen_components:
            return reject('duplicate-normal-sp-charge-component')
        seen_components.add(charge['componentKey'])
        for mount in charge.get('mounts', []):
            pair = (mount.get('modeIndex'), mount.get('channel'))
            if pair in declared or pair[0] not in owner.get('modeIndicesFromAncestorGameObjects', []):
                return reject('duplicate-or-unowned-sp-charge-mount')
            channel = modes.get(str(pair[0]), {}).get('channels', {}).get(pair[1])
            if (not channel or channel.get('damageType') != DAMAGE_TYPES.get(normal['_damageType'])
                    or channel.get('atkScale') != normal['_atkScale']
                    or channel.get('projectile', {}).get('key') != normal['_projectileKey']
                    or channel.get('timing', {}).get('animation') != normal['_animKey']):
                return reject('charged-normal-action-does-not-match-owner-channel')
            declared.add(pair)
    expected = {(index, channel) for index in gain.get('modeIndices', []) for channel in gain.get('channels', [])}
    if (not expected or declared != expected
            or not set(candidate['modeIndices']).issubset(gain.get('modeIndices', []))
            or any(not modes.get(str(index), {}).get('channels', {}).get(channel) for index, channel in expected)):
        return reject('incomplete-normal-action-charge-mode-coverage')
    return deepcopy(runtime), None


def compile_skill(candidate, enemy_context, modes, initial_mode, *, timing_of,
                  projectile_of, animations, aliases, speeds, sp_contract):
    """Accept or reject a complete skill group; never take a supported sibling."""
    reasons = []
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    if enemy_context.get('sourceLevelType') == 'BOSS' or enemy_context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-or-boss-lifecycle-not-supported')
    if candidate.get('triggerType') != 'SelectorTrigger':
        return reject('unsupported-trigger:' + str(candidate.get('triggerType')))
    ownership = candidate.get('ownership', {})
    provider = candidate.get('provider', {})
    if (ownership.get('status') != 'shared-fields-match' or not ownership.get('ownershipOverlayEligible')
            or ownership.get('jpEnabled') != 1 or ownership.get('sharedFieldDifferences')
            or ownership.get('schemaDifferences') or not provider.get('structurallyMounted')
            or provider.get('structuralLocation') != 'mode-subtree'
            or ownership.get('componentKey') != candidate.get('sourceRef', {}).get('componentKey')):
        return reject('unresolved-or-inactive-skill-owner')
    indices = candidate.get('modeIndices')
    if (not indices or any(type(index) is not int or index < 0 or str(index) not in modes for index in indices)
            or sorted(set(indices)) != sorted(indices)
            or indices != provider.get('modeIndices')
            or indices != ownership.get('modeIndicesFromAncestorGameObjects') or initial_mode is None):
        return reject('unresolved-owner-mode-or-initial-mode')
    sf = candidate.get('skillFields', {})
    error = field_contract(sf, SKILL_FIXED, {'_trigger'})
    if error:
        return reject('enemy-skill:' + error)
    members = candidate.get('sameGameObjectComponents', {})
    required = {ENEMY_SKILL: [], RANGED: [], EMITTER: []}
    for key, component in members.items():
        typename = component.get('scriptType')
        if typename not in required or component.get('serializedGraphs'):
            return reject('unsupported-complete-ability-group:' + str(typename))
        required[typename].append((key, component))
    if len(required[ENEMY_SKILL]) != 1 or len(required[RANGED]) != 1:
        return reject('ambiguous-skill-or-basic-ability-binding')
    if set(candidate.get('abilityTypes', [])) != {key.rsplit('.', 1)[-1] for key, rows in required.items() if key != ENEMY_SKILL and rows}:
        return reject('incomplete-declared-ability-group')
    if required[ENEMY_SKILL][0][0] != candidate['sourceRef']['componentKey'] or required[ENEMY_SKILL][0][1].get('fields') != sf:
        return reject('skill-declaration-binding-mismatch')
    for _, emitter in required[EMITTER]:
        fields = emitter.get('fields', {})
        if set(fields) != EMITTER_FIELDS:
            return reject('unclassified-presentation-component-fields')
        if any(fields[k] for k in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor')):
            return reject('presentation-component-affects-cast-lifecycle')
    action_key, action_component = required[RANGED][0]
    fields = action_component.get('fields', {})
    error = field_contract(fields, ACTION_FIXED, ACTION_VARIABLE)
    if error:
        return reject('ranged-attack:' + error)
    if candidate.get('buffDeclarations') or candidate.get('actionTypes'):
        return reject('unhandled-buffs-or-serialized-actions')
    dependencies = candidate.get('componentDependencies', {})
    trigger_ref = reference_component(sf['_trigger'], dependencies)
    selector_ref = reference_component(fields['_selector'], dependencies)
    if not trigger_ref or trigger_ref[1].get('scriptType') != TRIGGER:
        return reject('unresolved-selector-trigger-reference')
    if not selector_ref or selector_ref[1].get('scriptType') != SELECTOR:
        return reject('unsupported-or-unresolved-selector')
    if set(dependencies) != {trigger_ref[0], selector_ref[0]}:
        return reject('unhandled-selector-or-trigger-dependencies')
    if any(component.get('serializedGraphs') for component in dependencies.values()):
        return reject('unhandled-selector-or-trigger-graphs')
    trigger, selector = trigger_ref[1]['fields'], selector_ref[1]['fields']
    if field_contract(trigger, TRIGGER_FIXED, {'_minTargetNum'}):
        return reject('unsupported-selector-trigger-fields')
    if field_contract(selector, SELECTOR_FIXED, {'_maxNum'}):
        return reject('unsupported-target-selector-fields')
    minimum, maximum = trigger['_minTargetNum'], selector['_maxNum']
    if type(minimum) is not int or type(maximum) is not int or not 1 <= minimum <= maximum <= 64:
        return reject('invalid-target-count-contract')
    bindings = candidate.get('databaseSkillBindings', [])
    if len(bindings) != 1:
        return reject('ambiguous-database-skill-name-binding')
    binding = bindings[0]
    skill_key = binding.get('prefabKey')
    if (not isinstance(skill_key, str) or not skill_key or skill_key.casefold() != candidate.get('name', '').casefold()
            or sum(row == binding for row in enemy_context.get('sourceSkills') or []) != 1):
        return reject('source-skill-name-or-parameters-mismatch')
    if set(binding) != {'prefabKey', 'priority', 'cooldown', 'initCooldown', 'spCost', 'blackboard'}:
        return reject('unclassified-database-skill-fields')
    if (not finite(binding['priority']) or type(binding['spCost']) is not int or binding['spCost'] <= 0
            or binding['cooldown'] != 0 or binding['initCooldown'] != 0):
        return reject('unsupported-skill-cooldown-or-sp-parameters')
    board = {}
    if not isinstance(binding['blackboard'], list):
        return reject('invalid-skill-blackboard')
    for entry in binding['blackboard']:
        if (set(entry) - {'key', 'value', 'valueStr'} or entry.get('key') not in {'atk_scale', 'max_target'}
                or entry.get('key') in board or entry.get('valueStr') is not None or not finite(entry.get('value'))):
            return reject('unhandled-skill-blackboard-key-or-value')
        board[entry['key']] = entry['value']
    scale = board.get('atk_scale', fields['_atkScale'])
    max_targets = board.get('max_target', maximum)
    if (not finite(fields['_atkScale']) or fields['_atkScale'] <= 0 or not finite(scale) or scale <= 0
            or not finite(max_targets) or max_targets != int(max_targets) or not minimum <= max_targets <= 64):
        return reject('invalid-skill-damage-or-target-parameters')
    if fields['_damageType'] not in DAMAGE_TYPES or not fields['_projectileKey']:
        return reject('unsupported-skill-damage-or-delivery')
    timing = timing_of(animations, fields, aliases, action_component.get('scriptPathID'))
    projectile, projectile_error = projectile_of([fields], speeds)
    if not timing or timing.get('hits') or not finite(timing.get('duration')) or not finite(timing.get('hit')):
        return reject('unresolved-single-event-skill-timing')
    if projectile_error or not projectile:
        return reject('unsupported-skill-projectile')
    action = dict(timing=timing, atkScale=fields['_atkScale'], atkScaleKey=fields['_atkScaleKey'],
        damageType=DAMAGE_TYPES[fields['_damageType']], delivery='projectile', projectile=projectile)
    # This family reuses an already compiled owner-mode action contract, not an
    # animation-name guess over all modes. Every mounted mode must agree.
    comparable = {key: value for key, value in action.items() if key != 'atkScaleKey'}
    for index in indices:
        if comparable not in modes[str(index)].get('channels', {}).values():
            return reject('skill-action-does-not-match-complete-owner-mode-contract')
    runtime_sp, error = compile_sp_contract(candidate, modes, sp_contract)
    if error:
        return reject(error)
    source_refs = [candidate['sourceRef']]
    for role, key in [('ranged-ability', action_key), ('trigger', trigger_ref[0]), ('selector', selector_ref[0])]:
        source_refs.append(dict(role=role, cache='work/garrison-skill-dispatch-priority.json',
            enemyId=candidate['enemyId'], componentKey=key, fieldPath='/fields'))
    source_refs.append(dict(role='native-sp-and-cast-contract', path=str(SP_CONTRACT.relative_to(ROOT)),
        sourceFingerprint=sp_contract['sourceFingerprint']))
    selection = dict(id=candidate['id'], candidateId=candidate['id'], enemyId=candidate['enemyId'],
        kind='selector-sp-ranged', skillKey=skill_key, modeIndices=indices,
        priority=binding['priority'], spCost=binding['spCost'], cooldown=0, initCooldown=0,
        cooldownStarts='cast-start',
        blackboard=board, allowedBlackboardKeys=['atk_scale', 'max_target'],
        trigger=dict(kind='selector', minTargets=minimum, keepTarget=False, searchTargetTick=-1),
        selector=dict(kind='blocked-or-advanced', sourceRule='blocked-or-advanced-operator-taunt-v1',
            maxTargets=dict(key=selector['_maxTargetKey'], default=maximum),
            targetSide=selector['_targetSide'], targetMotion=selector['_targetMotion'],
            targetCategory=selector['_targetCategory'], postFilter=selector['_postFilter'],
            ignoreHitRange=False, limitedMaxTargetNumToBlockedCnt=False),
        action=action,
        flags={key[1:]: value for key, value in SKILL_FIXED.items()},
        spContract=runtime_sp,
        sourceRef=candidate['sourceRef'], sourceRefs=source_refs,
        initiallyMounted=initial_mode in indices, nameBindingEvidenceLevel='Inferred',
        ownershipEvidenceLevel='Inferred', enemyImplementationComplete=False,
        automaticModeTransitionComplete=False,
        presentation=[deepcopy(item[1]['fields']) for item in required[EMITTER]], originalVisualsComplete=False)
    return dict(accepted=True, selection=selection, rejections=reasons)
