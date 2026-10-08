"""Pure full-chain and namespace boundaries for the HP passive family."""
from copy import deepcopy
import unittest

from enemy_mode_hp_provider import (CHECKER, bind_carrier_blackboard, compile_hp_condition,
                                    compile_hp_provider)
from enemy_mode_passive_effects import DAMAGE_DEFAULTS
from test_enemy_mode_blocked_provider import TARGET, fixture as blocked_fixture


FIELDS = {"_minHpRatio": 0.0, "_maxHpRatio": 1.0, "_useLTForMax": 0,
          "_restoreDelay": 0.0, "_toggleOnce": 0, "_setInitialToggle": 0,
          "_initialToggle": 1, "_loadMinHpRatioFromBlackboard": 0}
BOARD = {"rage.hp_ratio": .5, "rage.damage_scale": 1.5, "rage.def": 1, "rage.magic_resistance": .8,
         "other.hp_ratio": .9, "hp_ratio": .1}


def fixture():
    candidate = blocked_fixture()
    candidate["family"] = "hp-ratio-toggle"
    checker = candidate["condition"]["checker"]
    checker["scriptType"] = CHECKER
    checker["predicateFields"] = deepcopy(FIELDS)
    talent = candidate["ownership"]["sameGameObjectRootSharedTalents"][0]
    talent["fields"]["_overwriteTalentKey"] = ""
    talent["ancestorGameObjects"] = [{"name": "Rage", "pathID": "parent"}]
    second = deepcopy(candidate["buffGraphs"][0])
    second["fieldPath"] = "/_buffs/1"
    second["fields"].update(buffKey="sample_rage", templateKey="damage_scale[out]", blackboard=[],
                            overrideEffectKey="rage-fx", audioSignal="rage-audio")
    second["fields"]["attributes"]["attributeModifiers"] = [
        {"attributeType": stat, "formulaItem": 1, "value": 0.0, "loadFromBlackboard": 1,
         "fetchBaseValueFromSourceEntity": 0} for stat in (2, 3)]
    second["payload"] = {"templateKey": "damage_scale[out]", "effectKey": "", "onEventPriority": "DEFAULT",
                         "eventToActions": {"ON_OUTPUT_DAMAGE": [{"$type": "Torappu.Battle.Action.Nodes+DamageScale, Assembly-CSharp", **DAMAGE_DEFAULTS}]}}
    candidate["buffGraphs"].append(second)
    candidate["ability"]["fields"]["_buffs"].append(deepcopy(second["fields"]))
    return candidate


