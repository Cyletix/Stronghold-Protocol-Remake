"""Web mode adapter must not inherit unknown parent attack contracts."""
from copy import deepcopy
import unittest

from build_client_stat_buffs import supported_profile, WEB_MODE_GRAPH
from arkresearch.client_logic import ClientLogicStore
from compile_client_stat_buffs import compile_profiles


class WebStatModeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = ClientLogicStore("jp-36.7.22-client-logic")
        cls.db_hash = evidence.manifest["database"]["sha256"]
        cls.profiles = compile_profiles(evidence)["profiles"]

    def supported(self, profile, owners=None, database=None):
        return supported_profile(profile, owners or ["char_290_vigna"], database or self.db_hash)

    def test_actual_two_skill_proofs_bind_full_character_and_contract(self):
        for skill in ("skchr_vigna_1", "skchr_vigna_2"):
            p = self.profiles[skill]
            self.assertTrue(self.supported(p))
            self.assertEqual(p["mode_graph"]["proofs"][0]["combat_graph_sha256"], WEB_MODE_GRAPH)

    def test_parent_new_contract_and_missing_owner_reject(self):
        p = self.profiles["skchr_vigna_2"]
        self.assertFalse(supported_profile(p))
        self.assertFalse(self.supported(p, ["char_102_texas"]))
        self.assertFalse(self.supported(p, ["char_290_vigna", "char_102_texas"]))
        self.assertFalse(self.supported(p, database="different-evidence"))
        for extra in ({"future_controller": True}, {"kind": "passive"}):
            self.assertFalse(self.supported({**p, **extra}))

    def test_foreign_graph_equal_modes_are_not_enough(self):
        p = deepcopy(self.profiles["skchr_vigna_2"])
        p["mode_graph"]["proofs"][0]["combat_graph_sha256"] = "0" * 64
        self.assertFalse(self.supported(p))

    def test_mode_graph_unknown_fields_or_missing_proof_reject(self):
        for change in ({"futureState": 1}, {"kind": "same_shape"}, {"proofs": []},
                       {"characters": ["char_290_vigna", "char_290_vigna"]}):
            p = deepcopy(self.profiles["skchr_vigna_2"])
            p["mode_graph"].update(change)
            self.assertFalse(self.supported(p))

    def test_missing_duplicate_invalid_mode_identity_reject(self):
        for change in ({"futureEffect": 1}, {"selected_mode": True}, {"selected_mode": 100},
                       {"mode_path_ids": ["1", "1"]}, {"mode_path_ids": []},
                       {"mode_path_ids": [123]}, {"character_path_id": "0"},
                       {"char_id": "char_102_texas"}):
            p = deepcopy(self.profiles["skchr_vigna_2"])
            p["mode_graph"]["proofs"][0].update(change)
            self.assertFalse(self.supported(p))

    def test_stat_modifier_formula_must_also_match(self):
        p = deepcopy(self.profiles["skchr_vigna_2"])
        p["attack_modifiers"]["base_attack_time"]["scale"] = 100
        self.assertFalse(self.supported(p))
        self.assertTrue(supported_profile(self.profiles["skchr_glassb_1"]))

    def test_final_defense_accepts_only_verified_zero_constant(self):
        p = self.profiles["skchr_gyuki_2"]
        self.assertTrue(supported_profile(p))
        self.assertEqual(p["attack_constants"], {"defense_scale": 0})
        for value in ({"defense_scale": False}, {"defense_scale": .5}, {"defense_scale": -1},
                      {"atk_scale": 0}, {"defense_scale": 0, "future_stat": 1}):
            self.assertFalse(supported_profile({**p, "attack_constants": value}))
        self.assertFalse(self.supported({**self.profiles["skchr_vigna_2"], "attack_constants": {"defense_scale": 0}}))


if __name__ == "__main__":
    unittest.main()
