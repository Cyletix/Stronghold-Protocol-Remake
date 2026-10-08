// Accumulation (EP loss) and elemental HP damage are different operations.
// State is plain data so the authoritative room VM can restore it exactly.
(function(root){
 'use strict';
 const order=['nervous','erosion','burn','apoptosis','rampage'];
 const config=()=>root.ArkElementData;
 const enemy=t=>t.col==null;
 const source=id=>B.operators.find(o=>o.id===id)||null;
 const active=(t,type)=>!!t.epBurst&&(!type||t.epBurst.type===type)&&t.epBurst.until>B.time;
 function threshold(t){return t.epThreshold>0?t.epThreshold:enemy(t)&&(t.isBoss||config().enemies[t.enemyId]?.boss||t===B.leader)?config().bossThreshold:config().threshold;}
 function resistance(t,damage=false){const key=damage?'epDamageResistance':'epResistance';return t[key]??t.sourceAttributes?.[key]??config().enemies[t.enemyId]?.[key]??0;}
 function reduced(raw,res){return Math.max(raw*.05,raw*(1-Math.min(100,Math.max(0,res))/100));}
 function deal(t,raw,type='elemental',owner=null){
  if(t.dead||!(raw>0))return 0;
  let value=raw;
  if(type==='elemental')value=reduced(raw,resistance(t,true));
  else if(enemy(t))value=calcDamage({atk:raw},t,1,{raw,type});
  else if(type!=='true')value=enemyDamageToOperator({atk:raw,atkType:type},t);
  const actual=inflictDamage(t,Math.max(1,Math.round(value)),false,type);
  if(t.hp<=0){if(enemy(t))killEnemy(t,owner);else tryKill(t);}
  return actual;
 }
 function add(t,type,value,owner=null){
  if(!config().types[type]||t.dead||t.untargetable||!(value>0)||!Number.isFinite(value)||active(t)||t.elementImmune)return 0;
  if(t.epBurst)finish(t);
  value=reduced(value,resistance(t))* (root.ArkElementOperators?.incoming(t,type)??1);
  value=root.ArkElementOperators?.absorb(t,value)??value;
  if(value<=0)return 0;
  t.ep||={};t.epThreshold=threshold(t);t.ep[type]=Math.min(t.epThreshold,(t.ep[type]||0)+value);
  if(t.ep[type]+1e-7>=t.epThreshold)burst(t,type,owner);
  return value;
 }
 function burst(t,type,owner=null){
  const c=config().types[type];if(!c||t.dead||active(t))return false;
  const isEnemy=enemy(t),entry=c[isEnemy?'enemy':'char'];if(!entry)return false;
  const b=entry.bb,duration=isEnemy?c.enemyDuration:c.duration;
  t.epThreshold=threshold(t);t.ep={};
  t.epBurst={type,startedAt:B.time,until:B.time+duration,nextTick:B.time+1,ownerId:owner?.id??null};
  const fx=B.combatEffects||=[];fx.push({kind:'element-burst',type,x:t.x??t.col,y:t.y??t.row,at:B.time,duration:.6});if(fx.length>128)fx.splice(0,fx.length-128);
  if(type==='nervous'){
   if(isEnemy){if(!t.palsyImmune&&!t.sourceAttributes?.palsyImmune)t.palsyStacks=Math.min(3,(t.palsyStacks||0)+b.palsy_stack_cnt);deal(t,b.ep_sanity_damage,'elemental',owner);}
   else{if(!t.stunImmune&&!t.sourceAttributes?.stunImmune&&!root.ArkSkillModes?.immune(t,'stun',B.time))t.stunUntil=Math.max(t.stunUntil||0,B.time+b.stun);deal(t,b.ep_sanity_damage,'true');}
  }else if(type==='erosion'){
   t.elementDefLoss=(t.elementDefLoss||0)+(isEnemy?entry.modifiers.find(m=>m.attributeType==='DEF').value:b.def);
   deal(t,b.ep_water_damage,isEnemy?'elemental':'phys',owner);
  }else if(type==='burn')deal(t,b.ep_fire_damage,isEnemy?'elemental':'arts',owner);
  else if(type==='rampage')t.epBurst.angerDamage=b.value;
  if(isEnemy)root.ArkElementOperators?.onBurst(t,type);
  return true;
 }
 function heal(t,amount){
  if(t.dead||active(t)||!(amount>0))return 0;
  let healed=0;for(const k of Object.keys(t.ep||{})){const n=Math.min(t.ep[k],amount);t.ep[k]-=n;healed+=n;}return healed;
 }
 function finish(t){t.ep={};t.epBurst=null;t.elementDots=[];}
 function update(dt){
  for(const t of [...B.operators,...(B.summoneds||[]),...B.enemies]){
   if(t.dead)continue;
   const state=t.epBurst;
   t.elementSpLockTime=state?.type==='apoptosis'&&!enemy(t)?Math.max(0,Math.min(dt,state.until-(B.time-dt))):0;
   if(state){
    const isEnemy=enemy(t),b=config().types[state.type][isEnemy?'enemy':'char']?.bb;
    const end=Math.min(B.time,state.until);
    while(!t.dead&&state.nextTick<=end+1e-7){
     if(state.type==='apoptosis'){deal(t,b.damage,isEnemy?'elemental':'arts',source(state.ownerId));if(!isEnemy)t.sp=Math.max(0,(t.sp||0)+b.sp);}
     if(state.type==='rampage'&&!isEnemy)deal(t,state.angerDamage,'true');
     state.nextTick+=b?.interval||1;
    }
    for(const dot of t.elementDots||[])while(!t.dead&&dot.nextTick<=end+1e-7){deal(t,dot.amount,'elemental',source(dot.ownerId));dot.nextTick+=1;}
    if(B.time+1e-7>=state.until)finish(t);
   }else if(t.epRecoveryPerSec>0)heal(t,t.epRecoveryPerSec*dt);
  }
 }
 function clear(t){finish(t);delete t.elementDefLoss;delete t.palsyStacks;delete t.palsyUntil;delete t.elementSpLockTime;}
 function defDelta(t){return t.elementDefLoss||0;}
 function resDelta(t){return active(t,'burn')?-20:0;}
 function atkScale(t){if(!enemy(t)||!active(t,'apoptosis'))return 1;const s=t.epBurst,total=s.until-s.startedAt,elapsed=Math.floor(B.time-s.startedAt+1e-7);return 1-.5*Math.max(0,(total-elapsed)/total);}
 function aspdBonus(t){return active(t,'rampage')?.5:0;}
 function onAction(t){if(active(t,'rampage')){const b=config().types.rampage.char.bb;t.epBurst.angerDamage=Math.min(b.value_max,t.epBurst.angerDamage+b.value_add);}}
 function interruptAttack(e){
  if(!(e.palsyStacks>0)||e.atkPhase!=='windup'||e.palsyImmune||e.sourceAttributes?.palsyImmune)return false;
  if(e.atkTimer>0&&B.time-e.atkAnimAt<config().palsy.triggerAfter)return false;
  e.palsyStacks--;e.palsyUntil=B.time+config().palsy.duration;e.atkPhase=null;e.atkTargets=null;e.atkTarget=null;return true;
 }
 function display(t,time=B.time){
  if(t.dead)return null;
  const th=threshold(t),s=t.epBurst;
  if(s&&s.until>time)return {type:s.type,burst:true,ratio:Math.max(0,Math.min(1,(time-s.startedAt)/(s.until-s.startedAt))),seconds:Math.max(0,s.until-time),threshold:th,value:0};
  let type=null,value=0;for(const k of order)if((t.ep?.[k]||0)>value){type=k;value=t.ep[k];}
  return value>0?{type,burst:false,ratio:Math.max(0,1-value/th),value,threshold:th}:null;
 }
 function configureEnemy(e){
  const d=config().enemies[e.enemyId];e.epThreshold=threshold(e);
  e.epResistance=e.sourceAttributes?.epResistance??d?.epResistance??0;e.epDamageResistance=e.sourceAttributes?.epDamageResistance??d?.epDamageResistance??0;
  e.epType=d?.type??e.epType;
  const ratios=(e.sourceTalentBlackboard||[]).filter(b=>/(?:^|\.)attack@ep_damage_ratio$/.test(b.key));
  // This key is a damage-triggered talent, not a generic attack@ field.
  // PRTS 假想敌：铳 + the current stage blackboard; never borrow the _s variant.
  if(['enemy_9017_achunt','enemy_9017_achunt_2'].includes(e.enemyId)){
   ratios.push(...(e.sourceTalentBlackboard||[]).filter(b=>b.key==='1.ep_damage_ratio'));
   e.epAttack=0;
  }
  if(e.epType&&ratios.length)e.epAttack=Math.max(...ratios.map(b=>b.value));
  // Unknown legacy element is not silently converted into burn.
  if(!config().types[e.epType])e.epAttack=0;
 }
 root.ArkElements={add,burst,heal,deal,update,active,threshold,resistance,reduced,clear,defDelta,resDelta,atkScale,aspdBonus,onAction,interruptAttack,display,configureEnemy,skillLocked:t=>active(t,'apoptosis')&&!enemy(t)};
})(typeof window!=='undefined'?window:globalThis);
