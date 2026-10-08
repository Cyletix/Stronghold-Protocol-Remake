'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};
  const selection={side:'ally',motionMask:3,categoryMask:1,professionMask:0,selfOption:0,respectTargetFree:true};
  const stacking={maxStacks:1,independentSource:false,disableOverride:false,overrideKey:'shared-source-priority',priority:-1,priorityKeys:['amount']};
  const aura={kind:'maintained-aura',range:{kind:'operator-range'},selection,
   membership:{removeOnLeave:true,removeOnDetach:true,reevaluateWhileActive:true,sourceScoped:true,onlyAddOnce:false},
   buffs:[{id:'same-source-kind',scope:'target',lifetime:{kind:'until_detach'},effects:[],mode:null,stacking,
    modifiers:[{attribute:'atk',formula:'multiplier',value:{key:'amount'}}]}]};
  const program={controller:{kind:'cast_skill_active_buffs',activation:'cast',pre_delay:0,duration_policy:'max_buff_duration',wait_for_casting:false,wait_for_attack_event:false},
   buffs:[{id:'owner-lifetime',scope:'self',lifetime:{kind:'timed',duration:{constant:10}},stacking:{max_stacks:1},modifiers:[]}],auras:[aura],source:{}};
  ArkSkillModeData.programs.aura_fixture=program;
  ArkSkillModeData.profiles.aura_fixture={prefabId:'aura_fixture',charIds:['char_290_vigna'],blackboardKeys:['amount']};
  const entry=ROSTER.char_290_vigna,base=finalizeOperator(entry,null,[],false);
  startBattle([{...base,id:1,charId:entry.id,row:3,col:3,dir:'right'}],[],100);
  B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];B.time=0;
  const original=B.operators[0];
  function unit(id,col,profession='CASTER'){
   return {...original,id,charId:'char_290_vigna',profession,col,row:3,hp:1000,maxHp:1000,atk:100,def:0,
    attributeBase:{atk:100,def:0,aspd:1},deployAt:0,deployT:2,deployed:true,cd:999,buffs:[],skill:null,skillState:null,clientProgramState:null,
    cells:[[3,3],[3,4],[3,5]],rangeGrids:[{row:0,col:0},{row:0,col:1},{row:0,col:2}]};
  }
  function activate(o,amount){
   o.skill={sourceId:'aura_fixture',name:'Aura source contract fixture',spCost:10,duration:10,blackboard:{amount},effects:[]};
   ArkClientPrograms.configure(o.skill,o.charId);o.sp=10;assert.equal(castSkill(o),true);
  }
  let a=unit(1,3),b=unit(2,3),t=unit(3,4);B.operators=[a,b,t];activate(a,.2);activate(b,.5);
  assert.equal(t.sourceAuraBuffs.length,2,'both owners remain represented despite one effective override');
  assert.equal(buffMul(t).atk,1.5,'non-casting receiver consumes Aura attribute layers');
  ArkSkillAuras.update();assert.equal(t.sourceAuraBuffs.length,2,'membership update is idempotent');
  endOperatorSkill(b);assert.equal(buffMul(t).atk,1.2,'removing stronger owner reveals surviving source');
  t.col=8;assert.equal(buffMul(t).atk,1,'range exit stops affecting getters immediately');ArkSkillAuras.update();
  assert.equal(t.sourceAuraBuffs?.length||0,0);
  t.col=4;ArkSkillAuras.update();assert.equal(buffMul(t).atk,1.2,'reentry receives one owned Buff');
  t.untargetable=true;ArkSkillAuras.update();assert.equal(buffMul(t).atk,1);delete t.untargetable;
  ArkSkillAuras.update();assert.equal(buffMul(t).atk,1.2);
  const snapshot=JSON.parse(JSON.stringify(B.operators));B.operators=JSON.parse(JSON.stringify(snapshot));
  [a,b,t]=B.operators;ArkSkillAuras.update();assert.equal(buffMul(t).atk,1.2,'serialized source and target identities rejoin without duplicated Buffs');
  a.hp=0;tryKill(a);assert.equal(buffMul(t).atk,1,'actual death removes only the dead source');
  aura.range.kind='global';aura.selection.professionMask=32;aura.membership.removeOnLeave=false;
  a=unit(1,3);t=unit(3,99);const guard=unit(4,4,'TANK');B.operators=[a,t,guard];activate(a,.4);
  assert.equal(buffMul(t).atk,1.4);assert.equal(buffMul(guard).atk,1,'global aura retains profession filter and has no distance cutoff');
  t.untargetable=true;ArkSkillAuras.update();assert.equal(buffMul(t).atk,1,'global no-range removal flag does not bypass target qualification');delete t.untargetable;
  endOperatorSkill(a);aura.range.kind='operator-range';aura.selection.professionMask=0;aura.membership.removeOnLeave=true;
  aura.buffs[0].modifiers=[{attribute:'one_minus_status_resistance',formula:'final_scaler',value:{key:'amount'}}];
  a=unit(1,3);b=unit(2,3);t=unit(3,4);t.statusResistance=.2;B.operators=[a,b,t];activate(a,-.3);activate(b,-.5);
  assert.ok(Math.abs(ArkSkillAuras.statusResistance(t)-.6)<1e-9,'base duration and effective source final factor combine once');
  t.attributeBase.atk=0;t.attributeBase.def=0;t.def=100;
  assert.equal(buffMul(t).atk,1,'status-only aura preserves ATK added onto a zero source base');
  assert.equal(buffMul(t).def,1,'status-only aura preserves DEF added onto a zero source base');
  endOperatorSkill(b);assert.ok(Math.abs(ArkSkillAuras.statusResistance(t)-.44)<1e-9,'priority handoff preserves weaker source');
  assert.equal(ArkSkillAuras.attribute(t,'def',0,100),100,'zero source base preserves other existing flat effects');
  B.time=10;update(0,0);assert.equal(ArkSkillAuras.statusResistance(t),.2,'natural expiry clears target state without raw-field mutation');
  assert.equal(t.statusResistance,.2);
 })()`);
 console.log('SKILL AURA MEMBERSHIP OK range/global/profession, exact provenance, priority handoff, no duplicates, death/expiry/reentry, zero-base preservation and serialized membership');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
