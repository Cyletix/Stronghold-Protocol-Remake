'use strict';
const assert=require('node:assert/strict'),fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();CUR=playableLevels().findIndex(x=>x.kind==='covenant');curDiff='difficult';curMatch='solo';chooseBand('band_amiya');startRound(14);
 // A catalog-compatible checkpoint can predate the optional result counters.
 // Enemy data has changed since the historical 41cc... catalog: that payload
 // must no longer bypass the current data compatibility guard.
 const envelope=JSON.parse(encodeRestSave()),payload=JSON.parse(envelope.body);
 delete payload.session.roundResults;delete payload.session.runElapsed;
 envelope.body=JSON.stringify(payload);envelope.checksum=saveHash(envelope.body);
 assert.throws(()=>decodeRestSave(JSON.stringify({...envelope,catalog:'41cc89e761634b1b'})),/游戏数据已更新/);
 localStorage.setItem(RUN_SAVE_KEY,JSON.stringify(envelope));assert.equal(loadRestRun(),true);
 startBattleRound();G.life=0;onBattleEnd(false,0);nextRound();
 assert.equal(G.settlement.passed,13,'an old round-14 checkpoint has already passed the previous 13 ordinary rounds');
 chooseBand('band_amiya');G.life=1;startBattleRound();
 const route=BDATA.level.routes[0].segs[0][0],base=BDATA.enemies[Object.keys(BDATA.enemies)[0]];
 B.waveScheduler=null;B.spawn=[];B.roundLimit=0.001;
 B.enemies=Array.from({length:3},(_,i)=>({...base,enemyId:'timeout_'+i,route:0,seg:0,cp:0,x:route.c,y:route.r,hp:100,maxHp:100,atk:0,moveSpeed:0,cd:100,wait:0,dead:false}));
 update(1/30,1/30);
 assert.equal(B.stats.leaks,3);assert.equal(G.roundResults.length,1);
 assert.equal(G.roundResults[0].leaks,B.stats.leaks,'the result must capture the final timeout batch, even when its first leak exhausts life');
 console.log('SETTLEMENT REVIEW OK old checkpoint progress and complete timeout-batch counters');
})()`).catch(error=>{console.error(error);process.exitCode=1;});
