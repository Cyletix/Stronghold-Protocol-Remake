'use strict';
const assert=require('assert/strict'),sim=require('../web/src/simulation/simulation-clock');
function run(fps){const c=sim.clock();let ticks=0,time=0;for(let i=0;i<fps*10;i++)sim.advance(c,1/fps,2,false,dt=>{ticks++;time+=dt;});return {ticks,time};}
assert.deepEqual(run(30),run(60));assert.deepEqual(run(60),run(144));assert.equal(run(60).ticks,600);
const c=sim.clock();assert.equal(sim.advance(c,10,2,false,()=>{}),8);assert.ok(c.dropped>19);sim.advance(c,1,2,true,()=>assert.fail());assert.equal(c.accumulator,0);
sim.seed(123);const first=Array.from({length:100},()=>sim.random()),saved=sim.snapshot(),tail=Array.from({length:20},()=>sim.random());sim.restore(saved);assert.deepEqual(Array.from({length:20},()=>sim.random()),tail);sim.seed(123);assert.deepEqual(Array.from({length:100},()=>sim.random()),first);
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();ArkSim.seed(42);chooseBand('band_amiya');const a=JSON.stringify(G.shop),rng=ArkSim.snapshot();
 // Visual particles must not change logical randomness.
 spawnHitParticles(0,0);assert.equal(ArkSim.snapshot().state,rng.state);
 ArkSim.seed(42);chooseBand('band_amiya');assert.equal(JSON.stringify(G.shop),a);
 let ticks=0;update=()=>ticks++;render=()=>{};B.phase='battle';B.over=false;last=null;simulationClock=null;
 for(let i=0;i<=60;i++)loop(i*1000/60);assert.equal(ticks,60);
 console.log('SIMULATION OK 30/60/144 Hz identical ticks, bounded catch-up, pause, RNG restore, stable shop and visual isolation');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
