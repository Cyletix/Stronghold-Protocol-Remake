"""Inspect the stored self-heal graph and readable native operators, without extraction."""
import hashlib
import json
from pathlib import Path
import sys
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/client-logic/native-self-heal"
sys.path[:0] = [str(ROOT.parent / "src"), str(ROOT.parent / "tools")]
from arkresearch.client_logic import ClientLogicStore
from compile_client_modes import StatModeCompiler, stable


def main():
    evidence = ClientLogicStore("jp-36.7.22-client-logic")
    compiler = StatModeCompiler(evidence)
    snapshot = Snapshot()
    hashes = {
        "nativeSha256": hashlib.sha256(snapshot.data).hexdigest(),
        "metadataSha256": hashlib.sha256((ROOT / "work/client-logic/metadata/global-metadata.candidate.dat").read_bytes()).hexdigest(),
        "typesSha256": hashlib.sha256((ROOT / "work/client-logic/metadata/types.json").read_bytes()).hexdigest(),
    }
    if (hashes["nativeSha256"] != evidence.manifest["provenance"]["native"]["sha256"]
            or hashes["metadataSha256"] != evidence.manifest["provenance"]["metadata"]["candidateSha256"]
            or hashes["typesSha256"] != evidence.manifest["artifacts"]["metadata/types.json"]["sha256"]):
        raise ValueError("Native inputs disagree with immutable evidence")
    prefab = evidence.prefab("skcom_heal_self", components=True)
    components = []
    for node in prefab["components"]:
        if node["unityType"] == "MonoBehaviour":
            components.append({"type": compiler.name(prefab["bundle"], node), **node})
    methods = {
        "Torappu.Battle.SelfSelector": {"DoFindTargets_DISPOSE", "CheckTargetIn"},
        "Torappu.Battle.Abilities.Heal": {"DoSetData", "NewHealNode", "GetEventActions", "get_applyWay", "ApplyHealScale"},
        "Torappu.Battle.Action.Nodes+ApplyHeal": {".ctor", "Execute"},
        "Torappu.Battle.CastSkill": {"DoCast"},
        "Torappu.Battle.Abilities.AbstractAnimatedAbility": {"OnCastStart", "GetDuration"},
        "Torappu.Battle.Entity": {"ApplyModifier", "get_isHealFree", "_OnApplyingModifier", "DoApplyModifier", "OnTakeHeal"},
        "Torappu.Battle.Modifier": {"NewHeal"},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    native = []
    for method in snapshot.methods:
        if method["name"] not in methods.get(method["type"], set()):
            continue
        lines = snapshot.assembly(method["address"])
        file = method["type"].split(".")[-1].replace("+", "_") + "." + method["name"] + "." + hex(method["address"])[2:] + ".asm"
        (OUT / file).write_text("\n".join(lines) + "\n", encoding="utf-8")
        native.append({**snapshot.signatures([method])[0], "file": file, "instructions": len(lines),
                       "status": "protected-body-unavailable" if not lines or method["type"] == "Torappu.Battle.Abilities.Heal" else "decoded-see-body"})
    bindings = []
    for sid, skill in compiler.source.table("skill_table").items():
        if any(level.get("prefabId") == "skcom_heal_self" for level in skill["levels"]):
            owners = [{"id": cid, "name": char["name"]} for cid, char in compiler.characters.items()
                      if any(ref.get("skillId") == sid for ref in char.get("skills") or [])]
            bindings.append({"skillId": sid, "owners": owners, "levels": skill["levels"]})
    report = {"schemaVersion": 1, "evidenceId": evidence.evidence_id,
              "sourceVersion": evidence.manifest["source_version"], "database": evidence.manifest["database"],
              "scriptSupplement": compiler.scripts.manifest, **hashes,
              "bindingSource": {"sourceId": compiler.source.source_id,
                                "tables": {key: compiler.source.manifest["tables"][key]["sha256"] for key in ("character_table", "skill_table")}},
              "prefab": {**prefab, "components": components},
              "graphSha256": hashlib.sha256(stable(components).encode()).hexdigest(),
              "bindings": bindings, "nativeMethods": native,
              "layouts": [snapshot.layout(t) for t in snapshot.types if t["fullName"] in methods],
              "verified": ["SelfSelector.DoFindTargets_DISPOSE returns owner only",
                           "ApplyHeal ctor stores isHpRatio at +0x11; Execute true branch multiplies target maxHp by scale",
                           "ApplyHeal ratio branch bypasses CalculateHeal and calls NewHeal then ApplyModifier",
                           "ApplyModifier still invokes modifier/buff/event hooks; bypassing CalculateHeal does not bypass all healing modifications",
                           "ApplyHeal ignoreHealFree is passed as ApplyModifier force; OnTakeHeal cancels the modifier if force is false and isHealFree is true",
                           "CN source descriptions explicitly specify immediate max-HP-ratio restoration"],
              "unresolved": ["Heal.DoSetData/NewHealNode protected: ability-to-node parameters and heal_scale loading not recovered",
                             "Heal.GetEventActions/get_applyWay protected: skill cast-to-heal dispatch not recovered",
                             "JP native behavior is not proof of a matching CN release"],
              "strictCompile": "rejected: protected_heal_ability_bridge",
              "modelConvention": "Exact CN IDs may use a separately labelled instant self-heal model; no extra attack; capped by own missing HP. This is not an accepted native graph."}
    (OUT / "evidence.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT / "evidence.json"), "methods": len(native), "bindings": len(bindings), "graphSha256": report["graphSha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
