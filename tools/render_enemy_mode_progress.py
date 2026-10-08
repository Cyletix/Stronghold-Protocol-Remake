"""Render the seven mode contracts from the compact plan and saved receipts."""
from pathlib import Path
import argparse
import json
from enemy_skill_dispatch_status import skill_dispatch_status
from enemy_periodic_ability_status import periodic_ability_status
from garrison_encounter_scope import scope_runtime_report

ROOT = Path(__file__).resolve().parents[1]
CLASSES = {
    'reborn-mode-configuration': '复活配置',
    'explicit-owner-switch-linked-to-mode-entry': '根动作显式切换',
    'switch-node-trigger-or-target-unresolved': '切换节点待绑定',
    'hp-toggle-checker-present-no-phase-link-proven': '血量检查器',
    'buff-or-state-toggle-present-no-phase-link-proven': 'Buff/状态开关',
    'mode-blackboard-consumer-unresolved': '黑板模式参数',
    'mode-selection-trigger-unresolved': '其他模式选择',
}
INITIAL_REASONS = {
    'unmatched-source-ownership': '来源归属待连接',
    'incomplete-talent-and-skill-inventory': '天赋/技能目录不完整',
    'unresolved-default-mode-getter': '默认模式读取规则未绑定',
    'requires-active-default-mode-override': '活动默认覆盖与顺序未明确',
    'default-mode-source-fields-or-script-mismatch': '默认模式来源字段/脚本不匹配',
    'initial-mode-actions-unresolved': '初始模式的动作尚未编译',
}
PROVIDER_FAMILIES = {
    'blocked-toggle-mode': '阻挡条件',
    'hp-ratio-toggle-mode': 'HP比例条件',
}


def _read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def _text(value):
    if value is None:
        return '—'
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        return '；'.join(_text(item) for item in value) or '—'
    if isinstance(value, dict):
        return '；'.join(f'{key}：{_text(item)}' for key, item in value.items()) or '—'
    return str(value)


def _cell(value):
    return _text(value).replace('|', '／').replace('\r', '').replace('\n', '<br>')


def _graph_operator(key, operators):
    ids = [key, *operators.get(key, {}).get('rawOperatorIDs', [])]
    return any('resolve-buff-template' in value or 'buff-template-graph' in value or value == 'buff-template-binding' for value in ids)


def _buff_overlay(bindings):
    by_enemy, matched = {}, {}
    for key, item in bindings.get('templates', {}).items():
        available = item.get('status') == 'matched-pinned-template'
        if available:
            matched[key] = item
        for usage in item.get('usages', []):
            enemy = usage.get('enemyId')
            if enemy:
                by_enemy.setdefault(enemy, {})[key] = available
    return by_enemy, matched


def _supported(row, statuses):
    state = statuses.get(row['enemyId'])
    if not state or 'record' in state.get('unresolvedModes', {}):
        return []
    return [index for index in row.get('modeIndices', []) if str(index) not in state.get('unresolvedModes', {})]


def _label(key, operators):
    operator = operators.get(key, {})
    if operator.get('implementationState') == 'source-graphs-joined':
        return 'Buff模板图已连接（数据步骤完成）'
    return operator.get('label', '公共依赖待绑定')


def _remaining_labels(row, operators, buff_by_enemy):
    labels = []
    available = buff_by_enemy.get(row['enemyId'], {})
    complete = bool(available) and all(available.values())
    for key in row.get('requiredOperators', []):
        if row['enemyId'] in operators.get(key, {}).get('deferredMemberIDs', []):
            continue
        label = _label(key, operators)
        if _graph_operator(key, operators) and complete:
            label = '已连接Buff图的事件派发与目标绑定'
        elif _graph_operator(key, operators) and any(available.values()):
            label = '补齐其余Buff图并连接事件/目标'
        if label not in labels:
            labels.append(label)
    if not labels and row.get('missingLinks'):
        labels.append('触发条件与完整调用链待闭合')
    return labels


