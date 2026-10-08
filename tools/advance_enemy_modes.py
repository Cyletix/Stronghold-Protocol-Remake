"""Advance shared mode data bindings, then refresh one unified implementation queue.

This command does not manufacture runtime support: it joins missing cached source
graphs and prepares affected sets for the next shared operator implementation.
"""
import argparse
import hashlib
import json
from pathlib import Path
from copy import deepcopy

from build_enemy_mode_template_plan import ROOT, CATALOG, OUTPUT as PLAN, ALIASES, ensure_plan, read, write, digest
import enemy_mode_buff_bindings as buffs
from enemy_skill_dispatch_status import skill_dispatch_status
from enemy_periodic_ability_status import periodic_ability_status
from garrison_encounter_scope import load_scope, scope_runtime_report, apply_scope_to_plan, scope_requests

BINDINGS = ROOT / 'work/enemy-mode-buff-bindings.json'
RECEIPT = ROOT / 'work/enemy-mode-template-advance.json'
QUEUE = ROOT / 'work/enemy-mode-next-batch.json'
RUNTIME_REPORT = ROOT / 'work/external-combat-import-report.json'
PROVIDER_CANDIDATES = ROOT / 'work/enemy-mode-auto-trigger-candidates.json'
RUNTIME_OVERLAY_RULE = 'saved-mode-provider-overlay-v5-appearance-scope'
CAPABILITIES = {
    'mode-provider-lifecycle': ('模式挂载能力的进入与退出生命周期', ['ability-component-event-binding','toggle-buff-lifecycle']),
    'buff-event-lifecycle': ('Buff周期、计次与事件生命周期', ['toggle-buff-lifecycle','buff-template-dispatch','dispatch-ability-lifecycle-event']),
    'complete-buff-actions': ('Buff完整动作序列与嵌套动作', ['action-sequence-dispatch','buff-template-dispatch']),
    'buff-attribute-effects': ('Buff属性与副作用', ['buff-template-dispatch']),
    'shared-condition-boundaries': ('共用条件的边界与恢复状态', ['hp-ratio-checker','blocked-state-checker']),
    'mode-action-coverage': ('目标模式与默认模式的完整动作', ['compile-mode-channel','switch-mode']),
    'provider-target-binding': ('Provider真实目标范围绑定', ['bind-buff-mode-parameter']),
    'non-mode-buff-effects': ('不含模式切换的能力与Buff效果', ['buff-template-dispatch','action-sequence-dispatch']),
    'remaining-provider-contract': ('尚未归并的具体Provider合同', []),
}


def _compact_candidates(candidates):
    rows = (candidates or {}).get('candidates',[])
    if isinstance(rows,dict):
        rows = rows.values()
    return {row['candidateId']: {key:row.get(key) for key in ('candidateId','enemyId','family',
        'completeGraphContainsOnlySwitchMode','rejectionReasons')} for row in rows if isinstance(row,dict) and row.get('candidateId')}


def _capability_for_reason(reason):
    code = reason.get('code','')
    if code in ('root-shared-mount-not-closed','root-talent-ambiguous','ability-lifecycle-unsupported',
                'ability-ownership-not-eligible','not-root-shared-active-talent',
                'mode-entry-and-detach-lifecycle-required','complete-ability-fields-not-retained-in-selected-caches'):
        return 'mode-provider-lifecycle'
    if code in ('event-unsupported','buff-lifecycle-or-side-effect-unsupported') or code.startswith('additional-buff-event-lifecycle:'):
        return 'buff-event-lifecycle'
    if code in ('action-unsupported','switch-fields-unsupported','extra-actions-require-full-shared-operators','graph-not-direct-switch-action-lists'):
        return 'complete-buff-actions'
    if code in ('buff-attributes-unsupported','buff-attribute-side-effects'):
        return 'buff-attribute-effects'
    if code in ('initial-mode-not-executable','default-mode-binding-mismatch','mode-index-invalid','mode-actions-uncompiled'):
        return 'mode-action-coverage'
    if code in ('checker-predicate-unsupported','hp-checker-and-detach-lifecycle-not-in-blocked-batch') or code.startswith('hp-checker-'):
        return 'shared-condition-boundaries'
    if code in ('target-scope-not-accepted','target-binding-not-closed','target-binding-missing'):
        return 'provider-target-binding'
    if code == 'no-switch-mode-action-in-complete-bound-graph':
        return 'non-mode-buff-effects'
    return 'remaining-provider-contract'


