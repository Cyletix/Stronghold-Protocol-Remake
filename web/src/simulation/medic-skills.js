// Curated healing skill families; all numbers come from the selected source level.
(function(root){
 'use strict';
 const rules={
  skchr_myrrh_1:{kind:'next',keys:['heal_scale','ct'],extraTargets:1},
  skchr_myrrh_2:{kind:'sustain',keys:['atk','attack_speed'],extraTargets:1},
  skchr_flower_2:{kind:'sustain',keys:['atk','attack_speed']},
  skchr_susuro_2:{kind:'sustain',keys:['atk','attack_speed','skill_max_trigger_time'],limited:true},
  skchr_plosis_2:{kind:'sustain',keys:['base_attack_time'],interval:'add'},
  skchr_breeze_1:{kind:'sustain',keys:['atk'],extraTargets:-1},
  skchr_rosesa_1:{kind:'next',keys:['heal_scale','ct']},
  skchr_reckpr_1:{kind:'next',keys:['heal_scale','max_target','cnt'],sourceTargets:true},
  skchr_bldsk_1:{kind:'next',keys:['hp_ratio','ct'],lowHp:true},
  skchr_finlpp_1:{kind:'burst',keys:['heal_scale']},
  skchr_finlpp_2:{kind:'sustain',keys:['attack@heal_scale','base_attack_time'],interval:'multiply',random:true},
  skchr_folnic_1:{kind:'sustain',keys:['atk','ability_range_forward_extend'],extend:true}
 };
 const baseSkills=Object.keys(rules);
 Object.assign(rules,{
  skchr_ccheal_1:{kind:'next',periodic:'heal',passiveCharge:true,keys:['heal_scale','heal_scale_2','hp_ratio','interval','duration','ct']},
  skchr_ccheal_2:{kind:'periodic',periodic:'heal',keys:['heal_scale','heal_scale_2','hp_ratio','interval','duration']},
  skchr_bldsk_2:{kind:'periodic',periodic:'loss',keys:['atk','hp_ratio','interval','duration']}
 });
 const periodicSkills=Object.keys(rules).filter(id=>!baseSkills.includes(id));
 Object.assign(rules,{
  skchr_papyrs_1:{kind:'next',barrierBoost:true,keys:['heal_scale','shield_scale_skill']},
  skchr_papyrs_2:{kind:'sustain',lockPrimary:true,interval:'add',keys:['base_attack_time','atk','attack@chain.extra_value']},
  skchr_reckpr_2:{kind:'sustain',reactiveHeal:true,keys:['attack@buff_duration','attack@fixed_heal_value','atk']}
 });
 const protectiveSkills=Object.keys(rules).filter(id=>!baseSkills.includes(id)&&!periodicSkills.includes(id));
 rules.skchr_silent_2={kind:'inventory',keys:['cnt']};
 const units=()=>[...(B?.operators||[]),...(B?.summoneds||[])];
 const identity=o=>({unitId:o.id,playerId:o.playerId??null,epoch:o.medicLifeEpoch||0});
 const matches=(o,key)=>o.id===key.unitId&&(o.playerId??null)===key.playerId&&(o.medicLifeEpoch||0)===key.epoch;
 function lockedCandidate(o){return healingAllies(o).filter(t=>t!==o).sort((a,b)=>b.maxHp-a.maxHp||String(a.playerId??'').localeCompare(String(b.playerId??''))||String(a.id).localeCompare(String(b.id)))[0];}
 function primary(o){
  const key=o.skillState?.medicPrimary;if(!key)return undefined;
  const t=units().find(t=>matches(t,key));
  return t&&directHealAllowed(o,t)&&operatorInRange(o,t)?t:null;
 }
 const talentNames={char_4139_papyrs:'博览古卷',char_4196_reckpr:'学成于聚',char_128_plosis:'技力光环',char_171_bldsk:'血液样本回收',char_108_silent:'强化注射'};
 function handledTalent(t,cid){return !!talentNames[cid]&&t.name===talentNames[cid];}
 function talentBoard(o){return Object.fromEntries((o.combatTalents?.find(t=>handledTalent(t,o.charId))?.blackboard||[]).map(b=>[b.key,b.value]));}
 function barrierBoard(o){return Object.fromEntries((o.combatTalents?.find(t=>handledTalent(t,o.charId))?.blackboard||[]).map(b=>[b.key,b.value]));}
 function attackSpeedBonus(target){
  // The source names the MEDIC profession, not the heal action. Incantation
  // medics qualify; guardians, bards and medical devices do not.
  if(target.profession!=='MEDIC'||!operatorPresent(target)||!(B?.operators||[]).includes(target))return 0;
  let speed=0;
  for(const o of B.operators)if(o.charId==='char_108_silent'&&operatorPresent(o))speed=Math.max(speed,talentBoard(o).attack_speed||0);
  return speed/100;
 }
 // External SP is independent of the skill's natural/attack/defensive recovery type.
 // Only Reckpr's explicitly forced recovery ignores an active skill or SP lock.
 function grantSp(o,amount,forced=false){
  const s=o.skill;
  if(!operatorPresent(o)||!s||s.isPassive||!(s.spCost>0)||!(amount>0))return;
  if(!forced&&(o.skillState||root.ArkDollkeeper?.active(o)||root.ArkElements?.skillLocked(o)||root.ArkMedicDrone?.full(o)))return;
  o.sp=Math.min(s.spCost*(s.maxCharge||1),(o.sp||0)+amount);
 }
 function onSkillStarted(caster){
  if(!(B.operators||[]).includes(caster)||!operatorPresent(caster))return;
  for(const o of B.operators)if(o.charId==='char_4196_reckpr'&&operatorPresent(o)&&operatorInRange(o,caster)){
   const b=talentBoard(o);if(!(b.sp>0)||b.prob!==1||b.max_stack_cnt!==1)continue;
   grantSp(o,b.sp,true);
   o.buffs=(o.buffs||[]).filter(e=>e.medicTalent!=='reckpr');
   o.buffs.push({aspd:1+b.attack_speed/100,until:B.time+b.duration,medicTalent:'reckpr'});
  }
 }
 function naturalSpBonus(target){
  if(!(B.operators||[]).includes(target)||target.skill?.spType!=='INCREASE_WITH_TIME')return 0; // Ptilopsis does not accelerate summons or attack/defensive recovery.
  let value=0;
  for(const o of B.operators)if(o.charId==='char_128_plosis'&&operatorPresent(o)){
   value=Math.max(value,talentBoard(o).sp_recovery_per_sec||0);
   if(operatorInRange(o,target))value=Math.max(value,operatorAttackProfile(o).medicNearSp||0);
  }
  return value;
 }
 function onEnemyDefeated(enemy){
  for(const o of B.operators||[])if(o.charId==='char_171_bldsk'&&operatorPresent(o)&&enemyInOperatorRange(o,enemy)){
   const b=talentBoard(o),level=enemy.enemyLevel??root.ArkElementData?.enemies[enemy.enemyId]?.enemyLevel,
    kind=['ELITE','BOSS'].includes(level)?'ex':'no',self=b['bldsk_t_1[self]['+kind+'].sp']??b['bldsk_t_1[self].sp'],other=b['bldsk_t_1[rand]['+kind+'].sp']??b['bldsk_t_1[rand].sp'];
   if(!(self>0))continue;grantSp(o,self);
   // Do not filter full SP / active skills out of the random pool; a blocked
   // recipient can receive the selection without receiving any SP.
   const pool=units().filter(t=>t!==o&&operatorPresent(t)&&!t.untargetable&&!t.isolated&&!(t.isolatedUntil>B.time)&&operatorInRange(o,t));
   if(pool.length)grantSp(pool[Math.floor(gameRandom()*pool.length)],other);
  }
 }
 const requested=new WeakMap();
 function configure(s){
  if(s?.combatMechanic?.replacementHeal){delete s.medicMechanic;return;}
  const r=rules[s?.sourceId];if(!r)return;
  const b=s.blackboard||{},keys=Object.keys(b).sort();
  if(keys.join(',')!==r.keys.slice().sort().join(',')||keys.some(k=>!Number.isFinite(b[k]))||(r.periodic?s.duration!==-1:r.kind==='sustain'?!(s.duration>0):s.duration!==0))throw Error('Invalid medic skill: '+s.sourceId);
  if(r.periodic&&(!(b.interval>0)||!(b.duration>=b.interval)||!(b.hp_ratio>0&&b.hp_ratio<=1)))throw Error('Invalid periodic medic timing');
  if(r.limited&&!(Number.isInteger(b.skill_max_trigger_time)&&b.skill_max_trigger_time>0))throw Error('Invalid skill use limit');
  if(r.extend&&!(Number.isInteger(b.ability_range_forward_extend)&&b.ability_range_forward_extend>=0))throw Error('Invalid healing range extension');
  s.medicMechanic={...r};s.effects=[];
  for(const [key,type,divisor]of [['atk','buff_atk',1],['attack_speed','buff_atkspd',100]])if(!r.periodic&&b[key]!=null)s.effects.push({type,power:b[key]/divisor});
  // Folinic and Ansel share exactly the same forward-cell extension lifecycle.
  if(r.extend)s.commonMechanic={kind:'forward-range'};
 }
 function remaining(o){const s=o.skill;if(!s?.medicMechanic?.limited)return null;return Math.max(0,s.blackboard.skill_max_trigger_time-(o.medicSkillUses?.[s.sourceId]||0));}
 function canCast(o){
  const m=o.skill?.medicMechanic;if(!m)return true;
  if(m.kind==='inventory')return root.ArkMedicDrone?.supported(o)&&!root.ArkMedicDrone.full(o);
  if(remaining(o)===0)return false;
  if(m.passiveCharge)return false; // Consumed by a normal heal, without skill start/end events.
  if(m.lockPrimary)return !!lockedCandidate(o);
  if(m.kind==='next'){
   const t=requested.get(o);return !!t&&o.cd<=0&&directHealAllowed(o,t)&&t.hp<t.maxHp&&(!m.lowHp||t.hp<t.maxHp*.5);
  }
  return m.kind!=='burst'||healingAllies(o).some(t=>t.hp<t.maxHp);
 }
 function farScale(o,t){const p=operatorAttackProfile(o);return p.subProfession==='healer'&&dist(o,t)>2?p.bb?.heal_scale??1:1;}
 function healingScale(o,t){
  const p=operatorAttackProfile(o),b=p.bb||{};
  return ['char_4196_reckpr','char_171_bldsk'].includes(o.charId)&&p.subProfession==='physician'&&b.hp_ratio>0&&t.hp<t.maxHp*b.hp_ratio?b.heal_scale||1:1;
 }
 function cast(o){
  const s=o.skill,m=s?.medicMechanic;if(!m)return;
  if(m.kind==='inventory')root.ArkMedicDrone.stock(o);
  if(m.lockPrimary)o.skillState.medicPrimary=identity(lockedCandidate(o));
  if(m.limited){o.medicSkillUses||={};o.medicSkillUses[s.sourceId]=(o.medicSkillUses[s.sourceId]||0)+1;}
  if(m.kind==='periodic'){
   if(m.periodic==='heal'){
    const power=operatorAttackPower(o,buffMul(o).atk);
    for(const t of healingAllies(o))applyPeriodic(o,t,power);
   }else{
    const pool=[...B.operators,...(B.summoneds||[])].filter(t=>t!==o&&operatorPresent(t)&&operatorInRange(o,t));
    const ally=pool.length?pool[Math.floor(gameRandom()*pool.length)]:null;
    for(const t of ally?[o,ally]:[o])applyPeriodic(o,t);
   }
  }
  if(m.kind==='burst'){
   const power=operatorAttackPower(o,buffMul(o).atk)*s.blackboard.heal_scale;
   for(const t of healingAllies(o))healOperator(o,t,power*farScale(o,t));
  }
 }
 function action(o,pool){
  const s=o.skill,m=s?.medicMechanic;if(!m)return null;
  if(m.passiveCharge){
   if(o.cd>0||!pool.length||!operatorCanAct(o)||o.skillState||root.ArkDollkeeper?.active(o)||root.ArkElements?.skillLocked(o)||o.silenceUntil>B.time||o.sp<s.spCost)return null;
   o.sp-=s.spCost;
   return {next:true,count:1,scale:1,periodicPower:operatorAttackPower(o,buffMul(o).atk)};
  }
  if(m.kind==='next'){
   if(o.skillState||!pool.length)return null;
   requested.set(o,pool[0]);let activated=false;
   try{activated=castSkill(o)===true;}finally{requested.delete(o);}
   if(!activated)return null;
  }else if(!o.skillState)return null;
  const p=operatorAttackProfile(o),b=s.blackboard;
  return {next:m.kind==='next',count:m.random?1:m.sourceTargets?b.max_target:Math.max(1,(p.healTargets||p.bb?.['attack@chain.max_target']||1)+(m.extraTargets||0)+(b['attack@chain.extra_value']||0)),
   random:m.random,scale:b.heal_scale??b['attack@heal_scale']??1,extraHp:m.lowHp?b.hp_ratio:0,barrierScale:m.barrierBoost?b.shield_scale_skill:1};
 }
 function interval(o,s){
  const m=s?.medicMechanic;if(!m?.interval)return null;
  const value=s.blackboard.base_attack_time;
  return Math.max(.05,m.interval==='multiply'?o.attackTime*value:o.attackTime+value)/buffMul(o).aspd;
 }
 function applyPeriodic(o,t,power=0){
  // Same caster/skill refreshes one recipient effect. Cross-copy stacking is an
  // explicit local rule pending client evidence; never multiply on each update.
  advanceTarget(t);
  if(!operatorPresent(t))return;
  const s=o.skill,b=s.blackboard,key=JSON.stringify([s.sourceId,o.playerId??null,o.id]);
  const effects=t.medicEffects||=[];t.medicEffects=effects.filter(e=>e.key!==key);
  t.buffs=(t.buffs||[]).filter(e=>e.medicEffectKey!==key);
  const effect={key,kind:s.medicMechanic.periodic,sourceId:s.sourceId,sourceUnitId:o.id,sourcePlayerId:o.playerId??null,
   sourceCol:o.col,sourceRow:o.row,power,scale:b.heal_scale,lowScale:b.heal_scale_2,hpRatio:b.hp_ratio,
   startedAt:B.time,until:B.time+b.duration,interval:b.interval,ticks:0};
  t.medicEffects.push(effect);
  if(effect.kind==='loss'){
   t.buffs.push({atk:1+b.atk,until:effect.until,medicEffectKey:key});
   const fx=B.combatEffects||=[];fx.push({kind:'medic-blood',at:B.time,duration:.6,x:t.col,y:t.row});if(fx.length>96)fx.splice(0,fx.length-96);
  }
 }
 function afterHeal(o,t,plan){
  if(plan?.periodicPower!=null)applyPeriodic(o,t,plan.periodicPower);
  const b=barrierBoard(o),scale=b['attack@scale'],duration=b['attack@shield_duration'];
  if(scale>0&&duration>0&&operatorPresent(t)){
   const amount=operatorAttackPower(o,buffMul(o).atk)*scale*(plan?.barrierScale??1);
   // Barriers never add together. Until replacement priority is evidenced,
   // preserve the larger remaining capacity and refresh the source duration.
   t.medicBarrier={amount:Math.max(t.medicBarrier?.until>B.time?t.medicBarrier.amount:0,amount),until:B.time+duration,source:identity(o)};
  }
  if(o.skillState&&o.skill?.medicMechanic?.reactiveHeal&&operatorPresent(t)){
   const sb=o.skill.blackboard,key=JSON.stringify([o.skill.sourceId,o.playerId??null,o.id]);
   t.medicReactions=(t.medicReactions||[]).filter(e=>e.until>B.time&&e.key!==key);
   t.medicReactions.push({key,until:B.time+sb['attack@buff_duration'],amount:sb['attack@fixed_heal_value'],source:identity(o),sourceCol:o.col,sourceRow:o.row});
  }
 }
 function absorb(t,amount){
  const shield=t.medicBarrier;if(!shield||shield.until<=B.time||!(shield.amount>0))return amount;
  const absorbed=Math.min(amount,shield.amount);shield.amount-=absorbed;
  if(shield.amount<=0)t.medicBarrier=null;
  return amount-absorbed;
 }
 function onDamage(t,actual){
  if(!(actual>0)||!operatorPresent(t))return;
  for(const e of t.medicReactions||[])if(e.until>B.time)healOperator({col:e.sourceCol,row:e.sourceRow},t,e.amount);
 }
 function clear(o){
  for(const caster of units())if(caster.skillState?.medicPrimary&&matches(o,caster.skillState.medicPrimary))endOperatorSkill(caster);
  o.medicLifeEpoch=(o.medicLifeEpoch||0)+1;o.medicBarrier=null;o.medicReactions=[];
  o.medicEffects=[];if(o.buffs)o.buffs=o.buffs.filter(b=>!b.medicEffectKey&&!b.medicTalent);
 }
 function advanceTarget(t){
  if(!t.medicEffects?.length)return;
  if(!operatorPresent(t)){clear(t);return;}
  // Chronological ticks keep HP threshold changes identical in a batched step
  // and a replay. All clocks and source snapshots are plain serialized data.
  for(;;){
   let effect=null,next=Infinity;
   for(const e of t.medicEffects){const at=e.startedAt+(e.ticks+1)*e.interval;if(at<=e.until+1e-9&&at<=B.time+1e-9&&at<next){effect=e;next=at;}}
   if(!effect)break;
   effect.ticks++;
   if(effect.kind==='heal'){
    const source={col:effect.sourceCol,row:effect.sourceRow};
    healOperator(source,t,effect.power*(t.hp<t.maxHp*effect.hpRatio?effect.lowScale:effect.scale));
   }else{
    // HP loss bypasses damage shields, defense, hit reactions and defensive SP.
    t.hp=Math.max(0,t.hp-t.maxHp*effect.hpRatio);
    if(t.hp<1e-7){t.hp=0;tryKill(t);}
   }
   if(!operatorPresent(t)){clear(t);return;}
  }
  t.medicEffects=t.medicEffects.filter(e=>e.until>B.time+1e-9);
  const keys=new Set(t.medicEffects.map(e=>e.key));
  if(t.buffs)t.buffs=t.buffs.filter(b=>!b.medicEffectKey||keys.has(b.medicEffectKey));
 }
 function update(){for(const t of units()){
  advanceTarget(t);
  if(t.medicBarrier?.until<=B.time)t.medicBarrier=null;
  if(t.medicReactions)t.medicReactions=t.medicReactions.filter(e=>e.until>B.time);
  const key=t.skillState?.medicPrimary;
  if(key&&!units().some(u=>matches(u,key)&&operatorPresent(u)))endOperatorSkill(t);
 }}
 root.ArkMedicSkills={supported:Object.keys(rules),baseSkills,periodicSkills,protectiveSkills,configure,canCast,cast,action,interval,remaining,farScale,afterHeal,update,clear,primary,handledTalent,absorb,onDamage,onSkillStarted,naturalSpBonus,onEnemyDefeated,healingScale,attackSpeedBonus};
})(typeof window!=='undefined'?window:globalThis);
