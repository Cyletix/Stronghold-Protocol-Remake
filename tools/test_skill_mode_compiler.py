"""Source-graph and discovery boundaries for the garrison mode compiler."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from build_skill_mode_data import build
from garrison_skill_scope import load_scope
from skill_mode_compiler import ModeCompiler, Rejected, C, A

ROOT=Path(__file__).resolve().parents[1]


class CompleteModeContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
        cls.reference=read('work/operator-mode-next-group.json')
        cls.graphs=read('work/client-logic/program-compilation.json')
        cls.templates=read('work/client-logic/buff-templates.json')
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.compiler=ModeCompiler(cls.reference,cls.graphs,cls.templates)
        cls.compiled,cls.report=build()

    def compile(self,sid,rows=None,character=None,skill=None):
        compiler=self.compiler
        original_components,original_character=compiler.components,compiler.character
        if rows is not None:compiler.components=lambda _:rows
        if character is not None:compiler.character=lambda _:character
        try:
            owner=self.compiled['profiles'][sid]['charIds'][0]
            return compiler.compile(sid,skill or self.skills[sid],owner,sid)
        finally:compiler.components,compiler.character=original_components,original_character

    def rejected(self,reason,call):
        with self.assertRaises(Rejected) as caught:call()
        self.assertEqual(caught.exception.record['reason'],reason,caught.exception.record)

    def test_scope_is_discovery_and_preserves_old_reviewed_contracts(self):
        scope=load_scope();accepted=set(self.compiled['profiles']);rejected=set(self.report['rejections'])
        self.assertEqual(accepted|rejected,set(scope['skillIds']))
        self.assertFalse(accepted&rejected)
        self.assertTrue({r['skillId'] for r in self.reference['rows']}<=accepted)
        self.assertGreater(len(accepted),len(self.reference['rows']))
        for profile in self.compiled['profiles'].values():
            self.assertTrue(set(profile['charIds'])<=set(scope['charIds']))

    def test_unknown_skill_companion_rejects_whole_skill(self):
        sid='skchr_snakek_2';rows=deepcopy(self.compiler.components(sid))
        rows.append(dict(type=A+'UnreviewedDamage',fields={},node_id='new'))
        self.rejected('unsupported-skill-companions',lambda:self.compile(sid,rows=rows))

    def test_eventful_channel_is_not_silently_cosmetic(self):
        sid='skchr_utage_1';rows=deepcopy(self.compiler.components(sid))
        next(n['fields'] for n in rows if n['type']==A+'ThreePartChannelingAnimation')['_fireAttackFinishEvent']=1
        self.rejected('eventful-or-delayed-channeling',lambda:self.compile(sid,rows=rows))

    def test_unknown_buff_field_rejects_whole_skill(self):
        sid='skchr_vigna_1';rows=deepcopy(self.compiler.components(sid))
        next(n['fields'] for n in rows if n['type']==A+'ActiveBuffAbility')['_buffs'][0]['newCondition']=1
        self.rejected('unknown-or-missing-fields',lambda:self.compile(sid,rows=rows))

    def test_unconsumed_parameter_is_not_dropped(self):
        sid='skchr_vigna_1';skill=deepcopy(self.skills[sid])
        for level in skill['levels']:level['blackboard'].append(dict(key='extra_damage',value=2))
        self.rejected('unconsumed-or-missing-blackboard',lambda:self.compile(sid,skill=skill))

    def test_only_participating_mode_graph_controls_acceptance(self):
        sid='skchr_vigna_1';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));other=deepcopy(character['modes'][0])
        other['index']=len(character['modes']);other['companions'].append(dict(type='Unknown',node_id='extra',fields={}))
        character['modes'].append(other)
        self.compile(sid,character=character)
        index=self.compiled['profiles'][sid]['modeIndex']
        character['modes'][index]['companions'].append(dict(type='Unknown',node_id='extra',fields={}))
        self.rejected('mode-root-extra-companions',lambda:self.compile(sid,character=character))

    def test_attack_buff_cannot_hide_in_otherwise_supported_actor(self):
        sid='skchr_vigna_1';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));index=self.compiled['profiles'][sid]['modeIndex']
        actor=next(n for n in character['modes'][index]['roles']['_attack'] if n['type']==A+'MeleeAttack')
        actor['fields']['_activeBuffs']=[dict(templateKey='damage')]
        self.rejected('unsupported-mode-hit-buff',lambda:self.compile(sid,character=character))

    def test_disarmed_mode_cannot_change_gameplay_graph(self):
        sid='skchr_snakek_2';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));index=self.compiled['profiles'][sid]['modeIndex']
        actor=next(n for n in character['modes'][index]['roles']['_attack'] if n['type']==A+'MeleeAttack')
        actor['fields']['_damageType']=2
        self.rejected('disarmed-mode-changes-base-role-graph',lambda:self.compile(sid,character=character))

    def test_mixed_max_hp_ratio_policy_is_explicit(self):
        sid='skchr_utage_1';rows=deepcopy(self.compiler.components(sid))
        attrs=next(n['fields'] for n in rows if n['type']==A+'ActiveBuffAbility')['_buffs'][0]['attributes']
        attrs['attributeModifiers'].append(dict(attributeType=0,formulaItem=1,value=.5,loadFromBlackboard=0,fetchBaseValueFromSourceEntity=0))
        self.rejected('mixed-max-hp-and-ratio-recovery',lambda:self.compile(sid,rows=rows))

    def test_infinite_lifetime_must_agree_with_all_levels(self):
        sid='skchr_huang_2';skill=deepcopy(self.skills[sid]);skill['levels'][-1]['duration']=30
        self.rejected('unsupported-level-controller',lambda:self.compile(sid,skill=skill))

    def test_source_target_budget_must_be_integral(self):
        sid='skchr_svrash_3';skill=deepcopy(self.skills[sid])
        next(b for b in skill['levels'][-1]['blackboard'] if b['key']=='attack@max_target')['value']=2.5
        self.rejected('invalid-level-attack-plan',lambda:self.compile(sid,skill=skill))

    def test_multiple_self_buffs_keep_independent_complete_instances(self):
        profile,program=self.compile('skchr_bpipe_3')
        self.assertEqual(len(program['buffs']),2)
        self.assertNotEqual(program['buffs'][0]['id'],program['buffs'][1]['id'])
        self.assertEqual(profile['plan']['hits'],3)
        self.assertEqual(program['buffs'][0]['lifetime'],program['buffs'][1]['lifetime'])

    def test_multiple_mode_actions_are_rejected(self):
        sid='skchr_bpipe_3';rows=deepcopy(self.compiler.components(sid))
        buffs=next(n['fields']['_buffs'] for n in rows if n['type']==A+'ActiveBuffAbility')
        buffs[1]=deepcopy(buffs[0]);buffs[1]['buffKey']='second-mode-switch'
        self.rejected('required-single-mode-buff',lambda:self.compile(sid,rows=rows))

    def test_secondary_buff_unknown_semantics_cannot_be_omitted(self):
        sid='skchr_bpipe_3';rows=deepcopy(self.compiler.components(sid))
        buffs=next(n['fields']['_buffs'] for n in rows if n['type']==A+'ActiveBuffAbility')
        buffs[1]['templateKey']='unreviewed-on-hit'
        self.rejected('unsupported-buff-template',lambda:self.compile(sid,rows=rows))

    def test_mixed_mode_lifetimes_do_not_leave_stale_modes(self):
        sid='skchr_bpipe_3';rows=deepcopy(self.compiler.components(sid))
        buffs=next(n['fields']['_buffs'] for n in rows if n['type']==A+'ActiveBuffAbility')
        buffs[1]['lifeTimeType']=2
        self.rejected('mixed-mode-buff-lifetimes',lambda:self.compile(sid,rows=rows))

    def test_serialized_split_damage_is_not_plain_repetition(self):
        sid='skchr_bpipe_3';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));index=self.compiled['profiles'][sid]['modeIndex']
        actor=next(n for n in character['modes'][index]['roles']['_attack'] if n['type']==A+'MultiMeleeAttack')
        actor['fields']['_splitDamage']=1
        self.rejected('unsupported-component-contract',lambda:self.compile(sid,character=character))

    def test_dynamic_repeat_parameter_requires_explicit_total_description(self):
        sid='skchr_angel_2';skill=deepcopy(self.skills[sid]);skill['levels'][0]['description']='Unproven count semantics'
        self.rejected('repeat-parameter-without-description-contract',lambda:self.compile(sid,skill=skill))

    def test_source_repeat_budget_must_be_integral(self):
        sid='skchr_angel_2';skill=deepcopy(self.skills[sid])
        next(b for b in skill['levels'][-1]['blackboard'] if b['key']=='attack@times')['value']=2.5
        self.rejected('invalid-level-attack-plan',lambda:self.compile(sid,skill=skill))

    def test_target_timing_three_is_first_spell_but_two_requires_retarget(self):
        sid='skchr_archet_3';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));index=self.compiled['profiles'][sid]['modeIndex']
        actor=next(n for n in character['modes'][index]['roles']['_attack'] if n['type']==A+'MultiRangedAttack')
        self.assertEqual(actor['fields']['_selectTargetTiming'],3)
        self.compile(sid,character=character)
        actor['fields']['_selectTargetTiming']=2
        self.rejected('unsupported-attack-control',lambda:self.compile(sid,character=character))

    def test_range_attribute_must_be_additive_nonnegative_integer(self):
        sid='skchr_archet_3';rows=deepcopy(self.compiler.components(sid))
        modifier=next(m for n in rows if n['type']==A+'ActiveBuffAbility' for b in n['fields']['_buffs']
                      for m in b['attributes']['attributeModifiers'] if m['attributeType']==15)
        modifier['formulaItem']=1
        self.rejected('unsupported-range-extension-formula',lambda:self.compile(sid,rows=rows))
        for value in (-1,.5):
            skill=deepcopy(self.skills[sid]);next(b for b in skill['levels'][0]['blackboard'] if b['key']=='ability_range_forward_extend')['value']=value
            self.rejected('invalid-range-extension',lambda:self.compile(sid,skill=skill))

    def test_range_attribute_cannot_override_nonextendable_selector(self):
        sid='skchr_archet_3';cid=self.compiled['profiles'][sid]['charIds'][0]
        character=deepcopy(self.compiler.character(cid));index=self.compiled['profiles'][sid]['modeIndex']
        modifier=next(n for n in character['modes'][index]['roles']['_attackTrigger'] if n['type']==C+'AutoLoadBoxRange')
        modifier['fields']['_extendable']=0
        self.rejected('range-modifier-has-nonextendable-selector',lambda:self.compile(sid,character=character))


if __name__=='__main__':unittest.main()
