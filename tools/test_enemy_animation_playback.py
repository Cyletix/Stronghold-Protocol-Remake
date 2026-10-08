"""Native basic animation caps: source eligibility and cross-mode boundaries."""
import copy
import unittest

from build_external_combat_data import resolve_action_timing
from enemy_animation_playback import playback_contract, summarize_playback, RULE
from enemy_hit_sequences import PLAIN, MULTI, PREFIX, timing_contract
from enemy_mode_channels import compile_channels, resolve_channel_record


class AnimationPlayback(unittest.TestCase):
    def setUp(self):
        self.fields = dict(_animKey='Attack', _timeMode=0,
                           _waitForAttackEvent=1, _maxAnimScale=1)
        self.types = {'1': PREFIX + 'RangedAttack', '2': PREFIX + 'MultiRangedAttack'}
        self.animations = {'Attack': dict(duration=1,
            events=[dict(event='OnAttack', t=.2666667)])}

    def test_all_exact_plain_and_multi_types_keep_source_cap(self):
        for typename in sorted(PLAIN | MULTI):
            for maximum in (-1, .1, 1, 2.5):
                with self.subTest(typename=typename, maximum=maximum):
                    result, reason = playback_contract(dict(self.fields, _maxAnimScale=maximum),
                                                       7, {'7': typename})
                    self.assertIsNone(reason)
                    self.assertEqual(result, dict(rule=RULE, timeMode=0,
                                                  minScale=.1, maxScale=maximum))

    def test_missing_unknown_and_custom_types_are_not_guessed(self):
        for types, expected in [({}, 'missing-or-ambiguous-ability-type'),
                ({'1': PREFIX + 'CustomRangedAttack'}, 'unsupported-ability-type')]:
            result, reason = playback_contract(self.fields, 1, types)
            self.assertIsNone(result)
            self.assertEqual(reason, expected)
            timing = resolve_action_timing(self.animations, self.fields, {}, 1, types)
            self.assertEqual(timing, dict(animation='Attack', duration=1, hit=.2666667))

    def test_required_source_fields_cannot_take_implicit_defaults(self):
        for key, reason in [('_timeMode', 'missing-time-mode'),
                ('_waitForAttackEvent', 'missing-wait-for-attack-event'),
                ('_maxAnimScale', 'missing-max-animation-scale')]:
            fields = {k: v for k, v in self.fields.items() if k != key}
            self.assertEqual(playback_contract(fields, 1, self.types), (None, reason))
            self.assertNotIn('playback', resolve_action_timing(self.animations, fields, {}, 1, self.types))

    def test_nonzero_modes_eventless_casts_and_invalid_caps_are_rejected(self):
        for key, values in [('_timeMode', [1, 2, 3, '0', False, 0.0]),
                            ('_waitForAttackEvent', [0, 2, '1', True, 1.0]),
                            ('_maxAnimScale', [None, '1', True, False, 0, -.5, .099,
                                               float('nan'), float('inf'), -float('inf')])]:
            for value in values:
                with self.subTest(key=key, value=value):
                    result, reason = playback_contract(dict(self.fields, **{key: value}), 1, self.types)
                    self.assertIsNone(result)
                    self.assertTrue(reason)

    def test_drone_source_seconds_are_preserved_and_multi_requires_all_events(self):
        timing = resolve_action_timing(self.animations, self.fields, {}, 1, self.types)
        self.assertEqual((timing['duration'], timing['hit']), (1, .2666667))
        self.assertEqual(timing['playback']['maxScale'], 1)
        fields = dict(self.fields, _atkScale=1, _additionalTimes=1,
                      _waitAttackEventForAllAttacks=1, _splitDamage=0)
        self.assertIsNone(resolve_action_timing(self.animations, fields, {}, 2, self.types))
        animations = copy.deepcopy(self.animations)
        animations['Attack']['events'].append(dict(event='OnAttack', t=.7))
        multi = resolve_action_timing(animations, fields, {}, 2, self.types)
        self.assertEqual(multi['hits'], [.2666667, .7])
        self.assertEqual(multi['playback'], timing['playback'])

    def test_modes_with_different_caps_cannot_be_flattened(self):
        def mode(cap):
            root = dict(status='direct-damage-root', scriptPathID=1,
                        fields=dict(self.fields, _maxAnimScale=cap))
            return dict(channels=dict(combat=root, attack=copy.deepcopy(root)))
        action_timing = lambda animations, fields, aliases, script: resolve_action_timing(
            animations, fields, aliases, script, self.types)
        result, reasons = compile_channels(dict(complete=True, modes=[mode(1), mode(-1)]),
            self.animations, {}, {}, None, lambda fields, speeds: (None, None),
            action_timing_of=action_timing)
        self.assertIsNone(result)
        self.assertIn('attack:mode-dependent-contract', reasons)
        first = action_timing(self.animations, self.fields, {}, 1)
        second = action_timing(self.animations, dict(self.fields, _maxAnimScale=-1), {}, 1)
        self.assertNotEqual(timing_contract(first), timing_contract(second))
        self.assertNotEqual(timing_contract(first), timing_contract(
            {key: value for key, value in first.items() if key != 'playback'}))

    def test_summary_separates_slots_enemies_skills_and_independent_provider(self):
        native = resolve_action_timing(self.animations, self.fields, {}, 1, self.types)
        unknown = dict(duration=1, hit=.2)
        independent = dict(duration=1, hit=.3)
        enemies = {
            'native': dict(timing=native, modes={'0': dict(channels={'attack': dict(timing=native)})}),
            'unknown': dict(timing=unknown),
            'nopre': dict(timing=independent, preAttack={'rule': 'existing-independent-provider'}),
            'skill-only': dict(skills=[dict(action=dict(timing=native))]),
        }
        result = summarize_playback(enemies, {'native', 'nopre'},
                                    {id(unknown): 'missing-max-animation-scale'})
        self.assertEqual(result['native'], dict(timingSlots=2, enemies=1,
                                               encounterTimingSlots=2, encounterEnemies=1))
        self.assertEqual(result['fallback'], dict(timingSlots=2, enemies=2,
                                                 encounterTimingSlots=1, encounterEnemies=1))
        self.assertEqual(set(result['fallbackReasons']),
            {'missing-max-animation-scale', 'independent-pre-attack-animation-provider'})
        self.assertNotIn('playback', independent)

    def test_old_channel_cache_members_do_not_hide_complete_two_channel_roots(self):
        ref = lambda pid: dict(m_FileID=0, m_PathID=pid)
        components = [
            dict(pathID=10, cabin='source', fields=dict(_combat=ref(20), _attack=ref(30))),
            dict(pathID=20, cabin='source', scriptPathID=1,
                 fields=dict(self.fields, _atkScale=1, _attackType=1, _maxAnimScale=1)),
            dict(pathID=30, cabin='source', scriptPathID=1,
                 fields=dict(self.fields, _atkScale=1, _attackType=1, _maxAnimScale=-1)),
        ]
        root = dict(enemyId='source-enemy', name='source', inEncounterPool=True,
                    evidence=dict(modeCount=1, rootModes=[dict(modeIndex=0, modePathID=10)]))
        record = resolve_channel_record(None, root, components)
        result, reason = compile_channels(record, self.animations, {}, {}, None,
            lambda fields, speeds: (None, None), action_timing_of=lambda a, f, al, si:
                resolve_action_timing(a, f, al, si, self.types))
        self.assertIsNone(reason)
        self.assertEqual(result['combat']['timing']['playback']['maxScale'], 1)
        self.assertEqual(result['attack']['timing']['playback']['maxScale'], -1)
        self.assertNotEqual(timing_contract(result['combat']['timing']), timing_contract(result['attack']['timing']))
        self.assertIsNone(resolve_channel_record(None, None, components))


if __name__ == '__main__':
    unittest.main()
