'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/src/simulation/client-programs.js'),'utf8'),ctx);
const api=ctx.ArkClientPrograms;
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);}
const modifier=(attribute,value,formula='addition')=>({attribute,formula,value:{constant:value}});
const buff=(id,seconds,modifiers,flags)=>({id,scope:'self',lifetime:seconds===null?{kind:'until_detach'}:{kind:'timed',duration:{constant:seconds}},stacking:{max_stacks:1},modifiers,...(flags?{flags}:{})});
function unit(buffs,duration=3){
 const program={controller:{kind:'cast_skill_active_buffs',activation:'cast',pre_delay:0,duration_policy:'max_buff_duration',wait_for_casting:false,wait_for_attack_event:true},buffs,source:{}};
 ctx.ArkClientProgramData={programs:{fixture:program},profiles:{fixture:{prefabId:'fixture',charIds:['owner'],blackboardKeys:[]}}};delete ctx.ArkSkillModeData;
 const o={id:1,hp:100,maxHp:1000,attributeBase:{maxHp:1000},skill:{sourceId:'fixture',spCost:10,duration,blackboard:{}},skillState:{until:100}};
 assert.equal(api.configure(o.skill,'owner'),true);api.start(o,0);return o;
}
const heal=(_,target,amount)=>{target.hp=Math.min(target.maxHp,target.hp+amount);};
let o=unit([buff('mixed',1,[modifier('hp_recovery_per_sec',20),modifier('hp_recovery_per_sec_by_max_hp_ratio',.1)])]);
api.advance(o,.5,.5,heal);near(o.hp,160,'flat plus ratio');api.advance(o,.5,.5,heal);near(o.hp,160,'cursor replay');
api.advance(o,1.2,.7,heal);near(o.hp,220,'final partial interval');api.tick(o,1.2);api.advance(o,2,.8,heal);near(o.hp,220,'expired');
o=unit([buff('ratio',1,[modifier('hp_recovery_per_sec',-50),modifier('hp_recovery_per_sec_by_max_hp_ratio',.1)])]);
api.advance(o,.5,.5,heal);near(o.hp,150,'negative flat does not offset ratio');
o=unit([buff('flat',1,[modifier('hp_recovery_per_sec',20),modifier('hp_recovery_per_sec_by_max_hp_ratio',-.1)])]);
api.advance(o,.5,.5,heal);near(o.hp,110,'negative ratio does not offset flat');
o=unit([buff('hp',.5,[modifier('max_hp',1,'multiplier')]),buff('ratio',2,[modifier('hp_recovery_per_sec_by_max_hp_ratio',.1)])]);
near(o.maxHp,2000,'HP Buff applied');api.advance(o,1,1,heal);near(o.maxHp,1000,'HP Buff expires within segment');near(o.hp,200,'HP ratio and regeneration at each cut');
o=unit([buff('ratio',2,[modifier('hp_recovery_per_sec_by_max_hp_ratio',.1)])]);o.maxHp=1500;api.advance(o,.5,.5,heal);near(o.hp,175,'current max HP');
o.dead=true;api.advance(o,1,.5,heal);near(o.hp,175,'death blocks regeneration');o.dead=false;o.hp=0;api.advance(o,1.5,.5,heal);near(o.hp,0,'zero HP blocks regeneration');
o=unit([buff('infinite',null,[modifier('atk',1,'multiplier')],['no_direct_heal'])],-1);
assert.equal(api.duration(o),Number.MAX_SAFE_INTEGER);api.tick(o,1e6);near(api.layers(o,'atk',1e6).multiplier,1,'infinite until detached');assert.equal(api.noDirectHeal(o,1e6),true);
const restored=JSON.parse(JSON.stringify(o));assert.equal(api.noDirectHeal(restored,1e6),true);restored.id=2;assert.equal(api.noDirectHeal(restored,1e6),false,'wrong owner cannot inherit Buff');
api.stop(o);assert.equal(o.clientProgramState,undefined);assert.equal(api.noDirectHeal(o,1e6),false);api.start(o,1e6);assert.equal(api.noDirectHeal(o,1e6),true,'fresh activation');
const invalid=unit([buff('flag',1,[modifier('atk',.2,'multiplier')])]);ctx.ArkClientProgramData.programs.fixture.buffs[0].flags=['unknown'];assert.throws(()=>api.configure(invalid.skill,'owner'),/flag/);
// The separate mode provider must win without overwriting ordinary programs.
ctx.ArkSkillModeData={profiles:{fixture:{prefabId:'mode',charIds:['owner'],blackboardKeys:[]}},programs:{mode:{...ctx.ArkClientProgramData.programs.fixture,buffs:[buff('mode',1,[modifier('hp_recovery_per_sec_by_max_hp_ratio',.05)])]}}};
assert.equal(api.configure(invalid.skill,'owner'),true);assert.equal(invalid.skill.clientProgram.prefabId,'mode');
async function main(){
 const f=require('./_browser_fixture')();f.ctx.assert=assert;
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};
 function make(level){
  const charId='char_127_estell';G.skillChoices[charId]=1;ACCOUNT.ops[charId]={evolve:2,level:1,skillLevel:level,potential:1,selectedSkill:1,trust:0};
  const r=finalizeOperator(debugTacticalEntry(charId)||ROSTER[charId],null,[],false);
  startBattle([{...r,id:1,charId,row:3,col:3,dir:'up',hp:400,maxHp:1000,atk:100,def:0,
   attributeBase:{...r.attributeBase,atk:100,maxHp:1000},combatTalents:[],events:[],garrisonStats:null,garrisonAdd:null}],[],100);
  B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
  const o=B.operators[0];o.cd=999;o.deployAt=0;o.deployT=2;o.hp=400;o.maxHp=1000;o.sp=o.skill.spCost;
  assert.equal(o.skill.sourceId,'skchr_estell_2');assert.ok(o.skill.clientProgram);assert.equal(castSkill(o),true);return o;
 }
 for(let level=1;level<=10;level++){
  const o=make(level),before=o.hp;assert.equal(ArkClientPrograms.noDirectHeal(o,B.time),true);
  assert.equal(directHealAllowed(o,o),false,'dynamic source flag has no static-trait self exception');
  assert.equal(healOperator(o,o,100),0);assert.equal(o.hp,before);
  healOperator(o,o,10,{regen:true});assert.equal(o.hp,before+10,'regeneration is a separate path');
  assert.equal(operatorBlockCount(o),o.blockCnt+o.skill.blackboard.block_cnt);
  B.time=o.skillState.until-.01;update(.02,.01);assert.equal(o.clientProgramState,undefined);assert.equal(directHealAllowed(o,o),true);
 }
 const o=make(10);o.hp=0;tryKill(o);assert.equal(o.clientProgramState,undefined);assert.equal(ArkClientPrograms.noDirectHeal(o,B.time),false);
 const fresh=make(10);assert.equal(ArkClientPrograms.noDirectHeal(fresh,B.time),true);endOperatorSkill(fresh);assert.equal(ArkClientPrograms.noDirectHeal(fresh,B.time),false);
 })()`);
 console.log('CLIENT PROGRAM BATCH OK ratio/flat/cursor/partial-expiry/max-HP/death, infinite detach/restore/owner/restart, mode merge and 10 source Estelle levels with real heal/regen/expiry/death');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
