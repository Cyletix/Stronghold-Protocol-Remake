"""Strict boundaries for structural direct CastSkill batch compilation."""
import copy
import json
import unittest
from build_direct_skill_data import ROOT, PATHS, build
from direct_skill_compiler import BuffCompiler, DirectProjectileCompiler, compile_direct, Rejected
from next_attack_compiler import ProjectileCompiler
from enemy_hit_sequences import load_script_types


class DirectCompilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph,cls.skills,_,bundle=[json.loads((ROOT/p).read_text(encoding='utf-8-sig')) for p in PATHS[:4]]
        cls.templates=json.loads((ROOT/PATHS[5]).read_text(encoding='utf-8-sig'))
        cls.db=json.loads((ROOT/PATHS[6]).read_text(encoding='utf-8-sig'))
        cls.bundle=bundle;cls.projectiles=DirectProjectileCompiler(bundle,load_script_types())
        cls.data,cls.report=build()

    def compile(self,sid='skchr_pinecn_1',mutate=None,levels_mutate=None,templates_mutate=None):
        rows=copy.deepcopy(self.graph['rejections'][sid]['components']);levels=copy.deepcopy(self.skills[sid]['levels'])
        templates=copy.deepcopy(self.templates)
        if mutate:mutate(rows)
        if levels_mutate:levels_mutate(levels)
        if templates_mutate:templates_mutate(templates)
        return compile_direct(sid,rows,levels,['test-roster-id'],self.projectiles,BuffCompiler(templates,self.db))

    def rejects(self,category,**kwargs):
        with self.assertRaises(Rejected) as e:self.compile(**kwargs)
        self.assertEqual(e.exception.category,category,str(e.exception))

    def test_complete_graphs_and_all_levels(self):
        self.assertEqual(set(self.data['profiles']),{'skchr_acpion_1','skchr_demkni_2','skchr_pinecn_1','skchr_savage_2','skchr_vulpis_2','skchr_texas_2'})
        self.assertEqual(self.report['stats']['sourceLevels'],60)
        for sid,p in self.data['profiles'].items():
            self.assertEqual(p['levelCount'],len(self.skills[sid]['levels']))
            self.assertEqual(set(p['source']['componentIds']),{r['node_id'] for r in self.graph['rejections'][sid]['components']})

    def test_future_identity_uses_same_structure(self):
        sid='future_direct_skill';rows=copy.deepcopy(self.graph['rejections']['skchr_savage_2']['components'])
        levels=copy.deepcopy(self.skills['skchr_savage_2']['levels'])
        for lv in levels:lv['prefabId']=sid
        p=compile_direct(sid,rows,levels,['future-character'],self.projectiles,BuffCompiler(self.templates,self.db))
        self.assertEqual(p['targetKey'],'max_target')

    def test_unknown_sibling_field_and_orphan_ref_reject(self):
        def sibling(rows):
            r=copy.deepcopy(rows[0]);r['node_id']='unknown';r['type']='UnknownAbility';rows.append(r)
        self.rejects('extra-gameplay-components',mutate=sibling)
        self.rejects('unconsumed-fields',mutate=lambda rows:rows[0]['fields'].update(_unknown=0))
        def reference(rows):
            next(r for r in rows if r['type'].endswith('.MeleeAttack'))['fields']['_selector']={'m_FileID':1,'m_PathID':'5'}
        self.rejects('unresolved-selector',mutate=reference)

    def test_level_and_extra_blackboard_are_not_silently_ignored(self):
        self.rejects('unconsumed-blackboard',levels_mutate=lambda l:[x['blackboard'].append({'key':'extra','value':0}) for x in l])
        self.rejects('blackboard-shape',levels_mutate=lambda l:l[-1]['blackboard'].pop())
        self.rejects('blackboard-values',levels_mutate=lambda l:l[0]['spData'].update(maxChargeTime=9))

    def test_complete_nested_actions_must_match(self):
        def mutate(t):
            v=t['vulpis_s_2']['eventToActions']['_items'][0]['value']
            v['decodedActions'][0]['_failNodes'].append({'$type':'UnknownAction'})
            v['SerializedState']=json.dumps(v['decodedActions'])
        self.rejects('buff-action',sid='skchr_vulpis_2',templates_mutate=mutate)
        p=self.compile('skchr_vulpis_2');self.assertEqual(p['onHit'][0]['kind'],'if-status')
        self.assertEqual([a['kind'] for a in p['onHit'][0]['yes']],['slow','stun'])
        self.assertEqual([a['kind'] for a in p['onHit'][0]['no']],['slow'])
        self.assertEqual(p['onCast'],[{'kind':'cost','valueKey':'cost'}])

    def test_timed_multi_ranged_source_and_equivalent_identity(self):
        p=self.compile('skchr_texas_2')
        self.assertEqual(p['projectile']['kind'],'lifetime-end-target')
        self.assertEqual(p['castSchedule']['rounds'],2)
        self.assertAlmostEqual(p['castSchedule']['interval'],.7667,places=5)
        self.assertEqual(p['projectile']['randomBirthDelay'],.5)
        rows=copy.deepcopy(self.graph['rejections']['skchr_texas_2']['components'])
        levels=copy.deepcopy(self.skills['skchr_texas_2']['levels'])
        for lv in levels:lv['prefabId']='future_timed_skill'
        got=compile_direct('future_timed_skill',rows,levels,['new-scoped-character'],self.projectiles,BuffCompiler(self.templates,self.db))
        self.assertEqual(got['castSchedule'],p['castSchedule'])
        def changed(rows):
            next(r for r in rows if r['type'].endswith('.MultiRangedAttack'))['fields']['_onlyFeedActionsToFirstOne']=1
        self.rejects('unsupported-field-values',sid='skchr_texas_2',mutate=changed)

    def test_all_selector_requires_all_source_levels_and_keeps_real_caps(self):
        self.rejects('selector-all-source-crosscheck',sid='skchr_texas_2',levels_mutate=lambda lv:lv[-1].update(description='对一个目标造成伤害'))
        def non_all(rows):
            next(r for r in rows if r['type']=='Torappu.Battle.AdvancedSelector')['fields']['_postFilter']=4
        self.assertEqual(self.compile('skchr_texas_2',mutate=non_all)['targets'],'fixed')
        def bound(lv):
            for x in lv:x['blackboard'].append({'key':'max_target','value':3})
        p=self.compile('skchr_texas_2',levels_mutate=bound)
        self.assertEqual((p['targets'],p['targetKey']),('blackboard','max_target'))

    def test_delayed_projectile_unknown_or_owned_lifecycle_rejects(self):
        compiler=DirectProjectileCompiler(self.bundle,load_script_types())
        projectile=compiler.compile('projectile_sword_rain')
        nodeid=next(n for n in projectile['componentIds'] if self.bundle['nodes'][n]['fields'].get('_lifeTime') is not None)
        altered=dict(self.bundle,nodes=dict(self.bundle['nodes']))
        altered['nodes'][nodeid]=copy.deepcopy(self.bundle['nodes'][nodeid])
        altered['nodes'][nodeid]['fields']['_stopWhenSourceInvalid']=1
        with self.assertRaises(Rejected):DirectProjectileCompiler(altered,load_script_types()).compile('projectile_sword_rain')


if __name__=='__main__':unittest.main()
