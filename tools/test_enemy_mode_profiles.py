"""Independent phases must preserve damage and empty-channel semantics."""
import copy
import unittest

from enemy_mode_profiles import compile_mode_profiles, compile_initial_mode, validate_mode_sources


def root(damage=1, projectile='', scale=1):
    return dict(status='direct-damage-root', scriptPathID=1, fields=dict(_animKey='Attack',
        _waitForAttackEvent=1, _timeMode=0, _preDelay=0, _atkScale=scale,
        _damageType=damage, _projectileKey=projectile))


def compile(modes):
    return compile_mode_profiles(dict(complete=True, modes=modes), {}, {}, {},
        {'1': 'Torappu.Battle.Abilities.RangedAttack'},
        lambda a, f, b, t: dict(duration=2, hit=1),
        lambda fields, speeds: ((dict(key=fields[0]['_projectileKey'], speed=10), None)
            if fields[0]['_projectileKey'] else (None, None)))


class ModeProfiles(unittest.TestCase):
    def test_new_script_mapping_cannot_reuse_old_default_mode_evidence(self):
        source = dict(sourceHashes={'data/prefab.json': 'prefab-v1', 'data/script-types.json': 'types-v1'})
        validate_mode_sources(source, {'prefab.json': 'prefab-v1', 'script-types.json': 'types-v1'})
        with self.assertRaisesRegex(ValueError, 'script-types.json changed'):
            validate_mode_sources(source, {'prefab.json': 'prefab-v1', 'script-types.json': 'types-v2'})

    def test_initial_zero_requires_complete_negative_overrides_in_both_snapshots(self):
        owner = dict(status='matched-entity-and-mode-anchors',
            initialModeZeroEvidence=dict(candidate=True),
            jpSubtree=dict(completeTalentAndSkillCoverage=True, unknownMonoBehaviourTypes=[]),
            talentAndSkillComponents={'skill': dict(typeHierarchy=['Torappu.Battle.BasicSkill'],
                                                   fields=dict(_defaultModeIndex=-1))})
        source = dict(components={'talent': dict(fields=dict(_defaultModeIndex=-1))})
        self.assertEqual(compile_initial_mode(owner, source, {'0': {}}), (0, None))
        changed = copy.deepcopy(owner)
        changed['talentAndSkillComponents']['skill']['fields']['_defaultModeIndex'] = 1
        self.assertEqual(compile_initial_mode(changed, source, {'0': {}})[1], 'requires-active-default-mode-override')
        changed = copy.deepcopy(source)
        changed['components']['talent']['fields']['_defaultModeIndex'] = 1
        self.assertEqual(compile_initial_mode(owner, changed, {'0': {}})[1], 'requires-active-default-mode-override')
        changed = copy.deepcopy(owner); changed['jpSubtree']['completeTalentAndSkillCoverage'] = False
        self.assertEqual(compile_initial_mode(changed, source, {'0': {}})[1], 'incomplete-talent-and-skill-inventory')
        changed = copy.deepcopy(owner); changed['initialModeZeroEvidence']['candidate'] = False
        self.assertEqual(compile_initial_mode(changed, source, {'0': {}})[1], 'default-mode-source-fields-or-script-mismatch')
        self.assertEqual(compile_initial_mode(owner, source, {'1': {}})[1], 'initial-mode-actions-unresolved')

    def test_duplicate_mode_indices_do_not_overwrite_another_entity(self):
        mode = dict(modeIndex=0, channels=dict(combat=root(), attack=root()))
        self.assertEqual(compile([mode, mode]), ({}, {'record': ['ambiguous-mode-indices']}))

    def test_equal_times_keep_different_damage_delivery_and_empty_channels(self):
        modes = [dict(modeIndex=0, channels=dict(combat=dict(status='absent'), attack=root(2, 'bolt'))),
                 dict(modeIndex=1, channels=dict(combat=root(1, '', .26), attack=dict(status='absent')))]
        result, gaps = compile(modes)
        self.assertFalse(gaps)
        self.assertEqual(result['0']['channels']['attack']['damageType'], 'arts')
        self.assertEqual(result['0']['channels']['attack']['delivery'], 'projectile')
        self.assertIsNone(result['0']['channels']['combat'])
        self.assertEqual(result['1']['channels']['combat']['atkScale'], .26)
        self.assertEqual(result['1']['channels']['combat']['delivery'], 'direct')
        self.assertIsNone(result['1']['channels']['attack'])

    def test_unknown_phase_is_not_replaced_by_another_phase(self):
        mode = dict(modeIndex=0, channels=dict(combat=root(), attack=root()))
        other = copy.deepcopy(mode);other['modeIndex']=1
        other['channels']['attack']['scriptPathID']=999
        result, gaps=compile([mode,other])
        self.assertEqual(list(result), ['0'])
        self.assertEqual(gaps['1'], ['attack:unresolved-root'])

    def test_extra_damage_and_buffs_remain_unresolved(self):
        for key,value in [('_activeBuffs', ['extra']), ('_extraDamageType', 2), ('_epDamageRatio', .5), ('_damageType', 5)]:
            mode=dict(modeIndex=0, channels=dict(combat=root(), attack=root()))
            mode['channels']['attack']['fields'][key]=value
            result,gaps=compile([mode])
            self.assertFalse(result)
            self.assertEqual(gaps['0'], ['attack:unresolved-damage-actions'])


if __name__ == '__main__':
    unittest.main()
