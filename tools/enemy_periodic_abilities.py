"""Compile a complete mode-owned periodic Buff / named ability group.

Periodic listeners, their named payload, source attribute and normal-attack EP
scope are accepted together. They are not EnemySkills or completed whole enemies.
"""
from copy import deepcopy
import hashlib
from pathlib import Path

from enemy_skill_dispatch import ROOT, EMITTER_FIELDS, finite, field_contract, read, zeros
from enemy_self_cast_skills import (DORMANT_FIXED, PASSIVE_FIELDS, PASSIVE, MELEE,
    empty_attributes, empty_graph, node, plain_buff)

RULE = 'mode-periodic-buff-named-ability-complete-group-v1'
CONTRACT = ROOT / 'work/enemy-periodic-ability-contract.json'
TALENT = 'Torappu.Battle.Talent'
ADVANCED = 'Torappu.Battle.AdvancedSelector'
PHYSICS_RANGE = 'Torappu.Battle.PhysicsRange'
EMPTY = 'Torappu.Battle.EmptyAbility'
EMITTER = 'Torappu.Battle.Abilities.UberEffectEmitter'

SELF_DAMAGE_NODE = node('DamageViaMaxHpRatio', _targetType='TARGET', _getMaxHpFromTarget=False,
    _damageType='PURE', _applyWay='NONE', _ignoreForSp=True, _isUndeadable=False,
    _attackType='NONE', _skipModifierEvent=True, _multiplyByKey=False,
    _multiplierKey='cnt', _noSourceDamage=False)
NAMED_CALL_FIXED = node('TriggerAbility', _ownerType='BUFF_OWNER', _targetType='BUFF_OWNER',
    _checkCanUseAblityFlag=False, _castDirectly=True, _useFirstActiveAbility=False,
    _useCastResult=False, _triggerHostAbility=False, _notInterruptAbilityIfCasting=False)
SELECTOR_FIXED = zeros('''_postFilter _ignoreTargetFree _onlyIgnoreSomeOfTargetFreeCase
    _ignoreAllyTargetFree _ignoreHealFree _ignoreMotionMode _forceIgnoreCamouflage
    _needProfessionMask _professionMask _excludeSomeAbnormalFlags _limitTargetNum
    _excludeOwner _sortByTauntAtLast _ignoreHitRange _checkUnitType _unitTypeMask
    _abilityInputTargetAsSortSource''', _targetSide=2, _targetMotion=3, _targetCategory=1,
    _abnormalFlag=22, _abnormalCombo=2, _excludeAbnormalFlag=46,
    _maxTargetKey='max_target', _maxNum=1)
NAMED_FIELDS = {key: value for key, value in DORMANT_FIXED.items() if key not in {'_selector', '_metadata'}}
NAMED_FIELDS.update(_timeMode=2, _alwaysIncludeTarget=0, _allowNoTarget=1,
                    _attackType=2, _affectedBySlowDown=0)
NORMAL_FIELDS = dict(DORMANT_FIXED, _selectTargetSource=2, _maxAnimScale=1, _atkScale=1,
                     _animKey='Skill_Attack', _endAnimKey='Idle')
TALENT_FIELDS = zeros('''_overwriteParentRangeId _attachInDummy _overrideDefaultRangeId
    _applyTalentScale _influenceSkillBlackboard _fromRawDataToSkill _applyTalentRange
    _applyBlackboardBySkill _applyStrBlackboardBySkill _writeRangeIdToProjectileBlackboard
    _affectWhenNotRootTalent _scaleCertainKeyFlag _scaleCertainMode''',
    _overwriteTalentKey='', _checkValidBySkillIndex=[], _defaultModeIndex=-1,
    _attackBlackboardModeIndex=-1, _extraAttackBlackboardModeIndices=[],
    _scaleCertainKeyList=[], _scaleModeIndices=[])