def pending_provider_capabilities(providers, candidates, already_bound):
    """Group remaining concrete refusals; newer runtime refusals replace old tags."""
    candidates = _compact_candidates(candidates)
    bound_ids = {item.get('providerId') for item in already_bound} | {item.get('chainId') for item in already_bound}
    kinds = {item.get('kind') for item in already_bound}
    hp_supported = ('hp-ratio-toggle-mode' in kinds or providers.get('rule') == 'shared-enemy-mode-providers-v2')
    rejected = {}
    for enemy,groups in providers.get('rejections',{}).items():
        for index,group in enumerate(groups):
            group = group if isinstance(group,dict) else {'reasons':[group]}
            candidate_id = group.get('candidateId',group.get('providerId',f'{enemy}|unresolved:{index}'))
            if candidate_id in bound_ids:
                continue
            reasons = group.get('reasons',[group] if group.get('code') else [])
            rejected[candidate_id] = dict(enemyId=enemy,reasons=[value if isinstance(value,dict) else {'code':str(value)} for value in reasons],source='runtime-report')
    for candidate_id,row in candidates.items():
        if candidate_id not in bound_ids and candidate_id not in rejected:
            reasons = [value if isinstance(value,dict) else {'code':str(value)} for value in row.get('rejectionReasons') or []]
            if hp_supported:
                reasons = [value for value in reasons if value.get('code') != 'hp-checker-and-detach-lifecycle-not-in-blocked-batch']
            if reasons:
                rejected[candidate_id] = dict(enemyId=row['enemyId'],reasons=reasons,source='saved-candidate-table')
    grouped = {}
    for candidate_id,item in rejected.items():
        candidate = candidates.get(candidate_id,{})
        reasons_by_capability = {}
        for reason in item['reasons']:
            reasons_by_capability.setdefault(_capability_for_reason(reason),[]).append(reason)
        for capability,reasons in reasons_by_capability.items():
            request = grouped.setdefault(capability,dict(candidateIDs=set(),affectedEnemyIDs=set(),candidateFamilies=set(),
                rejectionCodes=set(),evidence=[],pureSwitchCandidateIDs=set(),singleCapabilityCandidateIDs=set()))
            request['candidateIDs'].add(candidate_id)
            request['affectedEnemyIDs'].add(item['enemyId'])
            if candidate.get('family'):
                request['candidateFamilies'].add(candidate['family'])
            request['rejectionCodes'].update(reason.get('code','unknown') for reason in reasons)
            request['evidence'].append(dict(candidateId=candidate_id,enemyId=item['enemyId'],source=item['source'],reasons=reasons))
            if candidate.get('completeGraphContainsOnlySwitchMode'):
                request['pureSwitchCandidateIDs'].add(candidate_id)
            if len(reasons_by_capability)==1:
                request['singleCapabilityCandidateIDs'].add(candidate_id)
    requests = []
    for capability,request in grouped.items():
        for key,value in request.items():
            if isinstance(value,set):
                request[key]=sorted(value)
        label,operators = CAPABILITIES[capability]
        request.update(family=capability,label=label,priority='remaining-shared-capability',
            candidateTable=str(PROVIDER_CANDIDATES.relative_to(ROOT)),sourceReport=str(RUNTIME_REPORT.relative_to(ROOT)),
            scope='mode-transition-only',existingContractScope=providers.get('scope',providers.get('boundary')),
            requiredOperators=operators,
            instruction='复用已接provider与完整事件图，只处理本组当前拒绝原因；按共用合同一次实现，不重新研究alreadyBoundProviders，也不删除同敌人的额外动作或其他阶段缺口。',
            acceptance='受影响provider的完整条件、真实目标、动作与生命周期闭合后才接入；部分条件满足不等于整敌阶段完成。')
        requests.append(request)
    priority = list(CAPABILITIES)
    return sorted(requests,key=lambda request:(request['family'] in ('remaining-provider-contract','non-mode-buff-effects'),
        -len(request['pureSwitchCandidateIDs']),-len(request['singleCapabilityCandidateIDs']),
        priority.index(request['family']),-len(request['candidateIDs'])))


