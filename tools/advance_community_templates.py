"""Advance the frozen skill-template queue only when calculation inputs change."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
DIRECTORY = PARENT / 'data/derived/community-templates'
REPORT = PARENT / 'work/community-dps-coverage.json'
RECEIPT = ROOT / 'work/community-template-advance.json'
VERSION = 1


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(path):
    path = Path(path)
    if not path.is_file():
        return None
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def source_manifest(source=None):
    # Read source metadata only. Reopening SQLite would verify/reload every source
    # table even for a cache hit, despite no gameplay input having changed.
    registry = read(PARENT / 'data/sources.json')
    selected = source or os.environ.get('ARKRESEARCH_SOURCE') or registry.get('active')
    if selected not in registry.get('sources', {}):
        raise ValueError('没有可用的当前数据来源；请先运行父 tools/resources.py list。')
    return read(PARENT / 'data/manifests' / (selected + '.json'))


def input_state(manifest):
    core = PARENT / 'apps/dps'
    paths = [core / name for name in ('community_templates.cjs', 'community_bridge.cjs',
        'community_compat.cjs', 'community_engine.py', 'reference_formula_engine.py',
        'simulation_data.py', 'original_simulation.py')]
    paths += [PARENT / 'tools/community_dps.py', DIRECTORY / 'existing-formula-links.json']
    paths += sorted((core / 'vendor/akdata').glob('*.js'))
    paths += sorted((core / 'vendor/akdata').glob('*.json'))
    reference = Path(os.environ.get('ARK_DPS_REFERENCE_SOURCE', str(
        ROOT / 'work/external-dps-search/WhoAteMyCQQkie__ArknightsDpsCompare')))
    paths += [reference / name for name in ('Database/JsonReader.py', 'damagecalc/damage_formulas.py',
        'damagecalc/healing_formulas.py', 'damagecalc/utils.py')]
    # The selected interpreter is also relevant when a previously absent optional
    # formula dependency becomes available. No numpy import or formula execution.
    paths += [PARENT / '.venv/Lib/site-packages/numpy/__init__.py']
    paths += [DIRECTORY / 'input-snapshot.json', DIRECTORY / 'bindings.json']
    files = {str(path): digest(path) for path in paths}
    state = dict(source_id=manifest['source_id'],
        source_tables={key: value['sha256'] for key, value in manifest['tables'].items()}, files=files)
    compilation = dict(snapshot=files[str(DIRECTORY / 'input-snapshot.json')],
        compiler=files[str(core / 'community_templates.cjs')],
        default_operators=files[str(core / 'vendor/akdata/attributes.js')])
    return state, signature(compilation), paths


def refresh_cached_status(report):
    # Call the classifier's cache-refresh functions directly: no source reread,
    # no reclassification, no new representative selection.
    sys.path[:0] = [str(PARENT / 'src'), str(PARENT / 'apps/dps')]
    spec = importlib.util.spec_from_file_location('cached_template_classifier', PARENT / 'tools/classify_community_templates.py')
    classifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(classifier)
    catalog = read(DIRECTORY / 'catalog.json')
    if classifier.sync_formula_links(catalog, DIRECTORY):
        write(DIRECTORY / 'catalog.json', catalog)
    status = classifier.refresh_status(catalog, report)
    write(DIRECTORY / 'status.json', status)
    (DIRECTORY / 'README.md').write_text(classifier.render_markdown(catalog, status), encoding='utf-8')
    return {'cached': True, 'reclassified': False, 'remaining': status['remaining'], 'counts': status['counts']}


def refresh_integration_summary(receipt):
    target = ROOT / 'work/community-batch-integration.json'
    report = read(REPORT)
    combat_path = ROOT / 'work/external-combat-import-report.json'
    combat = read(combat_path) if combat_path.is_file() else {}
    from render_enemy_mode_progress import render as render_modes, mode_provider_status
    from enemy_skill_dispatch_status import skill_dispatch_status
    from enemy_periodic_ability_status import periodic_ability_status
    from garrison_encounter_scope import load_scope
    render_modes(combat)
    pool = set(load_scope()['eligibleEnemyIDs'])
    providers = mode_provider_status(combat,pool)
    skills = skill_dispatch_status(combat,pool)
    periodic = periodic_ability_status(combat,pool)
    status = read(DIRECTORY / 'status.json')
    total = len(report['results'])
    calculated = report['counts'].get('calculated', 0)
    cohort_size = sum(status['counts'].values())
    lines = ['# 当前批量覆盖', '',
        '由快速入口从已有回执刷新；当前数量只在本表维护，历史批次说明不替代实时状态。', '',
        '全源覆盖与卫戍出场范围分列；属性目录和未确认悬赏声明不计入卫戍优先范围。敌方子队列看[基础优先表](garrison-foundations.md)，项目顺序回到[当前计划](../plan.md)；全源剩余数量不是当前卫戍待办。', '',
        '| 消费者 | 当前覆盖 |', '| --- | --- |',
        f'| DPS | {calculated}/{total} 可计算；全部未可算 {total-calculated} |',
        f'| {cohort_size} 槽固定队列 | 已接通 {cohort_size-status["remaining"]}，剩 {status["remaining"]}；主类保持冻结 |',
        f'| 事件模拟与社区补缺 | 事件模拟 {report["coverage"]["event_simulation"]}；社区净补 {report["coverage"]["community_fills"]} |']
    counts = combat.get('counts', {})
    if counts:
        lines += [f'| 共享动作资料（全源） | {counts["profiles"]} 敌人配置、{counts["timings"]} 时序、{counts["projectileSpeeds"]} 弹速 |',
                  f'| 卫戍遭遇池 | {counts["encounterProfiles"]} 配置、{counts["encounterTimings"]} 时序、{counts["encounterProjectileSpeeds"]} 弹速 |']
        if 'nonAttackingEnemies' in counts:
            lines += [f'| 无普攻源配置 | {counts["nonAttackingEnemies"]} 敌人（卫戍池 {counts["encounterNonAttackingEnemies"]}）；已接通用开关，技能和被动另计 |',
                      f'| 仍需补齐的普通动作 | {counts["pendingEnemies"]} 敌人（卫戍池 {counts["pendingEncounterEnemies"]}）带缺口 |']
        if counts.get('aliasPrefabs'):
            lines += [f'| 源 prefabKey 资源映射 | 补入 {counts["aliasPrefabs"]} 份缺失配置、{counts["aliasAnimations"]} 个动画名称；保留敌人原 ID 和数值 |']
        if counts.get('channelProfiles'):
            lines += [f'| 普攻通道分派 | {counts["channelProfiles"]} 敌人（卫戍池 {counts["encounterChannelProfiles"]}）；每个通道必须在所有模式下合同一致 |']
        if counts.get('eventGateTimings'):
            lines += [f'| 攻击事件门控 | {counts["eventGateTimings"]} 敌人（卫戍池 {counts["encounterEventGateTimings"]}）；不叠加配置预延迟 |']
        if counts.get('hitSequenceProfiles'):
            lines += [f'| 按能力类型选择攻击事件 | {counts["hitSequenceProfiles"]} 敌人（卫戍池 {counts["encounterHitSequenceProfiles"]}），其中 {counts["multiHitProfiles"]} 个固定连击；不直接把所有动画事件当伤害 |']
        if counts.get('chainProjectileProfiles'):
            lines += [f'| 链式弹体与完成回调 | {counts["chainProjectileProfiles"]} 敌人（卫戍池 {counts["encounterChainProjectileProfiles"]}）；逐跳伤害/元素衰减，等待弹体结束，其他天赋另计 |']
        if skills['candidateSkillIDs']:
            sc=skills['counts']
            lines += [f'| EnemySkill SP与施放调度（全源） | 已接 {sc["selectedSkills"]}/{sc["candidates"]} 个冻结技能组件，覆盖 {sc["selectedEnemies"]} 敌'
                f'（卫戍池 {sc["encounterSelectedEnemies"]}）；剩余 {sc["pendingSkills"]} 组件，其中入口未启用暂缓 {sc["deferredSkills"]}、其他待接 {sc["executablePendingSkills"]}；卫戍派工另按基础优先表，模式自动激活及其他能力另计 |']
        if periodic['alreadyBoundGroups']:
            pc=periodic['counts']
            lines += [f'| 周期 Buff 与直接能力公共组 | 独立已接 {pc["groups"]} 组 / {pc["enemies"]} 敌（卫戍池 {pc["encounterEnemies"]}）；'
                f'{pc["capabilityKinds"]} 类能力、{pc["capabilityBindings"]} 处组内绑定；不抵扣 EnemySkill 未完成数量，不计整敌完成 |']
        if counts.get('modeProfileEnemies'):
            lines += [f'| 独立模式内动作 | {counts["modeProfileEnemies"]} 敌人、{counts["modeProfiles"]} 套模式（卫戍池 {counts["encounterModeProfileEnemies"]} 敌人）；伤害/弹体/空通道独立消费 |',
                      f'| 出生模式自动选择 | {counts.get("initialModeProfiles", 0)} 敌人（卫戍池 {counts.get("encounterInitialModeProfiles", 0)}）；完整组件目录无有效默认覆盖时采用原生索引 0，自动事件链另计 |']
        if combat.get('modeProviders') or 'autoModeProviderEnemies' in counts:
            lines += [f'| 自动条件 Buff 模式链 | {providers["autoModeProviders"]} 条链、{providers["autoModeProviderEnemies"]} 敌人'
                      f'（卫戍池 {providers["encounterAutoModeProviderEnemies"]}）；已接条件→Buff→模式事件，整敌完整阶段合同验收 {providers["fullPhaseTransitionsCompleted"]} |']
            for family in providers['providerFamilies'].values():
                encounter = family['encounterEnemies']
                encounter_text = f'（卫戍池 {encounter}）' if encounter is not None else ''
                lines += [f'| 自动链家族：{family["label"]} | {family["providers"]} 条链、{family["enemies"]} 敌人{encounter_text}；家族成员可重叠 |']
    mode_advance_path = ROOT / 'work/enemy-mode-template-advance.json'
    mode_advance = read(mode_advance_path) if mode_advance_path.is_file() else {}
    if mode_advance.get('completed'):
        plan_counts, bound_counts = mode_advance['planCounts'], mode_advance['bindingsCounts']
        lines += [f'| 七类模式合同 | {plan_counts["templates"]} 类、{plan_counts["subclasses"]} 个交叉子类、{plan_counts["operators"]} 个公共算子；按共享依赖统一推进 |',
                  f'| 模式 Buff 源图连接 | {bound_counts["matchedTemplates"]}/{bound_counts["requestedTemplates"]} 模板、{bound_counts["usages"]} 处引用、{bound_counts["affectedEnemies"]} 敌人；图数据已接回，阶段运行另计 |']
    animation_merge = combat.get('animationSupplement', {})
    animation_counts = animation_merge.get('metadataCounts', {})
    if animation_counts.get('supplementEnemies'):
        lines += [f'| 补充动画源 | {animation_counts["supplementEnemies"]} 敌人、{animation_counts["supplementAnimations"]} 动画；实际补入 {animation_merge["addedAnimations"]} 个缺失动画名称 |']
    metadata_merge = combat.get('animationMetadataSupplement', {})
    if metadata_merge.get('addedAnimations'):
        lines += [f'| 显式模型资源映射补源 | 新增 {metadata_merge["addedAnimations"]} 个动画名称，其中 {metadata_merge["addedEnemies"]} 个敌人此前没有动画记录；复用固定元数据和缓存 |']
    lines += ['', 'DPS 执行路径：' + '；'.join(f'{key} {value}' for key, value in report['families'].items()) + '。',
        '', '未可算状态：' + '；'.join(f'{key} {value}' for key, value in report['counts'].items() if key != 'calculated') + '。',
        '', '[DPS 回执](../../../work/community-dps-coverage.json) · [敌人回执](../../work/external-combat-import-report.json)',
        '', '[技能固定表](../../../data/derived/community-templates/README.md) · [敌人固定表](enemy-action-templates.md) · [卫戍基础优先级](garrison-foundations.md) · [当前计划](../plan.md)',
        '', '统计表示对应模型下可运行/可消费，不是原版行为正确率；不同模型不相加重复计算。', '']
    page = ROOT / 'docs/generated/community-coverage.md'
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text('\n'.join(lines), encoding='utf-8')
    if not target.is_file():
        return
    integrated = read(target)
    integrated['dps'] = dict(counts=report['counts'], scope=report['scope'],
        coverage=report['coverage'], families=report['families'],
        gapCounts=dict(Counter(row.get('reason', row['status']) for row in report['results']
                              if row['status'] != 'calculated')))
    if combat:
        integrated['webCombat'] = dict(counts=combat['counts'], gapCounts=combat['gapCounts'])
    if mode_advance:
        integrated['enemyModeTemplates'] = dict(planCounts=mode_advance['planCounts'], bindingsCounts=mode_advance['bindingsCounts'],
            receipt=str(mode_advance_path.relative_to(ROOT)),
            runtimeSupportAvailable=providers['runtimeSupportAvailable'], runtimeRule=providers['runtimeRule'],
            autoModeProviderEnemies=providers['autoModeProviderEnemies'], autoModeProviders=providers['autoModeProviders'],
            encounterAutoModeProviderEnemies=providers['encounterAutoModeProviderEnemies'],
            providerFamilies=providers['providerFamilies'],
            skillDispatch=skills,
            periodicAbilities=periodic, alreadyBoundPeriodicGroups=periodic['alreadyBoundGroups'],
            fullPhaseTransitionsCompleted=mode_advance.get('fullPhaseTransitionsCompleted', providers['fullPhaseTransitionsCompleted']),
            nextSharedProvider=mode_advance.get('nextSharedProvider'),
            runtimeStatusSource='work/external-combat-import-report.json#modeProviders',
            runtimeStatusMeaning='Saved provider selections describe currently available runtime support, not a code change in this refresh.')
    integrated['templateAdvance'] = dict(receipt=str(RECEIPT.relative_to(ROOT)),
        updatedAt=receipt['finished_at'], remaining=receipt['remaining'],
        note='Summary refreshed from saved calculation/import receipts; earlier steps remain historical.')
    write(target, integrated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', help='Use this existing data source; default: active source')
    parser.add_argument('--dry-run', action='store_true', help='Print planned actions without writing or executing them')
    parser.add_argument('--force-evaluate', action='store_true', help='Evaluate unresolved slots even if all inputs are unchanged')
    parser.add_argument('--full-dps', action='store_true', help='Explicit full DPS regression, including previously successful slots')
    parser.add_argument('--slots', type=Path, help='JSON list of affected charId:skillIndex slots; retain all other successful/failed receipt rows')
    args = parser.parse_args()
    if args.slots and args.full_dps:
        parser.error('--slots cannot be combined with --full-dps')
    python_path = PARENT / '.venv/Scripts/python.exe'
    python = str(python_path) if python_path.is_file() else sys.executable
    node = os.environ.get('ARK_DPS_NODE') or shutil.which('node')
    manifest = source_manifest(args.source)
    for filename in ('input-snapshot.json', 'catalog.json'):
        if not (DIRECTORY / filename).is_file():
            raise SystemExit('缺少冻结模板目录。请先运行父 tools/classify_community_templates.py 建立一次输入和分类。')
    snapshot = read(DIRECTORY / 'input-snapshot.json')
    expected = snapshot['origin']
    tables_match = all(manifest['tables'].get(key, {}).get('sha256') == value
                       for key, value in expected['source_tables'].items())
    if expected['source_id'] != manifest['source_id'] or not tables_match:
        raise SystemExit('当前来源与冻结队列不一致，未复用旧报告或修改队列。请先为新源初始化覆盖报告，'
            '再显式运行父 tools/classify_community_templates.py --source <新源> --rebuild 建立新队列。')
    report = read(REPORT) if REPORT.is_file() else None
    same_report = bool(report and report.get('source_id') == manifest['source_id'])
    if args.slots and not same_report:
        parser.error('--slots requires an existing same-source coverage receipt')
    state, compile_key, paths = input_state(manifest)
    state_key = signature(state)
    old = read(RECEIPT) if RECEIPT.is_file() else {}
    bindings = read(DIRECTORY / 'bindings.json') if (DIRECTORY / 'bindings.json').is_file() else {}
    binding_matches = bindings.get('origin_hash') == snapshot['origin_hash']
    latest_input = max((path.stat().st_mtime_ns for path in paths if path.is_file()), default=0)
    # A completed same-source report newer than every calculation input can seed
    # the cache after a manually completed batch; do not repeat that batch merely
    # because this fast-entry receipt is being introduced for the first time.
    bootstrap = bool(not old and same_report and binding_matches and report.get('evaluation')
                     and REPORT.stat().st_mtime_ns >= latest_input)
    cached = bool(old.get('completed') and old.get('state_key') == state_key and same_report)
    compile_needed = not binding_matches or (not bootstrap and old.get('compile_key') != compile_key)
    evaluate = bool(args.slots or args.full_dps or args.force_evaluate or not (cached or bootstrap) or compile_needed)
    command = [python, 'tools/community_dps.py', 'coverage', '--source', manifest['source_id'], '--output', str(REPORT)]
    if same_report and not args.full_dps:
        command.append('--pending-only')
    if args.slots:
        command.extend(['--slots', str(args.slots.resolve())])
    actions = []
    if compile_needed:
        if not node:
            raise SystemExit('编译模板需要 Node.js；请安装或设置 ARK_DPS_NODE。')
        actions.append(dict(name='compile', cwd=str(PARENT), command=[node, 'apps/dps/community_templates.cjs',
            'compile', str(DIRECTORY / 'input-snapshot.json')]))
    if evaluate:
        actions.append(dict(name='evaluate', cwd=str(PARENT), command=command))
    actions.append(dict(name='refresh-status', cached=True, reclassify=False))
    receipt = dict(schema_version=VERSION, completed=False, source_id=manifest['source_id'],
        cache_initialized_from_report=bootstrap, calculation_skipped=not evaluate, compile_skipped=not compile_needed,
        actions=actions, state_key=state_key, compile_key=compile_key, inputs=state)
    if args.dry_run:
        print(json.dumps(dict(dry_run=True, **{k:v for k,v in receipt.items() if k != 'inputs'}), ensure_ascii=False, indent=2))
        return
    write(RECEIPT, receipt)
    for action in actions:
        if action['name'] == 'refresh-status':
            current = read(REPORT)
            if current.get('source_id') != manifest['source_id']:
                raise SystemExit('覆盖报告来源不一致，未刷新冻结队列状态。')
            action['result'] = refresh_cached_status(current)
        else:
            result = subprocess.run(action['command'], cwd=action['cwd'], text=True, encoding='utf-8',
                capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
            action.update(returncode=result.returncode, output=result.stdout.strip())
            if result.stdout:
                print(result.stdout.strip(), flush=True)
            if result.returncode:
                action['error'] = result.stderr[-3000:]
                write(RECEIPT, receipt)
                raise SystemExit(result.stderr or f"{action['name']} failed: {result.returncode}")
    state, compile_key, _ = input_state(manifest)
    receipt.update(completed=True, state_key=signature(state), inputs=state, compile_key=compile_key,
        report_sha256=digest(REPORT), finished_at=datetime.now(timezone.utc).isoformat(),
        remaining=actions[-1]['result']['remaining'])
    write(RECEIPT, receipt)
    refresh_integration_summary(receipt)
    print(json.dumps(dict(receipt=str(RECEIPT), initialized=bootstrap, compile_skipped=not compile_needed,
        calculation_skipped=not evaluate, remaining=receipt['remaining']), ensure_ascii=False))


if __name__ == '__main__':
    main()
