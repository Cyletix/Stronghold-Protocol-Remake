import json
import unittest
from copy import deepcopy
from skill_mode_compiler import ModeCompiler,ROOT,Rejected,A,C
from skill_mode_flow import maybe_compile,sequence


class SourceFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load=lambda path:json.loads((ROOT/path).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(load('work/operator-mode-next-group.json'),load('work/client-logic/program-compilation.json'),load('work/client-logic/buff-templates.json'))
        cls.skill=load('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')['skchr_sunbr_2']
        cls.prefab=cls.skill['levels'][0]['prefabId'];cls.rows=cls.c.components(cls.prefab)

    def compile(self,rows=None,skill=None):
        return maybe_compile(self.c,'source-test-without-id-whitelist',skill or self.skill,'char_196_sunbr',self.prefab,rows or self.rows)

    def test_all_source_levels_and_order(self):
        p,g=self.compile();self.assertEqual(p['levelCount'],10);self.assertEqual(p['lifetime'],{'kind':'flow'})
        self.assertEqual([s['mode']['action'] for s in g['flow']['stages']],['none','heal'])
        self.assertEqual([b['lifetime']['duration']['key'] for b in g['buffs']],['disarm','duration'])
        t=g['flow']['stages'][1]['mode']['plan']['healTiming']
        self.assertEqual(t['eventTime'],.4333);self.assertNotEqual(t['eventTime'],t['sourcePreDelay'])
        for lv in self.skill['levels']:
            bb={b['key']:b['value'] for b in lv['blackboard']}
            self.assertEqual(bb['disarm']+lv['duration'],40)

    def test_unknown_control_rejected(self):
        rows=deepcopy(self.rows);next(r for r in rows if r['type']==A+'AbilitySequenceGroup')['fields']['_forceNextIfCastFail']=1
        with self.assertRaisesRegex(Rejected,'unsupported-sequence-control'):self.compile(rows)

    def test_missing_child_rejected(self):
        rows=deepcopy(self.rows);next(r for r in rows if r['type']==A+'AbilitySequenceGroup')['fields']['_abilities'][0]['m_PathID']='missing'
        with self.assertRaisesRegex(Rejected,'missing-flow-child'):self.compile(rows)

    def test_no_silent_channel_finish_event(self):
        rows=deepcopy(self.rows);next(r for r in rows if r['type']==A+'ThreePartChannelingAnimation')['fields']['_fireAttackFinishEvent']=0
        with self.assertRaisesRegex(Rejected,'missing-child-finish-event'):self.compile(rows)

    def test_unknown_sibling_not_ignored(self):
        rows=deepcopy(self.rows);rows.append({**deepcopy(rows[0]),'node_id':'unused','type':A+'AnimatedActionToOwnerAbility'})
        with self.assertRaisesRegex(Rejected,'unsupported-flow-companions'):self.compile(rows)

    def test_invalid_child_clock_and_unconsumed_bb(self):
        skill=deepcopy(self.skill);next(b for b in skill['levels'][6]['blackboard'] if b['key']=='disarm')['value']=0
        with self.assertRaisesRegex(Rejected,'invalid-flow-child-duration'):self.compile(skill=skill)
        skill=deepcopy(self.skill);skill['levels'][0]['blackboard'].append({'key':'hidden_action','value':1})
        with self.assertRaisesRegex(Rejected,'unconsumed-flow-blackboard'):self.compile(skill=skill)

    def test_whole_scope_matching_has_no_skill_id_allowlist(self):
        p,_=self.compile();self.assertEqual(p['source']['prefabId'],self.prefab)
        self.assertEqual(p['charIds'],['char_196_sunbr'])


if __name__=='__main__':unittest.main()
