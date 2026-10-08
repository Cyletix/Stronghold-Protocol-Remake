"""Add missing animation names from a source-attributed supplement.

Existing animation records are authoritative and are never overwritten. Timing
conflicts are receipts for later source decisions, not implicit replacements.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "work/enemy-animation-supplement.json"
TIMING_TOLERANCE = 1e-4


def load_supplement(path: str | Path = DEFAULT_PATH) -> dict:
    path = Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def supplement_fingerprint(supplement: dict) -> str:
    """Hash content/provenance, excluding run-dependent cache/import counters."""
    content = {"source": supplement.get("source", {}), "enemies": supplement.get("enemies", {})}
    encoded = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _same_time(left, right) -> bool:
    numeric = lambda value: isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    if numeric(left) and numeric(right):
        return math.isclose(left, right, rel_tol=0, abs_tol=TIMING_TOLERANCE)
    return type(left) is type(right) and left == right


def _timing(animation: dict) -> dict:
    # Event payloads and list order do not change the event/t timing contract;
    # duplicate events do, so retain all entries rather than using a set.
    events = [{"event": event.get("event"), "t": event.get("t")}
              for event in animation.get("events", [])]
    events.sort(key=lambda event: (str(event["event"]),
                                  isinstance(event["t"], (int, float)),
                                  event["t"] if isinstance(event["t"], (int, float)) else str(event["t"])))
    return {"duration": animation.get("duration"), "events": events}


def _same_timing(left: dict, right: dict) -> bool:
    if not _same_time(left["duration"], right["duration"]) or len(left["events"]) != len(right["events"]):
        return False
    return all(a["event"] == b["event"] and _same_time(a["t"], b["t"])
               for a, b in zip(left["events"], right["events"]))


def merge_animations(base: dict, supplement: dict) -> tuple[dict, dict]:
    """Return a detached merged catalog and an attribution/conflict receipt.

    ``base`` is enemyId -> record with an ``animations`` mapping. ``supplement``
    is the schemaVersion/source/counts/enemies wrapper. Attribution is recorded
    in receipt.animationSources so existing enemy metadata also stays intact.
    """
    merged = copy.deepcopy(base)
    enemies = supplement.get("enemies", {})
    if not isinstance(enemies, dict):
        raise ValueError("Animation supplement enemies must be a mapping")
    receipt = {
        "schemaVersion": 1,
        "source": copy.deepcopy(supplement.get("source", {})),
        "timingTolerance": TIMING_TOLERANCE,
        "addedAnimations": 0,
        "addedEnemies": 0,
        "affectedEnemyIds": [],
        "animationSources": {},
        "conflicts": [],
        "metadataCounts": {
            "supplementEnemies": len(enemies), "supplementAnimations": 0,
            "overlappingAnimations": 0, "matchingAnimations": 0,
            "conflictingAnimations": 0,
        },
    }
    counts = receipt["metadataCounts"]
    for enemy_id, extra in sorted(enemies.items()):
        animations = extra.get("animations", {})
        if not isinstance(animations, dict):
            raise ValueError(f"Supplement animations must be a mapping: {enemy_id}")
        counts["supplementAnimations"] += len(animations)
        if not animations:
            continue
        if enemy_id not in merged:
            merged[enemy_id] = {"animations": {}}
            receipt["addedEnemies"] += 1
        target = merged[enemy_id].setdefault("animations", {})
        if not isinstance(target, dict):
            raise ValueError(f"Base animations must be a mapping: {enemy_id}")
        source = copy.deepcopy(extra.get("source", {}))
        added = {}
        for name, animation in sorted(animations.items()):
            if name not in target:
                target[name] = copy.deepcopy(animation)
                added[name] = copy.deepcopy(source)
                receipt["addedAnimations"] += 1
                continue
            counts["overlappingAnimations"] += 1
            previous, incoming = _timing(target[name]), _timing(animation)
            if _same_timing(previous, incoming):
                counts["matchingAnimations"] += 1
            else:
                counts["conflictingAnimations"] += 1
                receipt["conflicts"].append({
                    "enemyId": enemy_id, "animation": name,
                    "retained": previous, "supplement": incoming,
                    "supplementSource": copy.deepcopy(source),
                    "resolution": "retain-base",
                })
        if added:
            receipt["affectedEnemyIds"].append(enemy_id)
            receipt["animationSources"][enemy_id] = added
    return merged, receipt
