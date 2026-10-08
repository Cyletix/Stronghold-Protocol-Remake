'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const waves=require('../web/src/simulation/wave-scheduler');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const all=read('web/source_battles.json'),first=all.levels['activities/act1autochess/level_act1autochess_01'];
let s=waves.create(first.waves);assert.equal(waves.advance(s,2.9,()=>false).length,0);
assert.deepEqual(waves.advance(s,3,()=>false).map(x=>[x.enemyId,x.route,x.at]),[['enemy_1007_slime',0,3]]);
assert.equal(waves.advance(s,8,()=>true).length,1);assert.equal(waves.advance(s,12,()=>true).length,2);assert.equal(waves.advance(s,15,()=>true).length,2);assert.equal(s.done,false);
waves.advance(s,16,()=>false);assert.equal(s.done,true);
const action={actionType:'SPAWN',key:'test',count:2,preDelay:3,interval:2,routeIndex:0};
s=waves.create([{preDelay:2,postDelay:1,maxTimeWaitingForNextWave:-1,fragments:[{preDelay:1,actions:[action]}]},{preDelay:1,fragments:[{preDelay:0,actions:[{...action,count:1,preDelay:0}]}]}]);
assert.deepEqual(waves.advance(s,8,()=>false).map(x=>x.at),[6,8]);waves.advance(s,9,()=>true);assert.equal(s.wave,0);
waves.advance(s,10,()=>false);assert.equal(waves.advance(s,11.9,()=>false).length,0);assert.equal(waves.advance(s,12,()=>false)[0].at,12);
const noop=()=>{},elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{add:noop,remove:noop,contains:()=>false,toggle:noop},addEventListener:noop,getContext:()=>new Proxy({},{get:()=>noop}),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900})});return elements.get(id);}
const ctx={console,assert,first,ArkWaves:waves,innerWidth:1400,innerHeight:900,requestAnimationFrame:()=>0,addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,document:{getElementById:el,addEventListener:noop},Image:function(){this.complete=false;},fetch:async url=>({json:async()=>read('web/'+url)})};ctx.localStorage={getItem:()=>null,setItem:()=>{}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['src/rules/diy-roster.js','src/simulation/enemy-replacement.js','src/rules/run-setup.js','src/domain/game-state.js','src/rules/session-commands.js','engine.js','mode.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',f),'utf8'),ctx);
vm.runInContext(`(async()=>{
 await initMode();window.onBattleEnd=()=>{};window.onLeak=()=>{};
 setLevel({level:first.level,enemies:first.enemies});
 startBattle([],[],1000,first);update(2.9,2.9);assert.equal(B.over,false);assert.equal(B.enemies.length,0);
 update(0.1,0.1);assert.equal(B.enemies.length,1);const e=B.enemies[0];assert.equal(e.enemyId,'enemy_1007_slime');assert.equal(e.sourceWave,0);assert.equal(e.moveSpeed,first.enemies.enemy_1007_slime.moveSpeed*first.options.moveMultiplier);
 assert.equal(B.roundLimit,45);assert.equal(BDATA.level.sourceRoutes,true);
 for(let i=0;i<450&&!B.over;i++)update(0.1,0.1);assert.ok(B.over,'source battle settles within configured time');
 console.log('SOURCE WAVES OK source timestamps/routes; wave clear barrier; delays; real engine uses source enemies, movement multiplier and limit');
})()`,ctx).catch(e=>{console.error(e);process.exitCode=1;});
