'use strict';
// Contract tests exercise the declared lifecycle mapping, not native frame proof.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const clone=value=>JSON.parse(JSON.stringify(value));
const contract=JSON.parse(fs.readFileSync(path.join(ROOT,'work/skill-mode-end-effects-contract.json'),'utf8'));
function setup(sid='skchr_liskam_2'){
 const p={endEffects:clone(contract.accepted[sid].endEffects)};
 const skills=JSON.parse(fs.readFileSync(path.join(ROOT,'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'),'utf8'));
 const level=skills[sid].levels.at(-1);
 const unit={id:'owner',hp:1000,col:2,row:3,deployed:true,deployAt:0,skill:{sourceId:sid,duration:level.duration,
  clientProgram:{prefabId:sid},blackboard:Object.fromEntries(level.blackboard.map(x=>[x.key,x.value]))},
  skillState:{until:30},clientProgramState:{active:true}};
 const c=vm.createContext({console,B:{time:0,operators:[unit],summoneds:[]},ArkSkillModeData:{programs:{[sid]:p}}});c.window=c;
 const runtime='web/src/simulation/skill-end-effects.js';
 vm.runInContext(fs.readFileSync(path.join(ROOT,runtime),'utf8'),c,{filename:runtime,displayErrors:false});
 const api=c.ArkSkillEndEffects;
 const complete=(time=30,reason='expire')=>{delete unit.skillState;delete unit.clientProgramState;return api.finish(unit,time,reason);};
 return {c,unit,p,api,complete};
}
test('real three bodies arm once, freeze durations and apply after active-mode cleanup',()=>{
 for(const [sid,key,duration] of [['skchr_aurora_1','stun',5],['skchr_fmout_2','fmout_s_2[after]',10],['skchr_liskam_2','stun',5]]){
  const {unit,p,api,complete}=setup(sid);unit.stunUntil=31;
  assert.equal(api.finish(unit,0),0);assert.equal(api.start(unit,0),true);assert.equal(api.stunned(unit,1),false);
  assert.throws(()=>api.finish(unit,30,'expire'),/active-mode cleanup/);assert.ok(unit.skillEndEffectState);
  unit.skill.blackboard[key]=999;p.endEffects[0].buffs[0].duration={constant:999};
  assert.equal(complete(),1);assert.equal(unit.stunUntil,31,'owned status never overwrites the shared timer');
  assert.equal(api.hasBuff(unit,key,30),true);assert.equal(api.hasBuff(unit,'another-key',30),false);
  assert.equal(unit.sourceSkillEndStatuses[0].until,30+duration);
  assert.equal(api.finish(unit,31,'expire'),0);assert.equal(unit.sourceSkillEndStatuses[0].until,30+duration);
  assert.equal(api.stunned(unit,30+duration),false);
 }
});
test('live manual/end/interruption mapping is explicit; cancellation and detached owners do not emit',()=>{
 for(const reason of ['end','manual','interrupt']){
  const {api,unit,complete}=setup();api.start(unit,0);assert.equal(complete(2,reason),1);assert.equal(api.stunned(unit,2),true);
 }
 for(const reason of ['death','retreat','removed','redeploy','cancel','switch','unknown']){
  const {api,unit,complete}=setup();api.start(unit,0);assert.equal(complete(2,reason),0);assert.equal(api.stunned(unit,2),false);
  assert.equal(unit.skillEndEffectState,undefined);
 }
 for(const change of [(x)=>{x.unit.dead=true;},(x)=>{x.unit.hp=0;},(x)=>{x.unit.removed=true;},
   (x)=>{x.c.B.operators=[];},(x)=>{x.unit.deployed=false;}]){
  const x=setup();x.api.start(x.unit,0);change(x);assert.equal(x.complete(),0);assert.equal(x.unit.skillEndEffectState,undefined);
 }
});
test('dispel clears statuses without cancelling a pending cast; death/reset clears both',()=>{
 const {unit,api,complete}=setup();api.start(unit,0);
 unit.sourceSkillEndStatuses=[{kind:'stun',key:'old',ownerId:unit.id,until:10}];unit.stunUntil=11;
 api.clear(unit);assert.equal(api.hasBuff(unit,'old',1),false);assert.ok(unit.skillEndEffectState);assert.equal(unit.stunUntil,11);
 complete();assert.equal(api.stunned(unit,31),true);api.clear(unit);assert.equal(api.stunned(unit,31),false);
 unit.skillState={until:50};unit.clientProgramState={};api.start(unit,40);api.clear(unit,{cancelPending:true});
 assert.equal(unit.skillEndEffectState,undefined);assert.equal(complete(50),0);
});
test('current external resistance and immunity apply after self layers are gone',()=>{
 const {unit,c,api,complete}=setup('skchr_aurora_1');unit.statusResistance=.9;api.start(unit,0);
 c.ArkSkillAuras={statusResistance:(owner,time)=>{assert.equal(owner,unit);assert.equal(owner.clientProgramState,undefined);assert.equal(time,30);return .5;}};
 complete();assert.equal(unit.sourceSkillEndStatuses[0].until,32.5);
 for(const source of ['stunImmune','sourceAttributes','resistance']){
  const x=setup();x.api.start(x.unit,0);
  if(source==='sourceAttributes')x.unit.sourceAttributes={stunImmune:true};
  else if(source==='resistance')x.unit.statusResistance=1;else x.unit.stunImmune=true;
  assert.equal(x.complete(),0);assert.equal(x.unit.skillEndEffectState,undefined);
 }
});
test('owned expiry and declared max-expiry refresh retain independent legacy and other-key clocks',()=>{
 const {unit,api,complete}=setup();unit.sourceSkillEndStatuses=[
  {kind:'stun',key:'stun',ownerId:unit.id,until:70},
  {kind:'stun',key:'other',ownerId:unit.id,until:80},
  {kind:'stun',key:'stale',ownerId:unit.id,until:5}];
 api.start(unit,0);complete();assert.equal(unit.sourceSkillEndStatuses.length,2);
 assert.equal(unit.sourceSkillEndStatuses.find(x=>x.key==='stun').until,70);
 assert.equal(api.hasBuff(unit,'stun',70),false);assert.equal(api.stunned(unit,70),true);assert.equal(api.stunned(unit,80),false);
});
test('plain JSON restore before finish and during stun preserves one-shot completion and ownership',()=>{
 const first=setup();first.api.start(first.unit,0);
 const before=clone(first.unit);const restore=setup();Object.assign(restore.unit,before);restore.complete();
 const after=clone(restore.unit);const finished=setup();for(const k of Object.keys(finished.unit))delete finished.unit[k];Object.assign(finished.unit,after);
 assert.equal(finished.api.stunned(finished.unit,34),true);assert.equal(finished.api.finish(finished.unit,34),0);
 assert.equal(finished.api.stunned(finished.unit,35),false);
 const wrong=setup();wrong.api.start(wrong.unit,0);wrong.unit.skillEndEffectState.ownerId='another';
 assert.equal(wrong.complete(),0);assert.equal(wrong.api.stunned(wrong.unit,30),false);
});
test('invalid lifecycle and duration values cannot arm a partially supported program',()=>{
 for(const change of [p=>p.endEffects[0].onlyCheckOnStopAffect=true,p=>p.endEffects[0].armEvent=3,
  p=>p.endEffects[0].buffs[0].target='enemy',p=>p.endEffects[0].buffs[0].duration={constant:0}]){
  const x=setup();change(x.p);assert.throws(()=>x.api.start(x.unit,0));assert.equal(x.unit.skillEndEffectState,undefined);
 }
 const x=setup();x.api.start(x.unit,0);assert.throws(()=>x.api.start(x.unit,1),/cast activation/);
 const y=setup();delete y.p.endEffects;assert.equal(y.api.start(y.unit,0),false);
});
