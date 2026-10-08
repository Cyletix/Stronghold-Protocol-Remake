"""Inventory garrison-only batch candidates from existing machine facts.

Reads frozen indexes, never extracts assets, compiles skills, modifies runtime,
or rewrites manual acceptance state. Capability hits are overlapping structural
candidates; they are not claims that a complete skill can already execute.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUTS = {
    'implementation': 'docs/checklists/implementation-checklist.json',
    'bindings': 'work/client-logic/skill-bindings.json',
    'reuse': 'work/client-logic/execution-reuse.json',
    'compilation': 'work/client-logic/program-compilation.json',
}
OUTPUT = 'work/garrison-batch-inventory.json'
REPORT = 'docs/generated/garrison-batches.md'
COMPONENT = 'Torappu.Battle.'
ABILITY = COMPONENT + 'Abilities.'
ACTION = COMPONENT + 'Action.Nodes+'

# Predicates use exact serialized type names in the existing reverse index.
# No skill IDs, descriptions, hand-written member lists, or dispatch order.
CAPABILITIES = [
    dict(id='cast-active-buff-skeleton', name='自身 Buff 的双组件骨架',
         componentsExactly=[COMPONENT+'CastSkill', ABILITY+'ActiveBuffAbility'],
         boundary='只有组件骨架相同；Buff 动作、模式、异常状态与天赋参数仍可不同。'),
    dict(id='cast-active-buff-minimal-actions', name='上述骨架中仅模式切换或无静态动作',
         componentsExactly=[COMPONENT+'CastSkill', ABILITY+'ActiveBuffAbility'],
         actionsSubset=[ACTION+'SwitchMode'],
         boundary='上一行的子集；角色模式的攻击、选择器、特质与弹体未由此自动闭合。'),
    dict(id='replacement-attack', name='替换／下一次普攻控制器',
         componentsAny=[COMPONENT+'ReplacementSkill', COMPONENT+'ReplacementSkillFixed'],
         boundary='可复用下一次普攻执行入口；额外 Buff、事件、特殊弹体与目标规则仍须按整图判定。'),
    dict(id='direct-attack-ability', name='近战／远程／多段攻击能力',
         componentsAny=[ABILITY+name for name in ('MeleeAttack', 'RangedAttack', 'MultiMeleeAttack', 'MultiRangedAttack')],
         boundary='包含与替换普攻组重叠的技能；同动作类型不保证触发器、配送或生命周期相同。'),
    dict(id='aura', name='范围／全局光环能力',
         componentsAny=[ABILITY+'AuraAbility', ABILITY+'GlobalAuraAbility'],
         boundary='需完整绑定范围、对象、进入退出及各 Buff；不能只接一条属性。'),
    dict(id='channeling', name='三段引导控制',
         componentsAny=[ABILITY+'ThreePartChannelingAnimation'],
         boundary='可能涉及停止普攻、阶段动画、中断与结束；不是所有成员都属于自身回复。'),
    dict(id='conditional-actions', name='条件分支／Buff 条件动作',
         actionsAny=[ACTION+name for name in ('IfElse', 'IfNot', 'CheckContainsBuff')],
         boundary='仅这些明确节点的静态命中；条件对象、事件与嵌套动作需要整链编译。'),
    dict(id='create-buff', name='创建 Buff 动作',
         actionsAny=[ACTION+'CreateBuff'],
         boundary='需要目标作用域、模板与派生实例生命周期；不包括名称相似但不同的创建节点。'),
    dict(id='switch-mode', name='模式切换动作',
         actionsAny=[ACTION+'SwitchMode'],
         boundary='仅说明需要模式消费者，不能把存在 SwitchMode 当作已支持目标模式。'),
]
REASON_NAMES = {
    'unsupported_component': '现有公共程序编译器不接受组件',
    'unsupported_field': '现有公共程序编译器不接受字段',
    'unproven_mode_graph': '现有公共程序编译器未证明模式图',
    'accepted-program-unbound': '公共程序已编译，但当前技能关联尚未绑定',
    'missing-prefab-binding': '源技能未关联预制体',
    'missing-compilation-result': '缺现有编译结果',
}


def pointer(*parts):
    return '/' + '/'.join(str(part).replace('~', '~0').replace('/', '~1') for part in parts)


def source_ref(source, *parts):
    return dict(path=INPUTS[source], pointer=pointer(*parts))


def scope_stats(operators):
    skills = [skill for operator in operators for skill in operator['skills']]
    pending = [skill for skill in skills if not skill['explicitHandler']]
    return dict(identities=len(operators), skillAssociations=len(skills),
                uniqueSkillIds=len({skill['id'] for skill in skills}),
                explicitPathAssociations=sum(bool(skill['explicitHandler']) for skill in skills),
                pendingAssociations=len(pending), pendingUniqueSkillIds=len({skill['id'] for skill in pending}))


def capability_matches(row, rule):
    components, actions = set(row['componentTypes']), set(row['actionTypes'])
    if 'componentsExactly' in rule and components != set(rule['componentsExactly']):
        return False
    if 'componentsAny' in rule and not components.intersection(rule['componentsAny']):
        return False
    if 'actionsAny' in rule and not actions.intersection(rule['actionsAny']):
        return False
    if 'actionsSubset' in rule and not actions.issubset(rule['actionsSubset']):
        return False
    return True


def build():
    raw = {key: (ROOT/path).read_bytes() for key, path in INPUTS.items()}
    data = {key: json.loads(value) for key, value in raw.items()}
    operators = data['implementation']['operators']
    bindings = data['bindings']['bindings']
    prefabs = data['reuse']['prefabs']
    compilation = data['compilation']
    skills = {}
    first_groups = defaultdict(list)
    for operator_index, operator in enumerate(operators):
        if not operator['fixed']:
            continue
        for skill_index, skill in enumerate(operator['skills']):
            if skill['explicitHandler']:
                continue
            sid = skill['id']
            key = operator['id'] + '/' + sid
            if key in skills:
                raise ValueError('Duplicate operator-skill association: ' + key)
            prefab_ids = sorted(set(bindings.get(sid, {}).get('prefabs', [])))
            source_prefabs, components, actions, outcomes = [], set(), set(), set()
            for pid in prefab_ids:
                indexed = prefabs.get(pid)
                if indexed is None:
                    raise ValueError('Binding lacks existing component reverse index: ' + pid)
                components.update(indexed['componentTypes'])
                actions.update(indexed['actionTypes'])
                rejection = compilation['rejections'].get(pid)
                accepted = pid in compilation['programs']
                outcome = ('accepted-program-unbound' if accepted else
                           rejection.get('reason', 'missing-compilation-result') if rejection else
                           'missing-compilation-result')
                outcomes.add(outcome)
                source_prefabs.append(dict(prefabId=pid, compilationOutcome=outcome,
                    reverseIndex=source_ref('reuse', 'prefabs', pid),
                    componentGraph=source_ref('compilation', 'rejections', pid, 'components') if rejection else None,
                    compiledProgram=source_ref('compilation', 'programs', pid) if accepted else None,
                    firstBlockers=[dict(reason=blocker['reason'], nodeId=blocker.get('node_id'),
                        component=blocker.get('component'), fieldPath=blocker.get('path'),
                        source=source_ref('compilation', 'rejections', pid, 'blockers', index))
                        for index, blocker in enumerate((rejection or {}).get('blockers', []))]))
            outcome_id = '|'.join(sorted(outcomes)) if outcomes else 'missing-prefab-binding'
            first_groups[outcome_id].append(key)
            skills[key] = dict(charId=operator['id'], operatorName=operator['name'],
                skillId=sid, skillIndex=skill['index'], skillName=skill['name'],
                sourceLevelCount=skill.get('sourceLevelCount'), importedLevelCount=skill.get('importedLevelCount'),
                explicitHandler=False, firstOutcome=outcome_id,
                blackboardKeys=skill.get('blackboardKeys', []),
                implementation=source_ref('implementation', 'operators', operator_index, 'skills', skill_index),
                binding=source_ref('bindings', 'bindings', sid), prefabs=source_prefabs,
                componentTypes=sorted(components), actionTypes=sorted(actions))
    first = [dict(id=reason, name=REASON_NAMES.get(reason, reason),
                  associations=len(members), uniqueSkillIds=len({skills[key]['skillId'] for key in members}),
                  memberIds=sorted(members)) for reason, members in sorted(first_groups.items())]
    capabilities = []
    for rule in CAPABILITIES:
        members = sorted(key for key, row in skills.items() if capability_matches(row, rule))
        capabilities.append(dict(**rule, associations=len(members),
            uniqueSkillIds=len({skills[key]['skillId'] for key in members}), memberIds=members))
    classified = [key for group in first for key in group['memberIds']]
    if len(classified) != len(set(classified)) or set(classified) != set(skills):
        raise AssertionError('First outcomes must form an exact partition of pending associations')
    hit_union = set(key for group in capabilities for key in group['memberIds'])
    stats = dict(fixed=scope_stats([o for o in operators if o['fixed']]),
                 expandedGarrison=scope_stats([o for o in operators if o['scope'] == 'mode']),
                 pendingWithPrefabComponents=sum(bool(row['prefabs']) for row in skills.values()),
                 overlappingCapabilityUnion=len(hit_union),
                 outsideListedCapabilities=len(set(skills)-hit_union))
    if stats['fixed']['pendingAssociations'] != len(skills):
        raise AssertionError('Pending association count drift')
    return dict(schemaVersion=1, rule='existing-garrison-index-capability-inventory-v1',
        plan='docs/plan.md', inputs={INPUTS[key]: hashlib.sha256(value).hexdigest() for key, value in raw.items()},
        toolSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), stats=stats,
        boundaries=[
            '主工作表只含 implementation-checklist 固定名册中 explicitHandler=false 的技能关联；扩展名册仅列数量。',
            '明确执行路径不等于完整技能验收；此工具不读取或改写人工勾选，不增加完成项。',
            '首阻塞是已有公共属性程序编译快照的诊断，未重编译，不代表新运行时只缺这一项。多 prefab 结果不同会归入单独组合类。',
            '公共能力表来自真实类型反向索引，行间允许重叠，子集也单列；计数不能相加或当作立即可编译数量。',
            '静态动作索引没有自动补全角色模式、外部弹体、动态模板与原生回调；完整执行资格仍需整图能力闭包检查。',
            'JSON skills 保存源定位，分组 memberIds 只引用这些稳定关联；不复制原始组件全文或创建手填完成状态。',
            '输入内容哈希说明该工作表对应哪份快照，不证明输入索引登记等同当前游戏行为。推进顺序只在 docs/plan.md 维护。',
        ], firstBlockers=first, capabilityHits=capabilities, skills=skills,
        outsideListedCapabilityMemberIds=sorted(set(skills)-hit_union))


def render(data):
    stats = data['stats']; fixed = stats['fixed']; expanded = stats['expandedGarrison']
    lines = ['# 卫戍限定批量候选工作表', '',
        '由 `tools/audit_garrison_batches.py` 读取现有机器事实生成。推进顺序只见[当前计划](../plan.md)，本表不另排开发队列。', '',
        f"固定名册 **{fixed['identities']} 身份 / {fixed['skillAssociations']} 条技能关联**，其中 {fixed['explicitPathAssociations']} 条有明确执行路径，"
        f"**{fixed['pendingAssociations']} 条待绑定**（{fixed['pendingUniqueSkillIds']} 个不同技能 ID）；待绑定关联中的 {stats['pendingWithPrefabComponents']} 条均有预制体组件索引。",
        f"隐藏／替补等扩展卫戍名册共 {expanded['identities']} 身份、{expanded['skillAssociations']} 条关联，明确路径 {expanded['explicitPathAssociations']}、待绑定 {expanded['pendingAssociations']}。下列成员表只列固定名册待绑定项。", '',
        '**候选不是立即可编译，也不是技能完成。** 首阻塞表为互斥诊断；公共能力表为重叠命中，不能相加计算完成率。', '',
        '## 互斥的当前首阻塞', '',
        '直接读取既有公共程序编译快照的首结果，不重编译。第一项拒绝解决后可能仍有其他能力缺口；“已编译但未绑定”也可能缺天赋参数等消费者。', '',
        '| 现有编译结果 | 关联数 | 不同技能 ID |', '| --- | ---: | ---: |']
    for group in data['firstBlockers']:
        lines.append(f"| {group['name']} (`{group['id']}`) | {group['associations']} | {group['uniqueSkillIds']} |")
    lines += ['', f"这张表恰好分割全部 {fixed['pendingAssociations']} 条待绑定关联，不把未知后续阻塞拆成新的技能数。", '',
        '## 可重叠的公共能力命中', '',
        '按完整类型名匹配既有组件／动作反向索引；不是按描述猜技能，不逐 ID 手填分类。模式切换行与多数组重叠，第二行是第一行子集。', '',
        '| 能力候选 | 关联数 | 不同技能 ID | 判定边界 |', '| --- | ---: | ---: | --- |']
    for group in data['capabilityHits']:
        lines.append(f"| {group['name']} | {group['associations']} | {group['uniqueSkillIds']} | {group['boundary']} |")
    lines += ['', f"上述能力条件的并集命中 {stats['overlappingCapabilityUnion']} 条关联，另 {stats['outsideListedCapabilities']} 条不满足所列条件；后者仍在机器成员表中，不表示缺源或必须逐人实现。", '',
        '## 成员与原始依据', '',
        '[机器工作表](../../work/garrison-batch-inventory.json)保留每组完整 `memberIds`，按其查 `skills` 即得到角色／技能槽／技能 ID、每级预制体关联、真实组件与动作类型，以及已有完整组件图／阻塞字段的 JSON pointer。源文件 SHA-256 同在 `inputs`。', '',
        '以下列表便于查看；具体资格继续使用源字段与完整依赖图判断。']
    for heading, key in [('首阻塞成员', 'firstBlockers'), ('公共能力成员（允许重复出现）', 'capabilityHits')]:
        lines += ['', '### ' + heading, '']
        for group in data[key]:
            lines += ['<details>', f"<summary>{group['name']}：{group['associations']} 条</summary>", '']
            lines.append('；'.join(f"{data['skills'][mid]['operatorName']} S{data['skills'][mid]['skillIndex']} `"
                + data['skills'][mid]['skillId'] + '`' for mid in group['memberIds']) or '无。')
            lines += ['', '</details>', '']
    lines += ['## 重复运行与边界', '', '```powershell',
        'python tools/audit_garrison_batches.py', 'python tools/audit_garrison_batches.py --check', '```', '',
        '只读取四份现有索引，输出本工作表和对应 JSON；不会提取 APP、重建全库、试运行技能、修改旧清单或重写人工状态。输入改变后重新生成即可，哈希与成员来源随之更新。', '',
        '统一实施入口：`python tools/build_garrison_skill_batches.py` 串行运行公共 Buff、下一次普攻、技能模式、直接施放四个提供者，各自只编译一次；`--providers next-attack` 等参数可限定受影响组，`--report-only` 仅汇总已生成绑定。实际接入和本轮新增数量见 [批量接入回执](../../work/garrison-skill-batch-report.json)，各组完整拒绝表由回执指向。', '',
        '编译资格使用 `garrison_skill_scope.py` 的卫戍身份投影，包含隐藏/替补；不会因人工勾选、描述更新或当前已有处理器而改变范围。按组件、角色模式和所有等级黑板的完整条件放行，不能因本表的组件骨架命中就视为可执行。', '',
        '原始角色模式、外部弹体、动态模板键和原生回调不在这份静态命中表里自动闭合；明确路径数量也不等于验收完成数量。']
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare existing outputs without writing')
    args = parser.parse_args()
    data = build()
    outputs = {OUTPUT: json.dumps(data, ensure_ascii=False, indent=2)+'\n', REPORT: render(data)}
    for path, content in outputs.items():
        target = ROOT/path
        if args.check:
            if not target.is_file() or target.read_text(encoding='utf-8') != content:
                raise SystemExit('Garrison batch inventory drift: ' + path)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
    print(json.dumps(dict(status='checked' if args.check else 'generated', **data['stats'],
                         outputs=list(outputs)), ensure_ascii=False))


if __name__ == '__main__':
    main()
