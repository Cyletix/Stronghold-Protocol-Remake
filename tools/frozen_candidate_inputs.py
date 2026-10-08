"""Validate one fully frozen candidate when its cache container is rewritten.

Callers must opt in for a named candidate-cache dependency and separately check
every other pinned input. This is not a general substitute for input hashes.
"""
import hashlib
import json


def frozen_candidate_cache_matches(path, expected_sha256, frozen_candidate):
    if not isinstance(frozen_candidate, dict) or not isinstance(frozen_candidate.get('id'), str):
        return False
    if not frozen_candidate['id'] or not path.is_file():
        return False
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() == expected_sha256:
        return True
    try:
        current = json.loads(raw)
        candidate = current['candidates'][frozen_candidate['id']]
        # Canonical JSON also distinguishes booleans from numbers and preserves
        # numeric representation; Python dict equality would allow True == 1.
        canonical = lambda value: json.dumps(value, sort_keys=True, ensure_ascii=False,
                                             separators=(',', ':'), allow_nan=False)
        return canonical(candidate) == canonical(frozen_candidate)
    except (KeyError, TypeError, ValueError):
        return False
