'use strict';
const assert=require('assert/strict'),fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();setSetupSeason('act1autochess');CUR=playableLevels().findIndex(x=>x.kind==='covenant');curDiff='standard';curMatch='solo';chooseBand('band_amiya');
 assert.equal(G.seasonId,'act1autochess');assert.equal(G.modeId,'mode_single_funny');assert.equal(runModeData().rounds.length,9);
 assert.equal(G.shop.length,shopSlots());assert.equal(shopLevelInfo().itemCount,SOURCE_BATTLES.seasons[G.seasonId].shopLevels[G.modeId][1].itemCount);
 assert.equal(BDATA.level.sourceRoutes,true);assert.ok(BDATA.level.grid.flat().some(x=>x==='tile_achand'));
 const key=G.sourceLevelKey;prepareSourceRound(1);assert.equal(G.sourceLevelKey,key);
 const oldG=G;curDiff='ultimate';chooseBand('band_amiya');assert.equal(G,oldG);curDiff='standard';
 // One complete configured run: live source waves, no synthetic enemy formula; loss must not become a final win.
 genWaves=()=>{throw new Error('native mode called synthetic waves');};
 for(let round=1;round<=9;round++){
   assert.equal(G.round,round);const entry=ROSTER_LIST.find(x=>x.position==='MELEE')||ROSTER_LIST[0];
   G.ops=[{id:1,charId:entry.charId,entry,row:null,col:null,dir:'up',equip:[]}];
   const zone=window.modeBattleZoneRows(BDATA.level);outer:for(let r=zone.lb;r<zone.rb;r++)for(let c=0;c<BDATA.level.cols;c++)if(isDeployable(r,c)){G.ops[0].row=r;G.ops[0].col=c;break outer;}
   startBattleRound();assert.equal(B.sourceBattle,true);assert.equal(G.phase,'battle');const before=G.round;nextRound();assert.equal(G.round,before,'cannot skip live battle');
   onBattleEnd(round<9,0);G.enemyHp=999;G.life=100;nextRound();
 }
 assert.equal(G.phase,'over');assert.match(document.getElementById('result').textContent,/战败/);
 setSetupSeason('act2autochess');CUR=playableLevels().findIndex(x=>x.kind==='covenant2');curDiff='training';chooseBand('band_amiya');assert.equal(G.seasonId,'act2autochess');assert.equal(runModeData().rounds.length,4);
 console.log('SOURCE MODE OK 9-round run, source shop/terrain, stable choices, unsupported mode guard, final loss and training');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
