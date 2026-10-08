'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();
 function openBoss(season='act1autochess',round=14){
  setSetupSeason(season);curDiff='extreme';curMatch='solo';chooseBand('band_amiya');startRound(round);
  if(round===15)G.secretCore=true;
  startBattleRound();assert.equal(G.phase,'battle');
  const action=currentSourceBattle().waves.flatMap(w=>w.fragments.flatMap(f=>f.actions)).find(a=>a.actionType==='SPAWN'&&a.key===B.leaderEnemyId);
  assert.ok(action,'source leader has a declared spawn');B.waveScheduler=null;B.spawn=[{enemyId:B.leaderEnemyId,route:action.routeIndex,at:0}];
  update(1/30,1/60);assert.ok(B.leader);B.operators=[];
  // Remaining adds, a future wave, and a flying bomb used to keep this fight running.
  const add={...B.leader,enemyId:'test-add',hp:999,maxHp:999,dead:false,revive:false,moveSpeed:0,canAttack:false,cd:99999,bossMechanics:null};
  B.enemies.push(add);B.spawn=[{enemyId:add.enemyId,route:0,at:9999}];
  B.projectiles=[{kind:'bomb',x:0,y:0,tx:20,ty:0,speed:.01,life:100,enemy:true,dmg:999}];
  return B;
 }
 for(const season of ['act1autochess','act2autochess']){
  const board=openBoss(season);G.activeBonds={};board.leader.hp=0;board.roundTime=board.roundLimit;
  const life=G.life;update(1/30,1/60);
  assert.equal(board.win,true);assert.equal(board.endReason,'leader-defeated');assert.equal(board.stats.leaks,0);
  assert.equal(G.life,life);assert.equal(G.phase,'over','final Boss immediately opens settlement');assert.ok(G.settlement);
  assert.equal(G.lastBattleWin,true);assert.equal(board.spawn.length,1,'unspawned enemies do not block victory');
  const result=JSON.stringify(G);update(1,1);assert.equal(JSON.stringify(G),result,'completed fight is inert');
 }
 // A real projectile impact ends this update; later bombs cannot overturn the win.
 const shot=openBoss();G.activeBonds={};shot.leader.hp=1;
 shot.projectiles.unshift({kind:'arrow',x:shot.leader.x,y:shot.leader.y,tx:shot.leader.x,ty:shot.leader.y,target:shot.leader,speed:10,life:1,dmg:999,enemy:false});
 update(1/30,1/60);assert.equal(shot.win,true);assert.equal(G.phase,'over');
 // Preserve supported revival stages and the established hidden-leader gate.
 const revive=openBoss();revive.leader.revive=true;revive.leader.revived=false;revive.leader.hp=0;
 update(1/30,1/60);assert.ok(revive.leader.hp>0);assert.equal(revive.over,false);assert.equal(G.phase,'battle');
 revive.leader.hp=0;G.activeBonds={test:351};update(1/30,1/60);
 assert.equal(revive.win,true);assert.equal(G.round,15);assert.equal(G.secretCore,true);assert.equal(G.phase,'rest');
 const hidden=openBoss('act1autochess',15);hidden.leader.hp=0;update(1/30,1/60);assert.equal(G.phase,'over');assert.equal(G.lastBattleWin,true);
 // A boss leaving the map alive is a leak, never an HP-zero victory.
 const leaked=openBoss();leaked.leader.dead=true;leaked.leader.hp=leaked.leader.maxHp;
 assert.equal(finishDefeatedLeader(),false);assert.equal(leaked.over,false);
 console.log('BOSS VICTORY OK both seasons, immediate settlement with adds/pending waves/bombs, deadline priority, projectile kill, revival/hidden rounds and no duplicate result');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
