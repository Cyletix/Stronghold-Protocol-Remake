"""Extract unresolved enemies' separate combat/attack roots once.

This layer records source channels. It does not infer phase transitions or
silently choose the first mode. Consumers may flatten only identical contracts.
"""
from __future__ import annotations

import json
from pathlib import Path
from enemy_hit_sequences import timing_contract, action_semantics

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'work/enemy-mode-channels.json'
VERSION = 1


def extract_channels(record, components):
    by_id = {}
    for component in components:
        by_id.setdefault(component.get('pathID'), []).append(component)

    def resolve(ref, cabin):
        if not isinstance(ref, dict) or 'm_PathID' not in ref or ref.get('m_FileID', 0):
            return None
        candidates = [c for c in by_id.get(ref['m_PathID'], []) if c.get('cabin') == cabin]
        return candidates[0] if len(candidates) == 1 else None

    modes = []
    evidence = record['evidence']
    for item in evidence.get('rootModes', []):
        candidates = by_id.get(item['modePathID'], [])
        mode = dict(modeIndex=item['modeIndex'], modePathID=item['modePathID'], channels={})
        if len(candidates) != 1:
            mode['error'] = 'ambiguous-or-missing-mode'
            modes.append(mode)
            continue
        component = candidates[0]
        fields, cabin = component.get('fields', {}), component.get('cabin')
        hook = resolve(fields.get('_animatorHooker'), cabin)
        mode['animationAliases'] = (hook or {}).get('fields', {}).get('_animations', [])
        for source_name, name in (('_combat', 'combat'), ('_attack', 'attack')):
            ref = fields.get(source_name)
            channel = dict(reference=ref)
            target = resolve(ref, cabin)
            if isinstance(ref, dict) and ref.get('m_PathID') == 0 and not ref.get('m_FileID', 0):
                channel['status'] = 'absent'
            elif target is None:
                channel['status'] = 'unresolved-reference'
            else:
                action = target.get('fields', {})
                channel.update(cabin=target.get('cabin'), pathID=target.get('pathID'),
                               fields=action, scriptPathID=target.get('scriptPathID'))
                channel['status'] = ('direct-damage-root' if '_atkScale' in action and '_attackType' in action
                                     else 'non-damage-or-composite-root')
            mode['channels'][name] = channel
        modes.append(mode)
    return dict(enemyId=record['enemyId'], name=record['name'], inEncounterPool=record['inEncounterPool'],
                complete=bool(modes) and len(modes) == evidence.get('modeCount'), modes=modes)


def load_channels(prefabs, records, source_hashes):
    old = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.is_file() else {}
    if old.get('sourceHashes') == source_hashes and old.get('ruleVersion') == VERSION:
        return old, True
    members = old.get('members') or sorted(k for k, row in records.items() if row.get('importGaps'))
    result = dict(schemaVersion=1, ruleVersion=VERSION, sourceHashes=source_hashes, members=members,
                  enemies={k: extract_channels(records[k], prefabs.get(k, {}).get('components', []))
                           for k in members if k in records})
    CACHE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result, False


def resolve_channel_record(cached, root_record, components):
    """Use already loaded roots when a new contract exposes an old cache miss.

    The historical member list is an extraction optimization, not a source
    eligibility boundary. Completeness and all-mode agreement are still checked
    by compile_channels; no raw assets or guessed phase are introduced here.
    """
    if cached is not None:
        return cached
    return extract_channels(root_record, components) if root_record else None


def compile_channels(record, animations, global_aliases, speeds, timing_of, projectile_of, gate_of=None, action_timing_of=None):
    """Return per-channel timings shared by *every* mode, otherwise a reason.

    Null/non-damage channels stay unresolved; they may mean a custom behavior,
    not permission to synthesize an ordinary attack or disable the unit.
    """
    if not record or not record.get('complete'):
        return None, 'missing-mode-channel-evidence'
    channels, reasons = {}, []
    for name in ('combat', 'attack'):
        candidates, absent = [], []
        for mode in record['modes']:
            root = mode.get('channels', {}).get(name, {})
            if root.get('status') == 'absent':
                absent.append(True)
                continue
            if root.get('status') != 'direct-damage-root':
                reasons.append(f'{name}:unsupported-root')
                continue
            fields = root['fields']
            aliases = global_aliases
            if mode.get('animationAliases'):
                aliases = {}
                for entry in mode['animationAliases']:
                    if entry.get('animKey') and entry.get('animName'):
                        aliases.setdefault(entry['animKey'], set()).add((entry['animName'], entry.get('speed', 1.0)))
            timing = (action_timing_of(animations, fields, aliases, root.get('scriptPathID')) if action_timing_of
                      else timing_of(animations, fields.get('_animKey', ''), aliases))
            gate = gate_of(fields, timing) if gate_of else {}
            ordinary_gate = (timing and fields.get('_waitForAttackEvent') == 1
                    and fields.get('_preDelay', 0) == 0 and fields.get('_timeMode', 0) == 0)
            if not (ordinary_gate or gate.get('accepted')):
                reasons.append(f'{name}:timing-unresolved')
                continue
            projectile, reason = projectile_of([fields], speeds)
            if reason:
                reasons.append(f'{name}:{reason}')
                continue
            candidate = dict(timing=timing, delivery='projectile' if projectile else 'direct',
                             _sourceSemantics=action_semantics(fields))
            if projectile:
                candidate['projectile'] = projectile
            candidates.append(candidate)
        if len(absent) == len(record['modes']):
            # This channel has no ordinary attack. Do not add a runtime branch
            # until a source-backed channel fallback rule is available.
            continue
        if absent or len(candidates) != len(record['modes']):
            reasons.append(f'{name}:incomplete-modes')
            continue
        def contract(value):
            t = value['timing']
            return (timing_contract(t), value['_sourceSemantics'], value['delivery'],
                    value.get('projectile', {}).get('key'), value.get('projectile', {}).get('speed'))
        if len({contract(value) for value in candidates}) != 1:
            reasons.append(f'{name}:mode-dependent-contract')
            continue
        candidates[0].pop('_sourceSemantics')
        channels[name] = candidates[0]
    if reasons:
        return None, sorted(set(reasons))
    # A single nonempty channel is already represented by the flat importer.
    # Resolving null-channel scheduling is distinct from separating two roots.
    if len(channels) != 2:
        return None, 'requires-two-damage-channels'
    return channels, None
