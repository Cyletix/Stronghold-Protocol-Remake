// Complete CastSkill source bodies. Native animation event frames remain the
// documented cast-event timing boundary; these are independent skill actions.
(function(root){
 'use strict';
 const profiles=root.ArkDirectSkillData?.profiles||{};
 function configure(s,charId){
  const p=profiles[s?.sourceId];if(!p||!p.charIds.includes(charId))return;
  const b=s.blackboard||{};
  if(Object.keys(b).sort().join(',')!==p.blackboardKeys.join(',')||Object.values(b).some(v=>!Number.isFinite(v)||v<0)||
   !(b[p.scaleKey]>0)||p.targetKey&&!(Number.isInteger(b[p.targetKey])&&b[p.targetKey]>0)||
   p.chargeKey&&b[p.chargeKey]!==s.maxCharge||s.isPassive||!(s.spCost>0))throw Error('Invalid direct skill source: '+s.sourceId);
  if(p.onHit.length&&(!root.ArkOperatorCombat?.sourceBuffActive||!root.ArkOperatorCombat?.applySourceBuff))throw Error('Missing shared source Buff runtime');
  s.directSkill={version:1,profile:s.sourceId};s.effects=[];
  for(const k of ['combatMechanic','medicMechanic','commonMechanic','clientProgram','skillMode','elementMechanic'])delete s[k];
 }
 const profile=o=>o?.skill?.directSkill&&profiles[o.skill.directSkill.profile];
 function targets(o,p){
  const b=o.skill.blackboard,cells=rangeCellsFor({...o,rangeGrids:o.skill.rangeGrids||o.rangeGrids});
  let pool;
  if(p.heal)pool=[...B.operators,...(B.summoneds||[])].filter(t=>directHealAllowed(o,t)&&t.hp<t.maxHp&&cells.some(c=>c[0]===t.row&&c[1]===t.col)).sort(healingOrder);
  else pool=B.enemies.filter(e=>!e.dead&&e.hp>0&&!e.untargetable&&!(e.invisibleUntil>B.time)&&
   (!(e.sleepUntil>B.time)||root.ArkBlacknight?.canHitSleeping(o))&&(!p.groundOnly||!e.flying)&&enemyInOperatorRange(o,e,cells))
   .sort((a,b)=>(p.blockedFirst?Number(b.blockerId===o.id)-Number(a.blockerId===o.id):0)||dist(o,a)-dist(o,b)||String(a.id).localeCompare(String(b.id)));
  const n=p.targets==='all'?pool.length:p.targets==='blackboard'?b[p.targetKey]:p.targets==='single'?1:p.targetCount;
  return pool.slice(0,n);
 }
 function actionLocked(o){return !!o.directCast&&o.directCast.until>B.time+1e-9;}
 function spLockTime(o,from,to){const c=o.directCast;return c?Math.max(0,Math.min(to,c.until)-Math.max(from,c.started)):0;}
 function canCast(o){const p=profile(o);return !o.directCast&&(!p||!p.requiresTarget||targets(o,p).length>0);}
 function statusActive(e,a){return root.ArkOperatorCombat.sourceBuffActive(e,a.key);}
 function actions(o,e,items,b){
  for(const a of items){
   if(a.kind==='cost'){root.onSkillDp?.(b[a.valueKey],o);continue;}
   if(!e||e.dead||e.hp<=0)continue;
   if(a.kind==='if-status'){actions(o,e,statusActive(e,a.condition)?a.yes:a.no,b);continue;}
   root.ArkOperatorCombat.applySourceBuff(o,e,a,b);
  }
 }
 function resolve(o,e,p,b,power,hits=p.hits){
  if(!e||e.dead||e.hp<=0)return;
  if(p.heal){healOperator(o,e,power*b[p.scaleKey]);return;}
  for(let i=0;i<hits&&!e.dead&&e.hp>0;i++){
   actions(o,e,p.onHit,b);
   const d=calcDamageResult(o,e,1,{raw:power*b[p.scaleKey],type:p.damageType,defPenetrate:p.penetrationKey?b[p.penetrationKey]:0});
   hitEnemy(o,e,d.amount,false,d.type);
  }
 }
 function cast(o){
  const p=profile(o);if(!p||!operatorPresent(o))return false;
  const b=o.skill.blackboard,power=operatorAttackPower(o,buffMul(o).atk);
  if(p.castSchedule){
   const s=p.castSchedule;
   o.directCast={profile:o.skill.sourceId,started:B.time,until:B.time+s.preDelay+s.interval*(s.rounds-1),nextRound:0,blackboard:{...b}};
   advanceCast(o);o.atkAnimAt=B.time;return true;
  }
  for(const e of targets(o,p)){
   resolve(o,e,p,b,power);
  }
  actions(o,null,p.onCast,b);o.atkAnimAt=B.time;return true;
 }
 function launch(o,e,p,c,at){
  const delivery=p.projectile,packet={profile:c.profile,blackboard:{...c.blackboard},power:operatorAttackPower(o,buffMul(o).atk)};
  const shot={owner:o,target:e,directSkillPacket:packet,enemy:false,sx:o.col,sy:o.row,x:o.col,y:o.row,tx:e.x,ty:e.y,
   life:delivery.life,speed:delivery.speed||0,plan:{independentSkill:true}};
  if(delivery.kind==='lifetime-end-target'){
   const delay=delivery.randomBirthDelay>0?gameRandom()*delivery.randomBirthDelay:0;
   shot.kind='operator-pulse';shot.resolveAt=at+delay+delivery.life;
   shot.life=Math.max(.01,shot.resolveAt-B.time+.1);
  }else shot.kind=p.damageType==='arts'?'orb':'arrow';
  spawnProjectile(shot);
 }
 function advanceCast(o){
  const c=o.directCast;if(!c)return;
  const p=profiles[c.profile],s=p?.castSchedule;
  if(!s||!operatorCanAct(o)){delete o.directCast;return;}
  while(c.nextRound<s.rounds){
   const at=c.started+s.preDelay+c.nextRound*s.interval;if(at>B.time+1e-9)break;
   // Each spell refreshes its selector and live power; fired packets keep that
   // snapshot even if the caster later dies or the next spell is interrupted.
   for(const e of targets(o,p))launch(o,e,p,c,at);
   if(c.nextRound===0)actions(o,null,p.onCast,c.blackboard);
   c.nextRound++;
  }
  if(c.nextRound>=s.rounds)delete o.directCast;
 }
 function impact(shot){
  const packet=shot.directSkillPacket,p=profiles[packet?.profile];
  if(p&&shot.owner)resolve(shot.owner,shot.target,p,packet.blackboard,packet.power,1);
 }
 function update(){for(const o of [...B.operators,...(B.summoneds||[])])advanceCast(o);}
 function death(o){delete o.directCast;}
 root.ArkDirectSkills={configure,canCast,cast,update,impact,actionLocked,spLockTime,death,end:()=>{},expire:()=>{}};
})(window);
