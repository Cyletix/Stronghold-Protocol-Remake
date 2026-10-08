'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 const source='self-buff-consumer-fixture';
 const controller={kind:'cast_skill_active_buffs',activation:'cast',duration_policy:'max_buff_duration',pre_delay:0,wait_for_casting:false,wait_for_attack_event:false};
 function definition(id,modifiers=[],extras={}){return {id,scope:'self',lifetime:{kind:'timed',duration:{key:'duration'}},stacking:{max_stacks:1},modifiers,...extras};}
 function fixture(buffs,blackboard={duration:8}){
  const o=makeMode({cid:'char_290_vigna',index:0,level:7});
  ArkSkillModeData.programs[source]={controller,buffs,source:{}};
  ArkSkillModeData.profiles[source]={prefabId:source,charIds:[o.charId],blackboardKeys:Object.keys(blackboard)};
  o.skill={sourceId:source,name:'Source consumer fixture',duration:-1,blackboard,spCost:10,effects:[]};
  assert.equal(ArkClientPrograms.configure(o.skill,o.charId),true);o.sp=10;assert.equal(castSkill(o),true);return o;
 }
 const block=()=>definition('block-once',[],{damage_block_once:{kind:'all-damage-once',sourceEvent:10,finishOwnBuff:true}});
 let o=fixture([definition('defense',[{attribute:'def',formula:'multiplier',value:{constant:1}}]),block()]);
 assert.equal(o.skillState.until,8,'finite Buff blackboard wins over root duration -1');
 assert.equal(operatorDefense(o),400);
 const state=o.clientProgramState.buffs[1];assert.equal(state.damageBlockOnce.remaining,1);
 assert.equal(inflictDamage(o,0,false,'phys'),0);assert.equal(state.damageBlockOnce.remaining,1);
 o.commandShield=1;assert.equal(inflictDamage(o,100,false,'phys'),0);
 assert.equal(state.damageBlockOnce.remaining,1,'earlier independent shield prevents this damage event');
 assert.equal(inflictDamage(o,100,false,'phys'),0);assert.equal(state.damageBlockOnce.remaining,0);
 assert.equal(operatorDefense(o),400,'consuming one shield cannot end sibling DEF Buff');
 assert.ok(o.skillState);assert.equal(inflictDamage(o,100,false,'phys'),100);assert.equal(o.hp,9900);
 B.time=8;endOperatorSkill(o);assert.equal(operatorDefense(o),200);assert.equal(o.clientProgramState,undefined);
 o=fixture([block()]);const saved=JSON.parse(JSON.stringify(o));
 inflictDamage(o,300,false,'arts');B.operators=[JSON.parse(JSON.stringify(saved))];o=B.operators[0];
 assert.equal(inflictDamage(o,300,false,'arts'),0,'restored unspent shield blocks once');
 assert.equal(inflictDamage(o,300,false,'arts'),300,'restored shield does not refresh after being consumed');
 o=fixture([definition('penetration',[
  {attribute:'def_penetrate',formula:'addition',value:{constant:.5}},
  {attribute:'def_penetrate_fixed',formula:'addition',value:{constant:100}}])]);
 const e=modeEnemy(o,100,{def:500,magicRes:25});
 assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys'}).amount,850);
 o.combatTalents=[{blackboard:[{key:'def_penetrate_fixed',value:50}]}];
 assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys'}).amount,900,'skill and existing talent fixed penetration both apply');
 assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys',defScale:.8}).amount,950);
 assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'arts'}).amount,750,'physical penetration cannot alter arts resistance');
 assert.equal(e.def,500,'penetration never rewrites target DEF');
 B.time=8;assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys'}).amount,550,'expired source contribution is absent before cleanup');
 endOperatorSkill(o);assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys'}).amount,550);
 // Derived self status and received aura must share exactly one override pass.
 const stacking={maxStacks:1,independentSource:false,disableOverride:false,overrideKey:'status-resistance-consumer',priority:-1,priorityKeys:['resist']};
 o=fixture([definition('parent',[],{derived_buffs:[{id:'derived-status',scope:'self',lifetime:{kind:'until_parent_finish'},sourceLifetime:'until_detach',sourceEvent:0,
  stacking,modifiers:[{attribute:'one_minus_status_resistance',formula:'final_scaler',value:{key:'resist'}}]}]})],{duration:8,resist:-.3});
 o.statusResistance=.2;
 const aura={kind:'maintained-aura',range:{kind:'global'},selection:{side:'ally',motionMask:3,categoryMask:1,professionMask:0,selfOption:0,respectTargetFree:true},
  membership:{removeOnLeave:true,removeOnDetach:true,reevaluateWhileActive:true,sourceScoped:true,onlyAddOnce:false},
  buffs:[{id:'aura-status',scope:'target',lifetime:{kind:'until_detach'},effects:[],mode:null,stacking,
   modifiers:[{attribute:'one_minus_status_resistance',formula:'final_scaler',value:{key:'resist'}}]}]};
 const aid='status-aura-consumer-fixture',a=modeAlly(o,2,{clientProgramState:undefined});
 ArkSkillModeData.programs[aid]={controller,buffs:[definition('aura-owner')],auras:[aura],source:{}};
 ArkSkillModeData.profiles[aid]={prefabId:aid,charIds:[a.charId],blackboardKeys:['duration','resist']};
 a.skill={sourceId:aid,duration:8,blackboard:{duration:8,resist:-.5},spCost:10,effects:[]};a.skillState=null;a.sp=10;
 ArkClientPrograms.configure(a.skill,a.charId);assert.equal(castSkill(a),true);
 modeNear(ArkSkillAuras.statusResistance(o),.6,'stronger aura selected once with base resistance');
 endOperatorSkill(a);modeNear(ArkSkillAuras.statusResistance(o),.44,'derived self contribution survives unrelated aura detach');
 endOperatorSkill(o);modeNear(ArkSkillAuras.statusResistance(o),.2,'parent detach removes only derived contribution');
 `);
 console.log('SELF BUFF CONSUMERS OK: finite parent, independent shield consumption/restore, physical penetration and one shared aura/self override');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
