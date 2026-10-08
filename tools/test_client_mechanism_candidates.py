"""Evidence joins must not inflate registration or cross serialized-file scopes."""
import json
import unittest
from build_client_mechanism_candidates import field_diff, script_identity, template_closure, select_candidate, validate_inputs, ROOT


class CandidateEvidenceTests(unittest.TestCase):
    def test_native_indexes_must_match_selected_evidence(self):
        names = ['skill-index.json', 'skill-bindings.json', 'component-shapes.json',
                 'skill-template-reachability.json', 'metadata/types.json',
                 'metadata/method-addresses.json', 'metadata/native-summary.json']
        inputs = {name: 'old' for name in names}
        artifacts = {name: {'sha256': 'old'} for name in names}
        validate_inputs({**inputs, 'script-types.json': 'supplement'}, artifacts)
        for name in names:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Local evidence/SQLite mismatch'):
                validate_inputs({**inputs, name: 'new'}, artifacts)

    def test_query_never_substitutes_cached_evidence(self):
        result = {'evidenceId': 'old', 'sourceVersion': 'version', 'prefabs': {'skill': {'value': 1}},
                  'groups': [{'id': 'group', 'prefabIds': ['skill']}]}
        for request in [{'prefab': 'skill'}, {'group': 'group'}]:
            with self.assertRaisesRegex(ValueError, 'another evidence ID'):
                select_candidate(result, 'new', **request)
            self.assertEqual(select_candidate(result, 'old', **request)['evidenceId'], 'old')
        with self.assertRaisesRegex(ValueError, 'Unknown candidate ID'):
            select_candidate(result, 'old', prefab='absent')

    def test_script_pointer_is_scoped_by_external_file(self):
        script = {"m_AssemblyName": "Assembly-CSharp.dll", "m_Namespace": "Torappu", "m_ClassName": "A"}
        scripts = {("CAB-a", "9223372036854775807"): script}
        bundle = {"externals": {"CAB-root": ["archive:/CAB-a/CAB-a", "archive:/CAB-b/CAB-b"]}}
        ref = {"m_FileID": 1, "m_PathID": "9223372036854775807"}
        self.assertEqual(script_identity(bundle, ref, scripts)["type"], "Torappu.A")
        self.assertEqual(script_identity(bundle, {**ref, "m_FileID": 2}, scripts)["status"], "missing_script")
        self.assertEqual(script_identity(bundle, {**ref, "m_FileID": 3}, scripts)["status"], "missing_external_file")
        self.assertEqual(script_identity(bundle, {**ref, "m_FileID": True}, scripts)["status"], "invalid_reference")
        self.assertEqual(script_identity(bundle, {**ref, "m_PathID": 9223372036854775807}, scripts)["status"], "invalid_reference")

    def test_ambiguous_file_never_guessed(self):
        result = script_identity({"externals": {"one": [], "two": []}}, {"m_FileID": 0, "m_PathID": "1"}, {})
        self.assertEqual(result["status"], "ambiguous_serialized_file")

    def test_differences_keep_absence_types_values_and_order(self):
        diff = field_diff({"flag": 1, "actions": [1, 2], "removed": None},
                          {"flag": True, "actions": [2, 1], "added": None})
        by_path = {x["path"]: x for x in diff}
        self.assertEqual(set(by_path), {"flag", "actions", "removed", "added"})
        self.assertEqual(by_path["actions"]["actual"], [2, 1])
        self.assertFalse(by_path["added"]["expectedPresent"])
        self.assertFalse(by_path["removed"]["actualPresent"])

    def test_template_closure_reports_cycles_and_missing_without_invention(self):
        templates = {"a": {"event": [{"$type": "Action", "templateKey": "b"}]},
                     "b": {"children": [{"templateKey": "a"}, {"templateKey": "missing"}]}}
        self.assertEqual(template_closure(["a"], templates), (["a", "b"], ["missing"], ["Action"]))

    def test_real_inventory_conserves_ids_and_registration_counts(self):
        data = json.loads((ROOT / "work/client-logic/mechanism-candidates.json").read_text(encoding="utf-8"))
        bindings = json.loads((ROOT / "work/client-logic/skill-bindings.json").read_text(encoding="utf-8"))["bindings"]
        groups = [p for group in data["groups"] for p in group["prefabIds"]]
        self.assertEqual(sorted(groups), sorted(data["prefabs"]))
        self.assertEqual(len(groups), len(set(groups)))
        registered = {s for skills in data["webHandlers"]["registrations"].values() for s in skills}
        self.assertEqual(data["summary"]["registeredWebSkillIds"], len(registered & bindings.keys()))
        for prefab_id, prefab in data["prefabs"].items():
            for consumer in prefab["consumers"]:
                self.assertIn(prefab_id, bindings[consumer["skillId"]]["prefabs"])
                self.assertEqual(bool(consumer["webRegistrations"]), consumer["skillId"] in registered)
        for prefab_id in ['skchr_snhunt_1', 'skchr_snhunt_2']:
            consumer = next(row for row in data['prefabs'][prefab_id]['consumers'] if row['skillId'] == prefab_id)
            self.assertTrue({'ArkHunter', 'ArkOperatorCombat'} <= set(consumer['webRegistrations']))

    def test_real_scripts_resolve_canonical_component(self):
        data = json.loads((ROOT / "work/client-logic/mechanism-candidates.json").read_text(encoding="utf-8"))
        components = data["prefabs"]["skcom_atk_up"]["components"]
        self.assertEqual({x["script"]["type"] for x in components},
                         {"Torappu.Battle.CastSkill", "Torappu.Battle.Abilities.ActiveBuffAbility"})
        self.assertTrue(all(not x["differences"] for x in components))
        for component in components:
            key = component["script"]["assembly"] + ":" + component["script"]["type"]
            self.assertEqual(data["nativeTypes"][key]["status"], "resolved")

    def test_mode_proof_and_rejection_remain_queryable(self):
        data = json.loads((ROOT / "work/client-logic/mechanism-candidates.json").read_text(encoding="utf-8"))
        proof = data["prefabs"]["skchr_vigna_2"]["dpsModeGraph"]
        self.assertEqual(proof["characters"], ["char_290_vigna"])
        self.assertEqual(len(proof["proofs"][0]["mode_path_ids"]), 2)
        self.assertEqual(data["prefabs"]["skchr_podego_1"]["dpsModeRejection"], "mode_changes_attack_or_selector_graph")
        self.assertEqual(data["prefabs"]["skchr_gyuki_2"]["dpsAttackConstants"], {"defense_scale": 0})
        self.assertIsNone(data["prefabs"]["skchr_vigna_2"]["dpsAttackConstants"])
        for name in ("tools/compile_client_modes.py", "src/arkresearch/client_scripts.py"):
            self.assertIn("parent/" + name, data["inputs"])


if __name__ == "__main__":
    unittest.main()
