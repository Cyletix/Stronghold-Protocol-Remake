"""Compile the complete root passive Buff + blocked checker mode provider.

Only this provider's transition is covered. Other mounted mode abilities remain
explicit dependencies; TARGET identity must be supplied by the caller.
"""
from copy import deepcopy
from collections.abc import Mapping

from enemy_mode_events import compile_mode_events

RULE = "enemy-root-blocked-mode-provider-v1"
ABILITY = "Torappu.Battle.Abilities.ToggleablePassiveBuffAbility"
CHECKER = "Torappu.Battle.Abilities.BlockedToggleChecker"
ABILITY_FLAGS = {
    "_interruptAbilityOnDetach": 0, "_attachPassiveBuffsOnDummy": 1,
    "_ignoreIfOwnerDead": 0, "_forceAsDmgOrHealAbility": 0,
    "_setToggleFalseOnDetached": 0, "_isInverseToggle": 0,
}
BUFF_DEFAULTS = {
    "loadFromDB": 0, "isDurableBuff": 0, "isDamageMissable": 0,
    "isSilenceable": 0, "isStunnable": 0, "isFreezable": 0,
    "isLevitatable": 0, "isGroundBoundable": 0, "statusResistable": 2,
    "disableOverride": 0, "overrideKey": "", "overrideType": 0,
    "maxStackCnt": 1, "refreshRemainingTimeWhenStackMax": 0,
    "clearAllStackCntWhenTimeUp": 0, "maxValidStackCnt": -1,
    "independentCharacterSource": 0, "overrideEffectKey": "",
    "overrideOnEventPriority": 0, "onEventPriority": 0, "audioSignal": "",
    "lifeTimeType": 2, "takeSnapshotWhenExtend": 0, "durationKey": "", "lifeTime": 0.0,
    "triggerLifeType": 0, "triggerCnt": 0, "triggerInterval": -1.0,
    "waitFirstTriggerInterval": 1, "firstTriggerInterval": -1.0,
    "priority": -1, "priorityBBKeys": [], "stripBlackboardParamsWithBuffKey": 0,
    "enableInitDirectionFromSource": 0,
}
ATTRIBUTE_KEYS = {"abnormalFlags", "abnormalImmunes", "abnormalAntis", "abnormalCombos",
                  "abnormalComboImmunes", "attributeModifiers"}
CONSUMED_MODE_TYPES = {"Torappu.Battle.UnitMode", "Torappu.Battle.Abilities.RangedAttack",
                       "Torappu.Battle.Abilities.MeleeAttack"}


def _index(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, str) and value.isdecimal():
        return int(value)
    if isinstance(value, int) and value >= 0:
        return value
    return None


