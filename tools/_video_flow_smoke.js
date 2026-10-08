'use strict';
const assert=require('assert/strict'),fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();CUR=playableLevels().findIndex(x=>x.kind==='covenant');curDiff='difficult';curMatch='team';chooseBand('band_amiya');
 const firstLimit=SOURCE_BATTLES.seasons[G.seasonId].turnInfo[G.modeId][1].normalPhaseTime;
 assert.equal(firstLimit,65);assert.equal(G.prepareLimit,firstLimit);assert.equal(G.prepareRemaining,firstLimit);
 updatePreparationClock(2);assert.equal(G.prepareRemaining,firstLimit-2);assert.equal(G.phase,'rest');
 // Special preparation has its own choice: it must not consume ordinary preparation.
 startRound(3);assert.equal(G.sourceIsSpPrepare,true);assert.equal(document.getElementById('decision-modal').style.display,'flex');
 const specialRemaining=G.prepareRemaining;updatePreparationClock(12);assert.equal(G.prepareRemaining,specialRemaining);assert.equal(G.phase,'rest');
 startBattleRound();assert.equal(G.phase,'rest','manual readiness cannot bypass a pending special decision');
 const decisionId=decisionOptions()[0].id;previewDecision(decisionId);applyDecision(decisionId);assert.equal(document.getElementById('decision-modal').style.display,'none');
 updatePreparationClock(1);assert.equal(G.prepareRemaining,specialRemaining-1);
 // Ordinary preparation expiration starts exactly one live source battle.
 startRound(2);G.prepareRemaining=0.01;updatePreparationClock(0.02);
 assert.equal(G.phase,'battle');assert.equal(B.phase,'battle');assert.equal(B.sourceBattle,true);assert.equal(B.dp,10);assert.equal(B.dpMax,99);
 const expiredBattle=B;updatePreparationClock(1);assert.equal(B,expiredBattle);
 // Use the actual Quintus wave, not an injected mock leader.
 chooseBand('band_amiya');
 const bossRound=runModeData().rounds.find(x=>x.round===14);G.roundChoices[14]=bossRound.alternatives.findIndex(x=>x.bossId==='boss_4');
 assert.ok(G.roundChoices[14]>=0);startRound(14);assert.equal(G.sourceBossId,'boss_4');
 assert.equal(sourceBossInfo(G.sourceBossId).enemyId,'enemy_1521_dslily');updateBossHud();
 assert.match(document.getElementById('boss-health').innerHTML,/盐风主教昆图斯/);
 startBattleRound();assert.equal(B.leaderEnemyId,'enemy_1521_dslily');assert.equal(B.leader,null);
 update(1/30,0);const leader=B.leader;
 assert.ok(leader);assert.equal(leader.enemyId,'enemy_1521_dslily');assert.ok(B.enemies.includes(leader));
 const max=leader.maxHp;assert.equal(leader.hp,max);hitEnemy({},leader,12345);updateBossHud();
 assert.equal(leader.hp,max-12345);assert.ok(document.getElementById('boss-health').innerHTML.includes('value="'+(max-12345)+'"'));
 hitEnemy({},leader,leader.hp+1);updateBossHud();
 assert.ok(document.getElementById('boss-health').innerHTML.includes('value="0"'),'dead leader must not reset to a full bar');
 update(1/30,0);updateBossHud();
 assert.equal(leader.dead,true);assert.ok(!B.enemies.includes(leader));assert.equal(B.leader,leader);
 assert.equal(G.phase,'over');assert.equal(G.lastBattleWin,true);assert.ok(G.settlement,'defeated leader goes directly to settlement');
 // The reward overlay holds the original shop, including its frozen state.
 chooseBand('band_amiya');G.frozen=true;const savedShop=G.shop;showMergeReward();
 assert.ok(G._mergeReward);assert.equal(G._mergeReward.savedShop,savedShop);
 assert.equal(document.getElementById('refresh-btn').disabled,true);assert.equal(document.getElementById('freeze-btn').disabled,true);
 assert.equal(document.getElementById('freeze-label').textContent,'冻结');assert.ok(!document.getElementById('shop').innerHTML.includes('freeze-mark'));
 const rewardShop=G.shop,money=G.money,level=G.level;
 refreshShop();upgradeShop();toggleFreeze();assert.equal(G.shop,rewardShop);assert.equal(G.money,money);assert.equal(G.level,level);assert.equal(G.frozen,true);
 G.prepareRemaining=0;updatePreparationClock(1);assert.equal(G.phase,'rest','auto-start must wait for an unclaimed reward');
 startBattleRound();assert.equal(G.phase,'rest');assert.equal(G._mergeReward.savedShop,savedShop,'manual readiness cannot discard an unclaimed reward');
 const charId=G.shop[0].entry.charId;selectMergeReward(0);
 assert.equal(G._mergeReward,null);assert.equal(G.shop,savedShop);assert.ok(G.ops.some(x=>x.charId===charId));assert.equal(G.frozen,true);
 assert.equal(document.getElementById('refresh-btn').disabled,false);assert.equal(document.getElementById('freeze-btn').disabled,false);
 assert.equal(document.getElementById('freeze-label').textContent,'解冻');
 updatePreparationClock(1);assert.equal(G.phase,'battle','after claiming a reward, expired preparation can start');
 console.log('VIDEO FLOW OK source preparation, decision pause, auto-start, actual leader HP and reward locks/restoration');
})()`).catch(error=>{console.error(error);process.exitCode=1;});
