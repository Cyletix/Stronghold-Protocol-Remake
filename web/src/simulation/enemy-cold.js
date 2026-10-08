(function(root){
 'use strict';
 const data=()=>root.ArkEnemyColdData;
 function configure(enemy,base){
  const profile=data()?.enemies[enemy.enemyId];if(!profile)return;
  enemy.atkType=profile.damageType;
  enemy.applyWay=base.applyWay??profile.applyWay;enemy.canAttack=base.canAttack??profile.canAttack;enemy.flying=base.flying??profile.flying;
  // A stage's resolved blackboard takes precedence, including an explicitly empty one.
  const bb=Object.fromEntries((base.sourceTalentBlackboard??profile.blackboard).map(x=>[x.key,x.value]));
  if(profile.kind==='death-cold')enemy.deathCold={...data().deathBlast,scale:bb['boom.atk_scale']||0,duration:bb['boom.freeze']||0};
  if(profile.kind==='frozen-attack')enemy.frozenAttackScale=bb['atkup.atk_scale']??1;
 }
 const frozen=(unit,time)=>unit.freezeUntil>time||unit.frozenUntil>time;
 const immune=(unit,key)=>!!(unit[key]||unit.sourceAttributes?.[key]);
 function apply(unit,duration,time){
  if(unit.dead||unit.untargetable||duration<=0||immune(unit,'coldImmune'))return;
  const resistance=root.ArkSkillAuras?.statusResistance?.(unit,time)??unit.statusResistance??0;
  const until=time+duration*(1-Math.max(0,Math.min(1,resistance)));
  if((unit.coldUntil>time||unit.frozenUntil>time)&&!immune(unit,'frozenImmune')&&!root.ArkSkillModes?.immune(unit,'frozen',time)){
   unit.frozenUntil=Math.max(unit.frozenUntil||0,until);unit.coldUntil=0;
  }else unit.coldUntil=Math.max(unit.coldUntil||0,until);
 }
 function clear(unit){unit.coldUntil=0;unit.frozenUntil=0;unit.freezeUntil=0;}
 function display(unit,time){
  if(frozen(unit,time))return {label:'冻结',seconds:Math.max(unit.freezeUntil||0,unit.frozenUntil||0)-time};
  if(unit.coldUntil>time)return {label:'寒冷',seconds:unit.coldUntil-time};
  return null;
 }
 root.ArkEnemyCold={configure,apply,clear,frozen,display,
  ownsAttackTalent:enemy=>data()?.enemies[enemy.enemyId]?.kind==='frozen-attack',
  aspd:(unit,time)=>unit.coldUntil>time?data().coldAspd:0,
  attackScale:(enemy,target,time)=>frozen(target,time)?(enemy.frozenAttackScale??1):1,
  silenced:(enemy,time)=>enemy.silenced===true||enemy.silenceUntil>time};
})(typeof window!=='undefined'?window:globalThis);
