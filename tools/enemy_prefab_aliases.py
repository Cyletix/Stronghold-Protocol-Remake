"""Load source-pinned prefab aliases and fill missing assets under original IDs."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from enemy_animation_overlay import merge_animations

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "work/enemy-prefab-alias-candidates.json"
SOURCE_FILES = {
    "prefabs": "data_enemy_prefab_catalog_current.json",
    "timAnimations": "data_enemy_spine_events.json",
}


def _fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _source_hash(source_hashes, filename):
    values = {value for key, value in source_hashes.items()
              if str(key).replace("\\", "/").rsplit("/", 1)[-1] == filename}
    if len(values) != 1:
        raise ValueError(f"Prefab alias source hash missing or ambiguous: {filename}")
    return values.pop()


def load_aliases(source_hashes, database_sha256, supplement_hash):
    """Load frozen candidates; raise on changed assets instead of using stale aliases.

    source_hashes accepts filenames or paths as keys and SHA-256 strings as
    values. supplement_hash is supplement_fingerprint(), not the file SHA.
    Classification/report hashes deliberately do not affect this lookup.
    """
    if not CANDIDATES.is_file():
        return {}, _fingerprint({"mapping": {}})
    catalog = json.loads(CANDIDATES.read_text(encoding="utf-8-sig"))
    source = catalog.get("source", {})
    frozen = source.get("hashes", {})
    checked = {}
    for label, filename in SOURCE_FILES.items():
        actual = _source_hash(source_hashes, filename)
        expected = frozen.get(label, {}).get("sha256")
        if not expected or actual != expected:
            raise ValueError(f"Prefab alias source changed: {filename}; regenerate enemy-prefab-alias-candidates.json")
        checked[label] = actual
    expected_database = frozen.get("database", {}).get("sha256")
    if not expected_database or database_sha256 != expected_database:
        raise ValueError("Prefab alias database source changed; regenerate enemy-prefab-alias-candidates.json")
    expected_supplement = source.get("supplementContentFingerprint")
    if not expected_supplement or supplement_hash != expected_supplement:
        raise ValueError("Prefab alias animation supplement changed; regenerate enemy-prefab-alias-candidates.json")
    mapping = {}
    for enemy_id, row in sorted(catalog.get("enemies", {}).items()):
        key = row.get("prefabKey")
        if (row.get("candidate") is not True or row.get("stableAllLevels") is not True
                or not isinstance(key, str) or not key or key == enemy_id):
            continue
        levels = row.get("databaseLevels", [])
        if (row.get("enemyId") != enemy_id or not levels
                or levels[0].get("explicitlyDefined") is not True
                or any(level.get("prefabKey") != key for level in levels)):
            raise ValueError(f"Prefab alias candidate has inconsistent level evidence: {enemy_id}")
        mapping[enemy_id] = key
    fingerprint = _fingerprint({"mapping": mapping, "sources": checked,
                                "database": database_sha256, "supplement": supplement_hash})
    return mapping, fingerprint


def apply_aliases(prefabs, animations, mapping):
    """Fill target assets from exact source IDs; never rewrite existing assets.

    Source lookups use the original input, so aliases cannot silently resolve
    transitively through another alias inserted during this pass.
    """
    new_prefabs = copy.deepcopy(prefabs)
    added_prefabs, conflicts, unavailable = [], [], []
    supplement = {"schemaVersion": 1, "source": {"kind": "database-prefab-key-alias"}, "enemies": {}}
    for enemy_id, source_id in sorted(mapping.items()):
        if not isinstance(source_id, str) or not source_id or source_id == enemy_id:
            raise ValueError(f"Prefab alias must name a different nonempty source ID: {enemy_id}")
        source_prefab = prefabs.get(source_id)
        if enemy_id not in prefabs:
            if source_prefab is not None:
                new_prefabs[enemy_id] = copy.deepcopy(source_prefab)
                added_prefabs.append(enemy_id)
            else:
                unavailable.append({"enemyId": enemy_id, "prefabKey": source_id, "asset": "prefab"})
        elif source_prefab is not None and prefabs[enemy_id] != source_prefab:
            conflicts.append({"enemyId": enemy_id, "prefabKey": source_id,
                              "asset": "prefab", "resolution": "retain-target"})
        source_animations = animations.get(source_id, {}).get("animations", {})
        if source_animations:
            supplement["enemies"][enemy_id] = {
                "animations": source_animations,
                "source": {"kind": "database-prefab-key-alias", "prefabKey": source_id},
            }
        else:
            unavailable.append({"enemyId": enemy_id, "prefabKey": source_id, "asset": "animations"})
    new_animations, animation_receipt = merge_animations(animations, supplement)
    receipt = {
        "schemaVersion": 1,
        "mapping": dict(sorted(mapping.items())),
        "affectedEnemyIds": sorted(set(added_prefabs) | set(animation_receipt["affectedEnemyIds"])),
        "addedPrefabs": len(added_prefabs),
        "addedPrefabEnemyIds": added_prefabs,
        "addedAnimations": animation_receipt["addedAnimations"],
        "prefabConflicts": conflicts,
        "unavailableSources": unavailable,
        "animationOverlay": animation_receipt,
    }
    return new_prefabs, new_animations, receipt
