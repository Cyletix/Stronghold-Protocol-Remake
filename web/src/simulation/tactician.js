// Source entities and exact skills. Permanent points use the player's deployment.
// Evidence and exclusions: docs/mechanics/tactician.md. No generic summon/name classifiers.
(function(root){
 'use strict';
 const ids=['char_427_vigil','char_452_bstalk','char_249_mlyss','char_476_blkngt','char_4147_mitm','char_4215_buddy','char_4228_closur'];
 const skillIds=['skchr_vigil_1','skchr_vigil_2','skchr_vigil_3','skchr_bstalk_1','skchr_bstalk_2','skchr_blkngt_1','skchr_blkngt_2'];
 const bb=t=>Object.fromEntries((t?.blackboard||[]).map(b=>[b.key,b.value]));
 const data=o=>operatorAttackProfile(o).tactician;
 const owner=s=>B.operators.find(o=>o.id===s.ownerId);
 const point=o=>(B.summoneds||[]).find(s=>s.tacticalToken&&!s.temporary&&!s.removed&&s.ownerId===o.id);
 const handledTalent=(t,id)=>ids.includes(id)&&['狼群领袖','狼群天性','专业饲养员','净水即生命','开源节流','夜行','点梦','废品战车','精准投放','极限调度'].includes(t.name)||id==='char_4215_buddy'&&t.name?.startsWith('猫式起爆龙弹')||id==='char_4228_closur'&&bb(t).damage_scale!=null;
 function configure(s){
  if(root.ArkTacticalSpecials?.configure(s))return;
  if(!skillIds.includes(s?.sourceId))return;
  const keys={skchr_vigil_1:['cost'],skchr_vigil_2:['cost','vigil_wolf_s_2.atk_scale','vigil_wolf_s_2.hp_ratio','vigil_wolf_s_2.cost'],
   skchr_vigil_3:['attack@vigil_s_3.atk_scale','value','interval','cost'],skchr_bstalk_1:['cost'],skchr_bstalk_2:['value','attack@def','attack@atk','interval','cost'],
   skchr_blkngt_1:['cost','hp_recovery_per_sec_by_max_hp_ratio','blkngt_hypnos_s_1[rage].atk','blkngt_hypnos_s_1[rage].attack_speed','blkngt_hypnos_s_1[rage].duration'],
   skchr_blkngt_2:['cost','blkngt_s_2.duration','blkngt_s_2.atk_scale']}[s.sourceId];
  if(!s.blackboard||Object.values(s.blackboard).some(v=>!Number.isFinite(v))||Object.keys(s.blackboard).sort().join(',')!==keys.sort().join(','))throw Error('Invalid tactical skill '+s.sourceId);
  s.tacticalMechanic=true;s.combatMechanic={version:2};s.effects=[];
  s.tacticalInstant=s.sourceId.startsWith('skchr_blkngt_');
 }
 function sourceCandidate(list,train){return list.filter(t=>(Number(t.unlockCondition.phase.slice(-1))<train.evolve||Number(t.unlockCondition.phase.slice(-1))===train.evolve&&t.unlockCondition.level<=train.level)&&t.requiredPotentialRank<=(train.potential||0)).at(-1);}
 function sourceStats(o){
  const p=operatorAttackProfile(o),d=p.tactician,t=p.training,phase=d.phases[Math.min(t.evolve,d.phases.length-1)],a=phase.frames[0],z=phase.frames.at(-1);
  const f=Math.max(0,(Math.min(t.level,phase.maxLevel)-a.level)/Math.max(1,z.level-a.level)),stat=k=>Math.round(a.data[k]+(z.data[k]-a.data[k])*f);
  const talents=d.talents.map(list=>sourceCandidate(list,t)).filter(Boolean),module=Object.assign({},...(d.activeModuleTokens||[]).map(bb)),first={...Object.assign({},...talents.map(bb)),...module};
  return {maxHp:stat('maxHp'),atk:stat('atk'),def:stat('def'),magicRes:stat('magicResistance'),attackTime:a.data.baseAttackTime,rangeGrids:phase.rangeGrids,
   tokenBb:first,tokenTalents:talents,blockPerStack:first.block_cnt??(d.kind==='hound'?1:a.data.blockCnt),interval:first.interval,maxStacks:d.kind==='wolf'?1+first['vigil_wolf_t_1_enhance[trigger].max_stack_cnt']:1,
   copyScale:first.scale,copyInitialSp:module.sp||0,copyRules:bb(talents[1]),penetration:bb(talents[1]).def_penetrate_fixed||0,protection:module.damage_scale||1,
   blockDefense:module.def||0,blockedTargetPriority:module.taunt_level||0};
 }
 function legal(o,row,col,{adjacent=false,ignoreId=null}={}){
  const lv=BDATA.level;
  if(!isDeployable(row,col,{position:data(o)?.position||'MELEE'})||isBenchSlot(row,col)||!adjacent&&!o.cells?.some(([r,c])=>r===row&&c===col))return false;
  if(lv.halfBoard||o.side){const mid=Math.floor(lv.cols/2);if((o.side==='right')?col<mid:col>=mid)return false;}
  if(lv.sourceRoutes&&!o.side&&typeof G!=='undefined'&&!G?.sourceBossId){
   const z=root.modeBattleZoneRows?.(lv),gates=[];if(z)for(let r=z.lb;r<z.rb;r++)for(let c=0;c<lv.cols;c++)if(lv.grid[r]?.[c]==='tile_start')gates.push(c);
   if(gates.length&&col>=Math.min(...gates))return false;
  }
  return ![...B.operators,...(B.summoneds||[]),...(B.traps||[])].some(a=>a.id!==ignoreId&&!a.removed&&(!a.dead||a.tacticalDormant)&&a.row===row&&a.col===col);
 }
 function release(s){s.blocked=0;for(const e of B.enemies)if(e.blockerId===s.id)e.blockerId=null;}
 function clear(s){root.ArkMedicSkills?.clear(s);root.ArkBlacknight?.clear(s);s.buffs=[];s.nextTacticalAttack=null;delete s.commandShield;root.ArkEnemyCold?.clear(s);root.ArkElements?.clear(s);for(const k of ['stunUntil','sleepUntil','freezeUntil','frozenUntil','palsyUntil'])s[k]=0;}
 function resetHealth(s){s.hp=s.maxHp;}
 function remove(s){s.removed=true;s.tacticalDormant=false;s.dead=true;release(s);clear(s);}
 function restore(s,count=1){const charge=s.nextTacticalAttack;s.dead=false;s.tacticalDormant=false;s.stacks=count;s.blockCnt=count*s.blockPerStack;resetHealth(s);s.cd=0;s.nextStackAt=B.time+s.interval;clear(s);s.nextTacticalAttack=charge;root.ArkTacticalSpecials?.spawned(s,owner(s));}
 function create(o,row,col,temporary=false){
  const d=data(o),a=sourceStats(o),stacks=d.kind==='wolf'?2:1;
  const s={...a,id:'tactic:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,playerId:o.playerId,side:o.side,
   charId:d.charId,name:d.name,combatToken:true,tacticalToken:true,tacticalKind:d.kind,temporary,row,col,dir:o.dir,position:d.position||'MELEE',profession:'TOKEN',
   hp:a.maxHp,stacks,blockCnt:stacks*a.blockPerStack,nextStackAt:B.time+a.interval,bornAt:B.time,deployed:true,deployAt:B.time,deployT:1,dead:false,cd:0,
   basicAttack:{action:'attack',kind:'single',groundOnly:true,noDirectHeal:true},attributeBase:{version:root.ArkAttributes.version,atk:a.atk,def:a.def,aspd:1},buffs:[],events:[]};
  s.cells=rangeCellsFor(s);B.summoneds.push(s);if(d.kind==='flow')root.ArkFlowShape.init(s,o);root.ArkTacticalSpecials?.spawned(s,o);return s;
 }
 function deploy(o,row,col,dir=o.dir){
  if(!data(o)||!operatorPresent(o)||!o.deployed||point(o)||!legal(o,row,col))return false;
  const s=create(o,row,col);s.dir=dir;s.cells=rangeCellsFor(s);
  o.tacticalPlacement={row,col,dir};return s;
 }
 function ensure(o){
  if(!data(o)||!o.tacticalPlacement||point(o))return;
  const p=o.tacticalPlacement;deploy(o,p.row,p.col,p.dir);
 }
 function advance(dt=0){
  root.ArkTacticalSpecials?.advance(dt);
  for(const o of B.operators)ensure(o);
  for(const s of B.summoneds||[])if(s.tacticalToken&&!s.removed){
   const o=owner(s);if(!o||!operatorPresent(o)){remove(s);continue;}
   s.buffs=s.buffs.filter(b=>b.until>B.time);
   if(s.tacticalKind==='hypnos')root.ArkBlacknight.advance(s,o,Math.min(dt,B.time-s.bornAt));
   if(s.tacticalKind==='flow'){root.ArkFlowShape.advance(s,o,Math.min(dt,B.time-s.bornAt));if(s.removed)continue;}
   if(s.temporary){if(!['flow','cherry'].includes(s.tacticalKind)&&(!o.skillState||B.time>=o.skillState.until))remove(s);continue;}
   if(s.tacticalDormant){if(B.time+1e-9>=s.nextStackAt)restore(s);else continue;}
   if(s.tacticalKind==='crab'&&o.skillState&&o.skill.sourceId==='skchr_bstalk_2'&&B.time<o.skillState.until){s.buffs=s.buffs.filter(b=>!b.crabSkill);s.buffs.push({crabSkill:true,def:1+o.skill.blackboard['attack@def'],until:o.skillState.until});}
   if(s.tacticalKind==='wolf'&&B.time+1e-9>=s.nextStackAt){
    const due=Math.floor((B.time-s.nextStackAt+1e-9)/s.interval)+1;s.nextStackAt+=due*s.interval;s.stacks=Math.min(s.maxStacks,s.stacks+due);s.blockCnt=s.stacks*s.blockPerStack;
   }
  }
  root.onTacticalBenchChanged?.();
  root.refreshTacticalDetail?.();
 }
 function retreat(s){
  if(!s||s.removed||s.tacticalDormant||s.dead)return false;
  if(!s.tacticalToken||s.temporary){remove(s);return true;}
  root.ArkTacticalSpecials?.depart(s);clear(s);release(s);s.stacks=0;s.blockCnt=0;s.hp=0;s.dead=true;s.tacticalDormant=true;s.nextStackAt=B.time+s.interval;
  if(s.flow){s.flow.sp=0;s.flow.copyUntil=0;}return true;
 }
 function lethal(s){
  if(!s.tacticalToken)return false;
  if(s.temporary){remove(s);return true;}
  root.ArkTacticalSpecials?.depart(s);clear(s);release(s);
  if(s.stacks>1){s.stacks--;s.blockCnt=s.stacks*s.blockPerStack;resetHealth(s);}
  else{s.stacks=0;s.blockCnt=0;s.hp=0;s.dead=true;s.tacticalDormant=true;s.nextStackAt=B.time+s.interval;}
  return true;
 }
 function death(o){for(const s of B.summoneds||[])if(s.tacticalToken&&s.ownerId===o.id)remove(s);o.tacticalRetryAt=0;delete o.hypnosAura;root.ArkTacticalSpecials?.death(o);}
 function canCast(o){
  if(!o.skill?.tacticalMechanic)return true;
  if(root.ArkTacticalSpecials?.ids.includes(o.charId))return true;
  if(o.charId==='char_476_blkngt')return root.ArkBlacknight.canCast(o);
  if(o.skill.sourceId==='skchr_vigil_3')return true;
  const s=point(o);if(!s)return false;
  return o.skill.sourceId!=='skchr_vigil_2'||!s.nextTacticalAttack;
 }
 function stream(o){
  const b=o.skill.blackboard,state=o.skillState;if(!state)return;
  const ticks=Math.ceil(b.value/b.cost),rounding=Math.abs(b.interval*ticks-o.skill.duration)<1/30;
  state.commonDp={kind:'tactical-dp',startedAt:B.time,emitted:0,total:b.value,perTick:b.cost,interval:rounding?o.skill.duration/ticks:b.interval};
 }
 function cast(o){
  if(!o.skill?.tacticalMechanic)return;
  if(root.ArkTacticalSpecials?.cast(o))return;
  if(o.charId==='char_476_blkngt'){root.ArkBlacknight.cast(o);return;}
  const s=point(o),id=o.skill.sourceId,b=o.skill.blackboard;if(id==='skchr_vigil_3'){stream(o);return;}if(!s)return;
  if(id==='skchr_vigil_1'){
   root.onSkillDp?.(b.cost,o);
   if(s.tacticalDormant)restore(s);else if(s.stacks<s.maxStacks){s.stacks++;s.blockCnt=s.stacks*s.blockPerStack;}else resetHealth(s);
  }else if(id==='skchr_vigil_2'){
   root.onSkillDp?.(b.cost,o);s.nextTacticalAttack={scale:b['vigil_wolf_s_2.atk_scale'],hpRatio:b['vigil_wolf_s_2.hp_ratio'],cost:b['vigil_wolf_s_2.cost']};
  }else if(id==='skchr_bstalk_1'){root.onSkillDp?.(b.cost,o);if(s.tacticalDormant)restore(s);else resetHealth(s);}
  else{
   stream(o);
   if(id==='skchr_bstalk_2'){
    for(const [dr,dc]of [[-1,0],[1,0],[0,-1],[0,1]])if(legal(o,s.row+dr,s.col+dc,{adjacent:true}))create(o,s.row+dr,s.col+dc,true);
    for(const token of B.summoneds)if(token.tacticalToken&&token.ownerId===o.id&&!token.dead)token.buffs.push({crabSkill:true,def:1+b['attack@def'],atk:1+b['attack@atk'],until:o.skillState.until});
   }
  }
 }
 function plan(o,p,skill){
  if(o.tacticalToken){p.hits=o.stacks;p.scale=o.nextTacticalAttack?.scale||1;p.tacticalCharge=o.nextTacticalAttack?{...o.nextTacticalAttack}:null;}
  if(skill?.sourceId==='skchr_vigil_3')p.hits=3;
  root.ArkBlacknight?.plan(o,p);root.ArkTacticalSpecials?.plan(o,p,skill);
  return p;
 }
 function synergy(o,e){
  const own=o.tacticalToken?owner(o):o;
  if(!own||!data(own)||!operatorPresent(own))return null;
  const blocker=root.ArkOperatorCombat.blockerOf(e);
  if(!(blocker?.tacticalToken&&blocker.ownerId===own.id)&&!root.ArkTacticalSpecials?.reinforcement(own,blocker))return null;
  return {owner:own,blocker,mult:o.tacticalToken?1:operatorAttackProfile(own).bb.atk_scale||1.5};
 }
 function modifyHit(o,e,power){const s=synergy(o,e);return {power:power*(s?.mult||1)*(root.ArkBlacknight?.scale(o,e)??1),defPenetrate:s?.blocker.penetration||0,synergy:s};}
 function afterHit(o,e,p,hit,actual,wasRevived){
  root.ArkTacticalSpecials?.afterHit(o,e,p,actual);
  const s=hit.synergy,own=s?.owner;
  if(actual>0&&own?.skillState&&own.skill.sourceId==='skchr_vigil_3'&&!e.dead&&!!e.revived===wasRevived){
   const raw=operatorAttackPower(own,buffMul(own).atk)*own.skill.blackboard['attack@vigil_s_3.atk_scale']*s.mult;
   hitEnemy(o,e,calcDamage({...o,garrisonStats:null},e,1,{raw,type:'arts'}),false,'arts');
  }
  if(o.tacticalToken&&p.tacticalCharge&&e.dead&&!p.tacticalCharge.paid){p.tacticalCharge.paid=true;root.onSkillDp?.(p.tacticalCharge.cost,owner(o));}
 }
 function afterAttack(o,plan){
  root.ArkTacticalSpecials?.afterAttack(o,plan);
  if(o.tacticalToken&&plan.tacticalCharge){o.nextTacticalAttack=null;if(operatorPresent(o))o.hp=Math.min(o.maxHp,o.hp+o.maxHp*plan.tacticalCharge.hpRatio);}
 }
 function protection(s,e){return (s.tacticalToken&&e.blockerId===s.id?s.protection:1)*(root.ArkFlowShape?.protection(s)??1)*(root.ArkTacticalSpecials?.protection(s,e)??1);}
 function skillEnd(o){
  root.ArkTacticalSpecials?.skillEnd(o);
  o.buffs=(o.buffs||[]).filter(b=>!b.flowSkill&&!b.crabSkill);
  for(const s of B.summoneds||[])if(s.tacticalToken&&s.ownerId===o.id){s.buffs=s.buffs.filter(b=>!b.flowSkill&&!b.crabSkill);if(s.temporary&&s.tacticalKind==='crab')remove(s);}
 }
 function draw(ctx,board,tile){
  root.ArkTacticalSpecials?.draw(ctx,board,tile);
  for(const s of board.summoneds||[])if(s.tacticalToken&&!s.removed){
   const x=(s.col+.5)*tile,y=(s.row+.5)*tile;
   ctx.strokeStyle=s.tacticalDormant?'#9caeb2':'#77dec6';ctx.fillStyle='#0f2928';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,tile*.3,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(root.ArkFlowShape?.copying(s)){ctx.strokeStyle='#65efff';ctx.lineWidth=4;ctx.strokeRect(x-tile*.43,y-tile*.43,tile*.86,tile*.86);}
   ctx.fillStyle='#bdffed';ctx.textAlign='center';ctx.font='bold '+Math.max(8,tile*.15)+'px sans-serif';ctx.fillText(s.tacticalDormant?'战术点':s.tacticalKind==='wolf'?'狼影 '+s.stacks:s.tacticalKind==='flow'?(s.flow?.name||'流形'):s.name,x,y);
   ctx.font=Math.max(8,tile*.12)+'px sans-serif';if(s.tacticalDormant)ctx.fillText(Math.ceil(Math.max(0,s.nextStackAt-board.time))+'s',x,y+tile*.2);
   else{ctx.fillStyle='#62f2a3';ctx.fillRect(x-tile*.32,y+tile*.34,tile*.64*Math.max(0,s.hp/s.maxHp),tile*.05);}
  }
 }
 root.ArkTactician={ids,skillIds,handledTalent,configure,sourceStats,legal,point,advance,lethal,retreat,deploy,death,canCast,cast,plan,modifyHit,afterHit,afterAttack,protection,draw,create,remove,restore,owner,skillEnd};
})(typeof window!=='undefined'?window:globalThis);
