// Closed ordinary selectable attacks. The engine owns cooldowns, action cursors
// and the existing projectile queue; this provider only selects and freezes data.
(function(root){
'use strict';
const PROVIDER='enemy-selective-attacks';
const RULE='global-selector-shared-cooldown-multi-ranged-circle-v1';
const finite=Number.isFinite;
const copy=value=>JSON.parse(JSON.stringify(value));
function profile(enemy){
 if(!enemy||enemy.bossMechanics?.attack||enemy.bombAttack)return null;
 const data=root.ArkExternalCombat?.profile(enemy)?.selectableAttack;
 return data?.rule===RULE&&data.kind==='selectable-multi-ranged'?data:null;
}
function enabled(enemy,channel='attack'){
 const data=profile(enemy);
 return !!data&&channel==='attack'&&(enemy.externalCombatMode??0)===0;
}
function alive(target){return !!target&&!target.dead&&target.hp>0&&!target.removed;}
function live(target){return alive(target)&&!target.untargetable&&!target.targetFree;}
function position(target){
 const x=target?.col??target?.x,y=target?.row??target?.y;
 return finite(x)&&finite(y)?{x,y}:null;
}
function present(target,context){
 return Array.isArray(context.allEntities)&&context.allEntities.includes(target);
}
function deployed(target,time){
 return target.col==null||target.row!=null&&(target.deployAt??0)<=time&&(target.deployT||0)>=1;
}
function selectable(target,time){
 return live(target)&&position(target)&&deployed(target,time)&&
  !(target.invisibleUntil>time)&&!(target.camouflageUntil>time);
}
function priority(target,time){
 const value=root.ArkClientPrograms?.targetPriority?.(target,time)??target.tauntLevel??target.sourceAttributes?.tauntLevel??0;
 return finite(value)?value:0;
}
function selectorSupported(selector){
 return selector&&['all','enemy'].includes(selector.side)&&selector.range==='global'&&selector.limit===1&&
  selector.sort==='hatred-desc'&&selector.ignoreTargetFree===false&&selector.forceIgnoreCamouflage===false&&
  selector.motionMask===3&&selector.categoryMask===1&&
  (selector.enemyKey==null&&selector.enemyMode==null||typeof selector.enemyKey==='string'&&selector.enemyKey&&
    Number.isInteger(selector.enemyMode)&&selector.enemyMode>=0);
}
function select(selector,context){
 if(!selectorSupported(selector))return [];
 const pool=selector.side==='all'?context.allEntities:context.candidates;
 if(!Array.isArray(pool))return [];
 return [...new Set(pool)].filter(target=>present(target,context)&&selectable(target,context.time)&&
  (selector.enemyKey==null||target.enemyId===selector.enemyKey&&target.externalCombatMode===selector.enemyMode))
  .map((target,index)=>({target,index})).sort((a,b)=>priority(b.target,context.time)-priority(a.target,context.time)||
   (b.target.deployAt??0)-(a.target.deployAt??0)||b.index-a.index)
  .slice(0,selector.limit).map(row=>row.target);
}
function projectileSupported(projectile){
 return projectile?.kind==='circle'&&finite(projectile.speed)&&projectile.speed>0&&
  finite(projectile.lifeTime)&&projectile.lifeTime>0&&finite(projectile.radius)&&projectile.radius>0&&
  projectile.scalable===true&&projectile.extendable===false&&projectile.maxHitTargets===null&&
  projectile.targetSide==='enemy'&&projectile.ignoreCamouflage===true&&projectile.oncePerTarget===true&&
  projectile.hitAt==='reach-target'&&projectile.stopWhenSourceInvalid===false&&
  projectile.castEndPolicy==='emitted-projectiles-independent'&&
  projectile.includeTraceTargetAtEnd===true&&projectile.tracePolicy==='force-valid-trace-once-at-end'&&
  projectile.movement?.traceTarget===true&&projectile.movement.flyToTargetLocationOnly===false&&
  projectile.movement.fixOnProjectileReached===true&&projectile.movement.clearTraceTargetWhenReached===true&&
  projectile.movement.forceReachedWhenTimeup===true&&projectile.movement.flyThroughDeathArea===false;
}
function start(enemy,context={}){
 const data=profile(enemy),channel=context.channel??'attack';
 if(!enabled(enemy,channel)||!alive(enemy)||!finite(context.time)||!finite(context.interval)||context.interval<=0||
  !present(enemy,context)||!Array.isArray(data.branches)||!data.branches.length||
  data.selection!=='first-eligible-source-order'||data.completion!=='animation-and-additional-shots'||
  data.cooldown?.shared!==true||!projectileSupported(data.projectile))return null;
 // Validate the whole dispatcher before considering its first eligible branch.
 if(data.branches.some((branch,index)=>branch.index!==index||!selectorSupported(branch.selector)||
  branch.action?.selectTargetTiming!=='at-beginning'||branch.action.targetSource!=='selector'||
  branch.action.lifecycle?.waitForProjectileInvalid!==false))return null;
 for(const branch of data.branches){
  const targets=select(branch.selector,context);
  if(!targets.length)continue;
  const action={...data.action,projectile:data.projectile};
  const schedule=root.ArkExternalCombat?.actionTiming(action,context.interval);
  if(!schedule||!Array.isArray(schedule.hitOffsets)||schedule.hitOffsets.length!==branch.action.shots)return null;
  Object.assign(schedule,{provider:PROVIDER,selectiveAttack:true,channel,modeIndex:0,branchIndex:branch.index,
   affectedBySlowDown:branch.action.affectedBySlowDown,
   selectablePacket:{version:1,provider:PROVIDER,sourceEnemyId:enemy.enemyId,branchIndex:branch.index,
    damageType:schedule.damageType,atkScale:schedule.atkScale,projectile:copy(data.projectile),
    castEndPolicy:data.projectile.castEndPolicy}});
  return {targets,schedule};
 }
 return null;
}
function delivery(enemy,schedule,targets,context={}){
 const packet=schedule?.selectablePacket;
 if(schedule?.provider!==PROVIDER||packet?.version!==1||packet.provider!==PROVIDER||
  packet.sourceEnemyId!==enemy?.enemyId||enemy.atkSchedule!==schedule||!alive(enemy)||!present(enemy,context)||
  (enemy.externalCombatMode??0)!==schedule.modeIndex||!projectileSupported(packet.projectile)||
  !finite(context.attackPower)||context.attackPower<0||!finite(context.time))return [];
 const outputScale=context.outputScale??1,rangeScale=context.rangeScale??1;
 if(!finite(outputScale)||outputScale<0||!finite(rangeScale)||rangeScale<=0)return [];
 // The source selects once at cast start. Invalid locked input suppresses the
 // remaining shot; it never silently retargets another entity or stale tile.
 const target=targets?.[0];
 if(targets?.length!==1||!live(target)||!present(target,context)||!position(target)||!deployed(target,context.time))return [];
 return [{target,speed:packet.projectile.speed,life:packet.projectile.lifeTime,
  enemyActionPacket:{...copy(packet),atk:context.attackPower,outputScale,
   radius:packet.projectile.radius*rangeScale}}];
}
function projectileTarget(projectile,context={}){
 const packet=projectile?.enemyActionPacket,target=projectile?.target;
 if(packet?.version!==1||packet.provider!==PROVIDER||!finite(context.time)||!projectileSupported(packet.projectile)||
  !live(target)||!present(target,context)||!position(target)||!deployed(target,context.time))return null;
 // Cast-time key/mode/visibility qualifiers do not reselect a tracked shot.
 // Source _stopWhenSourceInvalid=0 leaves emitted shots independent of owner.
 return target;
}
function areaVictims(projectile,context={}){
 const packet=projectile?.enemyActionPacket,center=position(projectile);
 if(packet?.version!==1||packet.provider!==PROVIDER||!finite(context.time)||!projectileSupported(packet.projectile)||
  !center||!finite(packet.radius)||packet.radius<=0||!Array.isArray(context.candidates))return [];
 const selected=[...new Set(context.candidates)].filter(target=>{
  const at=position(target);
  return live(target)&&present(target,context)&&deployed(target,context.time)&&at&&
   Math.hypot(at.x-center.x,at.y-center.y)<=packet.radius+1e-9;
 });
 // Source hit options select opponents; alwaysHitTraceTargetInTheEnd adds the
 // live trace separately. This cross-source inferred policy is explicit in IR.
 const trace=projectileTarget(projectile,context);
 if(trace&&!selected.includes(trace))selected.push(trace);
 return selected;
}
root.ArkEnemySelectiveAttacks={profile,enabled,start,delivery,projectileTarget,areaVictims};
})(typeof window!=='undefined'?window:globalThis);
