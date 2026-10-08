"""Do not turn a global attribute row or bounty declaration into a work order."""
import unittest
from copy import deepcopy

from garrison_encounter_scope import build_scope, load_scope, apply_scope_to_plan, scope_runtime_report, scope_requests
from advance_enemy_modes import prepare_batch, apply_foundation_priority
from prioritize_garrison_foundations import build_priority
from test_advance_enemy_modes import minimal_plan


class EncounterScopeTests(unittest.TestCase):
    def fixture(self):
        group = dict(type='AIR', randomWeight=1, specialEnemyKey='enemy_main',
                     attachedNormalEnemyKeys=['enemy_follower'])
        encounters = dict(enemies={eid:{} for eid in ('enemy_main','enemy_global','enemy_bounty','enemy_disabled')},
            seasons={'s2':dict(typeDraw={'AIR':dict(count=1,weight=1)},trainingTypes=[],
                modes={'normal':dict(modeDifficulty='NORMAL',inactiveEnemyKey=['enemy_disabled'])},
                specialEnemyInfo={'ok':group,
                    'disabled':dict(group,specialEnemyKey='enemy_disabled',attachedNormalEnemyKeys=[]),
                    'zero':dict(group,randomWeight=0,specialEnemyKey='enemy_zero')})})
        def level(enemy):
            return dict(enemies={'enemy_catalog_only':{}},waves=[dict(fragments=[dict(actions=[
                dict(actionType='SPAWN',count=1,key=enemy),
                dict(actionType='SPAWN',count=0,key='enemy_zero_spawn'),
                dict(actionType='WAIT',count=1,key='enemy_wait')])])])
        battles = dict(seasons={'s2':dict(
            modes={'normal':dict(rounds=[dict(alternatives=[dict(levelKey='used',bossId='boss')])],stageChoices=[])},
            bosses={'boss':dict(enemyId='enemy_combat_boss',handbookEnemyId='enemy_handbook')},
            bands=[dict(mechs=[dict(bb=[dict(k='enemylist',v='enemy_band')])])],
            decisionEffects=[dict(mechs=[dict(bb={'enemy_id':'enemy_bounty'})])])},
            levels={'used':level('enemy_wave'),'unused':level('enemy_unused')})
        return encounters,battles

    def test_positive_appearance_references_exclude_catalogs_and_inactive_data(self):
        scope=build_scope(*self.fixture())
        self.assertEqual(set(scope['eligibleEnemyIDs']),{
            'enemy_main','enemy_follower','enemy_wave','enemy_combat_boss','enemy_band'})
        self.assertEqual(scope['conditionalOnlyEnemyIDs'],['enemy_bounty'])
        self.assertEqual(set(scope['catalogOnlyEnemyIDs']),{'enemy_global','enemy_disabled'})
        for refs in scope['appearanceReferences'].values():
            self.assertTrue(all(r['fieldPath'] and r['seasonId']=='s2' for r in refs))

    def test_appearance_changes_when_real_wave_reference_is_added(self):
        encounters,battles=self.fixture()
        actions=battles['levels']['used']['waves'][0]['fragments'][0]['actions']
        actions.append(dict(actionType='SPAWN',count=1,key='enemy_bounty'))
        scope=build_scope(encounters,battles)
        self.assertIn('enemy_bounty',scope['eligibleEnemyIDs'])
        self.assertNotIn('enemy_bounty',scope['conditionalOnlyEnemyIDs'])
        self.assertIn('enemy_bounty',scope['decisionDeclarationReferences'])

    def test_work_projection_preserves_source_members_and_manual_progress(self):
        plan=minimal_plan();before=deepcopy(plan)
        for op in plan['batches']['actions']['operatorIDs']:
            plan['operators'][op]['memberIDs']=list(plan['memberIDs'])
        plan['enemies']['enemy_z']['manualProgress']={'checked':False,'note':'keep'}
        scope=dict(rule='fixture',sourceHashes={},eligibleEnemyIDs=['enemy_a'],conditionalOnlyEnemyIDs=['enemy_z'])
        scoped=apply_scope_to_plan(plan,scope)
        self.assertEqual(scoped['memberIDs'],before['memberIDs'])
        self.assertEqual(scoped['enemies']['enemy_z']['manualProgress'],plan['enemies']['enemy_z']['manualProgress'])
        self.assertFalse(scoped['enemies']['enemy_z']['inEncounterPool'])
        queue=prepare_batch(scoped,{'counts':{}},'actions')
        self.assertEqual(queue['memberIDs'],['enemy_a'])
        self.assertEqual(set(queue['sourceMemberIDs']),{'enemy_a','enemy_z'})
        self.assertTrue(all(job['affectedEnemyIDs']==['enemy_a'] for job in queue['jobs']))
        self.assertTrue(all(job['outOfScopeEnemyIDs']==['enemy_z'] for job in queue['jobs']))

    def test_skill_candidates_and_source_report_survive_priority_projection(self):
        report={'skillDispatch':dict(candidateIDs=['enemy_a|pending','enemy_z|old'],
            selections={'enemy_z':[dict(id='enemy_z|old')]})}
        before=deepcopy(report)
        scoped=scope_runtime_report(report,{'enemy_a'})
        self.assertEqual(report,before)
        self.assertEqual(scoped['skillDispatch']['candidateIDs'],['enemy_a|pending'])
        self.assertEqual(scoped['skillDispatch']['outOfScopeCandidateIDs'],['enemy_z|old'])
        self.assertEqual(scope_runtime_report(scoped,{'enemy_a'}),scoped)
        plan={'operators':{'resolve-enemy-skill-trigger':dict(memberIDs=['enemy_a','enemy_z'],implementationState='pending')},
            'runtimeSupport':{'pendingCapabilities':[dict(family='outside',affectedEnemyIDs=['enemy_z'],candidateIDs=['old'])]}}
        priority=build_priority(plan,report,{},['enemy_a'])
        priority['contentSha256']='fixture'
        result=apply_foundation_priority(plan,priority)['runtimeSupport']
        self.assertIsNone(result['nextProviderCandidate'])
        self.assertEqual(result['nextSharedProvider']['pendingSkillIDs'],['enemy_a|pending'])
        self.assertEqual(result['pendingCapabilities'],plan['runtimeSupport']['pendingCapabilities'])

    def test_real_jakill_declaration_does_not_outrank_confirmed_garrison_enemies(self):
        scope=load_scope(write=False)
        self.assertNotIn('enemy_1516_jakill',scope['eligibleEnemyIDs'])
        self.assertIn('enemy_1516_jakill',scope['conditionalOnlyEnemyIDs'])
        for eid in ('enemy_1040_bombd','enemy_1373_ltnhor_2','enemy_2025_syufo'):
            self.assertIn(eid,scope['eligibleEnemyIDs'])

    def test_mixed_provider_request_cannot_leak_non_garrison_candidate(self):
        request=dict(affectedEnemyIDs=['enemy_a','enemy_z'],candidateIDs=['enemy_a|one','enemy_z|two'],
            pureSwitchCandidateIDs=['enemy_z|two'],singleCapabilityCandidateIDs=['enemy_a|one'])
        scoped=scope_requests([request],{'enemy_a'})[0]
        self.assertEqual(scoped['candidateIDs'],['enemy_a|one'])
        self.assertEqual(scoped['affectedEnemyIDs'],['enemy_a'])
        self.assertEqual(scoped['sourceCandidateIDs'],request['candidateIDs'])
        self.assertEqual(scoped['pureSwitchCandidateIDs'],[])
        self.assertEqual(scoped['singleCapabilityCandidateIDs'],['enemy_a|one'])


if __name__=='__main__':
    unittest.main()
