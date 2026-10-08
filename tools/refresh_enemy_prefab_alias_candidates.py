"""Refresh explicit prefabKey joins for a frozen enemy cohort.

Default runs only check source pins. --refresh updates source evidence for the
same members; --include-new-gaps can add current missing-source members, never
remove previously successful members. This tool does not import runtime data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from enemy_animation_overlay import merge_animations, supplement_fingerprint

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator"
DEFAULT_DATABASE = ROOT / "data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json"
DEFAULT_OUTPUT = ROOT / "work/enemy-prefab-alias-candidates.json"
CLASSIFICATION = ROOT / "work/enemy-action-template-catalog.json"
SUPPLEMENT = ROOT / "work/enemy-animation-supplement.json"
TEMPLATES = ("source-prefab", "animation-source")
RULE_VERSION = "defined-prefab-key-all-levels-v1"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def source_record(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {"path": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path), "sha256": digest.hexdigest()}


def current_gaps(classification):
    return {key: row for key, row in classification["enemies"].items()
            if row["primaryTemplate"] in TEMPLATES and row.get("importGaps")}


def frozen_members(old, classification, include_new):
    # The fixed family and membership survive import success and reclassification.
    members = {key: dict(row) for key, row in old.get("enemies", {}).items()}
    if not members or include_new:
        for key, row in current_gaps(classification).items():
            members.setdefault(key, row)
    return members


def generate(old, members, classification, database, prefabs, tim, supplement, hashes, content_hash):
    animations, _ = merge_animations(tim, supplement)
    levels_by_id = {item["Key"]: item["Value"] for item in database["enemies"] if item["Key"] in members}
    rows = {}
    for enemy_id, member in sorted(members.items()):
        record = classification["enemies"].get(enemy_id, member)
        current, levels = None, []
        for entry in sorted(levels_by_id.get(enemy_id, []), key=lambda value: value["level"]):
            raw = entry.get("enemyData", {}).get("prefabKey", {})
            if raw.get("m_defined") is True:
                current = raw.get("m_value")
            levels.append({"level": entry["level"], "prefabKey": current,
                           "explicitlyDefined": raw.get("m_defined") is True})
        keys = {level["prefabKey"] for level in levels}
        stable = bool(levels) and len(keys) == 1 and all(isinstance(key, str) and key for key in keys)
        key = next(iter(keys)) if stable else None
        family = member["primaryTemplate"]
        row = {"enemyId": enemy_id, "name": record["name"], "primaryTemplate": family,
               "inEncounterPool": record["inEncounterPool"], "databaseLevels": levels,
               "stableAllLevels": stable, "prefabKey": key, "alias": stable and key != enemy_id,
               "evidenceLevel": "Verified source-field mapping; not full behavior validation"}
        # Older frozen identity rows did not retain name-level evidence. Seed it
        # from the existing classification once, then preserve it on refreshes.
        missing = member.get("missingAnimationKeys", member.get("evidence", record.get("evidence", {})).get("missingAnimationKeys", []))
        row["missingAnimationKeys"] = missing
        if not stable:
            row["reason"] = "missing-or-level-dependent-prefab-key"
        elif key == enemy_id:
            row["reason"] = "identity-key-no-new-alias"
        else:
            source_animations = animations.get(key, {}).get("animations", {})
            original_animations = animations.get(enemy_id, {}).get("animations", {})
            # Retain the original missing-name evidence after a successful import,
            # just as the original missing-prefab family is retained above.
            aliases = {}
            for alias in record.get("evidence", {}).get("animationAliases", []):
                if alias.get("animKey") and alias.get("animName"):
                    aliases.setdefault(alias["animKey"], []).append(alias["animName"])
            matching = {}
            for logical in missing:
                matched = []
                for target in aliases.get(logical, [logical]):
                    matched.extend([target] if target in source_animations else
                                   sorted(name for name in source_animations if name.startswith(target + "_")))
                if matched:
                    matching[logical] = sorted(set(matched))
            has_prefab = key in prefabs
            prefab_candidate = family == "source-prefab" and has_prefab
            animation_candidate = family == "animation-source" and bool(matching)
            row.update(hasTimPrefab=has_prefab, hasTimAnimations=bool(tim.get(key, {}).get("animations")),
                       hasSupplementAnimations=bool(supplement.get("enemies", {}).get(key, {}).get("animations")),
                       newAnimationNames=sorted(set(source_animations) - set(original_animations)),
                       missingAnimationKeys=missing, missingNamesFound=matching,
                       coversDeclaredMissingNames=bool(missing) and len(matching) == len(missing),
                       sourcePrefabPointer="/prefabs/" + key if has_prefab else None,
                       sourceAnimationPointer="/" + key + "/animations" if source_animations else None,
                       supplementSource=supplement.get("enemies", {}).get(key, {}).get("source"),
                       canSupplyMissingPrefab=prefab_candidate,
                       canSupplyMissingAnimationNames=animation_candidate,
                       candidate=prefab_candidate or animation_candidate)
            row["reason"] = "existing-explicit-alias-source" if row["candidate"] else "alias-has-no-required-source-or-name"
        rows[enemy_id] = row
    candidates = [row for row in rows.values() if row.get("candidate")]
    counts = {
        "scopedEnemies": len(rows), "byTemplate": dict(Counter(row["primaryTemplate"] for row in rows.values())),
        "stableAllLevels": sum(row["stableAllLevels"] for row in rows.values()),
        "nonIdentityStableAliases": sum(row["alias"] for row in rows.values()),
        "candidateEnemies": len(candidates), "candidateEncounterEnemies": sum(row["inEncounterPool"] for row in candidates),
        "missingPrefabCandidates": sum(row.get("canSupplyMissingPrefab", False) for row in rows.values()),
        "missingAnimationCandidates": sum(row.get("canSupplyMissingAnimationNames", False) for row in rows.values()),
        "allDeclaredAnimationNamesFound": sum(row.get("coversDeclaredMissingNames", False) for row in rows.values()),
        "newAnimationNamesAcrossCandidates": sum(len(row.get("newAnimationNames", [])) for row in candidates),
        "reasons": dict(Counter(row["reason"] for row in rows.values())),
    }
    representatives = []
    for family in TEMPLATES:
        group = sorted((row for row in candidates if row["primaryTemplate"] == family),
                       key=lambda row: (not row["inEncounterPool"], row["enemyId"]))
        if group:
            representatives.append(group[0])
    for row in candidates:
        if len(representatives) >= 2:
            break
        if row not in representatives:
            representatives.append(row)
    scope = old.get("scope", {"pendingEnemiesAtSnapshot": classification["counts"]["pendingEnemies"],
                              "templates": list(TEMPLATES),
                              "rule": "Explicit defined prefabKey and level inheritance; one stable nonempty key at every level. No suffix inference or downloads."})
    return {"schemaVersion": 1, "ruleVersion": RULE_VERSION, "scope": scope,
            "source": {"tim": classification["source"], "supplement": supplement.get("source", {}),
                       "hashes": hashes, "supplementContentFingerprint": content_hash},
            "counts": counts, "boundaries": old.get("boundaries", [
                "Asset identity lookup only; not proof of full behavior support.",
                "Keep original enemy IDs/stats. Fill missing assets; never overwrite conflicts."]),
            "representatives": representatives, "enemies": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Pinned Tim asset directory")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--refresh", action="store_true", help="Refresh source evidence for the fixed saved cohort")
    parser.add_argument("--include-new-gaps", action="store_true", help="With --refresh, add current source/animation gaps; never remove saved members")
    parser.add_argument("--dry-run", action="store_true", help="Report cache/refresh outcome without writing")
    args = parser.parse_args()
    if args.include_new_gaps and not args.refresh:
        parser.error("--include-new-gaps requires --refresh")
    old = read(args.output) if args.output.is_file() else {}
    if not old and not args.refresh:
        parser.error("Candidate file absent; use --refresh to create its initial fixed cohort")
    paths = {"database": args.database.resolve(), "prefabs": args.source.resolve() / "data_enemy_prefab_catalog_current.json",
             "timAnimations": args.source.resolve() / "data_enemy_spine_events.json", "supplement": SUPPLEMENT}
    hashes = {key: source_record(path) for key, path in paths.items()}
    supplement = read(SUPPLEMENT)
    content_hash = supplement_fingerprint(supplement)
    old_source = old.get("source", {})
    same = (old.get("ruleVersion") == RULE_VERSION and
            all(hashes[key]["sha256"] == old_source.get("hashes", {}).get(key, {}).get("sha256")
                for key in ("database", "prefabs", "timAnimations")) and
            content_hash == old_source.get("supplementContentFingerprint"))
    if same and not args.refresh:
        print(json.dumps({"cacheHit": True, "written": False, "members": len(old.get("enemies", {})),
                          "candidateEnemies": old["counts"]["candidateEnemies"], "output": str(args.output)}, ensure_ascii=False))
        return
    if not args.refresh:
        parser.error("Asset source changed; use --refresh to update the fixed cohort (no file was written)")
    classification = read(CLASSIFICATION)
    members = frozen_members(old, classification, args.include_new_gaps)
    hashes["classification"] = source_record(CLASSIFICATION)
    result = generate(old, members, classification, read(paths["database"]), read(paths["prefabs"])["prefabs"],
                      read(paths["timAnimations"]), supplement, hashes, content_hash)
    if not args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_name(args.output.name + ".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(args.output)
    print(json.dumps({"cacheHit": same, "written": not args.dry_run, "members": len(members),
                      "addedMembers": len(set(members) - set(old.get("enemies", {}))),
                      "counts": result["counts"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
