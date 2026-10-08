"""Source-pin and fill-only contracts using synthetic alias evidence."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import enemy_prefab_aliases as aliases


class PrefabAliasTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "candidates.json"
        self.source_hashes = {"some/path/data_enemy_prefab_catalog_current.json": "prefab-sha",
                              "some\\path\\data_enemy_spine_events.json": "animation-sha"}
        self.catalog = {"source": {"hashes": {
            "prefabs": {"sha256": "prefab-sha"}, "timAnimations": {"sha256": "animation-sha"},
            "database": {"sha256": "database-sha"}, "classification": {"sha256": "old-status"}},
            "supplementContentFingerprint": "supplement-content"}, "enemies": {
                "target": {"enemyId": "target", "prefabKey": "source", "candidate": True, "stableAllLevels": True,
                           "databaseLevels": [{"level": 0, "prefabKey": "source", "explicitlyDefined": True},
                                              {"level": 1, "prefabKey": "source", "explicitlyDefined": False}]}}}
        self.write_catalog()
        patcher = patch.object(aliases, "CANDIDATES", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_catalog(self):
        self.path.write_text(json.dumps(self.catalog), encoding="utf-8")

    def load(self, **overrides):
        args = {"source_hashes": self.source_hashes, "database_sha256": "database-sha", "supplement_hash": "supplement-content"}
        return aliases.load_aliases(**{**args, **overrides})

    def test_pinned_aliases_ignore_status_changes_and_require_complete_level_evidence(self):
        mapping, fingerprint = self.load()
        self.assertEqual(mapping, {"target": "source"})
        self.catalog["source"]["hashes"]["classification"]["sha256"] = "new-status"
        self.catalog["counts"] = {"remaining": 0}
        self.write_catalog()
        self.assertEqual(self.load(), (mapping, fingerprint))
        self.catalog["enemies"]["target"]["databaseLevels"][1]["prefabKey"] = "different"
        self.write_catalog()
        with self.assertRaisesRegex(ValueError, "level evidence"):
            self.load()

    def test_source_changes_raise_and_a_missing_candidate_file_is_empty(self):
        changes = [{"database_sha256": "changed"}, {"supplement_hash": "changed"},
                   {"source_hashes": {**self.source_hashes, "some/path/data_enemy_prefab_catalog_current.json": "changed"}}]
        for change in changes:
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "source changed|supplement changed"):
                self.load(**change)
        self.path.unlink()
        self.assertEqual(self.load()[0], {})

    def test_only_candidate_stable_nonidentity_rows_are_loaded(self):
        for field, value in [("candidate", False), ("stableAllLevels", False), ("prefabKey", ""), ("prefabKey", "target")]:
            with self.subTest(field=field, value=value):
                original = copy.deepcopy(self.catalog)
                self.catalog["enemies"]["target"][field] = value
                self.write_catalog()
                self.assertEqual(self.load()[0], {})
                self.catalog = original

    def test_apply_keeps_original_ids_and_conflicts_without_mutating_inputs(self):
        prefabs = {"source": {"components": [{"pathID": 1}]}, "existing": {"components": [{"pathID": 2}]}}
        animations = {"source": {"animations": {"Attack": {"duration": 1, "events": []}, "Skill": {"duration": 2, "events": []}}},
                      "existing": {"metadata": "keep", "animations": {"Attack": {"duration": 3, "events": []}}}}
        originals = copy.deepcopy((prefabs, animations))
        new_prefabs, new_animations, receipt = aliases.apply_aliases(prefabs, animations, {"new": "source", "existing": "source"})
        self.assertEqual((prefabs, animations), originals)
        self.assertEqual(new_prefabs["existing"], prefabs["existing"])
        self.assertEqual(new_prefabs["new"], prefabs["source"])
        self.assertEqual(new_animations["existing"]["animations"]["Attack"]["duration"], 3)
        self.assertEqual(new_animations["existing"]["metadata"], "keep")
        self.assertEqual(receipt["addedPrefabs"], 1)
        self.assertEqual(receipt["addedAnimations"], 3)
        self.assertEqual(receipt["affectedEnemyIds"], ["existing", "new"])
        self.assertEqual(len(receipt["prefabConflicts"]), 1)
        self.assertEqual(len(receipt["animationOverlay"]["conflicts"]), 1)
        new_prefabs["new"]["components"][0]["pathID"] = 999
        self.assertEqual((prefabs, animations), originals)

    def test_missing_source_does_not_resolve_transitively(self):
        prefabs = {"first": {"components": []}}
        new_prefabs, _, receipt = aliases.apply_aliases(prefabs, {}, {"second": "first", "third": "second"})
        self.assertIn("second", new_prefabs)
        self.assertNotIn("third", new_prefabs)
        self.assertIn({"enemyId": "third", "prefabKey": "second", "asset": "prefab"}, receipt["unavailableSources"])


if __name__ == "__main__":
    unittest.main()
