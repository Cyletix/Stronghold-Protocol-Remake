"""Pure, cache-only planning of RebornTalent configuration families.

This module records source values and unresolved contracts. Name matches and the
cross-version ownership overlay are candidates, never executable trigger proof.
The caller owns cohort selection, source fingerprint validation and scheduling.
"""
from copy import deepcopy
import hashlib
import json


RULE = 'cached-reborn-configuration-plan-v2'
SUBCLASSES = {
    'reborn-extra-presets': '含额外复活预设，已知递增后按 count-1 选择，否则用默认配置',
    'reborn-buff-gated': '声明所需 Buff 条件',
    'reborn-wave-gated': '声明波次复活条件',
    'reborn-keep-alive': '声明保持存活分支',
    'reborn-count-sentinel': '非正数或缺失的次数配置；原生预算式已知，实际次数黑板覆盖待解析',
    'reborn-handler': '声明由具名能力处理',
    'reborn-inline-config': '未启用具名能力处理，仍需复活公共生命周期',
    'reborn-handler-flag-unresolved': '处理能力开关缺失或非明确布尔配置',
    'reborn-multiple-components': '含多个 Reborn 组件，激活范围和优先级待解析',
    'not-reborn': '没有缓存的 Reborn 配置',
}
OPERATORS = {
    'reborn-activation-registration': {'label': '复活组件激活与注册', 'purpose': '确定哪些组件注册复活入口、触发事件及多组件优先级。'},
    'reborn-budget-condition': {'label': '复活次数条件', 'purpose': '接入已知预算判定与递增规则，解析实际 max 的黑板覆盖及计数重置。'},
    'reborn-buff-condition': {'label': '复活 Buff 条件', 'purpose': '接入 CheckReborn 已知的所需 Buff 条件，连接活动组件入口。'},
    'reborn-wave-condition': {'label': '波次复活条件', 'purpose': '解释波次计数、等待与取消规则。'},
    'reborn-handler-lookup': {'label': '具名复活能力查找', 'purpose': '将精确名称候选解析为当前作用域的能力。'},
    'reborn-handler-lifecycle': {'label': '复活能力生命周期', 'purpose': '确定开始、完成、分离及中断顺序。'},
    'reborn-mode-target': {'label': '复活模式目标', 'purpose': '解析源模式索引以及切换发生的时点。'},
    'reborn-hp-recharge': {'label': '复活生命恢复', 'purpose': '解释恢复比例的基数、钳制及应用顺序。'},
    'reborn-buff-lifecycle': {'label': '复活 Buff 保留与应用', 'purpose': '确定原 Buff 清理、保留和新 Buff 应用顺序。'},
    'reborn-effect-lifecycle': {'label': '复活特效生命周期', 'purpose': '确定特效启动和复活后的清理时点。'},
    'reborn-keep-alive': {'label': '复活保持存活分支', 'purpose': '确定死亡拦截、存活状态和分支结束条件。'},
    'reborn-preset-selection': {'label': '复活预设选择', 'purpose': '接入已知 count-1 预设选择和默认回退，连接复活生命周期。'},
    'blackboard-consumer-resolution': {'label': '黑板参数消费', 'purpose': '将明确参数键与其读值作用域、消费者和默认值连接。'},
    'buff-template-execution': {'label': 'Buff 模板执行', 'purpose': '解析配置中精确 templateKey 的公共行为。'},
}
NATIVE_RULES = {
    'reborn-check-budget': dict(
        evidence='Verified', evidenceOrigin='previous-native-analysis',
        sourceRef=dict(file='work/client-logic/native-enemy-mode-dispatch/RebornTalent.CheckReborn.asm',
                       symbol='RebornTalent.CheckReborn'),
        rule='CheckReborn requires the configured Buff condition and (m_count < effectiveMax or effectiveMax < 0).',
        boundary='effectiveMax can differ from serialized _maxRespawnCnt; this does not prove when or for which active component CheckReborn is invoked.'),
    'reborn-check-increment-and-preset': dict(
        evidence='Verified', evidenceOrigin='previous-native-analysis',
        sourceRef=dict(file='work/client-logic/native-enemy-mode-dispatch/RebornTalent.CheckReborn.asm',
                       symbol='RebornTalent.CheckReborn'),
        rule='After the required Buff and budget checks pass, increment m_count; select extraRebornDataPresets[m_count - 1] when available, otherwise select the default data.',
        boundary='Selection and count consumption are known; component activation, resets, application and completion lifecycle remain separate.'),
    'reborn-assign-effective-max': dict(
        evidence='Verified', evidenceOrigin='previous-native-analysis',
        sourceRef=dict(directory='work/client-logic/native-enemy-mode-dispatch', symbol='RebornTalent.AssignData'),
        rule='AssignData can override the effective maximum from a blackboard key whose name has not been resolved.',
        boundary='Never substitute serialized _maxRespawnCnt for a proven effective maximum when the override is unresolved.'),
}
_BASE_FIELDS = (
    '_maxRespawnCnt', '_modeIndex', '_keepAlive', '_clearEffectsAfterReborn',
    '_useAbilityToHandle', '_abilityName', '_finishHandleAbilityAfterReborn',
    '_hpRechargeRatio', '_detachAbilityWhenReborn', '_rebornAfterWave',
    '_rebornAfterWaveCnt', '_validWhenContainsBuff', '_buffsRetainedWhenReborn',
    '_effects', '_defaultModeIndex', '_checkValidBySkillIndex',
)
_LIFECYCLE_FIELDS = (
    '_keepAlive', '_clearEffectsAfterReborn', '_finishHandleAbilityAfterReborn',
    '_detachAbilityWhenReborn', '_buffsRetainedWhenReborn', '_effects',
)


