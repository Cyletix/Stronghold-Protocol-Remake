"""Join frozen CN mode evidence to exact local JP Unity ownership metadata.

No APK is unpacked. Identity gates use the asset-container key, path IDs, script
IDs, ordered mode references, and matching shared fields. Added/removed schema
fields remain visible; ownership comes from the pinned JP graph, not a claim
that every CN/JP behavior or component hierarchy is release-identical.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

from inspect_enemy_mode_dispatch import OUTPUT as INVENTORY, ROOT, fingerprint, load_catalog, read

sys.path.insert(0, str(ROOT.parent / 'src'))
from arkresearch.client_logic import ClientLogicStore
from arkresearch.client_scripts import ClientScriptStore

OUTPUT = ROOT / 'work/enemy-mode-ownership-overlay.json'
EVIDENCE_ID = 'jp-36.7.22-client-logic'
SCRIPT_ID = 'jp-36.7.22-script-types-r1'
TYPE_INVENTORY = ROOT / 'work/inventory.sqlite'
RULE_VERSION = 3
UNITY_METADATA = {'m_GameObject', 'm_Enabled', 'm_Script', 'm_Name'}


def load_ownership_overlay(path=OUTPUT):
    return read(path) if Path(path).is_file() else {}


def compare_fields(cn, jp, path=''):
    """Record schema differences separately; never ignore changed shared values."""
    differences, schema = [], []
    if isinstance(cn, dict) and isinstance(jp, dict):
        for key in sorted(set(cn) | set(jp)):
            at = path + '/' + key
            if key not in cn or key not in jp:
                schema.append(dict(path=at, onlyIn='JP' if key not in cn else 'CN',
                                   value=jp.get(key) if key not in cn else cn.get(key)))
            elif key == 'm_PathID':
                if str(cn[key]) != str(jp[key]):
                    differences.append(dict(path=at, CN=cn[key], JP=jp[key]))
            elif key == 'SerializedState' and isinstance(cn[key], str) and isinstance(jp[key], str):
                try:
                    sub, extra = compare_fields(json.loads(cn[key]), json.loads(jp[key]), at + '{json}')
                    differences.extend(sub)
                    schema.extend(extra)
                except (ValueError, TypeError):
                    if cn[key] != jp[key]:
                        differences.append(dict(path=at, CN=cn[key], JP=jp[key]))
            else:
                sub, extra = compare_fields(cn[key], jp[key], at)
                differences.extend(sub)
                schema.extend(extra)
    elif isinstance(cn, list) and isinstance(jp, list):
        if len(cn) != len(jp):
            differences.append(dict(path=path, CNLength=len(cn), JPLength=len(jp)))
        for index, (a, b) in enumerate(zip(cn, jp)):
            sub, extra = compare_fields(a, b, path + '/' + str(index))
            differences.extend(sub)
            schema.extend(extra)
    elif cn != jp:
        differences.append(dict(path=path, CN=cn, JP=jp))
    return differences, schema


class GraphReader:
    """Batched reads of requested components and their ownership ancestors only."""
    def __init__(self, evidence, scripts, metadata):
        self.connection = evidence._connection()
        self.nodes = defaultdict(dict)
        self.missing = defaultdict(set)
        self.scripts, self.metadata = scripts, metadata
        self.script_cache = {}
        rows = self.connection.execute("SELECT full_name,json_extract(raw_json,'$.byvalTypeIndex'),"
                                       "json_extract(raw_json,'$.parentIl2CppTypeIndex') FROM native_types").fetchall()
        byval = {index: name for name, index, _ in rows}
        self.parents = {name: byval.get(parent) for name, _, parent in rows}
        self.object_inventory = sqlite3.connect(TYPE_INVENTORY.resolve().as_uri() + '?mode=ro&immutable=1', uri=True)
        self.object_type_cache = {}

    def omitted_component_type(self, bundle, ref):
        if not isinstance(ref, dict) or ref.get('m_FileID', 0):
            return dict(status='external-or-invalid-reference', reference=ref)
        key = (bundle, str(ref.get('m_PathID')))
        if key not in self.object_type_cache:
            try:
                pid = int(key[1])
            except (ValueError, TypeError):
                return dict(status='invalid-path-id', reference=ref)
            rows = self.object_inventory.execute('SELECT o.type FROM objects o JOIN bundles b ON o.bundle_id=b.id '
                'WHERE b.path=? AND o.path_id=?', (bundle, pid)).fetchall()
            self.object_type_cache[key] = (dict(status='resolved', unityType=rows[0][0],
                rule='unique-exact-bundle-path-and-path-id', bundle=bundle, pathID=key[1]) if len(rows) == 1 else
                dict(status='ambiguous-or-missing-type-inventory', bundle=bundle, pathID=key[1], matches=len(rows)))
        return self.object_type_cache[key]

    def script(self, bundle, reference):
        key = (bundle, fingerprint(reference))
        if key in self.script_cache:
            return self.script_cache[key]
        files = self.metadata[bundle].get('externals', {})
        result = dict(status='unresolved-script-reference', reference=reference)
        if len(files) == 1 and isinstance(reference, dict):
            file_id, pid = reference.get('m_FileID'), reference.get('m_PathID')
            cabin = next(iter(files))
            externals = files[cabin]
            if type(file_id) is int and isinstance(pid, str) and 0 <= file_id <= len(externals):
                script_cab = cabin if not file_id else externals[file_id - 1].rsplit('/', 1)[-1]
                match = self.scripts.scripts.get((script_cab, pid))
                if match:
                    row, origin = match
                    result = dict(status='resolved', type='.'.join(filter(None, (row['m_Namespace'], row['m_ClassName']))),
                        scriptCab=script_cab, scriptPathID=pid, scriptBundle=origin['bundle'],
                        scriptBundleSha256=origin['sha256'])
        self.script_cache[key] = result
        return result

    def ancestry(self, typename):
        names, seen = [], set()
        while typename and typename not in seen:
            seen.add(typename)
            names.append(typename)
            typename = self.parents.get(typename)
        return names

    def ensure(self, bundle, identifiers):
        identifiers = sorted({str(pid) for pid in identifiers if str(pid) != '0'}
                             - self.nodes[bundle].keys() - self.missing[bundle])
        for offset in range(0, len(identifiers), 500):
            batch = identifiers[offset:offset + 500]
            rows = self.connection.execute('SELECT path_id,raw_json FROM components WHERE bundle=? AND path_id IN ('
                + ','.join('?' for _ in batch) + ')', [bundle, *batch]).fetchall()
            self.nodes[bundle].update((pid, json.loads(raw)) for pid, raw in rows)
            self.missing[bundle].update(set(batch) - self.nodes[bundle].keys())

    def node(self, bundle, ref):
        if not isinstance(ref, dict) or ref.get('m_FileID', 0) or str(ref.get('m_PathID', 0)) == '0':
            return None
        self.ensure(bundle, [ref['m_PathID']])
        return self.nodes[bundle].get(str(ref['m_PathID']))

    def prefab_subtree(self, bundle, root_id):
        """Enumerate complete Transform children of this exact asset root only."""
        pending, visited, failures = {root_id}, set(), []
        while pending:
            current = pending - visited
            pending = set()
            if not current:
                break
            self.ensure(bundle, current)
            parts = []
            for pid in current:
                go = self.nodes[bundle].get(pid)
                if not go or go['unityType'] != 'GameObject':
                    failures.append(dict(pathID=pid, reason='missing-subtree-gameobject'))
                    continue
                refs = [item.get('component') for item in go['fields'].get('m_Component', [])]
                self.ensure(bundle, [ref['m_PathID'] for ref in refs if isinstance(ref, dict) and ref.get('m_FileID', 0) == 0])
                nodes = [self.node(bundle, ref) for ref in refs]
                if any(node is None for node in nodes):
                    omitted = [self.omitted_component_type(bundle, ref) for node, ref in zip(nodes, refs) if node is None]
                    failures.append(dict(pathID=pid, reason='incomplete-gameobject-components', omittedComponents=omitted,
                        allMissingAreNonMonoBehaviour=all(item.get('status') == 'resolved' and item.get('unityType') not in
                            {'MonoBehaviour', 'GameObject', 'Transform', 'RectTransform'} for item in omitted)))
                transforms = [node for node in nodes if node and node['unityType'] in ('Transform', 'RectTransform')]
                if len(transforms) != 1:
                    failures.append(dict(pathID=pid, reason='ambiguous-subtree-transform'))
                else:
                    parts.extend(transforms[0]['fields'].get('m_Children', []))
            self.ensure(bundle, [ref['m_PathID'] for ref in parts if isinstance(ref, dict) and ref.get('m_FileID', 0) == 0])
            for ref in parts:
                node = self.node(bundle, ref)
                owner = (node or {}).get('fields', {}).get('m_GameObject')
                if node and node['unityType'] in ('Transform', 'RectTransform') and isinstance(owner, dict) and owner.get('m_FileID', 0) == 0:
                    pending.add(str(owner['m_PathID']))
                else:
                    failures.append(dict(reference=ref, reason='unresolved-child-transform'))
            visited.update(current)
        return visited, failures

    def ownership_graph(self, bundle, game_object_ids):
        groups, failures = {}, []
        pending = set(game_object_ids)
        while pending:
            self.ensure(bundle, pending)
            current = [self.nodes[bundle].get(pid) for pid in sorted(pending)]
            pending = set()
            component_ids = []
            for go in current:
                if go and go['unityType'] == 'GameObject':
                    component_ids.extend(item['component']['m_PathID'] for item in go['fields'].get('m_Component', [])
                                         if item.get('component', {}).get('m_FileID', 0) == 0)
            self.ensure(bundle, component_ids)
            for go in current:
                if not go or go['unityType'] != 'GameObject':
                    failures.append(dict(reason='missing-or-non-gameobject-owner', pathID=(go or {}).get('pathId')))
                    continue
                pid, fields = go['pathId'], go['fields']
                parts = [self.node(bundle, item.get('component')) for item in fields.get('m_Component', [])]
                transforms = [part for part in parts if part and part['unityType'] in ('Transform', 'RectTransform')]
                group = dict(pathID=pid, name=fields.get('m_Name'), activeSelf=fields.get('m_IsActive'),
                    sourceFields=fields, componentPathIDs=[part['pathId'] if part else None for part in parts],
                    parentGameObjectPathID=None, hierarchyStatus='resolved')
                if len(transforms) != 1:
                    group['hierarchyStatus'] = 'ambiguous-or-missing-transform'
                else:
                    father_ref = transforms[0]['fields'].get('m_Father')
                    father = self.node(bundle, father_ref)
                    if father:
                        owner_ref = father['fields'].get('m_GameObject')
                        if isinstance(owner_ref, dict) and owner_ref.get('m_FileID', 0) == 0:
                            parent_id = str(owner_ref['m_PathID'])
                            group['parentGameObjectPathID'] = parent_id
                            if parent_id not in groups:
                                pending.add(parent_id)
                        else:
                            group['hierarchyStatus'] = 'unresolved-parent-owner'
                    elif not isinstance(father_ref, dict) or father_ref.get('m_FileID', 0) or str(father_ref.get('m_PathID', 0)) != '0':
                        group['hierarchyStatus'] = 'unresolved-parent-transform'
                groups[pid] = group
            pending.difference_update(groups)
        return groups, failures


def build_enemy_overlay(record, assets, graph):
    key = 'dyn/battle/prefabs/enemies/' + record['sourceEnemyId'] + '.prefab'
    candidates = assets.get(key, [])
    if len(candidates) != 1:
        return dict(enemyId=record['enemyId'], status='missing-or-ambiguous-asset-key', assetKey=key,
                    assetCandidates=candidates)
    source = candidates[0]
    bundle, root_ref = source['bundle'], source['reference']
    if root_ref.get('m_FileID', 0):
        return dict(enemyId=record['enemyId'], status='external-asset-root', source=source)
    root_id = str(root_ref['m_PathID'])
    graph.ensure(bundle, [root_id, *(item['pathID'] for item in record['components'].values())])
    root = graph.nodes[bundle].get(root_id)
    if not root or root['unityType'] != 'GameObject':
        return dict(enemyId=record['enemyId'], status='missing-root-gameobject', source=source)
    checked, owner_ids = {}, {root_id}
    for component_key, cn in record['components'].items():
        jp = graph.nodes[bundle].get(cn['pathID'])
        item = dict(componentKey=component_key, pathID=cn['pathID'], scriptType=cn['scriptType'])
        if not jp or jp['unityType'] != 'MonoBehaviour':
            checked[component_key] = dict(item, status='missing-or-non-monobehaviour')
            continue
        fields = jp['fields']
        if str(fields.get('m_Script', {}).get('m_PathID')) != cn['scriptPathID']:
            checked[component_key] = dict(item, status='script-path-id-mismatch', jpScript=fields.get('m_Script'))
            continue
        differences, schema = compare_fields(cn['fields'], {name: value for name, value in fields.items()
                                                           if name not in UNITY_METADATA})
        owner = fields.get('m_GameObject')
        if not isinstance(owner, dict) or owner.get('m_FileID', 0) or str(owner.get('m_PathID', 0)) == '0':
            checked[component_key] = dict(item, status='unresolved-gameobject-reference', reference=owner)
            continue
        owner_id = str(owner['m_PathID'])
        owner_ids.add(owner_id)
        checked[component_key] = dict(item, status='shared-fields-match' if not differences else 'shared-field-mismatch',
            sharedFieldDifferences=differences, schemaDifferences=schema, gameObjectPathID=owner_id,
            jpEnabled=fields.get('m_Enabled'), jpNodeSha256=fingerprint(jp))
    subtree, subtree_failures = graph.prefab_subtree(bundle, root_id)
    groups, failures = graph.ownership_graph(bundle, owner_ids | subtree)
    entity_keys = [row['componentKey'] for row in record['entities']]
    mode_keys = [row.get('targetComponentKey') for row in record['modes']]
    anchors = entity_keys + mode_keys
    anchored = (len(entity_keys) == 1 and bool(mode_keys) and all(key in checked
                and checked[key]['status'] == 'shared-fields-match' for key in anchors)
                and checked[entity_keys[0]].get('gameObjectPathID') == root_id)
    mode_owners = defaultdict(list)
    if anchored:
        for row in record['modes']:
            mode_owners[checked[row['targetComponentKey']]['gameObjectPathID']].append(row['modeIndex'])
    cn_by_pid = {row['pathID']: key for key, row in record['components'].items()}
    extra_jp_components = {}
    for group in groups.values():
        peers = []
        for pid in group['componentPathIDs']:
            node = graph.nodes[bundle].get(pid)
            if node and node['unityType'] == 'MonoBehaviour':
                cn_key = cn_by_pid.get(pid)
                peers.append(dict(pathID=pid, scriptPathID=node['fields'].get('m_Script', {}).get('m_PathID'),
                    cnComponentKey=cn_key, cnMatchStatus=checked.get(cn_key, {}).get('status', 'not-in-cn-component-catalog'),
                    scriptResolution=graph.script(bundle, node['fields'].get('m_Script'))))
                if cn_key is None:
                    extra_jp_components[pid] = node
        group['monoBehaviourCompanions'] = peers
    for component_key, item in checked.items():
        if 'gameObjectPathID' not in item:
            continue
        path, pid, seen, path_status = [], item['gameObjectPathID'], set(), 'resolved'
        while pid:
            if pid in seen or pid not in groups:
                path_status = 'cyclic-or-incomplete-hierarchy'
                break
            seen.add(pid)
            group = groups[pid]
            path.append(dict(pathID=pid, name=group['name']))
            if group['hierarchyStatus'] != 'resolved':
                path_status = group['hierarchyStatus']
                break
            pid = group['parentGameObjectPathID']
        mode_indices = sorted({index for node in path for index in mode_owners[node['pathID']]})
        eligible = anchored and item['status'] == 'shared-fields-match' and path_status == 'resolved' and root_id in seen
        item.update(ancestorGameObjects=path, hierarchyStatus=path_status, ownershipOverlayEligible=eligible,
            modeIndicesFromAncestorGameObjects=mode_indices if eligible else [],
            structuralLocation=('mode-subtree' if mode_indices else 'asset-root-outside-mode-subtrees') if eligible
                               else 'unresolved-or-cross-source-field-mismatch')
    talent_skills, enemy_skills, root_shared, mode_local, unknown_scripts = {}, {}, [], defaultdict(list), []
    for go_id in sorted(subtree):
        group = groups.get(go_id, {})
        for peer in group.get('monoBehaviourCompanions', []):
            script = peer['scriptResolution']
            if script['status'] != 'resolved':
                unknown_scripts.append(dict(gameObjectPathID=go_id, **peer))
                continue
            ancestors = graph.ancestry(script['type'])
            is_default_provider = bool({'Torappu.Battle.BasicTalent', 'Torappu.Battle.BasicSkill'}.intersection(ancestors))
            is_enemy_skill = 'Torappu.Battle.EnemySkill' in ancestors
            if not is_default_provider and not is_enemy_skill:
                continue
            pid, visited, go_path = go_id, set(), []
            while pid and pid not in visited and pid in groups:
                visited.add(pid)
                parent = groups[pid]
                go_path.append(dict(pathID=pid, name=parent['name']))
                pid = parent['parentGameObjectPathID']
            local_modes = sorted({index for node in go_path for index in mode_owners[node['pathID']]})
            component = graph.nodes[bundle][peer['pathID']]
            item = dict(**peer, typeHierarchy=ancestors,
                fields=component['fields'], gameObjectPathID=go_id, ancestorGameObjects=go_path,
                modeIndicesFromAncestorGameObjects=local_modes,
                structuralLocation=('mode-subtree' if local_modes else 'asset-root-outside-mode-subtrees') if anchored else 'anchor-mismatch',
                activityStatus='not-resolved-by-ownership-overlay')
            if is_enemy_skill:
                enemy_skills[peer['pathID']] = item
            if not is_default_provider:
                continue
            talent_skills[peer['pathID']] = item
            if anchored and not local_modes:
                root_shared.append(peer['pathID'])
            for index in local_modes:
                mode_local[str(index)].append(peer['pathID'])
    return dict(enemyId=record['enemyId'], inEncounterPool=record['inEncounterPool'],
        sourceEnemyId=record['sourceEnemyId'], source=dict(assetKey=key, **source),
        status='matched-entity-and-mode-anchors' if anchored else 'entity-or-mode-anchor-mismatch',
        entityRootGameObjectPathID=root_id, anchorComponentKeys=anchors,
        modeGameObjects=[dict(modeIndex=row['modeIndex'], componentKey=row.get('targetComponentKey'),
            gameObjectPathID=checked.get(row.get('targetComponentKey'), {}).get('gameObjectPathID')) for row in record['modes']],
        components=checked, gameObjects=groups, extraJPCompanions=extra_jp_components, hierarchyFailures=failures,
        jpSubtree=dict(complete=not subtree_failures,
                       completeTalentAndSkillCoverage=all(item.get('reason') == 'incomplete-gameobject-components'
                           and item.get('allMissingAreNonMonoBehaviour') for item in subtree_failures),
                       gameObjectCount=len(subtree), failures=subtree_failures,
                       unknownMonoBehaviourTypes=unknown_scripts),
        talentAndSkillComponents=talent_skills, rootSharedTalentAndSkillPathIDs=root_shared,
        modeTalentAndSkillPathIDs=dict(mode_local), enemySkillComponents=enemy_skills,
        boundary='Structural ownership is observed in the pinned JP source. Matching CN fields/IDs permit an explicit ownership overlay, not unqualified cross-version behavior equivalence.')


def initial_mode_zero_check(record, overlay):
    """A source-coverage candidate; the native default rule remains the consumer's evidence."""
    reasons = []
    if overlay.get('status') != 'matched-entity-and-mode-anchors':
        reasons.append('entity-or-mode-anchors-unmatched')
    if not overlay.get('jpSubtree', {}).get('completeTalentAndSkillCoverage'):
        reasons.append('incomplete-talent-and-skill-source-coverage')
    if overlay.get('jpSubtree', {}).get('unknownMonoBehaviourTypes'):
        reasons.append('unresolved-jp-monobehaviour-type')
    jp_defaults = overlay.get('talentAndSkillComponents', {})
    for pid, component in jp_defaults.items():
        value = component['fields'].get('_defaultModeIndex')
        if type(value) is not int or value >= 0:
            reasons.append('nonnegative-or-unknown-jp-default:' + pid)
    for key, component in record['components'].items():
        if '_defaultModeIndex' not in component['fields']:
            continue
        value = component['fields']['_defaultModeIndex']
        if type(value) is not int or value >= 0:
            reasons.append('nonnegative-or-unknown-cn-default:' + component['pathID'])
        jp = jp_defaults.get(component['pathID'])
        if (not jp or jp['fields'].get('_defaultModeIndex') != value or
                str(jp.get('scriptPathID')) != component['scriptPathID']):
            reasons.append('cn-jp-default-field-or-script-mismatch:' + component['pathID'])
    return dict(candidate=not reasons, modeIndex=0 if not reasons else None, reasons=reasons,
        boundary='Cross-version inference from exact anchors and complete source default getters; activity subset is irrelevant only when every possible override is negative.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    inventory = load_catalog()
    if not inventory:
        raise ValueError('Generate the fixed mode-dispatch inventory first')
    evidence = ClientLogicStore(EVIDENCE_ID)
    scripts = ClientScriptStore(SCRIPT_ID)
    if scripts.manifest['base_evidence'] != dict(evidence_id=evidence.evidence_id, database=evidence.manifest['database']):
        raise ValueError('JP script supplement belongs to another evidence database')
    source = dict(clientEvidenceId=EVIDENCE_ID, clientVersion=evidence.manifest['source_version'],
        clientDatabaseSha256=evidence.manifest['database']['sha256'],
        inventoryPath=str(INVENTORY.relative_to(ROOT)), inventorySourceFingerprint=inventory['sourceFingerprint'],
        memberIDs=inventory['memberIDs'], ruleVersion=RULE_VERSION,
        scriptSupplement=dict(id=SCRIPT_ID, artifact=scripts.manifest['artifact']),
        objectTypeInventory=dict(path=str(TYPE_INVENTORY.relative_to(ROOT)),
            sha256=hashlib.sha256(TYPE_INVENTORY.read_bytes()).hexdigest(),
            matchRule='unique exact bundle path and pathID; unknown or MonoBehaviour omissions fail completeness'))
    old, source_hash = load_ownership_overlay(), fingerprint(source)
    if old and old.get('sourceFingerprint') == source_hash and not args.refresh:
        print(json.dumps(dict(cacheHit=True, written=False, counts=old['counts']), ensure_ascii=False))
        return
    if old and not args.refresh:
        raise ValueError('Ownership source changed; run --refresh for the fixed inventory cohort')
    assets = defaultdict(list)
    wanted = {'dyn/battle/prefabs/enemies/' + row['sourceEnemyId'] + '.prefab'
              for row in inventory['enemies'].values()}
    bundle_metadata = dict(evidence._json_rows('SELECT bundle,raw_json FROM bundles'))
    for bundle, metadata in bundle_metadata.items():
        for path, asset in metadata.get('assetContainer', []):
            if path in wanted:
                assets[path].append(dict(bundle=bundle, bundleSha256=metadata.get('sha256'), reference=asset['asset']))
    graph = GraphReader(evidence, scripts, bundle_metadata)
    try:
        enemies = {key: build_enemy_overlay(inventory['enemies'][key], assets, graph) for key in inventory['memberIDs']}
    finally:
        graph.connection.close()
        graph.object_inventory.close()
    for key, row in enemies.items():
        row['initialModeZeroEvidence'] = initial_mode_zero_check(inventory['enemies'][key], row)
    matched = {key: row for key, row in enemies.items() if row['status'] == 'matched-entity-and-mode-anchors'}
    result = dict(schemaVersion=1, source=source, sourceFingerprint=source_hash, memberIDs=inventory['memberIDs'],
        counts=dict(enemies=len(enemies), matchedAnchors=len(matched),
            encounterMatchedAnchors=sum(row.get('inEncounterPool', False) for row in matched.values()),
            eligibleOwnershipComponents=sum(item.get('ownershipOverlayEligible', False) for row in enemies.values()
                                             for item in row.get('components', {}).values()),
            statuses=dict(Counter(row['status'] for row in enemies.values())),
            componentStatuses=dict(Counter(item['status'] for row in enemies.values() for item in row.get('components', {}).values()))),
        enemies=enemies)
    result['counts'].update(completeJPSubtrees=sum(row.get('jpSubtree', {}).get('complete', False) for row in enemies.values()),
        completeTalentAndSkillCoverage=sum(row.get('jpSubtree', {}).get('completeTalentAndSkillCoverage', False) for row in enemies.values()),
        talentAndSkillComponents=sum(len(row.get('talentAndSkillComponents', {})) for row in enemies.values()),
        enemySkillComponents=sum(len(row.get('enemySkillComponents', {})) for row in enemies.values()),
        initialModeZeroCandidates=sum(row['initialModeZeroEvidence']['candidate'] for row in enemies.values()),
        encounterInitialModeZeroCandidates=sum(row['initialModeZeroEvidence']['candidate'] and inventory['enemies'][key]['inEncounterPool']
                                              for key, row in enemies.items()),
        unknownJPMonoBehaviourTypes=sum(len(row.get('jpSubtree', {}).get('unknownMonoBehaviourTypes', [])) for row in enemies.values()))
    temporary = OUTPUT.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(OUTPUT)
    print(json.dumps(dict(output=str(OUTPUT), written=True, counts=result['counts']), ensure_ascii=False))


if __name__ == '__main__':
    main()
