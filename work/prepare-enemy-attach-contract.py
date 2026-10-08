"""Freeze cached attachment source and already saved native evidence; no scan."""
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))
def sha(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def normalize(value):
    if isinstance(value,dict):return {k:str(v) if k=='m_PathID' else normalize(v) for k,v in value.items()}
    if isinstance(value,list):return list(map(normalize,value))
    return value

worklist=read('work/enemy-next-shared-worklist-20260918.json')
group=next(g for g in worklist['groups'] if g['id']=='attach-to-target-projectile')
ordinary=read('work/enemy-next-ordinary-source-selection.json')
resources=read('work/enemy-next-shared-provider-selection.json')
actionOwned=read('work/enemy-attach-action-owned-source.json')
projectileOwned=read('work/enemy-attach-projectile-owned-source.json')
encounters=read('web/enemy_encounters.json')['enemies']
text=(ROOT/'web/external_combat_data.js').read_text(encoding='utf-8')
external=json.loads(text.split('window.ArkExternalCombatData=',1)[1].rsplit(';',1)[0])
inputs=['work/enemy-next-shared-worklist-20260918.json','work/enemy-next-ordinary-source-selection.json',
        'work/enemy-next-shared-provider-selection.json','work/enemy-attach-action-owned-source.json',
        'work/enemy-attach-projectile-owned-source.json','work/client-logic/skill-ammo-target-enums.json',
        'work/client-logic/selector-post-filter-enum.json','work/client-logic/skill-target-timing-enum.json',
        'work/client-logic/native-ammo-selector/contract.json','web/enemy_encounters.json',
        'work/client-logic/native-ammo-selector/62742_OnPostFilter.asm',
        'work/client-logic/native-ammo-selector/62744__CheckSecondFilter.asm',
        'work/client-logic/native-enemy-tagged-ranged/61912_InitCollidersIfNot.asm',
        'work/enemy-attach-projectile-destination-enum.json',
        'work/client-logic/script-types.json',
        'data/ArknightsGameData/zh_CN/gamedata/buff_table.json','work/client-logic/buff-templates.json',
        'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json']
out={'schemaVersion':1,'rule':'cached-attach-to-target-area-delivery-assessment-v1',
     'status':'closed-source-with-explicit-simulation-policies','boundRuntime':False,
     'inputs':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in inputs},'members':{}}
