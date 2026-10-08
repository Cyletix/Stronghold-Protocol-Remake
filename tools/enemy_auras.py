"""Complete maintained enemy Aura + damage event + self attribute source family.

The bounded candidate cache contains whole Talent containers, not ID-selected
executors. Every component and referenced action template must close together.
Ordinary attacks, enemy modes and whole-enemy completion remain separate.
"""
from copy import deepcopy
import hashlib
import json

from enemy_selectable_attacks import (ROOT, P, NULL, Rejected, require, exact as _exact,
    owner, ref_id, body, validate_owned_graph, compare_fields)
from enemy_periodic_abilities import TALENT_FIELDS
from enemy_mode_blocked_provider import BUFF_DEFAULTS, ATTRIBUTE_KEYS
from enemy_skill_dispatch import finite, zeros
from enemy_self_cast_skills import DORMANT_FIXED
from direct_skill_compiler import BuffCompiler

RULE = 'maintained-enemy-circle-aura-damage-event-self-resistance-v1'
CACHE = ROOT / 'work/enemy-aura-candidates.json'
TEMPLATES = ROOT / 'work/enemy-aura-template-source.json'
STATUS_SOURCE = ROOT / 'work/enemy-aura-sluggish-source.json'
AURA, PASSIVE = P+'Abilities.AuraAbility', P+'Abilities.PassiveBuffAbility'
TALENT, APPEAR, CIRCLE, VALIDATOR = (P+x for x in ('Talent','AppearSyncedTalent','CircleRange','TargetValidator'))
BASE = zeros('_interruptAbilityOnDetach _ignoreIfOwnerDead _forceAsDmgOrHealAbility',
    _selector=NULL, _metadata={'namedAsAlias':'','blackboardPrefix':''}, _attachPassiveBuffsOnDummy=1)
AURA_FIXED = dict(BASE, _passiveBuffs=[], _selfOption=0, _removeBuffWhenTargetLeave=1,
    _removeBuffWhenAbilityDetached=1, _onlyAddBuffOnceForEachTarget=0,
    _createEffectOnDummy=1, _ignoreOwnerFakeDeath=0)
OPTIONS = zeros('''ignoreTargetFree ignoreAllyTargetFree ignoreHealFree ignoreMotionMode
    ignoreTargetSide excludeSomeAbnormalFlags containSomeAbnormalFlags excludeAbnormalFlag
    containAbnormalFlag purposeMask professionMask checkUnitType unitTypeMask
    onlyIgnoreSomeOfTargetFreeCase abnormalFlag abnormalCombo''',
    targetSide=2, targetMotion=3, targetCategory=1, enableAdvancedOptions=1)
EMPTY_ATTRIBUTES = {k:[] for k in ATTRIBUTE_KEYS}
BUFF = dict(BUFF_DEFAULTS, isGroundBoundable=0, attributes=EMPTY_ATTRIBUTES, blackboard=[])
JP_ONLY_MISSING = {
    TALENT:{'/_fromRawDataToSkill':0}, APPEAR:{'/_fromRawDataToSkill':0},
    PASSIVE:{'/_buffs/0/isGroundBoundable':0},
    AURA:{'/_buffs/0/isGroundBoundable':0, '/_createEffectOnDummy':1},
    VALIDATOR:{'/_targetOptions/containAbnormalFlag':0, '/_targetOptions/containSomeAbnormalFlags':0,
               '/_targetOptions/ignoreMotionMode':0}, CIRCLE:{}}


def exact(fields,fixed,variables=(),where=''):
    return _exact(fields,{k:v for k,v in fixed.items() if k not in variables},variables,where)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def load_aura_candidates(path=CACHE):
    source=read(path)
    for relative,expected in source['inputs'].items():
        require(hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()==expected,
                'frozen-aura-input-changed:'+relative)
    return source


def action(name, **fields):
    return dict(fields, **{'$type':'Torappu.Battle.Action.Nodes+'+name})


