"""Closed ordinary AbilitySelectableGroup -> MultiRangedAttack source compiler.

This consumes a frozen, bounded candidate cache, never selecting an executor by
enemy ID. Unknown fields, extra gameplay siblings and incomplete ownership reject
the whole root. It does not declare any enemy's independent skills complete.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from enemy_chain_projectiles import (ROOT, FIXED_FIELDS, VARIABLE_FIELDS, VISUAL_FIELDS,
    SIMPLE, MOVEMENT, UNITY_FIELDS, ACTION_FIXED as RANGED_FIXED,
    finite, fingerprint, field_contract, local_ref, zeros)
from enemy_skill_dispatch import EMITTER, EMITTER_FIELDS
from overlay_enemy_mode_ownership import compare_fields

RULE = 'global-selector-shared-cooldown-multi-ranged-circle-v1'
CACHE = ROOT / 'work/enemy-selectable-attack-candidates.json'
P = 'Torappu.Battle.'
GROUP = P + 'Abilities.AbilitySelectableGroup'
MULTI = P + 'Abilities.MultiRangedAttack'
SELECTOR = P + 'AdvancedSelector'
ENEMY_SELECTOR = P + 'AdvancedSelectorWithEnemyOptions'
TRIGGER, GLOBAL, ALWAYS = (P + x for x in ('SelectorTrigger', 'GlobalRange', 'AlwaysTrigger'))
HIT, CIRCLE, EFFECT = (P + x for x in ('Projectiles.HitBehaviour', 'CircleRange', 'Projectiles.EffectBehaviour'))
NULL = {'m_FileID': 0, 'm_PathID': 0}
GROUP_FIXED = zeros('''_ignoreIfOwnerDead _forceAsDmgOrHealAbility _coolDownAbilityIndex
 _updateCooldownBySubAbilityCooldownDuringCasting _updateSubAbilitiesWhenExtendUpdated
 _timeMode _updateCooldownAfterSubAbilitiesAttached _selectAbilitySequentially
 _useSubAbilityEscapeTime _escapeTimeAbilityIndex _firstAttackIfAbilityChanged
 _resetSubAbilities _useCurAbCheckAtPreCastPhase _checkIAlwaysTriggerBySubAbility
 _finishByCbOnlyFromSubAbility''', _selector=NULL,
 _metadata={'namedAsAlias': '', 'blackboardPrefix': ''}, _interruptAbilityOnDetach=1,
 _attachPassiveBuffsOnDummy=1, _category=4, _clearInternalCooldownWhenFinish=1,
 _resetSubAbilityCooldown=1)
CONFIG_FIXED = zeros('_alwaysUseTrigger _useInputTarget _checkInputTargetInTrigger')
ACTION_FIXED = dict(RANGED_FIXED, _interruptAbilityOnDetach=1, _selectTargetSource=1,
 _elementDamageType=0, _waitForProjectileInvalid=0,
 _animKey='Attack', _endAnimKey='Idle', _downAnimKey='', _downEndAnimKey='',
 _upAnimKey='', _upEndAnimKey='',
 **zeros('''_waitAttackEventForAllAttacks _useMultiAdditionalProjectiles
 _enableMountPointGroup _onlyFeedActionsToFirstOne _onlyTrigAudioSignalForFirstOne
 _limitToOneTargetAfterFirstRound _splitDamage _addSpellCntToSignalId
 _onlyFeedActiveBuffToLastOne _onlyFeedActiveBuffToFirstOne _refreshTimesOnCastStart
 _castToFirstRoundTargetLocationsAtProjectileBirth''',
 _additionalProjectiles=[], _mountPointGroup=[], _hookTheLastProjectile=''))
ACTION_VARIABLE = {'_selector', '_projectileKey', '_additionalProjectile', '_additionalTimes', '_triggerDelta'}
SELECTOR_FIXED = zeros('''_ignoreTargetFree _onlyIgnoreSomeOfTargetFreeCase _ignoreAllyTargetFree
 _ignoreHealFree _ignoreMotionMode _forceIgnoreCamouflage _needProfessionMask _professionMask
 _excludeSomeAbnormalFlags _excludeOwner _sortByTauntAtLast _ignoreHitRange _checkUnitType
 _unitTypeMask _abilityInputTargetAsSortSource''', _targetMotion=3, _targetCategory=1,
 _postFilter=4, _abnormalFlag=42, _abnormalCombo=2, _excludeAbnormalFlag=46,
 _limitTargetNum=1, _maxTargetKey='max_target', _maxNum=1)
ENEMY_FIXED = zeros('''_filterEnemyKeyMode _filterByEnemiesTag _excludeDisappeared
 _excludeInCombat _filterBuff _buffKeyExcluded _checkReachableToOwner _avoidObstacleLike
 _checkOwnerCanBlockEnemy _filterUnbalance _filterNotInUnbalance _filterAbnormalImmune
 _filterEnemyMassLevel _massCompareType _massLevel''', _enemyLevelMask=7, _motionMask=3,
 _allowNoneApplyWay=1, _applyWay=3, _filterByEnemiesKey=1, _filterByEnemiesMode=1,
 _enemyTag='', _buffKey='', _abnormalFlagImmune=42)
HIT_FIXED = zeros('''_onlyCheckHitWhenStop _canFlyThroughTheDeathArea _exceptTraceTarget
 _overridePurposeMaskWithTargetOptions _ignoreRangeScale _exceptSource
 _mergeTraceTargetMotion _markReachedOnlyWhenTargetEnter''', _goThroughWall=1,
 _onlyCheckHitWhenReachTarget=1, _ignoreCamouflage=1,
 _targetOptions=zeros('''ignoreTargetFree ignoreAllyTargetFree ignoreHealFree ignoreTargetSide
 excludeSomeAbnormalFlags excludeAbnormalFlag purposeMask professionMask checkUnitType
 unitTypeMask onlyIgnoreSomeOfTargetFreeCase abnormalFlag abnormalCombo''',
 targetSide=2, targetMotion=3, targetCategory=1, enableAdvancedOptions=1))
JP_OMISSIONS = {
 GROUP: {'/_abilityConfigs/0/_checkInputTargetInTrigger': 0,
         '/_abilityConfigs/1/_checkInputTargetInTrigger': 0,
         '/_checkIAlwaysTriggerBySubAbility': 0, '/_finishByCbOnlyFromSubAbility': 0,
         '/_updateCooldownAfterSubAbilitiesAttached': 0},
 MULTI: {'/_affectedBySlowDown': 1, '/_checkFaceToFirstCastTargetDownAttack': 0},
 SELECTOR: {'/_excludeAbnormalFlag': 46, '/_excludeSomeAbnormalFlags': 0, '/_ignoreMotionMode': 0},
 ENEMY_SELECTOR: {'/_excludeAbnormalFlag': 46, '/_excludeSomeAbnormalFlags': 0,
                  '/_ignoreMotionMode': 0, '/_checkOwnerCanBlockEnemy': 0},
}


class Rejected(ValueError):
    pass


def require(ok, reason):
    if not ok:
        raise Rejected(reason)


def exact(fields, fixed, variables=(), where=''):
    reason = field_contract(fields, fixed, set(variables))
    require(reason is None, where + ':' + str(reason))


def ref_id(ref):
    require(local_ref(ref), 'unresolved-or-external-local-reference')
    return str(ref['m_PathID'])


def body(node):
    return {k: v for k, v in node['fields'].items() if k not in UNITY_FIELDS}


def owner(node):
    return ref_id(node['fields']['m_GameObject'])


def load_selectable_candidates(path=CACHE):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    for relative, expected in data['inputs'].items():
        require(hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected,
                'frozen-selectable-input-changed:' + relative)
    return data


def validate_owned_graph(graph):
    require(not graph.get('failures'), 'incomplete-owned-source-graph')
    nodes = graph['nodes']
    for pid, node in nodes.items():
        require(str(node['pathId']) == pid, 'ownership-node-id-mismatch')
        if node['unityType'] == 'GameObject':
            require(node['fields'].get('m_IsActive') == 1, 'inactive-source-gameobject')
            for item in node['fields']['m_Component']:
                cid = ref_id(item['component'])
                require(cid in nodes and owner(nodes[cid]) == pid, 'missing-or-mismatched-owned-component')
        else:
            require(owner(node) in nodes, 'missing-component-owner')
            if node['unityType'] == 'MonoBehaviour':
                require(node['fields'].get('m_Enabled') == 1 and
                        node.get('resolvedScript', {}).get('status') == 'resolved',
                        'disabled-or-unresolved-source-component')
    visited = set()
    def visit(gid):
        require(gid in nodes and nodes[gid]['unityType'] == 'GameObject' and gid not in visited,
                'invalid-or-cyclic-owned-subtree')
        visited.add(gid)
        parts = [nodes[ref_id(r['component'])] for r in nodes[gid]['fields']['m_Component']]
        transforms = [n for n in parts if n['unityType'] == 'Transform']
        require(len(transforms) == 1, 'missing-or-ambiguous-owned-transform')
        for ref in transforms[0]['fields']['m_Children']:
            child = nodes.get(ref_id(ref))
            require(child and child['unityType'] == 'Transform', 'missing-child-transform')
            visit(owner(child))
    visit(graph['rootGameObjectId'])
    require(visited == {k for k, n in nodes.items() if n['unityType'] == 'GameObject'},
            'disconnected-owned-subtree')
    return nodes


def compile_circle_projectile(resource, graph):
    require(resource.get('completeMonoBehaviourCoverage') and not resource.get('failures'),
            'incomplete-projectile-component-coverage')
    require(Path(resource['source']['assetPath']).stem == resource['key'], 'projectile-asset-key-mismatch')
    nodes = validate_owned_graph(graph)
    typed = {}
    for pid, node in nodes.items():
        if node['unityType'] != 'MonoBehaviour':
            require(node['unityType'] in {'GameObject', 'Transform', 'CircleCollider2D'},
                    'unknown-projectile-native-component')
            continue
        kind = node['resolvedScript']['type']
        require(kind in {SIMPLE, MOVEMENT, HIT, CIRCLE, EFFECT}, 'unsupported-projectile-component:' + kind)
        require(pid in resource['components'] and resource['components'][pid]['fields'] == node['fields'],
                'resource-and-ownership-projectile-conflict')
        typed.setdefault(kind, []).append((pid, node))
    require(all(len(typed.get(t, [])) == 1 for t in (SIMPLE, MOVEMENT, HIT, CIRCLE)),
            'ambiguous-projectile-behaviour')
    require(sum(len(v) for v in typed.values()) == len(resource['components']), 'extra-resource-component')
    simple, movement, hit, circle = (body(typed[t][0][1]) for t in (SIMPLE, MOVEMENT, HIT, CIRCLE))
    exact(simple, dict(FIXED_FIELDS[SIMPLE], _clearMainEffectWhenReached=1,
          _fixDealHitTargetLeft=1, _alwaysHitTraceTargetInTheEnd=1), VARIABLE_FIELDS[SIMPLE], 'simple')
    exact(movement, dict(FIXED_FIELDS[MOVEMENT], _fixOnProjectileReached=1), {'_speed'}, 'movement')
    exact(hit, HIT_FIXED, {'_rangeToLoad'}, 'hit')
    exact(circle, {'_extendable': 0, '_scaleble': 1}, where='circle')
    require(ref_id(hit['_rangeToLoad']) == typed[CIRCLE][0][0], 'unresolved-projectile-hit-range')
    go = owner(typed[SIMPLE][0][1])
    require(all(owner(typed[t][0][1]) == go for t in (MOVEMENT, HIT, CIRCLE)), 'projectile-owner-mismatch')
    colliders = [n for n in nodes.values() if n['unityType'] == 'CircleCollider2D']
    require(len(colliders) == 1 and owner(colliders[0]) == go, 'ambiguous-projectile-circle-collider')
    collider = colliders[0]['fields']
    exact(collider, {'m_GameObject': collider['m_GameObject'], 'm_Enabled': 1, 'm_Density': 1,
        'm_Material': {'m_FileID': 0, 'm_PathID': '0'}, 'm_IsTrigger': True,
        'm_UsedByEffector': False, 'm_UsedByComposite': False, 'm_Offset': {'x': 0, 'y': 0}},
        {'m_Radius'}, 'circle-collider')
    require(finite(collider['m_Radius']) and collider['m_Radius'] > 0, 'invalid-projectile-radius')
    for n in nodes.values():
        if n['unityType'] == 'Transform':
            require(n['fields']['m_LocalScale'] == {'x': 1, 'y': 1, 'z': 1} and
                    n['fields']['m_LocalPosition'] == {'x': 0, 'y': 0, 'z': 0}, 'unsupported-projectile-transform')
    for _, n in typed.get(EFFECT, []):
        exact(body(n), {}, VISUAL_FIELDS[EFFECT], 'projectile-visual')
    require(ref_id(simple['_bodyTransform']) in nodes and nodes[ref_id(simple['_bodyTransform'])]['unityType'] == 'Transform',
            'missing-projectile-body-transform')
    require(finite(movement['_speed']) and movement['_speed'] > 0 and
            finite(simple['_lifeTime']) and simple['_lifeTime'] > 0, 'invalid-projectile-speed-or-lifetime')
    return dict(kind='circle', key=resource['key'], speed=movement['_speed'], lifeTime=simple['_lifeTime'],
        radius=collider['m_Radius'], scalable=True, extendable=False, maxHitTargets=None,
        targetSide='enemy', ignoreCamouflage=True, includeTraceTargetAtEnd=True,
        targetFreePolicy='source-projectile-hit-options', oncePerTarget=True, hitAt='reach-target',
        stopWhenSourceInvalid=False,
        tracePolicy='force-valid-trace-once-at-end', castEndPolicy='emitted-projectiles-independent',
        movement=dict(traceTarget=True, flyToTargetLocationOnly=False, fixOnProjectileReached=True,
            clearTraceTargetWhenReached=True, forceReachedWhenTimeup=True, flyThroughDeathArea=False),
        sourceOptions=dict(simple=deepcopy(simple), movement=deepcopy(movement), hit=deepcopy(hit), circle=deepcopy(circle)),
        evidenceLevel='Inferred')


def compile_selectable_attack(candidate):
    """Return a runtime IR or an explicit whole-root rejection; no mutations."""
    try:
        return _compile(candidate)
    except (Rejected, KeyError, TypeError, ValueError) as error:
        return dict(accepted=False, rule=RULE, rejections=[str(error)])


def _compile(candidate):
    nodes = validate_owned_graph(candidate['ownership'])
    components = candidate['components']
    require(set(components) == {k for k, n in nodes.items() if n['unityType'] == 'MonoBehaviour'},
            'incomplete-cn-jp-component-set')
    root_id = candidate['ownership']['rootComponentId']
    require(root_id in components and components[root_id]['scriptType'] == GROUP, 'missing-selectable-group')
    root = components[root_id]['fields']
    exact(root, GROUP_FIXED, {'_abilityConfigs'}, 'group')
    require(len(root['_abilityConfigs']) == 2, 'unsupported-branch-count')
    mode = candidate['mode']
    require(mode['modeIndex'] == 0 and str(mode['channels']['attack']['pathID']) == root_id and
            str(mode['channels']['combat']['reference']['m_PathID']) == '0', 'unsupported-mode-or-combat-root')
    require(mode['channels']['attack']['fields'] == root, 'mode-channel-group-fields-conflict')
    configs = root['_abilityConfigs']
    selected_ids = {ref_id(c['_ability']) for c in configs}
    actual_ids = {pid for pid, c in components.items() if c['scriptType'] == MULTI}
    require(actual_ids == selected_ids, 'extra-or-missing-multi-ranged-gameplay-sibling')
    allowed = {GROUP, MULTI, SELECTOR, ENEMY_SELECTOR, TRIGGER, GLOBAL, ALWAYS, EMITTER}
    for pid, c in components.items():
        kind, fields, node = c['scriptType'], c['fields'], nodes[pid]
        require(kind in allowed and node['resolvedScript']['type'] == kind, 'unknown-source-component:' + kind)
        changes, missing = compare_fields(fields, body(node))
        omissions = {m['path']: m['value'] for m in missing if m.get('onlyIn') == 'CN'}
        require(not changes and len(omissions) == len(missing) and omissions == JP_OMISSIONS.get(kind, {}),
                'cn-jp-source-field-conflict:' + kind)
        if kind in {GLOBAL, ALWAYS}:
            exact(fields, {}, where=kind)
        if kind == EMITTER:
            exact(fields, {}, EMITTER_FIELDS, 'presentation')
            require(not any(fields[k] for k in ('_convertCastEndToAttachFinish', '_recalculatePlaybackSpeed', '_preDelayFactor')),
                    'presentation-affects-attack-lifecycle')
    require(sum(c['scriptType'] == GROUP for c in components.values()) == 1 and
            sum(c['scriptType'] == ALWAYS for c in components.values()) == 1, 'ambiguous-root-controller')
    branches, used = [], {root_id}
    for index, config in enumerate(configs):
        exact(config, CONFIG_FIXED, {'_ability', '_trigger'}, 'branch-config')
        aid, tid = ref_id(config['_ability']), ref_id(config['_trigger'])
        action = components[aid]['fields']
        exact(action, ACTION_FIXED, ACTION_VARIABLE, 'multi-action')
        require(components[tid]['scriptType'] == TRIGGER, 'missing-branch-selector-trigger')
        exact(components[tid]['fields'], {'_keepTarget': 0, '_minTargetNum': 1, '_overrideSearchTargetTick': -1}, where='trigger')
        sid = ref_id(action['_selector'])
        kind = ENEMY_SELECTOR if index == 0 else SELECTOR
        require(components[sid]['scriptType'] == kind and owner(nodes[sid]) == owner(nodes[tid]),
                'unresolved-trigger-selector-ownership')
        sf = components[sid]['fields']
        fixed = dict(SELECTOR_FIXED, _targetSide=7 if index == 0 else 2)
        if index == 0:
            exact(sf, dict(fixed, **ENEMY_FIXED), {'_enemyKey', '_enemyMode'}, 'enemy-selector')
            require(isinstance(sf['_enemyKey'], str) and sf['_enemyKey'] and
                    type(sf['_enemyMode']) is int and sf['_enemyMode'] >= 0, 'invalid-enemy-key-or-mode-filter')
        else:
            exact(sf, fixed, where='opponent-selector')
        ranges = [pid for pid, c in components.items() if c['scriptType'] == GLOBAL and owner(nodes[pid]) == owner(nodes[sid])]
        require(len(ranges) == 1, 'missing-or-ambiguous-global-selector-range')
        used.update([aid, tid, sid, *ranges])
        count, delta = action['_additionalTimes'] + 1, action['_triggerDelta']
        require(type(action['_additionalTimes']) is int and 2 <= count <= 64 and finite(delta) and delta > 0,
                'invalid-additional-shot-count-or-interval')
        require(action['_projectileKey'] == action['_additionalProjectile'] == candidate['projectile']['key'],
                'different-or-missing-additional-projectile')
        branches.append(dict(index=index, selector=dict(side='all' if index == 0 else 'enemy', range='global',
            enemyKey=sf.get('_enemyKey'), enemyMode=sf.get('_enemyMode'), limit=1, sort='hatred-desc',
            ignoreTargetFree=False, forceIgnoreCamouflage=False, motionMask=3, categoryMask=1),
            action=dict(damageType='arts', atkScale=1, shots=count, interval=delta,
                offsets=[round(i * delta, 9) for i in range(count)], firstShot='animation-OnAttack',
                laterShots='fixed-interval-after-first', animation=action['_animKey'],
                maxAnimationScale=action['_maxAnimScale'], affectedBySlowDown=True,
                targetSource='selector', selectTargetTiming='at-beginning',
                sourceTimingOptions={k: action[k] for k in ('_selectTargetSource', '_selectTargetTiming',
                    '_timeMode', '_resetCdStrategy', '_interuptIfTargetDead', '_waitForAttackEvent',
                    '_waitAttackEventForAllAttacks', '_refreshTimesOnCastStart')},
                lifecycle=dict(waitForProjectileInvalid=False, notClearProjectileWhenCastEnd=False,
                    fireAttackFinishWhenProjectileInvalid=False, emitToInputPosWhenTargetInvalid=False,
                    emitToInputRootTileWhenTargetInvalid=False)),
            sourceSelectorOptions=deepcopy(sf), sourceActionId=aid))
    require(all(pid in used or c['scriptType'] in {ALWAYS, EMITTER} for pid, c in components.items()),
            'unused-extra-gameplay-component')
    require(branches[0]['action'] == branches[1]['action'], 'branch-action-timing-contracts-differ')
    # Ordinary attack BB cannot silently borrow parameters from an independent
    # named EnemySkill. Only this graph's empty attack scope is currently closed.
    interval, boards = None, []
    for level in sorted(candidate['databaseLevels'], key=lambda row: row['level']):
        data = level['enemyData']
        value = data.get('attributes', {}).get('baseAttackTime', {})
        if value.get('m_defined'):
            interval = value['m_value']
        require(finite(interval) and interval > 0, 'missing-source-attack-interval')
        boards.append(interval)
        require(not any('attack@' in row.get('key', '') for row in data.get('talentBlackboard') or []),
                'unsupported-ordinary-attack-blackboard-overrides')
    require(boards and len(set(boards)) == 1, 'level-dependent-ordinary-attack-interval')
    projectile = compile_circle_projectile(candidate['projectile'], candidate['projectileOwnership'])
    ir = dict(rule=RULE, kind='selectable-multi-ranged', branches=branches, projectile=projectile,
        cooldown=dict(shared=True, sourceAbilityIndex=0, interval=interval, clearInternalOnFinish=True,
            resetSubAbilityCooldown=True, updateDuringCasting=False, timeMode=0), selection='first-eligible-source-order',
        completion='animation-and-additional-shots', evidenceLevel='Inferred',
        boundary='Explicit source graph, selectors, counts, collider radius and flags are recovered. Ordered trigger fallback, shared scheduler integration, hatred tie ordering, scaled radius and arrival fallback are shared simulation inferences, not native timing proof. Independent enemy skills and mode transitions of target enemies remain separate.')
    return dict(accepted=True, rule=RULE, selectableAttack=ir,
        timingAction=deepcopy(components[branches[0]['sourceActionId']]['fields']),
        sourceFingerprint=fingerprint(candidate))


def bind_selectable_timing(compiled, observed):
    """Keep the first real OnAttack; later shots are the explicit delta bridge."""
    result = deepcopy(compiled)
    if not result.get('accepted'):
        return result
    try:
        require(isinstance(observed, dict), 'missing-selectable-attack-animation')
        duration, hits = observed.get('duration'), observed.get('observedHits')
        require(finite(duration) and duration > 0 and hits and hits == sorted(hits) and
                all(finite(t) and 0 <= t <= duration for t in hits), 'invalid-selectable-attack-animation')
        fields = result['timingAction']
        timing = deepcopy(observed)
        timing.update(hit=hits[0], hits=[hits[0]], atkScale=fields['_atkScale'], abilityType=MULTI,
            hitSequenceContract='fixed-multi-interval-after-first-event-v1',
            playback=dict(rule='native-attack-time-capped-animation', timeMode=0, minScale=.1,
                          maxScale=fields['_maxAnimScale']))
        ir = result['selectableAttack']
        ir['action'] = dict(timing=timing, timeMode=0, minAnimScale=.1, maxAnimScale=fields['_maxAnimScale'],
            atkScale=fields['_atkScale'], damageType='arts', delivery='projectile',
            repeat=dict(count=fields['_additionalTimes']+1, interval=fields['_triggerDelta'], clock='cast-clock'),
            projectile=deepcopy(ir['projectile']))
        result['timing'] = timing
        return result
    except Rejected as error:
        return dict(accepted=False, rule=RULE, rejections=[str(error)])
