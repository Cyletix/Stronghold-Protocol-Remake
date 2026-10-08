"""Shared root-selection and projectile boundaries, independent of enemy IDs."""
import unittest

from build_external_combat_data import cached_root_actions, projectile_contract


class ExternalContracts(unittest.TestCase):
    def test_root_references_replace_names_but_require_complete_modes(self):
        root = dict(_animKey='Combat_B', _atkScale=1, _attackType=1)
        components = [dict(pathID=11, fields=root),
                      dict(pathID=12, fields=dict(root, _animKey='Attack_Helper'))]
        evidence = dict(modeCount=2, rootModes=[dict(actionPathIDs=[11]), dict(actionPathIDs=[11])])
        self.assertEqual(cached_root_actions(dict(evidence=evidence), components), [root])
        evidence['rootModes'][1]['actionPathIDs'] = []
        self.assertIsNone(cached_root_actions(dict(evidence=evidence), components))
        evidence['rootModes'][1]['actionPathIDs'] = [11]
        self.assertIsNone(cached_root_actions(dict(evidence=evidence), components + [components[0]]))

    def test_melee_root_does_not_conflict_with_one_emitted_projectile(self):
        projectile, reason = projectile_contract([{}, dict(_projectileKey='bolt')], dict(bolt=10))
        self.assertEqual(projectile, dict(key='bolt', speed=10))
        self.assertIsNone(reason)
        self.assertIsNone(projectile_contract([{}, {}], {})[0])

    def test_distinct_and_special_projectiles_remain_unresolved(self):
        self.assertIsNone(projectile_contract([dict(_projectileKey='a'), dict(_projectileKey='b')], dict(a=10, b=10))[0])
        for feature in ('_duoProjectileKey', '_waitForProjectileInvalid', '_isSectorProjectileMovement'):
            with self.subTest(feature=feature):
                self.assertIsNone(projectile_contract([{'_projectileKey': 'a', feature: 1}], dict(a=10))[0])


if __name__ == '__main__':
    unittest.main()
