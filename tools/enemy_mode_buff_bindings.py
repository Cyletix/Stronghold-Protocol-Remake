"""Batch-join requested mode Buff keys to the already imported CN database."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'src'))
from arkresearch.community import CommunityStore

RULE = 'mode-buff-source-bindings-v1'
ORIGIN = 'Tim23333-Arknights_timer@d2f6d76a7172cedc7583fc0a4eb998699abf25f5'
SOURCE_ID = 'gamedata-cc5bf84b0e6d'


def walk(value, path=''):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from walk(child, path + '/' + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + '/' + str(index))


def _walk_actions(value, path='', sibling_count=None):
    """Keep the containing array count, including nested action sequences."""
    if isinstance(value, dict):
        yield path, value, sibling_count
        for key, child in value.items():
            yield from _walk_actions(child, path + '/' + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_actions(child, path + '/' + str(index), len(value))


def source_state():
    store = CommunityStore(SOURCE_ID)
    with store._connect() as connection:
        files = [dict(path=p, sha256=h) for p, h in connection.execute(
            "SELECT path,sha256 FROM files WHERE origin=? AND path LIKE ? ORDER BY path",
            (ORIGIN, '%data_buff_templates.json'))]
    if len(files) != 1:
        raise ValueError('Expected one pinned CN Buff template source in the existing database')
    return dict(rule=RULE, sourceId=SOURCE_ID, origin=ORIGIN, files=files)


def collect_requests(catalog):
    result = {}
    for enemy_id in catalog['memberIDs']:
        row = catalog['enemies'][enemy_id]
        keys = {item['componentKey'] for field in ('rebornConfigurations','switchNodes',
                'hpToggleCheckers','otherToggleComponents','modeBlackboardEntries') for item in row.get(field, [])}
        for component_key in sorted(keys):
            for path, value in walk(row['components'][component_key]['fields']):
                key = value.get('templateKey')
                if not isinstance(key, str) or not key:
                    continue
                result.setdefault(key, []).append(dict(enemyId=enemy_id, componentKey=component_key,
                    fieldPath=path + '/templateKey', primarySubclass=row['primarySubclass'],
                    blackboard=value.get('blackboard', [])))
    return result


def query_templates(keys):
    if not keys:
        return {}
    store = CommunityStore(SOURCE_ID)
    result = {}
    with store._connect() as connection:
        ordered = sorted(set(keys))
        for offset in range(0, len(ordered), 400):
            batch = ordered[offset:offset + 400]
            placeholders = ','.join('?' for _ in batch)
            rows = connection.execute(f'''SELECT r.record_id,r.url,r.payload_json FROM records r
                WHERE r.kind='buff_template' AND r.origin=? AND r.record_id IN ({placeholders})
                ORDER BY r.record_id''', [ORIGIN, *batch])
            for key, url, payload in rows:
                result[key] = dict(payload=json.loads(payload), url=url,
                    payloadSha256=hashlib.sha256(payload.encode()).hexdigest())
    return result


def bind_templates(requests, templates):
    result = {}
    for key, usages in sorted(requests.items()):
        source = templates.get(key)
        if source is None:
            result[key] = dict(status='missing-pinned-template', usages=usages)
            continue
        payload = source['payload']
        if payload.get('templateKey') != key:
            raise ValueError('Buff record key disagrees with payload: ' + key)
        events, switches = [], []
        for event, actions in payload.get('eventToActions', {}).items():
            events.append(dict(event=event, actions=actions))
            for path, node, sibling_count in _walk_actions(actions):
                if node.get('$type', '').split(',')[0] == 'Torappu.Battle.Action.Nodes+SwitchMode':
                    switches.append(dict(event=event, fieldPath='/eventToActions/' + event + path,
                        fields=node, siblingActionCount=sibling_count,
                        eventActionCount=len(actions) if isinstance(actions, list) else None))
        bindings = []
        for usage in usages:
            params = {}
            for item in usage.get('blackboard') or []:
                if isinstance(item, dict) and 'key' in item:
                    params.setdefault(item['key'], []).append(item.get('value'))
            for switch in switches:
                fields = switch['fields']
                if fields.get('_restoreDefault'):
                    status, value = 'requires-active-default-mode', None
                elif fields.get('_loadModeFromBlackboard'):
                    # Native SwitchMode.Execute uses TryGetInt('mode'); an
                    # absent key retains _modeIndex. Target/event binding is
                    # still independent from this parameter contract.
                    values = params.get('mode', [])
                    if not values:
                        status, value = 'literal-fallback-missing-local-mode', fields.get('_modeIndex')
                    else:
                        status, value = ('unique-local-mode-value', values[0]) if len(values) == 1 and values[0] is not None else ('local-mode-value-unresolved', None)
                else:
                    status, value = 'literal-source-index', fields.get('_modeIndex')
                bindings.append(dict(enemyId=usage['enemyId'], componentKey=usage['componentKey'],
                    usageFieldPath=usage['fieldPath'], actionFieldPath=switch['fieldPath'],
                    event=switch['event'], parameterStatus=status, candidateModeIndex=value,
                    targetScope=fields.get('_targetType'), implementationReady=False))
        result[key] = dict(status='matched-pinned-template', usages=usages, **source,
            events=events, switchModeNodes=switches, parameterBindings=bindings,
            boundary='Exact same-origin template and ordered event graph. Native mode key, absent-key fallback and restore-default priority are known; event dispatch, target scope and complete sibling actions require a bound provider.')
    return dict(rule=RULE, templates=result, counts=dict(requestedTemplates=len(result),
        matchedTemplates=sum(v['status']=='matched-pinned-template' for v in result.values()),
        missingTemplates=sum(v['status']!='matched-pinned-template' for v in result.values()),
        usages=sum(len(v['usages']) for v in result.values()),
        affectedEnemies=len({u['enemyId'] for v in result.values() for u in v['usages']}),
        switchTemplates=sum(bool(v.get('switchModeNodes')) for v in result.values()),
        sourceParameterBindings=sum(len(v.get('parameterBindings', [])) for v in result.values())))
