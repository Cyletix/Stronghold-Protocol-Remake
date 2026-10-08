"""Cache explicit database attack flags and a one-pass root ability inventory.

Only an explicitly defined NONE inherited by every database level disables the
generic attack. Prefab field families are research queues, not behavior proofs.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / 'data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'
CACHE = ROOT / 'work/enemy-attack-capabilities.json'
ROOT_CACHE = ROOT / 'work/enemy-root-capability-catalog.json'
RULE_VERSION = 1
LABELS = {
    'no-basic-attack': '源表明确无需普攻',
    'unresolved-reference': '组件引用缺失或歧义',
    'summon-root': '召唤根能力',
    'healing-root': '治疗根能力',
    'action-node-root': '序列化动作节点',
    'buff-root': 'Buff 驱动根能力',
    'animation-or-custom-root': '动画或自定义能力',
    'base-or-custom-root': '基类字段或自定义能力',
    'null-root': '各模式均为空根',
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def database_capabilities(database):
    result = {}
    for item in database['enemies']:
        current, levels = None, []
        for record in sorted(item['Value'], key=lambda x: x['level']):
            raw = record.get('enemyData', {}).get('applyWay', {})
            if raw.get('m_defined') is True:
                current = raw.get('m_value')
            levels.append(dict(level=record['level'], applyWay=current,
                               explicitlyDefined=raw.get('m_defined') is True))
        values = {v['applyWay'] for v in levels}
        # An undefined NONE is a serialization default, not an assertion.
        result[item['Key']] = dict(levels=levels,
            basicAttackNotRequired=bool(levels) and values == {'NONE'})
    return result


def load_capabilities(database=DATABASE, cache=CACHE):
    source = dict(path=str(database.relative_to(ROOT)) if database.is_relative_to(ROOT) else str(database),
                  sha256=digest(database), field='enemies[].Value[].enemyData.applyWay')
    old = read(cache) if cache.is_file() else {}
    if old.get('source') == source and old.get('ruleVersion') == RULE_VERSION:
        return old, True
    result = dict(schemaVersion=1, ruleVersion=RULE_VERSION, source=source,
                  enemies=database_capabilities(read(database)))
    save(cache, result)
    return result, False


def root_evidence(record, components, capability):
    by_id = {}
    for component in components:
        by_id.setdefault(component['pathID'], []).append(component)
    channels = []
    for mode in record['evidence']['rootModes']:
        candidates = by_id.get(mode['modePathID'], [])
        if len(candidates) != 1:
            channels.append(dict(modeIndex=mode['modeIndex'], family='unresolved-reference'))
            continue
        component = candidates[0]
        for channel in ('_combat', '_attack'):
            ref = component['fields'].get(channel)
            item = dict(modeIndex=mode['modeIndex'], channel=channel, reference=ref)
            if not isinstance(ref, dict) or 'm_PathID' not in ref:
                item['family'] = 'unresolved-reference'
            elif ref['m_PathID'] == 0:
                item['family'] = 'null-root'
            else:
                candidates = [x for x in by_id.get(ref['m_PathID'], [])
                              if x.get('cabin') == component.get('cabin')]
                # Cross-file PPtrs cannot be resolved by path ID alone.
                if ref.get('m_FileID', 0) != 0 or len(candidates) != 1:
                    item['family'] = 'unresolved-reference'
                else:
                    target = candidates[0]
                    fields = target['fields']
                    actions = fields.get('_actions', {})
                    serialized = actions.get('SerializedState', '[]') if isinstance(actions, dict) else '[]'
                    try:
                        nodes = json.loads(serialized)
                    except (ValueError, TypeError):
                        nodes = None
                    node_types = []
                    def visit(value):
                        if isinstance(value, dict):
                            if '$type' in value:
                                node_types.append(value['$type'])
                            for child in value.values():
                                visit(child)
                        elif isinstance(value, list):
                            for child in value:
                                visit(child)
                    visit(nodes)
                    buffs = [x for x in fields.get('_activeBuffs', []) if x.get('m_PathID')]
                    family = ('summon-root' if '_enemyKey' in fields else
                              'healing-root' if '_applyEPHeal' in fields else
                              'action-node-root' if nodes or nodes is None else
                              'buff-root' if buffs else
                              'animation-or-custom-root' if '_animKey' in fields else
                              'base-or-custom-root')
                    item.update(family=family, cabin=target.get('cabin'), pathID=target['pathID'],
                                scriptPathID=target.get('scriptPathID'), nodeTypes=sorted(set(node_types)),
                                activeBuffs=buffs, fields=fields)
            channels.append(item)
    families = {x['family'] for x in channels}
    priority = list(LABELS)[1:]
    family = ('no-basic-attack' if capability.get('basicAttackNotRequired') else
              next((x for x in priority if x in families), 'unresolved-reference'))
    return dict(enemyId=record['enemyId'], name=record['name'],
                inEncounterPool=record['inEncounterPool'], family=family,
                databaseLevels=capability.get('levels', []), channels=channels)


def root_inventory(records, prefabs, source_sha256, capabilities):
    # Scope remains the original unresolved-root family, regardless of later
    # import progress. New data refreshes this layer without reclassifying all.
    wanted = sorted(k for k, v in records.items() if v['primaryTemplate'] == 'root-action')
    inputs = dict(prefabSha256=source_sha256, database=capabilities['source'], ids=wanted,
                  ruleVersion=RULE_VERSION)
    old = read(ROOT_CACHE) if ROOT_CACHE.is_file() else {}
    if old.get('inputs') == inputs:
        return old, True
    enemies = {k: root_evidence(records[k], prefabs.get(k, {}).get('components', []),
                                capabilities['enemies'].get(k, {})) for k in wanted}
    result = dict(schemaVersion=1, inputs=inputs, enemies=enemies,
                  counts=dict(Counter(x['family'] for x in enemies.values())))
    save(ROOT_CACHE, result)
    return result, False
