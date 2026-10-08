"""Whole-graph blockee admission and explicit sibling/field rejection."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler,Rejected,C,A

ROOT=Path(__file__).resolve().parents[1]


class BlockeeModes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.data,cls.report=build()

    def compile(self,sid,rows=None,character=None,skill=None,templates=None):
        oldrows,oldchar,oldtemplates=self.c.components,self.c.character,self.c.templates
        if rows is not None:self.c.components=lambda _:rows
        if character is not None:self.c.character=lambda _:character
        if templates is not None:self.c.templates=templates
        owner=next(cid for cid,c in self.c.characters.items() if any(s['skillId']==sid for s in c['skills']))
        try:return self.c.compile(sid,skill or self.skills[sid],owner,sid)
        finally:self.c.components,self.c.character,self.c.templates=oldrows,oldchar,oldtemplates

    def reject(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_discovery_preserves_prior_and_adds_complete_twenty_levels(self):
        modes={s:p for s,p in self.data['profiles'].items() if p.get('capability')=='blockee-effects'}
        self.assertEqual(set(modes),{'skchr_acfend_3','skchr_zumama_2'})
        self.assertEqual(sum(p['levelCount'] for p in modes.values()),20)
        self.assertGreaterEqual(len(self.data['profiles']),43)
        pulse=self.data['programs']['skchr_acfend_3']['blockees'][0]
        self.assertEqual(pulse['interval'],{'constant':1.});self.assertFalse(pulse['waitFirst'])
        self.assertEqual(pulse['sourceDamage']['_ignoreForSp'],False)

    def test_pulse_unknown_sibling_cannot_be_ignored(self):
        sid='skchr_acfend_3';rows=deepcopy(self.c.components(sid))
        rows.append(dict(type=A+'UnknownBlockeeBehavior',node_id='extra',fields={}))
        self.reject('unsupported-blockee-skill-components',lambda:self.compile(sid,rows=rows))

    def test_damage_flags_and_extra_actions_are_strict(self):
        sid='skchr_acfend_3'
        for key,value in [('_skipModifierEvent',True),('_ignoreForSp',True),('_noSource',True),('_damageType','TRUE')]:
            templates=deepcopy(self.c.templates)
            templates['acfend_s_3[damage]']['eventToActions']['_items'][0]['value']['decodedActions'][0][key]=value
            self.reject('unsupported-blockee-field',lambda:self.compile(sid,templates=templates))
        templates=deepcopy(self.c.templates)
        templates['acfend_s_3[damage]']['eventToActions']['_items'][0]['value']['decodedActions'].append({'$type':C+'Action.Nodes+Unknown'})
        self.reject('unsupported-blockee-damage-body',lambda:self.compile(sid,templates=templates))

    def test_clock_cannot_drop_unknown_local_parameters(self):
        sid='skchr_acfend_3'
        for value in [0,-1,float('inf')]:
            rows=deepcopy(self.c.components(sid));b=next(r for r in rows if r['type']==A+'ActiveBuffAbility')['fields']['_buffs'][0]
            b['blackboard'][0]['value']=value
            self.reject('unsupported-blockee-pulse-clock',lambda:self.compile(sid,rows=rows))
        rows=deepcopy(self.c.components(sid));next(r for r in rows if r['type']==A+'ActiveBuffAbility')['fields']['_buffs'][0]['blackboard'].append(dict(key='unknown',value=1,valueStr=''))
        self.reject('unsupported-blockee-pulse-clock',lambda:self.compile(sid,rows=rows))

    def test_child_buffs_keep_complete_flags(self):
        templates=deepcopy(self.c.templates);child=templates['acfend_s_3']['eventToActions']['_items'][0]['value']['decodedActions'][0]['_buff']
        child['isDamageMissable']=True
        self.reject('unsupported-field',lambda:self.compile('skchr_acfend_3',templates=templates))

    def test_maintained_checker_conditions_are_not_inferred_from_type(self):
        oldnode=self.c.reader.node
        try:
            def changed(bundle,ref):
                node=oldnode(bundle,ref)
                if node and node.get('fields',{}).get('_blockMinCnt')==0 and '_buffsToBlockee' in node['fields']:
                    node=deepcopy(node);node['fields']['_blockMinCnt']=1
                return node
            self.c.reader.node=changed
            self.reject('unsupported-blockee-field',lambda:self.compile('skchr_zumama_2'))
        finally:self.c.reader.node=oldnode

    def test_unknown_general_ability_transition_rejects(self):
        ch=deepcopy(self.c.character('char_416_zumama'))
        ch['modes'][1]['fields']['_generalAbilities']*=2
        self.reject('unsupported-blockee-general-transition',lambda:self.compile('skchr_zumama_2',character=ch))

    def test_all_level_keys_and_domains_must_close(self):
        sid='skchr_acfend_3';skill=deepcopy(self.skills[sid]);skill['levels'][0]['blackboard'].append(dict(key='unknown',value=1))
        self.reject('unconsumed-blockee-blackboard',lambda:self.compile(sid,skill=skill))
        skill=deepcopy(self.skills[sid]);next(b for b in skill['levels'][4]['blackboard'] if b['key']=='atk_scale')['value']=0
        self.reject('invalid-blockee-damage-scale',lambda:self.compile(sid,skill=skill))
        skill=deepcopy(self.skills[sid]);next(b for b in skill['levels'][3]['blackboard'] if b['key']=='block_cnt')['value']=.5
        self.reject('invalid-blockee-block-count',lambda:self.compile(sid,skill=skill))


if __name__=='__main__':unittest.main()
