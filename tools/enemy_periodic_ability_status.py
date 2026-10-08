"""Keep compiled periodic ability groups separate from EnemySkill coverage."""
from copy import deepcopy


CAPABILITY_LABELS = {
    'mode-attributes': '模式移动属性',
    'self-damage-maxhp': '按最大生命值周期自损',
    'direct-named-ability': '周期点名直接施放',
    'normal-attack-element': '普通动作元素包',
}


def periodic_ability_status(report, encounter_enemy_ids=None):
    dispatch = report.get('periodicAbilities', {})
    pool = set(encounter_enemy_ids) if encounter_enemy_ids is not None else None
    selected = {}
    for enemy, values in dispatch.get('selections', {}).items():
        for item in values if isinstance(values, list) else []:
            group_id = item.get('id')
            if not group_id or item.get('kind') != 'mode-periodic-ability-group':
                continue
            kinds = []
            if item.get('attributes'):
                kinds.append('mode-attributes')
            periodic_kinds = {entry.get('kind') for entry in item.get('periodics', [])}
            if 'self-damage-maxhp' in periodic_kinds:
                kinds.append('self-damage-maxhp')
            if 'named-ability' in periodic_kinds and item.get('abilities'):
                kinds.append('direct-named-ability')
            if item.get('normalAttackElement'):
                kinds.append('normal-attack-element')
            selected[group_id] = dict(groupId=group_id, enemyId=enemy, kind=item['kind'],
                modeIndex=item.get('modeIndex'), capabilityIDs=kinds,
                periodicIDs=[entry.get('id') for entry in item.get('periodics', [])],
                namedAbilityKeys=sorted(item.get('abilities', {})),
                sourceContract=dispatch.get('contract'), sourceRefs=deepcopy(item.get('sourceRefs', [])))
    groups = [selected[key] for key in sorted(selected)]
    enemies = sorted({item['enemyId'] for item in groups})
    by_enemy = {enemy:[item for item in groups if item['enemyId'] == enemy] for enemy in enemies}
    capabilities = {}
    for key, label in CAPABILITY_LABELS.items():
        users = [item for item in groups if key in item['capabilityIDs']]
        if users:
            capabilities[key] = dict(label=label, groupIDs=[item['groupId'] for item in users],
                enemyIDs=sorted({item['enemyId'] for item in users}), bindings=len(users))
    return dict(rule=dispatch.get('rule'), sourceFingerprint=dispatch.get('sourceFingerprint'),
        sourceReport='work/external-combat-import-report.json#periodicAbilities',
        sourceContract=dispatch.get('contract'), alreadyBoundGroups=groups,
        alreadyBoundGroupsByEnemy=by_enemy, selectedGroupIDs=sorted(selected), selectedEnemyIDs=enemies,
        capabilities=capabilities, rejectionsByEnemy=deepcopy(dispatch.get('rejections', {})),
        counts=dict(groups=len(groups), enemies=len(enemies),
            encounterGroups=(sum(item['enemyId'] in pool for item in groups) if pool is not None else None),
            encounterEnemies=(len(set(enemies) & pool) if pool is not None
                else report.get('counts', {}).get('encounterPeriodicAbilityEnemies')),
            capabilityKinds=len(capabilities), capabilityBindings=sum(len(item['capabilityIDs']) for item in groups)),
        boundary='These are compiled complete periodic ability groups, not EnemySkill components. Reuse their stable group IDs without redispatching them; keep the 27-skill cohort, other source operators and whole-enemy gaps unchanged. Capability bindings overlap on the same enemies and are not additive enemy coverage.')
