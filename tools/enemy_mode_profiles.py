"""Compile each serialized mode independently, without inventing transitions."""
import math
from pathlib import Path

from enemy_hit_sequences import PLAIN, MULTI
from enemy_timing_gates import compile_timing_gate

RULE = 'explicit-enemy-mode-profiles-v1'
INITIAL_RULE = 'native-zero-without-talent-or-skill-override-v1'
DAMAGE_TYPES = {1: 'phys', 2: 'arts', 3: 'true'}


def validate_mode_sources(catalog, current_hashes):
    frozen = {Path(key).name: value for key, value in catalog.get('sourceHashes', {}).items()}
    for filename, current in current_hashes.items():
        if frozen.get(filename) != current:
            raise ValueError(f'Mode source {filename} changed; explicitly refresh the frozen inventory and ownership.')


def compile_initial_mode(ownership, source_record, modes):
    """The native default is zero when *every possible* override is negative.

    Inspect the complete JP component subtree, not only talents retained in the
    compact CN export. Activation order is irrelevant for this restricted class.
    The cross-snapshot ownership join remains an explicitly recorded inference.
    """
    if not ownership or ownership.get('status') != 'matched-entity-and-mode-anchors':
        return None, 'unmatched-source-ownership'
    subtree = ownership.get('jpSubtree', {})
    if not subtree.get('completeTalentAndSkillCoverage') or subtree.get('unknownMonoBehaviourTypes'):
        return None, 'incomplete-talent-and-skill-inventory'
    for item in ownership.get('talentAndSkillComponents', {}).values():
        if not {'Torappu.Battle.Talent', 'Torappu.Battle.BasicSkill'}.intersection(item.get('typeHierarchy', [])):
            return None, 'unresolved-default-mode-getter'
        index = item.get('fields', {}).get('_defaultModeIndex')
        if type(index) is not int or index >= 0:
            return None, 'requires-active-default-mode-override'
    # A CN addition or changed default must never disappear behind the JP join.
    for item in source_record.get('components', {}).values():
        fields = item.get('fields', {})
        if '_defaultModeIndex' in fields:
            index = fields['_defaultModeIndex']
            if type(index) is not int or index >= 0:
                return None, 'requires-active-default-mode-override'
    if not ownership.get('initialModeZeroEvidence', {}).get('candidate'):
        return None, 'default-mode-source-fields-or-script-mismatch'
    if '0' not in modes:
        return None, 'initial-mode-actions-unresolved'
    return 0, None


def compile_mode_profiles(record, animations, aliases, speeds, script_types, timing_of, projectile_of):
    if not record or not record.get('complete'):
        return {}, {'record': ['incomplete-mode-references']}
    indices = [mode.get('modeIndex') for mode in record['modes']]
    if any(type(index) is not int or index < 0 for index in indices) or len(set(indices)) != len(indices):
        return {}, {'record': ['ambiguous-mode-indices']}
    result, unresolved = {}, {}
    for mode in record['modes']:
        key = str(mode['modeIndex'])
        channels, reasons = {}, []
        mode_aliases = aliases
        if mode.get('animationAliases'):
            mode_aliases = {}
            for binding in mode['animationAliases']:
                if binding.get('animKey') and binding.get('animName'):
                    mode_aliases.setdefault(binding['animKey'], set()).add((binding['animName'], binding.get('speed', 1)))
        for channel in ('combat', 'attack'):
            root = mode.get('channels', {}).get(channel, {})
            typename = script_types.get(str(root.get('scriptPathID')))
            if root.get('status') == 'absent' or typename == 'Torappu.Battle.Abilities.EmptyAbility':
                channels[channel] = None
                continue
            if root.get('status') != 'direct-damage-root' or typename not in PLAIN | MULTI:
                reasons.append(channel + ':unresolved-root')
                continue
            fields = root['fields']
            timing = timing_of(animations, fields, mode_aliases, root.get('scriptPathID'))
            gate = compile_timing_gate(fields, timing)
            ordinary_gate = (timing and fields.get('_timeMode') == 0
                            and fields.get('_waitForAttackEvent') == 1 and fields.get('_preDelay', 0) == 0)
            if not (gate['accepted'] or ordinary_gate):
                reasons.append(channel + ':unresolved-timing')
                continue
            scale = fields.get('_atkScale')
            dtype = 'dynamic' if fields.get('_useDynamicAttackType') == 1 else DAMAGE_TYPES.get(fields.get('_damageType'))
            if (not dtype or not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0
                    or fields.get('_activeBuffs') or fields.get('_extraDamageType') or fields.get('_epDamageRatio')):
                reasons.append(channel + ':unresolved-damage-actions')
                continue
            projectile, error = projectile_of([fields], speeds)
            if error:
                reasons.append(channel + ':' + error)
                continue
            channels[channel] = dict(timing=timing, atkScale=scale, damageType=dtype,
                                     delivery='projectile' if projectile else 'direct')
            if projectile:
                channels[channel]['projectile'] = projectile
        if reasons:
            unresolved[key] = reasons
        else:
            result[key] = dict(modeIndex=mode['modeIndex'], channels=channels)
    return result, unresolved
