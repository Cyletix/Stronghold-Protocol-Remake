"""Saved provider progress must not erase unrelated action or state gaps."""
import copy
import unittest

from advance_enemy_modes import integrate_runtime_status, prepare_batch
from render_enemy_mode_progress import mode_provider_status, _provider_label
from enemy_skill_dispatch_status import skill_dispatch_status


def plan():
    operators = {key: {'label': key, 'purpose': key, 'memberIDs': ['enemy_a'],
        'activeMemberIDs': ['enemy_a'], 'deferredMemberIDs': [], 'templateIDs': ['class_a'],
        'implementationState': 'pending-full-contract'} for key in ('switch-mode', 'action-play-audio')}
    return {'enemies': {'enemy_a': {'requiredOperators': list(operators),
        'missingLinks': ['extra-audio-action-unresolved', 'other-phase-state-unresolved'],
        'deferredOperators': ['resolve-entity-state-mode-call']}}, 'operators': operators,
        'batches': {'actions': {'label': '动作', 'dependsOn': ['bindings'],
        'operatorIDs': list(operators), 'output': '完整动作链', 'acceptance': '不忽略兄弟动作'}}}


def report():
    return {'modeProviders': {'rule': 'runtime-v1', 'boundary': 'blocked target contract only',
        'candidates': 3, 'selections': {'enemy_a': [{'id': 'provider-a', 'chainId': 'provider-a',
        'kind': 'blocked-toggle-mode', 'templateKeys': ['switch_mode'],
        'targetBinding': {'scope': 'TARGET', 'boundTo': 'provider-owner'},
        'events': {'ON_BUFF_START': [{'kind': 'switch-mode', 'modeIndex': 1}]}}]},
        'rejections': {'enemy_a': [{'candidateId':'provider-b','reasons':[{'code':'action-unsupported','sourcePath':'/eventToActions/ON_BUFF_START/1'}]}]}}}


