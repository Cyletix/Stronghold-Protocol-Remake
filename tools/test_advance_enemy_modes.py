"""Small in-memory boundaries for integrating Buff source graphs into a queue."""
from copy import deepcopy
import unittest
from unittest.mock import patch

import advance_enemy_modes as advance


GRAPH_GAP = "referenced-template-action-graph-not-in-mode-cache"
RUNTIME_GAP = "buff-event-dispatch-target-scope-and-complete-actions-pending"
DEPENDENCIES = ("resolve-buff-template-graph", "buff-template-dispatch", "action-sequence-dispatch",
                "dispatch-ability-lifecycle-event", "switch-mode", "bind-buff-mode-parameter")


def minimal_plan():
    members = ["enemy_z", "enemy_a"]
    enemies = {}
    for eid, primary, requested in ((members[0], "class-a", ["shared-buff"]),
                                    (members[1], "class-b", ["shared-buff", "second-buff"])):
        enemies[eid] = dict(enemyId=eid, inEncounterPool=eid == "enemy_a", primarySubclass=primary,
            requiredOperators=["resolve-buff-template-graph"], missingLinks=[GRAPH_GAP],
            analyses={"fixture": dict(sharedOperators=["resolve-buff-template-graph"], missingLinks=[GRAPH_GAP],
                nextRequests=[dict(operator="resolve-buff-template-graph", parameters=dict(templateKey=key)) for key in requested])})
    operators = {op: dict(label=op, purpose="Fixture shared contract", memberIDs=members if op == "resolve-buff-template-graph" else [],
                         encounterIDs=["enemy_a"] if op == "resolve-buff-template-graph" else [],
                         templateIDs=["class-a", "class-b"] if op == "resolve-buff-template-graph" else [],
                         implementationState="pending-full-contract") for op in DEPENDENCIES}
    return dict(memberIDs=members, enemies=enemies, operators=operators,
        templates={primary: dict(memberIDs=[eid], sharedOperators=["resolve-buff-template-graph"], subclasses={})
                   for eid, primary in (("enemy_z", "class-a"), ("enemy_a", "class-b"))},
        batches={"bindings": dict(label="Bindings", dependsOn=[], output="bound graphs", acceptance="exact source matches",
                                   operatorIDs=["resolve-buff-template-graph", "bind-buff-mode-parameter"], memberIDs=members),
                 "actions": dict(label="Actions", dependsOn=["bindings"], output="complete actions", acceptance="preserve sequence",
                                 operatorIDs=["buff-template-dispatch", "action-sequence-dispatch", "switch-mode"], memberIDs=[])},
        counts=dict(crossClassOperators=1))


def binding_result(version, complete):
    return dict(inputs={"sourceVersion": version}, counts={"matched": 2 if complete else 1},
        templates={"shared-buff": dict(status="matched-pinned-template", usages=[{"enemyId": "enemy_z"}, {"enemyId": "enemy_a"}],
                                       events=[{"event": "OnStart", "actions": ["SwitchMode", "TriggerEnemySkill"]}],
                                       switchModeNodes=[{"_modeIndex": 1}]),
                   "second-buff": dict(status="matched-pinned-template" if complete else "missing-template",
                                       usages=[{"enemyId": "enemy_a"}], events=[], switchModeNodes=[])})


