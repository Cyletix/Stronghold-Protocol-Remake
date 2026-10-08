import json
from pathlib import Path
import unittest

from enemy_hit_sequences import load_script_types
from next_attack_compiler import ProjectileCompiler, Rejected
from operator_chain_projectiles import compile_chain

ROOT = Path(__file__).resolve().parents[1]


class ChainContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = json.loads((ROOT/'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json').read_text(encoding='utf-8'))
        cls.types = load_script_types()

    def compile(self, key='projectile_leizi_s2'):
        return compile_chain(ProjectileCompiler(self.bundle, self.types), key)

    def rejects(self, node_id, field, value):
        fields = self.bundle['nodes'][str(node_id)]['fields']
        present, old = field in fields, fields.get(field)
        try:
            fields[field] = value
            with self.assertRaises(Rejected):
                self.compile()
        finally:
            if present:
                fields[field] = old
            else:
                fields.pop(field)

    def test_two_complete_source_families(self):
        fixed, inherited = self.compile(), self.compile('projectile_chr_pasngr_s2')
        self.assertEqual((fixed['speed'], fixed['life']), (15, 10))
        self.assertEqual(fixed['chain']['decay'], 1)
        self.assertFalse(fixed['chain']['useChainPrefix'])
        self.assertTrue(inherited['chain']['useChainPrefix'])
        self.assertAlmostEqual(inherited['chain']['decay'], .85)
        self.assertAlmostEqual(inherited['chain']['radius'], 1.7)

    def test_dynamic_hit_sibling_is_not_discarded(self):
        pid = next(pid for pid in self.compile()['source']['componentIds']
                   if self.types[str(self.bundle['nodes'][pid]['fields']['m_Script']['m_PathID'])].endswith('ChainLightningHitBehaviour'))
        self.rejects(pid, '_hitPasserby', 1)
        self.rejects(pid, '_interval', .1)
        self.rejects(pid, '_newUnknownControl', 0)

    def test_unresolved_selector_is_rejected(self):
        pid = next(pid for pid in self.compile()['source']['componentIds']
                   if self.types[str(self.bundle['nodes'][pid]['fields']['m_Script']['m_PathID'])].endswith('ChainLightningHitBehaviour'))
        self.rejects(pid, '_selector', {'m_FileID': 0, 'm_PathID': '0'})
        self.rejects(pid, '_useChainPrefix', 2)

    def test_geometry_contract_does_not_guess_offsets(self):
        pid = self.compile()['source']['colliderId']
        self.rejects(pid, 'm_Offset', {'x': .5, 'y': 0})
        self.rejects(pid, 'm_Radius', -1)


if __name__ == '__main__':
    unittest.main()
