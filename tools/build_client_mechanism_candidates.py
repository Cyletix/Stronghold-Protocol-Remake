"""Join existing client graphs, real script identities and current consumers.

Produces research batches, never executable rules or completion claims. No APP
extraction, downloads, evidence database mutation or checklist mutation occurs.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
sys.path.insert(0, str(PARENT / "src"))
sys.path.insert(0, str(PARENT / "tools"))
from arkresearch.client_logic import ClientLogicStore
from arkresearch.client_program import compile_programs
from compile_client_stat_buffs import compile_profiles


def digest(value):
    return hashlib.sha256(value).hexdigest()


def stable(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def field_diff(expected, actual, prefix=""):
    """Preserve values, missing keys and array ordering; do not normalize logic."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        rows = []
        for key in sorted(expected.keys() | actual.keys()):
            path = f"{prefix}.{key}" if prefix else key
            if key not in expected or key not in actual:
                rows.append({"path": path, "expectedPresent": key in expected,
                             "actualPresent": key in actual,
                             "expected": expected.get(key), "actual": actual.get(key)})
            else:
                rows.extend(field_diff(expected[key], actual[key], path))
        return rows
    if type(expected) is not type(actual) or expected != actual:
        return [{"path": prefix, "expected": expected, "actual": actual}]
    return []


def controls(fields):
    # Only Unity object identity is removed. All Buff keys/visuals remain visible
    # in diagnostics; only a separately reviewed compiler may disregard fields.
    return {key: value for key, value in fields.items()
            if key not in {"m_GameObject", "m_Name", "m_Script"}}


def validate_inputs(inputs, artifacts):
    for name, sha256 in inputs.items():
        if name == "script-types.json":
            continue  # Separately identified supplement, never part of the old DB.
        if artifacts.get(name, {}).get("sha256") != sha256:
            raise ValueError("Local evidence/SQLite mismatch: " + name)


def select_candidate(result, evidence_id, *, prefab=None, group=None):
    if result["evidenceId"] != evidence_id:
        raise ValueError("Candidate cache belongs to another evidence ID; rebuild the selected evidence first")
    selected = result["prefabs"].get(prefab) if prefab else next(
        (row for row in result["groups"] if row["id"] == group), None)
    if selected is None:
        raise ValueError("Unknown candidate ID")
    return {"evidenceId": result["evidenceId"], "sourceVersion": result["sourceVersion"], **selected}


def script_identity(bundle, reference, scripts):
    """A path ID alone is never a globally unique MonoScript identity."""
    files = list(bundle["externals"])
    if len(files) != 1:
        return {"status": "ambiguous_serialized_file", "reference": reference}
    file_id, path_id = reference.get("m_FileID"), reference.get("m_PathID")
    if type(file_id) is not int or not isinstance(path_id, str) or not re.fullmatch(r"-?(0|[1-9][0-9]*)", path_id) or not -(2**63) <= int(path_id) < 2**63:
        return {"status": "invalid_reference", "reference": reference}
    externals = bundle["externals"][files[0]]
    if file_id == 0:
        cab = files[0]
    elif 0 < file_id <= len(externals):
        cab = externals[file_id - 1].rsplit("/", 1)[-1]
    else:
        return {"status": "missing_external_file", "reference": reference}
    raw = scripts.get((cab, path_id))
    identity = {"cab": cab, "pathId": path_id}
    if raw is None:
        return {**identity, "status": "missing_script"}
    return {**identity, "status": "resolved", "assembly": raw["m_AssemblyName"],
            "type": ".".join(filter(None, [raw["m_Namespace"], raw["m_ClassName"]]))}


def template_closure(roots, templates):
    seen, missing, actions = set(), set(), set()
    pending = list(roots)
    while pending:
        key = pending.pop()
        if key in seen or key in missing:
            continue
        template = templates.get(key)
        if template is None:
            missing.add(key)
            continue
        seen.add(key)
        for value in walk(template):
            if value.get("$type"):
                actions.add(value["$type"])
            nested = value.get("templateKey")
            if nested and nested not in seen:
                pending.append(nested)
    return sorted(seen), sorted(missing), sorted(actions)


