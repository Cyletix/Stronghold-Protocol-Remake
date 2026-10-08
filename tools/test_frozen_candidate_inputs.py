"""Candidate containers may change; the frozen candidate and raw inputs may not."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import enemy_bomb_parameters
from frozen_candidate_inputs import frozen_candidate_cache_matches


class FrozenCandidateInputs(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / 'work/enemy-skill-dispatch-candidates.json'
        self.path.parent.mkdir()
        self.candidate = {'id': 'enemy|component', 'enemyId': 'enemy',
                          'fields': {'_maxAnimScale': 1, 'values': [1, 2]}}
        self.cache = {'inputs': {'compiler': 'old'}, 'candidates': {
            self.candidate['id']: copy.deepcopy(self.candidate), 'unrelated': {'field': 3}}}
        self.write_cache(self.cache)
        self.digest = hashlib.sha256(self.path.read_bytes()).hexdigest()

    def write_cache(self, value):
        self.path.write_text(json.dumps(value, indent=2), encoding='utf8')

    def matches(self):
        return frozen_candidate_cache_matches(self.path, self.digest, self.candidate)

    def test_original_cache_and_metadata_only_change_match(self):
        self.assertTrue(self.matches())
        self.cache['inputs']['compiler'] = 'new'
        self.cache['counts'] = {'notSource': True}
        self.write_cache(self.cache)
        self.assertTrue(self.matches())

    def test_unrelated_candidate_changes_do_not_invalidate_frozen_candidate(self):
        self.cache['candidates']['unrelated'] = {'different': [7, 8]}
        self.write_cache(self.cache)
        self.assertTrue(self.matches())

    def test_target_source_field_change_rejected_including_type_changes(self):
        for changed in (2, True, 1.0, None):
            with self.subTest(changed=changed):
                current = copy.deepcopy(self.cache)
                current['candidates'][self.candidate['id']]['fields']['_maxAnimScale'] = changed
                self.write_cache(current)
                self.assertFalse(self.matches())
        current = copy.deepcopy(self.cache)
        current['candidates'][self.candidate['id']]['fields']['values'].reverse()
        self.write_cache(current)
        self.assertFalse(self.matches())

    def test_missing_target_or_added_target_field_is_rejected(self):
        current = copy.deepcopy(self.cache)
        del current['candidates'][self.candidate['id']]
        self.write_cache(current)
        self.assertFalse(self.matches())
        current['candidates'][self.candidate['id']] = dict(self.candidate, newField=0)
        self.write_cache(current)
        self.assertFalse(self.matches())

    def test_absent_frozen_identity_and_malformed_container_rejected(self):
        self.assertFalse(frozen_candidate_cache_matches(self.path, self.digest, {}))
        self.path.write_text('not json', encoding='utf8')
        self.assertFalse(self.matches())
        self.path.unlink()
        self.assertFalse(self.matches())

    def test_loader_still_rejects_changed_raw_input(self):
        raw = self.root / 'work/raw.json'
        raw.write_text('{"source":1}', encoding='utf8')
        record = {'candidate': self.candidate, 'inputs': {
            'work/enemy-skill-dispatch-candidates.json': self.digest,
            'work/raw.json': hashlib.sha256(raw.read_bytes()).hexdigest()}}
        contract = self.root / 'contract.json'
        contract.write_text(json.dumps(record), encoding='utf8')
        self.cache['inputs']['compiler'] = 'new'
        self.write_cache(self.cache)
        with patch.object(enemy_bomb_parameters, 'ROOT', self.root), \
                patch.object(enemy_bomb_parameters, 'CONTRACT', contract), \
                patch.object(enemy_bomb_parameters, 'compile_parameters', return_value={'compiled': True}):
            self.assertEqual(enemy_bomb_parameters.load_parameters(), ('enemy', {'compiled': True}))
            raw.write_text('{"source":2}', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'work/raw.json'):
                enemy_bomb_parameters.load_parameters()


if __name__ == '__main__':
    unittest.main()
