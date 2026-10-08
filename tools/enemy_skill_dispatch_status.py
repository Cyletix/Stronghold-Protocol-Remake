"""Project actual compiled enemy-skill IDs into the frozen shared work queue."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENVIRONMENT_CONTRACTS = ('work/enemy-explicit-read-contract.json',
                         'work/enemy-explicit-chimera-contract.json')


def load_environment_deferrals(root=ROOT, contract_paths=ENVIRONMENT_CONTRACTS):
    """Use only source-current, explicit NeverTrigger environment contracts.

    A missing/changed source or a newly present runtime marker releases the
    deferral for investigation. It never marks the skill implemented.
    """
    root = Path(root)
    hashes, accepted, ignored = {}, [], []
    runtime_files = [root/'web/engine.js', root/'web/enemy_encounters.json',
                     root/'web/mode_data.json', root/'web/mode_rules.json',
                     root/'web/mode_rounds.json', root/'web/source_battles.json']
    for directory in ('web/src', 'web/mode'):
        runtime_files.extend((root/directory).rglob('*.js'))
    runtime_text = '\n'.join(path.read_text(encoding='utf-8-sig')
                             for path in runtime_files if path.is_file())
    for relative_path in contract_paths:
        path = root/relative_path
        if not path.is_file():
            continue
        try:
            contract = json.loads(path.read_text(encoding='utf-8-sig'))
            gate = contract.get('runtimeGate', {})
            if gate.get('status') != 'environment-gated' or gate.get('garrisonEntryReachable') is not False:
                raise ValueError('environment-gate-not-currently-closed')
            inputs = contract.get('inputs', {})
            if not {'priority', 'catalog', 'ownership', 'encounters'} <= inputs.keys():
                raise ValueError('required-source-inputs-absent')
            fingerprint = hashlib.sha256(json.dumps(inputs, sort_keys=True,
                separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
            if fingerprint != contract.get('sourceFingerprint'):
                raise ValueError('contract-source-fingerprint-mismatch')
            for item in inputs.values():
                source_path = root/item['path']
                if source_path not in hashes:
                    hashes[source_path] = hashlib.sha256(source_path.read_bytes()).hexdigest()
                if hashes[source_path] != item.get('sha256'):
                    raise ValueError('source-input-changed:'+item['path'])
            for item in contract.get('garrisonGateChecks', []):
                # Subtree evidence is covered by the full activity input hash.
                if item.get('fieldPath'):
                    if item['path'] not in {value['path'] for value in inputs.values()}:
                        raise ValueError('unfingerprinted-environment-source:'+item['path'])
                    continue
                source_path = root/item['path']
                if source_path not in hashes:
                    hashes[source_path] = hashlib.sha256(source_path.read_bytes()).hexdigest()
                if hashes[source_path] != item.get('sha256'):
                    raise ValueError('environment-source-changed:'+item['path'])
            markers = gate.get('requiredAnyBuffKeys') or [gate.get('requiredMarker')]
            if not markers or not all(isinstance(key, str) and key for key in markers):
                raise ValueError('environment-marker-keys-absent')
            if any(marker in runtime_text for marker in markers):
                raise ValueError('runtime-marker-now-present-recheck-provider')
            skills = contract.get('skills', {})
            skill_ids = contract.get('deferredSkillIDs', contract.get('skillIDs', []))
            if not skill_ids or any(skills.get(key, {}).get('triggerType') != 'NeverTrigger' for key in skill_ids):
                raise ValueError('not-a-complete-frozen-never-trigger-contract')
            accepted.append(dict(sourceContract=relative_path, sourceFingerprint=fingerprint,
                skillIDs=sorted(set(skill_ids)), reason=gate.get('reason'),
                requiredMarkerKeys=markers, evidenceLevel=gate.get('evidenceLevel')))
        except (OSError, KeyError, TypeError, ValueError) as error:
            ignored.append(dict(sourceContract=relative_path, reason=str(error)))
    # A prefab AlwaysTrigger is not sufficient if Enemy._AssignSkill disables
    # that component for lack of data. Keep it pending, using a separate reason
    # from the NeverTrigger environment contracts above.
    from enemy_hover import CONTRACT as HOVER_CONTRACT, inactive_skill_deferral
    relative_path=str(HOVER_CONTRACT.relative_to(ROOT)).replace('\\','/')
    if (root/relative_path).is_file():
        try:
            accepted.append(inactive_skill_deferral(root))
        except (OSError, KeyError, TypeError, ValueError) as error:
            ignored.append(dict(sourceContract=relative_path,reason=str(error)))
    return dict(contracts=accepted, ignoredContracts=ignored)


def skill_dispatch_status(report, encounter_enemy_ids=None, environment_deferrals=None):
    dispatch = report.get('skillDispatch', {})
    pool = set(encounter_enemy_ids) if encounter_enemy_ids is not None else None
    selections, owners = {}, {}
    for enemy, values in dispatch.get('selections', {}).items():
        for item in values if isinstance(values, list) else []:
            skill_id = item.get('id', item.get('candidateId'))
            if not skill_id:
                continue
            selections[skill_id] = dict(enemyId=enemy, skillId=skill_id,
                skillKey=item.get('skillKey'), modeIndices=deepcopy(item.get('modeIndices', [])),
                sourceRef=deepcopy(item.get('sourceRef')), kind=item.get('kind'))
            selections[skill_id].update(initiallyMounted=item.get('initiallyMounted'),
                automaticModeTransitionComplete=item.get('automaticModeTransitionComplete'),
                entryStatus=('initial-mode-bound' if item.get('initiallyMounted') is True else
                    'automatic-entry-bound' if item.get('automaticModeTransitionComplete') is True else
                    'explicit-mode-only-entry-pending' if item.get('initiallyMounted') is False else 'not-classified'))
            owners[skill_id] = enemy
    rejected = {}
    for enemy, values in dispatch.get('rejections', {}).items():
        for item in values if isinstance(values, list) else []:
            skill_id = item.get('candidateId')
            if skill_id:
                owners[skill_id] = enemy
                if skill_id not in selections:
                    rejected[skill_id] = deepcopy(item.get('reasons', []))
    candidate_ids = set(dispatch.get('candidateIDs', [])) | set(selections) | set(rejected)
    pending_ids = sorted(candidate_ids - set(selections))
    # Frozen component IDs use enemyId|componentKey. This also retains members
    # without a compiler rejection, rather than silently dropping that work.
    for skill_id in candidate_ids:
        owners.setdefault(skill_id, skill_id.split('|', 1)[0])
    pending_by_enemy = {}
    for skill_id in pending_ids:
        pending_by_enemy.setdefault(owners[skill_id], []).append(skill_id)
    environment_deferrals = (load_environment_deferrals() if environment_deferrals is None
                             else environment_deferrals)
    deferred = {}
    for contract in environment_deferrals.get('contracts', []):
        for skill_id in contract['skillIDs']:
            if skill_id in pending_ids:
                deferred[skill_id] = {key:deepcopy(value) for key,value in contract.items() if key != 'skillIDs'}
    executable_ids = sorted(set(pending_ids)-set(deferred))
    deferred_by_enemy, executable_by_enemy = {}, {}
    for skill_id in sorted(deferred):
        deferred_by_enemy.setdefault(owners[skill_id], []).append(skill_id)
    for skill_id in executable_ids:
        executable_by_enemy.setdefault(owners[skill_id], []).append(skill_id)
    selected_enemies = sorted({item['enemyId'] for item in selections.values()})
    bound_entry_pending = sorted(key for key,item in selections.items()
        if item['entryStatus']=='explicit-mode-only-entry-pending')
    return dict(rule=dispatch.get('rule'), sourceFingerprint=dispatch.get('sourceFingerprint'),
        sourceReport='work/external-combat-import-report.json#skillDispatch',
        candidateSkillIDs=sorted(candidate_ids), selectedSkillIDs=sorted(selections),
        sourceCandidateSkillIDs=dispatch.get('sourceCandidateIDs',sorted(candidate_ids)),
        outOfScopeSkillIDs=dispatch.get('outOfScopeCandidateIDs',[]),
        alreadyBoundSkills=[selections[key] for key in sorted(selections)],
        boundEntryPendingSkillIDs=bound_entry_pending,
        selectedEnemyIDs=selected_enemies, pendingSkillIDs=pending_ids,
        pendingSkillIDsByEnemy=pending_by_enemy, pendingEnemyIDs=sorted(pending_by_enemy),
        deferredSkillIDs=sorted(deferred), deferredSkillIDsByEnemy=deferred_by_enemy,
        deferredEnemyIDs=sorted(deferred_by_enemy), environmentDeferralsBySkillID=deferred,
        executablePendingSkillIDs=executable_ids, executablePendingSkillIDsByEnemy=executable_by_enemy,
        executablePendingEnemyIDs=sorted(executable_by_enemy),
        ignoredEnvironmentContracts=deepcopy(environment_deferrals.get('ignoredContracts', [])),
        rejectionsBySkillID=rejected,
        counts=dict(candidates=len(candidate_ids), selectedSkills=len(selections),
            boundEntryPendingSkills=len(bound_entry_pending),
            selectedEnemies=len(selected_enemies), pendingSkills=len(pending_ids),
            pendingEnemies=len(pending_by_enemy),
            deferredSkills=len(deferred), deferredEnemies=len(deferred_by_enemy),
            executablePendingSkills=len(executable_ids), executablePendingEnemies=len(executable_by_enemy),
            encounterSelectedEnemies=(len(set(selected_enemies) & pool) if pool is not None
                else report.get('counts', {}).get('encounterSkillDispatchEnemies'))),
        boundary='Only compiled skill component IDs leave pending totals. Source-current environment-gated NeverTrigger IDs and unmatched source-disabled skills remain pending and are deferred until a real entry is present. Executable-pending means eligible for shared-contract work, not directly ready to bind. Mode activation, other skills, source operators and whole-enemy completion remain separate.')