class HPProviderTests(unittest.TestCase):
    def test_every_effect_value_is_resolved_before_any_buff_is_exported(self):
        for key, invalid in [('damage_scale',None), ('damage_scale','bad'), ('damage_scale',-1), ('def','bad'), ('magic_resistance',None)]:
            board = dict(BOARD, **{'rage.'+key:invalid})
            result = compile_hp_provider(fixture(), {0,1}, 0, target_binding=TARGET, source_blackboard=board)
            self.assertFalse(result['accepted'])
            self.assertIsNone(result['selection'])
            self.assertIn('hp-effect-value-invalid', [r['code'] for r in result['rejections']])
        candidate = fixture()
        local = [{'key':'damage_scale','value':0}]
        candidate['buffGraphs'][1]['fields']['blackboard'] = local
        candidate['ability']['fields']['_buffs'][1]['blackboard'] = deepcopy(local)
        result = compile_hp_provider(candidate,{0,1},0,target_binding=TARGET,
            source_blackboard=dict(BOARD, **{'rage.damage_scale':None}))
        self.assertTrue(result['accepted'],result['rejections'])

    def test_complete_multi_buff_chain_preserves_effects_source_order_and_namespace(self):
        candidate = fixture()
        before = deepcopy(candidate)
        result = compile_hp_provider(candidate, {0, 1}, 0, target_binding=TARGET, source_blackboard=BOARD,
                                     checker_contract={"comparisonEpsilon": 1e-6})
        self.assertTrue(result["accepted"], result["rejections"])
        ir = result["selection"]
        self.assertEqual(ir["blackboard"]["namespace"], "rage")
        self.assertEqual(ir["blackboard"]["defaults"]["hp_ratio"], .5)
        self.assertEqual(ir["condition"]["maxHpRatio"], .5)
        self.assertEqual(ir["condition"]["sourceMaxHpRatio"], 1)
        self.assertFalse(ir["condition"]["loadMinFromBlackboard"])
        self.assertEqual(ir["condition"]["comparisonEpsilon"], 1e-6)
        self.assertEqual([b["sourceIndex"] for b in ir["buffs"]], [0, 1])
        self.assertEqual([e.get("stat", e["kind"]) for e in ir["buffs"][1]["effects"]], ["def", "magic_resistance", "damage-scale"])
        self.assertEqual(ir["events"]["ON_BUFF_START"][0]["modeIndex"], 1)
        self.assertEqual(ir["events"]["ON_BUFF_FINISH"][0]["modeIndex"], 0)
        self.assertEqual(ir["buffs"][1]["presentation"]["audioSignal"], "rage-audio")
        self.assertFalse(ir["originalVisualsComplete"])
        self.assertEqual(candidate, before)

    def test_failure_in_second_buff_or_missing_mode_exposes_no_partial_switch(self):
        for case in ("unknown-extra-action", "unsupported-attribute", "missing-second-graph", "restart", "missing-initial"):
            with self.subTest(case=case):
                c, modes = fixture(), {0, 1}
                if case == "unknown-extra-action":
                    c["buffGraphs"][1]["payload"]["eventToActions"]["ON_OUTPUT_DAMAGE"].append({"$type": "Unknown"})
                elif case == "unsupported-attribute":
                    c["buffGraphs"][1]["fields"]["attributes"]["attributeModifiers"][0]["formulaItem"] = 999
                    c["ability"]["fields"]["_buffs"][1] = deepcopy(c["buffGraphs"][1]["fields"])
                elif case == "missing-second-graph":
                    c["buffGraphs"].pop()
                elif case == "restart":
                    c["buffGraphs"][0]["payload"]["eventToActions"]["ON_BUFF_START"][0]["_restartFSM"] = True
                else:
                    modes = {1}
                result = compile_hp_provider(c, modes, 0, target_binding=TARGET, source_blackboard=BOARD)
                self.assertFalse(result["accepted"])
                self.assertIsNone(result["selection"])
                self.assertTrue(result["rejections"])

    def test_namespace_and_effective_condition_never_fall_back_from_invalid_values(self):
        candidate = fixture()
        board, errors = bind_carrier_blackboard(candidate, {"hp_ratio": .1, "other.hp_ratio": .2})
        self.assertIsNone(board)
        self.assertEqual(errors[0]["code"], "hp-carrier-blackboard-namespace-unresolved")
        candidate["ownership"]["sameGameObjectRootSharedTalents"][0]["fields"]["_overwriteTalentKey"] = "other"
        board, errors = bind_carrier_blackboard(candidate, BOARD)
        self.assertFalse(errors)
        self.assertEqual(board["namespace"], "other")
        field = dict(FIELDS, _loadMinHpRatioFromBlackboard=1)
        condition, errors = compile_hp_condition(field, {"defaults": {"hp_ratio": .3}})
        self.assertFalse(errors)
        self.assertEqual((condition["minHpRatio"], condition["maxHpRatio"]), (.3, 1))
        self.assertEqual(condition["comparisonEpsilon"], 1e-5)
        self.assertEqual(condition["comparisonContract"]["evidenceLevel"], "Inferred")
        for updated_fields, values, code in (
            (FIELDS, {"hp_ratio": "bad"}, "hp-blackboard-threshold-invalid"),
            (FIELDS, {"delay": .2}, "hp-restore-delay-runtime-unsupported"),
            (dict(FIELDS, _toggleOnce=1), {}, "hp-once-latch-runtime-unsupported"),
            (dict(FIELDS, _setInitialToggle=1), {}, "hp-initial-toggle-override-runtime-unsupported"),
        ):
            condition, errors = compile_hp_condition(updated_fields, {"defaults": values})
            self.assertIsNone(condition)
            self.assertIn(code, [error["code"] for error in errors])


if __name__ == "__main__":
    unittest.main()
