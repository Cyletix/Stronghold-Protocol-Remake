"""Compile complete ordinary RangedAttack -> delayed static AttachToTarget bodies.

The candidate cache is a discovery optimization, never an enemy-ID dispatcher.
Unknown components/fields reject the whole root. Precise input capture frame,
final marker/taunt comparator and emitted lifetime bridging are explicit models.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from enemy_chain_projectiles import (ROOT, ACTION_FIXED as BASE_ACTION, ACTION_VARIABLE,
    SIMPLE, FIXED_FIELDS, VARIABLE_FIELDS, VISUAL_FIELDS, UNITY_FIELDS, zeros, finite, field_contract, local_ref)
from enemy_selectable_attacks import SELECTOR_FIXED, HIT_FIXED, Rejected, require, exact
from enemy_skill_dispatch import EMITTER_FIELDS, DAMAGE_TYPES

CACHE = ROOT / 'work/enemy-attach-projectile-contract.json'
RULE = 'ordinary-attach-input-vector-delayed-circle-v1'
P = 'Torappu.Battle.'
RANGED=P+'Abilities.RangedAttack'
SELECTOR=P+'SecondaryFilterAdvancedSelector'
TRIGGER=P+'SelectorTrigger'
CIRCLE=P+'CircleRange'
ATTACH=P+'Projectiles.AttachToTarget'
HIT=P+'Projectiles.HitBehaviour'
EFFECT=P+'Projectiles.EffectBehaviour'
EMITTER=P+'Abilities.UberEffectEmitter'
NULL={'m_FileID':0,'m_PathID':'0'}
ACTION_FIXED=dict(BASE_ACTION,_selectTargetTiming=1,_selectTargetSource=1,_elementDamageType=0,
    _waitForProjectileInvalid=0,_projectileDestination=2,_useCachedAtkOnly=1)
for key in ('_damageType','_atkScale'): ACTION_FIXED.pop(key)
ACTION_VARIABLE=set(ACTION_VARIABLE)|{'_damageType','_atkScale'}
SELECTOR_FIXED=dict(SELECTOR_FIXED,_targetSide=2,_abnormalFlag=20,_abnormalCombo=1,
    _sortByTauntAtLast=1,_secondaryFilter=3,_filterTag='',_withoutThisBuff=0,
    _filterBuffSource=0,_buffKeyPairs=[],_excludeEnemyInRootTileAtFirst='')
ATTACH_FIXED=zeros('''_rotateToTarget _forceReachedWhenTimeup _useSourceDirection _useTargetDirection
 _useStartToTarget _awayFromSourceAsDirection _flyToTargetLocationOnly _useSourceDirectionRandomArcAngleStart
 _useSourceToTargetRandomArcAngleStart _useSourceDirectionArcAngleWithRatio _useSourceToTargetArcAngleWithRatio
 _sourceDirectionArcAngleRatio _flyToPredefinedLocation _predefinedLocation _freezeRotationZ _freezeRotationXY
 _exactMatchCameraForward _resetToTargetPosWhenReached _resetToTracetargetMapPosV3 _handleWithIBuildableTarget
 _forceResetToTargetPosWhenReached _fixOnProjectileReached _onlyReachedInTime _keepUpdate _attachToMountPoint
 _ignoreMountPointHeight _delayAfterReached _updateDelayTimeOnlyOnce _delayTime _extraDelayTime
 _immediatelyReach _stopIfTargetDead _stopIfTargetDisappeared _followTarget''',_mountPointType=1,_checkReached=1)
SCHEMA_OMISSIONS={RANGED:{'_affectedBySlowDown':1,'_checkFaceToFirstCastTargetDownAttack':0},
    SELECTOR:{'_ignoreMotionMode':0,'_excludeSomeAbnormalFlags':0,'_excludeAbnormalFlag':46}}

def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def fingerprint(obj):return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def normalized(obj):
    if isinstance(obj,dict):return {k:str(v) if k=='m_PathID' else normalized(v) for k,v in obj.items()}
    if isinstance(obj,list):return list(map(normalized,obj))
    return obj
def body(node):return {k:v for k,v in normalized(node['fields']).items() if k not in UNITY_FIELDS}
def ref(value):
    require(local_ref(value),'invalid-local-reference')
    return str(value['m_PathID'])

def load_attach_candidates(path=CACHE):
    data=read(path)
    for relative,digest in data['inputs'].items():
        require(hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()==digest,'changed-attach-source:'+relative)
    scripts={pid:row['m_Namespace']+'.'+row['m_ClassName'] for match in
        read(ROOT/'work/client-logic/script-types.json')['matches'] for pid,row in match['scripts'].items()}
    candidates={}
    for eid,row in data['members'].items():
        candidates[eid]=dict(row,actionGraph=read(ROOT/row['actionOwnedSource']),
            projectileGraph=read(ROOT/row['projectileOwnedSource']),scriptTypes=scripts)
    return candidates

def graph_types(graph,scripts):
    nodes=graph['nodes'];types={};owned=set()
    for pid,node in nodes.items():
        require(str(node['pathId'])==pid,'node-id-mismatch')
        fields=normalized(node['fields']);kind=node['unityType']
        if kind=='GameObject':
            require(fields.get('m_IsActive')==1,'inactive-owned-object')
            for component in fields['m_Component']:
                cid=ref(component['component']);require(cid in nodes,'incomplete-owned-components')
                require(ref(nodes[cid]['fields']['m_GameObject'])==pid,'component-owner-mismatch')
                require(cid not in owned,'duplicate-owned-component');owned.add(cid)
        else:require(ref(fields['m_GameObject']) in nodes,'missing-component-owner')
        if kind=='MonoBehaviour':
            require(fields.get('m_Enabled')==1,'disabled-component')
            script=fields.get('m_Script',{});name=scripts.get(str(script.get('m_PathID')))
            require(script.get('m_FileID')==1 and name,'unresolved-script')
            types.setdefault(name,[]).append((pid,node))
        elif kind=='Transform':
            exact(fields,dict(m_LocalRotation=dict(x=0,y=0,z=0,w=1),m_LocalPosition=dict(x=0,y=0,z=0),
                m_LocalScale=dict(x=1,y=1,z=1)),{'m_GameObject','m_Children','m_Father'},'transform')
            for child in fields['m_Children']:require(ref(child) in nodes,'missing-child-transform')
        elif kind=='CircleCollider2D':
            require(fields.get('m_Enabled')==1 and fields.get('m_IsTrigger')==1 and fields.get('m_Offset')==dict(x=0,y=0),
                'unsupported-circle-transform')
        else:require(kind=='GameObject','unhandled-unity-component:'+kind)
    require(owned=={pid for pid,node in nodes.items() if node['unityType']!='GameObject'},'unowned-component')
    return types

def compile_attach_attack(candidate):
    try:return _compile(candidate)
    except (Rejected,KeyError,TypeError,ValueError) as exc:return dict(accepted=False,rejections=[str(exc)])

def _compile(c):
    mode=c['modeBindings'];action=c['sourceAction'];fields=normalized(action['fields'])
    require(mode['complete'] and len(mode['modes'])==1 and mode['modes'][0]['modeIndex']==0,'incomplete-single-mode-root')
    channels=mode['modes'][0]['channels']
    require(set(channels)=={'combat','attack'} and all(str(row['pathID'])==action['pathID'] and
        normalized(row['fields'])==fields for row in channels.values()),'mixed-channel-root')
    exact(fields,ACTION_FIXED,ACTION_VARIABLE,'ranged-action')
    require(fields['_damageType'] in DAMAGE_TYPES and finite(fields['_atkScale']) and fields['_atkScale']>0,
        'invalid-attack-packet')
    require(all(isinstance(fields[k],str) for k in ('_animKey','_endAnimKey','_projectileKey')) and
        fields['_animKey'] and fields['_projectileKey'] and not any(fields[k] for k in
        ('_downAnimKey','_downEndAnimKey','_upAnimKey','_upEndAnimKey')),'unsupported-animation-variants')
    typed=graph_types(c['actionGraph'],c['scriptTypes'])
    require(set(typed)=={RANGED,SELECTOR,TRIGGER,CIRCLE,EMITTER} and all(len(v)==1 for v in typed.values()),
        'extra-or-missing-action-component')
    require(typed[RANGED][0][0]==action['pathID'],'action-root-mismatch')
    related=c['sourceRelatedComponents']
    require(len(related)==4 and {r['scriptType'] for r in related}=={RANGED,SELECTOR,TRIGGER,CIRCLE},'incomplete-related-fields')
    for row in related:
        pid,node=typed[row['scriptType']][0]
        require(str(row['pathID'])==pid,'source-component-reference-mismatch')
        src=normalized(row['fields']);raw=body(node)
        omitted=SCHEMA_OMISSIONS.get(row['scriptType'],{})
        require(all(k in raw or src.get(k)==v for k,v in omitted.items()),'cross-snapshot-nondefault-field')
        require(raw=={k:v for k,v in src.items() if k in raw},'cross-snapshot-fields-disagree')
        require(set(src)-set(raw)<=set(omitted),'unexplained-cross-snapshot-field')
    selector=normalized(next(r['fields'] for r in related if r['scriptType']==SELECTOR))
    exact(selector,SELECTOR_FIXED,{'_buffKey'},'secondary-selector')
    require(isinstance(selector['_buffKey'],str) and selector['_buffKey'],'empty-priority-buff-key')
    require(ref(fields['_selector'])==typed[SELECTOR][0][0],'selector-not-bound')
    exact(body(typed[TRIGGER][0][1]),dict(_keepTarget=0,_minTargetNum=1,_overrideSearchTargetTick=-1),where='trigger')
    exact(body(typed[CIRCLE][0][1]),dict(_extendable=0,_scaleble=0),where='selector-range')
    selector_owner=ref(typed[SELECTOR][0][1]['fields']['m_GameObject'])
    require(all(ref(typed[t][0][1]['fields']['m_GameObject'])==selector_owner for t in (CIRCLE,TRIGGER)),
        'selector-range-trigger-owner-mismatch')
    emitter=body(typed[EMITTER][0][1]);require(set(emitter)==EMITTER_FIELDS,'unknown-visual-emitter-fields')
    require(not any(emitter[k] for k in ('_hitEffects','_attachEffects','_inputTargetEffects','_castTargetEffects',
        '_convertCastEndToAttachFinish','_recalculatePlaybackSpeed','_preDelayFactor')),'unsupported-emitter-side-effects')
    projectile=c['projectileSource'];require(projectile['completeMonoBehaviourCoverage'] and not projectile['failures'],
        'incomplete-projectile-coverage')
    pt=graph_types(c['projectileGraph'],c['scriptTypes'])
    require(set(pt)=={SIMPLE,ATTACH,HIT,EFFECT} and all(len(v)==1 for v in pt.values()),'unknown-projectile-sibling')
    require(set(projectile['components'])=={rows[0][0] for rows in pt.values()},'projectile-component-coverage-mismatch')
    for rows in pt.values():
        pid,node=rows[0];require(normalized(projectile['components'][pid]['fields'])==normalized(node['fields']),
            'projectile-source-disagreement')
    simple=body(pt[SIMPLE][0][1]);attach=body(pt[ATTACH][0][1]);hit=body(pt[HIT][0][1]);effect=body(pt[EFFECT][0][1])
    exact(simple,dict(FIXED_FIELDS[SIMPLE],_stopAfterMaxHit=0,_alwaysReachInTheEnd=1),VARIABLE_FIELDS[SIMPLE],'simple')
    require(simple['_bodyTransform']==NULL and finite(simple['_lifeTime']) and simple['_lifeTime']>0,'unsupported-projectile-body-or-lifetime')
    exact(attach,ATTACH_FIXED,{'_delayToStart'},'attach')
    require(finite(attach['_delayToStart']) and 0<=attach['_delayToStart']<=simple['_lifeTime'],'invalid-attach-delay')
    exact(hit,HIT_FIXED,{'_rangeToLoad'},'hit');require(hit['_rangeToLoad']==NULL,'unexpected-loaded-hit-range')
    require(set(effect)==VISUAL_FIELDS[EFFECT],'unclassified-projectile-effect-field')
    collider=[node for node in c['projectileGraph']['nodes'].values() if node['unityType']=='CircleCollider2D']
    require(len(collider)==1,'missing-or-extra-hit-collider');radius=collider[0]['fields']['m_Radius']
    require(finite(radius) and radius>0,'invalid-hit-radius')
    timing=c['timing'];require(timing.get('animation')==fields['_animKey'] and not timing.get('hits') and
        finite(timing.get('duration')) and timing['duration']>0 and finite(timing.get('hit')) and
        0<=timing['hit']<=timing['duration'],'unsupported-animation-events')
    radius_default=c['proposedSharedIR']['selection']['range']['databaseRadius']
    require(finite(radius_default) and radius_default>0,'missing-owner-range')
    packet=dict(kind='delayed-static-circle',key=fields['_projectileKey'],delay=attach['_delayToStart'],
        lifeTime=simple['_lifeTime'],radius=radius,scalable=True,hitAt='reach',oncePerTarget=True,maxHitTargets=None,
        targetSide='enemy',ignoreCamouflage=True,ignoreTargetFree=False,forceTraceHit=False,
        destination='INPUT_VECTOR3',capture='on-emission',followTarget=False,forceReachOnLifetimeEnd=True,
        stopWhenSourceInvalid=False,stopIfTargetDead=False,stopIfTargetDisappeared=False,
        castEndPolicy='emitted-projectiles-independent',sourceOptions=dict(simple=simple,attach=attach,hit=hit))
    result=dict(rule=RULE,kind='ordinary-attached-area',modeIndex=0,channels=['combat','attack'],
        selector=dict(kind='buff-priority',buffKey=selector['_buffKey'],limit=1,side='enemy',motionMask=3,
            categoryMask=1,range=dict(kind='owner-mode',default=radius_default),ignoreTargetFree=False,
            forceIgnoreCamouflage=False,sort='marked-first-then-hatred',unmarkedFallback=True),
        action=dict(timing=deepcopy(timing),timeMode=0,minAnimScale=.1,maxAnimScale=fields['_maxAnimScale'],
            atkScale=fields['_atkScale'],damageType=DAMAGE_TYPES[fields['_damageType']],delivery='projectile'),
        projectile=packet,sourceLifecycle={k:fields[k] for k in ('_selectTargetTiming','_selectTargetSource',
            '_interuptIfTargetDead','_waitForProjectileInvalid','_notClearProjectileWhenCastEnd','_useCachedAtkOnly')},
        boundary='Source body only. Owner-mode range override reuses saved native evidence. Marked-first final priority, ordinary cast-start target lock, OnAttack 2D input capture and independent delayed emission lifetime are explicit simulation policies; marker producers and original visuals remain outside this provider.')
    return dict(accepted=True,attachedProjectile=result,timing=deepcopy(timing),
        sourceFingerprint=fingerprint({k:v for k,v in c.items() if k!='scriptTypes'}),rejections=[])
