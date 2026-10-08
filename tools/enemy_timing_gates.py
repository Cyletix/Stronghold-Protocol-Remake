"""Compile the proven event-wait branch of native animated enemy abilities.

This is a timing contract only: it neither selects root actions nor certifies a
custom ability's damage behavior. Callers must already have selected an eligible
AbstractAnimatedAbility/EasyToStartAbility action and an unambiguous animation.
"""
from __future__ import annotations

import copy
import math

RULE_VERSION = "native-enemy-event-gate-v1"
TIME_MODES = {0: "FROM_ATTACK_SPEED", 1: "FROM_ANIMATION", 2: "SPECIFIED", 3: "LOAD_FROM_BLACKBOARD"}
EVIDENCE = {
    "client": "JP 36.7.22 local IL2CPP snapshot; CN field application is an explicit shared-schema inference",
    "binarySha256": "d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af",
    "metadataSha256": "2f96360fb0661d1ca323a2210eb859430f874887bc5e98c5af473d2ccf267819",
    "sourceMetadataSha256": "c3c1a306ef5945be72a68f8c0974ca13429116039c848032e6c373ecd6316ca8",
    "enum": "AbstractAnimatedAbility.TimeMode fields 85449..85452, signed compressed defaults 0/1/2/3",
    "event": "Entity.Event.ON_ATTACK_EVENT field 60685 = 19",
    "preDelayBranch": "AbstractAnimatedAbility.UpdatePlaybackSpeed 0x2522570..0x25225d8: wait=true skips configured _preDelay",
    "waitBranch": "EasyToStartAbility.OnWaitForPreDelay.MoveNext 0x2524578..0x25245ac: directly WaitForNextEvent(19,cachedDuration)",
    "waitCompletion": "EasyToStartAbility.WaitForNextEvent.MoveNext 0x252435c..0x2524448; _OnReceiveEvent 0x2523fe0 sets received flag",
    "artifactDirectory": "work/client-logic/native-enemy-timing-gates",
}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compile_timing_gate(fields, animation_timing):
    """Return accepted/timing/contract or a specific unresolved reason.

    animation_timing must contain a resolved first hit as ``hit`` and positive
    ``duration``. Repeated events require a separate typed sequence compiler;
    this function validates only entry into the event-wait branch. The caller's
    alias-speed handling must already be applied. No enum defaults are invented.
    """
    raw = {key: fields.get(key) for key in ("_timeMode", "_preDelay", "_waitForAttackEvent")}
    mode = raw["_timeMode"]
    result = {"ruleVersion": RULE_VERSION, "accepted": False, "raw": raw,
              "timeMode": TIME_MODES.get(mode) if type(mode) is int else None,
              "evidence": copy.deepcopy(EVIDENCE)}
    if type(mode) is not int or mode not in TIME_MODES:
        return {**result, "reason": "missing-or-unknown-time-mode"}
    if mode != 0:
        return {**result, "reason": "separate-cycle-contract-required-for-time-mode"}
    if raw["_waitForAttackEvent"] not in (True, 1) or type(raw["_waitForAttackEvent"]) not in (bool, int):
        return {**result, "reason": "configured-delay-branch-not-compiled"}
    if not finite(raw["_preDelay"]) or raw["_preDelay"] < 0:
        return {**result, "reason": "invalid-configured-pre-delay"}
    if not isinstance(animation_timing, dict):
        return {**result, "reason": "missing-unambiguous-animation-timing"}
    duration, hit = animation_timing.get("duration"), animation_timing.get("hit")
    if not finite(duration) or duration <= 0 or not finite(hit) or not 0 <= hit <= duration:
        return {**result, "reason": "missing-or-invalid-single-animation-event"}
    return {**result, "accepted": True, "timing": copy.deepcopy(animation_timing),
            "contract": {"gate": "ON_ATTACK_EVENT", "eventId": 19,
                         "cycle": "FROM_ATTACK_SPEED", "timeBasis": "existing-normalized-animation-profile",
                         "ignoredConfiguredPreDelay": raw["_preDelay"],
                         "reason": "Native event branch waits for the event directly; configured delay is neither added nor a minimum hit time",
                         "scope": "Target alive and cast uninterrupted; first known in-duration event. Repeat selection belongs to the separate typed sequence contract. Missing-event timeout, custom overrides and other time modes remain unresolved."}}
