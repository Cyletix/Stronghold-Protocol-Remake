"""Compile flat ordinary delivery from exact source types, never target range.

This adds only a delivery decision to an already compiled basic timing. It does
not certify attached Buffs, target selection, phases or whole enemy behavior.
Separate channel/mode, chain and first-attack providers keep their own contracts.
"""
from collections import Counter

from enemy_hit_sequences import PREFIX

RULE = 'source-typed-flat-attack-delivery-v1'
DIRECT = {PREFIX + name for name in ('MeleeAttack', 'MultiMeleeAttack')}
PROJECTILE = {PREFIX + name for name in ('RangedAttack', 'MultiRangedAttack')}


def compile_delivery(profile, actions, scripts_by_fields, script_types, modes_agree):
    if (any(profile.get(key) for key in ('channels', 'modes', 'preAttack'))
            or profile.get('projectile', {}).get('kind') == 'chain'):
        return None, 'existing-separate-executor'
    if not profile.get('timing'):
        return None, 'missing-flat-timing'
    if not actions:
        return None, 'missing-complete-root-actions'
    if not modes_agree:
        return None, 'mode-dependent-action-contract'
    deliveries = set()
    for fields in actions:
        typename = script_types.get(str(scripts_by_fields.get(id(fields))))
        if typename in DIRECT:
            if fields.get('_projectileKey'):
                return None, 'direct-type-with-projectile-key'
            deliveries.add('direct')
        elif typename in PROJECTILE:
            projectile = profile.get('projectile')
            if (not fields.get('_projectileKey') or not projectile
                    or projectile.get('key') != fields['_projectileKey']):
                return None, 'missing-supported-projectile-contract'
            deliveries.add('projectile')
        else:
            return None, 'unsupported-or-unresolved-root-type'
    if len(deliveries) != 1:
        return None, 'channel-dependent-delivery'
    return deliveries.pop(), None


def summarize(selections):
    return dict(rule=RULE, scope='actual-garrison-appearance-pool',
        counts=dict(Counter(row.get('delivery') or row['reason'] for row in selections.values())),
        selections=selections,
        boundary='Only flat basic delivery is newly bound. Exact MeleeAttack/MultiMeleeAttack '
        'roots without a projectile key deliver directly, including ranged target selectors. '
        'Exact RangedAttack/MultiRangedAttack roots require the existing supported projectile '
        'contract. Every resolved root must agree. Modes/channels, chains, independent first '
        'attacks and dedicated Boss executors keep ownership. This shared source-type mapping '
        'does not close damage, targeting, Buff, projectile-lifetime or whole-enemy acceptance.')
