"""Adapt strictly compiled client stat graphs to the Web runtime, without unpacking."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT.parent / "src"), str(ROOT.parent / "tools")]
from arkresearch.client_logic import ClientLogicStore
from compile_client_stat_buffs import compile_profiles

RULES = {"atk": {"field": "atk_pct", "scale": 100},
         "def": {"field": "defense_pct", "scale": 100},
         "attack_speed": {"field": "aspd", "scale": 1},
         "base_attack_time": {"field": "interval_add", "scale": 1}}
PROFILE_KEYS = {"blackboard_keys", "kind", "attack_modifiers", "bundle", "root_path_id"}
MODE_KEYS = {"kind", "characters", "proofs", "evidence_database_sha256", "binding_source", "script_supplement", "boundary"}
PROOF_KEYS = {"char_id", "bundle", "bundle_sha256", "character_path_id", "mode_path_ids", "selected_mode", "combat_graph_sha256"}
# This Web consumer has reviewed only this one-target physical melee contract.
# Future parent contracts must be adapted explicitly instead of inheriting support.
WEB_MODE_GRAPH = "8cda7a5dd2c5d3b04d25a8280d52f36bfc73470ec852f5618568cbf4f8b9f198"


def supported_mode(mode, char_ids, database_sha256):
    if (not isinstance(mode, dict) or set(mode) != MODE_KEYS
            or mode["kind"] != "all_serialized_modes_preserve_attack"
            or not database_sha256 or mode["evidence_database_sha256"] != database_sha256
            or not char_ids or not isinstance(mode["characters"], list)
            or not set(char_ids).issubset(mode["characters"])
            or len(set(mode["characters"])) != len(mode["characters"])
            or not isinstance(mode["proofs"], list)):
        return False
    proof_ids = []
    for proof in mode["proofs"]:
        if (not isinstance(proof, dict) or set(proof) != PROOF_KEYS
                or proof["combat_graph_sha256"] != WEB_MODE_GRAPH
                or not isinstance(proof["mode_path_ids"], list) or not proof["mode_path_ids"]
                or type(proof["selected_mode"]) is not int
                or not 0 <= proof["selected_mode"] < len(proof["mode_path_ids"])
                or len(set(proof["mode_path_ids"])) != len(proof["mode_path_ids"])
                or any(not isinstance(value, str) or not re.fullmatch(r"-?[1-9][0-9]*", value)
                       for value in [proof["character_path_id"], *proof["mode_path_ids"]])
                or not re.fullmatch(r"[0-9a-f]{64}", proof["bundle_sha256"])):
            return False
        proof_ids.append(proof["char_id"])
    return sorted(proof_ids) == sorted(mode["characters"])


def supported_profile(profile, char_ids=None, database_sha256=None):
    return (set(profile) in (PROFILE_KEYS, PROFILE_KEYS | {"mode_graph"}, PROFILE_KEYS | {"attack_constants"}) and profile["kind"] == "timed"
            and ("mode_graph" not in profile or supported_mode(profile["mode_graph"], char_ids, database_sha256))
            and ("attack_constants" not in profile or
                 (profile["attack_constants"] == {"defense_scale": 0}
                  and type(profile["attack_constants"]["defense_scale"]) in (int, float)))
            and bool(profile["blackboard_keys"])
            and set(profile["blackboard_keys"]) == set(profile["attack_modifiers"])
            and len(set(profile["blackboard_keys"])) == len(profile["blackboard_keys"])
            and all(key in RULES and value == RULES[key]
                    for key, value in profile["attack_modifiers"].items()))


def build():
    evidence = ClientLogicStore("jp-36.7.22-client-logic")
    compiled = compile_profiles(evidence)
    paths = ["data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json",
             "data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json", "web/battle_levels.json"]
    skills, chars, battle = [json.loads((ROOT / p).read_text(encoding="utf-8")) for p in paths]
    identities = {}
    for character in battle["operators"]:
        for row in chars[character["charId"]]["skills"]:
            identities.setdefault(row["skillId"], []).append(character["charId"])
    profiles, rejected = {}, {}
    for skill_id in sorted(identities):
        levels = skills[skill_id]["levels"]
        prefab_ids = {level["prefabId"] for level in levels}
        if not any(key in compiled["profiles"] for key in prefab_ids):
            continue
        if len(prefab_ids) != 1:
            rejected[skill_id] = "level_prefab_changes"; continue
        prefab_id = next(iter(prefab_ids)); profile = compiled["profiles"][prefab_id]
        if not supported_profile(profile, identities[skill_id], evidence.manifest["database"]["sha256"]):
            rejected[skill_id] = "unsupported_web_graph_contract"; continue
        for level in levels:
            bb = {row["key"]: row["value"] for row in level["blackboard"]}
            if (len(bb) != len(level["blackboard"]) or set(bb) != set(profile["blackboard_keys"])
                    or any(type(value) not in (int, float) or not (-1e6 < value < 1e6) for value in bb.values())
                    or any(bb.get(key, 0) < 0 for key in ("atk", "def"))
                    or level["skillType"] not in ("MANUAL", "AUTO") or level["duration"] <= 0
                    or level["spData"]["spCost"] <= 0):
                rejected[skill_id] = "unsupported_source_level"; break
        else:
            profiles[skill_id] = {"prefabId": prefab_id, "modifiers": profile["attack_modifiers"],
                                  "levelCount": len(levels), "charIds": sorted(identities[skill_id]),
                                  "rootPathId": profile["root_path_id"]}
            if "mode_graph" in profile:
                profiles[skill_id]["modeGraph"] = profile["mode_graph"]
            if "attack_constants" in profile:
                profiles[skill_id]["constants"] = profile["attack_constants"]
    sources = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in paths}
    for name in ("tools/compile_client_stat_buffs.py", "tools/compile_client_modes.py", "src/arkresearch/client_logic.py", "src/arkresearch/client_scripts.py"):
        sources["../" + name] = hashlib.sha256((ROOT.parent / name).read_bytes()).hexdigest()
    return {"version": 2, "evidenceId": compiled["evidence_id"], "sourceVersion": compiled["source_version"],
            "artifactHashes": compiled["artifact_hashes"], "sources": sources,
            "boundary": "Timed self stat graphs, including literal zero final defense. Mode graphs require the reviewed physical melee contract and exact character proof. CN parameters bind by exact prefab and keys; JP/CN behavior and native frame timing remain unverified. Other handlers and talents are separate.",
            "profiles": profiles, "rejected": rejected}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build()
    output = "// Generated by tools/build_client_stat_buffs.py; strict graph bindings.\nwindow.ArkClientStatBuffData=" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n"
    target = ROOT / "web/client_stat_buff_data.js"
    if args.check:
        if target.read_text(encoding="utf-8") != output:
            raise ValueError("Client stat graph data drift")
    else:
        target.write_text(output, encoding="utf-8")
    print(json.dumps({"skills": len(result["profiles"]), "prefabs": len({p["prefabId"] for p in result["profiles"].values()}),
                      "levels": sum(p["levelCount"] for p in result["profiles"].values()), "rejected": result["rejected"]}, ensure_ascii=False))
