"""Tagged ranged skills require their complete SP / Buff / projectile group."""
from copy import deepcopy
import unittest

from build_external_combat_data import DEFAULT_SOURCE, projectile_contract, resolve_action_timing
from enemy_hit_sequences import load_script_types
from enemy_tagged_ranged_skills import CONTRACT, RANGED, TAGGED, compile_tagged_ranged_skill, read


class TaggedRangedSkillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = read(CONTRACT)
        cls.candidate_id = next(iter(cls.contract['candidates']))
        cls.script_types = load_script_types()
        cls.speeds = read(DEFAULT_SOURCE / 'data_projectile_speeds.json')

    def compile(self, contract=None):
        contract = self.contract if contract is None else contract
        candidate = contract['candidates'][self.candidate_id]
        context = contract['enemies'][candidate['enemyId']]
        return compile_tagged_ranged_skill(candidate, context, context['compiledModeProfiles'],
            context['initialMode'], contract,
            timing_of=lambda a, f, al, si: resolve_action_timing(a, f, al, si, self.script_types),
            projectile_of=projectile_contract,
            animations=contract['animationBindings'][candidate['enemyId']]['source']['animations'],
            aliases={}, speeds=self.speeds)

    def test_real_group_preserves_exact_name_sp_filter_and_loaded_stun(self):
        result = self.compile()
        self.assertTrue(result['accepted'], result['rejections'])
        skill = result['selection']
        self.assertEqual(skill['id'], self.candidate_id)
        self.assertEqual(skill['skillKey'], 'ironsandstorm')
        self.assertEqual(skill['kind'], 'selector-sp-tagged-ranged')
        self.assertEqual(skill['modeIndices'], [0])
        self.assertEqual(skill['spCost'], 3)
        self.assertEqual(skill['selector']['excludeTags'], ['prison'])
        self.assertEqual(skill['selector']['targetMotion'], 1)
        self.assertEqual(skill['selector']['range'], {'kind': 'owner-mode', 'default': 2, 'sourceColliderRadius': 2.25})
        self.assertEqual(skill['blackboard']['max_target'], 2)
        self.assertEqual(skill['action']['damageType'], 'arts')
        self.assertEqual(skill['action']['activeBuffs'][0]['kind'], 'stun')
        self.assertEqual(skill['action']['activeBuffs'][0]['duration'], {'key': 'stun', 'default': 3})
        self.assertTrue(skill['action']['activeBuffs'][0]['isDamageMissable'])
        self.assertTrue(skill['action']['activeBuffs'][0]['statusResistible'])
        self.assertEqual(skill['action']['projectile']['lifeTime'], 10)
        self.assertTrue(skill['action']['projectile']['alwaysHitTraceTargetInTheEnd'])
        self.assertFalse(skill['action']['projectile']['stopWhenSourceInvalid'])
        self.assertEqual(skill['action']['timeMode'], 0)
        self.assertEqual(skill['action']['minAnimScale'], .1)
        self.assertEqual(skill['action']['maxAnimScale'], 1)
        self.assertEqual(skill['cooldownStarts'], 'cast-start')
        self.assertFalse(skill['enemyImplementationComplete'])
        self.assertFalse(skill['automaticModeTransitionComplete'])

    def test_extra_ability_buff_or_active_selector_field_rejects_whole_skill(self):
        for case in ('ability', 'buff', 'buff-declaration', 'selector-buff-filter', 'unknown-field', 'wrong-owner-source'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            action = next(row['fields'] for row in candidate['sameGameObjectComponents'].values() if row['scriptType'] == RANGED)
            selector = next(row['fields'] for row in candidate['componentDependencies'].values() if row['scriptType'] == TAGGED)
            if case == 'ability': candidate['sameGameObjectComponents']['extra'] = dict(scriptType='Unknown', fields={})
            elif case == 'buff': action['_activeBuffs'].append(deepcopy(action['_activeBuffs'][0]))
            elif case == 'buff-declaration': candidate['buffDeclarations'].clear()
            elif case == 'selector-buff-filter': selector['_buffKey'] = 'shield'
            elif case == 'unknown-field': action['_newZeroFlag'] = 0
            elif case == 'wrong-owner-source': action['_selectTargetSource'] = 2
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_parameters_and_exact_skill_binding_are_bounded(self):
        for case in ('unknown-key', 'duplicate-key', 'negative-stun', 'missing-stun', 'fractional-targets', 'invalid-sp', 'missing-name'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            context = contract['enemies'][candidate['enemyId']]
            source = candidate['databaseSkillBindings'][0]
            if case == 'unknown-key': source['blackboard'].append(dict(key='damage_over_time', value=1, valueStr=None))
            elif case == 'duplicate-key': source['blackboard'].append(deepcopy(source['blackboard'][0]))
            elif case == 'negative-stun': source['blackboard'][0]['value'] = -1
            elif case == 'missing-stun': source['blackboard'] = source['blackboard'][1:]
            elif case == 'fractional-targets': source['blackboard'][1]['value'] = 1.5
            elif case == 'invalid-sp': source['spCost'] = 1.5
            context['sourceSkills'] = [] if case == 'missing-name' else [deepcopy(source)]
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_initial_owner_and_dedicated_executor_remain_required(self):
        for case in ('dedicated', 'mode', 'owner', 'source-contract'):
            contract = deepcopy(self.contract)
            candidate = contract['candidates'][self.candidate_id]
            context = contract['enemies'][candidate['enemyId']]
            if case == 'dedicated': context['dedicatedBossProfile'] = {'kind': 'owned'}
            elif case == 'mode': context['initialMode'] = 1
            elif case == 'owner': candidate['ownership']['jpEnabled'] = 0
            elif case == 'source-contract': contract['bindingComplete'] = False
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_real_geometry_and_every_projectile_component_are_required(self):
        for case in ('scaled-range', 'unknown-selector-sibling', 'projectile-extra-buff', 'projectile-speed', 'extra-projectile-component'):
            contract = deepcopy(self.contract)
            binding = contract['bindings'][self.candidate_id]
            projectile = next(iter(contract['projectileBindings'].values()))
            if case == 'scaled-range': binding['transformChain'][1]['fields']['m_LocalScale']['x'] = 2
            elif case == 'unknown-selector-sibling': binding['selectorGameObjectSiblings'].append({'pathId': 'extra'})
            elif case == 'projectile-extra-buff':
                next(row['fields'] for row in projectile['nodes'] if '_actionController' in row['fields'])['_actionController']['_extraBuffsInTheEnd'] = [{'buffKey': 'unknown'}]
            elif case == 'projectile-speed':
                next(row['fields'] for row in projectile['nodes'] if '_speed' in row['fields'])['_speed'] = 20
            elif case == 'extra-projectile-component': projectile['nodes'].append({'pathId': 'extra', 'unityType': 'MonoBehaviour', 'fields': {}})
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_source_sp_event_and_every_normal_output_mount_are_required(self):
        for case in ('time-regen', 'wrong-event', 'missing-stop-gate', 'force-gain', 'missing-channel'):
            contract = deepcopy(self.contract)
            sp = contract['spContract']
            if case == 'time-regen': sp['regenPerSecond'] = 1
            elif case == 'wrong-event': sp['attackRecovery']['event'] = 'ON_HIT'
            elif case == 'missing-stop-gate': sp['attackRecovery']['stoppedWhileSkillRegistered'] = False
            elif case == 'force-gain': sp['attackRecovery']['force'] = True
            elif case == 'missing-channel': contract['spBindings']['normalAbilities'].pop()
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])
        result = self.compile()['selection']['spContract']
        self.assertEqual(result['attackRecovery']['event'], 'output-attack-or-heal')
        self.assertTrue(result['stopRecoveryWhileCasting'])
        self.assertNotIn('basicAttackGain', result)

    def test_loaded_stun_cannot_use_inline_shell_or_drop_template_actions(self):
        for case in ('inline-missability', 'extra-attribute', 'extra-action', 'stack-policy'):
            contract = deepcopy(self.contract)
            binding = contract['buffBindings']['stun']
            if case == 'inline-missability': binding['effective']['isDamageMissable'] = False
            elif case == 'extra-attribute': binding['effective']['attributes']['abnormalFlags'].append(1)
            elif case == 'extra-action': contract['templates']['empty']['eventToActions']['ON_BUFF_START'] = [{'$type': 'unknown'}]
            elif case == 'stack-policy': binding['stackPolicy']['kind'] = 'extend-duration'
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])
        contract = deepcopy(self.contract)
        candidate = contract['candidates'][self.candidate_id]
        source = candidate['databaseSkillBindings'][0]
        source['blackboard'][0]['value'] = 0
        contract['enemies'][candidate['enemyId']]['sourceSkills'] = [deepcopy(source)]
        result = self.compile(contract)
        self.assertTrue(result['accepted'], result['rejections'])
        self.assertEqual(result['selection']['action']['activeBuffs'][0]['duration']['default'], 0)


if __name__ == '__main__':
    unittest.main()
