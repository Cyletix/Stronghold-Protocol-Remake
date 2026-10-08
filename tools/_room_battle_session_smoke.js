'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {createBattleSession,roundChoices}=require('./lib/room-battle-session');
// Trusted fixtures expose only this test copy's VM; production has no endpoint
// to set health, skip rounds or supply a battle result.
const filename=require.resolve('./lib/room-game-runtime'),src=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
assert.equal(src.split(marker).length,2);injected._compile(src.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},created=[];
let time=1000;
async function room(count=4,round=1){
 const r={players:new Map(),revision:1,pairSeed:123,roundChoices:roundChoices(config,123)},ps=[];
 for(let i=0;i<count;i++){
  const runtime=await injected.exports.createPlayerRuntime(config,{seed:100+i,name:'联机'+i});created.push(runtime);runtime.alignRoundChoices(r.roundChoices);
  if(round>1)runtime.__testMachine.run('startRound('+round+')');
  const p={id:'player-'+i,name:'联机'+i,connected:true,runtime,gameReady:true,gameRevision:1};r.players.set(p.id,p);ps.push(p);
 }
 const controller=createBattleSession(r,{now:()=>time,release:p=>p.runtime.dispose()});return {r,ps,controller};
}
function tick(c,seconds=.25){time+=seconds*1000;c.tick();assert.notEqual(c.phase,'error',JSON.stringify(c.summary()));}
function until(c,predicate,max=2000){for(let i=0;i<max&&!predicate();i++)tick(c);assert.ok(predicate(),JSON.stringify(c.summary()));}
async function main(){
 const {r,ps,controller:c}=await room();
 ps[3].gameReady=false;assert.equal(c.start(),false);ps[3].gameReady=true;assert.equal(c.start(),true);assert.equal(c.phase,'battle');
 assert.equal(c.summary().battles.length,4,'ordinary battles remain independent');
 tick(c,1/6);const one=c.view(ps[0]),two=c.view(ps[1]);assert.ok(one.battle.time>0);assert.equal(one.session.round,1);
 assert.ok(Math.abs(one.battle.time-one.battle.roundTime*2)<1e-8);assert.equal(one.battleView.kind,'normal');assert.notEqual(one.battleView.battleId,two.battleView.battleId);
 const before=JSON.stringify(two);c.view(ps[0]).session.money=900;assert.equal(JSON.stringify(c.view(ps[1])),before);
 ps[0].connected=false;until(c,()=>c.phase==='intermission');assert.ok(ps.every(p=>p.runtime.status().done),'disconnected player still participates in automatic battle');
 const end=ps.map(p=>p.runtime.snapshot().session);until(c,()=>c.phase==='preparing');
 assert.ok(ps.every(p=>p.runtime.status().round===2));assert.ok(ps.every(p=>p.runtime.snapshot().session.roundResults.length===1));
 const money=ps.map(p=>p.runtime.snapshot().session.money);for(let i=0;i<8;i++)tick(c);
 assert.deepEqual(ps.map(p=>p.runtime.snapshot().session.money),money,'completed barrier never awards round money twice');
 assert.ok(ps.every((p,i)=>p.runtime.status().life===end[i].life));c.dispose();

 const boss=await room(4,14),bc=boss.controller;bc.start();assert.equal(bc.summary().battles.length,2,'four living players form two shared Boss worlds');tick(bc);
 for(const group of bc.summary().battles){
  const a=boss.r.players.get(group.seats[0].playerId),b=boss.r.players.get(group.seats[1].playerId);
  assert.deepEqual(bc.view(a).battle,bc.view(b).battle,'both seats receive exact same live Boss state');assert.equal(bc.view(b).battleView.side,'right');
  a.runtime.__testMachine.run('B.leader.hp=B.leader.maxHp*0.2');
 }
 tick(bc);let events=bc.summary().events.filter(e=>e.type==='boss-damage');assert.equal(events.length,6);assert.deepEqual(events.map(e=>e.percent),[25,50,75,25,50,75]);
 tick(bc);assert.equal(bc.summary().events.filter(e=>e.type==='boss-damage').length,6,'repeated polls do not repeat milestones');
 const bossGroups=bc.summary().battles;
 const defeat=group=>boss.r.players.get(group.seats[0].playerId).runtime.__testMachine.run('B.leader.hp=0;B.spawn.push({enemyId:B.leaderEnemyId,route:0,at:9999})');
 defeat(bossGroups[0]);tick(bc);assert.equal(bc.phase,'battle','another independent Boss world must still finish');
 for(const seat of bossGroups[0].seats){const p=boss.r.players.get(seat.playerId);assert.equal(p.runtime.status().done,true);assert.equal(p.runtime.status().win,true);}
 defeat(bossGroups[1]);tick(bc);assert.equal(bc.phase,'over','Boss victory bypasses the ordinary three-second intermission');
 for(const group of bossGroups){const [a,b]=group.seats.map(s=>boss.r.players.get(s.playerId));assert.equal(a.runtime.status().life,b.runtime.status().life);assert.equal(a.runtime.status().win,true);}
 assert.ok(boss.ps.every(p=>p.runtime.snapshot().session.settlement),'each real player has own final result');
 const bossResults=boss.ps.map(p=>p.runtime.snapshot().session.roundResults);tick(bc);assert.deepEqual(boss.ps.map(p=>p.runtime.snapshot().session.roundResults),bossResults);bc.dispose();

 const orphan=await room(2,14),oc=orphan.controller;oc.start();const driverId=oc.summary().battles[0].seats[0].playerId,driver=orphan.r.players.get(driverId);
 assert.equal(oc.remove(driver),true);orphan.r.players.delete(driverId);tick(oc);assert.ok(oc.view([...orphan.r.players.values()][0]).battle,'leaving driver does not dispose active shared world');
 until(oc,()=>oc.phase==='over');assert.throws(()=>driver.runtime.status(),e=>e.code==='RUNTIME_DISPOSED');oc.dispose();

 const forfeitedBoss=await room(2,14),fc=forfeitedBoss.controller;fc.start();
 const forfeitedId=fc.summary().battles[0].seats[0].playerId,forfeitedDriver=forfeitedBoss.r.players.get(forfeitedId),remaining=forfeitedBoss.ps.find(p=>p!==forfeitedDriver);
 forfeitedDriver.forfeited=true;forfeitedDriver.forfeitReason='connection-timeout';fc.forfeit(forfeitedDriver);
 assert.equal(fc.view(forfeitedDriver).session.phase,'over');assert.equal(fc.playerSummary(forfeitedDriver).readOnly,true);
 const initialBossTime=fc.view(remaining).battle.time;tick(fc);assert.ok(fc.view(remaining).battle.time>initialBossTime,'forfeited primary still owns this already-running automatic shared world');
 until(fc,()=>fc.phase==='over');assert.ok(remaining.runtime.snapshot().session.settlement,'remaining teammate receives the shared Boss result');fc.dispose();
 console.log('ROOM BATTLE SESSION OK four independent fields, authoritative barrier/2x, once-only rewards, paired shared Boss HP/25-50-75, settlements, forfeited and departed-driver cleanup');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>created.forEach(p=>p.dispose()));
