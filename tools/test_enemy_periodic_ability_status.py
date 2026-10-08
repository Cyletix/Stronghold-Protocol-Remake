"""Complete periodic groups must not reduce EnemySkill or whole-enemy gaps."""
from copy import deepcopy
import unittest

from enemy_periodic_ability_status import periodic_ability_status
from advance_enemy_modes import integrate_runtime_status, prepare_batch, apply_foundation_priority
from prioritize_garrison_foundations import build_priority, render


def group(enemy):
    return dict(id=enemy+'|mode:1|periodic-ability-group',kind='mode-periodic-ability-group',modeIndex=1,
        attributes=[{'stat':'move_speed'}],
        periodics=[dict(id=enemy+'|self-damage',kind='self-damage-maxhp'),
                   dict(id=enemy+'|scream',kind='named-ability')],
        abilities={'ScreamAttack':{'kind':'direct-element-packet'}},
        normalAttackElement={'modeIndex':1,'channel':'combat'})


def receipt():
    return dict(gaps={'enemy_a':['other-mode-unresolved']},
        counts={'periodicAbilityGroups':999,'encounterPeriodicAbilityEnemies':2},
        skillDispatch={'candidateIDs':[f'enemy_a|skill:{i}' for i in range(27)],
            'selections':{'enemy_a':[{'id':f'enemy_a|skill:{i}'} for i in range(4)]}},
        periodicAbilities=dict(rule='complete-periodic-v1', sourceFingerprint='source-a',
            contract='work/enemy-periodic-ability-contract.json',
            selections={'enemy_a':[group('enemy_a')], 'enemy_b':[group('enemy_b')]},
            rejections={}))


class PeriodicAbilityProgressTests(unittest.TestCase):
    def test_groups_deduplicate_and_count_capabilities_separately(self):
        report=receipt()
        report['periodicAbilities']['selections']['enemy_a'].append(group('enemy_a'))
        status=periodic_ability_status(report, ['enemy_a'])
        self.assertEqual(status['counts'],dict(groups=2,enemies=2,encounterGroups=1,
            encounterEnemies=1,capabilityKinds=4,capabilityBindings=8))
        self.assertEqual(len(status['selectedGroupIDs']),2)
        self.assertEqual(status['capabilities']['direct-named-ability']['bindings'],2)

    def test_overlay_queue_and_priority_reuse_groups_without_closing_other_work(self):
        op=dict(label='shared',purpose='remaining contract',memberIDs=['enemy_a','enemy_b'],
            activeMemberIDs=['enemy_a','enemy_b'],encounterIDs=['enemy_a','enemy_b'],
            templateIDs=['mode'],implementationState='pending-full-contract')
        plan=dict(enemies={key:dict(inEncounterPool=True,missingLinks=['other-mode-unresolved'])
                          for key in ['enemy_a','enemy_b']},
            operators={'resolve-enemy-skill-trigger':op,'buff-template-dispatch':deepcopy(op)},
            batches={'actions':dict(label='shared',dependsOn=[],operatorIDs=['buff-template-dispatch'],
                output='complete groups',acceptance='keep remaining state')})
        before=deepcopy(plan)
        report=receipt()
        integrated=integrate_runtime_status(plan,report)
        self.assertEqual(integrated['runtimeSupport']['skillDispatch']['counts']['candidates'],27)
        self.assertEqual(integrated['runtimeSupport']['skillDispatch']['counts']['pendingSkills'],23)
        self.assertEqual(integrated['runtimeSupport']['periodicAbilities']['counts']['groups'],2)
        self.assertEqual(integrated['enemies']['enemy_a']['missingLinks'],['other-mode-unresolved'])
        self.assertEqual(integrated['operators'],before['operators'])
        self.assertEqual(plan,before)
        self.assertIs(integrate_runtime_status(integrated,report),integrated)
        queue=prepare_batch(integrated,{'counts':{}},'actions')
        self.assertEqual(len(queue['jobs'][0]['alreadyBoundPeriodicGroups']),2)
        self.assertEqual(queue['fullPhaseTransitionsCompleted'],0)
        priority=build_priority(integrated,report,{},['enemy_a','enemy_b'])
        priority['contentSha256']='periodic-fixture'
        next_step=apply_foundation_priority(integrated,priority)['runtimeSupport']['nextSharedProvider']
        self.assertEqual(len(next_step['alreadyBoundPeriodicGroups']),2)
        self.assertEqual(priority['counts']['pendingSkillComponents'],23)
        self.assertEqual(priority['counts']['fullEnemyMechanismsCompleted'],0)
        self.assertFalse(set(queue['periodicAbilities']['selectedGroupIDs']) & set(next_step['candidateIDs']))
        page=render(priority)
        self.assertIn('2 组 / 2 敌',page)
        self.assertIn('不抵扣 EnemySkill',page)
        withdrawn=deepcopy(report)
        withdrawn['periodicAbilities']['selections']={}
        refreshed=integrate_runtime_status(integrated,withdrawn)
        self.assertEqual(refreshed['runtimeSupport']['periodicAbilities']['counts']['groups'],0)
        self.assertEqual(refreshed['enemies']['enemy_a']['alreadyBoundPeriodicGroups'],[])
        self.assertEqual(refreshed['runtimeSupport']['skillDispatch']['counts']['pendingSkills'],23)
        self.assertEqual(refreshed['enemies']['enemy_a']['missingLinks'],['other-mode-unresolved'])


if __name__ == '__main__':
    unittest.main()
