"""Real cached after-affecting bodies plus rejection/level-consumption edges."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

from skill_mode_compiler import Rejected
from skill_mode_end_effects import compile_end_effects,TYPE,audit

ROOT=Path(__file__).resolve().parents[1]


class EndEffects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
        cls.closure=read('work/skill-controller-public-closures-20260918.json')
        cls.templates=read('work/client-logic/buff-templates.json')
        cls.database=read('data/ArknightsGameData/zh_CN/gamedata/buff_table.json')
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')

    def source(self,sid):
        m=self.closure['members'][sid]
        return deepcopy([self.closure['componentDictionary'][ref] for ref in m['componentRefs']])

    def compile(self,sid='skchr_liskam_2',rows=None,levels=None,templates=None,database=None,consumed=None):
        c=SimpleNamespace(templates=self.templates if templates is None else templates,
            hit_buffs=SimpleNamespace(shared=SimpleNamespace(database=self.database if database is None else database)))
        return compile_end_effects(c,self.source(sid) if rows is None else rows,
            self.skills[sid]['levels'] if levels is None else levels,set() if consumed is None else consumed)

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def companion(self,rows):
        return next(row for row in rows if row['type']==TYPE)

    def test_three_real_bodies_all_30_levels(self):
        expected={'skchr_aurora_1':('stun','stun',5,5),
                  'skchr_fmout_2':('fmout_s_2[after]','time',15,10),
                  'skchr_liskam_2':('stun','stun',5,5)}
        for sid,(key,duration,first,last) in expected.items():
            with self.subTest(sid=sid):
                consumed=set();ir=self.compile(sid,consumed=consumed)
                self.assertEqual(consumed,{duration});self.assertEqual(len(ir),1)
                q=ir[0];self.assertEqual(q['armEvent'],2);self.assertFalse(q['onlyCheckOnStopAffect'])
                self.assertTrue(q['pollWhileAttached']);self.assertTrue(q['oncePerCast'])
                self.assertEqual(len(q['buffs']),1);b=q['buffs'][0]
                self.assertEqual((b['key'],b['duration']),(key,{'key':duration}))
                self.assertEqual((b['target'],b['sourceId'],b['maxStack']),('owner','owner',1))
                self.assertEqual(b['statusResistable'],'automatic')
                levels=self.skills[sid]['levels'];self.assertEqual(len(levels),10)
                values=[next(x['value'] for x in level['blackboard'] if x['key']==duration) for level in levels]
                self.assertEqual((values[0],values[-1]),(first,last))
        aurora=self.compile('skchr_aurora_1')[0]['buffs'][0]
        self.assertTrue(aurora['damageMissable']);self.assertIn('databaseSha256',aurora['source'])

    def test_identity_is_not_an_admission_gate(self):
        rows=self.source('skchr_fmout_2');row=self.companion(rows)
        row['node_id']='new-companion';row['fields']['_buffs'][0]['buffKey']='new_status_identity'
        self.assertEqual(self.compile(rows=rows,levels=self.skills['skchr_fmout_2']['levels'])[0]['buffs'][0]['key'],'new_status_identity')

    def test_no_companion_is_noop_duplicate_or_stop_only_rejects(self):
        rows=self.source('skchr_liskam_2');row=self.companion(rows)
        consumed={'atk'}
        self.assertEqual(self.compile(rows=[r for r in rows if r is not row],consumed=consumed),[])
        self.assertEqual(consumed,{'atk'})
        self.reject('duplicate-end-effect-companion',lambda:self.compile(rows=rows+[deepcopy(row)]))
        row['fields']['_onlyCheckOnStopAffect']=1
        self.reject('unsupported-end-effect-field',lambda:self.compile(rows=rows))

    def test_unknown_component_and_buff_fields_reject(self):
        rows=self.source('skchr_liskam_2');f=self.companion(rows)['fields'];f['_onInterrupted']=1
        self.reject('unknown-end-effect-fields',lambda:self.compile(rows=rows))
        del f['_onInterrupted'];f['_buffs'][0]['extraAction']=True
        self.reject('unknown-end-effect-fields',lambda:self.compile(rows=rows))

    def test_all_levels_duration_required_finite_positive_and_no_duplicate_keys(self):
        for value in [0,-1,float('nan'),float('inf'),True]:
            levels=deepcopy(self.skills['skchr_liskam_2']['levels'])
            next(b for b in levels[5]['blackboard'] if b['key']=='stun')['value']=value
            self.reject('invalid-end-effect-duration',lambda:self.compile(levels=levels))
        levels=deepcopy(self.skills['skchr_liskam_2']['levels'])
        levels[5]['blackboard']=[b for b in levels[5]['blackboard'] if b['key']!='stun']
        # Source raw lifeTime=5 is not permission to hide a missing CN level key.
        self.reject('invalid-end-effect-duration',lambda:self.compile(levels=levels))
        levels=deepcopy(self.skills['skchr_liskam_2']['levels']);levels[5]['blackboard'].append({'key':'stun','value':5})
        self.reject('invalid-end-effect-level-blackboard',lambda:self.compile(levels=levels))

    def test_extra_attributes_or_template_actions_never_disappear(self):
        rows=self.source('skchr_liskam_2');b=self.companion(rows)['fields']['_buffs'][0]
        b['attributes']['attributeModifiers']=[{'attributeType':1,'value':1}]
        self.reject('unsupported-end-effect-status-body',lambda:self.compile(rows=rows))
        templates=deepcopy(self.templates);templates['empty']['eventToActions']['_items']=[{'key':0,'value':{}}]
        self.reject('unsupported-end-effect-template',lambda:self.compile(templates=templates))
        database=deepcopy(self.database);database['stun']['attributes']['abnormalImmunes']=['STUNNED']
        self.reject('unsupported-end-effect-database',lambda:self.compile('skchr_aurora_1',database=database))

    def test_load_reference_and_duplicate_bodies_reject_without_partial_consumption(self):
        rows=self.source('skchr_aurora_1');buffs=self.companion(rows)['fields']['_buffs']
        buffs[0]['lifeTime']=1
        self.reject('unsupported-end-effect-database-reference',lambda:self.compile('skchr_aurora_1',rows=rows))
        rows=self.source('skchr_liskam_2');buffs=self.companion(rows)['fields']['_buffs'];buffs.append(deepcopy(buffs[0]))
        consumed={'atk'}
        self.reject('duplicate-end-effect-buff-key',lambda:self.compile(rows=rows,consumed=consumed))
        self.assertEqual(consumed,{'atk'})

    def test_frozen_audit_never_promotes_companion_to_complete_skill(self):
        result=audit()
        for sid in ('skchr_aurora_1','skchr_fmout_2','skchr_liskam_2'):
            row=result['accepted'][sid]
            self.assertFalse(row['wholeSkillAccepted']);self.assertTrue(row['remainingRootTypes'])
            self.assertTrue(row['remainingLevelKeys']);self.assertTrue(row['followingGates'])
        self.assertEqual(result['counts']['wholeSkillsAccepted'],0)
        self.assertFalse(result['lifecycleModel']['nativeReasonDispatchProven'])


if __name__=='__main__':unittest.main()
