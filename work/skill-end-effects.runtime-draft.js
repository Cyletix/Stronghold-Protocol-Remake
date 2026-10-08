// A cast-armed after-affecting status contract. End reasons are simulation events.
(function(root){
 'use strict';
 const finite=Number.isFinite;
 const completeReasons=new Set(['expire','end','manual','interrupt']);
 const destroyReasons=new Set(['death','removed','retreat','redeploy']);
 const units=()=>typeof B==='undefined'?[]:[...(B.operators||[]),...(B.summoneds||[])];
 function present(unit,time){return !!unit&&units().includes(unit)&&!unit.dead&&!unit.removed&&unit.hp>0&&
  unit.col!=null&&unit.row!=null&&unit.deployed!==false&&!(unit.deployAt>time);}
 function expression(expr,bb){
  if(!expr||Object.keys(expr).length!==1)throw Error('Invalid end-status expression');
  const value=Object.hasOwn(expr,'constant')?expr.constant:typeof expr.key==='string'?bb[expr.key]:NaN;
  if(!finite(value)||value<=0)throw Error('Invalid end-status duration');return value;
 }
 function validate(effects,bb){
  if(!Array.isArray(effects)||effects.length!==1)throw Error('Invalid end-effect program');
  for(const effect of effects){
   if(effect.kind!=='after-affecting'||effect.armEvent!==2||effect.pollWhileAttached!==true||
    effect.onlyCheckOnStopAffect!==false||effect.oncePerCast!==true||!Array.isArray(effect.buffs)||!effect.buffs.length)
    throw Error('Unsupported end-effect lifecycle');
   const keys=new Set();
   for(const b of effect.buffs){
    if(b.kind!=='stun'||typeof b.key!=='string'||!b.key||keys.has(b.key)||b.target!=='owner'||b.sourceId!=='owner'||
     b.statusResistable!=='automatic'||b.maxStack!==1||b.independentSource!==false||
     b.refresh!=='shared-max-expiry-model'||typeof b.damageMissable!=='boolean')throw Error('Invalid end-status body');
    keys.add(b.key);expression(b.duration,bb);
   }
  }
 }
 function start(unit,time){
  const prefabId=unit.skill?.clientProgram?.prefabId;
  const p=root.ArkSkillModeData?.programs[prefabId]??root.ArkClientProgramData?.programs[prefabId];
  if(!p?.endEffects)return false;
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};validate(p.endEffects,bb);
  if(!finite(time)||!present(unit,time)||!unit.skillState||!(unit.skillState.until>time)||unit.skillEndEffectState)
   throw Error('Invalid end-effect cast activation');
  unit.skillEndEffectState={version:1,armed:true,ownerId:unit.id,skillId:unit.skill.sourceId,prefabId,startedAt:time,
   effects:p.endEffects.flatMap(e=>e.buffs.map(b=>({kind:b.kind,key:b.key,duration:expression(b.duration,bb)})))};
  return true;
 }
 function clear(unit,{cancelPending=false}={}){
  if(!unit)return;
  delete unit.sourceSkillEndStatuses;
  if(cancelPending)delete unit.skillEndEffectState;
 }
 function finish(unit,time,reason='end'){
  if(!unit)return 0;
  const state=unit.skillEndEffectState;
  if(destroyReasons.has(reason)||unit.dead||unit.removed||unit.hp<=0){clear(unit,{cancelPending:true});return 0;}
  if(!state)return 0;
  if(!finite(time))throw Error('Invalid end-effect finish time');
  if(state.version!==1||state.armed!==true||state.ownerId!==unit.id||state.skillId!==unit.skill?.sourceId||
   state.prefabId!==unit.skill?.clientProgram?.prefabId||!present(unit,time)||!completeReasons.has(reason)){
   delete unit.skillEndEffectState;return 0;
  }
  // The engine must restore the active mode and its resistance layers first.
  // A premature stop call cannot consume the one-shot armed state.
  if(unit.skillState||unit.clientProgramState)throw Error('End effects require completed active-mode cleanup');
  if(!Array.isArray(state.effects)||!state.effects.length||state.effects.some(e=>e.kind!=='stun'||
   typeof e.key!=='string'||!e.key||!finite(e.duration)||e.duration<=0))throw Error('Invalid restored end effects');
  delete unit.skillEndEffectState;
  if(unit.stunImmune||unit.sourceAttributes?.stunImmune)return 0;
  const resistance=root.ArkSkillAuras?.statusResistance?.(unit,time)??unit.statusResistance;
  const scale=1-Math.max(0,Math.min(1,finite(resistance)?resistance:0));
  if(scale<=0)return 0;
  const statuses=(unit.sourceSkillEndStatuses||[]).filter(s=>s.ownerId===unit.id&&finite(s.until)&&s.until>time);
  for(const effect of state.effects){
   const previous=statuses.find(s=>s.key===effect.key&&s.kind===effect.kind),until=time+effect.duration*scale;
   const status={kind:'stun',key:effect.key,ownerId:unit.id,skillId:state.skillId,prefabId:state.prefabId,
    startedAt:time,until:Math.max(previous?.until||0,until)};
   if(previous)statuses[statuses.indexOf(previous)]=status;else statuses.push(status);
  }
  unit.sourceSkillEndStatuses=statuses;return state.effects.length;
 }
 function active(unit,time){return present(unit,time)?(unit.sourceSkillEndStatuses||[]).filter(s=>
  s.kind==='stun'&&s.ownerId===unit.id&&finite(s.until)&&s.until>time):[];}
 function stunned(unit,time){return active(unit,time).length>0;}
 function hasBuff(unit,key,time){return typeof key==='string'&&active(unit,time).some(s=>s.key===key);}
 root.ArkSkillEndEffects={validate,start,finish,stunned,hasBuff,clear};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ArkSkillEndEffects;
})(typeof window!=='undefined'?window:globalThis);
