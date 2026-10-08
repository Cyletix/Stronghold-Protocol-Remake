"""Freeze the one preselected CircleAttack contract; never rescan enemy cohorts."""
import hashlib
import json
import struct
from pathlib import Path

P = Path('work/enemy-area-melee-contract.json')
d = json.loads(P.read_text(encoding='utf-8'))
sid = next(iter(d['candidates']))
eid = d['candidates'][sid]['enemyId']
b = d['bindings'][sid]

def source(path):
    return {'path': str(path).replace('\\', '/'), 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest()}

inputs = {k: source(v['path']) for k, v in d['priorityInputs'].items() if k in ['catalog', 'ownership', 'encounters']}
inputs.update({
    'priority': source('work/garrison-skill-dispatch-priority.json'),
    'selectedSlice': source('work/enemy-skill-next-slice.json'),
    'rangeBundle': source('work/client-logic/bundles/battle/enm_pfb_18.ab.json'),
    'animation': source(d['animationBindings'][eid]['sourcePath']),
    'metadata': source('work/client-logic/metadata/global-metadata.candidate.dat'),
})

native_paths = list(Path('work/client-logic/native-enemy-area-melee').glob('*'))
native_paths += [Path('work/client-logic/native-enemy-self-cast') / n for n in [
    '75490_get_cooldown.asm', '75493_ApplyAttackTime.asm', '75504_GetDuration.asm',
    '75505_UpdatePlaybackSpeed.asm', '75496_DoAttach.asm', 'layout.json']]
native_paths += [Path('work/client-logic/native-enemy-scheduler') / f'{n}.asm' for n in [
    55666, 55669, 55670, 55673, 55674, 55676, 55677, 55678, 55682, 55683]]
native_paths += [Path('work/client-logic/native-enemy-periodic/74110_DoSetData.asm')]
# The bounded helper dump initially included a few instructions from the next
# generic method. Keep only the requested callee's own code, through its tail.
rp = Path('work/client-logic/native-enemy-area-melee/generic_List_RemoveAt_5a27354.asm')
rp.write_text('\n'.join(x for x in rp.read_text(encoding='utf-8').splitlines() if x and int(x.split()[0],16) < 0x5a273f4) + '\n', encoding='utf-8')
native = []
for p in sorted(native_paths):
    if not p.exists():
        raise FileNotFoundError(p)
    r = source(p)
    if p.suffix == '.asm':
        n = sum(bool(x.strip()) and not x.startswith(';') for x in p.read_text(encoding='utf-8').splitlines())
        r.update(instructions=n, status='readable-static-base-branch' if n else 'unreadable-no-retry')
        if p.name == '55670.asm':
            r['status'] = 'partial-readable-no-tail-retry'
    else:
        r['status'] = 'metadata-and-point-extraction-record'
    native.append(r)
inputs['nativeEvidence'] = {'files': native}

