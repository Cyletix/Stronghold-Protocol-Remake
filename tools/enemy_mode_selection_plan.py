"""Pure refinement of frozen mode-selection evidence; no APK or database reads.

`analyze_selection(record, ownership)` consumes one row from each existing cache.
Declared parameters, Unity mounting and PPtr entry reachability remain separate.
This planning module never turns their combination into an execution claim.
"""
from collections import defaultdict, deque
import json
import math

RULE = 'enemy-mode-selection-plan-v1'
CATALOG = 'work/enemy-mode-dispatch-catalog.json'
OWNERSHIP = 'work/enemy-mode-ownership-overlay.json'
SUBCLASSES = {
    'mode-parameter-buff-template-reference': '模式值已经绑定Buff模板引用，尚缺模板动作消费者',
    'mode-parameter-inline-switch-consumer': '同一参数作用域含动态SwitchMode节点',
    'mode-parameter-value-only': '只有模式参数声明，未找到同作用域消费者',
    'mode-parameter-invalid-or-ambiguous-index': '模式参数不能唯一定位本实体模式',
    'mode-parameter-entry-linked': '参数提供者可沿已有模式/公共入口到达',
    'mode-parameter-mounted-without-entry': '参数提供者只有结构挂载，未见调用入口',
    'default-mode-negative-getters-zero-candidate': '完整负默认索引支持出生默认零，但不证明后续切换',
    'default-mode-active-override-unresolved': '存在非负默认覆盖，需要活动成员与遍历顺序',
    'default-mode-getter-or-membership-incomplete': '默认getter类型、归属或组件目录尚未闭合',
    'mode-attack-blackboard-scope': '天赋声明按模式分配攻击黑板，不等于切换模式',
    'mode-attribute-effects-uncompiled': '模式挂载Buff属性存在，当前模式通道不消费属性生命周期',
    'mode-channel-contract-unresolved': '模式内动作根、伤害附加或引用仍有缺口',
    'selection-no-switch-with-reborn': '没有显式切换节点但存在复活配置',
    'selection-no-switch-with-mode-skills': '没有显式切换节点，技能挂在模式子树',
    'selection-no-switch-with-root-skills': '没有显式切换节点，存在根部共享技能',
    'selection-no-switch-with-buff-providers': '没有显式切换节点，存在Buff提供者',
    'selection-no-switch-without-local-driver': '本缓存未识别出切换驱动，需实体状态调用来源',
    'selection-skill-trigger-reference-unresolved': '技能触发器引用未解析或仅有配置',
    'selection-cross-source-ownership-unresolved': '跨快照实体/模式归属不能用于证明调用关系',
}
OPERATORS = {
    'resolve-buff-template-graph': {'label':'解析Buff模板动作图', 'purpose':'按唯一templateKey整批连接动作节点，不能根据模板名字猜SwitchMode'},
    'bind-buff-mode-parameter': {'label':'绑定Buff模式参数', 'purpose':'连接黑板键、具体消费者、目标实体和模式索引'},
    'dispatch-ability-lifecycle-event': {'label':'派发能力生命周期', 'purpose':'连接挂载/命中/施放/结束等真实事件和Buff提供者'},
    'resolve-active-default-mode': {'label':'解析活动默认模式', 'purpose':'消费已知getter规则，并补足活动天赋/技能集合及顺序'},
    'bind-mode-attack-blackboard': {'label':'绑定模式攻击黑板', 'purpose':'将模式索引关联到攻击参数作用域；不当作切换触发'},
    'compile-mode-attributes': {'label':'编译模式属性效果', 'purpose':'绑定Buff属性、异常标志和生效/移除生命周期'},
    'compile-mode-channel': {'label':'编译模式动作通道', 'purpose':'独立编译战斗/攻击根、复合伤害和弹体配置'},
    'resolve-enemy-skill-trigger': {'label':'连接敌人技能触发', 'purpose':'沿精确_trigger引用连接检查器、技能组件与实际动作'},
    'resolve-entity-state-mode-call': {'label':'定位实体状态切换调用', 'purpose':'缓存无显式切换时按共享实体状态/脚本族补缺失调用入口'},
    'confirm-cross-source-ownership': {'label':'补足来源归属', 'purpose':'只修缓存记录的锚点/共享字段/组件目录缺口，不从名字或邻近组件推测归属'},
}


