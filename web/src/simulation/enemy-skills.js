// Source EnemySkill contracts. Timers/SP and casts use plain checkpoint data.
(function(root){
'use strict';
const finite=Number.isFinite;
const AREA_MELEE='selector-cooldown-area-melee';
const TAGGED_RANGED='selector-sp-tagged-ranged';
const MULTI_MELEE='selector-sp-multi-melee';
function profiles(enemy){
 if(enemy?.bossMechanics?.attack||enemy?.bombAttack)return [];
 return root.ArkExternalCombat?.profile(enemy)?.skills||[];
}
function parameters(enemy,skill){
 let source=skill;
 if(Object.hasOwn(enemy,'sourceSkills')&&!Array.isArray(enemy.sourceSkills))return null;
 if(Array.isArray(enemy.sourceSkills)){
  const matches=enemy.sourceSkills.filter(row=>row?.prefabKey===skill.skillKey);
  if(matches.length!==1)return null;
  source=matches[0];
 }
 const board={},input=source.blackboard??skill.blackboard??{};
 const entries=Array.isArray(input)?input:Object.entries(input).map(([key,value])=>({key,value}));
 const self=skill.kind==='always-self-cast',area=skill.kind===AREA_MELEE,tagged=skill.kind===TAGGED_RANGED,multi=skill.kind===MULTI_MELEE;
 const allowed=new Set(self?[]:[area?skill.selector?.range?.radius?.key:skill.selector?.maxTargets?.key,skill.action?.atkScaleKey||'atk_scale']);
 if(tagged)for(const effect of skill.action?.activeBuffs||[])allowed.add(effect.duration?.key);
 if(multi){allowed.delete(null);allowed.add(skill.action?.repeat?.key);allowed.add(skill.action?.castBuff?.key);}
 for(const item of entries){
  if(!allowed.has(item.key)||Object.hasOwn(board,item.key)||item.valueStr||!finite(item.value))return null;
  board[item.key]=item.value;
 }
 // This complete range contract has an explicit source skill radius. The
 // native missing-key fallback is owner mode range, not collider radius or a
 // stale imported skill value; that separate fallback is not compiled here.
 if(area&&Array.isArray(enemy.sourceSkills)&&!Object.hasOwn(board,skill.selector?.range?.radius?.key))return null;
 if(tagged&&Array.isArray(enemy.sourceSkills)&&(skill.action?.activeBuffs||[]).some(effect=>!Object.hasOwn(board,effect.duration?.key)))return null;
 if(multi&&Array.isArray(enemy.sourceSkills)&&!Object.hasOwn(board,skill.action?.castBuff?.key))return null;
 if(self){
  const value={priority:source.priority??skill.priority,spCost:source.spCost??skill.spCost,
   cooldown:source.cooldown??skill.cooldown,initCooldown:source.initCooldown??skill.initCooldown,
   duration:skill.action?.duration};
  return Number.isFinite(value.priority)&&value.spCost===0&&value.cooldown===0&&value.initCooldown===0&&
   Number.isFinite(value.duration)&&value.duration>0?value:null;
 }
 const value={priority:source.priority??skill.priority,spCost:source.spCost??skill.spCost,
  cooldown:source.cooldown??skill.cooldown,initCooldown:source.initCooldown??skill.initCooldown,
  ...(area?{radius:board[skill.selector?.range?.radius?.key]??skill.selector?.range?.radius?.default}:
   {maxTargets:board[skill.selector?.maxTargets?.key]??skill.selector?.maxTargets?.default}),
  atkScale:board[skill.action?.atkScaleKey||'atk_scale']??skill.action?.atkScale};
 if(!finite(value.priority)||!Number.isInteger(value.spCost)||value.spCost<0||!finite(value.cooldown)||value.cooldown<0||
  !finite(value.initCooldown)||value.initCooldown<0||
  (area?value.spCost!==0||!finite(value.radius)||value.radius<=0:
   !Number.isInteger(value.maxTargets)||value.maxTargets<1||value.maxTargets>64)||
  !finite(value.atkScale)||value.atkScale<=0)return null;
 if(tagged){
  value.activeBuffs=(skill.action?.activeBuffs||[]).map(effect=>({...effect,
   duration:board[effect.duration?.key]??effect.duration?.default}));
  if(!value.activeBuffs.length||value.activeBuffs.some(effect=>effect.kind!=='stun'||!finite(effect.duration)||effect.duration<0||
   typeof effect.isDamageMissable!=='boolean'||typeof effect.statusResistible!=='boolean'))return null;
 }
 if(multi){
  value.repeat={...skill.action.repeat,count:board[skill.action.repeat.key]??skill.action.repeat.default};
  value.castBuff={...skill.action.castBuff,value:board[skill.action.castBuff.key]??skill.action.castBuff.default};
  if(!Number.isInteger(value.repeat.count)||value.repeat.count<2||value.repeat.count>64||
   value.castBuff.kind!=='def-penetrate'||value.castBuff.scope!=='casting'||
   !finite(value.castBuff.value)||value.castBuff.value<0||value.castBuff.value>1)return null;
 }
 return value;
}
function validTarget(target,time){
 return target&&!target.dead&&target.hp>0&&!target.removed&&!target.untargetable&&!target.targetFree&&
  target.col!=null&&target.row!=null&&(target.deployAt??0)<=time&&(target.deployT||0)>=1&&
  !(target.invisibleUntil>time)&&!(target.camouflageUntil>time);
}
function circleTargets(enemy,radius,context){
 return (context.candidates||[]).filter(target=>validTarget(target,context.time)&&
  Math.hypot(enemy.x-target.col,enemy.y-target.row)<=radius+1e-9);
}
function targets(enemy,skill,params,context){
 if(skill.kind===AREA_MELEE)return circleTargets(enemy,params.radius,context);
 if(skill.kind===MULTI_MELEE)return skill.selector.kind==='input-blocker'&&
  validTarget(context.blocker,context.time)&&context.candidates?.includes(context.blocker)?[context.blocker]:[];
 const time=context.time,pool=context.candidates||[],blocker=context.blocker;
 const valid=target=>validTarget(target,time);
 const tagged=skill.kind===TAGGED_RANGED;
 const range=Math.max(0,enemy.rangeRadius??(tagged?skill.selector.range?.default:0)??0)+(tagged?0:.5);
 const available=pool.filter(target=>valid(target)&&
  (!tagged||!target.flying&&!(skill.selector.excludeTags||[]).some(tag=>Array.isArray(target.sourceTags)&&target.sourceTags.includes(tag)))&&
  (!tagged&&target===blocker||Math.hypot(enemy.x-target.col,enemy.y-target.row)<=range));
 // Exact selector ordering is recorded with the source contract. Deployment
 // order breaks equal hatred in this model; never depend on array sort quirks.
 const hatred=target=>root.ArkClientPrograms?.targetPriority?.(target,time)??target.tauntLevel??target.sourceAttributes?.tauntLevel??0;
 return available.map((target,index)=>({target,index})).sort((a,b)=>
  (!tagged?(Number(b.target===blocker)-Number(a.target===blocker)):0)||hatred(b.target)-hatred(a.target)||
  (b.target.deployAt??0)-(a.target.deployAt??0)||b.index-a.index)
  .slice(0,params.maxTargets).map(row=>row.target);
}
function configure(enemy){
 const skills=profiles(enemy),data=root.ArkExternalCombat?.profile(enemy),sp=data?.skillSp;
 if(!skills.length||!root.ArkExternalCombat.modeProfile(enemy))return null;
 if(sp?(!finite(sp.initialSp)||!finite(sp.maxSp)||sp.initialSp<0||sp.maxSp<sp.initialSp||!finite(sp.regenPerSecond)||sp.regenPerSecond<0||
  sp.sharedAcrossModes!==true||sp.spend!=='cast-start'):skills.some(skill=>!['always-self-cast',AREA_MELEE].includes(skill.kind)||skill.spCost!==0))return null;
 let state=enemy.externalSkills;
 if(!state)state=enemy.externalSkills={version:1,modeIndex:enemy.externalCombatMode,sp:sp?.initialSp??0,skills:{}};
 if(state.version!==1||!finite(state.sp)||state.sp<0||!state.skills)return null;
 state.modeIndex=enemy.externalCombatMode;
 for(const skill of skills){
  const params=parameters(enemy,skill);
  if(params&&!state.skills[skill.id])state.skills[skill.id]={cooldown:params.initCooldown,casts:0};
 }
 return state;
}
function recoveryStopped(enemy,sp){
 return !!enemy.spRecoveryStopped||!!(sp?.stopRecoveryWhileCasting&&enemy.atkSchedule?.skillId&&!enemy.atkSchedule.skillFinished);
}
function tick(enemy,dt,context){
 if(enemy.dead)return;
 const state=configure(enemy);if(!state||!finite(dt)||dt<0)return;
 const sp=root.ArkExternalCombat.profile(enemy).skillSp;
 // A literal zero stays zero. Buff charging is an independent explicit event.
 if(sp&&!context?.spRecoveryStopped&&!recoveryStopped(enemy,sp))state.sp=Math.min(sp.maxSp,state.sp+sp.regenPerSecond*dt);
 for(const skill of profiles(enemy))if(skill.modeIndices.includes(enemy.externalCombatMode)){
  const slot=state.skills[skill.id];
  if(slot&&finite(slot.cooldown))slot.cooldown=Math.max(0,slot.cooldown-dt);
 }
}
function onSpellOn(enemy,schedule){
 const state=configure(enemy),sp=root.ArkExternalCombat?.profile(enemy)?.skillSp;
 if(!state||enemy.dead||!schedule||schedule.skillId||schedule.enemySpCharged||
  schedule.modeIndex!==enemy.externalCombatMode||!['combat','attack'].includes(schedule.channel))return false;
 const charge=sp?.basicAttackGain;
 if(charge?.event!=='ON_SPELL_ON'||charge.scope!=='source-normal-ability-siblings'||
  charge.force!==true||charge.checkSpType!==false||!charge.channels?.includes(schedule.channel)||
  !charge.modeIndices?.includes(schedule.modeIndex)||!finite(charge.amount)||charge.amount<0)return false;
 if(!profiles(enemy).some(skill=>skill.modeIndices.includes(schedule.modeIndex)))return false;
 // One source spell-on per ordinary ability, independent of target count,
 // projectile arrival and damage. The source Buff is not attached to the skill.
 schedule.enemySpCharged=true;state.sp=Math.min(sp.maxSp,state.sp+charge.amount);return true;
}
function onOutputAttackOrHeal(enemy,schedule){
 const state=configure(enemy),sp=root.ArkExternalCombat?.profile(enemy)?.skillSp,charge=sp?.attackRecovery;
 if(!state||enemy.dead||!schedule||schedule.outputAttackOrHealDispatched||
  charge?.event!=='output-attack-or-heal'||sp.sourceSpType!=='INCREASE_WHEN_ATTACK'||charge.force!==false||
  !charge.channels?.includes(schedule.channel)||!charge.modeIndices?.includes(schedule.modeIndex)||
  !finite(charge.amount)||charge.amount<0)return false;
 // AbilityStandard emits this event only for spellCnt==0 after successful
 // output. Mark it before the stop gate: a blocked event cannot recover later.
 schedule.outputAttackOrHealDispatched=true;
 if(recoveryStopped(enemy,sp))return false;
 state.sp=Math.min(sp.maxSp,state.sp+charge.amount);return true;
}
function start(enemy,context){
 const state=configure(enemy);
 if(!state||enemy.dead||enemy.atkPhase||context?.canCast===false||root.ArkEnemySkillLifecycle?.disarmed(enemy))return null;
 const ready=[];
 for(const skill of profiles(enemy)){
  if(!['selector-sp-ranged',AREA_MELEE,TAGGED_RANGED,MULTI_MELEE].includes(skill.kind)||!skill.modeIndices.includes(enemy.externalCombatMode)||
   skill.kind==='selector-sp-ranged'&&context.normalAttackReady===false)continue;
  if(skill.cooldownStarts!=='cast-start'||skill.kind===AREA_MELEE&&skill.selector?.includeTargetPolicy!=='replace-last-if-absent')continue;
  const params=parameters(enemy,skill),slot=state.skills[skill.id];
  if(!params||!slot||!finite(slot.cooldown)||slot.cooldown>1e-9||state.sp+1e-9<params.spCost||
   context.silenced&&!skill.flags.ignoreSilence)continue;
  const selected=targets(enemy,skill,params,context);
  if(selected.length<skill.trigger.minTargets)continue;
  const interval=skill.action.timeMode===0?(context.skillAttackInterval??context.interval):context.interval;
  const schedule=root.ArkExternalCombat.actionTiming({...skill.action,atkScale:params.atkScale,
   ...(params.repeat?{repeat:params.repeat}:{})},interval);
  if(!schedule)continue;
  ready.push({skill,params,slot,selected,schedule});
 }
 if(!ready.length)return null;
 // Stable source order resolves equal priorities in this supported subset.
 ready.sort((a,b)=>b.params.priority-a.params.priority);
 const chosen=ready[0],{skill,params,slot,schedule}=chosen;
 state.sp=Math.max(0,state.sp-params.spCost);slot.casts++;
 // The shared native EnemySkill success path advances PeriodicTimer now.
 schedule.skillId=skill.id;schedule.skillKey=skill.skillKey;schedule.modeIndex=enemy.externalCombatMode;
 schedule.channel=context.channel;schedule.skillCooldown=params.cooldown;
 slot.cooldown=params.cooldown;schedule.skillCooldownStarts=skill.cooldownStarts;
 if(skill.kind===AREA_MELEE||skill.kind===TAGGED_RANGED||skill.kind===MULTI_MELEE){
  schedule.skillKind=skill.kind;schedule.interruptOnDetach=skill.action.interruptOnDetach;
  schedule.affectedBySlowDown=skill.action.affectedBySlowDown;
 }
 if(skill.kind===TAGGED_RANGED)schedule.activeBuffs=params.activeBuffs;
 if(skill.kind===MULTI_MELEE){
  schedule.castBuff={...params.castBuff};schedule.finalHitEffect={...skill.action.finalHitEffect};
 }
 if(skill.kind===AREA_MELEE){
  schedule.areaSelection={radius:params.radius,alwaysIncludeTarget:skill.action.alwaysIncludeTarget,
   includeTargetPolicy:skill.selector.includeTargetPolicy};
 }
 schedule.castSequence=state.castSequence=(state.castSequence||0)+1;
 return {schedule,targets:skill.kind===AREA_MELEE?chosen.selected.slice(0,1):chosen.selected};
}
function hitTargets(enemy,context){
 const schedule=enemy.atkSchedule;
 if(schedule?.skillKind!==AREA_MELEE)return null;
 const selection=schedule.areaSelection;
 if(!selection||!finite(selection.radius)||selection.radius<=0)return [];
 const selected=circleTargets(enemy,selection.radius,context),input=enemy.atkTarget;
 // AbilityStandard preserves a live input without rechecking the selector.
 // When absent from a nonempty result it replaces the last selected target.
 if(selection.alwaysIncludeTarget&&input&&!input.dead&&input.hp>0&&!input.removed&&
  context.candidates?.includes(input)&&!selected.includes(input)){
  if(selection.includeTargetPolicy!=='replace-last-if-absent')return [];
  if(selected.length)selected.pop();selected.push(input);
 }
 return selected;
}
function projectilePacket(schedule){
 if(schedule?.skillKind!==TAGGED_RANGED)return null;
 return {skillId:schedule.skillId,modeIndex:schedule.modeIndex,castSequence:schedule.castSequence,
  projectile:{...schedule.projectileContract},
  activeBuffs:JSON.parse(JSON.stringify(schedule.activeBuffs))};
}
function defensePenetration(enemy,schedule){
 if(enemy.dead||enemy.hp<=0||schedule?.skillKind!==MULTI_MELEE||schedule.skillFinished)return 0;
 const buff=schedule.castBuff;
 return buff?.kind==='def-penetrate'&&buff.scope==='casting'&&finite(buff.value)?Math.max(0,Math.min(1,buff.value)):0;
}
function finalHitEffect(schedule){
 return schedule?.skillKind===MULTI_MELEE&&!schedule.skillFinished&&schedule.nextHit===schedule.hitOffsets?.length?
  schedule.finalHitEffect:null;
}
function applyProjectileBuffs(packet,target,time,missed){
 if(!packet?.skillId||!target||target.dead||target.hp<=0||target.removed||target.untargetable)return false;
 const effects=packet.activeBuffs;
 if(!Array.isArray(effects)||effects.some(effect=>effect.kind!=='stun'||!finite(effect.duration)||effect.duration<0||
  typeof effect.isDamageMissable!=='boolean'||typeof effect.statusResistible!=='boolean'))return false;
 for(const effect of effects){
  if(missed&&effect.isDamageMissable||target.stunImmune||target.sourceAttributes?.stunImmune||root.ArkSkillModes?.immune(target,'stun',time))continue;
  const resistance=effect.statusResistible?Math.max(0,Math.min(1,root.ArkSkillAuras?.statusResistance?.(target,time)??target.statusResistance??0)):0;
  const duration=effect.duration*(1-resistance);
  if(duration>0)target.stunUntil=Math.max(target.stunUntil||0,time+duration);
 }
 return true;
}
function selfEventsValid(enemy,skill){
 const events=skill.events;
 return events&&Object.keys(events).every(key=>['ON_CAST_START','ON_CAST_END'].includes(key))&&
  Array.isArray(events.ON_CAST_START)&&events.ON_CAST_START.length===1&&
  events.ON_CAST_START[0].kind==='add-managed-mark'&&events.ON_CAST_START[0].buffKey===root.ArkEnemySkillLifecycle?.profile(enemy)?.awakeMark&&
  Array.isArray(events.ON_CAST_END)&&events.ON_CAST_END.length===1&&
  events.ON_CAST_END[0].kind==='switch-mode'&&events.ON_CAST_END[0].restartFSM===false&&
  Number.isInteger(events.ON_CAST_END[0].modeIndex)&&
  !!root.ArkExternalCombat.profile(enemy)?.modes?.[events.ON_CAST_END[0].modeIndex];
}
function triggerNamed(enemy,key,command,context){
 const state=configure(enemy);if(!state||enemy.dead||!(enemy.hp>0))return null;
 // This entry point implements the source's explicit force-to-owner command.
 // Other flag combinations remain unsupported instead of becoming auto casts.
 if(!command||command.checkSkillActive!==false||command.checkSkillReady!==false||command.interruptCurAbility!==true||
  command.interruptCurAbilityUnlessItIsExpectedAbility!==false||command.assignCombatAbility!==false||
  command.forceFindTargetBySkillSelector!==false||command.clearPalsyingBuffBeforeTrigger!==true||
  command.tryCastDirectlyWhenNoTarget!==false||command.target!=='owner')return null;
 const matches=profiles(enemy).filter(skill=>skill.skillKey===key&&skill.kind==='always-self-cast'&&
  skill.trigger?.kind==='source-listener'&&skill.modeIndices.includes(enemy.externalCombatMode));
 if(matches.length!==1)return null;
 const skill=matches[0],params=parameters(enemy,skill),slot=state.skills[skill.id];
 if(!params||!slot||!selfEventsValid(enemy,skill)||
  !root.ArkEnemySkillLifecycle.configure(enemy)||
  root.ArkEnemySkillLifecycle.hasMark(enemy,skill.events.ON_CAST_START[0].buffKey))return null;
 // The verified caller checks its persistent mark before forcing a cast. It
 // bypasses readiness; no automatic AlwaysTrigger is synthesized from the name.
 finish(enemy,enemy.atkSchedule,'interrupted');
 const schedule={kind:'self-animation',skillId:skill.id,skillKey:key,modeIndex:enemy.externalCombatMode,
  channel:context?.channel||'combat',source:'native-time-mode-animation-duration',
  animation:skill.action.animation,target:'owner',elapsed:0,total:params.duration,windup:params.duration,strike:0,recovery:0,
  interruptOnDetach:skill.action.interruptOnDetach,
  affectedBySlowDown:skill.action.affectedBySlowDown,skillCooldown:params.cooldown,
  castSequence:state.castSequence=(state.castSequence||0)+1};
 if(!root.ArkEnemySkillLifecycle.addMark(enemy,skill.events.ON_CAST_START[0].buffKey))return null;
 slot.casts++;
 // The recipient is the owner argument used by the event interpreter. Keep a
 // plain descriptor, not enemy.atkTarget=enemy, which makes JSON saves cyclic.
 return {schedule,targets:[]};
}
function advanceSelf(enemy,dt){
 const schedule=enemy.atkSchedule;
 if(schedule?.kind!=='self-animation'||!finite(dt)||dt<0)return false;
 schedule.elapsed+=dt;enemy.atkTimer=Math.max(0,schedule.total-schedule.elapsed);
 if(schedule.elapsed+1e-9>=schedule.total){
  finish(enemy,schedule);
  if(enemy.atkSchedule===schedule){enemy.atkPhase=null;enemy.atkTimer=0;enemy.atkSchedule=null;enemy.atkTarget=null;enemy.atkTargets=null;}
 }
 return true;
}
function finish(enemy,schedule,reason='complete'){
 if(!schedule?.skillId)return;
 const state=enemy.externalSkills,slot=state?.skills?.[schedule.skillId];
 if(!slot||schedule.skillFinished)return;
 schedule.skillFinished=true;
 if(schedule.castBuff)delete schedule.castBuff;
 if(schedule.skillCooldownStarts!=='cast-start')slot.cooldown=Math.max(0,schedule.skillCooldown||0);
 if(schedule.kind==='self-animation'&&reason==='complete'&&!enemy.dead&&enemy.hp>0){
  const skill=profiles(enemy).find(skill=>skill.id===schedule.skillId);
  if(skill&&selfEventsValid(enemy,skill))for(const command of skill.events.ON_CAST_END)
   root.ArkExternalCombat.setMode(enemy,command.modeIndex);
 }
}
function ownsLegacy(enemy,legacy){
 const key=legacy?.prefabKey??legacy?.sourceId;
 return !!key&&profiles(enemy).some(skill=>skill.skillKey===key);
}
root.ArkEnemySkills={profiles,parameters,validTarget,targets,hitTargets,projectilePacket,applyProjectileBuffs,defensePenetration,finalHitEffect,configure,tick,onSpellOn,onOutputAttackOrHeal,start,triggerNamed,advanceSelf,finish,ownsLegacy};
})(typeof globalThis!=='undefined'?globalThis:this);
