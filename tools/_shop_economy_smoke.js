'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();let modes=0;
 for(const [sid,season]of Object.entries(SOURCE_BATTLES.seasons))for(const mid of Object.keys(season.modes)){
  setSetupSeason(sid);CUR=playableLevels().findIndex(x=>x.kind===(sid==='act2autochess'?'covenant2':'covenant'));
  curDiff=mid==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(k=>mid.endsWith('_'+DIFF_GAMEDATA[k].toLowerCase()));
  curMatch=mid.includes('_multi_')?'team':'solo';setupStageKey=null;chooseBand('band_amiya');
  assert.equal(G.seasonId,sid);assert.equal(G.modeId,mid);
  const levels=season.shopLevels[mid];
  assert.equal(G.upgradeCost,levels[1].initialUpgradePrice,'first round retains configured initial price');
  G.money=1000;const before=G.money;upgradeShop();assert.equal(G.money,before,'confirmation does not charge');
  upgradeShop();assert.equal(G.level,2);assert.equal(G.money,before-levels[1].initialUpgradePrice);
  assert.equal(G.upgradeCost,levels[2].initialUpgradePrice,sid+'/'+mid+' level2');
  startRound(2);assert.equal(G.upgradeCost,Math.max(0,levels[2].initialUpgradePrice-1));G.money=1000;
  for(let level=3;level<=MAX_LEVEL;level++){
   const paid=G.upgradeCost,money=G.money;upgradeShop();upgradeShop();
   assert.equal(G.level,level);assert.equal(G.money,money-paid);assert.equal(G.upgradeCost,levels[level].initialUpgradePrice);
   assert.equal(G.shop.length,levels[level].charChessCount+levels[level].itemCount);
  }
  const money=G.money;upgradeShop();assert.equal(G.money,money,'max level cannot spend');modes++;
 }
 // Explicit zero is a configured free upgrade, not a signal to use legacy defaults.
 const data=SOURCE_BATTLES.seasons[G.seasonId].shopLevels[G.modeId],old=data[2].initialUpgradePrice;
 data[2].initialUpgradePrice=0;G.level=1;G.upgradeCost=0;G.money=0;G._upgradeConfirm=false;
 upgradeShop();upgradeShop();assert.equal(G.level,2);assert.equal(G.upgradeCost,0);assert.equal(G.money,0);data[2].initialUpgradePrice=old;
 G.money=0;G.upgradeCost=10;G._upgradeConfirm=false;upgradeShop();assert.equal(G._upgradeConfirm,false);assert.equal(G.level,2);
 console.log('SHOP ECONOMY OK '+modes+' source modes, all levels, charges/discounts, zero and insufficient funds');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
