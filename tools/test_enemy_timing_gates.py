"""Shared native event gate boundaries, without per-enemy special cases."""
import copy
import unittest

from enemy_timing_gates import TIME_MODES, compile_timing_gate


class EnemyTimingGateTests(unittest.TestCase):
    def test_event_gate_ignores_configured_delay_on_both_sides_of_hit(self):
        for delay, hit in [(1.134, 0.6), (0.1, 0.6), (1.134, 1.1333)]:
            with self.subTest(delay=delay, hit=hit):
                fields = {"_timeMode": 0, "_preDelay": delay, "_waitForAttackEvent": 1}
                timing = {"animation": "Attack", "duration": 3.5, "hit": hit,
                          "sourceAnimations": [{"name": "Attack_Up", "speed": 1}]}
                originals = copy.deepcopy((fields, timing))
                result = compile_timing_gate(fields, timing)
                self.assertTrue(result["accepted"])
                self.assertEqual(result["timing"], timing)
                self.assertEqual(result["contract"]["ignoredConfiguredPreDelay"], delay)
                self.assertEqual(result["contract"]["eventId"], 19)
                result["timing"]["sourceAnimations"][0]["speed"] = 99
                self.assertEqual((fields, timing), originals)

    def test_other_known_enums_are_named_but_cannot_inherit_attack_speed_contract(self):
        self.assertEqual(TIME_MODES, {0: "FROM_ATTACK_SPEED", 1: "FROM_ANIMATION", 2: "SPECIFIED", 3: "LOAD_FROM_BLACKBOARD"})
        for mode in [1, 2, 3, 4, None, False]:
            with self.subTest(mode=mode):
                self.assertFalse(compile_timing_gate({"_timeMode": mode, "_preDelay": 0, "_waitForAttackEvent": 1}, {"duration": 2, "hit": 1})["accepted"])

    def test_missing_events_and_delay_only_branches_do_not_manufacture_hit_times(self):
        fields = {"_timeMode": 0, "_preDelay": 1.134, "_waitForAttackEvent": 1}
        for timing in [None, {"duration": 2}, {"duration": 2, "hit": [0.5, 1]},
                       {"duration": 2, "hit": 3}, {"duration": 0, "hit": 0}, {"duration": 2, "hit": float("nan")}]:
            with self.subTest(timing=timing):
                self.assertFalse(compile_timing_gate(fields, timing)["accepted"])
        for wait in [0, False, None, "1", 1.0]:
            with self.subTest(wait=wait):
                self.assertFalse(compile_timing_gate({**fields, "_waitForAttackEvent": wait}, {"duration": 2, "hit": 1})["accepted"])


if __name__ == "__main__":
    unittest.main()
