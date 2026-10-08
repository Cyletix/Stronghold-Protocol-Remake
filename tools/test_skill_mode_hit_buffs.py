"""Finite source status bodies, namespace ownership and full mode closure."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from skill_mode_compiler import ModeCompiler, A
from skill_mode_hit_buffs import ModeHitBuffCompiler
from next_attack_compiler import Rejected

ROOT=Path(__file__).resolve().parents[1]


class ModeHitBuffContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
        cls.templates=read('work/client-logic/buff-templates.json')
        cls.database=read('data/ArknightsGameData/zh_CN/gamedata/buff_table.json')
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.characters=read('data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json')
        cls.mode=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),cls.templates)
        cls.compiler=ModeHitBuffCompiler(cls.templates,cls.database)

    def source(self,sid):
        cid=next(cid for cid,c in self.characters.items() if any(s['skillId']==sid for s in c['skills']))
        active=next(n['fields'] for n in self.mode.components(sid) if n['type']==A+'ActiveBuffAbility')
        switch=next(b for b in active['_buffs'] if b['templateKey'].startswith('switch_mode'))
        index=int(switch['blackboard'][0]['value']) if switch['blackboard'] else 1
        actor=next(n for n in self.mode.character(cid)['modes'][index]['roles']['_attack'] if n['fields'].get('_activeBuffs'))
        return cid,deepcopy(actor['fields']['_activeBuffs']),deepcopy(self.skills[sid]['levels'])

    def test_loaded_slow_resolves_database_and_attack_namespace(self):
        _,buffs,levels=self.source('skchr_acsupo_2');consumed=set()
        effect=self.compiler.compile(buffs,levels,True,consumed)[0]
        self.assertEqual(effect['durationKey'],'attack@sluggish');self.assertAlmostEqual(effect['value'],.2)
        self.assertEqual(consumed,{'attack@sluggish'});self.assertEqual(effect['phase'],'before-body')
        self.assertEqual(effect['source']['databaseKey'],'sluggish')

    def test_inline_speed_and_stun_keep_exact_source_keys(self):
        for sid,key,fields,phase in [('skchr_cuttle_2','cuttle_s_2[debuff]',{'attack@move_speed','attack@duration'},'before-body'),
                                     ('skchr_mantic_2','stun',{'attack@stun'},'after-body')]:
            _,buffs,levels=self.source(sid);consumed=set()
            effect=self.compiler.compile(buffs,levels,phase=='before-body',consumed)[0]
            self.assertEqual(effect['key'],key);self.assertEqual(consumed,fields);self.assertEqual(effect['phase'],phase)

    def test_every_source_level_requires_valid_status_values(self):
        _,buffs,levels=self.source('skchr_cuttle_2')
        for key,value in [('attack@duration',0),('attack@move_speed',.1),('attack@move_speed',-1.1)]:
            changed=deepcopy(levels)
            next(b for b in changed[-1]['blackboard'] if b['key']==key)['value']=value
            with self.assertRaises(Rejected):self.compiler.compile(buffs,changed,True,set())

    def test_missing_scope_does_not_fall_back_to_unprefixed_skill_value(self):
        _,buffs,levels=self.source('skchr_acsupo_2')
        for level in levels:
            next(b for b in level['blackboard'] if b['key']=='attack@sluggish')['key']='sluggish'
        with self.assertRaises(Rejected):self.compiler.compile(buffs,levels,True,set())

    def test_unproved_fallback_and_eventful_template_reject(self):
        _,buffs,levels=self.source('skchr_acsupo_2')
        for level in levels:level['blackboard']=[b for b in level['blackboard'] if b['key']!='attack@sluggish']
        with self.assertRaises(Rejected):self.compiler.compile(buffs,levels,True,set(),{'sluggish':{'constant':.5}})
        changed=deepcopy(self.templates);changed['empty']['eventToActions']['_items'].append({'key':0,'value':{}})
        with self.assertRaises(Rejected):ModeHitBuffCompiler(changed,self.database).compile(buffs,levels,True,set())

    def test_whole_buff_fields_and_identity_are_checked(self):
        _,buffs,levels=self.source('skchr_mantic_2')
        for change in [{'extraAction':True},{'lifeTimeType':2},{'refreshRemainingTimeWhenStackMax':1}]:
            changed=deepcopy(buffs);changed[0].update(change)
            with self.assertRaises(Rejected):self.compiler.compile(changed,levels,False,set())
        with self.assertRaises(Rejected):self.compiler.compile(buffs+buffs,levels,False,set())

    def test_full_source_modes_close_with_hp_and_defense_policy(self):
        for sid in ('skchr_acsupo_2','skchr_cuttle_2','skchr_mantic_2'):
            cid,_,_=self.source(sid);profile,_=self.mode.compile(sid,self.skills[sid],cid,sid)
            self.assertTrue(profile['plan']['hitBuffs'])
            if sid=='skchr_cuttle_2':
                self.assertEqual(profile['selector']['hpMin'],.5)
                self.assertNotIn('hpMax',profile['selector'])
                self.assertEqual(profile['selector']['order'],'defense-ascending')

    def test_chain_modes_preserve_primary_budget_and_live_trait_bindings(self):
        for sid in ('skchr_leizi_2','skchr_pasngr_2'):
            cid,_,_=self.source(sid);profile,_=self.mode.compile(sid,self.skills[sid],cid,sid)
            plan=profile['plan'];self.assertEqual(plan['targets'],{'constant':1})
            self.assertEqual(plan['kind'],'chain');self.assertTrue(plan['waitForProjectile'])
            self.assertEqual(plan['hitBuffs'][0]['duration']['traitKey'],'attack@sluggish')
            self.assertEqual(plan['hitBuffs'][0]['duration']['default'],.5)
            self.assertIn('source',plan['hitBuffs'][0]['duration'])
            if sid=='skchr_leizi_2':
                self.assertEqual(plan['chainCount']['traitKey'],'attack@max_target')
                self.assertEqual(plan['chainDecay'],{'constant':1.0})
            else:
                self.assertEqual(plan['chainCount'],{'key':'attack@max_target'})
                self.assertEqual(plan['chainDecay']['traitKey'],'attack@chain.atk_scale')

    def attack_debuff_source(self):
        actor=next(n for n in self.mode.character('char_243_waaifu')['modes'][1]['roles']['_attack']
                   if n['type']==A+'MeleeAttack')
        return deepcopy(actor['fields']['_activeBuffs']),deepcopy(self.skills['skchr_waaifu_1']['levels'])

    def test_attack_debuff_full_levels_and_source_namespace(self):
        buffs,levels=self.attack_debuff_source();consumed=set()
        effect=self.compiler.compile(buffs,levels,False,consumed)[0]
        prefix='attack@waaifu_s_1[debuff].'
        self.assertEqual(effect['kind'],'attack-multiplier');self.assertEqual(effect['phase'],'after-body')
        self.assertEqual(effect['key'],buffs[0]['buffKey']);self.assertFalse(effect['independentSource'])
        self.assertEqual(effect['valueKey'],prefix+'atk');self.assertEqual(effect['durationKey'],prefix+'duration')
        self.assertEqual(consumed,{prefix+'atk',prefix+'duration'})
        self.assertTrue(effect['source']['stripBlackboardParamsWithBuffKey'])
        self.assertEqual(len(levels),10)
        for level in levels:
            bb={v['key']:v['value'] for v in level['blackboard']}
            self.assertGreaterEqual(1+bb[effect['valueKey']],.6)
            self.assertLessEqual(1+bb[effect['valueKey']],.8)

    def test_attack_debuff_prefix_is_field_driven_without_id_whitelist(self):
        buffs,levels=self.attack_debuff_source();old=buffs[0]['buffKey'];buffs[0]['buffKey']='renamed_source_buff'
        for level in levels:
            for value in level['blackboard']:value['key']=value['key'].replace('attack@'+old+'.','attack@renamed_source_buff.')
        effect=self.compiler.compile(buffs,levels,True,set())[0]
        self.assertEqual(effect['valueKey'],'attack@renamed_source_buff.atk');self.assertEqual(effect['phase'],'before-body')
        buffs[0]['stripBlackboardParamsWithBuffKey']=0
        with self.assertRaises(Rejected):self.compiler.compile(buffs,levels,False,set())
        for level in levels:
            for value in level['blackboard']:value['key']=value['key'].replace('attack@renamed_source_buff.','attack@')
        self.assertEqual(self.compiler.compile(buffs,levels,False,set())[0]['valueKey'],'attack@atk')

    def test_attack_debuff_extra_fields_and_unsupported_modifiers_reject(self):
        buffs,levels=self.attack_debuff_source()
        for change in [{'stripBlackboardParamsWithBuffKey':2},{'independentCharacterSource':1},
                       {'refreshRemainingTimeWhenStackMax':1},{'extraAction':True}]:
            changed=deepcopy(buffs);changed[0].update(change)
            with self.assertRaises(Rejected):self.compiler.compile(changed,levels,False,set())
        for change in [{'attributeType':2},{'formulaItem':1},{'fetchBaseValueFromSourceEntity':1}]:
            changed=deepcopy(buffs);changed[0]['attributes']['attributeModifiers'][0].update(change)
            with self.assertRaises(Rejected):self.compiler.compile(changed,levels,False,set())
        changed=deepcopy(buffs);changed[0]['attributes']['attributeModifiers']*=2
        with self.assertRaises(Rejected):self.compiler.compile(changed,levels,False,set())

    def test_attack_debuff_every_level_value_and_binding_are_required(self):
        buffs,levels=self.attack_debuff_source();prefix='attack@waaifu_s_1[debuff].'
        for field,value in [('atk',.1),('atk',-1.1),('atk',float('nan')),('duration',0),('duration',float('inf'))]:
            changed=deepcopy(levels)
            next(v for v in changed[-1]['blackboard'] if v['key']==prefix+field)['value']=value
            with self.assertRaises(Rejected):self.compiler.compile(buffs,changed,False,set())
        changed=deepcopy(levels);changed[-1]['blackboard']=[v for v in changed[-1]['blackboard'] if v['key']!=prefix+'atk']
        with self.assertRaises(Rejected):self.compiler.compile(buffs,changed,False,set())


if __name__=='__main__':unittest.main()
