'use strict';
const assert=require('assert/strict'),a=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,activity:a});
f.run(`(async()=>{
 await initMode();
 for(const sid of ['act1autochess','act2autochess']){
  setSetupSeason(sid);chooseBand('band_amiya');
  for(let tier=1;tier<=6;tier++)for(const golden of [false,true]){
   const source=activity.activity.AUTOCHESS_SEASON[sid].shopCharChessInfoData[tier].find(p=>p.isGolden===golden);
   assert.equal(operatorPurchasePrice({tier}),source.purchasePrice);
   assert.equal(operatorSoldPrice({entry:{tier},elite:golden}),source.chessSoldPrice);
  }
  assert.equal(shopRefreshPrice(),activity.activity.AUTOCHESS_SEASON[sid].constData.shopRefreshPrice);
 }
 const e=ROSTER_LIST.find(e=>e.tier===1);G.shop=[];grantSpecificOperator(e.charId,true);assert.equal(G.shop[0].cost,2,'strategy-inserted tier-one card no longer costs fixed three');
 const p=SOURCE_BATTLES.seasons[G.seasonId].shopPrices[1].find(p=>!p.isGolden),old=p.purchasePrice;p.purchasePrice=7;
 G.shop=[];grantSpecificOperator(e.charId,true);assert.equal(G.shop[0].cost,7,'consumer reads source rather than mirrored constant');p.purchasePrice=old;
 console.log('SHOP RULES OK two-season purchase/sale/refresh and strategy insertion prices');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