def validate_root_passive_context(candidate, compiled_modes, initial_mode, *, target_binding,
                                  family, checker_type, ability_flags=ABILITY_FLAGS):
    """Shared owner, source-field, selector, default-mode and target contracts."""
    result = {"rejections": []}

    def reject(code, path, detail):
        result["rejections"].append({"code": code, "sourcePath": path, "detail": detail})

    if not isinstance(candidate, Mapping):
        reject("candidate-invalid", "/", "A complete frozen candidate is required.")
        return None, result["rejections"]
    ability = candidate.get("ability", {})
    fields = ability.get("fields")
    owner = candidate.get("ownership", {})
    condition = candidate.get("condition", {})
    if candidate.get("family") != family or ability.get("scriptType") != ABILITY:
        reject("provider-family-unsupported", "/ability/scriptType", "The caller-selected root passive family is required.")
    if not ability.get("completeFields") or not isinstance(fields, Mapping):
        reject("ability-fields-incomplete", "/ability", "All ability fields must be retained.")
        return None, result["rejections"]
    if (not owner.get("rootSharedTalentMount") or owner.get("modeIndices")
            or owner.get("component", {}).get("ownershipOverlayEligible") is not True
            or not owner.get("mountedInInitialMode")):
        reject("root-shared-mount-not-closed", "/ownership", "An eligible active root shared talent mount is required.")
    talents = owner.get("sameGameObjectRootSharedTalents", [])
    if len(talents) != 1:
        reject("root-talent-ambiguous", "/ownership/sameGameObjectRootSharedTalents", "Exactly one root shared talent must own this provider.")
    for talent in talents:
        tf = talent.get("fields", {})
        if (talent.get("cnMatchStatus") != "shared-fields-match" or tf.get("m_Enabled") != 1
                or tf.get("_checkValidBySkillIndex") or tf.get("_defaultModeIndex") != -1
                or tf.get("_isSilenceable", 0) not in (0, 1)):
            reject("root-talent-activation-unsupported", "/ownership/sameGameObjectRootSharedTalents", "Conditional/default-overriding root talents need their full lifecycle.")
    allowed_ability = set(ability_flags) | {"_metadata", "_selector", "_checker", "_buffs",
                                           "_buffsWhenToggleOff", "_unmanagedBuffsWhenToggleOn"}
    for key in sorted(set(fields) - allowed_ability):
        reject("unknown-ability-field", "/ability/fields/" + key, "Unconsumed source field.")
    for key, expected in ability_flags.items():
        if fields.get(key) != expected:
            reject("ability-lifecycle-unsupported", "/ability/fields/" + key, "This batch requires " + repr(expected))
    selector = fields.get("_selector", {})
    if selector.get("m_FileID") != 0 or selector.get("m_PathID") not in (0, "0"):
        reject("selector-requires-binding", "/ability/fields/_selector", "Only the serialized null self-attachment selector is in this batch.")
    if fields.get("_metadata", {}).get("blackboardPrefix"):
        reject("prefixed-ability-blackboard", "/ability/fields/_metadata", "The ability namespace must be resolved before checker defaults can be used.")
    if fields.get("_buffsWhenToggleOff") or fields.get("_unmanagedBuffsWhenToggleOn"):
        reject("extra-toggle-buff-lifecycle", "/ability/fields", "The complete on/off/unmanaged Buff sets must be implemented together.")
    checker = condition.get("checker") or {}
    if checker.get("scriptType") != checker_type:
        reject("checker-type-unsupported", "/condition/checker/scriptType", "Wrong checker type for this provider family.")
    checker_owner = condition.get("checkerOwnership", {})
    reference = condition.get("checkerReference") or {}
    if (checker_owner.get("ownershipOverlayEligible") is not True
            or checker_owner.get("gameObjectPathID") != owner.get("component", {}).get("gameObjectPathID")
            or reference.get("status") != "resolved" or reference.get("targetComponentKey") != checker.get("componentKey")):
        reject("checker-owner-binding-unresolved", "/condition", "The explicit checker reference and eligible same-owner component must agree.")
    supplied_modes = list(compiled_modes) if isinstance(compiled_modes, (Mapping, list, tuple, set, frozenset)) else []
    modes = {_index(m) for m in supplied_modes}
    default_mode = _index(initial_mode)
    if not modes or None in modes or default_mode is None or default_mode not in modes:
        reject("initial-mode-not-executable", "/compiled_modes", "The initial/default mode and every event target must already have compiled actions.")
    if isinstance(compiled_modes, Mapping) and any(not value for value in compiled_modes.values()):
        reject("compiled-mode-empty", "/compiled_modes", "An empty mode profile is not executable.")
    if (default_mode is None or owner.get("initialModeEvidence", {}).get("candidate") is not True
            or owner.get("initialModeEvidence", {}).get("modeIndex") != default_mode):
        reject("default-mode-binding-mismatch", "/initial_mode", "Use the compiled default tied to this candidate's source evidence.")
    if not (isinstance(target_binding, Mapping) and target_binding.get("scope") == "TARGET"
            and target_binding.get("binding") == "owner"
            and target_binding.get("evidenceLevel") in ("Inferred", "Verified")
            and (target_binding.get("sourceRefs") or target_binding.get("basis") or target_binding.get("evidenceRef"))):
        reject("target-owner-contract-required", "/target_binding", "Caller must explicitly bind TARGET to owner with retained evidence or an inference basis.")
    return {"fields": fields, "owner": owner, "checker": checker, "talents": talents,
            "modes": modes, "defaultMode": default_mode}, result["rejections"]


