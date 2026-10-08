import copy
import json
import unittest
from pathlib import Path

from build_external_combat_data import animation_profile, DEFAULT_SOURCE
from enemy_hit_sequences import load_script_types
from enemy_pre_attack import ROOT, BUNDLE, compile_member, compile_family


class PreAttackCompilerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records=json.loads((ROOT/'work/enemy-action-template-catalog.json').read_text(encoding='utf8'))['enemies']
        cls.prefabs=json.loads((DEFAULT_SOURCE/'data_enemy_prefab_catalog_current.json').read_text(encoding='utf8'))['prefabs']
        cls.animations=json.loads((ROOT/'work/enemy-animation-supplement.json').read_text(encoding='utf8'))['enemies']
        cls.nodes=json.loads(BUNDLE.read_text(encoding='utf8'))['nodes']
        cls.types=load_script_types()

    def member(self,key='enemy_1010_demon',edit=None):
        values=[copy.deepcopy(self.records[key]),copy.deepcopy(self.prefabs[key]['components']),
            copy.deepcopy(self.animations[key]['animations']),self.types,copy.deepcopy(self.nodes),animation_profile]
        if edit:edit(values)
        return compile_member(*values)

    def test_both_real_roots_use_identical_complete_contract(self):
        for key in ['enemy_1010_demon','enemy_1010_demon_2']:
            with self.subTest(key=key):
                p=self.member(key)['preAttack']
                self.assertEqual((p['first']['duration'],p['first']['hit']),(1.5,.9))
                self.assertEqual((p['repeat']['duration'],p['repeat']['hit']),(1.1,.5))
                self.assertEqual(p['endAnimation'],'Attack_Idle')

    def test_reject_missing_event_or_unproven_attachment(self):
        self.assertIsNone(self.member(edit=lambda x:x[2]['Attack_NoPre'].update(events=[])))
        self.assertIsNone(self.member(edit=lambda x:x[4]['413111401963979532']['fields'].update(m_GameObject={'m_FileID':0,'m_PathID':'different'})))

    def test_extra_mode_or_active_buff_cannot_be_templated(self):
        self.assertIsNone(self.member(edit=lambda x:x[0]['evidence']['rootModes'].append({'modeIndex':1,'actionPathIDs':[5]})))
        self.assertIsNone(self.member(edit=lambda x:next(c for c in x[1] if c['scriptPathID']==4381884627089348317)['fields'].update(_activeBuffs=[{'buffKey':'extra'}])))
        self.assertIsNone(self.member(edit=lambda x:next(c for c in x[1] if c['scriptPathID']==4381884627089348317)['fields'].update(_unknownDamageHook=True)))

    def test_does_not_apply_family_to_names_or_unrelated_empty_keys(self):
        self.assertIsNone(self.member(edit=lambda x:next(c for c in x[1] if c['scriptPathID']==1625475850921588479).update(scriptPathID=123)))
        self.assertIsNone(self.member(edit=lambda x:next(c for c in x[1] if c['scriptPathID']==4381884627089348317)['fields'].update(_animKey='Attack')))

    def test_actual_scope_is_two_not_all_three_source_copies(self):
        scope=json.loads((ROOT/'work/garrison-encounter-scope.json').read_text(encoding='utf8'))['eligibleEnemyIDs']
        result,report=compile_family(self.records,self.prefabs,self.animations,self.types,scope,animation_profile)
        self.assertEqual(set(result),{'enemy_1010_demon','enemy_1010_demon_2'})
        self.assertEqual(report['rejections'],{})
        self.assertNotIn('enemy_5032_dqmon',report['candidates'])


if __name__=='__main__':unittest.main()
