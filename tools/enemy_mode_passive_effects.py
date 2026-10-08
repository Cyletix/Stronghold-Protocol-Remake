"""Compile complete passive Buff graphs and their attribute effects.

Event commands and persistent effects are separate consumers of the same
managed Buff. Unknown actions never disappear while a known switch executes.
"""
from math import isfinite
from collections.abc import Mapping
from enemy_mode_events import compile_mode_events

RULE = 'enemy-passive-mode-effects-v1'
ATTRIBUTES = {1: 'atk', 2: 'def', 3: 'magic_resistance'}
ATTR_KEYS = {'abnormalFlags', 'abnormalImmunes', 'abnormalAntis', 'abnormalCombos',
             'abnormalComboImmunes', 'attributeModifiers'}
DAMAGE_TYPE = 'Torappu.Battle.Action.Nodes+DamageScale'
DAMAGE_DEFAULTS = {'_filterDamageType': False, '_damageMask': 'NONE',
    '_filterApplyWay': False, '_applyWayFilter': 'NONE', '_filterModifierKey': False,
    '_modifierKey': '', '_isOneMinus': False, '_isStackable': False,
    '_isValidStackCnt': False, '_cachedDeltaValueToBBKey': '', '_customKey': ''}


def numeric(value):
    return type(value) in (int, float) and isfinite(value)


def compile_passive_effects(graph, supported_modes, default_mode, *, target_binding):
    result = dict(accepted=False, events={}, effects=[], presentation={}, rejections=[])

    def reject(code, path, detail):
        result['rejections'].append(dict(code=code, sourcePath=path, detail=detail))

    if not isinstance(graph, Mapping) or not graph.get('declarationComplete'):
        reject('buff-declaration-incomplete', '/', 'A complete Buff declaration and graph are required.')
        return result
    fields, payload = graph.get('fields', {}), graph.get('payload', {})
    if graph.get('bindingStatus') != 'matched-pinned-template':
        reject('unmatched-buff-source', '/bindingStatus', 'Only the exact pinned template is accepted.')
    if payload.get('templateKey') != fields.get('templateKey'):
        reject('buff-template-key-mismatch', '/payload/templateKey', 'Declaration and template must agree.')
    attrs = fields.get('attributes', {})
    if not isinstance(attrs, Mapping) or set(attrs) != ATTR_KEYS:
        reject('attributes-incomplete', '/fields/attributes', 'Complete attribute arrays are required.')
        return result
    if any(not isinstance(attrs[key], list) for key in ATTR_KEYS):
        reject('attribute-arrays-invalid', '/fields/attributes', 'All attribute containers must be arrays.')
        return result
    if set(payload) != {'templateKey', 'effectKey', 'onEventPriority', 'eventToActions'}:
        reject('template-fields-unsupported', '/payload', 'Unknown template fields require an explicit consumer.')
    if any(attrs[key] for key in ATTR_KEYS - {'attributeModifiers'}):
        reject('abnormal-attributes-unsupported', '/fields/attributes', 'Abnormal flags need their own consumer.')
    board = fields.get('blackboard')
    local = {}
    if not isinstance(board, list):
        reject('local-blackboard-invalid', '/fields/blackboard', 'Expected a complete key/value list.')
    else:
        for item in board:
            if not isinstance(item, Mapping) or not isinstance(item.get('key'), str) or item['key'] in local:
                reject('local-blackboard-ambiguous', '/fields/blackboard', 'Keys must be unique.')
                continue
            local[item['key']] = dict(value=item.get('value'), valueStr=item.get('valueStr'))

    def binding(key, default, enabled=True):
        value = dict(default=default)
        if enabled:
            value['key'] = key
            if key in local:
                item = local[key]
                if item['valueStr'] or not numeric(item['value']):
                    reject('local-effect-value-invalid', '/fields/blackboard', 'Effect values must be finite numeric fields.')
                else:
                    value['local'] = item['value']
        return value

    effects = []
    for index, modifier in enumerate(attrs.get('attributeModifiers', [])):
        path = f'/fields/attributes/attributeModifiers/{index}'
        keys = {'attributeType', 'formulaItem', 'value', 'loadFromBlackboard', 'fetchBaseValueFromSourceEntity'}
        if (not isinstance(modifier, Mapping) or set(modifier) != keys
                or modifier['attributeType'] not in ATTRIBUTES or modifier['formulaItem'] != 1
                or modifier['fetchBaseValueFromSourceEntity'] != 0
                or modifier['loadFromBlackboard'] not in (0, 1) or not numeric(modifier['value'])):
            reject('attribute-formula-unsupported', path, 'Only owner ATK/DEF/RES percentage additions are consumed.')
            continue
        stat = ATTRIBUTES[modifier['attributeType']]
        effects.append(dict(kind='attribute', stat=stat, formula='multiplier',
            value=binding(stat, modifier['value'], bool(modifier['loadFromBlackboard'])), sourcePath=path))
    event_map = payload.get('eventToActions')
    if not isinstance(event_map, Mapping):
        reject('event-map-invalid', '/payload/eventToActions', 'The entire event graph is required.')
        return result
    event_actions = {event: actions for event, actions in event_map.items() if actions}
    # Output damage modifiers are persistent listeners, not START commands.
    if set(event_actions) == {'ON_OUTPUT_DAMAGE'}:
        actions = event_actions['ON_OUTPUT_DAMAGE']
        if not isinstance(actions, list) or len(actions) != 1:
            reject('damage-event-sequence-unsupported', '/payload/eventToActions', 'This listener requires exactly one complete DamageScale node.')
        else:
            node = actions[0]
            if (not isinstance(node, Mapping) or str(node.get('$type', '')).split(',', 1)[0] != DAMAGE_TYPE
                    or set(node) != {'$type', *DAMAGE_DEFAULTS}
                    or any(node[key] != expected for key, expected in DAMAGE_DEFAULTS.items())):
                reject('damage-scale-options-unsupported', '/payload/eventToActions/ON_OUTPUT_DAMAGE/0',
                       'Filtered, stacked or custom damage actions need a complete consumer.')
            else:
                effects.append(dict(kind='damage-scale', value=binding('damage_scale', 1),
                    sourcePath='/payload/eventToActions/ON_OUTPUT_DAMAGE/0'))
        events = {'ON_BUFF_START': [], 'ON_BUFF_FINISH': []}
    elif event_actions:
        compiled = compile_mode_events(payload, fields.get('blackboard'), supported_modes,
            default_mode, accepted_target_scope=target_binding.get('scope'))
        result['rejections'].extend(compiled['rejections'])
        events = compiled['events']
    else:
        events = {'ON_BUFF_START': [], 'ON_BUFF_FINISH': []}
    if any(not isinstance(actions, list) for actions in event_map.values()):
        reject('event-actions-invalid', '/payload/eventToActions', 'Every event, including empty events, must have an array.')
    if payload.get('onEventPriority') != 'DEFAULT':
        reject('event-priority-unsupported', '/payload/onEventPriority', 'Custom priorities are not reordered.')
    if result['rejections']:
        return result
    result.update(accepted=True, events=events, effects=effects,
        presentation={key: fields.get(key) for key in ('overrideEffectKey', 'audioSignal') if fields.get(key)})
    if payload.get('effectKey'):
        result['presentation']['effectKey'] = payload['effectKey']
    return result