def _pointer(*parts):
    return '/' + '/'.join(str(p).replace('~', '~0').replace('/', '~1') for p in parts)


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode('utf-8')).hexdigest()


def _ref(record, key, field_path=''):
    component = record.get('components', {}).get(key, {})
    return dict(file='work/enemy-mode-dispatch-catalog.json', enemyId=record.get('enemyId'),
                sourceEnemyId=record.get('sourceEnemyId', record.get('enemyId')),
                componentKey=key, pathID=component.get('pathID'),
                cabin=component.get('cabin'), scriptType=component.get('scriptType'),
                scriptPathID=component.get('scriptPathID'), fieldPath=field_path,
                jsonPointer=_pointer('enemies', record.get('enemyId'), 'components', key, 'fields') + field_path)


def _own(ownership, key):
    item = ownership.get('components', {}).get(key, {})
    return dict(status=item.get('status', 'component-not-in-ownership-cache'),
                overlayStatus=ownership.get('status', 'ownership-cache-absent'),
                evidence='Inferred', overlayEligible=bool(item.get('ownershipOverlayEligible')),
                structuralLocation=item.get('structuralLocation'),
                modeIndices=deepcopy(item.get('modeIndicesFromAncestorGameObjects', [])),
                gameObjectPathID=item.get('gameObjectPathID'),
                ancestorGameObjects=deepcopy(item.get('ancestorGameObjects', [])),
                nodeSha256=item.get('jpNodeSha256'),
                sharedFieldDifferences=deepcopy(item.get('sharedFieldDifferences', [])),
                schemaDifferences=deepcopy(item.get('schemaDifferences', [])),
                boundary='Cross-version structural ownership does not prove activation or callback order.')


