"""Plan whole trigger chains from frozen mode/ownership records, without I/O.

The planner never activates an enemy or executes a partial action sequence.
PPtr edges, eligible same-GameObject attachments and exact names are retained as
different evidence kinds. Name matches and ownership alone do not prove events.
"""
from collections import Counter, defaultdict, deque
from copy import deepcopy
import re

RULE = "enemy-mode-trigger-plan-v1"
SUBCLASSES = {
    "root-switch-with-followup-actions": "模式根入口含切换与后续动作，必须整体执行",
    "root-switch-explicit-owner": "模式根入口可定位且目标明确为能力归属者",
    "switch-action-context-unresolved": "切换节点存在，但激活/事件上下文未闭合",
    "switch-target-context-unresolved": "切换目标为SOURCE/TARGET等动态上下文",
    "switch-default-or-blackboard-target": "切换需活动默认模式或黑板目标",
    "switch-conditional-action-tree": "条件动作树包含多个切换/终结分支",
    "hp-checker-linked-toggle": "HP检查器通过显式引用连接toggle组件",
    "hp-checker-without-toggle-consumer": "HP检查器存在但缺已定位toggle消费者",
    "hp-toggle-named-ability-chain": "HP检查器经Buff的能力名进入后续能力候选",
    "toggle-buff-template-consumer-needed": "toggle参数/Buff键已知，仍缺模板执行消费者",
    "toggle-state-predicate-linked": "Buff/阻挡/异常/地块状态检查器已显式连接",
    "toggle-no-mode-link-observed": "toggle输出已定位，但尚无到模式切换的实证连接",
    "named-action-target-unresolved": "动作或Buff声明能力名但目标能力未唯一闭合",
    "named-ability-object-group-located": "具名技能/天赋对象及附属组件整组可定位",
    "ownership-gated-action-attachment": "同GameObject附属动作连接可定位，事件语义仍需消费",
}

NODE_OPERATORS = {
    "SwitchMode": "switch-mode",
    "TriggerEnemySkill": "trigger-enemy-skill",
    "TriggerAbility": "trigger-named-ability",
    "IfElse": "conditional-action-tree",
    "CheckUnitCurrentMode": "check-current-mode",
    "InstantKill": "terminal-kill-action",
    "FinishBuffsById": "finish-buff-by-id",
    "AlwaysNext": "action-sequence-control",
}
PREDICATES = {
    "HpRatioToggleChecker": "hp-ratio-checker",
    "FilterBuffToggleChecker": "buff-presence-checker",
    "BlockedToggleChecker": "blocked-state-checker",
    "AbnormalFlagsToggleChecker": "abnormal-state-checker",
    "RootTileBuildableMaskToggleChecker": "tile-mask-checker",
    "AdvancedCompoundToggleChecker": "compound-state-checker",
}
OPERATORS = {
    "switch-mode": {"label": "切换模式", "purpose": "消费明确目标/默认模式/黑板模式并应用FSM重启策略"},
    "trigger-enemy-skill": {"label": "触发敌人技能", "purpose": "按技能名、归属、可用性和中断策略执行切换后的完整后续动作"},
    "trigger-named-ability": {"label": "触发具名能力", "purpose": "绑定能力名、owner、当前模式和激活条件"},
    "named-ability-resolution": {"label": "具名能力解析", "purpose": "区分明确metadata别名和层级名字候选，保留同名歧义"},
    "mode-entry-dispatch": {"label": "模式入口分派", "purpose": "从当前模式的combat/attack/general入口绑定动作"},
    "action-sequence-dispatch": {"label": "完整动作序列", "purpose": "保留顺序、分支及后续动作，不只执行切换节点"},
    "conditional-action-tree": {"label": "条件动作树", "purpose": "原样分派成功/失败分支，保留嵌套条件"},
    "check-current-mode": {"label": "检查当前模式", "purpose": "按源目标上下文检查模式索引或黑板键"},
    "terminal-kill-action": {"label": "终结击倒动作", "purpose": "保留跳过复活等终结参数，不降级为一次普通切换"},
    "finish-buff-by-id": {"label": "结束指定Buff", "purpose": "消费来源筛选、层数、override更新等生命周期参数"},
    "action-sequence-control": {"label": "动作序列控制", "purpose": "保留AlwaysNext等执行流节点"},
    "hp-ratio-checker": {"label": "生命比例检查", "purpose": "消费上下限、开闭边界、一次性/初态/恢复延迟及动态阈值"},
    "buff-presence-checker": {"label": "Buff存在检查", "purpose": "按Buff键与取反规则维护toggle条件"},
    "blocked-state-checker": {"label": "阻挡状态检查", "purpose": "消费最小/最大阻挡数和归属规则"},
    "abnormal-state-checker": {"label": "异常状态检查", "purpose": "按异常标记/组合及禁用策略维护toggle状态"},
    "tile-mask-checker": {"label": "地块掩码检查", "purpose": "按根地块可建造类型控制开关"},
    "compound-state-checker": {"label": "复合状态检查", "purpose": "合并攻击/受击/移动/复活等禁用条件与恢复延迟"},
    "state-toggle-checker": {"label": "状态检查器", "purpose": "保留暂未细分检查器的源条件合同"},
    "toggle-buff-lifecycle": {"label": "Toggle与Buff生命周期", "purpose": "处理inverse、on/off输出、detach与unmanaged Buff"},
    "buff-template-dispatch": {"label": "Buff模板消费", "purpose": "从已知templateKey+黑板取得真实动作消费者"},
    "ability-component-event-binding": {"label": "组件与能力事件接线", "purpose": "同对象附属组件通过实际事件而非名称猜测连接"},
    "action-change-motion-mode": {"label": "改变运动模式", "purpose": "完整执行动作链中的运动模式变化"},
    "action-check-unit-alive": {"label": "检查实体存活", "purpose": "保留存活条件及条件分支"},
    "action-play-audio": {"label": "播放音频动作", "purpose": "保留完整动作序列中的音频节点及次序"},
    "action-release-from-blocker": {"label": "解除阻挡关系", "purpose": "执行切换附带的阻挡关系解除"},
    "action-set-body-direction": {"label": "改变实体方向", "purpose": "消费方向来源、黑板与面向策略"},
}
EXECUTION_EDGE_FIELDS = {
    "_abilities", "_extraAbilities", "_wrappedAbilities", "_ability", "_checker",
    "_trigger", "_attack", "_combat", "_attackTrigger", "_generalAbilities",
    "_commonAbilities", "_activeAbility", "_passiveAbility",
}


