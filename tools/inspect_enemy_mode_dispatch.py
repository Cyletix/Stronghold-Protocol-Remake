"""Freeze mode-dispatch gaps and index declared triggers without inventing phases.

This is an evidence catalog, not an executable phase model. Source component
membership in Unity GameObjects is unavailable in Tim's prefab export; a missing
PPtr edge cannot establish that a talent is global or inactive.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'work/enemy-mode-dispatch-catalog.json'
CATALOG = ROOT / 'work/enemy-action-template-catalog.json'
CHANNELS = ROOT / 'work/enemy-mode-channels.json'
PREFABS = ROOT / 'work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator/data_enemy_prefab_catalog_current.json'
SCRIPT_TYPES = ROOT / 'work/client-logic/script-types.json'
RULE_VERSION = 1
SWITCH = 'Torappu.Battle.Action.Nodes+SwitchMode'
REBORN = 'Torappu.Battle.RebornTalent'
HP = 'Torappu.Battle.Abilities.HpRatioToggleChecker'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode()).hexdigest()


def load_catalog(path=OUTPUT):
    """Load only the frozen evidence; consumers do not need the prefab source."""
    return read(path) if Path(path).is_file() else {}


def unique_script_types(source):
    candidates = defaultdict(set)
    for bundle in source['matches']:
        for pid, row in bundle.get('scripts', {}).items():
            candidates[str(pid)].add(row['m_Namespace'] + '.' + row['m_ClassName'])
    return {pid: sorted(names) for pid, names in candidates.items()}


def walk(value, path=''):
    """Visit source dictionaries and explicitly serialized Action node graphs."""
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            child_path = path + '/' + key
            if key == 'SerializedState' and isinstance(child, str):
                try:
                    yield from walk(json.loads(child), child_path + '{json}')
                except (ValueError, TypeError):
                    pass  # The raw string and explicit parse error are retained separately.
            else:
                yield from walk(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + '/' + str(index))


def inspect_enemy(enemy_id, frozen, prefab, script_types, channel_record=None, source_enemy_id=None):
    """Pure indexing of one already selected source record; no runtime claims."""
    raw = prefab.get('components', [])
    keys, by_identity = [], defaultdict(list)
    for ordinal, row in enumerate(raw):
        identity = f"{row.get('cabin')}:{row.get('pathID')}"
        key = identity + ':' + str(ordinal)
        keys.append(key)
        by_identity[(row.get('cabin'), str(row.get('pathID')))].append(key)
    components = {}
    for key, row in zip(keys, raw):
        candidates = script_types.get(str(row.get('scriptPathID')), [])
        graphs = []
        for path, item in walk(row.get('fields', {})):
            if isinstance(item.get('SerializedState'), str):
                try:
                    graphs.append(dict(path=path + '/SerializedState', nodes=json.loads(item['SerializedState'])))
                except (ValueError, TypeError) as error:
                    graphs.append(dict(path=path + '/SerializedState', error=str(error)))
        components[key] = dict(sourceComponentIndex=int(key.rsplit(':', 1)[1]),
            cabin=row.get('cabin'), pathID=str(row.get('pathID')),
            scriptPathID=str(row.get('scriptPathID')), scriptType=candidates[0] if len(candidates) == 1 else None,
            scriptTypeCandidates=candidates, sourceClass=row.get('class'), fields=row.get('fields', {}),
            serializedGraphs=graphs,
            retainedSourceMetadata={name: value for name, value in row.items()
                                    if name not in ('cabin', 'pathID', 'scriptPathID', 'class', 'fields')})

    def resolve(ref, cabin):
        result = dict(reference=ref)
        if not isinstance(ref, dict) or 'm_PathID' not in ref:
            return dict(result, status='not-a-pptr')
        if ref.get('m_FileID', 0):
            return dict(result, status='external-reference')
        if not ref['m_PathID']:
            return dict(result, status='null-reference')
        targets = by_identity.get((cabin, str(ref['m_PathID'])), [])
        if len(targets) != 1:
            return dict(result, status='ambiguous-reference' if targets else 'missing-reference', candidates=targets)
        return dict(result, status='resolved', targetComponentKey=targets[0])

    edges, incoming, outgoing = [], defaultdict(list), defaultdict(list)
    for key, row in components.items():
        for path, value in walk(row['fields']):
            if 'm_PathID' not in value:
                continue
            edge = dict(sourceComponentKey=key, fieldPath=path, **resolve(value, row['cabin']))
            edges.append(edge)
            if edge['status'] == 'resolved':
                incoming[edge['targetComponentKey']].append(edge)
                outgoing[key].append(edge['targetComponentKey'])
    entities, modes = [], []
    for key, row in components.items():
        refs = row['fields'].get('_modes')
        if not isinstance(refs, list):
            continue
        entity = dict(componentKey=key, scriptType=row['scriptType'], fields=row['fields'], modeIndices=[])
        for index, ref in enumerate(refs):
            resolved = resolve(ref, row['cabin'])
            mode = dict(entityComponentKey=key, modeIndex=index, **resolved)
            if resolved['status'] == 'resolved':
                target = components[resolved['targetComponentKey']]
                mode.update(modePathID=target['pathID'], cabin=target['cabin'],
                            scriptType=target['scriptType'], fields=target['fields'])
            entity['modeIndices'].append(index)
            modes.append(mode)
        entities.append(entity)

    entrypoints = []
    for mode in modes:
        for path, value in walk({name: mode.get('fields', {}).get(name)
            for name in ('_combat', '_attack', '_attackTrigger', '_generalAbilities')}):
            if 'm_PathID' in value:
                entrypoints.append(dict(kind='mode-field', modeIndex=mode['modeIndex'],
                    entityComponentKey=mode['entityComponentKey'], fieldPath=path,
                    **resolve(value, mode.get('cabin'))))
    for entity in entities:
        row = components[entity['componentKey']]
        for path, value in walk({'_commonAbilities': row['fields'].get('_commonAbilities')}):
            if 'm_PathID' in value:
                entrypoints.append(dict(kind='entity-common-ability', entityComponentKey=entity['componentKey'],
                    fieldPath=path, **resolve(value, row['cabin'])))
    reachable_from = defaultdict(list)
    for entry_index, entry in enumerate(entrypoints):
        if entry['status'] != 'resolved':
            continue
        queue, seen = deque([entry['targetComponentKey']]), set()
        while queue:
            key = queue.popleft()
            if key in seen:
                continue
            seen.add(key)
            reachable_from[key].append(entry_index)
            # Do not walk back through entity/mode references and turn a target
            # pointer into proof of ownership of every mode in that entity.
            queue.extend(target for target in outgoing[key]
                         if not ('_modes' in components[target]['fields']
                                 or components[target]['scriptType'] == 'Torappu.Battle.UnitMode'))

    def relation(key):
        return dict(incomingReferences=incoming[key], reachableFromEntrypoints=reachable_from[key],
            unityOwnership='unresolved-missing-gameobject-membership',
            boundary='PPtr reachability is observed linkage, not proof of talent activation or Unity ownership')

    def mode_target(index, target_scope='ability-owner', restore=False, dynamic=False):
        if restore:
            return dict(status='restore-active-talent-default', targetScope=target_scope)
        if dynamic:
            return dict(status='blackboard-mode-unresolved', targetScope=target_scope, rawModeIndex=index)
        if target_scope != 'ability-owner':
            return dict(status='target-entity-unresolved', targetScope=target_scope, rawModeIndex=index)
        if len(entities) != 1:
            return dict(status='entity-mode-table-ambiguous', rawModeIndex=index)
        matches = [mode for mode in modes if type(index) is int and mode['modeIndex'] == index
                   and mode['status'] == 'resolved']
        return (dict(status='resolved-mode-index', modeIndex=index,
                     targetComponentKey=matches[0]['targetComponentKey']) if len(matches) == 1 else
                dict(status='invalid-or-sentinel-mode-index', rawModeIndex=index))

    reborn, switches, hp, toggles, defaults, nodes, mode_bb = [], [], [], [], [], [], []
    for key, component in components.items():
        fields, typename = component['fields'], component['scriptType'] or ''
        if '_defaultModeIndex' in fields:
            defaults.append(dict(componentKey=key, scriptType=typename,
                rawDefaultModeIndex=fields['_defaultModeIndex'], relationship=relation(key),
                modeTarget=mode_target(fields['_defaultModeIndex'])))
        if typename == REBORN:
            reborn.append(dict(componentKey=key, fields=fields, relationship=relation(key),
                modeTarget=mode_target(fields.get('_modeIndex')),
                handlerResolution='ability-name-not-resolvable-without-gameobject-names' if fields.get('_useAbilityToHandle') else 'not-requested'))
        if typename == HP:
            hp.append(dict(componentKey=key, fields=fields, relationship=relation(key)))
        if 'Toggle' in typename and typename != HP:
            toggles.append(dict(componentKey=key, scriptType=typename, fields=fields, relationship=relation(key)))
        for path, node in walk(fields):
            if '$type' in node:
                nodes.append(dict(componentKey=key, fieldPath=path, nodeType=node['$type']))
            if node.get('$type') == SWITCH:
                scope = 'ability-owner' if node.get('_targetType') == 'ABILITY_OWNER' else node.get('_targetType', 'unknown')
                switches.append(dict(componentKey=key, fieldPath=path, fields=node, relationship=relation(key),
                    modeTarget=mode_target(node.get('_modeIndex'), scope, node.get('_restoreDefault'), node.get('_loadModeFromBlackboard'))))
            if node.get('key') in ('mode', 'mode_index', 'default_mode') and 'value' in node:
                mode_bb.append(dict(componentKey=key, fieldPath=path, fields=node,
                                    boundary='A blackboard name alone does not identify the consuming mode operation'))
    linked_owner_switch = any(s['fields'].get('_targetType') == 'ABILITY_OWNER'
                              and s['relationship']['reachableFromEntrypoints'] for s in switches)
    subclasses = []
    if linked_owner_switch:
        subclasses.append('explicit-owner-switch-linked-to-mode-entry')
    if reborn:
        subclasses.append('reborn-mode-configuration')
    if switches and not linked_owner_switch:
        subclasses.append('switch-node-trigger-or-target-unresolved')
    if hp:
        subclasses.append('hp-toggle-checker-present-no-phase-link-proven')
    if toggles:
        subclasses.append('buff-or-state-toggle-present-no-phase-link-proven')
    if any(item['rawDefaultModeIndex'] != -1 for item in defaults):
        subclasses.append('talent-default-mode-override-declared')
    if mode_bb:
        subclasses.append('mode-blackboard-consumer-unresolved')
    if not subclasses:
        subclasses.append('mode-selection-trigger-unresolved')
    return dict(enemyId=enemy_id, name=frozen['name'], inEncounterPool=frozen['inEncounterPool'],
        sourceEnemyId=source_enemy_id or enemy_id, prefabAliasApplied=(source_enemy_id or enemy_id) != enemy_id,
        primarySubclass=subclasses[0], subclasses=subclasses,
        phaseInterpretation='unresolved: mode count and action differences do not prove a chronological phase',
        sourcePrefabMetadata={key: value for key, value in prefab.items() if key != 'components'},
        componentSourceShape=sorted({key for component in raw for key in component}),
        entities=entities, modes=modes, components=components, references=edges, entrypoints=entrypoints,
        initialMode=dict(selectedModeIndex=None, status='requires-active-talent-membership-and-native-default-rule',
                         talentDefaultModeFields=defaults),
        rebornConfigurations=reborn, switchNodes=switches, hpToggleCheckers=hp,
        otherToggleComponents=toggles, serializedNodeTypes=nodes, modeBlackboardEntries=mode_bb,
        cachedChannels=channel_record, frozenGapRecord=frozen)


def summarize(enemies):
    families, types, node_types = defaultdict(set), defaultdict(set), defaultdict(set)
    component_counts, node_counts, reborn_values = Counter(), Counter(), defaultdict(Counter)
    for key, row in enemies.items():
        for family in row['subclasses']:
            families[family].add(key)
        for component in row['components'].values():
            typename = component['scriptType'] or '(unknown-or-ambiguous)'
            types[typename].add(key)
            component_counts[typename] += 1
        for node in row['serializedNodeTypes']:
            node_types[node['nodeType']].add(key)
            node_counts[node['nodeType']] += 1
        for component in row['rebornConfigurations']:
            for field, value in component['fields'].items():
                if not isinstance(value, (dict, list)):
                    reborn_values[field][json.dumps(value, ensure_ascii=False)] += 1
    def groups(mapping, counts=None):
        return {name: dict(enemyCount=len(ids), memberIDs=sorted(ids),
                encounterIDs=sorted(key for key in ids if enemies[key]['inEncounterPool']),
                representatives=sorted(ids, key=lambda key: (not enemies[key]['inEncounterPool'], key))[:2],
                **({'occurrences': counts[name]} if counts else {}))
                for name, ids in sorted(mapping.items())}
    return dict(enemies=len(enemies), encounterEnemies=sum(row['inEncounterPool'] for row in enemies.values()),
        components=sum(len(row['components']) for row in enemies.values()),
        primarySubclasses=dict(Counter(row['primarySubclass'] for row in enemies.values())),
        families=groups(families), scriptTypes=groups(types, component_counts),
        actionNodeTypes=groups(node_types, node_counts),
        rebornScalarValues={key: dict(value) for key, value in sorted(reborn_values.items())})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Re-index the existing fixed members when source or rules change')
    parser.add_argument('--include-new-gaps', action='store_true', help='With --refresh, add current mode-dispatch gaps; never remove members')
    parser.add_argument('--dry-run', action='store_true', help='Report membership and cache state without writing')
    args = parser.parse_args()
    if args.include_new_gaps and not args.refresh:
        parser.error('--include-new-gaps requires --refresh')
    old, catalog = load_catalog(), read(CATALOG)
    sources = {str(path.relative_to(ROOT)): digest(path) for path in (PREFABS, SCRIPT_TYPES, CHANNELS)}
    aliases = catalog.get('prefabAliases', {})
    source_fingerprint = fingerprint(dict(sourceHashes=sources, prefabAliases=aliases, ruleVersion=RULE_VERSION))
    if old and old.get('sourceFingerprint') == source_fingerprint and not args.refresh:
        print(json.dumps(dict(cacheHit=True, written=False, members=len(old['memberIDs']), counts=old['counts']['primarySubclasses'])))
        return
    if old and not args.refresh:
        raise ValueError('Mode dispatch evidence source changed; run --refresh to rebuild the frozen members')
    members = old.get('memberIDs', [])
    current = {key: row for key, row in catalog['enemies'].items()
               if row.get('importGaps') and row['primaryTemplate'] == 'mode-dispatch'}
    if not old or args.include_new_gaps:
        members = sorted(set(members) | set(current))
    if args.dry_run:
        print(json.dumps(dict(cacheHit=False, written=False, members=len(members), sourceHashes=sources)))
        return
    prefabs, channels = read(PREFABS)['prefabs'], read(CHANNELS).get('enemies', {})
    script_types = unique_script_types(read(SCRIPT_TYPES))
    enemies = {}
    for key in members:
        frozen = old.get('enemies', {}).get(key, {}).get('frozenGapRecord') or current[key]
        source_key = key if key in prefabs else aliases.get(key, key)
        enemies[key] = inspect_enemy(key, frozen, prefabs.get(source_key, {}), script_types,
                                     channels.get(key), source_key)
    result = dict(schemaVersion=1, ruleVersion=RULE_VERSION, memberIDs=members,
        cohortSource=old.get('cohortSource') or dict(path=str(CATALOG.relative_to(ROOT)), sha256=digest(CATALOG),
            filter='importGaps nonempty AND primaryTemplate == mode-dispatch'),
        sourceHashes=sources, sourceFingerprint=source_fingerprint, prefabAliases=aliases,
        source=dict(repository='Tim23333/Arknights_timer',
                    prefabPath=str(PREFABS.relative_to(ROOT)), scriptTypeRule='unique MonoScript namespace+class per pathID'),
        boundaries=[
            'Classification is source-declared evidence, never permission to execute a phase or select mode zero.',
            'Stable modeIndex is the position in the exact entity._modes array; only unique same-cabin internal PPtrs resolve.',
            'Component GameObject membership, names, and transform parent hierarchy are absent from this prefab source.',
            'No PPtr incoming edge does not imply a talent is global, inactive, or absent; Unity component discovery remains unknown.',
            'HP/toggle checkers are not phase triggers unless their link to a mode operation is established.',
            'All component fields for the frozen cohort are retained to avoid subsequent source rereads.',
        ], counts=summarize(enemies), enemies=enemies)
    temporary = OUTPUT.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(OUTPUT)
    print(json.dumps(dict(output=str(OUTPUT), written=True, members=len(members),
        encounterMembers=result['counts']['encounterEnemies'], components=result['counts']['components'],
        primarySubclasses=result['counts']['primarySubclasses']), ensure_ascii=False))


if __name__ == '__main__':
    main()
