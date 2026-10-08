"""Complete mode-owned groups may not drop sibling damage, EP or geometry."""
from copy import deepcopy
import unittest

from enemy_periodic_abilities import CONTRACT, compile_periodic_group, read


class PeriodicAbilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = read(CONTRACT)

    def compile(self, contract=None, enemy_id='enemy_1151_dslntc'):
        contract = contract or self.contract
        member = contract['members'][enemy_id]
        return compile_periodic_group(member, member['priority']['compiledModeProfiles'], contract)

    def test_two_real_groups_retain_all_numeric_scopes_and_real_circle(self):
        for enemy_id in self.contract['memberIDs']:
            result = self.compile(enemy_id=enemy_id)
            self.assertTrue(result['accepted'], result['rejections'])
            group = result['selection']
            self.assertEqual(group['attributes'][0]['value'], {'key': 'revive.move_speed', 'default': 5})
            self.assertEqual(group['attributes'][0]['formula'], 'multiplier')
            self.assertEqual([row['kind'] for row in group['periodics']], ['self-damage-maxhp', 'named-ability'])
            self.assertTrue(group['periodics'][0]['waitFirst'])
            self.assertFalse(group['periodics'][1]['waitFirst'])
            self.assertEqual(group['periodics'][0]['ratio'], {'key': 'revive.hp_ratio', 'default': .04})
            self.assertEqual(group['abilities']['ScreamAttack']['range'], {'kind': 'circle', 'radius': 2.5})
            self.assertEqual(group['abilities']['ScreamAttack']['physicalScale'], 0)
            self.assertEqual(group['abilities']['ScreamAttack']['elementType'], 'nervous')
            self.assertEqual(group['normalAttackElement']['ratio'], {'key': 'epdamage.attack@ep_damage_ratio', 'default': .1})
            self.assertEqual(group['normalAttackElement']['channels'], ['combat'])
            self.assertEqual(group['normalAttackElement']['modeIndex'], 1)
            self.assertFalse(group['enemyImplementationComplete'])

    def test_unknown_sibling_or_node_rejects_the_whole_group(self):
        for case in ('extra-buff', 'extra-damage-node', 'named-call-flags', 'unknown-passive-field'):
            contract = deepcopy(self.contract)
            binding = contract['bindings']['enemy_1151_dslntc']
            provider = contract['members']['enemy_1151_dslntc']['catalog']['components'][binding['roles']['reviveProvider']]
            if case == 'extra-buff': provider['fields']['_buffs'].append({'buffKey': 'unimplemented'})
            elif case == 'extra-damage-node':
                contract['templates']['dslntc_pericdic_damage']['eventToActions']['ON_BUFF_TRIGGER'].append({'$type': 'Unknown'})
            elif case == 'named-call-flags':
                contract['templates']['dslntc_trigger_scream']['eventToActions']['ON_BUFF_TRIGGER'][0]['_castDirectly'] = False
            elif case == 'unknown-passive-field': provider['fields']['_unknownZero'] = 0
            with self.subTest(case=case):
                result = self.compile(contract)
                self.assertFalse(result['accepted'])
                self.assertIsNone(result['selection'])

    def test_geometry_requires_real_collider_and_complete_unit_transform_chain(self):
        for case in ('extra-collider', 'offset', 'scaled-parent', 'broken-parent', 'derived-radius'):
            contract = deepcopy(self.contract)
            binding = contract['bindings']['enemy_1151_dslntc']
            if case == 'extra-collider': binding['colliders'].append(deepcopy(binding['colliders'][0]))
            elif case == 'offset': binding['colliders'][0]['fields']['m_Offset']['x'] = 1
            elif case == 'scaled-parent': binding['transformChain'][2]['fields']['m_LocalScale']['x'] = 2
            elif case == 'broken-parent': binding['transformChain'][0]['fields']['m_Father']['m_PathID'] = '0'
            elif case == 'derived-radius': binding['sourceRange']['radius'] = 5
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_missing_element_scope_or_changed_metadata_cannot_become_physical_only(self):
        for case in ('normal-element', 'named-element', 'element-enum', 'normal-source-root'):
            contract = deepcopy(self.contract)
            member = contract['members']['enemy_1151_dslntc']
            if case in ('normal-element', 'named-element'):
                key = 'epdamage.attack@ep_damage_ratio' if case == 'normal-element' else 'scream.ep_damage_ratio'
                member['priority']['sourceTalentBlackboard'] = [row for row in member['priority']['sourceTalentBlackboard'] if row['key'] != key]
            elif case == 'element-enum': contract['metadataEnums']['Torappu.Battle.ElementType']['SANITY']['value'] = 2
            elif case == 'normal-source-root': member['catalog']['cachedChannels']['modes'][1]['channels']['combat']['fields']['_atkScale'] = .5
            with self.subTest(case=case):
                self.assertFalse(self.compile(contract)['accepted'])

    def test_scope_isolation_and_boss_boundary_are_preserved(self):
        contract = deepcopy(self.contract)
        member = contract['members']['enemy_1151_dslntc']
        member['priority']['sourceTalentBlackboard'].append({'key': 'ep_damage_ratio', 'value': 99, 'valueStr': None})
        result = self.compile(contract)
        self.assertTrue(result['accepted'], result['rejections'])
        self.assertEqual(result['selection']['abilities']['ScreamAttack']['elementRatio']['default'], .2)
        member['priority']['sourceLevelType'] = 'BOSS'
        self.assertFalse(self.compile(contract)['accepted'])


if __name__ == '__main__':
    unittest.main()