class AdvanceEnemyModeTests(unittest.TestCase):
    def test_parameter_rule_change_reuses_complete_payloads_without_source_queries(self):
        source = {'origin': 'pinned-source'}
        state = dict(catalogSha256='same-frozen-source', resolverSha256='old-rule', source=source)
        old = dict(inputs=state, templates={'mode': dict(status='matched-pinned-template',
            usages=[dict(enemyId='enemy_a', componentKey='ability', fieldPath='/_buffs/0', blackboard=[])],
            payload=dict(templateKey='mode', eventToActions={'ON_BUFF_START': [
                {'$type': 'Torappu.Battle.Action.Nodes+SwitchMode, Assembly-CSharp',
                 '_loadModeFromBlackboard': True, '_modeIndex': 0}]}),
            url='pinned-cached-source', payloadSha256='source-hash')})
        plan = dict(inputs=dict(files={advance.CATALOG.relative_to(advance.ROOT).as_posix(): 'same-frozen-source'}))
        with patch.object(advance.buffs, 'source_state', return_value=source), \
             patch.object(advance, 'digest', return_value='new-rule'), \
             patch.object(type(advance.BINDINGS), 'is_file', return_value=True), \
             patch.object(advance, 'read', return_value=old), patch.object(advance, 'write'), \
             patch.object(advance.buffs, 'query_templates') as query, \
             patch.object(advance.buffs, 'collect_requests') as scan:
            result, cached = advance.bind_missing_sources(plan)
        self.assertFalse(cached)
        self.assertTrue(result['sourcePayloadsReused'])
        query.assert_not_called()
        scan.assert_not_called()
        row = result['templates']['mode']['parameterBindings'][0]
        self.assertEqual(row['candidateModeIndex'], 0)
        self.assertEqual(row['parameterStatus'], 'literal-fallback-missing-local-mode')

    def test_one_event_graph_propagates_dependencies_across_primary_classes(self):
        source = minimal_plan()
        before = deepcopy(source)
        bindings = binding_result("complete-v1", True)
        with patch.object(advance, "digest", return_value="integrator-fixture"), patch.object(advance, "write") as write:
            integrated = advance.integrate_bindings(source, bindings)
        self.assertEqual(source, before)
        write.assert_called_once_with(advance.PLAN, integrated)
        for op in DEPENDENCIES[1:]:
            self.assertEqual(integrated["operators"][op]["memberIDs"], ["enemy_z", "enemy_a"])
            self.assertEqual(integrated["operators"][op]["templateIDs"], ["class-a", "class-b"])
            self.assertEqual(integrated["operators"][op]["encounterIDs"], ["enemy_a"])
            for eid in source["memberIDs"]:
                self.assertIn(op, integrated["enemies"][eid]["requiredOperators"])
        actions = advance.prepare_batch(integrated, bindings, "actions")
        self.assertEqual(actions["memberIDs"], ["enemy_a", "enemy_z"])
        self.assertEqual({job["operatorId"] for job in actions["jobs"]},
                         {"buff-template-dispatch", "action-sequence-dispatch", "switch-mode"})
        self.assertTrue(all(job["affectedEnemyIDs"] == ["enemy_z", "enemy_a"] for job in actions["jobs"]))
        self.assertTrue(all(job["affectedTemplateIDs"] == ["class-a", "class-b"] for job in actions["jobs"]))
        # Source binding must leave the complete action/runtime work pending.
        self.assertTrue(all(job["runtimeStatus"] == "pending-full-contract" for job in actions["jobs"]))

    def test_all_exact_requests_required_cache_is_idempotent_and_missing_source_reopens(self):
        partial = binding_result("partial-v1", False)
        complete = binding_result("complete-v2", True)
        regressed = binding_result("partial-v3", False)
        with patch.object(advance, "digest", return_value="integrator-fixture"), patch.object(advance, "write") as write:
            incomplete_plan = advance.integrate_bindings(minimal_plan(), partial)
            self.assertTrue(incomplete_plan["enemies"]["enemy_z"]["buffGraphRequestsResolved"])
            self.assertFalse(incomplete_plan["enemies"]["enemy_a"]["buffGraphRequestsResolved"])
            pending = advance.prepare_batch(incomplete_plan, partial, "bindings")
            self.assertIn("resolve-buff-template-graph", [job["operatorId"] for job in pending["jobs"]])
            self.assertNotIn("resolve-buff-template-graph", pending["resolvedSourceTasks"])

            complete_plan = advance.integrate_bindings(incomplete_plan, complete)
            joined = advance.prepare_batch(complete_plan, complete, "bindings")
            self.assertIn("resolve-buff-template-graph", joined["resolvedSourceTasks"])
            self.assertNotIn("resolve-buff-template-graph", [job["operatorId"] for job in joined["jobs"]])
            self.assertTrue(all(row["buffGraphRequestsResolved"] for row in complete_plan["enemies"].values()))
            self.assertTrue(all(GRAPH_GAP not in row["missingLinks"] for row in complete_plan["enemies"].values()))
            self.assertTrue(all(RUNTIME_GAP in row["missingLinks"] for row in complete_plan["enemies"].values()))

            write.reset_mock()
            cached = advance.integrate_bindings(complete_plan, complete)
            self.assertIs(cached, complete_plan)
            write.assert_not_called()

            reopened = advance.integrate_bindings(complete_plan, regressed)
            retry = advance.prepare_batch(reopened, regressed, "bindings")
            self.assertFalse(reopened["enemies"]["enemy_a"]["buffGraphRequestsResolved"])
            self.assertIn(GRAPH_GAP, reopened["enemies"]["enemy_a"]["missingLinks"])
            self.assertNotIn("resolve-buff-template-graph", retry["resolvedSourceTasks"])
            self.assertIn("resolve-buff-template-graph", [job["operatorId"] for job in retry["jobs"]])
            self.assertNotEqual(reopened["operators"]["resolve-buff-template-graph"]["implementationState"], "source-graphs-joined")
            self.assertEqual(reopened["enemies"]["enemy_a"]["resolvedBuffTemplateKeys"], ["shared-buff"])


if __name__ == "__main__":
    unittest.main()
