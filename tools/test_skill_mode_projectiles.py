"""Ordinary projectile presentation variants cannot widen hit semantics."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from enemy_hit_sequences import load_script_types
from next_attack_compiler import ProjectileCompiler, Rejected

ROOT=Path(__file__).resolve().parents[1]


class ModeProjectilePresentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle=json.loads((ROOT/'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json').read_text(encoding='utf-8'))
        cls.types=load_script_types()

    def compiler(self,change=None):
        source=deepcopy(self.bundle)
        root=next(r['asset']['m_PathID'] for p,r in source['assetContainer'] if p.endswith('/projectile_angel.prefab'))
        nodes=source['nodes']
        movement=next(nodes[str(r['component']['m_PathID'])]['fields']
            for r in nodes[root]['fields']['m_Component']
            if '_moveType' in nodes[str(r['component']['m_PathID'])]['fields'])
        if change:change(movement)
        return ProjectileCompiler(source,self.types)

    def test_zero_rotation_and_static_offsets_keep_single_trace_hit(self):
        result=self.compiler().compile('projectile_angel')
        self.assertEqual(result['speed'],30)
        self.assertEqual(result['life'],5)
        self.assertEqual(result['rule'],'complete-simple-trace-projectile-v1')

    def test_arbitrary_movement_rotation_value_rejected(self):
        with self.assertRaises(Rejected):self.compiler(lambda m:m.update(_rotateToTarget=2)).compile('projectile_angel')

    def test_negative_or_unknown_offset_coordinates_rejected(self):
        for offset in ({'x':-1,'y':0,'z':0},{'x':0,'y':0,'z':0,'w':0},{'x':float('nan'),'y':0,'z':0}):
            with self.subTest(offset=offset),self.assertRaises(Rejected):
                self.compiler(lambda m:m.update(_randomOffset=offset)).compile('projectile_angel')

    def test_gameplay_return_movement_not_mistaken_for_presentation(self):
        with self.assertRaises(Rejected):self.compiler(lambda m:m.update(_comeBack=1)).compile('projectile_angel')


if __name__=='__main__':unittest.main()
