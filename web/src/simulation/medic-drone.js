// Silence's disposable device: stock -> paid manual placement -> timed healing.
// Source fields and community lifecycle evidence: docs/mechanics/basic-actions.md.
(function(root){
 'use strict';
 const supported=o=>o?.charId==='char_108_silent'&&o.skill?.sourceId==='skchr_silent_2'&&!!o.basicAttack?.medicDrone;
 const full=o=>supported(o)&&(o.medicDroneStock||0)>=o.skill.blackboard.cnt;
 function stock(o){if(supported(o))o.medicDroneStock=Math.min(o.skill.blackboard.cnt,(o.medicDroneStock||0)+1);}
 function stats(o){
  const p=o.basicAttack,d=p.medicDrone,t=p.training,phase=d.phases[Math.min(t.evolve,d.phases.length-1)],a=phase.frames[0],z=phase.frames.at(-1);
  const f=Math.max(0,Math.min(1,(Math.min(t.level,phase.maxLevel)-a.level)/Math.max(1,z.level-a.level))),stat=k=>Math.round(a.data[k]+(z.data[k]-a.data[k])*f);
  return {maxHp:stat('maxHp'),atk:stat('atk'),def:stat('def'),magicRes:stat('magicResistance'),cost:a.data.cost,blockCnt:a.data.blockCnt,
   attackTime:a.data.baseAttackTime,respawnTime:a.data.respawnTime,rangeGrids:phase.rangeGrids};
 }
 function available(o){return supported(o)&&operatorPresent(o)&&o.deployed&&(o.medicDroneStock||0)>0;}
 function legal(o,row,col){
  if(!available(o)||B.phase!=='battle'||B.over||B.time<(o.medicDroneReadyAt||0)||!Number.isInteger(row)||!Number.isInteger(col))return false;
  if(!isDeployable(row,col,{position:'ALL'})||isBenchSlot(row,col)||(B.dp||0)<stats(o).cost)return false;
  // Keep each player's deployment territory, without imposing the owner's attack range.
  const lv=BDATA.level,mid=Math.floor(lv.cols/2);
  if(lv.halfBoard||o.side){if(o.side==='right'?col<mid:col>=mid)return false;}
  if(lv.sourceRoutes&&typeof G!=='undefined'&&!G?.sourceBossId&&!o.side){
   const z=root.modeBattleZoneRows?.(lv),gates=[];if(z)for(let r=z.lb;r<z.rb;r++)for(let c=0;c<lv.cols;c++)if(lv.grid[r]?.[c]==='tile_start')gates.push(c);
   if(gates.length&&col>=Math.min(...gates))return false;
  }
  return ![...B.operators,...(B.summoneds||[]),...(B.traps||[])].some(t=>!t.removed&&(!t.dead||t.tacticalDormant)&&t.row===row&&t.col===col);
 }
 function deploy(o,row,col,dir='up'){
  if(!legal(o,row,col))return false;
  const d=o.basicAttack.medicDrone,a=stats(o);
  const s={...a,id:'medic-drone:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,playerId:o.playerId,side:o.side,
   charId:d.charId,name:d.name,combatToken:true,medicDrone:true,untargetable:true,canAttack:false,profession:'TOKEN',position:d.position,
   row,col,dir,hp:a.maxHp,deployed:true,deployAt:B.time,deployT:1,dead:false,buffs:[],events:[],
   basicAttack:{action:'none',noDirectHeal:true},attributeBase:{version:root.ArkAttributes.version,atk:a.atk,def:a.def,aspd:1},
   bornAt:B.time,expiresAt:B.time+d.lifetime,life:d.lifetime,healTicks:0};
  s.cells=rangeCellsFor(s);B.dp-=a.cost;o.medicDroneStock--;o.medicDroneReadyAt=B.time+a.respawnTime;(B.summoneds||=[]).push(s);return s;
 }
 function retreat(s){if(!s?.medicDrone||s.dead||s.removed)return false;s.removed=true;s.dead=true;s.life=0;return true;}
 function advance(s){
  if(!s.medicDrone||s.dead)return;
  // Absolute half-second ticks are snapshot-safe and do not drift with render rate.
  const end=Math.min(B.time,s.expiresAt),due=Math.floor((end-s.bornAt+1e-9)/s.attackTime);
  while(s.healTicks<due){s.healTicks++;
   for(const t of healingAllies(s))healOperator(s,t,operatorAttackPower(s,buffMul(s).atk),{visual:s.healTicks===due});
   s.lastHealAt=s.bornAt+s.healTicks*s.attackTime;
  }
  s.life=Math.max(0,s.expiresAt-B.time);if(B.time+1e-9>=s.expiresAt)retreat(s);
 }
 function draw(ctx,board,tile){for(const s of board.summoneds||[])if(s.medicDrone&&!s.dead){
  const x=(s.col+.5)*tile,y=(s.row+.5)*tile;
  ctx.save();ctx.fillStyle='#123b38';ctx.strokeStyle='#78f7c8';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(x,y,tile*.26,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#b9ffe4';ctx.fillRect(x-tile*.04,y-tile*.15,tile*.08,tile*.3);ctx.fillRect(x-tile*.15,y-tile*.04,tile*.3,tile*.08);
  const pulse=Math.max(0,1-(board.time-(s.lastHealAt??-1))/.3);
  if(pulse){ctx.fillStyle='rgba(110,255,199,'+(pulse*.12)+')';for(const [r,c]of s.cells)ctx.fillRect(c*tile+2,r*tile+2,tile-4,tile-4);}
  ctx.fillStyle='#5ff0b1';ctx.fillRect(x-tile*.35,y+tile*.34,tile*.7*Math.max(0,(s.expiresAt-board.time)/(s.expiresAt-s.bornAt)),tile*.04);ctx.restore();
 }}
 root.ArkMedicDrone={supported,full,stock,stats,available,legal,deploy,retreat,advance,draw};
})(typeof window==='undefined'?globalThis:window);
