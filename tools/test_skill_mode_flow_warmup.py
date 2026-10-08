"""Counterfactual whole-graph admission for casting-owned finite mode flows."""
from copy import deepcopy
import json
import unittest

from skill_mode_compiler import ModeCompiler,ROOT,Rejected,A,C
from skill_mode_flow_warmup import maybe_compile


class WarmupFlowContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(load('work/operator-mode-next-group.json'),load('work/client-logic/program-compilation.json'),load('work/client-logic/buff-templates.json'))
        cls.sid='skchr_zumama_3';cls.char='char_416_zumama'
        cls.skill=load('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')[cls.sid]
        cls.rows=cls.c.components(cls.sid)

    def compile(self,rows=None,skill=None,prefab=None):
        return maybe_compile(self.c,'renamed-skill',skill or self.skill,self.char,prefab or self.sid,rows or self.rows)

    def rejected(self,fn):
        with self.assertRaises(Rejected):fn()

    def mutate_template(self,key,edit):
        old=self.c.templates[key];replacement=deepcopy(old)
        for event in replacement['eventToActions']['_items']:
            edit(event['key'],event['value']['decodedActions'])
            event['value']['SerializedState']=json.dumps(event['value']['decodedActions'])
        self.c.templates[key]=replacement
        try:self.rejected(self.compile)
        finally:self.c.templates[key]=old

    def test_complete_source_all_ten_levels_and_owner_lifetimes(self):
        p,g=self.compile();self.assertEqual(p['levelCount'],10)
        self.assertEqual(g['flow']['persistentBuffIndexes'],[0])
        self.assertEqual(g['buffs'][0]['lifetime'],{'kind':'until_detach'})
        self.assertEqual({m['attribute'] for m in g['buffs'][0]['modifiers']},
            {'atk','def','block_cnt','hp_recovery_per_sec_by_max_hp_ratio'})
        warm,mode=g['flow']['stages']
        self.assertEqual(warm['buffIndexes'],[])
        self.assertEqual(warm['completion'],{'kind':'animation-finished','duration':{'constant':1.5}})
        self.assertEqual(warm['castingImmunities'],['stun','frozen','silence'])
        self.assertEqual(mode['mode']['modeIndex'],2)
        self.assertEqual(mode['mode']['plan']['damageType'],'phys')
        self.assertEqual(g['flow']['finalizer']['triggerStage'],1)
        self.assertEqual(g['flow']['finalizer']['buffs'][0]['duration'],{'key':'stun'})
        self.assertEqual([level['duration'] for level in self.skill['levels']],
                         [30,30,30,31,31,31,32,33,34,35])

    def test_skill_prefab_node_and_buff_identity_do_not_admit(self):
        rows=deepcopy(self.rows);skill=deepcopy(self.skill)
        aliases={r['node_id']:str(1000+i) for i,r in enumerate(rows)}
        for r in rows:
            r['node_id']=aliases[r['node_id']]
            for ref in r['fields'].get('_abilities',[]):ref['m_PathID']=aliases[ref['m_PathID']]
        for level in skill['levels']:level['prefabId']='new-source-identity'
        p,g=self.compile(rows,skill,'new-source-identity')
        self.assertEqual(p['prefabId'],'new-source-identity');self.assertEqual(g['flow']['stages'][0]['id'],aliases[self.rows[1]['node_id']])

    def test_unknown_fields_controls_and_siblings_reject(self):
        for typ,key,value in [(A+'AbilitySequenceGroup','_enableLoop',1),
                (A+'AnimatedActionToOwnerAbility','_timeMode',0),
                (C+'CastSkill','_rangeIdModeIndex',2),
                (A+'ActiveBuffAbility','_updateLifetimeWhenSpellStart',1),
                (A+'BuffDuringCasting','unknown_gameplay',False)]:
            rows=deepcopy(self.rows);next(r for r in rows if r['type']==typ)['fields'][key]=value
            self.rejected(lambda:self.compile(rows))
        rows=deepcopy(self.rows);rows.append(deepcopy(rows[0]));self.rejected(lambda:self.compile(rows))

    def test_child_order_owner_and_immunity_are_not_guessed(self):
        for edit in ('order','owner','immunity'):
            rows=deepcopy(self.rows)
            if edit=='order':next(r for r in rows if r['type']==A+'AbilitySequenceGroup')['fields']['_abilities'].reverse()
            elif edit=='owner':next(r for r in rows if r['type']==A+'BuffDuringCasting')['fields']['m_GameObject']['m_PathID']='different'
            else:next(r for r in rows if r['type']==A+'BuffDuringCasting')['fields']['_buffs'][0]['attributes']['abnormalImmunes']=[0,16,25]
            self.rejected(lambda:self.compile(rows))

    def test_nested_create_lifetime_extra_actions_and_cleanup_reject(self):
        self.mutate_template('zumama_s_3[buff]',lambda event,nodes:nodes[0]['_buff'].update(lifeTimeType='LIMITED'))
        self.mutate_template('zumama_s_3[buff]',lambda event,nodes:nodes.append({'$type':'HiddenAction'}))
        self.mutate_template('zumama_s_3',lambda event,nodes:nodes[-1].update(_buffKey='wrong-owner-buff') if event==1 else None)
        self.mutate_template('zumama_s_3',lambda event,nodes:nodes[2].update(_buffOwner='MODIFIER_SOURCE') if event==1 else None)

    def test_extra_late_level_fields_invalid_parameters_and_range_reject(self):
        for edit in ('extra','negative','range','duration','prefab'):
            skill=deepcopy(self.skill);lv=skill['levels'][-1]
            if edit=='extra':lv['blackboard'].append({'key':'unknown','value':1,'valueStr':None})
            elif edit=='negative':next(b for b in lv['blackboard'] if b['key']=='hp_recovery_per_sec_by_max_hp_ratio')['value']=-1
            elif edit=='range':lv['rangeId']='x-1'
            elif edit=='duration':lv['duration']=0
            else:lv['prefabId']='another'
            self.rejected(lambda:self.compile(skill=skill))

    def test_selected_mode_is_still_fully_compiled(self):
        character=self.c.character(self.char);old=character['modes'][2]
        for edit in ('general','extra-attack'):
            changed=deepcopy(old)
            if edit=='general':changed['fields']['_generalAbilities'].append({'m_FileID':0,'m_PathID':'777'})
            else:changed['roles']['_attack'].append({'node_id':'777','type':A+'HiddenExtraAction','fields':{}})
            character['modes'][2]=changed
            try:self.rejected(self.compile)
            finally:character['modes'][2]=old


if __name__=='__main__':unittest.main()
