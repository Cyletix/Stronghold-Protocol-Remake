"""Compile a complete, restricted Buff event graph into mode commands.

This module does not infer event timing, Buff ownership, or TARGET identity.
The caller must explicitly allow each target scope and supply the modes and
default mode of that bound target. A rejected graph exposes no executable IR.
"""
from collections.abc import Mapping
import math


RULE = 'enemy-buff-mode-events-v2'
SCHEMA_VERSION = 1
EVENTS = frozenset(('ON_BUFF_START', 'ON_BUFF_FINISH'))
SWITCH_TYPE = 'Torappu.Battle.Action.Nodes+SwitchMode'
SWITCH_FIELDS = frozenset(('$type', '_modeIndex', '_loadModeFromBlackboard',
                           '_restoreDefault', '_restartFSM', '_targetType'))


def _index(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        return None
    return int(value) if value >= 0 else None


def _pointer(value):
    return str(value).replace('~', '~0').replace('/', '~1')


def _local_mode(blackboard):
    if isinstance(blackboard, Mapping):
        if 'mode' not in blackboard:
            return None, None, 'local-mode-missing'
        return blackboard['mode'], '/blackboard/mode', None
    if isinstance(blackboard, (list, tuple)):
        matches = [(index, item) for index, item in enumerate(blackboard)
                   if isinstance(item, Mapping) and item.get('key') == 'mode']
        if not matches:
            return None, None, 'local-mode-missing'
        if len(matches) != 1:
            return None, '/blackboard', 'local-mode-ambiguous'
        index, item = matches[0]
        if 'value' not in item:
            return None, f'/blackboard/{index}', 'local-mode-value-missing'
        return item['value'], f'/blackboard/{index}/value', None
    return None, '/blackboard', 'local-blackboard-invalid'


def compile_mode_events(template, blackboard, supported_modes, default_mode,
                        *, accepted_target_scope=None, accepted_events=EVENTS):
    """Return accepted/events/rejections for a full original ``eventToActions``.

    ``template`` is either the original payload or a binding receipt containing
    that payload. ``blackboard`` is the usage-local list of key/value records or
    a simple mapping. No parent, global, namespaced, or other usage values are
    substituted. ``accepted_target_scope`` is one exact scope or a collection;
    its omission rejects any switch rather than assuming TARGET means self.

    Nonempty events require an explicit consumer in ``accepted_events``;
    arbitrary event names with empty action lists are complete no-operations.
    Switch fields are explicit. Restore selects ``default_mode`` before local
    blackboard loading. A missing local mode key falls back to ``_modeIndex``;
    a present but ambiguous or unconvertible value is rejected. Otherwise
    ``_modeIndex`` supplies a literal mode. All
    selected modes must have compiled actions in ``supported_modes``. The IR
    retains modeSource and restartFSM, and nodes retain their original order.
    This validates a command graph, not the provider's lifecycle or execution.
    """
    result = dict(schemaVersion=SCHEMA_VERSION, rule=RULE, accepted=False,
                  templateKey=None, events={}, rejections=[], sourceRefs=[])

    def reject(code, path, detail):
        result['rejections'].append(dict(code=code, sourcePath=path, detail=detail))

    if not isinstance(template, Mapping):
        reject('template-invalid', '/', 'Expected an original payload or its complete binding receipt.')
        return result
    is_receipt = 'payload' in template
    payload = template.get('payload') if is_receipt else template
    prefix = '/payload' if is_receipt else ''
    if not isinstance(payload, Mapping):
        reject('payload-invalid', prefix or '/', 'The complete original payload is required.')
        return result
    result['templateKey'] = payload.get('templateKey', template.get('templateKey'))
    if is_receipt and 'status' in template and template['status'] != 'matched-pinned-template':
        reject('template-source-unmatched', '/status', 'The supplied binding receipt does not contain a matched source template.')
    graph_path = prefix + '/eventToActions'
    graph = payload.get('eventToActions')
    result['sourceRefs'].append(dict(sourcePath=graph_path, templateKey=result['templateKey']))
    if not isinstance(graph, Mapping):
        reject('event-map-missing-or-invalid', graph_path, 'The complete eventToActions mapping is required; flattened node extracts are insufficient.')
        return result
    try:
        supplied_modes = list(supported_modes)
    except TypeError:
        supplied_modes = []
    modes = {_index(value) for value in supplied_modes}
    if not supplied_modes or None in modes:
        reject('supported-modes-invalid', '/supported_modes', 'Supply a nonempty collection of nonnegative integer mode indices.')
        modes.discard(None)
    if isinstance(accepted_target_scope, str):
        scopes = {accepted_target_scope}
    elif isinstance(accepted_target_scope, (set, frozenset, list, tuple)):
        scopes = {value for value in accepted_target_scope if isinstance(value, str)}
    else:
        scopes = set()
    if isinstance(accepted_events, str):
        event_consumers = {accepted_events}
    elif isinstance(accepted_events, (set, frozenset, list, tuple)):
        event_consumers = {value for value in accepted_events if isinstance(value, str)}
    else:
        event_consumers = set()

    compiled = {}
    for event, actions in graph.items():
        event_path = graph_path + '/' + _pointer(event)
        if not isinstance(event, str):
            reject('event-name-invalid', event_path, 'An event name must be a string.')
            continue
        if not isinstance(actions, list):
            reject('event-actions-invalid', event_path, 'Each event must contain its complete ordered list of actions.')
            continue
        if not actions:
            compiled[event] = []
            continue
        if event not in event_consumers:
            reject('event-unsupported', event_path, 'This nonempty event has no explicitly accepted consumer.')
            continue
        commands = []
        for number, node in enumerate(actions):
            path = event_path + '/' + str(number)
            before = len(result['rejections'])
            if not isinstance(node, Mapping):
                reject('action-invalid', path, 'An action must be a serialized node object.')
                continue
            node_type = node.get('$type')
            if not isinstance(node_type, str) or node_type.split(',', 1)[0].strip() != SWITCH_TYPE:
                reject('action-unsupported', path, 'Every node must be SwitchMode; unknown siblings or wrappers cannot be partially executed.')
                continue
            missing, extra = SWITCH_FIELDS - set(node), set(node) - SWITCH_FIELDS
            if missing:
                reject('switch-fields-missing', path, 'Explicit fields are required: ' + ', '.join(sorted(missing)))
            if extra:
                reject('switch-fields-unsupported', path, 'Unknown fields or nested actions are not discarded: ' + ', '.join(sorted(map(str, extra))))
            if missing or extra:
                continue
            for field in ('_loadModeFromBlackboard', '_restoreDefault', '_restartFSM'):
                if not isinstance(node[field], bool):
                    reject('switch-flag-invalid', path + '/' + field, 'Expected an explicit boolean flag.')
            target = node['_targetType']
            if not isinstance(target, str) or target not in scopes:
                reject('target-scope-not-accepted', path + '/_targetType',
                       'Caller must explicitly bind and accept this scope: ' + str(target))
            if len(result['rejections']) != before:
                continue
            if node['_restoreDefault']:
                mode_value, mode_source, value_path = default_mode, 'restore-default', '/default_mode'
            elif node['_loadModeFromBlackboard']:
                mode_value, value_path, error = _local_mode(blackboard)
                mode_source = 'local-blackboard'
                if error == 'local-mode-missing':
                    mode_value, mode_source, value_path = node['_modeIndex'], 'literal-fallback', path + '/_modeIndex'
                elif error:
                    reject(error, value_path or '/blackboard', 'One usage-local numeric mode value is required.')
                    continue
            else:
                mode_value, mode_source, value_path = node['_modeIndex'], 'literal', path + '/_modeIndex'
            mode = _index(mode_value)
            if mode is None:
                reject('mode-index-invalid', value_path, 'The selected mode must be a finite nonnegative integer; values are not rounded or coerced.')
                continue
            if mode not in modes:
                reject('mode-actions-uncompiled', value_path, 'Selected mode ' + str(mode) + ' has no compiled mode actions for the bound target.')
                continue
            command = dict(kind='switch-mode', modeIndex=mode, modeSource=mode_source,
                           restartFSM=node['_restartFSM'], targetScope=target,
                           sourcePath=path, valueSourcePath=value_path)
            commands.append(command)
            result['sourceRefs'].append(dict(sourcePath=path, valueSourcePath=value_path,
                                             targetScope=target))
        compiled[event] = commands
    if not graph:
        reject('event-map-empty', graph_path, 'No event mapping was supplied.')
    if not result['rejections']:
        result.update(accepted=True, events=compiled)
    return result
