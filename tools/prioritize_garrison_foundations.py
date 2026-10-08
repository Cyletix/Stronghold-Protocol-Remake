"""Rank shared foundations by actual encounter-pool impact from saved receipts."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from enemy_skill_dispatch_status import skill_dispatch_status
from enemy_periodic_ability_status import periodic_ability_status
from garrison_encounter_scope import load_scope, scope_runtime_report, scope_requests

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'work/garrison-foundation-priority.json'
PAGE = ROOT / 'docs/generated/garrison-foundations.md'
RULE = 'garrison-appearance-foundations-first-v2'
FAMILIES = {
    'skill-trigger-dispatch': dict(label='技能触发与能力调度',tier=0,dependsOn=[],
        operators=['resolve-enemy-skill-trigger','trigger-enemy-skill','trigger-named-ability','ability-component-event-binding',
                   'action-sequence-control','conditional-action-tree'],
        tags=['root-damage-ability-unresolved','attack-named-nonroot-ability'],
        output='按已定位的技能、触发器和能力入口补共用调度接口；先闭合可追溯的一类调用合同。'),
    'buff-and-mode-attributes': dict(label='统一Buff与模式属性',tier=0,dependsOn=[],
        operators=['buff-template-dispatch','bind-buff-mode-parameter','compile-mode-attributes','action-sequence-dispatch',
                   'buff-presence-checker','compound-state-checker','finish-buff-by-id'],tags=[],
        output='统一参数作用域、完整Buff动作与模式属性读写；按当前拒绝的效果/动作家族逐类接入。'),
    'attack-events-and-timing': dict(label='攻击事件与多段时序',tier=0,dependsOn=[],
        operators=['compile-mode-channel','bind-mode-attack-blackboard'],
        tags=['fixed-repeat-contract-unresolved','nondefault-time-gating','multiple-onattack-events','onattack-event-absent'],
        output='补齐同一攻击的事件门控、多段和时序合同；缺失动画事件先补对应源数据。'),
    'special-projectiles': dict(label='特殊弹体与投射生命周期',tier=0,dependsOn=[],operators=[],
        tags=['projectile-volley-or-destination','projectile-lifetime-controls-action','multiple-projectile-keys','projectile-speed-absent'],
        gaps=['mode-dependent-projectile','nonstandard-or-missing-projectile-speed'],
        output='先按齐射、目的地、存活期控制和速度缺失分开合同；不同弹体行为不合并成单一速度算子。'),
    'mode-lifecycle': dict(label='模式进入、退出与能力生命周期',tier=1,
        dependsOn=['skill-trigger-dispatch','buff-and-mode-attributes'],
        operators=['dispatch-ability-lifecycle-event','mode-entry-dispatch','switch-mode','toggle-buff-lifecycle',
                   'resolve-active-default-mode','check-current-mode'],
        tags=['multiple-modes-different-contract','multiple-modes-same-contract'],
        gaps=['mode-dependent-basic-action-contract'],
        output='在基础能力/Buff合同上接模式启停、状态保留与目标绑定；已接provider继续复用。'),
    'death-and-rebirth': dict(label='死亡与复活',tier=2,
        dependsOn=['buff-and-mode-attributes','mode-lifecycle'],
        operators=['named-ability-resolution','reborn-activation-registration','reborn-budget-condition','reborn-buff-condition',
            'reborn-buff-lifecycle','reborn-effect-lifecycle','reborn-handler-lifecycle','reborn-hp-recharge','reborn-keep-alive',
            'reborn-mode-target','reborn-preset-selection','reborn-wave-condition','terminal-kill-action'],
        tags=['reborn-lifecycle-hook-declared'],
        output='按死亡拦截、复活预算、恢复、模式和Buff保留的完整分支接入；不能只补复活血量。'),
}
SOURCE_TAGS = {'spine-source-absent','animation-name-unresolved','animation-key-alias','prefab-source-absent','projectile-speed-absent'}
COMPLETE_STATES = {'complete','completed','implemented','verified','source-graphs-joined'}


def _hash(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def _read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def _write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def build_priority(plan, report, action_catalog, encounter_ids, previous=None):
    """Use aggregate operator sets and only the current pending pool actions."""
    encounter_ids = set(encounter_ids)
    previous = previous or {}
    current_action_ids = set(report.get('gaps',{})) & encounter_ids
    cohort_ids = sorted(previous.get('actionCohortIDs',current_action_ids))
    action_ids = sorted(set(cohort_ids) & current_action_ids)
    actions = action_catalog.get('enemies',{})
    operators = plan.get('operators',{})
    pending = plan.get('runtimeSupport',{}).get('pendingCapabilities',[])
    provider_data = report.get('modeProviders',{})
    scoped_report=scope_runtime_report(report,encounter_ids)
    skills = skill_dispatch_status(scoped_report,encounter_ids)
    periodic = periodic_ability_status(scoped_report,encounter_ids)
    bound = [dict(enemyId=enemy,providerId=item.get('id',item.get('chainId')),kind=item.get('kind'),
                  scope=item.get('scope'),inEncounterPool=enemy in encounter_ids)
             for enemy,items in provider_data.get('selections',{}).items() for item in items]
    families = {}
    for key,definition in FAMILIES.items():
        ops = [op for op in definition['operators'] if op in operators]
        unresolved = [op for op in ops if operators[op].get('implementationState') not in COMPLETE_STATES]
        members = {enemy for op in unresolved for enemy in operators[op].get('memberIDs',[])}
        # Report membership from the actual encounter list; keep cached operator
        # encounterIDs as traceable evidence rather than assuming every mode is in pool.
        evidence = [dict(source='mode-plan-operator',operatorId=op,memberIDs=operators[op].get('memberIDs',[]),
            declaredEncounterIDs=operators[op].get('encounterIDs',[]),
            actualEncounterIDs=sorted(set(operators[op].get('memberIDs',[])) & encounter_ids)) for op in unresolved]
        action_members = []
        for enemy in action_ids:
            row = actions.get(enemy,{})
            tags = sorted(set(row.get('tags',[])) & set(definition['tags']))
            gaps = sorted(set(report['gaps'][enemy]) & set(definition.get('gaps',[])))
            if tags or gaps:
                members.add(enemy); action_members.append(enemy)
                evidence.append(dict(source='pending-pool-action',enemyId=enemy,tags=tags,gaps=gaps))
        related = scope_requests([request for request in pending
            if set(request.get('requiredOperators',[])) & set(unresolved)],encounter_ids)
        pool = sorted(members & encounter_ids)
        families[key] = dict(id=key,label=definition['label'],foundationTier=definition['tier'],
            dependsOn=definition['dependsOn'],requiredOperators=unresolved,
            completedOperatorIDs=[op for op in ops if op not in unresolved],
            dependentMemberIDs=sorted(members),dependentEncounterIDs=pool,
            dependentEncounterCount=len(pool),pendingActionEncounterIDs=action_members,
            directCandidateEncounterIDs=[],directCandidateCount=0,
            directCandidateMeaning='当前报告中的accepted provider已全部接入；未接候选没有完整可执行合同，不把纯Switch图或依赖影响数算作直接可接数量。',
            boundedCandidateRequests=deepcopy(related),output=definition['output'],
            readiness='requires-bounded-shared-contracts',oneOperatorClosesFamily=False,evidence=evidence)
        families[key]['alreadyBoundPeriodicGroups'] = [item for item in periodic['alreadyBoundGroups'] if item['enemyId'] in members]
        if key=='skill-trigger-dispatch':
            families[key].update(alreadyBoundSkills=skills['alreadyBoundSkills'],
                boundEntryPendingSkillIDs=skills['boundEntryPendingSkillIDs'],
                pendingSkillIDs=skills['pendingSkillIDs'],deferredSkillIDs=skills['deferredSkillIDs'],
                executablePendingSkillIDs=skills['executablePendingSkillIDs'],skillDispatchCounts=skills['counts'])
            if skills['executablePendingSkillIDs']:
                families[key]['boundedCandidateRequests'].append(dict(
                    family='pending-enemy-skill-components',candidateIDs=skills['executablePendingSkillIDs'],
                    affectedEnemyIDs=skills['executablePendingEnemyIDs'],requiredOperators=['resolve-enemy-skill-trigger'],
                    sourceReport=skills['sourceReport'],
                    instruction='只按当前可推进的未接组件和拒绝原因扩展共享合同，入口未启用组件保留未完成但不重复派工；复用已接SP与施放框架，原模式激活与完整能力组仍须各自闭合。'))
    ranked = sorted((item for item in families.values() if item['dependentMemberIDs']),
        key=lambda item:(item['dependentEncounterCount']==0,item['foundationTier'],
                         -item['dependentEncounterCount'],-len(item['dependentMemberIDs']),item['id']))
    for index,item in enumerate(ranked,1):
        item['rank']=index
    generic = operators.get('resolve-entity-state-mode-call',{})
    research = dict(operatorId='resolve-entity-state-mode-call',label='实体状态调用定位线索（不作为单一可实现算子）',
        dependentEncounterIDs=sorted(set(generic.get('memberIDs',[])) & encounter_ids),
        actionableAsOneOperator=False,
        instruction='先归入具体技能调用、Buff、模式生命周期或复活合同；未定位调用者前只保留研究线索，不能按受影响人数宣称可批量实现。')
    action_rows = {enemy:dict(enemyId=enemy,name=actions.get(enemy,{}).get('name',enemy),inEncounterPool=enemy in encounter_ids,
        primaryTemplate=actions.get(enemy,{}).get('primaryTemplate'),tags=actions.get(enemy,{}).get('tags',[]),
        currentGaps=report.get('gaps',{}).get(enemy,[]),currentlyPending=enemy in current_action_ids,
        status='pending-action-contract' if enemy in current_action_ids else 'not-in-current-action-gap-receipt',
        foundationIDs=[key for key,value in families.items() if enemy in value['pendingActionEncounterIDs']]
            or previous.get('actions',{}).get(enemy,{}).get('foundationIDs',[]),
        sourceGapTags=sorted(set(actions.get(enemy,{}).get('tags',[])) & SOURCE_TAGS),
        manualProgress=deepcopy(previous.get('actions',{}).get(enemy,{}).get('manualProgress',{})),
        alreadyBoundProviders=[item for item in bound if item['enemyId']==enemy]) for enemy in cohort_ids}
    for enemy, row in action_rows.items():
        row['alreadyBoundPeriodicGroups'] = periodic['alreadyBoundGroupsByEnemy'].get(enemy,[])
    return dict(schemaVersion=1,rule=RULE,rankingRule='Actual encounter impact first; within that tier, shared prerequisites before dependents; then deduplicated encounter reach and reuse. Dependency reach never equals completed or directly bindable coverage.',
        runtimeRule=provider_data.get('rule'),encounterPoolIDs=sorted(encounter_ids),
        families=families,rankedFamilyIDs=[item['id'] for item in ranked],
        nextFoundation=ranked[0]['id'] if ranked else None,
        counts=dict(encounterPool=len(encounter_ids),fixedActionCohortEnemies=len(set(cohort_ids)&encounter_ids),
            sourceActionCohortEnemies=len(cohort_ids),outOfScopeActionCohortEnemies=len(set(cohort_ids)-encounter_ids),pendingActionEncounterEnemies=len(action_ids),
            currentPendingActionEncounterEnemies=len(current_action_ids),
            reportedPendingActionEncounterEnemies=report.get('counts',{}).get('pendingEncounterEnemies'),
            foundationFamilies=len(ranked),boundProviders=len(bound),boundEncounterProviders=sum(item['inEncounterPool'] for item in bound),
            boundChainProjectileEnemies=report.get('counts',{}).get('chainProjectileProfiles',0),
            boundEncounterChainProjectileEnemies=len(set(report.get('chainProjectiles',{}).get('selections',{})) & encounter_ids),
            boundSkillComponents=skills['counts']['selectedSkills'],
            sourceSkillComponents=len(skills['sourceCandidateSkillIDs']),outOfScopeSkillComponents=len(skills['outOfScopeSkillIDs']),
            boundEntryPendingSkillComponents=skills['counts']['boundEntryPendingSkills'],
            boundSkillEnemies=skills['counts']['selectedEnemies'],
            boundEncounterSkillEnemies=skills['counts']['encounterSelectedEnemies'],
            pendingSkillComponents=skills['counts']['pendingSkills'],
            deferredSkillComponents=skills['counts']['deferredSkills'],
            executablePendingSkillComponents=skills['counts']['executablePendingSkills'],
            boundPeriodicAbilityGroups=periodic['counts']['groups'],
            boundPeriodicAbilityEnemies=periodic['counts']['enemies'],
            boundEncounterPeriodicAbilityEnemies=periodic['counts']['encounterEnemies'],
            boundPeriodicCapabilityKinds=periodic['counts']['capabilityKinds'],
            boundPeriodicCapabilityBindings=periodic['counts']['capabilityBindings'],
            fullEnemyMechanismsCompleted=0),
        actionCohortIDs=cohort_ids,pendingActionEncounterIDs=action_ids,
        newActionGapEncounterIDs=sorted(current_action_ids-set(cohort_ids)),
        actions=action_rows,alreadyBoundProviders=bound,skillDispatch=skills,periodicAbilities=periodic,
        alreadyBoundPeriodicGroups=periodic['alreadyBoundGroups'],researchSignals=[research],
        boundary='Affected sets are dependency impact only. Families overlap and each needs bounded contract slices. Existing providers are retained; unrelated enemy mechanisms are not completed or removed.')


def render(priority):
    lines=['# 卫戍池基础能力优先级','',
        '先处理卫戍池实际受影响的底层共享依赖，再处理依赖这些基础能力的模式和复活；非池候选保留，不能因图更简单而抢占池内任务。','',
        '[当前计划](../plan.md) · [机器优先级](../../work/garrison-foundation-priority.json) · [模式公共合同](enemy-mode-dispatch.md)','',
        '池内只采用[出场引用索引](../../work/garrison-encounter-scope.json)：两季可选敌群、已引用关卡 SPAWN、Boss 轮次与策略召敌。属性表、覆盖表、图鉴别名和仅有悬赏声明均不能单独进入优先队列。','',
        f'原固定动作名单保留 {priority["counts"]["sourceActionCohortEnemies"]} 个历史成员；其中 **{priority["counts"]["fixedActionCohortEnemies"]} 个有出场引用**，当前仍有缺口 **{priority["counts"]["pendingActionEncounterEnemies"]} 个**。'
        f'已有自动 provider **{priority["counts"]["boundProviders"]} 条**，其中池内 **{priority["counts"]["boundEncounterProviders"]} 条**；已接记录保留。','',
        f'链式弹体公共合同已接 **{priority["counts"].get("boundChainProjectileEnemies",0)} 敌**，其中卫戍池 **{priority["counts"].get("boundEncounterChainProjectileEnemies",0)} 敌**；只解除对应普通动作缺口。','',
        f'技能调度已接 **{priority["counts"].get("boundSkillComponents",0)} 个技能组件 / {priority["counts"].get("boundSkillEnemies",0)} 敌**'
        f'；有出场引用的技能仍有 **{priority["counts"].get("pendingSkillComponents",0)} 个组件**未接。'
        f'其中环境入口未可达 **{priority["counts"].get("deferredSkillComponents",0)} 个**暂缓，继续推进 **{priority["counts"].get("executablePendingSkillComponents",0)} 个**。'
        f'已接中明确仍缺自动阶段入口 **{priority["counts"].get("boundEntryPendingSkillComponents",0)} 个**；'
        '这些记录为已接技能本体、入口待办，不能按自动遭遇已生效计算。已接本体不重复开发，模式激活、其他技能及整敌完成另计。','',
        f'原冻结技能表 {priority["counts"].get("sourceSkillComponents",0)} 个稳定 ID 全部保留；其中 {priority["counts"].get("outOfScopeSkillComponents",0)} 个不在本次出场优先范围，不能计入卫戍完成率。','',
        f'周期 Buff 与直接能力为独立已接组：**{priority["counts"].get("boundPeriodicAbilityGroups",0)} 组 / '
        f'{priority["counts"].get("boundPeriodicAbilityEnemies",0)} 敌**（卫戍 {priority["counts"].get("boundEncounterPeriodicAbilityEnemies",0)}）；'
        f'包含 {priority["counts"].get("boundPeriodicCapabilityKinds",0)} 类能力、{priority["counts"].get("boundPeriodicCapabilityBindings",0)} 处组内绑定。'
        '已接组复用，不抵扣 EnemySkill 未完成总数，也不代表整敌完成。','',
        '**依赖影响数不等于完成数，也不等于下一次可直接接入数。** 同一敌人可能依赖多种基础能力，以下人数不能相加。','',
        '| 优先 | 基础家族 | 池内依赖影响 | 固定动作缺口涉及 | 当前直接可接 | 前置共享依赖 |',
        '| ---: | --- | ---: | ---: | ---: | --- |']
    for key in priority['rankedFamilyIDs']:
        item=priority['families'][key]
        deps='、'.join(FAMILIES[dep]['label'] for dep in item['dependsOn']) or '独立基础合同'
        lines.append(f'| {item["rank"]} | {item["label"]} | {item["dependentEncounterCount"]} | {len(item["pendingActionEncounterIDs"])} | {item["directCandidateCount"]} | {deps} |')
    lines+=['','“当前直接可接”只认完整编译合同。已accepted的provider已接入，其余纯切换图、待补生命周期候选仍属于合同工作，不能记为可直接接入。']
    periodic=priority.get('periodicAbilities',{})
    if periodic.get('alreadyBoundGroups'):
        lines += ['', '| 已接公共组 | 敌人 / 模式 | 完整组内能力 |', '| --- | --- | --- |']
        for item in periodic['alreadyBoundGroups']:
            labels='、'.join(periodic['capabilities'][key]['label'] for key in item['capabilityIDs'])
            lines.append(f'| `{item["groupId"]}` | `{item["enemyId"]}` / {item["modeIndex"]} | {labels} |')
    for key in priority['rankedFamilyIDs']:
        item=priority['families'][key]
        lines+=['',f'## {item["rank"]}. {item["label"]}','',item['output'],'',
            '本组需要多个明确合同，不承诺实现一个算子即可闭合整组。',
            '',f'共用算子：{", ".join(item["requiredOperators"]) or "先按固定动作标签拆分弹体合同"}。',
            f'池内稳定ID：{", ".join(item["dependentEncounterIDs"]) or "无；排在池内任务之后"}。']
    research=priority['researchSignals'][0]
    lines+=['','## 研究线索与已接状态','',
        f'泛化实体状态定位关联 {len(research["dependentEncounterIDs"])} 个池内敌人，但还没有共同可执行合同，单独保留为研究线索，未放入“一个算子可解决”的排名。','',
        '已接provider和具体未接候选保留在机器回执中。固定动作队列只用来查影响；已不在当前缺口中的成员仍保留，不生成逐敌实施任务。','',
        '| 固定动作成员 | 名称 | 当前动作状态 | 基础家族 | 源数据缺口 |','| --- | --- | --- | --- | --- |']
    for enemy,row in priority['actions'].items():
        families='、'.join(FAMILIES[key]['label'] for key in row['foundationIDs']) or '先按已有源缺口补齐依据'
        sources='、'.join(row['sourceGapTags']) or '—'
        status='无直接出场引用；保留来源，不派工' if not row['inEncounterPool'] else '仍有动作缺口' if row['currentlyPending'] else '当前无该动作缺口；整敌另计'
        lines.append(f'| `{enemy}` | {row["name"].replace("|","／")} | {status} | {families} | {sources} |')
    return '\n'.join(lines)+'\n'


def ensure_priority(plan=None, report=None):
    plan = plan if plan is not None else _read(ROOT/'work/enemy-mode-template-plan.json')
    report = report if report is not None else _read(ROOT/'work/external-combat-import-report.json')
    actions = _read(ROOT/'work/enemy-action-template-catalog.json')
    scope=load_scope();encounters=scope['eligibleEnemyIDs']
    old=_read(OUTPUT) if OUTPUT.is_file() else {}
    priority=build_priority(plan,report,actions,encounters,old)
    priority['appearanceScope']=dict(path='work/garrison-encounter-scope.json',rule=scope['rule'],sourceHashes=scope['sourceHashes'])
    priority['contentSha256']=_hash(priority)
    cached=old.get('contentSha256')==priority['contentSha256']
    if not cached:
        _write(OUTPUT,priority)
    PAGE.parent.mkdir(parents=True,exist_ok=True)
    PAGE.write_text(render(priority),encoding='utf-8')
    return priority,cached


if __name__=='__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    result,cached=ensure_priority()
    print(json.dumps(dict(output=str(OUTPUT),cached=cached,nextFoundation=result['nextFoundation'],counts=result['counts']),ensure_ascii=False))
