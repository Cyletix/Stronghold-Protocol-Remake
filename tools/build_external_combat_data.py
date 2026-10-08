"""Compile only runtime-consumed enemy attack fields from the pinned emulator data.

No upstream code is executed. IDs are intersected with our battle catalog; variants
must agree on their basic-attack fields. Detailed omissions remain in work/, not
in the browser bundle. Run again after refreshing either input catalog.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from garrison_encounter_scope import load_scope
from enemy_bomb_parameters import load_parameters as load_bomb_parameters, CONTRACT as BOMB_CONTRACT
from enemy_hover import load_hover, CONTRACT as HOVER_CONTRACT
from enemy_pre_attack import compile_family as compile_pre_attack_family

from classify_enemy_action_templates import SHAPE_KEYS, LIFETIME_KEYS, refresh_prefab_alias_evidence
from enemy_animation_overlay import load_supplement, merge_animations, supplement_fingerprint
from enemy_attack_capabilities import load_capabilities, root_inventory
from enemy_prefab_aliases import load_aliases, apply_aliases
from enemy_mode_channels import load_channels, compile_channels, extract_channels, resolve_channel_record
from enemy_mode_profiles import compile_mode_profiles, compile_initial_mode, validate_mode_sources, RULE as MODE_RULE, INITIAL_RULE
from enemy_timing_gates import compile_timing_gate, EVIDENCE as GATE_EVIDENCE, RULE_VERSION as GATE_RULE
from enemy_hit_sequences import load_script_types, compile_hit_sequence, timing_contract, action_semantics, RULE as HIT_RULE, SCRIPT_TYPES, MULTI
from enemy_animation_playback import playback_contract, summarize_playback, RULE as PLAYBACK_RULE, EVIDENCE as PLAYBACK_EVIDENCE
from enemy_attack_delivery import compile_delivery, summarize as summarize_delivery, RULE as DELIVERY_RULE
from sync_enemy_animation_metadata import load_metadata_supplement
from inspect_enemy_mode_dispatch import load_catalog as load_mode_dispatch_catalog
from inspect_enemy_mode_auto_triggers import ensure_candidates as load_mode_provider_candidates
from enemy_mode_blocked_provider import compile_blocked_provider, RULE as MODE_PROVIDER_RULE
from enemy_mode_hp_provider import compile_hp_provider, RULE as HP_PROVIDER_RULE
from enemy_mode_passive_effects import RULE as PASSIVE_EFFECT_RULE
from enemy_mode_blackboards import load_blackboards
from enemy_mode_events import RULE as MODE_EVENT_RULE
from enemy_chain_projectiles import load_chain_candidates, compile_chain_projectile, RULE as CHAIN_RULE
from enemy_skill_dispatch import load_candidates as load_skill_candidates, load_sp_contract, compile_skill, SP_CONTRACT, RULE as SKILL_RULE
from enemy_self_cast_skills import (load_self_cast_contract, dormant_mode_profiles, compile_self_cast_skill,
    CONTRACT as SELF_CAST_CONTRACT, RULE as SELF_CAST_RULE, DORMANT_RULE)
from enemy_periodic_abilities import (load_periodic_contract, compile_periodic_group,
    CONTRACT as PERIODIC_CONTRACT, RULE as PERIODIC_RULE)
from enemy_area_melee_skills import (load_area_melee_contract, compile_area_melee_skill,
    CONTRACT as AREA_MELEE_CONTRACT, RULE as AREA_MELEE_RULE)
from enemy_tagged_ranged_skills import (load_tagged_ranged_contract, compile_tagged_ranged_skill,
    CONTRACT as TAGGED_RANGED_CONTRACT, RULE as TAGGED_RANGED_RULE)
from enemy_multi_melee_skills import (load_multi_melee_contract, compile_multi_melee_skill,
    CONTRACT as MULTI_MELEE_CONTRACT, RULE as MULTI_MELEE_RULE)
from enemy_selectable_attacks import (load_selectable_candidates, compile_selectable_attack,
    bind_selectable_timing, CACHE as SELECTABLE_CACHE, RULE as SELECTABLE_RULE)
from enemy_auras import (load_aura_candidates, compile_enemy_aura, read as read_aura_source,
    CACHE as AURA_CACHE, TEMPLATES as AURA_TEMPLATES, STATUS_SOURCE as AURA_STATUS_SOURCE, RULE as AURA_RULE)
from enemy_attach_projectiles import (load_attach_candidates, compile_attach_attack,
    CACHE as ATTACH_CACHE, RULE as ATTACH_RULE)

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "d2f6d76a7172cedc7583fc0a4eb998699abf25f5"
DEFAULT_SOURCE = ROOT / "work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def animation_profile(animations, key, aliases=None, allow_multiple=False):
    # Logical keys belong to the prefab, not necessarily to Spine. Multiple
    # animators/modes may bind the same key: retain that uncertainty unless all
    # bound source animations yield the same timing contract.
    bindings = (aliases or {}).get(key) or {(key, 1.0)}
    profiles = []
    for source_key, speed in sorted(bindings):
        if not finite(speed) or speed <= 0:
            return None
        profile = spine_animation_profile(animations, source_key, allow_multiple)
        if profile is None:
            return None
        item = {"duration": profile["duration"] / speed, "hit": profile["hit"] / speed}
        if allow_multiple:
            item['observedHits'] = [t / speed for t in profile['observedHits']]
        profiles.append(item)
    if any(profile != profiles[0] for profile in profiles):
        return None
    result = {"animation": key, **profiles[0]}
    if bindings != {(key, 1.0)}:
        result["sourceAnimations"] = [{"name": name, "speed": speed} for name, speed in sorted(bindings)]
    return result


def spine_animation_profile(animations, key, allow_multiple=False):
    # Exact name wins; directional aliases are usable only when their timings
    # agree. Never fall through from an absent Attack to a Skill animation.
    if not key:
        return None
    names = [key] if key in animations else [n for n in animations if n.startswith(key + "_")]
    profiles = []
    for name in names:
        anim = animations[name]
        duration = anim.get("duration")
        hits = sorted(e["t"] for e in anim.get("events", [])
                      if e.get("event") == "OnAttack" and finite(e.get("t")))
        if (finite(duration) and duration > 0 and hits and (allow_multiple or len(hits) == 1)
                and all(0 <= hit <= duration for hit in hits)):
            item = {"duration": duration, "hit": hits[0]}
            if allow_multiple:
                item['observedHits'] = hits
            profiles.append(item)
        elif name == key or hits:
            return None
    if not profiles or any(p != profiles[0] for p in profiles):
        return None
    return {"animation": key, **profiles[0]}


def animation_bindings(components):
    aliases = {}
    for component in components:
        for binding in component.get("fields", {}).get("_animations", []):
            key, name = binding.get("animKey"), binding.get("animName")
            if key and name:
                aliases.setdefault(key, set()).add((name, binding.get("speed", 1.0)))
    return aliases


def resolve_action_timing(animations, fields, aliases, script_path_id, script_types):
    # A multi ability stays multi even when the source has too few events.
    # Otherwise a missing event could silently turn a combo into one hit.
    timing = None
    if script_types.get(str(script_path_id)) not in MULTI:
        timing = animation_profile(animations, fields.get('_animKey', ''), aliases)
    if timing is None:
        observed = animation_profile(animations, fields.get('_animKey', ''), aliases, allow_multiple=True)
        timing = compile_hit_sequence(fields, script_path_id, observed, script_types)
    playback, _ = playback_contract(fields, script_path_id, script_types)
    if timing is not None and playback is not None:
        timing['playback'] = playback
    return timing


def cached_root_actions(record, components):
    """Use complete cached mode roots; never pick one mode or an Attack name."""
    evidence = (record or {}).get('evidence', {})
    modes = evidence.get('rootModes', [])
    if (not modes or len(modes) != evidence.get('modeCount')
            or evidence.get('unresolvedComponentReferences')
            or any(not mode.get('actionPathIDs') for mode in modes)):
        return None
    identifiers = set(pid for mode in modes for pid in mode['actionPathIDs'])
    by_id = {}
    for component in components:
        by_id.setdefault(component.get('pathID'), []).append(component)
    actions = []
    for pid in sorted(identifiers):
        # The fixed catalog uses path IDs; reject collisions across cabins.
        candidates = by_id.get(pid, [])
        if len(candidates) != 1:
            return None
        fields = candidates[0].get('fields', {})
        if not fields.get('_animKey') or '_attackType' not in fields or '_atkScale' not in fields:
            return None
        actions.append(fields)
    return actions or None


def root_modes_agree(record, components):
    modes = (record or {}).get('evidence', {}).get('rootModes', [])
    by_id = {c.get('pathID'): c.get('fields', {}) for c in components}
    contracts = {tuple(sorted({action_semantics(by_id[pid]) for pid in mode['actionPathIDs']}, key=repr))
                 for mode in modes}
    return len(contracts) <= 1


def projectile_contract(attacks, speeds):
    """Speed of an emitted ordinary projectile, independent of melee roots."""
    keys = {a['_projectileKey'] for a in attacks if a.get('_projectileKey')}
    if not keys:
        return None, None
    if len(keys) != 1:
        return None, 'mode-dependent-projectile'
    key = next(iter(keys))
    speed = speeds.get(key)
    ordinary = all(not a.get(k) for a in attacks for k in (*SHAPE_KEYS, *LIFETIME_KEYS))
    if finite(speed) and speed > 0 and ordinary:
        return dict(key=key, speed=speed), None
    return None, 'nonstandard-or-missing-projectile-speed'


def compile_data(source):
    source = source.resolve()
    files = ["data_enemy_spine_events.json", "data_enemy_prefab_catalog_current.json", "data_projectile_speeds.json"]
    source_hashes = {f: hashlib.sha256((source / f).read_bytes()).hexdigest() for f in files}
    root_catalog_path = ROOT / 'work/enemy-action-template-catalog.json'
    root_catalog = read(root_catalog_path) if root_catalog_path.is_file() else {}
    cache_hashes = root_catalog.get('sourceHashes', {})
    root_cache_valid = all(cache_hashes.get(str((source / f).relative_to(ROOT))
        if (source / f).is_relative_to(ROOT) else str(source / f)) == source_hashes[f] for f in files)
    root_records = root_catalog.get('enemies', {}) if root_cache_valid else {}
    animations, catalog, speeds = (read(source / f) for f in files)
    supplement = load_supplement()
    animations, animation_merge = merge_animations(animations, supplement)
    metadata_supplement = load_metadata_supplement()
    animations, metadata_merge = merge_animations(animations, metadata_supplement)
    script_types = load_script_types()
    mode_dispatch_catalog = load_mode_dispatch_catalog()
    mode_members = set(mode_dispatch_catalog.get('memberIDs', []))
    ownership_path = ROOT / 'work/enemy-mode-ownership-overlay.json'
    ownership = read(ownership_path) if ownership_path.is_file() else {}
    if ownership and ownership['source']['inventorySourceFingerprint'] != mode_dispatch_catalog.get('sourceFingerprint'):
        raise ValueError('Mode ownership belongs to a different frozen source catalog.')
    if mode_members:
        validate_mode_sources(mode_dispatch_catalog, {
            'data_enemy_prefab_catalog_current.json': source_hashes['data_enemy_prefab_catalog_current.json'],
            SCRIPT_TYPES.name: hashlib.sha256(SCRIPT_TYPES.read_bytes()).hexdigest()})
    provider_candidates, providers_cached = load_mode_provider_candidates()
    mode_contract_path = ROOT / 'work/enemy-mode-switch-contract.json'
    mode_contract = read(mode_contract_path)
    hp_contract_path = ROOT / 'work/enemy-mode-hp-contract.json'
    hp_contract = read(hp_contract_path)
    provider_blackboards, blackboards_cached = load_blackboards(
        c['enemyId'] for c in provider_candidates['candidates'] if c['family'] == 'hp-ratio-toggle')
    target_binding = dict(scope='TARGET', binding='owner', evidenceLevel='Inferred',
        basis='The passive ability mounts this managed Buff on its owner. The native Buff snapshot/attach body is unreadable; owner targeting and carrier detach/reattach use this explicit shared inference.',
        sourceRefs=[dict(path=str(mode_contract_path.relative_to(ROOT)),
                        sourceFingerprint=mode_contract['sourceFingerprint'], pointer='/boundedProviderContract/providerLifecycle')])
    checker_binding = dict(evidenceLevel='Verified', crossSnapshotApplication='Inferred',
        key='cnt', value='Enemy.get_isInCombat: blocker != null becomes 0/1',
        sourceRefs=[dict(path=str(mode_contract_path.relative_to(ROOT)), pointer='/boundedProviderContract/checker')])
    hp_checker_binding = dict(evidenceLevel='Verified', crossSnapshotApplication='Inferred',
        comparisonEpsilon=1e-5,
        comparisonContract=dict(evidenceLevel='Inferred', epsilon=1e-5,
            boundary='Native GE/LE/LT tolerance form is known; FP epsilon initialization remains unreadable. Use the metadata float LARGE_EPS approximation.'),
        sourceRefs=[dict(path=str(hp_contract_path.relative_to(ROOT)), sourceFingerprint=hp_contract['sourceFingerprint'])])
    provider_selections, provider_rejections = {}, {}
    candidates_by_enemy = {}
    for candidate in provider_candidates['candidates']:
        candidates_by_enemy.setdefault(candidate['enemyId'], []).append(candidate)

    playback_reasons = {}
    def action_timing(animations, fields, aliases, script_path_id):
        timing = resolve_action_timing(animations, fields, aliases, script_path_id, script_types)
        if timing is not None and 'playback' not in timing:
            _, reason = playback_contract(fields, script_path_id, script_types)
            playback_reasons[id(timing)] = reason
        return timing
    prefabs = catalog["prefabs"]
    live = read(ROOT / "web/battle_data.json")["enemies"]
    encounter_catalog = read(ROOT / "web/enemy_encounters.json").get("enemies", {})
    appearance_scope = load_scope()
    encounters = set(appearance_scope['eligibleEnemyIDs'])
    # Keep all reusable profiles; only encounter coverage uses appearance refs.
    wanted = set(live) | set(encounter_catalog)
    capabilities, capabilities_cached = load_capabilities()
    chain_candidates, chain_fingerprint = load_chain_candidates(source_hashes, capabilities['source']['sha256'])
    chain_selections, chain_rejections = {}, {}
    skill_candidates, skill_candidates_cached = load_skill_candidates(source_hashes, mode_dispatch_catalog.get('sourceHashes', {}))
    skill_contract = load_sp_contract(skill_candidates, capabilities['source']['sha256'])
    self_cast_contract = load_self_cast_contract(skill_candidates, source_hashes)
    periodic_contract = load_periodic_contract(self_cast_contract)
    area_melee_contract = load_area_melee_contract(skill_candidates)
    tagged_ranged_contract = load_tagged_ranged_contract(skill_candidates, capabilities['source']['sha256'])
    multi_melee_contract = load_multi_melee_contract(skill_candidates, capabilities['source']['sha256'])
    periodic_selections, periodic_rejections = {}, {}
    dormant_selections = {}
    skill_selections, skill_rejections, skills_by_enemy = {}, {}, {}
    for candidate in skill_candidates['candidates'].values():
        skills_by_enemy.setdefault(candidate['enemyId'], []).append(candidate)
    resource_aliases, alias_hash = load_aliases(source_hashes, capabilities['source']['sha256'],
                                     supplement_fingerprint(supplement))
    for key in mode_members:
        current_source = key if key in prefabs else resource_aliases.get(key, key)
        if mode_dispatch_catalog['enemies'][key]['sourceEnemyId'] != current_source:
            raise ValueError('Mode prefab alias changed; explicitly refresh the frozen inventory and ownership.')
    prefabs, animations, alias_merge = apply_aliases(prefabs, animations, resource_aliases)
    refreshed_prefabs = 0
    if root_cache_valid and root_catalog.get('prefabAliasHash') != alias_hash:
        refreshed_prefabs = refresh_prefab_alias_evidence(root_catalog, prefabs, animations, speeds,
                                                         resource_aliases, alias_hash)
        root_catalog_path.write_text(json.dumps(root_catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    roots, roots_cached = root_inventory(root_records, prefabs,
        source_hashes['data_enemy_prefab_catalog_current.json'], capabilities)
    no_basic_attack = {k: {'applyWay': 'NONE'} for k in sorted(wanted)
                       if capabilities['enemies'].get(k, {}).get('basicAttackNotRequired')}
    channel_catalog, channels_cached = load_channels(prefabs, root_records,
        dict(prefabs=source_hashes['data_enemy_prefab_catalog_current.json'], aliases=alias_hash))
    channel_gaps, uncached_channel_selections = {}, {}
    pre_attacks, pre_attack_report = compile_pre_attack_family(root_records, prefabs, animations,
        script_types, encounters, animation_profile)
    gate_selections = {}
    hit_selections = {}
    hit_unresolved = {}
    mode_gaps = {}
    enemies, gaps, selected_roots = {}, {}, {}
    for enemy_id in sorted(wanted):
        components = prefabs.get(enemy_id, {}).get("components", [])
        if enemy_id in pre_attacks:
            enemies[enemy_id] = pre_attacks[enemy_id]
            selected_roots[enemy_id] = dict(actionCount=1, ignoredNamedHelpers=0,
                animationProvider=pre_attacks[enemy_id]['preAttack']['sourceProvider'])
            continue
        scripts_by_fields = {id(c.get('fields')): c.get('scriptPathID') for c in components}
        # _attackType and _atkScale distinguish actual damage abilities from
        # animation-only helpers. Avoid character/skill naming heuristics.
        attacks = [x["fields"] for x in components if
                   str(x.get("fields", {}).get("_animKey", "")).startswith("Attack")
                   and "_attackType" in x["fields"] and "_atkScale" in x["fields"]]
        resolved = cached_root_actions(root_records.get(enemy_id), components)
        if resolved:
            selected_roots[enemy_id] = dict(actionCount=len(resolved),
                ignoredNamedHelpers=root_records[enemy_id]['evidence'].get('attackNamedNonrootCount', 0))
            attacks = resolved
        mode_candidate = enemy_id in mode_members
        if not attacks and not mode_candidate:
            if enemy_id not in no_basic_attack:
                gaps[enemy_id] = ["no-unambiguous-basic-attack-prefab"]
            continue
        profile, missing = {}, []
        aliases = animation_bindings(components)
        if mode_candidate:
            channels_record = channel_catalog['enemies'].get(enemy_id) or extract_channels(root_records[enemy_id], components)
            modes, missing_modes = compile_mode_profiles(channels_record, animations.get(enemy_id, {}).get('animations', {}),
                aliases, speeds, script_types, action_timing, projectile_contract)
            self_results = {}
            self_member = self_cast_contract.get('members', {}).get(enemy_id)
            if self_member:
                amended_modes, amended_gaps, dormant = dormant_mode_profiles(
                    channels_record, modes, missing_modes, script_types)
                amended_initial, _ = compile_initial_mode(ownership.get('enemies', {}).get(enemy_id),
                    mode_dispatch_catalog['enemies'][enemy_id], amended_modes)
                for candidate in self_member['skills'].values():
                    self_results[candidate['id']] = compile_self_cast_skill(candidate, self_member,
                        amended_modes, amended_initial, self_cast_contract,
                        animations.get(enemy_id, {}).get('animations', {}))
                # Do not expose a dormant/default mode before the complete
                # listener, source skill, marker and finish graph can execute.
                if self_results and all(row['accepted'] for row in self_results.values()):
                    modes, missing_modes = amended_modes, amended_gaps
                    dormant_selections[enemy_id] = dormant
            if modes:
                profile['modes'] = modes
            initial, initial_gap = compile_initial_mode(ownership.get('enemies', {}).get(enemy_id),
                mode_dispatch_catalog['enemies'][enemy_id], modes)
            if initial is not None:
                profile['initialMode'] = initial
            mode_gaps[enemy_id] = dict(unresolvedModes=missing_modes, initialMode=initial,
                initialModeUnresolved=initial_gap, transition='requires-complete-source-trigger-chain')
            for candidate in candidates_by_enemy.get(enemy_id, []):
                if candidate['family'] == 'blocked-toggle':
                    compiled = compile_blocked_provider(candidate, modes, initial,
                        target_binding=target_binding, checker_contract=checker_binding)
                elif candidate['family'] == 'hp-ratio-toggle':
                    board = provider_blackboards['enemies'].get(enemy_id, {})
                    compiled = compile_hp_provider(candidate, modes, initial,
                        source_blackboard=board.get('blackboard'), target_binding=target_binding,
                        checker_contract=hp_checker_binding)
                    if compiled['accepted']:
                        compiled['selection']['sourceRefs'].append(board['sourceRef'])
                else:
                    continue
                if compiled['accepted']:
                    selection = compiled['selection']
                    runtime_provider = {key: selection[key] for key in
                        ('id', 'kind', 'scope', 'condition', 'initialActive', 'silenceable', 'events', 'templateKeys')}
                    runtime_provider['targetBinding'] = {key: selection['targetBinding'][key]
                        for key in ('scope', 'binding', 'evidenceLevel')}
                    for key in ('blackboard', 'buffs'):
                        if key in selection:
                            runtime_provider[key] = selection[key]
                    profile.setdefault('modeProviders', []).append(runtime_provider)
                    provider_selections.setdefault(enemy_id, []).append(selection)
                else:
                    provider_rejections.setdefault(enemy_id, []).append(dict(
                        candidateId=candidate['candidateId'], reasons=compiled['rejections']))
            if profile.get('modeProviders'):
                mode_gaps[enemy_id]['transition'] = 'bound-passive-buff-transition; other-mode-abilities-pending'
            for candidate in skills_by_enemy.get(enemy_id, []):
                compiled = self_results.get(candidate['id'])
                if compiled is None and candidate['id'] in multi_melee_contract.get('candidates', {}):
                    compiled = compile_multi_melee_skill(candidate, skill_candidates['enemies'][enemy_id],
                        modes, initial, multi_melee_contract, animation_of=animation_profile,
                        animations=animations.get(enemy_id, {}).get('animations', {}), aliases=aliases)
                if compiled is None and candidate['id'] in area_melee_contract.get('candidates', {}):
                    compiled = compile_area_melee_skill(candidate, skill_candidates['enemies'][enemy_id],
                        modes, initial, area_melee_contract, timing_of=action_timing,
                        animations=animations.get(enemy_id, {}).get('animations', {}), aliases=aliases)
                if compiled is None and candidate['id'] in tagged_ranged_contract.get('candidates', {}):
                    compiled = compile_tagged_ranged_skill(candidate, skill_candidates['enemies'][enemy_id],
                        modes, initial, tagged_ranged_contract, timing_of=action_timing,
                        projectile_of=projectile_contract, animations=animations.get(enemy_id, {}).get('animations', {}),
                        aliases=aliases, speeds=speeds)
                if compiled is None:
                    compiled = compile_skill(candidate, skill_candidates['enemies'][enemy_id], modes, initial,
                        timing_of=action_timing, projectile_of=projectile_contract,
                        animations=animations.get(enemy_id, {}).get('animations', {}), aliases=aliases,
                        speeds=speeds, sp_contract=skill_contract)
                if compiled['accepted']:
                    selection = compiled['selection']
                    skill_selections.setdefault(enemy_id, []).append(selection)
                    runtime_skill = {key: selection[key] for key in
                        ('id', 'kind', 'skillKey', 'modeIndices', 'priority', 'spCost', 'cooldown',
                         'initCooldown', 'blackboard', 'allowedBlackboardKeys', 'trigger', 'selector', 'action', 'flags')}
                    for key in ('sourceTrigger', 'events', 'cooldownStarts'):
                        if key in selection:
                            runtime_skill[key] = selection[key]
                    profile.setdefault('skills', []).append(runtime_skill)
                    if 'spContract' in selection:
                        profile['skillSp'] = selection['spContract']
                    if 'selfCastLifecycle' in selection:
                        profile['selfCastLifecycle'] = selection['selfCastLifecycle']
                else:
                    skill_rejections.setdefault(enemy_id, []).append(dict(
                        candidateId=candidate['id'], reasons=compiled['rejections']))
            periodic_member = periodic_contract.get('members', {}).get(enemy_id)
            if periodic_member:
                if not profile.get('selfCastLifecycle'):
                    periodic_rejections[enemy_id] = ['requires-bound-source-awake-entry']
                else:
                    periodic = compile_periodic_group(periodic_member, modes, periodic_contract)
                    if periodic['accepted']:
                        selection = periodic['selection']
                        periodic_selections[enemy_id] = [selection]
                        profile['periodicAbilities'] = {key: selection[key] for key in
                            ('id', 'kind', 'modeIndex', 'attributes', 'periodics', 'abilities', 'normalAttackElement')}
                    else:
                        periodic_rejections[enemy_id] = periodic['rejections']
        candidate_timings = []
        for attack in attacks:
            script_id = scripts_by_fields.get(id(attack)) if resolved else None
            timing = action_timing(animations.get(enemy_id, {}).get("animations", {}), attack,
                                   aliases, script_id)
            if not timing and script_types.get(str(script_id)) in MULTI:
                hit_unresolved.setdefault(enemy_id, []).append(dict(abilityType=script_types[str(script_id)],
                    fields=attack, observed=animation_profile(animations.get(enemy_id, {}).get('animations', {}),
                        attack.get('_animKey', ''), aliases, allow_multiple=True),
                    reason='Fixed event-count, delay, split, target or extra-action contract not supported'))
            gate = compile_timing_gate(attack, timing)
            if ((timing and attack.get("_waitForAttackEvent") == 1
                    and attack.get("_preDelay", 0) == 0 and attack.get("_timeMode", 0) == 0) or gate['accepted']):
                candidate_timings.append(timing)
                if gate['accepted'] and attack.get('_preDelay', 0):
                    gate_selections.setdefault(enemy_id, []).append(dict(animation=attack['_animKey'],
                        configuredPreDelay=attack['_preDelay'], contract=gate['contract']))
            else:
                candidate_timings.append(None)
        # Compare actual times, not directional names.
        values = {timing_contract(t) for t in candidate_timings if t}
        modes_agree = not resolved or root_modes_agree(root_records.get(enemy_id), components)
        if len(values) == 1 and all(candidate_timings):
            profile["timing"] = candidate_timings[0]
        else:
            missing.append("missing-multihit-or-mode-dependent-animation")
        if not modes_agree:
            # Shared timing is still usable evidence. It does not mean the
            # different phase damage/delivery contracts are implemented.
            missing.append('mode-dependent-basic-action-contract')
        projectile, projectile_gap = projectile_contract(attacks, speeds)
        if enemy_id in chain_candidates:
            chain = compile_chain_projectile(chain_candidates[enemy_id], attacks, speeds)
            if chain['accepted'] and (not resolved or not modes_agree or mode_candidate or not profile.get('timing')):
                chain = dict(accepted=False, reasons=['chain-requires-complete-shared-root-timing'])
            if chain['accepted']:
                projectile, projectile_gap = chain['projectile'], None
                chain_selections[enemy_id] = chain['selection']
            else:
                chain_rejections[enemy_id] = chain['reasons']
        if projectile:
            profile['projectile'] = projectile
        if projectile_gap:
            missing.append(projectile_gap)
        if missing and (enemy_id in channel_catalog['enemies'] or resolved):
            cached_channels = channel_catalog['enemies'].get(enemy_id)
            channel_record = resolve_channel_record(cached_channels, root_records.get(enemy_id), components)
            channels, channel_gap = compile_channels(channel_record,
                animations.get(enemy_id, {}).get('animations', {}), aliases, speeds,
                animation_profile, projectile_contract, compile_timing_gate, action_timing)
            if cached_channels is None:
                uncached_channel_selections[enemy_id] = dict(
                    source='already-loaded-complete-root-and-prefab', accepted=bool(channels),
                    rejection=channel_gap)
            if channels:
                profile['channels'] = channels
                missing = []
            else:
                channel_gaps[enemy_id] = channel_gap
        if profile:
            enemies[enemy_id] = profile
            selections = [t for t in [profile.get('timing')] + [c['timing'] for c in profile.get('channels', {}).values()]
                          if t and t.get('hitSequenceContract')]
            if selections:
                hit_selections[enemy_id] = selections
        if missing and enemy_id not in no_basic_attack:
            gaps[enemy_id] = missing
    # Complete selectable ordinary roots use one executor with distinct aim and
    # impact selectors. A rejected candidate retains its prior partial evidence.
    selectable_source = load_selectable_candidates()
    selectable_selections, selectable_rejections = {}, {}
    for enemy_id, candidate in selectable_source['enemies'].items():
        if enemy_id not in encounters:
            selectable_rejections[enemy_id] = ['outside-actual-garrison-appearance-pool']
            continue
        selection = compile_selectable_attack(candidate)
        if selection['accepted']:
            components = prefabs[enemy_id]['components']
            observed = animation_profile(animations.get(enemy_id, {}).get('animations', {}),
                selection['timingAction']['_animKey'], animation_bindings(components), allow_multiple=True)
            selection = bind_selectable_timing(selection, observed)
        if not selection['accepted']:
            selectable_rejections[enemy_id] = selection['rejections']
            continue
        profile = enemies.setdefault(enemy_id, {})
        profile.update(selectableAttack=selection['selectableAttack'], timing=selection['timing'])
        selectable_selections[enemy_id] = selection
        gaps.pop(enemy_id, None)
        channel_gaps.pop(enemy_id, None)
        hit_unresolved.pop(enemy_id, None)
    attach_selections, attach_rejections = {}, {}
    for enemy_id, candidate in load_attach_candidates().items():
        if enemy_id not in encounters:
            attach_rejections[enemy_id] = ['outside-actual-garrison-appearance-pool']
            continue
        selection = compile_attach_attack(candidate)
        if not selection['accepted']:
            attach_rejections[enemy_id] = selection['rejections']
            continue
        profile = enemies.setdefault(enemy_id, {})
        # This complete ordinary root owns both channels, preserving the current
        # source timing while avoiding fallback to a guessed tracking projectile.
        profile.update(attachedProjectile=selection['attachedProjectile'], timing=selection['timing'])
        attach_selections[enemy_id] = selection
        gaps.pop(enemy_id, None)
        channel_gaps.pop(enemy_id, None)
        hit_unresolved.pop(enemy_id, None)
    # Complete Talent containers are independent from ordinary attack coverage.
    # The same contract proves an empty sole mode, so suppress legacy fallback.
    aura_source=load_aura_candidates()
    aura_templates=read_aura_source(AURA_TEMPLATES)
    aura_selections,aura_rejections={},{}
    for enemy_id,candidate in aura_source['enemies'].items():
        if enemy_id not in encounters:
            aura_rejections[enemy_id]=['outside-actual-garrison-appearance-pool']
            continue
        selection=compile_enemy_aura(candidate,aura_templates)
        if not selection['accepted']:
            aura_rejections[enemy_id]=selection['rejections']
            continue
        profile=enemies.setdefault(enemy_id,{})
        profile.update(enemyAura=selection['enemyAura'],modes=selection['modes'],initialMode=selection['initialMode'])
        aura_selections[enemy_id]=selection
        gaps.pop(enemy_id,None)
        channel_gaps.pop(enemy_id,None)
        hit_unresolved.pop(enemy_id,None)
    # Scope new bindings to actual Garrison appearances. Reuse the complete
    # cached roots in memory; no per-enemy asset extraction or range heuristic.
    delivery_selections = {}
    for enemy_id in sorted(encounters):
        profile = enemies.get(enemy_id, {})
        if profile.get('selectableAttack'):
            delivery_selections[enemy_id] = dict(reason='complete-selectable-attack-executor')
            continue
        if profile.get('attachedProjectile'):
            delivery_selections[enemy_id] = dict(reason='complete-attached-area-executor')
            continue
        if profile.get('enemyAura') and all(m.get('sourceNoBasicAttack') for m in profile.get('modes',{}).values()):
            delivery_selections[enemy_id] = dict(reason='complete-source-empty-ordinary-mode')
            continue
        if enemy_id in no_basic_attack:
            delivery_selections[enemy_id] = dict(reason='source-no-basic-attack')
            continue
        components = prefabs.get(enemy_id, {}).get('components', [])
        actions = cached_root_actions(root_records.get(enemy_id), components)
        scripts = {id(c.get('fields')): c.get('scriptPathID') for c in components}
        delivery, reason = compile_delivery(profile, actions, scripts, script_types,
            bool(actions) and root_modes_agree(root_records.get(enemy_id), components))
        if delivery:
            profile['delivery'] = delivery
            delivery_selections[enemy_id] = dict(delivery=delivery,
                rootTypes=sorted({script_types[str(scripts[id(action)])] for action in actions}))
        else:
            delivery_selections[enemy_id] = dict(reason=reason)
    delivery_report = summarize_delivery(delivery_selections)
    source_hashes['enemy-attack-delivery-compiler'] = hashlib.sha256(
        (ROOT / 'tools/enemy_attack_delivery.py').read_bytes()).hexdigest()
    source_hashes['enemy-selectable-attack-compiler'] = hashlib.sha256(
        (ROOT / 'tools/enemy_selectable_attacks.py').read_bytes()).hexdigest()
    source_hashes['enemy-selectable-attack-candidates'] = hashlib.sha256(SELECTABLE_CACHE.read_bytes()).hexdigest()
    source_hashes['enemy-aura-compiler'] = hashlib.sha256((ROOT/'tools/enemy_auras.py').read_bytes()).hexdigest()
    source_hashes['enemy-aura-candidates'] = hashlib.sha256(AURA_CACHE.read_bytes()).hexdigest()
    source_hashes['enemy-aura-templates'] = hashlib.sha256(AURA_TEMPLATES.read_bytes()).hexdigest()
    source_hashes['enemy-aura-status-metadata'] = hashlib.sha256(AURA_STATUS_SOURCE.read_bytes()).hexdigest()
    source_hashes['enemy-attach-projectile-compiler'] = hashlib.sha256((ROOT/'tools/enemy_attach_projectiles.py').read_bytes()).hexdigest()
    source_hashes['enemy-attach-projectile-candidates'] = hashlib.sha256(ATTACH_CACHE.read_bytes()).hexdigest()
    source_hashes["web/battle_data.json"] = hashlib.sha256((ROOT / "web/battle_data.json").read_bytes()).hexdigest()
    source_hashes['enemy-animation-playback-compiler'] = hashlib.sha256(
        (ROOT / 'tools/enemy_animation_playback.py').read_bytes()).hexdigest()
    source_hashes['enemy-mode-channel-compiler'] = hashlib.sha256(
        (ROOT / 'tools/enemy_mode_channels.py').read_bytes()).hexdigest()
    source_hashes['enemy-animation-playback-native'] = hashlib.sha256(json.dumps(
        {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in PLAYBACK_EVIDENCE},
        sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    source_hashes['enemy-pre-attack-compiler'] = pre_attack_report['inputs']['tools/enemy_pre_attack.py']
    source_hashes['enemy-pre-attack-native'] = pre_attack_report['inputs']['work/client-logic/native-enemy-no-pre/evidence.json']
    source_hashes['enemy-pre-attack-inputs'] = hashlib.sha256(json.dumps(
        pre_attack_report['inputs'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if supplement:
        source_hashes['enemy-animation-supplement'] = supplement_fingerprint(supplement)
    if metadata_supplement:
        source_hashes['enemy-animation-metadata-supplement'] = supplement_fingerprint(metadata_supplement)
    if SCRIPT_TYPES.is_file():
        source_hashes['enemy-ability-script-types'] = hashlib.sha256(SCRIPT_TYPES.read_bytes()).hexdigest()
    source_hashes['enemy-database-attack-capabilities'] = capabilities['source']['sha256']
    source_hashes['enemy-prefab-aliases'] = alias_hash
    if mode_dispatch_catalog:
        source_hashes['enemy-mode-dispatch-catalog'] = mode_dispatch_catalog['sourceFingerprint']
    if ownership:
        source_hashes['enemy-mode-ownership-overlay'] = ownership['sourceFingerprint']
    # Cache-observation hashes include status-only plan edits; they must not
    # change the provenance of an identical compiled source graph.
    provider_source = dict(rule=provider_candidates['rule'],
        sourceFingerprints=provider_candidates['inputs']['sourceFingerprints'],
        ruleSha256=provider_candidates['inputs']['ruleSha256'])
    source_hashes['enemy-mode-auto-trigger-candidates'] = hashlib.sha256(
        json.dumps(provider_source, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    source_hashes['enemy-mode-switch-contract'] = mode_contract['sourceFingerprint']
    source_hashes['enemy-mode-hp-contract'] = hp_contract['sourceFingerprint']
    source_hashes['enemy-mode-blackboard-database'] = provider_blackboards['inputs']['databaseSha256']
    if chain_fingerprint:
        source_hashes['enemy-chain-projectile-candidates'] = chain_fingerprint
    source_hashes['enemy-skill-dispatch-candidates'] = skill_candidates['sourceFingerprint']
    source_hashes['enemy-skill-dispatch-compiler'] = skill_candidates['inputs']['compilerSha256']
    if skill_contract:
        source_hashes['enemy-skill-sp-contract'] = skill_contract['sourceFingerprint']
    if self_cast_contract:
        source_hashes['enemy-self-cast-contract'] = self_cast_contract['sourceFingerprint']
        source_hashes['enemy-self-cast-compiler'] = hashlib.sha256((ROOT / 'tools/enemy_self_cast_skills.py').read_bytes()).hexdigest()
    if periodic_contract:
        source_hashes['enemy-periodic-ability-contract'] = periodic_contract['sourceFingerprint']
        source_hashes['enemy-periodic-ability-compiler'] = hashlib.sha256((ROOT / 'tools/enemy_periodic_abilities.py').read_bytes()).hexdigest()
    if area_melee_contract:
        source_hashes['enemy-area-melee-contract'] = area_melee_contract['sourceFingerprint']
        source_hashes['enemy-area-melee-compiler'] = hashlib.sha256((ROOT / 'tools/enemy_area_melee_skills.py').read_bytes()).hexdigest()
    if tagged_ranged_contract:
        source_hashes['enemy-tagged-ranged-contract'] = tagged_ranged_contract['sourceFingerprint']
        source_hashes['enemy-tagged-ranged-compiler'] = hashlib.sha256((ROOT / 'tools/enemy_tagged_ranged_skills.py').read_bytes()).hexdigest()
    if multi_melee_contract:
        source_hashes['enemy-multi-melee-contract'] = hashlib.sha256(MULTI_MELEE_CONTRACT.read_bytes()).hexdigest()
        source_hashes['enemy-multi-melee-compiler'] = hashlib.sha256((ROOT / 'tools/enemy_multi_melee_skills.py').read_bytes()).hexdigest()
    bomb_id,bomb_parameters=load_bomb_parameters()
    if bomb_id not in enemies:
        raise ValueError('Bomb source profile is absent from current compiler inputs')
    enemies[bomb_id]['bombParameters']=bomb_parameters
    source_hashes['enemy-bomb-parameters-contract']=hashlib.sha256(BOMB_CONTRACT.read_bytes()).hexdigest()
    source_hashes['enemy-bomb-parameters-compiler']=hashlib.sha256((ROOT/'tools/enemy_bomb_parameters.py').read_bytes()).hexdigest()
    hover_id,hover=load_hover()
    if hover_id not in enemies or set(enemies[hover_id].get('modes',{}))!={'0','1'}:
        raise ValueError('Hover requires its complete source attack modes')
    enemies[hover_id]['hover']=hover
    source_hashes['enemy-hover-contract']=hashlib.sha256(HOVER_CONTRACT.read_bytes()).hexdigest()
    source_hashes['enemy-hover-compiler']=hashlib.sha256((ROOT/'tools/enemy_hover.py').read_bytes()).hexdigest()
    has_timing = lambda v: bool(v.get('timing') or v.get('channels'))
    has_projectile = lambda v: bool(v.get('projectile') or any(c and c.get('projectile') for c in v.get('channels', {}).values()))
    counts = {"wantedEnemies": len(wanted), "profiles": len(enemies),
              "timings": sum(has_timing(v) for v in enemies.values()),
              "animationMappedTimings": sum(bool(v.get("timing", {}).get("sourceAnimations")) for v in enemies.values()),
              "projectileSpeeds": sum(has_projectile(v) for v in enemies.values()),
              "channelProfiles": sum('channels' in v for v in enemies.values()),
              "encounterChannelProfiles": sum('channels' in enemies[k] for k in set(enemies) & set(encounters)),
              "rootSelectedProfiles": sum(k in selected_roots for k in enemies),
              "encounterProfiles": len(set(enemies) & set(encounters)),
              "encounterTimings": sum(has_timing(enemies[k]) for k in set(enemies) & set(encounters)),
              "encounterAnimationMappedTimings": sum(bool(enemies[k].get("timing", {}).get("sourceAnimations")) for k in set(enemies) & set(encounters)),
              "encounterProjectileSpeeds": sum(has_projectile(enemies[k]) for k in set(enemies) & set(encounters))}
    counts.update(nonAttackingEnemies=len(no_basic_attack),
                  encounterNonAttackingEnemies=len(set(no_basic_attack) & set(encounters)),
                  pendingEnemies=len(gaps), pendingEncounterEnemies=len(set(gaps) & set(encounters)))
    counts.update(aliasPrefabs=alias_merge['addedPrefabs'], aliasAnimations=alias_merge['addedAnimations'])
    counts.update(eventGateTimings=sum(k in enemies and has_timing(enemies[k]) for k in gate_selections),
                  encounterEventGateTimings=sum(k in enemies and has_timing(enemies[k]) for k in set(gate_selections) & set(encounters)))
    counts.update(hitSequenceProfiles=len(hit_selections), encounterHitSequenceProfiles=len(set(hit_selections) & set(encounters)),
                  multiHitProfiles=sum(any(t.get('hits') for t in ts) for ts in hit_selections.values()))
    counts.update(modeProfileEnemies=sum(bool(p.get('modes')) for p in enemies.values()),
                  modeProfiles=sum(len(p.get('modes', {})) for p in enemies.values()),
                  encounterModeProfileEnemies=sum(bool(enemies[k].get('modes')) for k in set(enemies) & set(encounters)),
                  initialModeProfiles=sum('initialMode' in p for p in enemies.values()),
                  encounterInitialModeProfiles=sum('initialMode' in enemies[k] for k in set(enemies) & set(encounters)))
    counts.update(autoModeProviderEnemies=len(provider_selections),
                  autoModeProviders=sum(len(rows) for rows in provider_selections.values()),
                  encounterAutoModeProviderEnemies=len(set(provider_selections) & set(encounters)))
    counts.update(chainProjectileProfiles=len(chain_selections),
                  encounterChainProjectileProfiles=len(set(chain_selections) & set(encounters)))
    counts.update(selectableAttackProfiles=len(selectable_selections),
                  encounterSelectableAttackProfiles=len(set(selectable_selections) & set(encounters)))
    counts.update(enemyAuraProfiles=len(aura_selections),encounterEnemyAuraProfiles=len(set(aura_selections)&set(encounters)))
    counts.update(attachedProjectileProfiles=len(attach_selections),
                  encounterAttachedProjectileProfiles=len(set(attach_selections)&set(encounters)))
    counts.update(skillDispatchEnemies=len(skill_selections),
                  skillDispatchSkills=sum(map(len, skill_selections.values())),
                  encounterSkillDispatchEnemies=len(set(skill_selections) & set(encounters)),
                  encounterSkillDispatchSkills=sum(len(rows) for key, rows in skill_selections.items() if key in encounters))
    counts.update(periodicAbilityEnemies=len(periodic_selections),
                  periodicAbilityGroups=sum(map(len, periodic_selections.values())),
                  encounterPeriodicAbilityEnemies=len(set(periodic_selections) & set(encounters)))
    playback_report = summarize_playback(enemies, encounters, playback_reasons)
    counts.update(nativePlaybackEnemies=playback_report['native']['enemies'],
                  nativePlaybackTimingSlots=playback_report['native']['timingSlots'],
                  encounterNativePlaybackEnemies=playback_report['native']['encounterEnemies'],
                  encounterNativePlaybackTimingSlots=playback_report['native']['encounterTimingSlots'])
    counts.update(encounterFlatDirectDelivery=delivery_report['counts'].get('direct', 0),
                  encounterFlatProjectileDelivery=delivery_report['counts'].get('projectile', 0))
    result = {"schemaVersion": 1, "source": {"repository": "Tim23333/Arknights_timer", "commit": COMMIT,
              "license": "Tim23333 Non-Commercial v1", "licensePath": "licenses/Tim23333-Arknights_timer-LICENSE.txt", "sourceHashes": source_hashes},
              "timingModel": "community-proportional-onattack-v1", "counts": counts, "enemies": enemies,
              "attackCapabilities": no_basic_attack}
    result['source']['attackCapabilities'] = capabilities['source']
    result['source']['appearanceScope'] = dict(path='work/garrison-encounter-scope.json',
        rule=appearance_scope['rule'], sourceHashes=appearance_scope['sourceHashes'])
    result['source']['timingGateRule'] = GATE_RULE
    result['source']['animationPlaybackRule'] = PLAYBACK_RULE
    result['source']['flatDeliveryRule'] = DELIVERY_RULE
    result['source']['hitSequenceRule'] = HIT_RULE
    result['source']['modeProfileRule'] = MODE_RULE
    result['source']['initialModeRule'] = INITIAL_RULE
    result['source']['modeProviderRule'] = 'shared-enemy-mode-providers-v2'
    result['source']['modeProviderRules'] = dict(blocked=MODE_PROVIDER_RULE, hp=HP_PROVIDER_RULE, passiveEffects=PASSIVE_EFFECT_RULE)
    result['source']['modeEventRule'] = MODE_EVENT_RULE
    result['source']['chainProjectileRule'] = CHAIN_RULE
    result['source']['selectableAttackRule'] = SELECTABLE_RULE
    result['source']['enemyAuraRule'] = AURA_RULE
    result['source']['attachedProjectileRule'] = ATTACH_RULE
    result['source']['skillDispatchRule'] = SKILL_RULE
    result['source']['selfCastSkillRule'] = SELF_CAST_RULE
    result['source']['periodicAbilityRule'] = PERIODIC_RULE
    result['source']['areaMeleeSkillRule'] = AREA_MELEE_RULE
    result['source']['taggedRangedSkillRule'] = TAGGED_RANGED_RULE
    result['source']['channelRule'] = 'separate-combat-attack-identical-across-all-modes-v1'
    result['source']['prefabAliases'] = dict(mapping=resource_aliases, fingerprint=alias_hash,
                                            databaseSha256=capabilities['source']['sha256'])
    if supplement:
        result['source']['animationSupplement'] = {key: supplement['source'][key] for key in
            ('repository', 'commit', 'gameDataVersion', 'region', 'parser')}
    if metadata_supplement:
        result['source']['animationMetadataSupplement'] = metadata_supplement['source']
    report = {"source": result["source"], "counts": counts,
              "animationSupplement": animation_merge,
              "animationMetadataSupplement": metadata_merge,
              "prefabAliases": dict(**alias_merge, refreshedCatalogRows=refreshed_prefabs),
              "attackCapabilities": dict(source=capabilities['source'], cacheHit=capabilities_cached,
                  rule='explicit-NONE-inherited-by-all-database-levels-v1',
                  notApplicable=no_basic_attack,
                  boundary='Only generic basic attacks. General abilities, buffs, phases and skills remain separate work.'),
              "rootInventory": dict(path='work/enemy-root-capability-catalog.json', cacheHit=roots_cached,
                                    counts=roots['counts']),
              "channels": dict(catalog='work/enemy-mode-channels.json', cacheHit=channels_cached,
                  rule='separate-combat-attack-identical-across-all-modes-v1',
                  unresolved=channel_gaps,
                  resolvedOutsideHistoricalMembers=uncached_channel_selections,
                  boundary='The historical member cache is an extraction optimization. Newly exposed gaps may use already-loaded complete root/prefab records with the same compiler. No phase-zero assumption or phase transition synthesis; all modes must agree per channel.'),
              "eventGates": dict(rule=GATE_RULE, evidence=GATE_EVIDENCE, selections=gate_selections),
              "chainProjectiles": dict(rule=CHAIN_RULE, candidates='work/enemy-chain-projectile-candidates.json',
                  sourceFingerprint=chain_fingerprint, selections=chain_selections, rejections=chain_rejections,
                  boundary='Exact frozen CN root actions/attack@ blackboards joined to complete JP projectile components. Same-frame nearest-unique chaining, parameter scope, EP decay and cast-token invalidation are explicit shared inferences. Cold hit Buffs, skills and other enemy abilities stay unresolved.'),
              "selectableAttacks": dict(rule=SELECTABLE_RULE,
                  candidates=str(SELECTABLE_CACHE.relative_to(ROOT)), selections=selectable_selections,
                  rejections=selectable_rejections,
                  boundary='Complete ordinary root body only, not whole enemies. Native/source fields plus official CN handbook support ordered special-target preference and forced valid trace alongside opponent-only splash as cross-source inferences. Emitted shots persist after cast/source end; invalid targets and lifetime arrival are explicit simulation policies.'),
              "enemyAuras":dict(rule=AURA_RULE,candidates=str(AURA_CACHE.relative_to(ROOT)),
                  selections=aura_selections,rejections=aura_rejections,
                  boundary='Complete source Talent chain and separately proven empty sole ordinary mode. Static source collider 0.5 and zero/full-absorption damage-event suppression are explicit model boundaries; not full-enemy or native frame equivalence.'),
              "attachedProjectiles": dict(rule=ATTACH_RULE,candidates=str(ATTACH_CACHE.relative_to(ROOT)),
                  selections=attach_selections,rejections=attach_rejections,
                  boundary='Complete ordinary ranged body only. Exact cached INPUT_VECTOR3 and owner range replacement; final priority order, 2D emit-time capture and independent delayed lifetime remain explicit simulation policies. Marker producer and whole enemy completion are not asserted.'),
              "skillDispatch": dict(rule=SKILL_RULE, candidates=len(skill_candidates['candidates']),
                  candidateIDs=sorted(skill_candidates['candidates']),
                  candidateCache='work/enemy-skill-dispatch-candidates.json',
                  sourceFingerprint=skill_candidates['sourceFingerprint'], cacheHit=skill_candidates_cached,
                  selections=skill_selections, rejections=skill_rejections,
                  evidence=str(SP_CONTRACT.relative_to(ROOT)),
                  selfCastEvidence=str(SELF_CAST_CONTRACT.relative_to(ROOT)), selfCastRule=SELF_CAST_RULE,
                  areaMeleeEvidence=str(AREA_MELEE_CONTRACT.relative_to(ROOT)), areaMeleeRule=AREA_MELEE_RULE,
                  taggedRangedEvidence=str(TAGGED_RANGED_CONTRACT.relative_to(ROOT)), taggedRangedRule=TAGGED_RANGED_RULE,
                  multiMeleeEvidence=str(MULTI_MELEE_CONTRACT.relative_to(ROOT)), multiMeleeRule=MULTI_MELEE_RULE,
                  multiMeleeBoundary='Complete mode-owned body only; real Reborn entry is pending. Fixed interval timing and blocker-input bridge remain Inferred. No automatic encounter phase or whole-enemy completion claim.',
                  boundary='Complete frozen ranged SP groups, source-HP-listener self-cast groups, cooldown/direct-area-melee groups and tagged-selector ranged groups with loaded active Buffs. Selector families reset skill cooldown at successful cast start through native EnemySkill.CastToTarget/Next. Tagged ranged requires its entire source SpData controller recovery/stop gate, tag and ground filters, loaded stun, and projectile group. Self-cast accepts its entire dormant mode, periodic predicate, movement restriction, marker and finish mode command; source AlwaysTrigger uses only its actual named listener. Source-BOSS skill bodies require complete mode ownership; selections separately record initial mounting and automatic entry, and dedicated executors retain ownership. Separately compiled mode effects appear under periodicAbilities; unbound sibling skills and whole-enemy phases remain pending. Cross-snapshot mounting, cast/mode timer progression, target ordering, projectile expiration bridging and unreadable target-selection overrides retain explicit inferences.'),
              "periodicAbilities": dict(rule=PERIODIC_RULE, sourceFingerprint=periodic_contract.get('sourceFingerprint'),
                  contract=str(PERIODIC_CONTRACT.relative_to(ROOT)), selections=periodic_selections,
                  rejections=periodic_rejections,
                  boundary='One complete mode-owned group per enemy: multiplier-layer movement, all Revive Buffs, max-HP periodic self-damage, full named Scream ability and real circle range, and normal-combat-only SANITY/nerve damage parameters. It is not an EnemySkill and does not reduce the frozen skill queue. Native source flags/enums and independent HP/EP nodes are verified; ATK-based EP formula, scheduler attachment and cross-snapshot ownership retain explicit inferences.'),
              "hitSequences": dict(rule=HIT_RULE, selections=hit_selections, unresolved=hit_unresolved,
                  evidence='work/client-logic/native-enemy-hit-sequence/evidence.json',
                  boundary='Exact unique MonoScript type plus fixed source fields; multi-hit implementation is a shared-schema inference. Split, dynamic and custom repeats remain unresolved.'),
              "modeProfiles": dict(rule=MODE_RULE, initialModeRule=INITIAL_RULE, unresolved=mode_gaps,
                  dormantModeRule=DORMANT_RULE, dormantModes=dormant_selections,
                  catalog='work/enemy-mode-dispatch-catalog.json', ownership='work/enemy-mode-ownership-overlay.json',
                  nativeEvidence='work/client-logic/native-enemy-mode-dispatch',
                  ownershipCounts=ownership.get('counts', {}),
                  boundary='Independent mode/channel profiles execute for the selected mode. Initial zero is bound only with complete JP talent/skill coverage and negative defaults in both snapshots; the CN ownership overlay is an explicit cross-snapshot inference. Phase transitions, mode attributes/ranges and general abilities remain separate; existing gaps stay open.'),
              "modeProviders": dict(rule=result['source']['modeProviderRule'], eventRule=MODE_EVENT_RULE,
                  rules=result['source']['modeProviderRules'], blackboardCacheHit=blackboards_cached,
                  candidates=provider_candidates['counts'], candidateCacheHit=providers_cached,
                  selections=provider_selections, rejections=provider_rejections,
                  evidence=str(mode_contract_path.relative_to(ROOT)),
                  boundary='Complete root passive Buff chains execute on blocked or HP condition edges. HP chains include all declared Buffs, attributes and output-damage listeners. Native predicates/parameters are known; namespace/target/attachment and FP tolerance use explicit inferences. Other mounted abilities, full enemy phases and original visual effects remain pending.'),
              "rootSelection": {"rule": "complete-cached-mode-roots-v1", "cacheValid": root_cache_valid,
                                "selected": selected_roots, "catalog": "work/enemy-action-template-catalog.json"},
              "preAttackAnimations": pre_attack_report,
              "animationPlayback": playback_report,
              "flatAttackDelivery": delivery_report,
              "execution": ["single-cast and fixed multi-event basic-attack schedules", "constant-speed basic projectiles",
                            "fixed zero-interval chain projectiles with serializable cast invalidation",
                            "mode-mounted selector-triggered SP-cost ranged skills with complete normal-action charge sources",
                            "complete initial-mode cooldown/direct-area-melee skills with native cast-start cooldown and clamped animation timing",
                            "complete source-SP tagged-selector ranged skills with loaded active Buffs and bound projectiles",
                            "complete mode-owned periodic Buff and named-ability groups with scoped normal-attack elemental damage",
                            "explicit database NONE disables generic basic attacks unless overridden"],
              "timingEvidence": "Imported Spine timestamps; explicit plain/multi basic attacks with complete mode0/event-wait/cap fields now carry native FROM_ATTACK_SPEED duration scaling with maxAnimScale and Epsilon 0.1. Other ordinary timings retain the prior community-proportional fallback. Independent NoPre animation providers and dedicated skill executors keep their existing contracts. Focused area-melee and tagged-ranged classes already use the same native cap. The tagged class binds first successful spell output to source attack SP recovery with the casting recovery-stop gate; cross-snapshot application, scheduler bridging and cast-start attribute snapshots retain explicit inference boundaries.",
              "preservedOverrides": "Boss-specific basic-attack profiles and explicit entity timing/projectile overrides take priority.",
              "gapCounts": dict(Counter(reason for reasons in gaps.values() for reason in reasons)), "gaps": gaps}
    return result, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    data, report = compile_data(args.source)
    license_file = args.source.parents[2] / "LICENSE"
    license_output = ROOT / "web" / data["source"]["licensePath"]
    license_output.parent.mkdir(parents=True, exist_ok=True)
    license_output.write_bytes(license_file.read_bytes())
    output = ROOT / "web/external_combat_data.js"
    output.write_text("// Generated by tools/build_external_combat_data.py; source and license retained below.\n"
                      "window.ArkExternalCombatData=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    report_path = ROOT / "work/external-combat-import-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**data["counts"], "browserBytes": output.stat().st_size,
                      "report": str(report_path.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
