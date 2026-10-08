(function(root){
 'use strict';
 const data=()=>root.ArkEnemyDeathSpawnData;
 function owns(enemy){return !!data()?.enemies[enemy.enemyId];}
 function plan(enemy,{time,reason='DEATH',random}){
  const profile=data()?.enemies[enemy.enemyId];if(!profile)return null;
  if(reason===data().template.excludedReason)return [];
  // A resolved stage blackboard, even an empty one, replaces the catalog defaults.
  const bb=Object.fromEntries((enemy.sourceTalentBlackboard??profile.blackboard).map(x=>[x.key,x.valueStr??x.value]));
  const count=bb['DeadSpawn.cnt'],enemyId=bb['DeadSpawn.enemy_key'];
  if(!Number.isInteger(count)||count<=0||typeof enemyId!=='string'||!enemyId)return [];
  const action=data().template.action,parent={};
  for(const key of ['x','y','route','seg','cp','sourceWave','sourceFragment','blockFragment'])if(enemy[key]!==undefined)parent[key]=enemy[key];
  parent.dontBlockWave=action._dontBlockWave;
  // Local timing convention: one seeded uniform delay per child. The original
  // scheduler RNG/order and 0.5-tile scatter are not recovered. Retain host position.
  return Array.from({length:count},()=>({enemyId,at:time+action._delayTime+(action._useRandomDelay?random()*action._randomDelayRange:0),parent:{...parent}}));
 }
 function waitingIn(queue,wave,fragment,blocking){
  return (queue||[]).some(({parent:p})=>p.sourceWave===wave&&(fragment==null?!p.dontBlockWave:p.sourceFragment===fragment&&(!blocking||p.blockFragment)));
 }
 function takeDue(queue,time){
  const due=[],waiting=[];for(const item of queue||[])(item.at<=time?due:waiting).push(item);
  // Preserve equal-time insertion order; never draw fresh randomness on restore.
  due.sort((a,b)=>a.at-b.at);return {due,waiting};
 }
 // Native PropLikeEnemy.DoApplyModifier: each accepted negative HP delta is -1;
 // nonnegative HP modifiers do not change HP. PURE bypasses the type restriction.
 // null is an untyped caller, never an inferred physical or magical damage type.
 function hpDelta(enemy,delta,type){
  const profile=data()?.children[enemy.enemyId]?.propLike;if(!profile)return delta;
  if(!(delta<0))return 0;
  if(profile.acceptSpecificDamageType&&type!==profile.acceptDamageType&&type!=='true')return 0;
  return -1;
 }
 root.ArkEnemyDeathSpawn={owns,plan,waitingIn,takeDue,hpDelta,fallback:enemyId=>data()?.children[enemyId]};
})(typeof window!=='undefined'?window:globalThis);