def load_periodic_contract(awake_contract):
    if not CONTRACT.is_file():
        return {}
    contract = read(CONTRACT)
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return {}
    if contract.get('parentAwakeSourceFingerprint') != awake_contract.get('sourceFingerprint'):
        raise ValueError('Periodic group belongs to a different frozen awake source contract.')
    descriptor = contract.get('inputs', {}).get('awakeContract', {})
    source = ROOT / descriptor.get('path', '')
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != descriptor.get('sha256'):
        raise ValueError('Periodic group parent source changed; refresh the focused periodic contract.')
    return contract


def exact_graph(graph, event, expected):
    return (isinstance(graph, dict) and set(graph) == {'templateKey', 'effectKey', 'onEventPriority', 'eventToActions'}
            and graph['effectKey'] == '' and graph['onEventPriority'] == 'DEFAULT'
            and graph['eventToActions'] == {event: expected})


def owned_in_mode(key, ownership, mode_index):
    owner = ownership.get('components', {}).get(key, {})
    return (owner.get('status') == 'shared-fields-match' and owner.get('ownershipOverlayEligible')
            and owner.get('jpEnabled') == 1 and not owner.get('sharedFieldDifferences')
            and owner.get('modeIndicesFromAncestorGameObjects') == [mode_index])


def same_object(record, ownership, key):
    object_id = ownership.get('components', {}).get(key, {}).get('gameObjectPathID')
    if not object_id:
        return {}
    return {item_key: component for item_key, component in record['components'].items()
            if ownership.get('components', {}).get(item_key, {}).get('gameObjectPathID') == object_id}


def scoped_parameter(member, talent_key, key, default=None):
    """Use a fully bound talent namespace; never fall back to unrelated keys."""
    record, ownership = member['catalog'], member['ownership']
    talent = record['components'].get(talent_key, {})
    if talent.get('scriptType') != TALENT or field_contract(talent.get('fields'), TALENT_FIELDS):
        return None
    owner = ownership['components'][talent_key]
    ancestors = owner.get('ancestorGameObjects', [])
    namespace = talent['fields']['_overwriteTalentKey'] or (ancestors[0].get('name') if ancestors else None)
    if not namespace:
        return None
    rows = member['priority'].get('sourceTalentBlackboard') or []
    matches = [row for row in rows if row.get('key') in {namespace + '.' + key, namespace.lower() + '.' + key}]
    if len(matches) != 1 or not finite(matches[0].get('value')) or matches[0].get('valueStr') not in (None, ''):
        return None
    return dict(key=matches[0]['key'], default=matches[0]['value'])


