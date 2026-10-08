// Standard substitute forms and exact skill families. Source/limits: docs/mechanics/dollkeeper.md.
(function(root){
 'use strict';
 const ids=['char_4016_kazema','char_1023_ghost2','char_369_bena','char_4107_vrdant'];
 const skillIds=['skchr_kazema_1','skchr_kazema_2','skchr_ghost2_1','skchr_ghost2_2','skchr_ghost2_3','skchr_bena_1','skchr_bena_2','skchr_vrdant_1','skchr_vrdant_2'];
 const names={'char_4016_kazema':'折纸生花','char_1023_ghost2':'拥抱自我','char_369_bena':'贝娜的量角器','char_4107_vrdant':'植物自愈力'};
 const enabled=o=>!!operatorAttackProfile(o).dollkeeper;
 const active=o=>!!o.doll;
 const bb=t=>Object.fromEntries((t?.blackboard||[]).map(b=>[b.key,b.value]));
 const talent=o=>bb((o.combatTalents||[]).find(t=>t.name===names[o.charId]));
 const handledTalent=(t,id)=>names[id]===t.name;
 function configure(s){
  if(!skillIds.includes(s?.sourceId))return;
  const b=s.blackboard,id=s.sourceId;
  const keys={skchr_kazema_1:['atk_scale','hp_ratio'],skchr_kazema_2:['atk','hp_ratio'],skchr_ghost2_1:['atk'],skchr_ghost2_2:['atk','attack_speed'],skchr_ghost2_3:['atk','max_hp','attack@atk_scale_ex','base_attack_time','attack@hp_ratio'],skchr_bena_1:['max_hp','atk','def_penetrate'],skchr_bena_2:['atk','attack_speed','hp_ratio'],skchr_vrdant_1:['max_hp','magic_resistance'],skchr_vrdant_2:['attack_speed','hp_ratio']}[id];
  if(!b||Object.values(b).some(v=>!Number.isFinite(v))||Object.keys(b).sort().join(',')!==keys.sort().join(','))throw Error('Invalid dollkeeper blackboard: '+id);
  s.dollMechanic=true;s.combatMechanic={version:2,next:id==='skchr_kazema_1'};s.effects=[];
  if(id==='skchr_vrdant_1')return; // Account passive is installed in finalizeOperator, not repeatedly on deployment.
  for(const [key,type,factor]of [['atk','buff_atk',1],['attack_speed','buff_atkspd',.01],['max_hp','buff_maxhp',1]])if(b[key]!=null)s.effects.push({type,power:b[key]*factor});
 }
 function passive(s){return s?.sourceId==='skchr_vrdant_1'?s.blackboard:null;}
 function fx(o,kind='doll-change'){const f=B.combatEffects||=[];f.push({kind,x:o.col,y:o.row,at:B.time,duration:.6});if(f.length>128)f.splice(0,f.length-128);}
 function clearTransient(o){
  root.ArkMedicSkills?.clear(o);
  root.ArkSkillEndEffects?.clear(o,{cancelPending:true});
  o.buffs=[];for(const key of ['stunUntil','sleepUntil','freezeUntil','frozenUntil','palsyUntil'])o[key]=0;
  root.ArkEnemyCold?.clear(o);root.ArkElements?.clear(o);o.cd=0;
 }
 function formHp(o){const delta=Math.round(o.maxHp*(operatorAttackProfile(o).bb?.max_hp||0));o.doll.hpDelta=delta;o.maxHp+=delta;}
 function enter(o){
  if(!enabled(o)||o.dead||active(o))return false;
  endOperatorSkill(o,'switch');clearTransient(o);
  const profile=operatorAttackProfile(o);o._dollEpoch=(o._dollEpoch||0)+1;
  o.doll={startedAt:B.time,until:B.time+profile.bb.duration,ticks:0,baseRangeGrids:o.rangeGrids,baseCells:o.cells};
  o.rangeGrids=profile.dollkeeper.rangeGrids;o.cells=rangeCellsFor(o);formHp(o);o.hp=o.maxHp;o.blocked=0;
  for(const e of B.enemies)if(e.blockerId===o.id)e.blockerId=null;
  if(o.charId==='char_4016_kazema')blast(o,talent(o).damage_scale);
  fx(o);return true;
 }
 function leave(o,heal=true){
  const d=o.doll;if(!d)return;
  o.maxHp-=d.hpDelta||0;o.rangeGrids=d.baseRangeGrids;o.cells=d.baseCells;o.doll=null;o._dollEpoch=(o._dollEpoch||0)+1;
  clearTransient(o);if(heal)o.hp=o.maxHp;else o.hp=Math.min(o.hp,o.maxHp);fx(o);
 }
 function lethal(o){
  if(!enabled(o))return false;
  if(active(o)){leave(o,false);return false;}
  return enter(o);
 }
 function immortal(o){return !active(o)&&o.skillState&&o.skill?.sourceId==='skchr_ghost2_2';}
 function formAtk(o){return active(o)?operatorAttackProfile(o).bb?.atk||0:0;}
 function protection(o,type){return active(o)&&o.charId==='char_369_bena'&&['phys','arts'].includes(type)?1-(talent(o).damage_resistance||0):1;}
 function noAttack(o){return active(o)&&o.charId==='char_1023_ghost2';}
 function loseHp(o,ratio,current=false,nonlethal=false){
  if(!operatorPresent(o))return;
  const loss=(current?o.hp:o.maxHp)*ratio;o.hp=Math.max(nonlethal?1:0,o.hp-loss);
  if(o.hp<1e-7&&!nonlethal){o.hp=0;tryKill(o);}
 }
 function plan(o,p,s){
  p.dollEpoch=o._dollEpoch||0;
  if(active(o)){
   p.targeting='rangeOnly';p.airTarget=o.charId!=='char_1023_ghost2';
   if(o.charId==='char_369_bena')p.damageType='arts';
   return p;
  }
  if(s?.sourceId==='skchr_kazema_1')p.scale=s.blackboard.atk_scale;
  if(s?.sourceId==='skchr_vrdant_2')p.damageType='arts';
  if(s?.sourceId==='skchr_bena_1')p.defScale=1-s.blackboard.def_penetrate;
  if(s?.sourceId==='skchr_ghost2_3'){p.ownBlocked=true;p.all=true;}
  return p;
 }
 function beforeHit(o,e,p){
  if(p.dollEpoch!==(o._dollEpoch||0)||active(o)||!operatorPresent(o))return null;
  const b=o.skill?.blackboard||{};
  if(p.skillId==='skchr_ghost2_3')return e.hp/e.maxHp>=o.hp/o.maxHp?{extra:b['attack@atk_scale_ex']}:{loss:b['attack@hp_ratio']};
  if(['skchr_bena_2','skchr_vrdant_2'].includes(p.skillId))return {loss:b.hp_ratio};
  return null;
 }
 function afterHit(o,e,p,result){
  if(!result)return;
  if(result.extra&&!e.dead){const d=calcDamageResult(o,e,1,{raw:p.power*result.extra,type:'phys'});hitEnemy(o,e,d.amount,p.critical,d.type);}
  if(result.loss)loseHp(o,result.loss);
 }
 function afterAttack(o,s,epoch){if(s?.sourceId==='skchr_kazema_1'&&epoch===(o._dollEpoch||0)){endOperatorSkill(o);loseHp(o,s.blackboard.hp_ratio);}}
 function blast(o,scale){
  if(!scale)return;
  const cells=rangeCellsFor({...o,rangeGrids:operatorAttackProfile(o).dollkeeper?.rangeGrids||o.rangeGrids});
  for(const e of B.enemies)if(!e.dead&&e.hp>0&&!(e.sleepUntil>B.time)&&enemyInOperatorRange(o,e,cells)){
   const d=calcDamageResult(o,e,1,{raw:operatorAttackPower(o,buffMul(o).atk)*scale,type:'arts'});inflictDamage(e,d.amount,false,d.type);if(e.hp<=0)killEnemy(e,o);
  }
  fx(o,'doll-blast');
 }
 function summonPaper(o){
  const p=operatorAttackProfile(o),data=p.paperToken;if(!data||!o.skillState)return;
  const choices=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){
   const r=o.row+dr,c=o.col+dc;
   if(!['MELEE','ALL'].includes(BDATA.level.buildable[r]?.[c])||[...B.operators,...B.summoneds].some(a=>operatorPresent(a)&&a.row===r&&a.col===c))continue;
   const enemies=B.enemies.filter(e=>!e.dead&&!e.flying&&!(e.invisibleUntil>B.time)&&!(e.sleepUntil>B.time)&&enemyOccupiesCell(e,r,c));
   choices.push({r,c,enemy:enemies.length>0,tie:gameRandom()});
  }
  choices.sort((a,b)=>Number(b.enemy)-Number(a.enemy)||a.tie-b.tie);const pos=choices[0];if(!pos)return;
  const train=p.training,phase=data.phases[Math.min(train.evolve,data.phases.length-1)],a=phase.frames[0],z=phase.frames.at(-1);
  const mix=Math.max(0,(Math.min(train.level,phase.maxLevel)-a.level)/Math.max(1,z.level-a.level));
  const stat=k=>Math.round(a.data[k]+(z.data[k]-a.data[k])*mix);
  const atk=stat('atk'),s={id:'paper:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,playerId:o.playerId,
   charId:data.charId,name:data.name,combatToken:true,paperToken:true,position:data.position,profession:'TOKEN',
   row:pos.r,col:pos.c,dir:o.dir,maxHp:stat('maxHp'),hp:stat('maxHp'),atk,def:stat('def'),magicRes:stat('magicResistance'),blockCnt:0,
   attackTime:a.data.baseAttackTime,dead:false,deployed:true,deployAt:B.time,deployT:1,cd:0,life:o.skillState.until-B.time,
   rangeGrids:phase.rangeGrids,basicAttack:{action:'attack',kind:'single',groundOnly:true},buffs:[{atk:1+o.skill.blackboard.atk,until:o.skillState.until}],events:[],
   attributeBase:{version:root.ArkAttributes.version,atk,def:stat('def'),aspd:1}};
  s.cells=rangeCellsFor(s);B.summoneds.push(s);
  const t=data.talents.filter(t=>(Number(t.unlockCondition.phase.slice(-1))<train.evolve||Number(t.unlockCondition.phase.slice(-1))===train.evolve&&t.unlockCondition.level<=train.level)&&t.requiredPotentialRank<=(train.potential||0)).at(-1);
  blast(s,bb(t).damage_scale);
 }
 function cast(o){
  if(!o.skill?.dollMechanic)return;
  if(o.skill.sourceId==='skchr_kazema_2'){loseHp(o,o.skill.blackboard.hp_ratio,true,true);summonPaper(o);}
  if(o.skill.sourceId==='skchr_ghost2_1'){
   const pool=B.operators.filter(a=>a!==o&&operatorPresent(a)&&operatorInRange(o,a)).sort(healingOrder),a=pool[0];
   if(a){const ratio=o.hp/o.maxHp;o.hp=Math.max(1,o.maxHp*a.hp/a.maxHp);a.hp=Math.max(1,a.maxHp*ratio);}
   if(o.skillState){o.rangeGrids=o.skillState.rangeGrids;o.cells=o.skillState.cells;}
  }
  if(o.hp<=0)tryKill(o);
 }
 function skillEnd(o,state,reason){if(reason==='expire'&&!o.dead&&o.skill?.sourceId==='skchr_ghost2_2')enter(o);}
 function advance(o,dt){
  o._dollSpLockTime=0;
  const d=o.doll;if(!d||!operatorPresent(o))return;
  const t=talent(o),elapsed=Math.max(0,Math.min(B.time,d.until)-Math.max(B.time-dt,d.startedAt));
  o._dollSpLockTime=elapsed;
  if(o.charId==='char_4107_vrdant')healOperator(o,o,o.maxHp*(t.hp_recovery_per_sec_by_max_hp_ratio||0)*elapsed,{regen:true,visual:false});
  if(o.charId==='char_1023_ghost2'){
   const pool=B.enemies.filter(e=>!e.dead&&e.hp>0&&!e.flying&&!(e.sleepUntil>B.time)&&enemyInOperatorRange(o,e));
   for(const e of pool){e.slowUntil=Math.max(e.slowUntil||0,Math.min(d.until,B.time+Math.max(dt,.04)));e.slowFactor=Math.min(e.slowFactor??1,1+(t.move_speed||0));}
   const due=Math.floor(Math.min(B.time,d.until)-d.startedAt+1e-9);
   while(d.ticks<due){d.ticks++;for(const e of pool)if(!e.dead){const hit=calcDamageResult(o,e,1,{raw:operatorAttackPower(o,buffMul(o).atk)*(t.atk_scale||0),type:'arts'});inflictDamage(e,hit.amount,false,hit.type);if(e.hp<=0)killEnemy(e,o);}}
  }
  if(B.time+1e-9>=d.until)leave(o);
 }
 function rebind(o,oldMax,oldHp){if(o.doll){formHp(o);const dh=o.maxHp-oldMax;o.hp=dh>0?oldHp+dh:Math.min(oldHp,o.maxHp);}}
 function draw(ctx,board,tile){
  for(const o of board.operators||[])if(o.doll&&!o.dead){
   const x=o.col*tile,y=o.row*tile,ratio=Math.max(0,(o.doll.until-board.time)/(o.doll.until-o.doll.startedAt));
   ctx.strokeStyle='#cb9cff';ctx.fillStyle='rgba(122,57,191,.2)';ctx.lineWidth=2;ctx.fillRect(x+2,y+2,tile-4,tile-4);ctx.strokeRect(x+2,y+2,tile-4,tile-4);
   ctx.fillStyle='#e4c7ff';ctx.font='bold '+Math.max(8,tile*.14)+'px sans-serif';ctx.fillText('替身',x+tile*.5,y+tile*.25);ctx.fillRect(x+tile*.1,y+tile*.82,tile*.8*ratio,tile*.045);
  }
  for(const f of board.combatEffects||[])if(['doll-change','doll-blast'].includes(f.kind)&&board.time-f.at<f.duration){
   ctx.strokeStyle='#d8b5ff';ctx.lineWidth=3;ctx.globalAlpha=Math.max(0,1-(board.time-f.at)/f.duration);ctx.beginPath();ctx.arc((f.x+.5)*tile,(f.y+.5)*tile,tile*(.3+(board.time-f.at)/f.duration),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
 }
 root.ArkDollkeeper={ids,skillIds,enabled,active,handledTalent,configure,passive,enter,leave,lethal,immortal,formAtk,protection,noAttack,plan,beforeHit,afterHit,afterAttack,cast,skillEnd,advance,rebind,draw};
})(typeof window!=='undefined'?window:globalThis);
