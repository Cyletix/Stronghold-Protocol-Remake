// Source-owned bounded self actions. State stays in the parent program Buff.
(function(root){
 'use strict';
 const now=()=>typeof B==='undefined'?0:B.time||0;
 const value=(e,bb)=>{const v=e&&Object.hasOwn(e,'constant')?e.constant:e?.key?bb[e.key]:NaN;if(!Number.isFinite(v))throw Error('Invalid self Buff expression');return v;};
 function validateContribution(d,bb){const s=d.stacking;
  if(!d.id||d.scope!=='self'||!s||s.maxStacks!==1||typeof s.independentSource!=='boolean'||typeof s.disableOverride!=='boolean'||
   typeof s.overrideKey!=='string'||!s.overrideKey||!Number.isFinite(s.priority)||!Array.isArray(s.priorityKeys)||
   !Array.isArray(d.modifiers)||!d.modifiers.length)throw Error('Invalid self override contribution');
  for(const k of s.priorityKeys)if(!Number.isFinite(bb[k]))throw Error('Missing self override priority');
  for(const m of d.modifiers){const raw=value(m.value,bb),v=raw<0?1+raw:raw;
   if(m.attribute!=='one_minus_status_resistance'||m.formula!=='final_scaler'||v<0||v>1)throw Error('Invalid self override modifier');}
 }
 function validate(b,bb){
  if(b.damage_block_once){const p=b.damage_block_once;
   if(p.kind!=='all-damage-once'||p.sourceEvent!==10||p.finishOwnBuff!==true)throw Error('Invalid one-shot block');}
  if(b.derived_buffs){
   if(!Array.isArray(b.derived_buffs)||!b.derived_buffs.length)throw Error('Missing derived Buffs');
   for(const d of b.derived_buffs){const s=d.stacking;
    if(!d.id||d.scope!=='self'||d.lifetime?.kind!=='until_parent_finish'||d.sourceLifetime!=='until_detach'||d.sourceEvent!==0||
     !s||s.maxStacks!==1||typeof s.independentSource!=='boolean'||typeof s.disableOverride!=='boolean'||
     typeof s.overrideKey!=='string'||!s.overrideKey||!Number.isFinite(s.priority)||!Array.isArray(s.priorityKeys)||
     !Array.isArray(d.modifiers)||!d.modifiers.length)throw Error('Invalid derived self Buff');
    for(const k of s.priorityKeys)if(!Number.isFinite(bb[k]))throw Error('Missing derived priority');
    for(const m of d.modifiers){const raw=value(m.value,bb),v=raw<0?1+raw:raw;
     if(m.attribute!=='one_minus_status_resistance'||m.formula!=='final_scaler'||v<0||v>1)throw Error('Invalid derived status modifier');}
   }
  }
  if(b.periodic_actions){const p=b.periodic_actions,interval=value(p.interval,bb),count=value(p.count,bb);
   if(p.sourceEvent!==2||p.waitFirst!==true||!(interval>0)||!Number.isSafeInteger(count)||count<=0||
    !Array.isArray(p.actions)||p.actions.length!==1||p.actions[0].kind!=='cost'||value(p.actions[0].value,bb)<0)
    throw Error('Invalid finite self action clock');
  }
  if(b.override_buff){
   if(b.lifetime?.kind!=='timed'||!(value(b.lifetime.duration,bb)>0)||b.modifiers?.length)throw Error('Invalid finite self override parent');
   validateContribution(b.override_buff,bb);
  }
 }
 function start(unit,out,b,bb,time,index){
  validate(b,bb);
  if(b.damage_block_once)out.damageBlockOnce={remaining:1};
  if(b.derived_buffs)out.derivedBuffs=b.derived_buffs.map((d,di)=>({...d,
   instanceKey:JSON.stringify([unit.id,unit.skill.sourceId,index,'derived',di]),sourceId:unit.id,sourceCharId:unit.charId,
   skillId:unit.skill.sourceId,parentBuffIndex:index,startedAt:time,until:out.until,
   priority:d.stacking.priorityKeys.length?Math.round(1000*d.stacking.priorityKeys.reduce((sum,k)=>sum+Math.abs(bb[k]),0)):d.stacking.priority,
   modifiers:d.modifiers.map(m=>({...m,value:value(m.value,bb)}))}));
  if(b.override_buff){const d=b.override_buff;
   out.overrideBuff={...d,instanceKey:JSON.stringify([unit.id,unit.skill.sourceId,index,'override']),sourceId:unit.id,sourceCharId:unit.charId,
    skillId:unit.skill.sourceId,parentBuffIndex:index,startedAt:time,until:out.until,
    priority:d.stacking.priorityKeys.length?Math.round(1000*d.stacking.priorityKeys.reduce((sum,k)=>sum+Math.abs(bb[k]),0)):d.stacking.priority,
    modifiers:d.modifiers.map(m=>({...m,value:value(m.value,bb)}))};}
  if(b.periodic_actions){const p=b.periodic_actions,interval=value(p.interval,bb);
   out.periodicActions={interval,count:value(p.count,bb),emittedCount:0,nextAt:time+interval,
    actions:p.actions.map(a=>({kind:a.kind,value:value(a.value,bb)}))};}
 }
 function ownerLive(unit){return !!unit&&!unit.dead&&!unit.removed&&unit.hp>0&&unit.col!=null&&
  (typeof B==='undefined'||[...(B.operators||[]),...(B.summoneds||[])].includes(unit));}
 function advance(unit,time=now()){
  const state=unit.clientProgramState;if(!state||!unit.skillState||!ownerLive(unit))return;
  for(const b of state.buffs){const p=b.periodicActions;if(!p)continue;
   const until=Math.min(b.until,unit.skillState.until),last=Math.min(time,until);
   // The serialized cursor owns payment. A repeated query or restore cannot
   // pay an already consumed trigger; a large frame may cross several ticks.
   while(p.emittedCount<p.count&&p.nextAt<=last+1e-9&&p.nextAt<until-1e-9){
    p.emittedCount++;p.nextAt=b.startedAt+(p.emittedCount+1)*p.interval;
    for(const a of p.actions)root.onSkillDp?.(a.value,unit);
   }
  }
 }
 function effective(unit,time=now()){
  const state=unit.clientProgramState;
  if(!state||!ownerLive(unit)||state.ownerId!==unit.id||!unit.skillState||unit.skillState.until<=time)return [];
  const out=[];
  for(const b of state.buffs)if(b.until>time)for(const d of [...(b.derivedBuffs||[]),...(b.overrideBuff?[b.overrideBuff]:[])])
   if(d.until>time&&d.sourceId===unit.id&&d.skillId===unit.skill?.sourceId&&d.parentBuffIndex===b.index)out.push(d);
  return out;
 }
 root.ArkSkillSelfBuffs={validate,start,advance,effective};
})(typeof window==='undefined'?globalThis:window);
