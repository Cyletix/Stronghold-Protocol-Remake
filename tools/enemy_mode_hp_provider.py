"""Compile complete root HP-triggered passive Buffs from the frozen candidates.

The same owner, selector and complete Buff-declaration contracts as blocked
providers are reused. No original inventory or database is read here.
"""
from collections.abc import Mapping
from copy import deepcopy
import math

from enemy_mode_blocked_provider import (CONSUMED_MODE_TYPES, validate_managed_buff_envelope,
                                         validate_root_passive_context)
from enemy_mode_passive_effects import compile_passive_effects

RULE = "enemy-root-hp-mode-provider-v2"
CHECKER = "Torappu.Battle.Abilities.HpRatioToggleChecker"
CHECKER_KEYS = {"_minHpRatio", "_maxHpRatio", "_useLTForMax", "_restoreDelay", "_toggleOnce",
                "_setInitialToggle", "_initialToggle", "_loadMinHpRatioFromBlackboard"}
FLAG_KEYS = {"_useLTForMax", "_toggleOnce", "_setInitialToggle", "_initialToggle", "_loadMinHpRatioFromBlackboard"}
EVIDENCE = "work/enemy-mode-hp-contract.json"


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def bind_carrier_blackboard(candidate, source_blackboard):
    """Bind one carrier namespace; unrelated global hp_ratio never substitutes."""
    errors = []

    def reject(code, path, detail):
        errors.append({"code": code, "sourcePath": path, "detail": detail})

    board = {}
    if isinstance(source_blackboard, Mapping):
        board = dict(source_blackboard)
    elif isinstance(source_blackboard, (list, tuple)):
        for index, item in enumerate(source_blackboard):
            if not isinstance(item, Mapping) or not isinstance(item.get("key"), str):
                reject("hp-blackboard-record-invalid", f"/source_blackboard/{index}", "Expected an original key/value record.")
                continue
            key = item["key"]
            if key in board:
                reject("hp-blackboard-key-ambiguous", f"/source_blackboard/{index}", "Duplicate source keys cannot be silently overwritten.")
            board[key] = item.get("valueStr") or item.get("value")
    else:
        reject("hp-blackboard-source-required", "/source_blackboard", "Pass the selected enemy's inherited talent blackboard.")
    talents = candidate.get("ownership", {}).get("sameGameObjectRootSharedTalents", [])
    carrier = talents[0] if len(talents) == 1 else {}
    override = carrier.get("fields", {}).get("_overwriteTalentKey")
    ancestors = carrier.get("ancestorGameObjects") or candidate.get("ownership", {}).get("component", {}).get("ancestorGameObjects", [])
    carrier_name = (ancestors[0].get("name") if ancestors else None)
    name = override or carrier_name
    candidates = list(dict.fromkeys((name, name.lower()))) if isinstance(name, str) and name else []
    matches = [prefix for prefix in candidates if any(isinstance(key, str) and key.startswith(prefix + ".") for key in board)]
    if len(matches) != 1:
        reject("hp-carrier-blackboard-namespace-unresolved", "/ownership/sameGameObjectRootSharedTalents",
               "Resolve the carrier's explicit talent key or same-GameObject name to exactly one existing source namespace.")
        return None, errors
    namespace = matches[0]
    prefix = namespace + "."
    defaults = {key[len(prefix):]: deepcopy(value) for key, value in board.items()
                if isinstance(key, str) and key.startswith(prefix)}
    return {"namespace": namespace, "defaults": defaults,
            "sourceRef": {"kind": "selected-enemy-inherited-talent-blackboard", "enemyId": candidate.get("enemyId"),
                          "carrierComponentKey": carrier.get("cnComponentKey"),
                          "namespaceSource": "_overwriteTalentKey" if override else "carrier-gameobject-name"},
            "scopeEvidenceLevel": "Inferred",
            "boundary": "Defaults come from the selected enemy's inherited source data. Runtime sourceTalentBlackboard can override only this namespace; explicit Buff-local values win."}, errors


