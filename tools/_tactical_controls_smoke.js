'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const setup=`
function manualSetup(id='char_427_vigil',elite=false){
 setupSeasonId='act2autochess';setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 G.bannedOperators=[];G.ops=[];G.equipInv=[];const o=addOperator(id,elite);o.row=6;o.col=4;o.dir='right';
 for(let r=5;r<=8;r++)for(let c=2;c<=9;c++)BDATA.level.buildable[r][c]='MELEE';BDATA.level.buildable[6][4]='RANGED';
 refreshBoard();return o;
}
function beginTokenBattle(){
 startBattle(G.ops.filter(o=>o.row!=null).map(boardView),[],100);G.phase='battle';G.battleDone=false;B.spawn=[{at:99999,enemyId:'none'}];B.roundLimit=99999;
 for(const o of B.operators){o.deployed=true;o.deployAt=0;o.hp=o.maxHp;o.sp=0;o.skill.isPassive=true;}ArkTactician.advance(0);
}
`;
async function main(){
 await f.run('initMode()');f.run(setup);
 f.run(`{
  let run=manualSetup(),bench=B.bench.find(s=>s.isTactical);assert.ok(bench);assert.equal(B.summoneds.length,0,'no invented automatic point');
  assert.equal(G.ops.length,1);const funds=G.money,cap=deployLimit(),bonds=JSON.stringify(G.activeBonds);
  startBenchDrag(bench,0,0,0,0);drag.moved=true;boardXY=()=>[5.5*TILE,6.5*TILE];
  assert.ok(canDropOperator(drag,6,5));BDATA.level.buildable[6][5]='RANGED';assert.equal(canDropOperator(drag,6,5),false);BDATA.level.buildable[6][5]='MELEE';
  onUp({});assert.equal(drag.phase,'facing');assert.equal(B.summoneds.length,0,'facing confirmation is required');
  drag.dragging=true;drag.dirSet=true;drag.dir='left';boardXY=()=>[7.5*TILE,6.5*TILE];onUp({});
  assert.equal(drag,null);assert.deepEqual(run.tacticalPlacement,{row:6,col:5,dir:'left'});assert.equal(B.summoneds[0].dir,'left');assert.ok(!B.bench.some(s=>s.isTactical));
  assert.equal(G.money,funds);assert.equal(deployLimit(),cap);assert.equal(JSON.stringify(G.activeBonds),bonds);assert.equal(G.ops.length,1);
  assert.ok(operatorPlacementProblem({id:999,position:'ALL'},6,5).includes('战术点'));
  const empty=6;assert.ok(tacticalAction('place',run.id,6,empty,'right'));assert.equal(B.summoneds[0].col,empty);
  // Rest stores a blueprint; life-cycle timers belong solely to live combat.
  beginTokenBattle();let owner=B.operators[0],s=ArkTactician.point(owner);assert.equal(s.col,6);s.stacks=3;s.blockCnt=3;
  assert.ok(tacticalAction('retreat',run.id,0,0,'up',0,s.id));assert.equal(s.stacks,0);assert.ok(s.tacticalDormant);assert.equal(tacticalCandidates().length,0);
  assert.equal(tacticalAction('retreat',run.id,0,0,'up',0,s.id),false);assert.equal(tacticalAction('place',run.id,6,5,'up'),false);
  B.time=s.nextStackAt-.01;ArkTactician.advance(0);assert.ok(s.tacticalDormant);B.time+=.01;ArkTactician.advance(0);assert.equal(s.stacks,1);assert.equal(s.hp,s.maxHp);assert.equal(s.col,6);
  // Owner death removes the attachment; automatic owner redeployment reuses the chosen anchor.
  owner.hp=0;tryKill(owner);assert.ok(s.removed);owner.dead=false;owner.hp=owner.maxHp;owner.deployed=true;ArkTactician.advance(0);assert.equal(ArkTactician.point(owner).col,6);
  // A placement never reserved before battle remains a draggable candidate after owner deploys.
  run=manualSetup();beginTokenBattle();assert.equal(B.summoneds.length,0);bench=B.bench.find(s=>s.isTactical);assert.ok(bench);assert.equal(battleBenchRowCount(),0);
  boardXY=()=>[(bench.col+.5)*TILE,(bench.row+.5)*TILE];onDown({clientX:0,clientY:0});assert.ok(drag?.op.isTactical);drag=null;
  assert.ok(tacticalAction('place',run.id,6,5,'right'));assert.equal(B.bench.some(s=>s.isTactical),false);
  // Flow needs a manual 20-second window and a real candidate drag. No auto-copy at 100 SP.
  run=manualSetup('char_249_mlyss',true);const donor=addOperator('char_469_indigo',false);refreshBoard();assert.ok(tacticalAction('place',run.id,6,5,'right'));beginTokenBattle();owner=B.operators[0];s=ArkTactician.point(owner);
  assert.equal(s.flow.sp,100);ArkTactician.advance(1);assert.equal(s.flow.kind,'base');assert.ok(tacticalAction('copy-open',run.id));assert.equal(s.flow.copyUntil,20);assert.equal(battleBenchRowCount(),0);
  const card=B.bench.find(x=>x.id===donor.id);assert.ok(card);boardXY=()=>[(card.col+.5)*TILE,(card.row+.5)*TILE];onDown({clientX:0,clientY:0});assert.ok(drag);drag.moved=true;boardXY=()=>[(s.col+.5)*TILE,(s.row+.5)*TILE];onUp({});
  assert.equal(s.flow.sourceId,donor.charId);assert.equal(s.flow.kind,'ranged');assert.equal(donor.row,null);assert.equal(G.ops.length,2);assert.equal(s.flow.copyUntil,undefined);assert.equal(s.flow.sp,0);
  assert.equal(tacticalAction('copy-open',run.id),false);ArkFlowShape.advance(s,owner,100);assert.ok(tacticalAction('copy-open',run.id));B.time=20;ArkFlowShape.advance(s,owner,0);assert.equal(ArkFlowShape.copying(s),false);assert.equal(s.flow.sourceId,donor.charId);assert.equal(s.flow.sp,0);
  ArkFlowShape.advance(s,owner,100);assert.ok(ArkFlowShape.open(s));owner.skillState={until:B.time+10};ArkFlowShape.advance(s,owner,0);assert.equal(ArkFlowShape.copying(s),false);assert.equal(ArkFlowShape.open(s),false);owner.skillState=null;
  // Temporary copies are consumed, not returned to the candidate area or revived.
  ArkFlowShape.split(s,true);const child=B.summoneds.find(x=>x.temporary);assert.ok(child);assert.ok(tacticalAction('retreat',run.id,0,0,'up',0,child.id));assert.ok(child.removed);assert.equal(child.tacticalDormant,false);
  // Rest save uses source map geometry, not the synthetic combat test surface.
  run=manualSetup();BDATA.level=JSON.parse(JSON.stringify(SOURCE_BATTLES.levels[G.mapKey].level));refreshBoard();
  const legal=rangeCellsFor(B.operators[0]).find(([r,c])=>tacticalCanPlace(run.id,r,c));assert.ok(legal);assert.ok(tacticalAction('place',run.id,...legal,'right'));const saved=decodeRestSave(encodeRestSave());assert.deepEqual(saved.session.ops[0].tacticalPlacement,run.tacticalPlacement);
  saved.session.ops[0].tacticalPlacement.col=200;assert.ok(!B.over);
  recallBoard(run.id);assert.equal(run.tacticalPlacement,undefined);assert.equal(B.summoneds.length,0);assert.doesNotThrow(()=>decodeRestSave(encodeRestSave()));
  run=manualSetup();assert.ok(tacticalAction('place',run.id,6,5,'right'));const reserve=candidateCells(BDATA.level)[0];onBenchRecall(run.id,reserve.row,reserve.col);assert.equal(run.tacticalPlacement,undefined);assert.equal(B.summoneds.length,0);
  // A zone transition translates both anchors exactly once; invalid owners lose their point.
  run=manualSetup();curMatch='team';curDiff='difficult';chooseBand('band_amiya');startRound(13);G.ops=[];run=addOperator('char_249_mlyss',true);
  run.row=6;run.col=4;run.dir='right';run.tacticalPlacement={row:6,col:5,dir:'right'};
  BDATA.level.buildable[6][4]='RANGED';prepareSourceRound(14,{preserveFormation:true});
  assert.equal(run.row,13);assert.deepEqual(run.tacticalPlacement,{row:13,col:5,dir:'right'});
  prepareSourceRound(14,{preserveFormation:true});assert.equal(run.tacticalPlacement.row,13);
  run.col=200;prepareSourceRound(14,{preserveFormation:true});assert.equal(run.row,null);assert.equal(run.tacticalPlacement,undefined);
 }`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const config={seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},runtimes=[];
 try{
  for(let i=0;i<2;i++)runtimes.push(await injected.exports.createPlayerRuntime(config,{seed:621+i,name:'manual-'+i}));
  const command=(action,unitId,row=0,col=0,dir='up',targetId=0,tokenId='')=>({action,unitId,row,col,dir,targetId,tokenId});
  for(const rt of runtimes){rt.__testMachine.run(setup+`const run=manualSetup('char_249_mlyss',true);addOperator('char_469_indigo',false);refreshBoard();document.getElementById('decision-modal').style.display='none';`);
   const id=rt.snapshot().session.ops[0].id;assert.ok(rt.command('game/tactical',command('place',id,6,5,'right')).ok);rt.startBattle();}
  const driver=runtimes[0],layout={kind:'boss',rows:19,cols:21,sourceGeometry:true,left:{start:2,end:10},center:{start:10,end:11},right:{start:11,end:19}};
  const pair=require('../web/src/simulation/paired-battle'),inputs=runtimes.map((rt,i)=>rt.battleInput('player-'+i));
  const units=inputs.flatMap((input,i)=>input.units.map(u=>pair.toWorldUnit(u,{playerId:input.id,side:i?'right':'left'},layout)));
  assert.equal(units[1].tacticalPlacement.col,15);assert.equal(units[1].tacticalPlacement.dir,'left');
  driver.useSharedBattle({kind:'boss',units,owners:inputs,traps:[]});driver.__testMachine.run(`for(let r=5;r<=8;r++)for(let c=2;c<=18;c++)BDATA.level.buildable[r][c]='ALL';for(const o of B.operators){o.deployed=true;o.deployAt=0;o.skill.isPassive=true;o.sp=0;}ArkTactician.advance(0);`);
  const state=driver.snapshot(),right=state.battle.operators.find(o=>o.playerId==='player-1'),rightToken=state.battle.summoneds.find(s=>s.playerId==='player-1');assert.equal(rightToken.col,15);
  const donor=inputs[1].session.ops.find(o=>o.row==null);
  assert.equal(driver.command('game/tactical',command('retreat',right.unitId,0,0,'up',0,rightToken.id),'player-0').ok,false);
  assert.ok(driver.command('game/tactical',command('copy-open',right.unitId),'player-1').ok);
  assert.ok(driver.command('game/tactical',command('copy-target',right.unitId,0,0,'up',donor.id,rightToken.id),'player-1').ok);
  assert.equal(driver.snapshot().battle.summoneds.find(s=>s.playerId==='player-0').flow.kind,'base');assert.equal(driver.snapshot().battle.summoneds.find(s=>s.playerId==='player-1').flow.sourceId,donor.charId);
  assert.ok(driver.command('game/tactical',command('retreat',right.unitId,0,0,'up',0,rightToken.id),'player-1').ok);
  const sealed=driver.snapshot();driver.advance(.2);const after=driver.snapshot();driver.restore(JSON.parse(JSON.stringify(sealed)));driver.advance(.2);assert.deepEqual(driver.snapshot().battle,after.battle);assert.deepEqual(driver.snapshot().rng,after.rng);
  assert.equal(driver.command('game/freeze',{}).error.code,'WRONG_PHASE');assert.equal(driver.command('game/tactical',{...command('place',right.unitId),action:'cheat'},'player-1').error.code,'INVALID_PAYLOAD');
 }finally{runtimes.forEach(r=>r.dispose());}
 console.log('TACTICAL CONTROLS OK candidate/facing/free placement, manual retreat/revive, 20s window/donor drag, save, mirrored ownership and signed resume');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
