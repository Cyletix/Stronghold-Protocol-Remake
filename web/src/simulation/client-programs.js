// Shared source programs: self Buff instances, expressions and explicit lifecycle.
(function(root){
 'use strict';
 const attributes=new Set(['max_hp','atk','def','magic_resistance','attack_speed','base_attack_time','block_cnt','hp_recovery_per_sec','hp_recovery_per_sec_by_max_hp_ratio','ability_range_forward_extend','taunt_level','def_penetrate','def_penetrate_fixed']);
 const formulas=new Set(['addition','multiplier','final_addition','final_scaler']);
 const flags=new Set(['no_direct_heal']);
 const data=()=>root.ArkClientProgramData;
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function expression(x,bb){
  if(!x||Object.keys(x).length!==1)throw Error('Invalid client program expression');
  const value=Object.hasOwn(x,'constant')?x.constant:typeof x.key==='string'?bb[x.key]:NaN;
  if(!finite(value))throw Error('Invalid client program expression value');return value;
 }
 function programFor(id){return root.ArkSkillModeData?.programs[id]??data()?.programs[id];}
 function program(unit){return unit.skill?.clientProgram&&programFor(unit.skill.clientProgram.prefabId);}
 function configure(skill,charId){
  const binding=root.ArkSkillModeData?.profiles[skill.sourceId]??data()?.profiles[skill.sourceId];if(!binding)return false;
  const p=programFor(binding.prefabId),bb={duration:skill.duration,...skill.blackboard};
  const deployment=p?.controller?.kind==='appear_skill_active_buffs';
  const passive=p?.controller?.kind==='passive_skill';
  const flow=p?.controller?.kind==='cast_skill_flow';
  const toggle=p?.controller?.kind==='toggle_skill';
  const finiteAmmo=p?.controller?.kind==='cast_skill_with_limit_times';
  if(!p||!binding.charIds.includes(charId)||(deployment||passive?!skill.isPassive||skill.spCost!==0:skill.isPassive||!(skill.spCost>0))||
    Object.keys(skill.blackboard||{}).sort().join(',')!==binding.blackboardKeys.slice().sort().join(','))throw Error('Invalid client program binding: '+skill.sourceId);
  if((passive?(p.controller.activation!=='passive'||p.controller.attach_in_dummy!==true||p.controller.emit_skill_started!==false):
    deployment?(p.controller.activation!=='deploy'||typeof p.controller.cast_on_locate!=='boolean'||p.controller.emit_skill_started!==false):
    toggle?p.controller.activation!=='toggle':
    !['cast_skill_active_buffs','attach_or_detach_skill_auras','cast_skill_with_limit_times','cast_skill_flow'].includes(p.controller.kind)||p.controller.activation!=='cast')||p.controller.pre_delay!==0||p.controller.duration_policy!==(passive?'until_detach':toggle?'until_toggle':flow?'child_completion':finiteAmmo?'ammo_count':'max_buff_duration')||
    typeof p.controller.wait_for_casting!=='boolean'||typeof p.controller.wait_for_attack_event!=='boolean'||
    (p.controller.wait_for_casting&&p.controller.wait_for_attack_event))throw Error('Invalid client program controller');
  if(finiteAmmo){
   const a=p.controller.ammo,count=expression(a?.count,bb);
   if(skill.durationType!=='AMMO'||skill.duration!==0||!Number.isSafeInteger(count)||count<1||skill.ammoCount!==count||
     a.progressSource!=='effective-main-attack'||a.sourceCountEvent!==4||a.expendPerTrigger!==1||a.finishOnEmpty!==true||
     a.canDiscardRemaining!==true||a.resetAfterEnd!==true||a.resetImmediatelyWhenProgressEnd!==false||a.resetWhenAttackFinished!==false||
     !Number.isInteger(a.modeIndex)||a.modeIndex<1)throw Error('Invalid finite ammo controller');
  }
  if(p.auras)root.ArkSkillAuras.validate(p.auras,bb);
  else if(p.controller.kind==='attach_or_detach_skill_auras')throw Error('Missing attached source aura');
  if(p.blockees)root.ArkSkillBlockees.validate(p.blockees,bb);
  if(p.endEffects)root.ArkSkillEndEffects.validate(p.endEffects,bb);
  if(flow)root.ArkSkillModes.validateFlow(p.flow,p.buffs,bb);
  for(const b of p.buffs){
   if(b.damage_block_once||b.derived_buffs||b.periodic_actions||b.override_buff)root.ArkSkillSelfBuffs.validate(b,bb);
   const timed=b.lifetime.kind==='timed'&&expression(b.lifetime.duration,bb)>0;
   const infinite=b.lifetime.kind==='until_detach'&&(passive||toggle||flow&&p.flow.persistentBuffIndexes?.includes(p.buffs.indexOf(b))||finiteAmmo||skill.duration===-1)&&Object.keys(b.lifetime).length===1;
   if(b.scope!=='self'||!(timed||infinite)||b.stacking.max_stacks!==1)throw Error('Invalid client program Buff');
   if(b.flags&&(!Array.isArray(b.flags)||!b.flags.length||new Set(b.flags).size!==b.flags.length||b.flags.some(flag=>!flags.has(flag))))throw Error('Invalid client program Buff flag');
   for(const m of b.modifiers){
    if(!attributes.has(m.attribute)||!formulas.has(m.formula))throw Error('Invalid client program modifier');
    const value=expression(m.value,bb);
    if(m.attribute==='ability_range_forward_extend'&&(m.formula!=='addition'||!Number.isInteger(value)||value<0))throw Error('Invalid forward range modifier');
   }
   if(b.on_attach){
    if(!deployment||!Array.isArray(b.on_attach)||!b.on_attach.length)throw Error('Invalid deployment attach actions');
    for(const action of b.on_attach){
     const ratio=expression(action.ratio,bb);
     if(action.kind!=='current-hp-ratio-damage'||action.damage_type!=='true'||action.nonlethal!==true||
       action.skip_modifier_events!==true||typeof action.ignore_for_sp!=='boolean'||ratio<0||ratio>1)
       throw Error('Invalid deployment self damage');
    }
   }
   if(b.periodic){
    const q=b.periodic,m=q.modifier;
    if(!deployment||!timed||q.kind!=='remaining-ratio-modifier'||!(q.interval>0)||typeof q.wait_first!=='boolean'||
      q.end_time!==0||q.inversed!==false||m?.attribute!=='def'||m.formula!=='multiplier'||expression(m.value,bb)<0)
      throw Error('Invalid deployment periodic modifier');
   }
   if(b.shield){
    const q=b.shield;
    if(!deployment||!timed||q.kind!=='linear-decay'||q.attribute!=='max_hp'||!(q.interval>0)||
      typeof q.wait_first!=='boolean'||!(expression(q.ratio,bb)>0))throw Error('Invalid deployment shield');
   }
  }
  if(p.passive_modifiers){
   if(!deployment||!Array.isArray(p.passive_modifiers)||!p.passive_modifiers.length)throw Error('Invalid deployment passive modifiers');
   for(const m of p.passive_modifiers)if(m.attribute!=='respawn_time'||m.formula!=='final_scaler'||expression(m.value,bb)<0)
    throw Error('Invalid deployment respawn modifier');
  }
  if(p.mode_graph){
   const proof=p.mode_graph.proofs?.find(x=>x.char_id===charId);
   const exact=p.mode_graph.kind==='all_serialized_modes_preserve_attack'&&proof?.combat_graph_sha256==='8cda7a5dd2c5d3b04d25a8280d52f36bfc73470ec852f5618568cbf4f8b9f198';
   const preserve=p.mode_graph.kind==='all_serialized_modes_preserve_existing_combat'&&/^[a-f0-9]{64}$/.test(proof?.combat_graph_sha256||'')&&proof?.mode_graph_sha256?.length===proof?.mode_path_ids?.length&&proof?.mode_graph_sha256?.every(x=>x===proof.combat_graph_sha256);
   if(!p.mode_graph.characters.includes(charId)||!proof||!(exact||preserve))throw Error('Invalid client program mode proof');
  }
  skill.clientProgram={version:1,prefabId:binding.prefabId,boundaries:p.source.model_boundaries||[]};
  // The source program owns this skill body. Existing metadata is retained for
  // diagnostics, while legacy description operators are not executed twice.
  skill.effects=[];
  for(const key of ['combatMechanic','medicMechanic'])delete skill[key];
  if(skill.commonMechanic?.kind!=='stat-buff')delete skill.commonMechanic;
  return true;
 }
 function duration(unit){
  const p=program(unit);if(!p)return null;
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};
  if(p.flow)return root.ArkSkillModes.flowDuration(p,bb);
  return Math.max(...p.buffs.map(b=>b.lifetime.kind==='until_detach'?Number.MAX_SAFE_INTEGER:expression(b.lifetime.duration,bb)));
 }
 function active(unit,time=0){
  const p=program(unit);
  if(p?.controller.activation==='passive'){
   if(unit.dead||unit.removed)return [];
   const bb=unit.skill.blackboard;
   // Attached passive attributes exist on the source binding, including preview
   // units. They never create a cast, SP lock, timer or restorable Buff cursor.
   return p.buffs.map(b=>({id:b.id,sourceId:unit.id,targetId:unit.id,until:Number.MAX_SAFE_INTEGER,
    modifiers:b.modifiers.map(m=>({...m,value:expression(m.value,bb)}))}));
  }
  const state=unit.clientProgramState;
  return state&&unit.skillState&&!unit.dead&&state.ownerId===unit.id&&state.prefabId===unit.skill?.clientProgram?.prefabId?state.buffs.filter(b=>b.startedAt<=time&&b.until>time&&b.sourceId===unit.id&&b.targetId===unit.id):[];
 }
 function hasPassive(unit){return !unit.dead&&!unit.removed&&program(unit)?.controller.activation==='passive';}
 function layers(unit,attribute,time=0){
  const value={addition:0,multiplier:0,final_addition:0,final_scaler:1};
  for(const b of active(unit,time))for(const m of [...b.modifiers,...(b.periodic?[{...b.periodic.modifier,value:b.periodic.currentValue}]:[])])if(m.attribute===attribute){
   if(m.formula==='final_scaler')value.final_scaler*=m.value<0?1+m.value:m.value;else value[m.formula]+=m.value;
  }
  const aura=root.ArkSkillAuras?.layers(unit,attribute,time);
  if(aura){value.addition+=aura.addition;value.multiplier+=aura.multiplier;value.final_addition+=aura.final_addition;value.final_scaler*=aura.final_scaler;}
  return value;
 }
 function calculate(base,current,bonus,l){
  const percent=base!==0?current/base:1;
  return ((base+l.addition)*Math.max(0,percent+bonus+l.multiplier)+l.final_addition)*l.final_scaler;
 }
 function maximumHp(unit,time){
  const state=unit.clientProgramState;if(!state)return unit.maxHp;
  return Math.max(1,calculate(unit.attributeBase?.maxHp??state.baseMaxHp,state.baseMaxHp,0,layers(unit,'max_hp',time)));
 }
 function syncHp(unit,time){
  const state=unit.clientProgramState;if(!state?.affectsMaxHp)return;
  // Other live mechanics can change maxHp between our lifecycle events. Keep
  // their actual delta separate from this program's own attribute contribution.
  state.baseMaxHp+=unit.maxHp-state.lastMaxHp;
  const next=maximumHp(unit,time),old=unit.maxHp;
  if(next!==old){unit.maxHp=next;unit.hp=old>0?Math.max(0,Math.min(next,unit.hp/old*next)):0;}
  state.lastMaxHp=unit.maxHp;
 }
 function createBuffInstance(unit,b,index,bb,time){
    const out={id:b.id,index,sourceId:unit.id,targetId:unit.id,startedAt:time,until:b.lifetime.kind==='until_detach'?Number.MAX_SAFE_INTEGER:time+expression(b.lifetime.duration,bb),
     ...(b.flags?{flags:b.flags.slice()}:{}),
     modifiers:b.modifiers.map(m=>({attribute:m.attribute,formula:m.formula,value:expression(m.value,bb)}))};
    if(b.periodic)out.periodic={interval:b.periodic.interval,nextAt:time+(b.periodic.wait_first?b.periodic.interval:0),currentValue:0,
      modifier:{...b.periodic.modifier,value:expression(b.periodic.modifier.value,bb)}};
    if(b.shield){const initial=unit.maxHp*expression(b.shield.ratio,bb);
     out.shield={initial,amount:initial,decayPerTick:initial/(out.until-time)*b.shield.interval,
      interval:b.shield.interval,nextAt:time+(b.shield.wait_first?b.shield.interval:0)};}
    if(b.damage_block_once||b.derived_buffs||b.periodic_actions||b.override_buff)root.ArkSkillSelfBuffs.start(unit,out,b,bb,time,index);
    return out;
 }
 function activateFlowBuffs(unit,indexes,time){
  const p=program(unit),state=unit.clientProgramState;
  if(!p?.flow||!state?.flow||!unit.skillState||!Array.isArray(indexes)||!indexes.length||
   new Set(indexes).size!==indexes.length||indexes.some(i=>!Number.isInteger(i)||i<0||i>=p.buffs.length))
   throw Error('Invalid source flow Buff activation');
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};
  for(const index of indexes){
   if(state.buffs.some(b=>b.index===index))throw Error('Source flow cannot replay a stage Buff');
   state.buffs.push(createBuffInstance(unit,p.buffs[index],index,bb,time));
  }
 }
 function start(unit,time){
  const p=program(unit);if(!p)return;
  if(p.controller.activation==='passive')throw Error('Passive source programs are not active casts');
  if(!unit.skillState||unit.clientProgramState)throw Error('Invalid client program activation state');
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};
  unit.clientProgramState={version:1,prefabId:unit.skill.clientProgram.prefabId,ownerId:unit.id,baseMaxHp:unit.maxHp,lastMaxHp:unit.maxHp,
   affectsMaxHp:p.buffs.some(b=>b.modifiers.some(m=>m.attribute==='max_hp')),
   affectsRange:p.buffs.some(b=>b.modifiers.some(m=>m.attribute==='ability_range_forward_extend')),
   affectsRecovery:p.buffs.some(b=>b.modifiers.some(m=>m.attribute==='hp_recovery_per_sec'||m.attribute==='hp_recovery_per_sec_by_max_hp_ratio')),recoveryAt:time,
   buffs:p.flow?[]:p.buffs.map((b,index)=>createBuffInstance(unit,b,index,bb,time))};
  if(p.flow)root.ArkSkillModes.startFlow(unit,time);
  if(unit.clientProgramState.affectsRange){
   if(!Array.isArray(unit.rangeGrids)||!unit.rangeGrids.length)throw Error('Missing source grids for forward range');
   unit.clientProgramState.baseRangeGrids=unit.rangeGrids.map(g=>({...g}));
  }
  advancePeriodic(unit,time);syncHp(unit,time);syncRange(unit,time);
  root.ArkSkillSelfBuffs?.advance(unit,time);
  // These source nodes skip damage modifiers entirely: no shields, reduction,
  // on-damage event or ordinary hit is consumed by the nonlethal self loss.
  for(const b of p.buffs)for(const action of b.on_attach||[]){
   const before=unit.hp;unit.hp=Math.max(Math.min(1,before),before-before*expression(action.ratio,bb));
   if(before>unit.hp&&!action.ignore_for_sp)gainOperatorSp(unit,'INCREASE_WHEN_TAKEN_DAMAGE',1);
  }
  if(p.auras)root.ArkSkillAuras.start(unit,time);
  if(p.blockees)root.ArkSkillBlockees.start(unit,time);
  if(p.endEffects)root.ArkSkillEndEffects.start(unit,time);
 }
 function syncRange(unit,time){
  const state=unit.clientProgramState;if(!state?.affectsRange)return;
  const count=layers(unit,'ability_range_forward_extend',time).addition;
  if(!Number.isInteger(count)||count<0)throw Error('Invalid active forward range');
  if(state.rangeCount!==count){
   unit.rangeGrids=root.ArkCommonSkills.extendForward(state.baseRangeGrids,count);state.rangeCount=count;
  }
  unit.cells=rangeCellsFor(unit);
 }
 function rebindRange(unit,grids,time){
  const state=unit.clientProgramState;if(!state?.affectsRange||!Array.isArray(grids)||!grids.length)return false;
  unit.skillState.rangeGrids=grids.map(g=>({...g}));
  unit.skillState.cells=rangeCellsFor({...unit,rangeGrids:grids});
  state.baseRangeGrids=(unit.skill.rangeGrids||grids).map(g=>({...g}));
  delete state.rangeCount;syncRange(unit,time);return true;
 }
 function stop(unit){
  if(unit.skillAuraState)root.ArkSkillAuras?.stop(unit);
  if(unit.skillBlockeeState)root.ArkSkillBlockees?.stop(unit);
  const state=unit.clientProgramState;if(!state)return;
  if(state.flow?.cursor)root.ArkAbilityFlow.cancel(state.flow.cursor,Math.max(B.time,state.flow.cursor.time));
  if(state.affectsRange){
   unit.rangeGrids=state.baseRangeGrids.map(g=>({...g}));unit.cells=rangeCellsFor(unit);
   if(unit.skillState)unit.skillState.cells=rangeCellsFor({...unit,rangeGrids:unit.skillState.rangeGrids});
  }
  if(!state.affectsMaxHp){delete unit.clientProgramState;return;}
  state.baseMaxHp+=unit.maxHp-state.lastMaxHp;
  const old=unit.maxHp,next=state.baseMaxHp;
  unit.maxHp=next;unit.hp=old>0?Math.max(0,Math.min(next,unit.hp/old*next)):0;delete unit.clientProgramState;
 }
 function tick(unit,time){
  const state=unit.clientProgramState;if(!state)return;
  advancePeriodic(unit,time);
  state.buffs=state.buffs.filter(b=>b.until>time);syncHp(unit,time);syncRange(unit,time);
 }
 function advancePeriodic(unit,time){
  const state=unit.clientProgramState;if(!state||unit.dead||!unit.skillState)return;
  for(const b of state.buffs){
   const q=b.periodic||b.shield;if(!q)continue;
   // nextAt is serialized. Replaying a partial step never repeats a source
   // trigger, while a large step consumes exactly the same periodic sequence.
   while(q.nextAt<=time+1e-9&&q.nextAt<b.until-1e-9){
    const at=q.nextAt;q.nextAt+=q.interval;
    if(b.periodic)q.currentValue=q.modifier.value*Math.max(0,Math.min(1,(b.until-at)/(b.until-b.startedAt)));
    else{q.amount=Math.max(0,q.amount-q.decayPerTick);if(q.amount<=1e-9){q.amount=0;b.until=at;}}
   }
  }
  if(!state.flow&&state.buffs.length&&state.buffs.every(b=>b.until<=time))unit.skillState.until=Math.min(unit.skillState.until,Math.max(...state.buffs.map(b=>b.until)));
 }
 function advance(unit,time,dt,heal){
  if(unit.clientProgramState?.flow)root.ArkSkillModes.advanceFlow(unit,time);
  advancePeriodic(unit,time);
  if(unit.skillBlockeeState)root.ArkSkillBlockees?.advance(unit,time);
  root.ArkSkillSelfBuffs?.advance(unit,time);
  const state=unit.clientProgramState;if(!state?.affectsRecovery||!unit.skillState)return;
  const from=Math.max(state.recoveryAt??time-dt,time-dt);state.recoveryAt=time;
  if(!(time>from)||unit.dead||!(unit.hp>0)||unit.deployAt>time)return;
  // Integrate only the live portion of each Buff, including the final partial
  // tick before expiry. The checkpoint cursor prevents duplicate recovery.
  const cuts=[from,...state.buffs.map(b=>b.until).filter(t=>t>from&&t<time),time].sort((a,b)=>a-b);
  for(let i=0;i<cuts.length-1;i++){
   // Max-HP Buffs can expire within this tick. Update their HP-ratio effect
   // before healing each live interval, rather than using the final cap for all.
   syncHp(unit,cuts[i]);
   const flat=Math.max(0,calculate(0,0,0,layers(unit,'hp_recovery_per_sec',cuts[i])));
   const ratio=Math.max(0,calculate(0,0,0,layers(unit,'hp_recovery_per_sec_by_max_hp_ratio',cuts[i])));
   const amount=(flat+unit.maxHp*ratio)*(cuts[i+1]-cuts[i]);
   if(amount>0)heal(unit,unit,amount,{regen:true,visual:false});
  }
 }
 function blockCount(unit,value,time=0){
  if(!unit.clientProgramState||!unit.skillState)return value;
  return Math.max(0,Math.floor(calculate(value,value,0,layers(unit,'block_cnt',time))));
 }
 function noDirectHeal(unit,time=0){return active(unit,time).some(b=>b.flags?.includes('no_direct_heal'));}
 function rebind(unit,oldMaxHp,oldHp,newBaseMaxHp,time){
  const state=unit.clientProgramState;if(!state)return;
  state.baseMaxHp=newBaseMaxHp;
  if(!state.affectsMaxHp){state.lastMaxHp=unit.maxHp;return;}
  unit.maxHp=maximumHp(unit,time);state.lastMaxHp=unit.maxHp;
  unit.hp=oldMaxHp>0?Math.max(0,Math.min(unit.maxHp,oldHp/oldMaxHp*unit.maxHp)):0;
 }
 function interval(unit,value,time){
  if(!unit.clientProgramState||!unit.skillState)return value;
  const speed=root.ArkAttributes.baselineSpeed(unit),base=value*speed;
  return Math.max(.001,calculate(base,base,0,layers(unit,'base_attack_time',time)))/speed;
 }
 function respawnTime(unit,value){
  const p=program(unit);if(!p?.passive_modifiers)return value;
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};
  return p.passive_modifiers.reduce((out,m)=>out*expression(m.value,bb),value);
 }
 function targetPriority(unit,time=0){
  const base=unit.tauntLevel??unit.sourceAttributes?.tauntLevel??0;
  return calculate(base,base,0,layers(unit,'taunt_level',time));
 }
 function defensePenetration(unit,time=0){
  return {fixed:Math.max(0,calculate(0,0,0,layers(unit,'def_penetrate_fixed',time))),
   ratio:Math.max(0,Math.min(1,calculate(0,0,0,layers(unit,'def_penetrate',time))))};
 }
 function absorb(unit,amount,time){
  advancePeriodic(unit,time);
  for(const b of active(unit,time)){
   if(b.damageBlockOnce?.remaining>0&&amount>0){b.damageBlockOnce.remaining--;b.until=time;amount=0;break;}
   if(!b.shield)continue;
   const blocked=Math.min(amount,b.shield.amount);b.shield.amount-=blocked;amount-=blocked;
   if(b.shield.amount<=1e-9){b.shield.amount=0;b.until=time;}
   if(!(amount>0))break;
  }
  if(unit.clientProgramState&&!unit.clientProgramState.flow&&unit.clientProgramState.buffs.every(b=>b.until<=time)&&unit.skillState)unit.skillState.until=Math.min(unit.skillState.until,time);
  return amount;
 }
 function shieldInfo(unit,time){
  return active(unit,time).reduce((v,b)=>{if(b.shield){v.amount+=b.shield.amount;v.initial+=b.shield.initial;}return v;},{amount:0,initial:0});
 }
 root.ArkClientPrograms={version:1,get supported(){return [...new Set([...Object.keys(data()?.profiles||{}),...Object.keys(root.ArkSkillModeData?.profiles||{})])];},configure,duration,start,activateFlowBuffs,stop,tick,advance,blockCount,rebind,rebindRange,layers,hasPassive,calculate,interval,noDirectHeal,respawnTime,targetPriority,defensePenetration,absorb,shieldInfo};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ArkClientPrograms;
})(typeof window!=='undefined'?window:globalThis);
