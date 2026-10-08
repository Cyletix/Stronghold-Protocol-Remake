"""Closed CastSkill graphs, selected by source structure rather than skill IDs."""
import json
import re
from next_attack_compiler import (P, NULL, RANGE, TRIGGER, EFFECT, SELECTORS, SELECTOR_FIXED,
    SELECTOR_VARIABLE, ATTACK_FIXED, ATTACK_VARIABLE, RANGED_FIXED, MULTI_FIXED, EFFECT_FIELDS,
    Rejected, require, finite, positive_int, digest, body, contract, local_ref, zeros)
from next_attack_hit_buffs import BUFF_FIXED, ATTRS, N
from next_attack_compiler import ProjectileCompiler
from enemy_chain_projectiles import FIXED_FIELDS, SIMPLE, VISUAL_FIELDS

RULE = 'garrison-structural-direct-actions-v2'
CONTROLLER = P + 'CastSkill'
ATTACKS = {P+'Abilities.'+x for x in ('MeleeAttack','MultiMeleeAttack','RangedAttack','MultiRangedAttack','Heal')}
BUFF_OWNER, BUFF_CAST = P+'Abilities.BuffToOwner', P+'Abilities.BuffDuringCasting'
MULTI_RANGED_FIXED = zeros('''_useMultiAdditionalProjectiles _enableMountPointGroup _onlyFeedActionsToFirstOne
 _onlyTrigAudioSignalForFirstOne _limitToOneTargetAfterFirstRound _splitDamage _addSpellCntToSignalId
 _onlyFeedActiveBuffToLastOne _onlyFeedActiveBuffToFirstOne _refreshTimesOnCastStart
 _castToFirstRoundTargetLocationsAtProjectileBirth''', _additionalProjectile='',_additionalProjectiles=[],
 _mountPointGroup=[],_hookTheLastProjectile='')
CONTROLLER_FIXED = zeros('''_allowSpRecoveryWhenAffecting _limitGlobalTriggerTime _hidden _showSpBarEvenHidden
 _showSpAsBulletMode _showSpRatioAsProgress _playCharWordWithPassiveType _canCastWithNoSp _canSilenced
 _canUseInAbnormalState _writeDurationToAttackBlackboard _attachSignalIds _useEscapeTime _earlySkillFinishAtAttackFinished
 _hideSkillStackCount _hideHudSkillStackCount _playSkillBeginAnim _useFaceVector _uninterruptibleOnAbilityPredelay
 _checkHasTargetBeforeDoCast _useTriggerInManualMode _shouldCastLikeAttack _isRemoteControlled _hideRangeToShow
 _forceUseBaseShowRange _recoverSpIfNoTarget _resetAbilityCooldownWhenCastEnd _onlyAvailableWhenTokenValid _hasUniStackColor''',
 _maxTriggerTime=-1,_playCharWordVoice=1,_defaultModeIndex=-1,_attackBlackboardModeIndex=-1,
 _extraAttackBlackboardModeIndices=[],_rangeIdModeIndex=-1,_extraRangeIdModeIndices=[],_rangeIdUsageType=7,
 _extraAbilities=[],_beginAnim='',_beginAnimDown='',_beginEffect=[],_beginAnimValidator=NULL,_availableValidator=NULL,
 _switchToState=1,_canSwitchDuringBorn=1,_canCastDuringBorn=1)


