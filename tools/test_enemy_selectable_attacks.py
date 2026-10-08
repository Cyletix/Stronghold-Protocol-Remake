import copy
import unittest

from enemy_selectable_attacks import (load_selectable_candidates, compile_selectable_attack,
    bind_selectable_timing, GROUP, MULTI, HIT)


class SelectableAttackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = load_selectable_candidates()['enemies']
        cls.good = cls.sources['enemy_9021_acduml_2']

    def mutated(self):
        return copy.deepcopy(self.good)

    def test_complete_variant_and_explicit_base_rejection(self):
        accepted = compile_selectable_attack(self.good)
        self.assertTrue(accepted['accepted'], accepted)
        ir = accepted['selectableAttack']
        self.assertEqual(ir['branches'][0]['selector']['enemyMode'], 1)
        self.assertEqual(ir['branches'][1]['selector']['side'], 'enemy')
        self.assertEqual(ir['cooldown']['interval'], 3)
        self.assertAlmostEqual(ir['projectile']['radius'], 1.8, places=6)
        self.assertIsNone(ir['projectile']['maxHitTargets'])
        rejected = compile_selectable_attack(self.sources['enemy_9021_acduml'])
        self.assertEqual(rejected['rejections'], ['extra-or-missing-multi-ranged-gameplay-sibling'])

    def test_enemy_identity_is_not_executor_whitelist(self):
        candidate = self.mutated()
        candidate['enemyId'] = 'synthetic-same-complete-graph'
        self.assertTrue(compile_selectable_attack(candidate)['accepted'])

    def test_unknown_action_field_rejects_even_zero(self):
        candidate = self.mutated()
        action = next(c for c in candidate['components'].values() if c['scriptType'] == MULTI)
        action['fields']['_unknownMechanic'] = 0
        self.assertFalse(compile_selectable_attack(candidate)['accepted'])

    def test_branch_timing_difference_rejects_common_action(self):
        c = self.mutated()
        root = c['components'][c['ownership']['rootComponentId']]['fields']
        pid = str(root['_abilityConfigs'][1]['_ability']['m_PathID'])
        c['components'][pid]['fields']['_triggerDelta'] = .5
        c['ownership']['nodes'][pid]['fields']['_triggerDelta'] = .5
        self.assertEqual(compile_selectable_attack(c)['rejections'], ['branch-action-timing-contracts-differ'])

    def test_extra_or_unresolved_dependency_rejects(self):
        for kind in ('missing', 'external', 'extra'):
            with self.subTest(kind=kind):
                c = self.mutated()
                root = c['components'][c['ownership']['rootComponentId']]['fields']
                if kind == 'missing':
                    root['_abilityConfigs'][0]['_trigger']['m_PathID'] = 12345
                elif kind == 'external':
                    root['_abilityConfigs'][0]['_ability']['m_FileID'] = 1
                else:
                    c['components']['unknown'] = {'scriptType': GROUP, 'fields': {}}
                self.assertFalse(compile_selectable_attack(c)['accepted'])

    def test_projectile_buffs_or_filter_drift_reject(self):
        for change in ('buff', 'side', 'radius', 'unknownCollider'):
            with self.subTest(change=change):
                c = self.mutated()
                nodes = c['projectileOwnership']['nodes']
                if change in ('radius', 'unknownCollider'):
                    n = next(n for n in nodes.values() if n['unityType'] == 'CircleCollider2D')
                    if change == 'radius': n['fields']['m_Radius'] = -1
                    else: n['fields']['unknown'] = 0
                else:
                    n = next(n for n in nodes.values() if n.get('resolvedScript', {}).get('type') == HIT)
                    if change == 'side': n['fields']['_targetOptions']['targetSide'] = 7
                    else: n['fields']['_unknownBuff'] = {}
                self.assertFalse(compile_selectable_attack(c)['accepted'])

    def test_trigger_owner_mismatch_rejects(self):
        c = self.mutated()
        root = c['components'][c['ownership']['rootComponentId']]['fields']
        tid = str(root['_abilityConfigs'][0]['_trigger']['m_PathID'])
        c['ownership']['nodes'][tid]['fields']['m_GameObject']['m_PathID'] = c['ownership']['rootGameObjectId']
        self.assertFalse(compile_selectable_attack(c)['accepted'])

    def test_attack_blackboard_override_or_level_change_rejects(self):
        for change in ('scope', 'level'):
            with self.subTest(change=change):
                c = self.mutated()
                if change == 'scope':
                    c['databaseLevels'][0]['enemyData']['talentBlackboard'].append({'key': '0.attack@max_target', 'value': 5})
                else:
                    level = copy.deepcopy(c['databaseLevels'][0]); level['level'] = 2
                    level['enemyData']['attributes']['baseAttackTime']['m_value'] = 4
                    c['databaseLevels'].append(level)
                self.assertFalse(compile_selectable_attack(c)['accepted'])

    def test_first_animation_event_plus_fixed_cast_clock(self):
        result = compile_selectable_attack(self.good)
        bound = bind_selectable_timing(result, {'animation': 'Attack', 'duration': 3.3333,
            'hit': .8333, 'observedHits': [.8333, 1.6, 1.8333]})
        self.assertTrue(bound['accepted'])
        action = bound['selectableAttack']['action']
        self.assertEqual(action['timing']['hits'], [.8333])
        self.assertEqual(action['repeat'], {'count': 3, 'interval': .25, 'clock': 'cast-clock'})
        self.assertEqual(action['timing']['observedHits'], [.8333, 1.6, 1.8333])
        self.assertEqual((action['minAnimScale'], action['maxAnimScale']), (.1, 1))
        self.assertEqual(action['projectile']['tracePolicy'], 'force-valid-trace-once-at-end')
        self.assertEqual(action['projectile']['castEndPolicy'], 'emitted-projectiles-independent')
        self.assertFalse(bind_selectable_timing(result, None)['accepted'])
        self.assertFalse(bind_selectable_timing(result, {'duration': 1, 'observedHits': [2]})['accepted'])


if __name__ == '__main__':
    unittest.main()
