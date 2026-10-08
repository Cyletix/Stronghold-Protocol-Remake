"""Compile complete replacement graphs by structure, never skill/character ID.

Animation metadata stays inside the existing basic-action timing boundary.
Every gameplay field must be consumed; additional Buffs are not scale-only skills.
"""
import hashlib
import json
import math
from enemy_chain_projectiles import FIXED_FIELDS, MOVEMENT, SIMPLE, VISUAL_FIELDS, local_ref, zeros

P = 'Torappu.Battle.'
CONTROLLERS = {P + 'ReplacementSkill', P + 'ReplacementSkillFixed'}
ATTACKS = {P + 'Abilities.' + n for n in ('MeleeAttack', 'MultiMeleeAttack', 'RangedAttack')}
SELECTORS = {P + 'AdvancedSelector', P + 'BlockedOrAdvancedSelector'}
RANGE, TRIGGER, EFFECT, READY = (P + n for n in ('AutoLoadBoxRange', 'SelectorTrigger', 'Abilities.UberEffectEmitter', 'Skills.ReadySkillEffect'))
UNITY = {'m_GameObject', 'm_Enabled', 'm_Script', 'm_Name'}
RULE = 'garrison-structural-replacement-v2'
NULL = {'m_FileID': 0, 'm_PathID': '0'}
PARACURVE = P + 'Projectiles.ParacurveMovement'


class Rejected(ValueError):
    def __init__(self, category, detail):
        self.category, self.detail = category, detail
        super().__init__(category + ': ' + detail)


def require(condition, category, detail):
    if not condition:
        raise Rejected(category, detail)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def finite(v):
    return type(v) in (int, float) and math.isfinite(v)


def positive_int(v):
    return finite(v) and int(v) == v and v > 0


def body(row):
    f = row['fields']
    require(f.get('m_Enabled') == 1 and local_ref(f.get('m_GameObject')), 'incomplete-component', row['type'] + ': disabled/unowned')
    require(row.get('script', {}).get('status') == 'resolved' and row['script'].get('type') == row['type'],
            'unresolved-script', row['type'])
    return {k: v for k, v in f.items() if k not in UNITY}


def contract(f, fixed, variable=(), label='component'):
    expected = set(fixed) | set(variable)
    require(set(f) == expected, 'unconsumed-fields', label + ': ' + ','.join(sorted(set(f) ^ expected)))
    wrong = [k for k, v in fixed.items() if f[k] != v]
    require(not wrong, 'unsupported-field-values', label + ': ' + ','.join(wrong))


CONTROLLER_FIXED = zeros('''_allowSpRecoveryWhenAffecting _limitGlobalTriggerTime _hidden
    _showSpBarEvenHidden _showSpAsBulletMode _showSpRatioAsProgress _playCharWordWithPassiveType
    _canCastWithNoSp _canSilenced _canUseInAbnormalState _writeDurationToAttackBlackboard
    _attachSignalIds _useEscapeTime _earlySkillFinishAtAttackFinished _showProgressToNext
    _hideSkillStackCount _hideHudSkillStackCount _playSkillBeginAnim _useFaceVector _cancelIfSearchTargetFailed''',
    _maxTriggerTime=-1, _playCharWordVoice=1, _defaultModeIndex=-1, _attackBlackboardModeIndex=-1,
    _extraAttackBlackboardModeIndices=[], _rangeIdModeIndex=-1, _extraRangeIdModeIndices=[],
    _rangeIdUsageType=7, _extraAbilities=[], _beginAnim='', _beginAnimDown='', _beginEffect=[],
    _beginAnimValidator=NULL, _availableValidator=NULL, _trigger=NULL, _recoverSpIfTargetDead=1, _rangeToShow=NULL)
ATTACK_FIXED = zeros('''_ignoreIfOwnerDead _forceAsDmgOrHealAbility _interuptIfTargetDead
    _timeMode _cooldown _escapeTime _faceToDefault _faceToFront _faceToFirstCastTarget
    _forceFaceToDirection _onlyPlayEndAnimWhenIsLastAbility _ignorePalsyInterrupt
    _elementDamageType _epDamageRatio _useDynamicAttackType _deliveryParaWhenReplaceActionNode _extraDamageType''',
    _metadata={'namedAsAlias': '', 'blackboardPrefix': ''}, _attachPassiveBuffsOnDummy=1,
    _waitForAttackEvent=1, _resetCdStrategy=1, _selectTargetSource=1, _cooldownKey='duration',
    _activeBuffs=[], _atkScale=1, _attackType=1)
