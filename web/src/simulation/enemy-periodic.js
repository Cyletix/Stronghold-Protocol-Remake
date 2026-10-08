// Mode-owned periodic Buffs and direct named abilities. State stays plain data.
(function(root){
'use strict';
function profile(enemy){
 if(enemy?.bossMechanics?.attack||enemy?.bombAttack)return null;
 return root.ArkExternalCombat?.profile(enemy)?.periodicAbilities||null;
}
function resolve(enemy){
 const data=profile(enemy);if(data?.kind!=='mode-periodic-ability-group')return null;
 const board=new Map(),keys=new Set();
 const collect=value=>{if(value&&typeof value==='object'){
  if(typeof value.key==='string'&&Object.hasOwn(value,'default'))keys.add(value.key);
  for(const child of Object.values(value))collect(child);
 }};collect(data);
 for(const row of enemy.sourceTalentBlackboard||[]){
  if(!keys.has(row.key))continue;
  if(board.has(row.key)||row.valueStr||!Number.isFinite(row.value))return null;
  board.set(row.key,row.value);
 }
 const value=param=>typeof param==='number'?param:board.get(param?.key)??param?.default;
 const attributes=data.attributes.map(effect=>({...effect,value:value(effect.value)}));
 if(attributes.some(effect=>effect.formula!=='multiplier'||effect.stat!=='moveSpeed'||!Number.isFinite(effect.value)||effect.value< -1))return null;
 const periodics=data.periodics.map(period=>({...period,interval:value(period.interval),
  ...(period.kind==='self-damage-maxhp'?{ratio:value(period.ratio)}:{})}));
 if(periodics.some(period=>!Number.isFinite(period.interval)||period.interval<=0||
  !['self-damage-maxhp','named-ability'].includes(period.kind)||
  period.kind==='self-damage-maxhp'&&(!Number.isFinite(period.ratio)||period.ratio<0)))return null;
 const abilities={};
 for(const [key,ability]of Object.entries(data.abilities)){
  const ratio=value(ability.elementRatio);
  if(!Number.isFinite(ratio)||ratio<0||ability.physicalScale!==0)return null;
  abilities[key]={...ability,elementRatio:ratio};
 }
 const normal={...data.normalAttackElement,ratio:value(data.normalAttackElement.ratio)};
 if(!Number.isFinite(normal.ratio)||normal.ratio<0)return null;
 return {data,attributes,periodics,abilities,normal};
}
function configure(enemy){
 const config=resolve(enemy);if(!config)return null;
 let state=enemy.externalPeriodic;
 if(!state)state=enemy.externalPeriodic={version:1,modeIndex:null,elapsed:0,periodics:{}};
 if(state.version!==1||!Number.isFinite(state.elapsed)||state.elapsed<0||!state.periodics)return null;
 if(state.modeIndex!==enemy.externalCombatMode){
  state.modeIndex=enemy.externalCombatMode;state.elapsed=0;state.periodics={};
  if(state.modeIndex===config.data.modeIndex)for(const period of config.periodics)
   state.periodics[period.id]={next:period.waitFirst?period.interval:0,count:0};
 }
 return state;
}
function attributeBonus(enemy,stat){
 const config=resolve(enemy);
 return !config||enemy.externalCombatMode!==config.data.modeIndex?0:
  config.attributes.filter(effect=>effect.stat===stat).reduce((sum,effect)=>sum+effect.value,0);
}
function targets(enemy,ability,context){
 const range=ability.range;
 if(range?.kind!=='circle'||!Number.isFinite(range.radius)||range.radius<=0)return [];
 return (context.candidates||[]).filter(target=>target&&!target.dead&&target.hp>0&&!target.removed&&
  !target.untargetable&&!target.targetFree&&target.col!=null&&target.row!=null&&
  (target.deployAt??0)<=context.time&&(target.deployT||0)>=1&&
  !(target.invisibleUntil>context.time)&&!(target.camouflageUntil>context.time)&&
  Math.hypot(target.col-enemy.x,target.row-enemy.y)<=range.radius+1e-9);
}
function tick(enemy,dt,context){
 if(enemy.dead||!Number.isFinite(dt)||dt<0)return;
 const config=resolve(enemy),state=configure(enemy);
 if(!config||!state||state.modeIndex!==config.data.modeIndex||typeof context?.selfDamage!=='function'||
  typeof context.element!=='function'||typeof context.attackPower!=='function')return;
 const end=state.elapsed+dt;state.elapsed=end;
 // Merge due events by their scheduled time. Ties use the frozen source order;
 // lethal self damage prevents every later callback, including same-time ones.
 while(!enemy.dead&&enemy.hp>0&&enemy.externalCombatMode===config.data.modeIndex){
  let due=null;
  for(const period of config.periodics){
   const slot=state.periodics[period.id];
   if(slot&&slot.next<=end+1e-9&&(!due||slot.next<due.slot.next-1e-9))due={period,slot};
  }
  if(!due)break;
  const {period,slot}=due;slot.next+=period.interval;slot.count++;
  if(period.kind==='self-damage-maxhp')context.selfDamage(enemy,enemy.maxHp*period.ratio,period);
  else{
   const ability=config.abilities[period.ability];if(!ability)continue;
   const amount=context.attackPower(enemy)*ability.elementRatio;
   if(amount>0)for(const target of targets(enemy,ability,context))context.element(target,ability.elementType,amount,enemy);
  }
 }
}
function normalElement(enemy,schedule,attackPower){
 // undefined means another executor owns this enemy. null means this source
 // group owns EP but this event is not its ordinary attack; do not fall back.
 const data=profile(enemy);if(!data)return undefined;
 const config=resolve(enemy),packet=config?.normal;
 if(!config||enemy.externalCombatMode!==config.data.modeIndex||schedule?.skillId||
  schedule?.modeIndex!==config.data.modeIndex||!packet.channels?.includes(schedule?.channel))return null;
 return {type:packet.type,amount:attackPower*packet.ratio};
}
root.ArkEnemyPeriodic={profile,resolve,configure,tick,attributeBonus,targets,normalElement};
})(typeof globalThis!=='undefined'?globalThis:this);