types = json.loads(Path('work/client-logic/metadata/types.json').read_text(encoding='utf-8'))
raw = Path(inputs['metadata']['path']).read_bytes()
h = struct.unpack_from('<64I', raw)
sections = [h[i:i+2] for i in range(2,64,2)]
defaults = {fi:(ti,di) for fi,ti,di in struct.iter_unpack('<iii', raw[sections[7][0]:sum(sections[7])])}
wanted = {
 'Torappu.Battle.AbilityStandard+SelectTargetSource': None,
 'Torappu.Battle.AbilityStandard+SelectTargetTiming': None,
 'Torappu.Battle.Abilities.AbstractAnimatedAbility+TimeMode': None,
 'Torappu.Battle.DamageType': None,
 'Torappu.Battle.Modifier+SourceAttackType': None,
 'Torappu.Battle.ElementType': None,
 'Torappu.AbnormalFlag': ['DISABLE_COMBAT'],
 'Torappu.AbnormalCombo': None,
}
enums = {}
for t in types:
    if t['fullName'] not in wanted:
        continue
    vals = {}
    for f in t['fields']:
        if f['index'] not in defaults or (wanted[t['fullName']] is not None and f['name'] not in wanted[t['fullName']]):
            continue
        ti,di = defaults[f['index']]
        byte = raw[sections[8][0]+di]
        assert ti == 47416 and byte < 128, (t['fullName'],f['name'],ti,byte)
        vals[f['name']] = {'value': -(byte//2)-1 if byte&1 else byte//2, 'fieldIndex':f['index'],
                          'defaultTypeIndex':ti,'defaultDataOffset':di,'rawByte':byte,'encoding':'compressed-signed-int32-zigzag'}
    enums[t['fullName']] = vals

slots = []
for t in types:
    if t['fullName'] not in ['Torappu.Battle.Entity','Torappu.Battle.Enemy','Torappu.PeriodicTimer','Torappu.Battle.AbilityStandard','Torappu.Battle.EnemySkill']:
        continue
    for m in t['methods']:
        if m['name'] not in ['get_alive','get_alwaysIncludeTarget','get_allowNoTarget','Next','ResetSkillCooldownIfNeeded','GetModeRangeRadius']:
            continue
        slot = struct.unpack_from('<6I4H', raw, sections[5][0]+m['index']*32)[8]
        slots.append({'type':t['fullName'],'method':m['name'],'methodIndex':m['index'],'slot':slot,'vtableOffset':hex(0x138+slot*16)})

b['bindingComplete'] = True
b['roles']['range'] = b['roles']['physicsRange']
b['rangeParameter'] = {'key':'range_radius','sourceDatabaseValue':1.5,'colliderFallbackRadius':1.0,
  'runtimeDefault':1.5,'nativePath':'EnemySkill.AssignData -> _GetRangeRadius(data,owner) -> Ability.Options.rangeRadius -> Ability.SetData',
  'nativeFallback':'owner.GetModeRangeRadius(null)','evidenceLevel':'Inferred',
  'boundary':'AssignData and _GetRangeRadius call chain are Verified. The string literal and downstream CircleRange radius setter were not separately decoded; range_radius binding follows existing shared blackboard contract.'}
b['sourceRange']['effectiveRadiusFromDatabase'] = 1.5
b['sourceRange']['radiusKey'] = 'range_radius'
b['ownershipBoundary'] = 'All skill and selector components resolved on enabled mode0 subtree. Shared CN/JP fields match; CN-only disabled controls retained as schema differences.'

d['schemaVersion'] = 1
d['rule'] = 'frozen-selector-cooldown-direct-area-melee-v1'
d['status'] = 'complete-focused-contract-with-explicit-native-boundaries'
d['bindingComplete'] = True
d['memberIDs'] = [eid]
d['skillIDs'] = [sid]
d['inputs'] = inputs
d['sourceFingerprint'] = hashlib.sha256(json.dumps(inputs,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
d['metadataEnums'] = enums
d['nativeVirtualSlots'] = slots
d['nativeEvidence'] = native
d['sourceVersion'] = {'serializedFields':'frozen CN dispatch catalog; exact source hashes in inputs',
  'ownershipAndNative':'JP 36.7.22 extracted prefab hierarchy and ARM64 IL2CPP static base methods',
  'hotfixBoundary':'Native methods include XLua hotfix dispatch; runtime hotfix replacement contents are not inferred from the base method.'}
d['timingBindings'] = {sid: {'animationBinding':eid,'timeMode':0,'sourceTimeMode':'FROM_ATTACK_SPEED',
  'maxAnimScale':1,'minAnimScale':0.1,'duration':2.0667,'hit':0.6333,'hitTimes':[0.6333],
  'formula':'scale=min(max(owner.attackTime/rawAnimationDuration,0.1),maxAnimScale); duration=rawAnimationDuration*scale; hit=rawEventTime*scale',
  'evidenceLevel':'Verified','sources':['75490_get_cooldown.asm','75505_UpdatePlaybackSpeed.asm','additional-evidence.json'],
  'staticExample':{'ownerAttackTime':4,'scale':1,'duration':2.0667,'hit':0.6333},
  'boundary':'Raw event seconds are from the existing source spine event snapshot. Playback factor includes the owner animation speed returned with GetAnimationTime; this profile uses the existing unit playback convention.'}}
d['runtimeContract'] = {
 'kind':'selector-cooldown-direct-area-melee', 'scope':'one complete EnemySkill and same-GO action group in initially compiled mode0; not the full boss',
 'modeIndex':0, 'skillKey':'CircleAttack','priority':0,'sourceFamilyMask':3,'initCooldown':15,'cooldown':15,'spCost':0,
 'initialTimer':{'waitFirstPeriod':True,'startsAt':'EnemySkill.Init','evidenceLevel':'Verified','native':'55666.asm:0x4dfc858..0x4dfc8b8'},
 'cooldownReset':{'at':'successful-cast-start','remainingTime':15,'evidenceLevel':'Verified',
   'native':'55669 CastToTarget calls PeriodicTimer.Next(slot7), then ResetSkillCooldownIfNeeded(slot16), before cast count increments; Next assigns remainingTime=periodTime when ready.',
   'firstCastBoundary':'ResetSkillCooldownIfNeeded tail unreadable. It runs only at preincrement castCount0; here initCooldown==cooldown==15, so period transition is numerically identical.'},
 'cooldownDuringCast':{'value':'continues','evidenceLevel':'Inferred','reason':'Next establishes start reset, but EnemySkill.Tick/OnTick are already unreadable; continuous ticking is the selected shared runtime convention, not newly verified source behavior.'},
 'normalCooldownDuringCast':{'value':'existing-runtime-freezes','evidenceLevel':'Inferred','reason':'No readable original main-ability scheduler clock closure; retain current shared convention. _resetMainAbilityCdWhenCastEnd=0 must not create a cast-end reset.'},
 'cast':{'trigger':'SelectorTrigger','minimumTargetCount':1,'keepTarget':False,'selectorSource':'FROM_OWNER','selectTargetTiming':'BEFORE_SPELL_START',
   'alwaysIncludeTarget':True,'allowNoTarget':True,'interruptIfTargetDead':False,'interruptOnDetach':False,
   'ignoreSilence':False,'castLikeAttack':False,'resetMainAbilityCdWhenCastEnd':False,'resetCdWaitFirstPeriod':True,
   'atStart':'Select eligible current owner-range targets using the shared selector; choose its first result as inputTarget.',
   'atHit':'Reselect current owner-range targets; apply the frozen base alwaysIncludeTarget rule below.',
   'startOrderingEvidenceLevel':'Inferred','startOrderingBoundary':'Native selector ordering and MeleeAttack.UpdateTargets override are not recovered; retain deterministic shared selector ordering.'},
 'targeting':{'rangeRadius':{'key':'range_radius','default':1.5,'serializedColliderRadius':1.0},'shape':'circle','center':'owner-current-position',
   'targetSide':2,'targetMotion':3,'targetCategory':1,'limitTargetNum':False,'ignoreHitRange':False,
   'ignoreTargetFree':False,'forceIgnoreCamouflage':False,'abnormalFlag':20,'abnormalCombo':1,
   'inactiveTargetFreeSpecialCase':{'guard':'_onlyIgnoreSomeOfTargetFreeCase=0','flag20':'DISABLE_COMBAT','combo1':'SHELTERING','enabled':False},
   'alwaysIncludeTargetRule':{'if':'inputTarget is Unity-non-null, alive, and not already in reselected list',
     'then':'if list nonempty remove its last element; append inputTarget',
     'ignoreRangeForIncludedInput':True,'ignoreCamouflageForIncludedInput':True,
     'baseEvidenceLevel':'Verified','appliedMeleeOverrideEvidenceLevel':'Inferred',
     'native':'52780_UpdateTargets.asm:0x4d07954..0x4d07ac4; slot67 alwaysIncludeTarget; slot38 Entity.alive; bounded generic RemoveAt helper 0x5a27354 confirms removal.',
     'boundary':'MeleeAttack.UpdateTargets74111 is unreadable and is not retried. Applying the verified base rule through this override remains an explicit inference.',
     'runtimeEntityPoolGuard':'A surviving reference must still be in the active VM pool; this is a VM lifecycle safeguard, not an extra source selector filter.'}},
 'action':{'kind':'MeleeAttack','damageType':'physical','sourceDamageType':1,'sourceAttackType':1,'elementType':0,'epDamageRatio':0,
   'atkScale':{'key':'atk_scale','default':1},'animation':'A_Skill2','timeMode':0,'maxAnimScale':1,'minAnimScale':0.1,
   'waitForAttackEvent':True,'hitTimes':[0.6333],'rawDuration':2.0667,'activeBuffs':[],
   'allSameGameObjectSiblings':['EnemySkill','MeleeAttack','UberEffectEmitter'],
   'emitterRole':'presentation-only; complete original component retained in candidate',
   'affectedBySlowDown':True,'ignorePalsyInterrupt':False},
 'persistentState':{'primitiveOnly':True,'castSnapshot':['modeIndex','skillKey','params','timing','originalInputTargetId'],'inputTargetReference':'existing runtime target rebinding/ID; do not persist new entity object references'},
 'dynamicPlaybackBoundary':{'evidenceLevel':'Inferred','chosenImplementation':'snapshot effective owner attack interval at cast start',
   'nativeEvidence':'ApplyAttackTime calls ResetButKeepProgress and playback update; exact midcast source attribute event scheduling is not closed.'}
}
d['evidence'] = [
 {'level':'Verified','claim':'Frozen candidate contains the entire same-GO skill group and all three selector-side MonoBehaviours, plus real CircleCollider2D and every ancestor Transform. No buff declarations or serialized action siblings are omitted.','source':'candidates; bindings'},
 {'level':'Verified','claim':'Source database specifies cooldown=initCooldown=15, SP cost0, atk_scale1 and range_radius1.5; owner mode0 is initially mounted and compiled.','source':'candidates.databaseSkillBindings; ownership'},
 {'level':'Verified','claim':'Enum constants are decoded from actual metadata default bytes, not declaration order. maxAnimScale is a duration stretch cap; native lower cap is float0.1.','source':'metadataEnums; timingBindings; nativeEvidence'},
 {'level':'Verified','claim':'Native successful CastToTarget invokes PeriodicTimer.Next immediately; getter offsets and Next establish remainingTime=periodTime, so this skill starts its15s cooldown on successful cast start.','source':'55669.asm;23293_Next.asm;23279_get_remainingTime.asm;23280_get_periodTime.asm'},
 {'level':'Inferred','claim':'Use range_radius1.5 in the shared selector and use the verified AbilityStandard alwaysIncludeTarget base rule through the unreadable MeleeAttack override. Both exact remaining proof boundaries are retained, with no fabricated original proof.','source':'bindings.rangeParameter;runtimeContract.targeting.alwaysIncludeTargetRule'},
]
d['remainingBoundaries'] = [
 'Full boss lifecycle, phase1/mode1 activation, Blink/Blink2 and CircleAttack2 MultiMeleeAttack remain separate unsupported contracts; this complete mode0 skill does not complete enemy_1525_blkswb.',
 'No source-wide re-extraction, no scanning of189 enemies, and no retries of previously unreadable scheduler or MeleeAttack.DoSetData methods occurred. New unreadable MeleeAttack.UpdateTargets is frozen as no-retry.',
 'Original postcast/main-cooldown ticking, exact selector sort, hotfix replacement and midcast playback update remain the named Inferred boundaries above.',
 'CircleRange radius string literal/downstream setter are not separately decoded. AssignData rangeRadius option flow is Verified; existing shared blackboard mapping is reused.',
]
d['validationRecommendations'] = [
 'Generate only this complete action group and preserve pre-existing skill profiles and stable IDs.',
 'Verify initial15s gate and successful-cast-start reset, source mode ownership, no SP dependency and no silent cast-end main-CD reset.',
 'Check duration2.0667/hit0.6333 at owner interval4, shortened ratio at interval1, and lower scale0.1 with very small positive interval.',
 'Check hit-time entrant/exiter reselection and base include replacement cardinality; tag override/sort/pool behavior as inference/convention.',
 'Reject added gameplay sibling, unsupported selector field, bad transform/collider, unresolved mode or missing animation rather than partially compiling the group.',
]
d['counts'] = {'enemies':1,'skills':1,'selectorMonoBehaviours':3,'sameGameObjectComponents':len(d['candidates'][sid]['sameGameObjectComponents']),
               'colliders':len(b['colliders']),'ancestorTransforms':len(b['transformChain']),'nativeFiles':len(native)}
d.pop('catalogSource',None)
d.pop('priorityInputs',None)
P.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'path':str(P),'sourceFingerprint':d['sourceFingerprint'],'counts':d['counts'],'bytes':P.stat().st_size},ensure_ascii=False))
