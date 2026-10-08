// Source traits/skills: character_table, skill_table, battle_equip_table.
// Reload and friendly-cold timing references/limits: docs/mechanics/hunter.md.
(function(root){
 'use strict';
 const skillIds=['skchr_snhunt_1','skchr_snhunt_2'];
 const isHunter=o=>operatorAttackProfile(o).subProfession==='hunter';
 function ensure(o){
  if(!isHunter(o))return null;
  const p=operatorAttackProfile(o),max=p.bb?.value;
  if(!(max>0&&p.hunter?.reloadInterval>0))return null;
  if(!o.hunter)o.hunter={ammo:max,max,reloadLeft:0,reloadTotal:0,emptyReload:false};
  o.hunter.max=max;o.hunter.ammo=Math.min(max,o.hunter.ammo);return o.hunter;
 }
 function update(o,dt){
  const h=ensure(o);if(!h||!operatorPresent(o)||!o.deployed)return;
  if(!operatorCanAct(o)){h.reloadLeft=0;return;} // interrupted ordinary action; no completed reload
  if(h.reloadLeft>0){
   h.reloadLeft=Math.max(0,h.reloadLeft-dt);
   if(h.reloadLeft<1e-9){
    h.reloadLeft=0;h.ammo=Math.min(h.max,h.ammo+1+(h.emptyReload?(operatorAttackProfile(o).bb.extra_add||0):0));
    (B.combatEffects||=[]).push({kind:'hunter-reload',x:o.col,y:o.row,at:B.time,duration:.35});
   }
  }
 }
 function ready(o,hasTarget){
  const h=ensure(o);if(!h)return true;
  if(h.reloadLeft>0)return false;
  if(h.ammo>0&&hasTarget)return true;
  if(h.ammo<h.max){
   h.reloadTotal=operatorAttackProfile(o).hunter.reloadInterval;
   h.reloadLeft=h.reloadTotal;h.emptyReload=h.ammo===0;
  }
  return false;
 }
 function consume(o){const h=ensure(o);if(h)h.ammo=Math.max(0,h.ammo-1);}
 function canCast(o){
  if(!skillIds.includes(o.skill?.sourceId))return true;
  const targets=B.enemies.some(e=>!e.dead&&e.hp>0&&!(e.sleepUntil>B.time)&&!(e.invisibleUntil>B.time)&&enemyInOperatorRange(o,e));
  if(!targets)return false;
  if(o.skill.sourceId==='skchr_snhunt_1'){const h=ensure(o);return !h||h.ammo>0&&!h.reloadLeft;}
  return true; // S2 uses special rounds, independent of the magazine.
 }
 const handledTalent=(t,id)=>id==='char_4211_snhunt'&&t.name==='裂云一击';
 function cast(o){
  const t=(o.combatTalents||[]).find(t=>handledTalent(t,o.charId));if(!t)return;
  const target=B.enemies.filter(e=>!e.dead&&e.hp>0&&!(e.sleepUntil>B.time)&&!(e.invisibleUntil>B.time)&&enemyInOperatorRange(o,e))
   .sort((a,b)=>dist(o,a)-dist(o,b)||String(a.id).localeCompare(String(b.id)))[0];
  if(!target)return;
  const bb=Object.fromEntries(t.blackboard.map(x=>[x.key,x.value]));
  spawnProjectile({kind:'operator-pulse',enemy:false,basicAttack:false,owner:o,target,x:o.col,y:o.row,tx:target.x,ty:target.y,
   resolveAt:B.time+.1,life:1,plan:{kind:'single',hits:1,scale:bb.atk_scale,power:operatorAttackPower(o,buffMul(o).atk),damageType:'phys',cold:bb.cold,hunterTalent:true}});
 }
 function frozen(e,time){return e.allyFrozenUntil>time;}
 function cold(e,duration,time){
  const immune=k=>e[k]||e.sourceAttributes?.[k];
  if(e.dead||duration<=0||immune('coldImmune'))return;
  const d=duration*(1-Math.max(0,Math.min(1,root.ArkSkillAuras?.statusResistance?.(e,time)??e.statusResistance??0)));
  if(d<=0)return;
  if(e.allyColdUntil>time&&!immune('frozenImmune')){
   e.allyFrozenUntil=Math.max(e.allyFrozenUntil||0,time+Math.max(d,e.allyColdDuration||0));
   e.allyColdUntil=0;e.allyColdDuration=0;
   // Interrupt an unlaunched attack, retaining block ownership and projectiles already in flight.
   e.atkPhase=null;e.atkTimer=0;e.atkTarget=null;e.atkTargets=null;
  }else{
   if(!(e.allyColdUntil>time)||time+d>e.allyColdUntil){e.allyColdUntil=time+d;e.allyColdDuration=d;}
  }
 }
 function clearCold(e){e.allyColdUntil=0;e.allyColdDuration=0;e.allyFrozenUntil=0;}
 function enemyTempo(e,time){
  const speed=e.sourceAttributes?.attackSpeed||100;
  if(root.ArkSkillAuras?.attribute){
   const current=speed+(e.allyColdUntil>time?root.ArkHunterRules.coldAspd:0);
   return Math.max(10,Math.min(600,root.ArkSkillAuras.attribute(e,'attack_speed',speed,current,time)))/speed;
  }
  return e.allyColdUntil>time?Math.max(10,speed+root.ArkHunterRules.coldAspd)/speed:1;
 }
 function nonMoving(e){
  // Source action states, not frame-to-frame position deltas. Missing special
  // spawn/rebirth/teleport actions remain an explicit gap in the enemy executor.
  if(e.spawnState||e.rebirthState||e.teleporting)return false;
  return !!(e.wait>0||e.atkPhase||root.ArkOperatorCombat?.blockerOf(e)||root.ArkBossMechanics?.stationary(e)
   ||root.ArkSkillBlockees?.stunned(e,B.time)||['stunUntil','sleepUntil','freezeUntil','frozenUntil','allyFrozenUntil','palsyUntil'].some(k=>e[k]>B.time));
 }
 function draw(ctx,board,tile){
  for(const p of board.projectiles||[])if(p.plan?.hunterTalent&&p.life>0){
   const x=((p.target?.x??p.tx)+.5)*tile,y=((p.target?.y??p.ty)+.5)*tile;
   ctx.strokeStyle='#b7eaff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo((p.x+.5)*tile,(p.y+.5)*tile);ctx.lineTo(x,y);ctx.stroke();
   ctx.beginPath();ctx.moveTo(x-tile*.12,y-tile*.15);ctx.lineTo(x,y);ctx.lineTo(x+tile*.12,y-tile*.15);ctx.stroke();
  }
  for(const o of board.operators||[]){const h=o.hunter;if(!h||o.dead||!o.deployed)continue;
   const x=(o.col+.92)*tile,y=(o.row+.22)*tile,w=tile*.05,step=tile*.055;
   ctx.fillStyle='#142b31';ctx.fillRect(x-1,y-1,w+2,step*h.max+2);
   for(let i=0;i<h.max;i++){ctx.fillStyle=i<h.ammo?'#ffe29a':'#426267';ctx.fillRect(x,y+step*(h.max-1-i),w,step*.65);}
   if(h.reloadLeft>0){ctx.fillStyle='#64f0d1';ctx.fillRect(x-3,y+step*h.max+2,(1-h.reloadLeft/h.reloadTotal)*tile*.16,2);}
  }
  for(const e of board.enemies||[]){
   const label=frozen(e,board.time)?'冻结':e.allyColdUntil>board.time?'寒冷':null;if(!label||e.dead)continue;
   ctx.fillStyle='#b7eaff';ctx.strokeStyle='#132531';ctx.lineWidth=2;ctx.font='bold '+Math.max(9,tile*.15)+'px sans-serif';
   ctx.strokeText(label,(e.x+.5)*tile,(e.y+.05)*tile);ctx.fillText(label,(e.x+.5)*tile,(e.y+.05)*tile);
  }
 }
 root.ArkHunter={skillIds,ensure,update,ready,consume,canCast,handledTalent,cast,cold,clearCold,frozen,enemyTempo,nonMoving,draw};
})(typeof window!=='undefined'?window:globalThis);
