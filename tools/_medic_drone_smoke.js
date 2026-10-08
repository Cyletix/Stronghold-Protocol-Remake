'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const helper=`
function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-6,msg+': '+a+' != '+b);}
function droneSetup(level=7,entry=null,elite=false,phase=2,opLevel=1){
 G.skillChoices.char_108_silent=1;ACCOUNT.ops.char_108_silent={evolve:phase,level:opLevel,skillLevel:level,potential:1,trust:0,selectedSkill:1};
 const e=entry||debugTacticalEntry('char_108_silent'),r=finalizeOperator(e,null,[],elite);
 const initial={...r,id:1,charId:e.charId,name:e.name,profession:e.profession,position:e.position,row:6,col:4,dir:'right',rangeGrids:entryRangeGrids(e,elite),buffs:[],events:[],combatTalents:[],garrisonAdd:null};
 G.ops=[{...initial,entry:e,elite}];G.phase='battle';G.battleDone=false;G.over=false;G.equipInv=[];
 startBattle([initial],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null,dp:99});
 delete BDATA.level.sourceRoutes;BDATA.level.halfBoard=false;
 for(let r=5;r<=8;r++)for(let c=2;c<=9;c++)BDATA.level.buildable[r][c]='ALL';
 const o=B.operators[0];Object.assign(o,{sp:o.skill.spCost,deployed:true,deployAt:0,deployT:2,cd:999,hp:o.maxHp});return o;
}
function dronePatient(row=6,col=7,extra={}){
 const t={id:100+B.operators.length,charId:'fixture-patient',profession:'GUARD',position:'MELEE',row,col,dir:'right',cells:[[row,col]],hp:100,maxHp:100000,atk:0,def:0,attackTime:2,cd:999,sp:0,skill:null,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,basicAttack:{action:'attack'},...extra};B.operators.push(t);return t;
}
function makeDrone(o,row=6,col=6){assert.equal(castSkill(o),true);syncTacticalBench(true);assert.ok(tacticalCandidates().some(x=>x.isMedicDrone));assert.ok(tacticalAction('place',o.unitId??o.id,row,col,'up'));return B.summoneds.find(s=>s.medicDrone&&!s.dead);}
`;
async function main(){
 await f.run('initMode()');f.ctx.assert=assert;f.run(`chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}`);
 for(let level=1;level<=10;level++){
  f.ctx.raw=skills.skchr_silent_2.levels[level-1];f.run(`{const o=droneSetup(${level});assert.equal(o.skill.spCost,raw.spData.spCost);assert.equal(o.skill.medicMechanic.kind,'inventory');assert.deepEqual(o.skill.effects,[]);
   const t=dronePatient(),hp=t.hp;assert.equal(castSkill(o),true);assert.equal(t.hp,hp,'stock must not heal');assert.equal(o.medicDroneStock,1);assert.equal(o.sp,0);assert.ok(!o.skillState);
   gainOperatorSp(o,'INCREASE_WITH_TIME',100);assert.equal(o.sp,0);o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'full inventory cannot consume forced SP');o.sp=0;
   syncTacticalBench(true);assert.equal(B.bench.filter(s=>s.isMedicDrone).length,1);assert.equal(B.bench.find(s=>s.isMedicDrone).cost,5);
   B.dp=4;assert.equal(tacticalCanPlace(o.id,6,6),false);B.dp=99;assert.equal(tacticalCanPlace(o.id,6,6),true);assert.ok(!o.cells.some(([r,c])=>r===6&&c===8)||tacticalCanPlace(o.id,6,8));
   const money=G.money;assert.equal(tacticalAction('place',o.id,6,6,'up'),true);assert.equal(B.dp,94);assert.equal(G.money,money);assert.equal(o.medicDroneStock,0);assert.equal(G.ops.length,1);assert.equal(G.ops[0].tacticalPlacement,undefined);
   gainOperatorSp(o,'INCREASE_WITH_TIME',1);near(o.sp,1);const s=B.summoneds[0];assert.equal(s.blockCnt,0);assert.equal(s.attackTime,.5);assert.equal(s.expiresAt,10);assert.equal(s.cells.length,9);
   const bad=dronePatient(5,6,{basicAttack:{action:'attack',noDirectHeal:true}}),far=dronePatient(4,6),dead=dronePatient(7,6,{dead:true}),pending=dronePatient(6,5,{deployAt:99}),ally=dronePatient(7,7,{playerId:'ally'});
   assert.equal(inflictDamage(s,999),0);assert.equal(directHealAllowed(o,s),false);
   B.time=.49;ArkMedicDrone.advance(s);near(t.hp,hp);B.time=.5;ArkMedicDrone.advance(s);near(t.hp,hp+s.atk);near(ally.hp,100+s.atk);
   for(const x of [bad,far,dead,pending])near(x.hp,100);
   B.time=9.99;ArkMedicDrone.advance(s);near(t.hp,hp+19*s.atk);assert.equal(s.healTicks,19);B.time=10;ArkMedicDrone.advance(s);near(t.hp,hp+20*s.atk);assert.ok(s.removed);B.time=11;ArkMedicDrone.advance(s);near(t.hp,hp+20*s.atk);
  }`);
 }
 const sourceTokens=[];
 for(let phase=1;phase<=2;phase++)for(const frame of chars.token_10000_silent_healrb.phases[phase].attributesKeyFrames){
  f.ctx.frame=frame;f.run(`{const o=droneSetup(10,null,false,${phase},${frame.level}),s=makeDrone(o);near(s.atk,frame.data.atk);near(s.maxHp,frame.data.maxHp);near(s.cost,frame.data.cost);}`);sourceTokens.push([phase,frame.level]);
 }
 const bindings=f.run(`(()=>{const out=[];for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  const entry=ROSTER_LIST.find(e=>e.charId==='char_108_silent');assert.ok(entry);for(const elite of [false,true]){const o=droneSetup(7,entry,elite),s=makeDrone(o);assert.ok(s.atk>0);assert.equal(o.skill.sourceId,'skchr_silent_2');out.push([season,elite,o.skill.spCost,s.atk]);}
 }return out;})()`);
 f.run(`{
  let o=droneSetup(),s=makeDrone(o),t=dronePatient();o.hp=0;tryKill(o);assert.ok(!s.dead);syncTacticalBench(true);assert.equal(tacticalCandidates().length,0);B.time=.5;ArkMedicDrone.advance(s);near(t.hp,100+s.atk);assert.ok(tacticalAction('retreat',o.id,0,0,'up',0,s.id));assert.ok(s.removed);B.time=30;ArkMedicDrone.advance(s);assert.equal(B.summoneds.filter(s=>s.medicDrone&&!s.dead).length,0);
  o=droneSetup();castSkill(o);syncTacticalBench(true);const bench=B.bench.find(s=>s.isMedicDrone);startBenchDrag(bench,0,0,0,0);drag.moved=true;boardXY=()=>[6.5*TILE,6.5*TILE];onUp({});assert.equal(drag.phase,'facing');assert.equal(B.summoneds.length,0);drag.dragging=true;drag.dirSet=true;drag.dir='left';boardXY=()=>[8.5*TILE,6.5*TILE];onUp({});assert.equal(drag,null);assert.equal(B.summoneds[0].col,6);
  o.sp=o.skill.spCost;assert.equal(castSkill(o),true);assert.equal(tacticalCanPlace(o.id,6,8),false,'five-second redeploy cooldown');B.time=5;assert.equal(tacticalCanPlace(o.id,6,8),true);assert.ok(tacticalAction('place',o.id,6,8,'right'));assert.equal(B.summoneds.filter(s=>!s.dead).length,2,'inventory limit is not active entity limit');
  // Same tick performs a healing action, never a projectile or enemy attack.
  o=droneSetup();s=makeDrone(o);t=dronePatient();B.enemies=[{enemyId:'fixture',id:999,x:6,y:6,hp:999,maxHp:999,moveSpeed:0,canAttack:false,unblockable:true,cd:99,atk:0,rangeRadius:0,path:[{x:6,y:6},{x:7,y:6}],seg:0}];update(.5,.5);near(t.hp,100+s.atk);near(B.enemies[0].hp,999);assert.equal(B.projectiles.length,0);
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const config={seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},runtimes=[];
 try{
  for(let i=0;i<2;i++){const rt=await m.exports.createPlayerRuntime(config,{seed:920+i,name:'drone-'+i});runtimes.push(rt);rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper+`droneSetup();BDATA.level.sourceRoutes=SOURCE_BATTLES.levels[G.mapKey].level.sourceRoutes;G.phase='rest';document.getElementById('decision-modal').style.display='none';`);rt.startBattle();}
  const inputs=runtimes.map((rt,i)=>rt.battleInput('player-'+i)),pair=require('../web/src/simulation/paired-battle'),layout={kind:'boss',rows:19,cols:21,sourceGeometry:true,left:{start:2,end:10},center:{start:10,end:11},right:{start:11,end:19}};
  const units=inputs.flatMap((input,i)=>input.units.map(u=>pair.toWorldUnit(u,{playerId:input.id,side:i?'right':'left'},layout))),driver=runtimes[0];
  driver.useSharedBattle({kind:'boss',units,owners:inputs,traps:[]});driver.__testMachine.run(`B.dp=99;B.spawn=[{at:9999,enemyId:'none'}];B.roundLimit=999;B.waveScheduler=null;B.enemies=[];B.leader=null;B.leaderEnemyId=null;for(let r=5;r<=8;r++)for(let c=2;c<=18;c++)BDATA.level.buildable[r][c]='ALL';for(const o of B.operators){o.deployed=true;o.deployAt=0;o.deployT=2;o.cd=999;o.sp=o.skill.spCost;castSkill(o);}`);
  const cmd=(action,o,row,col,tokenId='')=>({action,unitId:o.unitId,row,col,dir:'up',targetId:0,tokenId}),state=driver.snapshot(),left=state.battle.operators[0],right=state.battle.operators[1];
  assert.ok(driver.command('game/tactical',cmd('place',right,6,15),'player-1').ok);assert.equal(driver.command('game/tactical',cmd('place',left,6,15),'player-0').ok,false);assert.ok(driver.command('game/tactical',cmd('place',left,6,6),'player-0').ok);
  let snap=driver.snapshot();assert.equal(snap.battle.dp,89);assert.equal(snap.battle.summoneds.length,2);assert.equal(snap.session.ops[0].tacticalPlacement,undefined);const token=snap.battle.summoneds.find(s=>s.playerId==='player-1');
  assert.equal(driver.command('game/tactical',cmd('retreat',left,0,0,token.id),'player-0').ok,false);
  driver.__testMachine.run(`dronePatient(6,14,{playerId:'player-0'});`);const checkpoint=driver.snapshot();driver.advance(2.2);const expected=driver.snapshot();driver.restore(JSON.parse(JSON.stringify(checkpoint)));driver.advance(2.2);const actual=driver.snapshot();assert.deepEqual(actual.battle,expected.battle);assert.deepEqual(actual.rng,expected.rng);assert.ok(actual.battle.operators.at(-1).hp>100);
  assert.ok(driver.command('game/tactical',cmd('retreat',right,0,0,token.id),'player-1').ok);
 }finally{runtimes.forEach(rt=>rt.dispose());}
 fs.writeFileSync(path.join(__dirname,'../.runtime/medic-drone-receipts.json'),JSON.stringify({date:'2026-09-14',skillLevels:10,sourceTokens,bindings,signedReplay:true,limits:'first/last heal frame phase, stock retention across owner redeploy, module/aura interactions remain scoped separately'},null,2));
 console.log('MEDIC DRONE OK 10 skill levels, 4 token keyframes, 4 season variants, drag/DP/stock/healing/lifetime and paired signed replay');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