def build(evidence_id):
    base = ROOT / "work/client-logic"
    inputs = {}

    def load(name):
        blob = (base / name).read_bytes()
        inputs[name] = digest(blob)
        return json.loads(blob)

    index, bindings = load("skill-index.json"), load("skill-bindings.json")
    shapes, templates = load("component-shapes.json"), load("buff-templates.json")
    reachability, script_table = load("skill-template-reachability.json"), load("script-types.json")
    types, methods = load("metadata/types.json"), load("metadata/method-addresses.json")
    native_summary = load("metadata/native-summary.json")
    scripts = {(match["cab"], path_id): value for match in script_table["matches"]
               for path_id, value in match["scripts"].items()}
    bundles = {}
    for record in index.values():
        name = record["bundle"]
        if name not in bundles:
            bundles[name] = load("bundles/" + name.removeprefix("assets/AB/Android/") + ".json")
    evidence = ClientLogicStore(evidence_id)
    # Prevent quietly joining a refreshed local dump with an older DB snapshot.
    validate_inputs(inputs, evidence.manifest["artifacts"])
    diagnostics = {}
    compiled = compile_profiles(evidence, diagnostics=diagnostics)
    programs = compile_programs(evidence)
    for name in ["tools/compile_client_stat_buffs.py", "tools/compile_client_modes.py", "src/arkresearch/client_logic.py", "src/arkresearch/client_scripts.py", "src/arkresearch/client_program.py"]:
        inputs["parent/" + name] = digest((PARENT / name).read_bytes())
    for name in ["build_client_mechanism_candidates.py", "export_client_handler_inventory.js"]:
        inputs["tools/" + name] = digest((ROOT / "tools" / name).read_bytes())
    completed = subprocess.run(["node", str(ROOT / "tools/export_client_handler_inventory.js")],
                               cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True)
    handlers = json.loads(completed.stdout)
    registered = defaultdict(list)
    for consumer, skills in handlers["registrations"].items():
        for skill_id in skills:
            registered[skill_id].append(consumer)
    # Tie this runtime registration snapshot to the files the fixture loaded.
    html = (ROOT / "web/index.html").read_text(encoding="utf-8")
    for source in re.findall(r'<script src="([^"?]+)(?:\?[^" ]*)?"', html):
        if "://" not in source and not source.startswith("vendor/"):
            inputs["web/" + source] = digest((ROOT / "web" / source).read_bytes())
    reverse, missing = defaultdict(list), []
    for skill_id, binding in sorted(bindings["bindings"].items()):
        for prefab_id in binding["prefabs"]:
            reverse[prefab_id].append(skill_id)
        if not binding["matched"]:
            missing.append({"skillId": skill_id, "levelPrefabs": binding["levelPrefabs"],
                            "missingPrefabs": binding["missing"],
                            "reason": "source_without_prefab" if not all(binding["levelPrefabs"]) else "missing_resource"})
    canonical_record = index["skcom_atk_up"]
    canonical_bundle = bundles[canonical_record["bundle"]]
    canonical = {}
    for node_id in canonical_record["nodeIds"]:
        node = canonical_bundle["nodes"][node_id]
        if node["unityType"] == "MonoBehaviour":
            sid = script_identity(canonical_bundle, node["fields"]["m_Script"], scripts)
            canonical[(sid.get("cab"), sid.get("pathId"))] = controls(node["fields"])
    prefabs, groups, used_types = {}, {}, set()
    for prefab_id, record in sorted(index.items()):
        bundle = bundles[record["bundle"]]
        components = []
        for node_id in record["nodeIds"]:
            node = bundle["nodes"][node_id]
            if node["unityType"] != "MonoBehaviour":
                continue
            if node["fieldShape"] not in shapes:
                raise ValueError("Unknown field shape " + node["fieldShape"])
            identity = script_identity(bundle, node["fields"]["m_Script"], scripts)
            if identity.get("type"):
                used_types.add((identity["assembly"], identity["type"]))
            expected = canonical.get((identity.get("cab"), identity.get("pathId")))
            fields = controls(node["fields"])
            components.append({"nodeId": node_id, "script": identity,
                               "shape": node["fieldShape"], "configurationHash": digest(stable(fields).encode()),
                               "comparison": "canonical_stat_component" if expected is not None else "no_canonical_component",
                               "differences": field_diff(expected, fields) if expected is not None else [],
                               "fieldNames": sorted(fields)})
        closure, unresolved, actions = template_closure(record["templateKeys"], templates)
        for action in actions:
            used_types.add(("Assembly-CSharp.dll", action))
        skill_ids = sorted(reverse[prefab_id])
        consumer_rows = [{"skillId": skill_id, "webRegistrations": sorted(registered.get(skill_id, []))}
                         for skill_id in skill_ids]
        reason = diagnostics[prefab_id]
        signature = {"dpsReason": reason, "components": sorted([
            {"script": component["script"],
             "differencePaths": sorted(x["path"] for x in component["differences"])}
            for component in components], key=stable), "actions": actions}
        group_id = digest(stable(signature).encode())[:16]
        group = groups.setdefault(group_id, {"id": group_id, "signature": signature, "prefabIds": [], "skillIds": []})
        group["prefabIds"].append(prefab_id)
        group["skillIds"].extend(skill_ids)
        prefabs[prefab_id] = {"bundle": record["bundle"], "rootPathId": record["rootPathId"],
                             "clientProgram": programs['programs'].get(prefab_id),
                             "clientProgramRejection": {k:v for k,v in programs['rejections'].get(prefab_id, {}).items() if k != 'components'} or None,
                             "groupId": group_id, "dpsCompilation": reason,
                             "dpsModeGraph": compiled["profiles"].get(prefab_id, {}).get("mode_graph"),
                             "dpsAttackConstants": compiled["profiles"].get(prefab_id, {}).get("attack_constants"),
                             "dpsModeRejection": compiled.get("mode_rejections", {}).get(prefab_id),
                             "components": components, "templateRoots": record["templateKeys"],
                             "templateClosure": closure, "missingTemplates": unresolved,
                             "actionTypes": actions, "externalReferences": record["externalReferences"],
                             "consumers": consumer_rows}
    grouped = []
    for group in groups.values():
        group["skillIds"] = sorted(set(group["skillIds"]))
        group["withoutWebRegistration"] = [s for s in group["skillIds"] if not registered.get(s)]
        group["prefabCount"] = len(group["prefabIds"])
        grouped.append(group)
    grouped.sort(key=lambda g: (-len(g["withoutWebRegistration"]), -g["prefabCount"], g["id"]))
    type_lookup = {(t["assembly"], t["fullName"]): t for t in types}
    byval = {t["byvalTypeIndex"]: t for t in types}
    native_lookup = defaultdict(list)
    for method in methods:
        native_lookup[(method["assembly"], method["type"])].append(method)
    native_types = {}
    for key in sorted(used_types):
        current, chain, seen = type_lookup.get(key), [], set()
        while current is not None and current["typeIndex"] not in seen:
            seen.add(current["typeIndex"])
            identity = (current["assembly"], current["fullName"])
            chain.append({"assembly": identity[0], "type": identity[1],
                          "typeIndex": current["typeIndex"],
                          "methods": native_lookup.get(identity, [])})
            current = byval.get(current["parentIl2CppTypeIndex"])
        native_types[key[0] + ":" + key[1]] = {"status": "resolved" if chain else "type_not_found", "inheritance": chain}
    summary = {"prefabs": len(prefabs), "groups": len(grouped), "sourceSkills": len(bindings["bindings"]),
               "sourceSkillsMissingResource": sum(x["reason"] == "missing_resource" for x in missing),
               "sourceSkillsWithoutPrefab": sum(x["reason"] == "source_without_prefab" for x in missing),
               "scriptTypes": len(scripts), "componentInstances": sum(len(p["components"]) for p in prefabs.values()),
               "resolvedComponentInstances": sum(c["script"]["status"] == "resolved" for p in prefabs.values() for c in p["components"]),
               "nativeTypes": len(native_types), "dpsCompiledPrefabs": len(compiled["profiles"]),
               "clientProgramPrefabs": len(programs['programs']),
               "clientProgramRejections": dict(Counter(r['reason'] for r in programs['rejections'].values())),
               "dpsRejections": compiled["rejections"],
               "registeredWebSkillIds": len(set(registered) & set(bindings["bindings"])),
               "staticReachableTemplates": len(reachability["templates"])}
    return {"schemaVersion": 1, "evidenceId": evidence_id, "sourceVersion": evidence.manifest["source_version"],
            "bindingSource": {k: v for k, v in bindings.items() if k != "bindings"},
            "nativeSource": {k: native_summary[k] for k in ["source", "sha256"]},
            "scriptSupplement": {"source": script_table["source"], "sourceVersion": script_table["sourceVersion"],
                                 "bundles": [{k: row[k] for k in ["bundle", "cab", "sha256"]}
                                             for row in script_table["matches"]]},
            "boundary": "Research groups are not semantic equivalence or execution coverage. DPS compilation is distinct from runtime eligibility. Web registrations may be partial. Static template closure omits dynamic references and native callbacks. Cross-release consistency is unverified.",
            "inputs": dict(sorted(inputs.items())), "summary": summary, "webHandlers": handlers,
            "missingBindings": missing, "groups": grouped, "prefabs": prefabs, "nativeTypes": native_types}


