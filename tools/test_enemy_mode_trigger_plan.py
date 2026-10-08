"""Pure semantic boundaries for frozen enemy trigger planning."""
from copy import deepcopy
import unittest

from enemy_mode_trigger_plan import analyze_triggers


def component(kind, fields=None, graphs=None):
    return {"scriptType": "Torappu.Battle.Abilities." + kind, "fields": fields or {}, "serializedGraphs": graphs or []}


class TriggerPlanTests(unittest.TestCase):
    def test_root_switch_keeps_trigger_skill_and_unknown_followup(self):
        switch = {"$type": "Torappu.Battle.Action.Nodes+SwitchMode", "_modeIndex": 1, "_targetType": "ABILITY_OWNER"}
        following = {"$type": "Torappu.Battle.Action.Nodes+TriggerEnemySkill", "_skillName": "Boom"}
        unknown = {"$type": "Torappu.Battle.Action.Nodes+FutureEffect", "value": 9}
        record = {"enemyId": "enemy_test", "components": {"a": component("AnimatedActionToOwnerAbility", graphs=[{"path": "/_actions/SerializedState", "nodes": [switch, following, unknown]}])},
                  "entrypoints": [{"kind": "mode-field", "modeIndex": 0, "status": "resolved", "targetComponentKey": "a"}],
                  "switchNodes": [{"componentKey": "a", "fieldPath": "/_actions/0", "fields": switch}],
                  "modes": [{"modeIndex": 1, "status": "resolved", "entityComponentKey": "e", "targetComponentKey": "m"}]}
        before = deepcopy(record)
        result = analyze_triggers(record, {})
        self.assertEqual(record, before)
        self.assertIn("root-switch-with-followup-actions", result["subclasses"])
        self.assertEqual(result["chains"][0]["actionGroups"][0]["sequence"], [switch, following, unknown])
        self.assertIn("trigger-enemy-skill", result["sharedOperators"])
        self.assertIn("action-future-effect", result["sharedOperators"])
        self.assertFalse(result["implementationReady"])

    def test_target_and_restore_default_never_assume_owner_or_mode_zero(self):
        record = {"enemyId": "enemy_test", "components": {"a": component("ActionToOwner")},
                  "switchNodes": [{"componentKey": "a", "fields": {"_modeIndex": 1, "_targetType": "TARGET"}},
                                  {"componentKey": "a", "fields": {"_modeIndex": 0, "_targetType": "SOURCE", "_restoreDefault": True}}],
                  "modes": [{"modeIndex": 0, "status": "resolved"}, {"modeIndex": 1, "status": "resolved"}]}
        result = analyze_triggers(record)
        targets = result["chains"][0]["modeTargets"]
        self.assertEqual([r["candidateModes"] for r in targets], [[], []])
        self.assertIn("action-target-entity-binding", result["missingLinks"])
        self.assertIn("active-default-or-mode-blackboard-value", result["missingLinks"])

    def test_hp_reference_links_predicate_but_buff_mode_is_not_switch(self):
        buff = {"buffKey": "test", "templateKey": "switch_mode", "blackboard": [{"key": "mode", "value": 1}]}
        toggle = component("ToggleablePassiveBuffAbility", {"_checker": {"m_PathID": 3}, "_buffs": [buff]})
        checker = component("HpRatioToggleChecker", {"_maxHpRatio": 0.5, "_useLTForMax": 0})
        record = {"enemyId": "enemy_test", "components": {"t": toggle, "h": checker},
                  "hpToggleCheckers": [{"componentKey": "h", "fields": checker["fields"]}],
                  "otherToggleComponents": [{"componentKey": "t", "scriptType": toggle["scriptType"], "fields": toggle["fields"]}],
                  "references": [{"sourceComponentKey": "t", "fieldPath": "/_checker", "status": "resolved", "targetComponentKey": "h"}]}
        result = analyze_triggers(record)
        self.assertIn("hp-checker-linked-toggle", result["subclasses"])
        self.assertIn("mode-parameter-consumer", result["missingLinks"])
        self.assertFalse(result["chains"][0]["modeSwitchNodesObserved"])
        self.assertEqual(result["chains"][0]["checker"]["predicateFields"], checker["fields"])

    def test_ineligible_ownership_cannot_attach_same_object(self):
        switch = {"_targetType": "TARGET", "_modeIndex": 1}
        record = {"enemyId": "enemy_test", "components": {"a": component("ActionToOwner"), "b": component("AbilitySequenceGroup")},
                  "switchNodes": [{"componentKey": "a", "fields": switch}]}
        ownership = {"components": {"a": {"gameObjectPathID": "same", "ownershipOverlayEligible": False},
                                     "b": {"gameObjectPathID": "same", "ownershipOverlayEligible": True}}}
        self.assertEqual(analyze_triggers(record, ownership)["chains"][0]["attachedComponents"], [])


if __name__ == "__main__":
    unittest.main()
