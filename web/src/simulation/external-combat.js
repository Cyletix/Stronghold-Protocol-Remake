(function(root){
'use strict';
function profile(enemy){return root.ArkExternalCombatData?.enemies?.[enemy?.enemyId]||null;}
function modeProfile(enemy){
 if(enemy?.bossMechanics?.attack||enemy?.externalCombatMode==null)return undefined;
 if(!Number.isInteger(enemy.externalCombatMode)||enemy.externalCombatMode<0)return null;
 return profile(enemy)?.modes?.[enemy.externalCombatMode]||null;
}
function setMode(enemy,index){
 if(enemy?.bossMechanics?.attack||!Number.isInteger(index)||!profile(enemy)?.modes?.[index])return false;
 if(enemy.externalCombatMode===index)return true;
 const keepCast=(enemy.atkSchedule?.kind==='self-animation'||['selector-cooldown-area-melee','selector-sp-tagged-ranged','selector-sp-multi-melee'].includes(enemy.atkSchedule?.skillKind))&&
  enemy.atkSchedule.interruptOnDetach===false;
 if(!keepCast)root.ArkEnemySkills?.finish(enemy,enemy.atkSchedule,'mode-change');
 enemy.externalCombatMode=index;
 if(!keepCast){enemy.atkPhase=null;enemy.atkTimer=0;enemy.atkTarget=null;enemy.atkTargets=null;enemy.atkSchedule=null;}
 // The caller owns transition timing/cooldown policy. Retain existing cooldown
 // and already emitted projectiles; never synthesize an initial mode here.
 root.ArkEnemySkills?.configure(enemy);
 root.ArkEnemySkillLifecycle?.configure(enemy);
 root.ArkEnemyPeriodic?.configure(enemy);
 root.ArkEnemyHover?.configure(enemy);
 return true;
}
function configure(enemy){
 // Existing state includes restored checkpoints and an explicit caller choice.
 if(enemy?.externalCombatMode!=null)return false;
 const initial=profile(enemy)?.initialMode;
 return Number.isInteger(initial)?setMode(enemy,initial):false;
}
function dispatchModeEvent(enemy,provider,event){
 if(enemy?.dead||enemy?.bossMechanics?.attack||provider?.targetBinding?.binding!=='owner')return false;
 const commands=provider.events?.[event];
 if(!Array.isArray(commands))return false;
 // Validate the whole event before mutation, including data restored by a VM.
 // Never execute a known prefix of an unsupported action sequence.
 if(commands.some(command=>command.kind!=='switch-mode'||
   command.targetScope!==provider.targetBinding.scope||
   command.restartFSM!==false||!Number.isInteger(command.modeIndex)||
   !profile(enemy)?.modes?.[command.modeIndex]))return false;
 for(const command of commands)setMode(enemy,command.modeIndex);
 // The generic attack state is cancelled by detaching the old mode's action.
 // Native restartFSM also restarts the broader enemy state machine; this
 // restricted provider has restartFSM=false and does not claim that lifecycle.
 return true;
}
function providerBlackboard(enemy,provider){
 const config=provider.blackboard;
 if(!config)return null;
 const board={...config.defaults},prefix=config.namespace?config.namespace+'.':'';
 const keys=new Set([provider.condition.hpRatioBlackboardKey,provider.condition.delayBlackboardKey]);
 for(const buff of provider.buffs||[])for(const effect of buff.effects||[])
  if(effect.value?.key&&!Object.hasOwn(effect.value,'local'))keys.add(effect.value.key);
 const seen=new Set();
 for(const item of enemy.sourceTalentBlackboard||[]){
  if(!item.key?.startsWith(prefix))continue;
  const key=item.key.slice(prefix.length);
  if(!keys.has(key))continue;
  if(seen.has(key)||item.valueStr||!Number.isFinite(item.value))return null;
  seen.add(key);board[key]=item.value;
 }
 return board;
}
function passiveEffects(provider,board){
 const resolved=[];
 for(const buff of provider.buffs||[])for(const effect of buff.effects||[]){
  const source=effect.value,value=source?.local??board?.[source?.key]??source?.default;
  if(!Number.isFinite(value)||effect.kind==='damage-scale'&&value<0)return null;
  if(effect.kind==='attribute'&&effect.formula==='multiplier'&&['atk','def','magic_resistance'].includes(effect.stat))
   resolved.push({kind:effect.kind,stat:effect.stat,value});
  else if(effect.kind==='damage-scale')resolved.push({kind:effect.kind,value});
  else return null;
 }
 return resolved;
}
function attribute(enemy,stat,base){
 if(enemy?.bossMechanics?.attack)return base;
 let bonus=root.ArkEnemyPeriodic?.attributeBonus(enemy,stat)||0;
 for(const state of Object.values(enemy?.externalModeProviders||{}))if(state.active)
  for(const effect of state.effects||[])if(effect.kind==='attribute'&&effect.stat===stat)bonus+=effect.value;
 return bonus===0?base:Math.max(0,base*(1+bonus));
}
function outputDamageScale(enemy){
 if(enemy?.bossMechanics?.attack)return 1;
 let scale=1;
 for(const state of Object.values(enemy?.externalModeProviders||{}))if(state.active)
  for(const effect of state.effects||[])if(effect.kind==='damage-scale')scale*=effect.value;
 return scale;
}
function updateModeProviders(enemy,context){
 if(enemy?.dead||enemy?.bossMechanics?.attack)return;
 const data=profile(enemy),providers=data?.modeProviders;
 if(!providers?.length)return;
 if(enemy.externalCombatMode==null)configure(enemy);
 if(!modeProfile(enemy))return;
 for(const provider of providers){
  const condition=provider.condition;
  let matches,effects=[];
  if(provider.kind==='hp-ratio-toggle-mode'){
   const board=providerBlackboard(enemy,provider);
   if(!board||condition.toggleOnce||condition.setInitialToggle||
     (board[condition.delayBlackboardKey]??condition.restoreDelay)!==0||
     !(enemy.hp>0)||!(enemy.maxHp>0))continue;
   let min=condition.minHpRatio,max=condition.maxHpRatio;
   const bound=board[condition.hpRatioBlackboardKey];
   if(bound!=null){if(condition.loadMinFromBlackboard)min=bound;else max=bound;}
   if(!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(condition.comparisonEpsilon))continue;
   const ratio=enemy.hp/enemy.maxHp,epsilon=condition.comparisonEpsilon;
   matches=ratio>min-epsilon&&(condition.useLTForMax?ratio<max-epsilon:ratio<max+epsilon);
   effects=passiveEffects(provider,board);if(!effects)continue;
  }else if(provider.kind==='blocked-toggle-mode'){
  // Enemy.get_isInCombat contributes 0/1. LoadData reads 'cnt' into min
  // or max; it does not read the blocking operator's capacity.
  if(condition.countBlackboardKey!=='cnt'||!Number.isInteger(condition.minCount)||
    !Number.isInteger(condition.maxCount)||typeof condition.useBlockAsMin!=='boolean')continue;
  let min=condition.minCount,max=condition.maxCount;
  const entries=(enemy.sourceTalentBlackboard||[]).filter(item=>item.key===condition.countBlackboardKey);
  if(entries.length>1||entries.length===1&&!Number.isInteger(entries[0].value))continue;
  if(entries.length){if(condition.useBlockAsMin)min=entries[0].value;else max=entries[0].value;}
  const count=Number(!!context?.blocked);matches=count>=min&&(max<0||count<=max);
  }else continue;
  const enabled=!(provider.silenceable&&context?.silenced);
  const active=enabled&&(condition.inverse?!matches:matches);
  const states=enemy.externalModeProviders||(enemy.externalModeProviders={});
  const state=states[provider.id]||(states[provider.id]={active:provider.initialActive});
  if(state.active===active)continue;
  if(dispatchModeEvent(enemy,provider,active?'ON_BUFF_START':'ON_BUFF_FINISH')){
   state.active=active;
   if(provider.buffs)state.effects=active?effects:[];
  }
 }
}
function selectedAttack(enemy,channel){
 const data=profile(enemy),mode=modeProfile(enemy);
 const selected=mode!==undefined?mode?.channels?.[channel]:!enemy?.bossMechanics?.attack&&channel&&data?.channels?.[channel];
 return {data,mode,selected,projectile:selected?.projectile??(mode===undefined?data?.projectile:null)};
}
function canAttack(enemy,context){
 const selection=selectedAttack(enemy,context?.channel);
 // A compiled empty source action has no damage event. A generic encounter
 // canAttack=true must not turn that mode into the legacy one-damage fallback.
 if(selection.mode?.sourceNoBasicAttack===true||root.ArkEnemySkillLifecycle?.disarmed(enemy))return false;
 const channels=selection.mode?.channels??(selection.mode===undefined?selection.data?.channels:null);
 // A missing ranged channel stays absent after a ground-mode transition,
 // even when the encounter's general canAttack flag is true.
 if(context?.channel&&channels&&Object.hasOwn(channels,context.channel)&&channels[context.channel]===null)return false;
 const contracts=!context?.channel&&channels?
  Object.values(channels).filter(Boolean).map(channel=>channel.projectile??(selection.mode===undefined?selection.data?.projectile:null)):[selection.projectile];
 // Validate the contract of the selected mode/channel. An invalid chain must
 // not fall through to the legacy one-target projectile path.
 if(!enemy?.bossMechanics?.attack&&contracts.length&&contracts.every(contract=>contract?.kind==='chain'&&!chainProjectile(enemy,contract)))return false;
 // Level/encounter overrides and dedicated executors retain ownership. Never
 // write a permanent flag: a later mode or skill can change the explicit value.
 if(typeof enemy?.canAttack==='boolean')return enemy.canAttack;
 if(enemy?.applyWay==='NONE')return false;
 const mode=modeProfile(enemy);
 if(mode!==undefined){
  if(!mode)return false;
  if(context?.channel)return !!mode.channels[context.channel];
  return Object.values(mode.channels).some(Boolean);
 }
 if(enemy?.applyWay!=null)return enemy.applyWay!=='NONE';
 if(enemy?.bossMechanics?.attack)return true;
 return root.ArkExternalCombatData?.attackCapabilities?.[enemy?.enemyId]?.applyWay!=='NONE';
}
function attackTiming(enemy,interval,context){
 const channel=context?.channel,{data,mode,selected,projectile}=selectedAttack(enemy,channel);
 const chain=projectile?.kind==='chain'?chainProjectile(enemy,projectile):null;
 if(!enemy?.bossMechanics?.attack&&projectile?.kind==='chain'&&!chain)return null;
 const delivery=selected?{channel,delivery:selected.delivery,projectileSpeed:selected.projectile?.speed,
  ...(mode?{modeIndex:mode.modeIndex,atkScale:selected.atkScale,
   damageType:selected.damageType==='dynamic'?(enemy.atkType||'phys'):selected.damageType}:{})}:
  !enemy?.bossMechanics?.attack&&mode===undefined&&['direct','projectile'].includes(data?.delivery)?
   {delivery:data.delivery,projectileSpeed:data.projectile?.speed}:{};
 if(chain)Object.assign(delivery,{delivery:'projectile',projectileSpeed:chain.speed,projectileContract:chain,
  ...(chain.damageType?{damageType:chain.damageType}:{})});
 const custom=enemy?.attackTiming;
 if(custom&&Number.isFinite(custom.windup)&&Number.isFinite(custom.recovery))
  return {windup:Math.max(0,custom.windup),strike:Math.max(0,custom.strike||0),recovery:Math.max(0,custom.recovery),source:'override',...delivery};
 // The dedicated Boss executor keeps its existing casting/impact schedule.
 if(enemy?.bossMechanics?.attack)return null;
 if(data?.preAttack)return root.ArkEnemyPreAttack?.schedule(enemy,interval,context)??null;
 if(mode!==undefined&&!selected)return null;
 const timing=(selected||data)?.timing;
 return timingSchedule(timing,interval,delivery);
}
function timingSchedule(timing,interval,delivery={}){
 if(!timing||!(interval>0)||!(timing.duration>0))return null;
 // Animation occupancy and attack cooldown are different clocks. A capped
 // source animation can finish before the next attack, allowing route movement.
 const playback=timing.playback;
 let total=interval,source='community-proportional-onattack-v1';
 if(playback){
  if(playback.rule!=='native-attack-time-capped-animation'||playback.timeMode!==0||
   playback.minScale!==.1||!Number.isFinite(playback.maxScale)||
   !(playback.maxScale===-1||playback.maxScale>=playback.minScale))return null;
  total=timing.duration*animationTimeScale(timing.duration,interval,playback.minScale,playback.maxScale);
  source=playback.rule;
 }
 const windup=total*Math.max(0,Math.min(1,timing.hit/timing.duration));
 const packet=Number.isFinite(timing.atkScale)&&timing.atkScale>0?{atkScale:timing.atkScale}:{};
 if(timing.hits?.length>1){
  const hitOffsets=timing.hits.map(t=>total*t/timing.duration),last=hitOffsets[hitOffsets.length-1];
  return {windup,strike:last-windup,recovery:Math.max(0,total-last),source,
   hitOffsets,nextHit:0,elapsed:0,total,...packet,...delivery};
 }
 return {windup,strike:0,recovery:Math.max(0,total-windup),total,source,...packet,...delivery};
}
function animationTimeScale(raw,interval,minScale,maxScale){
 const lower=Math.max(interval/raw,minScale);
 return maxScale<0?lower:Math.min(lower,maxScale);
}
function actionTiming(action,interval){
 if(!action||!Number.isFinite(action.atkScale)||action.atkScale<=0||!['phys','arts','true'].includes(action.damageType))return null;
 if(action.timeMode===0){
  const timing=action.timing,raw=timing?.duration,hits=timing?.hits||[timing?.hit];
  if(!(interval>0)||!Number.isFinite(interval)||!(raw>0)||!Number.isFinite(raw)||
   ![1,-1].includes(action.maxAnimScale)||action.minAnimScale!==.1||!hits.length||hits.some((t,i)=>!Number.isFinite(t)||t<0||t>raw||i>0&&t<hits[i-1]))return null;
  // Native FROM_ATTACK_SPEED uses the owner's attack interval, with the
  // source maxAnimScale cap. Long basic intervals must not stretch this cast.
  const scale=animationTimeScale(raw,interval,action.minAnimScale,action.maxAnimScale);
  let total=raw*scale,hitOffsets=hits.map(t=>t*scale);
  if(action.repeat){
   const repeat=action.repeat;
   if(hits.length!==1||!Number.isInteger(repeat.count)||repeat.count<2||repeat.count>64||
    !Number.isFinite(repeat.interval)||repeat.interval<=0||repeat.clock!=='cast-clock')return null;
   // First output follows the source animation event. Later outputs use the
   // frozen fixed-delta bridge; do not invent extra animation events or split damage.
   hitOffsets=Array.from({length:repeat.count},(_,i)=>hitOffsets[0]+i*repeat.interval);
   total=Math.max(total,hitOffsets[hitOffsets.length-1]);
  }
  return {windup:hitOffsets[0],strike:0,recovery:total-hitOffsets[hitOffsets.length-1],
   hitOffsets,nextHit:0,elapsed:0,total,source:'native-attack-time-capped-animation',
   atkScale:action.atkScale,damageType:action.damageType,delivery:action.delivery,
   ...(action.projectile?{projectileSpeed:action.projectile.speed,projectileLifeTime:action.projectile.lifeTime,
    projectileContract:{...action.projectile}}: {})};
 }
 return timingSchedule(action.timing,interval,{delivery:action.delivery,projectileSpeed:action.projectile?.speed,
  atkScale:action.atkScale,damageType:action.damageType});
}
function chainProjectile(enemy,contract){
 if(contract?.kind!=='chain')return null;
 const lifecycle=contract.lifecycle;
 if(lifecycle?.waitForProjectileInvalid!==true||lifecycle.finishWhenInvalid!==false||
   lifecycle.waitForAnimEnd!==false||lifecycle.minPostDelay!==0)return null;
 const chain={...contract.chain},element=contract.element?{...contract.element}:null;
 const board=new Map();
 for(const item of enemy.sourceTalentBlackboard||[]){
  if(!Object.values(contract.sourceKeys||{}).includes(item.key))continue;
  if(board.has(item.key)||item.valueStr||!Number.isFinite(item.value))return null;
  board.set(item.key,item.value);
 }
 for(const [field,key]of Object.entries(contract.sourceKeys||{}))if(board.has(key)){
  if(field==='epRatio'&&element)element.ratio=board.get(key);else chain[field]=board.get(key);
 }
 if(!Number.isInteger(chain.maxTargets)||chain.maxTargets<1||chain.maxTargets>64||!Number.isFinite(chain.radius)||chain.radius<=0||
   !Number.isFinite(chain.decay)||chain.decay<0||chain.decay>1||chain.allowRepeat!==false||chain.interval!==0||
   !Number.isFinite(contract.speed)||contract.speed<=0||!Number.isFinite(contract.lifeTime)||contract.lifeTime<=0||
   !['phys','arts','true'].includes(contract.damageType)||
   element&&(!['nervous','erosion','burn','apoptosis','rampage'].includes(element.type)||
     !(element.ratio>=0)||!Number.isFinite(element.ratio)))return null;
 return {...contract,chain,element};
}
function projectileSpeed(enemy,fallback){
 if(Number.isFinite(enemy?.basicProjectileSpeed)&&enemy.basicProjectileSpeed>0)return enemy.basicProjectileSpeed;
 if(enemy?.bossMechanics?.attack)return fallback;
 const data=profile(enemy),schedule=enemy?.atkSchedule;
 const speed=schedule?.projectileSpeed??(data?.channels?.[schedule?.channel]||data)?.projectile?.speed;
 return Number.isFinite(speed)&&speed>0?speed:fallback;
}
root.ArkExternalCombat={profile,modeProfile,setMode,configure,dispatchModeEvent,updateModeProviders,attribute,outputDamageScale,canAttack,attackTiming,actionTiming,projectileSpeed,chainProjectile};
})(typeof globalThis!=='undefined'?globalThis:this);