def compile_hp_condition(checker_fields, blackboard, *, checker_contract=None):
    """Validate the bounded zero-delay, reevaluated root HP condition family."""
    errors = []

    def reject(code, path, detail):
        errors.append({"code": code, "sourcePath": path, "detail": detail})

    if not isinstance(checker_fields, Mapping) or set(checker_fields) != CHECKER_KEYS:
        reject("hp-checker-fields-unsupported", "/condition/checker/predicateFields", "All known HP fields are required; unknown fields need an explicit consumer.")
        return None, errors
    for key in FLAG_KEYS:
        if checker_fields[key] not in (0, 1):
            reject("hp-checker-flag-invalid", "/condition/checker/predicateFields/" + key, "Expected an explicit boolean flag.")
    for key in ("_minHpRatio", "_maxHpRatio", "_restoreDelay"):
        if not _finite(checker_fields[key]):
            reject("hp-checker-number-invalid", "/condition/checker/predicateFields/" + key, "Expected a finite source number.")
    defaults = (blackboard or {}).get("defaults", {})
    minimum, maximum, delay = (checker_fields["_minHpRatio"], checker_fields["_maxHpRatio"], checker_fields["_restoreDelay"])
    if "hp_ratio" in defaults:
        threshold = defaults["hp_ratio"]
        if not _finite(threshold):
            reject("hp-blackboard-threshold-invalid", "/blackboard/defaults/hp_ratio", "Do not fall back from an existing invalid source threshold.")
        elif checker_fields["_loadMinHpRatioFromBlackboard"]:
            minimum = threshold
        else:
            maximum = threshold
    if "delay" in defaults:
        delay = defaults["delay"]
        if not _finite(delay):
            reject("hp-blackboard-delay-invalid", "/blackboard/defaults/delay", "Do not fall back from an existing invalid source delay.")
    if delay != 0:
        reject("hp-restore-delay-runtime-unsupported", "/condition/restoreDelay", "The root runtime currently implements only effective delay zero.")
    if checker_fields["_toggleOnce"]:
        reject("hp-once-latch-runtime-unsupported", "/condition/toggleOnce", "One-shot state changes require a separate retained latch contract.")
    if checker_fields["_setInitialToggle"]:
        reject("hp-initial-toggle-override-runtime-unsupported", "/condition/setInitialToggle", "This batch initializes from current HP instead of a forced source toggle.")
    contract = checker_contract or {}
    comparison = contract.get("comparisonContract", {})
    epsilon = contract.get("comparisonEpsilon", comparison.get("epsilon", 1e-5))
    if not _finite(epsilon) or epsilon < 0:
        reject("hp-comparison-epsilon-invalid", "/checker_contract/comparisonEpsilon", "Supply a finite nonnegative comparison tolerance.")
    if errors:
        return None, errors
    return {
        "minHpRatio": minimum, "maxHpRatio": maximum,
        "useLTForMax": bool(checker_fields["_useLTForMax"]),
        "restoreDelay": delay, "toggleOnce": bool(checker_fields["_toggleOnce"]),
        "setInitialToggle": bool(checker_fields["_setInitialToggle"]),
        "initialToggle": bool(checker_fields["_initialToggle"]),
        "loadMinFromBlackboard": bool(checker_fields["_loadMinHpRatioFromBlackboard"]),
        "sourceMinHpRatio": checker_fields["_minHpRatio"], "sourceMaxHpRatio": checker_fields["_maxHpRatio"],
        "sourceRestoreDelay": checker_fields["_restoreDelay"],
        "hpRatioBlackboardKey": "hp_ratio", "delayBlackboardKey": "delay",
        "observedValue": "current-hp-divided-by-max-hp", "inverse": False,
        "initialization": "evaluate-current-hp",
        "comparisonEpsilon": epsilon,
        "comparisonContract": deepcopy(contract.get("comparisonContract", {"evidenceLevel": "Inferred", "minimum": "hp >= min - epsilon",
            "maximum": "hp < max - epsilon when useLTForMax; otherwise hp <= max + epsilon", "epsilon": epsilon,
            "boundary": "Native comparison forms are readable; 1e-5 uses metadata LARGE_EPS as an explicit inference because the referenced floating-point constant is unreadable."})),
    }, []


