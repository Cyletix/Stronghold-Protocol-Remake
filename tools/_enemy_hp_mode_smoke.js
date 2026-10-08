'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const fixture = require('./_browser_fixture')();
fixture.ctx.assert = assert;

// The browser and room VM execute the same fixture against real generated
// cswrtr profiles, ordinary damage getters and provider state serialization.
const helpers = `
function hpSmokeBattle(){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:10000,
  atk:0,def:100,magicRes:0,attackTime:100,blockCnt:1,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 Object.assign(B.operators[0],{hp:10000,maxHp:10000,atk:0,def:100,magicRes:0,
  attributeBase:{atk:0,def:100,aspd:1},basicAttack:{action:'attack',damageType:'phys'},
  cd:999,deployed:true,deployT:5,deployAt:0,skill:null,skillState:null,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,
  attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1});
 const e={enemyId:'enemy_2020_cswrtr',x:3,y:2.5,hp:80000,maxHp:80000,atk:800,
  def:1000,magicRes:50,rangeRadius:3,applyWay:'RANGED',attackTime:2,moveSpeed:0,
  atkType:'phys',dead:false,cd:0,visualId:22,route:-1,sourceTalentBlackboard:[]};
 setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return e;
}
function hpSmokeStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function hpSmokeProvider(e=B.enemies[0]){
 return ArkExternalCombatData.enemies[e.enemyId].modeProviders.find(p=>p.kind==='hp-ratio-toggle-mode');
}
function hpSmokeState(e=B.enemies[0]){return e.externalModeProviders?.[hpSmokeProvider(e).id];}
function hpSmokeMetrics(){
 const e=B.enemies[0],o=B.operators[0];
 return {hp:e.hp,mode:e.externalCombatMode,active:!!hpSmokeState(e)?.active,
  def:enemyDef(e),res:ArkExternalCombat.attribute(e,'magic_resistance',e.magicRes),
  output:enemyDamageToOperator(e,o,1,'phys'),scale:ArkExternalCombat.outputDamageScale(e),
  physical:calcDamageResult(o,e,1,{raw:3000,type:'phys'}).amount,
  arts:calcDamageResult(o,e,1,{raw:1000,type:'arts'}).amount,
  baseDef:e.def,baseRes:e.magicRes,effects:hpSmokeState(e)?.effects||[]};
}
function hpSmokeActivate(){
 const e=B.enemies[0];e.hp=40001;refreshEnemyModeProviders(e);
 inflictDamage(e,1,false,'true');return hpSmokeMetrics();
}
function hpSmokeRecover(){
 const e=B.enemies[0];e.hp=40002;refreshEnemyModeProviders(e);return hpSmokeMetrics();
}
`;

