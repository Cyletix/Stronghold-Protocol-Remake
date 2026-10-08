'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};
  const controller={kind:'appear_skill_active_buffs',activation:'deploy',duration_policy:'max_buff_duration',
   cast_on_locate:false,emit_skill_started:false,pre_delay:0,wait_for_casting:false,wait_for_attack_event:false};
  const buff=extra=>({id:'source-template-test',scope:'self',lifetime:{kind:'timed',duration:{constant:10}},stacking:{max_stacks:1},modifiers:[],...extra});
  function make(extra,passives){
   const entry=ROSTER.char_290_vigna,base=finalizeOperator(entry,null,[],false);
   startBattle([{...base,id:1,charId:entry.id,row:3,col:3,dir:'right'}],[],100);
   B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];B.time=0;
   const o=B.operators[0];o.maxHp=1000;o.hp=1000;o.def=100;o.attributeBase={...o.attributeBase,def:100,maxHp:1000};
   o.deployAt=0;o.deployT=2;o.deployed=true;o.cd=999;o.dead=false;o.buffs=[];
   ArkClientProgramData.profiles.deployment_fixture={prefabId:'deployment_fixture',charIds:[o.charId],blackboardKeys:[]};
   ArkClientProgramData.programs.deployment_fixture={controller,buffs:[buff(extra)],...(passives?{passive_modifiers:passives}:{}),source:{}};
   o.skill={sourceId:'deployment_fixture',name:'source deployment node fixture',isPassive:true,spCost:0,duration:10,blackboard:{},effects:[]};
   ArkClientPrograms.configure(o.skill,o.charId);o.skillState={until:10,range:o.range,rangeGrids:o.rangeGrids,cells:o.cells,deltas:{}};
   return o;
  }
  const shield={kind:'linear-decay',attribute:'max_hp',ratio:{constant:2},interval:1,wait_first:false};
  let o=make({shield});ArkClientPrograms.start(o,0);
  assert.equal(ArkClientPrograms.shieldInfo(o,0).amount,1800,'source initial 2000, dynamic_spd 200; explicit immediate first trigger');
  assert.equal(inflictDamage(o,300),0);assert.equal(o.hp,1000);assert.equal(ArkClientPrograms.shieldInfo(o,0).amount,1500);
  B.time=1;ArkClientPrograms.advance(o,1,1,healOperator);
  assert.equal(ArkClientPrograms.shieldInfo(o,1).amount,1300,'time decay uses initial capacity, not damaged remaining shield');
  o.maxHp=5000;B.time=2;ArkClientPrograms.advance(o,2,1,healOperator);
  assert.equal(ArkClientPrograms.shieldInfo(o,2).amount,1100,'capacity is snapshotted, not resized by later HP changes');
  o.medicBarrier={amount:50,until:99};assert.equal(inflictDamage(o,1200),50,'source and medical shields are separate consumers');
  assert.equal(o.hp,950);assert.equal(o.medicBarrier,null);assert.equal(o.skillState.until,2,'depleted final Buff finishes its limited body');
  B.time=2.1;update(.1,.1);assert.equal(o.clientProgramState,undefined);
  o=make({shield});ArkClientPrograms.start(o,0);const saved=JSON.parse(JSON.stringify(o));
  for(let at=1;at<=5;at++)ArkClientPrograms.advance(o,at,1,healOperator);
  const expected=JSON.parse(JSON.stringify(o.clientProgramState));
  Object.assign(o,JSON.parse(JSON.stringify(saved)));ArkClientPrograms.advance(o,5,5,healOperator);
  assert.deepEqual(o.clientProgramState,expected,'batched time and stepped time consume the same periodic sequence');
  ArkClientPrograms.advance(o,5,0,healOperator);assert.deepEqual(o.clientProgramState,expected,'restored cursor does not double decay');
  ArkClientPrograms.advance(o,9,4,healOperator);assert.equal(o.skillState.until,9,'pure time depletion finishes without requiring another hit');
  B.time=9;update(0,0);assert.equal(o.clientProgramState,undefined);
  const periodic={kind:'remaining-ratio-modifier',interval:1,wait_first:false,
   modifier:{attribute:'def',formula:'multiplier',value:{constant:2}},end_time:0,inversed:false};
  o=make({periodic});ArkClientPrograms.start(o,0);assert.equal(operatorDefense(o),300);
  B.time=4.9;ArkClientPrograms.advance(o,4.9,4.9,healOperator);assert.ok(Math.abs(operatorDefense(o)-220)<1e-9,'source ratio is sampled per trigger');
  B.time=5;ArkClientPrograms.advance(o,5,.1,healOperator);assert.equal(operatorDefense(o),200);
  B.time=10;update(0,0);assert.equal(operatorDefense(o),100);assert.equal(o.clientProgramState,undefined);
  const loss={kind:'current-hp-ratio-damage',ratio:{constant:.5},damage_type:'true',nonlethal:true,skip_modifier_events:true,ignore_for_sp:false};
  o=make({on_attach:[loss]},[{attribute:'respawn_time',formula:'final_scaler',value:{constant:1}}]);
  o.medicBarrier={amount:700,until:99};o.commandShield=2;ArkClientPrograms.start(o,0);
  assert.equal(o.hp,500);assert.equal(o.medicBarrier.amount,700);assert.equal(o.commandShield,2,'source self loss bypasses shields');
  endOperatorSkill(o);assert.equal(ArkClientPrograms.respawnTime(o,20),20,'passive raw FINAL_SCALER 1 survives active expiry');
  o=make({on_attach:[loss]});o.hp=.5;ArkClientPrograms.start(o,0);assert.equal(o.hp,.5,'nonlethal loss never heals a sub-one HP target');
  o=make({shield});ArkClientPrograms.start(o,0);o.hp=0;tryKill(o);assert.equal(o.clientProgramState,undefined,'death clears independent shield and timers');
 })()`);
 console.log('DEPLOYMENT PROGRAMS OK native formula consumers, shield damage/time/capacity, separate medical shield, stepped/batched restore, DEF expiry, nonlethal self loss and passive lifetime');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
