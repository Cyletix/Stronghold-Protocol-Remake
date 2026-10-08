'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};
  const base=[{row:-1,col:1},{row:0,col:0},{row:0,col:1},{row:1,col:2}];
  const modifier=value=>({attribute:'ability_range_forward_extend',formula:'addition',value:{constant:value}});
  const buff=(id,value,seconds)=>({id,scope:'self',lifetime:{kind:'timed',duration:{constant:seconds}},stacking:{max_stacks:1},modifiers:[modifier(value)]});
  const program={controller:{kind:'cast_skill_active_buffs',activation:'cast',pre_delay:0,duration_policy:'max_buff_duration',wait_for_casting:false,wait_for_attack_event:true},buffs:[buff('short',1,1),buff('long',2,3)],source:{}};
  ArkClientProgramData.programs.range_fixture=program;
  ArkClientProgramData.profiles.range_fixture={prefabId:'range_fixture',charIds:['char_290_vigna'],blackboardKeys:[]};
  function make(dir){
   const entry=debugTacticalEntry('char_290_vigna')||ROSTER.char_290_vigna;
   const op=finalizeOperator(entry,null,[],false);
   startBattle([{...op,id:1,charId:'char_290_vigna',row:4,col:4,dir}],[],100);
   B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
   const o=B.operators[0];o.deployAt=0;o.deployT=2;o.deployed=true;o.cd=999;
   o.rangeGrids=base.map(g=>({...g}));o.cells=rangeCellsFor(o);
   o.skill={sourceId:'range_fixture',name:'range consumer fixture',spCost:10,duration:3,blackboard:{},effects:[]};
   ArkClientPrograms.configure(o.skill,o.charId);o.sp=10;assert.equal(castSkill(o),true);return o;
  }
  const forward={right:[0,1],left:[0,-1],up:[-1,0],down:[1,0]};
  for(const dir of Object.keys(forward)){
   const o=make(dir),[dr,dc]=forward[dir];
   assert.equal(base.length,4,'input grid array is never mutated');
   assert.equal(o.rangeGrids.length,13,'three rows extend by sum of live Buffs');
   assert.equal(enemyInOperatorRange(o,{x:4+4*dc,y:4+4*dr}),true,'expanded edge participates in real targeting');
   assert.equal(enemyInOperatorRange(o,{x:4+5*dc,y:4+5*dr}),false,'outside edge remains excluded');
   B.time=1.01;ArkClientPrograms.tick(o,B.time);
   assert.equal(o.rangeGrids.length,10,'only expired contribution disappears');
   assert.equal(enemyInOperatorRange(o,{x:4+4*dc,y:4+4*dr}),false,'old edge no longer targets');
   const clone=JSON.parse(JSON.stringify(o));ArkClientPrograms.tick(clone,B.time);
   assert.deepEqual(clone.cells,o.cells,'serialized active range does not extend twice');
   o.dir=dir==='right'?'up':'right';ArkClientPrograms.tick(o,B.time);
   assert.deepEqual(o.cells,rangeCellsFor(o),'direction changes update the live footprint');
   const changed=[{row:0,col:0},{row:0,col:1},{row:0,col:2}];
   const src={...o,rangeGrids:changed,maxHp:o.maxHp,atk:o.atk,def:o.def};updateOperatorBaseStats(o,src);
   assert.equal(o.rangeGrids.length,5,'new base range gains two surviving extension cells');
   endOperatorSkill(o);assert.deepEqual(o.rangeGrids,changed);
   assert.deepEqual(o.cells,rangeCellsFor(o),'ending restores current base and facing');
   assert.equal(o.clientProgramState,undefined);
  }
  const killed=make('up');killed.hp=0;tryKill(killed);assert.deepEqual(killed.rangeGrids,base);assert.equal(killed.clientProgramState,undefined);
  const expired=make('right');B.time=3.1;update(.1,.1);assert.equal(expired.skillState,null);assert.deepEqual(expired.rangeGrids,base);
  const skill={sourceId:'range_fixture',spCost:10,duration:3,blackboard:{}};
  for(const value of [-1,.5]){program.buffs[0].modifiers[0]=modifier(value);assert.throws(()=>ArkClientPrograms.configure(skill,'char_290_vigna'),/forward range/);}
  program.buffs[0].modifiers[0]={...modifier(1),formula:'multiplier'};assert.throws(()=>ArkClientPrograms.configure(skill,'char_290_vigna'),/forward range/);
 })()`);
 console.log('PROGRAM RANGE OK four directions, real targeting edge, stacked lifetimes, no duplicate restore, base rebind, expiry/death and invalid modifiers');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