class RuntimeOverlayBoundaries(unittest.TestCase):
    def test_selected_skill_leaves_component_queue_without_closing_other_skills_or_modes(self):
        original=plan()
        original['operators']['resolve-enemy-skill-trigger']=copy.deepcopy(original['operators']['switch-mode'])
        original['batches']['actions']['operatorIDs'].append('resolve-enemy-skill-trigger')
        saved=report()
        saved['skillDispatch']={'rule':'skill-v1','candidateIDs':['enemy_a|selected','enemy_a|other','enemy_b|not-reported'],
            'selections':{'enemy_a':[{'id':'enemy_a|selected','skillKey':'AttackTwo','modeIndices':[1]}]},
            'rejections':{'enemy_a':[{'candidateId':'enemy_a|selected','reasons':[{'code':'stale-refusal'}]},
                {'candidateId':'enemy_a|other','reasons':[{'code':'full-ability-group-pending'}]}]}}
        updated=integrate_runtime_status(original,saved)
        runtime=updated['runtimeSupport']['skillDispatch']
        self.assertEqual(runtime['selectedSkillIDs'],['enemy_a|selected'])
        self.assertEqual(runtime['pendingSkillIDs'],['enemy_a|other','enemy_b|not-reported'])
        self.assertNotIn('enemy_a|selected',runtime['rejectionsBySkillID'])
        self.assertEqual(updated['enemies']['enemy_a']['missingLinks'],original['enemies']['enemy_a']['missingLinks'])
        self.assertEqual(updated['operators'],original['operators'])
        queue=prepare_batch(updated,{'counts':{}},'actions')
        skill_job=next(job for job in queue['jobs'] if job['operatorId']=='resolve-enemy-skill-trigger')
        self.assertEqual(skill_job['pendingSkillIDs'],['enemy_a|other'])
        self.assertEqual(skill_job['alreadyBoundSkills'][0]['skillId'],'enemy_a|selected')
        self.assertEqual(skill_job['alreadyBoundProviders'][0]['providerId'],'provider-a')
        self.assertIs(integrate_runtime_status(updated,saved),updated)
        withdrawn=copy.deepcopy(saved);withdrawn['skillDispatch']['selections']={}
        refreshed=integrate_runtime_status(updated,withdrawn)
        self.assertEqual(refreshed['runtimeSupport']['skillDispatch']['selectedSkillIDs'],[])
        self.assertIn('enemy_a|selected',refreshed['runtimeSupport']['skillDispatch']['pendingSkillIDs'])

    def test_skill_counts_use_actual_selections_and_deduplicate_enemy(self):
        saved={'counts':{'skillDispatchSkills':999},'skillDispatch':{'candidateIDs':['enemy_a|one','enemy_a|two'],
            'selections':{'enemy_a':[{'id':'enemy_a|one'},{'id':'enemy_a|two'}]}}}
        status=skill_dispatch_status(saved,{'enemy_a'})
        self.assertEqual(status['counts']['selectedSkills'],2)
        self.assertEqual(status['counts']['selectedEnemies'],1)
        self.assertEqual(status['counts']['encounterSelectedEnemies'],1)
        self.assertEqual(status['counts']['pendingSkills'],0)

    def test_existing_provider_does_not_remove_extra_action_or_state_work(self):
        original = plan(); before = copy.deepcopy(original)
        updated = integrate_runtime_status(original, report())
        self.assertEqual(original, before)
        self.assertEqual(updated['enemies']['enemy_a']['requiredOperators'], before['enemies']['enemy_a']['requiredOperators'])
        self.assertEqual(updated['enemies']['enemy_a']['missingLinks'], before['enemies']['enemy_a']['missingLinks'])
        self.assertEqual(updated['enemies']['enemy_a']['deferredOperators'], before['enemies']['enemy_a']['deferredOperators'])
        queue = prepare_batch(updated, {'counts': {}}, 'actions')
        self.assertEqual([job['operatorId'] for job in queue['jobs']], ['switch-mode', 'action-play-audio'])
        self.assertEqual(queue['jobs'][1]['affectedEnemyIDs'], ['enemy_a'])
        self.assertEqual(queue['jobs'][1]['alreadyBoundProviders'][0]['providerId'], 'provider-a')
        self.assertEqual(queue['fullPhaseTransitionsCompleted'], 0)
        self.assertEqual(queue['nextSharedProvider']['family'], 'complete-buff-actions')
        self.assertEqual(queue['nextSharedProvider']['scope'], 'mode-transition-only')
        self.assertEqual(queue['nextSharedProvider']['existingContractScope'], 'blocked target contract only')
        self.assertEqual(queue['nextSharedProvider']['candidateIDs'], ['provider-b'])

    def test_refresh_removes_stale_binding_and_never_promotes_a_candidate(self):
        updated = integrate_runtime_status(plan(), report())
        self.assertIs(integrate_runtime_status(updated, report()), updated)
        withdrawn = report(); withdrawn['modeProviders']['selections'] = {}
        withdrawn['modeProviders']['rule'] = 'runtime-v2'
        refreshed = integrate_runtime_status(updated, withdrawn)
        self.assertFalse(refreshed['runtimeSupport']['runtimeSupportAvailable'])
        self.assertEqual(refreshed['runtimeSupport']['rule'], 'runtime-v2')
        self.assertEqual(refreshed['enemies']['enemy_a']['alreadyBoundProviders'], [])
        self.assertEqual(refreshed['runtimeSupport']['nextSharedProvider']['family'], 'complete-buff-actions')
        self.assertEqual(refreshed['enemies']['enemy_a']['missingLinks'], updated['enemies']['enemy_a']['missingLinks'])
        queue = prepare_batch(refreshed, {'counts': {}}, 'actions')
        self.assertTrue(all(job['alreadyBoundProviders'] == [] for job in queue['jobs']))
        self.assertEqual(queue['fullPhaseTransitionsCompleted'], 0)

    def test_hp_support_replaces_old_hp_task_with_current_shared_action_gap(self):
        mixed = report()
        mixed['modeProviders']['rule'] = 'shared-enemy-mode-providers-v2'
        hp = copy.deepcopy(mixed['modeProviders']['selections']['enemy_a'][0])
        hp.update(id='hp-a',chainId='hp-a',kind='hp-ratio-toggle-mode')
        mixed['modeProviders']['selections']['enemy_a'].append(hp)
        mixed['modeProviders']['rejections'] = {'enemy_a':[
            {'candidateId':'hp-b','reasons':[{'code':'action-unsupported','sourcePath':'/extra-action'}]},
            {'candidateId':'hp-a','reasons':[{'code':'checker-predicate-unsupported'}]}]}
        candidates = {'candidates':[
            {'candidateId':'hp-a','enemyId':'enemy_a','family':'hp-ratio-toggle','rejectionReasons':['hp-checker-and-detach-lifecycle-not-in-blocked-batch']},
            {'candidateId':'hp-b','enemyId':'enemy_a','family':'hp-ratio-toggle','rejectionReasons':['hp-checker-and-detach-lifecycle-not-in-blocked-batch']},
            {'candidateId':'hp-c','enemyId':'enemy_a','family':'hp-ratio-toggle','rejectionReasons':['hp-checker-and-detach-lifecycle-not-in-blocked-batch']}]}
        updated = integrate_runtime_status(plan(),mixed,candidates)
        runtime = updated['runtimeSupport']
        self.assertEqual(runtime['nextSharedProvider']['family'],'complete-buff-actions')
        self.assertEqual(runtime['nextSharedProvider']['candidateIDs'],['hp-b'])
        self.assertEqual(len(runtime['pendingCapabilities']),1)
        self.assertEqual(set(runtime['providerFamilies']),{'blocked-toggle-mode','hp-ratio-toggle-mode'})
        changed = copy.deepcopy(mixed)
        changed['modeProviders']['rejections'] = {'enemy_a':[{'candidateId':'hp-b','reasons':[{'code':'ability-lifecycle-unsupported'}]}]}
        refreshed = integrate_runtime_status(updated,changed,candidates)
        self.assertEqual(refreshed['runtimeSupport']['nextSharedProvider']['family'],'mode-provider-lifecycle')
        self.assertEqual(refreshed['enemies']['enemy_a']['missingLinks'],updated['enemies']['enemy_a']['missingLinks'])

    def test_family_counts_do_not_double_count_enemies_and_hp_label_is_distinct(self):
        mixed = report()
        hp = {'id':'hp-a','kind':'hp-ratio-toggle-mode','events':{'ON_BUFF_START':[{'kind':'switch-mode','modeIndex':2}]}}
        mixed['modeProviders']['selections']['enemy_a'].append(hp)
        mixed['modeProviders']['selections']['enemy_b'] = [dict(hp,id='hp-b')]
        result = mode_provider_status(mixed,{'enemy_a'})
        self.assertEqual(result['autoModeProviders'],3)
        self.assertEqual(result['autoModeProviderEnemies'],2)
        self.assertEqual(result['providerFamilies']['hp-ratio-toggle-mode']['enemies'],2)
        self.assertEqual(result['providerFamilies']['hp-ratio-toggle-mode']['encounterEnemies'],1)
        self.assertIn('HP比例条件',_provider_label(hp))
        self.assertNotIn('阻挡',_provider_label(hp))

    def test_cached_pure_mode_passive_candidates_form_one_lifecycle_task(self):
        candidates={'candidates':[{'candidateId':f'passive-{index}','enemyId':'enemy_a','family':'mode-passive',
            'completeGraphContainsOnlySwitchMode':True,
            'rejectionReasons':['mode-entry-and-detach-lifecycle-required','complete-ability-fields-not-retained-in-selected-caches']} for index in (1,2)]}
        updated=integrate_runtime_status(plan(),report(),candidates)
        request=updated['runtimeSupport']['nextSharedProvider']
        self.assertEqual(request['family'],'mode-provider-lifecycle')
        self.assertEqual(request['candidateIDs'],['passive-1','passive-2'])
        self.assertEqual(request['candidateFamilies'],['mode-passive'])


if __name__ == '__main__':
    unittest.main()
