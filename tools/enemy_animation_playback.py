"""Attach native animation stretch caps only to explicit ordinary attack types.

The native base-method rule and source fields are known. Applying that static
base rule to the frozen prefab snapshot retains the existing cross-version and
cast-start snapshot boundaries; this is not proof of live hotfix behavior.
"""
import math

from enemy_hit_sequences import PLAIN, MULTI

RULE = 'native-attack-time-capped-animation'
EVIDENCE = (
    'work/enemy-animation-playback-evidence.json',
    'work/client-logic/native-enemy-self-cast/75490_get_cooldown.asm',
    'work/client-logic/native-enemy-self-cast/75505_UpdatePlaybackSpeed.asm',
    'work/client-logic/native-enemy-area-melee/additional-evidence.json',
    'work/enemy-area-melee-contract.json',
)


def playback_contract(fields, script_path_id, script_types):
    """Return a contract or one stable source-field rejection classification."""
    typename = script_types.get(str(script_path_id))
    if typename is None:
        return None, 'missing-or-ambiguous-ability-type'
    if typename not in PLAIN | MULTI:
        return None, 'unsupported-ability-type'
    for key, required, label in (
            ('_timeMode', 0, 'time-mode'),
            ('_waitForAttackEvent', 1, 'wait-for-attack-event')):
        if key not in fields:
            return None, 'missing-' + label
        if type(fields[key]) is not int or fields[key] != required:
            return None, 'unsupported-' + label
    if '_maxAnimScale' not in fields:
        return None, 'missing-max-animation-scale'
    maximum = fields['_maxAnimScale']
    if (not isinstance(maximum, (int, float)) or isinstance(maximum, bool)
            or not math.isfinite(maximum) or not (maximum == -1 or maximum >= .1)):
        return None, 'invalid-max-animation-scale'
    return dict(rule=RULE, timeMode=0, minScale=.1, maxScale=maximum), None


def timing_slots(profile):
    """Basic timing locations only; dedicated skill executors remain separate."""
    if profile.get('timing'):
        yield 'timing', profile['timing']
    for channel, value in sorted(profile.get('channels', {}).items()):
        if value and value.get('timing'):
            yield 'channels/' + channel + '/timing', value['timing']
    for mode, value in sorted(profile.get('modes', {}).items()):
        for channel, action in sorted(value.get('channels', {}).items()):
            if action and action.get('timing'):
                yield 'modes/' + mode + '/channels/' + channel + '/timing', action['timing']


def summarize_playback(enemies, encounters, reasons_by_timing_id):
    """Count exported slots and distinct enemies without conflating the two."""
    native, fallback, reasons = [], [], {}
    for enemy_id, profile in sorted(enemies.items()):
        for path, timing in timing_slots(profile):
            row = dict(enemyId=enemy_id, path=path)
            if timing.get('playback', {}).get('rule') == RULE:
                native.append(row)
                continue
            reason = ('independent-pre-attack-animation-provider' if profile.get('preAttack')
                      else reasons_by_timing_id.get(id(timing), 'uninspected-source-timing'))
            fallback.append(row)
            reasons.setdefault(reason, []).append(row)

    def summary(rows):
        ids = {row['enemyId'] for row in rows}
        return dict(timingSlots=len(rows), enemies=len(ids),
                    encounterTimingSlots=sum(row['enemyId'] in encounters for row in rows),
                    encounterEnemies=len(ids & set(encounters)))

    return dict(rule=RULE, evidence=list(EVIDENCE), native=summary(native),
                fallback=summary(fallback),
                fallbackReasons={reason: dict(**summary(rows),
                    enemyIDs=sorted({row['enemyId'] for row in rows}))
                    for reason, rows in sorted(reasons.items())},
                boundary='Counts are basic timing locations, including separate modes/channels, '
                'and distinct enemies; these are not completed enemy counts. Native base-method '
                'timing is attached only to explicit plain/multi attacks with mode 0, event wait 1 '
                'and a finite cap of -1 or >=0.1. Dedicated skill timing and independent NoPre '
                'providers are excluded. Other timings retain the prior proportional fallback. '
                'Midcast attribute updates, native scheduler details and hotfix replacement '
                'remain outside this cast-start timing contract.')