def graph(templates, key, event):
    t=templates.get(key)
    exact(t, {'templateKey':key,'effectKey':'','onEventPriority':0}, {'eventToActions'}, 'template')
    exact(t['eventToActions'], {}, {'_items'}, 'template/events')
    rows=t['eventToActions']['_items']
    require(len(rows)==(0 if event is None else 1), 'unexpected-template-event')
    if event is None:return []
    row=rows[0];exact(row, {'key':event}, {'value'}, 'template/event')
    value=row['value'];exact(value, {'SerializedObjectReferences':[]},
        {'SerializedState','decodedActions'}, 'template/event/value')
    require(json.loads(value['SerializedState'])==value['decodedActions'], 'template-serialized-body-disagreement')
    return value['decodedActions']


def compile_damage(templates,key):
    rows=graph(templates,key,2)
    require(len(rows)==2, 'aura-periodic-action-count')
    damage=rows[0]
    expected=action('AdvancedApplyDamage', _sourceType='SOURCE', _targetType='TARGET',
        _damageType='MAGICAL', _defaultAtkScale=1, _applyWay='NONE', _baseOnHostAtk=False,
        _emitSourceOnCalculateDamage=False, _attackType='NORMAL', _forceUseProjectileCachedAtk=False,
        _ignoreForSp=True, _ignoreMissFlag='NONE', _ignoreCancelReasonMask='NONE', _modifierKey='',
        _assignRealDamageToBB=False, _assignFinalDamageToBB=False, _skipModifierEvent=False,
        _noSource=False, _onlyUseSourceOnCalculateDamage=False, _getCachedAtkFromBlackboard=False,
        _cachedAtkKey='atk', _setSharedFlag=False, _sharedFlagIndex='IS_CONTINUOUS')
    exact(damage,expected,{'_atkScaleVar'},'aura/damage')
    require(isinstance(damage['_atkScaleVar'],str) and damage['_atkScaleVar'],'invalid-damage-scale-key')
    effect=action('CreateEffect', _targetType='BUFF_OWNER', _sourceType='BUFF_SOURCE',
        _useSourceFaceVactor=False, _useSourceToTargetDirection=False, _useConstDirection=False,
        _constDirection='UP', _createEffectHoldBySource=False, _useAttackPlaybackSpeed=False,
        _manualSetPlaybackSpeed=False, _blackboardKey='', _playbackSpeed=1)
    exact(rows[1],effect,{'_effectKey'},'aura/visual')
    require(isinstance(rows[1]['_effectKey'],str),'invalid-visual-key')
    return dict(kind='arts', scaleKey=damage['_atkScaleVar'], defaultScale=1,
        attackType='normal', applyWay='none', ignoreForSp=True, skipModifierEvent=False)


