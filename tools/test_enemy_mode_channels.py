"""Channel extraction and mode consensus, without per-enemy exceptions."""
import copy
import unittest

from enemy_mode_channels import extract_channels, compile_channels


def evidence(modes):
    return dict(complete=True, modes=modes)


def channel(key):
    return dict(status='direct-damage-root', fields=dict(_animKey=key, _atkScale=1,
                _attackType=1, _waitForAttackEvent=1, _preDelay=0, _timeMode=0))


def compile(record):
    def timing(animations, key, aliases):
        return dict(duration=2, hit={'Melee': .4, 'Ranged': 1.2, 'Other': .7}[key])
    return compile_channels(record, {}, {}, {}, timing, lambda attacks, speeds: (None, None))


class ChannelContracts(unittest.TestCase):
    def test_different_channels_can_share_their_own_contract_across_all_modes(self):
        mode = dict(channels=dict(combat=channel('Melee'), attack=channel('Ranged')))
        result, reason = compile(evidence([mode, copy.deepcopy(mode)]))
        self.assertIsNone(reason)
        self.assertEqual(result['combat']['timing']['hit'], .4)
        self.assertEqual(result['attack']['timing']['hit'], 1.2)

    def test_never_choose_first_mode_when_a_channel_differs_or_is_missing(self):
        base = dict(channels=dict(combat=channel('Melee'), attack=channel('Ranged')))
        changed = copy.deepcopy(base)
        changed['channels']['attack'] = channel('Other')
        self.assertIsNone(compile(evidence([base, changed]))[0])
        changed['channels']['attack'] = dict(status='absent')
        self.assertIsNone(compile(evidence([base, changed]))[0])
        changed['channels']['attack'] = dict(status='non-damage-or-composite-root')
        self.assertIsNone(compile(evidence([base, changed]))[0])

    def test_reference_identity_and_channel_names_are_preserved(self):
        mode = dict(pathID=10, cabin='local', fields={
            '_combat': dict(m_PathID=20, m_FileID=0),
            '_attack': dict(m_PathID=30, m_FileID=0)})
        components = [mode, dict(pathID=20, cabin='local', fields=channel('Melee')['fields']),
                      dict(pathID=30, cabin='local', fields=channel('Ranged')['fields'])]
        record = dict(enemyId='synthetic', name='test', inEncounterPool=True,
                      evidence=dict(modeCount=1, rootModes=[dict(modeIndex=0, modePathID=10)]))
        result = extract_channels(record, components)
        self.assertEqual(result['modes'][0]['channels']['combat']['pathID'], 20)
        mode['fields']['_combat']['m_FileID'] = 1
        self.assertEqual(extract_channels(record, components)['modes'][0]['channels']['combat']['status'],
                         'unresolved-reference')


if __name__ == '__main__':
    unittest.main()
