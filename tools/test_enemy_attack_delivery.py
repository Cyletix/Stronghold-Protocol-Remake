"""Flat output delivery must not be inferred from range or a convenient root."""
import unittest

from enemy_attack_delivery import compile_delivery, DIRECT, PROJECTILE, summarize


class AttackDelivery(unittest.TestCase):
    def compile(self, roots, profile=None, agree=True):
        scripts = {id(fields): index for index, (_, fields) in enumerate(roots)}
        types = {str(index): name for index, (name, _) in enumerate(roots)}
        return compile_delivery(profile or dict(timing=dict(duration=1, hit=.25)),
            [fields for _, fields in roots], scripts, types, agree)

    def test_all_exact_direct_types_ignore_ranged_target_selection(self):
        for typename in DIRECT:
            self.assertEqual(self.compile([(typename, dict(_attackType=1, _rangeRadius=9))]),
                             ('direct', None))

    def test_projectiles_require_matching_supported_contracts_for_every_root(self):
        for typename in PROJECTILE:
            profile = dict(timing=dict(duration=1), projectile=dict(key='bolt', speed=4))
            roots = [(typename, dict(_projectileKey='bolt'))]
            self.assertEqual(self.compile(roots, profile), ('projectile', None))
            for key in ('', 'other'):
                self.assertEqual(self.compile([(typename, dict(_projectileKey=key))], profile)[1],
                                 'missing-supported-projectile-contract')
            self.assertIsNone(self.compile(roots)[0])

    def test_no_first_root_or_type_name_guess(self):
        direct, projectile = sorted(DIRECT)[0], sorted(PROJECTILE)[0]
        profile = dict(timing=dict(duration=1), projectile=dict(key='bolt', speed=4))
        self.assertEqual(self.compile([(direct, {}), (projectile, dict(_projectileKey='bolt'))], profile),
                         (None, 'channel-dependent-delivery'))
        self.assertEqual(self.compile([(direct, dict(_projectileKey='bolt'))], profile)[1],
                         'direct-type-with-projectile-key')
        self.assertEqual(self.compile([(direct + 'Special', {})])[1], 'unsupported-or-unresolved-root-type')
        self.assertEqual(self.compile([])[1], 'missing-complete-root-actions')
        self.assertEqual(self.compile([(direct, {})], agree=False)[1], 'mode-dependent-action-contract')
        self.assertEqual(compile_delivery(dict(timing={}), [{}], {}, {}, True)[1], 'missing-flat-timing')
        self.assertEqual(compile_delivery(dict(timing=dict(duration=1)), [{}], {}, {}, True)[1],
                         'unsupported-or-unresolved-root-type')

    def test_separate_executors_cannot_be_flattened(self):
        for key, value in [('channels', {'combat': {}}), ('modes', {'0': {}}),
                           ('preAttack', {'rule': 'first-attack'}), ('projectile', {'kind': 'chain'})]:
            self.assertEqual(self.compile([(sorted(DIRECT)[0], {})], dict(timing={}, **{key: value}))[1],
                             'existing-separate-executor')

    def test_summary_is_an_exclusive_scope_partition_not_completed_enemy_count(self):
        result = summarize({'a': {'delivery': 'direct'}, 'b': {'delivery': 'direct'},
                            'c': {'reason': 'source-no-basic-attack'}})
        self.assertEqual(result['counts'], {'direct': 2, 'source-no-basic-attack': 1})
        self.assertEqual(sum(result['counts'].values()), len(result['selections']))


if __name__ == '__main__':
    unittest.main()
