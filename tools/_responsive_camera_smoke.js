'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');
 for(const [w,h,top,bottom]of [[1920,1080,134,270],[1280,720,134,180],[820,1180,174,270],[390,844,228,228],[844,390,126,148],[640,360,126,148]]){
  innerWidth=w;innerHeight=h;sizeCanvas();hudReserveTop=top;shopReserve=bottom;
  for(const kind of ['ordinary','boss','joint-defense'])for(const v of [0,1,2])for(const focus of [0,1]){
   window.__bossBattle=kind==='boss';B._garrisonJointDefense=kind==='joint-defense';
   window.viewMode=v;cam.f=focus;computeFit();const r=window.__winRect;
   const clip=battleClipRect();
   if(kind!=='ordinary'){
    assert.equal(clip.colLeft,0);assert.equal(clip.colRight,BDATA.level.cols,'shared map cannot be cut at the camera boundary');
    assert.equal(isVisibleMapPoint(BDATA.level.cols-1,clip.rowBot-2,0),true,'far-side units remain eligible to draw');
   }else assert.deepEqual(clip,r,'ordinary isolated field retains its original clipping');
   for(const [c,row]of [[r.colLeft,r.rowTop],[r.colRight,r.rowTop],[r.colLeft,r.rowBot],[r.colRight,r.rowBot]]){
    const [x,y]=mapPoint(c*TILE,row*TILE,focus);assert.ok(x>=-0.01&&x<=w+0.01,'horizontal clipping '+w+'x'+h);assert.ok(y>=top-0.01&&y<=h-bottom+0.01,'HUD/shop overlap '+w+'x'+h);
    const [px,py]=unpoint(x,y);assert.ok(Math.abs(px-c*TILE)<0.01&&Math.abs(py-row*TILE)<0.01,'pointer projection after resize');
   }
  }
 }
 console.log('RESPONSIVE CAMERA OK six viewports, left/right/overview, full shared-map clipping and unit culling, isolated ordinary fields, no HUD/shop overlap and pointer inverse');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