ATTACK_VARIABLE = set('''_selector _interruptAbilityOnDetach _selectTargetTiming _alwaysIncludeTarget
    _allowNoTarget _animKey _endAnimKey _downAnimKey _downEndAnimKey _upAnimKey _upEndAnimKey
    _preDelay _faceToTarget _maxAnimScale _atkScaleKey _damageType'''.split())
MULTI_FIXED = zeros('''_triggerDelta _splitDamage _minPostDelay _onlyFeedActiveBuffToLastOne
    _onlyFeedActiveBuffToFirstOne _addSpellCntToAllSignalId _addSpellCntToLastSignalId
    _onlyTrigAudioSignalForFirstSpell _onlyTrigAudioSignalForFirstHit _addSpellCntToAllHitSignalId
    _refreshInputTargetOnCheckSpell _refreshTimesOnCastStart _refreshTimesOnCheckAnotherSpell''', _refreshInputTargetTrigger=NULL)
RANGED_FIXED = zeros('''_useMountGroup _waitForProjectileInvalid _notClearProjectileWhenCastEnd
    _fireAttackFinishWhenProjectileInvalid _minPostDelayWhenProjectileInvalid _waitForAnimEndWhenProjectileInvalid
    _projectileDestination _emitToInputPosWhenTargetIsInvalid _emitToInputRootTileWhenTargetIsInvalid
    _useCachedAtkOnly _transferSource _fireCreateProjectileEvent''', _mountPointType=2,
    _mountGroup={'loopType': 0, 'mountPoints': []}, _extraProjectileKeys=[])
SELECTOR_FIXED = zeros('''_ignoreTargetFree _onlyIgnoreSomeOfTargetFreeCase _ignoreAllyTargetFree
    _ignoreHealFree _forceIgnoreCamouflage _needProfessionMask _professionMask _excludeOwner
    _sortByTauntAtLast _ignoreHitRange _checkUnitType _unitTypeMask _abilityInputTargetAsSortSource''',
    _targetSide=2, _targetCategory=1, _abnormalCombo=2)
SELECTOR_VARIABLE = set('_targetMotion _postFilter _abnormalFlag _limitTargetNum _maxTargetKey _maxNum'.split())
EFFECT_FIELDS = set('''_hitEffects _castEffects _attachEffects _inputTargetEffects _castTargetEffects
    _convertCastEndToAttachFinish _recalculatePlaybackSpeed _preDelayFactor'''.split())


