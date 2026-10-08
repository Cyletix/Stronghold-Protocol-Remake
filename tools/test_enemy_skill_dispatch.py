"""Complete source groups must never become partial skill implementations."""
from copy import deepcopy
import unittest

from build_external_combat_data import ROOT, DEFAULT_SOURCE, projectile_contract, resolve_action_timing
from enemy_animation_overlay import load_supplement
from enemy_hit_sequences import load_script_types
from enemy_mode_profiles import compile_mode_profiles
from enemy_skill_dispatch import (PRIORITY, SP_CONTRACT, RANGED, compile_skill, read)


class SkillDispatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.priority = read(PRIORITY)
        cls.eid = 'enemy_1373_ltnhor_2'
        cls.candidates = [value for value in cls.priority['skills'].values() if value['enemyId'] == cls.eid]
        cls.animations = load_supplement()['enemies'][cls.eid]['animations']
        cls.speeds = read(DEFAULT_SOURCE / 'data_projectile_speeds.json')
        cls.script_types = load_script_types()
        # The fixed priority receipt preserves historical derived IR. Compile
        # the two owner modes from the same frozen raw channel records so new
        # timing metadata is compared on both sides of the complete-mode gate.
        channels = read(ROOT / 'work/enemy-mode-channels.json')['enemies'][cls.eid]
        modes, gaps = compile_mode_profiles(channels, cls.animations, {}, cls.speeds, cls.script_types,
            lambda a, f, al, si: resolve_action_timing(a, f, al, si, cls.script_types), projectile_contract)
        if gaps:
            raise AssertionError(gaps)
        cls.priority['enemies'][cls.eid]['compiledModeProfiles'] = modes

    def compile(self, candidate=None, context=None, sp_contract=None):
        candidate = candidate or self.candidates[1]
        context = context or self.priority['enemies'][candidate['enemyId']]
        return compile_skill(candidate, context, context['compiledModeProfiles'], context['initialMode'],
            timing_of=lambda a, f, al, si: resolve_action_timing(a, f, al, si, self.script_types),
            projectile_of=projectile_contract, animations=self.animations, aliases={}, speeds=self.speeds,
            sp_contract=sp_contract if sp_contract is not None else read(SP_CONTRACT))

    def test_both_frozen_modes_keep_typed_damage_and_exact_skill_parameter_key(self):
        for candidate in self.candidates:
            with self.subTest(skill=candidate['name']):
                result = self.compile(candidate)
                self.assertTrue(result['accepted'], result['rejections'])
                ir = result['selection']
                self.assertEqual(ir['id'], candidate['id'])
                self.assertEqual(ir['skillKey'], candidate['databaseSkillBindings'][0]['prefabKey'])
                self.assertEqual(ir['modeIndices'], candidate['modeIndices'])
                self.assertEqual(ir['action']['damageType'], 'arts' if 1 in ir['modeIndices'] else 'phys')
                self.assertEqual(ir['selector']['maxTargets'], {'key': 'max_target', 'default': 2})
                self.assertEqual(ir['action']['timing']['hit'], .6666667)
                self.assertEqual(ir['cooldownStarts'], 'cast-start')
                self.assertFalse(ir['enemyImplementationComplete'])
                self.assertFalse(ir['automaticModeTransitionComplete'])

    def test_unknown_sibling_buff_and_target_selector_reject_the_complete_skill(self):
        for case in ('sibling', 'action-buff', 'selector', 'unknown-zero-field', 'selector-ref'):
            candidate = deepcopy(self.candidates[1])
            action = next(value for value in candidate['sameGameObjectComponents'].values() if value['scriptType'] == RANGED)
            if case == 'sibling':
                candidate['sameGameObjectComponents']['new'] = dict(scriptType='Torappu.Battle.Abilities.BuffAfterAffecting', fields={})
            elif case == 'action-buff':
                action['fields']['_activeBuffs'] = [{'buffKey': 'unhandled'}]
            elif case == 'selector':
                next(value for value in candidate['componentDependencies'].values() if value['scriptType'].endswith('BlockedOrAdvancedSelector'))['fields']['_postFilter'] = 2
            elif case == 'unknown-zero-field':
                action['fields']['_newZeroFlag'] = 0
            elif case == 'selector-ref':
                action['fields']['_selector']['m_PathID'] = 123
            with self.subTest(case=case):
                result = self.compile(candidate)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])

    def test_blackboard_and_database_name_binding_cannot_silently_drop_extra_mechanics(self):
        for change in ('unknown-key', 'negative-scale', 'fractional-targets', 'duplicate-binding'):
            candidate = deepcopy(self.candidates[1])
            context = deepcopy(self.priority['enemies'][self.eid])
            binding = candidate['databaseSkillBindings'][0]
            if change == 'duplicate-binding':
                candidate['databaseSkillBindings'].append(deepcopy(binding))
            else:
                key, value = {'unknown-key': ('stun', 3), 'negative-scale': ('atk_scale', -1),
                              'fractional-targets': ('max_target', 1.5)}[change]
                binding['blackboard'] = [dict(key=key, value=value, valueStr=None)]
                context['sourceSkills'][0] = deepcopy(binding)
            with self.subTest(case=change):
                self.assertFalse(self.compile(candidate, context)['accepted'])

    def test_missing_sp_chain_owner_mode_or_boss_does_not_export_a_skill(self):
        self.assertFalse(self.compile(sp_contract={})['accepted'])
        context = deepcopy(self.priority['enemies'][self.eid])
        context['sourceLevelType'] = 'BOSS'
        self.assertFalse(self.compile(context=context)['accepted'])
        context['sourceLevelType'] = None
        context['compiledModeProfiles'].pop('0')
        self.assertFalse(self.compile(context=context)['accepted'])

    def test_every_charge_sibling_and_template_action_is_required_before_sp_export(self):
        for change in ('missing-mount', 'extra-node', 'unknown-sibling', 'charge-lifetime', 'wrong-regen'):
            contract = read(SP_CONTRACT)
            binding = contract['bindings'][self.eid]
            if change == 'missing-mount':
                binding['normalAttackChargeBindings'].pop()
            elif change == 'extra-node':
                binding['chargeTemplate']['eventToActions']['ON_BUFF_START'].append({'$type': 'unknown'})
            elif change == 'unknown-sibling':
                binding['normalAttackChargeBindings'][0]['siblingComponents']['extra'] = dict(scriptType='Unknown', fields={})
            elif change == 'charge-lifetime':
                binding['normalAttackChargeBindings'][0]['fields']['_buffs'][0]['lifeTime'] = 1
            elif change == 'wrong-regen':
                binding['sourceSpData']['increment'] = 1
            with self.subTest(case=change):
                result = self.compile(sp_contract=contract)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])


if __name__ == '__main__':
    unittest.main()