def compile_hp_provider(candidate, compiled_modes, initial_mode, *, target_binding=None,
                        source_blackboard=None, checker_contract=None):
    """Compile every original managed Buff atomically and preserve source order."""
    result = {"schemaVersion": 1, "rule": RULE, "accepted": False, "selection": None, "rejections": []}
    context, errors = validate_root_passive_context(candidate, compiled_modes, initial_mode,
        target_binding=target_binding, family="hp-ratio-toggle", checker_type=CHECKER)
    result["rejections"].extend(errors)
    if context is None:
        return result
    if candidate.get("ownership", {}).get("modeIndices"):
        result["rejections"].append({"code": "mode-scoped-hp-lifecycle-unsupported", "sourcePath": "/ownership/modeIndices",
                                     "detail": "Mode-entry/exit and restart contracts are separate from the root HP provider."})
    blackboard, errors = bind_carrier_blackboard(candidate, source_blackboard)
    result["rejections"].extend(errors)
    condition, errors = compile_hp_condition(context["checker"].get("predicateFields"), blackboard,
                                               checker_contract=checker_contract)
    result["rejections"].extend(errors)
    fields = context["fields"]
    graphs = candidate.get("buffGraphs", [])
    if not graphs or len(graphs) != len(fields.get("_buffs", [])):
        result["rejections"].append({"code": "hp-buff-set-incomplete", "sourcePath": "/buffGraphs",
                                     "detail": "Every managed Buff declaration must have its complete bound graph."})
    buffs, events, effects, presentations, source_refs = [], {}, [], [], []
    for index, graph in enumerate(graphs):
        path = f"/buffGraphs/{index}"
        result["rejections"].extend(validate_managed_buff_envelope(graph, index, fields, allow_presentation=True))
        if not isinstance(graph.get("payload"), Mapping):
            result["rejections"].append({"code": "hp-buff-payload-incomplete", "sourcePath": path + "/payload",
                                         "detail": "The complete original payload is required before any Buff can execute."})
            continue
        compiled = compile_passive_effects(graph, context["modes"], context["defaultMode"], target_binding=target_binding or {})
        for rejection in compiled.get("rejections", []):
            result["rejections"].append({**rejection, "sourcePath": path + rejection.get("sourcePath", "")})
        if not compiled.get("accepted"):
            if not compiled.get("rejections"):
                result["rejections"].append({"code": "hp-buff-effect-compiler-rejected", "sourcePath": path, "detail": "No executable partial Buff is allowed."})
            continue
        defaults = (blackboard or {}).get('defaults', {})
        for effect in compiled.get('effects', []):
            binding = effect['value']
            key = binding.get('key')
            value = (binding['local'] if 'local' in binding else
                     defaults[key] if key in defaults else binding.get('default'))
            if not _finite(value) or effect['kind'] == 'damage-scale' and value < 0:
                result['rejections'].append(dict(code='hp-effect-value-invalid',
                    sourcePath=path + effect.get('sourcePath', ''),
                    detail='Resolve the complete effect using local, carrier, then node fallback; an existing invalid value must not be ignored.'))
        buff_events = compiled.get("events", {})
        if any(action.get("restartFSM") for actions in buff_events.values() for action in actions):
            result["rejections"].append({"code": "restart-fsm-unsupported", "sourcePath": path + "/payload/eventToActions",
                                         "detail": "The root runtime does not implement complete FSM stop/start side effects."})
        buff_key = graph["fields"].get("buffKey")
        item = {"sourceIndex": index, "buffKey": buff_key, "templateKey": graph["fields"].get("templateKey"),
                "events": deepcopy(buff_events), "effects": deepcopy(compiled.get("effects", [])),
                "presentation": deepcopy(compiled.get("presentation", {})), "sourcePath": path}
        buffs.append(item)
        for event, actions in buff_events.items():
            events.setdefault(event, []).extend(deepcopy(actions))
        effects.extend({**deepcopy(effect), "buffIndex": index, "buffKey": buff_key} for effect in compiled.get("effects", []))
        presentations.append({"buffIndex": index, "buffKey": buff_key, **deepcopy(compiled.get("presentation", {}))})
        source_refs.append({"templateKey": item["templateKey"], "url": graph.get("url"), "payloadSha256": graph.get("payloadSha256")})
    if result["rejections"]:
        return result
    activation = deepcopy(candidate.get("modeActivationDependencies", {}))
    result["accepted"] = True
    result["selection"] = {
        "id": candidate["candidateId"], "chainId": candidate["candidateId"], "enemyId": candidate["enemyId"],
        "kind": "hp-ratio-toggle-mode", "scope": "root-passive-buff-chain",
        "condition": condition, "conditionSourceFields": deepcopy(context["checker"]["predicateFields"]),
        "silenceable": bool(context["talents"][0].get("fields", {}).get("_isSilenceable", 0)),
        "initialActive": False, "mountedModeIndices": [], "events": events, "effects": effects,
        "buffs": buffs, "templateKeys": [buff["templateKey"] for buff in buffs], "blackboard": blackboard,
        "presentation": presentations, "originalVisualsComplete": False,
        "targetBinding": deepcopy(target_binding), "checkerBinding": deepcopy(checker_contract or {
            "evidenceLevel": "Inferred", "evidenceRef": EVIDENCE,
            "basis": "HP source fields and caller-bound talent namespace are explicit. Native LoadData uses delay and hp_ratio; comparison tolerance remains the recorded fallback until a precise receipt is supplied."}),
        "lifecycleBinding": {"evidenceLevel": "Inferred", "evidenceRef": EVIDENCE,
                             "basis": "Root-managed Buffs attach/finish together on condition edges; declarations and each event's actions keep source order."},
        "sourceRefs": deepcopy(candidate.get("sourceRefs", [])) + source_refs,
        "modeActivationDependencies": activation,
        "remainingActivationComponents": [c for c in activation.get("mountedModeComponents", []) if c.get("scriptType") not in CONSUMED_MODE_TYPES],
        "enemyImplementationComplete": False,
        "boundary": "All declared managed Buff graphs/effects are consumed atomically. Other mode abilities and original presentation remain separate; inference receipts are not full original-client verification.",
    }
    return result
