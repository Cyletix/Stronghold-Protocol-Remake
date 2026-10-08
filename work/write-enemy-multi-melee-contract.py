"""Freeze only the previously selected cast-Buff / interval multi-melee slice."""
import hashlib
import json
import sys
import struct
from pathlib import Path
sys.path.insert(0, 'tools')
from enemy_mode_buff_bindings import query_templates

parent_path = Path('work/enemy-tagged-ranged-contract.json')
parent = json.loads(parent_path.read_text(encoding='utf8'))
members = parent['excludedCandidates']
eids = {row['enemyId'] for row in members.values()}
result = dict(schemaVersion=1, rule='input-target-cast-buff-interval-melee-v1',
    bindingComplete=True, sourceFingerprint=parent['sourceFingerprint'], inputs=parent['inputs'],
    sourceParent=dict(path=str(parent_path), sha256=hashlib.sha256(parent_path.read_bytes()).hexdigest()),
    candidates=members, enemies={eid:parent['enemies'][eid] for eid in eids},
    catalog={eid:parent['catalog'][eid] for eid in eids},
    ownership={eid:parent['ownership'][eid] for eid in eids},
    animationBindings={eid:parent['animationBindings'][eid] for eid in eids},
    metadataEnums=parent['metadataEnums'], spContract=parent['spContract'],
    database={eid:parent['database'][eid] for eid in eids}, spBindings=parent['spBindings'],
    templates={key:entry['payload'] for key,entry in query_templates(['empty','jakill_skill_1_reborn_hit']).items()},
    nativeEvidence=json.loads(Path('work/client-logic/native-enemy-cast-buffs/methods.json').read_text()),
    verified=[
      'Complete source component group, input-target enum, source skill blackboard and C2_Skill OnAttack timestamp.',
      'BuffDuringCasting.OnCastStart clears prior owned Buff IDs, applies Buffs to owner using ability blackboard; OnCastFinish clears those IDs.',
      'AbstractAnimatedAbility.UpdatePlaybackSpeed: negative maxAnimScale omits the upper clamp; lower bound is 0.1.'],
    inferred=[
      'MultiMelee interval bridge uses first scaled OnAttack plus triggerDelta between later hits, in the existing affected-by-slowdown cast clock. Exact MultiMelee coroutine remains unreadable.',
      'Source selector without its own selector uses the current physical blocker for this melee channel; exact target reacquisition exceptions remain unsupported.'],
    runtimeScope='Explicitly active source mode only. Does not introduce a Reborn provider or claim ordinary encounter phase reachability.',
    phaseEntryComplete=False, wholeEnemyCompletion=False,
    remainingBoundaries=['Reborn phase lifecycle and its complete ordered Buff chain; no half-HP instant-revive fallback added.',
      'Native MultiMelee coroutine timing and hotfix overrides.', 'Enhance and LibertyOthers remain separate source groups.'])
types = json.loads(Path('work/client-logic/metadata/types.json').read_text(encoding='utf8'))
raw = Path(parent['inputs']['metadata']['path']).read_bytes()
header = struct.unpack_from('<64I', raw)
sections = [header[i:i+2] for i in range(2,64,2)]
defaults = {fi:(ti,di) for fi,ti,di in struct.iter_unpack('<iii',raw[sections[7][0]:sum(sections[7])])}
for type_name,field_name in [('Torappu.AttributeType','DEF_PENETRATE'),
        ('Torappu.AttributeModifierData+AttributeModifier+FormulaItemType','ADDITION')]:
    typ = next(t for t in types if t['fullName']==type_name)
    field = next(f for f in typ['fields'] if f['name']==field_name)
    ti,di = defaults[field['index']];byte = raw[sections[8][0]+di]
    assert ti==47416 and byte<128
    result['metadataEnums'][type_name]={field_name:dict(value=-(byte//2)-1 if byte&1 else byte//2,
        fieldIndex=field['index'],defaultTypeIndex=ti,defaultDataOffset=di,rawByte=byte,
        encoding='compressed-signed-int32-zigzag')}
result['verified'].append('DEF_PENETRATE=17 and ADDITION=0 decoded from pinned metadata default values. The only shared MultiMelee mismatch is exactly the float32 representation of triggerDelta=0.2; same resolved source GameObject is retained.')
result['inferred'].append('DEF_PENETRATE reduces target defense by its ratio; reuse the pinned community attributes/battle damage pipeline. Full native damage pipeline ordering is not claimed.')
base=Path('work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator')
result['attributePipelineEvidence']=[dict(path=str(base/name),sha256=hashlib.sha256((base/name).read_bytes()).hexdigest())
    for name in ('buff_templates.py','attributes.py','battle.py')]
Path('work/enemy-multi-melee-contract.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Frozen multi-melee components:',len(members))
