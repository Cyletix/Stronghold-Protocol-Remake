"""Read stored modes and only the native entries needed for the melee contract."""
from pathlib import Path
import hashlib
import json
import sys
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work/client-logic/native-attack-contracts"
sys.path[:0] = [str(ROOT.parent / "src"), str(ROOT.parent / "tools")]
from arkresearch.client_logic import ClientLogicStore
from compile_client_modes import StatModeCompiler, ModeCompileError, stable


def without_animation_cap(graph):
    graph = json.loads(stable(graph))
    for role in ("_attack", "_combat"):
        for component in graph[role]:
            if component["type"] == "Torappu.Battle.Abilities.MeleeAttack":
                component["fields"].pop("_maxAnimScale", None)
    return graph


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = ClientLogicStore("jp-36.7.22-client-logic")
    compiler = StatModeCompiler(evidence)
    source_bundle = "assets/AB/Android/charpack/char_290_vigna.ab"
    baseline = compiler.graph(source_bundle, compiler.nodes(source_bundle)["5229875982047446573"])
    expected = without_animation_cap(baseline)
    matches, rejected = [], {}
    # Existing immutable evidence only; no bundle or metadata extraction.
    for path, roots in sorted(compiler.asset_roots.items()):
        if not path.startswith("dyn/battle/prefabs/characters/") or not path.endswith(".prefab") or len(roots) != 1:
            continue
        char_id = path.split("/")[-1][:-7]
        bundle, ref = roots[0]
        if char_id not in compiler.characters:
            continue
        try:
            root = compiler.node(bundle, ref)
            characters = [n for n in compiler.companions(bundle, root)] if root["unityType"] != "GameObject" else [compiler.node(bundle, r["component"]) for r in root["fields"]["m_Component"]]
            character = next(n for n in characters if n and n["unityType"] == "MonoBehaviour" and compiler.name(bundle, n) == "Torappu.Battle.Character")
            modes = [compiler.node(bundle, r) for r in character["fields"]["_modes"]]
            graphs = [compiler.graph(bundle, mode) for mode in modes]
            if not graphs or any(g != graphs[0] for g in graphs[1:]):
                rejected[char_id] = "different_modes"
            elif without_animation_cap(graphs[0]) == expected:
                matches.append({"charId": char_id, "name": compiler.characters[char_id]["name"], "bundle": bundle,
                                "bundleSha256": compiler.bundles[bundle]["sha256"], "characterPathId": character["pathId"],
                                "modePathIds": [mode["pathId"] for mode in modes],
                                "combatGraphSha256": hashlib.sha256(stable(graphs[0]).encode()).hexdigest(),
                                "animationCaps": [c["fields"]["_maxAnimScale"] for c in graphs[0]["_attack"] if c["type"] == "Torappu.Battle.Abilities.MeleeAttack"],
                                "prefabs": sorted(pid for pid, owners in compiler.owners.items() if char_id in owners)})
            else:
                rejected[char_id] = "different_combat_contract"
        except (ModeCompileError, KeyError, StopIteration) as error:
            rejected[char_id] = str(error) or "missing_character_component"
        compiler.cache.clear()
    snapshot = Snapshot()
    native_hash = hashlib.sha256(snapshot.data).hexdigest()
    metadata_hash = hashlib.sha256((ROOT / "work/client-logic/metadata/global-metadata.candidate.dat").read_bytes()).hexdigest()
    types_hash = hashlib.sha256((ROOT / "work/client-logic/metadata/types.json").read_bytes()).hexdigest()
    if (native_hash != evidence.manifest["provenance"]["native"]["sha256"]
            or metadata_hash != evidence.manifest["provenance"]["metadata"]["candidateSha256"]
            or types_hash != evidence.manifest["artifacts"]["metadata/types.json"]["sha256"]):
        raise ValueError("Native inputs disagree with the immutable evidence manifest")
    methods = {"Torappu.Battle.Abilities.AbstractAnimatedAbility": {"get_cooldown", "GetDuration", "UpdatePlaybackSpeed", "ApplyAttackTime"},
               "Torappu.Battle.BasicTalent": {"AssignData", "_GenerateBlackboardByTalentScale"},
               "Torappu.Battle.Action.Nodes+Evade": {"Execute", "_VerifyModifier"},
               "Torappu.Battle.Attributes": {"_CalculateAttributeValue"},
               "Torappu.AttributesCalculator": {"_CalculateFinalAttribute"},
               "Torappu.Battle.Buff": {"GetValue", "_SetAttributeModifier", "_LoadAttributesModifier"},
               "Torappu.SharedUtils": {"ProcessFinalScaler"}}
    native = []
    for method in snapshot.methods:
        if method["name"] not in methods.get(method["type"], set()): continue
        lines = snapshot.assembly(method["address"])
        file = method["type"].split(".")[-1].replace("+", "_") + "." + method["name"] + "." + hex(method["address"])[2:] + ".asm"
        (OUT / file).write_text("\n".join(lines) + "\n", encoding="utf-8")
        native.append({**snapshot.signatures([method])[0], "file": file, "instructions": len(lines),
                       "readableEnd": lines[-1].split()[0] if lines else None})
    enum_path = ROOT.parent / "data/cache/client-logic/stat-buff-r02/native-evidence.json"
    prior = json.loads(enum_path.read_text(encoding="utf-8"))
    if prior["nativeSha256"] != native_hash or prior["metadataCandidateSha256"] != metadata_hash:
        raise ValueError("Enum evidence belongs to another native snapshot")
    dispatch = list(snapshot.data[snapshot.offset(0x806ca2a):snapshot.offset(0x806ca2a) + 4])
    report = {"schemaVersion": 1, "evidenceId": evidence.evidence_id, "database": evidence.manifest["database"],
              "sourceVersion": evidence.manifest["source_version"], "scriptSupplement": compiler.scripts.manifest,
              "nativeSha256": native_hash, "metadataSha256": metadata_hash, "typesSha256": types_hash,
              "bindingSource": {"sourceId": compiler.source.source_id, "tables": {key: compiler.source.manifest["tables"][key]["sha256"] for key in ("character_table", "skill_table")}},
              "modeGraphMatches": matches, "modeGraphRejections": rejected, "nativeMethods": native,
              "layouts": [snapshot.layout(t) for t in snapshot.types if t["fullName"] in methods],
              "evadeTemplate": evidence.template("evade"),
              "defenseZeroPrefab": evidence.prefab("skchr_gyuki_2", components=True),
              "formulaEnumEvidence": {"file": "../data/cache/client-logic/stat-buff-r02/native-evidence.json",
                                      "sha256": hashlib.sha256(enum_path.read_bytes()).hexdigest(),
                                      "metadataSha256": prior["metadataCandidateSha256"],
                                      "formula": prior["enums"]["Torappu.AttributeModifierData+AttributeModifier+FormulaItemType"]},
              "formulaDispatch": {"tableRva": "0x806ca2a", "bytes": dispatch, "branchBaseRva": "0x4d9c2d8",
                                  "status": "unresolved: stored table entries point outside this method; do not use as decoded dispatch evidence",
                                  "scalerStorageBranchRva": "0x4d9c31c", "buffStorageOffset": "0x60"},
              "boundary": "Removing the animation cap is for candidate comparison only. Matching attack graphs do not prove skill/talent execution, animation timing, or JP/CN equivalence."}
    (OUT / "contracts.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"matches": len(matches), "rejected": len(rejected), "nativeMethods": len(native), "output": str(OUT / "contracts.json")}, ensure_ascii=False))


if __name__ == "__main__": main()
