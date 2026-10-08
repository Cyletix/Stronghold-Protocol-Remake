"""Public overlay boundaries; no client datasets are read by these tests."""
import copy
import tempfile
import unittest
from pathlib import Path

from enemy_animation_overlay import load_supplement, merge_animations, supplement_fingerprint


class AnimationOverlayTests(unittest.TestCase):
    def test_fill_only_preserves_both_inputs_and_attributes_each_added_name(self):
        base = {"enemy_a": {"metadata": {"original": True}, "animations": {
            "Attack": {"duration": 1, "events": [{"event": "OnAttack", "t": 0.5}]}}}}
        source = {"path": "enemy_a.json", "gitBlob": "blob", "sha256": "sha", "spineVersion": "3.8"}
        supplement = {"schemaVersion": 1, "source": {"commit": "commit"}, "enemies": {
            "enemy_a": {"source": source, "animations": {"Skill": {"duration": 2, "events": []}}},
            "enemy_b": {"source": {**source, "path": "enemy_b.json"}, "animations": {"Attack": {"duration": 1, "events": []}}}}}
        originals = copy.deepcopy((base, supplement))
        merged, receipt = merge_animations(base, supplement)
        self.assertEqual((base, supplement), originals)
        self.assertEqual(merged["enemy_a"]["metadata"], base["enemy_a"]["metadata"])
        self.assertEqual(merged["enemy_a"]["animations"]["Attack"], base["enemy_a"]["animations"]["Attack"])
        self.assertEqual(receipt["addedAnimations"], 2)
        self.assertEqual(receipt["addedEnemies"], 1)
        self.assertEqual(receipt["affectedEnemyIds"], ["enemy_a", "enemy_b"])
        self.assertEqual(receipt["animationSources"]["enemy_a"]["Skill"], source)
        merged["enemy_a"]["animations"]["Skill"]["duration"] = 99
        receipt["animationSources"]["enemy_a"]["Skill"]["path"] = "changed"
        self.assertEqual((base, supplement), originals)

    def test_same_names_tolerate_timing_noise_but_never_overwrite_conflicts(self):
        attack = {"duration": 1, "events": [{"event": "OnAttack", "t": 0.5}, {"event": "Foot", "t": 0.2}]}
        base = {"enemy_a": {"animations": {"Attack": attack, "DurationConflict": attack, "EventConflict": attack}}}
        supplement = {"enemies": {"enemy_a": {"source": {"sha256": "sha"}, "animations": {
            "Attack": {"duration": 1.00009, "events": [{"event": "Foot", "t": 0.2, "payload": "unused"}, {"event": "OnAttack", "t": 0.50009}]},
            "DurationConflict": {"duration": 1.001, "events": attack["events"]},
            "EventConflict": {"duration": 1, "events": [{"event": "OnAttack", "t": 0.501}, {"event": "Foot", "t": 0.2}]},
        }}}}
        merged, receipt = merge_animations(base, supplement)
        self.assertEqual(merged, base)
        self.assertEqual(receipt["addedAnimations"], 0)
        self.assertEqual(receipt["metadataCounts"]["matchingAnimations"], 1)
        self.assertEqual([row["animation"] for row in receipt["conflicts"]], ["DurationConflict", "EventConflict"])
        self.assertTrue(all(row["resolution"] == "retain-base" for row in receipt["conflicts"]))
        # Duplicate event multiplicity and event names are part of the contract.
        supplement["enemies"]["enemy_a"]["animations"] = {"Attack": {"duration": 1, "events": [*attack["events"], attack["events"][0]]}}
        self.assertEqual(len(merge_animations(base, supplement)[1]["conflicts"]), 1)

    def test_missing_supplement_is_an_empty_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(load_supplement(Path(directory) / "missing.json"), {})
        base = {"enemy_a": {"animations": {}}}
        merged, receipt = merge_animations(base, {})
        self.assertEqual(merged, base)
        self.assertIsNot(merged, base)
        self.assertEqual(receipt["addedEnemies"], 0)
        self.assertEqual(receipt["conflicts"], [])

    def test_fingerprint_ignores_cache_counters_but_tracks_animation_and_source_changes(self):
        a = {"source": {"commit": "a"}, "counts": {"cachedBlobs": 0}, "enemies": {"enemy_a": {"animations": {"Attack": {"duration": 1}}}}}
        b = copy.deepcopy(a)
        b["counts"]["cachedBlobs"] = 723
        self.assertEqual(supplement_fingerprint(a), supplement_fingerprint(b))
        b["source"]["commit"] = "b"
        self.assertNotEqual(supplement_fingerprint(a), supplement_fingerprint(b))
        b["source"]["commit"] = "a"
        b["enemies"]["enemy_a"]["animations"]["Attack"]["duration"] = 2
        self.assertNotEqual(supplement_fingerprint(a), supplement_fingerprint(b))


if __name__ == "__main__":
    unittest.main()
