'use strict';
const assert=require('node:assert/strict');
const activity=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,activity});
async function main(){await f.run(`(async()=>{
 await initMode();
 function begin(season='act1autochess',difficulty='training'){
  setSetupSeason(season);CUR=playableLevels().findIndex(x=>x.kind===(season==='act2autochess'?'covenant2':'covenant'));
  setupStageKey=null;curMatch='solo';curDiff=difficulty;chooseBand('band_amiya');
 }
 begin();
 assert.equal(G.modeId,'mode_training_1');assert.equal(G.money,3);
 assert.ok(G.shop.every(c=>c.type==='op'&&c.entry.chessId==='chess_char_1_12_a'));
 const cfg=trainingConfig();assert.deepEqual(Object.keys(TRAINING_CONFIG.seasons),['act1autochess']);
 assert.equal(TRAINING_CONFIG.source.pathId,'2437431838466217812');
 assert.equal(TRAINING_CONFIG.source.decodedSha256,'0251d2495954e0829b59988a5351b7064e3de96ea2c9e8182898d18ae9cc934b');
 // Real round entry sets the source balance, independent of the unspent previous balance.
 for(const [round,coin]of [[2,8],[3,6],[4,7]]){G.money=97;startRound(round);assert.equal(G.money,coin);}
 G.round=1;document.getElementById('decision-modal').style.display='none';
 const table=activity.act1autochess;
 for(const [level,rows]of Object.entries(cfg.trainingShopInfos)){
  G.level=Number(level);genShop();assert.equal(G.shop.length,table.shopLevelDataDict.mode_training_1[level].charChessCount);
  assert.ok(G.shop.every(c=>c.type==='op'&&rows.some(r=>r.chessId===c.entry.chessId)));
  for(const row of rows)assert.equal(cfg.operatorBindings[row.chessId].charId,table.charShopChessDatas[row.chessId].charId);
 }
 // Native <= boundary is intentional: counts [10,10,...] produce 11 first/9 last integer tickets.
 const rows=cfg.trainingShopInfos[3],total=rows.reduce((n,r)=>n+r.count,0),draws=Object.fromEntries(rows.map(r=>[r.chessId,0]));
 for(let ticket=0;ticket<total;ticket++)draws[trainingShopPick(rows,()=>ticket/total).chessId]++;
 assert.equal(draws[rows[0].chessId],11);assert.equal(draws[rows.at(-1).chessId],9);
 assert.equal(trainingShopPick(rows,()=>10/total).chessId,rows[0].chessId);
 assert.equal(trainingShopPick(rows,()=>11/total).chessId,rows[1].chessId);
 let emptyDraws=0;assert.equal(trainingShopPick([],()=>{emptyDraws++;return 0;}),null);assert.equal(emptyDraws,0);
 // The fixed first and second level pools change on a real confirmed upgrade.
 begin();G.money=100;const oldShop=G.shop;upgradeShop();assert.equal(G.shop,oldShop);upgradeShop();
 assert.equal(G.level,2);assert.ok(G.shop.every(c=>c.entry.chessId==='chess_char_2_09_a'));
 // Freeze retains exact card objects and quoted prices; full stores consume no draw RNG.
 G.level=3;genShop();const retained=G.shop.slice(1);retained[0].cost=77;G.shop=retained;
 let randomCalls=0;const rng=gameRandom;gameRandom=()=>{randomCalls++;return .5;};
 try{genShop({keepCards:true});assert.equal(randomCalls,1);assert.equal(G.shop[1],retained[0]);assert.equal(G.shop[1].cost,77);
  genShop({keepCards:true});assert.equal(randomCalls,1);
 }finally{gameRandom=rng;}
 // Missing runtime binding fails explicitly, without silently reclassifying a source ID.
 const savedBinding=cfg.operatorBindings[rows[0].chessId];cfg.operatorBindings[rows[0].chessId]={charId:'missing'};
 try{assert.throws(()=>genShop(),/训练商品来源不匹配/);}finally{cfg.operatorBindings[rows[0].chessId]=savedBinding;}
 G.level=1;G.bannedOperators=[cfg.operatorBindings[cfg.trainingShopInfos[1][0].chessId].charId];genShop();assert.equal(G.shop.length,0);G.bannedOperators=[];
 // Uncovered season, levels and rounds keep their previous behavior, with no act1 fallback.
 begin('act2autochess');assert.equal(trainingConfig(),null);assert.equal(roundMoney(1),4);
 begin('act1autochess','standard');assert.equal(trainingConfig(),null);assert.equal(roundMoney(1),4);
 begin();assert.equal(roundMoney(5),8);G.level=5;genShop();assert.equal(G.shop.length,shopSlots());
 // Save is the real supported rest path; future draws must replay after restore.
 G.level=3;G.money=100;genShop();assert.equal(saveRestRun(),true);const saved=JSON.parse(JSON.stringify(G.shop));
 refreshShop();const expected=JSON.parse(JSON.stringify({shop:G.shop,rng:ArkSim.snapshot()}));assert.equal(loadRestRun(),true);assert.deepEqual(JSON.parse(JSON.stringify(G.shop)),saved);
 refreshShop();assert.deepEqual(JSON.parse(JSON.stringify({shop:G.shop,rng:ArkSim.snapshot()})),expected);
 // Keep all six source decision slots, including unresolved repeated IDs. They are not random options.
 const special=cfg.trainingRoundInfos[3].spPrepareStateData.data;
 assert.equal(special.choiceId,'equip_free_1_tr');assert.equal(special.options.length,6);
 assert.deepEqual(Array.from(special.options,x=>x.slotId),[0,1,2,3,4,5]);
 assert.equal(special.options.filter(x=>x.id==='chess_item_3_11_e_a').length,2);
 console.log('TRAINING ECONOMY OK: source balance replacement, 4 exact pools, integer boundaries, upgrade, freeze, missing/empty pools, mode isolation and rest replay');
})()`);}
if(process.argv.includes('--source-only')){
 const path=require('node:path'),runtime=path.join(__dirname,'../../.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const result=require('node:child_process').spawnSync(require('node:fs').existsSync(runtime)?runtime:'python',['-B','tools/extract_training_config.py','--check'],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true});
 if(result.error||result.status!==0)throw result.error||Error(result.stdout+result.stderr);
 console.log(result.stdout.trim());
}else main().catch(e=>{console.error(e);process.exitCode=1;});