def markdown(result):
    stats = result["summary"]
    lines = ["# 客户端公共机制候选索引", "",
             "由 `python -B tools/build_client_mechanism_candidates.py` 复用现有证据生成；顺序仍由[当前计划](../plan.md)维护。",
             "完整结果在 `work/client-logic/mechanism-candidates.json`，按 groupId / prefabId 查询实际字段差异、真实脚本类、模板闭包、消费者与原生方法（含基类）。本表只展示高复用入口，不是另一份完成清单。", "",
             f"源快照：{result['sourceVersion']}；共享证据 `{result['evidenceId']}`。当前 {stats['prefabs']} 个预制体组成 {stats['groups']} 个诊断分组；{stats['componentInstances']} 个组件实例中 {stats['resolvedComponentInstances']} 个由同 CAB 的 MonoScript 精确关联类名。", "",
             f"源表 {stats['sourceSkills']} 个技能，{stats['sourceSkillsMissingResource']} 个缺资源、{stats['sourceSkillsWithoutPrefab']} 个无 prefabId；Web 有 {stats['registeredWebSkillIds']} 个独立技能 ID 登记了可能部分的处理器。旧严格属性编译保留 {stats['dpsCompiledPrefabs']} 个预制体；旧首失败 `{stable(stats['dpsRejections'])}` 仅供历史差异诊断，不再代表公共程序编译覆盖。", "",
             f"公共程序编译接受 {stats['clientProgramPrefabs']} 个完整图，其余精确阻塞 `{stable(stats['clientProgramRejections'])}`。各prefab的 `clientProgram` / `clientProgramRejection` 保留完整IR或具体节点/字段；可执行图还需消费者全部黑板与源身份绑定，见[两端接入范围](../research/client-program-integration.md)。", "",
             "**字段形状、动作集合与差异路径用于分组，不证明语义等价；同一组各成员的实际值、状态、目标、时序仍要核查。原生地址是调查入口，未据此宣称函数体已恢复。**", "",
             "## 批量入口", "", "按缺 Web 处理器的源技能数、预制体数排序，接受过的 DPS 图也保留以供 Web 核查；不改变计划的领域优先级。", "",
             "| 分组 | 预制体 / 源技能 | 无 Web 登记 | DPS 首结果 | 组件 / 代表 ID |",
             "|---|---:|---:|---|---|"]
    for group in result["groups"][:25]:
        names = sorted({x["script"].get("type", x["script"]["status"]).split(".")[-1]
                        for x in group["signature"]["components"]})
        examples = ", ".join(group["prefabIds"][:3])
        lines.append(f"| `{group['id']}` | {group['prefabCount']} / {len(group['skillIds'])} | {len(group['withoutWebRegistration'])} | `{group['signature']['dpsReason']}` | {' + '.join(names)} · `{examples}` |")
    lines += ["", "## 查询与验收边界", "",
              "- `--prefab skchr_glassb_1`：输出该配置、与标准强化的逐字段差异及关联组；模式图另保留`dpsModeGraph`证明链或`dpsModeRejection`具体拒绝，常量属性保留`dpsAttackConstants`，读取完整 JSON 的 `nativeTypes` 可继续定位方法。",
              "- `--group GROUP_ID`：输出组内全部实际 prefabId 和 skillId；不能用代表配置代替检查其余成员。",
              "- `--check`：重建并比较候选 JSON / 本页；运行消费者变化后先重建，不能把旧计数当当前结果。",
              "- 缺脚本表时仅运行 `python -B tools/extract_client_script_types.py`，读取一个已定位匿名包。常规分组不会再解包。",
              "- 输入 SHA 包含原始图、脚本表、源绑定、原生索引、DPS 编译器和 Web 当前加载代码。共享库与本地原图不匹配时拒绝生成。",
              "", "后续按[机制取证清单](../checklists/mechanism-research.md)接入消费者并验证，再回写原个体条目。JP／CN版本、未闭合动态引用、天赋／模组及动作时序继续单列。", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-logic", default="jp-36.7.22-client-logic")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--prefab")
    parser.add_argument("--group")
    args = parser.parse_args()
    target = ROOT / "work/client-logic/mechanism-candidates.json"
    if args.prefab or args.group:
        result = json.loads(target.read_text(encoding="utf-8"))
        selected = select_candidate(result, args.client_logic, prefab=args.prefab, group=args.group)
        print(json.dumps(selected, ensure_ascii=False, indent=2))
        return
    result = build(args.client_logic)
    outputs = {target: json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
               ROOT / "docs/generated/client-mechanism-candidates.md": markdown(result)}
    for path, text in outputs.items():
        if args.check:
            if path.read_text(encoding="utf-8") != text:
                raise ValueError("Candidate inventory drift: " + str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