def bind_missing_sources(plan):
    state = dict(catalogSha256=plan['inputs']['files'][CATALOG.relative_to(ROOT).as_posix()],
        resolverSha256=digest(Path(buffs.__file__)), source=buffs.source_state())
    old = read(BINDINGS) if BINDINGS.is_file() else None
    if old and old.get('inputs') == state:
        return old, True
    reuse_payloads = bool(old and all(old.get('inputs', {}).get(key) == state[key] for key in ('catalogSha256', 'source')))
    if reuse_payloads:
        # A parameter-rule change does not require fetching the identical full
        # payloads or traversing the frozen source catalog again.
        requests = {key: row['usages'] for key, row in old['templates'].items()}
        sources = {key: {field: row[field] for field in ('payload', 'url', 'payloadSha256')}
                   for key, row in old['templates'].items() if row['status'] == 'matched-pinned-template'}
    else:
        requests = buffs.collect_requests(read(CATALOG))
        sources = buffs.query_templates(requests)
    result = buffs.bind_templates(requests, sources)
    result.update(inputs=state, source=state['source'], sourcePayloadsReused=reuse_payloads)
    write(BINDINGS, result)
    return result, False


def integrate_bindings(plan, bindings):
    state = dict(bindings=bindings['inputs'], integratorSha256=digest(Path(__file__)))
    if plan.get('bindingIntegration') == state:
        return plan
    plan = deepcopy(plan)
    members, enemies = plan['memberIDs'], plan['enemies']
    for row in enemies.values():
        row['requiredOperators'] = sorted({ALIASES.get(op, op) for analysis in row['analyses'].values()
            for op in analysis['sharedOperators']})
        row['missingLinks'] = sorted({gap for analysis in row['analyses'].values() for gap in analysis['missingLinks']})
        row.pop('buffGraphRequestsResolved', None)
        row['deferredOperators'] = []
    for template_key, template in bindings['templates'].items():
        if template['status'] != 'matched-pinned-template':
            continue
        for usage in template['usages']:
            row = enemies[usage['enemyId']]
            operators = set(row['requiredOperators'])
            if template.get('events'):
                operators.add('buff-template-dispatch')
                operators.add('action-sequence-dispatch')
                operators.add('dispatch-ability-lifecycle-event')
            if template.get('switchModeNodes'):
                operators.add('switch-mode')
                operators.add('bind-buff-mode-parameter')
                # Follow the newly available event graph before searching a
                # generic native entity driver again. Other phases remain open.
                if 'resolve-entity-state-mode-call' in operators:
                    row['deferredOperators'] = ['resolve-entity-state-mode-call']
            row['requiredOperators'] = sorted(operators)
    # Retain the original analysis as source history, but replace the obsolete
    # top-level data gap and requests with the concrete remaining runtime work.
    for row in enemies.values():
        graph_requests = [request for analysis in row['analyses'].values()
            for request in analysis.get('nextRequests', []) if request.get('operator') == 'resolve-buff-template-graph']
        if graph_requests:
            joined = all(bindings['templates'].get(request.get('parameters', {}).get('templateKey'), {}).get('status')
                         == 'matched-pinned-template' for request in graph_requests)
            row['buffGraphRequestsResolved'] = joined
            if joined:
                row['missingLinks'] = sorted((set(row['missingLinks']) - {'referenced-template-action-graph-not-in-mode-cache'})
                    | {'buff-event-dispatch-target-scope-and-complete-actions-pending'})
        row['resolvedBuffTemplateKeys'] = sorted(key for key,item in bindings['templates'].items()
            if item['status']=='matched-pinned-template' and any(u['enemyId']==row['enemyId'] for u in item['usages']))
    for op, item in plan['operators'].items():
        ids = [key for key in members if op in enemies[key]['requiredOperators']]
        item.update(memberIDs=ids, encounterIDs=[key for key in ids if enemies[key]['inEncounterPool']],
                    templateIDs=sorted({enemies[key]['primarySubclass'] for key in ids}),
                    activeMemberIDs=[key for key in ids if op not in enemies[key]['deferredOperators']],
                    deferredMemberIDs=[key for key in ids if op in enemies[key]['deferredOperators']])
        item['implementationState'] = 'pending-full-contract'
        if op == 'resolve-buff-template-graph' and ids and all(enemies[key].get('buffGraphRequestsResolved') for key in ids):
            item['implementationState'] = 'source-graphs-joined'
    for item in plan['templates'].values():
        item['sharedOperators'] = sorted({op for key in item['memberIDs'] for op in enemies[key]['requiredOperators']})
        sub = item['subclasses'].get('mode-parameter-buff-template-reference')
        if sub:
            sub['label'] = '模式值有精确 Buff 引用；模板图连接已另表更新，事件与目标执行待接'
    for item in plan['batches'].values():
        item['memberIDs'] = sorted({key for op in item['operatorIDs'] for key in plan['operators'][op]['memberIDs']})
        item['operatorIDs'].sort(key=lambda op: (-len(plan['operators'][op]['encounterIDs']),
            -len(plan['operators'][op]['templateIDs']), -len(plan['operators'][op]['memberIDs']), op))
    plan['counts']['crossClassOperators'] = sum(len(item['templateIDs']) > 1 for item in plan['operators'].values())
    plan['bindingIntegration'] = state
    plan['boundSourceCounts'] = bindings['counts']
    write(PLAN, plan)
    return plan


