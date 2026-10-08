// Complete source-selected timed skill modes; attributes use ClientPrograms.
(function(root){
 'use strict';
 const data=()=>root.ArkSkillModeData;
 function value(expr,bb,traitBB=null){
  const v=typeof expr==='number'?expr:expr&&Object.hasOwn(expr,'constant')?expr.constant:expr?.key?bb[expr.key]:expr?.traitKey?
   traitBB===null?expr.default:traitBB[expr.traitKey]??(expr.useDefaultWhenMissing?expr.default:NaN):NaN;
  if(!Number.isFinite(v))throw Error('Invalid skill mode expression');return v;
 }
 function resolve(profile,bb,unit=null){
  if(profile.action==='inherit'){
   if(!(profile.activation==='deploy'||profile.activation==='passive'||['maintained-aura','blockee-effects','bounded-self-buffs','ability-flow'].includes(profile.capability)&&profile.activation==='cast')||
    profile.modeIndex!==null||profile.plan!==null||profile.selector!==null)throw Error('Invalid inherited source mode');
   return {action:'inherit',plan:null};
  }
  if(profile.action==='none'){
   const flowChannel=profile.capability==='ability-flow'&&profile.channeling?.eventDriven===true&&profile.channeling?.fireAttackFinishEvent===true;
   if(profile.disarmed!==true||!profile.channeling||!(profile.channeling.eventDriven===false||flowChannel)||
    profile.channeling.waitForAttachFinish!==false||profile.plan!==null||profile.selector!==null)
    throw Error('Invalid disarmed skill mode');
   return {action:'none',plan:null,disarmed:true,channeling:{...profile.channeling,phase:'active'}};
  }
  const p=profile.plan,s=profile.selector,traitBB=unit?operatorAttackProfile(unit).bb||{}:null;
  const plan={kind:p.kind,damageType:p.damageType,hits:value(p.hits,bb),targets:value(p.targets,bb),
   scale:value(p.scale,bb),rangedScale:value(p.rangedScale,bb),groundOnly:s.groundOnly,
   airTarget:!s.groundOnly,blockedFirst:s.blockedFirst,priorityTag:s.priorityTag||null,
   targeting:'rangeOnly',all:p.kind==='rangeAll',blockCountLimit:!!s.blockCountLimit,radius:0,aftershocks:0,drone:false,slow:0};
  if(p.healTiming){const t=p.healTiming;
   if(profile.action!=='heal'||t.rule!=='native-attack-time-capped-animation'||t.waitForAttackEvent!==true||
    !(Number.isFinite(t.eventTime)&&t.eventTime>0&&Number.isFinite(t.animationDuration)&&t.animationDuration>=t.eventTime)||
    t.minScale!==.1||!(t.maxScale===-1||Number.isFinite(t.maxScale)&&t.maxScale>=.1)||
    !(Number.isFinite(t.sourcePreDelay)&&t.sourcePreDelay>=0))throw Error('Invalid source healing event timing');
   plan.healTiming={...t};
  }
  if(s.hpMax!=null)plan.hpMax=value(s.hpMax,bb);
  if(s.hpMin!=null)plan.hpMin=value(s.hpMin,bb);
  if(s.order==='defense-ascending')plan.targetOrder=s.order;
  if(s.airFirst!=null){if(typeof s.airFirst!=='boolean')throw Error('Invalid source airborne priority');plan.airFirst=s.airFirst;}
  if(s.priorityApplyWay!=null){
   if(s.priorityApplyWay!=='ranged'||plan.targets!==1||plan.all)throw Error('Invalid source apply-way priority');
   plan.priorityApplyWay=s.priorityApplyWay;
  }
  if(profile.capability==='finite-ammo'){
   if(p.ammo!==1||profile.ammo?.expendPerTrigger!==1||profile.ammo.progressSource!=='effective-main-attack'||
    profile.ammo.modeIndex!==profile.modeIndex)throw Error('Invalid source ammo action');
   plan.ammo=1;
  }
  if(p.delivery){
   if(p.delivery==='direct'){
    if(!Number.isFinite(p.attackPreDelay)||!(p.attackPreDelay>0)||p.projectile)throw Error('Invalid delayed mode hit');
    plan.replacementDelivery='direct';plan.attackPreDelay=p.attackPreDelay;
   }else{
    if(p.delivery!=='projectile'||!p.projectile||!(p.projectile.speed>0)||!(p.projectile.life>0))throw Error('Invalid mode projectile');
    plan.replacementDelivery='projectile';plan.replacementProjectile={...p.projectile};
    if(p.waitForProjectile)plan.replacementWaitProjectile=true;
   }
  }
  if(p.kind==='chain'){
   plan.chainCount=value(p.chainCount,bb,traitBB);plan.chainDecay=value(p.chainDecay,bb,traitBB);
   plan.chainRadius=p.chainRadius;plan.repeatChain=false;
   if(!Number.isInteger(plan.chainCount)||plan.chainCount<1||plan.chainCount>64||!(plan.chainDecay>=0&&plan.chainDecay<=1)||
    !(plan.chainRadius>0)||p.repeatChain!==false||p.waitForProjectile!==true||plan.targets!==1)throw Error('Invalid source mode chain');
  }
  if(p.hitBuffs){
   if(!Array.isArray(p.hitBuffs))throw Error('Invalid mode hit Buffs');
   plan.replacementHitBuffs=p.hitBuffs.map(effect=>{
    const out={...effect,duration:effect.durationKey?bb[effect.durationKey]:value(effect.duration,bb,traitBB),
     value:effect.valueKey?1+bb[effect.valueKey]:effect.value};
    if(effect.chance!=null){out.chance=value(effect.chance,bb,traitBB);
     if(out.phase!=='after-body'||out.chance<0||out.chance>1)throw Error('Invalid source hit probability');}
    if(!['stun','movement-multiplier','attack-multiplier'].includes(out.kind)||!['before-body','after-body'].includes(out.phase)||
     typeof out.key!=='string'||!out.key||!Number.isFinite(out.duration)||out.duration<=0||
     out.kind!=='stun'&&(!Number.isFinite(out.value)||out.value<0||out.value>=1))throw Error('Invalid finite mode hit Buff');
    return out;
   });
  }
  if(!['attack','heal'].includes(profile.action)||!['single','rangeAll','chain'].includes(p.kind)||
   !['phys','arts'].includes(p.damageType)||typeof s.groundOnly!=='boolean'||typeof s.blockedFirst!=='boolean'||
   !Number.isInteger(plan.hits)||plan.hits<1||plan.hits>32||!Number.isInteger(plan.targets)||plan.targets<1||plan.targets>64||
   !(plan.scale>0)||!(plan.rangedScale>0)||plan.hpMax!=null&&!(plan.hpMax>=0&&plan.hpMax<=1)||
   plan.hpMin!=null&&!(plan.hpMin>=0&&plan.hpMin<=1)||plan.hpMin!=null&&plan.hpMax!=null&&plan.hpMin>plan.hpMax)throw Error('Invalid skill mode plan');
  return {action:profile.action,plan};
 }
 function configure(skill,charId){
  const p=data()?.profiles[skill.sourceId];if(!p)return false;
  const deploy=p.activation==='deploy',passive=p.activation==='passive',toggle=p.activation==='toggle',flow=p.capability==='ability-flow',ammo=p.capability==='finite-ammo',program=data().programs[p.prefabId];
  if(toggle)root.ArkSkillToggle.validate(p,program,skill);
  const ammoCount=ammo?value(p.ammo?.count,skill.blackboard):null;
  const timed=p.lifetime?.kind==='timed'&&value(p.lifetime.duration,{duration:skill.duration,...skill.blackboard})>0;
  if(ammo&&!(p.activation==='cast'&&p.lifetime?.kind==='until_ammo_depleted'&&p.action==='attack'&&
    program?.controller.kind==='cast_skill_with_limit_times'&&program.controller.ammo?.modeIndex===p.modeIndex&&
    program.controller.ammo?.count?.key===p.ammo?.count?.key&&skill.durationType==='AMMO'&&skill.duration===0&&
    Number.isSafeInteger(ammoCount)&&ammoCount>0&&skill.ammoCount===ammoCount))throw Error('Invalid source finite ammo binding');
  if(!p.charIds.includes(charId)||!skill.clientProgram||skill.clientProgram.prefabId!==p.prefabId||
   (passive?!(skill.isPassive&&skill.spCost===0&&program?.controller.kind==='passive_skill'&&p.lifetime?.kind==='until_detach'):
    deploy?!(skill.isPassive&&skill.spCost===0&&program?.controller.activation==='deploy'):
    skill.isPassive||!(toggle||flow&&p.lifetime?.kind==='flow'||ammo||timed||p.lifetime?.kind==='until_detach'&&skill.duration===-1)||!(skill.spCost>0))||
   Object.keys(skill.blackboard||{}).sort().join(',')!==p.blackboardKeys.slice().sort().join(','))throw Error('Invalid source skill mode binding');
  resolve(p,skill.blackboard);skill.skillMode={version:1,profileId:skill.sourceId};return true;
 }
 function deployed(unit,located){
  const id=unit.skill?.skillMode?.profileId,p=data()?.profiles[id];
  if(!p||p.activation!=='deploy'||unit.dead||unit.sourceDeploymentStarted||unit.skillState)return false;
  const controller=data().programs[p.prefabId]?.controller;
  if(typeof located!=='boolean'||controller?.cast_on_locate!==located)return false;
  if(controller.kind!=='appear_skill_active_buffs'||controller.emit_skill_started!==false)throw Error('Invalid appearance lifecycle');
  const duration=root.ArkClientPrograms.duration(unit);
  if(!(Number.isFinite(duration)&&duration>0))throw Error('Invalid appearance duration');
  unit.sourceDeploymentStarted=true;
  unit.skillState={until:B.time+duration,ammo:0,range:unit.range,rangeGrids:unit.rangeGrids,cells:unit.cells,deltas:{}};
  if(unit.skill.rangeGrids){unit.rangeGrids=unit.skill.rangeGrids;unit.cells=rangeCellsFor(unit);}
  root.ArkClientPrograms.start(unit,B.time);start(unit);return true;
 }
 function start(unit){
  const id=unit.skill?.skillMode?.profileId;if(!id)return;
  if(!unit.skillState)throw Error('Missing active source skill mode');
  const p=data().profiles[id];
  if(p.capability==='ability-flow'){applyFlowMode(unit);return;}
  unit.skillState.sourceMode={version:1,profileId:id,modeIndex:p.modeIndex,...resolve(p,unit.skill.blackboard,unit)};
 }
 function validateFlow(flow,buffs,bb){
  if(flow?.kind!=='sequence'||flow.finishPolicy!=='all-children-complete'||flow.interruptionPolicy!=='cancel-remaining'||
   !Array.isArray(flow.stages)||flow.stages.length<2||flow.stages.length>16||!Array.isArray(buffs))throw Error('Invalid source sequence');
  const all=[];
  for(const n of flow.persistentBuffIndexes||[]){const b=buffs[n];
   if(!Number.isInteger(n)||!b||b.lifetime?.kind!=='until_detach'||b.on_attach||b.periodic||b.shield||b.flags||
    b.periodic_actions||b.derived_buffs||b.override_buff||!b.modifiers.length||
    b.modifiers.some(m=>!['atk','def','block_cnt','hp_recovery_per_sec_by_max_hp_ratio'].includes(m.attribute)))
    throw Error('Invalid flow persistent Buff');
   all.push(n);
  }
  if(flow.finalizer)root.ArkSkillEndEffects.validateFlow(flow.finalizer,bb,flow.stages.length);
  for(let i=0;i<flow.stages.length;i++){const s=flow.stages[i],c=s.completion;
   if(c?.kind==='animation-finished'){
    if(typeof s.id!=='string'||!s.id||!Array.isArray(s.buffIndexes)||s.buffIndexes.length||i===flow.stages.length-1||
     !(value(c.duration,bb)>0)||s.mode?.action!=='none'||s.mode.disarmed!==true||s.mode.modeIndex!==null||
     s.mode.plan!==null||s.mode.selector!==null||s.mode.channeling!==null||!Array.isArray(s.castingImmunities)||
     new Set(s.castingImmunities).size!==s.castingImmunities.length||s.castingImmunities.some(k=>!['stun','frozen','silence'].includes(k)))
     throw Error('Invalid flow animation preparation');
    continue;
   }
   if(typeof s.id!=='string'||!s.id||!Array.isArray(s.buffIndexes)||!s.buffIndexes.length||
    s.buffIndexes.some(n=>!Number.isInteger(n)||n<0||n>=buffs.length)||c?.kind!=='buffs-expired'||
    typeof c.checkEarlyFinish!=='boolean'||typeof c.waitForCasting!=='boolean'||typeof c.attackFinishEvent!=='boolean'||
    (i<flow.stages.length-1?!(c.checkEarlyFinish&&c.waitForCasting&&c.attackFinishEvent):
     c.checkEarlyFinish||c.waitForCasting||c.attackFinishEvent))throw Error('Invalid sequence child completion');
   for(const n of s.buffIndexes){const b=buffs[n];
    if(b.lifetime?.kind!=='timed'||!(value(b.lifetime.duration,bb)>0)||b.on_attach||b.shield||b.periodic||
     b.periodic_actions||b.derived_buffs||b.override_buff||b.flags||
     b.modifiers.some(m=>!['atk','def','magic_resistance','attack_speed','base_attack_time','block_cnt'].includes(m.attribute)))
     throw Error('Invalid sequence child Buff lifecycle');
    all.push(n);
   }
   resolve({...s.mode,activation:'cast',capability:'ability-flow'},bb);
  }
  if(all.length!==buffs.length||new Set(all).size!==buffs.length||new Set(flow.stages.map(s=>s.id)).size!==flow.stages.length)
   throw Error('Incomplete sequence Buff ownership');
  return true;
 }
 function flowStageDuration(program,stage,bb){return stage.completion.kind==='animation-finished'?value(stage.completion.duration,bb):
  Math.max(...stage.buffIndexes.map(n=>value(program.buffs[n].lifetime.duration,bb)));}
 function flowDuration(program,bb){validateFlow(program.flow,program.buffs,bb);
  return program.flow.stages.reduce((sum,s)=>sum+flowStageDuration(program,s,bb),0);
 }
 function flowProgram(unit){const p=data()?.profiles[unit.skill?.skillMode?.profileId];
  return p?.capability==='ability-flow'?data().programs[p.prefabId]:null;
 }
 function applyFlowMode(unit){const p=flowProgram(unit),state=unit.clientProgramState?.flow;
  if(!p||!state||!unit.skillState||state.finished)return;
  const stage=p.flow.stages[state.stageIndex];
  unit.skillState.sourceMode={version:1,profileId:unit.skill.sourceId,flowStage:state.stageIndex,
   modeIndex:stage.mode.modeIndex,...(stage.completion.kind==='animation-finished'?{action:'none',plan:null,disarmed:true}:
    resolve({...stage.mode,activation:'cast',capability:'ability-flow'},unit.skill.blackboard,unit))};
 }
 function enterFlowStage(unit,time){const p=flowProgram(unit),state=unit.clientProgramState.flow,stage=p.flow.stages[state.stageIndex];
  state.startedAt=time;
  if(stage.buffIndexes.length)root.ArkClientPrograms.activateFlowBuffs(unit,stage.buffIndexes,time);
  state.childUntil=time+flowStageDuration(p,stage,{duration:unit.skill.duration,...unit.skill.blackboard});
  if(p.flow.finalizer?.triggerStage===state.stageIndex)root.ArkSkillEndEffects.armFlow(unit,p.flow.finalizer,time);
  applyFlowMode(unit);
 }
 function startFlow(unit,time){const p=flowProgram(unit),state=unit.clientProgramState;
  if(!p||!state||state.flow||!unit.skillState||unit.dead)throw Error('Invalid sequence activation');
  state.flow={version:1,stageIndex:0,startedAt:time,completed:[],finished:false};
  if(p.flow.persistentBuffIndexes?.length)root.ArkClientPrograms.activateFlowBuffs(unit,p.flow.persistentBuffIndexes,time);
  enterFlowStage(unit,time);
  ensureFlowCursor(unit);
 }
 function flowHooks(unit){const p=flowProgram(unit),state=unit.clientProgramState.flow;
  return {enter(id,time){
   const index=p.flow.stages.findIndex(s=>s.id===id);
   // Current stage has already been activated before cursor construction.
   if(index===state.stageIndex)return;
   state.stageIndex=index;enterFlowStage(unit,time);
  },finish(id,time){const stage=p.flow.stages[state.stageIndex];
   state.completed.push({stageIndex:state.stageIndex,nodeId:id,at:time,attackFinishEvent:stage.completion.attackFinishEvent});
   if(state.stageIndex===p.flow.stages.length-1){state.finished=true;unit.skillState.until=time;
    for(const b of unit.clientProgramState.buffs)if(p.flow.persistentBuffIndexes?.includes(b.index))b.until=time;
   }
  }};
 }
 function ensureFlowCursor(unit){const p=flowProgram(unit),state=unit.clientProgramState.flow;
  if(state.cursor)return state.cursor;
  const bb={duration:unit.skill.duration,...unit.skill.blackboard};
  // Also upgrades a saved v1 Buff sequence at its current stage without
  // replaying any already attached Buff or completed stage.
  const children=p.flow.stages.slice(state.stageIndex).map((s,i)=>({id:s.id,kind:'leaf',duration:i===0?
   state.childUntil-state.startedAt:flowStageDuration(p,s,bb)}));
  const ids=new Set(children.map(c=>c.id));let id='flow-root';while(ids.has(id))id+='-';
  state.cursor=root.ArkAbilityFlow.start({id,kind:'sequence',children},state.startedAt,flowHooks(unit));
  return state.cursor;
 }
 function advanceFlow(unit,time){const p=flowProgram(unit),state=unit.clientProgramState?.flow;
  if(!p||!state||state.finished||!unit.skillState||unit.dead)return;
  const cursor=ensureFlowCursor(unit),stage=p.flow.stages[state.stageIndex],buffs=unit.clientProgramState.buffs.filter(b=>stage.buffIndexes.includes(b.index));
  if(stage.completion.checkEarlyFinish&&buffs.length)root.ArkAbilityFlow.shorten(cursor,stage.id,
   Math.max(state.startedAt,cursor.time,Math.min(state.childUntil,Math.max(...buffs.map(b=>b.until)))));
  root.ArkAbilityFlow.advance(cursor,time,flowHooks(unit));
 }
 function immune(unit,kind,time){const p=flowProgram(unit),state=unit.clientProgramState?.flow;
  return !!(p&&state&&!state.finished&&unit.skillState&&!unit.dead&&!unit.removed&&state.startedAt<=time&&state.childUntil>time&&
   p.flow.stages[state.stageIndex].castingImmunities?.includes(kind));
 }
 function active(unit){const id=unit.skill?.skillMode?.profileId,p=data()?.profiles[id];
  if(!unit.dead&&!unit.removed&&p?.activation==='passive')return {profileId:id,modeIndex:p.modeIndex,...resolve(p,unit.skill.blackboard,unit)};
  const m=unit.skillState?.sourceMode;return !unit.dead&&m&&m.profileId===id?m:null;}
 function action(unit){const kind=active(unit)?.action;return kind==='inherit'?undefined:kind;}
 function plan(unit,base){
  const m=active(unit);if(m?.action!=='attack')return base;
  const out={...base,...m.plan,skillId:m.profileId};
  // Admitted selectors have allowZeroBlockCntLimit=false. Native
  // LimitMaxNumToBlockCnt preserves at least one slot before applying the cap.
  if(out.blockCountLimit){const count=Math.max(1,operatorBlockCount(unit));out.targets=out.all?count:Math.min(out.targets,count);out.all=false;}
  return out;
 }
 function healing(unit){const m=active(unit);return m?.action==='heal'?{count:m.plan.targets,scale:m.plan.scale,...(m.plan.healTiming?{timing:m.plan.healTiming}:{})}:null;}
 function allows(plan,target){return plan.targets!==0&&(plan.hpMax==null||target.maxHp>0&&target.hp/target.maxHp<=plan.hpMax)&&
  (plan.hpMin==null||target.maxHp>0&&target.hp/target.maxHp>=plan.hpMin);}
 function priority(plan,target){if(plan.targetOrder==='defense-ascending')return -enemyDef(target);
  return plan.priorityTag&&Array.isArray(target.sourceTags)&&target.sourceTags.includes(plan.priorityTag)?1:0;}
 root.ArkSkillModes={configure,start,deployed,active,action,plan,healing,allows,priority,validateFlow,flowDuration,startFlow,advanceFlow,immune};
})(typeof window!=='undefined'?window:globalThis);
