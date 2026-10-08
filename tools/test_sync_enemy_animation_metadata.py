import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from sync_enemy_animation_metadata import combine_variants, parse_json_blob, resolve_metadata_sources


class MetadataAnimationTests(unittest.TestCase):
    def test_json_duration_and_attack_event(self):
        value = dict(skeleton=dict(spine='3.8.99'), bones=[dict(name='root')], events={'OnAttack': {}},
            animations={'Attack': dict(bones={'root': {'rotate': [{'time': 0}, {'time': 1.5}]}},
                                      events=[dict(name='OnAttack', time=.4)])})
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / 'no-extension'
            path.write_text(json.dumps(value), encoding='utf-8')
            parsed = parse_json_blob(path)
        self.assertEqual(parsed['animations']['Attack'],
                         dict(duration=1.5, events=[dict(event='OnAttack', t=.4)]))

    def test_exact_asset_id_and_explicit_resource_path_only(self):
        models = dict(storageDirectory={'Enemy': 'models_enemies'}, data={
            'folder': dict(type='Enemy', assetId='enemy_a', assetList={'.skel': 'different.skel'}),
            'variant': dict(type='Enemy', assetId='enemy_a', assetList={'.skel': 'second'}),
            'missing': dict(type='Enemy', assetId='enemy_b', assetList={}),
        })
        tree = dict(tree=[dict(type='blob', path='models_enemies/folder/different.skel', sha='one'),
                          dict(type='blob', path='models_enemies/variant/second', sha='two'),
                          dict(type='blob', path='models_enemies/other/enemy_a_2.skel', sha='guess')])
        matched, unresolved = resolve_metadata_sources({'enemy_a', 'enemy_a_2', 'enemy_b'}, models, tree)
        self.assertEqual([row['gitBlob'] for row in matched['enemy_a']], ['one', 'two'])
        self.assertEqual(unresolved['enemy_a_2'][0]['reason'], 'assetId-not-in-metadata')
        self.assertEqual(unresolved['enemy_b'][0]['reason'], 'no-explicit-skel-asset')
        with self.assertRaises(ValueError):
            resolve_metadata_sources({'enemy_a'}, models, dict(tree=tree['tree'], truncated=True))

    def test_conflicting_variants_retained_without_selecting_one(self):
        candidates = [dict(assetId='enemy_a', gitBlob='one', path='a'),
                      dict(assetId='enemy_a', gitBlob='two', path='b')]
        shared = dict(duration=1.0, events=[])
        first = dict(version='3.8.99', sha256='first', animations={
            'Idle': shared, 'Attack': dict(duration=1.0, events=[dict(event='OnAttack', t=.2)])})
        second = dict(version='3.8.99', sha256='second', animations={
            'Idle': shared, 'Attack': dict(duration=1.0, events=[dict(event='OnAttack', t=.4)]),
            'Skill': shared})
        result, variants, errors = combine_variants(candidates, {'one': first, 'two': second})
        self.assertEqual(result['animations'], {'Idle': shared})
        self.assertEqual(len(variants), 2)
        self.assertEqual({row['animation'] for row in errors}, {'Attack', 'Skill'})
        result, variants, errors = combine_variants(candidates, {'one': first,
            'two': dict(error='parse-failed', reason='unsupported')})
        self.assertIsNone(result)
        self.assertEqual(len(variants), 1)
        self.assertEqual(errors[0]['error'], 'parse-failed')


if __name__ == '__main__':
    unittest.main()
