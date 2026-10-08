"""Whole-graph finite ammunition admission; raw-main/group schemas stay closed."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler,Rejected,C,A

ROOT=Path(__file__).resolve().parents[1]


class FiniteAmmoModes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');cls.data,cls.report=build()

    def compile(self,sid,rows=None,character=None,skill=None):
        oldrows,oldchar=self.c.components,self.c.character
        if rows is not None:self.c.components=lambda _:rows
        if character is not None:self.c.character=lambda _:character
        owner=next(cid for cid,c in self.c.characters.items() if any(s['skillId']==sid for s in c['skills']))
        try:return self.c.compile(sid,skill or self.skills[sid],owner,sid)
        finally:self.c.components,self.c.character=oldrows,oldchar

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_discovery_is_two_full_contracts_twenty_levels(self):
        profiles={s:p for s,p in self.data['profiles'].items() if p.get('capability')=='finite-ammo'}
        self.assertEqual(set(profiles),{'skchr_inside_1','skchr_inside_2'})
        self.assertEqual(sum(p['levelCount'] for p in profiles.values()),20)
        for p in profiles.values():
            self.assertEqual(p['lifetime']['kind'],'until_ammo_depleted');self.assertEqual(p['plan']['ammo'],1)
            self.assertTrue(p['selector']['airFirst']);self.assertEqual(p['ammo']['sourceEventName'],'ON_SPELL_ON')
            self.assertEqual(p['ammo']['progressSource'],'effective-main-attack')
            self.assertEqual(p['source']['ammoCounter']['fromMainRawAttack'],False)
            self.assertEqual(self.data['programs'][p['prefabId']]['buffs'][0]['lifetime'],{'kind':'until_detach'})

    def test_raw_main_progress_is_not_equivalent(self):
        sid='skchr_inside_1';rows=deepcopy(self.c.components(sid))
        next(r['fields'] for r in rows if r['type']==C+'CastSkillWithLimitTimes')['_fromMainRawAttack']=1
        self.reject('unsupported-field',lambda:self.compile(sid,rows=rows))
        self.assertTrue(all(s not in self.data['profiles'] for s in ('skchr_lemuen_1','skchr_lemuen_2')))

    def test_counter_owner_event_and_reset_contracts_are_not_dropped(self):
        sid='skchr_inside_1';base=self.c.character('char_498_inside')
        for field,value,reason in (('_countEvent',5,'unsupported-field'),('_resetWhenAttackFinished',1,'unsupported-field'),('m_GameObject',{'m_FileID':0,'m_PathID':'other'},'ammo-counter-owner-mismatch')):
            ch=deepcopy(base);counter=next(r for r in ch['modes'][1]['roles']['_attack'] if r['type']==A+'AbilityEventCounter');counter['fields'][field]=value
            self.reject(reason,lambda:self.compile(sid,character=ch))

    def test_missing_counter_and_indirect_main_actor_reject(self):
        sid='skchr_inside_1';ch=deepcopy(self.c.character('char_498_inside'))
        ch['modes'][1]['roles']['_attack']=[r for r in ch['modes'][1]['roles']['_attack'] if r['type']!=A+'AbilityEventCounter']
        self.reject('required-single-component',lambda:self.compile(sid,character=ch))
        ch=deepcopy(self.c.character('char_498_inside'));ch['modes'][1]['fields']['_attack']['m_PathID']='indirect'
        self.reject('ammo-main-actor-is-indirect',lambda:self.compile(sid,character=ch))

    def test_source_ammo_count_must_be_positive_safe_integer(self):
        sid='skchr_inside_1'
        for invalid in (0,-1,1.5,9007199254740992):
            skill=deepcopy(self.skills[sid]);next(b for b in skill['levels'][0]['blackboard'] if b['key']=='attack@trigger_time')['value']=invalid
            self.reject('invalid-source-ammo-count',lambda:self.compile(sid,skill=skill))

    def test_ammo_cannot_be_faked_as_timed_or_positive_duration(self):
        sid='skchr_inside_1'
        for field,value in (('durationType','NONE'),('duration',1)):
            skill=deepcopy(self.skills[sid]);skill['levels'][0][field]=value
            self.reject('unsupported-finite-ammo-level-controller',lambda:self.compile(sid,skill=skill))

    def test_selector_budget_and_attribute_formula_remain_bounded(self):
        sid='skchr_inside_2';p,program=self.compile(sid)
        self.assertEqual(p['selector']['priorityApplyWay'],'ranged')
        self.assertIn({'attribute':'taunt_level','formula':'addition','value':{'constant':-1.0}},program['buffs'][0]['modifiers'])
        ch=deepcopy(self.c.character('char_498_inside'));selector=next(n for n in ch['modes'][2]['roles']['_attackTrigger'] if n['type']==C+'SecondaryFilterAdvancedSelector');selector['fields']['_maxNum']=2
        self.reject('unsupported-ranged-priority-budget',lambda:self.compile(sid,character=ch))
        rows=deepcopy(self.c.components(sid));attrs=next(n for n in rows if n['type']==A+'ActiveBuffAbility')['fields']['_buffs'][0]['attributes']['attributeModifiers'];next(m for m in attrs if m['attributeType']==20)['formulaItem']=1
        self.reject('unsupported-taunt-level-formula',lambda:self.compile(sid,rows=rows))

    def test_controller_mode_mismatch_and_extra_behavior_reject(self):
        sid='skchr_inside_1';rows=deepcopy(self.c.components(sid))
        next(r['fields'] for r in rows if r['type']==C+'CastSkillWithLimitTimes')['_modeIndex']=2
        self.reject('ammo-progress-mode-mismatch',lambda:self.compile(sid,rows=rows))
        rows=deepcopy(self.c.components(sid));rows.append(dict(type=A+'UnreviewedAmmoEffect',node_id='extra',fields={}))
        self.reject('unsupported-skill-companions',lambda:self.compile(sid,rows=rows))


if __name__=='__main__':unittest.main()