def integrate_runtime_status(plan, report, candidates=None):
    """Attach saved provider support without closing any other enemy contract."""
    providers = report.get('modeProviders', {})
    pool={key for key,row in plan['enemies'].items() if row.get('inEncounterPool')}
    scoped=scope_runtime_report(report,plan['appearanceScope']['eligibleEnemyIDs']) if plan.get('appearanceScope') else report
    skills = skill_dispatch_status(scoped,pool)
    periodic = periodic_ability_status(scoped,pool)
    state = dict(rule=RUNTIME_OVERLAY_RULE, reportSha256=hashlib.sha256(json.dumps(
        {'modeProviders':providers,'skillDispatch':report.get('skillDispatch',{}),
         'periodicAbilities':report.get('periodicAbilities',{}),
         'environmentDeferrals':skills['environmentDeferralsBySkillID'],'appearanceScope':plan.get('appearanceScope')}, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
        candidateStatusSha256=hashlib.sha256(json.dumps(_compact_candidates(candidates),sort_keys=True,ensure_ascii=False).encode()).hexdigest())
    if plan.get('runtimeIntegration') == state:
        return plan
    plan = deepcopy(plan)
    scope = providers.get('scope', providers.get('boundary'))
    bindings = []
    for enemy, selections in sorted(providers.get('selections', {}).items()):
        if not isinstance(selections, list):
            continue
        for selection in selections:
            binding = dict(enemyId=enemy, providerId=selection.get('id',selection.get('chainId')),
                chainId=selection.get('chainId',selection.get('id')), kind=selection.get('kind'),
                scope=selection.get('scope',selection.get('targetBinding',scope)),
                runtimeScope=scope, templateKeys=selection.get('templateKeys',[]),
                events=list(selection.get('events',{})), sourceRefs=selection.get('sourceRefs',[]))
            bindings.append(binding)
    for enemy,row in plan['enemies'].items():
        row['alreadyBoundProviders'] = [item for item in bindings if item['enemyId']==enemy]
        row['alreadyBoundSkills'] = [item for item in skills['alreadyBoundSkills'] if item['enemyId']==enemy]
        row['pendingSkillIDs'] = skills['pendingSkillIDsByEnemy'].get(enemy,[])
        row['deferredSkillIDs'] = skills['deferredSkillIDsByEnemy'].get(enemy,[])
        row['executablePendingSkillIDs'] = skills['executablePendingSkillIDsByEnemy'].get(enemy,[])
        row['alreadyBoundPeriodicGroups'] = periodic['alreadyBoundGroupsByEnemy'].get(enemy,[])
        # requiredOperators, missingLinks and deferredOperators remain intact:
        # an implemented provider does not close extra actions or other phases.
        row['runtimeProviderRejections'] = deepcopy(providers.get('rejections',{}).get(enemy,[]))
    pending = pending_provider_capabilities(providers,candidates,bindings)
    next_provider = pending[0] if pending else None
    from render_enemy_mode_progress import mode_provider_status
    status = mode_provider_status(report,{key for key,row in plan['enemies'].items() if row.get('inEncounterPool')})
    plan['runtimeSupport'] = dict(rule=providers.get('rule'), runtimeSupportAvailable=bool(bindings),
        scope=scope, alreadyBoundProviders=bindings, boundEnemyIDs=sorted({item['enemyId'] for item in bindings}),
        providerFamilies=status['providerFamilies'],pendingCapabilities=pending,
        skillDispatch=skills,
        periodicAbilities=periodic, alreadyBoundPeriodicGroups=periodic['alreadyBoundGroups'],
        sourceReport=str(RUNTIME_REPORT.relative_to(ROOT)), nextSharedProvider=next_provider,
        fullPhaseTransitionsCompleted=0,
        boundary='These are already supported provider chains, not completed enemy phase contracts or a claim of changes during this refresh.')
    plan['runtimeIntegration'] = state
    return plan


def apply_foundation_priority(plan, priority):
    """Pool foundations outrank non-pool provider candidates, without deletion."""
    runtime=plan.get('runtimeSupport',{})
    candidates=runtime.get('pendingCapabilities',[])
    pool=set(priority.get('encounterPoolIDs',[]))
    candidates=scope_requests(candidates,pool)
    candidate_order=sorted(((i,c) for i,c in enumerate(candidates) if set(c.get('affectedEnemyIDs',[])) & pool),key=lambda pair:(
        not bool(set(pair[1].get('affectedEnemyIDs',[])) & pool),
        -len(set(pair[1].get('affectedEnemyIDs',[])) & pool),pair[0]))
    next_candidate=candidate_order[0][1] if candidate_order else None
    next_task=next_candidate
    for family_id in priority.get('rankedFamilyIDs',[]):
        family=priority['families'][family_id]
        if family.get('dependentEncounterCount',0)<=0:
            continue
        next_task=dict(family=family_id,label=family['label'],priority='garrison-foundation-first',
            scope='garrison-shared-foundation-contract',
            existingContractScope=runtime.get('scope'),
            affectedEnemyIDs=family['dependentEncounterIDs'],
            affectedEncounterEnemyIDs=family['dependentEncounterIDs'],
            dependentEncounterCount=family['dependentEncounterCount'],
            directCandidateEncounterIDs=family.get('directCandidateEncounterIDs',[]),
            candidateIDs=sorted({candidate for request in family.get('boundedCandidateRequests',[]) for candidate in request.get('candidateIDs',[])}),
            alreadyBoundSkills=deepcopy(family.get('alreadyBoundSkills',[])),
            boundEntryPendingSkillIDs=deepcopy(family.get('boundEntryPendingSkillIDs',[])),
            alreadyBoundPeriodicGroups=deepcopy(family.get('alreadyBoundPeriodicGroups',[])),
            pendingSkillIDs=deepcopy(family.get('executablePendingSkillIDs',family.get('pendingSkillIDs',[]))),
            allPendingSkillIDs=deepcopy(family.get('pendingSkillIDs',[])),
            deferredSkillIDs=deepcopy(family.get('deferredSkillIDs',[])),
            executablePendingSkillIDs=deepcopy(family.get('executablePendingSkillIDs',[])),
            requiredOperators=family['requiredOperators'],dependsOn=family['dependsOn'],
            sourcePriority='work/garrison-foundation-priority.json',
            instruction=family['output']+' 优先从池内受影响记录闭合最底层共享合同；技能只推进executablePendingSkillIDs，deferredSkillIDs保留未完成，等真实环境入口后重新开放。复用alreadyBoundPeriodicGroups的完整公共组，不把它们算成新增EnemySkill或整敌完成。非池候选保留为后续复用，已接稳定ID不得重复派工。',
            acceptance='依赖影响人数不是本次可完成数量。按明确合同切片验证完整行为；不得把泛化调用定位当成一个已实现算子，不删除其他未完成能力。')
        break
    marker=dict(rule=priority.get('rule'),contentSha256=priority.get('contentSha256'),
        receipt='work/garrison-foundation-priority.json')
    if (plan.get('foundationPriority')==marker and runtime.get('nextSharedProvider')==next_task
            and runtime.get('nextProviderCandidate')==next_candidate):
        return plan
    plan=deepcopy(plan)
    plan['foundationPriority']=marker
    plan['runtimeSupport']['nextSharedProvider']=deepcopy(next_task)
    plan['runtimeSupport']['nextProviderCandidate']=deepcopy(next_candidate)
    return plan


def prepare_batch(plan, bindings, batch):
    group = plan['batches'][batch]
    selected, resolved_data = [], []
    for op in group['operatorIDs']:
        # Retrieving these graphs is a source task, distinct from evaluating
        # their events, target scope, parameters or sibling actions.
        if op == 'resolve-buff-template-graph' and plan['operators'][op]['implementationState'] == 'source-graphs-joined':
            resolved_data.append(op)
            continue
        selected.append(op)
    source_members = sorted({key for op in selected for key in plan['operators'][op].get('activeMemberIDs', plan['operators'][op]['memberIDs'])})
    pool = set(plan.get('appearanceScope',{}).get('eligibleEnemyIDs',source_members))
    members = sorted(set(source_members) & pool)
    jobs, deferred_jobs = [], []
    runtime = plan.get('runtimeSupport', {})
    skills = runtime.get('skillDispatch',{})
    periodic = runtime.get('periodicAbilities',{})
    for op in selected:
        operator = plan['operators'][op]
        source_affected = operator.get('activeMemberIDs', operator['memberIDs'])
        affected = [eid for eid in source_affected if eid in pool]
        target_jobs = jobs if affected else deferred_jobs
        target_jobs.append(dict(operatorId=op, label=operator['label'], purpose=operator['purpose'],
            affectedEnemyIDs=affected,
            sourceAffectedEnemyIDs=source_affected,
            outOfScopeEnemyIDs=[eid for eid in source_affected if eid not in pool],
            deferredEnemyIDs=[eid for eid in operator.get('deferredMemberIDs', []) if eid in pool], affectedTemplateIDs=operator['templateIDs'],
            alreadyBoundProviders=[item for item in runtime.get('alreadyBoundProviders',[]) if item['enemyId'] in affected],
            alreadyBoundSkills=[item for item in skills.get('alreadyBoundSkills',[]) if item['enemyId'] in affected],
            alreadyBoundPeriodicGroups=[item for item in periodic.get('alreadyBoundGroups',[]) if item['enemyId'] in affected],
            pendingSkillIDs=([skill_id for enemy in affected for skill_id in skills.get('executablePendingSkillIDsByEnemy',skills.get('pendingSkillIDsByEnemy',{})).get(enemy,[])]
                if op=='resolve-enemy-skill-trigger' else []),
            allPendingSkillIDs=([skill_id for enemy in affected for skill_id in skills.get('pendingSkillIDsByEnemy',{}).get(enemy,[])]
                if op=='resolve-enemy-skill-trigger' else []),
            deferredSkillIDs=([skill_id for enemy in affected for skill_id in skills.get('deferredSkillIDsByEnemy',{}).get(enemy,[])]
                if op=='resolve-enemy-skill-trigger' else []),
            sourcePlan=str(PLAN.relative_to(ROOT)), sourceBindings=str(BINDINGS.relative_to(ROOT)),
            runtimeStatus=operator['implementationState'],
            instruction='Read this operator and its affected records from the prepared plan; reuse alreadyBoundProviders, alreadyBoundSkills and alreadyBoundPeriodicGroups without researching those IDs again. Periodic groups are separate complete contracts and do not remove EnemySkill counts or other whole-enemy work. For skill dispatch, work only this job pendingSkillIDs; allPendingSkillIDs retains totals and deferredSkillIDs waits for a real environment entry. Selected skills do not close mode activation or other operators. Implement the remaining shared contract once, preserving unresolved extra actions and other states, then verify representative boundaries and refresh only affected state.'))
    return dict(schemaVersion=1, batch=batch, label=group['label'], dependsOn=group['dependsOn'],
        output=group['output'], acceptance=group['acceptance'], jobs=jobs, memberIDs=members,
        sourceMemberIDs=source_members, deferredOutOfScopeJobs=deferred_jobs,
        appearanceScope=plan.get('appearanceScope'),
        resolvedSourceTasks=resolved_data, bindingsCounts=bindings['counts'],
        runtimeRule=runtime.get('rule'), runtimeSupportAvailable=runtime.get('runtimeSupportAvailable',False),
        runtimeScope=runtime.get('scope'), alreadyBoundProviders=runtime.get('alreadyBoundProviders',[]),
        providerFamilies=runtime.get('providerFamilies',{}),pendingCapabilities=runtime.get('pendingCapabilities',[]),
        skillDispatch=skills,
        periodicAbilities=periodic, alreadyBoundPeriodicGroups=periodic.get('alreadyBoundGroups',[]),
        foundationPriority=plan.get('foundationPriority'),nextProviderCandidate=runtime.get('nextProviderCandidate'),
        nextSharedProvider=runtime.get('nextSharedProvider'), fullPhaseTransitionsCompleted=0,
        boundary='This is an implementation queue, not an executor or scheduled automation. Data linkage does not activate a runtime phase; unresolved sibling actions, target scope and lifecycle stay explicit.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Rebuild the fixed refinement once when its source/rules change')
    parser.add_argument('--batch', choices=['bindings','conditions','actions','lifecycle'], default='bindings',
                        help='Prepare one shared dependency batch; never a per-enemy work queue')
    args = parser.parse_args()
    plan, plan_cached = ensure_plan(args.refresh)
    bindings, bindings_cached = bind_missing_sources(plan)
    plan = integrate_bindings(plan, bindings)
    plan = apply_scope_to_plan(plan,load_scope())
    report = read(RUNTIME_REPORT) if RUNTIME_REPORT.is_file() else {}
    candidates = read(PROVIDER_CANDIDATES) if PROVIDER_CANDIDATES.is_file() else None
    runtime_plan = integrate_runtime_status(plan, report, candidates)
    from prioritize_garrison_foundations import ensure_priority
    priority,priority_cached=ensure_priority(runtime_plan,report)
    runtime_plan=apply_foundation_priority(runtime_plan,priority)
    if runtime_plan is not plan:
        write(PLAN, runtime_plan)
    plan = runtime_plan
    queue = prepare_batch(plan, bindings, args.batch)
    write(QUEUE, queue)
    from render_enemy_mode_progress import render
    render(report)
    result = dict(schemaVersion=1, completed=True, planCacheHit=plan_cached,
        bindingCacheHit=bindings_cached, sourceAnalysisSkipped=plan_cached,
        templateQueriesSkipped=bindings_cached or bindings.get('sourcePayloadsReused', False), dpsCalculationSkipped=True, runtimeRebuildSkipped=True,
        plan=str(PLAN.relative_to(ROOT)), bindings=str(BINDINGS.relative_to(ROOT)), queue=str(QUEUE.relative_to(ROOT)),
        planCounts=plan['counts'], bindingsCounts=bindings['counts'],
        batch=args.batch, operatorJobs=len(queue['jobs']), affectedEnemies=len(queue['memberIDs']),
        runtimeSupportAvailable=queue['runtimeSupportAvailable'], runtimeRule=queue['runtimeRule'],
        alreadyBoundProviders=queue['alreadyBoundProviders'], nextSharedProvider=queue['nextSharedProvider'],
        providerFamilies=queue['providerFamilies'],pendingCapabilities=queue['pendingCapabilities'],
        skillDispatch=queue['skillDispatch'],
        periodicAbilities=queue['periodicAbilities'], alreadyBoundPeriodicGroups=queue['alreadyBoundPeriodicGroups'],
        foundationPriority=queue['foundationPriority'],foundationPriorityCacheHit=priority_cached,
        nextProviderCandidate=queue['nextProviderCandidate'],
        fullPhaseTransitionsCompleted=0)
    write(RECEIPT, result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
