"""Whole-skill admission for the maintained-aura provider integration."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler,Rejected,C,A

ROOT=Path(__file__).resolve().parents[1]


class CompleteAuraModes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),
                           read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.data,cls.report=build()

    def compile(self,sid,rows=None,character=None,skill=None):
        original_rows,original_char=self.c.components,self.c.character
        if rows is not None:self.c.components=lambda _:rows
        if character is not None:self.c.character=lambda _:character
        owner=next(cid for cid,c in self.c.characters.items() if any(s['skillId']==sid for s in c['skills']))
        try:return self.c.compile(sid,skill or self.skills[sid],owner,sid)
        finally:self.c.components,self.c.character=original_rows,original_char

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def selected(self,sid):
        p=self.data['profiles'][sid];character=deepcopy(self.c.character(p['charIds'][0]))
        mode=character['modes'][p['modeIndex']]
        actor=next(n for n in mode['roles']['_attack'] if n['type'] in (A+'MeleeAttack',A+'RangedHeal'))
        return character,actor

    def test_four_complete_graphs_and_all_source_levels(self):
        profiles={s:p for s,p in self.data['profiles'].items() if p.get('capability')=='maintained-aura'}
        self.assertEqual(set(profiles),{'skchr_slbell_1','skchr_slbell_2','skchr_ceylon_2','skchr_accast_2'})
        self.assertEqual(sum(p['levelCount'] for p in profiles.values()),40)
        for p in profiles.values():
            program=self.data['programs'][p['prefabId']]
            self.assertEqual(len(program['auras']),1)
            self.assertTrue(all(b['lifetime']['kind']=='timed' for b in program['buffs']))
            self.assertTrue(all(b['lifetime']['kind']=='until_detach' for b in program['auras'][0]['buffs']))

    def test_controller_and_owner_lifetime_are_explicit(self):
        p,program=self.compile('skchr_ceylon_2')
        self.assertEqual(program['controller']['kind'],'attach_or_detach_skill_auras')
        self.assertEqual(p['action'],'heal');self.assertEqual(p['plan']['targets'],{'key':'attack@max_target'})
        self.assertEqual(program['buffs'][0]['source']['originalLifetime'],{'kind':'until_detach'})
        self.assertEqual(program['buffs'][0]['lifetime'],{'kind':'timed','duration':{'key':'duration'}})
        p,program=self.compile('skchr_accast_2')
        self.assertEqual(p['action'],'inherit');self.assertIsNone(p['modeIndex'])
        self.assertEqual(program['auras'][0]['range']['kind'],'global')

    def test_attack_delay_and_visual_mount_are_distinct_contracts(self):
        for sid in ('skchr_slbell_1','skchr_slbell_2'):
            p,_=self.compile(sid)
            self.assertEqual(p['plan']['delivery'],'direct');self.assertEqual(p['plan']['attackPreDelay'],.5)
        character,actor=self.selected('skchr_ceylon_2');actor['fields']['_mountPointType']=7
        p,_=self.compile('skchr_ceylon_2',character=character)
        self.assertEqual(p['source']['actorPresentation']['mountPointType'],7)
        actor['fields']['_mountPointType']='2'
        self.reject('invalid-heal-presentation-mount',lambda:self.compile('skchr_ceylon_2',character=character))

    def test_invalid_event_and_delay_controls_reject(self):
        character,actor=self.selected('skchr_slbell_1');actor['fields']['_waitForAttackEvent']=2
        self.reject('unsupported-attack-control',lambda:self.compile('skchr_slbell_1',character=character))
        actor['fields']['_waitForAttackEvent']=0;actor['fields']['_preDelay']=-.5
        self.reject('unsupported-mode-attack-predelay',lambda:self.compile('skchr_slbell_1',character=character))

    def test_unconsumed_talent_never_becomes_a_partial_skill(self):
        self.assertNotIn('skchr_acsupo_3',self.data['profiles'])
        rejected=self.report['rejections']['skchr_acsupo_3']
        self.assertEqual(rejected['reason'],'unconsumed-aura-blackboard')
        self.assertEqual(set(rejected['actual']['source'])-set(rejected['actual']['consumed']),{'talent_scale'})

    def test_extra_behavior_and_unbound_parameter_reject(self):
        sid='skchr_slbell_1';rows=deepcopy(self.c.components(sid));rows.append(dict(type=A+'UnreviewedSkillAction',node_id='extra',fields={}))
        self.reject('unsupported-aura-siblings',lambda:self.compile(sid,rows=rows))
        skill=deepcopy(self.skills[sid])
        for l in skill['levels']:l['blackboard'].append(dict(key='extra_damage',value=1))
        self.reject('unconsumed-aura-blackboard',lambda:self.compile(sid,skill=skill))

    def test_finite_attach_controller_cannot_accept_infinity(self):
        sid='skchr_ceylon_2';rows=deepcopy(self.c.components(sid))
        next(r['fields'] for r in rows if r['type']==C+'AttachOrDetachSkill')['_isInfinity']=1
        self.reject('unsupported-field',lambda:self.compile(sid,rows=rows))

    def test_changed_selected_general_ability_is_not_presentation(self):
        sid='skchr_slbell_1';character,actor=self.selected(sid)
        character['modes'][1]['fields']['_generalAbilities'].append(dict(m_FileID=0,m_PathID='extra'))
        self.reject('mode-adds-general-abilities',lambda:self.compile(sid,character=character))


if __name__=='__main__':unittest.main()
