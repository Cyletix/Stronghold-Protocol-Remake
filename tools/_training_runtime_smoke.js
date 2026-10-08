'use strict';
const assert=require('node:assert/strict');const f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){await f.run(`(async()=>{
 await initMode();function begin(season='act1autochess',difficulty='training',band='band_amiya'){
  setSetupSeason(season);CUR=playableLevels().findIndex(x=>x.kind===(season==='act2autochess'?'covenant2':'covenant'));setupStageKey=null;curMatch='solo';curDiff=difficulty;chooseBand(band);
 }
 begin();assert.equal(G.life,45);G.life=41;startRound(2);assert.equal(G.life,41,'round funding does not reset player HP');
 assert.equal(saveRestRun(),true);G.life=1;assert.equal(loadRestRun(),true);assert.equal(G.life,41,'rest restores current life, not initial life');
 for(const [season,diff]of [['act2autochess','training'],['act1autochess','standard'],['act2autochess','standard']]){
  begin(season,diff);const band=SOURCE_BATTLES.seasons[season].bands.find(b=>b.bandId===G.band);assert.equal(G.life,setupBandDetail(band).血量??LIFE0);
 }
 begin();startRound(4);const source=battleSourceForRun();assert.equal(source.leaderEnemyId,'enemy_9033_acdeer');assert.equal(source.enemies[source.leaderEnemyId].maxHp,30000,'separate existing level source already supplies training boss HP');
 assert.equal(trainingConfig().trainingRoundInfos[4].bossBattleData.bossHp,30000);assert.deepEqual(Array.from(trainingConfig().helpBattleNpcPlayers),[2,3]);
 console.log('TRAINING runtime local OK: source initial HP once, remaining life across rounds/rest, season/mode isolation and existing fourth-round boss HP');
 })()`);
 const {createPlayerRuntime}=require('./lib/room-game-runtime');const p=await createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_training_1',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:13457});
 try{const saved=p.snapshot();assert.equal(saved.session.life,45);assert.equal(p.command('game/buy',{index:0}).ok,true);const after=p.snapshot();p.restore(JSON.parse(JSON.stringify(saved)));assert.equal(p.command('game/buy',{index:0}).ok,true);assert.deepEqual(p.snapshot().session,after.session);assert.deepEqual(p.snapshot().rng,after.rng);console.log('TRAINING runtime room OK: signed training checkpoint and deterministic continuation');}finally{p.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
