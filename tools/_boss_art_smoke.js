'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const profiles=require('../web/boss_mechanics.json').profiles,f=require('./_browser_fixture')();
Object.assign(f.ctx,{assert,profiles});
// These are complete handbook images; enemy_portraits contains unpacked Spine sheets.
for(const id of Object.keys(profiles)){
 const bytes=fs.readFileSync(path.join(__dirname,'../web/enemy_avatars',id+'.png'));
 assert.equal(bytes.subarray(1,4).toString(),'PNG',id+' has a packaged image');
}
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');window.__bossBattle=true;computeFit();
 const calls=[],originalCtx=ctx;
 ctx=new Proxy({},{get:(_,key)=>(...args)=>{calls.push([key,...args]);},set:()=>true});
 for(const enemyId of Object.keys(profiles)){
  const enemy={enemyId,x:10,y:15,hp:100,maxHp:100};
  const before=JSON.stringify(enemy),box=largeBossArtBox(enemy);
  assert.ok(box.width>4&&box.height>2);assert.ok(largeBossArtVisible(box));
  const im=getEnemyAvatar(enemyId);Object.assign(im,{complete:true,naturalWidth:158,naturalHeight:158});
  calls.length=0;drawLargeBossArt(enemy,box);
  const draws=calls.filter(c=>c[0]==='drawImage');assert.equal(draws.length,1);
  const [,image,x,y,w,h]=draws[0];assert.equal(image,im);assert.equal(draws[0].length,6,'complete bitmap draw has no crop rectangle');
  assert.ok(w>TILE*2.9&&h>TILE*2.9);assert.equal(w,h,'original image proportions are retained');
  assert.ok(x>=box.x*TILE&&y>=box.y*TILE);assert.ok(x+w<=(box.x+box.width)*TILE+.001&&y+h<=(box.y+box.height)*TILE+.001);
  assert.equal(calls.some(c=>['clip','arc','rotate'].includes(c[0])),false,'no circular mask, orange ring or attack rocking for a fixed body');
  assert.equal(JSON.stringify(enemy),before,'rendering cannot rewrite source position, health or footprint');
  calls.length=0;im.complete=false;drawLargeBossArt(enemy,box);assert.equal(calls.some(c=>c[0]==='drawImage'),false);assert.equal(calls.some(c=>c[0]==='fillText'),true,'loading fallback remains an area, not a circular avatar');
  assert.equal(largeBossArtBox({...enemy,dead:true}),null);
 }
 assert.equal(largeBossArtBox({enemyId:'ordinary',x:10,y:15}),null,'ordinary enemies keep their current rendering');
 assert.equal(largeBossArtBox({enemyId:'moving',x:10,y:15,bossMechanics:{movement:'walk',hitbox:{width:5,height:3}}}),null,'large moving enemies are not reclassified as fixed');
 assert.equal(largeBossArtVisible({x:12,y:13,width:5,height:3}),true,'connected view does not cull a large body at a half-screen seam');
 ctx=originalCtx;
 console.log('BOSS ART OK five fixed profiles, packaged whole images, footprint alignment/aspect, no circle/crop/rock, loading/death fallback and unchanged combat state');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
