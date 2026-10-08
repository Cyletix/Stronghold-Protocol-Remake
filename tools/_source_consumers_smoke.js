'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();setSetupSeason('act1autochess');chooseBand('band_amiya');ArkSim.seed(888);const initial=ArkSim.snapshot().state,source=battleSourceForRun(),original=JSON.stringify(currentSourceBattle());
 const declared=source.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions.filter(a=>a.actionType==='SPAWN').flatMap(a=>Array.from({length:a.count},()=>a.key))));
 assert.deepEqual(previewCurrentWave().map(x=>x.enemyId),declared);togglePreview();togglePreview();toggleIntel();assert.equal(ArkSim.snapshot().state,initial);
 G.bountyRounds=2;G.enemyNerf=0.9;assert.equal(previewCurrentWave().length,declared.length+2);const battle=battleSourceForRun();
 assert.equal(JSON.stringify(currentSourceBattle()),original);assert.equal(ArkSim.snapshot().state,initial);
 startBattle([],[],1000,battle);window.onBattleEnd=()=>{};window.onLeak=()=>{};update(3,3);const e=B.enemies[0];assert.ok(e);assert.equal(e.atk,Math.round(source.enemies[e.enemyId].atk*0.9));assert.equal(e.maxHp,Math.round(source.enemies[e.enemyId].maxHp*0.9));
 spawnEnemyAt(e.enemyId,e);const child=B.enemies.at(-1);assert.equal(child.sourceWave,e.sourceWave);assert.equal(child.moveSpeed,e.moveSpeed);assert.equal(child.maxHp,e.maxHp);
 GMODE='normal';G.sourceLevelKey=null;G.bountyRounds=0;const before=ArkSim.snapshot().state;previewCurrentWave();assert.equal(ArkSim.snapshot().state,before);
 curDiff='standard';refreshSourceSetupInfo();assert.match(document.getElementById('boss-name').textContent,/9/);assert.ok(!document.getElementById('match-note').textContent.includes('×'));
 curDiff='ultimate';refreshSourceSetupInfo();assert.equal(document.getElementById('setup-ready-btn').disabled,true);
 console.log('SOURCE CONSUMERS OK native preview/counts, no RNG consumption, bounty/nerf/summon propagation, truthful mode summary');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
