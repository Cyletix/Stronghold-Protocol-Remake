"""Small synthetic contract/cache tests; no full inventory or native data reads."""
from copy import deepcopy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import build_enemy_mode_template_plan as planner


def minimal_sources():
    primary_a, primary_b = list(planner.TEMPLATES)[:2]
    # Deliberately non-sorted frozen order: this identity/order must survive.
    members = ["enemy_z", "enemy_a", "enemy_m"]
    catalog = {"sourceFingerprint": "inventory-1", "memberIDs": members,
               "enemies": {key: {"enemyId": key, "name": key, "inEncounterPool": key == "enemy_a",
                                 "primarySubclass": primary_b if key == "enemy_a" else primary_a,
                                 "modes": [{"modeIndex": 0}, {"modeIndex": 2}]}
                           for key in members}}
    ownership = {"sourceFingerprint": "ownership-1", "source": {"inventorySourceFingerprint": "inventory-1"},
                 "enemies": {key: {"status": "fixture-matched"} for key in members}}
    return catalog, ownership


def fake_analyzers():
    parameters = [{"name": "source-owner", "required": True},
                  {"name": "ability-name", "required": True},
                  {"name": "mode-index", "required": False}]
    canonical = "named-ability-resolution"
    module = SimpleNamespace(
        SUBCLASSES={"fixture-linked": "Fixture reference linked", "fixture-predicate": "Fixture predicate"},
        OPERATORS={canonical: {"label": "Named lookup", "purpose": "Shared across classes", "parameters": parameters},
                   "hp-ratio-checker": {"label": "HP checker", "purpose": "Shared condition"}})
    alias_module = SimpleNamespace(
        SUBCLASSES=module.SUBCLASSES,
        OPERATORS={"reborn-handler-lookup": {"label": "Handler lookup", "purpose": "Alias of the same lookup", "parameters": parameters}})

    def primary(row, ownership):
        return {"applicable": True, "subclasses": ["fixture-predicate", "fixture-linked", "fixture-linked"],
                "sharedOperators": ["hp-ratio-checker", canonical, canonical],
                "missingLinks": ["fixture-source-gap"],
                "sourceRefs": [{"componentKey": row["enemyId"]}], "implementationReady": False}

    def aliases(row, ownership):
        return {"applicable": row["inEncounterPool"], "subclasses": ["fixture-linked"],
                "sharedOperators": ["reborn-handler-lookup"], "missingLinks": [], "implementationReady": False}

    function = Mock(side_effect=primary)
    alias_function = Mock(side_effect=aliases)
    return {"fixture": (module, function), "alias": (alias_module, alias_function)}, function, alias_function