class DirectProjectileCompiler(ProjectileCompiler):
    """Add the closed no-movement lifetime-end trace-target delivery family."""
    def _compile(self,key,healing=False):
        try:
            result=super()._compile(key,healing)
            return dict(result,kind='trace')
        except Rejected as error:
            if error.category!='projectile-special-delivery':raise
        roots=self.assets.get(key,[])
        require(len(roots)==1 and local_ref(roots[0]),'projectile-incomplete',key+': one local root')
        nodes=self.bundle['nodes'];seen=set();rows=[]
        def read(ref):
            require(local_ref(ref) and str(ref['m_PathID']) in nodes,'projectile-incomplete',key+': dangling reference')
            return nodes[str(ref['m_PathID'])]
        def visit(ref):
            go=read(ref);pid=str(go['pathId'])
            require(go['unityType']=='GameObject' and go['fields'].get('m_IsActive') and pid not in seen,'projectile-incomplete',key+': inactive/cyclic root')
            seen.add(pid)
            for cr in go['fields']['m_Component']:
                c=read(cr['component'])
                require(c['fields'].get('m_GameObject')==ref,'projectile-incomplete',key+': owner mismatch')
                if c['unityType']=='Transform':
                    for child in c['fields'].get('m_Children',[]):visit(read(child)['fields']['m_GameObject'])
                elif c['unityType']=='MonoBehaviour':
                    t=self.script_types.get(str(c['fields'].get('m_Script',{}).get('m_PathID')))
                    require(t in {SIMPLE,P+'Projectiles.EffectBehaviour'},'projectile-special-behaviour',key+': '+str(t))
                    rows.append(dict(node_id=str(c['pathId']),type=t,fields=c['fields'],script={'status':'resolved','type':t}))
                else:raise Rejected('projectile-special-behaviour',key+': '+c['unityType'])
        visit(roots[0])
        simple=[r for r in rows if r['type']==SIMPLE]
        require(len(simple)==1 and simple[0]['fields']['m_GameObject']==roots[0],'projectile-special-delivery',key+': one root SimpleProjectile')
        fixed=dict(FIXED_FIELDS[SIMPLE],_hitNumType=1,_alwaysHitTraceTargetInTheEnd=1,_bodyTransform=NULL,_mainEffect='')
        fixed.pop('_randomDelayToBorn')
        s=body(simple[0]);contract(s,fixed,{'_lifeTime','_randomDelayToBorn'},'lifetime-end projectile')
        require(finite(s['_lifeTime']) and s['_lifeTime']>0 and finite(s['_randomDelayToBorn']) and s['_randomDelayToBorn']>=0,
                'projectile-special-delivery',key+': finite positive lifetime/nonnegative birth delay')
        for r in rows:
            if r['type']!=SIMPLE:contract(body(r),{},VISUAL_FIELDS[r['type']],r['type'])
        return dict(kind='lifetime-end-target',key=key,life=s['_lifeTime'],randomBirthDelay=s['_randomDelayToBorn'],
            stopWhenSourceInvalid=False,componentIds=sorted(r['node_id'] for r in rows),graphSha256=digest(rows),
            rule='complete-lifetime-end-trace-target-projectile-v1',controllerType='Torappu.Battle.Projectile+ActionController',buffPhase='before-body')


