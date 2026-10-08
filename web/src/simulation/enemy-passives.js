(function(root){
 'use strict';
 const blockFree=enemy=>!!root.ArkEnemyPassiveData?.enemies[enemy.enemyId]?.blockFree;
 function configure(enemy,board){
  if(!blockFree(enemy))return;
  enemy.unblockable=true;
  // Source buffs are permanent and not silenceable. Release a stale link before
  // target selection, including legacy/restored boards that predate this profile.
  if(enemy.blockerId!=null){
   const blocker=[...(board?.operators||[]),...(board?.summoneds||[])].find(o=>o.id===enemy.blockerId);
   if(blocker)blocker.blocked=Math.max(0,(blocker.blocked||0)-1);
   enemy.blockerId=null;
  }
 }
 function sync(board){for(const enemy of board?.enemies||[])configure(enemy,board);}
 function diagnostic(board,enemy,reason){
  const list=board.enemyPassiveDiagnostics||=[];
  if(!list.some(x=>x.enemyId===enemy.enemyId&&x.reason===reason))list.push({enemyId:enemy.enemyId,reason});
  if(list.length>32)list.shift();return {status:reason};
 }
 function onTakingDamage(enemy,amount,board,applyTransfer,context={}){
  const profile=root.ArkEnemyPassiveData?.enemies[enemy?.enemyId]?.damageTransfer;
  if(!profile)return {status:'not-bound'};
  if(context.skipModifierEvents||context.cancelled||context.kind&&context.kind!=='damage'||!(amount>0)||!Number.isFinite(amount))return {status:'event-not-applicable'};
  // Buff source blackboards can override the selector alias and FixedValueDamage
  // scale. Alias changes need their own source graph; never silently use BossSelector.
  const bb=Object.fromEntries((enemy.sourceTalentBlackboard||[]).map(x=>[x.key,x.valueStr||x.value]));
  if(bb.ability_name!=null&&bb.ability_name!=='BossSelector')return diagnostic(board,enemy,'unsupported-selector-alias');
  const scale=bb[profile.scaleKey]??profile.scaleDefault;
  if(!Number.isFinite(scale)||scale<0)return diagnostic(board,enemy,'unsupported-transfer-scale');
  const targets=(board.enemies||[]).filter(e=>!e.dead&&e.hp>0&&!e.untargetable&&!e.targetFree&&profile.targetIds.includes(e.enemyId)
   &&(e.sourceLevelType??root.ArkEnemyPassiveData.enemies[e.enemyId].levelType)===profile.requiredLevel);
  if(!targets.length)return {status:'no-target'};
  // Current stages have one marked boss. HATRED_DES tie behavior is not recovered;
  // decline ambiguous custom boards instead of choosing array order or all targets.
  if(targets.length!==1)return diagnostic(board,enemy,'ambiguous-boss-selector');
  if(typeof applyTransfer!=='function')throw Error('Enemy damage transfer requires an engine damage callback');
  const transfer=amount*scale;if(!(transfer>0)||!Number.isFinite(transfer))return {status:'zero-or-invalid-transfer'};
  applyTransfer(targets[0],transfer,{damageType:profile.damageType,skipModifierEvents:true,noSourceDamage:true});
  return {status:'transferred',amount:transfer,targetId:targets[0].visualId??targets[0].id};
 }
 function onKilled(enemy,board,killTarget,context={}){
  const profile=root.ArkEnemyPassiveData?.enemies[enemy?.enemyId]?.deathCleanup;
  if(!profile)return {status:'not-bound'};
  if(!enemy.dead||context.cancelled||context.reason==='LEAK')return {status:'event-not-applicable'};
  if(enemy.passiveDeathCleanupDone)return {status:'already-dispatched'};
  if(typeof killTarget!=='function')throw Error('Enemy death cleanup requires an engine instant-kill callback');
  // This event is dispatched once after final death, not on the revive transition.
  // It is independent of modifier events: lethal skip-events damage still kills.
  enemy.passiveDeathCleanupDone=true;
  const bb=Object.fromEntries((enemy.sourceTalentBlackboard||[]).map(x=>[x.key,x.valueStr||x.value]));
  if(bb.ability_name!=null&&bb.ability_name!=='BossSelector')return diagnostic(board,enemy,'unsupported-selector-alias');
  const targets=(board.enemies||[]).filter(e=>e!==enemy&&!e.dead&&e.hp>0&&!e.untargetable&&!e.targetFree
   &&profile.targetIds.includes(e.enemyId)
   &&root.ArkEnemyPassiveData.enemies[e.enemyId]?.permanentMarks?.includes(profile.requiredBuff)
   &&profile.allowedLevels.includes(e.sourceLevelType??root.ArkEnemyPassiveData.enemies[e.enemyId].levelType));
  // A second live achunt can recursively run this all-target selector. Until its
  // hatred order is recovered, decline that custom-board combination explicitly.
  if(targets.some(e=>root.ArkEnemyPassiveData.enemies[e.enemyId]?.deathCleanup))return diagnostic(board,enemy,'unsupported-multiple-cleanup-owners');
  const killed=[];
  for(const target of targets){
   if(target.dead||!(target.hp>0))continue;
   // InstantKill -> Suicide -> SetHpInternal(0, force=true, skipReborn=false).
   // Do not turn this into damage, which would invoke shields/transfer callbacks.
   killTarget(target,{reason:'DEATH',skipReborn:false,sourceEnemyId:enemy.enemyId,sourceVisualId:enemy.visualId});
   killed.push(target.visualId??target.id);
  }
  return {status:'cleanup-dispatched',targets:killed};
 }
 root.ArkEnemyPassives={blockFree,configure,sync,onTakingDamage,onKilled};
})(typeof window!=='undefined'?window:globalThis);
