"""Batch admission scope and preservation boundaries, without running compilers."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build_garrison_skill_batches as batch
from garrison_skill_scope import load_scope, INDEX


class GarrisonBatches(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ark-garrison-scope-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rows = [dict(id='fixed', fixed=True, scope='mode', skills=[dict(id='old'), dict(id='new')]),
                     dict(id='hidden', fixed=False, scope='mode', skills=[dict(id='new')]),
                     dict(id='library', fixed=False, scope='library', skills=[dict(id='outside')])]
        self.write(INDEX, dict(operators=self.rows))

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value), encoding='utf-8')

    def provider(self, path, profiles):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('// generated\nwindow.Test=' + json.dumps(dict(profiles=profiles)) + ';\n', encoding='utf-8')

    def fixture(self):
        scope = load_scope(self.root)
        self.write(batch.BASELINE, dict(scope=scope,
            explicitAssociations=[dict(charId='fixed', skillId='old', fixed=True)],
            providerSkillIds={path: ['old'] for _, path, _ in batch.PROVIDERS.values()},
            providerMemberIds={path: ['fixed/old'] for _, path, _ in batch.PROVIDERS.values()}))
        for _, path, _ in batch.PROVIDERS.values():
            self.provider(path, dict(old=dict(charIds=['fixed']), new=dict(charIds=['fixed', 'hidden'])))
        return scope

    def build_report(self):
        with patch.object(batch, 'ROOT', self.root), patch.object(batch, 'load_scope', lambda: load_scope(self.root)):
            return batch.report()

    def test_scope_includes_hidden_but_manual_progress_does_not_change_membership_hash(self):
        before = load_scope(self.root)
        self.assertEqual(before['charIds'], ['fixed', 'hidden'])
        self.assertEqual(before['fixedCharIds'], ['fixed'])
        for row in self.rows:
            row['name'] = 'Changed description'
            for skill in row['skills']:
                skill['explicitHandler'] = True
        self.write(INDEX, dict(operators=list(reversed(self.rows))))
        self.assertEqual(load_scope(self.root), before)

    def test_duplicate_identity_is_not_silently_deduplicated(self):
        self.write(INDEX, dict(operators=self.rows + [self.rows[0]]))
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            load_scope(self.root)

    def test_shared_providers_count_one_path_per_operator_skill(self):
        self.fixture()
        result = self.build_report()
        self.assertEqual(result['stats']['fixedNewExplicit'], 1)
        self.assertEqual(result['stats']['expandedNewExplicit'], 2)
        self.assertEqual(result['stats']['expandedPendingAfter'], 0)
        self.assertEqual(len(result['members']['fixed/new']['providers']), len(batch.PROVIDERS))

    def test_no_new_library_bindings_and_no_silent_removal(self):
        self.fixture()
        path = batch.PROVIDERS['next-attack'][1]
        self.provider(path, dict(old=dict(charIds=['fixed']), outside=dict(charIds=['library'])))
        with self.assertRaisesRegex(ValueError, 'outside Garrison'):
            self.build_report()
        self.provider(path, dict(new=dict(charIds=['fixed'])))
        with self.assertRaisesRegex(ValueError, 'removed'):
            self.build_report()

    def test_changed_roster_cannot_reuse_an_unrelated_progress_baseline(self):
        self.fixture()
        self.rows[0]['skills'].append(dict(id='another'))
        self.write(INDEX, dict(operators=self.rows))
        with self.assertRaisesRegex(ValueError, 'identity scope changed'):
            self.build_report()

    def test_retained_profile_cannot_silently_lose_its_original_owner(self):
        self.fixture()
        path = batch.PROVIDERS['next-attack'][1]
        self.provider(path, dict(old=dict(charIds=[]), new=dict(charIds=['fixed', 'hidden'])))
        with self.assertRaisesRegex(ValueError, 'identity bindings were removed'):
            self.build_report()


if __name__ == '__main__':
    unittest.main()