def validate_managed_buff_envelope(graph, index, ability_fields, *, allow_presentation=False,
                                    require_empty_attributes=False):
    """Validate one entire managed declaration, leaving its graph to a consumer."""
    errors = []
    path = f"/buffGraphs/{index}"

    def reject(code, suffix, detail):
        errors.append({"code": code, "sourcePath": path + suffix, "detail": detail})

    buff = graph.get("fields", {})
    source_buffs = ability_fields.get("_buffs", [])
    if (not graph.get("declarationComplete") or graph.get("fieldPath") != f"/_buffs/{index}"
            or index >= len(source_buffs) or buff != source_buffs[index]):
        reject("buff-declaration-mismatch", "", "The complete graph declaration must match its original managed Buff and source order.")
    for key in sorted(set(buff) - set(BUFF_DEFAULTS) - {"attributes", "buffKey", "templateKey", "blackboard"}):
        reject("unknown-buff-field", "/fields/" + key, "Unconsumed source field.")
    for key, expected in BUFF_DEFAULTS.items():
        if allow_presentation and key in ("overrideEffectKey", "audioSignal"):
            if not isinstance(buff.get(key), str):
                reject("invalid-presentation-key", "/fields/" + key, "Presentation keys must be source strings.")
        elif buff.get(key) != expected:
            reject("buff-lifecycle-or-side-effect-unsupported", "/fields/" + key, "This batch requires " + repr(expected))
    attributes = buff.get("attributes")
    if (not isinstance(attributes, Mapping) or set(attributes) != ATTRIBUTE_KEYS
            or (require_empty_attributes and any(attributes.values()))):
        reject("buff-attributes-unsupported", "/fields/attributes", "Unknown or unconsumed attribute effects cannot be silently discarded.")
    payload = graph.get("payload") or {}
    if ((payload.get("effectKey") and not allow_presentation) or payload.get("onEventPriority") != "DEFAULT"):
        reject("template-side-effect-unsupported", "/payload", "Template effects/priorities need an explicit consumer.")
    if payload.get("templateKey") != buff.get("templateKey"):
        reject("template-key-mismatch", "/payload/templateKey", "The bound graph must be the original declaration's template.")
    return errors