class BuffCompiler:
    def __init__(self, templates, database):
        self.templates, self.database = templates, database

    def template(self, key):
        t = self.templates.get(key)
        require(isinstance(t, dict), 'buff-template', 'missing '+str(key))
        contract(t, {'templateKey': key, 'effectKey': '', 'onEventPriority': 0}, {'eventToActions'}, 'template')
        require(set(t['eventToActions']) == {'_items'}, 'buff-template', 'event container')
        actions = []
        for e in t['eventToActions']['_items']:
            require(set(e) == {'key','value'} and e['key'] == 0, 'buff-template', 'only attach event is instantaneous')
            v=e['value']; contract(v, {'SerializedObjectReferences': []}, {'SerializedState','decodedActions'}, 'event')
            require(json.loads(v['SerializedState']) == v['decodedActions'], 'buff-template', 'serialized actions differ')
            require(isinstance(v['decodedActions'], list), 'buff-template', 'null actions')
            actions.extend(self.actions(v['decodedActions']))
        return actions

    def actions(self, nodes):
        result=[]
        for a in nodes:
            kind=a.get('$type')
            if kind == N+'ModifyCost':
                contract(a, {'$type':kind,'_forceToDisplayNumber':False,'_forceToDisplayNegativeNumber':False},
                         {'_sourceType','_blackboardKey'}, 'ModifyCost')
                require(a['_sourceType'] in ('SOURCE','BUFF_OWNER') and isinstance(a['_blackboardKey'],str), 'buff-action','cost source')
                result.append(dict(kind='cost', valueKey=a['_blackboardKey']))
            elif kind == N+'IfElse':
                contract(a, {'$type':kind}, {'_conditionNode','_succeedNodes','_failNodes'}, 'IfElse')
                c=a['_conditionNode']
                contract(c, {'$type':N+'CheckContainsBuff','_targetType':'BUFF_OWNER','isAND':True,
                    '_loadFromBlackboard':False,'_checkBuffSource':False,'_buffSourceType':'BUFF_SOURCE','_checkSourceHost':False},
                    {'_buffKeys'}, 'contains Buff')
                require(len(c['_buffKeys']) == 1, 'buff-action', 'one status condition')
                status=self.loaded(c['_buffKeys'][0])
                result.append(dict(kind='if-status', condition=status, yes=self.actions(a['_succeedNodes']), no=self.actions(a['_failNodes'])))
            elif kind == N+'CreateBuff':
                contract(a, {'$type':kind,'_buffOwner':'BUFF_OWNER','_useSpecialBuffSource':False,'_specialBuffSource':'BUFF_SOURCE',
                    '_isDerivedBuff':False,'_finishDerivedBuffIfParentFinish':False,'_inherateSourceProjectileFromParentBuff':False,
                    '_hookEffectKeyFromSourceProjectile':False}, {'_buff'}, 'CreateBuff')
                ref=a['_buff']; fixed=self.db_fixed(ref['buffKey'], reference=True)
                fixed.update(isDamageMissable=False, priorityBBKeys=[],blackboard=[],durationKey=None,overrideEffectKey=None)
                fixed.pop('attributes')
                contract(ref,fixed,{'attributes'},'nested database reference')
                require(ref['attributes']==ATTRS,'buff-action','database reference overrides')
                result.append(self.loaded(ref['buffKey']))
            else:
                raise Rejected('buff-action', str(kind))
        return result

    def db_fixed(self,key,reference=False):
        f=dict(BUFF_FIXED,loadFromDB=reference,isDamageMissable=True,isGroundBoundable=False,statusResistable='AUTOMATIC',
            overrideKey=None,overrideType='DEFAULT',onEventPriority='DEFAULT',audioSignal=None,lifeTimeType='LIMITED',
            triggerLifeType='IMMEDIATELY',triggerCnt=0,triggerInterval=-1,firstTriggerInterval=-1,
            priorityBBKeys=None,blackboard=None,buffKey=key,templateKey='empty')
        if reference: f.pop('isGroundBoundable')
        return f

    def loaded(self,key):
        d=self.database.get(key);require(isinstance(d,dict),'buff-database','missing '+str(key))
        f=self.db_fixed(key)
        for k in ['attributes','durationKey','overrideEffectKey']:f.pop(k)
        contract(d,f,{'attributes','durationKey','overrideEffectKey'},'database status')
        require(not self.template(d['templateKey']),'buff-database','status template events')
        a=d['attributes']; require(isinstance(d['durationKey'],str) and d['durationKey'],'buff-database','duration binding')
        base={k:None for k in ATTRS}
        if a==dict(base,abnormalFlags=['STUNNED']):kind,value='stun',None
        else:
            contract(a,{k:None for k in ATTRS if k!='attributeModifiers'},{'attributeModifiers'},'slow attributes')
            require(len(a['attributeModifiers'])==1,'buff-database','one move scaler')
            m=a['attributeModifiers'][0]
            contract(m,{'attributeType':'MOVE_SPEED','formulaItem':'FINAL_SCALER','loadFromBlackboard':False,'fetchBaseValueFromSourceEntity':False},{'value'},'slow')
            require(finite(m['value']) and -1<m['value']<0,'buff-database','move multiplier')
            kind,value='slow',1+m['value']
        return dict(kind=kind,key=key,durationKey=d['durationKey'],value=value,sourceSha256=digest(d))

    def compile(self,buff,purpose):
        f=dict(BUFF_FIXED,triggerLifeType=0,triggerCnt=0,triggerInterval=-1,firstTriggerInterval=-1)
        for k in ['attributes','durationKey','lifeTimeType','overrideEffectKey']:f.pop(k)
        contract(buff,f,{'buffKey','templateKey','attributes','durationKey','lifeTimeType','overrideEffectKey'},'inline Buff')
        require(isinstance(buff['buffKey'],str) and isinstance(buff['durationKey'],str),'buff-contract','identity/duration')
        a=buff['attributes']
        if purpose=='casting':
            require(buff['lifeTimeType']==2 and not self.template(buff['templateKey']),'buff-contract','casting lifetime/template')
            contract(a,{k:[] for k in ATTRS if k!='attributeModifiers'},{'attributeModifiers'},'casting attributes')
            require(len(a['attributeModifiers'])==1,'buff-contract','one penetration modifier')
            contract(a['attributeModifiers'][0],{'attributeType':25,'formulaItem':0,'value':0,'loadFromBlackboard':1,'fetchBaseValueFromSourceEntity':0},label='fixed DEF penetration')
            return [dict(kind='penetration',valueKey='def_penetrate_fixed')]
        if buff['lifeTimeType']==0:
            require(a==ATTRS,'buff-contract','instant attributes are not empty')
            actions=self.template(buff['templateKey'])
            require(actions and (purpose!='owner' or all(x['kind']=='cost' for x in actions)), 'buff-contract','owner/target mismatch')
            return actions
        require(purpose=='target' and buff['lifeTimeType']==1 and not self.template(buff['templateKey']), 'buff-contract','unsupported lifetime')
        require(a==dict(ATTRS,abnormalFlags=[0]) and buff['durationKey'], 'buff-contract','finite status')
        return [dict(kind='stun',key=buff['buffKey'],durationKey=buff['durationKey'])]


