'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const sources=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies;
const helpers=`
const preSources=${JSON.stringify(Object.fromEntries(['enemy_1010_demon','enemy_1010_demon_2'].map(k=>[k,sources[k]])))};
function preBattle(enemyId='enemy_1010_demon'){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:50000,atk:0,def:0,
  attackTime:100,blockCnt:3,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const op of B.operators)Object.assign(op,{atk:0,cd:999,deployAt:0,deployT:5,skill:null,skillState:null,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,blockCnt:3,
  attributeBase:{atk:0,def:0,aspd:1},dodge:0,dmgTaken:1,cooperationResistance:1});
 const base=JSON.parse(JSON.stringify(preSources[enemyId]));
 const e={...base,hp:base.maxHp,x:3,y:2.5,dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,base);e.cd=0;B.enemies.push(e);return e;
}
function preStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  for(const key of ['enemy_1010_demon','enemy_1010_demon_2']){
   let e=preBattle(key);const op=B.operators[0],hp=op.hp;preStep();
   assert.equal(e.atkSchedule.source,'root-melee-no-pre-animation-v1');
   assert.equal(e.atkSchedule.firstAttack,true);assert.equal(e.atkSchedule.animation,'Attack');
   assert.ok(Math.abs(e.atkSchedule.windup-.9)<1e-9,'first attack uses native capped animation');
   preStep(26);assert.equal(op.hp,hp,'no damage before OnAttack');preStep();
   assert.equal(hp-op.hp,e.atk,'one source physical packet');
   for(let i=0;i<180&&e.atkSchedule?.firstAttack!==false;i++)preStep();
   assert.equal(e.atkSchedule.animation,'Attack_NoPre');assert.equal(e.atkSchedule.firstAttack,false);
   assert.ok(Math.abs(e.atkSchedule.windup-.5)<1e-9,'continuous attack uses shorter source pre-delay');
   const hp2=op.hp;preStep(14);assert.equal(op.hp,hp2);preStep();assert.equal(hp2-op.hp,e.atk);
   finishEnemyAttack(e);e.x=8;preStep();assert.equal(e.externalPreAttack,null,'walking clears combat continuity');
   e.x=3;e.y=2.5;e.cd=0;preStep();assert.equal(e.atkSchedule.firstAttack,true,'re-entry restores first animation');
   finishEnemyAttack(e);e.stunUntil=B.time+.1;preStep();assert.equal(e.externalPreAttack,null);
   preStep(5);e.cd=0;preStep();assert.equal(e.atkSchedule.firstAttack,true,'control break restores first animation');
   assert.equal(ArkExternalCombat.canAttack(e,{channel:'attack'}),false,'no ranged fallback');
  }
  let e=preBattle();e.attackTime=.015;
  const fast=ArkEnemyPreAttack.schedule(e,.015,{channel:'combat'});
  assert.ok(Math.abs(fast.windup-.009)<1e-9,'this native supplier has no .1 scale floor');
  const serialized=JSON.parse(JSON.stringify(e));assert.equal(ArkEnemyPreAttack.schedule(serialized,5,{channel:'combat'}).firstAttack,false);
  e.attackTiming={windup:2,strike:0,recovery:1};assert.equal(ArkExternalCombat.attackTiming(e,5,{channel:'combat'}).source,'override');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),hostSource=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(hostSource.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(hostSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:594,name:'首攻恢复'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;machine.run(helpers);
  for(const key of ['enemy_1010_demon','enemy_1010_demon_2']){
   machine.run('preBattle('+JSON.stringify(key)+');preStep(10);');
   const saved=JSON.parse(JSON.stringify(runtime.snapshot()));machine.run('preStep(180);');const expected=runtime.snapshot();
   runtime.restore(saved);machine.run('preStep(180);');const restored=runtime.snapshot();
   delete expected.battle.particles;delete restored.battle.particles;
   assert.deepEqual(restored.battle,expected.battle,key+' checkpoint retains first/repeat state and event cursor');
  }
 }finally{runtime.dispose();}
 console.log('PRE ATTACK OK two real variants, first/continuous source events, contact/control reset, overrides and host checkpoints');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
