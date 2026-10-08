"""Consume verified bomb timing and geometry without claiming full skill dispatch."""
import hashlib
import json
import math
from pathlib import Path
from frozen_candidate_inputs import frozen_candidate_cache_matches

ROOT=Path(__file__).resolve().parents[1]
CONTRACT=ROOT/'work/enemy-bomb-contract.json'
RULE='source-bomb-animation-box-and-speed-multiplier-v1'

def compile_parameters(record):
    c=record['candidate'];parts=c['sameGameObjectComponents'].values()
    bytype={p['scriptType']:p['fields'] for p in parts}
    action=bytype['Torappu.Battle.Abilities.RangedAttack']
    after=bytype['Torappu.Battle.Abilities.BuffAfterAffecting']
    if c['abilityTypes']!=['BuffAfterAffecting','RangedAttack'] or len(bytype)!=3:
        raise ValueError('Changed bomb sibling group')
    if (action['_timeMode']!=0 or action['_waitForAttackEvent']!=1 or action['_maxAnimScale']!=1
        or action['_activeBuffs'] or action['_extraProjectileKeys'] or action['_damageType']!=1
        or action['_epDamageRatio']!=0 or action['_atkScale']!=1
        or c['skillFields']['_maxTriggerTime']!=1 or c['skillFields']['_ignoreSilence']!=1):
        raise ValueError('Unsupported bomb timing/output contract')
    animation=record['animation']['animations'][action['_animKey']]
    hits=[ev['t'] for ev in animation['events'] if ev['event']=='OnAttack']
    if len(hits)!=1 or not 0<hits[0]<animation['duration']:
        raise ValueError('Unsupported bomb animation events')
    buffs=after['_buffs']
    if len(buffs)!=1:raise ValueError('Changed bomb speed Buff group')
    attrs=buffs[0]['attributes'];mods=attrs['attributeModifiers']
    if (len(mods)!=1 or mods[0]!={'attributeType':6,'formulaItem':3,'value':0.0,
            'loadFromBlackboard':1,'fetchBaseValueFromSourceEntity':0}
        or any(value for key,value in attrs.items() if key!='attributeModifiers')
        or buffs[0]['loadFromDB']!=0 or buffs[0]['templateKey']!='switch_mode_restart_fsm'):
        raise ValueError('Unsupported bomb speed formula')
    nodes=list(record['projectile']['nodes'].values())
    box=next(n['fields'] for n in nodes if n['unityType']=='BoxCollider2D')
    if not box['m_IsTrigger'] or box['m_Offset']!={'x':0.0,'y':0.0}:
        raise ValueError('Unsupported bomb area geometry')
    hit=next(n['fields'] for n in nodes if n.get('scriptType')=='Torappu.Battle.Projectiles.HitBehaviour')
    if (hit['_onlyCheckHitWhenReachTarget']!=1 or hit['_onlyCheckHitWhenStop']!=0
        or hit['_ignoreCamouflage']!=1):
        raise ValueError('Unsupported bomb hit event')
    movement=next(n['fields'] for n in nodes if n.get('scriptType')=='Torappu.Battle.Projectiles.BombdMovement')
    skill=c['databaseSkillBindings']
    if len(skill)!=1 or skill[0]['spCost']!=0:raise ValueError('Changed bomb skill binding')
    board={r['key']:r['value'] for r in skill[0]['blackboard']}
    values=[animation['duration'],hits[0],box['m_Size']['x'],box['m_Size']['y'],board['move_speed'],skill[0]['initCooldown']]
    if any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in values):
        raise ValueError('Invalid bomb numeric parameter')
    return dict(rule=RULE,sourceSkillId=c['id'],skillKey=skill[0]['prefabKey'],
        initialCooldown=skill[0]['initCooldown'],
        animation=dict(duration=animation['duration'],hitTime=hits[0],minScale=.1,maxScale=action['_maxAnimScale']),
        area=dict(halfWidth=box['m_Size']['x']/2,halfHeight=box['m_Size']['y']/2,ignoreCamouflage=bool(hit['_ignoreCamouflage'])),
        moveSpeed=dict(key='move_speed',formula='MULTIPLIER',default=board['move_speed']),
        sourceProjectile=dict(speed=movement['_speed'],fallingTime=movement['_fallingTime'],fallingSpeed=movement['_fallingSpeed']),
        boundary='Parameters only. Existing 0.7s flight and release-time speed activation remain approximate; native BombdMovement unreadable, complete BuffAfterAffecting/root mounting not implemented.')

def load_parameters():
    data=json.loads(CONTRACT.read_text(encoding='utf8'))
    for path,digest in data['inputs'].items():
        if path == 'work/enemy-skill-dispatch-candidates.json':
            valid = frozen_candidate_cache_matches(ROOT/path, digest, data['candidate'])
        else:
            valid = hashlib.sha256((ROOT/path).read_bytes()).hexdigest() == digest
        if not valid:
            raise ValueError('Bomb parameter source changed: '+path)
    return data['candidate']['enemyId'],compile_parameters(data)