for eid in group['members']:
    source=next(r for r in ordinary['enemies'] if r['id']==eid)
    assert len(source['actions'])==1 and source['modes']['complete']
    action=source['actions'][0];af=action['fields'];key=af['_projectileKey'];resource=resources[key]
    assert resource['completeMonoBehaviourCoverage'] and not resource['failures']
    assert len(source['modes']['modes'])==1
    channels=source['modes']['modes'][0]['channels']
    assert set(channels)=={'combat','attack'} and all(str(x['pathID'])==action['pathID'] for x in channels.values())
    types={r['script']['type']:r for r in resource['components'].values()}
    assert len(types)==4 and set(types)=={'Torappu.Battle.SimpleProjectile','Torappu.Battle.Projectiles.EffectBehaviour',
        'Torappu.Battle.Projectiles.AttachToTarget','Torappu.Battle.Projectiles.HitBehaviour'}
    attach=types['Torappu.Battle.Projectiles.AttachToTarget']['fields']
    simple=types['Torappu.Battle.SimpleProjectile']['fields'];hit=types['Torappu.Battle.Projectiles.HitBehaviour']['fields']
    colliders=[n for n in projectileOwned['nodes'].values() if n['unityType']=='CircleCollider2D']
    assert len(colliders)==1
    radius=colliders[0]['fields']['m_Radius'];selector=next(r for r in source['relatedComponents'] if r['scriptType'].endswith('SecondaryFilterAdvancedSelector'))
    sf=selector['fields'];rootColliders=[n for n in actionOwned['nodes'].values() if n['unityType']=='CircleCollider2D']
    assert len(rootColliders)==1
    differences={}
    for row in source['relatedComponents']:
        cn=normalize(row['fields']);jp=normalize(actionOwned['nodes'][row['pathID']]['fields'])
        jp={k:v for k,v in jp.items() if k not in {'m_GameObject','m_Script','m_Name','m_Enabled'}}
        differences[row['scriptType']]={'onlyCN':{k:v for k,v in cn.items() if k not in jp},
            'onlyJP':{k:v for k,v in jp.items() if k not in cn},
            'changed':{k:{'cn':v,'jp':jp[k]} for k,v in cn.items() if k in jp and v!=jp[k]}}
        assert not differences[row['scriptType']]['changed'] and not differences[row['scriptType']]['onlyJP']
    assert sf['_secondaryFilter']==3 and sf['_postFilter']==4
    assert not af['_activeBuffs'] and not af['_extraProjectileKeys']
    proposed={'kind':'delayed-static-area-projectile','binding':{'modeIndex':0,'channels':['combat','attack'],'sharedAction':True},
        'selection':{'side':'opponent','motion':'all','categoryMask':1,'maxTargets':1,'limitKey':sf['_maxTargetKey'],
            'postOrder':'hatred-descending','priorityBuff':{'key':sf['_buffKey'],'without':bool(sf['_withoutThisBuff']),
            'filterSource':bool(sf['_filterBuffSource'])},'sortByTauntAtLast':True,
            'timing':'BEFORE_SPELL_START','sourceTimingRaw':af['_selectTargetTiming'],
            'range':{'prefabRadius':rootColliders[0]['fields']['m_Radius'],'databaseRadius':encounters[eid]['rangeRadius'],
                     'policy':'positive owner current-mode rangeRadius replaces serialized fallback; _scaleble=0, saved CircleRange native contract'},
            'priorityPolicy':'exact-key marked group first, then hatred and stable deployment order; final comparer precedence is a simulation model, not native proof',
            'fallback':'retain unmarked candidates; secondaryFilter3 is not a hard eligibility filter with sortByTauntAtLast=true'},
        'schedule':{'sourceAnimation':external['enemies'][eid]['timing'],'cooldown':'existing ordinary attackTime',
                    'release':'source OnAttack','scaleCap':af['_maxAnimScale'],'waitForProjectile':False},
        'packet':{'projectileKey':key,'damageType':'phys','atkScale':af['_atkScale'],'attackTypeRaw':af['_attackType'],
            'cachedSourcePower':bool(af['_useCachedAtkOnly']),'activeBuffs':[],
            'placement':{'destinationRaw':af['_projectileDestination'],'followTarget':bool(attach['_followTarget']),
                'keepUpdating':bool(attach['_keepUpdate']),'attachToMountPoint':bool(attach['_attachToMountPoint']),
                'destination':'INPUT_VECTOR3','capture':'on-emission',
                'policy':'freeze selected target current 2D position at OnAttack emission; precise native input capture frame and height projection are not asserted'},
            'delay':attach['_delayToStart'],'maxLifetime':simple['_lifeTime'],
            'arrival':{'checkReached':bool(attach['_checkReached']),'immediatelyReach':bool(attach['_immediatelyReach']),
                'forceReachOnLifetimeEnd':bool(simple['_alwaysReachInTheEnd'])},
            'area':{'shape':'circle','radius':radius,'rangeScale':'shared source range scale (ignoreRangeScale=false)',
                'side':'opponent','motion':'all','categoryMask':1,'ignoreCamouflage':bool(hit['_ignoreCamouflage']),
                'respectTargetFree':True,'hitAt':'reach','perTargetOnce':True,'maxHitTargets':None,
                'forceTraceHit':False,'policy':'only eligible current entities inside locked area; no forced single-target fallback'},
            'lifecycle':{'stopIfTargetDead':bool(attach['_stopIfTargetDead']),
                'stopIfTargetDisappeared':bool(attach['_stopIfTargetDisappeared']),
                'stopWhenSourceInvalid':bool(simple['_stopWhenSourceInvalid']),
                'managedBySource':bool(simple['_managedBySource']),
                'notClearProjectileWhenCastEnd':bool(af['_notClearProjectileWhenCastEnd']),
                'castEndPolicy':'emitted-projectiles-independent simulation contract; raw source flag retained'}},
        'persistentState':['owner/target top-level existing projectile refs','frozen x/y/ATK/type/area/source parameters','resolveAt/life','resolved guard and optional hit IDs']}
    out['members'][eid]={'name':encounters[eid]['name'],'sourceAction':action,'sourceRelatedComponents':source['relatedComponents'],
        'modeBindings':source['modes'],'projectileSource':resource,'actionOwnedSource':'work/enemy-attach-action-owned-source.json',
        'projectileOwnedSource':'work/enemy-attach-projectile-owned-source.json','crossSnapshotFieldComparison':differences,
        'timing':external['enemies'][eid]['timing'],'timingSha256':sha(external['enemies'][eid]['timing']),
        'proposedSharedIR':proposed,'resolvedDependencies':[
            {'kind':'source-range','evidence':'61912_InitCollidersIfNot.asm 0x213bac0..0x213bb9c, _scaleble=0 replaces collider with options.radius; reuses existing tagged-ranged contract','effectiveRadius':encounters[eid]['rangeRadius']},
            {'kind':'secondary-selector','evidence':'62744 0x2178754..0x2178810: SPECIFIED_BUFF3 calls ContainsBuff. 62742 0x2177f44..0x217809c: sortByTauntAtLast=true reorders matching prefix without removing unmatched candidates, then final sort before limit. Final comparer is not recovered.'},
            {'kind':'destination-enum','evidence':'work/enemy-attach-projectile-destination-enum.json; exact cached metadata default field84429:2=INPUT_VECTOR3'}],
        'implementationDependencies':[
            {'kind':'source-range-initialization-policy','facts':'Action CircleCollider radius4, ancestors identity scale, CircleRange extendable/scaleble false; CN encounter rangeRadius2.',
             'needed':'Reuse saved native owner range replacement; no additional source work needed.'},
            {'kind':'secondary-selector-composition','facts':'SPECIFIED_BUFF3 + mark_neutral[effect], HATRED_DES4, sortByTauntAtLast=true.',
             'needed':'Implement marked group first / same-group hatred as explicit stable simulation policy; retain unmarked fallback. Do not claim unrecovered final native comparator order.'},
            {'kind':'environment-marker-producer','facts':'mark_neutral[effect] absent from current buff_table and buff-template maps; no existing web/src consumer/producer found.',
             'needed':'Accept a generic explicit source marker query for future providers; without marker producer only the unmarked fallback is naturally reachable. Marker priority tests must be marked fixtures.'},
            {'kind':'attachment-anchor-and-delay-clock','facts':'destinationRaw2, delayToStart3, followTarget0, keepUpdate0, checkReached1, immediatelyReach0.',
             'needed':'INPUT_VECTOR3 enum is bound; freeze 2D target position at emission and resolve after delayToStart as explicit frame/height model.'},
            {'kind':'ordinary-source-target-timing','facts':'SelectTargetTiming1 is BEFORE_SPELL_START; current ordinary engine freezes a target when attack scheduling starts.',
             'needed':'Keep existing ordinary schedule-start target selection and emit-time position capture as explicit source-phase mapping.'},
            {'kind':'delayed-area-lifecycle-and-restore','facts':'3s delay can outlive1.1666666s action; source invalid/target dead/disappeared stop flags false, force trace flags false, force reach at lifetime end true.',
             'needed':'Existing projectile queue needs frozen area packet and one arrival guard. Preserve owner-death independence under declared model, area hits when traced target leaves/dies, expiry not double-hit, pool reset and host restoration.'}],
        'implementationReady':True}