async function main() {
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};
  ${helpers}
  let e=hpSmokeBattle();const p=hpSmokeProvider(e);
  assert.ok(p,'real cswrtr has its complete compiled HP provider');
  assert.deepEqual(Array.from(p.templateKeys),['switch_mode','damage_scale[out]']);
  assert.equal(p.blackboard.namespace,'rage');
  assert.equal(p.blackboard.defaults.hp_ratio,.5);
  assert.equal(p.buffs.length,2);
  assert.equal(buffMul(B.operators[0]).def,1,'fixture defender has no unrelated defense multiplier');
  assert.equal(operatorDefense(B.operators[0]),100);
  refreshEnemyModeProviders(e);
  assert.equal(e.externalCombatMode,0);assert.equal(hpSmokeState(e).active,false);
  assert.equal((hpSmokeState(e).effects||[]).length,0);
  assert.equal(enemyDef(e),1000);assert.equal(ArkExternalCombat.outputDamageScale(e),1);

  e.hp=40001;refreshEnemyModeProviders(e);
  assert.equal(e.externalCombatMode,0,'one HP above the tolerance remains outside the threshold');
  assert.equal(inflictDamage(e,1,false,'true'),1);
  assert.equal(e.hp,40000);
  assert.equal(e.externalCombatMode,1,'inflictDamage crosses HP threshold immediately, without waiting for the next frame');
  assert.equal(hpSmokeState(e).active,true);
  assert.equal(hpSmokeState(e).effects.length,3,'both Buff declarations contribute their complete effects');
  assert.equal(enemyDef(e),2000);assert.equal(ArkExternalCombat.attribute(e,'magic_resistance',e.magicRes),90);
  assert.equal(enemyDamageToOperator(e,B.operators[0],1,'phys'),1050);
  assert.equal(calcDamageResult(B.operators[0],e,1,{raw:3000,type:'phys'}).amount,1000);
  assert.equal(calcDamageResult(B.operators[0],e,1,{raw:1000,type:'arts'}).amount,100);
  assert.equal(e.def,1000);assert.equal(e.magicRes,50,'active modifiers never rewrite source base stats');

  hpSmokeStep();const cast=e.atkSchedule,effects=hpSmokeState(e).effects;
  assert.ok(cast,'selected mode starts its real projectile attack');
  hpSmokeStep(3);
  assert.equal(e.atkSchedule,cast,'steady HP does not restart the same cast every frame');
  assert.equal(hpSmokeState(e).effects,effects,'steady HP does not reapply or stack the active Buffs');
  assert.equal(enemyDef(e),2000);assert.equal(ArkExternalCombat.outputDamageScale(e),1.5);

  hpSmokeRecover();
  assert.equal(e.externalCombatMode,0);assert.equal(hpSmokeState(e).active,false);
  assert.equal(hpSmokeState(e).effects.length,0);
  assert.equal(enemyDef(e),1000);assert.equal(ArkExternalCombat.attribute(e,'magic_resistance',e.magicRes),50);
  assert.equal(ArkExternalCombat.outputDamageScale(e),1);assert.equal(enemyDamageToOperator(e,B.operators[0],1,'phys'),700);
  assert.equal(e.atkSchedule,null,'removing the mode Buff detaches the previous attack');

  e=hpSmokeBattle();e.hp=60000;
  e.sourceTalentBlackboard=[{key:'foo.hp_ratio',value:1},{key:'foo.damage_scale',value:100}];
  refreshEnemyModeProviders(e);assert.equal(e.externalCombatMode,0,'unrelated namespace cannot override rage');
  e.sourceTalentBlackboard.push({key:'rage.hp_ratio',value:.8});
  refreshEnemyModeProviders(e);assert.equal(e.externalCombatMode,1,'the exact runtime rage namespace overrides its compiled default');
  assert.equal(ArkExternalCombat.outputDamageScale(e),1.5,'unrelated damage-scale key is ignored');
  e.sourceTalentBlackboard.find(x=>x.key==='rage.hp_ratio').value=.4;
  refreshEnemyModeProviders(e);assert.equal(e.externalCombatMode,0,'updated scoped threshold can remove active Buffs');

  e=hpSmokeBattle();e.hp=40000;e.dead=true;
  refreshEnemyModeProviders(e);
  assert.equal(e.externalCombatMode,0);assert.equal(e.externalModeProviders,undefined,'dead units never newly activate HP Buffs');
  e=hpSmokeBattle();e.hp=40000;e.bossMechanics={attack:{}};
  refreshEnemyModeProviders(e);
  assert.equal(e.externalCombatMode,0);assert.equal(e.externalModeProviders,undefined,'dedicated Boss owns its mode lifecycle');
  assert.equal(ArkExternalCombat.outputDamageScale(e),1);
 })()`);

 const filename = path.join(__dirname, 'lib/room-game-runtime.js');
 const source = fs.readFileSync(filename, 'utf8');
 const marker = 'return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length, 2);
 const injected = new Module(filename, module);
 injected.filename = filename;
 injected.paths = Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker, 'return Object.freeze({__testMachine:machine,fingerprint,config:'), filename);
 const runtime = await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'}, {seed:114,name:'HP双Buff存档'});
 try {
  runtime.startBattle();
  const machine = runtime.__testMachine;
  machine.run(helpers + 'hpSmokeBattle();hpSmokeActivate();');
  runtime.advance(.1);
  const activeMetrics = JSON.parse(JSON.stringify(machine.run('hpSmokeMetrics()')));
  assert.equal(activeMetrics.mode,1);assert.equal(activeMetrics.def,2000);
  assert.equal(activeMetrics.output,1050);assert.equal(activeMetrics.effects.length,3);
  const checkpoint = JSON.parse(JSON.stringify(runtime.snapshot()));
  const savedState = Object.values(checkpoint.battle.enemies[0].externalModeProviders)[0];
  assert.equal(savedState.active,true);assert.equal(savedState.effects.length,3,'active effects are serialized with the Buff edge state');
  machine.run('hpSmokeRecover();');runtime.advance(.1);
  const after = runtime.snapshot();
  assert.equal(after.battle.enemies[0].externalCombatMode,0);
  runtime.restore(checkpoint);
  assert.deepEqual(JSON.parse(JSON.stringify(machine.run('hpSmokeMetrics()'))),activeMetrics,
   'restoring active HP Buffs preserves incoming/outgoing damage and unchanged base stats');
  machine.run('hpSmokeRecover();');runtime.advance(.1);
  assert.deepEqual(runtime.snapshot().battle,after.battle,'restore then healing dispatches one complete finish edge with deterministic battle state');
 } finally {
  runtime.dispose();
 }
 console.log('HP MODE OK: real cswrtr complete two-Buff threshold edges, DEF/RES/output damage, namespace, no stacking, dead/Boss exclusion and VM restore');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
