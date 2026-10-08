'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const levels=skills.skchr_cammou_2.levels.map((s,i)=>({level:i+1,sp:s.spData.spCost,init:s.spData.initSp,duration:s.duration,bb:Object.fromEntries(s.blackboard.map(b=>[b.key,b.value]))}));
// Particles use presentation-only Math.random(); compare every other battle field.
const logicBattle=b=>{const {particles,...rest}=b;return rest;};
const helper=`
function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-6,msg+': '+a+' != '+b);}
function click(c){const cid='char_328_cammou';ACCOUNT.ops[cid]={evolve:2,level:1,skillLevel:c.level,potential:1,trust:0,selectedSkill:1};G.skillChoices[cid]=1;
 const e=debugTacticalEntry(cid),stats=finalizeOperator(e,null,[],false);startBattle([{...stats,id:1,charId:cid,name:e.name,profession:e.profession,position:e.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(e,false),garrisonAdd:null}],[],100);
 Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];Object.assign(o,{sp:0,cd:999,deployAt:0,deployT:2,deployed:true});return o;}
function foe(x,y,extra={}){const e={id:100+B.enemies.length,visualId:100+B.enemies.length,enemyId:'fixture',x,y,hp:100000,maxHp:100000,def:0,magicRes:0,atk:0,canAttack:false,moveSpeed:0,attackTime:2,cd:999,path:[{x,y},{x:x+2,y}],pi:1,...extra};B.enemies.push(e);return e;}
function begin(o){o.sp=o.skill.spCost;assert.equal(castSkill(o),true);}
function droneTick(o){B.time=Math.max(B.time,o.releasedDrone.nextAt);ArkOperatorCombat.update(0);}
function verify(c){
 const o=click(c),before=JSON.stringify(o.cells);assert.equal(o.skill.spCost,c.sp);assert.equal(o.skill.initSp,c.init);assert.equal(o.skill.duration,c.duration);begin(o);assert.equal(o.skillState.until,c.duration);assert.equal(o.cells.length,o.skill.rangeGrids.length);assert.equal(B.summoneds.length,0);
 const p=ArkOperatorCombat.planFor(o,o.skill);assert.equal(p.drone,false,'released drone is not attached bonus');near(p.stun,c.bb['attack@stun']);near(p.stunProb,c.bb['attack@prob']);
 const e=foe(6,3),power=operatorAttackPower(o,buffMul(o).atk),interval=ArkOperatorCombat.attackInterval(o,o.skill);
 for(let i=0;i<8;i++){const hp=e.hp;droneTick(o);near(hp-e.hp,Math.round(power*Math.min(1.1,.2+.15*i)),'released source ramp');near(o.releasedDrone.nextAt-B.time,interval);}
 e.x=14;e.y=0;const hp=e.hp;droneTick(o);assert.ok(e.hp<hp,'released lock continues out of caster range');assert.equal(o.releasedDrone.targetId,e.visualId);assert.equal(ArkOperatorCombat.attack(o),false,'caster cannot follow out of range');
 const fresh=foe(6,3,{flying:true});const old=e.hp;droneTick(o);assert.ok(e.hp<old);assert.equal(fresh.hp,100000,'new in-range enemy does not steal lock');e.dead=true;droneTick(o);near(100000-fresh.hp,Math.round(power*.2),'target change resets ramp');
 for(const field of ['stunUntil','sleepUntil','freezeUntil']){o[field]=B.time+10;const hp=fresh.hp;droneTick(o);assert.ok(fresh.hp<hp,'existing drone continues during '+field);o[field]=0;}
 endOperatorSkill(o);assert.equal(o.releasedDrone,null);assert.equal(JSON.stringify(o.cells),before);const hp2=fresh.hp;ArkOperatorCombat.update(1);assert.equal(fresh.hp,hp2,'skill end ends independent damage');
 assert.ok(B.combatEffects.some(f=>f.kind==='released-drone-hit'));
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,levels});f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of levels)verify(c);`);
 f.run(`{
 let o=click(levels.at(-1));begin(o);const rng=JSON.stringify(ArkSim.snapshot());ArkOperatorCombat.update(.5);assert.equal(o.releasedDrone.targetId,null);assert.equal(JSON.stringify(ArkSim.snapshot()),rng,'no target does not consume RNG');
 const e=foe(6,3);o.stunUntil=5;ArkOperatorCombat.update(0);assert.equal(e.hp,100000,'cannot release new lock while stunned');o.stunUntil=0;ArkOperatorCombat.update(0);assert.ok(e.hp<100000);
 const savedRandom=gameRandom;gameRandom=()=>0;const old=e.hp;droneTick(o);near(e.stunUntil,B.time+o.skill.blackboard['attack@stun']);e.stunImmune=true;e.stunUntil=0;droneTick(o);assert.equal(e.stunUntil,0);
 gameRandom=savedRandom;o.hp=0;tryKill(o);assert.equal(o.releasedDrone,null);assert.equal(o._droneHits,0);const hp=e.hp;ArkOperatorCombat.update(5);assert.equal(e.hp,hp);B.time=o.respawnAt;B.dp=99;respawnOperators();assert.equal(o.dead,false);assert.equal(o.releasedDrone,null);begin(o);droneTick(o);assert.equal(o._droneHits,0,'redeployment resets first hit');
 o=click(levels[0]);begin(o);foe(6,3);update(0,0);assert.ok(o.releasedDrone.targetId!=null);B.time=o.skillState.until-.01;o.sp=0;update(.01,.01);assert.equal(o.skillState,null);assert.equal(o.releasedDrone,null,'real timed expiry');
 o=click(levels.at(-1));const t=foe(6,3);o.cd=0;begin(o);const power=operatorAttackPower(o,buffMul(o).atk);ArkOperatorCombat.attack(o);for(const p of B.projectiles.splice(0))ArkOperatorCombat.impact(p);near(100000-t.hp,Math.round(power),'caster one hit has no duplicate attached drone');
 for(const sid of ['act1autochess','act2autochess']){setupSeasonId=sid;buildRoster();assert.equal(ROSTER_LIST.some(o=>o.charId==='char_328_cammou'),false,'library skill does not add fixed shop identity');}
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:328,name:'卡达'});
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);rt.__testMachine.run(`var o=click(${JSON.stringify(levels.at(-1))});o.playerId='one';foe(6,3);begin(o);ArkOperatorCombat.update(0);B.enemies[0].x=14;B.operators.push({...o,id:2,playerId:'two',row:7,col:1,sp:0,cd:999,skillState:null,releasedDrone:null});`);
  const checkpoint=rt.snapshot();rt.advance(3);const expected=rt.snapshot();rt.restore(checkpoint);rt.advance(3);let actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(expected.battle));assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.operators[0].playerId,'one');assert.equal(actual.battle.operators[1].releasedDrone,null);
  const live=rt.snapshot();rt.advance(30);rt.advance(1);const expired=rt.snapshot();rt.restore(live);rt.advance(30);rt.advance(1);actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(expired.battle));assert.deepEqual(actual.rng,expired.rng);
 }finally{rt.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/click-receipts.json'),JSON.stringify({skillLevels:10,signedReplays:2,fixedRoster:false,limits:'instant initial lock, release/return travel and exact action frame phase remain approximations; module effects and full abnormal-stat inheritance pending'},null,2));
 console.log('CLICK OK 10 S2 levels, independent lock/ramp/stun/lifecycle, library isolation and 2 signed restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
