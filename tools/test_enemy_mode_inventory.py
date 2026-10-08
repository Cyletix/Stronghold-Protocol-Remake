"""Small source-contract checks; no source database, APK, or downloads are used."""
import copy
import unittest

from inspect_enemy_mode_dispatch import inspect_enemy
from overlay_enemy_mode_ownership import compare_fields, initial_mode_zero_check


class ModeInventoryBoundaries(unittest.TestCase):
    def test_mode_array_positions_and_external_refs_are_preserved(self):
        def component(pid, script, fields):
            return dict(cabin='CAB-test', pathID=pid, scriptPathID=script, fields=fields)
        prefab = dict(components=[
            component(1, 10, {'_modes': [{'m_FileID': 0, 'm_PathID': 2},
                                        {'m_FileID': 1, 'm_PathID': 2}]}),
            component(2, 11, {'_attack': {'m_FileID': 0, 'm_PathID': 3}}),
            component(3, 12, {'_defaultModeIndex': 1}),
        ])
        types = {'10': ['Torappu.Battle.Enemy'], '11': ['Torappu.Battle.UnitMode'],
                 '12': ['Torappu.Battle.Talent']}
        result = inspect_enemy('enemy_test', dict(name='test', inEncounterPool=False), prefab, types)
        self.assertEqual([row['modeIndex'] for row in result['modes']], [0, 1])
        self.assertEqual(result['modes'][1]['status'], 'external-reference')
        self.assertIsNone(result['initialMode']['selectedModeIndex'])
        self.assertEqual(result['initialMode']['talentDefaultModeFields'][0]['rawDefaultModeIndex'], 1)
        duplicate = copy.deepcopy(prefab)
        duplicate['components'].append(component(2, 11, {}))
        ambiguous = inspect_enemy('enemy_test', dict(name='test', inEncounterPool=False), duplicate, types)
        self.assertEqual(ambiguous['modes'][0]['status'], 'ambiguous-reference')

    def test_cross_version_shared_values_and_schema_differences_are_distinct(self):
        cn = {'ref': {'m_FileID': 0, 'm_PathID': 9007199254740993}, 'added': 0,
              'SerializedState': '[{"_modeIndex":1}]'}
        jp = {'ref': {'m_FileID': 0, 'm_PathID': '9007199254740993'},
              'SerializedState': '[ { "_modeIndex" : 1 } ]'}
        differences, schema = compare_fields(cn, jp)
        self.assertFalse(differences)
        self.assertEqual(schema, [{'path': '/added', 'onlyIn': 'CN', 'value': 0}])
        changed = copy.deepcopy(jp)
        changed['SerializedState'] = '[{"_modeIndex":2}]'
        self.assertEqual(compare_fields(cn, changed)[0][0]['path'], '/SerializedState{json}/0/_modeIndex')

    def test_initial_zero_requires_complete_negative_matching_defaults(self):
        record = dict(components={'c': dict(pathID='9', scriptPathID='8', fields={'_defaultModeIndex': -1})})
        overlay = dict(status='matched-entity-and-mode-anchors', jpSubtree=dict(
            completeTalentAndSkillCoverage=True, unknownMonoBehaviourTypes=[]),
            talentAndSkillComponents={'9': dict(scriptPathID='8', fields={'_defaultModeIndex': -1})})
        self.assertTrue(initial_mode_zero_check(record, overlay)['candidate'])
        for change in ('missing-coverage', 'unknown-type', 'nonnegative', 'missing-default', 'script-mismatch'):
            modified = copy.deepcopy(overlay)
            if change == 'missing-coverage': modified['jpSubtree']['completeTalentAndSkillCoverage'] = False
            if change == 'unknown-type': modified['jpSubtree']['unknownMonoBehaviourTypes'] = ['unknown']
            if change == 'nonnegative': modified['talentAndSkillComponents']['9']['fields']['_defaultModeIndex'] = 1
            if change == 'missing-default': modified['talentAndSkillComponents']['9']['fields'] = {}
            if change == 'script-mismatch': modified['talentAndSkillComponents']['9']['scriptPathID'] = 'other'
            with self.subTest(change=change):
                self.assertFalse(initial_mode_zero_check(record, modified)['candidate'])


if __name__ == '__main__':
    unittest.main()
