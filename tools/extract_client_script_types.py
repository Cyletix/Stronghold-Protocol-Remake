"""Resolve the inspected skill bundle's external MonoScript table, once.

This reads one known anonymous bundle, not all character/enemy resources. The
result preserves the CAB scope of 64-bit Unity pointers and never changes an
existing immutable evidence database or a runtime consumer.
"""
from __future__ import annotations
import argparse
import json
import zipfile
from pathlib import Path
from extract_client_logic import ROOT, load_bundle, safe, sha

BUNDLE = "assets/AB/Android/anon/787628af8cacd60eaae9af1d9c0afa14.bin"
BUNDLE_SHA256 = "cec3e04633d6166a305bc4fd3c20cc36add42c77caffacdb9cb2c7e069053ea3"
CAB = "CAB-658d74aab777086fc32b93f385be999a"


def extract():
    with zipfile.ZipFile(ROOT / "work/main.obb") as archive:
        blob = archive.read(BUNDLE)
    if sha(blob) != BUNDLE_SHA256:
        raise ValueError("MonoScript bundle differs from the inspected JP snapshot")
    env = load_bundle(blob)
    if CAB not in env.files:
        raise ValueError("Inspected MonoScript CAB is absent")
    scripts = {str(obj.path_id): safe(obj.read_typetree())
               for obj in env.files[CAB].objects.values() if obj.type.name == "MonoScript"}
    if not scripts or scripts["6851783972288338031"]["m_ClassName"] != "CastSkill":
        raise ValueError("Canonical CastSkill script binding changed")
    return {"schemaVersion": 1, "source": "work/main.obb",
            "sourceVersion": "JP 36.7.22 (local XAPK label; bundle hash authoritative)",
            "boundary": "Names identify serialized components; method bodies and behavior require separate evidence.",
            "matches": [{"bundle": BUNDLE, "cab": CAB, "sha256": sha(blob),
                         "scripts": dict(sorted(scripts.items()))}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "work/client-logic/script-types.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = args.output.resolve()
    if not target.is_relative_to((ROOT / "work").resolve()):
        raise ValueError("Research output must stay below work/")
    result = extract()
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if target.read_text(encoding="utf-8") != text:
            raise ValueError("MonoScript index drift")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    print(json.dumps({"scripts": sum(len(x["scripts"]) for x in result["matches"]),
                      "output": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
