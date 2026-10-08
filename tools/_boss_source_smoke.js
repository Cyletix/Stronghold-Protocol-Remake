'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {enemyVariant}=require('./lib/source-battle');
const root=path.join(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const activity=read('data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const source=read('web/source_battles.json'),rounds=read('web/mode_rounds.json');
const database=new Map(read('data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json').enemies.map(e=>[e.Key,e.Value]));
for(const [id,season]of Object.entries(source.seasons)){
  const expected=Object.fromEntries(Object.entries(activity.activity.AUTOCHESS_SEASON[id].bossInfoDict).map(([bossId,boss])=>[bossId,{...activity.autoChessData.bossInfoDict[bossId],...boss}]));
  assert.deepEqual(season.bosses,expected);
  assert.equal(season.bosses.boss_7.enemyId,'enemy_9033_acdeer');
  assert.equal(season.bosses.boss_7.handbookEnemyId,'enemy_2054_smdeer');
  assert.deepEqual(season.turnInfo,activity.autoChessData.turnInfoDataDict);
  assert.equal(season.turnInfo.mode_multi_normal[14].normalPhaseTime,195);
  assert.equal(season.turnInfo.mode_multi_normal[14].bossTurnHpReduceTime,150);
}
let preserved=0;
for(const [key,level]of Object.entries(rounds.levels))for(const ref of level.enemyDbRefs){
  const expected=enemyVariant(ref,database,{}),actual=source.levels[key].enemies[ref.id];
  assert.deepEqual(actual.sourceSkills,expected.sourceSkills);
  assert.deepEqual(actual.sourceTalentBlackboard,expected.sourceTalentBlackboard);preserved++;
}
const boss=source.levels['activities/act1autochess/level_act1autochess_h07_01_s'].enemies.enemy_9013_acstmk;
assert.equal(boss.sourceSkills[0].initCooldown,20);
assert.equal(boss.sourceSkills[1].blackboard.find(b=>b.key==='branch_id').valueStr,'boss_summon_enemy');
assert.equal(boss.skills,undefined,'uninterpreted client skills must not become generic executable skills');
const db=new Map([['test',[
  {level:0,enemyData:{skills:[{prefabKey:'old',initCooldown:1}],talentBlackboard:[{key:'phase.hp',value:0.5,valueStr:null}]}},
  {level:1,enemyData:{skills:[{prefabKey:'new',initCooldown:4,blackboard:[{key:'branch_id',value:0,valueStr:'summon'}]}]}}
]]]);
const merged=enemyVariant({id:'test',useDb:true,level:1,overwrittenData:{talentBlackboard:[]}},db,{});
assert.equal(merged.sourceSkills[0].prefabKey,'new');assert.equal(merged.sourceSkills[0].blackboard[0].valueStr,'summon');
assert.deepEqual(merged.sourceTalentBlackboard,[]);assert.equal(merged.talents,undefined);
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();setSetupSeason('act1autochess');CUR=playableLevels().findIndex(x=>x.kind==='covenant');curDiff='difficult';curMatch='solo';chooseBand('band_amiya');
 // Migration is limited to its reviewed historical target, not whichever
 // enemy catalog happens to be current when this test runs.
 const legacySave=JSON.parse(encodeRestSave()),currentCatalog=catalogFingerprint();
 legacySave.catalog='41cc89e761634b1b';
 assert.throws(()=>decodeRestSave(JSON.stringify(legacySave)),/游戏数据已更新/);
 saveCatalogFingerprint=REST_CATALOG_MIGRATIONS[legacySave.catalog];
 assert.ok(decodeRestSave(JSON.stringify(legacySave)));
 assert.throws(()=>decodeRestSave(JSON.stringify({...legacySave,catalog:'unknown'})),/游戏数据已更新/);
 saveCatalogFingerprint='future-data';assert.throws(()=>decodeRestSave(JSON.stringify(legacySave)),/游戏数据已更新/);saveCatalogFingerprint=currentCatalog;
 const random=gameRandom;const sample=value=>{gameRandom=()=>value;};
 const alternatives=[{bossId:'boss_1'},{bossId:'boss_2'}];
 sample(0);assert.equal(selectSourceRoundIndex(alternatives),0);
 sample(0.74);assert.equal(selectSourceRoundIndex(alternatives),0);
 sample(0.75);assert.equal(selectSourceRoundIndex(alternatives),1);
 sample(0.999);assert.equal(selectSourceRoundIndex(alternatives),1);
 assert.equal(selectSourceRoundIndex([{},{}]),1,'ordinary map choices stay uniform');
 sample(0);prepareSourceRound(14);const saved=G.sourceLevelKey;
 gameRandom=()=>{throw Error('saved boss selection rerolled');};prepareSourceRound(14);assert.equal(G.sourceLevelKey,saved);
 gameRandom=random;
 // A following ordinary boss is not automatically a hidden challenge.
 const hidden=sourceBossInfo('boss_8'),original=hidden.isHidingBoss;hidden.isHidingBoss=false;
 G.round=14;G.phase='battle';G.battleDone=true;G.lastBattleWin=true;G.enemyHp=999;G.life=20;G.activeBonds={};
 nextRound();assert.equal(G.round,15);assert.equal(G.phase,'rest');assert.ok(!G.secretCore);
 hidden.isHidingBoss=original;
 chooseBand('band_amiya');G.round=14;prepareSourceRound(14);G.phase='battle';G.battleDone=true;G.lastBattleWin=true;G.enemyHp=999;G.life=20;G.activeBonds={};
 nextRound();assert.equal(G.phase,'over','explicit hidden round requires the existing entry condition');
 chooseBand('band_amiya');G.round=14;prepareSourceRound(14);G.phase='battle';G.battleDone=true;G.lastBattleWin=true;G.enemyHp=999;G.life=20;G.activeBonds={test:351};
 nextRound();assert.equal(G.round,15);assert.equal(G.phase,'rest');assert.equal(G.secretCore,true);
 // Consecutive perfect results must reach the configured leader without refilling
 // the obsolete enemy HP pool between rounds (the old fixture masked this bug).
 chooseBand('band_amiya');const initialEnemyHp=G.enemyHp;
 for(let round=1;round<=14;round++){
   assert.equal(G.round,round);assert.equal(G.phase,'rest');
   if(round===14)assert.ok(G.sourceBossId,'the regular leader must be reached');
   if(document.getElementById('decision-modal').style.display==='flex'){
     const supply=decisionOptions()[0];assert.ok(supply);
     const life=G.life;previewDecision(supply.id);applyDecision(supply.id);assert.equal(G.life,life);
     assert.equal(document.getElementById('decision-modal').style.display,'none');
   }
   startBattleRound();assert.equal(G.phase,'battle');
   onBattleEnd(true,roundShield(round));assert.equal(G.enemyHp,initialEnemyHp);
   nextRound();
 }
 assert.equal(G.phase,'over');assert.match(document.getElementById('result').textContent,/通关胜利/);
 chooseBand('band_amiya');G.enemyHp=0;startBattleRound();onBattleEnd(true,roundShield(1));nextRound();
 assert.equal(G.round,2);assert.equal(G.phase,'rest','legacy zero HP cannot skip a source run');
 // Synthetic legacy sessions keep their old HP-based finish rule.
 G.modeId=null;G.phase='battle';G.battleDone=false;G.enemyHp=5;G.round=2;
 onBattleEnd(true,10);assert.equal(G.enemyHp,-5);nextRound();assert.equal(G.phase,'over');
 console.log('BOSS SOURCE OK: weighted/stable choices, hidden identity, preserved ability records, all 14 perfect rounds, legacy compatibility');
})()`).catch(error=>{console.error(error);process.exitCode=1;});
console.log('Preserved ability records for',preserved,'level enemy references');
