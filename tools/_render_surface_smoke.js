'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();
const surfaces=[];
function surface(){
  const events={},s={width:300,height:150,dataset:{},events,addEventListener:(name,fn)=>events[name]=fn};
  let depth=0;
  const noop=()=>{};
  const context=new Proxy({canvas:s,save(){depth++;},restore(){depth--;assert.ok(depth>=0,'balanced canvas state');},get depth(){return depth;}},{get(target,key){return key in target?target[key]:noop;}});
  s.getContext=()=>context;surfaces.push(s);return s;
}
const main=surface();Object.assign(f.el('cv'),main);f.ctx.document.createElement=()=>surface();f.ctx.assert=assert;f.ctx.surfaces=surfaces;
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');
 let cases=0,maxPixels=0,maxWarp=0;
 for(const entry of playableLevels())for(const [w,h]of [[1920,940],[1280,720],[3840,2160]]){
  innerWidth=w;innerHeight=h;setLevel({...BDATA,level:entry.level});showBoard([],[]);hudReserveTop=100;shopReserve=shopReserveGoal=h/4;
  for(const state of ['ordinary','preview','boss','joint'])for(const side of [0,1]){
   window.__preview=state==='preview';window.__bossBattle=state==='boss';B._garrisonJointDefense=state==='joint';window.viewMode=side;
   cam.f=0;computeFit();render();
   const m=window.__mapRenderMetrics,bounds=sceneRenderBounds(),clip=battleClipRect();
   assert.equal(sceneOriginX,bounds.x);assert.equal(sceneOriginY,bounds.y);
   assert.ok(m.width*m.height<=MAX_SCENE_PIXELS,'bounded texture area');
   assert.ok(m.width<=MAX_SCENE_SIDE+1&&m.height<=MAX_SCENE_SIDE+1,'bounded dimensions');
   assert.ok(m.logicalHeight<=BDATA.level.rows*TILE);
   if(state==='boss'||state==='joint')assert.equal(bounds.width,(BDATA.level.halfBoard?Math.ceil(BDATA.level.cols/2):BDATA.level.cols)*TILE,'shared field includes both sides');
   render();assert.equal(window.__mapRenderMetrics.terrainSceneRebuilt,false,'idle terrain stays cached');assert.equal(window.__mapRenderMetrics.terrainProjectionRebuilt,false,'idle projection stays cached');
   if(state!=='preview')assert.equal(+canvas.dataset.warpDraws,0,'empty preparation field has no transparent-layer GPU submissions');
   assert.ok(+canvas.dataset.warpDraws<=256,'auto profile avoids 576 full-map submissions');
   const dimensions=[sceneCanvas.width,sceneCanvas.height];fitS*=.85;render();
   assert.deepEqual([sceneCanvas.width,sceneCanvas.height],dimensions,'interpolation cannot reallocate textures');computeFit();
   maxPixels=Math.max(maxPixels,m.width*m.height);maxWarp=Math.max(maxWarp,+canvas.dataset.warpDraws);cases++;
  }
 }
 // One failed offscreen draw must not leave the global renderer pointing at
 // the wrong canvas and turn every following frame black.
 const screenCtx=ctx,originalDrawBoard=drawBoard;
 drawBoard=()=>{throw new Error('injected draw failure');};invalidateTerrainCache();
 assert.throws(()=>render(),/injected draw failure/);assert.equal(ctx,screenCtx);
 drawBoard=originalDrawBoard;render();assert.equal(ctx,screenCtx);
 const originalDynamic=ArkBattlePresentation.draw;ArkBattlePresentation.draw=()=>{throw new Error('dynamic draw failure');};
 assert.throws(()=>render(),/dynamic draw failure/);assert.equal(ctx,screenCtx);
 ArkBattlePresentation.draw=originalDynamic;render();
 const before=terrainVersion;surfaces[0].events.contextlost();assert.ok(terrainVersion>before);assert.equal(ArkRender.getProfile().id,'low');
 render();assert.equal(ctx,screenCtx);surfaces[0].events.contextrestored();render();
 assert.equal(canvas.dataset.contextLosses,'1');
 console.log('RENDER SURFACE OK '+cases+' map/view/viewport cases; max '+maxPixels+' pixels, '+maxWarp+' auto warp draws; cache, interpolation, context loss and failure recovery');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