def talent_sibling(record, ownership, key, allowed):
    siblings = same_object(record, ownership, key)
    kinds = [row.get('scriptType') for row in siblings.values()]
    talents = [item_key for item_key, row in siblings.items() if row.get('scriptType') == TALENT]
    if len(talents) != 1 or set(kinds) - set(allowed) or any(row.get('serializedGraphs') for row in siblings.values()):
        return None
    if field_contract(record['components'][talents[0]].get('fields'), TALENT_FIELDS):
        return None
    for row in siblings.values():
        if row.get('scriptType') == EMITTER:
            fields = row.get('fields', {})
            if (set(fields) != EMITTER_FIELDS
                    or any(fields[name] for name in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor'))):
                return None
    return talents[0]


def compile_circle_range(binding, selector_key, ownership):
    reject = lambda reason: (None, reason)
    if (not binding or not binding.get('bindingComplete')
            or binding.get('roles', {}).get('selector') != selector_key):
        return reject('missing-bound-named-ability-range')
    colliders, chain = binding.get('colliders', []), binding.get('transformChain', [])
    owner = ownership.get('components', {}).get(selector_key, {})
    object_id = owner.get('gameObjectPathID')
    if len(colliders) != 1 or colliders[0].get('unityType') != 'CircleCollider2D' or not chain:
        return reject('unsupported-or-ambiguous-named-collider')
    fields = colliders[0].get('fields', {})
    fixed = dict(m_GameObject={'m_FileID': 0, 'm_PathID': object_id}, m_Enabled=1,
        m_Density=1, m_Material={'m_FileID': 0, 'm_PathID': '0'}, m_IsTrigger=True,
        m_UsedByEffector=False, m_UsedByComposite=False, m_Offset={'x': 0, 'y': 0})
    if field_contract(fields, fixed, {'m_Radius'}) or not finite(fields.get('m_Radius')) or fields['m_Radius'] <= 0:
        return reject('unsupported-complete-circle-collider-fields')
    ancestry = [row.get('pathID') for row in owner.get('ancestorGameObjects', [])]
    if len(chain) != len(ancestry) or len({row.get('pathId') for row in chain}) != len(chain):
        return reject('incomplete-collider-transform-ancestry')
    for index, transform in enumerate(chain):
        tf = transform.get('fields', {})
        if (transform.get('unityType') != 'Transform'
                or field_contract(tf, dict(m_GameObject={'m_FileID': 0, 'm_PathID': ancestry[index]},
                    m_LocalRotation={'x': 0, 'y': 0, 'z': 0, 'w': 1},
                    m_LocalPosition={'x': 0, 'y': 0, 'z': 0}, m_LocalScale={'x': 1, 'y': 1, 'z': 1}),
                    {'m_Children', 'm_Father'})):
            return reject('unsupported-collider-transform')
        expected_parent = chain[index + 1]['pathId'] if index + 1 < len(chain) else '0'
        if tf['m_Father'] != {'m_FileID': 0, 'm_PathID': expected_parent}:
            return reject('broken-collider-transform-parent')
        if index and {'m_FileID': 0, 'm_PathID': chain[index - 1]['pathId']} not in tf['m_Children']:
            return reject('broken-collider-transform-child')
    if ancestry[-1] != ownership.get('entityRootGameObjectPathID'):
        return reject('collider-range-is-not-owned-by-enemy')
    if binding.get('sourceRange') != dict(shape='circle', radius=fields['m_Radius'],
            offset={'x': 0, 'y': 0}, allAncestorScalesIdentity=True):
        return reject('derived-range-disagrees-with-complete-collider')
    return dict(kind='circle', radius=fields['m_Radius']), None


def compile_periodic_group(member, modes, contract, *, range_binding=None):
    """Return one indivisible mode group, keeping rejected effects unexported."""
    reject = lambda reason: dict(accepted=False, selection=None, rejections=[reason])
    if not contract.get('bindingComplete') or not contract.get('sourceFingerprint'):
        return reject('missing-complete-periodic-source-contract')
    context = member['priority']
    if context.get('sourceLevelType') == 'BOSS' or context.get('dedicatedBossProfile'):
        return reject('dedicated-boss-periodic-contract-not-supported')
    record, ownership = member['catalog'], member['ownership']
    enemy_id, templates = record['enemyId'], contract.get('templates', {})
    range_binding = range_binding or contract.get('bindings', {}).get(enemy_id)
    enum_values = contract.get('metadataEnums', {})
    if (enum_values.get('Torappu.Battle.ElementType', {}).get('SANITY', {}).get('value') != 1
            or enum_values.get('Torappu.AttributeModifierData+AttributeModifier+FormulaItemType', {}).get('MULTIPLIER', {}).get('value') != 1
            or enum_values.get('Torappu.Battle.Modifier+SourceAttackType', {}).get('SPLASH', {}).get('value') != 2):
        return reject('unbound-periodic-source-enum-semantics')
    components = record['components']
    providers = []
    for key, component in components.items():
        if component.get('scriptType') == PASSIVE:
            for buff in component.get('fields', {}).get('_buffs', []):
                graph = templates.get(buff.get('templateKey'), {})
                if exact_graph(graph, 'ON_BUFF_TRIGGER', [SELF_DAMAGE_NODE]):
                    providers.append((key, component, buff))
    if len(providers) != 1:
        return reject('ambiguous-complete-self-damage-provider')
    revive_key, revive, damage_buff = providers[0]
    owner_modes = ownership.get('components', {}).get(revive_key, {}).get('modeIndicesFromAncestorGameObjects')
    if not owner_modes or len(owner_modes) != 1 or str(owner_modes[0]) not in modes:
        return reject('unresolved-periodic-owner-mode')
    mode_index = owner_modes[0]
    if not owned_in_mode(revive_key, ownership, mode_index):
        return reject('unowned-periodic-provider')
    revive_fields = revive.get('fields', {})
    if field_contract(revive_fields, PASSIVE_FIELDS, {'_buffs'}) or len(revive_fields['_buffs']) != 3:
        return reject('unsupported-complete-revive-passive-buffs')
    revive_talent = talent_sibling(record, ownership, revive_key, {TALENT, PASSIVE})
    if not revive_talent or not owned_in_mode(revive_talent, ownership, mode_index):
        return reject('unresolved-revive-parameter-owner')
    speed_buff, actual_damage, visual_buff = revive_fields['_buffs']
    speed_attributes = empty_attributes()
    speed_attributes['attributeModifiers'] = [dict(attributeType=6, formulaItem=1, value=0,
        loadFromBlackboard=1, fetchBaseValueFromSourceEntity=0)]
    if (not plain_buff(speed_buff, attributes=speed_attributes)
            or not empty_graph(templates.get(speed_buff.get('templateKey')))):
        return reject('unsupported-complete-periodic-move-speed-buff')
    if (actual_damage != damage_buff or not plain_buff(damage_buff, triggerLifeType=2,
            triggerInterval=1, overrideEffectKey=damage_buff.get('overrideEffectKey'))):
        return reject('unsupported-self-damage-periodic-lifetime')
    if (not plain_buff(visual_buff, triggerLifeType=2, overrideEffectKey=visual_buff.get('overrideEffectKey'))
            or not empty_graph(templates.get(visual_buff.get('templateKey')))):
        return reject('unhandled-revive-sibling-buff')
    move_speed = scoped_parameter(member, revive_talent, 'move_speed')
    hp_ratio = scoped_parameter(member, revive_talent, 'hp_ratio')
    if not move_speed or not hp_ratio or move_speed['default'] < -1 or not 0 < hp_ratio['default'] <= 1:
        return reject('unresolved-revive-full-parameters')
    callers = []
    for key, component in components.items():
        if component.get('scriptType') != PASSIVE or key == revive_key:
            continue
        for buff in component.get('fields', {}).get('_buffs', []):
            graph = templates.get(buff.get('templateKey'), {})
            nodes = graph.get('eventToActions', {}).get('ON_BUFF_TRIGGER', [])
            if len(nodes) == 1 and nodes[0].get('$type') == NAMED_CALL_FIXED['$type']:
                callers.append((key, component, buff, graph, nodes[0]))
    if len(callers) != 1:
        return reject('ambiguous-complete-periodic-named-caller')
    call_key, caller, call_buff, call_graph, call_node = callers[0]
    if (not owned_in_mode(call_key, ownership, mode_index)
            or field_contract(caller.get('fields'), PASSIVE_FIELDS, {'_buffs'})
            or caller['fields']['_buffs'] != [call_buff]
            or not plain_buff(call_buff, triggerLifeType=2, triggerInterval=1, waitFirstTriggerInterval=0)
            or field_contract(call_node, NAMED_CALL_FIXED, {'_abilityName'})
            or not exact_graph(call_graph, 'ON_BUFF_TRIGGER', [call_node])):
        return reject('unsupported-complete-periodic-named-caller')
    caller_talent = talent_sibling(record, ownership, call_key, {TALENT, PASSIVE})
    if not caller_talent or not owned_in_mode(caller_talent, ownership, mode_index):
        return reject('unresolved-named-caller-parameter-owner')
    interval = scoped_parameter(member, caller_talent, 'interval')
    if not interval or interval['default'] <= 0:
        return reject('unresolved-named-caller-interval')
    ability_name = call_node['_abilityName']
    named = [(key, row) for key, row in components.items()
             if row.get('fields', {}).get('_metadata', {}).get('namedAsAlias') == ability_name]
    if len(named) != 1:
        return reject('ambiguous-named-ability-alias')
    ability_key, ability = named[0]
    ability_fields = ability.get('fields', {})
    if (ability.get('scriptType') != MELEE or not owned_in_mode(ability_key, ownership, mode_index)
            or field_contract(ability_fields, NAMED_FIELDS, {'_selector', '_metadata'})
            or ability_fields['_metadata'] != {'namedAsAlias': ability_name, 'blackboardPrefix': ''}):
        return reject('unsupported-complete-named-ability')
    named_talent = talent_sibling(record, ownership, ability_key, {TALENT, MELEE, EMITTER})
    if not named_talent or not owned_in_mode(named_talent, ownership, mode_index):
        return reject('unresolved-named-ability-sibling-group')
    named_ratio = scoped_parameter(member, named_talent, 'ep_damage_ratio')
    if not named_ratio or named_ratio['default'] < 0:
        return reject('unresolved-named-element-damage-parameter')
    selector_ref = ability_fields['_selector']
    selector_matches = [(key, row) for key, row in components.items()
                        if str(row.get('pathID')) == str(selector_ref.get('m_PathID'))]
    if (set(selector_ref) != {'m_FileID', 'm_PathID'} or selector_ref['m_FileID'] != 0
            or len(selector_matches) != 1):
        return reject('unresolved-named-ability-selector')
    selector_key, selector = selector_matches[0]
    if (selector.get('scriptType') != ADVANCED or field_contract(selector.get('fields'), SELECTOR_FIXED)
            or not owned_in_mode(selector_key, ownership, mode_index)):
        return reject('unsupported-complete-named-selector')
    selector_siblings = same_object(record, ownership, selector_key)
    if sorted(row.get('scriptType') for row in selector_siblings.values()) != sorted([ADVANCED, PHYSICS_RANGE, 'Torappu.Battle.NeverTrigger']):
        return reject('unhandled-named-selector-range-siblings')
    never_key, never = next((key, row) for key, row in selector_siblings.items() if row['scriptType'] == 'Torappu.Battle.NeverTrigger')
    if never.get('fields') != {} or not owned_in_mode(never_key, ownership, mode_index):
        return reject('unresolved-named-ability-default-trigger')
    range_key, source_range = next((key, row) for key, row in selector_siblings.items() if row['scriptType'] == PHYSICS_RANGE)
    if source_range.get('fields') != {'_extendable': 0}:
        return reject('unsupported-named-physics-range')
    # The focused extractor must bind the real Unity collider to this selector.
    geometry, error = compile_circle_range(range_binding, selector_key, ownership)
    if error:
        return reject(error)
    ep_talents = [(key, scoped_parameter(member, key, 'attack@ep_damage_ratio')) for key, row in components.items()
                  if row.get('scriptType') == TALENT and owned_in_mode(key, ownership, mode_index)]
    ep_talents = [(key, value) for key, value in ep_talents if value is not None]
    if len(ep_talents) != 1:
        return reject('ambiguous-normal-attack-element-scope')
    ep_key, normal_ratio = ep_talents[0]
    ep_siblings = same_object(record, ownership, ep_key)
    if sorted(row['scriptType'] for row in ep_siblings.values()) != sorted([TALENT, EMPTY]):
        return reject('unhandled-normal-element-talent-siblings')
    if next(row['fields'] for row in ep_siblings.values() if row['scriptType'] == EMPTY) != PASSIVE_FIELDS:
        return reject('normal-element-talent-has-executable-extra-actions')
    if normal_ratio['default'] < 0:
        return reject('invalid-normal-element-ratio')
    source_modes = [mode for mode in record['cachedChannels']['modes'] if mode['modeIndex'] == mode_index]
    if len(source_modes) != 1:
        return reject('unresolved-normal-element-mode-root')
    normal_root = source_modes[0]['channels'].get('combat', {})
    compiled_normal = modes[str(mode_index)].get('channels', {}).get('combat')
    if (normal_root.get('fields') != NORMAL_FIELDS or normal_root.get('status') != 'direct-damage-root'
            or source_modes[0]['channels'].get('attack', {}).get('status') != 'absent'
            or not compiled_normal or compiled_normal.get('damageType') != 'phys'
            or compiled_normal.get('atkScale') != 1 or compiled_normal.get('delivery') != 'direct'):
        return reject('unsupported-normal-element-source-root')
    normal_keys = [key for key, row in components.items() if str(row.get('pathID')) == str(normal_root['pathID'])]
    ep_ability = next(key for key, row in ep_siblings.items() if row['scriptType'] == EMPTY)
    if len(normal_keys) != 1:
        return reject('ambiguous-normal-element-component-source')
    roles = dict(reviveProvider=revive_key, namedAbility=ability_key, normalEpAbility=ep_ability,
        normalEpTalent=ep_key, periodicAbilityProvider=call_key, normalCombat=normal_keys[0],
        selector=selector_key, physicsRange=range_key)
    if not range_binding or range_binding.get('roles') != roles:
        return reject('periodic-role-bindings-disagree-with-full-source')
    for role, key in roles.items():
        bound = range_binding.get('roleComponents', {}).get(role, {})
        if (bound.get('componentKey') != key or bound.get('component') != components[key]
                or bound.get('ownership') != ownership['components'][key]):
            return reject('periodic-role-source-record-mismatch')
    group_id = f'{enemy_id}|mode:{mode_index}|periodic-ability-group'
    selection = dict(id=group_id, enemyId=enemy_id, kind='mode-periodic-ability-group', modeIndex=mode_index,
        attributes=[dict(stat='moveSpeed', formula='multiplier', value=move_speed, buffKey=speed_buff['buffKey'])],
        periodics=[
            dict(id=group_id + '|self-damage', kind='self-damage-maxhp', interval=damage_buff['triggerInterval'],
                waitFirst=True, ratio=hp_ratio, damageType='true', attackType='none', applyWay='none',
                ignoreForSp=True, undeadable=False, skipModifierEvent=True, source='owner', target='owner'),
            dict(id=group_id + '|named:' + ability_name, kind='named-ability', interval=interval,
                waitFirst=False, ability=ability_name, call={key[1:]: value for key, value in call_node.items() if key.startswith('_')})],
        abilities={ability_name: dict(physicalScale=0, damageType='phys', elementType='nervous',
            elementRatio=named_ratio, range=geometry, timeMode=2,
            selector=dict(kind='all-opponents-in-range', targetSide=2, targetMotion=3, targetCategory=1,
                          ignoreTargetFree=False, ignoreHitRange=False),
            sourceAbilityKey=ability_key, sourceElementType='SANITY', sourceAttackType='SPLASH',
            elementFormulaEvidenceLevel='Inferred')},
        normalAttackElement=dict(type='nervous', ratio=normal_ratio, modeIndex=mode_index,
            channels=['combat'], abilityPathIDs=[str(normal_root['pathID'])],
            sourceElementType='SANITY', sourceAttackType='NORMAL', elementFormulaEvidenceLevel='Inferred'),
        sourceRefs=[dict(path=str(CONTRACT.relative_to(ROOT)), sourceFingerprint=contract['sourceFingerprint']),
            *[dict(enemyId=enemy_id, componentKey=key) for key in
              (revive_key, call_key, ability_key, selector_key, range_key, ep_key)]],
        presentation=[dict(buffKey=buff['buffKey'], effectKey=buff.get('overrideEffectKey'))
                      for buff in (damage_buff, visual_buff)],
        originalVisualsComplete=False, enemyImplementationComplete=False,
        boundary='Complete selected mode-owned Revive/Scream/normal-element group; not a new EnemySkill or full enemy completion.')
    return dict(accepted=True, selection=selection, rejections=[])
