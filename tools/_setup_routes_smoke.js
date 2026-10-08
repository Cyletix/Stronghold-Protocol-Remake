'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();showSetup();
 assert.equal(G,null,'opening setup does not create a run');
 setSetupSeason('act2autochess');setDifficulty('difficult');
 const key='activities/act2autochess/level_act2autochess_m01';selectSetupMap(key);
 assert.equal(G,null,'map selection does not start the game');assert.equal(selectedRunContext().mapKey,key);
 infoReady();assert.equal(G,null);backToSetupInfo();assert.equal(selectedRunContext().mapKey,key,'back from strategy keeps selected map');
 chooseBand('band_amiya');assert.equal(G.seasonId,'act2autochess');assert.equal(G.mapKey,key);
 assert.equal(JSON.stringify(BDATA.level.grid),JSON.stringify(SOURCE_BATTLES.levels[key].level.grid),'chosen terrain equals running terrain');
 assert.equal(BDATA.level.grid[6][4],'tile_wall');
 for(const route of BDATA.level.routes)if(route.motion==='WALK')for(const seg of route.segs){
  for(let i=0;i<seg.length;i++){const p=seg[i];assert.ok(['ALL','WALK_ONLY'].includes(BDATA.level.passable[p.r][p.c]),'ground path stays off highlands');
   if(i){const q=seg[i-1];assert.ok(Math.abs(q.r-p.r)<=1&&Math.abs(q.c-p.c)<=1,'ground path cannot jump across terrain');}}
 }
 const currentWave=battleSourceForRun();window.onBattleEnd=()=>{};window.onLeak=()=>{};
 startBattle([],[],999,currentWave);let groundSamples=0,minGroundRow=99;
 for(let i=0;i<1800&&!B.over;i++){update(1/30,1/30);for(const enemy of B.enemies)if(!enemy.flying){
  const row=Math.round(enemy.y),col=Math.round(enemy.x);assert.ok(row>=6&&row<=9&&col>=2&&col<=10,'ground enemy outside selected battlefield');
  assert.ok(['ALL','WALK_ONLY'].includes(BDATA.level.passable[row][col]),'live ground enemy crossed highland');groundSamples++;minGroundRow=Math.min(minGroundRow,enemy.y);
 }}
 assert.ok(groundSamples>100&&minGroundRow<6.1,'ground enemies actually took upper detour around center highland');
 // Reproduce the old cross-mode leak: source flying routes and a preview/boss camera survive exit.
 BDATA.level.routes=[{motion:'FLY',segs:[[{r:16,c:10},{r:16,c:2}]]}];
 window.__preview=true;window.__bossBattle=true;window.__viewRect={colLeft:0,colRight:5,rowTop:0,rowBot:4};window.viewMode=1;
 enterNormalMode();assert.equal(GMODE,'normal');assert.equal(window.__preview,false);assert.equal(window.__bossBattle,false);assert.equal(window.__viewRect,null);assert.equal(window.viewMode,0);
 assert.equal(BDATA.level,playableLevels()[CUR].level,'practice always loads fresh selected map routes');
 assert.ok(BDATA.level.routes.every(r=>r.motion==='WALK'));
 backToMenu();showSetup();setSetupSeason('act2autochess');setDifficulty('difficult');selectSetupMap(key);
 setDifficulty('standard');assert.notEqual(selectedRunContext().mapKey,key);assert.ok(!SOURCE_BATTLES.seasons[setupSeason()].modes[setupModeId()].stageChoices.some(choice=>choice.levelKey===key),'unsupported map is excluded from the selected mode catalog');
 // No straight-line fallback when WALK endpoints are disconnected or are highlands.
 const layout={rows:1,cols:3,grid:[['tile_start','tile_wall','tile_end']],passable:[['ALL','FLY_ONLY','ALL']],buildable:[['NONE','NONE','NONE']],height:[['LOWLAND','HIGHLAND','LOWLAND']]};
 const raw={layout,routes:[{motionMode:'WALK',startPosition:{row:0,col:0},endPosition:{row:0,col:2},checkpoints:[]}]},notes=[];
 const invalid=ArkSourceMap.convertLevel(raw,notes);assert.equal(invalid.routes[0].segs.length,0);assert.match(notes[0],/unreachable/);
 const waves=[{fragments:[{actions:[{actionType:'SPAWN',key:'test',count:1,routeIndex:0}]}]}];
 const source={rawRoutes:raw.routes,enemies:{test:{flying:true}},waves};
 assert.equal(ArkSourceMap.convertBattle(layout,source).routes[0].motion,'FLY','source flying enemy can use nominal WALK route');
 source.enemies.test.flying=false;assert.ok(ArkSourceMap.convertBattle(layout,source).routes[0].error,'ground enemy cannot use flying traversal');
 setLevel({level:invalid,enemies:{}});assert.match(sourceRouteProblem(source),/路线/);assert.throws(()=>startBattle([],[],10,source),/路线/);
 console.log('SETUP/ROUTES OK staged selection, exact selected map, mode filtering, back navigation, fresh practice routes, camera reset and terrain guards');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
