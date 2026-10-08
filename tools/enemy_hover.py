"""Compile the reviewed mode-owned hovering Buff, not a guessed recovery skill."""
import hashlib
import json
from pathlib import Path
from enemy_skill_dispatch import frozen_input_matches

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'work/enemy-hover-contract.json'
# This is an explicitly reviewed complete source group. New fields, siblings,
# versions or templates require review, rather than permissive partial matching.
APPROVED = '5f35179fd2af0a1df78760b9779fbb1c1d7b085f8036a3bda967d5c4107673e4'
RULE = 'mode-hover-disable-landing-v1'


def compile_hover(record):
    source = record['source']
    digest = hashlib.sha256(json.dumps(source, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    if digest != APPROVED:
        raise ValueError('Hover source group changed; retain the rejected fields and review before binding')
    components = source['catalog']['components']
    fly = next(c['fields']['_buffs'][0] for c in components.values()
        if c['scriptType'].endswith('.PassiveBuffAbility') and c['fields']['_buffs'][0]['templateKey']=='enemy_syufo_fly')
    board = {row['key']:row['value'] for row in fly['blackboard']}
    event = source['flyTemplate']['eventToActions']['ON_BUFF_DISABLE']
    stun = next(row['value'] for row in event[1]['_buff']['blackboard'] if row['key']=='stun')
    recover = next(c for c in components.values() if c['scriptType'].endswith('.EnemySkill'))
    recover_id = next(key for key,c in components.items() if c is recover)
    return source['enemyId'], dict(rule=RULE, hoverMode=0, groundMode=int(board['mode']),
        motion='FLY' if board['motion']==1 else 'WALK', defaultMotion=source['entity']['motion'],
        disabledBy=dict(stun=bool(fly['isStunnable']),freeze=bool(fly['isFreezable']),
            groundBound=bool(fly['isGroundBoundable']),silence=bool(fly['isSilenceable']),levitate=bool(fly['isLevitatable'])),
        landingStun=stun, originalFlags=fly['attributes']['abnormalFlags'],
        unboundRecovery=dict(id=source['enemyId']+'|'+recover_id,name='RecoverAnim',reason='source-skill-data-absent'),
        scope='Hover motion and source disable-to-ground transition. Original route/tile recomputation, UNBALANCE handling and visual effects remain unimplemented.')


def load_hover(root=ROOT):
    root=Path(root)
    record=json.loads((root/CONTRACT.relative_to(ROOT)).read_text(encoding='utf8'))
    if 'levels' not in record['inputs']:
        raise ValueError('Hover evidence lacks current level override check')
    for descriptor in record['inputs'].values():
        kind = {'web/enemy_encounters.json': 'encounters',
                'web/source_battles.json': 'source-battles'}.get(descriptor['path'], 'raw')
        if not frozen_input_matches(root/descriptor['path'], descriptor['sha256'], kind):
            raise ValueError('Hover evidence changed: '+descriptor['path'])
    # Conservative gate: a newly exported recovery entry must be reviewed with
    # its owner/level before the dormant prefab is excluded from dispatch work.
    levels=root/record['inputs']['levels']['path']
    if 'recoveranim' in levels.read_text(encoding='utf8').lower():
        raise ValueError('Recovery level entry now present; review skill activation')
    return compile_hover(record)


def inactive_skill_deferral(root=ROOT):
    _,data=load_hover(root)
    skill=data['unboundRecovery']
    return dict(sourceContract=str(CONTRACT.relative_to(ROOT)).replace('\\','/'),
        sourceFingerprint=APPROVED,skillIDs=[skill['id']],reason=skill['reason'],
        requiredMarkerKeys=['匹配的 RecoverAnim 敌人或关卡 skills 配置'],
        evidenceLevel='Verified-static-unmatched-skill-disabled',kind='source-skill-inactive')
