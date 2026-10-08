'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const activity=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,activity});
// Exercise the owned source module without rewriting the shared generated bundle.
// DECISION_ROUNDS is the unchanged legacy binding already loaded by the fixture.
const source=fs.readFileSync(path.join(__dirname,'../web/mode/decision.js'),'utf8');
f.run(source.replace(/const DECISION_ROUNDS = \{[\s\S]*?\r?\n\};\r?\n/,''));
f.run(`(async()=>{
 await initMode();
 for(const sid of ['act1autochess','act2autochess']){
  setSetupSeason(sid);chooseBand('band_amiya');
  for(const [modeId,rounds]of Object.entries(activity.activity.AUTOCHESS_SEASON[sid].battleDataDict)){
   G.modeId=modeId;
   for(const [round,choices]of Object.entries(rounds)){
    G.round=Number(round);prepareSourceRound(G.round);
    const expected=choices[G.roundChoices[G.round]].isSpPrepare;
    assert.equal(decisionRound(G.round),expected,sid+' '+modeId+' round '+round);
   }
   G.roundChoices={};
  }
 }
 setSetupSeason('act1autochess');curDiff='difficult';curMatch='team';chooseBand('band_amiya');
 startRound(2);assert.notEqual(document.getElementById('decision-modal').style.display,'flex','round 2 remains normal preparation');
 startRound(3);assert.equal(document.getElementById('decision-modal').style.display,'flex','decision opens after completing round 2');
 startRound(4);assert.notEqual(document.getElementById('decision-modal').style.display,'flex','next normal round clears stale decision');
 const modeId=G.modeId;delete G.modeId;
 assert.equal(decisionRound(2),true,'legacy non-source round table remains compatible');
 assert.equal(decisionRound(1),false);G.modeId=modeId;

 G.money=100;G.frozen=true;G.level=1;G._upgradeConfirm=true;shopPreview=0;
 const originalShop=G.shop;showMergeReward();
 assert.ok(G._mergeReward);assert.equal(G._upgradeConfirm,false);assert.equal(shopPreview,-1);
 const rewardShop=G.shop,unchanged=JSON.stringify({money:G.money,level:G.level,frozen:G.frozen,shop:G.shop,reward:G._mergeReward});
 for(const action of [refreshShop,toggleFreeze,upgradeShop]){
  action();assert.equal(JSON.stringify({money:G.money,level:G.level,frozen:G.frozen,shop:G.shop,reward:G._mergeReward}),unchanged,'reward blocks '+action.name);
  assert.strictEqual(G.shop,rewardShop);
 }
 const beforePreview=JSON.stringify(G);
 confirmMergeReward(0);assert.equal(JSON.stringify(G),beforePreview,'unselected reward cannot be confirmed');
 onShopCardClick(0);onShopCardClick(0);
 assert.equal(shopPreview,0);assert.equal(JSON.stringify(G),beforePreview,'card clicks only preview, even when repeated');
 assert.ok(document.getElementById('shop').innerHTML.includes('confirmMergeReward(0)'));
 assert.match(document.getElementById('hand-detail').innerHTML,/确认选择/);
 assert.doesNotMatch(document.getElementById('hand-detail').innerHTML,/确认购买/);
 onShopCardClick(1);assert.equal(shopPreview,1,'another card changes the pending choice');
 confirmMergeReward(0);assert.equal(JSON.stringify(G),beforePreview,'stale card confirmation cannot claim a different selection');
 cancelShopPreview();confirmMergeReward(1);assert.equal(JSON.stringify(G),beforePreview,'cancelled preview cannot grant a reward');
 const grantedId=G.shop[1].entry.charId;onShopCardClick(1);confirmMergeReward(1);
 assert.equal(G._mergeReward,null);assert.strictEqual(G.shop,originalShop);
 assert.ok(G.ops.some(o=>o.charId===grantedId));assert.equal(G.money,100,'reward is free');
 assert.equal(shopPreview,-1);assert.equal(document.getElementById('hand-detail').style.display,'none');
 const afterGrant=JSON.stringify(G);confirmMergeReward(1);assert.equal(JSON.stringify(G),afterGrant,'repeated confirmation cannot grant twice');
 toggleFreeze();assert.equal(G.frozen,false,'freeze control works after reward');
 const money=G.money;refreshShop();assert.equal(G.money,money-shopRefreshPrice(),'refresh works after reward');
 const level=G.level;upgradeShop();assert.equal(G._upgradeConfirm,true);upgradeShop();assert.equal(G.level,level+1,'upgrade works after reward');

 // A reward completing another triplet must keep its next reward and original shop.
 G.level=1;G.ops=[];const baseShop=G.shop;showMergeReward();
 const chainEntry=G.shop[0].entry;
 addOperator(chainEntry.charId,false);addOperator(chainEntry.charId,false);onShopCardClick(0);confirmMergeReward(0);
 assert.ok(G._mergeReward,'chained promotion keeps its pending reward');
 assert.strictEqual(G._mergeReward.savedShop,baseShop,'chained reward retains the original shop');
 const nextReward=G.shop;refreshShop();assert.strictEqual(G.shop,nextReward);
 assert.equal(shopPreview,-1,'a chained promotion starts with no selection');
 confirmMergeReward(0);assert.strictEqual(G.shop,nextReward,'previous confirmation cannot claim the next reward');
 onShopCardClick(0);confirmMergeReward(0);assert.equal(G._mergeReward,null);assert.strictEqual(G.shop,baseShop);
 console.log('DECISION / REWARD OK source special rounds, legacy fallback, protected promotion choices, restored actions and chained rewards');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