class EnemyModeTemplatePlanTests(unittest.TestCase):
    def test_fixed_primary_classes_and_complete_members_are_preserved(self):
        catalog, ownership = minimal_sources()
        original = deepcopy(catalog)
        analyzers, _, _ = fake_analyzers()
        with patch.object(planner, "ANALYZERS", analyzers):
            result = planner.compile_plan(catalog, ownership, {"fixture": 1})
            self.assertEqual(result["memberIDs"], ["enemy_z", "enemy_a", "enemy_m"])
            self.assertEqual(set(result["templates"]), set(planner.TEMPLATES))
            grouped = [eid for group in result["templates"].values() for eid in group["memberIDs"]]
            self.assertCountEqual(grouped, catalog["memberIDs"])
            self.assertEqual(len(grouped), len(set(grouped)))
            for eid, row in result["enemies"].items():
                self.assertEqual(row["primarySubclass"], catalog["enemies"][eid]["primarySubclass"])
                self.assertEqual(row["modeIndices"], [0, 2])
            for mutation in ("duplicate", "missing", "unknown-primary"):
                invalid = deepcopy(catalog)
                if mutation == "duplicate":
                    invalid["memberIDs"].append("enemy_z")
                elif mutation == "missing":
                    invalid["enemies"].pop("enemy_m")
                else:
                    invalid["enemies"]["enemy_z"]["primarySubclass"] = "invented-new-primary"
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                    planner.compile_plan(invalid, ownership, {"fixture": 1})
        self.assertEqual(catalog, original)

    def test_shared_operator_merges_across_classes_and_keeps_parameter_order(self):
        catalog, ownership = minimal_sources()
        analyzers, _, _ = fake_analyzers()
        with patch.object(planner, "ANALYZERS", analyzers):
            first = planner.compile_plan(catalog, ownership, {"fixture": 1})
            second = planner.compile_plan(catalog, ownership, {"fixture": 1})
        self.assertEqual(first, second)
        self.assertNotIn("reborn-handler-lookup", first["operators"])
        operator = first["operators"]["named-ability-resolution"]
        self.assertEqual(operator["memberIDs"], catalog["memberIDs"])
        self.assertEqual(operator["encounterIDs"], ["enemy_a"])
        self.assertEqual(operator["templateIDs"], sorted({r["primarySubclass"] for r in catalog["enemies"].values()}))
        self.assertEqual(operator["rawOperatorIDs"], ["named-ability-resolution", "reborn-handler-lookup"])
        self.assertEqual([p["name"] for p in operator["parameters"]], ["source-owner", "ability-name", "mode-index"])
        self.assertEqual(first["counts"]["crossClassOperators"], 2)
        self.assertEqual(first["batches"]["bindings"]["memberIDs"], sorted(catalog["memberIDs"]))
        for enemy in first["enemies"].values():
            self.assertEqual(enemy["requiredOperators"], ["hp-ratio-checker", "named-ability-resolution"])
            self.assertEqual(enemy["subclasses"], ["fixture-linked", "fixture-predicate"])

    def test_unchanged_cache_skips_analysis_and_changed_input_requires_refresh(self):
        catalog, ownership = minimal_sources()
        analyzers, analyze, alias_analyze = fake_analyzers()
        with tempfile.TemporaryDirectory(prefix="mode-plan-test-") as directory:
            root = Path(directory)
            source_path, own_path, output_path = root / "catalog.json", root / "ownership.json", root / "plan.json"
            planner.write(source_path, catalog)
            planner.write(own_path, ownership)

            def state():
                return {"rule": "fixture-rule", "files": {"catalog.json": planner.digest(source_path),
                                                           "ownership.json": planner.digest(own_path)}}

            with patch.multiple(planner, ROOT=root, CATALOG=source_path, OWNERSHIP=own_path,
                                OUTPUT=output_path, ANALYZERS=analyzers), patch.object(planner, "input_state", side_effect=state):
                first, hit = planner.ensure_plan()
                self.assertFalse(hit)
                self.assertEqual(analyze.call_count, 3)
                before_bytes = output_path.read_bytes()
                analyze.reset_mock()
                alias_analyze.reset_mock()
                with patch.object(planner, "compile_plan", side_effect=AssertionError("Cache hit must not compile")):
                    cached, hit = planner.ensure_plan()
                self.assertTrue(hit)
                self.assertEqual(cached, first)
                analyze.assert_not_called()
                alias_analyze.assert_not_called()
                self.assertEqual(output_path.read_bytes(), before_bytes)

                changed = deepcopy(catalog)
                changed["enemies"]["enemy_a"]["name"] = "changed source label"
                planner.write(source_path, changed)
                with self.assertRaisesRegex(ValueError, "--refresh"):
                    planner.ensure_plan()
                analyze.assert_not_called()
                self.assertEqual(output_path.read_bytes(), before_bytes)
                updated, hit = planner.ensure_plan(refresh=True)
                self.assertFalse(hit)
                self.assertEqual(analyze.call_count, 3)
                self.assertEqual(updated["enemies"]["enemy_a"]["name"], "changed source label")
                self.assertEqual(updated["memberIDs"], first["memberIDs"])
                self.assertNotEqual(updated["inputs"], first["inputs"])


if __name__ == "__main__":
    unittest.main()
