"""Complete source-body acceptance and fail-closed multi-melee boundaries."""
from copy import deepcopy
import unittest
from build_external_combat_data import animation_profile
from enemy_multi_melee_skills import CONTRACT, MULTI, CAST_BUFF, compile_multi_melee_skill, read


class MultiMeleeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = read(CONTRACT)
        cls.sid = next(iter(cls.contract['candidates']))

    def compile(self, contract=None):
        c = self.contract if contract is None else contract
        row = c['candidates'][self.sid]
        context = c['enemies'][row['enemyId']]
        return compile_multi_melee_skill(row,context,context['compiledModeProfiles'],context['initialMode'],c,
            animation_of=animation_profile,animations=c['animationBindings'][row['enemyId']]['source']['animations'],aliases={})

    def test_actual_complete_body_with_explicit_phase_boundary(self):
        result = self.compile()
        self.assertTrue(result['accepted'],result['rejections'])
        skill = result['selection']
        self.assertEqual(skill['modeIndices'],[1])
        self.assertFalse(skill['initiallyMounted'])
        self.assertFalse(skill['automaticModeTransitionComplete'])
        self.assertFalse(skill['enemyImplementationComplete'])
        self.assertEqual(skill['blackboard'],{'times':2,'def_penetrate':.6})
        self.assertEqual(skill['action']['repeat']['interval'],.2)
        self.assertEqual(skill['action']['timing']['hit'],.3667)
        self.assertEqual(skill['action']['timing']['duration'],1.1333)
        self.assertEqual(skill['action']['maxAnimScale'],-1)
        self.assertEqual(skill['spContract']['maxSp'],3)

    def test_complete_components_reject_unsupported_behaviour(self):
        for case in ('split','refresh','wait-every-event','extra-field','extra-sibling','extra-buff','caster-status','extra-effect'):
            c = deepcopy(self.contract);r=c['candidates'][self.sid]
            f=next(v['fields'] for v in r['sameGameObjectComponents'].values() if v['scriptType']==MULTI)
            b=next(v['fields'] for v in r['sameGameObjectComponents'].values() if v['scriptType']==CAST_BUFF)
            if case=='split': f['_splitDamage']=1
            elif case=='refresh': f['_refreshTimesOnCheckAnotherSpell']=1
            elif case=='wait-every-event': f['_waitAttackEventForAllAttacks']=1
            elif case=='extra-field': f['_unhandledZero']=0
            elif case=='extra-sibling': r['sameGameObjectComponents']['unknown']={'scriptType':'Unknown'}
            elif case=='extra-buff': f['_activeBuffs'].append(deepcopy(f['_activeBuffs'][0]))
            elif case=='caster-status': b['_buffs'][0]['attributes']['abnormalFlags']=[1]
            elif case=='extra-effect': c['templates']['jakill_skill_1_reborn_hit']['eventToActions']['ON_BUFF_END']=[]
            # Keep independent exports equal to test semantic validation too.
            for key,row in r['sameGameObjectComponents'].items(): c['catalog'][r['enemyId']]['components'][key]=deepcopy(row)
            with self.subTest(case=case): self.assertFalse(self.compile(c)['accepted'])

    def test_only_exact_float32_serialization_difference_is_accepted(self):
        for case in ('real-delta-change','different-parent','disabled','missing-hierarchy'):
            c=deepcopy(self.contract);r=c['candidates'][self.sid]
            key=next(k for k,v in r['sameGameObjectComponents'].items() if v['scriptType']==MULTI)
            owner=c['ownership'][r['enemyId']]['components'][key]
            if case=='real-delta-change': owner['sharedFieldDifferences'][0]['JP']=.21
            elif case=='different-parent': owner['gameObjectPathID']='unrelated'
            elif case=='disabled': owner['jpEnabled']=0
            elif case=='missing-hierarchy': owner['ancestorGameObjects']=[]
            with self.subTest(case=case): self.assertFalse(self.compile(c)['accepted'])

    def test_sp_parameters_and_dedicated_ownership_remain_bounded(self):
        for case in ('negative','fractional','extra-key','sp-regen','missing-stop','dedicated','missing-mode'):
            c=deepcopy(self.contract);r=c['candidates'][self.sid];ctx=c['enemies'][r['enemyId']]
            source=r['databaseSkillBindings'][0]
            if case=='negative': source['blackboard'][1]['value']=-1
            elif case=='fractional': source['blackboard'][0]['value']=2.5
            elif case=='extra-key': source['blackboard'].append(dict(key='unknown',value=1,valueStr=None))
            elif case=='sp-regen': c['spContract']['regenPerSecond']=1
            elif case=='missing-stop': c['spContract']['attackRecovery']['stoppedWhileSkillRegistered']=False
            elif case=='dedicated': ctx['dedicatedBossProfile']={'owned':True}
            elif case=='missing-mode': del ctx['compiledModeProfiles']['1']
            ctx['sourceSkills']=[deepcopy(source)]
            with self.subTest(case=case): self.assertFalse(self.compile(c)['accepted'])


if __name__=='__main__': unittest.main()
