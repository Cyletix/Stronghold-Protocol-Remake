// Source-owned effects on the owner's current blockees. No shared stun clock is erased.
(function(root){
 'use strict';
 const now=()=>typeof B==='undefined'?0:B.time||0;
 const units=()=>typeof B==='undefined'?[]:[...(B.operators||[]),...(B.summoneds||[])];
 const enemies=()=>typeof B==='undefined'?[]:B.enemies||[];
 const number=Number.isFinite;
 function value(e,bb){
  if(!e||Object.keys(e).length!==1)throw Error('Invalid blockee expression');
  const v=Object.hasOwn(e,'constant')?e.constant:typeof e.key==='string'?bb[e.key]:NaN;
  if(!number(v))throw Error('Invalid blockee value');return v;
 }
 function validate(effects,bb){
  if(!Array.isArray(effects)||effects.length!==1)throw Error('Invalid blockee effects');
  for(const e of effects){
   if(typeof e.buffKey!=='string'||!e.buffKey)throw Error('Invalid blockee Buff identity');
   if(e.kind==='periodic-blockee-damage'){
    const d=e.sourceDamage,expected={_sourceType:'SOURCE',_targetType:'TARGET',_damageType:'MAGICAL',
     _defaultAtkScale:1,_applyWay:'NONE',_baseOnHostAtk:false,_emitSourceOnCalculateDamage:false,
     _attackType:'NORMAL',_forceUseProjectileCachedAtk:false,_ignoreForSp:false,_ignoreMissFlag:'NONE',
     _ignoreCancelReasonMask:'NONE',_modifierKey:'',_assignRealDamageToBB:false,_assignFinalDamageToBB:false,
     _skipModifierEvent:false,_noSource:false,_onlyUseSourceOnCalculateDamage:false,
     _getCachedAtkFromBlackboard:false,_cachedAtkKey:'atk',_setSharedFlag:false,_sharedFlagIndex:'IS_CONTINUOUS',
     $type:'Torappu.Battle.Action.Nodes+AdvancedApplyDamage',_atkScaleVar:e.scale?.key};
    if(e.damageType!=='arts'||typeof e.waitFirst!=='boolean'||!(value(e.interval,bb)>0)||!(value(e.scale,bb)>0)||
     !d||Object.keys(d).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>d[k]!==v))
     throw Error('Invalid source blockee damage');
   }else if(e.kind==='maintained-blockee-status'){
    if(e.status!=='stun'||e.membership!=='owner-blockees'||e.removeOnLeave!==true||
     e.removeOnDetach!==true||e.sourceScoped!==true)throw Error('Invalid maintained blockee status');
   }else throw Error('Unsupported blockee effect');
  }
 }
 function present(o,time){return !!o&&units().includes(o)&&!o.removed&&!o.dead&&o.hp>0&&o.col!=null&&o.row!=null&&
  !(o.deployAt>time)&&o.deployed!==false;}
 function belongs(o,e,time){return present(o,time)&&enemies().includes(e)&&!e.removed&&!e.dead&&e.hp>0&&
  e.blockerId===o.id&&(!root.ArkOperatorCombat?.blockerOf||root.ArkOperatorCombat.blockerOf(e)===o);}
 function live(o,time){const s=o?.skillBlockeeState;return present(o,time)&&s&&s.ownerId===o.id&&o.skillState&&
  s.skillId===o.skill?.sourceId&&o.skillState.until>time&&s.until>time;}
 function start(o,time){
  const p=root.ArkSkillModeData?.programs[o.skill?.clientProgram?.prefabId];if(!p?.blockees)return;
  const bb={duration:o.skill.duration,...o.skill.blackboard};validate(p.blockees,bb);
  if(!o.skillState||!(o.skillState.until>time))throw Error('Blockee effect requires an active finite skill');
  stop(o);
  o.skillBlockeeState={version:1,ownerId:o.id,skillId:o.skill.sourceId,startedAt:time,until:o.skillState.until,
   effects:p.blockees.map(e=>e.kind==='periodic-blockee-damage'?{kind:e.kind,buffKey:e.buffKey,
    interval:value(e.interval,bb),nextAt:time+(e.waitFirst?value(e.interval,bb):0),scale:value(e.scale,bb),
    damageType:e.damageType,emitted:0}:{kind:e.kind,buffKey:e.buffKey,status:e.status})};
  advance(o,time);update();
 }
 function stop(o){
  delete o.skillBlockeeState;
  for(const e of enemies())if(e.sourceBlockeeStatuses){
   e.sourceBlockeeStatuses=e.sourceBlockeeStatuses.filter(s=>s.sourceId!==o.id);
   if(!e.sourceBlockeeStatuses.length)delete e.sourceBlockeeStatuses;
  }
 }
 function advance(o,time){
  const s=o.skillBlockeeState;
  // This call also precedes skill expiry. Emit only times strictly inside the
  // source lifetime, preserving the serialized nextAt across large steps.
  if(!s||!o.skillState||!present(o,time)||s.ownerId!==o.id||s.skillId!==o.skill?.sourceId)return;
  for(const effect of s.effects){
   if(effect.kind!=='periodic-blockee-damage')continue;
   if(!(number(effect.interval)&&effect.interval>0&&number(effect.nextAt)))throw Error('Invalid restored blockee clock');
   while(effect.nextAt<=time+1e-9&&effect.nextAt<s.until-1e-9){
    effect.nextAt+=effect.interval;effect.emitted++;
    for(const e of enemies().filter(e=>belongs(o,e,time))){
     const power=operatorAttackPower(o,buffMul(o).atk)*effect.scale;
     const result=calcDamageResult(o,e,1,{raw:power,type:effect.damageType});
     hitEnemy(o,e,result.amount,false,result.type);
    }
   }
  }
 }
 function statusActive(e,s,time){
  const o=units().find(o=>o.id===s.sourceId);
  return live(o,time)&&s.until>time&&s.skillId===o.skillBlockeeState.skillId&&
   o.skillBlockeeState.effects[s.effectIndex]?.kind==='maintained-blockee-status'&&belongs(o,e,time);
 }
 function update(){
  const time=now();
  for(const e of enemies())if(e.sourceBlockeeStatuses){
   e.sourceBlockeeStatuses=e.sourceBlockeeStatuses.filter(s=>statusActive(e,s,time));
   if(!e.sourceBlockeeStatuses.length)delete e.sourceBlockeeStatuses;
  }
  for(const o of units()){
   const state=o.skillBlockeeState;if(!state)continue;
   if(!live(o,time)){stop(o);continue;}
   advance(o,time);
   for(let index=0;index<state.effects.length;index++){
    const effect=state.effects[index];if(effect.kind!=='maintained-blockee-status')continue;
    for(const e of enemies())if(belongs(o,e,time)&&!e.stunImmune&&!e.sourceAttributes?.stunImmune){
     const key=JSON.stringify([o.id,state.skillId,index,effect.buffKey]);
     if(!(e.sourceBlockeeStatuses||[]).some(s=>s.key===key)){
      (e.sourceBlockeeStatuses||=[]).push({key,sourceId:o.id,skillId:state.skillId,effectIndex:index,
       kind:effect.status,buffKey:effect.buffKey,until:state.until});
     }
    }
   }
  }
 }
 function stunned(e,time=now()){
  return !e.stunImmune&&!e.sourceAttributes?.stunImmune&&
   (e.sourceBlockeeStatuses||[]).some(s=>s.kind==='stun'&&statusActive(e,s,time));
 }
 root.ArkSkillBlockees={validate,start,stop,advance,update,stunned};
})(typeof window==='undefined'?globalThis:window);