def _walk(value, path=''):
    yield path, value
    if isinstance(value, dict):
        for key, child in sorted(value.items()):
            yield from _walk(child, path + _pointer(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, path + _pointer(index))


def _blackboard_requests(record, key, fields):
    requests = []
    for path, value in _walk(fields):
        if not isinstance(value, dict):
            continue
        if '/blackboard/' in path and isinstance(value.get('key'), str) and value['key']:
            requests.append(dict(kind='blackboard-entry-consumer', key=value['key'],
                value=deepcopy(value), sourceRef=_ref(record, key, path),
                status='literal-available-consumer-and-scope-unresolved'))
        for name in ('durationKey', 'priorityBBKeys'):
            raw = value.get(name)
            keys = raw if isinstance(raw, list) else [raw]
            for literal in keys:
                if isinstance(literal, str) and literal:
                    requests.append(dict(kind='blackboard-key-reference', key=literal,
                        sourceRef=_ref(record, key, path + _pointer(name)),
                        status='value-scope-and-consumer-unresolved'))
        if value.get('loadFromBlackboard') == 1:
            requests.append(dict(kind='blackboard-key-not-serialized', key=None,
                sourceRef=_ref(record, key, path), selectors=deepcopy(value),
                status='resolve-consumer-key-mapping-without-guessing-enum'))
    return requests


def _handler_candidates(record, ownership, ability_name):
    if not isinstance(ability_name, str) or not ability_name:
        return []
    candidates = []
    # Use serialized m_Name only: friendly labels and substring matches are not evidence.
    for path_id, obj in sorted(ownership.get('gameObjects', {}).items()):
        if obj.get('sourceFields', {}).get('m_Name') != ability_name:
            continue
        companions = []
        for comp in sorted(obj.get('monoBehaviourCompanions', []), key=lambda c: str(c.get('pathID'))):
            key = comp.get('cnComponentKey')
            cached = record.get('components', {}).get(key, {})
            companions.append(dict(pathID=comp.get('pathID'), componentKey=key,
                scriptType=comp.get('scriptResolution', {}).get('type'),
                scriptResolution=deepcopy(comp.get('scriptResolution', {})),
                cnMatchStatus=comp.get('cnMatchStatus'),
                sourceRef=_ref(record, key) if cached else None,
                fieldNames=sorted(cached.get('fields', {})),
                serializedGraphsRef=(dict(file='work/enemy-mode-dispatch-catalog.json',
                    jsonPointer=_pointer('enemies', record.get('enemyId'), 'components', key, 'serializedGraphs'))
                    if cached.get('serializedGraphs') else None)))
        candidates.append(dict(gameObjectPathID=str(path_id), name=ability_name,
            match='exact-serialized-gameobject-name', evidence='Inferred',
            sourceRef=dict(file='work/enemy-mode-ownership-overlay.json',
                jsonPointer=_pointer('enemies', record.get('enemyId'), 'gameObjects', path_id, 'sourceFields', 'm_Name')),
            overlayStatus=ownership.get('status'), activeSelf=obj.get('activeSelf'),
            parentGameObjectPathID=obj.get('parentGameObjectPathID'),
            companions=companions, selectedComponentKey=None,
            status='candidate-only-ability-type-scope-and-lookup-order-unresolved'))
    return candidates


def _mode_target(record, index, path):
    matches = [m for m in record.get('modes', []) if type(index) is int and index >= 0
               and m.get('modeIndex') == index and m.get('status') == 'resolved']
    target = dict(fieldPath=path, modeIndex=index, candidates=[dict(
        entityComponentKey=m.get('entityComponentKey'), componentKey=m.get('targetComponentKey'),
        modePathID=m.get('modePathID')) for m in matches])
    target['status'] = ('negative-index-semantics-unresolved' if type(index) is int and index < 0 else
                        'unique-serialized-mode-index' if len(matches) == 1 else
                        'ambiguous-mode-index' if len(matches) > 1 else 'unresolved-mode-index')
    return target


def _subclasses(fields):
    result = []
    for name, flag in (('reborn-extra-presets', '_extraRebornDataPresets'),
                       ('reborn-buff-gated', '_validWhenContainsBuff'),
                       ('reborn-wave-gated', '_rebornAfterWave'),
                       ('reborn-keep-alive', '_keepAlive')):
        if fields.get(flag):
            result.append(name)
    count = fields.get('_maxRespawnCnt')
    if type(count) is not int or count <= 0:
        result.append('reborn-count-sentinel')
    flag = fields.get('_useAbilityToHandle')
    result.append('reborn-handler' if type(flag) in (int, bool) and flag == 1 else
                  'reborn-inline-config' if type(flag) in (int, bool) and flag == 0 else
                  'reborn-handler-flag-unresolved')
    return result


def _known(record, key, fields, names):
    return [dict(field=name, value=deepcopy(fields[name]), sourceRef=_ref(record, key, '/' + name))
            for name in names if name in fields]


def analyze_reborn(record, ownership):
    """Return a serializable, deterministic plan without I/O or input mutation."""
    record, ownership = record or {}, ownership or {}
    configs = {b['componentKey']: b for b in record.get('rebornConfigurations', [])}
    # Preserve applicability for callers analyzing every frozen mode family.
    for key, component in record.get('components', {}).items():
        if component.get('scriptType') == 'Torappu.Battle.RebornTalent':
            configs.setdefault(key, dict(componentKey=key, fields=component.get('fields', {})))
    components, operators, requests, all_bb = [], set(), [], []
    for key, config in sorted(configs.items()):
        fields = config.get('fields', {})
        source = _ref(record, key)
        source['fieldsSha256'] = _digest(fields)
        own = _own(ownership, key)
        handler = _handler_candidates(record, ownership, fields.get('_abilityName'))
        handler_on = fields.get('_useAbilityToHandle') == 1
        mode_targets = [_mode_target(record, fields.get('_modeIndex'), '/_modeIndex')]
        for index, preset in enumerate(fields.get('_extraRebornDataPresets', [])):
            if isinstance(preset, dict):
                mode_targets.append(_mode_target(record, preset.get('modeIndex'),
                    f'/_extraRebornDataPresets/{index}/modeIndex'))
        bb = _blackboard_requests(record, key, fields)
        templates = [dict(templateKey=value['templateKey'], sourceRef=_ref(record, key, path + '/templateKey'))
                     for path, value in _walk(fields) if isinstance(value, dict)
                     and isinstance(value.get('templateKey'), str) and value['templateKey']]
        buffs = [dict(fieldPath=path, buffKey=value.get('buffKey'), templateKey=value.get('templateKey'),
                      lifeTimeType=value.get('lifeTimeType'), durationKey=value.get('durationKey'),
                      lifeTime=value.get('lifeTime'), sourceRef=_ref(record, key, path))
                 for path, value in _walk(fields) if isinstance(value, dict) and 'buffKey' in value]
        chain = dict(
            trigger=dict(known=[dict(scriptType='Torappu.Battle.RebornTalent', sourceRef=source)],
                missing=['reborn-trigger-registration-and-event', 'reborn-component-activation-and-priority']),
            condition=dict(known=_known(record, key, fields, ('_maxRespawnCnt', '_validWhenContainsBuff',
                '_rebornAfterWave', '_rebornAfterWaveCnt', '_checkValidBySkillIndex')),
                missing=['reborn-count-reset-and-persistence', 'reborn-effective-max-blackboard-override']),
            action=dict(known=_known(record, key, fields, ('_modeIndex', '_hpRechargeRatio',
                '_useAbilityToHandle', '_abilityName')) + [dict(buffTemplates=templates)],
                missing=['reborn-hp-ratio-base-and-clamp', 'reborn-action-order-and-completion']),
            target=dict(known=deepcopy(mode_targets),
                missing=['reborn-target-owner-contract', 'reborn-mode-switch-application-time']),
            lifecycle=dict(known=_known(record, key, fields, _LIFECYCLE_FIELDS),
                missing=['reborn-death-interception-and-interruption', 'reborn-buff-clear-retain-apply-order']))
        needed = {'reborn-activation-registration', 'reborn-budget-condition', 'reborn-mode-target',
                  'reborn-hp-recharge', 'reborn-buff-lifecycle'}
        chain['condition']['known'].extend(dict(nativeRuleId=rule_id, **deepcopy(NATIVE_RULES[rule_id]))
            for rule_id in ('reborn-check-budget', 'reborn-assign-effective-max'))
        chain['action']['known'].append(dict(nativeRuleId='reborn-check-increment-and-preset',
            **deepcopy(NATIVE_RULES['reborn-check-increment-and-preset'])))
        if type(fields.get('_maxRespawnCnt')) is not int:
            chain['condition']['missing'].append('reborn-configured-count-value')
        if not own['overlayEligible'] or own['overlayStatus'] != 'matched-entity-and-mode-anchors':
            chain['trigger']['missing'].append('reborn-source-ownership-match')
        if any(t['status'] != 'unique-serialized-mode-index' for t in mode_targets):
            chain['target']['missing'].append('reborn-mode-index-resolution')
        if handler_on:
            needed |= {'reborn-handler-lookup', 'reborn-handler-lifecycle'}
            chain['action']['missing'].append('reborn-handler-lookup-and-scope')
            chain['lifecycle']['missing'].append('reborn-handler-finish-detach-and-cancel')
        elif type(fields.get('_useAbilityToHandle')) not in (int, bool) or fields['_useAbilityToHandle'] != 0:
            chain['action']['missing'].append('reborn-handler-flag-semantics')
        for flag, op, section, missing in (
            ('_rebornAfterWave', 'reborn-wave-condition', 'condition', 'reborn-wave-count-and-cancel'),
            ('_keepAlive', 'reborn-keep-alive', 'lifecycle', 'reborn-keep-alive-state-contract'),
            ('_effects', 'reborn-effect-lifecycle', 'lifecycle', 'reborn-effect-start-and-clear-time')):
            if fields.get(flag):
                needed.add(op)
                chain[section]['missing'].append(missing)
        if fields.get('_validWhenContainsBuff'):
            needed.add('reborn-buff-condition')
        if fields.get('_extraRebornDataPresets'):
            needed.add('reborn-preset-selection')
        bb.append(dict(kind='native-blackboard-key-unresolved', key=None,
            sourceRef=deepcopy(NATIVE_RULES['reborn-assign-effective-max']['sourceRef']),
            affectedSourceRef=_ref(record, key, '/_maxRespawnCnt'),
            status='resolve-AssignData-effective-max-key-without-rereading-CheckReborn-budget-or-preset-selection'))
        if bb:
            needed.add('blackboard-consumer-resolution')
            chain['action']['missing'].append('reborn-blackboard-value-scope-and-consumer')
        if templates:
            needed.add('buff-template-execution')
            chain['action']['missing'].append('reborn-buff-template-actions')
        subclasses = _subclasses(fields)
        summary = {name: deepcopy(fields[name]) for name in _BASE_FIELDS if name in fields}
        summary.update(buffs=buffs, extraPresetCount=len(fields.get('_extraRebornDataPresets', [])),
                       originalFieldNames=sorted(fields))
        components.append(dict(componentKey=key, sourceRef=source, fieldsSummary=summary,
            primarySubclass=subclasses[0], subclasses=subclasses, ownership=own, modeTargets=mode_targets,
            handlerRequested=handler_on, handlerCandidates=handler,
            handlerResolution=('exact-name-candidates-only' if handler_on and handler else
                'missing-exact-name-candidate' if handler_on else 'not-requested'
                if type(fields.get('_useAbilityToHandle')) in (int, bool) and fields['_useAbilityToHandle'] == 0
                else 'handler-flag-unresolved'),
            chain=chain, sharedOperators=sorted(needed), blackboardRequests=bb,
            buffTemplateRequests=templates, implementationReady=False))
        requests.append(dict(kind='native-public-contract', scriptType='Torappu.Battle.RebornTalent',
            sourceRefs=[source], fields=sorted(fields), sharedOperators=sorted(needed - {
                'blackboard-consumer-resolution', 'buff-template-execution'}),
            knownNativeRules=list(NATIVE_RULES),
            missingLinks=sorted({m for part in chain.values() for m in part['missing']})))
        if handler_on:
            requests.append(dict(kind='exact-ability-name-lookup', abilityName=fields.get('_abilityName'),
                sourceRefs=[_ref(record, key, '/_abilityName')], candidates=deepcopy(handler),
                requiredContract='Resolve lookup type/scope/order; name matches alone do not prove timing.'))
        for template in templates:
            requests.append(dict(kind='exact-buff-template', templateKey=template['templateKey'],
                sourceRefs=[template['sourceRef']], requiredContract='Template actions and lifecycle/blackboard consumers.'))
        operators.update(needed)
        all_bb.extend(bb)
    subclass_set = {s for comp in components for s in comp['subclasses']}
    if len(components) > 1:
        subclass_set.add('reborn-multiple-components')
    subclasses = [s for s in SUBCLASSES if s in subclass_set]
    return dict(schemaVersion=1, rule=RULE, enemyId=record.get('enemyId'),
        applicable=bool(components), primarySubclass=('reborn-multiple-components' if len(components) > 1 else
            components[0]['primarySubclass'] if components else 'not-reborn'), subclasses=subclasses,
        sourceRefs=dict(catalog='work/enemy-mode-dispatch-catalog.json',
            ownership='work/enemy-mode-ownership-overlay.json',
            sourceEnemyId=record.get('sourceEnemyId', record.get('enemyId')),
            ownershipSource=deepcopy(ownership.get('source', {}))),
        components=components, sharedOperators=sorted(operators), blackboardRequests=all_bb,
        knownNativeRules=deepcopy(NATIVE_RULES) if components else {},
        missingLinks=sorted({m for comp in components for part in comp['chain'].values() for m in part['missing']}),
        nextRequests=requests, implementationReady=False,
        boundary='Source values and cited prior native budget/preset rules are known; ownership and exact-name matches remain candidates. No effective max override, trigger, delay, priority or lifecycle is inferred.')
