'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies.enemy_2025_syufo;
const helpers=`
const hoverSource=${JSON.stringify(source)};
function hoverBattle(){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:50000,atk:0,def:0,
  attackTime:100,blockCnt:3,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const op of B.operators)Object.assign(op,{atk:0,cd:999,deployAt:0,deployT:5,skill:null,skillState:null,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,blockCnt:3,
  attributeBase:{atk:0,def:0,aspd:1},dodge:0,dmgTaken:1,cooperationResistance:1});
 const base=JSON.parse(JSON.stringify(hoverSource));
 const e={...base,hp:base.maxHp,x:3,y:2.5,dead:false,cd:999,visualId:22,route:-1};
 setupEnemy(e,base);B.enemies.push(e);return e;
}
function hoverStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=hoverBattle();assert.equal(e.motion,'FLY');assert.equal(e.flying,true);
  hoverStep();assert.equal(e.blockerId??null,null);assert.equal(B.operators[0].blocked,0);
  B.operators[0].cd=0;ArkOperatorCombat.attack(B.operators[0]);
  assert.equal(B.projectiles.length,0,'ordinary ground operator cannot acquire hovering enemy');
  assert.equal(e.hp,e.maxHp);B.operators[0].cd=999;
  for(const status of ['silenceUntil','sleepUntil','levitateUntil']){
   e=hoverBattle();e[status]=B.time+10;hoverStep();assert.equal(e.externalCombatMode,0,status+' does not disable the fly Buff');
  }
  for(const status of ['stunUntil','freezeUntil','frozenUntil','groundBoundUntil']){
   e=hoverBattle();e[status]=B.time+.1;const time=B.time;hoverStep();
   assert.equal(e.externalCombatMode,1,status);assert.equal(e.flying,false);assert.equal(e.motion,'WALK');
   assert.equal(e.blockerId,1);assert.equal(B.operators[0].blocked,1);
   assert.ok(e.stunUntil>=B.time+.499);assert.equal(e.externalHover.landings,1);
   const until=e.stunUntil;hoverStep(60);assert.equal(e.stunUntil,until,'no repeated landing stun');
   assert.equal(e.externalCombatMode,1,'status expiry does not restore the flying mode');
   assert.equal(e.atkPhase,null,'unbound RecoverAnim does not auto cast');
   assert.equal(ArkEnemySkills.profiles(e).some(s=>s.skillKey?.toLowerCase()==='recoveranim'),false);
  }
  e=hoverBattle();e.stunUntil=B.time+3;hoverStep();assert.ok(e.stunUntil>B.time+2.9,'existing longer stun is retained');
  e=hoverBattle();e.stunImmune=true;e.groundBoundUntil=B.time+1;hoverStep();assert.equal(e.externalCombatMode,1);assert.ok(!(e.stunUntil>B.time));
  e=hoverBattle();e.cd=0;e.attackTime=.3;const op=B.operators[0];
  for(let n=0;n<30&&!(op.ep?.erosion>0);n++)hoverStep();
  assert.equal(op.ep.erosion,250,'source ATK 500 x 0.5 erosion once per ranged hit');
  assert.ok(op.hp<op.maxHp);assert.equal(e.externalCombatMode,0);
  e=hoverBattle();e.stunUntil=B.time+.1;hoverStep(20);e.y=1;e.cd=0;hoverStep(90);
  assert.equal(B.projectiles.length,0);assert.equal(B.operators[0].hp,B.operators[0].maxHp,'ground mode has no ranged channel');
  e.y=2.5;e.cd=0;e.attackTime=.3;
  for(let n=0;n<30&&!(B.operators[0].ep?.erosion>0);n++)hoverStep();
  assert.equal(B.projectiles.length,0,'ground contact uses melee');assert.equal(B.operators[0].ep.erosion,250);
  e=hoverBattle();e.sourceTalentBlackboard[0].value=0;ArkElements.configureEnemy(e);e.cd=0;e.attackTime=.3;
  hoverStep(20);assert.ok(!B.operators[0].ep?.erosion,'explicit zero erosion override is retained');
  e=hoverBattle();e.dead=true;e.stunUntil=B.time+1;assert.equal(ArkEnemyHover.refresh(e,B.time),false);
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),hostSource=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(hostSource.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(hostSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:932,name:'悬浮恢复'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;machine.run(helpers);
  for(const state of ['flying','landing']){
   machine.run('hoverBattle();'+(state==='landing'?'B.enemies[0].freezeUntil=B.time+.2;hoverStep();':''));
   const saved=JSON.parse(JSON.stringify(runtime.snapshot()));
   machine.run('B.enemies[0].freezeUntil=B.time+.1;hoverStep(45);');const expected=runtime.snapshot();
   runtime.restore(saved);machine.run('B.enemies[0].freezeUntil=B.time+.1;hoverStep(45);');const restored=runtime.snapshot();
   delete expected.battle.particles;delete restored.battle.particles;
   assert.deepEqual(restored.battle,expected.battle,state+' checkpoint resumes the same one-way landing');
   assert.equal(restored.battle.enemies[0].externalHover.landings,1);
  }
 }finally{runtime.dispose();}
 console.log('HOVER OK source flight/blocking, stun/freeze/ground-bound landing, excluded statuses, absent recovery, melee/ranged erosion and host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
