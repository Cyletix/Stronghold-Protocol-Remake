"""Pure boundaries for atomic blocked-mode provider compilation."""
from copy import deepcopy
import unittest

from enemy_mode_blocked_provider import (ABILITY, ABILITY_FLAGS, ATTRIBUTE_KEYS,
                                         BUFF_DEFAULTS, CHECKER, compile_blocked_provider)


def fixture():
    buff = {**deepcopy(BUFF_DEFAULTS), "attributes": {k: [] for k in ATTRIBUTE_KEYS},
            "buffKey": "sample", "templateKey": "switch", "blackboard": [{"key": "mode", "value": 1.0, "valueStr": ""}]}
    switch = {"$type": "Torappu.Battle.Action.Nodes+SwitchMode, Assembly-CSharp", "_modeIndex": 1,
              "_loadModeFromBlackboard": True, "_restoreDefault": False, "_restartFSM": False, "_targetType": "TARGET"}
    fields = {**ABILITY_FLAGS, "_metadata": {"namedAsAlias": "", "blackboardPrefix": ""},
              "_selector": {"m_FileID": 0, "m_PathID": 0}, "_checker": {"m_FileID": 0, "m_PathID": 2},
              "_buffs": [buff], "_buffsWhenToggleOff": [], "_unmanagedBuffsWhenToggleOn": []}
    return {
        "candidateId": "sample|ability", "enemyId": "sample", "family": "blocked-toggle",
        "ability": {"scriptType": ABILITY, "fields": fields, "completeFields": True},
        "ownership": {"rootSharedTalentMount": True, "modeIndices": [], "mountedInInitialMode": True,
                      "component": {"ownershipOverlayEligible": True, "gameObjectPathID": "parent"},
                      "initialModeEvidence": {"candidate": True, "modeIndex": 0},
                      "sameGameObjectRootSharedTalents": [{"cnMatchStatus": "shared-fields-match",
                          "fields": {"m_Enabled": 1, "_checkValidBySkillIndex": [], "_defaultModeIndex": -1, "_isSilenceable": 1}}]},
        "condition": {"checkerReference": {"status": "resolved", "targetComponentKey": "checker"},
                      "checker": {"componentKey": "checker", "scriptType": CHECKER,
                                  "predicateFields": {"_blockMinCnt": 1, "_blockMaxCnt": -1, "_useBlockAsMin": 1, "_buffsToBlockee": []}},
                      "checkerOwnership": {"ownershipOverlayEligible": True, "gameObjectPathID": "parent"}},
        "buffGraphs": [{"declarationComplete": True, "fieldPath": "/_buffs/0", "fields": deepcopy(buff),
                        "bindingStatus": "matched-pinned-template", "payloadSha256": "test-hash", "url": "test:source",
                        "payload": {"templateKey": "switch", "effectKey": "", "onEventPriority": "DEFAULT",
                                    "eventToActions": {"ON_BUFF_START": [switch], "ON_BUFF_FINISH": [dict(switch, _restoreDefault=True)]}}}],
        "sourceRefs": [{"cache": "fixture"}],
        "modeActivationDependencies": {"mountedModeComponents": [{"componentKey": "aura", "scriptType": "GlobalAuraAbility", "modeIndices": [0]}]},
    }


TARGET = {"scope": "TARGET", "binding": "owner", "evidenceLevel": "Inferred", "evidenceRef": "test:owner-contract"}


class BlockedProviderTests(unittest.TestCase):
    def test_complete_graph_consumes_default_cnt_and_silence_without_claiming_whole_enemy(self):
        candidate = fixture()
        before = deepcopy(candidate)
        result = compile_blocked_provider(candidate, {0: {"combat": "ranged"}, 1: {"combat": "melee"}}, 0, target_binding=TARGET)
        self.assertTrue(result["accepted"], result["rejections"])
        ir = result["selection"]
        self.assertEqual(ir["events"]["ON_BUFF_START"][0]["modeIndex"], 1)
        self.assertEqual(ir["events"]["ON_BUFF_FINISH"][0]["modeIndex"], 0)
        self.assertEqual(ir["condition"]["countBlackboardKey"], "cnt")
        self.assertTrue(ir["silenceable"])
        self.assertEqual(ir["targetBinding"], TARGET)
        self.assertEqual(ir["remainingActivationComponents"][0]["componentKey"], "aura")
        self.assertFalse(ir["enemyImplementationComplete"])
        self.assertEqual(candidate, before)

    def test_missing_owner_or_mode_and_extra_actions_reject_entire_provider(self):
        for label in ("missing-mode", "missing-target", "sibling-skill", "restart-fsm", "unmanaged", "attribute-effect"):
            with self.subTest(label=label):
                c = fixture()
                modes, target = {0, 1}, TARGET
                if label == "missing-mode":
                    modes = {1}
                elif label == "missing-target":
                    target = None
                elif label == "sibling-skill":
                    c["buffGraphs"][0]["payload"]["eventToActions"]["ON_BUFF_START"].append({"$type": "Torappu.Battle.Action.Nodes+TriggerEnemySkill, Assembly-CSharp", "_skillName": "followup"})
                elif label == "restart-fsm":
                    c["buffGraphs"][0]["payload"]["eventToActions"]["ON_BUFF_START"][0]["_restartFSM"] = True
                elif label == "unmanaged":
                    c["ability"]["fields"]["_unmanagedBuffsWhenToggleOn"] = [deepcopy(c["ability"]["fields"]["_buffs"][0])]
                else:
                    for b in (c["ability"]["fields"]["_buffs"][0], c["buffGraphs"][0]["fields"]):
                        b["attributes"]["abnormalFlags"] = [5]
                result = compile_blocked_provider(c, modes, 0, target_binding=target)
                self.assertFalse(result["accepted"])
                self.assertIsNone(result["selection"])
                self.assertTrue(result["rejections"])


if __name__ == "__main__":
    unittest.main()
