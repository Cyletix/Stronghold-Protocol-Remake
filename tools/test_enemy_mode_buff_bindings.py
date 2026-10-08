"""Pure source-binding checks; no database, APK or runtime access."""
from copy import deepcopy
import json
import unittest
from unittest.mock import patch

import enemy_mode_buff_bindings as bindings


def switch(**fields):
    return {'$type': 'Torappu.Battle.Action.Nodes+SwitchMode, Assembly-CSharp', **fields}


def usage(enemy='one', bb=None, field='/_buffs/0/templateKey'):
    return dict(enemyId=enemy, componentKey='component', fieldPath=field, blackboard=bb or [])


def template(events, key='same'):
    return dict(payload=dict(templateKey=key, eventToActions=events), url='pinned-cached-source',
                payloadSha256='synthetic-hash')


class BuffBindings(unittest.TestCase):
    def test_complete_event_graph_preserves_order_and_nested_siblings(self):
        events = {'OnAttach': [dict(sequence=[switch(_modeIndex=1), {'$type': 'OtherAction', 'value': 9}])],
                  'OnTick': [dict(sequence=[{'$type': 'Before'}, switch(_modeIndex=2), {'$type': 'After'}]),
                             {'$type': 'KeepThisSibling'}],
                  'OnRemove': [switch(_restoreDefault=True)]}
        source = template(events)
        original = deepcopy(source)
        row = bindings.bind_templates({'same': [usage()]}, {'same': source})['templates']['same']
        self.assertEqual([x['event'] for x in row['events']], ['OnAttach', 'OnTick', 'OnRemove'])
        self.assertEqual({x['event']: x['actions'] for x in row['events']}, events)
        self.assertEqual(source, original)
        self.assertEqual([x['siblingActionCount'] for x in row['switchModeNodes']], [2, 3, 1])
        self.assertEqual([x['eventActionCount'] for x in row['switchModeNodes']], [1, 2, 1])
        self.assertEqual(row['switchModeNodes'][0]['fieldPath'], '/eventToActions/OnAttach/0/sequence/0')
        self.assertEqual(len(row['parameterBindings']), 3)

    def test_blackboard_values_are_local_to_each_usage_and_duplicate_keys_stay_unresolved(self):
        requests = {'same': [usage('one', [dict(key='mode', value=1)]),
            usage('two', [dict(key='mode', value=2)], '/_buffs/1/templateKey'), usage('missing'),
            usage('duplicate', [dict(key='mode', value=4), dict(key='mode', value=4)]),
            usage('string-only', [dict(key='mode', valueStr='7')])]}
        source = template({'OnAttach': [switch(_loadModeFromBlackboard=True, _modeIndex=99, _targetType=3)]})
        rows = bindings.bind_templates(requests, {'same': source})['templates']['same']['parameterBindings']
        self.assertEqual([r['candidateModeIndex'] for r in rows], [1, 2, 99, None, None])
        self.assertEqual([r['parameterStatus'] for r in rows], ['unique-local-mode-value'] * 2 +
                         ['literal-fallback-missing-local-mode'] + ['local-mode-value-unresolved'] * 2)
        self.assertEqual([r['usageFieldPath'] for r in rows[:2]], ['/_buffs/0/templateKey', '/_buffs/1/templateKey'])
        self.assertTrue(all(r['targetScope'] == 3 and not r['implementationReady'] for r in rows))

    def test_restore_default_wins_and_literal_zero_is_not_missing(self):
        events = {'OnAttach': [switch(_modeIndex=0), switch(_modeIndex=-1),
            switch(_restoreDefault=True, _loadModeFromBlackboard=True, _modeIndex=8), switch()]}
        rows = bindings.bind_templates({'same': [usage(bb=[dict(key='mode', value=4)])]},
            {'same': template(events)})['templates']['same']['parameterBindings']
        self.assertEqual([r['candidateModeIndex'] for r in rows], [0, -1, None, None])
        self.assertEqual(rows[2]['parameterStatus'], 'requires-active-default-mode')
        self.assertTrue(all(not r['implementationReady'] for r in rows))

    def test_missing_key_does_not_use_other_template_or_source_and_queries_are_pinned(self):
        result = bindings.bind_templates({'missing': [usage()]}, {'other': template({}, 'other')})
        self.assertEqual(result['templates']['missing']['status'], 'missing-pinned-template')
        self.assertEqual(result['counts']['matchedTemplates'], 0)
        with self.assertRaises(ValueError):
            bindings.bind_templates({'same': [usage()]}, {'same': template({}, 'wrong-payload-key')})

        class Connection:
            calls = []
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, query, params):
                self.calls.append((query, params))
                return [('same', 'pinned', json.dumps(dict(templateKey='same', eventToActions={})))]

        connection = Connection()
        with patch.object(bindings, 'CommunityStore') as store:
            store.return_value._connect.return_value = connection
            rows = bindings.query_templates(['same', 'same', 'missing'])
            store.assert_called_once_with(bindings.SOURCE_ID)
        self.assertEqual(set(rows), {'same'})
        self.assertEqual(connection.calls[0][1], [bindings.ORIGIN, 'missing', 'same'])
        self.assertIn('r.origin=?', connection.calls[0][0])


if __name__ == '__main__':
    unittest.main()
