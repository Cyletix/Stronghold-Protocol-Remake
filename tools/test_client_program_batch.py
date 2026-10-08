"""Portable contracts and source-backed opt-in capabilities; no DPS execution."""
import copy
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'tools'),str(ROOT.parent/'src')]
from arkresearch.client_logic import ClientLogicStore
from arkresearch.client_program import ProgramCompiler,validate_program,required_blackboard_keys,ATTRIBUTES,SELF_FLAGS
from arkresearch.combat_program import bind_program


class Programs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.evidence=ClientLogicStore('jp-36.7.22-client-logic')
        cls.default=ProgramCompiler(cls.evidence)
        cls.web=ProgramCompiler(cls.evidence,supported_attributes=ATTRIBUTES,supported_lifetimes=('timed','until_detach'),supported_flags=SELF_FLAGS)

    def test_explicit_flag_capability_and_source(self):
        before,rejection=self.default.compile_prefab('skchr_estell_2')
        self.assertIsNone(before)
        self.assertTrue(any(b['path'].endswith('abnormalFlags') for b in rejection['blockers']))
        program,rejection=self.web.compile_prefab('skchr_estell_2')
        self.assertIsNone(rejection)
        self.assertEqual(program['buffs'][0]['flags'],['no_direct_heal'])
        with self.assertRaisesRegex(ValueError,'生命周期或旗标'):bind_program(program,{key:1 for key in required_blackboard_keys(program)})

    def test_attribute_consumers_and_unknowns(self):
        program,_=self.default.compile_prefab('skcom_atk_up')
        self.assertGreater(bind_program(program,{key:1 for key in required_blackboard_keys(program)}),0)
        ratio=copy.deepcopy(program);ratio['buffs'][0]['modifiers'][0]['attribute']=ATTRIBUTES[19]
        validate_program(ratio)
        with self.assertRaisesRegex(ValueError,'未支持的属性'):bind_program(ratio,{key:1 for key in required_blackboard_keys(ratio)})
        ratio['buffs'][0]['modifiers'][0]['attribute']='unknown'
        with self.assertRaisesRegex(ValueError,'Unknown attribute'):validate_program(ratio)

    def test_infinite_lifecycle_is_opt_in_and_unknown_controls_reject(self):
        base=self.evidence.prefab('skcom_atk_up',components=True)
        original=self.evidence.prefab
        def fixture(_id,*,components=False):return copy.deepcopy(base)
        self.evidence.prefab=fixture
        try:
            active=next(node['fields'] for node in base['components'] if '_buffs' in node['fields'])
            active['_buffs'][0]['lifeTimeType']=2
            program,rejection=self.web.compile_prefab('fixture')
            self.assertIsNone(rejection);self.assertEqual(program['buffs'][0]['lifetime'],{'kind':'until_detach'})
            self.assertNotIn('duration',required_blackboard_keys(program))
            with self.assertRaisesRegex(ValueError,'生命周期或旗标'):bind_program(program,{key:1 for key in required_blackboard_keys(program)})
            self.assertIsNone(self.default.compile_prefab('fixture')[0])
            active['_buffs'][0]['attributes']['abnormalFlags']=[7,99]
            self.assertIsNone(self.web.compile_prefab('fixture')[0])
            active['_buffs'][0]['attributes']['abnormalFlags']=[]
            active['_buffs'][0]['lifeTime']=.5
            self.assertIsNone(self.web.compile_prefab('fixture')[0])
        finally:self.evidence.prefab=original


if __name__=='__main__':unittest.main()
