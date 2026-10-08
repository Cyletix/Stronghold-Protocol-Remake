"""Compile mode-owned melee actions whose animation is supplied by a behaviour.

This is an exact structural family, not an enemy-name/blank-animation fallback.
The local Unity cache proves that the behaviour is mounted on the root action.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULE = 'root-melee-no-pre-animation-v1'
BUNDLE = ROOT / 'work/client-logic/bundles/battle/enm_pfb_3.ab.json'
NATIVE = ROOT / 'work/client-logic/native-enemy-no-pre/evidence.json'
PREFIX = 'Torappu.Battle.Abilities.'
# Both source roots share this complete serialized action, including empty
# selector, metadata and non-output fields. New fields must not slip through.
ACTION_SIGNATURE = '8d0c2146c85fdd2a7e5a8841afc0be11fe5c73c38db08b4ef628ec594cfae6c1'


def compile_member(record, components, animations, script_types, nodes, animation_of):
    evidence = record.get('evidence', {})
    modes = evidence.get('rootModes', [])
    if len(modes) != 1 or evidence.get('unresolvedComponentReferences'):
        return None
    roots = modes[0].get('actionPathIDs', [])
    if len(roots) != 1:
        return None
    by_id = {str(c['pathID']): c for c in components}
    action = by_id.get(str(roots[0]))
    if not action or script_types.get(str(action['scriptPathID'])) != PREFIX+'MeleeAttack':
        return None
    fields = action['fields']
    signature=hashlib.sha256(json.dumps(fields,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    if signature != ACTION_SIGNATURE:
        return None
    required = dict(_animKey='', _waitForAttackEvent=1, _timeMode=0, _preDelay=0,
        _atkScale=1, _attackType=1, _damageType=1, _alwaysIncludeTarget=1,
        _selectTargetSource=2, _selectTargetTiming=0, _resetCdStrategy=1,
        _maxAnimScale=1, _allowNoTarget=0, _cooldown=0, _activeBuffs=[],
        _checkFaceToFirstCastTargetDownAttack=0, _affectedBySlowDown=1,
        _extraDamageType=0, _elementDamageType=0, _epDamageRatio=0,
        _useDynamicAttackType=0, _deliveryParaWhenReplaceActionNode=0)
    if any(fields.get(k) != v for k,v in required.items()):
        return None
    providers = [c for c in components if script_types.get(str(c['scriptPathID'])) == PREFIX+'NoPreOneshotAnimation']
    if len(providers) != 1:
        return None
    provider = providers[0]
    if provider['fields'].keys() != {'_animWithPre','_animNoPre','_endAnim','_maxAnimScale'}:
        return None
    source_action, source_provider = nodes.get(str(action['pathID'])), nodes.get(str(provider['pathID']))
    if not source_action or not source_provider:
        return None
    a, b = source_action['fields'], source_provider['fields']
    if (a.get('m_Enabled') != 1 or b.get('m_Enabled') != 1 or
        a.get('m_GameObject') != b.get('m_GameObject') or
        not a.get('m_GameObject',{}).get('m_PathID') or
        any(a.get(k) != v for k,v in fields.items() if k not in
            {'_selector','_checkFaceToFirstCastTargetDownAttack','_affectedBySlowDown'}) or
        any(b.get(k) != v for k,v in provider['fields'].items())):
        return None
    # Cross-export PPtr numeric/string representation is normalized separately.
    if str(a['_selector']['m_PathID']) != '0' or str(fields['_selector']['m_PathID']) != '0':
        return None
    if provider['fields']['_maxAnimScale'] != 1:
        return None
    aliases = {}
    for c in components:
        for row in c.get('fields',{}).get('_animations',[]):
            aliases.setdefault(row['animKey'],set()).add((row['animName'],row.get('speed',1)))
    first = animation_of(animations, provider['fields']['_animWithPre'], aliases)
    repeat = animation_of(animations, provider['fields']['_animNoPre'], aliases)
    end = provider['fields']['_endAnim']
    if not first or not repeat or end not in animations or animations[end].get('events'):
        return None
    return dict(timing=first, channels={'combat':dict(delivery='melee',timing=first,atkScale=1,damageType='phys'), 'attack':None},
        preAttack=dict(rule=RULE, first=first, repeat=repeat, endAnimation=end, maxAnimScale=1,
            atkScale=1,damageType='phys',delivery='melee',
            sourceAction=f"{action['cabin']}:{action['pathID']}",
            sourceProvider=f"{provider['cabin']}:{provider['pathID']}"))


def compile_family(records, prefabs, animations, script_types, eligible, animation_of):
    bundle = json.loads(BUNDLE.read_text(encoding='utf8'))
    native = json.loads(NATIVE.read_text(encoding='utf8'))
    assert native['sha256'] == 'd95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af'
    compiled, candidates, rejected = {}, [], {}
    for enemy_id in sorted(eligible):
        components = prefabs.get(enemy_id,{}).get('components',[])
        if not any(script_types.get(str(c['scriptPathID'])) == PREFIX+'NoPreOneshotAnimation' for c in components):
            continue
        candidates.append(enemy_id)
        result = compile_member(records.get(enemy_id,{}),components,animations.get(enemy_id,{}).get('animations',{}),
            script_types,bundle['nodes'],animation_of)
        if result:
            compiled[enemy_id] = result
        else:
            rejected[enemy_id] = 'Root/action/provider ownership, fields or both animation timelines do not match the complete family.'
    inputs = [BUNDLE,NATIVE,Path(__file__)] + [NATIVE.parent/m['file'] for m in native['methods']]
    report = dict(rule=RULE,candidates=candidates,acceptedEnemyIDs=sorted(compiled),rejections=rejected,
        inputs={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
        verified=['Root MeleeAttack and NoPreOneshotAnimation share one GameObject in the cached Unity source.',
          'UpdatePlaybackSpeed chooses firstAttack ? _animWithPre : _animNoPre and caps interval/duration by maxAnimScale.',
          'CombatState.OnEnter calls NextCombatOrExit(true); successful repeated-combat callback passes false.',
          'Both animation event sequences and end animation are present in the attributed Spine supplement.'],
        inferred=['Local combat continuity is bridged to blocked/unblocked and crowd-control edges; no complete native FSM is claimed.',
          'CN adds affectedBySlowDown=true and checkFaceToFirstCastTargetDownAttack=false; JP lacks these two fields. All shared action fields agree.',
          'Existing engine attack-start cooldown and frame clock are retained; dynamic animation speed changes during a cast remain separate.'],
        remaining=['Original Spine playback/end-idle rendering and complete native interrupted combat timer semantics.'])
    return compiled, report
