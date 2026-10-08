// Ordinary delayed INPUT_VECTOR3 bodies. Source selection and impact area are
// distinct; the engine persists the ordinary cursor and emitted packet.
(function(root){
'use strict';
const PROVIDER='enemy-attached-projectiles',RULE='ordinary-attach-input-vector-delayed-circle-v1';
const copy=v=>JSON.parse(JSON.stringify(v)),finite=Number.isFinite;
function profile(e){const p=root.ArkExternalCombat?.profile(e)?.attachedProjectile;
 return !e?.bossMechanics?.attack&&!e?.bombAttack&&p?.rule===RULE&&p.kind==='ordinary-attached-area'?p:null;}
function enabled(e,channel='attack'){const p=profile(e);return !!p&&(e.externalCombatMode??0)===p.modeIndex&&p.channels.includes(channel);}
function position(t){const x=t?.col??t?.x,y=t?.row??t?.y;return finite(x)&&finite(y)?{x,y}:null;}
function live(t,c){return !!t&&!t.dead&&t.hp>0&&!t.removed&&!t.untargetable&&!t.targetFree&&position(t)&&
 c.allEntities?.includes(t)&&(t.deployAt??0)<=c.time&&(t.col==null||(t.deployT||0)>=1);}
function priority(t,time){return root.ArkClientPrograms?.targetPriority(t,time)??t.tauntLevel??t.sourceAttributes?.tauntLevel??0;}
function marked(t,key,time){return root.ArkOperatorCombat?.sourceBuffActive(t,key)||
 (t.sourceMarkerBuffs||[]).some(b=>b.key===key&&b.until>time);}
function start(e,c={}){
 const p=profile(e),channel=c.channel??'attack';if(!enabled(e,channel)||!live(e,c)||!finite(c.interval)||c.interval<=0)return null;
 const s=p.selector,at=position(e),radius=e.rangeRadius>0?e.rangeRadius:s.range.default;
 if(s.kind!=='buff-priority'||s.sort!=='marked-first-then-hatred'||!s.unmarkedFallback||s.limit!==1||!(radius>0))return null;
 const targets=[...new Set(c.candidates||[])].filter(t=>live(t,c)&&!(t.invisibleUntil>c.time)&&!(t.camouflageUntil>c.time)&&
  Math.hypot(position(t).x-at.x,position(t).y-at.y)<=radius+1e-9)
  .map((t,index)=>({t,index})).sort((a,b)=>Number(!!marked(b.t,s.buffKey,c.time))-Number(!!marked(a.t,s.buffKey,c.time))||
   priority(b.t,c.time)-priority(a.t,c.time)||(b.t.deployAt??0)-(a.t.deployAt??0)||b.index-a.index).slice(0,1).map(v=>v.t);
 if(!targets.length)return null;
 const schedule=root.ArkExternalCombat.actionTiming(p.action,c.interval);if(!schedule)return null;
 Object.assign(schedule,{provider:PROVIDER,attachedProjectile:true,channel,modeIndex:p.modeIndex,
  attachPacket:{version:1,provider:PROVIDER,sourceEnemyId:e.enemyId,damageType:schedule.damageType,projectile:copy(p.projectile)}});
 return {targets,schedule};
}
function delivery(e,schedule,targets,c={}){
 const packet=schedule?.attachPacket,target=targets?.[0];
 if(packet?.provider!==PROVIDER||schedule!==e.atkSchedule||!live(e,c)||!live(target,c)||targets.length!==1||
  (e.externalCombatMode??0)!==schedule.modeIndex||!finite(c.attackPower)||c.attackPower<0)return [];
 const at=position(target),p=packet.projectile,rangeScale=c.rangeScale??1,outputScale=c.outputScale??1;
 if(!(rangeScale>0)||!finite(rangeScale)||!finite(outputScale)||outputScale<0)return [];
 return [{target,x:at.x,y:at.y,tx:at.x,ty:at.y,speed:0,kind:'enemy-static-area',life:p.lifeTime,
  resolveAt:c.time+p.delay,enemyActionPacket:{...copy(packet),atk:c.attackPower,outputScale,radius:p.radius*rangeScale}}];
}
function areaVictims(p,c={}){
 const packet=p?.enemyActionPacket;if(packet?.provider!==PROVIDER||packet.version!==1||!finite(packet.radius)||packet.radius<=0)return [];
 return [...new Set(c.candidates||[])].filter(t=>live(t,c)&&Math.hypot(position(t).x-p.tx,position(t).y-p.ty)<=packet.radius+1e-9);
}
root.ArkEnemyAttachedProjectiles={profile,enabled,start,delivery,areaVictims};
})(typeof window!=='undefined'?window:globalThis);