out['implementationPlan']={'minimumSharedFiles':['new bounded attach-area compiler/helper','web/src/simulation/external-combat.js provider contract',
    'shared enemy selector exact Buff priority query','web/engine.js source packet release/area arrival/pool reset',
    'existing room projectile refs/state serializer (only if nested refs introduced; avoid them)'],
    'reuse':['ArkExternalCombat.actionTiming cap','ArkClientPrograms.targetPriority','ArkEnemySkills.validTarget',
    'B.projectiles and resolveAt/life','enemyDamagePacketToOperator/inflictDamage','existing owner/target host link restoration'],
    'acceptance':['delayed3s never instantaneous','single cached ATK packet physical area1.2, no force trace hit','marked-priority fixture and unmarked real fallback',
    'selected target movement/death after emission does not retarget frozen area','source dies after emission','max lifetime one arrival only',
    'ordinary cooldown and post-animation movement continue','projectile pool reset','host checkpoint before area arrival']}
out['boundaries']=['Source fields and complete cached component ownership are preserved; proposed phase, range and lifetime models are not native conclusions.',
 'Only already saved ASM, enum/contract files and five cached metadata default entries were read. No native library scan, extraction or disassembly was performed.',
 'One actual-pool source only; no extrapolated coverage or whole-enemy completion claim.']
target=ROOT/'work/enemy-attach-projectile-contract.json';target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'path':str(target),'sourceMembers':list(out['members']),'implementationReady':True},ensure_ascii=False))
