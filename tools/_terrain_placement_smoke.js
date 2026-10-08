'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();
Object.assign(f.ctx,{assert,rawMaps:require('../web/mode_rounds.json').levels});
f.run(`(async()=>{
 await initMode();setSetupSeason('act2autochess');setDifficulty('extreme');setMatch('solo');
 const mapII='activities/act2autochess/level_act2autochess_m01';
 selectSetupMap(mapII);chooseBand('band_amiya');
 // Source dimensions/placement masks are not inferred from walkability or tile names.
 for(const [key,raw]of Object.entries(rawMaps))if(key.includes('_m')){
   const actual=SOURCE_BATTLES.levels[key].level,source=ArkSourceMap.convertLevel(raw);
   for(const field of ['grid','height','buildable','passable'])assert.deepEqual(actual[field],source[field],key+' '+field);
 }
 const high={row:6,col:4},ground={row:9,col:4};
 assert.equal(BDATA.level.grid[high.row][high.col],'tile_wall');
 assert.equal(BDATA.level.height[high.row][high.col],'HIGHLAND');
 assert.equal(BDATA.level.buildable[high.row][high.col],'RANGED');
 assert.equal(BDATA.level.passable[high.row][high.col],'FLY_ONLY');
 let entries=['MELEE','RANGED'].map(position=>ROSTER_LIST.find(e=>e.position===position&&!G.bannedOperators.includes(e.charId)));
 function reset(positions=[null,null]){
   G.ops=entries.map((entry,i)=>({id:i+1,charId:entry.charId,entry,equip:[],row:positions[i]?.row??null,col:positions[i]?.col??null,dir:'up'}));
   G._deployBonus=0;selectedHand=null;selBoardOp=null;drag=null;refreshBoard();
 }
 function begin(id,cell){
   const op=G.ops.find(o=>o.id===id);
   if(op.row==null)startBenchDrag(B.bench.find(o=>o.id===id),0,0,0,0);
   else startMoveDrag(B.operators.find(o=>o.id===id),0,0,0,0);
   drag.moved=true;drag.x=(cell.col+.5)*TILE;drag.y=(cell.row+.5)*TILE;
   boardXY=()=>[drag.x,drag.y];
 }
 function preview(cell,expected){
   assert.equal(canDropOperator(drag,cell.row,cell.col),expected);
   const oldCtx=ctx,strokes=[],noop=()=>{};
   ctx=new Proxy({strokeRect(...args){strokes.push([this.strokeStyle,...args]);}},{get:(t,k)=>k in t?t[k]:noop});
   drawBoard({terrain:false});ctx=oldCtx;
   assert.ok(strokes.some(([color,x,y])=>color===(expected?'#8bc34a':'#f44336')&&x===cell.col*TILE+1&&y===cell.row*TILE+1),'actual painted hint agrees with acceptance');
 }
 function release(cell,expected){
   preview(cell,expected);const before=G.ops.map(o=>[o.row,o.col]);onUp({});
   assert.equal(drag?.phase||null,expected?'facing':null,'same release decision as preview');
   if(!expected){assert.deepEqual(G.ops.map(o=>[o.row,o.col]),before);return;}
   drag.dragging=true;drag.dirSet=true;drag.dir='right';boardXY=()=>[(cell.col+2.5)*TILE,(cell.row+.5)*TILE];onUp({});assert.equal(drag,null);
 }
 reset();begin(1,high);release(high,false);
 // Even a mismatched client view cannot turn an owned melee unit into a ranged unit.
 onDeploy({id:1,position:'RANGED'},high.row,high.col);assert.equal(G.ops[0].row,null);
 begin(2,high);release(high,true);assert.equal(G.ops[1].row,high.row);
 onDeploy({id:1},ground.row,ground.col);begin(1,high);release(high,false);
 const occupiedHigh=G.ops.map(o=>[o.row,o.col]);begin(2,ground);release(ground,false);
 onMoveOp(2,ground.row,ground.col);assert.deepEqual(G.ops.map(o=>[o.row,o.col]),occupiedHigh,'invalid reciprocal swap cannot bypass preview');
 // Moving and valid swaps still work at capacity; a reserve unit cannot join.
 reset([ground,{row:9,col:5}]);G._deployBonus=2-deployLimit();
 const destination={row:9,col:7};begin(1,destination);release(destination,true);assert.equal(G.ops[0].col,7);
 const other={row:G.ops[1].row,col:G.ops[1].col};begin(1,other);release(other,true);assert.equal(G.ops[1].col,7);
 G.ops.push({id:3,charId:entries[0].charId,entry:entries[0],equip:[],row:null,col:null});refreshBoard();begin(3,ground);release(ground,false);
 // Genuine enclosed ground accepts either deployment class, but not ground enemies.
 setSetupSeason('act1autochess');setDifficulty('difficult');selectSetupMap('activities/act1autochess/level_act1autochess_m01');chooseBand('band_amiya');entries=['MELEE','RANGED'].map(position=>ROSTER_LIST.find(e=>e.position===position&&!G.bannedOperators.includes(e.charId)));reset();
 const fence={row:6,col:3},blockedFence={row:7,col:5};
 assert.equal(BDATA.level.grid[fence.row][fence.col],'tile_fence_bound');
 assert.equal(BDATA.level.height[fence.row][fence.col],'LOWLAND');
 assert.equal(BDATA.level.buildable[fence.row][fence.col],'ALL');
 assert.equal(BDATA.level.passable[fence.row][fence.col],'FLY_ONLY');
 for(const id of [1,2]){reset();begin(id,fence);release(fence,true);assert.equal(G.ops[id-1].row,fence.row);}
 reset();begin(1,blockedFence);release(blockedFence,false);
 // Device overlays may convert a fence into a ranged platform: draw exactly one terrain type.
 selectSetupMap('activities/act1autochess/level_act1autochess_m03');chooseBand('band_amiya');
 const platform={row:7,col:7};assert.equal(BDATA.level.grid[7][7],'tile_fence_bound');assert.equal(BDATA.level.height[7][7],'HIGHLAND');assert.equal(BDATA.level.buildable[7][7],'RANGED');
 reset();begin(1,platform);release(platform,false);begin(2,platform);release(platform,true);
 const nativeHigh=drawHighlandBlock,nativeFence=drawFenceTile,highs=new Set(),fences=new Set();drag=null;
 drawHighlandBlock=(x,y)=>highs.add(y/TILE+','+x/TILE);drawFenceTile=(x,y)=>fences.add(y/TILE+','+x/TILE);
 drawBoard({dynamic:false});drawHighlandBlock=nativeHigh;drawFenceTile=nativeFence;
 assert.ok(highs.has('7,7'));assert.ok(!fences.has('7,7'));assert.ok(fences.size);assert.ok([...highs].every(k=>!fences.has(k)));
 // MELEE-only masks also remain distinct from ALL. No source field is rewritten.
 const saved=BDATA.level.buildable[9][4];BDATA.level.buildable[9][4]='MELEE';
 assert.equal(isDeployable(9,4,entries[0]),true);assert.equal(isDeployable(9,4,entries[1]),false);BDATA.level.buildable[9][4]=saved;
 assert.equal(isDeployable(6.5,4,entries[1]),false);assert.equal(isDeployable(-1,4,entries[1]),false);
 console.log('TERRAIN PLACEMENT OK source masks, highland/fence/device distinction, actual red/green rendering and drop/facing, capacity moves, reciprocal swaps and authoritative class checks');
})()`).catch(error=>{console.error(error);process.exitCode=1;});
