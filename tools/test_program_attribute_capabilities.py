"""Consumer capabilities expand shared source programs without silent omissions."""
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'src'))
from arkresearch.client_logic import ClientLogicStore
from arkresearch.client_program import ProgramCompiler,ATTRIBUTES


class AttributeCapabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=ClientLogicStore('jp-36.7.22-client-logic')

    def test_recovery_requires_explicit_consumer_support(self):
        old,blocked=ProgramCompiler(self.source).compile_prefab('skchr_yak_1')
        self.assertIsNone(old)
        self.assertTrue(any(b['reason']=='unsupported_modifier' for b in blocked['blockers']))
        program,blocked=ProgramCompiler(self.source,supported_attributes=ATTRIBUTES).compile_prefab('skchr_yak_1')
        self.assertIsNone(blocked)
        mods=program['buffs'][0]['modifiers']
        self.assertEqual({m['attribute'] for m in mods},{'max_hp','hp_recovery_per_sec'})
        self.assertIn(dict(attribute='hp_recovery_per_sec',formula='addition',value={'key':'hp_recovery_per_sec'}),mods)

    def test_block_count_does_not_erase_other_mode_mechanics(self):
        program,blocked=ProgramCompiler(self.source,supported_attributes=ATTRIBUTES).compile_prefab('skchr_spikes_1')
        self.assertIsNone(program)
        self.assertTrue(any(b['reason']=='unproven_mode_graph' for b in blocked['blockers']))
        self.assertFalse(any(b['reason']=='unsupported_modifier' for b in blocked['blockers']))

    def test_unknown_attribute_capability_rejected(self):
        with self.assertRaisesRegex(ValueError,'Unknown consumer'):
            ProgramCompiler(self.source,supported_attributes={999:'guessed'})


if __name__=='__main__':unittest.main()
