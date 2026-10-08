"""Whole-graph admission and all-level rejection guards for source toggles."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from skill_mode_compiler import ModeCompiler,Rejected,C,A
from skill_mode_toggle import maybe_compile

ROOT=Path(__file__).resolve().parents[1]


class ToggleSkillContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.members={'skchr_f12yin_2':'char_264_f12yin','skchr_svrash_2':'char_172_svrash'}
        cls.rows={sid:cls.c.components(sid) for sid in cls.members}

    def compile(self,sid='skchr_f12yin_2',rows=None,skill=None,prefab=None,output_id=None):
        return maybe_compile(self.c,output_id or sid,self.skills[sid] if skill is None else skill,self.members[sid],
            prefab or sid,self.rows[sid] if rows is None else rows)

    def rejected(self,callback,reason=None):
        with self.assertRaises(Rejected) as caught:callback()
        if reason:self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_two_complete_members_twenty_levels(self):
        for sid,cid in self.members.items():
            profile,program=self.c.compile(sid,self.skills[sid],cid,sid)
            self.assertEqual(profile['levelCount'],10)
            self.assertEqual(profile['activation'],'toggle')
            self.assertEqual(program['controller']['toggle'],dict(onModeIndex=1,offModeIndex=0,restartFSM=False,useAbilityHandleToggle=False))
            self.assertEqual({b['lifetime']['kind'] for b in program['buffs']},{'until_detach'})
            self.assertEqual(profile['lifetime'],{'kind':'until_toggle'})
        mountain,_=self.compile();silver,_=self.compile('skchr_svrash_2')
        self.assertEqual(mountain['plan']['kind'],'rangeAll');self.assertTrue(mountain['selector']['blockCountLimit'])
        self.assertEqual(silver['plan']['kind'],'single');self.assertFalse(silver['selector']['blockCountLimit'])

    def test_source_equivalent_renamed_members_admitted(self):
        skill=deepcopy(self.skills['skchr_f12yin_2']);rows=deepcopy(self.rows['skchr_f12yin_2'])
        for lv in skill['levels']:lv['prefabId']='synthetic_toggle'
        for i,r in enumerate(rows):r['node_id']=str(7000+i);r['fields']['m_GameObject']['m_PathID']='7100'
        p,_=self.compile(rows=rows,skill=skill,prefab='synthetic_toggle',output_id='another_skill')
        self.assertEqual(p['prefabId'],'synthetic_toggle')

    def test_additional_actor_unknown_fields_and_aliases_reject(self):
        for change in ('extra','unknown','alias','duplicate'):
            rows=deepcopy(self.rows['skchr_f12yin_2'])
            if change=='extra':rows.append(dict(node_id='99',type=A+'ExtraAction',fields={}))
            elif change=='unknown':rows[0]['fields']['_newMechanic']=0
            elif change=='alias':next(r for r in rows if r['type']==A+'PassiveBuffAbility')['fields']['_metadata']['namedAsAlias']='hidden'
            else:rows[1]['node_id']=rows[0]['node_id']
            self.rejected(lambda:self.compile(rows=rows))

    def test_controller_switches_and_ownership_are_complete(self):
        for field,value in [('_switchToMode',True),('_switchToMode',0),('_rangeIdModeIndex',2),
                ('_switchToModeDown',2),('_useAbilityHandleToggle',1),('_restartFSM',1),('_playSkillBeginAnim',1),
                ('_allowSpRecoveryWhenAffecting',1),('_extraAbilities',[{'m_FileID':0,'m_PathID':'42'}])]:
            rows=deepcopy(self.rows['skchr_f12yin_2']);next(r for r in rows if r['type']==C+'ToggleSkill')['fields'][field]=value
            self.rejected(lambda:self.compile(rows=rows))
        rows=deepcopy(self.rows['skchr_f12yin_2']);rows[1]['fields']['m_GameObject']['m_PathID']='8000'
        self.rejected(lambda:self.compile(rows=rows),'toggle-owner-mismatch')

    def test_all_levels_have_same_complete_numeric_blackboard(self):
        for change in ('extra','missing','string','nonfinite','duplicate'):
            skill=deepcopy(self.skills['skchr_f12yin_2']);bb=skill['levels'][9]['blackboard']
            if change=='extra':bb.append(dict(key='hidden',value=2,valueStr=None))
            elif change=='missing':bb.pop()
            elif change=='string':bb[0]['valueStr']='unknown'
            elif change=='nonfinite':bb[0]['value']=float('nan')
            else:bb.append(deepcopy(bb[0]))
            self.rejected(lambda:self.compile(skill=skill),'invalid-toggle-blackboard')
        skill=deepcopy(self.skills['skchr_f12yin_2'])
        for lv in skill['levels']:lv['blackboard'].append(dict(key='unknown',value=1,valueStr=None))
        self.rejected(lambda:self.compile(skill=skill),'unconsumed-toggle-blackboard')

    def test_level_cast_range_cost_and_lifetime_reject_changes(self):
        for field,value in [('skillType','AUTO'),('duration',10),('durationType','AMMO'),('rangeId',None),('prefabId','wrong')]:
            skill=deepcopy(self.skills['skchr_f12yin_2']);skill['levels'][7][field]=value
            self.rejected(lambda:self.compile(skill=skill),'invalid-toggle-level-controller')
        for field,value in [('spType','INCREASE_WHEN_ATTACK'),('spCost',0),('maxChargeTime',2),('increment',2),('initSp',99)]:
            skill=deepcopy(self.skills['skchr_f12yin_2']);skill['levels'][8]['spData'][field]=value
            self.rejected(lambda:self.compile(skill=skill),'invalid-toggle-level-controller')

    def test_buffs_cannot_hide_status_or_timed_owners(self):
        for field,value in [('templateKey','poison'),('lifeTimeType',1),('isSilenceable',1),('triggerLifeType',2)]:
            rows=deepcopy(self.rows['skchr_f12yin_2']);body=next(r for r in rows if r['type']==A+'PassiveBuffAbility')
            body['fields']['_buffs'][0][field]=value
            self.rejected(lambda:self.compile(rows=rows))
        for key,value in [('block_cnt',1.5),('hp_recovery_per_sec_by_max_hp_ratio',-.1),('def',-1.1)]:
            skill=deepcopy(self.skills['skchr_f12yin_2']);next(b for b in skill['levels'][9]['blackboard'] if b['key']==key)['value']=value
            self.rejected(lambda:self.compile(skill=skill))

    def test_complete_selected_mode_must_not_gain_an_extra_actor(self):
        cid=self.members['skchr_f12yin_2'];original=self.c.character(cid)
        changed=deepcopy(original);changed['modes'][1]['roles']['_attack'].append(dict(node_id='777',type=A+'HiddenAction',fields={}))
        self.c.character_cache[cid]=changed
        try:self.rejected(lambda:self.compile())
        finally:self.c.character_cache[cid]=original


if __name__=='__main__':unittest.main()
