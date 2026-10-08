"""Rank only the encounter members of the existing mode-attribute operator.

Missing complete fields are joined by the plan's exact component references.
No new enemy inventory or runtime/compiler mutation is performed.
"""
from __future__ import annotations
import ast
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULE = "garrison-mode-attribute-priority-v1"
OUTPUT = ROOT / "work/garrison-mode-attribute-priority.json"
TIM = ROOT / "work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk(value, path=""):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from walk(child, path + "/" + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + "/" + str(index))


def enum_dicts():
    result = {}
    tree = ast.parse((TIM / "buff_templates.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ("_ATTR_TYPE_NAMES", "_FORMULA_MAP"):
                    result[target.id] = ast.literal_eval(node.value)
    return result


def build():
    paths = {"plan": ROOT / "work/enemy-mode-template-plan.json",
             "report": ROOT / "work/external-combat-import-report.json",
             "encounters": ROOT / "web/enemy_encounters.json",
             "runtime": ROOT / "web/external_combat_data.js",
             "catalog": ROOT / "work/enemy-mode-dispatch-catalog.json",
             "ownership": ROOT / "work/enemy-mode-ownership-overlay.json",
             "bindings": ROOT / "work/enemy-mode-buff-bindings.json",
             "templateSource": TIM / "data_buff_templates.json", "enumSource": TIM / "buff_templates.py"}
    inputs = {key: {"path": path.relative_to(ROOT).as_posix(), "sha256": sha(path)} for key, path in paths.items()}
    inputs["ruleSha256"] = sha(Path(__file__))
    if OUTPUT.exists():
        previous = read(OUTPUT)
        if previous.get("inputs") == inputs:
            return previous, True
    plan, report, encounter = (read(paths[k]) for k in ("plan", "report", "encounters"))
    operator = plan["operators"]["compile-mode-attributes"]
    members = operator["encounterIDs"]
    assert len(members) == len(set(members))
    runtime_text = paths["runtime"].read_text(encoding="utf-8")
    runtime = json.loads(runtime_text.split("window.ArkExternalCombatData=", 1)[1].rstrip().removesuffix(";"))
    catalog, ownership, bindings = (read(paths[k]) for k in ("catalog", "ownership", "bindings"))
    enums = enum_dicts()
    names = enums["_ATTR_TYPE_NAMES"]
    formula_names = {0: "ADDITION", 1: "MULTIPLIER", 2: "FINAL_ADDITION", 3: "FINAL_SCALER"}
    selected, formulas, flags, enemies = {}, {}, {}, {}
    needed_templates = set()
    for eid in members:
        record, own = catalog["enemies"][eid], ownership["enemies"][eid]
        profile, enc = runtime["enemies"].get(eid, {}), encounter["enemies"][eid]
        providers = plan["enemies"][eid]["analyses"].get("selection", {}).get("components", {}).get("modeAttributeProviders", [])
        compiled = [int(index) for index in profile.get("modes", {})]
        initial = profile.get("initialMode")
        mode_records = []
        for mode in record.get("modes", []):
            mode_fields = mode.get("fields", {})
            mode_records.append({"modeIndex": mode["modeIndex"], "compiledActions": mode["modeIndex"] in compiled,
                                 "initial": mode["modeIndex"] == initial, "sourceRef": mode.get("targetComponentKey"),
                                 "rangeFields": {key: deepcopy(value) for key, value in mode_fields.items() if "range" in key.lower()},
                                 "generalAbilities": deepcopy(mode_fields.get("_generalAbilities", []))})
        enemies[eid] = {"name": enc["name"], "sourceLevelType": enc.get("sourceLevelType"),
                        "compiledModeIndices": compiled, "initialMode": initial,
                        "modeExecutionGap": deepcopy(report.get("modeProfiles", {}).get("unresolved", {}).get(eid)),
                        "modes": mode_records, "sourceAttributes": deepcopy(enc.get("sourceAttributes", {})),
                        "sourceTalentBlackboard": deepcopy(enc.get("sourceTalentBlackboard", [])),
                        "sourceSkills": deepcopy(enc.get("sourceSkills", [])), "providers": [],
                        "sourceDescription": enc.get("sourceDescription"),
                        "dedicatedBossGateRequired": enc.get("sourceLevelType") == "BOSS"}
        for provider in providers:
            ref = provider["sourceRef"]
            key, modes = ref["componentKey"], provider["provider"]["modeIndices"]
            ident = eid + "|" + key
            if ident not in selected:
                component = record["components"][key]
                fields = component["fields"]
                owned = own.get("components", {}).get(key, {})
                payloads = []
                for field_path, obj in walk(fields):
                    if "templateKey" in obj and "attributes" in obj:
                        needed_templates.add(obj["templateKey"])
                        payloads.append({"fieldPath": field_path, "fields": deepcopy(obj)})
                # Exact direct PPtr dependencies only, not a new source walk.
                by_path = {str(c["pathID"]): (k, c) for k, c in record["components"].items()}
                refs = []
                for field_path, obj in walk(fields):
                    pid = obj.get("m_PathID")
                    if obj.get("m_FileID") == 0 and pid not in (None, 0, "0") and str(pid) in by_path:
                        child_key, child = by_path[str(pid)]
                        refs.append({"fieldPath": field_path, "componentKey": child_key,
                                     "scriptType": child.get("scriptType"), "fields": deepcopy(child.get("fields", {}))})
                carrier = [deepcopy(t) for t in own.get("talentAndSkillComponents", {}).values()
                           if t.get("gameObjectPathID") == owned.get("gameObjectPathID")]
                selected[ident] = {"id": ident, "enemyId": eid, "componentKey": key,
                                  "scriptType": component.get("scriptType"), "fields": deepcopy(fields),
                                  "sourceRefs": [], "ownership": deepcopy(owned), "carrierComponents": carrier,
                                  "directReferences": refs, "modeIndices": modes,
                                  "compiledOwnerModes": [m for m in modes if m in compiled],
                                  "mountedInExecutableInitialMode": initial is not None and initial in modes,
                                  "buffDeclarations": payloads,
                                  "runtimeLifecycle": "not-implemented-by-mode-profile-compilation"}
                enemies[eid]["providers"].append(ident)
            selected[ident]["sourceRefs"].append(deepcopy(ref))
            for modifier in provider["attributeModifiers"]:
                signature = f"attribute-{modifier['attributeType']}:formula-{modifier['formulaItem']}"
                group = formulas.setdefault(signature, {"attributeType": modifier["attributeType"],
                    "attributeName": names.get(modifier["attributeType"], "unmapped-in-reference-enum"),
                    "formulaItem": modifier["formulaItem"], "formulaName": formula_names.get(modifier["formulaItem"], "unknown"),
                    "memberIDs": [], "providerIDs": [], "compiledModeMemberIDs": [], "initialModeMemberIDs": [], "parameters": []})
                if eid not in group["memberIDs"]: group["memberIDs"].append(eid)
                if ident not in group["providerIDs"]: group["providerIDs"].append(ident)
                if any(m in compiled for m in modes) and eid not in group["compiledModeMemberIDs"]: group["compiledModeMemberIDs"].append(eid)
                if initial is not None and initial in modes and eid not in group["initialModeMemberIDs"]: group["initialModeMemberIDs"].append(eid)
                group["parameters"].append({"enemyId": eid, "componentKey": key, "sourceRef": ref, "fields": deepcopy(modifier)})
            for field, values in provider.get("abnormal", {}).items():
                for value in values:
                    group = flags.setdefault(field + ":" + str(value), {"field": field, "value": value, "memberIDs": [], "providerIDs": []})
                    if eid not in group["memberIDs"]: group["memberIDs"].append(eid)
                    if ident not in group["providerIDs"]: group["providerIDs"].append(ident)
    # The existing bindings omit many attribute-only templates. Load that one
    # pinned table only for exact missing template keys, never research enemies.
    missing = needed_templates - set(bindings["templates"])
    raw = read(paths["templateSource"]) if missing else {}
    if isinstance(raw, list): raw = {t["templateKey"]: t for t in raw}
    templates = {}
    for key in sorted(needed_templates):
        bound = bindings["templates"].get(key, {})
        payload = bound.get("payload") or raw.get(key)
        templates[key] = {"templateKey": key, "payload": deepcopy(payload),
                          "status": "bound-complete" if payload else "missing-exact-template",
                          "source": bound.get("url") or inputs["templateSource"]["path"],
                          "payloadSha256": bound.get("payloadSha256") or (hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest() if payload else None)}
    shape_groups = {}
    for item in selected.values():
        node_types = set()
        extra = []
        for buff in item["buffDeclarations"]:
            template = templates[buff["fields"]["templateKey"]]
            buff["templateRef"] = template["templateKey"]
            payload = template["payload"] or {}
            for _, node in walk(payload.get("eventToActions", {})):
                if "$type" in node: node_types.add(node["$type"].split(",", 1)[0].split("+")[-1])
            if not template["payload"]: extra.append("missing-template:" + template["templateKey"])
        script = item["scriptType"].rsplit(".", 1)[-1]
        containers = sorted({b["fieldPath"].split("/")[1] for b in item["buffDeclarations"]})
        item["actionNodeTypes"] = sorted(node_types)
        item["missingLinks"] = extra
        item["attributeOnlyPassiveCandidate"] = script == "PassiveBuffAbility" and not node_types and not extra
        shape = script + ":" + ",".join(containers)
        group = shape_groups.setdefault(shape, {"scriptType": item["scriptType"], "buffContainers": containers,
            "providerIDs": [], "memberIDs": [], "compiledModeMemberIDs": [], "initialModeMemberIDs": [], "actionNodeTypes": []})
        group["providerIDs"].append(item["id"])
        eid = item["enemyId"]
        for key, valid in (("memberIDs", True), ("compiledModeMemberIDs", bool(item["compiledOwnerModes"])),
                           ("initialModeMemberIDs", item["mountedInExecutableInitialMode"])):
            if valid and eid not in group[key]:group[key].append(eid)
        group["actionNodeTypes"] = sorted(set(group["actionNodeTypes"]) | node_types)
    pure = [i for i in selected.values() if i["attributeOnlyPassiveCandidate"]]
    result = {"schemaVersion": 1, "rule": RULE, "inputs": inputs,
              "counts": {"globalOperatorMembers": len(operator["memberIDs"]), "garrisonMembers": len(members),
                         "attributeSourceRows": sum(len(i["sourceRefs"]) for i in selected.values()),
                         "providerComponents": len(selected), "deduplicatedFormulas": len(formulas),
                         "deduplicatedAbnormalFlags": len(flags), "enemiesWithCompiledMode": sum(bool(e["compiledModeIndices"]) for e in enemies.values()),
                         "enemiesWithExecutableInitial": sum(e["initialMode"] is not None for e in enemies.values()),
                         "numericInitialMembers": len({eid for g in formulas.values() for eid in g["initialModeMemberIDs"]}),
                         "attributeOnlyPassiveProviders": len(pure),
                         "attributeOnlyPassiveInitialMembers": len({i["enemyId"] for i in pure if i["mountedInExecutableInitialMode"]})},
              "memberIDs": members, "formulas": formulas, "abnormalFlags": flags, "providerShapes": shape_groups,
              "enemies": enemies, "providers": selected, "templates": templates,
              "enumSource": {"path": inputs["enumSource"]["path"], "attributeNames": names, "formulaNames": formula_names,
                             "boundary": "Reference-source display names only; raw serialized enum values remain authoritative. Unmapped attribute 30 and abnormal enums are not guessed."},
              "recommendation": {
                  "family": "mode-mounted-passive-empty-buff-addition",
                  "label": "模式内被动空图Buff的加算属性与挂载/移除",
                  "memberIDs": sorted({i["enemyId"] for i in pure}),
                  "providerIDs": [i["id"] for i in pure],
                  "initialNonzeroMemberIDs": sorted({i["enemyId"] for i in pure if i["mountedInExecutableInitialMode"]}),
                  "ordinaryImmediateMemberIDs": sorted({i["enemyId"] for i in pure if i["mountedInExecutableInitialMode"] and enemies[i["enemyId"]]["sourceLevelType"] != "BOSS"}),
                  "requiresDedicatedBossCompatibility": sorted({i["enemyId"] for i in pure if enemies[i["enemyId"]]["sourceLevelType"] == "BOSS"}),
                  "sharedOperators": ["mode-passive-mount-and-unmount", "carrier-blackboard-namespace", "attribute-addition", "attack-interval-and-movement-consumers"],
                  "reuse": "Reuse HP provider namespace, atomic Buff graph/effects and immutable base-stat getters; extend formula 0 and mode-scoped lifecycle.",
                  "sourceEffects": {"enemy_1425_lrcmra_and_variant": "mode1 AtkBoost.atk=0: currently no numerical gain even after transition",
                                    "enemy_1516_jakill": "mode0 enhance.magic_resistance=50; mode1 atk=700,def=1000,base_attack_time=-1.5,move_speed=0.3"},
                  "priority": "secondary-for-immediate-garrison-impact",
                  "reason": "The ordinary encounter pool has zero immediately active numerical providers in this complete class; prioritize missing initial/transition or wider shared dispatch before this global 83-member label.",
                  "rangeBoundary": "All retained UnitMode range UI fields are empty/default; combat selectors and attack-specific ranges are separate direct references, not a proven mode range override.",
                  "implementationReady": False,
              },
              "boundary": "Compiled mode actions are not mode activation. Initial eligibility still requires provider lifecycle/owner checks and a dedicated Boss compatibility gate. Full Buff siblings are retained; no template graph is partially executable."}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result, False


if __name__ == "__main__":
    result, cached = build()
    print(json.dumps({"cached": cached, "counts": result["counts"], "shapes": result["providerShapes"],
                      "formulaSummary": {k: {n: v[n] for n in ("attributeName", "formulaName", "memberIDs", "initialModeMemberIDs")} for k, v in result["formulas"].items()}}, ensure_ascii=False))
