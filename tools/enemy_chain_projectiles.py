"""Compile one frozen, complete chain-projectile family without enemy-ID rules.

CN action parameters and JP projectile components remain distinct evidence.
Target ordering, attack@ scope and invalidation scheduling are explicit shared
inferences; this does not implement the two cold-Buff siblings in the cohort.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'work/enemy-chain-projectile-candidates.json'
RULE = 'fixed-enemy-chain-projectile-v2'
RANGED = 'Torappu.Battle.Abilities.RangedAttack'
CHAIN = 'Torappu.Battle.Projectiles.ChainLightningHitBehaviour'
MOVEMENT = 'Torappu.Battle.Projectiles.AdvancedMovement'
SIMPLE = 'Torappu.Battle.SimpleProjectile'
SELECTOR = 'Torappu.Battle.ChainedSelector'
ALLOWED_TYPES = {CHAIN, MOVEMENT, SIMPLE, SELECTOR, 'Torappu.Battle.CircleRange',
    'Torappu.Battle.Projectiles.EffectBehaviour', 'Torappu.Battle.Projectiles.ChainLightningEffectBehaviour'}
UNITY_FIELDS = {'m_GameObject', 'm_Enabled', 'm_Script', 'm_Name'}


def zeros(names, **fixed):
    return {**dict.fromkeys(names.split(), 0), **fixed}


# These are supported semantic configurations, not hashes of one enemy. A
# refreshed source must still satisfy them; unrecognized zero-valued fields are
# rejected too. Floating speed/lifetime and source BB parameters remain generic.
FIXED_FIELDS = {
    MOVEMENT: zeros('''_useSourceDirection _useTargetDirection _useStartToTarget
        _awayFromSourceAsDirection _flyToTargetLocationOnly _useSourceDirectionRandomArcAngleStart
        _useSourceToTargetRandomArcAngleStart _useSourceDirectionArcAngleWithRatio
        _useSourceToTargetArcAngleWithRatio _sourceDirectionArcAngleRatio _flyToPredefinedLocation
        _predefinedLocation _freezeRotationZ _freezeRotationXY _exactMatchCameraForward
        _resetToTargetPosWhenReached _resetToTracetargetMapPosV3 _handleWithIBuildableTarget
        _forceResetToTargetPosWhenReached _fixOnProjectileReached _onlyReachedInTime
        _distance _comeBack _delayToStart _delayAfterReached _delayToReachAfterHit
        _updateDelayTimeOnlyOnce _skipSmoothLerpDirection _addInertia _turnSpeed
        _useDynamicSpeed _deltaSpeedPerSec _finalSpeed _forceUseTargetMountPoint''',
        _rotateToTarget=1, _forceReachedWhenTimeup=1, _moveType=1,
        _moveTypeData={'data': []}, _comeBackSpeedScale=.25, _clearTraceTargetWhenReached=1,
        _randomOffset={'x': 0, 'y': 0, 'z': 0}),
    SELECTOR: zeros('_ignoreTargetFree _maxTarget _excludeOwner _useChainPrefix _fixAllowRepetitionIfNoTarget',
        _targetSide=2, _targetMotion=3, _targetCategory=1),
    CHAIN: zeros('''_resetRangeSelectorByBB _interval _waitFirstPeriod _onlyCheckHitWhenStop
        _exceptTraceTarget _hitPasserby _ignoreSmallEps _effectsWhenSelectPredict _selectEffectOnGround
        _playAudioWhenSelect _limitedHitTimes _stopWhenLimitedHitTimesUsedUp
        _playChainEffectAndAudioAfterSelectTarget''', _ignoreRangeScale=1, _firstPeriod=-1,
        _onlyCheckHitWhenReachTarget=1, _effectsWhenSelect=[], _intervalBbKey='interval',
        _limitedHitTimesBbKey='', _useChainPrefix=1,
        _freeJumpValidator={'m_FileID': 0, 'm_PathID': '0'},
        _atkScaleUpValidator={'m_FileID': 0, 'm_PathID': '0'}),
    SIMPLE: zeros('''_randomDelayToBorn _clearMainEffectWhenReached _fixDealHitTargetLeft
        _stopGraphicProjectileWhenClearMainEffect _fireProjectileReachedEvent _eliminatableStatus
        _movementAdjustableStatus _managedBySource _projectileType _containsChildrenBehaviours
        _canHitSameTargetMultipleTimes _getLifeTimeFromBB _getMaxHitNumFromBB _stopAfterFirstHit
        _stopWhenSourceInvalid _alwaysHitTraceTargetInTheEnd _alwaysHitTraceTargetWhenReached
        _alwaysReachInTheEnd _limitedMaxHitNumToSourceBlockedCnt _allowZeroBlockCntLimit''',
        _keepAlreadyHitTime=-1, _overrideAudioSignal='', _lifeTimeType=1, _hitNumType=2,
        _maxHitNum=1, _maxHitNumBBKey='', _stopAfterMaxHit=1,
        _actionController=zeros('''_detachBuffsWhenTargetLeave _detachAllBuffsWhenStopped
            _onlyAddBuffsToTraceTarget _onlyAddBuffsToTargetOnce _dontAddBuffs _excludeAttachments
            _useSelfBlackboard _useExtraBuffsWhenStopHit _addExtraBuffsWhenReached
            _detachAllExtraBuffsWhenStopped''', _extraBuffsInTheEnd=[])),
    'Torappu.Battle.CircleRange': dict(_extendable=0, _scaleble=0),
}
VARIABLE_FIELDS = {
    MOVEMENT: {'_speed'}, SELECTOR: set(), CHAIN: {'_atkScale', '_selector', '_rangeToLoad'},
    SIMPLE: {'_lifeTime', '_bodyTransform', '_mainEffect'}, 'Torappu.Battle.CircleRange': set(),
}
# Only named renderer fields are excluded from combat execution. New fields in
# these components still require classification, rather than trusting the type.
VISUAL_FIELDS = {
    'Torappu.Battle.Projectiles.EffectBehaviour': set('''_effectsWhenStart _effectsWhenReached
        _effectsWhenHit _effectsToTargetWhenStart _effectsToTileWhenStart _effectsWhenStop _effectOnTrigger
        _onlyPlayHitEffectOnTraceTarget _onlyPlayHitEffectOnNotTraceTarget _onlyPlayHitEffectOnce
        _clearHitEffectOnStop _clearPlayEffectOnStop _clearEffectsOnTileOnStop _clearReachedEffectWhenStop
        _alwaysPlayStartEffects _playStartEffectOnlyOnProjectile _useSourceFaceVector _useSourceFaceVectorOnHit
        _forceReachTargetGround _followTargetGround _replaceMainEffectWhenReach _mainEffectToReplace
        _useTraceTargetWhenReach _setReachEffectOnProjectile _syncEffectScaleViaProjectile'''.split()),
    'Torappu.Battle.Projectiles.ChainLightningEffectBehaviour': set('''_mainEffect _playSpecialEffectOnFirstOne
        _specialHitEffect _finishMainEffectsBeforePlay _playEffectOnHitPoint _setMeAsParent'''.split()),
}
ACTION_FIXED = zeros('''_interruptAbilityOnDetach _ignoreIfOwnerDead _forceAsDmgOrHealAbility
    _selectTargetTiming _timeMode _allowNoTarget _cooldown _preDelay _escapeTime
    _faceToDefault _faceToFront _faceToFirstCastTarget _checkFaceToFirstCastTargetDownAttack
    _forceFaceToDirection _onlyPlayEndAnimWhenIsLastAbility _ignorePalsyInterrupt
    _epDamageRatio _useDynamicAttackType _deliveryParaWhenReplaceActionNode _useMountGroup
    _notClearProjectileWhenCastEnd _fireAttackFinishWhenProjectileInvalid _minPostDelayWhenProjectileInvalid
    _waitForAnimEndWhenProjectileInvalid _projectileDestination _extraDamageType
    _emitToInputPosWhenTargetIsInvalid _emitToInputRootTileWhenTargetIsInvalid _useCachedAtkOnly
    _transferSource _fireCreateProjectileEvent''',
    _metadata={'namedAsAlias': '', 'blackboardPrefix': ''}, _attachPassiveBuffsOnDummy=1,
    _waitForAttackEvent=1, _interuptIfTargetDead=0, _resetCdStrategy=1, _selectTargetSource=2,
    _alwaysIncludeTarget=1, _cooldownKey='duration', _faceToTarget=1, _activeBuffs=[],
    _maxAnimScale=1, _affectedBySlowDown=1, _atkScale=1, _atkScaleKey='atk_scale', _attackType=1,
    _elementDamageType=4, _mountPointType=2, _mountGroup={'loopType': 0, 'mountPoints': []},
    _damageType=2, _waitForProjectileInvalid=1, _extraProjectileKeys=[])
ACTION_VARIABLE = set('''_selector _animKey _endAnimKey _downAnimKey _downEndAnimKey
    _upAnimKey _upEndAnimKey _projectileKey'''.split())


def local_ref(reference, *, nonzero=True):
    return (isinstance(reference, dict) and set(reference) == {'m_FileID', 'm_PathID'}
            and reference['m_FileID'] == 0 and isinstance(reference['m_PathID'], (str, int))
            and (not nonzero or str(reference['m_PathID']) != '0'))


def field_contract(fields, fixed, variable):
    if set(fields) != set(fixed) | variable:
        return 'unrecognized-or-missing-fields'
    if any(fields[k] != value for k, value in fixed.items()):
        return 'unsupported-field-values'
    return None


def check_projectile_graph(resource):
    components = resource['components']
    typed = {}
    for pid, component in components.items():
        name, fields = component['script']['type'], component['fields']
        if fields.get('m_Enabled') != 1 or not local_ref(fields.get('m_GameObject')):
            return 'disabled-or-unowned-projectile-component'
        if str(fields['m_GameObject']['m_PathID']) != str(component.get('gameObjectPathID')):
            return 'projectile-component-owner-mismatch'
        body = {k: v for k, v in fields.items() if k not in UNITY_FIELDS}
        failure = field_contract(body, FIXED_FIELDS.get(name, {}), VARIABLE_FIELDS.get(name, VISUAL_FIELDS.get(name, set())))
        if failure:
            return name + ':' + failure
        typed.setdefault(name, []).append((str(pid), fields))
    required = (CHAIN, MOVEMENT, SIMPLE, SELECTOR, 'Torappu.Battle.CircleRange')
    if any(len(typed.get(t, [])) != 1 for t in required):
        return 'ambiguous-projectile-component-contract'
    hit = typed[CHAIN][0][1]
    for field, target in (('_selector', SELECTOR), ('_rangeToLoad', 'Torappu.Battle.CircleRange')):
        ref = hit[field]
        if not local_ref(ref) or str(ref['m_PathID']) != typed[target][0][0]:
            return 'unresolved-chain-selector-or-range-reference'
    if not finite(hit['_atkScale']) or not 0 <= hit['_atkScale'] <= 1:
        return 'invalid-source-chain-decay'
    owner = typed[SIMPLE][0][1]['m_GameObject']
    if any(typed[t][0][1]['m_GameObject'] != owner for t in (CHAIN, MOVEMENT)):
        return 'chain-behaviour-not-on-projectile-owner'
    if typed[SELECTOR][0][1]['m_GameObject'] != typed['Torappu.Battle.CircleRange'][0][1]['m_GameObject']:
        return 'chain-selector-range-owner-mismatch'
    if not local_ref(typed[SIMPLE][0][1]['_bodyTransform']):
        return 'external-or-missing-projectile-body-transform'
    return None


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def load_chain_candidates(source_hashes, database_sha256, path=CACHE):
    if not Path(path).is_file():
        return {}, None
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    expected = data['inputs']
    if expected['prefabSha256'] != source_hashes.get('data_enemy_prefab_catalog_current.json') or expected['databaseSha256'] != database_sha256:
        raise ValueError('Chain projectile source changed; refresh its fixed candidate evidence before importing.')
    script_path = ROOT / 'work/client-logic/script-types.json'
    if hashlib.sha256(script_path.read_bytes()).hexdigest() != expected['scriptTypesSha256']:
        raise ValueError('Chain projectile script type source changed; refresh its fixed evidence.')
    if any(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != digest
           for p, digest in expected['sourceFiles'].items()):
        raise ValueError('Chain projectile source cache changed; refresh its fixed evidence.')
    if fingerprint({k: v for k, v in data.items() if k != 'sourceFingerprint'}) != data['sourceFingerprint']:
        raise ValueError('Chain projectile candidate fingerprint mismatch.')
    return data['enemies'], data['sourceFingerprint']


def compile_chain_projectile(candidate, attacks, speeds):
    def reject(reason):
        return dict(accepted=False, reasons=[reason])
    if not candidate:
        return reject('outside-frozen-chain-cohort')
    source_actions = candidate.get('actions', [])
    if not attacks or {fingerprint(a) for a in attacks} != {fingerprint(a['fields']) for a in source_actions}:
        return reject('root-action-set-does-not-match-frozen-source')
    if any(a.get('scriptType') != RANGED for a in source_actions):
        return reject('unsupported-chain-source-ability')
    if any(a.get('_activeBuffs') for a in attacks):
        return reject('chain-hit-buffs-and-skill-overrides-not-supported')
    if any(field_contract(a, ACTION_FIXED, ACTION_VARIABLE) for a in attacks):
        return reject('unsupported-complete-chain-action-fields')
    if any(not local_ref(a['_selector'], nonzero=False) or str(a['_selector']['m_PathID']) != '0'
           for a in attacks):
        return reject('custom-chain-action-selector-not-supported')
    keys = {a.get('_projectileKey') for a in attacks}
    if len(keys) != 1 or None in keys or '' in keys:
        return reject('multiple-or-missing-projectile-keys')
    key = next(iter(keys))
    resource = candidate.get('projectile', {})
    if resource.get('key') != key or not resource.get('completeMonoBehaviourCoverage'):
        return reject('incomplete-or-wrong-projectile-resource')
    by_type = {}
    for component in resource.get('components', {}).values():
        name = component.get('script', {}).get('type')
        if name not in ALLOWED_TYPES or component.get('script', {}).get('status') != 'resolved':
            return reject('unsupported-or-unresolved-projectile-component')
        by_type.setdefault(name, []).append(component['fields'])
    if any(len(by_type.get(t, [])) != 1 for t in (CHAIN, MOVEMENT, SIMPLE, SELECTOR)):
        return reject('ambiguous-projectile-component-contract')
    graph_failure = check_projectile_graph(resource)
    if graph_failure:
        return reject(graph_failure)
    hit, movement, projectile, selector = [by_type[t][0] for t in (CHAIN, MOVEMENT, SIMPLE, SELECTOR)]
    if any(a.get(field) for a in attacks for field in ('_extraProjectileKeys', '_additionalProjectile',
            '_additionalProjectiles', '_duoProjectileKey', '_useMultiAdditionalProjectiles', '_projectileDestination',
            '_multiProjectilePerTarget', '_multiProjectileMountPointTypes', '_isSectorProjectileMovement',
            '_fireAttackFinishWhenProjectileInvalid', '_waitForAnimEndWhenProjectileInvalid',
            '_minPostDelayWhenProjectileInvalid', '_notClearProjectileWhenCastEnd', '_useDynamicAttackType',
            '_emitToInputPosWhenTargetIsInvalid', '_emitToInputRootTileWhenTargetIsInvalid', '_transferSource', '_extraDamageType')):
        return reject('unsupported-chain-action-shape-or-lifecycle')
    if any(a.get('_waitForProjectileInvalid') != 1 or a.get('_damageType') != 2 or a.get('_elementDamageType') != 4
           or a.get('_atkScale') != 1 for a in attacks):
        return reject('unsupported-chain-action-damage-contract')
    if hit.get('_onlyCheckHitWhenReachTarget') != 1 or hit.get('_interval') != 0 or any(hit.get(k) for k in
            ('_onlyCheckHitWhenStop', '_hitPasserby', '_waitFirstPeriod', '_limitedHitTimes', '_limitedHitTimesBbKey',
             '_stopWhenLimitedHitTimesUsedUp', '_exceptTraceTarget', '_resetRangeSelectorByBB')):
        return reject('unsupported-chain-hit-schedule')
    if any(hit.get(k, {}).get('m_FileID') or str(hit.get(k, {}).get('m_PathID', 0)) != '0'
           for k in ('_freeJumpValidator', '_atkScaleUpValidator')):
        return reject('chain-validator-not-supported')
    if selector.get('_fixAllowRepetitionIfNoTarget') or any(movement.get(k) for k in
            ('_useDynamicSpeed', '_deltaSpeedPerSec', '_finalSpeed', '_delayToReachAfterHit', '_turnSpeed')):
        return reject('dynamic-chain-target-or-movement')
    controller = projectile.get('_actionController', {})
    if any(controller.values()) or any(projectile.get(k) for k in ('_getLifeTimeFromBB', '_getMaxHitNumFromBB',
            '_canHitSameTargetMultipleTimes', '_stopWhenSourceInvalid', '_limitedMaxHitNumToSourceBlockedCnt')):
        return reject('projectile-hit-side-effects-or-dynamic-lifetime')
    speed, life = speeds.get(key), projectile.get('_lifeTime')
    if not finite(speed) or speed <= 0 or not finite(life) or life <= 0 or projectile.get('_lifeTimeType') != 1:
        return reject('invalid-chain-speed-or-lifetime')
    if speed != movement.get('_speed'):
        return reject('cn-jp-projectile-speed-conflict')
    boards = candidate.get('blackboards', [])
    if not boards or any(b['blackboard'] != boards[0]['blackboard'] for b in boards):
        return reject('missing-or-level-dependent-chain-blackboard')
    board, seen = {}, set()
    for item in boards[0]['blackboard'] or []:
        name = item.get('key')
        if name in seen:
            return reject('duplicate-chain-blackboard-key')
        seen.add(name)
        board[name] = item
    suffixes = dict(maxTargets='max_target', radius='projectile_range', decay='chain.atk_scale', epRatio='ep_damage_ratio')
    prefixes = {name[:-len('max_target')] for name in board if isinstance(name, str) and name.endswith('attack@max_target')}
    prefixes = [p for p in prefixes if all(p+s in board for s in suffixes.values())]
    if len(prefixes) != 1:
        return reject('missing-or-ambiguous-attack-blackboard-scope')
    prefix = prefixes[0]
    source_keys = {k: prefix+s for k, s in suffixes.items()}
    values = {k: board[name].get('value') for k, name in source_keys.items()}
    if any(board[name].get('valueStr') or not finite(board[name].get('value')) for name in source_keys.values()):
        return reject('nonnumeric-chain-blackboard-parameter')
    if int(values['maxTargets']) != values['maxTargets'] or not 1 <= values['maxTargets'] <= 64 or not values['radius'] > 0 or not 0 <= values['decay'] <= 1 or values['epRatio'] < 0:
        return reject('unsupported-chain-blackboard-parameter')
    ir = dict(kind='chain', key=key, speed=speed, lifeTime=life, damageType='arts',
        chain=dict(maxTargets=int(values['maxTargets']), radius=values['radius'], decay=values['decay'],
                   interval=0, allowRepeat=False),
        element=dict(type='apoptosis', ratio=values['epRatio'], sourceEnum=4), sourceKeys=source_keys,
        lifecycle=dict(waitForProjectileInvalid=True, finishWhenInvalid=False, waitForAnimEnd=False, minPostDelay=0),
        evidenceLevel='Inferred')
    return dict(accepted=True, projectile=ir, selection=dict(enemyId=candidate['enemyId'], projectile=ir,
        rule=RULE, sourceRefs=candidate['sourceRefs'], sourceNamespace=prefix,
        boundary='CN root actions and parameters with exact-name JP projectile evidence. Nearest unique targets, same-frame chain, attack@ scope, EP decay and cast-token invalidation are explicit shared inferences; cold hit Buffs and other enemy abilities are excluded.'))
