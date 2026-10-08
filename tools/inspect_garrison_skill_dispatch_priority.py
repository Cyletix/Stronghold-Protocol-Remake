"""Freeze the existing encounter skill-dispatch queue, without a new inventory."""
from __future__ import annotations
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "work/garrison-skill-dispatch-priority.json"
RULE = "garrison-skill-dispatch-priority-v1"
PATHS = {"plan": "work/enemy-mode-template-plan.json",
         "catalog": "work/enemy-mode-dispatch-catalog.json",
         "ownership": "work/enemy-mode-ownership-overlay.json",
         "bindings": "work/enemy-mode-buff-bindings.json",
         "encounters": "web/enemy_encounters.json",
         "runtime": "web/external_combat_data.js",
         "boss": "web/boss_mechanics.json",
         "templates": "work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator/data_buff_templates.json"}


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk(value, path=""):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            if key == "SerializedState" and isinstance(child, str):
                try:
                    yield from walk(json.loads(child), path + "/SerializedState:decoded")
                except (ValueError, TypeError):
                    pass
            else:
                yield from walk(child, path + "/" + str(key))
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from walk(child, path + "/" + str(i))


def short(name):
    return (name or "null-reference").split(",", 1)[0].split(".")[-1].split("+")[-1]


def add_next_shared_contract(result):
    """Derive the next work contract from the frozen report, not source files."""
    selected = [result["skills"][key] for key in result["recommendation"]["candidateSkillIDs"]]
    refs = []
    for skill in selected:
        eid = skill["enemyId"]
        refs.append({"role": "enemy-skill-declaration", **deepcopy(skill["sourceRef"])})
        trigger = skill.get("trigger") or {}
        if trigger.get("componentKey"):
            refs.append({"role": "selector-trigger", "cache": PATHS["catalog"], "enemyId": eid,
                         "componentKey": trigger["componentKey"], "fieldPath": "/fields"})
        for key, component in {**skill["sameGameObjectComponents"], **skill["componentDependencies"]}.items():
            if short(component.get("scriptType")) in ("RangedAttack", "BlockedOrAdvancedSelector"):
                refs.append({"role": short(component.get("scriptType")), "cache": PATHS["catalog"],
                             "enemyId": eid, "componentKey": key, "fieldPath": "/fields"})
        refs.extend([
            {"role": "database-skill-cost-and-parameters", "cache": PATHS["encounters"], "enemyId": eid,
             "fieldPath": "/enemies/" + eid + "/sourceSkills", "prefabKeys": [s["prefabKey"] for s in skill["databaseSkillBindings"]]},
            {"role": "compiled-owner-mode-action", "cache": PATHS["runtime"], "enemyId": eid,
             "fieldPath": "/enemies/" + eid + "/modes", "modeIndices": deepcopy(skill["modeIndices"])}])
    unique_refs = list({json.dumps(ref, sort_keys=True, ensure_ascii=False): ref for ref in refs}.values())
    result["recommendation"]["sourceRefs"] = deepcopy(unique_refs)
    result["nextSharedContract"] = {
        "id": "selector-triggered-sp-cost-ranged-skill",
        "candidateMemberIDs": deepcopy(result["recommendation"]["memberIDs"]),
        "candidateSkillIDs": [skill["id"] for skill in selected],
        "initialModeExecutableCandidateMemberIDs": deepcopy(result["recommendation"]["initialCompiledMemberIDs"]),
        "initialModeExecutableCandidateSkillIDs": [skill["id"] for skill in selected if skill["initiallyMountedInCompiledMode"]],
        "sourceRefs": unique_refs,
        "reuse": ["existing-mode-action-timing", "existing-physical-and-arts-projectile-profiles", "complete-frozen-selector-and-skill-fields"],
        "unimplementedPrerequisites": [
            {"id": "skill-sp-lifecycle", "detail": "Bind SP acquisition timing, accumulation and spending; spCost=2 alone does not establish a two-normal-attacks rule."},
            {"id": "normal-attack-cast-arbitration", "detail": "Define skill versus ordinary-attack priority, cooldown resets, interrupt rules, cast start/end and source EnemySkill flags together."},
            {"id": "mode-owned-skill-lifecycle", "detail": "Activate only skills mounted in the current mode; detach and restore their scheduling state across mode changes."},
            {"id": "selector-target-set-and-multi-target-projectiles", "detail": "Honor BlockedOrAdvancedSelector and max_target default 2; dispatch the complete selected target set with each projectile's damage type and lifecycle."},
            {"id": "basic-ability-binding", "detail": "Validate the same-GameObject EnemySkill/basic ability and sourceSkills name link; currently retained as structural inference."}],
        "impactQueue": {"encounterMemberCount": result["counts"]["encounterMembers"],
                        "skillComponentCount": result["counts"]["skillComponents"],
                        "meaning": "affected queue size, not completed or immediately executable coverage"},
        "implementationReady": False,
        "executionBoundary": "Only the existing mode 0 action profile is executable initially. The candidate skill requires every listed public contract; the mode 1 counterpart additionally depends on an actual mode transition. Do not mark either skill complete merely because its attack profile is present."
    }
    return result


