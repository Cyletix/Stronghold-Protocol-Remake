"""Bounded source-contract tests; do not certify native lifecycle equivalence."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from enemy_chain_projectiles import CACHE, CHAIN, MOVEMENT, SELECTOR, compile_chain_projectile, load_chain_candidates


class ChainProjectileContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(CACHE.read_text(encoding='utf-8'))
        cls.pure = next(v for v in cls.data['enemies'].values()
                        if all(not a['fields'].get('_activeBuffs') for a in v['actions']))

    def compile(self, record):
        return compile_chain_projectile(record, [a['fields'] for a in record['actions']],
                                        {record['projectile']['key']: 15})

    def test_public_family_preserves_full_chain_parameters_and_cold_siblings(self):
        accepted = [r for r in self.data['enemies'].values() if self.compile(r)['accepted']]
        self.assertEqual(len(accepted), 3)
        self.assertEqual(sum(r['inEncounterPool'] for r in accepted), 2)
        result = self.compile(self.pure)['projectile']
        self.assertEqual(result['chain'], dict(maxTargets=4, radius=1.6, decay=.85, interval=0, allowRepeat=False))
        self.assertEqual(result['element'], dict(type='apoptosis', ratio=.3, sourceEnum=4))
        self.assertEqual(result['lifeTime'], 10)
        self.assertEqual(result['damageType'], 'arts')
        self.assertTrue(result['lifecycle']['waitForProjectileInvalid'])
        for record in self.data['enemies'].values():
            if any(a['fields'].get('_activeBuffs') for a in record['actions']):
                self.assertIn('chain-hit-buffs-and-skill-overrides-not-supported', self.compile(record)['reasons'])

    def test_scope_and_level_changes_do_not_fall_back_to_default(self):
        record = copy.deepcopy(self.pure)
        board = record['blackboards'][0]['blackboard']
        value = next(x for x in board if x['key'].endswith('attack@max_target'))
        board.append(dict(value))
        self.assertFalse(self.compile(record)['accepted'])
        record = copy.deepcopy(self.pure)
        record['blackboards'].append(copy.deepcopy(record['blackboards'][0]))
        record['blackboards'][1]['blackboard'][1]['value'] = 7
        self.assertFalse(self.compile(record)['accepted'])
        record = copy.deepcopy(self.pure)
        for item in record['blackboards'][0]['blackboard']:
            if item['key'].endswith('attack@projectile_range'):
                item['key'] = 'other.attack@projectile_range'
        self.assertFalse(self.compile(record)['accepted'])

    def test_unknown_component_and_dynamic_hit_contract_are_rejected(self):
        record = copy.deepcopy(self.pure)
        record['projectile']['components']['unknown'] = dict(script=dict(type='NewHitSideEffect', status='resolved'), fields={})
        self.assertFalse(self.compile(record)['accepted'])
        for field, value in [('_interval', .5), ('_hitPasserby', 1), ('_freeJumpValidator', {'m_FileID': 1, 'm_PathID': '99'})]:
            record = copy.deepcopy(self.pure)
            hit = next(c['fields'] for c in record['projectile']['components'].values() if c['script']['type'] == CHAIN)
            hit[field] = value
            self.assertFalse(self.compile(record)['accepted'], field)
        attacks = [dict(a['fields'], _projectileDestination=1) for a in self.pure['actions']]
        self.assertFalse(compile_chain_projectile(self.pure, attacks, {self.pure['projectile']['key']: 15})['accepted'])
        for typename, field, value in [
                (MOVEMENT, '_moveType', 2), (MOVEMENT, '_comeBack', 1),
                (MOVEMENT, '_flyToTargetLocationOnly', 1), (MOVEMENT, '_delayToStart', .2),
                (MOVEMENT, '_randomOffset', {'x': 1, 'y': 0, 'z': 0}),
                (MOVEMENT, '_newUnknownFlag', 0), (SELECTOR, '_targetSide', 1),
                (SELECTOR, '_targetMotion', 1), (SELECTOR, '_targetCategory', 2),
                (SELECTOR, '_ignoreTargetFree', 1), (SELECTOR, '_useChainPrefix', 1),
                (CHAIN, '_selector', {'m_FileID': 1, 'm_PathID': '-6040011157509631226'}),
                (CHAIN, '_rangeToLoad', {'m_FileID': 0, 'm_PathID': 'wrong-reference'})]:
            with self.subTest(type=typename, field=field):
                record = copy.deepcopy(self.pure)
                component = next(c for c in record['projectile']['components'].values() if c['script']['type'] == typename)
                component['fields'][field] = value
                self.assertFalse(self.compile(record)['accepted'])
        # This mutates the candidate AND supplied action, modeling a fresh
        # source freeze. The semantic whitelist must reject it independently.
        record = copy.deepcopy(self.pure)
        for action in record['actions']:
            action['fields']['_newActionSideEffect'] = 0
        self.assertFalse(self.compile(record)['accepted'])

    def test_frozen_source_changes_raise_instead_of_using_stale_mapping(self):
        hashes = {'data_enemy_prefab_catalog_current.json': self.data['inputs']['prefabSha256']}
        records, value = load_chain_candidates(hashes, self.data['inputs']['databaseSha256'])
        self.assertEqual(set(records), set(self.data['memberIDs']))
        self.assertEqual(value, self.data['sourceFingerprint'])
        with self.assertRaises(ValueError):
            load_chain_candidates(hashes, 'changed-source')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'changed.json'
            changed = copy.deepcopy(self.data)
            changed['memberIDs'].pop()
            path.write_text(json.dumps(changed), encoding='utf-8')
            with self.assertRaises(ValueError):
                load_chain_candidates(hashes, self.data['inputs']['databaseSha256'], path)
            self.assertEqual(load_chain_candidates(hashes, 'any', Path(directory)/'absent.json'), ({}, None))


if __name__ == '__main__':
    unittest.main()
