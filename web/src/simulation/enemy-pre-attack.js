(function(root){
'use strict';
const RULE='root-melee-no-pre-animation-v1';
function profile(enemy){return !enemy?.bossMechanics?.attack&&root.ArkExternalCombat?.profile(enemy)?.preAttack;}
function observe(enemy,context){
 if(!profile(enemy))return;
 if(enemy.dead||!context?.blocked||context.interrupted)enemy.externalPreAttack=null;
}
function schedule(enemy,interval,context){
 const data=profile(enemy);
 if(data?.rule!==RULE||context?.channel!=null&&context.channel!=='combat'||!Number.isFinite(interval)||interval<=0)return null;
 const first=enemy.externalPreAttack?.active!==true,timing=first?data.first:data.repeat;
 if(!(timing?.duration>0)||!Number.isFinite(timing.hit)||timing.hit<0||timing.hit>timing.duration||data.maxAnimScale!==1)return null;
 // Native supplier uses min(interval / animation duration, maxAnimScale),
 // without the AbstractAnimatedAbility 0.1 floor used by other actions.
 const scale=Math.min(interval/timing.duration,data.maxAnimScale),duration=timing.duration*scale;
 const hit=timing.hit*scale,total=Math.max(interval,duration);
 enemy.externalPreAttack={active:true};
 return {windup:hit,strike:0,recovery:total-hit,hitOffsets:[hit],nextHit:0,elapsed:0,total,
  animation:timing.animation,firstAttack:first,source:RULE,channel:'combat',delivery:data.delivery,
  atkScale:data.atkScale,damageType:data.damageType};
}
root.ArkEnemyPreAttack={observe,schedule};
})(typeof window!=='undefined'?window:globalThis);
