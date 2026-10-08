// Explicit shared skill handlers. Source values remain in skill_choices.json;
// do not infer an executable mechanic from a translated name or prefab prefix.
(function(root){
 'use strict';
 const instant=new Set(['skcom_charge_cost[1]','skcom_charge_cost[2]','skcom_charge_cost[3]']);
 const periodic=new Set(['skcom_assist_cost[2]','skcom_assist_cost[3]']);
 const buffFamilies={
  'skcom_atk_up[1]':'attack','skcom_def_up[1]':'defense','skcom_heal_up[1]':'healing',
  'skcom_magic_rage[1]':'attack-speed','skcom_heal_rage[3]':'attack-speed','skcom_quickattack[1]':'attack-and-speed',
  'skcom_atk_up[2]':'attack','skcom_atk_up[3]':'attack',
  'skcom_def_up[2]':'defense','skcom_def_up[3]':'defense',
  'skcom_heal_up[2]':'healing','skcom_heal_up[3]':'healing',
  'skcom_quickattack[3]':'attack-and-speed',
  'skcom_magic_rage[2]':'attack-speed','skcom_magic_rage[3]':'attack-speed'
 };
 const selfHealing=new Set(['skcom_heal_self[1]','skcom_heal_self[2]','skcom_heal_self[3]']);
 const deployment=new Set(['skcom_born_up[1]','skcom_born_up[2]','skcom_born_up[3]']);
 const costSupported=[...instant,...periodic],supported=[...costSupported,...Object.keys(buffFamilies),...selfHealing,...deployment,'skcom_range_extend'];
 function exactKeys(skill,keys){
  const b=skill.blackboard||{};
  if(Object.keys(b).sort().join(',')!==keys.slice().sort().join(',')||keys.some(k=>!Number.isFinite(b[k])))throw Error('Invalid common skill blackboard: '+skill.sourceId);
 }
 function configure(skill){
  if(!supported.includes(skill.sourceId))return;
  const b=skill.blackboard||{};
  if(selfHealing.has(skill.sourceId)){
   exactKeys(skill,['heal_scale']);
   if(!(b.heal_scale>0)||skill.duration!==0)throw Error('Invalid self recovery: '+skill.sourceId);
   skill.commonMechanic={kind:'self-recovery'};skill.effects=[];return;
  }
  if(deployment.has(skill.sourceId)){
   exactKeys(skill,['atk','def']);
   if(!(skill.duration>0)||!skill.isPassive)throw Error('Invalid deployment buff: '+skill.sourceId);
   skill.commonMechanic={kind:'deployment-buff'};skill.effects=[];return;
  }
  if(skill.sourceId==='skcom_range_extend'){
   exactKeys(skill,['atk','ability_range_forward_extend']);
   if(!(skill.duration>0)||!Number.isInteger(b.ability_range_forward_extend)||b.ability_range_forward_extend<0)throw Error('Invalid forward range extension');
   skill.commonMechanic={kind:'forward-range'};skill.effects=[{type:'buff_atk',power:b.atk}];return;
  }
  const family=buffFamilies[skill.sourceId];
  if(family){
   const keys=family==='defense'?['def']:family==='attack-speed'?['attack_speed']:family==='attack-and-speed'?['atk','attack_speed']:['atk'];
   if(!(skill.duration>0)||Object.keys(b).sort().join(',')!==keys.slice().sort().join(',')||keys.some(k=>!Number.isFinite(b[k])))throw Error('Invalid common-buff blackboard: '+skill.sourceId);
   skill.commonMechanic={kind:'stat-buff',family};
   skill.effects=keys.map(k=>({type:{atk:'buff_atk',def:'buff_def',attack_speed:'buff_atkspd'}[k],power:b[k]/(k==='attack_speed'?100:1)}));
   return;
  }
  if(!(b.cost>0&&Number.isFinite(b.cost)))throw Error('Missing deployment-cost blackboard: '+skill.sourceId);
  if(instant.has(skill.sourceId)){
   skill.commonMechanic={kind:'instant-dp'};skill.effects=[{type:'dp_gain',power:b.cost}];
  }else{
   if(!(b.interval>0&&Number.isFinite(b.interval)&&b.value>0&&Number.isFinite(b.value)&&skill.duration>0))throw Error('Invalid periodic deployment-cost skill: '+skill.sourceId);
   skill.commonMechanic={kind:'periodic-dp',interval:b.interval,total:b.value,perTick:b.cost};
   skill.effects=[]; // The old classifier paid one cost at activation and lost the stream.
  }
 }
 function cast(unit){
  const m=unit.skill?.commonMechanic,state=unit.skillState;
  if(m?.kind==='periodic-dp'&&state)state.commonDp={startedAt:B.time,emitted:0,...m};
  if(m?.kind==='self-recovery')healOperator(unit,unit,unit.maxHp*unit.skill.blackboard.heal_scale);
  if(m?.kind==='forward-range'&&state){
   unit.rangeGrids=extendForward(state.rangeGrids,unit.skill.blackboard.ability_range_forward_extend);
   unit.cells=rangeCellsFor(unit);
  }
 }
 function extendForward(grids,count){
  const out=(grids||[]).map(g=>({...g})),fronts=new Map();
  for(const g of out)fronts.set(g.row,Math.max(fronts.get(g.row)??-Infinity,g.col));
  for(const [row,col]of fronts)for(let i=1;i<=count;i++)out.push({row,col:col+i});
  return out;
 }
 function deployed(unit){
  if(unit.skill?.commonMechanic?.kind!=='deployment-buff')return;
  const b=unit.skill.blackboard;
  clearDeployment(unit);
  (unit.buffs||=[]).push({commonDeployment:true,atk:1+b.atk,def:1+b.def,until:B.time+unit.skill.duration});
  unit.skillFx=B.time+unit.skill.duration;
 }
 function clearDeployment(unit){unit.buffs=(unit.buffs||[]).filter(b=>!b.commonDeployment);}
 function advance(unit,time){
  const state=unit.skillState,stream=state?.commonDp;if(!stream||unit.dead)return;
  // Derive the due count from elapsed simulation time, then subtract the durable
  // ledger. Batched frames and authenticated restores must never pay twice.
  const elapsed=Math.max(0,Math.min(time,state.until)-stream.startedAt);
  const due=Math.min(stream.total,Math.floor((elapsed+(stream.offset||0)+1e-9)/stream.interval)*stream.perTick);
  const amount=due-stream.emitted;
  if(amount>0){stream.emitted=due;root.onSkillDp?.(amount,unit);}
 }
 root.ArkCommonSkills={supported,costSupported,buffFamilies,configure,cast,advance,deployed,clearDeployment,extendForward,
  canCast:unit=>unit.skill?.commonMechanic?.kind!=='self-recovery'||unit.hp<unit.maxHp,
  stopsAttack:unit=>!!unit.skillState&&unit.skill?.commonMechanic?.kind==='periodic-dp'};
})(typeof window!=='undefined'?window:globalThis);
