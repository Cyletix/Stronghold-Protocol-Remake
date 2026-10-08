"""Finalize the single frozen IronSandStorm slice without scanning source cohorts."""
import ast
import copy
import hashlib
import json
import struct
from pathlib import Path

p = Path('work/enemy-tagged-ranged-contract.json')
d = json.loads(p.read_text(encoding='utf-8'))
eid = 'enemy_1516_jakill'
sid = next(k for k,v in d['candidates'].items() if v['modeIndices'] == [0])
c = d['catalog'][eid]['components']
b = d['bindings'][sid]
base = Path('work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator')

def source(path):
    return {'path':str(path).replace('\\','/'),'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest()}

# Read only literal schema tables, without importing/executing the upstream package.
tree = ast.parse((base/'buff_templates.py').read_text(encoding='utf-8'))
tables = {}
for node in tree.body:
    if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ['_BUFF_FIELDS','_ATTR_FIELDS']:
        tables[node.targets[0].id] = ast.literal_eval(node.value)
raw_buff = json.loads((base/'data_buff_table.json').read_text(encoding='utf-8'))['stun']
named = {name:raw_buff[str(i)] for i,name in enumerate(tables['_BUFF_FIELDS']) if str(i) in raw_buff}
named['attributes'] = {name:named['attributes'][str(i)] for i,name in enumerate(tables['_ATTR_FIELDS']) if str(i) in named['attributes']}
action_key = 'CAB-0df5f4c8c8dade07e2ee475a972da576:2619193636882274773:23'
decl = c[action_key]['fields']['_activeBuffs'][0]
effective = {**copy.deepcopy(decl),**copy.deepcopy(named),'loadFromDB':0}
d['buffBindings'] = {'stun':{'sourcePath':str(base/'data_buff_table.json'),'raw':raw_buff,'named':named,'effective':effective,
 'sourceDeclaration':decl,'templateKey':'empty','duration':{'key':'stun','default':3,'explicitZero':'no-buff','namespace':'skill-blackboard-no-prefix'},
 'statusResistible':True,'isDamageMissable':True,
 'stackPolicy':{'kind':'max-active-expiry','evidenceLevel':'Inferred','reason':'Single timestamp models union of active stun instances; exact DEFAULT override-group temporal policy is not recovered.'}}}
old = json.loads(Path('work/enemy-periodic-ability-contract.json').read_text(encoding='utf-8'))
d['templates'] = {'empty':old['templates']['empty']}

normal = []
for entry in d['catalog'][eid]['entrypoints']:
    if entry.get('fieldPath') not in ['/_combat','/_attack'] or entry.get('status') != 'resolved':
        continue
    key = entry['targetComponentKey']
    normal.append({'modeIndex':entry['modeIndex'],'channel':entry['fieldPath'].strip('/_'),'componentKey':key,
      'component':c[key],'ownership':d['ownership'][eid]['components'][key]})
d['spBindings'] = {'databaseSpData':d['database'][eid]['Value'][0]['enemyData']['spData'],'normalAbilities':normal,
 'skillAbilityComponents':[action_key],
 'sourceEvent':'AbilityStandard.OnSpellStart: if damage/heal output succeeds (or allowNoTarget) and spellCnt==0 -> OnOutputAttackOrHeal; Entity forwards to SpController; INCREASE_WHEN_ATTACK increments once; EnemySkill registration contributes SP_RECOVER_STOPPED.'}
d['spContract'] = {'initialSp':0,'maxSp':3,'regenPerSecond':0,'sourceSpType':'INCREASE_WHEN_ATTACK','sharedAcrossModes':True,'spend':'cast-start',
 'attackRecovery':{'event':'ON_OUTPUT_ATTACK_OR_HEAL','amount':1,'force':False,'checkSpType':True,'scope':'source-ability-output',
   'channels':['attack','combat'],'modeIndices':[0,1],'oncePerCast':True,'requiresSuccessfulOutput':True,
   'skillEmitsEvent':True,'stoppedWhileSkillRegistered':True,'respectsSpRecoveryStopped':True,
   'engineEvent':'first-successful-source-animation-output','engineBridgeEvidenceLevel':'Inferred'},
 'sourceEventEvidenceLevel':'Verified-static-base-branch'}

# Include the whole action group and exact native type metadata for each projectile sibling.
b['bindingComplete'] = True
b['roles']['physicsRange'] = b['roles']['range']
b['roles'].update(action=action_key,skill=d['candidates'][sid]['sourceRef'])
b['sameGameObjectComponents'] = {key:c[key] for key in d['candidates'][sid]['sameGameObjectComponents']}
b['ownership'] = d['ownership'][eid]
b['sourceRange'].update(effectiveRadius=2,sourceModeRadius=2,geometryRole='serialized fallback only',
  runtimeRule='Use positive owner current-mode rangeRadius. CircleRange._scaleble=0 replaces collider radius with options.radius; no generic +0.5 expansion.',
  evidenceLevel='Verified-static-base-branch',native='61912_InitCollidersIfNot.asm:0x213bac0..0x213bb9c')
d['excludedCandidates'] = {k:v for k,v in d['candidates'].items() if k!=sid}
d['candidates'] = {sid:d['candidates'][sid]}
d['excludedCandidatesBoundary'] = 'ArmorPiercing mode1 has MultiMeleeAttack + BuffDuringCasting and is not partially implemented by this tagged ranged contract.'
d['timingBindings'] = {sid:{'animationBinding':eid,'animation':'C1_Skill','timeMode':0,'maxAnimScale':1,'minAnimScale':.1,
 'duration':2.0667,'hit':1.4667,'hitTimes':[1.4667],
 'formula':'scale=min(max(owner.attackTime/rawAnimationDuration,0.1),1); total=rawDuration*scale; output=rawOnAttackTime*scale',
 'timingEvidenceLevel':'Verified-native-playback-formula-and-source-events','animationWaiterBridgeEvidenceLevel':'Inferred'}}

types = json.loads(Path('work/client-logic/metadata/types.json').read_text(encoding='utf-8'))
raw = Path('work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
h = struct.unpack_from('<64I',raw)
sec = [h[i:i+2] for i in range(2,64,2)]
fd = {fi:(ti,di) for fi,ti,di in struct.iter_unpack('<iii',raw[sec[7][0]:sum(sec[7])])}
enum_names = ['Torappu.BuffData+StatusResistable','Torappu.BuffData+OverrideType','Torappu.Battle.AbilityStandard+SelectTargetSource',
 'Torappu.Battle.AbilityStandard+SelectTargetTiming','Torappu.Battle.Abilities.AbstractAnimatedAbility+TimeMode','Torappu.Battle.DamageType']
enums = {}
slots = []
for t in types:
    if t['fullName'] in enum_names or t['fullName']=='Torappu.AbnormalFlag':
        values = {}
        for f in t['fields']:
            if f['index'] not in fd or t['fullName']=='Torappu.AbnormalFlag' and f['name'] not in ['STUNNED','SP_RECOVER_STOPPED']:
                continue
            ti,di = fd[f['index']]
            byte = raw[sec[8][0]+di]
            assert byte<128 and ti in [47416,35722]
            values[f['name']] = {'value':byte//2 if ti==47416 else byte,'fieldIndex':f['index'],'rawByte':byte,
              'defaultTypeIndex':ti,'defaultDataOffset':di,'encoding':'compressed-signed-int32-zigzag' if ti==47416 else 'byte'}
        enums[t['fullName']] = values
    if t['fullName'] in ['Torappu.Battle.AbilityStandard','Torappu.Battle.EnemySkill','Torappu.Battle.CircleRange']:
        for m in t['methods']:
            if m['name'] in ['get_recoverSpWhenAffecting','OnOutputAttackOrHeal','OnOutputAttackOrHealEachSpell','OnSpellStart','InitCollidersIfNot']:
                slot = struct.unpack_from('<6I4H',raw,sec[5][0]+m['index']*32)[8]
                slots.append({'type':t['fullName'],'method':m['name'],'methodIndex':m['index'],'slot':slot,'vtableOffset':hex(0x138+slot*16)})
d['metadataEnums'] = enums
d['nativeVirtualSlots'] = slots
d['runtimeContract'] = {
 'kind':'selector-sp-tagged-ranged','modeIndex':0,'skillKey':'ironsandstorm','sourcePrefabName':'IronSandStorm',
 'nameBinding':'case-insensitive-unique-source-name; serialized prefab name differs from explicit DB prefabKey casing',
 'cooldown':0,'initCooldown':0,'spCost':3,'cooldownStarts':'cast-start','normalCooldownPolicy':'retain main cooldown; no reset at skill end',
 'selector':{'kind':'advanced-tag-and-buff','targetSide':2,'targetMotion':1,'targetCategory':1,'postFilter':4,
   'sourcePostFilter':'HATRED_DES','maxTargets':{'key':'max_target','default':2},'range':'owner-current-mode-radius','rangeDefault':2,
   'blockerFirst':False,'excludeTag':'prison','filterTagList':[],'buffFilterEnabled':False,'sourceBuffKey':'','sourceBuffs':[],
   'tagExcluded':True,'checkOrInsteadOfAnd':False,'forceIgnoreCamouflage':False,'ignoreTargetFree':False,
   'targetFreeSpecialCaseEnabled':False,'inactiveAbnormalFlag':20,'inactiveAbnormalCombo':1,
   'selectTargetSource':'FROM_OWNER','selectTargetTiming':'AT_BEGINING','alwaysIncludeTarget':True,
   'includeTargetPolicy':'replace-last-if-absent','allowNoTarget':False,
   'orderingBoundary':'Use shared hatred ordering without a blocker preference; equal-hatred tie order is an explicit implementation convention.'},
 'action':{'kind':'RangedAttack','damageType':'arts','sourceDamageType':2,'sourceAttackType':1,'atkScale':1,'atkScaleKey':'atk_scale',
   'elementType':0,'epDamageRatio':0,'animation':'C1_Skill','timeMode':0,'maxAnimScale':1,'minAnimScale':.1,
   'rawDuration':2.0667,'rawOutputTime':1.4667,'waitForAttackEvent':True,'interruptIfTargetDead':False,'interruptOnDetach':False,
   'affectedBySlowDown':True,'activeBuffs':[{'kind':'stun','duration':{'key':'stun','default':3},'isDamageMissable':True,
     'statusResistible':True,'sourceStatusResistable':'AUTOMATIC','sourceOverrideType':'DEFAULT','maxStackCnt':1,'applyAt':'projectile-hit',
     'durationZero':'no-stun','expiryMerge':'max','expiryMergeEvidenceLevel':'Inferred'}]},
 'projectile':{'key':'projectile_enemy_jakill_s1','kind':'single-trace-target','speed':10,'lifeTime':10,'maxHitNum':1,
   'canHitSameTargetMultipleTimes':False,'stopAfterMaxHit':True,'stopWhenSourceInvalid':False,'managedBySource':False,
   'forceReachedWhenTimeup':True,'alwaysHitTraceTargetInTheEnd':True,'alwaysHitTraceTargetWhenReached':False,
   'waitForProjectileInvalid':False,'notClearProjectileWhenCastEnd':False,'fireAttackFinishWhenProjectileInvalid':False,
   'waitForAnimEndWhenProjectileInvalid':False,'minPostDelayWhenProjectileInvalid':0,
   'castEndBehavior':'Released projectiles survive ordinary cast end: RangedAttack.OnCastEnd clears only if waitForProjectileInvalid is true and notClearProjectileWhenCastEnd is false; this source wait flag is false.',
   'castEndEvidenceLevel':'Verified-static-base-branch','payloadBuffs':'active buffs belong to projectile action controller and attach on hit, not at animation release',
   'arrivalRevalidation':'Keep original target; do not reselect by tag/range after emission. Removed/dead target guard is the shared entity-lifecycle convention.',
   'timeoutBehavior':'If life expires with a still-valid original trace target, resolve one hit on that target; never substitute another target.',
   'timeoutEvidenceLevel':'Inferred-from-complete-projectile-flags',
   'damageBuffOrdering':'Apply source damage and source active Buff on the same projectile hit. Exact internal damage-versus-buff suborder is not fully recovered; runtime uses damage then Buff after the same dodge decision.',
   'damageBuffOrderingEvidenceLevel':'Inferred'},
 'sp':d['spContract'],
 'sourceOutputEvent':{'at':'successful first spell output; after pre-delay yield; before projectile arrival','perCast':1,'perTarget':False,'perHit':False,
   'dodgeDependent':False,'skillCallsSameEvent':True,'skillGainBlockedByRegisteredModifier':True,'evidenceLevel':'Verified-static-base-branch',
   'engineBridge':'performEnemyBasicHit at first source OnAttack event creates projectiles then calls attackRecovery once. The waitForAttackEvent-to-native event-listener bridge remains Inferred.'},
 'sourceModifier':{'abnormalFlag':'SP_RECOVER_STOPPED','flagValue':1,'mask':2,'during':'EnemySkill registered-as-modifier interval',
   'derive':'get_abnormalFlagMask => recoverSpWhenAffecting ? 0 : 2; default recoverSpWhenAffecting returns false without a live hotfix',
   'evidenceLevel':'Verified-static-base-branch'},
 'checkpoint':{'primitivePayload':True,'persist':['sourceSkillId','sourceSkillKind','stun duration/missability/resistibility','source cast token','timeMode snapshot','projectile life/speed'],
   'entityReferences':'reuse existing projectile owner/target VM rebinding; do not add unregistered object references'},
 'scope':'Complete IronSandStorm skill and reusable tagged ranged + loaded hit Buff + attack-SP contract. No completion claim for all Jakill phases, talents or ArmorPiercing.'
}
d['verified'] = [
 {'claim':'SP comes from explicit DB INCREASE_WHEN_ATTACK / init0 / max3 / increment1, not a guessed periodic every-third-basic counter.','source':'database;spBindings'},
 {'claim':'OnSpellStart only calls the once-per-cast OnOutputAttackOrHeal when spellCnt==0 and output succeeds (allowNoTarget is false here); EachSpell is a separate hook.','source':'52765_OnSpellStart.asm:0x4d05334..0x4d05420'},
 {'claim':'Entity forwards OnOutputAttackOrHeal to SpController; its attack-type gate and increment invoke non-forced recovery, which honors SP_RECOVER_STOPPED.','source':'56031_OnOutputAttackOrHeal.asm;56097_OnOutputAttackOrHeal.asm;56100__RecoverMp.asm'},
 {'claim':'EnemySkill registration contributes SP_RECOVER_STOPPED when recoverSpWhenAffecting is false. Default base getter returns false; normal skill output does not refill its own SP.','source':'55659_get_abnormalFlagMask.asm;native-enemy-scheduler/55651.asm;55678.asm;nativeVirtualSlots'},
 {'claim':'CircleRange _scaleble0 sets its radius to options.radius when nonnegative. Real collider2.25 is replaced by current owner mode radius2; no invented half-tile radius is added.','source':'61912_InitCollidersIfNot.asm;bindings'},
 {'claim':'loadFromDB stun uses actual DB abnormalFlag0, isDamageMissable=true, durationKey stun, statusResistable AUTOMATIC. AUTOMATIC checks source static list[0,16,43,41], which contains STUNNED0.','source':'buffBindings;status-resistable-array.json;54678__AutoCalcIsStatusResistable.asm'},
 {'claim':'Complete projectile GO contains SimpleProjectile, AdvancedMovement and EffectBehaviour with speed10/life10/maxHit1. ActionController attaches Buffs at OnHitTarget. Cast end does not clear this waitForProjectileInvalid=false projectile.','source':'projectileBindings;59903_OnHitTarget.asm;74543_OnCastEnd.asm'},
]
d['inferred'] = [
 'Native pre-delay yield precedes OnSpellStart; using the source OnAttack1.4667 event as the engine output point reuses the existing animation-listener bridge.',
 'Exact equal-hatred tie ordering, collision geometry against target bodies, projectile timeout terminal behavior and removed-entity handling use explicit shared runtime conventions.',
 'stun expiry is merged with max(existing expiry,new expiry). Source overrideType DEFAULT and maxStack1 are frozen, but the full override-group time merge implementation is not recovered.',
 'Damage and loaded hit Buff occur on the same projectile collision; exact suborder and missability coupling follow the shared runtime bridge. No unreadable method is cited as proof.',
 'Native formula supports playback updates; current compiler/runtime snapshots effective owner attack interval at cast start.',
]
d['corrections'] = [
 {'oldAssumption':'Tag prisoner / every three normal attacks / raw prefab activeBuff missable=false','replacement':'Exact tag prison; actual attack-type SP event and skill registration stop flag; loaded DB stun missable=true.'},
 {'oldAssumption':'CircleRange owner radius override was only inferred in previous area-melee evidence','replacement':'New CircleRange.InitCollidersIfNot closes the downstream setter; older area contract remains immutable and references can cite this new evidence.'},
]
d['remainingBoundaries'] = ['No live XLua replacement method contents are recovered by static native branches.',
 'ArmorPiercing, Reborn/Enhance/LibertyOthers remain separately tracked; no group prefix is marked as full enemy completion.',
 'Previously unreadable methods were not retried. Newly partial/unreadable methods are frozen in nativeEvidence and not treated as recovered implementations.']

native_dir = Path('work/client-logic/native-enemy-tagged-ranged')
native = []
for path in sorted(native_dir.glob('*')):
    if not path.is_file(): continue
    rec = source(path)
    if path.suffix=='.asm':
        n=sum(bool(line.strip()) and not line.startswith(';') for line in path.read_text(encoding='utf-8').splitlines())
        rec.update(instructions=n,status='unreadable-no-retry' if n==0 else 'partial-readable-no-tail-retry' if path.name=='74072_OnCastEnd.asm' else 'readable-static-base-branch')
    native.append(rec)
shared_paths = ['work/client-logic/native-enemy-scheduler/55651.asm','work/client-logic/native-enemy-scheduler/55669.asm',
 'work/client-logic/native-enemy-scheduler/55678.asm','work/client-logic/native-enemy-skill-sp/55680_TryReduceSp.asm',
 'work/client-logic/native-enemy-skill-sp/64200__GenerateSpData.asm','work/client-logic/native-enemy-area-melee/55665_AssignData.asm',
 'work/client-logic/native-enemy-area-melee/55681__GetRangeRadius.asm','work/client-logic/native-enemy-self-cast/75490_get_cooldown.asm',
 'work/client-logic/native-enemy-self-cast/75505_UpdatePlaybackSpeed.asm','work/client-logic/native-enemy-area-melee/52780_UpdateTargets.asm']
native.extend(source(path) for path in shared_paths)
d['nativeEvidence'] = native
inputs = {k:source(v['path']) for k,v in d['priorityInputs'].items() if k in ['catalog','ownership','encounters']}
inputs.update(priority=source('work/garrison-skill-dispatch-priority.json'),enemyDatabase=source('data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'),
 rangeBundle=source('work/client-logic/bundles/battle/enm_pfb_18.ab.json'),projectileBundle=source('work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json'),
 scripts=source('work/client-logic/script-types.json'),buffTable=source(base/'data_buff_table.json'),buffSchema=source(base/'buff_templates.py'),
 buffTemplates=source(base/'data_buff_templates.json'),animation=source(base/'data_enemy_spine_events.json'),
 metadata=source('work/client-logic/metadata/global-metadata.candidate.dat'))
inputs['nativeEvidence']={'files':native}
d.update(schemaVersion=1,rule='frozen-selector-sp-tagged-ranged-v1',status='complete-focused-contract-with-explicit-runtime-bridges',bindingComplete=True,
 memberIDs=[eid],skillIDs=[sid],inputs=inputs,
 sourceFingerprint=hashlib.sha256(json.dumps(inputs,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
 sourceVersion={'serialized':'frozen CN catalog and exact DB snapshot','ownershipAndNative':'JP36.7.22 existing ARM64 and bundle extraction; hashes authoritative'})
d.pop('priorityInputs',None)
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'path':str(p),'sourceFingerprint':d['sourceFingerprint'],'bytes':p.stat().st_size,'nativeFiles':len(native),'normalAbilityBindings':len(normal)},ensure_ascii=False))
