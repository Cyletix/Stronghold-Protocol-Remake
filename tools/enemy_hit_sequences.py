"""Resolve repeated animation events by ability type, never by event count alone.

MonoScript identity and prefab fields are source observations. The fixed multi
executor is a field-driven shared-schema inference: its native bodies are not
readable in the local binary. Unknown/split/dynamic contracts remain unresolved.
"""
import copy
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_TYPES = ROOT / 'work/client-logic/script-types.json'
RULE = 'typed-enemy-hit-sequence-v1'
PREFIX = 'Torappu.Battle.Abilities.'
PLAIN = {PREFIX + name for name in ('MeleeAttack', 'RangedAttack')}
MULTI = {PREFIX + name for name in ('MultiMeleeAttack', 'MultiRangedAttack')}


def load_script_types():
    if not SCRIPT_TYPES.is_file():
        return {}
    candidates = {}
    for bundle in json.loads(SCRIPT_TYPES.read_text(encoding='utf-8-sig'))['matches']:
        for pid, item in bundle.get('scripts', {}).items():
            candidates.setdefault(str(pid), set()).add(item['m_Namespace'] + '.' + item['m_ClassName'])
    return {pid: next(iter(names)) for pid, names in candidates.items() if len(names) == 1}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compile_hit_sequence(fields, script_path_id, animation, script_types):
    if not animation:
        return None
    typename = script_types.get(str(script_path_id))
    if typename not in PLAIN | MULTI:
        return None
    hits, duration = animation.get('observedHits', []), animation.get('duration')
    scale = fields.get('_atkScale')
    if (not finite(duration) or duration <= 0 or not hits
            or any(not finite(t) or not 0 <= t <= duration for t in hits)
            or hits != sorted(hits) or not finite(scale) or scale <= 0):
        return None
    timing = copy.deepcopy(animation)
    timing.update(hit=hits[0], atkScale=scale, abilityType=typename)
    if typename in PLAIN:
        # AbilityStandard.CheckAnotherSpell defaults to false; these exact
        # classes do not override it. Extra animation events do not recast.
        if fields.get('_additionalTimes') or fields.get('_waitAttackEventForAllAttacks'):
            return None
        timing['hitSequenceContract'] = 'single-cast-first-event-v1'
        return timing
    additional = fields.get('_additionalTimes')
    if type(additional) is not int or additional < 1 or len(hits) != additional + 1:
        return None
    if fields.get('_waitAttackEventForAllAttacks') != 1 or fields.get('_splitDamage') != 0:
        return None
    unsupported = ('_triggerDelta', '_minPostDelay', '_refreshInputTargetOnCheckSpell',
        '_refreshTimesOnCastStart', '_refreshTimesOnCheckAnotherSpell', '_activeBuffs',
        '_extraDamageType', '_useDynamicAttackType', '_onlyFeedActiveBuffToLastOne',
        '_onlyFeedActiveBuffToFirstOne', '_onlyFeedActionsToFirstOne',
        '_limitToOneTargetAfterFirstRound', '_additionalProjectile', '_additionalProjectiles',
        '_useMultiAdditionalProjectiles', '_enableMountPointGroup',
        '_castToFirstRoundTargetLocationsAtProjectileBirth', '_hookTheLastProjectile')
    if any(fields.get(key) for key in unsupported):
        return None
    timing.update(hits=list(hits), hitSequenceContract='fixed-multi-event-v1')
    return timing


def timing_contract(timing):
    """Compare executed events/scales across modes; labels are not behavior."""
    playback = timing.get('playback')
    return (timing['duration'], tuple(timing.get('hits', [timing['hit']])), timing.get('atkScale', 1),
            json.dumps(playback, sort_keys=True, separators=(',', ':')) if playback is not None else None)


def action_semantics(fields):
    """A phase cannot change damage/delivery merely because timestamps agree."""
    keys = ('_atkScale', '_attackType', '_damageType', '_useDynamicAttackType',
            '_additionalTimes', '_waitAttackEventForAllAttacks', '_splitDamage')
    return tuple(fields.get(key, 0) for key in keys) + (fields.get('_projectileKey') or '',)
