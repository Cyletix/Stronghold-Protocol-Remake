"""Type-driven repetition and source animation consensus boundaries."""
import copy
import unittest

from enemy_hit_sequences import compile_hit_sequence, PREFIX, timing_contract
from build_external_combat_data import animation_profile, resolve_action_timing, root_modes_agree
from enemy_mode_channels import compile_channels


class HitSequences(unittest.TestCase):
    def setUp(self):
        self.fields = dict(_atkScale=1, _additionalTimes=1,
            _waitAttackEventForAllAttacks=1, _splitDamage=0, _triggerDelta=0)
        self.animation = dict(animation='Attack', duration=2, hit=.4, observedHits=[.4, 1.2])
        self.types = {'1': PREFIX + 'MeleeAttack', '2': PREFIX + 'MultiMeleeAttack'}

    def test_plain_cast_does_not_repeat_from_extra_animation_events(self):
        result = compile_hit_sequence(dict(_atkScale=.26), 1, self.animation, self.types)
        self.assertEqual(result['hit'], .4)
        self.assertNotIn('hits', result)
        self.assertEqual(result['atkScale'], .26)
        self.assertIsNone(compile_hit_sequence(self.fields, 1, self.animation, self.types))
        self.assertIsNone(compile_hit_sequence(self.fields, 999, self.animation, self.types))

    def test_fixed_multi_events_require_complete_nondynamic_contract(self):
        result = compile_hit_sequence(self.fields, 2, self.animation, self.types)
        self.assertEqual(result['hits'], [.4, 1.2])
        for key, value in [('_additionalTimes', 2), ('_splitDamage', 1),
                ('_triggerDelta', .1), ('_refreshTimesOnCastStart', 1),
                ('_waitAttackEventForAllAttacks', 0), ('_activeBuffs', ['buff'])]:
            with self.subTest(key=key):
                self.assertIsNone(compile_hit_sequence(dict(self.fields, **{key: value}), 2, self.animation, self.types))
        later = dict(result, hits=[.4, 1.5])
        self.assertNotEqual(timing_contract(result), timing_contract(later))

    def test_directional_events_and_alias_speed_must_agree(self):
        def anim(hits):
            return dict(duration=2, events=[dict(event='OnAttack', t=t) for t in hits])
        animations = {'Attack_A': anim([.4, 1.2]), 'Attack_B': anim([.4, 1.2])}
        self.assertIsNone(animation_profile(animations, 'Attack'))
        result = animation_profile(animations, 'Logical', {'Logical': {('Attack', 2)}}, True)
        self.assertEqual(result['observedHits'], [.2, .6])
        animations['Attack_B'] = anim([.4, 1.5])
        self.assertIsNone(animation_profile(animations, 'Attack', allow_multiple=True))
        self.assertIsNone(animation_profile(animations, '', allow_multiple=True))

    def test_missing_multi_event_does_not_fall_back_to_plain_single_timing(self):
        animation = {'Attack': dict(duration=2, events=[dict(event='OnAttack', t=.4)])}
        fields = dict(self.fields, _animKey='Attack')
        self.assertIsNone(resolve_action_timing(animation, fields, {}, 2, self.types))
        self.assertEqual(resolve_action_timing(animation, fields, {}, 1, self.types)['hit'], .4)

    def test_later_hits_cannot_be_flattened_across_modes(self):
        root = dict(status='direct-damage-root', scriptPathID=2,
            fields=dict(_waitForAttackEvent=1, _timeMode=0, _preDelay=0, mode=0))
        first = dict(channels=dict(combat=root, attack=copy.deepcopy(root)))
        second = copy.deepcopy(first)
        second['channels']['attack']['fields']['mode'] = 1
        def action_timing(animations, fields, aliases, script):
            return dict(duration=2, hit=.4, hits=[.4, 1.2 + fields['mode'] * .3])
        result, reasons = compile_channels(dict(complete=True, modes=[first, second]), {}, {}, {},
            None, lambda fields, speeds: (None, None), action_timing_of=action_timing)
        self.assertIsNone(result)
        self.assertIn('attack:mode-dependent-contract', reasons)

    def test_equal_timestamps_do_not_hide_phase_damage_and_delivery_changes(self):
        components = [dict(pathID=1, fields=dict(_atkScale=1, _damageType=2, _projectileKey='bolt')),
                      dict(pathID=2, fields=dict(_atkScale=1, _damageType=1, _projectileKey=''))]
        record = dict(evidence=dict(rootModes=[dict(actionPathIDs=[1]), dict(actionPathIDs=[2])]))
        self.assertFalse(root_modes_agree(record, components))
        record['evidence']['rootModes'] = [dict(actionPathIDs=[1, 2]), dict(actionPathIDs=[2, 1])]
        self.assertTrue(root_modes_agree(record, components))


if __name__ == '__main__':
    unittest.main()
