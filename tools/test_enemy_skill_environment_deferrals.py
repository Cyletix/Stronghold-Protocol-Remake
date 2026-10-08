"""Environment-gated skills stay pending without consuming executable batches."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from enemy_skill_dispatch_status import load_environment_deferrals, skill_dispatch_status
from advance_enemy_modes import integrate_runtime_status, prepare_batch, apply_foundation_priority
from prioritize_garrison_foundations import build_priority


class EnvironmentDeferralTests(unittest.TestCase):
    def fixture(self, root):
        root = Path(root)
        paths = {'priority':'work/priority.json', 'catalog':'work/catalog.json',
                 'ownership':'work/ownership.json', 'encounters':'web/enemy_encounters.json'}
        inputs = {}
        for key, relative in paths.items():
            source = root/relative
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text('{}', encoding='utf8')
            inputs[key] = dict(path=relative, sha256=hashlib.sha256(source.read_bytes()).hexdigest())
        fingerprint = hashlib.sha256(json.dumps(inputs, sort_keys=True,
            separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        contract = dict(inputs=inputs, sourceFingerprint=fingerprint,
            skillIDs=['enemy_a|gated'], skills={'enemy_a|gated':{'triggerType':'NeverTrigger'}},
            runtimeGate=dict(status='environment-gated', garrisonEntryReachable=False,
                requiredMarker='environment[missing]', reason='No current source provider'))
        path = root/'work/contract.json'
        path.write_text(json.dumps(contract), encoding='utf8')
        return path, contract

    def test_current_contract_defers_and_changed_source_reopens(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            current = load_environment_deferrals(root, ['work/contract.json'])
            self.assertEqual(current['contracts'][0]['skillIDs'], ['enemy_a|gated'])
            (root/'work/catalog.json').write_text('{"changed":true}', encoding='utf8')
            stale = load_environment_deferrals(root, ['work/contract.json'])
            self.assertEqual(stale['contracts'], [])
            self.assertIn('source-input-changed:', stale['ignoredContracts'][0]['reason'])

    def test_new_runtime_marker_releases_deferral_for_provider_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            provider = root/'web/src/provider.js'
            provider.parent.mkdir(parents=True)
            provider.write_text('const marker = "environment[missing]";', encoding='utf8')
            released = load_environment_deferrals(root, ['work/contract.json'])
            self.assertEqual(released['contracts'], [])
            self.assertEqual(released['ignoredContracts'][0]['reason'], 'runtime-marker-now-present-recheck-provider')

    def test_invalid_fingerprint_or_non_never_skill_cannot_hide_work(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path, contract = self.fixture(root)
            contract['sourceFingerprint'] = 'stale'
            path.write_text(json.dumps(contract), encoding='utf8')
            self.assertEqual(load_environment_deferrals(root, ['work/contract.json'])['contracts'], [])
            path, contract = self.fixture(root)
            contract['skills']['enemy_a|gated']['triggerType'] = 'AlwaysTrigger'
            path.write_text(json.dumps(contract), encoding='utf8')
            self.assertEqual(load_environment_deferrals(root, ['work/contract.json'])['contracts'], [])

    def test_totals_batches_priorities_and_cache_keep_deferred_distinct(self):
        evidence = dict(contracts=[dict(sourceContract='work/contract.json', sourceFingerprint='fixture',
            skillIDs=['enemy_a|gated', 'enemy_a|done'], reason='environment unavailable',
            requiredMarkerKeys=['environment[missing]'])], ignoredContracts=[])
        report = {'gaps':{'enemy_a':['whole-mode-unresolved']}, 'skillDispatch':{
            'candidateIDs':['enemy_a|done','enemy_a|gated','enemy_a|next'],
            'selections':{'enemy_a':[{'id':'enemy_a|done','skillKey':'done'}]}}}
        operator = dict(label='skill', purpose='full skill contract', memberIDs=['enemy_a'],
            activeMemberIDs=['enemy_a'], encounterIDs=['enemy_a'], templateIDs=['a'],
            implementationState='pending-full-contract')
        plan = {'enemies':{'enemy_a':dict(inEncounterPool=True, missingLinks=['whole-mode-unresolved'])},
            'operators':{'resolve-enemy-skill-trigger':operator},
            'batches':{'actions':dict(label='skills', dependsOn=[],
                operatorIDs=['resolve-enemy-skill-trigger'], output='shared', acceptance='complete')}}
        before = deepcopy(plan)
        with patch('enemy_skill_dispatch_status.load_environment_deferrals', return_value=evidence):
            status = skill_dispatch_status(report, ['enemy_a'])
            self.assertEqual(status['counts']['pendingSkills'], 2)
            self.assertEqual(status['counts']['deferredSkills'], 1)
            self.assertEqual(status['counts']['executablePendingSkills'], 1)
            self.assertEqual(status['deferredSkillIDs'], ['enemy_a|gated'])
            integrated = integrate_runtime_status(plan, report)
            job = prepare_batch(integrated, {'counts':{}}, 'actions')['jobs'][0]
            self.assertEqual(job['pendingSkillIDs'], ['enemy_a|next'])
            self.assertEqual(job['allPendingSkillIDs'], ['enemy_a|gated','enemy_a|next'])
            self.assertEqual(job['deferredSkillIDs'], ['enemy_a|gated'])
            priority = build_priority(integrated, report, {}, ['enemy_a'])
            priority['contentSha256'] = 'fixture'
            next_step = apply_foundation_priority(integrated, priority)['runtimeSupport']['nextSharedProvider']
            self.assertEqual(next_step['candidateIDs'], ['enemy_a|next'])
            self.assertEqual(next_step['pendingSkillIDs'], ['enemy_a|next'])
            self.assertEqual(next_step['allPendingSkillIDs'], ['enemy_a|gated','enemy_a|next'])
            self.assertEqual(next_step['deferredSkillIDs'], ['enemy_a|gated'])
            self.assertEqual(integrated['enemies']['enemy_a']['missingLinks'], ['whole-mode-unresolved'])
            self.assertEqual(plan, before)
        with patch('enemy_skill_dispatch_status.load_environment_deferrals', return_value={'contracts':[]}):
            reopened = integrate_runtime_status(integrated, report)
            self.assertEqual(reopened['runtimeSupport']['skillDispatch']['deferredSkillIDs'], [])
            self.assertEqual(reopened['runtimeSupport']['skillDispatch']['executablePendingSkillIDs'],
                             ['enemy_a|gated','enemy_a|next'])


if __name__ == '__main__':
    unittest.main()