def action_keys(actions):
    result=set()
    for a in actions:
        result.update(a[k] for k in ('valueKey','durationKey') if k in a)
        if a['kind']=='if-status':result|=action_keys(a['yes'])|action_keys(a['no'])|action_keys([a['condition']])
    return result


def compile_direct(sid, rows, levels, char_ids, projectiles, buffs):
    require(rows and len({r['node_id'] for r in rows})==len(rows),'incomplete-component','missing/duplicate components')
    allowed=ATTACKS|SELECTORS|{CONTROLLER,RANGE,TRIGGER,EFFECT,BUFF_OWNER,BUFF_CAST}
    unknown=sorted({r['type'] for r in rows}-allowed)
    require(not unknown,'extra-gameplay-components',','.join(unknown))
    typed={t:[r for r in rows if r['type']==t] for t in {r['type'] for r in rows}}
    cs=typed.get(CONTROLLER,[]); ats=[r for r in rows if r['type'] in ATTACKS]
    require(len(cs)==len(ats)==1,'mixed-action-graph','one CastSkill and one direct ability')
    for r in rows:body(r)
    c,attack=cs[0],ats[0];cf=body(c);a=body(attack)
    contract(cf,CONTROLLER_FIXED,{'_trigger','_rangeToShow','_allowNoTarget','_showProgressToNext'},'CastSkill')
    require(cf['_allowNoTarget'] in (0,1) and cf['_showProgressToNext'] in (0,1),'controller-policy','target/UI')
    require(c['fields']['m_GameObject']==attack['fields']['m_GameObject'],'unresolved-reference','controller/action ownership')
    heal=attack['type'].endswith('.Heal');ranged='RangedAttack' in attack['type'];multi='Multi' in attack['type']
    f=dict(ATTACK_FIXED);v=set(ATTACK_VARIABLE)
    for k in ('_timeMode','_faceToDefault','_waitForAttackEvent','_activeBuffs'):f.pop(k);v.add(k)
    if heal:
        for k in ('_elementDamageType','_epDamageRatio','_useDynamicAttackType','_deliveryParaWhenReplaceActionNode','_extraDamageType','_atkScale','_attackType'):f.pop(k)
        v-= {'_atkScaleKey','_damageType'}
        f.update(zeros('_isCont _isHpRatio _hasNoActionNode _ignoreHealFree _applyEPHeal _applyHealScaleToEPHealScale'))
    elif ranged:f.update(RANGED_FIXED);v.add('_projectileKey')
    else:f['_alwaysPutIncludeTargetFirst']=0
    if multi:
        f.update(MULTI_RANGED_FIXED if ranged else MULTI_FIXED);v|={'_additionalTimes','_waitAttackEventForAllAttacks'}
        if ranged:v.add('_triggerDelta')
    contract(a,f,v,attack['type'])
    require(a['_timeMode'] in (0,1) and all(a[k] in (0,1) for k in ('_interruptAbilityOnDetach','_selectTargetTiming','_alwaysIncludeTarget','_allowNoTarget','_faceToTarget','_faceToDefault','_waitForAttackEvent'))
        and finite(a['_preDelay']) and a['_preDelay']>=0 and finite(a['_maxAnimScale']), 'action-control','timing/facing')
    require(all(isinstance(a[k],str) for k in ('_animKey','_endAnimKey','_downAnimKey','_downEndAnimKey','_upAnimKey','_upEndAnimKey')), 'action-control','animation names')
    require(heal or a['_damageType'] in (1,2),'damage-contract','unsupported damage type')
    hits=a.get('_additionalTimes',0)+1
    require(positive_int(hits) and (not multi or a['_waitAttackEventForAllAttacks'] in (0,1)),'hit-count','positive repeats / event policy')
    sels=[r for r in rows if r['type'] in SELECTORS]
    require(len(sels)==1 and local_ref(a['_selector']) and sels[0]['node_id']==str(a['_selector']['m_PathID']), 'unresolved-selector','one referenced selector')
    sel=sels[0];s=body(sel);blocked=sel['type'].endswith('BlockedOrAdvancedSelector')
    sf=dict(SELECTOR_FIXED,_targetSide=1 if heal else 2);sv=set(SELECTOR_VARIABLE)
    if blocked:sf['_allowZeroBlockCntLimit']=0;sf['_limitedMaxTargetNumToBlockedCnt']=0
    contract(s,sf,sv,sel['type'])
    require(s['_targetMotion'] in (1,3) and s['_postFilter'] in ((3,) if heal else (0,4)) and s['_limitTargetNum'] in (0,1)
        and positive_int(s['_maxNum']) and finite(s['_abnormalFlag']), 'selector-policy','motion/filter/budget')
    ranges=typed.get(RANGE,[])
    require(len(ranges)==1 and ranges[0]['fields']['m_GameObject']==sel['fields']['m_GameObject'],'unresolved-range','one auto range')
    contract(body(ranges[0]),{'_extendable':0},label=RANGE)
    triggers=typed.get(TRIGGER,[])
    require(len(triggers)<=1,'mixed-action-graph','multiple triggers')
    for r in triggers:
        require(r['fields']['m_GameObject']==sel['fields']['m_GameObject'],'unresolved-reference','trigger owner')
        contract(body(r),{'_keepTarget':0,'_minTargetNum':1,'_overrideSearchTargetTick':-1},label=TRIGGER)
    require(cf['_trigger']==NULL or triggers and cf['_trigger']=={'m_FileID':0,'m_PathID':triggers[0]['node_id']},'unresolved-reference','CastSkill trigger')
    require(cf['_rangeToShow'] in (NULL,{'m_FileID':0,'m_PathID':sel['node_id']}),'unresolved-reference','display range')
    effects=[];on_hit=[];penetration=None
    for b in a['_activeBuffs']:on_hit+=buffs.compile(b,'target')
    for typ in (BUFF_OWNER,BUFF_CAST,EFFECT):
        for r in typed.get(typ,[]):
            require(r['fields']['m_GameObject']==attack['fields']['m_GameObject'],'unresolved-reference','auxiliary ownership')
            f=body(r)
            if typ==EFFECT:
                contract(f,{'_convertCastEndToAttachFinish':0,'_recalculatePlaybackSpeed':0,'_preDelayFactor':0},EFFECT_FIELDS-{'_convertCastEndToAttachFinish','_recalculatePlaybackSpeed','_preDelayFactor'},typ)
            else:
                if typ==BUFF_OWNER:
                    contract(f,{'_extraCondition':0,'_extraConditionTiming':4,'_maxTarget':1,'_loadMaxTargetFromBlackboard':1,'_runActionOnEvent':4},{'_onlyRunOnce','_buffs'},typ)
                    require(f['_onlyRunOnce'] in (0,1) and (f['_onlyRunOnce'] or hits==1),'buff-event','repeated onSpell owner event')
                else:contract(f,{}, {'_buffs'},typ)
                for b in f['_buffs']:
                    actions=buffs.compile(b,'owner' if typ==BUFF_OWNER else 'casting')
                    if typ==BUFF_OWNER:effects+=actions
                    else:
                        require(penetration is None and len(actions)==1,'casting-modifiers','multiple penetration')
                        penetration=actions[0]['valueKey']
    require(levels and char_ids,'missing-level-or-identity',sid)
    keys=set(x['key'] for x in levels[0]['blackboard']);scale='heal_scale' if heal else a['_atkScaleKey']
    target=s['_maxTargetKey'] if s['_limitTargetNum'] and s['_maxTargetKey'] in keys else None
    all_without_bound_key=not blocked and s['_postFilter']==0 and s['_limitTargetNum']==1 and not target
    if all_without_bound_key:
        require(s['_maxTargetKey']=='max_target' and s['_maxNum']==1 and all(any(phrase in re.sub(r'<[^>]*>','',lv.get('description','')) for phrase in ('所有敌人','所有的敌人','全体敌人')) for lv in levels),
                'selector-all-source-crosscheck','ALL with missing target key requires every level to explicitly describe all enemies; getter is protected')
    consumed={scale}|action_keys(effects+on_hit)|({target} if target else set())|({penetration} if penetration else set())
    extras=keys-consumed;charge=next(iter(extras)) if len(extras)==1 and extras<={'ct','cnt'} else None
    if charge:consumed.add(charge)
    require(consumed==keys,'unconsumed-blackboard',','.join(sorted(consumed^keys)))
    for n,lv in enumerate(levels,1):
        bb={x['key']:x['value'] for x in lv['blackboard']};sp=lv['spData']
        require(set(bb)==keys and len(bb)==len(lv['blackboard']) and all(finite(x) and x>=0 for x in bb.values()),'blackboard-shape',str(n))
        require(lv['prefabId']==sid and lv['skillType'] in ('AUTO','MANUAL') and lv['duration'] in (0,-1)
            and sp['spType'] in ('INCREASE_WHEN_ATTACK','INCREASE_WITH_TIME','INCREASE_WHEN_TAKEN_DAMAGE') and sp['spCost']>0
            and positive_int(sp['maxChargeTime']) and sp['increment']==1,'controller-level',str(n))
        require(bb[scale]>0 and (not target or positive_int(bb[target])) and (not charge or bb[charge]==sp['maxChargeTime']),'blackboard-values',str(n))
    projectile=projectiles.compile(a['_projectileKey']) if ranged else None
    schedule=None
    if projectile:
        require(a['_selectTargetTiming']==1 and a['_waitForAttackEvent']==0 and a['_timeMode']==1,
                'projectile-cast-timing','closed timed source targeting/event policy required')
        interval=a.get('_triggerDelta',0)
        require(finite(interval) and interval>=0 and (hits==1 or interval>0),'projectile-cast-timing','finite inter-spell interval')
        require(not multi or a['_waitAttackEventForAllAttacks']==0,'projectile-cast-timing','animation-event repeated spells')
        schedule=dict(preDelay=a['_preDelay'],interval=interval,rounds=hits,targetPolicy='each-spell',powerPolicy='each-spell',
            stopPendingWhenSourceInvalid=True,sourceAnimationBoundary='source preDelay and triggerDelta; protected clip phase/recovery not claimed')
    return dict(kind='direct-skill',rule=RULE,charIds=sorted(char_ids),blackboardKeys=sorted(keys),levelCount=len(levels),
        scaleKey=scale,heal=heal,hits=hits,damageType=None if heal else {1:'phys',2:'arts'}[a['_damageType']],
        targets='blackboard' if target else 'all' if all_without_bound_key else 'fixed' if s['_limitTargetNum'] else 'single' if blocked else 'all',
        targetKey=target,targetCount=s['_maxNum'],groundOnly=s['_targetMotion']==1,blockedFirst=blocked,
        requiresTarget=not bool(cf['_allowNoTarget']) or cf['_trigger']!=NULL,chargeKey=charge,
        penetrationKey=penetration,onHit=on_hit,onCast=effects,projectile=projectile,castSchedule=schedule,
        source=dict(graphSha256=digest(rows),componentIds=[r['node_id'] for r in rows],attackNode=attack['node_id'],
            selectorType=sel['type'],preDelay=a['_preDelay'],timeMode=a['_timeMode'],waitForAttackEvent=a['_waitForAttackEvent'],
            sourceLevelsSha256=digest(levels),fullActionGraph=True,targetBudgetBasis='ALL-without-bound-key-source-description-and-enum' if all_without_bound_key else 'source-selector-cap'))
