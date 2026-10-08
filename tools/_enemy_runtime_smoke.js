'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),f=require('./_browser_fixture')();f.ctx.assert=assert;
const runtime=require('./lib/room-game-runtime');
async function main(){
 await f.run(`(async()=>{
  await initMode();ArkSim.seed(35);chooseBand('band_amiya');
  assert.equal(G.enemySeed,35);assert.equal(G.enemyPlan.roundTypes.length,15);
  const plan=JSON.stringify(G.enemyPlan),rng=JSON.stringify(ArkSim.snapshot());
  for(let round=1;round<=15;round++){
   G.round=round;prepareSourceRound(round);
   const source=battleSourceForRun(),expected=ArkEnemyReplacement.applyToSource(currentSourceBattle(),G.enemyPlan.rounds[round],ENEMY_ENCOUNTERS);
   assert.equal(JSON.stringify(source.waves),JSON.stringify(expected.waves));
   const declared=source.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions.filter(a=>a.actionType==='SPAWN').flatMap(a=>Array.from({length:a.count},()=>a.key))));
   const before=ArkSim.snapshot();assert.deepEqual(previewCurrentWave().map(x=>x.enemyId),declared);
   assert.deepEqual(ArkSim.snapshot(),before,'preview and replacement consume no RNG');
  }
  assert.equal(JSON.stringify(G.enemyPlan),plan,'round changes never redraw enemies');
  G.round=16;assert.equal(battleSourceForRun().waves,currentSourceBattle().waves,'out-of-plan rounds never invent an enemy record');
  G.round=3;prepareSourceRound(3);G.phase='rest';G._mergeReward=null;G._upgradeConfirm=null;
  document.getElementById('decision-modal').style.display='none';
  assert.equal(saveRestRun(),true);const saved=localStorage.getItem(RUN_SAVE_KEY),session=JSON.stringify(G),savedRng=ArkSim.snapshot();
  const wave=JSON.stringify(previewCurrentWave());assert.equal(loadRestRun(),true);
  assert.deepEqual(JSON.parse(JSON.stringify(G)),JSON.parse(session));assert.deepEqual(ArkSim.snapshot(),savedRng);assert.equal(JSON.stringify(previewCurrentWave()),wave);
  function altered(change){const e=JSON.parse(saved),p=JSON.parse(e.body);change(p);e.body=JSON.stringify(p);e.checksum=saveHash(e.body);return JSON.stringify(e);}
  assert.throws(()=>decodeRestSave(altered(p=>p.session.enemyPlan.rounds[3].normalKey='enemy_missing')),/敌潮计划损坏/);
  assert.throws(()=>decodeRestSave(altered(p=>p.session.enemySeed=-1)),/敌潮种子损坏/);
  assert.throws(()=>decodeRestSave(altered(p=>delete p.session.enemyPlan)),/敌潮计划缺失/);
  const old=JSON.parse(altered(p=>{delete p.session.enemyPlan;delete p.session.enemySeed;}));old.catalog='200c25032370cd8f';
  // Historical production migrations are exact catalog pairs, not blanket
  // permission to load every later balance/mechanism revision. If that pair
  // no longer targets today's data, verify rejection before exercising the
  // migration adapter with an explicitly registered, test-only catalog.
  const fixtureCatalog='fixture-reviewed-before-enemy-plan';
  if(REST_CATALOG_MIGRATIONS[old.catalog]!==catalogFingerprint()){
   assert.throws(()=>decodeRestSave(JSON.stringify(old)),/游戏数据已更新/);
   old.catalog=fixtureCatalog;REST_CATALOG_MIGRATIONS[fixtureCatalog]=catalogFingerprint();
  }
  localStorage.setItem(RUN_SAVE_KEY,JSON.stringify(old));assert.equal(loadRestRun(),true);
  delete REST_CATALOG_MIGRATIONS[fixtureCatalog];
  assert.equal(G.enemySchedule,'legacy-source');assert.equal(battleSourceForRun().waves,currentSourceBattle().waves);assert.deepEqual(ArkSim.snapshot(),savedRng);
  assert.equal(saveRestRun(),true);assert.equal(loadRestRun(),true,'migrated legacy rest survives another save');
  const nextRng=ArkSim.snapshot();ArkRunSetup.enemyPlan(ENEMY_ENCOUNTERS,{seasonId:G.seasonId,modeId:'mode_training_1'},1);
  assert.deepEqual(ArkSim.snapshot(),nextRng,'setup generation uses a separate deterministic stream');
 })()`);
 // Exercise the production capture/restore adapter with the dedicated combat
 // override (400 ATK) that differs from the quantity database fallback (800).
 const file=fs.readFileSync(require.resolve('./lib/room-game-runtime'),'utf8'),start=file.indexOf('const ADAPTER=`'),end=file.indexOf('\n`;',start)+3;
 assert.ok(start>=0&&end>start);f.ctx.__roomClock=0;
 f.run(new Function(file.slice(start,end)+';return ADAPTER')());
 await f.run(`(async()=>{
  ArkSim.seed(23);window.__roomEnemySeed=5;chooseBand('band_amiya');G.round=10;prepareSourceRound(10);
  document.getElementById('decision-modal').style.display='none';startBattleRound();
  assert.equal(BDATA.enemies.enemy_10067_ftsjc.atk,400);
  const before=ArkSim.snapshot();__roomInput=roomCapture();roomRestore();
  assert.equal(BDATA.enemies.enemy_10067_ftsjc.atk,400,'restoration preserves encounter combat overrides');
  assert.deepEqual(ArkSim.snapshot(),before);
 })()`);
 const config={seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'};
 const created=[];
 try{
  const a=await runtime.createPlayerRuntime(config,{seed:11,enemySeed:35});created.push(a);
  const b=await runtime.createPlayerRuntime(config,{seed:12,enemySeed:35});created.push(b);
  const x=a.snapshot(),y=b.snapshot();assert.deepEqual(x.session.enemyPlan,y.session.enemyPlan,'different player shop seeds share the room enemy plan');
  assert.notDeepEqual(x.rng,y.rng);const setup=runtime.roomSetupInfo(config,{},35);assert.deepEqual(setup.enemyPlan,x.session.enemyPlan);
  a.startBattle();a.advance(3);const checkpoint=a.snapshot();a.advance(1);const after=a.snapshot();a.restore(checkpoint);a.advance(1);
  assert.deepEqual(a.snapshot().session.enemyPlan,after.session.enemyPlan,'signed recovery keeps enemy plan');
  assert.deepEqual(a.snapshot().battle.enemies,after.battle.enemies,'signed recovery keeps actual spawned enemies');
 }finally{for(const player of created)player.dispose();}
 console.log('ENEMY RUNTIME OK 15 rounds, leader exclusion, preview/RNG, save/corruption/legacy migration, shared room seed and signed battle recovery');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
