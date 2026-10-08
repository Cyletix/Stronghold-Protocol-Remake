"""Whole-skill admission for end effects and their remaining shared leaves."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler,Rejected,A

ROOT=Path(__file__).resolve().parents[1]


class EndModeIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.data,cls.report=build()

    def compile(self,sid,rows=None,skill=None,character=None,output_id=None):
        oldrows,oldchar=self.c.components,self.c.character
        if rows is not None:self.c.components=lambda _:rows
        if character is not None:self.c.character=lambda _:character
        owner=next(cid for cid,c in self.c.characters.items() if any(s['skillId']==sid for s in c['skills']))
        try:return self.c.compile(output_id or sid,skill or self.skills[sid],owner,sid)
        finally:self.c.components,self.c.character=oldrows,oldchar

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_three_complete_members_and_inherited_attacks(self):
        new={s:p for s,p in self.data['profiles'].items() if p.get('capability')=='end-effects'}
        self.assertEqual(set(new),{'skchr_aurora_1','skchr_fmout_2','skchr_liskam_2'})
        self.assertEqual(sum(p['levelCount'] for p in new.values()),30)
        self.assertEqual(new['skchr_fmout_2']['plan']['kind'],'rangeAll')
        self.assertEqual(new['skchr_liskam_2']['plan']['hitBuffs'][0]['chance'],{'key':'attack@buff_prob'})
        for sid in new:
            p,program=self.compile(sid,output_id='same_contract_another_identity')
            self.assertEqual(p['capability'],'end-effects');self.assertEqual(len(program['endEffects']),1)

    def test_finite_database_contribution_preserves_complete_override_and_local_duration(self):
        _,program=self.compile('skchr_aurora_1');b=program['buffs'][1]
        self.assertEqual(b['lifetime'],{'kind':'timed','duration':{'constant':30.}})
        self.assertEqual(b['modifiers'],[])
        self.assertEqual(b['override_buff']['stacking']['overrideKey'],'status_resistance[bonus]')
        self.assertEqual(b['override_buff']['stacking']['priorityKeys'],['one_minus_status_resistance'])
        rows=deepcopy(self.c.components('skchr_aurora_1'))
        active=next(r['fields'] for r in rows if r['type']==A+'ActiveBuffAbility')
        active['_buffs'][1]['blackboard'][0]['value']=31
        self.reject('mixed-mode-buff-durations',lambda:self.compile('skchr_aurora_1',rows=rows))
        active['_buffs'][1]['blackboard'].append({'key':'unused','value':1,'valueStr':''})
        self.reject('unsupported-finite-owner-local-duration',lambda:self.compile('skchr_aurora_1',rows=rows))

    def test_probability_must_be_finite_and_bound_to_one_effect(self):
        for value in [-.1,1.1,float('nan')]:
            skill=deepcopy(self.skills['skchr_liskam_2'])
            next(b for b in skill['levels'][4]['blackboard'] if b['key']=='attack@buff_prob')['value']=value
            self.reject('invalid-mode-hit-probability',lambda:self.compile('skchr_liskam_2',skill=skill))
        ch=deepcopy(self.c.character('char_107_liskam'))
        actor=next(n for n in ch['modes'][1]['roles']['_attack'] if n['type']==A+'MeleeAttack')
        extra=deepcopy(actor['fields']['_activeBuffs'][0]);extra['buffKey']='another_stun'
        actor['fields']['_activeBuffs'].append(extra)
        self.reject('unsupported-mode-hit-probability-contract',lambda:self.compile('skchr_liskam_2',character=ch))

    def test_probability_needs_full_source_description_not_key_name_only(self):
        skill=deepcopy(self.skills['skchr_liskam_2']);skill['levels'][2]['description']='A different action using the same blackboard key.'
        self.reject('unsupported-mode-hit-probability-contract',lambda:self.compile('skchr_liskam_2',skill=skill))

    def test_end_node_cannot_be_dropped_while_binding_its_levels(self):
        for sid in ('skchr_fmout_2','skchr_liskam_2'):
            rows=[r for r in self.c.components(sid) if r['type']!=A+'BuffAfterAffecting']
            self.reject('unconsumed-or-missing-blackboard',lambda:self.compile(sid,rows=rows))
        skill=deepcopy(self.skills['skchr_aurora_1'])
        next(b for b in skill['levels'][3]['blackboard'] if b['key']=='one_minus_status_resistance')['value']=-1.1
        self.reject('invalid-finite-owner-status-resistance',lambda:self.compile('skchr_aurora_1',skill=skill))


if __name__=='__main__':unittest.main()
