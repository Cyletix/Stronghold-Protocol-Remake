"""Complete single-body replacement heals; no skill or character ID dispatch."""
from next_attack_compiler import (
    P, CONTROLLERS, CONTROLLER_FIXED, ATTACK_FIXED, ATTACK_VARIABLE, SELECTOR_FIXED, SELECTOR_VARIABLE,
    RANGE, TRIGGER, EFFECT, READY, EFFECT_FIELDS, NULL, RULE, body, contract, require, finite, positive_int, digest,
)

HEALS = {P+'Abilities.Heal', P+'Abilities.RangedHeal'}
SELECTORS = {P+'AdvancedSelector', P+'AdvancedSelectorWithinHpRatio'}


def compile_healing_replacement(sid, rows, levels, char_ids, projectile_compiler):
    require(rows and len({r['node_id'] for r in rows}) == len(rows), 'incomplete-component', 'missing/duplicate healing components')
    unknown = sorted({r['type'] for r in rows} - (CONTROLLERS | HEALS | SELECTORS | {RANGE, TRIGGER, EFFECT, READY}))
    require(not unknown, 'extra-gameplay-components', ','.join(unknown))
    typed = {t: [r for r in rows if r['type'] == t] for t in {r['type'] for r in rows}}
    controllers = [r for r in rows if r['type'] in CONTROLLERS]
    heals = [r for r in rows if r['type'] in HEALS]
    require(len(controllers) == len(heals) == 1, 'mixed-action-graph', 'one replacement controller and one healing body')
    for row in rows:
        body(row)
    controller, heal = controllers[0], heals[0]
    c, a = body(controller), body(heal)
    require(controller['fields']['m_GameObject'] == heal['fields']['m_GameObject'], 'unresolved-reference', 'healing controller/body ownership')
    cf = dict(CONTROLLER_FIXED)
    for k in ('_trigger', '_cancelIfSearchTargetFailed'):
        cf.pop(k)
    contract(c, cf, {'_trigger', '_cancelIfSearchTargetFailed'}, 'healing replacement controller')
    require(c['_cancelIfSearchTargetFailed'] in (0, 1), 'controller-policy', 'cancel on failed target')
    af, av = dict(ATTACK_FIXED), set(ATTACK_VARIABLE)
    for k in ('_elementDamageType', '_epDamageRatio', '_useDynamicAttackType', '_deliveryParaWhenReplaceActionNode', '_extraDamageType', '_atkScale', '_attackType', '_selectTargetSource'):
        af.pop(k)
    av -= {'_atkScaleKey', '_damageType'}
    av.add('_selectTargetSource')
    af.update({k: 0 for k in ('_isCont', '_isHpRatio', '_hasNoActionNode', '_ignoreHealFree', '_applyEPHeal', '_applyHealScaleToEPHealScale')})
    ranged = heal['type'].endswith('.RangedHeal')
    if ranged:
        af.update(_useCachedAtkOnly=0, _mountPointType=2)
        av.add('_projectileKey')
    contract(a, af, av, heal['type'])
    require(a['_selectTargetSource'] in (1, 2) and a['_selectTargetTiming'] == 0 and a['_alwaysIncludeTarget'] == 1
            and a['_allowNoTarget'] == 0 and a['_interruptAbilityOnDetach'] in (0, 1) and a['_faceToTarget'] in (0, 1)
            and finite(a['_maxAnimScale']) and (a['_maxAnimScale'] > 0 or a['_maxAnimScale'] == -1)
            and finite(a['_preDelay']) and a['_preDelay'] >= 0
            and all(isinstance(a[k], str) for k in ('_animKey','_endAnimKey','_downAnimKey','_downEndAnimKey','_upAnimKey','_upEndAnimKey')),
            'healing-action-control', 'input/animation policy')
    selectors = [r for r in rows if r['type'] in SELECTORS]
    require(len(selectors) == 1, 'unresolved-selector', 'one complete ally selector')
    selector, = selectors
    s = body(selector)
    sf, sv = dict(SELECTOR_FIXED, _targetSide=1), set(SELECTOR_VARIABLE)
    hp = selector['type'].endswith('.AdvancedSelectorWithinHpRatio')
    if hp:
        sf.update(_filerMaxHp=1, _filterMinHp=0, _minHpRatio=0)
        sv |= {'_maxHpExcludeEqual', '_maxHpRatio'}
    contract(s, sf, sv, selector['type'])
    require(s['_targetMotion'] == 3 and s['_postFilter'] == 3 and s['_limitTargetNum'] == 1
            and positive_int(s['_maxNum']) and isinstance(s['_maxTargetKey'], str) and finite(s['_abnormalFlag']),
            'healing-selector-policy', 'ordinary wounded-ally priority and finite target budget')
    if hp:
        require(s['_maxHpExcludeEqual'] in (0, 1) and finite(s['_maxHpRatio']) and 0 < s['_maxHpRatio'] < 1,
                'healing-selector-policy', 'HP ratio threshold')
    ranges, triggers = typed.get(RANGE, []), typed.get(TRIGGER, [])
    require(len(ranges) == 1 and ranges[0]['fields']['m_GameObject'] == selector['fields']['m_GameObject'], 'unresolved-range', 'healing selector auto range')
    contract(body(ranges[0]), {'_extendable': 0}, label=RANGE)
    require(len(triggers) <= 1, 'mixed-action-graph', 'multiple healing triggers')
    for t in triggers:
        require(t['fields']['m_GameObject'] == selector['fields']['m_GameObject'], 'unresolved-reference', 'healing trigger owner')
        contract(body(t), {'_keepTarget': 0, '_minTargetNum': 1, '_overrideSearchTargetTick': -1}, label=TRIGGER)
    expected_trigger = {'m_FileID': 0, 'm_PathID': triggers[0]['node_id']} if triggers else NULL
    require(c['_trigger'] == expected_trigger, 'unresolved-reference', 'healing controller trigger')
    if a['_selectTargetSource'] == 2:
        require(a['_selector'] == NULL and bool(triggers), 'unresolved-selector', 'FROM_INPUT heal must use its complete trigger selector')
    else:
        require(a['_selector'] == {'m_FileID': 0, 'm_PathID': selector['node_id']}, 'unresolved-selector', 'healing body selector reference')
    for t in typed.get(EFFECT, []) + typed.get(READY, []):
        require(t['fields']['m_GameObject'] == heal['fields']['m_GameObject'], 'unresolved-reference', 'orphan healing visual')
        contract(body(t), {}, EFFECT_FIELDS if t['type'] == EFFECT else {'_effects', '_stopBeforeCast'}, t['type'])
    require(levels and char_ids, 'missing-level-or-identity', sid)
    keys = {v['key'] for v in levels[0]['blackboard']}
    target_key = s['_maxTargetKey'] if s['_maxTargetKey'] in keys else None
    consumed = {'heal_scale'} | ({target_key} if target_key else set())
    extra = keys - consumed
    charge_key = next(iter(extra)) if len(extra) == 1 and extra <= {'ct', 'cnt'} else None
    if charge_key:
        consumed.add(charge_key)
    require(keys == consumed, 'unconsumed-blackboard', ','.join(sorted(keys ^ consumed)))
    for i, lv in enumerate(levels, 1):
        b, sp = {x['key']: x['value'] for x in lv['blackboard']}, lv['spData']
        require(set(b) == keys and len(b) == len(lv['blackboard']) and all(finite(v) for v in b.values()), 'blackboard-shape', str(i))
        require(lv['prefabId'] == sid and lv['skillType'] == 'AUTO' and lv['duration'] in (0, -1)
                and sp['spType'] in ('INCREASE_WHEN_ATTACK', 'INCREASE_WITH_TIME') and finite(sp['spCost']) and sp['spCost'] > 0
                and positive_int(sp['maxChargeTime']) and sp['increment'] == 1, 'unsupported-controller-level', str(i))
        require(b['heal_scale'] > 0 and (not target_key or positive_int(b[target_key]))
                and (not charge_key or b[charge_key] == sp['maxChargeTime']), 'invalid-blackboard-values', str(i))
    projectile = projectile_compiler.compile(a['_projectileKey'], healing=True) if ranged else None
    return dict(kind='next-heal', rule=RULE, charIds=sorted(char_ids), blackboardKeys=sorted(keys), levelCount=len(levels),
                scaleKey='heal_scale', hits=1, targets='blackboard' if target_key else 'fixed', targetKey=target_key,
                targetCount=s['_maxNum'], chargeKey=charge_key, groundOnly=None, damageType=None,
                delivery='projectile' if ranged else 'direct', projectile=projectile, waitForProjectile=False, hitBuffs=[],
                hpThreshold=s['_maxHpRatio'] if hp else None, hpThresholdExcludeEqual=bool(s.get('_maxHpExcludeEqual')),
                triggered=bool(triggers), source=dict(graphSha256=digest(rows), componentIds=[r['node_id'] for r in rows],
                    attackNode=heal['node_id'], preDelay=a['_preDelay'], targetTiming=a['_selectTargetTiming'], projectile=a.get('_projectileKey'),
                    controllerType=controller['type'], selectorType=selector['type'], sourceLevelsSha256=digest(levels),
                    boundary='Heal-to-node native bridge protected; heal_scale uses the existing shared healing model. Native attack-event timing and 3D paracurve height remain outside this source-body contract.'))