def _operator_counts(operator, members):
    involved = members & set(operator.get('memberIDs', []))
    active = members & set(operator.get('activeMemberIDs', operator.get('memberIDs', [])))
    deferred = members & set(operator.get('deferredMemberIDs', []))
    return len(involved), len(active), len(deferred)


def _short(labels, maximum=3):
    return ('、'.join(labels) or '待统一执行验收') if len(labels) <= maximum else '、'.join(labels[:maximum]) + f'等{len(labels)}项公共依赖'


def _batch_order(batches):
    result, pending = [], list(batches)
    while pending:
        ready = [key for key in pending if all(dep in result or dep not in batches for dep in batches[key].get('dependsOn', []))]
        if not ready:
            return result + pending
        result.extend(ready)
        pending = [key for key in pending if key not in ready]
    return result


def mode_provider_status(report, encounter_enemy_ids=None):
    """Summarize saved runtime selections, never merely graph candidates."""
    provider = report.get('modeProviders', {})
    selections = {enemy: items for enemy,items in provider.get('selections', {}).items()
                  if isinstance(items, list) and items}
    counts = report.get('counts', {})
    families = {}
    for enemy,items in selections.items():
        for item in items:
            kind = item.get('kind','unknown')
            family = families.setdefault(kind,dict(label=PROVIDER_FAMILIES.get(kind,kind),
                providers=0,enemyIDs=set(),providerIDs=[]))
            family['providers'] += 1
            family['enemyIDs'].add(enemy)
            if item.get('id',item.get('chainId')):
                family['providerIDs'].append(item.get('id',item.get('chainId')))
    for kind,family in families.items():
        family['enemyIDs'] = sorted(family['enemyIDs'])
        family['enemies'] = len(family['enemyIDs'])
        source_counts = provider.get('familyCounts',{}).get(kind,{})
        family['encounterEnemies'] = (len(set(family['enemyIDs']) & set(encounter_enemy_ids)) if encounter_enemy_ids is not None
            else source_counts.get('encounterEnemies',source_counts.get('encounterAutoModeProviderEnemies')))
    return dict(runtimeSupportAvailable=bool(selections), runtimeRule=provider.get('rule'),
        selections=selections, candidates=provider.get('candidates'),
        providerFamilies=dict(sorted(families.items())),
        rejections=provider.get('rejections', {}), boundary=provider.get('boundary'),
        autoModeProviderEnemies=counts.get('autoModeProviderEnemies', len(selections)),
        autoModeProviders=counts.get('autoModeProviders', sum(map(len,selections.values()))),
        encounterAutoModeProviderEnemies=counts.get('encounterAutoModeProviderEnemies', 0),
        fullPhaseTransitionsCompleted=counts.get('fullPhaseTransitionsCompleted', 0))


def _provider_template_keys(value):
    keys = set()
    if isinstance(value, dict):
        for key,item in value.items():
            if key == 'templateKey' and isinstance(item, str):
                keys.add(item)
            elif key == 'templateKeys' and isinstance(item, list):
                keys.update(v for v in item if isinstance(v,str))
            else:
                keys.update(_provider_template_keys(item))
    elif isinstance(value, list):
        for item in value:
            keys.update(_provider_template_keys(item))
    return keys


def _provider_label(item):
    label = PROVIDER_FAMILIES[item['kind']]+'→Buff→模式链' if item.get('kind') in PROVIDER_FAMILIES else '自动模式链'
    transitions = []
    for event,commands in item.get('events', {}).items():
        modes = [str(command['modeIndex']) for command in commands if command.get('kind') == 'switch-mode' and 'modeIndex' in command]
        if modes:
            event_label = {'ON_BUFF_START':'Buff进入', 'ON_BUFF_FINISH':'Buff退出', 'ON_BUFF_TRIGGER':'Buff触发'}.get(event,event)
            transitions.append(event_label + '→' + ','.join(modes))
    return label + ('（' + '；'.join(transitions) + '）' if transitions else '')


