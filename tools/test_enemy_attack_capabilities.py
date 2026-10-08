"""Public capability/reference boundaries, using synthetic records only."""
import unittest

from enemy_attack_capabilities import database_capabilities, root_evidence


def level(number, value="NONE", defined=True):
    return {"level": number, "enemyData": {"applyWay": {"m_defined": defined, "m_value": value}}}


def capability(records):
    return database_capabilities({"enemies": [{"Key": "enemy_test", "Value": records}]})["enemy_test"]


def component(path_id, cabin="local", **fields):
    return {"pathID": path_id, "cabin": cabin, "fields": fields}


def evidence(components, attack=None, source_capability=None):
    mode = component(10, _combat={"m_FileID": 0, "m_PathID": 0},
                     _attack=attack if attack is not None else {"m_FileID": 0, "m_PathID": 20})
    record = {"enemyId": "enemy_test", "name": "Test", "inEncounterPool": True,
              "evidence": {"rootModes": [{"modeIndex": 0, "modePathID": 10}]}}
    return root_evidence(record, [mode, *components], source_capability or {})


def attack_channel(result):
    return next(row for row in result["channels"] if row.get("channel") == "_attack")


class DatabaseCapabilityTests(unittest.TestCase):
    def test_only_defined_none_inherited_by_every_level_disables_basic_attack(self):
        cases = [
            ("undefined serialization default", [level(0, defined=False)], False, [None]),
            ("explicit NONE", [level(0)], True, ["NONE"]),
            ("later undefined inherits NONE", [level(0), level(1, "MELEE", False)], True, ["NONE", "NONE"]),
            ("later explicit MELEE overrides", [level(0), level(1, "MELEE")], False, ["NONE", "MELEE"]),
            ("initial unknown is not retroactively NONE", [level(0, defined=False), level(1)], False, [None, "NONE"]),
            ("missing field is unknown", [{"level": 0, "enemyData": {}}], False, [None]),
            ("empty level set is not proof", [], False, []),
            ("integer one is not explicit JSON true", [level(0, defined=1)], False, [None]),
        ]
        for label, records, expected, values in cases:
            with self.subTest(label=label):
                result = capability(records)
                self.assertEqual(result["basicAttackNotRequired"], expected)
                self.assertEqual([row["applyWay"] for row in result["levels"]], values)

    def test_inheritance_uses_level_order_and_retains_explicitness(self):
        result = capability([level(2, "RANGED", False), level(0), level(1, "MELEE", False)])
        self.assertTrue(result["basicAttackNotRequired"])
        self.assertEqual([row["level"] for row in result["levels"]], [0, 1, 2])
        self.assertEqual([row["explicitlyDefined"] for row in result["levels"]], [True, False, False])


class RootEvidenceTests(unittest.TestCase):
    def test_local_pptr_requires_a_unique_target_in_the_same_cabin(self):
        targets = [component(20, _enemyKey="summoned_enemy")]
        local = attack_channel(evidence(targets))
        self.assertEqual(local["family"], "summon-root")
        self.assertEqual(local["pathID"], 20)
        cases = [
            ("external file with matching local ID", targets, {"m_FileID": 3, "m_PathID": 20}),
            ("duplicate local ID", [*targets, component(20, _animKey="Attack")], None),
            ("ID exists only in another cabin", [component(20, cabin="other", _enemyKey="summoned_enemy")], None),
            ("target missing", [], None),
            ("reference has no path", targets, {"m_FileID": 0}),
            ("reference is not a PPtr", targets, 20),
        ]
        for label, candidates, pointer in cases:
            with self.subTest(label=label):
                channel = attack_channel(evidence(candidates, pointer))
                self.assertEqual(channel["family"], "unresolved-reference")
                self.assertNotIn("pathID", channel)
                self.assertNotIn("fields", channel)
        # An unrelated cabin's duplicate ID does not make the actual local
        # pointer ambiguous, and must never replace the local target.
        channel = attack_channel(evidence([*targets, component(20, cabin="other", _animKey="Attack")]))
        self.assertEqual(channel["family"], "summon-root")
        self.assertEqual(channel["cabin"], "local")

    def test_ambiguous_mode_and_null_root_are_not_behavior_capabilities(self):
        ambiguous = evidence([component(10, cabin="another", _attack={"m_FileID": 0, "m_PathID": 20}), component(20)])
        self.assertEqual(ambiguous["family"], "unresolved-reference")
        self.assertEqual(ambiguous["channels"], [{"modeIndex": 0, "family": "unresolved-reference"}])
        null = evidence([], {"m_FileID": 0, "m_PathID": 0})
        self.assertEqual(null["family"], "null-root")
        self.assertNotIn("basicAttackNotRequired", null)
        self.assertNotEqual(null["family"], "no-basic-attack")

    def test_field_inventory_is_a_queue_and_only_database_can_claim_no_basic_attack(self):
        # A field's existence is enough to queue research; even a false flag
        # does not claim that healing was executed or is already implemented.
        queued = evidence([component(20, _applyEPHeal=False)])
        self.assertEqual(queued["family"], "healing-root")
        self.assertNotIn("basicAttackNotRequired", queued)
        self.assertNotIn("implemented", queued)
        self.assertNotIn("verified", queued)
        explicit_none = capability([level(0), level(1, defined=False)])
        authoritative = evidence([], source_capability=explicit_none)
        self.assertEqual(authoritative["family"], "no-basic-attack")
        self.assertEqual(authoritative["databaseLevels"], explicit_none["levels"])
        self.assertEqual(attack_channel(authoritative)["family"], "unresolved-reference")


if __name__ == "__main__":
    unittest.main()
