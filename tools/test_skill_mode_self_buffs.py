"""Complete bounded self Buff admission and structural rejection boundaries."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler,Rejected,C,A

ROOT=Path(__file__).resolve().parents[1]


class SelfBuffModes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.data,cls.report=build()

    def compile(self,sid,rows=None,skill=None,templates=None,output_id=None):
        oldrows,oldtemplates=self.c.components,self.c.templates
        if rows is not None:self.c.components=lambda _:rows
        if templates is not None:self.c.templates=templates
        owner=next(cid for cid,c in self.c.characters.items() if any(s['skillId']==sid for s in c['skills']))
        try:return self.c.compile(output_id or sid,skill or self.skills[sid],owner,sid)
        finally:self.c.components,self.c.templates=oldrows,oldtemplates

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def template(self,key,mutate):
        templates=deepcopy(self.c.templates);value=templates[key]['eventToActions']['_items'][0]['value']
        mutate(value['decodedActions']);value['SerializedState']=json.dumps(value['decodedActions'])
        return templates

    def test_all_scope_finds_complete_four_without_id_allowlist(self):
        members={s:p for s,p in self.data['profiles'].items() if p.get('capability')=='bounded-self-buffs'}
        self.assertEqual(set(members),{'skchr_liskam_1','skchr_branch_1','skchr_acnipe_1','skchr_acpion_2'})
        self.assertEqual(sum(p['levelCount'] for p in members.values()),40)
        self.assertGreaterEqual(len(self.data['profiles']),47)
        for sid in members:
            p,_=self.compile(sid,output_id='new_same_shape_identity')
            self.assertEqual(p['capability'],'bounded-self-buffs')

    def test_finite_buff_duration_overrides_negative_skill_duration(self):
        p,program=self.compile('skchr_liskam_1')
        self.assertTrue(all(x['duration']==-1 for x in self.skills['skchr_liskam_1']['levels']))
        self.assertEqual(len(program['buffs']),2)
        self.assertEqual(p['lifetime'],{'kind':'timed','duration':{'key':'duration'}})
        skill=deepcopy(self.skills['skchr_liskam_1'])
        next(b for b in skill['levels'][4]['blackboard'] if b['key']=='duration')['value']=0
        self.reject('unsupported-self-level-controller',lambda:self.compile('skchr_liskam_1',skill=skill))

    def test_unknown_sibling_or_positive_predelay_rejects(self):
        sid='skchr_acnipe_1';rows=deepcopy(self.c.components(sid))
        rows.append(dict(type=A+'Unknown',node_id='extra',fields={}))
        self.reject('unsupported-self-buff-skill-components',lambda:self.compile(sid,rows=rows))
        rows=deepcopy(self.c.components(sid));next(r['fields'] for r in rows if r['type']==A+'ActiveBuffAbility')['_preDelay']=.1
        self.reject('unsupported-field',lambda:self.compile(sid,rows=rows))

    def test_block_finishes_own_instance_and_checks_all_flags(self):
        _,program=self.compile('skchr_liskam_1')
        self.assertNotIn('damage_block_once',program['buffs'][0])
        self.assertTrue(program['buffs'][1]['damage_block_once']['finishOwnBuff'])
        for field,value in [('_useSource',True),('_filterDamageType',True),('_useDynamicVar',True)]:
            t=self.template('damage_block_once',lambda actions:actions[0].__setitem__(field,value))
            self.reject('unsupported-self-buff-field',lambda:self.compile('skchr_liskam_1',templates=t))
        t=self.template('damage_block_once',lambda actions:actions.append({'$type':C+'Action.Nodes+Unknown'}))
        self.reject('unsupported-self-buff-actions',lambda:self.compile('skchr_liskam_1',templates=t))

    def test_derived_parent_source_and_override_are_complete(self):
        _,program=self.compile('skchr_branch_1');d=program['buffs'][0]['derived_buffs'][0]
        self.assertEqual(d['stacking']['overrideKey'],'status_resistance[bonus]')
        self.assertEqual(d['stacking']['priorityKeys'],['one_minus_status_resistance'])
        self.assertEqual(d['lifetime']['kind'],'until_parent_finish')
        for field,value in [('_finishDerivedBuffIfParentFinish',False),('_useSpecialBuffSource',True),('_buffOwner','SOURCE')]:
            t=self.template('branch_s_1',lambda actions:actions[0].__setitem__(field,value))
            self.reject('unsupported-self-buff-field',lambda:self.compile('skchr_branch_1',templates=t))
        t=self.template('branch_s_1',lambda actions:actions[0]['_buff'].__setitem__('isSilenceable',True))
        self.reject('unsupported-field',lambda:self.compile('skchr_branch_1',templates=t))

    def test_penetration_domain_and_formula_reject_invalid_levels(self):
        for sid,key,value,reason in [('skchr_acnipe_1','def_penetrate_fixed',-1,'invalid-fixed-def-penetration'),
                ('skchr_acpion_2','def_penetrate',1.1,'invalid-def-penetration')]:
            skill=deepcopy(self.skills[sid]);next(b for b in skill['levels'][4]['blackboard'] if b['key']==key)['value']=value
            self.reject(reason,lambda:self.compile(sid,skill=skill))
        rows=deepcopy(self.c.components('skchr_acnipe_1'))
        b=next(r['fields'] for r in rows if r['type']==A+'ActiveBuffAbility')['_buffs'][0]
        next(m for m in b['attributes']['attributeModifiers'] if m['attributeType']==25)['formulaItem']=1
        self.reject('unsupported-penetration-formula',lambda:self.compile('skchr_acnipe_1',rows=rows))

    def test_finite_clock_rejects_unbounded_count_or_unknown_cost(self):
        for key,value in [('trig_cnt',1.2),('trig_cnt',0),('interval',0),('cost',-1)]:
            skill=deepcopy(self.skills['skchr_acpion_2']);next(b for b in skill['levels'][5]['blackboard'] if b['key']==key)['value']=value
            self.reject('invalid-finite-self-clock',lambda:self.compile('skchr_acpion_2',skill=skill))
        t=self.template('acpion_s_2',lambda actions:actions[0].__setitem__('_sourceType','TARGET'))
        self.reject('unsupported-self-buff-field',lambda:self.compile('skchr_acpion_2',templates=t))

    def test_every_blackboard_dependency_is_consumed(self):
        skill=deepcopy(self.skills['skchr_branch_1'])
        skill['levels'][0]['blackboard'].append(dict(key='unknown_effect',value=1))
        self.reject('unconsumed-self-blackboard',lambda:self.compile('skchr_branch_1',skill=skill))
        skill=deepcopy(self.skills['skchr_branch_1'])
        next(b for b in skill['levels'][3]['blackboard'] if b['key']=='one_minus_status_resistance')['value']=-2
        self.reject('invalid-derived-status-resistance',lambda:self.compile('skchr_branch_1',skill=skill))


if __name__=='__main__':unittest.main()