def build():
    inputs = {k: {"path": p, "sha256": sha(ROOT / p)} for k, p in PATHS.items()}
    inputs["ruleSha256"] = sha(Path(__file__))
    if OUTPUT.exists():
        previous = read(OUTPUT)
        if previous.get("inputs") == inputs:
            return previous, True
    data = {k: read(ROOT / p) for k, p in PATHS.items() if k != "runtime"}
    runtime = json.loads((ROOT / PATHS["runtime"]).read_text(encoding="utf-8").split("window.ArkExternalCombatData=", 1)[1].rstrip().removesuffix(";"))["enemies"]
    plan = data["plan"]
    members = plan["operators"]["resolve-enemy-skill-trigger"]["encounterIDs"]
    reborn_members = plan["operators"]["reborn-activation-registration"]["encounterIDs"]
    raw_templates = data["templates"]
    if isinstance(raw_templates, list):
        raw_templates = {t["templateKey"]: t for t in raw_templates}
    enemies, rows, templates, groups, reborn = {}, {}, {}, {}, {}

    def join_template(key):
        if key in templates:
            return
        receipt = data["bindings"]["templates"].get(key, {})
        payload = receipt.get("payload") or raw_templates.get(key)
        templates[key] = {"templateKey": key, "payload": deepcopy(payload),
                          "status": "bound-complete" if payload else "missing-exact-template",
                          "source": receipt.get("url") or PATHS["templates"],
                          "actionTypes": sorted({short(v["$type"]) for _, v in walk(payload or {}) if "$type" in v})}

    for eid in members:
        record = data["catalog"]["enemies"][eid]
        own = data["ownership"]["enemies"][eid]
        enc = data["encounters"]["enemies"][eid]
        profile = runtime.get(eid, {})
        compiled = sorted(map(int, profile.get("modes", {})))
        initial = profile.get("initialMode")
        enemies[eid] = {"name": enc["name"], "sourceLevelType": enc.get("sourceLevelType"),
                        "compiledModes": compiled, "initialMode": initial,
                        "compiledModeProfiles": deepcopy(profile.get("modes", {})),
                        "sourceSkills": deepcopy(enc.get("sourceSkills", [])),
                        "sourceTalentBlackboard": deepcopy(enc.get("sourceTalentBlackboard", [])),
                        "dedicatedBossProfile": deepcopy(data["boss"]["profiles"].get(eid)),
                        "existingModeProviders": deepcopy(profile.get("modeProviders")),
                        "cachedTriggerAnalysis": deepcopy(plan["enemies"][eid]["analyses"].get("triggers")),
                        "skillIDs": []}
        trigger_templates = []
        for _, obj in walk(enemies[eid]["cachedTriggerAnalysis"] or {}):
            if "templateKey" in obj and isinstance(obj["templateKey"], str):
                join_template(obj["templateKey"])
                trigger_templates.append(obj["templateKey"])
        enemies[eid]["cachedTriggerTemplateRefs"] = sorted(set(trigger_templates))
        by_path = {str(v["pathID"]): k for k, v in record["components"].items()}
        for selected in plan["enemies"][eid]["analyses"]["selection"]["components"].get("skillTriggers", []):
            key = selected["sourceRef"]["componentKey"]
            ownership = own["components"].get(key, {})
            go = ownership.get("gameObjectPathID")
            go_name = ownership.get("ancestorGameObjects", [{}])[0].get("name")
            same = {k: deepcopy(v) for k, v in record["components"].items()
                    if go is not None and own["components"].get(k, {}).get("gameObjectPathID") == go}
            same.setdefault(key, deepcopy(record["components"][key]))
            # Targeted dependency closure for only the selected skill group.
            dependencies, queue = {}, list(same.values())
            for component in queue:
                for _, ref in walk(component.get("fields", {})):
                    dep = by_path.get(str(ref.get("m_PathID"))) if ref.get("m_FileID") == 0 else None
                    if dep and dep not in same and dep not in dependencies:
                        dependencies[dep] = deepcopy(record["components"][dep])
                        queue.append(dependencies[dep])
            abilities = {k: v for k, v in same.items() if ".Abilities." in v.get("scriptType", "")}
            types = sorted({short(v.get("scriptType")) for v in abilities.values()})
            trigger_type = short(selected.get("triggerComponent", {}).get("scriptType"))
            mode_indices = selected["provider"].get("modeIndices", [])
            source_skills = [s for s in enc.get("sourceSkills", []) if s.get("prefabKey", "").casefold() == (go_name or "").casefold()]
            buff_declarations = []
            action_types = set()
            for component_key, component in {**same, **dependencies}.items():
                for path, obj in walk(component.get("fields", {})):
                    if "$type" in obj:
                        action_types.add(short(obj["$type"]))
                    if "templateKey" in obj and "attributes" in obj:
                        join_template(obj["templateKey"])
                        buff_declarations.append({"componentKey": component_key, "fieldPath": path, "fields": deepcopy(obj), "templateRef": obj["templateKey"]})
            ident = eid + "|" + key
            blockers = ["enemy-skill-scheduler-and-lifecycle-not-compiled"]
            if not source_skills:
                blockers.append("no-db-skill-name-binding")
            if trigger_type == "NeverTrigger":
                blockers.append("requires-explicit-named-trigger-caller")
            if trigger_type == "null-reference":
                blockers.append("null-trigger-not-automatic-cast")
            if initial is None or initial not in compiled:
                blockers.append("initial-mode-profile-not-compiled")
            if mode_indices and not any(m in compiled for m in mode_indices):
                blockers.append("owner-mode-profile-not-compiled")
            if enc.get("sourceLevelType") == "BOSS":
                blockers.append("boss-runtime-compatibility-required")
            if not ownership.get("ownershipOverlayEligible"):
                blockers.append("ownership-overlay-not-eligible")
            rows[ident] = {"id": ident, "enemyId": eid, "sourceRef": deepcopy(selected["sourceRef"]),
                           "name": go_name, "triggerType": trigger_type, "trigger": deepcopy(selected.get("triggerComponent")),
                           "skillFields": deepcopy(record["components"][key]["fields"]),
                           "ownership": deepcopy(ownership), "provider": deepcopy(selected["provider"]),
                           "modeIndices": mode_indices, "compiledOwnerModes": [m for m in mode_indices if m in compiled],
                           "initiallyMountedInCompiledMode": initial in compiled and (not mode_indices or initial in mode_indices),
                           "databaseSkillBindings": deepcopy(source_skills),
                           "nameBindingEvidenceLevel": "Inferred-casefold-matching" if source_skills else "Unresolved",
                           "abilityTypes": types, "sameGameObjectComponents": same, "componentDependencies": dependencies,
                           "actionTypes": sorted(action_types), "buffDeclarations": buff_declarations,
                           "missingContracts": blockers, "implementationReady": False}
            enemies[eid]["skillIDs"].append(ident)
            signature = trigger_type + ":" + "+".join(t for t in types if t != "UberEffectEmitter")
            group = groups.setdefault(signature, {"triggerType": trigger_type, "abilityTypes": types, "memberIDs": [], "skillIDs": [], "initialCompiledMemberIDs": []})
            group["skillIDs"].append(ident)
            if eid not in group["memberIDs"]:
                group["memberIDs"].append(eid)
            if rows[ident]["initiallyMountedInCompiledMode"] and eid not in group["initialCompiledMemberIDs"]:
                group["initialCompiledMemberIDs"].append(eid)
    for eid in reborn_members:
        analysis = deepcopy(plan["enemies"][eid]["analyses"].get("reborn", {}))
        refs = []
        for _, obj in walk(analysis):
            if "templateKey" in obj:
                join_template(obj["templateKey"])
                refs.append(obj["templateKey"])
        missing = {"reborn-registration-and-budget", "death-interception-and-hp-recharge", "retained-buff-policy", "complete-activation-buff-lifecycle"}
        summaries = [c.get("fieldsSummary", {}) for c in analysis.get("components", [])]
        for fields in summaries:
            if fields.get("_useAbilityToHandle"):
                missing.add("named-reborn-handler:" + str(fields.get("_abilityName")))
            if fields.get("_modeIndex") not in enemies.get(eid, {}).get("compiledModes", []):
                missing.add("target-mode-profile-not-compiled")
        action_types = sorted({t for k in refs for t in templates[k]["actionTypes"]})
        if "ModifySp" in action_types:
            missing.add("complete-sp-modification")
        if "SwitchMode" in action_types:
            missing.add("fsm-restart-and-mode-activation")
        if any(t in action_types for t in ("CheckContainsBuff", "CreateBuffById")):
            missing.add("buff-presence-and-named-buff-creation")
        reborn[eid] = {"analysis": analysis, "templateRefs": sorted(set(refs)),
                       "actionTypes": action_types, "missingContracts": sorted(missing),
                       "simpleCompleteClass": False,
                       "boundary": "Requires the entire reborn handler, retained buffs, target mode and all activation buffs; no HP-reset-only promotion."}
    minimal = [r for r in rows.values()
               if r["triggerType"] == "SelectorTrigger" and r["abilityTypes"] == ["RangedAttack", "UberEffectEmitter"]
               and not r["buffDeclarations"] and not r["actionTypes"]
               and enemies[r["enemyId"]]["sourceLevelType"] != "BOSS"
               and r["databaseSkillBindings"] and r["ownership"].get("ownershipOverlayEligible")]
    ready_initial = sorted({r["enemyId"] for r in minimal if r["initiallyMountedInCompiledMode"]})
    shared_contracts = {}
    for trigger in sorted({r["triggerType"] for r in rows.values()}):
        relevant = [r for r in rows.values() if r["triggerType"] == trigger]
        shared_contracts["trigger:" + trigger] = {"memberIDs": sorted({r["enemyId"] for r in relevant}), "skillIDs": [r["id"] for r in relevant],
            "sharedOperators": ["bind-enemy-skill-name-and-basic-ability", "enemy-skill-cooldown-sp-and-cast-lifecycle", "execute-complete-ability-group"]}
    recommendation = {"priority": "after-the-current-chain-projectile-work", "contract": "selector-triggered-sp-cost-ranged-skill",
        "candidateSkillIDs": [r["id"] for r in minimal], "memberIDs": sorted({r["enemyId"] for r in minimal}),
        "initialCompiledMemberIDs": ready_initial, "immediatelyCompilableWithoutNewContracts": 0,
        "reason": "The smallest complete ordinary-enemy shape has SelectorTrigger + one RangedAttack + presentation emitter, no Buffs or extra actions, both owner modes already compiled. The source timing/projectiles are reusable; EnemySkill scheduling and SP are still missing.",
        "requiredOperators": ["bind-name-and-same-gameobject-basic-ability", "mode-owned-skill-activation", "selector-trigger-target-set", "sp-acquisition-spend-cooldown-and-cast-arbitration", "multi-target-ranged-projectile-dispatch"],
        "sourceShape": {"trigger": {"_keepTarget": 0, "_minTargetNum": 1, "_overrideSearchTargetTick": -1}, "selectorType": "BlockedOrAdvancedSelector", "maxTargetsDefault": 2, "maxTargetsBlackboardKey": "max_target", "spCost": 2, "projectileWaitForInvalid": False},
        "evidenceBoundary": "Source SP cost is known; SP acquisition timing and normal-attack arbitration must be bound as one public contract, not inferred merely from spCost=2. This is one encounter member, not all 16.",
        "extensionBoundary": "The other RangedAttack member needs a tag-excluding selector, loaded stun Buff and Boss compatibility. Do not promote it with the no-Buff subset.",
        "rebornConclusion": "No simple complete class among the five encounter members. Three require named handlers; the closest no-handler candidate still has ModifySp then SwitchMode(restartFSM=true); the other needs retained yin/yang Buff creation and an uncompiled target mode."}
    result = {"schemaVersion": 1, "rule": RULE, "inputs": inputs,
              "selection": {"operator": "resolve-enemy-skill-trigger", "globalMemberCount": len(plan["operators"]["resolve-enemy-skill-trigger"]["memberIDs"]), "memberIDs": members, "rebornMemberIDs": reborn_members},
              "counts": {"encounterMembers": len(members), "skillComponents": len(rows), "sharedShapes": len(groups),
                         "triggerTypes": dict(Counter(r["triggerType"] for r in rows.values())), "rebornMembers": len(reborn)},
              "sharedContracts": shared_contracts, "shapeDiagnostics": groups, "recommendation": recommendation,
              "enemies": enemies, "skills": rows, "templates": templates, "reborn": reborn,
              "existingExecution": {"dedicatedBossProfileMatches": [eid for eid, enemy in enemies.items() if enemy["dedicatedBossProfile"]],
                                    "basicProfileCompiler": "tools/build_external_combat_data.py:compile_data",
                                    "basicProfileRuntime": "web/src/simulation/external-combat.js",
                                    "boundary": "Compiled ordinary attack channels supply reusable damage, animation timing and projectile delivery. No dedicated Boss profile in web/boss_mechanics.json matches these 16 source IDs; absence is not a whole-repository proof of no special behavior."},
              "boundary": ["Only frozen operator members and exact component dependencies are joined; no APK/database inventory.",
                           "Same-GameObject ability binding and casefold DB name matching are structural evidence, not a complete native BasicSkill contract.",
                           "Existing basic-attack profile compilation does not execute EnemySkill scheduling, SP, complete sibling Buffs or explicit trigger calls.",
                           "No runtime/compiler or plan state is modified."]}
    add_next_shared_contract(result)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result, False


if __name__ == "__main__":
    result, cached = build()
    print(json.dumps({"cached": cached, "path": str(OUTPUT), "counts": result["counts"]}, ensure_ascii=False))