def render(report):
    path = ROOT / 'work/enemy-mode-template-plan.json'
    if not path.is_file():
        return None  # Never reopen the large source cache as a fallback.
    plan = _read(path)
    if plan.get('appearanceScope'):
        report = scope_runtime_report(report,plan['appearanceScope']['eligibleEnemyIDs'])
    buff_path = ROOT / 'work/enemy-mode-buff-bindings.json'
    bindings = _read(buff_path) if buff_path.is_file() else {}
    buff_by_enemy, matched = _buff_overlay(bindings)
    rows, templates = plan.get('enemies', {}), plan.get('templates', {})
    operators, batches = plan.get('operators', {}), plan.get('batches', {})
    members = [key for key in plan.get('memberIDs', []) if key in rows]
    statuses = report.get('modeProfiles', {}).get('unresolved', {})
    counts = report.get('counts', {})
    providers = mode_provider_status(report,{key for key,row in rows.items() if row.get('inEncounterPool')})
    skills = skill_dispatch_status(report,{key for key,row in rows.items() if row.get('inEncounterPool')})
    periodic = periodic_ability_status(report,{key for key,row in rows.items() if row.get('inEncounterPool')})
    selections = providers['selections']
    selected_templates = {}
    for enemy,items in selections.items():
        for item in items:
            for key in _provider_template_keys(item):
                selected_templates.setdefault(key,set()).add(enemy)
    order = [key for key in CLASSES if key in templates] + [key for key in templates if key not in CLASSES]
    lines = ['# 敌人模式：七类模板合同与公共批次', '',
        '先按模板合同补齐共用算子，再让固定成员批量接入。成员表用于查覆盖和追踪缺口，不是逐敌实施清单。', '',
        '[当前计划](../plan.md) · [来源与边界](../research/enemy-mode-dispatch.md) · [实时覆盖](community-coverage.md) · [机器计划](../../work/enemy-mode-template-plan.json)', '',
        f'固定 **{len(members)} 个敌人、{len(order)} 个主类**；当前模式内动作覆盖 **{counts.get("modeProfileEnemies", 0)} 敌人 / {counts.get("modeProfiles", 0)} 套模式**，'
        f'出生自动选模式 **{counts.get("initialModeProfiles", 0)} 敌人**（卫戍 {counts.get("encounterInitialModeProfiles", 0)}）。'
        f'已接自动模式链 **{providers["autoModeProviders"]} 条 / {providers["autoModeProviderEnemies"]} 敌人**'
        f'（卫戍 {providers["encounterAutoModeProviderEnemies"]}）；整敌完整阶段合同验收 **{providers["fullPhaseTransitionsCompleted"]}**。'
        '模式内动作、出生选择、具体自动链和整敌机制分别统计，已接一条链不表示该敌人的所有机制完成。', '',
        '| 固定主类 | 成员 | 卫戍 | 已有模式内动作 | 已有出生模式 | 已接自动链成员 | 公共合同闭合点 |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |']
    for key in order:
        template = templates[key]
        selected = [rows[enemy] for enemy in template.get('memberIDs', []) if enemy in rows]
        lines.append(f'| {_cell(template.get("label", CLASSES.get(key,key)))} | {len(selected)} | {len(template.get("encounterIDs", []))} | '
            f'{sum(bool(_supported(row,statuses)) for row in selected)} | {sum(statuses.get(row["enemyId"],{}).get("initialMode") is not None for row in selected)} | '
            f'{sum(row["enemyId"] in selections for row in selected)} | {_cell(template.get("closure"))} |')
    if skills['candidateSkillIDs']:
        sc=skills['counts']
        lines += ['', '## 已接技能调度与剩余组件', '',
            f'冻结技能队列 {sc["candidates"]} 个组件，已接 {sc["selectedSkills"]} 个，覆盖 {sc["selectedEnemies"]} 敌'
            f'（卫戍 {sc["encounterSelectedEnemies"]}），剩余 {sc["pendingSkills"]} 个组件；其中入口未启用暂缓 {sc["deferredSkills"]} 个，当前继续推进 {sc["executablePendingSkills"]} 个。', '',
            '只有实际编译选择的稳定 skill ID 退出未完成总数；暂缓组件保留数量但退出当前可执行派工。已编译某模式的技能不代表该模式自动进入已接。'
            '原算子依赖、其他技能和整敌阶段缺口保留。', '',
            '| 已接敌人 | 技能 | 模式索引 | 稳定组件ID |', '| --- | --- | --- | --- |']
        for item in skills['alreadyBoundSkills']:
            lines.append(f'| {_cell(rows.get(item["enemyId"],{}).get("name",item["enemyId"]))} | '
                f'{_cell(item.get("skillKey"))} | {_cell(item["modeIndices"])} | `{_cell(item["skillId"])}` |')
        if skills['deferredSkillIDs']:
            lines += ['', '入口未启用组件仍计入未完成；来源指纹匹配且当前无真实入口时暂缓派工，不能把 NeverTrigger 或源数据未启用组件改为出生或定时自动施放。', '',
                '| 暂缓技能组件 | 复用合同 | 恢复所需入口 |', '| --- | --- | --- |']
            for skill_id, item in skills['environmentDeferralsBySkillID'].items():
                lines.append(f'| `{_cell(skill_id)}` | [{_cell(item["sourceContract"])}](../../{item["sourceContract"]}) | '
                    f'{_cell(item["requiredMarkerKeys"])} |')
    if periodic['alreadyBoundGroups']:
        pc=periodic['counts']
        lines += ['', '## 独立已接周期 Buff 与直接能力组', '',
            f'已接 {pc["groups"]} 个完整公共组，覆盖 {pc["enemies"]} 敌（卫戍 {pc["encounterEnemies"]}）；'
            f'{pc["capabilityKinds"]} 类能力共有 {pc["capabilityBindings"]} 处组内绑定。', '',
            '复用已接组的稳定ID；这些组不属于 EnemySkill 组件，不抵扣其未完成数量，不改其他源算子或整敌阶段验收。', '',
            '| 敌人 | 模式 | 已接完整公共组 | 组内能力 |', '| --- | --- | --- | --- |']
        for item in periodic['alreadyBoundGroups']:
            labels='、'.join(periodic['capabilities'][key]['label'] for key in item['capabilityIDs'])
            lines.append(f'| {_cell(rows.get(item["enemyId"],{}).get("name",item["enemyId"]))} | '
                f'{item["modeIndex"]} | `{_cell(item["groupId"])}` | {_cell(labels)} |')
    lines += ['', '## 已接入的自动模式链', '',
        f'当前回执选择了 {providers["autoModeProviders"]} 条自动链，覆盖 {providers["autoModeProviderEnemies"]} 个敌人'
        f'（卫戍 {providers["encounterAutoModeProviderEnemies"]}）。运行规则：`{providers["runtimeRule"] or "尚无已接规则"}`。', '',
        '此处统计已接入的 provider 指令；候选图和被拒绝的链不计入。各家族的条件、Buff目标和事件动作按已接合同运行，'
        '其他技能、模式与阶段生命周期仍按公共缺口推进。', '',
        '[完整链与拒绝原因回执](../../work/external-combat-import-report.json)；'
        f'整敌完整阶段合同验收仍为 {providers["fullPhaseTransitionsCompleted"]}。']
    if providers['boundary']:
        lines += ['', f'运行边界：{_text(providers["boundary"])}']
    if providers['providerFamilies']:
        lines += ['', '| Provider家族 | 已接链 | 敌人 | 卫戍 |', '| --- | ---: | ---: | ---: |']
        for family in providers['providerFamilies'].values():
            lines.append(f'| {_cell(family["label"])} | {family["providers"]} | {family["enemies"]} | {_cell(family["encounterEnemies"])} |')
        lines += ['', '同一敌人可有多个家族，家族敌人数不能相加当作总覆盖。']
    if selections:
        lines += ['', '| 已接敌人 | 自动链 | Buff模板 | 链ID |', '| --- | --- | --- | --- |']
        for enemy,items in sorted(selections.items()):
            for item in items:
                lines.append(f'| {_cell(rows.get(enemy,{}).get("name",enemy))} | {_cell(_provider_label(item))} | '
                    f'{_cell(sorted(_provider_template_keys(item)))} | `{_cell(item.get("chainId",item.get("id","—")))}` |')
    if bindings:
        usages = sum(len(item.get('usages', [])) for item in matched.values())
        affected = {u.get('enemyId') for item in matched.values() for u in item.get('usages', []) if u.get('enemyId')}
        failed = [key for key,item in bindings.get('templates', {}).items() if item.get('status') != 'matched-pinned-template']
        lines += ['', '## 已连接的Buff事件图', '',
            f'已从固定版本读到 **{len(matched)} 个完整Buff模板事件图**，对应 {usages} 条引用、{len(affected)} 个敌人。'
            '已接自动链单独列示；其余使用处继续接事件派发、参数与目标绑定以及完整动作执行，不再重复获取已经连接的模板图。', '',
            '“完整图已连接”只描述数据：TARGET/SOURCE等目标范围、事件触发时点、SwitchMode后续动作仍须接入。'
            '参数值能唯一对应局部模式，也不能独自证明运行时目标实体。', '',
            '[完整绑定回执](../../work/enemy-mode-buff-bindings.json)；缓存统计：' +
            '；'.join(f'{label} {bindings.get("counts", {}).get(field, "—")}' for field,label in (
                ('requestedTemplates','请求模板'), ('matchedTemplates','已匹配模板'), ('missingTemplates','缺失模板'),
                ('usages','引用'), ('affectedEnemies','涉及敌人'), ('switchTemplates','含切换的模板'),
                ('sourceParameterBindings','参数候选'))) + '。', '',
            '| Buff模板 | 数据状态 | 引用 / 敌人 | 已保存事件 | SwitchMode节点 | 参数绑定 | 下一步 |', '| --- | --- | ---: | --- | ---: | ---: | --- |']
        for key,item in sorted(bindings.get('templates', {}).items()):
            success = item.get('status') == 'matched-pinned-template'
            events = item.get('events', {})
            names = list(events) if isinstance(events, dict) else [v.get('event',v.get('name','事件已保存')) if isinstance(v,dict) else v for v in events]
            users = {u.get('enemyId') for u in item.get('usages',[]) if u.get('enemyId')}
            next_step = ('派发事件、绑定真实目标、执行完整动作' if names else '空事件图；无需节点适配，使用处属性/生命周期另计') if success else '按模板键补源一次'
            if key in selected_templates:
                next_step = f'已有 {len(selected_templates[key])} 个敌人的自动链消费；其余使用处单独闭合'
            lines.append(f'| `{_cell(key)}` | {"完整事件图已连接" if success else "固定来源模板仍缺失"} | {len(item.get("usages",[]))} / {len(users)} | '
                f'{_cell(names)} | {len(item.get("switchModeNodes",[]))} | {len(item.get("parameterBindings",[]))} | '
                f'{next_step} |')
        if failed:
            lines += ['', f'仍缺失 {len(failed)} 个模板键；只对这些键补源，已连接部分继续实现。']
    lines += ['', '## 七类合同卡', '', '主类保持冻结；子类可交叉，子类人数不能相加作为覆盖总数。']
    for number,key in enumerate(order,1):
        template = templates[key]
        group_members = set(template.get('memberIDs', []))
        linked = {enemy for enemy in group_members if any(buff_by_enemy.get(enemy,{}).values())}
        lines += ['', f'### {number}. {template.get("label", CLASSES.get(key,key))}', '',
            f'固定成员 {len(group_members)}，卫戍 {len(template.get("encounterIDs",[]))}。', '',
            '| 合同项 | 定义 |', '| --- | --- |',
            f'| 匹配范围 | {_cell(template.get("match"))} |',
            f'| 必要字段与输入 | {_cell(template.get("input"))} |',
            f'| 触发者与时点 | {_cell(template.get("trigger"))} |',
            f'| 完整闭合条件 | {_cell(template.get("closure"))} |',
            f'| 不能据此判完成 | {_cell(template.get("forbidden"))} |']
        if linked:
            incomplete = any(not available for enemy in group_members for available in buff_by_enemy.get(enemy,{}).values())
            lines += ['', f'本类 {len(linked)} 个成员已有Buff事件图绑定；' +
                ('只对剩余缺失模板键补源，已连接部分继续实现。' if incomplete else '图数据已齐，后续推进事件、目标与完整执行链。')]
        lines += ['', '| 稳定子类 | 成员 | 卫戍 |', '| --- | ---: | ---: |']
        for subkey,sub in sorted(template.get('subclasses',{}).items(),key=lambda item:(-len(item[1].get('memberIDs',[])),item[0])):
            lines.append(f'| {_cell(sub.get("label",subkey))} | {len(sub.get("memberIDs",[]))} | {len(sub.get("encounterIDs",[]))} |')
        lines += ['', '| 共用算子 | 本类涉及 | 当前推进 | 延后研究 | 输出责任 / 状态 |', '| --- | ---: | ---: | ---: | --- |']
        for op in template.get('sharedOperators',[]):
            operator = operators.get(op,{})
            purpose = operator.get('purpose','公共依赖待定义')
            if operator.get('implementationState') == 'source-graphs-joined':
                purpose='数据获取步骤已完成；复用完整事件图，继续绑定真实目标、参数和完整动作，尚不代表运行时已执行'
            elif linked and _graph_operator(op,operators):
                purpose='已连接的图直接进入事件/参数绑定；仅剩余缺失模板键需要补源'
            involved,active,deferred = _operator_counts(operator,group_members)
            lines.append(f'| {_cell(_label(op,operators))} | {involved} | {active} | {deferred} | {_cell(purpose)} |')
        acceptance = template.get('acceptance',[])
        if isinstance(acceptance,str):
            acceptance=[acceptance]
        lines += ['', '验收：', ''] + [f'- {_text(item)}' for item in acceptance]
    lines += ['', '## 统一依赖批次', '',
        '按依赖批次补一次公共能力，再由稳定ID自动选出受影响成员。各批范围可能重叠；不展开为189个独立适配任务。'
        '已有明确Buff切换图的成员先接现成事件链；其泛化实体状态调用研究延后，避免阻塞已具备数据的路径。'
        '算子表的当前推进/延后研究人数来自计划分流；数据步骤完成不等于整批执行验收完成。', '',
        '| 批次 | 前置依赖 | 共用算子 | 影响成员 | 交付物 |', '| --- | --- | --- | ---: | --- |']
    for key in _batch_order(batches):
        batch=batches[key]
        deps=[batches.get(dep,{}).get('label',dep) for dep in batch.get('dependsOn',[])]
        labels=[_label(op,operators) for op in batch.get('operatorIDs',[])]
        lines.append(f'| {_cell(batch.get("label",key))} | {_cell(deps)} | {_cell(labels)} | {len(batch.get("memberIDs",[]))} | {_cell(batch.get("output"))} |')
    for key in _batch_order(batches):
        batch=batches[key]
        lines += ['', f'**{batch.get("label",key)}验收**：{_text(batch.get("acceptance",[]))}。']
    runtime_plan = plan.get('runtimeSupport',{})
    if runtime_plan.get('rule') == providers['runtimeRule'] and runtime_plan.get('pendingCapabilities'):
        next_step = runtime_plan.get('nextSharedProvider',{})
        lines += ['', f'**下一项共用能力：{next_step.get("label",next_step.get("family","待排序"))}**。'
            '由当前拒绝原因与已保存候选归并；已接 provider ID 不再研究，其他动作和生命周期缺口保留。', '',
            '| 当前公共缺口 | 涉及候选 | 敌人 | 现成纯切换图候选 |', '| --- | ---: | ---: | ---: |']
        for request in runtime_plan['pendingCapabilities']:
            lines.append(f'| {_cell(request.get("label",request["family"]))} | {len(request.get("candidateIDs",[]))} | '
                f'{len(request.get("affectedEnemyIDs",[]))} | {len(request.get("pureSwitchCandidateIDs",[]))} |')
        lines += ['', '候选可能同时存在多项缺口，上表不是直接可解锁数量。具体拒绝路径与去重ID见[统一队列](../../work/enemy-mode-next-batch.json)。']
    lines += ['', '## 固定成员与当前状态', '',
        '这里只查固定归属和执行回执，不创建逐敌实施步骤。模式索引表示模式内动作可用；出生模式只表示初始选择。'
        '已接自动链单独列示，剩余公共缺口保留，不把单链完成推广到整敌。'
        '完整缺口键、算子和子类保留在[机器计划](../../work/enemy-mode-template-plan.json)。', '',
        '| 敌人ID | 名称 | 卫戍 | 固定主类 | 已编译模式 | 出生模式 | 已接自动链 | 剩余公共缺口摘要 |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for key in members:
        row=rows[key];state=statuses.get(key,{})
        initial=state.get('initialMode')
        initial_text=str(initial) if initial is not None else INITIAL_REASONS.get(state.get('initialModeUnresolved'),'未完成初始模式绑定')
        label=templates.get(row.get('primarySubclass'),{}).get('label',CLASSES.get(row.get('primarySubclass'),'未分类'))
        summary=_short(_remaining_labels(row,operators,buff_by_enemy))
        if any(buff_by_enemy.get(key,{}).values()):
            summary='Buff图已连接；'+summary
        automatic = '；'.join(_provider_label(item) for item in selections[key]) if key in selections else '—'
        if key in selections:
            summary='除已接链外：'+summary
        lines.append(f'| `{_cell(key)}` | {_cell(row.get("name",key))} | {"是" if row.get("inEncounterPool") else "—"} | {_cell(label)} | '
            f'{_cell(", ".join(map(str,_supported(row,statuses))) or "—")} | {_cell(initial_text)} | {_cell(automatic)} | {_cell(summary)} |')
    lines += ['', '本页仅读取已保存的模板计划、导入回执和可选Buff绑定回执，不重读原始组件目录、APK或数据库。'
        '只在计划或实现输入改变后刷新相应批次；源码没有变化时使用现有缓存。', '']
    target=ROOT/'docs/generated/enemy-mode-dispatch.md'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text('\n'.join(lines),encoding='utf-8')
    return dict(output=str(target),members=len(members),templates=len(order),sharedOperators=len(operators),batches=len(batches),boundBuffTemplates=len(matched),
        **{key:providers[key] for key in ('runtimeSupportAvailable','runtimeRule','autoModeProviderEnemies','autoModeProviders',
                                        'encounterAutoModeProviderEnemies','fullPhaseTransitionsCompleted','providerFamilies')})


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,default=ROOT/'work/external-combat-import-report.json')
    args=parser.parse_args()
    result=render(_read(args.report))
    print(json.dumps(result or {'skipped':True,'reason':'compact-template-plan-missing'},ensure_ascii=False))
