"""Strict complete PassiveSkill admission; no candidate-ID execution list."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from skill_mode_compiler import ModeCompiler,Rejected,C,A
from skill_mode_passive import maybe_compile

ROOT=Path(__file__).resolve().parents[1]


class PassiveSkillContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.source=read('work/skill-passive-source-contract.json')['members']
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.owners={sid:next(cid for cid,c in cls.c.characters.items() if any(s['skillId']==sid for s in c['skills'])) for sid in cls.source}

    def compile(self,sid='skchr_zumama_1',rows=None,skill=None,prefab=None,output_id=None):
        return maybe_compile(self.c,output_id or sid,skill or self.skills[sid],self.owners[sid],prefab or sid,
            self.source[sid]['components'] if rows is None else rows)

    def rejected(self,callback,reason=None):
        with self.assertRaises(Rejected) as caught:callback()
        if reason:self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_both_complete_bodies_twenty_levels(self):
        outputs=[self.compile(sid) for sid in self.source]
        self.assertEqual(sum(p['levelCount'] for p,_ in outputs),20)
        for p,program in outputs:
            self.assertEqual(p['activation'],'passive');self.assertEqual(p['capability'],'passive-skill')
            self.assertEqual(program['controller']['kind'],'passive_skill')
            self.assertFalse(program['controller']['emit_skill_started'])
        owner=self.compile()[1]['buffs'][0]
        self.assertEqual(owner['lifetime'],{'kind':'until_detach'})
        self.assertEqual({m['attribute'] for m in owner['modifiers']},{'atk','def'})
        hit=self.compile('skchr_mantic_1')[0]['plan']['hitBuffs'][0]
        self.assertEqual(hit['valueKey'],'move_speed');self.assertEqual(hit['durationKey'],'duration')
        self.assertEqual(hit['source']['blackboardNamespace'],'')

    def test_same_structure_changed_skill_prefab_and_component_ids(self):
        sid='skchr_zumama_1';rows=deepcopy(self.source[sid]['components']);skill=deepcopy(self.skills[sid])
        for i,r in enumerate(rows):r['node_id']=str(8000+i);r['fields']['m_GameObject']['m_PathID']='8999'
        for lv in skill['levels']:lv['prefabId']='synthetic_passive'
        p,program=self.compile(sid,rows,skill,'synthetic_passive','synthetic_skill')
        self.assertEqual(p['prefabId'],'synthetic_passive');self.assertTrue(program['buffs'])

    def test_unknown_fields_and_extra_components_reject(self):
        rows=deepcopy(self.source['skchr_zumama_1']['components']);rows[0]['fields']['_newGameplayFlag']=0
        self.rejected(lambda:self.compile(rows=rows),'unknown-or-missing-fields')
        rows=deepcopy(self.source['skchr_zumama_1']['components']);rows.append(dict(type=A+'AdditionalActor',fields={}))
        self.rejected(lambda:self.compile(rows=rows),'unsupported-passive-companions')

    def test_owner_identity_disabled_and_lifecycle_controls(self):
        for edit in ('different','external','null','disabled','deadOwner','detach'):
            rows=deepcopy(self.source['skchr_zumama_1']['components'])
            if edit=='different':rows[1]['fields']['m_GameObject']['m_PathID']='456'
            elif edit in ('external','null'):
                for r in rows:r['fields']['m_GameObject']={'m_FileID':1 if edit=='external' else 0,'m_PathID':'0' if edit=='null' else '99'}
            elif edit=='disabled':rows[1]['fields']['m_Enabled']=0
            elif edit=='deadOwner':rows[1]['fields']['_ignoreIfOwnerDead']=1
            else:rows[1]['fields']['_interruptAbilityOnDetach']=1
            self.rejected(lambda:self.compile(rows=rows))

    def test_owner_buff_requires_infinity_and_complete_flags(self):
        for field,value in [('lifeTimeType',1),('isSilenceable',1),('triggerLifeType',2)]:
            rows=deepcopy(self.source['skchr_zumama_1']['components']);rows[1]['fields']['_buffs'][0][field]=value
            self.rejected(lambda:self.compile(rows=rows))

    def test_mode_routing_must_be_consistent_and_typed(self):
        for key,value in [('_defaultModeIndex','1'),('_defaultModeIndex',True),('_rangeIdModeIndex',0),('_attackBlackboardModeIndex',2)]:
            rows=deepcopy(self.source['skchr_mantic_1']['components']);rows[0]['fields'][key]=value
            self.rejected(lambda:self.compile('skchr_mantic_1',rows=rows),'unsupported-passive-mode-routing')

    def test_empty_or_wrong_controller_levels_reject_cleanly(self):
        skill=deepcopy(self.skills['skchr_zumama_1']);skill['levels']=[]
        self.rejected(lambda:self.compile(skill=skill),'invalid-passive-levels')
        for key,value in [('skillType','MANUAL'),('duration',3),('prefabId','wrong'),('rangeId','1-1')]:
            skill=deepcopy(self.skills['skchr_zumama_1']);skill['levels'][4][key]=value
            self.rejected(lambda:self.compile(skill=skill),'invalid-passive-level-controller')
        skill=deepcopy(self.skills['skchr_zumama_1']);skill['levels'][8]['spData']['spCost']=1
        self.rejected(lambda:self.compile(skill=skill),'invalid-passive-level-controller')

    def test_all_level_parameters_must_be_numeric_unique_and_consumed(self):
        for edit in ('missing','duplicate','string','nonfinite','extra'):
            skill=deepcopy(self.skills['skchr_zumama_1']);bb=skill['levels'][5]['blackboard']
            if edit=='missing':bb.pop()
            elif edit=='duplicate':bb.append(deepcopy(bb[0]))
            elif edit=='string':bb[0]['valueStr']='unhandled'
            elif edit=='nonfinite':bb[0]['value']=float('nan')
            else:bb.append({'key':'unhandled','value':1,'valueStr':None})
            self.rejected(lambda:self.compile(skill=skill),'invalid-passive-blackboard')

    def test_attachment_requires_mode_and_plain_source_namespace(self):
        sid='skchr_mantic_1';rows=deepcopy(self.source[sid]['components'])
        for key in ('_defaultModeIndex','_attackBlackboardModeIndex','_rangeIdModeIndex'):rows[0]['fields'][key]=-1
        self.rejected(lambda:self.compile(sid,rows=rows),'passive-attachment-without-source-mode')
        skill=deepcopy(self.skills[sid])
        for lv in skill['levels']:
            for b in lv['blackboard']:b['key']='attack@'+b['key']
        self.rejected(lambda:self.compile(sid,skill=skill),'unsupported-passive-hit-buff')

    def test_hit_lifetime_and_unused_namespace_cannot_be_ignored(self):
        sid='skchr_mantic_1'
        for field,value in [('lifeTimeType',2),('stripBlackboardParamsWithBuffKey',1),('_unsupported',0)]:
            rows=deepcopy(self.source[sid]['components']);rows[1]['fields']['_additiveActiveBuffs'][0][field]=value
            self.rejected(lambda:self.compile(sid,rows=rows),'unsupported-passive-hit-buff')
        skill=deepcopy(self.skills[sid]);skill['levels'][6]['blackboard'][1]['value']=0
        self.rejected(lambda:self.compile(sid,skill=skill),'unsupported-passive-hit-buff')


if __name__=='__main__':unittest.main()
