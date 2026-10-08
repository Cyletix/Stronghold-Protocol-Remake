"""No raw sources are used by the auto-trigger cache contract test."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import inspect_enemy_mode_auto_triggers as inspector


class AutoTriggerCacheTests(unittest.TestCase):
    def test_unchanged_skips_large_parse_and_status_change_skips_analysis(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {key: root / (key + ".json") for key in ("plan", "bindings", "ownership")}
            source = {"plan": {"enemies": {}, "memberIDs": [], "operators": {}},
                      "bindings": {"templates": {}}, "ownership": {"enemies": {}}}
            for key, value in source.items():
                paths[key].write_text(json.dumps(value), encoding="utf-8")
            output = root / "candidates.json"
            with patch.object(inspector, "ROOT", root), patch.object(inspector, "INPUTS", paths), patch.object(inspector, "OUTPUT", output):
                first, cached = inspector.ensure_candidates()
                self.assertFalse(cached)
                before = output.read_bytes()
                read_text = Path.read_text

                def forbid_input_parse(path, *args, **kwargs):
                    self.assertNotIn(path, paths.values(), "unchanged input was reparsed")
                    return read_text(path, *args, **kwargs)

                with patch.object(inspector, "build_candidates", side_effect=AssertionError("reanalyzed")), patch.object(Path, "read_text", forbid_input_parse):
                    second, cached = inspector.ensure_candidates()
                self.assertTrue(cached)
                self.assertEqual(before, output.read_bytes())
                self.assertEqual(first, second)
                source["plan"]["bindingIntegration"] = {"version": "new"}
                source["plan"]["counts"] = {"processed": 100}
                paths["plan"].write_text(json.dumps(source["plan"]), encoding="utf-8")
                with patch.object(inspector, "build_candidates", side_effect=AssertionError("status change reanalyzed sources")):
                    third, cached = inspector.ensure_candidates()
                self.assertTrue(cached)
                self.assertEqual(first["candidates"], third["candidates"])
                self.assertEqual(first["inputs"]["sourceFingerprints"], third["inputs"]["sourceFingerprints"])
                self.assertNotEqual(first["inputs"]["fileHashes"], third["inputs"]["fileHashes"])


if __name__ == "__main__":
    unittest.main()
