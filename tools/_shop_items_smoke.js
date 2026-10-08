'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const activity=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,activity});
async function main(){
 await f.run(`(async()=>{
  await initMode();let cases=0;
  for(const [sid,season]of Object.entries(SOURCE_BATTLES.seasons))for(const mid of Object.keys(season.modes)){
   setSetupSeason(sid);CUR=playableLevels().findIndex(x=>x.kind===(sid==='act2autochess'?'covenant2':'covenant'));
   curDiff=mid==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(k=>mid.endsWith('_'+DIFF_GAMEDATA[k].toLowerCase()));
   curMatch=mid.includes('_multi_')?'team':'solo';setupStageKey=null;chooseBand('band_amiya');
   for(let level=1;level<=MAX_LEVEL;level++){
    G.level=level;const actual=shopEquipmentPool(),source=activity[sid];
    const expected=Object.values(source.trapShopChessDatas).filter(row=>!row.hideInShop&&row.itemLevel<=level&&row.itemType==='EQUIP'
      &&EQUIPS.some(e=>e.effectId===source.trapChessDataDict[row.itemId].effectId));
    assert.deepEqual(Array.from(actual,e=>e.chessId).sort(),Array.from(expected,e=>e.itemId).sort(),sid+'/'+mid+'/'+level);
    for(const eq of actual)assert.equal(eq.cost,source.trapChessDataDict[eq.chessId].purchasePrice);
    genShop();assert.equal(G.shop.length,shopSlots());
    for(const card of G.shop.filter(c=>c.type==='equip')){
     assert.ok(actual.some(e=>e.chessId===card.equip.chessId));assert.equal(card.cost,source.trapChessDataDict[card.equip.chessId].purchasePrice);
    }cases++;
   }
  }
  // Same effect has different market IDs, unlock levels and prices across seasons.
  G.seasonId='act1autochess';G.level=1;const first=shopEquipmentPool().find(e=>e.id==='egir_blade');
  assert.equal(first.chessId,'chess_item_1_02_e_a');assert.equal(first.cost,1);
  G.seasonId='act2autochess';G.level=2;assert.ok(!shopEquipmentPool().some(e=>e.id==='egir_blade'));
  G.level=3;const second=shopEquipmentPool().find(e=>e.id==='egir_blade');assert.equal(second.chessId,'chess_item_3_07_e_a');assert.equal(second.cost,2);
  assert.equal(shopEquipmentPool(6).find(e=>e.id==='abyssal').cost,4,'source price replaces the legacy three-coin price');
  // Existing cards retain their quoted price; only future draws use changed source rows.
  const row=SHOP_ITEMS.seasons[G.seasonId].find(e=>e.effectId==='eff_acarm046');
  const oldPrice=row.purchasePrice;row.purchasePrice=0;assert.equal(shopEquipmentPool().find(e=>e.id==='egir_blade').cost,0);row.purchasePrice=oldPrice;
  row.hideInShop=true;assert.ok(!shopEquipmentPool().some(e=>e.id==='egir_blade'));row.hideInShop=false;
  // A source-empty item slot stays empty: it never draws a hidden/foreign item or extra operator.
  const rows=SHOP_ITEMS.seasons[G.seasonId];SHOP_ITEMS.seasons[G.seasonId]=[];G.level=6;genShop();
  assert.equal(G.shop.filter(c=>c.type==='equip').length,0);assert.equal(G.shop.length,shopLevelInfo().charChessCount);
  const previousBand=G.band,guarantee=runBandEffects().find(b=>b.mechs.some(m=>m.key==='band_first_self_refresh_present_char'||m.key==='up_shop_next_refresh_must_present_bond_char'));
  assert.ok(guarantee);G.band=guarantee.bandId;const requiredBond=bandRefreshBond();genShop();
  assert.ok(bandBondsOf(G.shop[0].entry).includes(requiredBond),'empty equipment pool still guarantees the first operator slot');
  assert.equal(G.shop.length,shopLevelInfo().charChessCount,'successful guarantee does not add a duplicate fallback operator');
  const kept=G.shop.slice();G.shop=kept.slice(1);const retained=G.shop.slice();let grantCalls=0;
  const grant=grantBandOperator;grantBandOperator=(...args)=>{grantCalls++;return grant(...args);};
  try{genShop({keepCards:true});assert.equal(grantCalls,0,'frozen operator cards do not trigger another guaranteed grant');}
  finally{grantBandOperator=grant;}
  retained.forEach((card,i)=>assert.equal(G.shop[G.shop.length-retained.length+i],card));G.band=previousBand;
  SHOP_ITEMS.seasons[G.seasonId]=rows;
  // Real upgrade enters the newly eligible pool. Confirmation alone does not redraw.
  setSetupSeason('act2autochess');CUR=playableLevels().findIndex(x=>x.kind==='covenant2');setupStageKey=null;
  curDiff='standard';curMatch='solo';chooseBand('band_amiya');G.level=2;G.money=100;G.upgradeCost=1;
  const oldShop=G.shop;upgradeShop();assert.equal(G.shop,oldShop);upgradeShop();assert.equal(G.level,3);
  assert.ok(shopEquipmentPool().some(e=>e.id==='egir_blade'));
  // Buy a source-priced card, then preserve source identity and RNG through a real rest save.
  const eq=shopEquipmentPool().find(e=>e.id==='egir_blade');G.shop=[{type:'equip',equip:{...eq,kind:'stat'},cost:eq.cost}];
  const money=G.money;buyShop(0);assert.equal(G.money,money-2);
  const owned=G.equipInv.at(-1);assert.equal(owned.effectId,'eff_acarm046');assert.equal(owned.chessId,eq.chessId);
  G.level=6;genShop();G.frozen=true;document.getElementById('decision-modal').style.display='none';
  decodeRestSave(encodeRestSave());assert.equal(saveRestRun(),true);const saved=JSON.stringify({shop:G.shop,equipInv:G.equipInv,rng:ArkSim.snapshot()});
  refreshShop();assert.equal(loadRestRun(),true);assert.deepEqual(JSON.parse(JSON.stringify({shop:G.shop,equipInv:G.equipInv,rng:ArkSim.snapshot()})),JSON.parse(saved));
  console.log('SHOP ITEMS local OK: '+cases+' mode/level pools; season IDs/prices, hidden/empty pools, upgrades, purchase and save/RNG');
 })()`);
 // Signed authoritative room state must preserve cards and future draw RNG too.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const testModule=new Module(filename,module);testModule.filename=filename;testModule.paths=Module._nodeModulePaths(path.dirname(filename));
 testModule._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const player=await testModule.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:45771});
 try{
  player.__testMachine.run('G.level=6;G.money=100;genShop();');const saved=player.snapshot();
  assert.ok(saved.session.shop.some(c=>c.type==='equip'&&c.equip.chessId));
  assert.equal(player.command('game/refresh',{}).ok,true);const expected=player.snapshot();player.restore(saved);
  assert.equal(player.command('game/refresh',{}).ok,true);const actual=player.snapshot();
  assert.deepEqual(actual.session.shop,expected.session.shop);assert.deepEqual(actual.rng,expected.rng);
  console.log('SHOP ITEMS room OK: source cards and signed checkpoint draw replay');
 }finally{player.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
