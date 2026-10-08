// Blacknight's resting beast is damageable; a defeated tactical point is not.
// Source keys and the remaining geometry boundary are recorded in docs/mechanics/tactician.md.
(function(root){
 'use strict';
 const beast=s=>s?.tacticalKind==='hypnos';
 const canHitSleeping=s=>beast(s)&&operatorPresent(s);
 const resting=s=>beast(s)&&!!s.hypnos?.resting;
 function sync(e){
  const state=e.hypnosSleep;if(!state)return;
  if(e.sleepUntil!==state.published)state.external=Math.max(state.external,e.sleepUntil||0);
  if(e.dead||!!e.revived!==state.revived){delete e.hypnosSleep;e.sleepUntil=0;return;}
  for(const [id,until]of Object.entries(state.sources))if(until<=B.time)delete state.sources[id];
  e.sleepUntil=state.published=Math.max(state.external,...Object.values(state.sources),0);
  if(!Object.keys(state.sources).length)delete e.hypnosSleep;
 }
 function applySleep(e,s,until){
  if(e.dead||e.flying||e.sleepImmune||e.sourceAttributes?.sleepImmune)return;
  sync(e);
  const state=e.hypnosSleep??={external:e.sleepUntil||0,published:e.sleepUntil||0,revived:!!e.revived,sources:{}};
  state.sources[s.id]=Math.max(state.sources[s.id]||0,until);sync(e);
 }
 function clear(s){
  if(!beast(s))return;
  for(const e of B.enemies){sync(e);if(e.hypnosSleep){delete e.hypnosSleep.sources[s.id];sync(e);}}
  s.hypnos={};
 }
 function canCast(o){
  if(o.charId!=='char_476_blkngt')return true;
  const s=root.ArkTactician.point(o);
  // Automatic chess casting waits for the existing S2 window, retaining charges.
  return !(o.skill.sourceId==='skchr_blkngt_2'&&s?.hypnos?.artsUntil>B.time);
 }
 function cast(o){
  const s=root.ArkTactician.point(o),b=o.skill.blackboard;
  root.onSkillDp?.(b.cost,o);
  if(!s)return;
  if(o.skill.sourceId==='skchr_blkngt_1'){
   if(!operatorPresent(s))return;
   s.buffs=s.buffs.filter(b=>!b.hypnosRage);clear(s);
   s.hypnos={resting:true,regen:b.hp_recovery_per_sec_by_max_hp_ratio,
    atk:b['blkngt_hypnos_s_1[rage].atk'],aspd:b['blkngt_hypnos_s_1[rage].attack_speed'],duration:b['blkngt_hypnos_s_1[rage].duration']};
  }else{
   const until=B.time+b['blkngt_s_2.duration'];
   s.hypnos??={};s.hypnos.artsUntil=until;s.hypnos.sleepScale=b['blkngt_s_2.atk_scale'];
   for(const e of B.enemies)if(enemyInOperatorRange(s,e))applySleep(e,s,until);
   (B.combatEffects??=[]).push({kind:'hypnos-sleep',at:B.time,duration:.6,cells:s.cells.map(c=>[...c])});
  }
 }
 function onDamaged(s,actual){
  if(!resting(s)||actual<=0||s.hp<=0)return;
  const h=s.hypnos;h.resting=false;
  s.buffs.push({hypnosRage:true,atk:1+h.atk,aspd:1+h.aspd,until:B.time+h.duration});
 }
 function advance(s,o,dt){
  for(const e of B.enemies)sync(e);
  if(resting(s)&&operatorPresent(s))s.hp=Math.min(s.maxHp,s.hp+s.maxHp*s.hypnos.regen*Math.max(0,dt));
 }
 function plan(s,p){if(beast(s)&&s.hypnos?.artsUntil>B.time){p.kind='splash';p.radius=1.1;p.damageType='arts';}}
 function scale(s,e){return beast(s)&&s.hypnos?.artsUntil>B.time&&e.sleepUntil>B.time?s.hypnos.sleepScale:1;}
 function aura(s){
  const o=beast(s)?root.ArkTactician.owner(s):s;
  if(o?.charId!=='char_476_blkngt'||!operatorPresent(o))return 0;
  const talent=o.combatTalents?.find(t=>t.name==='点梦');
  if(!talent)return 0;
  const valid=e=>e&&!e.dead&&e.sleepUntil>B.time&&enemyInOperatorRange(o,e),id=e=>e.visualId??e.id;
  const state=o.hypnosAura??={nextAt:0,provider:null};
  if(B.time+1e-9>=state.nextAt){const e=B.enemies.find(valid);state.provider=e?id(e):null;state.nextAt=B.time+.1;}
  // A provider dying during splash removes the buff immediately; the next enemy
  // cannot provide it until the next 0.1 s detection, even within the same attack.
  return valid(B.enemies.find(e=>id(e)===state.provider))?talent.blackboard.find(b=>b.key==='atk')?.value||0:0;
 }
 function priority(s,e){return canHitSleeping(s)&&e.sleepUntil>B.time?1:0;}
 function draw(ctx,board,tile){
  for(const s of board.summoneds||[])if(beast(s)&&!s.dead&&!s.removed){
   const text=s.hypnos?.resting?'休眠 Zzz':s.hypnos?.artsUntil>board.time?'安眠 · 法术':'';
   if(text){ctx.fillStyle='#d4b8ff';ctx.font='bold '+Math.max(8,tile*.13)+'px sans-serif';ctx.fillText(text,(s.col+.5)*tile,(s.row+.28)*tile);}
  }
  for(const e of board.enemies||[])if(!e.dead&&e.sleepUntil>board.time){ctx.fillStyle='#d4b8ff';ctx.font='bold '+Math.max(10,tile*.2)+'px sans-serif';ctx.fillText('Zzz',(e.x+.5)*tile,(e.y+.15)*tile);}
  for(const fx of board.combatEffects||[])if(fx.kind==='hypnos-sleep'&&board.time-fx.at<fx.duration){
   ctx.strokeStyle='#d4b8ff';ctx.fillStyle='rgba(175,128,255,.16)';ctx.lineWidth=2;
   for(const [r,c]of fx.cells){ctx.fillRect(c*tile+2,r*tile+2,tile-4,tile-4);ctx.strokeRect(c*tile+2,r*tile+2,tile-4,tile-4);}
  }
 }
 root.ArkBlacknight={beast,canHitSleeping,resting,clear,canCast,cast,onDamaged,advance,plan,scale,aura,priority,draw};
})(typeof window!=='undefined'?window:globalThis);