def compile_element(templates,key):
    rows=graph(templates,key,11)
    require(len(rows)==1,'damage-event-action-count')
    exact(rows[0], action('CreateBuff',_buffOwner='MODIFIER_TARGET',_useSpecialBuffSource=False,
        _specialBuffSource='BUFF_SOURCE',_isDerivedBuff=False,_finishDerivedBuffIfParentFinish=False,
        _inherateSourceProjectileFromParentBuff=False,_hookEffectKeyFromSourceProjectile=False), {'_buff'}, 'damage-event/create')
    b=rows[0]['_buff']
    expected=dict(BUFF_DEFAULTS,attributes=EMPTY_ATTRIBUTES,blackboard=[],statusResistable='AUTOMATIC',
        overrideKey=None,overrideType='DEFAULT',overrideEffectKey=None,onEventPriority='DEFAULT',
        audioSignal=None,lifeTimeType='IMMEDIATELY',durationKey=None,triggerLifeType='IMMEDIATELY',disableOverride=True)
    expected.pop('isGroundBoundable')  # Action JSON uses the retained older Buff schema.
    exact(b,expected,{'buffKey','templateKey'},'damage-event/instant-Buff')
    ep=graph(templates,b['templateKey'],0)
    require(len(ep)==1,'element-action-count')
    expected=action('ApplyElementDamage',_elementDamageType='SANITY',_sourceType='BUFF_SOURCE',
        _isFixedEpDamage=False,_baseOnHostAtk=False,_baseOnEnemyHostAtk=False,_fixedEpDamageKey=None,
        _fixedEpDamage=0,_noSource=False,_forceUseProjectileCachedAtk=False,_multiplyWithBuffValidStackCnt=False,
        _buffKey=None,_buffSourceType='BUFF_OWNER',_targetType='TARGET',_isEnvElementDamage=False,
        _loadElementTypeFromBb=False,_fixedEpDamageScale='')
    exact(ep[0],expected,{'_epDamageScale'},'damage-event/element')
    require(isinstance(ep[0]['_epDamageScale'],str) and ep[0]['_epDamageScale'],'invalid-element-ratio-key')
    return dict(kind='nerve',ratioKey=ep[0]['_epDamageScale'],base='source-current-attack',
        trigger='accepted-damage-event',zeroDamagePolicy='no-element-after-zero-or-fully-absorbed-damage',
        evidenceLevel='Inferred',boundary='Event 11 is source damage notification; zero/fully absorbed event dispatch is not native-verified. This model requires positive applied damage and does not multiply the ratio by actual HP loss.')


def parameter(levels,namespace,key,default=None):
    boards=None;values=[]
    for row in sorted(levels,key=lambda r:r['level']):
        if row['enemyData'].get('talentBlackboard') is not None:boards=row['enemyData']['talentBlackboard']
        require(isinstance(boards,list),'missing-inherited-talent-blackboard')
        matches=[r for r in boards if r['key'].lower()==(namespace+'.'+key).lower()]
        require(len(matches)<=1 and (matches or default is not None),'missing-or-ambiguous-scoped-parameter')
        val=matches[0]['value'] if matches else default
        require(finite(val) and (not matches or matches[0].get('valueStr') in (None,'')), 'non-numeric-scoped-parameter')
        values.append(val)
    require(values and all(v==values[0] for v in values),'level-dependent-aura-parameter')
    return dict(key=namespace+'.'+key,default=values[0])


def compile_empty_mode(candidate):
    source=candidate['ordinarySource'];cn=source['cnComponents'];nodes=source['nodes']
    kinds={P+'Enemy':[],P+'UnitMode':[],P+'Abilities.EmptyAnimatedAbility':[]}
    for pid,row in cn.items():
        require(row['type'] in kinds and pid in nodes,'unsupported-ordinary-source-component')
        jp=nodes[pid];require(jp.get('resolvedScript',{}).get('type')==row['type'] and jp['fields']['m_Enabled']==1,'ordinary-component-source-mismatch')
        changes,schema=compare_fields(row['fields'],body(jp))
        allowed=({'/_affectedBySlowDown':1,'/_checkFaceToFirstCastTargetDownAttack':0} if row['type'].endswith('EmptyAnimatedAbility') else
                 {'/_groundBoundHeightZOffset':.1,'/_useMoveDirAsFaceDir':0} if row['type']==P+'Enemy' else {})
        require(not changes and all(r['onlyIn']=='CN' and allowed.get(r['path'],object())==r['value'] for r in schema),'ordinary-CN-JP-conflict')
        kinds[row['type']].append((pid,row['fields']))
    require(all(len(rows)==1 for rows in kinds.values()),'ambiguous-ordinary-mode')
    root=kinds[P+'Enemy'][0][1];mid,mode=kinds[P+'UnitMode'][0];aid,empty=kinds[P+'Abilities.EmptyAnimatedAbility'][0]
    require(root['_modes']==[{'m_FileID':0,'m_PathID':int(mid)}] and root['_commonAbilities']==[], 'additional-root-mode-or-common-ability')
    exact(mode,zeros('''_hideUIAttackRange _updateAttackRangeExtendByAttributeDirty _addIndexToSignalId _includeIndexZero''',
        _animatorHooker=NULL,_overrideStartEffect='',_overrideDeadEffect='',_combat={'m_FileID':0,'m_PathID':int(aid)},
        _attack=NULL,_attackTrigger=NULL,_rangeToShow=NULL,_extraRangesToShow=[],_generalAbilities=[],
        _alwaysHideHp={'isDefined':0,'value':0},_alwaysHideSp={'isDefined':0,'value':0}), {'_bodyTransform'},'empty-mode')
    skip={'_atkScale','_atkScaleKey','_attackType','_elementDamageType','_epDamageRatio','_useDynamicAttackType',
          '_deliveryParaWhenReplaceActionNode','_damageType','_extraDamageType','_alwaysPutIncludeTargetFirst'}
    exact(empty,{k:v for k,v in DORMANT_FIXED.items() if k not in skip},where='EmptyAnimatedAbility')
    go=owner(nodes[aid]);parts=[ref_id(r['component']) for r in nodes[go]['fields']['m_Component']]
    require(nodes[go]['fields']['m_IsActive']==1 and set(parts)=={pid for pid,n in nodes.items() if n['unityType']!='GameObject' and owner(n)==go},'incomplete-empty-action-owner')
    require(len(parts)==2 and sum(nodes[pid]['unityType']=='Transform' for pid in parts)==1,'extra-empty-action-sibling')
    return {'0':dict(modeIndex=0,channels={'combat':None,'attack':None},sourceNoBasicAttack=True)}


