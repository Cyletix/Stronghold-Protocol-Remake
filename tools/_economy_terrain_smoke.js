'use strict';
const assert=require('assert/strict'),activity=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,sourceActivity:activity});
f.run(`(async()=>{
 await initMode();
 for(const sid of ['act1autochess','act2autochess']){
  setSetupSeason(sid);setDifficulty('difficult');setMatch('solo');
  assert.equal(setupBands().length,Object.keys(sourceActivity.activity.AUTOCHESS_SEASON[sid].bandDataListDict).length);
  pickBand('band_amiya');const def=sourceActivity.activity.AUTOCHESS_SEASON[sid].bandDataListDict.band_amiya;
  assert.ok(document.getElementById('pick-card-body').innerHTML.includes('初始生命值 '+def.totalHp));
  chooseBand('band_amiya');assert.equal(G.life,def.totalHp);assert.equal(deployLimit(),8);
  assert.equal(G.money,4,'provisional ordinary opening allowance');assert.equal(G.upgradeCost,5);
  upgradeShop();upgradeShop();assert.equal(G.level,1,'opening funds cannot buy a five-cost upgrade');
  startRound(2);assert.equal(G.money,5);assert.equal(G.upgradeCost,4);
  upgradeShop();upgradeShop();assert.equal(G.level,2);assert.equal(G.money,1);upgradeShop();upgradeShop();assert.equal(G.level,2,'round two cannot reach level five from free round grants');
  G.level=6;assert.equal(deployLimit(),8,'capacity does not grow with shop level');
  const op={id:1,entry:ROSTER_LIST[0]},mods={1:{atk:1,hp:1,def:1,aspd:1}};
  applyBandStatBuff('band_amiya',[op],{one:1,two:1},mods);
  assert.equal(mods[1].atk,sid==='act1autochess'?1.15:1,'thresholds belong to the chosen season');
  chooseBand('band_lmlee');assert.equal(G.money,0);startBattleRound();assert.equal(G.phase,'battle','zero-income opening can pass an empty-board round');onBattleEnd(false,0);startRound(2);assert.equal(G.money,0);startRound(3);assert.equal(G.money,15,'Lee replaces, rather than adds to, the allowance');
  chooseBand('band_cannot');G.money=7;startRound(2);assert.equal(G.money,13,'five allowance + seven carried + one interest');
 }
 setMatch('team');setDifficulty('difficult');chooseBand('band_amiya');assert.equal(TEAM_AI.length,3);assert.equal(G.money,4,'no invented six-coin AI support');startRound(2);assert.equal(G.money,5);
 setMatch('solo');selectSetupMap('activities/act2autochess/level_act2autochess_m04');chooseBand('band_amiya');startRound(2);
 const level=BDATA.level;
 for(const [r,c]of [[7,9],[8,9]]){assert.equal(level.buildable[r][c],'NONE');assert.ok(level.devices.some(t=>t.id==='trap_1105_accrate'&&t.r===r&&t.c===c));}
 assert.equal(level.grid[7][7],'tile_fence_bound');assert.equal(level.buildable[7][7],'ALL');assert.equal(level.passable[7][7],'FLY_ONLY');
 const declared=[...new Set(currentSourceBattle().waves.flatMap(w=>w.fragments.flatMap(f=>f.actions.filter(a=>a.actionType==='SPAWN'&&a.count!==0).map(a=>a.routeIndex))))];assert.deepEqual(level.activeRouteIndices,declared);
 const sampleRoute={motion:'WALK',segs:[[{r:6,c:4},{r:6,c:5}]]};assert.equal(visibleRouteEdges({routes:[sampleRoute,sampleRoute,{motion:'WALK',segs:[[{r:0,c:0},{r:1,c:0}]]}],activeRouteIndices:[0,1]},'WALK').length,1,'duplicates merged and unused template excluded');
 const edges=visibleRouteEdges(level,'WALK');assert.ok(edges.length);assert.equal(new Set(edges.map(e=>JSON.stringify(e))).size,edges.length);
 const source=battleSourceForRun();window.onBattleEnd=()=>{};window.onLeak=()=>{};startBattle([],[],999,source);
 let samples=0;
 for(let i=0;i<2400&&!B.over;i++){update(1/30,1/30);for(const e of B.enemies){
  const r=Math.round(e.y),c=Math.round(e.x);assert.ok(r>=6&&r<=9,'active enemy outside battle rows');assert.ok(!['tile_achand','tile_acshop'].includes(level.grid[r][c]));
  if(!e.flying)assert.ok(['ALL','WALK_ONLY'].includes(level.passable[r][c]),'ground enemy entered a fence/device');samples++;
 }}assert.ok(samples>100&&B.over,'complete real wave on the reported II-4 map');
 // Predefined devices participate in routing, not merely drawing.
 const raw={mapData:{map:[[0,0,0],[1,0,2],[0,0,0]],tiles:[{tileKey:'tile_road',passableMask:'ALL',buildableType:'ALL',heightType:'LOWLAND'},{tileKey:'tile_start',passableMask:'ALL',buildableType:'NONE'},{tileKey:'tile_end',passableMask:'ALL',buildableType:'NONE'}]},
  predefines:{tokenInsts:[{hidden:false,inst:{characterKey:'trap_1105_accrate'},position:{row:1,col:1}}]},
  routes:[{motionMode:'WALK',startPosition:{row:1,col:0},endPosition:{row:1,col:2},checkpoints:[]}]};
 const converted=ArkSourceMap.convertLevel(raw);assert.ok(converted.routes[0].segs[0].every(p=>p.r!==1||p.c!==1));
 setSetupSeason('act1autochess');setDifficulty('difficult');selectSetupMap('activities/act1autochess/level_act1autochess_m06');chooseBand('band_amiya');
 const platform=BDATA.level.devices.find(t=>t.id==='trap_1106_achplat'&&t.r===9);
 assert.ok(platform);assert.equal(BDATA.level.height[platform.r][platform.c],'HIGHLAND');
 const ranged=ROSTER_LIST.find(e=>e.position==='RANGED'),melee=ROSTER_LIST.find(e=>e.position==='MELEE');
 addOperator(ranged.charId,false);addOperator(melee.charId,false);
 const ro=G.ops.find(o=>o.charId===ranged.charId),mo=G.ops.find(o=>o.charId===melee.charId);
 onDeploy(mo,platform.r,platform.c);assert.equal(mo.row,null);onDeploy(ro,platform.r,platform.c);assert.equal(ro.row,platform.r);
 const land=[7,4];assert.ok(isDeployable(...land,mo));onDeploy(mo,...land);const old=[mo.row,mo.col];onMoveOp(ro.id,...land);assert.deepEqual([mo.row,mo.col],old,'invalid swap cannot put melee onto ranged platform');
 console.log('ECONOMY/TERRAIN OK source season strategies, Lee/interest, bounded early upgrades, AI grant removal, fixed capacity, reported map traversal, devices and ranged deployment');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
