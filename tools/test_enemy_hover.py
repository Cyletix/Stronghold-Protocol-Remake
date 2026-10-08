import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from copy import deepcopy
from unittest.mock import patch
from enemy_hover import CONTRACT, compile_hover, load_hover
from enemy_skill_dispatch_status import load_environment_deferrals, skill_dispatch_status


class HoverSourceTests(unittest.TestCase):
    def test_additive_encounter_tags_do_not_hide_raw_input_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'work').mkdir()
            (root/'web').mkdir()
            encounters = root/'web/enemy_encounters.json'
            original = {'enemies': {'enemy': {'hp': 100, 'motion': 'FLY'}}}
            encode = lambda data: (json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n').encode('utf8')
            levels = root/'web/source_battles.json'
            original_levels = {'levels': {'stage': deepcopy(original)},
                               'seasons': {'season': {'decisionEnemies': deepcopy(original['enemies'])}}}
            levels.write_bytes(encode(original_levels))
            record = {'inputs': {
                'encounters': {'path': 'web/enemy_encounters.json', 'sha256': hashlib.sha256(encode(original)).hexdigest()},
                'levels': {'path': 'web/source_battles.json', 'sha256': hashlib.sha256(levels.read_bytes()).hexdigest()}}}
            (root/'work/enemy-hover-contract.json').write_text(json.dumps(record), encoding='utf8')
            current = deepcopy(original)
            current['enemies']['enemy']['sourceTags'] = ['drone']
            encounters.write_bytes(encode(current))
            current_levels = deepcopy(original_levels)
            current_levels['levels']['stage']['enemies']['enemy']['sourceTags'] = ['drone']
            current_levels['seasons']['season']['decisionEnemies']['enemy']['sourceTags'] = ['drone']
            levels.write_bytes(encode(current_levels))
            with patch('enemy_hover.compile_hover', return_value=('enemy', {'compiled': True})):
                self.assertEqual(load_hover(root), ('enemy', {'compiled': True}))
                current['enemies']['enemy']['hp'] = 101
                encounters.write_bytes(encode(current))
                with self.assertRaisesRegex(ValueError, 'web/enemy_encounters.json'):
                    load_hover(root)
                current['enemies']['enemy']['hp'] = 100
                encounters.write_bytes(encode(current))
                current_levels['levels']['stage']['enemies']['enemy']['motion'] = 'WALK'
                levels.write_bytes(encode(current_levels))
                with self.assertRaisesRegex(ValueError, 'web/source_battles.json'):
                    load_hover(root)

    def test_reviewed_source_motion_and_disable_flags(self):
        enemy, data = load_hover()
        self.assertEqual(enemy, 'enemy_2025_syufo')
        self.assertEqual((data['hoverMode'], data['groundMode'], data['motion'], data['defaultMotion']), (0, 1, 'FLY', 'WALK'))
        self.assertEqual(data['landingStun'], .5)
        self.assertEqual(data['disabledBy'], dict(stun=True, freeze=True, groundBound=True, silence=False, levitate=False))
        self.assertEqual(data['unboundRecovery']['name'], 'RecoverAnim')

    def test_whole_source_graph_changes_require_review(self):
        source = json.loads(CONTRACT.read_text(encoding='utf8'))
        cases = [deepcopy(source) for _ in range(3)]
        cases[0]['source']['flyTemplate']['eventToActions']['ON_BUFF_DISABLE'].reverse()
        cases[1]['source']['entity']['sourceSkills'].append(dict(prefabKey='recoveranim'))
        passive = next(c for c in cases[2]['source']['catalog']['components'].values()
            if c['scriptType'].endswith('.PassiveBuffAbility') and c['fields']['_buffs'][0]['templateKey']=='enemy_syufo_fly')
        passive['fields']['_buffs'][0]['isSilenceable'] = 1
        for case in cases:
            with self.subTest(case=cases.index(case)), self.assertRaises(ValueError):
                compile_hover(case)

    def test_unmatched_skill_stays_pending_and_changed_source_reopens(self):
        _,data=load_hover()
        skill=data['unboundRecovery']['id']
        report={'skillDispatch':{'candidateIDs':[skill]}}
        current=load_environment_deferrals(contract_paths=[])
        status=skill_dispatch_status(report,environment_deferrals=current)
        self.assertEqual(status['pendingSkillIDs'],[skill])
        self.assertEqual(status['selectedSkillIDs'],[])
        self.assertEqual(status['deferredSkillIDs'],[skill])
        self.assertEqual(status['executablePendingSkillIDs'],[])
        with patch('enemy_hover.load_hover',side_effect=ValueError('source changed')):
            reopened=load_environment_deferrals(contract_paths=[])
        status=skill_dispatch_status(report,environment_deferrals=reopened)
        self.assertEqual(status['executablePendingSkillIDs'],[skill])
        self.assertEqual(reopened['ignoredContracts'][0]['reason'],'source changed')


if __name__ == '__main__':
    unittest.main()
