import json
import unittest
from copy import deepcopy
from enemy_bomb_parameters import CONTRACT,compile_parameters,load_parameters

class BombParameterTests(unittest.TestCase):
    def test_real_source_animation_box_and_multiplier_layer(self):
        enemy,p=load_parameters()
        self.assertEqual(enemy,'enemy_1040_bombd')
        self.assertEqual(p['animation']['duration'],1)
        self.assertAlmostEqual(p['animation']['hitTime'],8/30,places=6)
        self.assertEqual((p['area']['halfWidth'],p['area']['halfHeight']),(1.5,1.5))
        self.assertEqual(p['moveSpeed'],dict(key='move_speed',formula='MULTIPLIER',default=2))

    def test_unknown_siblings_and_attribute_formula_cannot_use_parameter_slice(self):
        source=json.loads(CONTRACT.read_text(encoding='utf8'))
        changed=deepcopy(source);changed['candidate']['abilityTypes'].append('Summon')
        with self.assertRaises(ValueError):compile_parameters(changed)
        changed=deepcopy(source)
        buff=next(p['fields'] for p in changed['candidate']['sameGameObjectComponents'].values()
            if p['scriptType'].endswith('.BuffAfterAffecting'))
        buff['_buffs'][0]['attributes']['attributeModifiers'][0]['formulaItem']=1
        with self.assertRaises(ValueError):compile_parameters(changed)

    def test_additional_output_events_are_not_silently_ignored(self):
        source=json.loads(CONTRACT.read_text(encoding='utf8'))
        source['animation']['animations']['Attack']['events'].append(dict(event='OnAttack',t=.5))
        with self.assertRaises(ValueError):compile_parameters(source)

    def test_changed_camouflage_and_invalid_cooldown_are_rejected(self):
        source=json.loads(CONTRACT.read_text(encoding='utf8'))
        changed=deepcopy(source)
        hit=next(n['fields'] for n in changed['projectile']['nodes'].values()
            if n.get('scriptType')=='Torappu.Battle.Projectiles.HitBehaviour')
        hit['_ignoreCamouflage']=0
        with self.assertRaises(ValueError):compile_parameters(changed)
        changed=deepcopy(source)
        changed['candidate']['databaseSkillBindings'][0]['initCooldown']=-1
        with self.assertRaises(ValueError):compile_parameters(changed)

if __name__=='__main__':unittest.main()
