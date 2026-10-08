"""Area melee must retain its whole source group and source-owned geometry."""
from copy import deepcopy
import unittest

from build_external_combat_data import resolve_action_timing
from enemy_area_melee_skills import CONTRACT, MELEE, compile_area_melee_skill, read
from enemy_hit_sequences import load_script_types


class AreaMeleeSkillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = read(CONTRACT)
        cls.script_types = load_script_types()
        cls.candidate_id = next(iter(cls.contract['candidates']))

    def compile(self, contract=None):
        contract = contract if contract is not None else self.contract
        candidate = contract['candidates'][self.candidate_id]
        context = contract['enemies'][candidate['enemyId']]
        return compile_area_melee_skill(candidate, context, context['compiledModeProfiles'],
            context['initialMode'], contract,
            timing_of=lambda a, f, al, si: resolve_action_timing(a, f, al, si, self.script_types),
            animations=contract['animationBindings'][candidate['enemyId']]['source']['animations'], aliases={})

    def test_real_complete_group_uses_stable_skill_id_and_independent_cooldown(self):
        result = self.compile()
        self.assertTrue(result['accepted'], result['rejections'])
        skill = result['selection']
        self.assertEqual(skill['id'], self.candidate_id)
        self.assertEqual(skill['kind'], 'selector-cooldown-area-melee')
        self.assertEqual(skill['skillKey'], 'CircleAttack')
        self.assertEqual((skill['cooldown'], skill['initCooldown'], skill['spCost']), (15, 15, 0))
        self.assertEqual(skill['selector']['range']['radius']['key'], 'range_radius')
        self.assertEqual(skill['selector']['range']['radius']['default'], 1.5)
        self.assertEqual(skill['selector']['range']['sourceColliderRadius'], 1)
        self.assertEqual(skill['blackboard'], {'atk_scale': 1, 'range_radius': 1.5})
        self.assertNotIn('maxTargets', skill['selector'])
        self.assertNotIn('spContract', skill)
        self.assertEqual(skill['action']['delivery'], 'direct')
        self.assertEqual(skill['action']['selectTargetTiming'], 1)
        self.assertEqual(skill['action']['selectTargetSource'], 1)
        self.assertEqual(skill['action']['timeMode'], 0)
        self.assertEqual(skill['action']['minAnimScale'], .1)
        self.assertEqual(skill['action']['maxAnimScale'], 1)
        self.assertEqual(skill['action']['timing'], {'animation': 'A_Skill2', 'duration': 2.0667, 'hit': .6333,
            'playback': {'rule': 'native-attack-time-capped-animation', 'timeMode': 0,
                         'minScale': .1, 'maxScale': 1}})
        self.assertEqual(skill['cooldownStarts'], 'cast-start')
        self.assertEqual(skill['selector']['includeTargetPolicy'], 'replace-last-if-absent')
        self.assertFalse(skill['action']['interruptOnDetach'])
        self.assertFalse(skill['enemyImplementationComplete'])
        self.assertFalse(skill['automaticModeTransitionComplete'])

    def test_unknown_sibling_action_or_selector_cannot_become_partial_damage(self):
        for case in ('sibling', 'buff', 'unknown-zero-field', 'selector', 'target-timing'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            action = next(row for row in candidate['sameGameObjectComponents'].values() if row['scriptType'] == MELEE)
            if case == 'sibling':
                candidate['sameGameObjectComponents']['extra'] = dict(scriptType='UncompiledAbility', fields={})
            elif case == 'buff': action['fields']['_activeBuffs'] = [{'buffKey': 'unknown'}]
            elif case == 'unknown-zero-field': action['fields']['_newZero'] = 0
            elif case == 'selector':
                next(row for row in candidate['componentDependencies'].values() if row['scriptType'].endswith('AdvancedSelector'))['fields']['_limitTargetNum'] = 1
            elif case == 'target-timing': action['fields']['_selectTargetTiming'] = 0
            with self.subTest(case=case):
                result = self.compile(contract)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])

    def test_source_boss_is_bounded_by_actual_owner_and_dedicated_executor(self):
        for case in ('dedicated-executor', 'missing-owner-mode', 'inactive-owner', 'initial-other-mode'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            context = contract['enemies'][candidate['enemyId']]
            if case == 'dedicated-executor': context['dedicatedBossProfile'] = {'kind': 'specialized'}
            elif case == 'missing-owner-mode': context['compiledModeProfiles'].clear()
            elif case == 'inactive-owner': candidate['ownership']['jpEnabled'] = 0
            elif case == 'initial-other-mode': context['initialMode'] = 1
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_parameters_cannot_smuggle_unknown_buff_sp_or_nonfinite_values(self):
        for case in ('unknown-key', 'sp', 'negative-radius', 'zero-radius', 'missing-radius', 'zero-scale', 'duplicate-key', 'invalid-cooldown'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            context = contract['enemies'][candidate['enemyId']]
            source = candidate['databaseSkillBindings'][0]
            if case == 'unknown-key': source['blackboard'].append(dict(key='stun', value=5, valueStr=None))
            elif case == 'sp': source['spCost'] = 1
            elif case == 'negative-radius': source['blackboard'][1]['value'] = -1
            elif case == 'zero-radius': source['blackboard'][1]['value'] = 0
            elif case == 'missing-radius': source['blackboard'] = source['blackboard'][:1]
            elif case == 'zero-scale': source['blackboard'][0]['value'] = 0
            elif case == 'duplicate-key': source['blackboard'].append(deepcopy(source['blackboard'][0]))
            elif case == 'invalid-cooldown': source['cooldown'] = float('nan')
            context['sourceSkills'] = [deepcopy(source)]
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_geometry_and_source_range_siblings_must_be_complete(self):
        for case in ('extra-collider', 'scaled-parent', 'broken-parent', 'extra-unity-sibling', 'range-fields'):
            contract = deepcopy(self.contract)
            binding = contract['bindings'][self.candidate_id]
            if case == 'extra-collider': binding['colliders'].append(deepcopy(binding['colliders'][0]))
            elif case == 'scaled-parent': binding['transformChain'][2]['fields']['m_LocalScale']['x'] = 2
            elif case == 'broken-parent': binding['transformChain'][0]['fields']['m_Father']['m_PathID'] = '0'
            elif case == 'extra-unity-sibling': binding['selectorGameObjectSiblings'].append({'pathId': 'unknown', 'unityType': 'MonoBehaviour'})
            elif case == 'range-fields':
                next(row['component'] for row in binding['selectorComponents']
                    if row['componentKey'] == binding['roles']['physicsRange'])['fields']['_scaleble'] = 1
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_missing_native_or_extra_animation_event_cannot_export(self):
        for case in ('unfinished-binding', 'unfinished-contract', 'native', 'extra-hit', 'wrong-receipt', 'enum', 'clamp', 'cooldown-edge'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            animation = contract['animationBindings'][candidate['enemyId']]
            if case == 'unfinished-binding': contract['bindings'][self.candidate_id]['bindingComplete'] = False
            elif case == 'unfinished-contract': contract['bindingComplete'] = False
            elif case == 'native': contract['runtimeContract'] = {}
            elif case == 'extra-hit':
                animation['source']['animations']['A_Skill2']['events'].append({'event': 'OnAttack', 't': 1})
            elif case == 'wrong-receipt': animation['timing']['hit'] = .5
            elif case == 'enum': contract['metadataEnums']['Torappu.Battle.AbilityStandard+SelectTargetTiming']['BEFORE_SPELL_START']['value'] = 0
            elif case == 'clamp': contract['timingBindings'][self.candidate_id]['minAnimScale'] = .01
            elif case == 'cooldown-edge': contract['runtimeContract']['cooldownReset']['at'] = 'cast-finish'
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])


if __name__ == '__main__':
    unittest.main()
