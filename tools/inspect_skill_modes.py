"""Bounded read-only native evidence for skill mode switching; no APP re-extraction."""
from pathlib import Path
import hashlib
import json
import struct
import sys
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/client-logic/native-skill-modes"
METHODS = {
    "Torappu.Battle.Action.Nodes+SwitchMode": ["Execute"],
    "Torappu.Battle.CastSkill": ["get_switchToState", "DoCast", "AssignData", "OnCastFinish"],
    "Torappu.Battle.BasicSkill": ["get_useAttackBlackboardModeIndex", "GetAttackBlackboard", "AssignData"],
    "Torappu.Battle.Character": ["SwitchToSkillState", "SwitchOutFromSkillState", "GetAttackBlackboard", "_GetDefaultModeIndex"],
    "Torappu.Battle.Unit": ["SwitchMode", "SwitchToDefaultMode", "_InitUnitModes", "_UpdateModeAttackBlackboard"],
    "Torappu.Battle.UnitMode": ["Init", "get_attack", "get_combat"],
}
GROUP_SKILLS = "aglina_1 catap_1 clour_2 grani_2 greyy_2 mantic_2 midn_1 mm_2 moeshd_1 nearl_2 nightm_1 nights_2 skadi_3 skfire_2 spikes_2 spot_1 svrash_3 whitew_2 yuki_2".split()


def write_mode_audit():
    """Reproduce bounded 19-mode investigation and two accepted fallback graphs."""
    sys.path[:0] = [str(ROOT.parent / "src"), str(ROOT.parent / "tools")]
    from arkresearch.client_logic import ClientLogicStore
    from compile_client_modes import StatModeCompiler, ModeCompileError, stable
    from compile_client_stat_buffs import compile_profiles
    evidence = ClientLogicStore("jp-36.7.22-client-logic")
    compiler = StatModeCompiler(evidence)
    diagnostics = {}
    compiled = compile_profiles(evidence, diagnostics=diagnostics, mode_compiler=compiler)
    rows = []
    for short in GROUP_SKILLS + ["vigna_1", "vigna_2"]:
        sid = "skchr_" + short
        prefab = evidence.prefab(sid, components=True)
        fields = [row for row in prefab["components"] if row["unityType"] == "MonoBehaviour"]
        buffs = [buff for row in fields for buff in row["fields"].get("_buffs", [])]
        mode_index = next((int(item["value"]) for buff in buffs for item in buff.get("blackboard", []) if item["key"] == "mode"), 1)
        row = {"prefabId": sid, "group": "9eadda380a8d453d" if short in GROUP_SKILLS else "4802a74d76154685",
               "components": fields, "selectedMode": mode_index, "compilerDiagnostic": diagnostics[sid], "characters": []}
        try:
            row["modeProof"] = compiler.prove(sid, mode_index)
        except ModeCompileError as error:
            row["modeRejection"] = str(error)
        for char_id in sorted(compiler.owners.get(sid, [])):
            roots = compiler.asset_roots.get("dyn/battle/prefabs/characters/" + char_id + ".prefab", [])
            if len(roots) != 1:
                row["characters"].append({"charId": char_id, "error": "ambiguous_or_missing_asset"})
                continue
            bundle, ref = roots[0]
            root = compiler.node(bundle, ref)
            character = next(compiler.node(bundle, c["component"]) for c in root["fields"]["m_Component"]
                             if compiler.node(bundle, c["component"])["unityType"] == "MonoBehaviour"
                             and compiler.name(bundle, compiler.node(bundle, c["component"])) == "Torappu.Battle.Character")
            char = {"charId": char_id, "bundle": bundle, "bundleSha256": compiler.bundles[bundle]["sha256"],
                    "characterPathId": character["pathId"], "modes": []}
            for index, mode_ref in enumerate(character["fields"]["_modes"]):
                mode = compiler.node(bundle, mode_ref)
                item = {"index": index, "pathId": mode["pathId"], "fields": mode["fields"], "roles": {}}
                for role in ("_attack", "_combat", "_attackTrigger"):
                    node = compiler.node(bundle, mode["fields"][role])
                    item["roles"][role] = [{"type": compiler.name(bundle, c), "pathId": c["pathId"], "fields": c["fields"]}
                                            for c in compiler.companions(bundle, node)] if node else []
                try:
                    item["combatGraphSha256"] = hashlib.sha256(stable(compiler.graph(bundle, mode)).encode()).hexdigest()
                except ModeCompileError as error:
                    item["graphRejection"] = str(error)
                char["modes"].append(item)
            row["characters"].append(char)
        rows.append(row)
    result = {"schemaVersion": 1, "evidenceId": evidence.evidence_id, "database": evidence.manifest["database"],
              "sourceVersion": evidence.manifest["source_version"], "scriptSupplement": compiler.scripts.manifest,
              "bindingSource": {"sourceId": compiler.source.source_id,
                                "tableHashes": {key: compiler.source.manifest["tables"][key]["sha256"] for key in ("character_table", "skill_table")}},
              "switchModeTemplate": evidence.template("switch_mode"), "rows": rows,
              "boundary": "Serialized source graphs and inspected native branches only. Accepted DPS model graphs do not imply whole-character support, client frame timing or JP/CN release equivalence."}
    (OUT / "mode-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    snapshot = Snapshot()
    metadata = (ROOT / "work/client-logic/metadata/global-metadata.candidate.dat").read_bytes()
    header = struct.unpack_from("<64I", metadata)
    sections = [header[i:i + 2] for i in range(2, 64, 2)]
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for method in snapshot.methods:
        if method["name"] not in METHODS.get(method["type"], []):
            continue
        lines = snapshot.assembly(method["address"])
        filename = method["type"].removeprefix("Torappu.Battle.").replace("+", ".") + "." + method["name"] + "." + hex(method["address"])[2:] + ".asm"
        (OUT / filename).write_text("\n".join(lines) + "\n", encoding="utf-8")
        rows.append({**snapshot.signatures([method])[0], "file": filename,
                     "instructions": len(lines), "readableEnd": lines[-1].split()[0] if lines else None,
                     "calls": [line for line in lines if " ; " in line]})
    strings = []
    for slot, expected in [(0xa6e2db0, "mode")]:
        storage = snapshot.words(slot, 1)[0]
        encoded = snapshot.words(storage, 1)[0]
        assert encoded >> 29 == 5
        index = (encoded & 0x1fffffff) >> 1
        length, offset = struct.unpack_from("<II", metadata, sections[0][0] + index * 8)
        value = metadata[sections[1][0] + offset:sections[1][0] + offset + length].decode()
        assert value == expected
        strings.append(dict(slot=hex(slot), storage=hex(storage), encoded=hex(encoded), literalIndex=index, value=value))
    result = {"sourceVersion": "JP 36.7.22; native default branches, hotfix overrides unverified",
              "binarySha256": hashlib.sha256(snapshot.data).hexdigest(),
              "metadataSha256": hashlib.sha256(metadata).hexdigest(),
              "methods": rows, "strings": strings,
              "layouts": [snapshot.layout(t) for t in snapshot.types if t["fullName"] in METHODS],
              "boundary": "Readable prefixes are not complete method bodies; serialized modes and current CN numeric data retain separate identities."}
    (OUT / "evidence.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_mode_audit()
    print(json.dumps({"methods": len(rows), "output": str(OUT), "modeKey": strings[0]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
