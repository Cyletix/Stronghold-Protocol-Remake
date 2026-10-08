// Explicit source-key executors for Cherry, Palamute and Command Center.
// Shared deployment belongs to tactician.js; evidence/bounds: docs/mechanics/tactician.md.
(function(root){
 'use strict';
 const ids=['char_4147_mitm','char_4215_buddy','char_4228_closur'];
 const bb=t=>Object.fromEntries((t?.blackboard||[]).map(b=>[b.key,b.value]));
 const talent=(o,name)=>(o.combatTalents||[]).find(t=>t.name===name);
 const active=o=>o?.skillState&&o.skillState.until>B.time?o.skill:null;
 const units=()=>[...B.operators,...(B.summoneds||[])];
 const point=o=>root.ArkTactician.point(o),owner=s=>root.ArkTactician.owner(s);
 const source=o=>operatorAttackProfile(o).tactician;
 const skillKeys={
  skchr_mitm_1:['cost','aoe_damage_scale'],
  skchr_mitm_2:['attack@max_target','atk','mode','mitm_s_2[to_token].block_cnt','mitm_s_2[to_token].def','mitm_s_2[to_token].hp','mitm_s_2[cost].cost','mitm_s_2[cost].interval','mitm_s_2[cost].display','block_cnt_display'],
  skchr_closur_1:['cost','cost_per_add','cost_add_max','shield_cnt'],
  skchr_closur_2:['cost','cost_return','block_cnt','def','atk','attack@max_target','cost_period','closur_s_2[add_cost_period].cost','closur_s_2[add_cost_period].interval'],
  skchr_closur_3:['cost','cost_attack_add','attack_trigger_cnt','max_trigger_cnt','attack@atk_scale','base_attack_time','attack@slow_down','attack@slow_down_time','attack@max_stack_cnt','attack@slow_down_max','cost_period','closur_s_3[add_cost_period].cost','closur_s_3[add_cost_period].interval']
 };
 function configure(s){
  const keys=skillKeys[s?.sourceId];if(!keys)return false;
  if(Object.keys(s.blackboard||{}).sort().join()!==keys.slice().sort().join()||Object.values(s.blackboard).some(v=>!Number.isFinite(v)))throw Error('Invalid tactical source '+s.sourceId);
  s.tacticalMechanic=true;s.combatMechanic={version:2};s.effects=[];return true;
 }
 function fx(kind,x,y,extra={}){(B.combatEffects||=[]).push({kind,x,y,at:B.time,duration:.5,...extra});}
 function inCells(cells,e){return cells?.some(([r,c])=>enemyOccupiesCell(e,r,c));}
 function centerCells(s,o){const index=Number(o.skill?.sourceId?.slice(-1))-1;return rangeCellsFor({...s,rangeGrids:source(o)?.tokenSkills?.[index]?.rangeGrids||[]});}
 function centers(o){return (B.summoneds||[]).filter(s=>s.ownerId===o.id&&s.tacticalKind==='center'&&operatorPresent(s)&&!s.removed);}
 function reinforcement(o,a){return !!(o?.charId==='char_4228_closur'&&a&&operatorPresent(o)&&operatorPresent(a)&&centers(o).some(s=>centerCells(s,o).some(([r,c])=>r===a.row&&c===a.col)));}
 function allies(o){return units().filter(a=>reinforcement(o,a));}
 function spawned(s,o){
  if(s.tacticalKind==='cherry'&&s.temporary){
   const b=s.tokenBb;s.remnant=true;s.name='樱桃残骸';s.maxHp=Math.round(s.maxHp*(1+b['trshrb_t_1[trash_born].max_hp']));s.hp=s.maxHp;
   s.atk=0;s.def=0;s.attributeBase.atk=0;s.attributeBase.def=0;s.blockCnt=b['trshrb_t_1[trash_born].block_cnt'];s.cells=[];
  }
  if(s.tacticalKind==='center'){s.rangeGrids=source(o).tokenSkills[Number(o.skill.sourceId.slice(-1))-1].rangeGrids;s.cells=centerCells(s,o);}
  if(s.tacticalKind==='hound')s.houndStrikePending=true;
 }
 function depart(s){
  if(s.tacticalKind!=='cherry'||s.temporary)return;
  (B.tacticalEvents||=[]).push({kind:'remnants',ownerId:s.ownerId,at:B.time+1/30,row:s.row,col:s.col});
 }
 function physical(o,e,raw){const hit=root.ArkTactician.modifyHit(o,e,raw),d=calcDamageResult(o,e,1,{raw:hit.power,type:'phys',defPenetrate:hit.defPenetrate});return hitEnemy(o,e,d.amount,false,d.type);}
 function houndStrike(s){
  const t=s.tokenTalents.find(t=>t.rangeGrids),b=bb(t),cells=rangeCellsFor({...s,rangeGrids:t.rangeGrids});
  const targets=B.enemies.filter(e=>!e.dead&&!(e.sleepUntil>B.time)&&!(e.invisibleUntil>B.time)&&inCells(cells,e)).sort((a,b)=>dist(s,a)-dist(s,b)).slice(0,b.max_target);
  for(const e of targets){
   physical(s,e,operatorAttackPower(s,buffMul(s).atk)*b.atk_scale);
   if(!e.dead&&!e.shiftImmune&&!e.sourceAttributes?.attractImmune&&!e.blockerId){
    const d=Math.hypot(e.x-s.col,e.y-s.row),step=root.ArkFlowShape.pullDistance(d,b.force,Math.max(0,e.massLevel||0));
    // Reuse Flow's endpoint approximation; keep ground enemies on passable cells.
    if(d&&step){const x=e.x+(s.col-e.x)*step/d,y=e.y+(s.row-e.y)*step/d;
     const can=(r,c)=>['ALL','WALK_ONLY'].includes(BDATA.level.passable?.[r]?.[c]);
     if(e.flying||can(Math.round(y),Math.round(x))&&can(Math.round(e.y),Math.round(x))&&can(Math.round(y),Math.round(e.x))){if(e.flying||!root.ArkOperatorCombat.moveToContact(e,x,y)){e.x=x;e.y=y;}}}
   }
  }
  fx('operator-blast',s.col,s.row,{radius:1.5});
 }
 function advance(){
  for(const e of B.enemies)e.buddyBombs=(e.buddyBombs||[]).filter(m=>m.until>B.time&&!e.dead);
  const events=B.tacticalEvents||[];B.tacticalEvents=[];
  for(const ev of events){
   if(ev.at>B.time+1e-9){B.tacticalEvents.push(ev);continue;}
   const o=B.operators.find(o=>o.id===ev.ownerId);
   if(ev.kind==='refund'){if(o)root.onSkillDp?.(ev.amount,o);continue;}
   if(!o||!operatorPresent(o))continue;
   if(ev.kind==='remnants')for(const [dr,dc]of [[-1,0],[1,0],[0,-1],[0,1]])if(root.ArkTactician.legal(o,ev.row+dr,ev.col+dc,{adjacent:true}))root.ArkTactician.create(o,ev.row+dr,ev.col+dc,true);
  }
  for(const s of B.summoneds||[])if(s.houndStrikePending&&operatorPresent(s)&&!s.removed&&B.phase==='battle'){
   s.houndStrikePending=false;const o=owner(s);if(o&&operatorPresent(o))houndStrike(s);
  }
 }
 function noAttack(o){return o.tacticalKind==='center'||o.remnant||o.tacticalKind==='cherry'&&active(owner(o))?.sourceId==='skchr_mitm_2';}
 function blockBonus(a){
  if(a.tacticalDormant||a.dead)return 0;
  let n=0;
  if(a.tacticalKind==='cherry'&&!a.temporary&&active(owner(a))?.sourceId==='skchr_mitm_2')n=owner(a).skill.blackboard.block_cnt_display;
  let aura=0;for(const o of B.operators)if(active(o)?.sourceId==='skchr_closur_2'&&reinforcement(o,a))aura=Math.max(aura,o.skill.blackboard.block_cnt);
  return n+aura;
 }
 function attackBonus(o){return active(o)&&['skchr_mitm_2','skchr_closur_2'].includes(o.skill.sourceId)?o.skill.blackboard.atk:0;}
 function defenseBonus(a){
  let n=0;if(a.tacticalKind==='cherry'&&!a.temporary&&active(owner(a))?.sourceId==='skchr_mitm_2')n=owner(a).skill.blackboard['mitm_s_2[to_token].def'];
  let aura=0;for(const o of B.operators)if(active(o)?.sourceId==='skchr_closur_2'&&reinforcement(o,a))aura=Math.max(aura,o.skill.blackboard.def);
  return n+aura;
 }
 function protection(a,e){let scale=1;for(const o of B.operators)if(reinforcement(o,a)&&e.blockerId===a.id){const b=(o.combatTalents||[]).find(t=>bb(t).damage_scale!=null);scale=Math.min(scale,bb(b).damage_scale??1);}return scale;}
 function stream(o,total,interval,offset=0){o.skillState.commonDp={kind:'tactical-dp',startedAt:B.time,emitted:0,total,perTick:1,interval,offset};}
 function cast(o){
  if(!skillKeys[o.skill?.sourceId])return false;
  const id=o.skill.sourceId,b=o.skill.blackboard,s=point(o);
  if(id==='skchr_mitm_1'){
   root.onSkillDp?.(b.cost,o);
   if(s&&operatorPresent(s)){
    const cells=rangeCellsFor({...s,rangeGrids:o.skill.rangeGrids});
    for(const e of B.enemies)if(!e.dead&&!(e.sleepUntil>B.time)&&inCells(cells,e))physical(o,e,operatorAttackPower(o,buffMul(o).atk)*b.aoe_damage_scale);
    fx('operator-blast',s.col,s.row,{radius:1.5});root.ArkTactician.retreat(s);
   }
  }else if(id==='skchr_mitm_2')stream(o,b['mitm_s_2[cost].display'],b['mitm_s_2[cost].interval']);
  else if(id==='skchr_closur_1'){
   const total=Math.min(b.cost_add_max,b.cost+(o.commandCasts||0)*b.cost_per_add);o.commandCasts=(o.commandCasts||0)+1;
   stream(o,total,o.skill.duration/total,o.skill.duration/total/2);for(const a of allies(o))a.commandShield=Math.max(a.commandShield||0,b.shield_cnt);
  }else{
   root.onSkillDp?.(b.cost,o);const count=b.cost_period,interval=b[id==='skchr_closur_2'?'closur_s_2[add_cost_period].interval':'closur_s_3[add_cost_period].interval'];
   stream(o,count,Math.abs(interval*count-o.skill.duration)<1/10?o.skill.duration/count:interval);o.skillState.commandAttacks=0;
  }
  return true;
 }
 function plan(o,p,skill){
  if(o.tacticalKind==='hound')p.ownBlocked=true;
  if(skill?.sourceId==='skchr_closur_2')p.targets=skill.blackboard['attack@max_target'];
  if(skill?.sourceId==='skchr_closur_3'){
   const b=skill.blackboard;p.targets=1+Math.min(b.max_trigger_cnt,Math.floor((o.skillState.commandAttacks||0)/b.attack_trigger_cnt));p.scale=b['attack@atk_scale'];
   p.commandSlow={amount:b['attack@slow_down'],duration:b['attack@slow_down_time'],cap:b['attack@slow_down_max']};
  }
 }
 function originalCells(a){
  if(a.tacticalKind==='center')return centerCells(a,owner(a));
  if(noAttack(a))return [];
  if(a.tacticalKind==='flow')return rangeCellsFor({...a,rangeGrids:source(owner(a)).phases[operatorAttackProfile(owner(a)).training.evolve].rangeGrids});
  return a.skillState?.cells||a.cells;
 }
 function additionalRange(o,e){
  const id=active(o)?.sourceId;if(!['skchr_closur_2','skchr_closur_3'].includes(id))return false;
  if(reinforcement(o,root.ArkOperatorCombat.blockerOf(e)))return true;
  return id==='skchr_closur_3'&&allies(o).some(a=>inCells(originalCells(a),e));
 }
 function afterAttack(o){if(active(o)?.sourceId==='skchr_closur_3')o.skillState.commandAttacks=(o.skillState.commandAttacks||0)+1;}
 function afterHit(o,e,p,actual){if(actual>0&&!e.dead&&p.commandSlow){
  const map=e.commandSlow||={},old=map[o.id],b=p.commandSlow;map[o.id]={amount:Math.min(b.cap,(old?.until>B.time?old.amount:0)+b.amount),until:B.time+b.duration};
 }}
 function tempo(e){return 1-Math.max(0,...Object.values(e.commandSlow||{}).filter(s=>s.until>B.time).map(s=>s.amount));}
 // Resistible status budgets consume enemy-local time; the source's own
 // three-second debuff duration and periodic damage frequency use world time.
 function advanceStatusClocks(dt){
  const from=B.time-dt,to=B.time;
  for(const e of B.enemies){
   const slows=Object.values(e.commandSlow||{}).filter(s=>s.until>from);if(e.dead||!slows.length)continue;
   const points=[from,...new Set(slows.map(s=>s.until).filter(t=>t<to)),to].sort((a,b)=>a-b);
   const extend=until=>{
    if(!(until>from)||!Number.isFinite(until))return until;
    let budget=until-from;
    for(let i=1;i<points.length;i++){const a=points[i-1],z=points[i],rate=1-Math.max(0,...slows.filter(s=>s.until>a).map(s=>s.amount)),spent=(z-a)*rate;
     if(budget<=spent)return a+budget/rate;budget-=spent;}
    return to+budget;
   };
   for(const key of ['stunUntil','sleepUntil','coldUntil','freezeUntil','frozenUntil','allyColdUntil','allyFrozenUntil','silenceUntil'])if(e[key])e[key]=extend(e[key]);
   if(e.hypnosSleep){const s=e.hypnosSleep;s.external=extend(s.external);for(const key of Object.keys(s.sources))s.sources[key]=extend(s.sources[key]);s.published=Math.max(s.external,...Object.values(s.sources),0);e.sleepUntil=s.published;}
  }
 }
 function launch(o,e){
  if(o.charId!=='char_4215_buddy')return null;
  const t=(o.combatTalents||[]).find(t=>t.name?.startsWith('猫式起爆龙弹')),b=bb(t);if(!t)return null;
  const key=e.visualId??e.id,seen=o.buddyMounted||=[];
  if(seen.length>=b.max_cnt||seen.includes(key))return null;
  seen.push(key);return {buddyBomb:{scale:b['attack@atk_scale_boom'],stun:b['attack@stun_duration'],cost:b['attack@cost'],duration:b['attack@boom_duration']}};
 }
 function mount(o,e,p){if(e.dead)return;const b=p.buddyBomb;(e.buddyBombs||=[]).push({ownerId:o.id,ownerCharId:o.charId,power:p.power,until:B.time+b.duration,...b});fx('operator-blast',e.x,e.y,{radius:.25});}
 function damaged(attacker,e,actual){
  if(!attacker||!(actual>0)||e.dead)return;
  const firing=(e.buddyBombs||[]).filter(m=>m.until>B.time&&m.ownerId!==attacker.id);if(!firing.length)return;
  e.buddyBombs=e.buddyBombs.filter(m=>!firing.includes(m));
  for(const m of firing){
   const o=B.operators.find(o=>o.id===m.ownerId);if(!o)continue;
   if(!e.dead){physical(o,e,m.power*m.scale);if(!e.stunImmune&&!e.sourceAttributes?.stunImmune)e.stunUntil=Math.max(e.stunUntil||0,B.time+m.stun);fx('operator-blast',e.x,e.y,{radius:.55});}
   root.onSkillDp?.(m.cost,o);
  }
 }
 function operatorDeployed(a){
  let amount=0;for(const o of B.operators)if(active(o)?.sourceId==='skchr_closur_2'&&reinforcement(o,a))amount=Math.max(amount,Math.ceil((a.cost||0)*o.skill.blackboard.cost_return));
  if(amount)(B.tacticalEvents||=[]).push({kind:'refund',ownerId:a.id,at:B.time+1/30,amount});
 }
 function skillEnd(o){if(o.skill?.sourceId==='skchr_mitm_2'){const s=point(o);if(s&&operatorPresent(s))root.ArkTactician.retreat(s);}}
 function death(o){delete o.commandCasts;delete o.buddyMounted;delete o.commandShield;}
 function draw(ctx,board,tile){
  ctx.save();ctx.lineWidth=2;
  for(const s of board.summoneds||[])if(s.tacticalKind==='center'&&!s.removed&&!s.dead){ctx.strokeStyle='#49ccba88';ctx.fillStyle='#49ccba18';for(const [r,c]of s.cells||[]){ctx.fillRect(c*tile,r*tile,tile,tile);ctx.strokeRect(c*tile,r*tile,tile,tile);}}
  for(const a of [...(board.operators||[]),...(board.summoneds||[])])if(!a.dead&&a.commandShield){ctx.strokeStyle='#9beeff';ctx.strokeRect((a.col+.1)*tile,(a.row+.1)*tile,.8*tile,.8*tile);}
  for(const e of board.enemies||[])if(!e.dead){const bombs=(e.buddyBombs||[]).filter(m=>m.until>board.time).length;if(bombs){ctx.fillStyle='#ffe66b';ctx.font='bold '+tile*.19+'px sans-serif';ctx.textAlign='center';ctx.fillText('◆'+bombs,(e.x+.5)*tile,(e.y+.12)*tile);}if(Object.values(e.commandSlow||{}).some(s=>s.until>board.time)){ctx.strokeStyle='#64cfdf';ctx.beginPath();ctx.arc((e.x+.5)*tile,(e.y+.5)*tile,.34*tile,0,Math.PI*2);ctx.stroke();}}
  ctx.restore();
 }
 root.ArkTacticalSpecials={ids,skillKeys,configure,spawned,depart,advance,noAttack,blockBonus,attackBonus,defenseBonus,protection,cast,plan,reinforcement,additionalRange,afterAttack,afterHit,tempo,advanceStatusClocks,launch,mount,damaged,operatorDeployed,skillEnd,death,draw};
})(typeof window!=='undefined'?window:globalThis);
