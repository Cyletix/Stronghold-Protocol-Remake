// Complete source listener contracts feeding the shared enemy skill scheduler.
(function(root){
'use strict';
function profile(enemy){return root.ArkExternalCombat?.profile(enemy)?.selfCastLifecycle;}
function parameters(enemy){
 const data=profile(enemy);if(data?.kind!=='hp-listener-self-cast')return null;
 const values={hpRatio:data.hpRatio.default,sleepDuration:data.sleepDuration.default},seen=new Set();
 for(const item of enemy.sourceTalentBlackboard||[]){
  const name=['hpRatio','sleepDuration'].find(key=>data[key].key===item.key);if(!name)continue;
  if(seen.has(name)||item.valueStr||!Number.isFinite(item.value))return null;
  seen.add(name);values[name]=item.value;
 }
 if(!Number.isFinite(values.hpRatio)||values.hpRatio<0||values.hpRatio>1||
  !Number.isFinite(values.sleepDuration)||values.sleepDuration<0)return null;
 return values;
}
function configure(enemy){
 const data=profile(enemy),params=parameters(enemy);
 if(!data||!params||!Number.isFinite(data.interval)||data.interval<=0)return null;
 let state=enemy.externalSelfCast;
 if(!state)state=enemy.externalSelfCast={version:1,modeIndex:null,marks:{},listenerRemaining:0,sleepRemaining:0};
 if(state.version!==1||!state.marks)return null;
 if(state.modeIndex!==enemy.externalCombatMode){
  state.modeIndex=enemy.externalCombatMode;
  state.listenerRemaining=data.waitFirstInterval?data.interval:0;
  // Both listener and sleep Buff are managed by the source mode. Re-entering
  // mounts fresh instances; the skill's independent permanent mark survives.
  state.sleepRemaining=state.modeIndex===data.modeIndex?params.sleepDuration:0;
 }
 return state;
}
function hasMark(enemy,key){return !!enemy.externalSelfCast?.marks?.[key];}
function addMark(enemy,key){
 const data=profile(enemy),state=configure(enemy);
 if(!state||key!==data.awakeMark)return false;
 state.marks[key]=true;return true;
}
function canMove(enemy){
 const data=profile(enemy),state=configure(enemy);
 return !state||enemy.externalCombatMode!==data.modeIndex||state.sleepRemaining<=0;
}
function disarmed(enemy){
 const data=profile(enemy),state=configure(enemy);
 return !!state&&enemy.externalCombatMode===data.modeIndex&&data.flags.includes('DISARMED');
}
function tick(enemy,dt,context){
 if(enemy.dead||!Number.isFinite(dt)||dt<0)return;
 const data=profile(enemy),params=parameters(enemy),state=configure(enemy);
 if(!state||enemy.externalCombatMode!==data.modeIndex)return;
 state.sleepRemaining=Math.max(0,state.sleepRemaining-dt);
 state.listenerRemaining-=dt;
 if(state.listenerRemaining>1e-9)return;
 // A failed check has no actions. Coalesce missed identical checks, preserving
 // the periodic phase without polling once per 0.01 second of a large frame.
 state.listenerRemaining+=data.interval*(Math.floor(Math.max(0,-state.listenerRemaining)/data.interval)+1);
 if(!(enemy.hp>0)||!(enemy.maxHp>0)||!(enemy.hp/enemy.maxHp<params.hpRatio)||
  hasMark(enemy,data.awakeMark)||context?.unbalanced)return;
 const cast=root.ArkEnemySkills?.triggerNamed(enemy,data.skillKey,data.call,context);
 if(!cast)return;
 enemy.atkSchedule=cast.schedule;enemy.atkTargets=cast.targets;enemy.atkTarget=cast.targets[0]||null;
 enemy.atkPhase='self';enemy.atkTimer=cast.schedule.total;enemy.atkTotal=cast.schedule.total;enemy.atkAnimAt=context.time;
 if(data.call.clearPalsyingBuffBeforeTrigger)enemy.palsyUntil=0;
}
root.ArkEnemySkillLifecycle={profile,parameters,configure,tick,canMove,disarmed,hasMark,addMark};
})(typeof globalThis!=='undefined'?globalThis:this);