def compile_blocked_provider(candidate, compiled_modes, initial_mode, *, target_binding=None,
                             checker_contract=None):
    """Return accepted/selection/rejections with no partial provider on failure.

    compiled_modes is the caller's already compiled mode mapping or index set.
    target_binding explicitly supplies scope=TARGET, binding=owner and evidence.
    checker_contract can carry the native blackboard/default-field binding;
    absent that receipt, serialized defaults are an explicit Inferred boundary.
    """
    result = {"schemaVersion": 1, "rule": RULE, "accepted": False,
              "selection": None, "rejections": []}

    def reject(code, path, detail):
        result["rejections"].append({"code": code, "sourcePath": path, "detail": detail})

    context, errors = validate_root_passive_context(candidate, compiled_modes, initial_mode,
        target_binding=target_binding, family="blocked-toggle", checker_type=CHECKER)
    result["rejections"].extend(errors)
    if context is None:
        return result
    fields, talents = context["fields"], context["talents"]
    modes, default_mode = context["modes"], context["defaultMode"]
    checker = context["checker"]
    expected_checker = {"_blockMinCnt": 1, "_blockMaxCnt": -1, "_useBlockAsMin": 1, "_buffsToBlockee": []}
    if checker.get("predicateFields") != expected_checker:
        reject("checker-predicate-unsupported", "/condition/checker", "This runtime batch consumes the source 1/-1 blocked predicate only.")
    graphs = candidate.get("buffGraphs", [])
    if len(graphs) != 1 or len(fields.get("_buffs", [])) != 1:
        reject("multiple-buff-order-not-closed", "/buffGraphs", "This batch consumes one complete managed Buff.")
    events, graph_refs, template_keys = {}, [], []
    for index, graph in enumerate(graphs):
        path = f"/buffGraphs/{index}"
        buff = graph.get("fields", {})
        result["rejections"].extend(validate_managed_buff_envelope(graph, index, fields,
            require_empty_attributes=True))
        payload = graph.get("payload") or {}
        compiled = compile_mode_events({"status": graph.get("bindingStatus"), "payload": payload},
                                       buff.get("blackboard"), modes, default_mode,
                                       accepted_target_scope="TARGET" if isinstance(target_binding, Mapping) else None)
        for rejection in compiled["rejections"]:
            result["rejections"].append({**rejection, "sourcePath": path + rejection["sourcePath"]})
        if compiled["accepted"]:
            if any(a["restartFSM"] for actions in compiled["events"].values() for a in actions):
                reject("restart-fsm-unsupported", path + "/payload/eventToActions", "The root runtime does not yet implement a full state-machine restart.")
            events = compiled["events"]
            template_keys.append(compiled["templateKey"])
            graph_refs.append({"templateKey": compiled["templateKey"], "url": graph.get("url"), "payloadSha256": graph.get("payloadSha256")})
    if result["rejections"]:
        return result
    native_checker = {
        "evidenceLevel": "Verified", "binding": "native-blocker-boolean-with-cnt-threshold",
        "evidenceRef": "work/enemy-mode-switch-contract.json#/boundedProviderContract",
        "blackboardScopeEvidenceLevel": "Inferred",
        "basis": "Native _CheckCondition consumes blocker presence as 0/1; LoadData reads integer cnt into min when useBlockAsMin, otherwise max, with serialized fallback. Runtime sourceTalentBlackboard scope remains a bounded inference.",
    }
    activation = deepcopy(candidate.get("modeActivationDependencies", {}))
    remaining = [c for c in activation.get("mountedModeComponents", []) if c.get("scriptType") not in CONSUMED_MODE_TYPES]
    result["accepted"] = True
    result["selection"] = {
        "id": candidate["candidateId"], "chainId": candidate["candidateId"],
        "enemyId": candidate["enemyId"], "kind": "blocked-toggle-mode", "scope": "mode-transition-only",
        "condition": {"minCount": 1, "maxCount": -1, "useBlockAsMin": True, "inverse": False,
                      "countBlackboardKey": "cnt", "observedValue": "enemy-blocker-presence-0-or-1"},
        "conditionSourceFields": deepcopy(expected_checker),
        "silenceable": bool(talents[0].get("fields", {}).get("_isSilenceable", 0)),
        "initialActive": False, "events": events, "templateKeys": template_keys,
        "targetBinding": deepcopy(target_binding), "checkerBinding": deepcopy(checker_contract or native_checker),
        "lifecycleBinding": {"evidenceLevel": "Inferred", "evidenceRef": "work/enemy-mode-switch-contract.json#/boundedProviderContract",
                             "basis": "Root mount and complete managed Buff lifecycle support edge START/FINISH dispatch; silenceable talent detachment/restoration remains bounded inference."},
        "sourceRefs": deepcopy(candidate.get("sourceRefs", [])) + graph_refs,
        "modeActivationDependencies": activation, "remainingActivationComponents": remaining,
        "enemyImplementationComplete": False,
        "boundary": "Only the full managed Buff transition graph is consumed. Other mode-mounted abilities remain separate; Inferred owner/blackboard bindings are not original-client verification.",
    }
    return result
