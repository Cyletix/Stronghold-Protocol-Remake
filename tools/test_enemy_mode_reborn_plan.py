"""Small contract boundaries; synthetic data cannot prove client behavior."""
from copy import deepcopy
import json
import unittest

from enemy_mode_reborn_plan import analyze_reborn, OPERATORS


def fixture():
    key = 'CAB:test:0'
    fields = dict(_maxRespawnCnt=1, _modeIndex=1, _keepAlive=0,
        _useAbilityToHandle=1, _abilityName='Reborn', _hpRechargeRatio=.5,
        _buffs=[], _buffsRetainedWhenReborn=[], _effects=[],
        _extraRebornDataPresets=[], _rebornAfterWave=0, _validWhenContainsBuff='')
    record = dict(enemyId='synthetic', sourceEnemyId='source', components={key: dict(
        pathID='9007199254740993', cabin='CAB', scriptType='Torappu.Battle.RebornTalent', fields=fields)},
        rebornConfigurations=[dict(componentKey=key, fields=fields)], modes=[
            dict(status='resolved', modeIndex=1, targetComponentKey='mode', entityComponentKey='entity')])
    owner = dict(status='matched-entity-and-mode-anchors', components={key: dict(
        ownershipOverlayEligible=True, status='shared-fields-match',
        modeIndicesFromAncestorGameObjects=[], structuralLocation='asset-root-outside-mode-subtrees')},
        gameObjects={})
    return record, owner, fields


class RebornPlan(unittest.TestCase):
    def test_name_candidates_are_exact_ambiguous_and_never_executable(self):
        record, owner, fields = fixture()
        for key, name in [('one', 'Reborn'), ('two', 'Reborn'), ('lower', 'reborn'), ('prefix', 'Reborn2')]:
            owner['gameObjects'][key] = dict(sourceFields=dict(m_Name=name), name='Reborn',
                monoBehaviourCompanions=[dict(pathID='1', scriptResolution=dict(type='SomeAbility'))])
        before = deepcopy((record, owner))
        plan = analyze_reborn(record, owner)
        comp = plan['components'][0]
        self.assertEqual([c['gameObjectPathID'] for c in comp['handlerCandidates']], ['one', 'two'])
        self.assertTrue(all(c['selectedComponentKey'] is None for c in comp['handlerCandidates']))
        self.assertEqual(comp['sourceRef']['pathID'], '9007199254740993')
        self.assertFalse(plan['implementationReady'])
        self.assertIn('reborn-handler-lookup-and-scope', plan['missingLinks'])
        self.assertEqual((record, owner), before)
        self.assertEqual(json.dumps(plan, sort_keys=True), json.dumps(analyze_reborn(record, owner), sort_keys=True))

    def test_sentinels_presets_and_blackboard_keys_do_not_become_behavior(self):
        record, owner, fields = fixture()
        fields.update(_maxRespawnCnt=-1, _modeIndex=-1, _keepAlive=1,
            _validWhenContainsBuff='can_reborn', _rebornAfterWave=1,
            _extraRebornDataPresets=[dict(modeIndex=1, buffs=[dict(templateKey='switch_mode',
                durationKey='wait', blackboard=[dict(key='mode', value=1)],
                attributes=dict(attributeModifiers=[dict(loadFromBlackboard=1, attributeType=7)]))])])
        plan = analyze_reborn(record, owner)
        self.assertEqual(plan['primarySubclass'], 'reborn-extra-presets')
        self.assertIn('reborn-count-sentinel', plan['subclasses'])
        self.assertNotIn('reborn-nonpositive-count-semantics', plan['missingLinks'])
        self.assertNotIn('reborn-preset-selection-and-order', plan['missingLinks'])
        self.assertIn('reborn-effective-max-blackboard-override', plan['missingLinks'])
        self.assertIn('reborn-check-budget', plan['knownNativeRules'])
        self.assertIn('reborn-check-increment-and-preset', plan['knownNativeRules'])
        self.assertEqual(plan['components'][0]['modeTargets'][0]['status'], 'negative-index-semantics-unresolved')
        self.assertEqual({b['key'] for b in plan['blackboardRequests']}, {'mode', 'wait', None})
        self.assertIn('reborn-preset-selection', plan['sharedOperators'])
        self.assertTrue(set(plan['sharedOperators']) <= set(OPERATORS))
        self.assertFalse(plan['implementationReady'])

    def test_missing_ownership_and_duplicate_modes_are_not_resolved(self):
        record, owner, fields = fixture()
        fields['_useAbilityToHandle'] = 0
        record['modes'].append(deepcopy(record['modes'][0]))
        record['modes'][-1]['entityComponentKey'] = 'second-entity'
        plan = analyze_reborn(record, {})
        self.assertIn('reborn-source-ownership-match', plan['missingLinks'])
        self.assertEqual(plan['components'][0]['modeTargets'][0]['status'], 'ambiguous-mode-index')
        self.assertEqual(plan['components'][0]['handlerResolution'], 'not-requested')
        self.assertFalse(analyze_reborn({}, {})['applicable'])


if __name__ == '__main__':
    unittest.main()