class ProjectileCompiler:
    """Read each complete cached subtree once; reject unknown child behaviours."""
    def __init__(self, bundle, script_types):
        self.bundle, self.script_types, self.cache, self.assets = bundle, script_types, {}, {}
        for path, r in bundle['assetContainer']:
            self.assets.setdefault(path.rsplit('/', 1)[-1].removesuffix('.prefab'), []).append(r['asset'])

    def compile(self, key, *, healing=False):
        cache_key = (key, healing)
        if cache_key in self.cache:
            if isinstance(self.cache[cache_key], Rejected):
                raise self.cache[cache_key]
            return self.cache[cache_key]
        try:
            result = self._compile(key, healing)
        except Rejected as error:
            self.cache[cache_key] = error
            raise
        self.cache[cache_key] = result
        return result

    def _compile(self, key, healing=False):
        roots = self.assets.get(key, [])
        require(len(roots) == 1 and local_ref(roots[0]), 'projectile-incomplete', key + ': missing/ambiguous root')
        nodes, seen, components, transforms = self.bundle['nodes'], set(), [], set()

        def node(ref):
            require(local_ref(ref) and str(ref['m_PathID']) in nodes, 'projectile-incomplete', key + ': unresolved reference')
            return nodes[str(ref['m_PathID'])]

        def visit(ref):
            go = node(ref)
            require(go['unityType'] == 'GameObject' and go['fields'].get('m_IsActive'), 'projectile-incomplete', key + ': inactive/not GameObject')
            pid = str(go['pathId'])
            require(pid not in seen, 'projectile-incomplete', key + ': cyclic subtree')
            seen.add(pid)
            for c_ref in go['fields']['m_Component']:
                c = node(c_ref['component'])
                require(c['fields'].get('m_GameObject') == ref, 'projectile-incomplete', key + ': owner mismatch')
                if c['unityType'] == 'Transform':
                    transforms.add(str(c['pathId']))
                    for child in c['fields'].get('m_Children', []):
                        visit(node(child)['fields']['m_GameObject'])
                elif c['unityType'] == 'MonoBehaviour':
                    name = self.script_types.get(str(c['fields'].get('m_Script', {}).get('m_PathID')))
                    require(name in {SIMPLE, MOVEMENT, P + 'Projectiles.EffectBehaviour'} | ({PARACURVE} if healing else set()), 'projectile-special-behaviour', key + ': ' + str(name))
                    components.append(dict(node_id=str(c['pathId']), type=name, fields=c['fields'], script={'status': 'resolved', 'type': name}))
                else:
                    require(False, 'projectile-special-behaviour', key + ': ' + c['unityType'])

        visit(roots[0])
        typed = {t: [c for c in components if c['type'] == t] for t in {c['type'] for c in components}}
        movements = typed.get(MOVEMENT, []) + typed.get(PARACURVE, [])
        require(len(typed.get(SIMPLE, [])) == len(movements) == 1,
                'projectile-special-delivery', key + ': one ordinary projectile and movement required')
        simple, movement = typed[SIMPLE][0], movements[0]
        require(simple['fields']['m_GameObject'] == roots[0] == movement['fields']['m_GameObject'],
                'projectile-special-delivery', key + ': nested gameplay owner')
        fixed = {**FIXED_FIELDS[SIMPLE], '_hitNumType': 1, '_alwaysHitTraceTargetInTheEnd': 1}
        for flag in ('_clearMainEffectWhenReached', '_fixDealHitTargetLeft'):
            fixed.pop(flag)
        contract(body(simple), fixed, {'_lifeTime', '_bodyTransform', '_mainEffect', '_clearMainEffectWhenReached', '_fixDealHitTargetLeft'}, SIMPLE)
        arc = movement['type'] == PARACURVE
        movement_fixed = dict(FIXED_FIELDS[MOVEMENT])
        if arc:
            movement_fixed = zeros('''_rotateToTarget _useSourceDirection _useTargetDirection _useStartToTarget
                _awayFromSourceAsDirection _flyToTargetLocationOnly _useSourceDirectionRandomArcAngleStart
                _useSourceToTargetRandomArcAngleStart _useSourceDirectionArcAngleWithRatio _useSourceToTargetArcAngleWithRatio
                _sourceDirectionArcAngleRatio _flyToPredefinedLocation _predefinedLocation _freezeRotationZ _freezeRotationXY
                _exactMatchCameraForward _resetToTargetPosWhenReached _resetToTracetargetMapPosV3 _handleWithIBuildableTarget
                _forceResetToTargetPosWhenReached _fixOnProjectileReached _onlyReachedInTime _delayAfterReached _delayTime
                _updateDelayTimeOnlyOnce _comeBack _inverseParacurve _useRandomHeight _randomInverseParacurve''',
                _forceReachedWhenTimeup=1, _comeBackSpeedScale=.25, _randomHeightRange={'x': 0, 'y': 0})
            contract(body(movement), movement_fixed, {'_speed', '_raiseHeight', '_noRaiseHeightThreshold'}, PARACURVE)
        else:
            for field in ('_freezeRotationZ','_rotateToTarget','_randomOffset'):movement_fixed.pop(field)
            variable = {'_speed', '_freezeRotationZ','_rotateToTarget','_randomOffset'}
            if healing:
                movement_fixed.pop('_fixOnProjectileReached');variable.add('_fixOnProjectileReached')
            contract(body(movement), movement_fixed, variable, MOVEMENT)
        s, m = simple['fields'], movement['fields']
        require(local_ref(s['_bodyTransform'], nonzero=False) and (str(s['_bodyTransform']['m_PathID']) == '0' or str(s['_bodyTransform']['m_PathID']) in transforms),
                'projectile-incomplete', key + ': missing body transform')
        require(s['_clearMainEffectWhenReached'] in (0, 1) and s['_fixDealHitTargetLeft'] in (0, 1)
                and m['_freezeRotationZ'] in (0, 1) and m['_rotateToTarget'] in (0,1),
                'projectile-special-delivery', key + ': unknown appearance/hit-left flags')
        # Static birth offsets and renderer rotation do not introduce another
        # collision or hit controller. Consumers keep their existing spawn-point
        # and orientation presentation; exact visual offsets are not reproduced.
        require(arc and all(finite(m[k]) and m[k] >= 0 for k in ('_raiseHeight', '_noRaiseHeightThreshold')) or not arc
                and isinstance(m['_randomOffset'],dict) and set(m['_randomOffset'])=={'x','y','z'}
                and all(finite(v) and v>=0 for v in m['_randomOffset'].values()),
                'projectile-special-delivery', key + ': invalid static appearance offset')
        require(m['_fixOnProjectileReached'] in (0, 1), 'projectile-special-delivery', key + ': invalid reached flag')
        require(finite(s['_lifeTime']) and s['_lifeTime'] > 0 and finite(m['_speed']) and m['_speed'] > 0,
                'projectile-special-delivery', key + ': invalid speed/lifetime')
        for c in components:
            if c['type'] not in {SIMPLE, MOVEMENT, PARACURVE}:
                contract(body(c), {}, VISUAL_FIELDS[c['type']], c['type'])
        return dict(key=key, speed=m['_speed'], life=s['_lifeTime'], componentIds=sorted(c['node_id'] for c in components),
                    graphSha256=digest(components), rule='complete-simple-trace-projectile-v1',
                    controllerType='Torappu.Battle.Projectile+ActionController', buffPhase='before-body',
                    **(dict(healing=True, motion='paracurve' if arc else 'trace', fixOnReached=bool(m['_fixOnProjectileReached'])) if healing else {}))


