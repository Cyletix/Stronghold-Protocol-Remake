'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run(`(async()=>{
  await initMode();ArkSim.seed(90213);chooseBand('band_amiya');G.money=200;
  // Purchase through the real command, then freeze and cross a round boundary.
  buyShop(G.shop.findIndex(s=>s.type==='op'));toggleFreeze();
  const retained=G.shop.slice(),savedCards=JSON.stringify(retained);
  startRound(2);
  assert.equal(G.shop.length,shopSlots(),'frozen shop fills purchased vacancies next round');
  assert.equal(JSON.stringify(G.shop.slice(-retained.length)),savedCards);
  retained.forEach((card,i)=>assert.equal(G.shop[G.shop.length-retained.length+i],card,'retains card identity and right-aligned position'));
  assert.equal(G.frozen,false,'freeze protects one round, then automatically clears');
  assert.equal(G.money,roundMoney(2),'refill has no refresh charge');

  let modes=0,cases=0;
  for(const [sid,season]of Object.entries(SOURCE_BATTLES.seasons))for(const mid of Object.keys(season.modes)){
   setSetupSeason(sid);CUR=playableLevels().findIndex(x=>x.kind===(sid==='act2autochess'?'covenant2':'covenant'));
   curDiff=mid==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(k=>mid.endsWith('_'+DIFF_GAMEDATA[k].toLowerCase()));
   curMatch=mid.includes('_multi_')?'team':'solo';setupStageKey=null;chooseBand('band_amiya');
   for(let level=1;level<=MAX_LEVEL;level++){
    G.level=level;const info=shopLevelInfo();
    // Empty shop; missing equipment; missing operator; mixed vacancies.
    for(const missing of ['all','equip','op','mixed']){
     genShop();G.shop=G.shop.filter((card,i)=>missing==='all'?false:missing==='mixed'?i%2===0:card.type!==missing);
     const kept=G.shop.slice();kept.forEach((card,i)=>{card.cost=i+0.25;});
     const before=JSON.stringify(kept);
     G.money=37;G._garrisonFreeRefresh=3;G._garrisonRoundSpent=5;G._garrisonRoundRefresh=2;
     genShop({keepCards:true});
     assert.equal(G.shop.length,info.charChessCount+info.itemCount,sid+'/'+mid+'/'+level+'/'+missing);
     assert.equal(G.shop.filter(c=>c.type==='equip').length,info.itemCount,'equipment quota');
     assert.equal(G.shop.filter(c=>c.type==='op').length,info.charChessCount,'operator quota');
     assert.equal(JSON.stringify(G.shop.slice(G.shop.length-kept.length)),before,'prices and full card contents preserved');
     kept.forEach((card,i)=>assert.equal(G.shop[G.shop.length-kept.length+i],card));
     for(const card of G.shop.slice(0,G.shop.length-kept.length))if(card.type==='op'){
      assert.ok(card.entry.tier<=level);assert.ok(!G.bannedOperators?.includes(card.entry.charId));
      assert.ok(!['char_616_pithst','char_606_csuppo'].includes(card.entry.charId));
     }
     assert.deepEqual([G.money,G._garrisonFreeRefresh,G._garrisonRoundSpent,G._garrisonRoundRefresh],[37,3,5,2]);cases++;
    }
    // Full and strategy-overflow shops never discard cards or consume draw RNG.
    for(const extra of [false,true]){
     if(extra)G.shop.push({...G.shop[G.shop.length-1],cost:0});
     const shop=G.shop,rng=ArkSim.snapshot();genShop({keepCards:true});
     assert.equal(G.shop,shop);assert.deepEqual(ArkSim.snapshot(),rng);
    }
   }modes++;
  }
  // Pending merge rewards must restore the original shop before frozen refill.
  chooseBand('band_amiya');G.shop.splice(0,1);const original=G.shop.slice();
  G._mergeReward={savedShop:G.shop};G.shop=[];G.frozen=true;startRound(2);
  assert.equal(G._mergeReward,null);assert.equal(G.shop.length,shopSlots());
  assert.deepEqual(G.shop.slice(-original.length),original);

  // Partial frozen shops survive real rest save/load and draw the same refill.
  chooseBand('band_amiya');G.shop.splice(0,1);G.frozen=true;
  document.getElementById('decision-modal').style.display='none';
  assert.equal(saveRestRun(),true);startRound(2);
  const expected=JSON.stringify({shop:G.shop,rng:ArkSim.snapshot()});
  assert.equal(loadRestRun(),true);assert.equal(G.frozen,true);startRound(2);
  assert.deepEqual(JSON.parse(JSON.stringify({shop:G.shop,rng:ArkSim.snapshot()})),JSON.parse(expected));

  // Manual refresh still replaces the shop and consumes its voucher normally.
  G.phase='rest';G.frozen=true;G._garrisonFreeRefresh=1;const old=G.shop.slice();refreshShop();
  assert.equal(G.frozen,false);assert.equal(G._garrisonFreeRefresh,0);
  assert.ok(G.shop.every(card=>!old.includes(card)));
  console.log('FROZEN SHOP local OK: '+modes+' modes / '+cases+' refill cases, full/extra cards, reward restoration, save/RNG and manual refresh');
 })()`);

 // Use the authoritative room VM and signed checkpoint without exposing a debug API in production.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);
 const testModule=new Module(filename,module);testModule.filename=filename;testModule.paths=Module._nodeModulePaths(path.dirname(filename));
 testModule._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'};
 const players=[];
 try{
  for(const seed of [221,222])players.push(await testModule.exports.createPlayerRuntime(config,{seed,name:'冻结回归'}));
  const [p,other]=players,untouched=other.snapshot();
  assert.equal(p.command('game/buy',{index:0}).ok,true);
  assert.equal(p.command('game/freeze',{}).ok,true);
  const frozen=p.snapshot(),retained=frozen.session.shop;
  p.__testMachine.run('startRound(2)');const advanced=p.snapshot();
  assert.equal(advanced.session.shop.length,3);assert.equal(advanced.session.frozen,false);
  assert.deepEqual(advanced.session.shop.slice(-retained.length),retained);
  assert.deepEqual(other.snapshot(),untouched,'teammate shop and RNG stay independent');
  p.restore(frozen);p.__testMachine.run('startRound(2)');const replay=p.snapshot();
  assert.deepEqual(replay.session,advanced.session);assert.deepEqual(replay.rng,advanced.rng);
  console.log('FROZEN SHOP room OK: authoritative purchase/freeze, retained cards, player isolation and signed checkpoint replay');
 }finally{players.forEach(p=>p.dispose());}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
