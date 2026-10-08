"""Only the new source healing family; established attack cohorts are not rerun."""
import copy
import json
import unittest
from build_next_attack_skill_data import ROOT, PATHS, build
from enemy_hit_sequences import load_script_types
from next_attack_compiler import ProjectileCompiler, Rejected, compile_replacement


class HealingReplacementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph, cls.skills, _, cls.bundle = [json.loads((ROOT/p).read_text(encoding='utf-8-sig')) for p in PATHS[:4]]
        cls.script_types = load_script_types()
        cls.projectiles = ProjectileCompiler(cls.bundle, cls.script_types)
        cls.data, cls.report = build()

    def compile(self, sid='skchr_demkni_1', mutate=None, levels_mutate=None):
        rows = copy.deepcopy(self.graph['rejections'][sid]['components'])
        levels = copy.deepcopy(self.skills[sid]['levels'])
        if mutate:
            mutate(rows)
        if levels_mutate:
            levels_mutate(levels)
        return compile_replacement(sid, rows, levels, ['structural-heal-fixture'], self.projectiles)

    def test_family_and_source_levels(self):
        profiles = {k: v for k,v in self.data['profiles'].items() if v['kind'] == 'next-heal'}
        self.assertEqual(set(profiles), {'skchr_demkni_1', 'skchr_rosesa_1', 'skchr_sunbr_1', 'skchr_reckpr_1'})
        self.assertEqual(sum(p['levelCount'] for p in profiles.values()), 40)
        for sid,p in profiles.items():
            for lv in self.skills[sid]['levels']:
                bb = {x['key']: x['value'] for x in lv['blackboard']}
                self.assertEqual(sorted(bb), p['blackboardKeys'])
                self.assertEqual(bb[p['chargeKey']], lv['spData']['maxChargeTime'])
        self.assertEqual(profiles['skchr_demkni_1']['hpThreshold'], .5)
        self.assertFalse(profiles['skchr_demkni_1']['hpThresholdExcludeEqual'])
        self.assertEqual(profiles['skchr_rosesa_1']['targetCount'], 3)

    def test_rename_has_no_id_whitelist(self):
        sid='skchr_demkni_1';rows=copy.deepcopy(self.graph['rejections'][sid]['components'])
        levels=copy.deepcopy(self.skills[sid]['levels'])
        for lv in levels:lv['prefabId']='source_identical_new_healer'
        self.assertEqual(compile_replacement('source_identical_new_healer',rows,levels,['new_identity'],self.projectiles)['kind'],'next-heal')

    def test_unknown_sibling_and_buff_fail_closed(self):
        def extra(rows):
            row=copy.deepcopy(rows[0]);row['node_id']='extra';row['type']='Torappu.Battle.UnknownHealSibling';rows.append(row)
        with self.assertRaises(Rejected):self.compile(mutate=extra)
        def buff(rows):
            row=next(r for r in rows if r['type'].endswith('.Heal'));row['fields']['_activeBuffs']=[{'buffKey':'unhandled'}]
        with self.assertRaises(Rejected):self.compile(mutate=buff)

    def test_threshold_and_selector_reference_are_consumed(self):
        for field,value in [('_filterMinHp',1),('_maxHpRatio',float('nan')),('_maxHpExcludeEqual',2)]:
            def mutate(rows):next(r for r in rows if r['type'].endswith('WithinHpRatio'))['fields'][field]=value
            with self.assertRaises(Rejected):self.compile(mutate=mutate)
        def trigger(rows):next(r for r in rows if r['type'].endswith('.ReplacementSkill'))['fields']['_trigger']['m_PathID']='999'
        with self.assertRaises(Rejected):self.compile(mutate=trigger)

    def test_all_blackboards_and_charge_aliases_are_consumed(self):
        def extra(levels):
            for lv in levels:lv['blackboard'].append({'key':'unhandled_heal_effect','value':1})
        with self.assertRaises(Rejected):self.compile(levels_mutate=extra)
        def bad_charge(levels):levels[4]['spData']['maxChargeTime']+=1
        with self.assertRaises(Rejected):self.compile(levels_mutate=bad_charge)

    def test_healing_projectile_contract_is_opt_in_and_complete(self):
        for key in ('projectile_sunbr','projectile_chr_reckpr_s1'):
            with self.assertRaises(Rejected):self.projectiles.compile(key)
            self.assertTrue(self.projectiles.compile(key,healing=True)['healing'])
        bundle=copy.deepcopy(self.bundle)
        for node in bundle['nodes'].values():
            f=node.get('fields',{})
            if f.get('_mainEffect')=='sunbr_skill_01_trail':f['_actionController']['_extraBuffsInTheEnd']=[{'buffKey':'unknown'}]
        with self.assertRaises(Rejected):ProjectileCompiler(bundle,self.script_types).compile('projectile_sunbr',healing=True)


if __name__ == '__main__':unittest.main()
