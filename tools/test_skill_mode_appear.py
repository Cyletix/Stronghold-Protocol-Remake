"""Complete deployment family admission and source-parameter boundaries."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from build_skill_mode_data import build
from skill_mode_compiler import ModeCompiler, Rejected, C, A

ROOT=Path(__file__).resolve().parents[1]


class AppearanceContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
        cls.c=ModeCompiler(read('work/operator-mode-next-group.json'),read('work/client-logic/program-compilation.json'),
                           read('work/client-logic/buff-templates.json'))
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.data,cls.report=build()

    def compile(self,sid,rows=None,skill=None):
        profile=self.data['profiles'][sid];old=self.c.components
        if rows is not None:self.c.components=lambda _:rows
        try:return self.c.compile(sid,skill or self.skills[sid],profile['charIds'][0],profile['prefabId'])
        finally:self.c.components=old

    def rows(self,sid):return deepcopy(self.c.components(self.data['profiles'][sid]['prefabId']))
    def rejects(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_complete_source_family_discovery(self):
        ids={sid for sid,p in self.data['profiles'].items() if p.get('activation')=='deploy'}
        expected={'skchr_skadi_2','skchr_wildmn_1','skchr_acspec_2','skchr_gravel_1','skchr_gravel_2','skchr_waaifu_1','skchr_utage_2'}
        self.assertTrue(expected<=ids)
        self.assertEqual(sum(self.data['profiles'][s]['levelCount'] for s in expected),70)
        self.assertTrue({'skcom_born_up[1]','skcom_born_up[2]','skcom_born_up[3]'}<=ids)
        self.assertEqual(sum(self.data['profiles'][s]['levelCount'] for s in ids),97)

    def test_unknown_companion_is_not_silently_ignored(self):
        sid='skchr_skadi_2';rows=self.rows(sid);rows.append(dict(type=A+'UnreviewedDamage',fields={},node_id='extra'))
        self.rejects('unsupported-appearance-companions',lambda:self.compile(sid,rows=rows))

    def test_source_deployment_phase_and_inherited_mode(self):
        for sid in ('skchr_gravel_1','skchr_gravel_2','skchr_acspec_2'):
            profile,program=self.compile(sid)
            self.assertEqual(profile['action'],'inherit');self.assertIsNone(profile['plan']);self.assertIsNone(profile['modeIndex'])
            self.assertEqual(program['controller']['cast_on_locate'],sid=='skchr_acspec_2')
            self.assertFalse(program['controller']['emit_skill_started'])

    def test_blackboard_duration_overrides_negative_level_sentinel(self):
        profile,program=self.compile('skchr_skadi_2')
        self.assertEqual(program['buffs'][0]['lifetime']['duration'],{'key':'duration'})
        self.assertTrue(all(l['duration']==-1 for l in self.skills['skchr_skadi_2']['levels']))
        skill=deepcopy(self.skills['skchr_skadi_2'])
        next(b for b in skill['levels'][0]['blackboard'] if b['key']=='duration')['value']=0
        self.rejects('invalid-appearance-level-controller',lambda:self.compile('skchr_skadi_2',skill=skill))

    def test_non_passive_or_sp_consuming_controller_rejects(self):
        for key,value in (('spCost',1),('initSp',1)):
            skill=deepcopy(self.skills['skchr_skadi_2']);skill['levels'][0]['spData'][key]=value
            self.rejects('invalid-appearance-level-controller',lambda:self.compile('skchr_skadi_2',skill=skill))

    def test_prefixed_self_and_hit_parameters_are_both_consumed(self):
        profile,program=self.compile('skchr_waaifu_1')
        self.assertEqual(program['buffs'][0]['modifiers'][0]['value'],{'key':'waaifu_s_1[self].atk'})
        effect=profile['plan']['hitBuffs'][0]
        self.assertEqual(effect['kind'],'attack-multiplier')
        self.assertEqual(effect['valueKey'],'attack@waaifu_s_1[debuff].atk')
        self.assertEqual(effect['durationKey'],'attack@waaifu_s_1[debuff].duration')

    def test_passive_redeploy_modifier_does_not_extend_active_buff(self):
        _,program=self.compile('skchr_utage_2')
        self.assertEqual(program['passive_modifiers'][0]['value'],{'key':'respawn_time'})
        self.assertTrue(all(b['lifetime']['kind']=='timed' for b in program['buffs']))
        self.assertEqual(sum(bool(b.get('on_attach')) for b in program['buffs']),1)

    def test_missing_or_changed_shield_capture_rejects(self):
        sid='skchr_gravel_2';rows=self.rows(sid)
        self.rejects('appearance-shield-missing-dynamic-capture',lambda:self.compile(sid,rows=[r for r in rows if r['type']!=A+'SetAttributeAsDynamicVar']))
        next(r['fields'] for r in rows if r['type']==A+'SetAttributeAsDynamicVar')['_scaleVar']='atk'
        self.rejects('unsupported-field',lambda:self.compile(sid,rows=rows))

    def test_unused_dynamic_capture_rejects(self):
        sid='skchr_gravel_1';rows=self.rows(sid)
        rows.append(next(r for r in self.rows('skchr_gravel_2') if r['type']==A+'SetAttributeAsDynamicVar'))
        self.rejects('unused-appearance-dynamic-capture',lambda:self.compile(sid,rows=rows))

    def test_full_special_template_required(self):
        old=self.c.templates['def_atten'];changed=deepcopy(old);changed['newDamage']=1;self.c.templates['def_atten']=changed
        try:self.rejects('unsupported-appearance-buff-template',lambda:self.compile('skchr_gravel_1'))
        finally:self.c.templates['def_atten']=old

    def test_shield_ratio_is_not_limited_to_current_named_member(self):
        sid='skchr_gravel_2';skill=deepcopy(self.skills[sid])
        for level in skill['levels']:next(b for b in level['blackboard'] if b['key']=='hp_ratio')['value']=3
        self.compile(sid,skill=skill)
        next(b for b in skill['levels'][0]['blackboard'] if b['key']=='hp_ratio')['value']=0
        self.rejects('invalid-appearance-shield-ratio',lambda:self.compile(sid,skill=skill))

    def test_self_damage_and_unknown_parameter_boundaries(self):
        sid='skchr_utage_2';skill=deepcopy(self.skills[sid])
        next(b for b in skill['levels'][0]['blackboard'] if b['key']=='hp_ratio')['value']=1.01
        self.rejects('invalid-appearance-hp-cost',lambda:self.compile(sid,skill=skill))
        skill=deepcopy(self.skills[sid])
        for level in skill['levels']:level['blackboard'].append(dict(key='new_action',value=1))
        self.rejects('unconsumed-appearance-blackboard',lambda:self.compile(sid,skill=skill))


if __name__=='__main__':unittest.main()