def compile_replacement(sid, rows, levels, char_ids, projectile_compiler, hit_buff_compiler=None):
    if any(r['type']==P+'Abilities.AbilityParallelGroup' for r in rows):
        from next_attack_compound import compile_compound
        require(hit_buff_compiler is not None,'compound-listener','template provider required')
        return compile_compound(sid,rows,levels,char_ids,projectile_compiler,hit_buff_compiler)
    if any(r['type'] in {P+'Abilities.Heal', P+'Abilities.RangedHeal'} for r in rows):
        from next_attack_heal_compiler import compile_healing_replacement
        return compile_healing_replacement(sid, rows, levels, char_ids, projectile_compiler)
    require(bool(rows) and len({r['node_id'] for r in rows}) == len(rows), 'incomplete-component', 'missing/duplicate components')
    unknown = sorted({r['type'] for r in rows} - (CONTROLLERS | ATTACKS | SELECTORS | {RANGE, TRIGGER, EFFECT, READY}))
    require(not unknown, 'extra-gameplay-components', ','.join(unknown))
    typed = {t: [r for r in rows if r['type'] == t] for t in {r['type'] for r in rows}}
    controllers, attacks = [r for r in rows if r['type'] in CONTROLLERS], [r for r in rows if r['type'] in ATTACKS]
    require(len(controllers) == len(attacks) == 1, 'mixed-action-graph', 'exactly one controller and attack required')
    for r in rows:
        body(r)
    controller, attack = controllers[0], attacks[0]
    contract(body(controller), CONTROLLER_FIXED, label=controller['type'])
    require(controller['fields']['m_GameObject'] == attack['fields']['m_GameObject'], 'unresolved-reference', 'controller/attack ownership')
    a, fixed, variable = body(attack), dict(ATTACK_FIXED), set(ATTACK_VARIABLE)
    fixed.pop('_selectTargetSource');variable.add('_selectTargetSource')
    hit_buffs = []
    if a.get('_activeBuffs'):
        require(hit_buff_compiler is not None, 'active-buffs', 'additional Buff lifecycle')
        hit_buffs = hit_buff_compiler.compile(a['_activeBuffs'])
        fixed.pop('_activeBuffs')
        variable.add('_activeBuffs')
    ranged, multi = attack['type'].endswith('.RangedAttack'), attack['type'].endswith('.MultiMeleeAttack')
    if ranged:
        fixed.update(RANGED_FIXED)
        fixed.pop('_waitForProjectileInvalid');fixed.pop('_mountPointType')
        variable.update({'_waitForProjectileInvalid', '_mountPointType'})
        variable.add('_projectileKey')
    else:
        fixed['_alwaysPutIncludeTargetFirst'] = 0
    if multi:
        fixed.update(MULTI_FIXED)
        variable.update({'_additionalTimes', '_waitAttackEventForAllAttacks'})
    contract(a, fixed, variable, attack['type'])
    require(all(a[k] in (0, 1) for k in ('_interruptAbilityOnDetach', '_selectTargetTiming', '_alwaysIncludeTarget', '_allowNoTarget', '_faceToTarget'))
            and a['_selectTargetSource'] in (1, 2) and finite(a['_maxAnimScale']) and (a['_maxAnimScale'] == -1 or a['_maxAnimScale'] > 0)
            and finite(a['_preDelay']) and a['_preDelay'] >= 0
            and all(isinstance(a[k], str) for k in ('_animKey', '_endAnimKey', '_downAnimKey', '_downEndAnimKey', '_upAnimKey', '_upEndAnimKey')),
            'unsupported-action-control', 'timing/facing contract')
    require(not ranged or a['_waitForProjectileInvalid'] in (0, 1) and a['_mountPointType'] in (2, 6),
            'unsupported-action-control', 'projectile wait/mount contract')
    require(a['_damageType'] in (1, 2) and isinstance(a['_atkScaleKey'], str) and a['_atkScaleKey'], 'unsupported-damage-contract', 'type or scale binding')
    hits = a.get('_additionalTimes', 0) + 1
    require(positive_int(hits) and (not multi or a['_waitAttackEventForAllAttacks'] in (0, 1)), 'unsupported-hit-sequence', 'repeat count')
    selectors = [r for r in rows if r['type'] in SELECTORS]
    input_target = a['_selectTargetSource'] == 2 and a['_selector'] == NULL
    ranges = typed.get(RANGE, [])
    if input_target:
        require(not selectors and not ranges and not typed.get(TRIGGER) and a['_alwaysIncludeTarget'] == 1
                and a['_selectTargetTiming'] == 0 and a['_allowNoTarget'] == 0,
                'unresolved-selector', 'FROM_INPUT requires one unchanged input target without sibling selectors')
        selector, blocked = None, False
        s = dict(_limitTargetNum=1, _maxTargetKey='', _maxNum=1, _targetMotion=None)
    else:
        require(a['_selectTargetSource'] == 1 and local_ref(a['_selector']) and len(selectors) == 1
                and selectors[0]['node_id'] == str(a['_selector']['m_PathID']), 'unresolved-selector', 'one referenced local selector required')
        selector, s = selectors[0], body(selectors[0])
        blocked = selector['type'].endswith('.BlockedOrAdvancedSelector')
        sfixed, svariable = dict(SELECTOR_FIXED), set(SELECTOR_VARIABLE)
        if blocked:
            sfixed['_allowZeroBlockCntLimit'] = 0
            svariable.add('_limitedMaxTargetNumToBlockedCnt')
        contract(s, sfixed, svariable, selector['type'])
        require(s['_targetMotion'] in (1, 3) and s['_postFilter'] in (0, 4) and s['_limitTargetNum'] in (0, 1)
                and (not blocked or s['_limitedMaxTargetNumToBlockedCnt'] in (0, 1)) and positive_int(s['_maxNum'])
                and isinstance(s['_maxTargetKey'], str) and finite(s['_abnormalFlag']), 'unsupported-selector-policy', 'motion/filter/budget')
        require(len(ranges) == 1 and ranges[0]['fields']['m_GameObject'] == selector['fields']['m_GameObject'], 'unresolved-range', 'auto-loaded selector range')
        contract(body(ranges[0]), {'_extendable': 0}, label=RANGE)
        for r in typed.get(TRIGGER, []):
            require(r['fields']['m_GameObject'] == selector['fields']['m_GameObject'], 'unresolved-reference', 'orphan trigger')
            contract(body(r), {'_keepTarget': 0, '_minTargetNum': 1, '_overrideSearchTargetTick': -1}, label=TRIGGER)
    require(len(typed.get(TRIGGER, [])) <= 1, 'mixed-action-graph', 'multiple target triggers')
    for r in typed.get(EFFECT, []) + typed.get(READY, []):
        require(r['fields']['m_GameObject'] == attack['fields']['m_GameObject'], 'unresolved-reference', 'orphan visual component')
        contract(body(r), {}, EFFECT_FIELDS if r['type'] == EFFECT else {'_effects', '_stopBeforeCast'}, r['type'])
    require(bool(levels) and bool(char_ids), 'missing-level-or-identity', sid)
    key_sets = [set(b['key'] for b in lv['blackboard']) for lv in levels]
    require(all(k == key_sets[0] and len(k) == len(lv['blackboard']) for k, lv in zip(key_sets, levels)), 'blackboard-shape', 'level/duplicate keys')
    keys = key_sets[0]
    target_key = s['_maxTargetKey'] if s['_limitTargetNum'] and s['_maxTargetKey'] in keys else None
    effect_keys = {effect[k] for effect in hit_buffs for k in ('scaleKey', 'valueKey', 'durationKey') if k in effect}
    consumed = {a['_atkScaleKey']} | ({target_key} if target_key else set()) | effect_keys
    extra = keys - consumed
    # Display aliases only qualify when equal to the controller charge count at
    # every source level; an unrelated field with the same name cannot slip in.
    charge_key = next(iter(extra)) if len(extra) == 1 and extra <= {'ct', 'cnt'} else None
    if charge_key:
        consumed.add(charge_key)
    require(keys == consumed, 'unconsumed-blackboard', ','.join(sorted(keys - consumed)))
    for n, lv in enumerate(levels, 1):
        b, sp = {r['key']: r['value'] for r in lv['blackboard']}, lv['spData']
        require(lv['prefabId'] == sid and lv['skillType'] == 'AUTO' and lv['duration'] in (0, -1)
                and sp['spType'] in ('INCREASE_WHEN_ATTACK', 'INCREASE_WITH_TIME') and finite(sp['spCost']) and sp['spCost'] > 0
                and positive_int(sp['maxChargeTime']) and sp['increment'] == 1, 'unsupported-controller-level', str(n))
        require(all(finite(v) for v in b.values()) and b[a['_atkScaleKey']] > 0
                and all(('scaleKey' not in effect or b[effect['scaleKey']] > 0) and ('durationKey' not in effect or b[effect['durationKey']] > 0)
                        and ('valueKey' not in effect or -1 < b[effect['valueKey']] <= 0) for effect in hit_buffs)
                and (not target_key or positive_int(b[target_key]))
                and (not charge_key or b[charge_key] == sp['maxChargeTime']), 'invalid-blackboard-values', str(n))
    policy = ('input' if input_target else 'block-count' if s.get('_limitedMaxTargetNumToBlockedCnt') else 'blackboard' if target_key else
              'fixed' if s['_limitTargetNum'] else 'single' if blocked else 'all')
    projectile = projectile_compiler.compile(a['_projectileKey']) if ranged else None
    return dict(kind='next-attack', rule=RULE, charIds=sorted(char_ids), blackboardKeys=sorted(keys), levelCount=len(levels),
                scaleKey=a['_atkScaleKey'], hits=int(hits), targets=policy, targetKey=target_key,
                targetCount=s['_maxNum'] if policy == 'fixed' else 1, chargeKey=charge_key,
                groundOnly=None if input_target else s['_targetMotion'] == 1, damageType={1: 'phys', 2: 'arts'}[a['_damageType']],
                delivery='projectile' if ranged else 'direct', projectile=projectile, waitForProjectile=bool(ranged and a['_waitForProjectileInvalid']),
                hitBuffs=[dict(effect, phase='before-body' if ranged else 'after-body') for effect in hit_buffs],
                source=dict(graphSha256=digest(rows), componentIds=[r['node_id'] for r in rows], attackNode=attack['node_id'],
                            preDelay=a['_preDelay'], targetTiming=a['_selectTargetTiming'], projectile=a.get('_projectileKey'),
                            controllerType=controller['type'], selectorType=selector['type'] if selector else 'FROM_INPUT', sourceLevelsSha256=digest(levels)))
