// Maintained source auras. Buff provenance is separate from effective stacking.
(function(root){
 'use strict';
 const attributes=new Set(['atk','def','magic_resistance','attack_speed','one_minus_status_resistance']);
 const formulas=new Set(['addition','multiplier','final_addition','final_scaler']);
 const timeNow=()=>typeof B==='undefined'?0:B.time||0;
 const allies=()=>typeof B==='undefined'?[]:[...(B.operators||[]),...(B.summoneds||[])];
 const units=()=>typeof B==='undefined'?[]:[...allies(),...(B.enemies||[])];
 const finite=Number.isFinite;
 function value(expr,bb){
  const v=expr&&Object.hasOwn(expr,'constant')?expr.constant:expr?.key?bb[expr.key]:NaN;
  if(!finite(v))throw Error('Invalid source aura expression');return v;
 }
 function validate(auras,bb){
  if(!Array.isArray(auras)||!auras.length)throw Error('Missing source auras');
  for(const a of auras){
   const s=a.selection,m=a.membership;
   if(a.kind!=='maintained-aura'||!['operator-range','global'].includes(a.range?.kind)||
    !['ally','enemy'].includes(s?.side)||![1,2,3].includes(s.motionMask)||s.categoryMask!==1||
    ![0,32].includes(s.professionMask)||![0,1,2].includes(s.selfOption)||s.respectTargetFree!==true||
    !m||m.removeOnDetach!==true||m.sourceScoped!==true||m.reevaluateWhileActive!==true||m.onlyAddOnce!==false||
    typeof m.removeOnLeave!=='boolean'||!Array.isArray(a.buffs)||!a.buffs.length)throw Error('Invalid maintained aura contract');
   for(const b of a.buffs){
    const st=b.stacking;
    if(b.scope!=='target'||b.lifetime?.kind!=='until_detach'||typeof b.id!=='string'||!b.id||
     !Array.isArray(b.effects)||b.effects.length||b.mode!==null||!st||st.maxStacks!==1||
     typeof st.independentSource!=='boolean'||typeof st.disableOverride!=='boolean'||typeof st.overrideKey!=='string'||
     !finite(st.priority)||!Array.isArray(st.priorityKeys)||!Array.isArray(b.modifiers)||!b.modifiers.length)
     throw Error('Invalid source aura Buff');
    for(const key of st.priorityKeys)if(!finite(bb[key]))throw Error('Missing source aura priority');
    for(const mod of b.modifiers){
     const v=value(mod.value,bb);
     if(!attributes.has(mod.attribute)||!formulas.has(mod.formula)||mod.formula==='final_scaler'&&v<-1)
      throw Error('Invalid source aura modifier');
    }
   }
  }
 }
 function present(unit,time){return !!unit&&!unit.dead&&!unit.removed&&unit.hp>0&&
  (unit.enemyId?unit.spawnState!==true:unit.col!=null&&(unit.deployAt??0)<=time&&(unit.deployT||0)>=1);}
 function selectable(source,target,a,time){
  if(!present(target,time)||target.untargetable||target.targetFree||target.invisibleUntil>time)return false;
  const s=a.selection;
  if(s.selfOption===2&&source===target)return false;
  if(s.side==='enemy'?!target.enemyId:!!target.enemyId)return false;
  if(!((target.flying?2:1)&s.motionMask))return false;
  if(s.professionMask===32&&target.profession!=='CASTER')return false;
  if(a.range.kind==='global')return true;
  if(target.enemyId)return enemyInOperatorRange(source,target,source.cells);
  return source.cells?source.cells.some(c=>c[0]===target.row&&c[1]===target.col):dist(source,target)<=source.range;
 }
 function start(source,time){
  const p=root.ArkSkillModeData?.programs[source.skill?.clientProgram?.prefabId];if(!p?.auras)return;
  const bb={duration:source.skill.duration,...source.skill.blackboard};validate(p.auras,bb);
  if(!source.skillState)throw Error('Aura requires an active source controller');
  stop(source);
  source.skillAuraState={version:1,sourceId:source.id,skillId:source.skill.sourceId,startedAt:time,until:source.skillState.until,
   auras:p.auras.map((a,ai)=>({...a,buffs:a.buffs.map((b,bi)=>({...b,
    instanceKey:JSON.stringify([source.id,source.skill.sourceId,ai,bi]),sourceId:source.id,sourceCharId:source.charId,
    skillId:source.skill.sourceId,auraIndex:ai,startedAt:time,until:source.skillState.until,
    priority:b.stacking.priorityKeys.length?Math.round(1000*b.stacking.priorityKeys.reduce((sum,key)=>sum+Math.abs(bb[key]),0)):b.stacking.priority,
    modifiers:b.modifiers.map(m=>({...m,value:value(m.value,bb)}))}))}))};
  update();
 }
 function stop(source){
  delete source.skillAuraState;
  for(const target of units())if(target.sourceAuraBuffs){
   target.sourceAuraBuffs=target.sourceAuraBuffs.filter(b=>b.sourceId!==source.id);
   if(!target.sourceAuraBuffs.length)delete target.sourceAuraBuffs;
  }
 }
 function update(){
  const time=timeNow(),pool=units(),sources=allies().filter(s=>present(s,time)&&s.skillAuraState&&s.skillState&&s.skillState.until>time);
  const live=new Set(sources.map(s=>s.id));
  for(const target of pool)if(target.sourceAuraBuffs){
   target.sourceAuraBuffs=target.sourceAuraBuffs.filter(b=>live.has(b.sourceId)&&b.until>time&&present(target,time));
   if(!target.sourceAuraBuffs.length)delete target.sourceAuraBuffs;
  }
  for(const source of sources){const state=source.skillAuraState;
   for(let index=0;index<state.auras.length;index++){
    const a=state.auras[index];
    for(const target of pool){
     const selected=selectable(source,target,a,time);
     if(!selected){
      if((a.membership.removeOnLeave||a.range.kind==='global')&&target.sourceAuraBuffs)target.sourceAuraBuffs=target.sourceAuraBuffs.filter(b=>b.sourceId!==source.id||b.auraIndex!==index);
      continue;
     }
     const existing=new Set((target.sourceAuraBuffs||[]).map(b=>b.instanceKey));
     for(const buff of a.buffs)if(!existing.has(buff.instanceKey)){
      target.sourceAuraBuffs||=[];target.sourceAuraBuffs.push(JSON.parse(JSON.stringify(buff)));
     }
    }
   }
  }
 }
 function effective(unit,time){
  if(!present(unit,time))return [];
  const available=[],out=[],groups=new Map();
  for(const b of unit.sourceAuraBuffs||[]){
   if(!(b.until>time))continue;
   const owner=allies().find(o=>o.id===b.sourceId);
   if(!present(owner,time)||!owner.skillState||owner.skillState.until<=time||owner.skillAuraState?.skillId!==b.skillId)continue;
   const aura=owner.skillAuraState.auras[b.auraIndex];
   if((aura.membership.removeOnLeave||aura.range.kind==='global')&&!selectable(owner,unit,aura,time))continue;
   available.push(b);
  }
  // Derived self Buffs and received auras compete in the same source override
  // group. Selecting twice would incorrectly multiply identical status buffs.
  available.push(...(root.ArkSkillSelfBuffs?.effective(unit,time)||[]));
  available.push(...(root.ArkEnemyAuras?.passiveBuffs(unit,time)||[]));
  for(const b of available){
   const st=b.stacking;
   if(st.disableOverride){out.push(b);continue;}
   const key=JSON.stringify([st.overrideKey,st.independentSource?b.sourceId:null]),old=groups.get(key);
   if(!old||b.priority>old.priority||b.priority===old.priority&&(b.startedAt>old.startedAt||
    b.startedAt===old.startedAt&&String(b.sourceId)<String(old.sourceId)))groups.set(key,b);
  }
  return [...out,...groups.values()];
 }
 function layers(unit,attribute,time=timeNow()){
  const out={addition:0,multiplier:0,final_addition:0,final_scaler:1};
  for(const b of effective(unit,time))for(const m of b.modifiers)if(m.attribute===attribute){
   if(m.formula==='final_scaler')out.final_scaler*=m.value<0?1+m.value:m.value;else out[m.formula]+=m.value;
  }
  return out;
 }
 function has(unit,time=timeNow()){return effective(unit,time).length>0;}
 function attribute(unit,key,base,current=base,time=timeNow()){
  const layer=layers(unit,key,time);
  // Preserve other flat effects when the source base happens to be zero.
  if(base===0)layer.final_addition+=current;
  return root.ArkClientPrograms.calculate(base,current,0,layer);
 }
 function statusResistance(unit,time=timeNow()){
  const resistance=Math.max(0,Math.min(1,unit.statusResistance||0)),layer=layers(unit,'one_minus_status_resistance',time);
  if(layer.addition===0&&layer.multiplier===0&&layer.final_addition===0&&layer.final_scaler===1)return resistance;
  const base=1-resistance;
  return Math.max(0,Math.min(1,1-root.ArkClientPrograms.calculate(base,base,0,layer)));
 }
 root.ArkSkillAuras={validate,start,stop,update,effective,layers,has,attribute,statusResistance};
})(typeof window==='undefined'?globalThis:window);
