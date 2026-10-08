'use strict';
const assert=require('assert/strict'),create=require('./_browser_fixture');
(async()=>{
  const f=create();await f.run('initMode()');const audio=f.el('bgm');let played=0,paused=0;audio.play=async()=>played++;audio.pause=()=>paused++;audio.paused=true;
  assert.equal(audio.muted,true);f.run('showSetup()');assert.equal(played,0,'new windows must not autoplay audible music');
  f.run('toggleBgm()');assert.equal(audio.muted,false);assert.equal(played,1);audio.volume=0.23;audio.onvolumechange();
  f.run('toggleBgm()');assert.equal(audio.muted,true);assert.ok(paused>0);
  const second=create();second.storage.set('arknightsAudioV1',f.storage.get('arknightsAudioV1'));await second.run('initMode()');assert.equal(second.el('bgm').muted,true);assert.equal(second.el('bgm').volume,0.23);
  second.run('showSetup()');assert.equal(second.el('bgm').volume,0.23,'setup must not reset volume');
  second.storage.set('arknightsAudioV1','broken');second.run('loadBgmPreference()');assert.equal(second.el('bgm').muted,true);
  console.log('AUDIO OK muted default, explicit enable, saved mute/volume across page reload, no setup reset, corrupt preference fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
