"""Pure graph-contract tests; no source caches or runtime execution needed."""
import copy
import unittest

from enemy_mode_events import compile_mode_events


def switch(**fields):
    node = {'$type': 'Torappu.Battle.Action.Nodes+SwitchMode, Assembly-CSharp',
            '_modeIndex': 1, '_loadModeFromBlackboard': False,
            '_restoreDefault': False, '_restartFSM': True, '_targetType': 'TARGET'}
    return dict(node, **fields)


def compile_graph(graph, **kwargs):
    args = dict(template={'templateKey': 'fixture', 'eventToActions': graph},
                blackboard=[{'key': 'mode', 'value': 2.0}], supported_modes=[0, 1, 2],
                default_mode=0, accepted_target_scope='TARGET')
    args.update(kwargs)
    return compile_mode_events(**args)


class ModeEventBoundaries(unittest.TestCase):
    def test_parameter_sources_order_and_restart_are_preserved(self):
        graph = {'ON_BUFF_START': [switch(), switch(_loadModeFromBlackboard=True)],
                 'ON_BUFF_FINISH': [switch(_restoreDefault=True, _loadModeFromBlackboard=True,
                                           _restartFSM=False)]}
        before = copy.deepcopy(graph)
        result = compile_graph(graph)
        self.assertTrue(result['accepted'])
        commands = result['events']['ON_BUFF_START'] + result['events']['ON_BUFF_FINISH']
        self.assertEqual([c['modeIndex'] for c in commands], [1, 2, 0])
        self.assertEqual([c['modeSource'] for c in commands], ['literal', 'local-blackboard', 'restore-default'])
        self.assertEqual([c['restartFSM'] for c in commands], [True, True, False])
        self.assertEqual(commands[1]['sourcePath'], '/eventToActions/ON_BUFF_START/1')
        self.assertEqual(commands[1]['valueSourcePath'], '/blackboard/0/value')
        self.assertEqual(graph, before)

    def test_unknown_sibling_nested_field_or_event_rejects_whole_graph(self):
        fixtures = [
            {'ON_BUFF_START': [switch(), {'$type': 'Torappu.Battle.Action.Nodes+Damage'}]},
            {'ON_BUFF_START': [switch(children=[switch()])]},
            {'ON_BUFF_START': [switch()], 'ON_ABILITY_FINISH': [switch()]},
        ]
        for graph in fixtures:
            with self.subTest(graph=graph):
                result = compile_graph(graph)
                self.assertFalse(result['accepted'])
                self.assertEqual(result['events'], {})
                self.assertTrue(result['rejections'][0]['sourcePath'])

    def test_target_scope_is_never_assumed(self):
        for target in (None, 'BUFF_OWNER', []):
            result = compile_graph({'ON_BUFF_START': [switch()]}, accepted_target_scope=target)
            self.assertFalse(result['accepted'])
            self.assertEqual(result['rejections'][0]['code'], 'target-scope-not-accepted')
        result = compile_graph({'ON_BUFF_START': [switch()]}, accepted_target_scope={'TARGET'})
        self.assertEqual(result['events']['ON_BUFF_START'][0]['targetScope'], 'TARGET')

    def test_local_mode_is_not_borrowed_rounded_or_ambiguously_selected(self):
        boards = [[{'key': 'mode', 'value': 1}, {'key': 'mode', 'value': 1}],
                  {'mode': 1.5}, {'mode': float('nan')}, {'mode': True}, {'mode': '1'}, {'mode': -1}]
        for board in boards:
            with self.subTest(board=board):
                result = compile_graph({'ON_BUFF_START': [switch(_loadModeFromBlackboard=True)]}, blackboard=board)
                self.assertFalse(result['accepted'])
                self.assertEqual(result['events'], {})

    def test_missing_local_key_falls_back_but_present_invalid_key_does_not(self):
        graph = {'ON_BUFF_START': [switch(_loadModeFromBlackboard=True)]}
        for board in ({}, [], {'other.mode': 2}):
            result = compile_graph(graph, blackboard=board)
            self.assertTrue(result['accepted'])
            command = result['events']['ON_BUFF_START'][0]
            self.assertEqual((command['modeIndex'], command['modeSource']), (1, 'literal-fallback'))
        self.assertFalse(compile_graph(graph, blackboard={'mode': None})['accepted'])
        result = compile_graph({'ON_BUFF_START': [switch(_loadModeFromBlackboard=True, _restoreDefault=True)]},
                               blackboard={'mode': 2}, default_mode=1)
        self.assertEqual(result['events']['ON_BUFF_START'][0]['modeIndex'], 1)
        self.assertEqual(result['events']['ON_BUFF_START'][0]['modeSource'], 'restore-default')

    def test_empty_unknown_events_are_noops_and_nonempty_events_need_consumers(self):
        graph = {'ON_BUFF_START': [switch()], 'ON_BUFF_TRIGGER': [], 'FUTURE_EVENT': []}
        result = compile_graph(graph)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['events']['FUTURE_EVENT'], [])
        self.assertTrue(compile_graph({'FUTURE_EVENT': []}, accepted_target_scope=None)['accepted'])
        graph['ON_BUFF_TRIGGER'] = [switch(_modeIndex=2)]
        self.assertFalse(compile_graph(graph)['accepted'])
        result = compile_graph(graph, accepted_events={'ON_BUFF_START', 'ON_BUFF_TRIGGER'})
        self.assertTrue(result['accepted'])
        self.assertEqual(result['events']['ON_BUFF_TRIGGER'][0]['modeIndex'], 2)

    def test_uncompiled_mode_or_unknown_default_rejects_graph(self):
        missing = compile_graph({'ON_BUFF_START': [switch(_modeIndex=4)]})
        self.assertEqual(missing['rejections'][0]['code'], 'mode-actions-uncompiled')
        default = compile_graph({'ON_BUFF_FINISH': [switch(_restoreDefault=True)]}, default_mode=None)
        self.assertEqual(default['rejections'][0]['code'], 'mode-index-invalid')
        self.assertTrue(compile_graph({'ON_BUFF_START': [switch()]}, default_mode=None)['accepted'])

    def test_complete_payload_and_explicit_flags_required(self):
        partial = compile_graph({}, template={'events': [{'event': 'ON_BUFF_START', 'actions': [switch()]}]})
        self.assertFalse(partial['accepted'])
        missing = switch(); del missing['_restartFSM']
        for node in (missing, switch(_restoreDefault=1)):
            self.assertFalse(compile_graph({'ON_BUFF_START': [node]})['accepted'])
        self.assertFalse(compile_graph({})['accepted'])

    def test_receipt_preserves_original_payload_source_path_and_match_status(self):
        receipt = {'status': 'matched-pinned-template',
                   'payload': {'templateKey': 'fixture', 'eventToActions': {'ON_BUFF_START': [switch()]}}}
        result = compile_graph({}, template=receipt)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['events']['ON_BUFF_START'][0]['sourcePath'], '/payload/eventToActions/ON_BUFF_START/0')
        receipt['status'] = 'missing-pinned-template'
        rejected = compile_graph({}, template=receipt)
        self.assertFalse(rejected['accepted'])
        self.assertEqual(rejected['events'], {})


if __name__ == '__main__':
    unittest.main()
