"""Dormant source actions must never receive an invented ordinary attack."""
from copy import deepcopy
import unittest

from enemy_self_cast_skills import (DORMANT_FIXED, MELEE, CONTRACT, compile_self_cast_skill, dormant_mode_profiles)
from enemy_skill_dispatch import read
from enemy_hit_sequences import load_script_types
from enemy_animation_overlay import load_supplement
from enemy_mode_profiles import compile_initial_mode


def fixture():
    channel = dict(status='direct-damage-root', scriptPathID=1, pathID=2, fields=deepcopy(DORMANT_FIXED))
    return dict(complete=True, modes=[dict(modeIndex=0,
        channels=dict(combat=channel, attack=dict(status='absent')))])


class DormantModeTests(unittest.TestCase):
    def compile(self, record):
        return dormant_mode_profiles(record, {'1': {'modeIndex': 1, 'channels': {'combat': {'existing': True}}}},
            {'0': ['combat:unresolved-timing'], '2': ['other-unresolved']}, {'1': MELEE})

    def test_blank_zero_damage_source_disables_channels_and_preserves_other_gaps(self):
        modes, gaps, selections = self.compile(fixture())
        self.assertEqual(modes['0'], {'modeIndex': 0, 'channels': {'combat': None, 'attack': None}, 'sourceNoBasicAttack': True})
        self.assertEqual(modes['1']['channels']['combat'], {'existing': True})
        self.assertEqual(gaps, {'2': ['other-unresolved']})
        self.assertEqual(selections[0]['channels'][0]['evidenceLevel'], 'Inferred')

    def test_damage_buffs_unknown_fields_and_mixed_channels_cannot_be_erased(self):
        for change in ('damage', 'animation', 'buff', 'unknown-field', 'mixed-channel', 'duplicate-mode'):
            record = fixture()
            fields = record['modes'][0]['channels']['combat']['fields']
            if change == 'damage': fields['_atkScale'] = 1
            elif change == 'animation': fields['_animKey'] = 'Attack'
            elif change == 'buff': fields['_activeBuffs'] = [{'buffKey': 'event'}]
            elif change == 'unknown-field': fields['_newZero'] = 0
            elif change == 'mixed-channel': record['modes'][0]['channels']['attack'] = {'status': 'unresolved'}
            elif change == 'duplicate-mode': record['modes'].append(deepcopy(record['modes'][0]))
            with self.subTest(case=change):
                modes, gaps, selections = self.compile(record)
                self.assertNotIn('0', modes)
                self.assertIn('0', gaps)
                self.assertEqual(selections, [])


class CompleteAwakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = read(CONTRACT)
        cls.animations = load_supplement()['enemies']
        cls.types = load_script_types()

    def compile(self, contract=None, enemy_id='enemy_1151_dslntc'):
        contract = contract or self.contract
        member = contract['members'][enemy_id]
        candidate = next(iter(member['skills'].values()))
        modes, _, _ = dormant_mode_profiles(member['catalog']['cachedChannels'],
            member['priority']['compiledModeProfiles'], {'0': ['combat:unresolved-timing']}, self.types)
        initial, _ = compile_initial_mode(member['ownership'], member['catalog'], modes)
        return compile_self_cast_skill(candidate, member, modes, initial, contract,
            self.animations[enemy_id]['animations'])

    def test_two_complete_real_source_chains_have_actual_listener_and_full_one_second_animation(self):
        for enemy_id in self.contract['memberIDs']:
            result = self.compile(enemy_id=enemy_id)
            self.assertTrue(result['accepted'], result['rejections'])
            skill = result['selection']
            self.assertEqual(skill['trigger'], {'kind': 'source-listener'})
            self.assertEqual(skill['sourceTrigger'], 'AlwaysTrigger')
            self.assertEqual(skill['action']['duration'], 1)
            self.assertEqual(skill['action']['timeMode'], 1)
            self.assertFalse(skill['action']['interruptOnDetach'])
            self.assertEqual(skill['selfCastLifecycle']['flags'], ['DISARMED', 'UNMOVABLE_PRIVATE'])
            self.assertEqual(skill['selfCastLifecycle']['hpRatio'], {'key': 'sleepwalking.hp_ratio', 'default': .9999})
            self.assertEqual(skill['events']['ON_CAST_START'][0]['kind'], 'add-managed-mark')
            self.assertEqual(skill['events']['ON_CAST_END'][0]['modeIndex'], 1)
            self.assertFalse(skill['enemyImplementationComplete'])

    def test_missing_or_changed_listener_branch_never_exports_a_partial_awake(self):
        for case in ('hp-branch', 'marker', 'unbalanced', 'interrupt', 'extra-buff', 'float-change'):
            contract = deepcopy(self.contract)
            if case in ('hp-branch', 'marker', 'unbalanced', 'interrupt'):
                actions = contract['templates']['dslntc_hp_listener']['eventToActions']['ON_BUFF_TRIGGER']
                if case == 'hp-branch': actions[0]['_condType'] = 'LE'
                elif case == 'marker': actions.pop(1)
                elif case == 'unbalanced': actions[3]['_targetType'] = 'TARGET'
                elif case == 'interrupt': actions[-1]['_interruptCurAbility'] = False
            else:
                member = contract['members']['enemy_1151_dslntc']
                provider_key = next(key for key, row in member['catalog']['components'].items()
                    if any(buff.get('templateKey') == 'dslntc_hp_listener' for buff in row.get('fields', {}).get('_buffs', [])))
                if case == 'extra-buff':
                    member['catalog']['components'][provider_key]['fields']['_buffs'].append({'buffKey': 'extra'})
                else:
                    member['ownership']['components'][provider_key]['sharedFieldDifferences'][0]['JP'] = .02
            with self.subTest(case=case):
                result = self.compile(contract)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])

    def test_marker_and_finish_switch_are_an_indivisible_skill(self):
        for case in ('missing-sibling', 'extra-finish-action', 'uncompiled-target', 'boss'):
            contract = deepcopy(self.contract)
            member = contract['members']['enemy_1151_dslntc']
            if case == 'missing-sibling':
                candidate = next(iter(member['skills'].values()))
                key = next(key for key, row in candidate['sameGameObjectComponents'].items()
                           if row['scriptType'].endswith('BuffToOwner'))
                candidate['sameGameObjectComponents'].pop(key)
            elif case == 'extra-finish-action':
                contract['templates']['dslntc_trigger_switch']['eventToActions']['ON_BUFF_START'].append({'$type': 'Unknown'})
            elif case == 'uncompiled-target': member['priority']['compiledModeProfiles'].pop('1')
            elif case == 'boss': member['priority']['sourceLevelType'] = 'BOSS'
            with self.subTest(case=case):
                result = self.compile(contract)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])


if __name__ == '__main__':
    unittest.main()