def _short(value):
    return str(value or "").split(",")[0].rsplit("+", 1)[-1].rsplit(".", 1)[-1]


def _walk(value, path="", guards=()):
    if isinstance(value, dict):
        if "$type" in value:
            yield path, value, list(guards)
        for key, child in value.items():
            nested = guards
            if key in ("_succeedNodes", "_failNodes") and "_conditionNode" in value:
                nested = (*guards, {"branch": key, "condition": deepcopy(value["_conditionNode"])})
            yield from _walk(child, path + "/" + str(key), nested)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, path + "/" + str(index), guards)


def _configs(value, path=""):
    if isinstance(value, dict):
        if "buffKey" in value and ("templateKey" in value or "blackboard" in value):
            yield path, value
            return
        for key, child in value.items():
            yield from _configs(child, path + "/" + str(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _configs(child, path + "/" + str(index))


def _unique(items):
    import json
    seen, output = set(), []
    for item in items:
        key = json.dumps(item, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            seen.add(key)
            output.append(item)
    return output


class _Context:
    def __init__(self, record, ownership):
        self.record = record
        self.components = record.get("components", {})
        self.ownership = (ownership or {}).get("components", {})
        self.entries = record.get("entrypoints", [])
        self.edges = defaultdict(list)
        self.incoming = defaultdict(list)
        for edge in record.get("references", []):
            if edge.get("status") != "resolved" or not edge.get("targetComponentKey"):
                continue
            self.incoming[edge["targetComponentKey"]].append(edge)
            head = edge.get("fieldPath", "").split("/")[1:2]
            if head and head[0] in EXECUTION_EDGE_FIELDS:
                self.edges[edge["sourceComponentKey"]].append(edge)
        self.names = defaultdict(list)
        self.same_objects = defaultdict(list)
        for key, component in self.components.items():
            fields = component.get("fields", {})
            alias = fields.get("_metadata", {}).get("namedAsAlias")
            if alias:
                self.names[alias].append({"componentKey": key, "kind": "metadata-alias", "fieldPath": "/_metadata/namedAsAlias"})
            own = self.ownership.get(key, {})
            if own.get("ownershipOverlayEligible") and own.get("gameObjectPathID"):
                self.same_objects[str(own["gameObjectPathID"])].append(key)
                ancestors = own.get("ancestorGameObjects", [])
                if ancestors and ancestors[0].get("name") and ("Abilities." in str(component.get("scriptType"))
                        or _short(component.get("scriptType")) in ("EnemySkill", "Talent")):
                    self.names[ancestors[0]["name"]].append({"componentKey": key, "kind": "eligible-gameobject-name",
                                                           "gameObjectPathID": own["gameObjectPathID"]})
        self.operators, self.missing, self.subclasses = set(), set(), set()
        self.requests, self.source_refs = [], []

    def need(self, code, *, component=None, path=None, values=None):
        self.missing.add(code)
        request = {"kind": code}
        if component is not None:
            request["componentKey"] = component
        if path is not None:
            request["fieldPath"] = path
        if values is not None:
            request["values"] = deepcopy(values)
        self.requests.append(request)

    def source(self, component, path="/fields"):
        self.source_refs.append({"componentKey": component, "fieldPath": path})

    def entry_paths(self, target):
        found = []
        for index, entry in enumerate(self.entries):
            start = entry.get("targetComponentKey")
            if entry.get("status") != "resolved" or not start:
                continue
            queue = deque([(start, [])])
            visited = set()
            while queue:
                node, path = queue.popleft()
                if node in visited:
                    continue
                visited.add(node)
                if node == target:
                    found.append({"entrypointIndex": index, "entrypoint": deepcopy(entry), "edges": deepcopy(path),
                                  "status": "explicit-reference-path", "activationProven": False})
                    break
                for edge in self.edges.get(node, []):
                    queue.append((edge["targetComponentKey"], path + [edge]))
        return found

    def ownership_detail(self, key):
        own = self.ownership.get(key, {})
        return {name: deepcopy(own.get(name)) for name in (
            "status", "ownershipOverlayEligible", "gameObjectPathID", "modeIndicesFromAncestorGameObjects",
            "structuralLocation", "ancestorGameObjects")}

    def component_closure(self, roots):
        """Keep referenced ability/checker children; do not assume group scheduling."""
        queue, visited = deque(roots), set()
        while queue:
            key = queue.popleft()
            if key in visited or key not in self.components:
                continue
            visited.add(key)
            queue.extend(edge["targetComponentKey"] for edge in self.edges.get(key, []))
        return visited

    def component_payloads(self, keys):
        result = []
        for key in sorted(set(keys)):
            component = self.components.get(key)
            if component is None:
                continue
            self.source(key)
            result.append({"componentKey": key, "scriptType": component.get("scriptType"),
                           "fields": deepcopy(component.get("fields", {})),
                           "executionReferences": deepcopy(self.edges.get(key, [])),
                           "ownership": self.ownership_detail(key)})
        return result

    def attachments(self, key):
        own = self.ownership.get(key, {})
        if not own.get("ownershipOverlayEligible"):
            return []
        matches = self.same_objects.get(str(own.get("gameObjectPathID")), [])
        return [{"componentKey": other, "relationship": "same-eligible-gameobject",
                 "eventBindingProven": False, "scriptType": self.components[other].get("scriptType")}
                for other in matches if other != key and "Abilities." in str(self.components[other].get("scriptType"))]

    def named(self, name, key, path):
        candidates = _unique(self.names.get(name, []))
        aliases = sorted({row["componentKey"] for row in candidates if row["kind"] == "metadata-alias"})
        targets = sorted({row["componentKey"] for row in candidates})
        objects = sorted({str(row["gameObjectPathID"]) for row in candidates if row.get("gameObjectPathID")})
        status = ("unique-metadata-alias" if len(aliases) == 1 else "unique-named-object-group" if len(objects) == 1
                  else "name-candidates-only" if candidates else "name-not-in-cached-components")
        self.operators.add("named-ability-resolution")
        # Even a unique alias still requires owner/current-mode/activation rules.
        if status == "unique-named-object-group":
            self.subclasses.add("named-ability-object-group-located")
            self.need("named-target-activation-contract", component=key, path=path,
                      values={"name": name, "gameObjectPathID": objects[0]})
        elif status != "unique-metadata-alias":
            self.subclasses.add("named-action-target-unresolved")
            self.need("named-ability-owner-and-activation", component=key, path=path,
                      values={"name": name, "candidates": targets})
        groups = []
        for obj in objects:
            group = []
            for member_key in self.same_objects[obj]:
                component = self.components[member_key]
                group.append({"componentKey": member_key, "scriptType": component.get("scriptType"),
                              "fields": deepcopy(component.get("fields", {})),
                              "serializedGraphs": deepcopy(component.get("serializedGraphs", []))})
                self.source(member_key)
            groups.append({"gameObjectPathID": obj, "components": group,
                           "boundary": "Complete eligible cached object membership; event ordering and active ownership remain separate"})
        return {"name": name, "status": status, "candidates": candidates, "objectGroups": groups,
                "runtimeActivationProven": False, "sourceComponentKey": key, "fieldPath": path}

    def action_groups(self, keys):
        groups = []
        for key in sorted(set(keys)):
            component = self.components.get(key, {})
            for graph in component.get("serializedGraphs", []):
                path = graph.get("path", "")
                nodes = graph.get("nodes")
                self.source(key, path)
                flattened = []
                if nodes is None:
                    self.need("serialized-action-graph-unavailable", component=key, path=path)
                for node_path, node, guards in _walk(nodes, path + "{json}"):
                    kind = _short(node.get("$type"))
                    self.operators.add(NODE_OPERATORS.get(kind, "action-" + re.sub(r"(?<!^)(?=[A-Z])", "-", kind).lower()))
                    flat = {"path": node_path, "type": kind, "guards": guards}
                    if kind in ("TriggerAbility", "TriggerEnemySkill"):
                        name = node.get("_abilityName") or node.get("_skillName")
                        flat["namedTarget"] = self.named(name, key, node_path) if name else {"status": "dynamic-name"}
                    flattened.append(flat)
                groups.append({"componentKey": key, "fieldPath": path,
                               "scriptType": component.get("scriptType"),
                               "eventFields": {k: deepcopy(v) for k, v in component.get("fields", {}).items()
                                               if k in ("_runActionOnEvent", "_onlyRunOnce", "_preDelay", "_timeMode", "_waitForAttackEvent")},
                               "sequence": deepcopy(nodes), "nodeIndex": flattened,
                               "order": "source order inside each list; branches retained; cross-component event order not inferred",
                               "partialExecutionAllowed": False})
        return groups


def _target(context, node, key, path):
    fields = node.get("fields", node)
    scope = fields.get("_targetType")
    target = {"scope": scope, "rawModeIndex": fields.get("_modeIndex"),
              "restoreDefault": bool(fields.get("_restoreDefault")),
              "loadFromBlackboard": bool(fields.get("_loadModeFromBlackboard")),
              "restartFSM": fields.get("_restartFSM"), "candidateModes": []}
    if target["restoreDefault"] or target["loadFromBlackboard"]:
        context.subclasses.add("switch-default-or-blackboard-target")
        context.need("active-default-or-mode-blackboard-value", component=key, path=path,
                     values={k: v for k, v in fields.items() if "mode" in k.lower() or "default" in k.lower()})
        target["status"] = "runtime-mode-value-required"
    elif scope != "ABILITY_OWNER":
        context.subclasses.add("switch-target-context-unresolved")
        context.need("action-target-entity-binding", component=key, path=path, values={"targetType": scope})
        target["status"] = "dynamic-target-not-assumed-owner"
    else:
        mode = fields.get("_modeIndex")
        target["candidateModes"] = [{"entityComponentKey": m.get("entityComponentKey"), "modeIndex": m.get("modeIndex"),
                                     "targetComponentKey": m.get("targetComponentKey"), "status": m.get("status")}
                                    for m in context.record.get("modes", []) if m.get("modeIndex") == mode]
        valid = [m for m in target["candidateModes"] if m["status"] == "resolved"]
        target["status"] = "unique-owner-mode-reference" if len(valid) == 1 else "owner-mode-reference-unresolved"
        if len(valid) != 1:
            context.need("owner-mode-reference", component=key, path=path, values={"modeIndex": mode})
    return target


def _buff_outputs(context, key, component):
    outputs = []
    for path, buff in _configs(component.get("fields", {})):
        board = {item.get("key"): item for item in buff.get("blackboard", []) or [] if isinstance(item, dict)}
        output = {"componentKey": key, "fieldPath": path, "fields": deepcopy(buff), "namedTargets": [],
                  "modeArguments": [deepcopy(item) for name, item in board.items() if name and "mode" in name.lower()]}
        for name in ("ability_name", "skill_name"):
            item = board.get(name)
            if item and item.get("valueStr"):
                output["namedTargets"].append(context.named(item["valueStr"], key, path + "/blackboard/" + name))
        template = buff.get("templateKey", "")
        if template and template != "empty":
            context.need("buff-template-action-consumer", component=key, path=path,
                         values={"templateKey": template, "buffKey": buff.get("buffKey"), "blackboard": deepcopy(buff.get("blackboard", []))})
            context.operators.add("buff-template-dispatch")
        if output["modeArguments"]:
            context.need("mode-parameter-consumer", component=key, path=path,
                         values={"templateKey": template, "modeArguments": output["modeArguments"]})
        outputs.append(output)
        context.source(key, path)
    return outputs


def analyze_triggers(record, ownership=None):
    """Return a JSON-ready, non-mutating plan for switch/HP/state trigger classes."""
    context = _Context(record, ownership)
    switches = record.get("switchNodes", [])
    hp = record.get("hpToggleCheckers", [])
    toggles = record.get("otherToggleComponents", [])
    selected = {r["componentKey"] for r in switches + hp + toggles}
    details, chains = [], []
    for key in sorted(selected):
        component = context.components.get(key, {})
        details.append({"componentKey": key, "scriptType": component.get("scriptType"),
                        "fields": deepcopy(component.get("fields", {})), "ownership": context.ownership_detail(key),
                        "entryPaths": context.entry_paths(key), "attachments": context.attachments(key)})
        context.source(key)

    for key in sorted({r["componentKey"] for r in switches}):
        entries = context.entry_paths(key)
        related = context.attachments(key)
        siblings = [row["componentKey"] for row in related]
        action_keys = context.component_closure([key, *siblings])
        groups = context.action_groups(action_keys)
        targets = [_target(context, node, key, node.get("fieldPath")) for node in switches if node["componentKey"] == key]
        direct = [item for item in entries if not item["edges"] and item["entrypoint"].get("kind") == "mode-field"]
        followups = any(len(group.get("sequence") or []) > 1 for group in groups if group["componentKey"] == key)
        if direct and any(t["status"] == "unique-owner-mode-reference" for t in targets):
            context.subclasses.add("root-switch-with-followup-actions" if followups else "root-switch-explicit-owner")
            context.operators.update(("mode-entry-dispatch", "action-sequence-dispatch"))
        else:
            context.subclasses.add("switch-action-context-unresolved")
            context.need("action-activation-and-event-binding", component=key,
                         values={"entryPathCount": len(entries), "event": context.components.get(key, {}).get("fields", {}).get("_runActionOnEvent")})
        if related:
            context.subclasses.add("ownership-gated-action-attachment")
            context.operators.add("ability-component-event-binding")
        if any(row["type"] == "IfElse" for group in groups for row in group["nodeIndex"]):
            context.subclasses.add("switch-conditional-action-tree")
        context.need("whole-action-chain-runtime", component=key,
                     values={"operators": sorted({row["type"] for group in groups for row in group["nodeIndex"]}),
                             "partialExecutionAllowed": False})
        chains.append({"kind": "switch-action-chain", "componentKey": key, "entryPaths": entries,
                       "attachedComponents": related, "relatedComponentPayloads": context.component_payloads(action_keys),
                       "actionGroups": groups, "modeTargets": targets,
                       "orderingBoundary": "Never execute SwitchMode while dropping following TriggerEnemySkill or sibling actions",
                       "implementationReady": False})

    checker_keys = {r["componentKey"] for r in hp}
    checker_keys.update(r["componentKey"] for r in toggles if "Checker" in str(r.get("scriptType")))
    for checker_key in sorted(checker_keys):
        checker = context.components.get(checker_key, {})
        kind = _short(checker.get("scriptType"))
        context.operators.add(PREDICATES.get(kind, "state-toggle-checker"))
        consumers = [edge for edge in context.incoming.get(checker_key, []) if edge.get("fieldPath") == "/_checker"]
        if kind == "HpRatioToggleChecker":
            context.subclasses.add("hp-checker-linked-toggle" if consumers else "hp-checker-without-toggle-consumer")
            if checker.get("fields", {}).get("_loadMinHpRatioFromBlackboard"):
                context.need("hp-checker-blackboard-threshold", component=checker_key,
                             values=checker.get("fields", {}))
        else:
            context.subclasses.add("toggle-state-predicate-linked")
        if not consumers:
            context.need("checker-toggle-consumer", component=checker_key)
        for edge in consumers:
            key = edge["sourceComponentKey"]
            component = context.components.get(key, {})
            entries = context.entry_paths(key)
            outputs = _buff_outputs(context, key, component)
            attached = context.attachments(key)
            named_targets = [target for output in outputs for target in output["namedTargets"]]
            named_keys = {candidate["componentKey"] for target in named_targets for candidate in target["candidates"]}
            # Candidate name targets remain explicitly labelled; never upgraded
            # to an event edge merely because the object is in this prefab.
            action_keys = {key, *(r["componentKey"] for r in attached), *named_keys}
            for named_key in list(named_keys):
                action_keys.update(r["componentKey"] for r in context.attachments(named_key))
            action_keys = context.component_closure(action_keys)
            groups = context.action_groups(action_keys)
            has_switch = any(n["type"] == "SwitchMode" for g in groups for n in g["nodeIndex"])
            if kind == "HpRatioToggleChecker" and named_targets:
                context.subclasses.add("hp-toggle-named-ability-chain")
            if outputs:
                context.subclasses.add("toggle-buff-template-consumer-needed")
            if not has_switch:
                context.subclasses.add("toggle-no-mode-link-observed")
                context.need("toggle-output-to-mode-operation", component=key,
                             values={"buffKeys": [v["fields"].get("buffKey") for v in outputs], "namedTargets": [v["name"] for v in named_targets]})
            if not entries:
                context.need("toggle-activation-entrypoint", component=key)
            if attached:
                context.subclasses.add("ownership-gated-action-attachment")
            context.operators.update(("toggle-buff-lifecycle", "ability-component-event-binding"))
            chains.append({"kind": "hp-toggle-chain" if kind == "HpRatioToggleChecker" else "state-toggle-chain",
                           "componentKey": key, "entryPaths": entries, "checkerReference": deepcopy(edge),
                           "checker": {"componentKey": checker_key, "scriptType": checker.get("scriptType"),
                                       "predicateFields": deepcopy(checker.get("fields", {}))},
                           "toggleFields": {name: deepcopy(value) for name, value in component.get("fields", {}).items()
                                            if name in ("_isInverseToggle", "_setToggleFalseOnDetached", "_interruptAbilityOnDetach")},
                           "buffOutputs": outputs, "attachedComponents": attached, "namedTargets": named_targets,
                           "relatedComponentPayloads": context.component_payloads(action_keys),
                           "actionGroups": groups, "modeSwitchNodesObserved": has_switch,
                           "implementationReady": False})
    # A toggle with a missing/null checker must still appear in the plan.
    linked_consumers = {chain["componentKey"] for chain in chains if chain["kind"].endswith("toggle-chain")}
    for row in toggles:
        key = row["componentKey"]
        if "Toggleable" in str(row.get("scriptType")) and key not in linked_consumers:
            context.need("checker-reference-unresolved", component=key, values=row.get("fields", {}).get("_checker"))
            chains.append({"kind": "toggle-checker-unresolved", "componentKey": key,
                           "entryPaths": context.entry_paths(key), "buffOutputs": _buff_outputs(context, key, context.components.get(key, {})),
                           "implementationReady": False})

    return {"schemaVersion": 1, "rule": RULE, "enemyId": record.get("enemyId"), "applicable": bool(selected),
            "subclasses": sorted(context.subclasses), "sourceRefs": _unique(context.source_refs),
            "sharedOperators": sorted(context.operators), "missingLinks": sorted(context.missing),
            "nextRequests": _unique(context.requests), "components": details, "chains": chains,
            "counts": {"components": len(details), "switchNodes": len(switches), "hpCheckers": len(hp),
                       "chains": len(chains), "chainKinds": dict(Counter(c["kind"] for c in chains))},
            "implementationReady": False,
            "boundary": "Cached structural planning only; no implied phase chronology, numeric event-enum meaning, target ownership, or partial runtime support"}
