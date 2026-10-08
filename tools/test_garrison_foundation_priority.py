"""Priority follows actual pool impact without claiming completed mechanisms."""
import unittest
from copy import deepcopy

from prioritize_garrison_foundations import build_priority
from advance_enemy_modes import apply_foundation_priority


def operator(ids):
    return dict(memberIDs=ids,encounterIDs=[],implementationState='pending-full-contract')


class FoundationPriorityTests(unittest.TestCase):
    def test_bound_body_keeps_missing_automatic_entry_visible(self):
        report={'gaps':{},'skillDispatch':{'candidateIDs':['pool-a|body'],
            'selections':{'pool-a':[{'id':'pool-a|body','modeIndices':[1],
                'initiallyMounted':False,'automaticModeTransitionComplete':False}]}}}
        plan={'operators':{'resolve-enemy-skill-trigger':operator(['pool-a'])},'runtimeSupport':{}}
        priority=build_priority(plan,report,{},['pool-a']);priority['contentSha256']='entry-fixture'
        family=priority['families']['skill-trigger-dispatch']
        self.assertEqual(family['pendingSkillIDs'],[])
        self.assertEqual(family['boundEntryPendingSkillIDs'],['pool-a|body'])
        self.assertEqual(family['alreadyBoundSkills'][0]['entryStatus'],'explicit-mode-only-entry-pending')
        next_task=apply_foundation_priority(plan,priority)['runtimeSupport']['nextSharedProvider']
        self.assertEqual(next_task['boundEntryPendingSkillIDs'],['pool-a|body'])

    def test_skill_dispatch_queue_excludes_selected_components_but_keeps_family_impact(self):
        plan={'operators':{'resolve-enemy-skill-trigger':operator(['pool-a'])},
            'runtimeSupport':{'pendingCapabilities':[]}}
        report={'gaps':{},'skillDispatch':{'candidateIDs':['pool-a|bound','pool-a|pending'],
            'selections':{'pool-a':[{'id':'pool-a|bound','modeIndices':[1]}]}}}
        priority=build_priority(plan,report,{},['pool-a']);priority['contentSha256']='skill-fixture'
        family=priority['families']['skill-trigger-dispatch']
        self.assertEqual(family['dependentEncounterCount'],1)
        self.assertEqual(family['pendingSkillIDs'],['pool-a|pending'])
        self.assertEqual(priority['counts']['boundEncounterSkillEnemies'],1)
        next_task=apply_foundation_priority(plan,priority)['runtimeSupport']['nextSharedProvider']
        self.assertEqual(next_task['candidateIDs'],['pool-a|pending'])
        self.assertEqual(next_task['alreadyBoundSkills'][0]['skillId'],'pool-a|bound')

    def test_pool_foundation_beats_wider_nonpool_and_generic_research_is_separate(self):
        source={'operators':{'resolve-enemy-skill-trigger':operator(['pool-a']),
            'compile-mode-attributes':operator([f'outside-{i}' for i in range(100)]),
            'resolve-entity-state-mode-call':operator(['pool-a','pool-b'])}}
        result=build_priority(source,{'gaps':{}},{},['pool-a','pool-b'])
        self.assertEqual(result['rankedFamilyIDs'][0],'skill-trigger-dispatch')
        self.assertEqual(result['families']['skill-trigger-dispatch']['dependentEncounterCount'],1)
        self.assertEqual(result['families']['skill-trigger-dispatch']['directCandidateCount'],0)
        self.assertFalse(result['researchSignals'][0]['actionableAsOneOperator'])
        self.assertNotIn('resolve-entity-state-mode-call',result['rankedFamilyIDs'])

    def test_fixed_action_cohort_retains_finished_members_and_manual_progress(self):
        report={'gaps':{'pool-a':['mode-dependent-projectile'],'pool-b':['mode-dependent-basic-action-contract']}}
        source={'enemies':{'pool-a':{'name':'a','tags':['multiple-projectile-keys']},'pool-b':{'name':'b','tags':[]}}}
        first=build_priority({'operators':{}},report,source,['pool-a','pool-b'])
        first['actions']['pool-a']['manualProgress']={'reviewed':True}
        second=build_priority({'operators':{}},{'gaps':{'pool-b':['mode-dependent-basic-action-contract']}},source,['pool-a','pool-b'],first)
        self.assertEqual(second['actionCohortIDs'],['pool-a','pool-b'])
        self.assertFalse(second['actions']['pool-a']['currentlyPending'])
        self.assertEqual(second['actions']['pool-a']['manualProgress'],{'reviewed':True})
        self.assertEqual(second['counts']['pendingActionEncounterEnemies'],1)

    def test_dispatch_retains_candidates_and_bound_provider_while_pool_foundation_wins(self):
        plan={'operators':{'resolve-enemy-skill-trigger':operator(['pool-a'])},
            'enemies':{'pool-a':{'requiredOperators':['extra-action'],'missingLinks':['other-state']}},
            'runtimeSupport':{'scope':'existing-boundary','alreadyBoundProviders':[{'providerId':'done'}],
                'pendingCapabilities':[{'family':'simple-nonpool','affectedEnemyIDs':['outside'],'candidateIDs':['keep-me']},
                                       {'family':'pool-candidate','affectedEnemyIDs':['pool-a'],'candidateIDs':['pool-next']}]}}
        before=deepcopy(plan)
        priority=build_priority(plan,{'gaps':{}},{},['pool-a']);priority['contentSha256']='fixture'
        result=apply_foundation_priority(plan,priority)
        self.assertEqual(plan,before)
        self.assertEqual(result['runtimeSupport']['nextSharedProvider']['family'],'skill-trigger-dispatch')
        self.assertEqual(result['runtimeSupport']['nextProviderCandidate']['family'],'pool-candidate')
        self.assertEqual(result['runtimeSupport']['pendingCapabilities'],before['runtimeSupport']['pendingCapabilities'])
        self.assertEqual(result['runtimeSupport']['alreadyBoundProviders'],before['runtimeSupport']['alreadyBoundProviders'])
        self.assertEqual(result['enemies'],before['enemies'])


if __name__=='__main__':
    unittest.main()
