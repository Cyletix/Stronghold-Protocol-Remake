"""Focused source-contract tests for the automatic Garrison replacement cohort."""
import copy
import json
import unittest

from build_next_attack_skill_data import ROOT, PATHS, build
from enemy_hit_sequences import load_script_types
from garrison_skill_scope import load_scope
from next_attack_compiler import ProjectileCompiler, Rejected, compile_replacement
from next_attack_hit_buffs import HitBuffCompiler


class ReplacementCompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph, cls.skills, _, cls.bundle = [json.loads((ROOT / p).read_text(encoding='utf-8-sig')) for p in PATHS[:4]]
        cls.script_types = load_script_types()
        cls.projectiles = ProjectileCompiler(cls.bundle, cls.script_types)
        cls.templates = json.loads((ROOT / PATHS[5]).read_text(encoding='utf-8-sig'))
        cls.buff_database = json.loads((ROOT / PATHS[6]).read_text(encoding='utf-8-sig'))
        cls.hit_buffs = HitBuffCompiler(cls.templates, cls.buff_database)
        cls.data, cls.report = build()

    def compile(self, sid='skchr_grabds_1', mutate=None, level_mutate=None):
        rows = copy.deepcopy(self.graph['rejections'][sid]['components'])
        levels = copy.deepcopy(self.skills[sid]['levels'])
        if mutate:
            mutate(rows)
        if level_mutate:
            level_mutate(levels)
        return compile_replacement(sid, rows, levels, ['fixture-roster-identity'], self.projectiles, self.hit_buffs)

    def rejects(self, category, **kwargs):
        with self.assertRaises(Rejected) as raised:
            self.compile(**kwargs)
        self.assertEqual(raised.exception.category, category, str(raised.exception))

    def test_full_scope_all_levels_and_original_bodies(self):
        scope = load_scope()
        self.assertEqual(self.report['stats']['candidates'], len(self.report['accepted']) + len(self.report['rejected']))
        expected = {'skchr_savage_1', 'skchr_f12yin_1', 'skchr_etlchi_1', 'skchr_haini_1',
                    'skchr_huang_1', 'skchr_bpipe_2', 'skchr_akkord_1', 'skchr_grabds_1', 'skchr_aroma_1',
                    'skchr_mm_1', 'skchr_ayer_1', 'skchr_shotst_1', 'skchr_blemsh_1'}
        self.assertEqual({sid for sid,p in self.data['profiles'].items() if p['kind']=='next-attack'}, expected)
        for sid, p in self.data['profiles'].items():
            self.assertIn(sid, scope['skillIds'])
            self.assertEqual(p['levelCount'], len(self.skills[sid]['levels']))
            self.assertTrue(set(p['charIds']) <= set(scope['charIds']))
            for lv in self.skills[sid]['levels']:
                self.assertEqual(set(p['blackboardKeys']), {b['key'] for b in lv['blackboard']})
        p = self.data['profiles']
        self.assertEqual(p['skchr_etlchi_1']['hits'], 2)
        self.assertEqual(p['skchr_etlchi_1']['targets'], 'single')
        self.assertEqual(p['skchr_savage_1']['targets'], 'block-count')
        self.assertEqual(p['skchr_haini_1']['targetKey'], 'max_target')
        self.assertEqual(p['skchr_grabds_1']['targetCount'], 2)
        self.assertEqual(p['skchr_akkord_1']['targets'], 'all')

    def test_source_structure_is_not_an_id_allowlist(self):
        sid = 'structurally_equivalent_future_skill'
        rows = copy.deepcopy(self.graph['rejections']['skchr_grabds_1']['components'])
        levels = copy.deepcopy(self.skills['skchr_grabds_1']['levels'])
        for lv in levels:
            lv['prefabId'] = sid
        result = compile_replacement(sid, rows, levels, ['future-scoped-identity'], self.projectiles)
        self.assertEqual(result['targets'], 'fixed')
        self.assertEqual(result['projectile']['speed'], 10)

    def test_unknown_sibling_or_zero_field_does_not_silently_disappear(self):
        def sibling(rows):
            c = copy.deepcopy(rows[0]);c['node_id'] = 'new';c['type'] = 'Torappu.Battle.Abilities.UnknownAction';rows.append(c)
        self.rejects('extra-gameplay-components', mutate=sibling)
        self.rejects('unconsumed-fields', mutate=lambda rows: rows[0]['fields'].update(_newDamageField=0))

    def test_extra_buffs_and_blackboard_remain_rejected(self):
        self.rejects('active-buffs', mutate=lambda rows: rows[0]['fields'].update(_activeBuffs=[{'templateKey': 'unknown'}]))
        self.rejects('unconsumed-blackboard', level_mutate=lambda levels: [lv['blackboard'].append({'key': 'unknown', 'value': 0}) for lv in levels])
        self.assertIn('Torappu.Battle.Abilities.BuffDuringCasting', self.report['rejectedComponentsByType'])
        self.assertIn('skchr_surtr_1', self.report['rejected'])

    def test_default_target_and_charge_fields_are_actual_source_bindings(self):
        p = self.compile()
        self.assertEqual((p['targetKey'], p['targetCount'], p['chargeKey']), (None, 2, 'ct'))
        self.rejects('invalid-blackboard-values', level_mutate=lambda levels: levels[0]['spData'].update(maxChargeTime=2))
        self.rejects('blackboard-shape', level_mutate=lambda levels: levels[-1]['blackboard'].pop())
        self.rejects('unsupported-controller-level', level_mutate=lambda levels: levels[5]['spData'].update(spType='INCREASE_WHEN_TAKEN_DAMAGE'))

    def test_unresolved_refs_and_orphan_ranges_are_rejected(self):
        self.rejects('unresolved-selector', mutate=lambda rows: rows[0]['fields'].update(_selector={'m_FileID': 3, 'm_PathID': '5406502840779185802'}))
        def wrong_range(rows):
            next(r for r in rows if r['type'].endswith('.AutoLoadBoxRange'))['fields']['m_GameObject']['m_PathID'] = 'broken'
        self.rejects('unresolved-range', mutate=wrong_range)

    def test_ordinary_projectile_closure_rejects_special_or_missing_parts(self):
        for key in ('projectile_chr_haini_s1', 'projectile_chr_grabds_s1'):
            result = self.projectiles.compile(key)
            self.assertEqual((result['speed'], result['life']), (10, 10))
            self.assertEqual(len(result['componentIds']), 3)
        with self.assertRaises(Rejected) as raised:
            self.projectiles.compile('projectile_svrash_s1')
        self.assertEqual(raised.exception.category, 'projectile-special-delivery')
        bundle = {**self.bundle, 'nodes': dict(self.bundle['nodes'])}
        root_ref = self.projectiles.assets['projectile_chr_grabds_s1'][0]
        root = copy.deepcopy(bundle['nodes'][str(root_ref['m_PathID'])])
        bundle['nodes'][str(root_ref['m_PathID'])] = root
        root['fields']['m_Component'].append({'component': {'m_FileID': 0, 'm_PathID': 'new'}})
        bundle['nodes']['new'] = dict(pathId='new', unityType='MonoBehaviour', fields={
            'm_GameObject': root_ref, 'm_Enabled': 1, 'm_Script': {'m_FileID': 1, 'm_PathID': 'unknown'}, 'm_Name': ''})
        with self.assertRaises(Rejected) as raised:
            ProjectileCompiler(bundle, self.script_types).compile('projectile_chr_grabds_s1')
        self.assertEqual(raised.exception.category, 'projectile-special-behaviour')

    def test_delayed_conditional_buff_requires_the_complete_closed_template(self):
        p = self.compile('skchr_aroma_1')
        self.assertEqual(p['hitBuffs'][0]['scaleKey'], 'atk_scale_to_fly')
        self.assertAlmostEqual(p['hitBuffs'][0]['delay'], .1)
        rows = self.graph['rejections']['skchr_aroma_1']['components']
        buffs = next(r for r in rows if r['fields'].get('_activeBuffs'))['fields']['_activeBuffs']
        invalid = copy.deepcopy(buffs);invalid[0]['triggerCnt'] = 2
        with self.assertRaises(Rejected):
            self.hit_buffs.compile(invalid)
        templates = copy.deepcopy(self.templates)
        event = templates[buffs[0]['templateKey']]['eventToActions']['_items'][0]['value']
        event['decodedActions'][0]['_succeedNodes'].insert(1, {'$type': 'UnknownSideEffect'})
        event['SerializedState'] = json.dumps(event['decodedActions'])
        with self.assertRaises(Rejected):
            HitBuffCompiler(templates).compile(buffs)

    def test_loaded_and_inline_attributes_bind_complete_buffs(self):
        p = self.compile('skchr_ayer_1')
        effect = p['hitBuffs'][0]
        self.assertEqual((effect['kind'], effect['durationKey'], effect['phase']), ('movement-multiplier', 'sluggish', 'before-body'))
        self.assertAlmostEqual(effect['value'], .2)
        self.assertTrue(p['waitForProjectile'])
        self.assertEqual(p['projectile']['controllerType'], 'Torappu.Battle.Projectile+ActionController')
        p = self.compile('skchr_mm_1')
        self.assertEqual((p['targets'], p['groundOnly'], p['hitBuffs'][0]['phase']), ('input', None, 'after-body'))
        p = self.compile('skchr_shotst_1')
        self.assertEqual(p['hitBuffs'][0]['kind'], 'defense-multiplier')
        self.assertEqual(p['hitBuffs'][0]['phase'], 'before-body')
        database = copy.deepcopy(self.buff_database);database['sluggish']['unknownDamage'] = 0
        ref = next(r for r in self.graph['rejections']['skchr_ayer_1']['components'] if r['fields'].get('_activeBuffs'))['fields']['_activeBuffs']
        with self.assertRaises(Rejected):
            HitBuffCompiler(self.templates, database).compile(ref)


if __name__ == '__main__':
    unittest.main()
