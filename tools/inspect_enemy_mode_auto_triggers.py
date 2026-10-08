"""Join only the frozen mode plan, Buff bindings and ownership for auto triggers.

This is a candidate compiler, not a source inventory or a runtime support claim.
Unchanged inputs reuse the emitted file; rejected complete graphs stay reviewable.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULE = "enemy-mode-auto-trigger-candidates-v1"
INPUTS = {
    "plan": ROOT / "work/enemy-mode-template-plan.json",
    "bindings": ROOT / "work/enemy-mode-buff-bindings.json",
    "ownership": ROOT / "work/enemy-mode-ownership-overlay.json",
}
OUTPUT = ROOT / "work/enemy-mode-auto-trigger-candidates.json"
SWITCH_TYPE = "Torappu.Battle.Action.Nodes+SwitchMode, Assembly-CSharp"
FAMILIES = {
    "blocked-toggle": "阻挡状态驱动的被动 Buff",
    "hp-ratio-toggle": "生命比例驱动的被动 Buff",
    "mode-passive": "模式子树中的被动 Buff",
}


def walk(value, path=""):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from walk(child, path + "/" + str(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + "/" + str(index))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _short(script):
    return script.rsplit(".", 1)[-1]


def _source(cache, eid, path, component=None):
    result = {"cache": cache, "enemyId": eid, "fieldPath": path}
    if component:
        result["componentKey"] = component
    return result


def _ownership_details(own, component_key):
    component = deepcopy(own.get("components", {}).get(component_key, {}))
    ancestors = component.get("ancestorGameObjects", [])
    activity = []
    for ancestor in ancestors:
        go = own.get("gameObjects", {}).get(str(ancestor["pathID"]), {})
        activity.append({**ancestor, "activeSelf": go.get("activeSelf")})
    shared_ids = own.get("rootSharedTalentAndSkillPathIDs", [])
    talents = [deepcopy(value) for key, value in own.get("talentAndSkillComponents", {}).items()
               if str(key) in shared_ids and
               value.get("gameObjectPathID") == component.get("gameObjectPathID")]
    initial = deepcopy(own.get("initialModeZeroEvidence", {}))
    modes = component.get("modeIndicesFromAncestorGameObjects", [])
    structurally_active = (component.get("ownershipOverlayEligible") is True
                           and component.get("jpEnabled") == 1
                           and bool(activity)
                           and all(a["activeSelf"] is True for a in activity))
    return {
        "component": component,
        "modeIndices": modes,
        "ancestorActivity": activity,
        "sameGameObjectRootSharedTalents": talents,
        "initialModeEvidence": initial,
        "mountedInInitialMode": bool(structurally_active and initial.get("candidate")
                                     and (not modes or initial.get("modeIndex") in modes)),
        "initialModeExecutable": None,
        "initialModeExecutionBoundary": "Mounting and default-index evidence are available; caller must join its compiled executable modes.",
        "rootSharedTalentMount": bool(structurally_active and not modes and talents),
    }


def _candidate(eid, enemy, own, component_key, family, chain, payload, usages, bindings):
    fields = deepcopy(payload.get("fields")) if payload else None
    owner = _ownership_details(own, component_key)
    reasons, side_effects = [], []
    if fields is None:
        reasons.append("complete-ability-fields-not-retained-in-selected-caches")
    if not owner["component"].get("ownershipOverlayEligible"):
        reasons.append("ability-ownership-not-eligible")
    checker = deepcopy(chain.get("checker")) if chain else None
    checker_key = checker.get("componentKey") if checker else None
    checker_owner = deepcopy(own.get("components", {}).get(checker_key, {}))
    if checker and not checker_owner.get("ownershipOverlayEligible"):
        reasons.append("checker-ownership-not-eligible")
    if not owner["initialModeEvidence"].get("candidate"):
        reasons.append("initial-default-mode-not-closed")
    if family == "mode-passive":
        reasons.append("mode-entry-and-detach-lifecycle-required")
    if family == "hp-ratio-toggle":
        reasons.append("hp-checker-and-detach-lifecycle-not-in-blocked-batch")
    buff_inputs = []
    if fields is not None:
        for field in ("_buffs", "_unmanagedBuffsWhenToggleOn", "_buffsWhenToggleOff"):
            for index, buff in enumerate(fields.get(field, [])):
                buff_inputs.append((f"/{field}/{index}", deepcopy(buff), True))
    else:
        # Keep the exact available fragment. Never manufacture missing declarations.
        buff_inputs = [(u["fieldPath"].removesuffix("/templateKey"),
                        {"templateKey": key, "blackboard": deepcopy(u.get("blackboard", []))}, False)
                       for key, u in usages]
    graphs = []
    has_switch = False
    only_switch = bool(buff_inputs)
    for field_path, buff, complete in buff_inputs:
        key = buff.get("templateKey", "")
        binding = bindings.get("templates", {}).get(key, {})
        graph = deepcopy(binding.get("payload"))
        graph_reasons = []
        if binding.get("status") != "matched-pinned-template" or not graph:
            graph_reasons.append("template-graph-not-bound")
            only_switch = False
        events = graph.get("eventToActions", {}) if graph else {}
        nodes = [{"fieldPath": path, "fields": node}
                 for path, node in walk(events, "/eventToActions") if "$type" in node]
        switches = [node for node in nodes if node["fields"]["$type"] == SWITCH_TYPE]
        other_nodes = [node for node in nodes if node["fields"]["$type"] != SWITCH_TYPE]
        has_switch = has_switch or bool(switches)
        if not switches or other_nodes:
            only_switch = False
        if other_nodes:
            graph_reasons.append("extra-actions-require-full-shared-operators")
            side_effects.append({"fieldPath": field_path, "kind": "additional-actions", "actions": other_nodes})
        # Pure means direct ordered SwitchMode lists, with no hidden untyped wrapper.
        if any(not isinstance(actions, list) or
               any(not isinstance(a, dict) or a.get("$type") != SWITCH_TYPE for a in actions)
               for actions in events.values()):
            only_switch = False
            graph_reasons.append("graph-not-direct-switch-action-lists")
        for event in events:
            if event not in ("ON_BUFF_START", "ON_BUFF_FINISH"):
                graph_reasons.append("additional-buff-event-lifecycle:" + event)
        attrs = {k: deepcopy(v) for k, v in buff.get("attributes", {}).items() if v}
        if attrs:
            side_effects.append({"fieldPath": field_path + "/attributes", "kind": "attributes", "fields": attrs})
            graph_reasons.append("buff-attribute-side-effects")
        if graph and (graph.get("effectKey") or graph.get("onEventPriority") not in (None, "DEFAULT")):
            side_effects.append({"fieldPath": field_path, "kind": "template-effect-or-priority",
                                 "effectKey": graph.get("effectKey"), "onEventPriority": graph.get("onEventPriority")})
            graph_reasons.append("template-effect-or-priority-side-effect")
        reasons.extend(graph_reasons)
        graphs.append({
            "fieldPath": field_path, "declarationComplete": complete, "fields": buff,
            "templateKey": key, "bindingStatus": binding.get("status", "not-in-bindings"),
            "payload": graph, "url": binding.get("url"), "payloadSha256": binding.get("payloadSha256"),
            "events": deepcopy(binding.get("events", [])), "switchActions": switches,
            "additionalActions": other_nodes, "rejectionReasons": graph_reasons,
            "partialExecutionAllowed": False,
        })
    if not has_switch:
        reasons.append("no-switch-mode-action-in-complete-bound-graph")
    if family == "blocked-toggle" and not owner["rootSharedTalentMount"]:
        reasons.append("not-root-shared-active-talent")
    initial_index = owner["initialModeEvidence"].get("modeIndex")
    channels = enemy.get("analyses", {}).get("selection", {}).get("components", {}).get("modeChannelContracts", [])
    owner["initialModeChannelContracts"] = deepcopy([x for x in channels if x.get("modeIndex") == initial_index])
    selection = enemy.get("analyses", {}).get("selection", {}).get("components", {})
    mode_components = [{"componentKey": key, "scriptType": c.get("scriptType"),
                        "modeIndices": c.get("modeIndicesFromAncestorGameObjects"),
                        "ownershipOverlayEligible": c.get("ownershipOverlayEligible")}
                       for key, c in own.get("components", {}).items()
                       if c.get("modeIndicesFromAncestorGameObjects")]
    reasons = sorted(set(reasons))
    recommended = (family == "blocked-toggle" and only_switch and not reasons)
    return {
        "candidateId": eid + "|" + component_key,
        "enemyId": eid, "name": enemy.get("name"), "inEncounterPool": enemy.get("inEncounterPool"),
        "family": family, "componentKey": component_key,
        "sourceRefs": [
            _source("work/enemy-mode-template-plan.json", eid, "/analyses", component_key),
            _source("work/enemy-mode-ownership-overlay.json", eid, "/components/" + component_key, component_key),
        ],
        "source": deepcopy(own.get("source", {})),
        "ability": {"scriptType": payload.get("scriptType") if payload else owner["component"].get("scriptType"),
                    "fields": fields, "completeFields": fields is not None},
        "ownership": owner,
        "condition": {"checkerReference": deepcopy(chain.get("checkerReference")) if chain else None,
                      "checker": checker, "checkerOwnership": checker_owner,
                      "toggleFields": deepcopy(chain.get("toggleFields")) if chain else None,
                      "boundary": "Raw predicate and lifecycle flags are retained; native semantics are not inferred from field names."},
        "buffGraphs": graphs,
        "sideEffects": side_effects,
        "availableModeIndices": deepcopy(enemy.get("modeIndices", [])),
        "modeActivationDependencies": {
            "modeAttributeProviders": deepcopy(selection.get("modeAttributeProviders", [])),
            "enemySkillComponents": deepcopy(own.get("enemySkillComponents", {})),
            "mountedModeComponents": mode_components,
            "boundary": "A compiled transition does not implement other mounted abilities, talent effects, selectors or mode attributes.",
        },
        "completeGraphContainsOnlySwitchMode": only_switch,
        "rejectionReasons": reasons,
        "recommendedBatch": "root-blocked-toggle-switch-mode" if recommended else None,
        "requiredCallerContracts": ["self-target-from-passive-buff-attachment", "compiled-executable-mode-indices", "blocked-checker-predicate-and-toggle-lifecycle"] if recommended else [],
        "implementationReady": False,
    }


def build_candidates(plan, bindings, ownership, inputs=None):
    candidates = []
    targeted = set(plan.get("operators", {}).get("blocked-state-checker", {}).get("memberIDs", []))
    targeted.update(plan.get("operators", {}).get("hp-ratio-checker", {}).get("memberIDs", []))
    selected = {}
    for eid in plan.get("memberIDs", list(plan["enemies"])):
        if eid not in targeted:
            continue
        enemy = plan["enemies"][eid]
        for chain in enemy.get("analyses", {}).get("triggers", {}).get("chains", []):
            checker_type = _short(chain.get("checker", {}).get("scriptType", ""))
            family = {"BlockedToggleChecker": "blocked-toggle", "HpRatioToggleChecker": "hp-ratio-toggle"}.get(checker_type)
            if not family:
                continue
            key = chain["componentKey"]
            payload = next((p for p in chain.get("relatedComponentPayloads", []) if p["componentKey"] == key), None)
            selected[(eid, key)] = (family, chain, payload, [])
    # Use the existing exact template usage index to find only PassiveBuffAbility
    # in mode subtrees. This does not reclassify any catalog member.
    passive_usages = {}
    for key, binding in bindings.get("templates", {}).items():
        for usage in binding.get("usages", []):
            eid, component_key = usage.get("enemyId"), usage.get("componentKey")
            owner = ownership.get("enemies", {}).get(eid, {}).get("components", {}).get(component_key, {})
            if _short(owner.get("scriptType", "")) == "PassiveBuffAbility" and owner.get("modeIndicesFromAncestorGameObjects"):
                passive_usages.setdefault((eid, component_key), []).append((key, usage))
    for (eid, key), usages in passive_usages.items():
        enemy = plan["enemies"][eid]
        payload = next((node for _, node in walk(enemy.get("analyses", {}))
                        if node.get("componentKey") == key and isinstance(node.get("fields"), dict)), None)
        selected[(eid, key)] = ("mode-passive", None, payload, usages)
    for (eid, key), (family, chain, payload, usages) in sorted(selected.items()):
        candidates.append(_candidate(eid, plan["enemies"][eid], ownership["enemies"][eid],
                                     key, family, chain, payload, usages, bindings))
    families = {}
    for family, label in FAMILIES.items():
        rows = [c for c in candidates if c["family"] == family]
        families[family] = {"label": label, "candidateIDs": [c["candidateId"] for c in rows],
                            "memberIDs": sorted({c["enemyId"] for c in rows}),
                            "recommendedMemberIDs": sorted({c["enemyId"] for c in rows if c["recommendedBatch"]}),
                            "rejectionCounts": dict(sorted(Counter(r for c in rows for r in c["rejectionReasons"]).items()))}
    return {"schemaVersion": 1, "rule": RULE, "inputs": inputs or {},
            "counts": {"candidates": len(candidates), "enemies": len({c["enemyId"] for c in candidates}),
                       "recommendedCandidates": sum(bool(c["recommendedBatch"]) for c in candidates),
                       "recommendedEnemies": len({c["enemyId"] for c in candidates if c["recommendedBatch"]})},
            "families": families, "candidates": candidates,
            "boundary": "Selected cached common classes only. Complete Buff graphs retained, no partial action execution; recommendation still requires explicit target, checker and compiled-mode contracts."}


def ensure_candidates():
    file_hashes = {key: digest(path) for key, path in INPUTS.items()}
    rule_hash = digest(Path(__file__))
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else None
    if (previous and previous.get("inputs", {}).get("fileHashes") == file_hashes
            and previous.get("inputs", {}).get("ruleSha256") == rule_hash):
        # Hash streaming is cheap compared with parsing the large ownership
        # overlay. Fully unchanged inputs do not deserialize or inspect it.
        return previous, True
    data = {key: json.loads(path.read_text(encoding="utf-8")) for key, path in INPUTS.items()}
    # Integration counters/operators/state can change without changing source
    # contracts. Fingerprint the source-bearing projection, not whole files.
    plan, bindings, ownership = data["plan"], data["bindings"], data["ownership"]
    targeted = set(plan.get("operators", {}).get("blocked-state-checker", {}).get("memberIDs", []))
    targeted.update(plan.get("operators", {}).get("hp-ratio-checker", {}).get("memberIDs", []))
    for binding in bindings.get("templates", {}).values():
        for usage in binding.get("usages", []):
            eid, key = usage.get("enemyId"), usage.get("componentKey")
            owner = ownership.get("enemies", {}).get(eid, {}).get("components", {}).get(key, {})
            if _short(owner.get("scriptType", "")) == "PassiveBuffAbility" and owner.get("modeIndicesFromAncestorGameObjects"):
                targeted.add(eid)
    source_plan = {eid: {k: plan["enemies"][eid].get(k) for k in
                        ("name", "inEncounterPool", "modeIndices", "analyses")} for eid in sorted(targeted)}
    source_bindings = {key: {k: binding.get(k) for k in ("status", "payload", "url", "payloadSha256", "events", "usages")}
                       for key, binding in bindings.get("templates", {}).items()
                       if any(u.get("enemyId") in targeted for u in binding.get("usages", []))}
    projection = {"plan": source_plan, "bindings": source_bindings,
                  "ownership": {eid: ownership["enemies"][eid] for eid in sorted(targeted)}}
    inputs = {"sourceFingerprints": {key: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                ensure_ascii=False).encode()).hexdigest() for key, value in projection.items()},
              "ruleSha256": rule_hash, "fileHashes": file_hashes,
              "paths": {key: path.relative_to(ROOT).as_posix() for key, path in INPUTS.items()}}
    if (previous and previous.get("inputs", {}).get("sourceFingerprints") == inputs["sourceFingerprints"]
            and previous.get("inputs", {}).get("ruleSha256") == rule_hash):
        # A plan status or a derived binding receipt changed. Refresh only the
        # observed hashes; source candidates and their classifications stay put.
        previous["inputs"] = inputs
        OUTPUT.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return previous, True
    result = build_candidates(data["plan"], data["bindings"], data["ownership"], inputs)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result, False


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    result, cached = ensure_candidates()
    print(json.dumps({"path": str(OUTPUT), "cached": cached, "counts": result["counts"],
                      "recommended": {k: v["recommendedMemberIDs"] for k, v in result["families"].items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
