"""Index shared execution types from existing candidates; never infer runnable support."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'work/client-logic/mechanism-candidates.json'
OUTPUT = ROOT / 'work/client-logic/execution-reuse.json'
REPORT = ROOT / 'docs/generated/client-execution-reuse.md'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def build(source):
    # Only data used by the reverse index and its group cross-checks. Changes to
    # top-level inputs/webHandlers/nativeTypes hashes do not invalidate this view.
    projected = {'prefabs': {}, 'groups': sorted(source['groups'], key=lambda g: g['id'])}
    for pid, p in sorted(source['prefabs'].items()):
        assert len(p['actionTypes']) == len(set(p['actionTypes'])), (pid, 'duplicate action type')
        projected['prefabs'][pid] = dict(
            components=sorted([{'nodeId': c['nodeId'], 'script': c['script']} for c in p['components']], key=canonical),
            actionTypes=sorted(p['actionTypes']), consumers=sorted(p['consumers'], key=canonical), groupId=p['groupId'])
    digest = hashlib.sha256(canonical(projected).encode()).hexdigest()
    prefabs, components, actions = {}, {}, {}
    component_instances = Counter()
    unresolved = []
    for pid, p in projected['prefabs'].items():
        types = []
        for c in p['components']:
            script = c['script']
            if script.get('status') != 'resolved':
                unresolved.append({'prefabId': pid, **c})
                continue
            typename = script.get('type')
            assert isinstance(typename, str) and typename, (pid, 'resolved component without type')
            types.append(typename)
            component_instances[typename] += 1
        skills = sorted(c['skillId'] for c in p['consumers'])
        assert len(skills) == len(set(skills)), (pid, 'duplicate consumer')
        prefabs[pid] = dict(groupId=p['groupId'], componentTypes=sorted(set(types)),
                           componentInstances=dict(sorted(Counter(types).items())),
                           actionTypes=p['actionTypes'], sourceSkillIds=skills)
        for field, index in [('componentTypes', components), ('actionTypes', actions)]:
            for typename in prefabs[pid][field]:
                assert isinstance(typename, str) and typename, (pid, field)
                index.setdefault(typename, {})[pid] = skills

    groups = {}
    grouped_prefabs = []
    for g in projected['groups']:
        assert g['id'] not in groups, ('duplicate group', g['id'])
        ids = g['prefabIds']
        assert len(ids) == len(set(ids)) == g['prefabCount'], g['id']
        assert all(pid in prefabs and prefabs[pid]['groupId'] == g['id'] for pid in ids), g['id']
        skills = sorted({sid for pid in ids for sid in prefabs[pid]['sourceSkillIds']})
        assert skills == sorted(g['skillIds']), (g['id'], 'group/consumer mismatch')
        assert set(g['withoutWebRegistration']) <= set(skills), g['id']
        groups[g['id']] = dict(prefabIds=sorted(ids), sourceSkillIds=skills)
        grouped_prefabs.extend(ids)
    assert Counter(grouped_prefabs) == Counter({pid: 1 for pid in prefabs}), 'group partition mismatch'

    def finish(index, field):
        result = {}
        for typename, links in sorted(index.items()):
            ids = sorted(links)
            skills = sorted({sid for values in links.values() for sid in values})
            gids = sorted({prefabs[pid]['groupId'] for pid in ids})
            row = dict(prefabCount=len(ids), sourceSkillCount=len(skills), groupCount=len(gids),
                       prefabIds=ids, sourceSkillIds=skills, groupIds=gids,
                       prefabSourceSkillIds={pid: links[pid] for pid in ids})
            if field == 'componentTypes':
                row['componentInstanceCount'] = component_instances[typename]
                row['prefabComponentInstanceCounts'] = {pid: prefabs[pid]['componentInstances'][typename] for pid in ids}
                assert sum(row['prefabComponentInstanceCounts'].values()) == row['componentInstanceCount']
            result[typename] = row
        assert sum(r['prefabCount'] for r in result.values()) == sum(len(p[field]) for p in prefabs.values())
        for pid, p in prefabs.items():
            assert {t for t, r in result.items() if pid in r['prefabSourceSkillIds']} == set(p[field]), (pid, field)
        return result

    components = finish(components, 'componentTypes')
    actions = finish(actions, 'actionTypes')
    total_instances = sum(len(p['components']) for p in projected['prefabs'].values())
    assert total_instances == sum(component_instances.values()) + len(unresolved)
    skills = {sid for p in prefabs.values() for sid in p['sourceSkillIds']}
    assert skills == {sid for g in groups.values() for sid in g['sourceSkillIds']}
    summary = dict(prefabs=len(prefabs), groups=len(groups), singletonGroups=sum(len(g['prefabIds']) == 1 for g in groups.values()),
        sourceSkills=len(skills), consumerLinks=sum(len(p['sourceSkillIds']) for p in prefabs.values()),
        prefabsWithoutConsumers=sum(not p['sourceSkillIds'] for p in prefabs.values()),
        componentTypes=len(components), componentInstances=total_instances, resolvedComponentInstances=sum(component_instances.values()),
        unresolvedComponentInstances=len(unresolved), componentPrefabMemberships=sum(r['prefabCount'] for r in components.values()),
        actionTypes=len(actions), actionPrefabMemberships=sum(r['prefabCount'] for r in actions.values()))
    return dict(schemaVersion=1, input=str(INPUT.relative_to(ROOT)).replace('\\', '/'), semanticDigest=digest,
        digestScope='prefabs: component nodeId/script, actionTypes, consumers, groupId; complete groups. Excludes unrelated top-level input hashes.',
        boundary='Static occurrence in the supplied candidate graph only. Types overlap; counts cannot be summed into unique skills or runnable support. No new implementation/completion is inferred; no development priority is assigned.',
        summary=summary, components=components, actions=actions, prefabs=prefabs, groups=groups, unresolvedComponents=unresolved)


def report(data):
    s = data['summary']
    lines = ['# 客户端公共执行类型复用索引', '',
        '本报告把既有诊断分组展开为“真实组件类型 / 动作类型 → prefab → sourceSkillId”，用于寻找公共执行机制。只读取现有候选文件，不重新提取客户端、不改运行时，也不把字段差异分组当作必须逐一重写的任务。推进顺序仍以[当前计划](../plan.md)为准，本报告的排序仅表示源图中的出现次数。', '',
        f"输入：`{data['input']}`；semantic SHA-256：`{data['semanticDigest']}`。", '',
        f"当前输入有 **{s['prefabs']} 个 prefab、{s['groups']} 个原诊断组，其中 {s['singletonGroups']} 组为单例**。原分组同时包含组件配置差异及动作签名，单例并不代表独有执行器。反向索引得到 **{s['componentTypes']} 个组件类型、{s['actionTypes']} 个动作类型**。", '',
        f"已有消费者映射覆盖 {s['sourceSkills']} 个唯一 sourceSkillId、{s['consumerLinks']} 条 prefab→skill 引用；{s['prefabsWithoutConsumers']} 个 prefab 没有消费者映射，仍完整保留。组件实例共 {s['componentInstances']} 个，已解析 {s['resolvedComponentInstances']} 个，未解析 {s['unresolvedComponentInstances']} 个。类型与 prefab 的不同出现关系分别为组件 {s['componentPrefabMemberships']} 条、动作 {s['actionPrefabMemberships']} 条；动作输入已按类型去重，不能据此统计动作节点实例数。", '',
        '**计数边界**：出现范围不等于新增支持范围或完整可运行范围。一个 prefab / 技能可同时出现多个组件和动作类型，表内行不可相加；同一公共组件的不同参数、外部角色模式、事件时序、选择器及未解析引用仍需沿具体源图验证。本工具只索引候选文件已经收录的组件与静态动作，不把外部引用自动展开成已覆盖行为，也不据 Web 登记与否宣布完成。', '',
        '## 组件类型：前20项', '', '| 真实组件类型 | prefab | 唯一 sourceSkillId | 组件实例 | 原分组 |', '|---|---:|---:|---:|---:|']
    for name, row in sorted(data['components'].items(), key=lambda x: (-x[1]['prefabCount'], x[0]))[:20]:
        lines.append(f"| `{name}` | {row['prefabCount']} | {row['sourceSkillCount']} | {row['componentInstanceCount']} | {row['groupCount']} |")
    lines += ['', '## 动作类型：前20项', '', '| 真实动作类型 | prefab | 唯一 sourceSkillId | 原分组 |', '|---|---:|---:|---:|']
    for name, row in sorted(data['actions'].items(), key=lambda x: (-x[1]['prefabCount'], x[0]))[:20]:
        lines.append(f"| `{name}` | {row['prefabCount']} | {row['sourceSkillCount']} | {row['groupCount']} |")
    lines += ['', '## 完整索引与验证', '',
        '完整结果保存在 `work/client-logic/execution-reuse.json`，包含每种类型的全部 prefabIds、sourceSkillIds、groupIds 和逐 prefab 消费者映射。下列查询按完整类型名精确匹配，输出完整ID列表，不截断为前20项：', '',
        '```powershell', 'python -B tools/audit_client_execution_reuse.py', 'python -B tools/audit_client_execution_reuse.py --check',
        'python -B tools/audit_client_execution_reuse.py --component Torappu.Battle.CastSkill',
        'python -B tools/audit_client_execution_reuse.py --action Torappu.Battle.Action.Nodes+SwitchMode', '```', '',
        '`--check`比较当前索引与报告，以及输入的语义摘要：prefab的组件nodeId/script、动作类型、消费者、groupId和完整groups。无关的顶层Web输入哈希变化不会使本报告失效；消费者登记或原分组内容改变仍需要重建。工具同时断言分组恰好分割全部prefab、各组技能集合与消费者一致、组件实例守恒，以及组件/动作正反索引的类型引用守恒。该检查证明索引没有漏算或错连，不能自证游戏行为符合原版。', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--component', metavar='FULL_TYPE')
    mode.add_argument('--action', metavar='FULL_TYPE')
    args = parser.parse_args()
    data = build(json.loads(INPUT.read_text(encoding='utf-8')))
    if args.component or args.action:
        kind, key = ('components', args.component) if args.component else ('actions', args.action)
        if key not in data[kind]:
            parser.error('Exact type not present: ' + key)
        print(json.dumps(dict(type=key, kind=kind, semanticDigest=data['semanticDigest'], **data[kind][key]), ensure_ascii=False, indent=2))
        return
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    markdown = report(data)
    if args.check:
        saved = json.loads(OUTPUT.read_text(encoding='utf-8'))
        assert saved['semanticDigest'] == data['semanticDigest'], 'Execution-reuse input semantics changed; rebuild'
        assert OUTPUT.read_text(encoding='utf-8') == text, 'STALE execution-reuse.json'
        assert REPORT.read_text(encoding='utf-8') == markdown, 'STALE client-execution-reuse.md'
    else:
        OUTPUT.write_text(text, encoding='utf-8')
        REPORT.write_text(markdown, encoding='utf-8')
    print(('CHECK' if args.check else 'BUILD') + ' execution reuse: ' + canonical(data['summary']))


if __name__ == '__main__':
    main()
