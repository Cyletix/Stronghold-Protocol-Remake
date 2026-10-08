'use strict';
const assert=require('assert/strict');
const data=require('../web/source_battles.json');
const {convertLevel,convertBattle}=require('../web/src/simulation/source-map');
const key='activities/act1autochess/level_act1autochess_';
const stage=data.levels[key+'m01'].level;
const first=convertLevel({layout:stage,routes:data.levels[key+'01'].rawRoutes});
// Independent expected cells from the source map: the drone zigzags UP from the middle gate.
assert.deepEqual(first.routes[2].segs[0].map(p=>[p.r,p.c]),[[9,10],[9,9],[6,9],[6,7],[9,7],[9,5],[6,5],[6,4],[9,4],[9,2]]);
assert.equal(stage.grid[6][10],'tile_start');assert.equal(stage.grid[9][2],'tile_end');
let combinations=0;
for(const season of Object.values(data.seasons))for(const mode of Object.values(season.modes))
for(const map of mode.stageChoices)for(const round of mode.rounds)for(const choice of round.alternatives){
  const notes=[],level=convertBattle(data.levels[map.levelKey].level,data.levels[choice.levelKey],notes);
  assert.ok(!notes.some(n=>n.includes('unreachable')),map.levelKey+' '+choice.levelKey);
  for(const route of level.routes)for(const seg of route.segs)for(let i=0;i<seg.length;i++){
    const p=seg[i];assert.ok(p.r>=0&&p.r<level.rows&&p.c>=0&&p.c<level.cols);
    if(route.motion==='WALK'){
      assert.ok(['ALL','WALK_ONLY'].includes(level.passable[p.r][p.c]),'walk node on blocked terrain');
      if(i){const q=seg[i-1];assert.ok(Math.abs(q.r-p.r)<=1&&Math.abs(q.c-p.c)<=1,'walk edge skips terrain');}
    }
  }
  combinations++;
}
// The same transform must cover appear/teleport points and retain waits.
const teleport=convertLevel({layout:stage,routes:[{motionMode:'FLY',startPosition:{row:12,col:10},endPosition:{row:2,col:2},checkpoints:[
  {type:'WAIT_FOR_SECONDS',time:2},{type:'DISAPPEAR'},
  {type:'APPEAR_AT_POS',position:{row:5,col:10}},{type:'MOVE',position:{row:2,col:4}},{type:'WAIT_FOR_SECONDS',time:3}
]}]}).routes[0];
assert.deepEqual(teleport.segs,[[{r:6,c:10,wait:2}],[{r:13,c:10},{r:16,c:4,wait:3},{r:16,c:2}]]);
const f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();CUR=playableLevels().findIndex(x=>x.kind==='covenant');chooseBand('band_amiya');
 prepareSourceRound(runModeData().rounds.find(r=>r.alternatives.some(a=>a.bossId)).round);
 assert.equal(BDATA.level.sourceRoutes,true,'boss must not fall back to snapped gates');
 const bossRoute=BDATA.level.routes[0];assert.ok(bossRoute.segs[0][0].r>=13,'boss starts in bottom section');
 // Run the actual first-wave drone movement, including the upward legs, in small simulation steps.
 const base=SOURCE_BATTLES.levels['${key}01'];
 setLevel({level:window.ArkSourceMap.convertLevel({layout:SOURCE_BATTLES.levels['${key}m01'].level,routes:base.rawRoutes}),enemies:base.enemies});
 window.onBattleEnd=()=>{};window.onLeak=()=>{};
 const action=base.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions)).find(a=>a.actionType==='SPAWN'&&a.routeIndex===2);
 startBattle([],[],1000,{...base,options:{...base.options,maxPlayTime:120},waves:[{preDelay:0,fragments:[{preDelay:0,actions:[{...action,count:1,preDelay:0}]}]}]});
 let minRow=99,samples=0;
 for(let i=0;i<2400&&!B.over;i++){update(1/30,1/30);for(const e of B.enemies){const r=e.y;assert.ok(r>=6-1e-6&&r<=9+1e-6,'drone escaped battlefield into bench');minRow=Math.min(minRow,r);samples++;}}
 assert.ok(samples>30&&minRow<6.1,'drone traversed the upper waypoint');assert.ok(B.over);
 console.log('SOURCE COORDINATES OK ${combinations} map/round pairs; drone traversal; boss section; teleport/waits');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
