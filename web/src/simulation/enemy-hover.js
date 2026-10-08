// Mode-owned FLY Buff. All mutable state is serializable for host checkpoints.
(function(root){
'use strict';
function profile(enemy){return !enemy?.bossMechanics&&root.ArkExternalCombat?.profile(enemy)?.hover;}
function configure(enemy){
 const data=profile(enemy);if(data?.rule!=='mode-hover-disable-landing-v1')return null;
 const mode=enemy.externalCombatMode;
 if(![data.hoverMode,data.groundMode].includes(mode))return null;
 let state=enemy.externalHover;
 if(!state)state=enemy.externalHover={version:1,baseMotion:enemy.motion??data.defaultMotion,
  baseFlying:!!enemy.flying,modeIndex:null,landings:0};
 if(state.version!==1||!Number.isInteger(state.landings)||state.landings<0)return null;
 state.modeIndex=mode;
 enemy.motion=mode===data.hoverMode?data.motion:state.baseMotion;
 enemy.flying=mode===data.hoverMode?data.motion==='FLY':state.baseFlying;
 return state;
}
function refresh(enemy,time){
 if(enemy.dead||!(enemy.hp>0))return false;
 const data=profile(enemy),state=configure(enemy);
 if(!state||state.modeIndex!==data.hoverMode)return false;
 const flags=data.disabledBy;
 const until=(...keys)=>keys.some(key=>enemy[key]>time);
 const disabled=(flags.stun&&(until('stunUntil')||root.ArkSkillBlockees?.stunned(enemy,time)))||
  (flags.freeze&&until('freezeUntil','frozenUntil','allyFrozenUntil'))||
  (flags.groundBound&&(enemy.groundBound===true||until('groundBoundUntil')))||
  (flags.silence&&(enemy.silenced===true||until('silenceUntil')))||
  (flags.levitate&&until('levitateUntil'));
 if(!disabled)return false;
 // Mark before changing mode: detachment/configuration must not re-fire this
 // edge. The new mode restores source ground motion; effects never re-hover
 // just because the control status ends.
 if(!root.ArkExternalCombat.setMode(enemy,data.groundMode))return false;
 state.landings++;state.landedAt=time;
 if(!enemy.stunImmune&&!enemy.sourceAttributes?.stunImmune)
  enemy.stunUntil=Math.max(enemy.stunUntil||0,time+data.landingStun);
 return true;
}
root.ArkEnemyHover={profile,configure,refresh};
})(typeof globalThis!=='undefined'?globalThis:this);