def _walk(value, path=''):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            if key == 'SerializedState' and isinstance(child, str):
                try:
                    yield from _walk(json.loads(child), path + '/' + key + '{json}')
                except (ValueError, TypeError):
                    pass
            else:
                yield from _walk(child, path + '/' + str(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, path + '/' + str(index))


def _at(value, path):
    try:
        for part in path.strip('/').split('/'):
            value = value[int(part)] if isinstance(value, list) else value[part]
        return value
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def _ref(enemy, key=None, path='', cache=CATALOG, **extra):
    return dict(cache=cache, enemyId=enemy, **({'componentKey':key} if key else {}), fieldPath=path, **extra)


def _entry_paths(record):
    """Existing reference edges only; a back-reference through a Unit cannot prove ownership."""
    components = record.get('components', {})
    outgoing = defaultdict(list)
    for edge in record.get('references', []):
        if edge.get('status') == 'resolved':
            outgoing[edge['sourceComponentKey']].append(edge)
    reached = defaultdict(list)
    for index, entry in enumerate(record.get('entrypoints', [])):
        if entry.get('status') != 'resolved':
            continue
        pending = deque([(entry['targetComponentKey'], [])])
        seen = set()
        while pending:
            key, chain = pending.popleft()
            if key in seen:
                continue
            seen.add(key)
            reached[key].append(dict(entrypointIndex=index, entrypoint=entry, references=chain))
            for edge in outgoing[key]:
                target = components.get(edge['targetComponentKey'], {})
                if '_modes' in target.get('fields', {}) or target.get('scriptType') == 'Torappu.Battle.UnitMode':
                    continue
                pending.append((edge['targetComponentKey'], chain + [edge]))
    return reached


def _attachment(key, ownership, reachability):
    item = ownership.get('components', {}).get(key, {})
    mounted = bool(ownership.get('status') == 'matched-entity-and-mode-anchors'
                   and item.get('ownershipOverlayEligible') and item.get('hierarchyStatus') == 'resolved')
    return dict(evidenceStage=('entry-linked' if reachability.get(key) else
        'structurally-mounted' if mounted else 'declared'),
        structurallyMounted=mounted, structuralLocation=item.get('structuralLocation'),
        modeIndices=item.get('modeIndicesFromAncestorGameObjects', []) if mounted else [],
        declaredStructuralModeIndices=item.get('modeIndicesFromAncestorGameObjects', []),
        entryPaths=reachability.get(key, []),
        sourceActivity=item.get('activityStatus', 'not-proven-by-mounting-or-reachability'))


def _target(value, record):
    # Blackboard scalar 1.0 is an exact integer; fractional values are not rounded.
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or int(value) != value:
        return dict(status='invalid-mode-value', value=value)
    if len(record.get('entities', [])) != 1:
        return dict(status='entity-scope-ambiguous', value=value)
    matches = [m for m in record.get('modes', []) if m.get('modeIndex') == int(value) and m.get('status') == 'resolved']
    if int(value) < 0 or len(matches) != 1:
        return dict(status='invalid-or-missing-mode-index', value=value)
    return dict(status='resolved-own-mode-index', modeIndex=int(value),
        componentKey=matches[0].get('targetComponentKey'))


def analyze_selection(record, ownership=None):
    ownership = ownership or {}
    enemy = record.get('enemyId')
    components = record.get('components', {})
    output = dict(schemaVersion=1, rule=RULE, enemyId=enemy,
        applicable=bool(record.get('modes')), subclasses=[], sourceRefs=[], sharedOperators=[],
        missingLinks=[], nextRequests=[], components={}, implementationReady=False,
        boundary='One-time cache-based planning. Values, structural mounting and entry linkage do not prove execution or chronological phases.')
    if not output['applicable']:
        return output
    tags, operators, missing = set(), set(), set()
    requests = {}
    source_refs = []
    reachability = _entry_paths(record)

    def need(operator, link, reference, batch_key=None, **parameters):
        operators.add(operator); missing.add(link); source_refs.append(reference)
        group = operator + ':' + (batch_key or link)
        request = requests.setdefault(group, dict(requestId=group, operator=operator,
            batchKey=batch_key or link, missingLink=link, sourceRefs=[], parameters=parameters,
            nextAction=OPERATORS[operator]['purpose']))
        request['sourceRefs'].append(reference)

    if ownership.get('status') != 'matched-entity-and-mode-anchors':
        tags.add('selection-cross-source-ownership-unresolved')
        need('confirm-cross-source-ownership', 'entity-and-mode-anchor-match',
             _ref(enemy, path='/status', cache=OWNERSHIP), ownership.get('status', 'missing-ownership-cache'))

    blackboards = []
    for entry in record.get('modeBlackboardEntries', []):
        key, path = entry['componentKey'], entry['fieldPath']
        component = components.get(key, {})
        fields = component.get('fields', {})
        bb = entry.get('fields', {})
        reference = _ref(enemy, key, path)
        attachment = _attachment(key, ownership, reachability)
        target = _target(bb.get('value'), record)
        container_path = path.rsplit('/blackboard/', 1)[0] if '/blackboard/' in path else None
        container = _at(fields, container_path) if container_path else None
        template = container.get('templateKey') if isinstance(container, dict) else None
        # A serialized node is a consumer only within the exact same enclosing
        # blackboard container. A node elsewhere in the component is insufficient.
        consumers = [dict(fieldPath=(container_path or '') + at, fields=node)
            for at, node in _walk(container or {}) if node.get('$type') == 'Torappu.Battle.Action.Nodes+SwitchMode'
            and node.get('_loadModeFromBlackboard')]
        binding = dict(sourceRef=reference, key=bb.get('key'), value=bb.get('value'),
            valueStr=bb.get('valueStr'), providerScript=component.get('scriptType'),
            provider=attachment, ownModeTarget=target, consumerStatus='unresolved',
            explicitInlineConsumers=consumers)
        if template:
            binding['buffReference'] = dict(templateKey=template, buffKey=container.get('buffKey'),
                loadFromDB=container.get('loadFromDB'), containerPath=container_path,
                lifetime={k:container.get(k) for k in ('lifeTimeType','durationKey','lifeTime','triggerCnt','triggerInterval')},
                boundary='Exact template reference only; template name does not establish its implementation')
        if consumers:
            binding['consumerStatus'] = 'inline-dynamic-switch-declared'
            tags.add('mode-parameter-inline-switch-consumer')
            need('bind-buff-mode-parameter','dynamic-switch-blackboard-key-and-target-scope',reference,
                 'SwitchMode.loadModeFromBlackboard', blackboardKey=bb.get('key'))
        elif template:
            tags.add('mode-parameter-buff-template-reference')
            need('resolve-buff-template-graph', 'referenced-template-action-graph-not-in-mode-cache',reference,
                template, templateKey=template, loadFromDB=container.get('loadFromDB'))
        else:
            tags.add('mode-parameter-value-only')
            need('bind-buff-mode-parameter','declared-mode-value-has-no-consumer-link',reference,
                component.get('scriptType') or 'unknown-provider', blackboardKey=bb.get('key'))
        if target['status'] != 'resolved-own-mode-index':
            tags.add('mode-parameter-invalid-or-ambiguous-index')
            need('bind-buff-mode-parameter','mode-value-or-target-entity-unresolved',reference,target['status'])
        if attachment['evidenceStage'] == 'entry-linked':
            tags.add('mode-parameter-entry-linked')
        elif attachment['evidenceStage'] == 'structurally-mounted':
            tags.add('mode-parameter-mounted-without-entry')
        need('dispatch-ability-lifecycle-event','provider-event-and-consumer-call-not-executable',reference,
            component.get('scriptType') or 'unknown-provider',
            eventFields={k:v for k,v in fields.items() if k in ('_runActionOnEvent','_extraCondition','_extraConditionTiming','_onlyRunOnce','_onlyCheckOnStopAffect')})
        blackboards.append(binding)

    defaults, scopes, attributes = [], [], []
    for key, component in sorted(components.items()):
        fields = component.get('fields', {})
        attachment = _attachment(key, ownership, reachability)
        if '_defaultModeIndex' in fields:
            raw = fields['_defaultModeIndex']
            reference = _ref(enemy,key,'/_defaultModeIndex')
            item = dict(sourceRef=reference, value=raw, scriptType=component.get('scriptType'), provider=attachment,
                consumer='Enemy._GetDefaultModeIndex -> active talent.defaultModeIndex',
                consumerEvidence='docs/research/enemy-mode-dispatch.md#归属与默认模式依据',
                getterStatus='field-declared; active getter membership not inferred')
            hierarchy = next((v.get('typeHierarchy',[]) for v in ownership.get('talentAndSkillComponents',{}).values()
                              if v.get('cnComponentKey') == key), [])
            if component.get('scriptType') == 'Torappu.Battle.Talent' or 'Torappu.Battle.Talent' in hierarchy:
                item['getterStatus'] = 'Talent.get_defaultModeIndex reads this field'
            elif 'Torappu.Battle.BasicSkill' in hierarchy:
                item['getterStatus'] = 'BasicSkill.get_defaultModeIndex reads this field'
            if type(raw) is int and raw >= 0:
                tags.add('default-mode-active-override-unresolved')
                item['modeTarget'] = _target(raw,record)
                need('resolve-active-default-mode','active-getter-membership-and-iteration-order',reference,'nonnegative-default-override')
            defaults.append(item);source_refs.append(reference)
        scope_fields = {k:v for k,v in fields.items() if k in ('_attackBlackboardModeIndex','_extraAttackBlackboardModeIndices','_scaleCertainMode','_scaleModeIndices')
                        and v is not None and v != [] and v != -1 and not (k == '_scaleCertainMode' and not v)}
        if scope_fields:
            tags.add('mode-attack-blackboard-scope')
            scopes.append(dict(componentKey=key,scriptType=component.get('scriptType'),fields=scope_fields,provider=attachment,
                interpretation='Parameter-routing selector; not a mode-transition trigger'))
            need('bind-mode-attack-blackboard','mode-index-to-attack-parameter-consumer',_ref(enemy,key),component.get('scriptType') or 'unknown-getter',fields=scope_fields)
        for at,node in _walk(fields):
            modifiers = node.get('attributeModifiers')
            abnormal = {k:v for k,v in node.items() if k in ('abnormalFlags','abnormalImmunes','abnormalAntis','abnormalCombos') and v}
            if (modifiers or abnormal) and attachment['modeIndices']:
                tags.add('mode-attribute-effects-uncompiled')
                reference = _ref(enemy,key,at)
                attributes.append(dict(sourceRef=reference,provider=attachment,attributeModifiers=modifiers or [],abnormal=abnormal))
                need('compile-mode-attributes','mode-buff-attributes-and-lifetime-not-consumed',reference,component.get('scriptType') or 'unknown-attribute-provider')
    zero = ownership.get('initialModeZeroEvidence', {})
    for path_id, item in sorted(ownership.get('talentAndSkillComponents', {}).items()):
        if item.get('cnComponentKey') in components or '_defaultModeIndex' not in item.get('fields', {}):
            continue
        raw = item['fields']['_defaultModeIndex']
        reference = _ref(enemy, path=f'/talentAndSkillComponents/{path_id}/fields/_defaultModeIndex', cache=OWNERSHIP)
        defaults.append(dict(sourceRef=reference, value=raw, scriptType=item.get('scriptResolution',{}).get('type'),
            provider=dict(evidenceStage='declared-in-jp-subtree', cnMatchStatus=item.get('cnMatchStatus'),
                          structuralLocation=item.get('structuralLocation')),
            getterStatus='JP-only candidate; CN component/getter membership not established'))
        source_refs.append(reference)
        if type(raw) is not int or raw >= 0:
            tags.add('default-mode-getter-or-membership-incomplete')
            need('resolve-active-default-mode', 'jp-only-default-getter-to-cn-member-link', reference,
                 item.get('scriptResolution',{}).get('type') or 'jp-only-getter')
    if zero.get('candidate'):
        tags.add('default-mode-negative-getters-zero-candidate')
        source_refs.append(_ref(enemy,path='/initialModeZeroEvidence',cache=OWNERSHIP))
    else:
        tags.add('default-mode-getter-or-membership-incomplete')
        need('resolve-active-default-mode','initial-mode-proof-incomplete',_ref(enemy,path='/initialModeZeroEvidence',cache=OWNERSHIP),
             'initial-default-proof', reasons=zero.get('reasons', ['missing-negative-getter-inventory']))

    skills = []
    for key, component in sorted(components.items()):
        if component.get('scriptType') != 'Torappu.Battle.EnemySkill':
            continue
        trigger = component.get('fields',{}).get('_trigger')
        edges = [edge for edge in record.get('references',[]) if edge.get('sourceComponentKey') == key and edge.get('fieldPath') == '/_trigger']
        attachment = _attachment(key, ownership, reachability)
        item = dict(sourceRef=_ref(enemy,key,'/_trigger'),provider=attachment,reference=trigger,
            resolvedReferences=edges,consumerStatus='skill-component-declared; trigger execution unproven')
        if edges and len(edges)==1 and edges[0].get('status')=='resolved':
            target=components.get(edges[0]['targetComponentKey'],{})
            item['triggerComponent']=dict(componentKey=edges[0]['targetComponentKey'],scriptType=target.get('scriptType'),fields=target.get('fields',{}))
        skills.append(item)
        tags.add('selection-skill-trigger-reference-unresolved')
        need('resolve-enemy-skill-trigger','checker-to-skill-cast-and-mode-consumer-link',item['sourceRef'],
             item.get('triggerComponent',{}).get('scriptType') or 'missing-trigger-reference')
    for path_id, item in sorted(ownership.get('enemySkillComponents', {}).items()):
        if item.get('cnComponentKey') in components:
            continue
        reference = _ref(enemy, path=f'/enemySkillComponents/{path_id}/fields/_trigger', cache=OWNERSHIP)
        skills.append(dict(sourceRef=reference, reference=item.get('fields',{}).get('_trigger'),
            provider=dict(evidenceStage='declared-in-jp-subtree', structurallyMounted=False, modeIndices=[],
                structuralLocation=item.get('structuralLocation'),cnMatchStatus=item.get('cnMatchStatus')),
            consumerStatus='JP-only skill; CN component and trigger consumer are not established'))
        tags.add('selection-skill-trigger-reference-unresolved')
        need('resolve-enemy-skill-trigger','jp-only-skill-to-cn-trigger-link',reference,'jp-only-skill')

    contracts=[]
    for mode in (record.get('cachedChannels') or {}).get('modes',[]):
        for channel,root in mode.get('channels',{}).items():
            fields=root.get('fields',{});reasons=[]
            if root.get('status') not in ('absent','direct-damage-root'):
                reasons.append('unresolved-or-composite-channel-root')
            if fields.get('_activeBuffs') or fields.get('_extraDamageType') or fields.get('_epDamageRatio'):
                reasons.append('additional-buff-or-damage-channel')
            if fields.get('_damageType') not in (None,1,2,3) and not fields.get('_useDynamicAttackType'):
                reasons.append('unbound-damage-type')
            contract=dict(modeIndex=mode.get('modeIndex'),channel=channel,sourceStatus=root.get('status'),
                scriptPathID=root.get('scriptPathID'),pathID=root.get('pathID'),issues=reasons,
                sourceRef=_ref(enemy,path=f"/cachedChannels/modes/{mode.get('modeIndex')}/channels/{channel}"))
            contracts.append(contract)
            if reasons:
                tags.add('mode-channel-contract-unresolved')
                need('compile-mode-channel','mode-channel-contract-incomplete',contract['sourceRef'],
                    str(root.get('scriptPathID') or root.get('status')),issues=reasons)
    if not record.get('switchNodes'):
        if record.get('rebornConfigurations'):
            tags.add('selection-no-switch-with-reborn')
        if any(item['provider']['modeIndices'] for item in skills):
            tags.add('selection-no-switch-with-mode-skills')
        if any(item['provider']['structuralLocation']=='asset-root-outside-mode-subtrees' for item in skills):
            tags.add('selection-no-switch-with-root-skills')
        providers=[key for key,c in components.items() if any('buffKey' in value for _,value in _walk(c.get('fields',{})))]
        if providers:
            tags.add('selection-no-switch-with-buff-providers')
        if not record.get('rebornConfigurations') and not blackboards and not skills:
            tags.add('selection-no-switch-without-local-driver')
        # This link remains missing even when some local state/skill configuration
        # exists: neither its attachment nor different mode attacks implies phase order.
        need('resolve-entity-state-mode-call','subsequent-mode-transition-invocation-absent',_ref(enemy,path='/switchNodes'),
            'no-inline-switch', entityTypes=sorted({x.get('scriptType') for x in record.get('entities',[]) if x.get('scriptType')}))
    output.update(subclasses=sorted(tags), sharedOperators=sorted(operators),missingLinks=sorted(missing),
        nextRequests=[requests[key] for key in sorted(requests)], sourceRefs=source_refs,
        components=dict(blackboardBindings=blackboards,defaultModeGetters=defaults,attackBlackboardScopes=scopes,
            modeAttributeProviders=attributes,skillTriggers=skills,modeChannelContracts=contracts),
        counts=dict(modeParameters=len(blackboards),distinctBuffTemplates=len({b['buffReference']['templateKey'] for b in blackboards if b.get('buffReference')}),
            defaultModeGetters=len(defaults),skillTriggers=len(skills),modeAttributeProviders=len(attributes)),
        runtimeBase=dict(initialModeZeroCandidate=bool(zero.get('candidate')),
            modeActionApi='web/src/simulation/external-combat.js: setMode/configure',
            consumed='compiled mode channels and constrained initial index only',
            missing='General abilities, mode attributes, active-default override and transition caller are not provided by this API'))
    return output
