"""Focused validation of the isolated aura IR; not a runtime completion test."""
from copy import copy, deepcopy
import json
from pathlib import Path
import unittest

from skill_aura_compiler import AuraCompiler, AUDIT_IDS
from skill_mode_compiler import ModeCompiler, Rejected

ROOT=Path(__file__).resolve().parents[1]


class AuraContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
        cls.graphs=read('work/client-logic/program-compilation.json')
        cls.skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
        cls.database=read('data/ArknightsGameData/zh_CN/gamedata/buff_table.json')
        cls.mode=ModeCompiler(read('work/operator-mode-next-group.json'),cls.graphs,read('work/client-logic/buff-templates.json'))
        cls.compiler=AuraCompiler(cls.mode,cls.database)

    def source(self,sid):
        return deepcopy(self.graphs['rejections'][sid]['components']),deepcopy(self.skills[sid]['levels'])

    def test_five_aura_layers_preserve_complete_target_and_ownership_contracts(self):
        profiles={sid:self.compiler.compile(*self.source(sid)) for sid in AUDIT_IDS}
        first=profiles['skchr_slbell_1'];second=profiles['skchr_slbell_2']
        self.assertEqual(first['selection']['side'],'enemy')
        self.assertTrue(first['membership']['removeOnLeave'])
        self.assertTrue(first['buffs'][0]['stacking']['independentSource'])
        self.assertEqual(first['buffs'][0]['modifiers'][0]['value'],{'key':'attack_speed'})
        self.assertEqual([m['attribute'] for m in second['buffs'][0]['modifiers']],['def','magic_resistance'])
        ceylon=profiles['skchr_ceylon_2']
        self.assertEqual(ceylon['controller']['kind'],'attach-or-detach')
        self.assertEqual(ceylon['selection']['side'],'ally')
        stack=ceylon['buffs'][0]['stacking']
        self.assertEqual(stack['overrideKey'],'status_resistance[bonus]')
        self.assertEqual(stack['priorityKeys'],['one_minus_status_resistance'])
        pith=profiles['skchr_accast_2']
        self.assertIsNone(pith['mode']);self.assertEqual(pith['range']['kind'],'global')
        self.assertEqual(pith['selection']['professionMask'],32)
        self.assertTrue(pith['buffs'][0]['stacking']['disableOverride'])
        raid=profiles['skchr_acsupo_3']
        self.assertEqual(raid['buffs'][0]['id'],'weak')
        self.assertEqual(raid['buffs'][0]['referenceKey'],'weak[inf]')
        self.assertEqual(raid['buffs'][0]['effects'][0]['damageMask'],'ANY_ATTACK_EXCEPT_ELEMENT')
        self.assertEqual(raid['buffs'][1]['modifiers'][0]['evaluation'],'raw < 0 ? 1 + raw : raw')
        self.assertEqual(raid['remainingKeys'],['talent_scale'])

    def test_wrapper_references_and_extra_gameplay_nodes_reject(self):
        rows,levels=self.source('skchr_slbell_1')
        for modify in ['reference','extra','repeated-id']:
            changed=deepcopy(rows)
            if modify=='reference':
                wrapper=next(n for n in changed if n['type'].endswith('.ActiveAbilityWrapper'))
                wrapper['fields']['_wrappedAbilities'][0]['m_PathID']='123'
            elif modify=='extra':
                changed.append({'node_id':'123','type':'Torappu.Battle.Abilities.BuffToOwner','fields':{}})
            else:changed[1]['node_id']=changed[0]['node_id']
            with self.assertRaises(Rejected):self.compiler.compile(changed,levels)

    def test_target_filters_and_membership_cannot_silently_expand(self):
        rows,levels=self.source('skchr_slbell_2')
        for change in [('targetSide',7),('professionMask',4),('ignoreTargetFree',1),('extraFilter',True)]:
            changed=deepcopy(rows)
            validator=next(n for n in changed if n['type'].endswith('.TargetValidator'))
            validator['fields']['_targetOptions'][change[0]]=change[1]
            with self.assertRaises(Rejected):self.compiler.compile(changed,levels)
        changed=deepcopy(rows)
        next(n for n in changed if n['type'].endswith('.AuraAbility'))['fields']['_removeBuffWhenTargetLeave']=0
        with self.assertRaises(Rejected):self.compiler.compile(changed,levels)

    def test_database_extra_events_and_unknown_stack_contract_reject(self):
        rows,levels=self.source('skchr_acsupo_3')
        database=deepcopy(self.database);database['weak[inf]']['maxStackCnt']=2
        with self.assertRaises(Rejected):AuraCompiler(self.mode,database).compile(rows,levels)
        templates=deepcopy(self.mode.templates)
        templates['damage_scale[input]']['eventToActions']['_items']*=2
        other=copy(self.mode);other.templates=templates
        with self.assertRaises(Rejected):AuraCompiler(other,self.database).compile(rows,levels)

    def test_all_levels_and_source_parameters_are_required(self):
        for sid in AUDIT_IDS:
            rows,levels=self.source(sid);profile=self.compiler.compile(rows,levels)
            self.assertEqual(len(levels),10)
            key=profile['consumedKeys'][0]
            levels[-1]['blackboard']=[b for b in levels[-1]['blackboard'] if b['key']!=key]
            with self.assertRaises(Rejected):self.compiler.compile(rows,levels)
        rows,levels=self.source('skchr_accast_2');levels[-1]['duration']=0
        with self.assertRaises(Rejected):self.compiler.compile(rows,levels)

    def test_modifier_domains_use_signed_or_absolute_final_scalers(self):
        cases=[('skchr_slbell_2','def',-1.1),('skchr_ceylon_2','one_minus_status_resistance',1.1),
               ('skchr_ceylon_2','one_minus_status_resistance',-1.1),('skchr_accast_2','atk',-1.1),
               ('skchr_acsupo_3','damage_scale',-.1)]
        for sid,key,value in cases:
            rows,levels=self.source(sid)
            next(b for b in levels[-1]['blackboard'] if b['key']==key)['value']=value
            with self.assertRaises(Rejected):self.compiler.compile(rows,levels)
        rows,levels=self.source('skchr_acsupo_3')
        # Positive source .9/.75 are already absolute ratios; they must not be
        # rejected or transformed to 1.9/1.75 by the negative-debuff shortcut.
        profile=self.compiler.compile(rows,levels)
        self.assertEqual(profile['buffs'][1]['modifiers'][0]['value'],{'key':'atk'})


if __name__=='__main__':unittest.main()
