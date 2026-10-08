"""One source scan -> stable enemy action families; later runs reuse the catalog.

This is a work inventory, not a claim of native execution equivalence. It does
not execute upstream code or change combat data. The import report only changes
which cached records are pending. Template progress survives regeneration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from enemy_animation_overlay import load_supplement, merge_animations, supplement_fingerprint
from enemy_attack_capabilities import LABELS as ROOT_LABELS, ROOT_CACHE, load_capabilities
from enemy_prefab_aliases import load_aliases, apply_aliases
from sync_enemy_animation_metadata import load_metadata_supplement

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator"
OUTPUT = ROOT / "work/enemy-action-template-catalog.json"
DOC = ROOT / "docs/generated/enemy-action-templates.md"
REPORT = ROOT / "work/external-combat-import-report.json"
RULE_VERSION = 1
TEMPLATES = {
    "source-prefab": ("补齐源配置", "先按源 prefabKey 复用现有资源，剩余按缺失 key 集合获取同版本 prefab。"),
    "root-action": ("根能力/组合引用", "沿 entity._modes → mode._combat/_attack 解引用，再展开组合能力；区分无普攻单位。"),
    "mode-dispatch": ("多形态动作分派", "模式内动作和受约束出生选择已接；按[固定 7 类模式表](enemy-mode-dispatch.md)补公共触发链。"),
    "projectile-lifecycle": ("弹体结束驱动动作", "统一处理失效回调、动作结束、最短后摇与目标失效。"),
    "projectile-shape": ("多弹体/特殊目的地", "共享齐射、双弹、附加弹和目的地接口；轨迹数据另按缺失集合获取。"),
    "timeline-multihit": ("多段施法与事件", "按能力类型、次数和等待规则编译命中序列；固定间隔、拆分和目标变化分别补公共合同。"),
    "timeline-gating": ("时间模式/延迟门控", "公共调度器消费 preDelay、timeMode、waitForAttackEvent。"),
    "animation-alias": ("逻辑动画名映射", "先应用 prefab._animations 的 animKey → animName/speed，再查 Spine 时间。"),
    "animation-source": ("动画/事件数据缺口", "一次导出缺失动画 ID/事件集合；有映射的先复用，禁止猜击中帧。"),
    "projectile-speed": ("弹体参数数据缺口", "按缺失 projectileKey 批量补速度/运动配置，接入同一弹体执行器。"),
    "shared-basic-contract": ("基础动作合同接线", "已有源字段按根动作接入公共合同；记录覆盖差异，不新增逐敌分支。"),
}
CONTRACT_KEYS = ("_animKey", "_waitForAttackEvent", "_preDelay", "_timeMode", "_atkScale", "_attackType", "_damageType", "_projectileKey", "_waitForProjectileInvalid", "_projectileDestination", "_duoProjectileKey", "_additionalProjectile", "_extraProjectileKeys", "_multiProjectilePerTarget")
SHAPE_KEYS = ("_extraProjectileKeys", "_additionalProjectiles", "_additionalProjectile", "_projectileDestination", "_useMultiAdditionalProjectiles", "_duoProjectileKey", "_multiProjectilePerTarget", "_multiProjectileMountPointTypes", "_isSectorProjectileMovement")
LIFETIME_KEYS = ("_waitForProjectileInvalid", "_fireAttackFinishWhenProjectileInvalid", "_waitForAnimEndWhenProjectileInvalid", "_minPostDelayWhenProjectileInvalid")
HOOK_KEYS = ("_listenUnitRebornEvent", "_finishHandleAbilityAfterReborn", "_buffsRetainedWhenReborn", "_tryRemoveBuffFirstWhenReborn", "_extraRebornDataPresets")


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def refs(value):
    if isinstance(value, dict):
        if value.get("m_PathID"):
            yield value
        else:
            for item in value.values():
                yield from refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from refs(item)


def primary_template(tags):
    if 'fixed-repeat-contract-unresolved' in tags and not any(tag in tags for tag in (
            'prefab-source-absent', 'root-damage-ability-unresolved', 'multiple-modes-different-contract',
            'projectile-lifetime-controls-action', 'projectile-volley-or-destination')):
        return 'timeline-multihit'
    rules = (("prefab-source-absent", "source-prefab"), ("root-damage-ability-unresolved", "root-action"), ("multiple-modes-different-contract", "mode-dispatch"), ("projectile-lifetime-controls-action", "projectile-lifecycle"), ("projectile-volley-or-destination", "projectile-shape"), ("multiple-onattack-events", "timeline-multihit"), ("nondefault-time-gating", "timeline-gating"), ("spine-source-absent", "animation-source"), ("animation-name-unresolved", "animation-source"), ("animation-key-alias", "animation-alias"), ("onattack-event-absent", "animation-source"), ("projectile-speed-absent", "projectile-speed"))
    return next((template for tag, template in rules if tag in tags), "shared-basic-contract")


def extract(enemy_id, prefab, animation, speeds, name, encounter):
    components = prefab.get("components", [])
    by_id = {}
    for component in components:
        by_id.setdefault(component.get("pathID"), []).append(component)

    def resolve(ref, cabin):
        candidates = by_id.get(ref.get("m_PathID"), [])
        same = [c for c in candidates if c.get("cabin") == cabin]
        return same[0] if len(same) == 1 else candidates[0] if len(candidates) == 1 else None

    modes, unresolved = [], []
    for component in components:
        for ref in refs(component.get("fields", {}).get("_modes", [])):
            mode = resolve(ref, component.get("cabin"))
            if mode and mode not in modes:
                modes.append(mode)
            elif not mode:
                unresolved.append(ref)
    roots = []

    def expand(component, seen):
        key = (component.get("cabin"), component.get("pathID"))
        if key in seen:
            return []
        seen.add(key)
        fields = component.get("fields", {})
        result = [component] if "_atkScale" in fields and "_attackType" in fields else []
        for field in ("_abilities", "_extraAbilities", "_wrappedAbilities", "_abilityConfigs"):
            for ref in refs(fields.get(field, [])):
                child = resolve(ref, component.get("cabin"))
                if child:
                    result.extend(expand(child, seen))
                else:
                    unresolved.append(ref)
        return result

    for mode_index, mode in enumerate(modes):
        actions = []
        for field in ("_combat", "_attack"):
            for ref in refs(mode.get("fields", {}).get(field, {})):
                component = resolve(ref, mode.get("cabin"))
                if component:
                    actions.extend(expand(component, set()))
                else:
                    unresolved.append(ref)
        roots.append({"modeIndex": mode_index, "modePathID": mode.get("pathID"), "actions": actions})
    root_actions = {c.get("pathID"): c for mode in roots for c in mode["actions"]}
    all_attacks = [c for c in components if "_atkScale" in c.get("fields", {}) and "_attackType" in c.get("fields", {})]
    candidates = list(root_actions.values()) or all_attacks
    fields = [c.get("fields", {}) for c in candidates]
    anims = animation.get("animations", {})
    aliases = [a for c in components for a in c.get("fields", {}).get("_animations", []) if isinstance(a, dict)]
    alias_map = {}
    for alias in aliases:
        if alias.get("animKey") and alias.get("animName"):
            alias_map.setdefault(alias["animKey"], set()).add(alias["animName"])
    tags, timelines, missing_anims = set(), [], set()
    for action in fields:
        key = action.get("_animKey", "")
        mapped = alias_map.get(key, {key})
        if any(value != key for value in mapped):
            tags.add("animation-key-alias")
        found = {n for value in mapped for n in anims if n == value or n.startswith(value + "_")}
        if not found:
            missing_anims.add(key)
        for anim_name in sorted(found):
            hit_times = [e.get("t") for e in anims[anim_name].get("events", []) if e.get("event") == "OnAttack"]
            timelines.append({"logicalName": key, "sourceName": anim_name, "duration": anims[anim_name].get("duration"), "onAttack": hit_times})
            if len(hit_times) > 1:
                tags.add("multiple-onattack-events")
            if not hit_times:
                tags.add("onattack-event-absent")
    if not components:
        tags.add("prefab-source-absent")
    if not root_actions:
        tags.add("root-damage-ability-unresolved")
    if unresolved:
        tags.add("component-reference-unresolved")
    if not animation:
        tags.add("spine-source-absent")
    if missing_anims:
        tags.add("animation-name-unresolved")
    contracts = [json.dumps(sorted((json.dumps({k: c.get("fields", {}).get(k) for k in CONTRACT_KEYS}, sort_keys=True) for c in mode["actions"])), sort_keys=True) for mode in roots]
    if len(modes) > 1:
        tags.add("multiple-modes-different-contract" if len(set(contracts)) > 1 else "multiple-modes-same-contract")
    extra_attacks = [c for c in all_attacks if c.get("pathID") not in root_actions and str(c.get("fields", {}).get("_animKey", "")).startswith("Attack")]
    if extra_attacks and root_actions:
        tags.add("attack-named-nonroot-ability")
    if any(any(f.get(k) for k in LIFETIME_KEYS) for f in fields):
        tags.add("projectile-lifetime-controls-action")
    if any(any(f.get(k) for k in SHAPE_KEYS) for f in fields):
        tags.add("projectile-volley-or-destination")
    if any(f.get("_timeMode", 0) or f.get("_preDelay", 0) or f.get("_waitForAttackEvent") != 1 for f in fields):
        tags.add("nondefault-time-gating")
    if any(any(c.get("fields", {}).get(k) for k in HOOK_KEYS) for c in components):
        tags.add("reborn-lifecycle-hook-declared")
    projectile_keys = sorted({f.get("_projectileKey") for f in fields if f.get("_projectileKey")})
    missing_speeds = [key for key in projectile_keys if not isinstance(speeds.get(key), (int, float)) or speeds[key] <= 0]
    if missing_speeds:
        tags.add("projectile-speed-absent")
    if len(projectile_keys) > 1:
        tags.add("multiple-projectile-keys")
    primary = primary_template(tags)
    return {"enemyId": enemy_id, "name": name, "inEncounterPool": encounter, "primaryTemplate": primary, "tags": sorted(tags), "evidence": {"prefabPointer": f"/prefabs/{enemy_id}/components", "componentCount": len(components), "modeCount": len(modes), "rootActionCount": len(root_actions), "rootModes": [{"modeIndex": x["modeIndex"], "modePathID": x["modePathID"], "actionPathIDs": [c.get("pathID") for c in x["actions"]]} for x in roots], "actions": [{"pathID": c.get("pathID"), "isResolvedRoot": c.get("pathID") in root_actions, "fields": {k: c.get("fields", {}).get(k) for k in (*CONTRACT_KEYS, *SHAPE_KEYS, *LIFETIME_KEYS) if k in c.get("fields", {})}} for c in candidates], "timelines": timelines, "animationAliases": [x for x in aliases if x.get("animKey") in {f.get("_animKey") for f in fields}], "missingAnimationKeys": sorted(missing_anims), "projectileSpeeds": {k: speeds.get(k) for k in projectile_keys}, "missingProjectileSpeedKeys": missing_speeds, "attackNamedNonrootCount": len(extra_attacks), "unresolvedComponentReferences": unresolved}}


def refresh_animation_evidence(record, animation):
    """Only new animation evidence changes; cached prefab roots stay untouched."""
    evidence = record['evidence']
    tags = set(record['tags']) - {'spine-source-absent', 'animation-name-unresolved',
                                  'animation-key-alias', 'multiple-onattack-events', 'onattack-event-absent'}
    animations = animation.get('animations', {})
    aliases = {}
    for item in evidence['animationAliases']:
        if item.get('animKey') and item.get('animName'):
            aliases.setdefault(item['animKey'], set()).add(item['animName'])
    timelines, missing = [], set()
    for action in evidence['actions']:
        key = action['fields'].get('_animKey', '')
        names = aliases.get(key, {key})
        if any(name != key for name in names):
            tags.add('animation-key-alias')
        found = {name for prefix in names for name in animations if name == prefix or name.startswith(prefix + '_')}
        if not found:
            missing.add(key)
        for name in sorted(found):
            data = animations[name]
            hits = [e['t'] for e in data.get('events', []) if e.get('event') == 'OnAttack']
            timelines.append(dict(logicalName=key, sourceName=name, duration=data.get('duration'), onAttack=hits))
            if len(hits) > 1:
                tags.add('multiple-onattack-events')
            if not hits:
                tags.add('onattack-event-absent')
    if not animations:
        tags.add('spine-source-absent')
    if missing:
        tags.add('animation-name-unresolved')
    evidence.update(timelines=timelines, missingAnimationKeys=sorted(missing))
    record.update(tags=sorted(tags), primaryTemplate=primary_template(tags))


def refresh_prefab_alias_evidence(catalog, prefabs, animations, speeds, mapping, fingerprint):
    """Only re-extract records whose previously missing resource became known."""
    if catalog.get('prefabAliasHash') == fingerprint:
        return 0
    changed = set(mapping) | set(catalog.get('prefabAliases', {}))
    count = 0
    for enemy_id in sorted(changed & catalog['enemies'].keys()):
        row = catalog['enemies'][enemy_id]
        updated = extract(enemy_id, prefabs.get(enemy_id, {}), animations.get(enemy_id, {}),
                          speeds, row['name'], row['inEncounterPool'])
        resource_key = mapping.get(enemy_id, enemy_id)
        updated['evidence']['prefabPointer'] = f'/prefabs/{resource_key}/components'
        updated['evidence']['prefabResourceKey'] = resource_key
        row.update(updated)
        count += 1
    catalog['prefabAliasHash'] = fingerprint
    catalog['prefabAliases'] = mapping
    return count


def render(catalog):
    lines = ["# 敌人动作公共模板表", "", "由 `tools/classify_enemy_action_templates.py` 生成；后续以本表及 JSON 目录推进公共执行器，不重新逐敌阅读。原始输入哈希不变时只刷新导入状态和模板进度。", "", f"本次分类快照记录 **{catalog['counts']['pendingEnemies']}** 个敌人带缺口，其中当时定义的卫戍池 **{catalog['counts']['pendingEncounterEnemies']}** 个；共归入 **{catalog['counts']['populatedTemplates']}** 个公共主类。标签可重叠，主类每敌唯一。", "", "这是冻结分类快照，后续实现与出场范围变化未必已刷新到本表。**当前数量以[当前计划](../plan.md)及 `work/external-combat-import-report.json` 为准**；不要把本表的历史定义池数量当作当前实际出场池待办数。", "", "范围：这是既有普攻动作导入报告的缺口分类，不是所有敌人技能完整性的审计。主类是实施推断；字段、引用和动画事件为所下载社区提取快照中的观察，不据此宣称原生行为已验证。", "", "| 优先级 | 模板 | 未消费敌人 | 卫戍池 | 模板进度 | 公共处理方式 |", "|---|---|---:|---:|---|---|"]
    for row in catalog["templates"]:
        lines.append(f"| {row['priority']} | `{row['id']}` {row['label']} | {row['pendingCount']} | {row['encounterPendingCount']} | {row['implementationStatus']} | {row['executor']} |")
    if catalog.get('attackCapabilities'):
        counts = catalog['attackCapabilities']
        lines += ['', f"源表明确无需普攻 **{counts['notApplicableEnemies']}** 个（卫戍池 **{counts['notApplicableEncounterEnemies']}** 个），已接入通用普攻开关，单独记为不适用。它们的技能、被动、召唤和阶段仍按各专题推进，不算整敌完成。"]
    if catalog.get('rootFamilies'):
        lines += ['', '## 根能力固定分表', '',
                  '源字段只提取一次，后续随导入状态刷新待办数。`_combat` 与 `_attack` 分开保留；无普攻由数据库显式 NONE 判定，不由属性为零或动画名称推测。非伤害根仍可能通过 Buff 或动作节点执行机制。', '',
                  '| 根能力类别 | 固定集合 | 当前普攻缺口 | 卫戍池缺口 |', '| --- | ---: | ---: | ---: |']
        for row in catalog['rootFamilies']:
            lines.append(f"| `{row['id']}` {ROOT_LABELS[row['id']]} | {row['total']} | {row['pending']} | {row['encounterPending']} |")
        lines += ['', '字段、节点类型、Buff 引用和各模式通道均保存在 [根能力目录](../../work/enemy-root-capability-catalog.json)。动画或基类字段不足以确认自定义实现为空，继续作为明确缺口保留。']
    lines += ["", "## 一次抽样记录", "", "代表由卫戍池优先、标签覆盖优先固定选取；下列摘要直接来自已缓存字段。用于审查同类边界，不代表逐敌运行验收。", ""]
    for row in catalog["templates"]:
        if not row["representatives"]:
            continue
        lines.append(f"- **{row['label']}**：")
        for enemy_id in row["representatives"]:
            item = catalog["enemies"][enemy_id]
            evidence = item["evidence"]
            animations = "; ".join(f"{t['logicalName']}→{t['sourceName']} OnAttack={t['onAttack']}" for t in evidence["timelines"][:2]) or "未取得可匹配 OnAttack 时间线"
            lines.append(f"  - `{enemy_id}` {item['name']}：模式 {evidence['modeCount']}，根伤害能力 {evidence['rootActionCount']}；{animations}。标签：{', '.join(item['tags']) or '基础合同待接线'}。")
    lines += ["", "## 重叠标签", "", "| 标签 | 当前缺口敌人数 |", "|---|---:|"]
    lines += [f"| `{key}` | {count} |" for key, count in catalog["counts"]["pendingTags"].items()]
    lines += ["", "## 批量推进约定", "", "1. 按卫戍池覆盖排序实现公共模板；每类只验代表、边界和总覆盖计数。", "2. 一个敌人可有多个标签；解决主类后由剩余标签继续跟踪，不能将整敌宣告完成。", "3. `root-action` 包含组合根、无常规伤害动作和待解析引用，不能全部当作缺技能；`animation-source` 是数据补齐任务。", "4. `attack-named-nonroot-ability` 仅说明 Attack 名动作不在已解出的根普攻集合，不能仅靠名称当普攻。", "5. 源快照没有完整弹体运动曲线，本表只观察目的地/多弹体标志；曲线缺失按 projectileKey 集合取数。", "6. 运行 `python tools/classify_enemy_action_templates.py` 重用缓存；用 `--status 模板ID=状态` 更新模板进度。状态保存在 JSON，重建时保留。", "", "## 来源", "", f"- [Tim23333/Arknights_timer 固定提交](https://github.com/Tim23333/Arknights_timer/tree/{catalog['source']['commit']}/Ark_emulator/ark_emulator)，源目录 {catalog['counts']['sourcePrefabs']} 个 prefab。", "- `work/external-combat-import-report.json` 提供当前未消费状态，`web/enemy_encounters.json` 提供卫戍优先池。", "- `work/enemy-action-template-catalog.json` 保存全体条目的稳定主类、多标签、字段摘要、引用、来源 SHA-256 和人工模板进度。", ""]
    DOC.parent.mkdir(parents=True, exist_ok=True)
    DOC.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--status", action="append", default=[], metavar="TEMPLATE=STATUS")
    args = parser.parse_args()
    source_files = [args.source / name for name in ("data_enemy_prefab_catalog_current.json", "data_enemy_spine_events.json", "data_projectile_speeds.json")]
    source_files += [ROOT / "web/battle_data.json", ROOT / "web/enemy_encounters.json"]
    hashes = {str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p): digest(p) for p in source_files}
    old = read(OUTPUT) if OUTPUT.exists() else {}
    report = read(REPORT)
    cached = old.get("sourceHashes") == hashes and old.get("ruleVersion") == RULE_VERSION
    supplement = load_supplement()
    supplement_hash = supplement_fingerprint(supplement)
    metadata_supplement = load_metadata_supplement()
    metadata_hash = supplement_fingerprint(metadata_supplement)
    capabilities, _ = load_capabilities()
    aliases, alias_hash = load_aliases(hashes, capabilities['source']['sha256'], supplement_hash)
    refreshed_animations = 0
    refreshed_prefabs = 0
    if cached:
        catalog = old
        if (catalog.get('animationSupplementHash') != supplement_hash
                or catalog.get('animationMetadataSupplementHash') != metadata_hash):
            animations, merge = merge_animations(read(source_files[1]), supplement)
            animations, metadata_merge = merge_animations(animations, metadata_supplement)
            changed = set(metadata_merge['affectedEnemyIds']) | set(catalog.get('animationMetadataSupplementAffected', []))
            if catalog.get('animationSupplementHash') != supplement_hash:
                changed |= set(merge['affectedEnemyIds']) | set(catalog.get('animationSupplementAffected', []))
            _, animations, _ = apply_aliases({}, animations, aliases)
            changed |= {key for key, source in aliases.items() if source in changed}
            for key in sorted(changed & catalog['enemies'].keys()):
                refresh_animation_evidence(catalog['enemies'][key], animations.get(key, {}))
                refreshed_animations += 1
            catalog['animationSupplementAffected'] = merge['affectedEnemyIds']
            catalog['animationMetadataSupplementAffected'] = metadata_merge['affectedEnemyIds']
        if catalog.get('prefabAliasHash') != alias_hash:
            prefabs = read(source_files[0])['prefabs']
            animations, _ = merge_animations(read(source_files[1]), supplement)
            animations, _ = merge_animations(animations, metadata_supplement)
            prefabs, animations, _ = apply_aliases(prefabs, animations, aliases)
            refreshed_prefabs = refresh_prefab_alias_evidence(catalog, prefabs, animations,
                read(source_files[2]), aliases, alias_hash)
    else:
        prefabs, animations, speeds, battle, encounters = [read(p) for p in source_files]
        animations, merge = merge_animations(animations, supplement)
        animations, metadata_merge = merge_animations(animations, metadata_supplement)
        merged_prefabs, animations, _ = apply_aliases(prefabs['prefabs'], animations, aliases)
        live, encounter_pool = battle["enemies"], encounters["enemies"]
        enemies = {enemy_id: extract(enemy_id, merged_prefabs.get(enemy_id, {}), animations.get(enemy_id, {}), speeds, encounter_pool.get(enemy_id, live.get(enemy_id, {})).get("name", ""), enemy_id in encounter_pool) for enemy_id in sorted(set(live) | set(encounter_pool))}
        catalog = {"schemaVersion": 1, "ruleVersion": RULE_VERSION, "source": report["source"], "sourceHashes": hashes, "classificationEvidence": "Source-field observations; executor classification is inferred, not a native-behavior certification.", "counts": {"sourcePrefabs": len(prefabs["prefabs"]), "catalogEnemies": len(enemies)}, "enemies": enemies}
        catalog['animationSupplementAffected'] = merge['affectedEnemyIds']
        catalog['animationMetadataSupplementAffected'] = metadata_merge['affectedEnemyIds']
        for enemy_id, resource_key in aliases.items():
            if enemy_id in enemies:
                enemies[enemy_id]['evidence'].update(prefabResourceKey=resource_key,
                    prefabPointer=f'/prefabs/{resource_key}/components')
        catalog.update(prefabAliases=aliases, prefabAliasHash=alias_hash)
    catalog['animationSupplementHash'] = supplement_hash
    catalog['animationSupplementSource'] = supplement.get('source', {})
    catalog['animationMetadataSupplementHash'] = metadata_hash
    catalog['animationMetadataSupplementSource'] = metadata_supplement.get('source', {})
    statuses = {t["id"]: t.get("implementationStatus", "未接入") for t in old.get("templates", [])}
    for value in args.status:
        key, status = value.split("=", 1)
        if key not in TEMPLATES:
            parser.error(f"unknown template: {key}")
        statuses[key] = status
    pending = report["gaps"]
    unknown = set(pending) - set(catalog["enemies"])
    if unknown:
        raise ValueError(f"Import report contains IDs outside source catalog: {sorted(unknown)}")
    for enemy_id, row in catalog["enemies"].items():
        row["importStatus"] = ("not-applicable-basic-attack" if enemy_id in report.get('attackCapabilities', {}).get('notApplicable', {}) else
                               "partial-or-unconsumed" if enemy_id in pending else "no-gap-in-current-basic-import-report")
        row["importGaps"] = pending.get(enemy_id, [])
        tags = set(row['tags']) - {'fixed-repeat-contract-unresolved'}
        repeats = report.get('hitSequences', {}).get('unresolved', {}).get(enemy_id)
        if repeats and enemy_id in pending:
            tags.add('fixed-repeat-contract-unresolved')
            row['evidence']['unresolvedHitSequences'] = repeats
        else:
            row['evidence'].pop('unresolvedHitSequences', None)
        row.update(tags=sorted(tags), primaryTemplate=primary_template(tags))
    not_applicable = report.get('attackCapabilities', {}).get('notApplicable', {})
    catalog['attackCapabilities'] = dict(notApplicableEnemies=len(not_applicable),
        notApplicableEncounterEnemies=sum(catalog['enemies'][k]['inEncounterPool'] for k in not_applicable))
    if ROOT_CACHE.is_file():
        root_catalog = read(ROOT_CACHE)
        catalog['rootFamilies'] = []
        for key in ROOT_LABELS:
            members = [r for r in root_catalog['enemies'].values() if r['family'] == key]
            if members:
                catalog['rootFamilies'].append(dict(id=key, total=len(members),
                    pending=sum(r['enemyId'] in pending for r in members),
                    encounterPending=sum(r['inEncounterPool'] and r['enemyId'] in pending for r in members)))
    rows = []
    for key, (label, executor) in TEMPLATES.items():
        members = [r for r in catalog["enemies"].values() if r["primaryTemplate"] == key and r["enemyId"] in pending]
        representatives = sorted(members, key=lambda r: (-int(r["inEncounterPool"]), -len(r["tags"]), r["enemyId"]))[:2]
        rows.append({"id": key, "label": label, "executor": executor, "pendingCount": len(members), "encounterPendingCount": sum(r["inEncounterPool"] for r in members), "implementationStatus": statuses.get(key, "未接入"), "representatives": [r["enemyId"] for r in representatives]})
    rows.sort(key=lambda r: (-r["encounterPendingCount"], -r["pendingCount"], r["id"]))
    for index, row in enumerate(rows, 1):
        row["priority"] = index
    catalog["templates"] = rows
    catalog["statusSourceSha256"] = digest(REPORT)
    catalog["counts"].update({"pendingEnemies": len(pending), "pendingEncounterEnemies": sum(catalog["enemies"][key]["inEncounterPool"] for key in pending), "populatedTemplates": sum(row["pendingCount"] > 0 for row in rows), "pendingTags": dict(Counter(tag for key in pending for tag in catalog["enemies"][key]["tags"]).most_common())})
    assert sum(row["pendingCount"] for row in rows) == len(pending)
    assert all(row["primaryTemplate"] in TEMPLATES for row in catalog["enemies"].values())
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    render(catalog)
    print(json.dumps({"cacheHit": cached, "refreshedAnimationRows": refreshed_animations,
                     "refreshedPrefabRows": refreshed_prefabs, "pendingEnemies": len(pending), "pendingEncounterEnemies": catalog["counts"]["pendingEncounterEnemies"], "templates": [{k: t[k] for k in ("id", "pendingCount", "encounterPendingCount")} for t in rows]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
