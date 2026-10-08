// Standard mystic storage and Indigo's exact skills. Evidence/limits: docs/mechanics/mystic.md.
(function(root){
 'use strict';
 const skillIds=['skchr_indigo_1','skchr_indigo_2'];
 const enabled=o=>operatorAttackProfile(o).mystic?.storage==='standard';
 const rooted=(e,time=B.time)=>Math.max(e.rootUntil||0,e.bindUntil||0)>time;
 const handledTalent=(t,id)=>id==='char_469_indigo'&&t.name==='柔光缚目';
 function talent(o){const t=(o.combatTalents||[]).find(t=>handledTalent(t,o.charId));return t?Object.fromEntries(t.blackboard.map(x=>[x.key,x.value])):null;}
 function ensure(o){
  if(!enabled(o))return null;
  const max=operatorAttackProfile(o).bb?.times;if(!(Number.isInteger(max)&&max>0))return null;
  o.mystic||={charges:0,max};o.mystic.max=max;o.mystic.charges=Math.min(max,o.mystic.charges);return o.mystic;
 }
 function store(o,interval){
  const m=ensure(o);if(!m||!operatorCanAct(o)||!o.deployed||o.cd>0||m.charges>=m.max)return false;
  // Like the existing normal action, storage completes at the action tick.
  // Precise client windup/interruption timing remains outside this simulation.
  m.charges++;o.cd=interval;o.atkAnimAt=B.time;
  root.ArkElements?.onAction(o);gainOperatorSp(o,'INCREASE_WHEN_ATTACK',1);
  return true;
 }
 function take(o){const m=ensure(o);if(!m)return 0;const n=m.charges;m.charges=0;return n;}
 function configure(s){
  if(!skillIds.includes(s?.sourceId))return;
  const keys=s.sourceId==='skchr_indigo_1'?['attack@atk_scale','base_attack_time']:['base_attack_time','talent_scale','indigo_s_2[damage].atk_scale','indigo_s_2[damage].interval'];
  const b=s.blackboard||{};
  if(!(s.duration>0)||keys.some(k=>!Number.isFinite(b[k]))||Object.keys(b).sort().join(',')!==keys.sort().join(','))throw Error('Invalid mystic skill blackboard: '+s.sourceId);
  s.mysticMechanic={kind:s.sourceId==='skchr_indigo_1'?'rapid-storage':'root-aura'};s.effects=[];
 }
 function interval(o,s,base){
  if(!s?.mysticMechanic)return base;
  // Indigo S1 is an additive -80% interval modifier; S2's key is a final ratio.
  return base*(s.sourceId==='skchr_indigo_1'?1+s.blackboard.base_attack_time:s.blackboard.base_attack_time);
 }
 function energyScale(o){return o.skillState&&o.skill?.sourceId==='skchr_indigo_1'?o.skill.blackboard['attack@atk_scale']:1;}
 function plan(o,p,s){
  if(enabled(o))p.mysticAttack=true;
  if(s?.sourceId==='skchr_indigo_1')p.scale=s.blackboard['attack@atk_scale'];
  return p;
 }
 function canTarget(o,e){return !talent(o)||!rooted(e);}
 function onHit(o,e,p,lethal){
  if(!p.mysticAttack||lethal||e.dead)return;
  const t=talent(o);if(!t||e.rootImmune||e.sourceAttributes?.rootImmune)return;
  const scale=o.skillState&&o.skill?.sourceId==='skchr_indigo_2'?o.skill.blackboard.talent_scale:1;
  if(gameRandom()<Math.min(1,t.prob*scale)){
   const duration=t.duration*(1-Math.max(0,Math.min(1,root.ArkSkillAuras?.statusResistance?.(e,B.time)??e.statusResistance??0)));
   if(duration>0)e.rootUntil=Math.max(e.rootUntil||0,B.time+duration);
  }
 }
 function cast(o){if(o.skill?.sourceId==='skchr_indigo_2'&&o.skillState)o.skillState.mysticPulse={startedAt:B.time,ticks:0};}
 function advance(o,time){
  const state=o.skillState,pulse=state?.mysticPulse;if(!pulse||!operatorPresent(o))return;
  const b=o.skill.blackboard,interval=b['indigo_s_2[damage].interval'];
  const due=Math.floor((Math.max(0,Math.min(time,state.until)-pulse.startedAt)+1e-9)/interval);
  while(pulse.ticks<due){
   const at=pulse.startedAt+(++pulse.ticks)*interval;
   for(const e of B.enemies){
    if(e.dead||e.hp<=0||e.sleepUntil>at||!rooted(e,at)||!enemyInOperatorRange(o,e))continue;
    const raw=operatorAttackPower(o,buffMul(o).atk)*b['indigo_s_2[damage].atk_scale'];
    // Continuous arts damage: never dispatch the normal-attack talent callback.
    const damage=calcDamageResult(o,e,1,{raw,type:'arts'});inflictDamage(e,damage.amount,false,damage.type);
    const fx=B.combatEffects||=[];fx.push({kind:'mystic-root-pulse',x:e.x,y:e.y,at:B.time,duration:.25});if(fx.length>128)fx.splice(0,fx.length-128);
    if(e.hp<=0)killEnemy(e,o);
   }
  }
 }
 function clearRoot(e){e.rootUntil=0;e.bindUntil=0;}
 function draw(ctx,board,tile){
  for(const o of board.operators||[]){const m=o.mystic;if(!m||o.dead||!o.deployed)continue;
   const step=tile*.10,x=(o.col+.5)*tile-(m.max-1)*step/2,y=(o.row+.03)*tile;
   for(let i=0;i<m.max;i++){ctx.beginPath();ctx.arc(x+i*step,y,tile*.034,0,Math.PI*2);ctx.fillStyle=i<m.charges?'#c1a7ff':'#283444';ctx.fill();ctx.strokeStyle='#9078b8';ctx.lineWidth=1;ctx.stroke();}
  }
  for(const e of board.enemies||[])if(!e.dead&&rooted(e,board.time)){
   const x=(e.x+.5)*tile,y=(e.y+.68)*tile;ctx.strokeStyle='#cba9ff';ctx.lineWidth=2;
   ctx.beginPath();ctx.ellipse(x,y,tile*.28,tile*.12,0,0,Math.PI*2);ctx.moveTo(x-tile*.2,y-tile*.23);ctx.lineTo(x+tile*.2,y+tile*.02);ctx.moveTo(x+tile*.2,y-tile*.23);ctx.lineTo(x-tile*.2,y+tile*.02);ctx.stroke();
  }
  for(const fx of board.combatEffects||[])if(fx.kind==='mystic-root-pulse'&&board.time-fx.at<fx.duration){
   ctx.globalAlpha=Math.max(0,1-(board.time-fx.at)/fx.duration);ctx.strokeStyle='#d7bfff';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc((fx.x+.5)*tile,(fx.y+.5)*tile,tile*(.15+.25*(board.time-fx.at)/fx.duration),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
 }
 root.ArkMystic={skillIds,enabled,ensure,store,take,configure,interval,energyScale,plan,canTarget,onHit,handledTalent,cast,advance,rooted,clearRoot,draw};
})(typeof window!=='undefined'?window:globalThis);