def _compile(candidate,templates,statuses):
    modes=compile_empty_mode(candidate)
    nodes=validate_owned_graph(candidate['graph']);cn=candidate['cnComponents']
    typed={};by_owner={}
    for pid,n in nodes.items():
        go=pid if n['unityType']=='GameObject' else owner(n)
        by_owner.setdefault(go,[]).append(n)
        if n['unityType']=='MonoBehaviour':
            typ=n['resolvedScript']['type'];require(typ in JP_ONLY_MISSING,'unknown-talent-component:'+typ)
            require(pid in cn and cn[pid]['type']==typ,'missing-CN-component')
            changes,schema=compare_fields(cn[pid]['fields'],body(n))
            require(not changes and all(r['onlyIn']=='CN' and JP_ONLY_MISSING[typ].get(r['path'],object())==r['value'] for r in schema),
                    'CN-JP-source-conflict:'+typ)
            typed.setdefault(typ,[]).append((pid,n,cn[pid]['fields']))
        else:require(n['unityType'] in {'GameObject','Transform','CircleCollider2D','Rigidbody2D'},'unknown-talent-native-component')
        if n['unityType']=='Transform':
            f=n['fields'];require(f['m_LocalPosition']==dict(x=0,y=0,z=0) and f['m_LocalScale']==dict(x=1,y=1,z=1)
                and abs(f['m_LocalRotation']['z'])<1e-6 and abs(f['m_LocalRotation']['w']-1)<1e-6, 'unsupported-talent-transform')
    root=candidate['rootTransform']['fields']
    require(root['m_LocalScale']==dict(x=1,y=1,z=1) and root['m_Father']=={'m_FileID':0,'m_PathID':'0'},'unsupported-enemy-root-scale-or-parent')
    container=candidate['graph']['rootGameObjectId']
    container_transform=next(n for n in nodes.values() if n['unityType']=='Transform' and owner(n)==container)
    require(ref_id(container_transform['fields']['m_Father'])==str(candidate['rootTransform']['pathId'])
        and owner(candidate['rootTransform'])==candidate['ownership']['assetRoot'],'disconnected-talent-root')
    require(set(cn)=={pid for pid,n in nodes.items() if n['unityType']=='MonoBehaviour'},'extra-CN-talent-component')
    require({k:len(v) for k,v in typed.items()}=={AURA:1,PASSIVE:2,TALENT:2,APPEAR:1,CIRCLE:1,VALIDATOR:1},'incomplete-or-extra-talent-family')
    talents={}
    for typ in (TALENT,APPEAR):
        for pid,n,f in typed[typ]:
            exact(f,TALENT_FIELDS,where='Talent')
            go=owner(n);require(go not in talents,'multiple-talents-on-owner')
            talents[go]=(typ,nodes[go]['fields']['m_Name'])
    apid,an,af=typed[AURA][0];ago=owner(an)
    require(talents.get(ago,(None,))[0]==APPEAR,'aura-not-appear-synced')
    exact(af,AURA_FIXED,{'_buffs','_effects','_targetValidator'},'AuraAbility')
    require(isinstance(af['_effects'],list) and all(isinstance(k,str) for k in af['_effects']),'invalid-aura-visuals')
    require(len(af['_buffs'])==1,'aura-Buff-count')
    ab=af['_buffs'][0]
    exact(ab,dict(BUFF,disableOverride=1,triggerLifeType=2,triggerInterval=1),{'buffKey','templateKey','audioSignal'},'aura-Buff')
    require(isinstance(ab['audioSignal'],str),'invalid-aura-audio')
    vpid,vn,vf=typed[VALIDATOR][0];_,rn,rf=typed[CIRCLE][0]
    require(ref_id(af['_targetValidator'])==vpid and owner(vn)==owner(rn)==ago,'aura-selection-owner-conflict')
    exact(vf,{'_targetOptions':OPTIONS},where='Aura/validator');exact(rf,{'_extendable':0,'_scaleble':0},where='Aura/CircleRange')
    colliders=[n for n in nodes.values() if n['unityType']=='CircleCollider2D']
    require(len(colliders)==1 and owner(colliders[0])==ago,'aura-circle-collider-count')
    cf=colliders[0]['fields']
    exact(cf,{'m_GameObject':cf['m_GameObject'],'m_Enabled':1,'m_Density':1,'m_Material':{'m_FileID':0,'m_PathID':'0'},
        'm_IsTrigger':True,'m_UsedByEffector':False,'m_UsedByComposite':False,'m_Offset':dict(x=0,y=0)}, {'m_Radius'},'Aura/collider')
    require(finite(cf['m_Radius']) and cf['m_Radius']>0,'invalid-aura-radius')
    rigidbodies=[n for n in nodes.values() if n['unityType']=='Rigidbody2D']
    require(len(rigidbodies)==1 and owner(rigidbodies[0])==ago,'unexpected-talent-rigidbody')
    rb=rigidbodies[0]['fields']
    exact(rb,dict(m_GameObject=rb['m_GameObject'],m_BodyType=1,m_Simulated=True,m_UseFullKinematicContacts=False,
        m_UseAutoMass=False,m_Mass=1,m_LinearDrag=0,m_AngularDrag=0.05000000074505806,m_GravityScale=1,
        m_Material={'m_FileID':0,'m_PathID':'0'},m_Interpolate=0,m_SleepingMode=1,m_CollisionDetection=0,m_Constraints=0),where='Aura/rigidbody')
    damage=compile_damage(templates,ab['templateKey']);damage['scale']=parameter(candidate['levels'],talents[ago][1],damage.pop('scaleKey'),damage.pop('defaultScale'))
    passive={}
    for pid,n,f in typed[PASSIVE]:
        exact(f,BASE,{'_buffs'},'PassiveBuffAbility');require(len(f['_buffs'])==1,'passive-Buff-count')
        go=owner(n);require(talents.get(go,(None,))[0]==TALENT,'passive-not-root-Talent')
        b=f['_buffs'][0];mods=b['attributes']['attributeModifiers'];namespace=talents[go][1]
        if mods:
            expected=dict(BUFF,attributes={**EMPTY_ATTRIBUTES,'attributeModifiers':[dict(attributeType=26,formulaItem=0,value=0,loadFromBlackboard=1,fetchBaseValueFromSourceEntity=0)]},priority=1)
            exact(b,expected,{'buffKey','templateKey','overrideEffectKey','overrideKey'},'self-resistance-Buff')
            require(isinstance(b['overrideKey'],str) and b['overrideKey'],'missing-self-resistance-override-key')
            graph(templates,b['templateKey'],None)
            require('selfResistance' not in passive,'duplicate-self-resistance')
            passive['selfResistance']=dict(id=b['buffKey'],attribute='one_minus_status_resistance',formula='addition',
                value=parameter(candidate['levels'],namespace,'one_minus_status_resistance'),
                stacking=dict(disableOverride=False,independentSource=False,overrideKey=b['overrideKey'],priority=1,priorityKeys=[],maxStacks=1))
        else:
            exact(b,BUFF,{'buffKey','templateKey'},'damage-listener-Buff')
            require('damageEvent' not in passive,'duplicate-element-listener')
            ep=compile_element(templates,b['templateKey']);ep['ratio']=parameter(candidate['levels'],namespace,ep.pop('ratioKey'))
            require(ep['ratio']['default']>=0,'negative-element-ratio');passive['damageEvent']=ep
    require(set(passive)=={'selfResistance','damageEvent'},'incomplete-passive-dependencies')
    override=passive['selfResistance']['stacking']['overrideKey']
    matches=[(key,b) for key,b in statuses.items() if (b.get('overrideKey') or b.get('buffKey'))==override]
    require(matches,'missing-standard-status-override-contract')
    conflicts={};status_compiler=BuffCompiler(templates,statuses)
    for key,b in matches:
        status=status_compiler.loaded(key)  # Complete existing loaded-Buff schema, no unknown actions.
        require(status['kind']=='slow' and b['priorityBBKeys'] is None and not b['disableOverride'],
                'unsupported-standard-status-priority-contract')
        conflicts[key]=dict(overrideKey=override,priority=b['priority'],kind=status['kind'],
            disableOverride=False,sourceSha256=status['sourceSha256'])
    passive['statusOverrides']=conflicts
    return dict(accepted=True,rule=RULE,modes=modes,initialMode=0,enemyAura=dict(rule=RULE,version=1,
        range=dict(kind='circle',radius=cf['m_Radius'],extendable=False,scalable=False,
            evidenceLevel='Inferred',boundary='JP complete local collider and identity-scale ancestors applied to matching CN CircleRange/Talent fields; enemy database rangeRadius does not overwrite this explicit collider in this model. Native initialization setter timing is not asserted.'),
        selection=dict(side='opponent',motionMask=3,categoryMask=1,respectTargetFree=True),
        membership=dict(removeOnLeave=True,removeOnDetach=True,independentSources=True,firstTick='one-period-after-entry'),
        interval=1,buffKey=ab['buffKey'],damage=damage,**passive,
        evidenceLevel='Inferred',boundaries=[
            'Complete source Talent graph; ordinary action and whole-enemy completion are separate.',
            'Membership uses current-frame positions; native enter/leave frame ordering is not reproduced.',
            'Timers pause neither for source stun nor silence: source Buff flags are not silenceable/stunnable.',
            'Matching standard loaded status Buffs use the shared higher-priority-wins model; protected native winner ordering is not reasserted.',
            'AppearSyncedTalent attaches after appearance; precise native appearance frame remains a model boundary.']))


def compile_enemy_aura(candidate,templates=None,statuses=None):
    if statuses is None:
        status=read(STATUS_SOURCE)['buff'];statuses={status['buffKey']:status}
    try:return _compile(candidate,read(TEMPLATES) if templates is None else templates,statuses)
    except (Rejected,KeyError,TypeError,ValueError,RuntimeError) as error:
        return dict(accepted=False,rule=RULE,rejections=[str(error)])


if __name__=='__main__':
    source=load_aura_candidates();templates=read(TEMPLATES)
    results={eid:compile_enemy_aura(c,templates) for eid,c in source['enemies'].items()}
    print(json.dumps(results,ensure_ascii=False,indent=2))
