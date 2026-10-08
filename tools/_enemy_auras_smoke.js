'use strict';
// Actual engine/room consumers for the declared .5-radius maintained Aura model.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const ids=['enemy_1234_dsubrl','enemy_1234_dsubrl_2'];
const encounter=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies;
const sources=Object.fromEntries(ids.map(id=>{assert.ok(encounter[id]);return [id,encounter[id]];}));
const helpers=`
const enemyAuraSources=${JSON.stringify(sources)};
function auraNear(a,b,message=''){assert.ok(Math.abs(a-b)<1e-7,message+' '+a+' != '+b);}
function auraBattle(){
 startBattle([{id:1,charId:'char_002_amiya',col:3.4,row:3,position:'MELEE',maxHp:100000,atk:0,def:9999,magicRes:25,attackTime:100,blockCnt:0,range:0},
  {id:2,charId:'char_002_amiya',col:3.6,row:3,position:'MELEE',maxHp:100000,atk:0,def:9999,magicRes:25,attackTime:100,blockCnt:0,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];B.operators.sort((a,b)=>a.id-b.id);
 for(const o of B.operators)Object.assign(o,{atk:0,def:9999,magicRes:25,attributeBase:{atk:0,def:9999,aspd:1},
  basicAttack:{action:'attack',damageType:'phys'},cd:999,deployed:true,deployT:5,deployAt:0,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,epRecoveryPerSec:0,
  skill:{sourceId:'aura_test_defensive_sp',spCost:100,spType:'INCREASE_WHEN_TAKEN_DAMAGE',duration:0,blackboard:{},effects:[]},
  sp:0,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  flow:null,attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:0});
 return B.operators;
}
function auraSpawn(id='enemy_1234_dsubrl',x=3,y=3){
 // Real spawn/setup path; operators intentionally keep native col/row only.
 const base=JSON.parse(JSON.stringify(enemyAuraSources[id]));BDATA.enemies[id]=base;
 return spawnEnemyAt(id,{route:-1,seg:0,cp:0,x,y},base);
}
function auraAt(time){B.time=time;update(0,0);}
function auraTicks(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function auraLoss(o=B.operators[0]){return 100000-o.hp;}
function auraEp(o=B.operators[0]){return o.ep?.nervous||0;}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helpers}
  assert.ok(ArkEnemyAuras,'real index loads provider');
  for(const id of ${JSON.stringify(ids)}){
   const ops=auraBattle(),e=auraSpawn(id),p=ArkEnemyAuras.profile(e);
   assert.ok(p);assert.equal(p.range.radius,.5);assert.equal(e.rangeRadius,1.6,'DB range does not overwrite explicit collider model');
   assert.equal(ops[0].x,undefined,'test must not conceal missing col/row consumer fallback');
   assert.equal(e.canAttack,true,'legacy encounter flag is preserved as source data');
   assert.equal(ArkExternalCombat.canAttack(e,{channel:'attack'}),false,'empty actual source root overrides legacy canAttack');
   assert.equal(ArkExternalCombat.canAttack(e,{channel:'combat'}),false);
   auraAt(0);assert.ok(e.enemyAuraState.members[String(ops[0].id)]);
   assert.equal(e.enemyAuraState.members[String(ops[1].id)],undefined);
   auraAt(.999);assert.equal(auraLoss(),0);assert.equal(auraEp(),0);
   auraAt(1);assert.equal(auraLoss(),Math.round(e.atk*.75),'source arts ignores high DEF and consumes actual 25 RES');
   auraNear(auraEp(),e.atk*.05,'one source event, source ATK basis');
   assert.equal(auraLoss(ops[1]),0);assert.equal(auraEp(ops[1]),0,'0.6 is outside explicit source circle');
   assert.equal(ops[0].sp,0,'ignoreForSp periodic body is not a defensive SP attack');
   assert.equal(B.projectiles.length,0);assert.ok(!e.atkSchedule&&!e.atkPhase,'no invented ordinary attack');
   const hp=ops[0].hp,ep=auraEp();auraAt(1);assert.equal(ops[0].hp,hp);assert.equal(auraEp(),ep,'same-time update cannot duplicate tick');
  }

  let ops=auraBattle(),e=auraSpawn();auraAt(0);auraAt(1);
  ops[0].col=3.6;auraAt(1.1);assert.equal(Object.keys(e.enemyAuraState.members).length,0);
  auraAt(2);assert.equal(auraLoss(),105,'leave withdraws periodic action');
  ops[0].col=3.5;auraAt(2.1);auraAt(3.099);assert.equal(auraLoss(),105);
  auraAt(3.1);assert.equal(auraLoss(),210,'re-entry at exact radius waits a fresh full period');
  ops[0].targetFree=true;auraAt(3.2);assert.equal(Object.keys(e.enemyAuraState.members).length,0);
  ops[0].targetFree=false;auraAt(3.3);auraAt(4.299);assert.equal(auraLoss(),210);auraAt(4.3);assert.equal(auraLoss(),315);

  ops=auraBattle();e=auraSpawn();auraAt(0);B.time=.25;let second=auraSpawn('enemy_1234_dsubrl_2');auraAt(.25);
  assert.notEqual(e.visualId,second.visualId);assert.equal(e.id,undefined,'real enemies use visualId, not fabricated test identity');
  auraAt(1);assert.equal(auraLoss(),105);auraNear(auraEp(),7);
  auraAt(1.25);assert.equal(auraLoss(),225);auraNear(auraEp(),15);
  e.stunUntil=100;e.silenced=true;auraAt(2);assert.equal(auraLoss(),330,'source unsilenceable/unstunnable Talent clock continues');
  e.hp=0;killEnemy(e);auraAt(2.25);assert.equal(auraLoss(),450,'other source retains its own timer');
  assert.equal(e.enemyAuraState,undefined);auraAt(3);assert.equal(auraLoss(),450);
  assert.equal(B.projectiles.length,0);

  // A damage-event listener follows shared acceptance and modifiers, and uses
  // source current ATK even when shields reduce the actual body to one HP.
  ops=auraBattle();e=auraSpawn();auraAt(0);ops[0].medicBarrier={amount:105,until:99};
  auraAt(1);assert.equal(auraLoss(),0);assert.equal(auraEp(),0,'fully absorbed event has no nerve damage in declared model');
  ops[0].medicBarrier={amount:104,until:99};auraAt(2);assert.equal(auraLoss(),1);auraNear(auraEp(),7);
  assert.equal(inflictDamage(ops[0],0,false,'arts',false,{source:e}),0);auraNear(auraEp(),7);
  assert.equal(inflictDamage(ops[0],1,false,'arts',false,{source:e}),1);auraNear(auraEp(),14,'common event listener handles actual source damage once');
  inflictDamage(ops[0],1,false,'arts',false,{source:e,skipModifierEvents:true});auraNear(auraEp(),14);
  e.atk=200;auraAt(3);assert.equal(auraLoss(),153);auraNear(auraEp(),24,'later pulse samples current source attack');
  assert.equal(ops[0].sp,0);

  // The source own resistance is an ADDITION to one-minus-resistance, not a
  // second generic 50% timer multiplier or an immunity inferred from prose.
  ops=auraBattle();e=auraSpawn();auraAt(0);
  auraNear(ArkSkillAuras.statusResistance(e,B.time),.5);
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'stun',key:'baseline_status',duration:4}),true);
  auraNear(e.stunUntil-B.time,2,'actual source resistance halves four-second stun');
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'slow',key:'sluggish',value:.2,duration:4}),false,
   'source priority-1 override rejects the exact standard sluggish group');
  assert.equal(ArkOperatorCombat.sourceBuffActive(e,'sluggish'),false);
  e.spawnState=true;
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'slow',key:'sluggish',value:.2,duration:4}),true,
   'the self Talent is not attached during the explicit appearance-state model');
  e.spawnState=false;
  assert.equal(ArkOperatorCombat.sourceBuffActive(e,'sluggish'),false,'existing standard Buff is suppressed when self source attaches');
  auraNear(ArkOperatorCombat.movementMultiplier(e),1,'movement reads the same override result as exact-key queries');
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'movement-multiplier',key:'other-key',value:.5,duration:4}),true,
   'different-key movement effects are not erased by a broad immunity claim');
  auraNear(ArkOperatorCombat.movementMultiplier(e),.5);
  e.stunUntil=0;e.statusResistance=.2;
  auraNear(ArkSkillAuras.statusResistance(e,B.time),.7,'base .2 plus source -.5 leaves duration factor .3');
  ArkEnemyCold.apply(e,4,B.time);auraNear(e.coldUntil-B.time,1.2);
  ArkHunter.cold(e,4,B.time);auraNear(e.allyColdUntil-B.time,1.2);
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'stun',key:'test_status',duration:4}),true);
  auraNear(e.stunUntil-B.time,1.2);
  e.coldUntil=0;e.allyColdUntil=0;e.stunUntil=0;e.coldImmune=true;e.stunImmune=true;
  ArkEnemyCold.apply(e,4,B.time);ArkHunter.cold(e,4,B.time);
  assert.equal(e.coldUntil,0);assert.equal(e.allyColdUntil,0);
  assert.equal(ArkOperatorCombat.applySourceBuff(ops[0],e,{kind:'stun',key:'immune_status',duration:4}),false);
  assert.equal(e.stunUntil,0);
  const own=ArkEnemyAuras.passiveBuffs(e,B.time)[0];assert.equal(own.sourceId,e.visualId);
  assert.equal(own.stacking.overrideKey,'sluggish');assert.equal(own.priority,1);
  e.sourceTalentBlackboard=e.sourceTalentBlackboard.map(b=>b.key==='Buff.one_minus_status_resistance'?{...b,value:-.3}:b);
  auraNear(ArkSkillAuras.statusResistance(e,B.time),.5,'resolved source stage blackboard overrides default');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:1234,name:'双敌光环途中恢复'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+`auraBattle();auraSpawn();auraAt(0);B.time=.25;auraSpawn('enemy_1234_dsubrl_2');auraAt(.25);auraAt(.65);`);
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies.length,2);
  assert.equal(checkpoint.battle.enemies[0].enemyAuraState.members['1'].next,1);
  assert.equal(checkpoint.battle.enemies[1].enemyAuraState.members['1'].next,1.25);
  machine.run('auraTicks(60);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('auraTicks(60);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'two source member timers, resistance state and nerve totals replay exactly');
  assert.deepEqual(restored.rng,after.rng);
  assert.equal(100000-restored.battle.operators[0].hp,450);
  assert.equal(restored.battle.operators[0].ep.nervous,30);
  assert.equal(100000-restored.battle.operators[1].hp,0);
 }finally{runtime.dispose();}
 console.log('ENEMY AURAS OK: 2 source spawns, .5 circle, 1s/entry/independent clocks, no ordinary attacks, actual arts/nerve/absorption, own resistance/immunity and two-source host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
