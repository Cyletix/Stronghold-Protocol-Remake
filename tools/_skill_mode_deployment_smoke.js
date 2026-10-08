'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].activation==='deploy');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const deploymentHelper=`
function makeDeployment(c){
 const o=makeMode(c);assert.equal(o.skill.sourceId,c.id);
 // Reserved-operator training caps can be lower than all source levels. The
 // source matrix binds those remaining vectors explicitly; the separate actual
 // season matrix checks available ordinary/elite selection without overrides.
 const source=ArkSkillLevels.get(c.id,c.level);assert.ok(source);
 Object.assign(o.skill,{blackboard:{...source.blackboard},duration:source.duration,spCost:source.spCost,isPassive:source.isPassive});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);
 Object.assign(o,{deployed:false,deployT:0,_garrisonStarted:false,cd:999,sp:0});delete o.sourceDeploymentStarted;
 return o;
}
function deployThroughEngine(o){
 const p=ArkSkillModeData.profiles[o.skill.sourceId],controller=ArkSkillModeData.programs[p.prefabId].controller;
 update(.1,.1);
 if(controller.cast_on_locate){assert.ok(o.skillState==null,'locate controller waits for locate');update(1,1);}
 assert.ok(o.sourceDeploymentStarted);assert.ok(o.skillState);return B.time;
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,deploymentCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 ${helper}${deploymentHelper}
 const rows=[],savedStarted=ArkEquipSkillStacks.onSkillStarted;let activeStartEvents=0;
 ArkEquipSkillStacks.onSkillStarted=()=>activeStartEvents++;
 try{for(const c of deploymentCases){
  const o=makeDeployment(c),p=ArkSkillModeData.profiles[c.id],duration=c.bb.duration??c.duration;
  assert.ok(o.skill.isPassive);assert.equal(o.skill.spCost,0);assert.deepEqual(o.skill.effects,[]);assert.equal(o.skill.combatMechanic,undefined);
  if(c.id==='skchr_utage_2')o.medicBarrier={amount:777,until:999};
  const started=deployThroughEngine(o),atk=c.bb.atk??c.bb['waaifu_s_1[self].atk']??0;
  modeNear(o.skillState.until,started+duration,'finite BB/level duration');assert.equal(o.sp,0);
  const state=o.clientProgramState,hp=o.hp;
  assert.equal(ArkSkillModes.deployed(o,false),false);assert.equal(ArkSkillModes.deployed(o,true),false);
  assert.equal(o.clientProgramState,state);assert.equal(o.hp,hp,'duplicate deployment does not replay self loss');
  assert.equal(castSkill(o),false,'passive controller cannot be actively cast');
  modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*atk,'source prefixed or ordinary ATK');
  modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2/(1+(c.bb.attack_speed||0)/100),'source attack speed');
  if(c.id==='skchr_gravel_1'){
   modeNear(operatorDefense(o),200*(1+c.bb.def));B.time=started+2.25;update(0,0);
   modeNear(operatorDefense(o),200*(1+c.bb.def*(1-2/duration)),'DEF samples source one-second periods');
  }else if(c.id==='skchr_gravel_2'){
   const initial=10000*c.bb.hp_ratio;modeNear(ArkClientPrograms.shieldInfo(o,B.time).amount,initial*(1-1/duration));
   assert.equal(inflictDamage(o,300),0);assert.equal(o.hp,10000);
   B.time=started+2.25;update(0,0);
   modeNear(ArkClientPrograms.shieldInfo(o,B.time).amount,initial*(1-3/duration)-300,'capacity deducts hit and initial-capacity decay independently');
  }else{
   modeNear(operatorDefense(o),200*(1+(c.bb.def||0)));
   if(c.id==='skchr_utage_2'){assert.equal(o.hp,5000);assert.equal(o.medicBarrier.amount,777);assert.equal(ArkClientPrograms.respawnTime(o,20),20);}
  }
  if(p.action==='attack'){
   const e=modeEnemy(o),effect=ArkSkillModes.active(o).plan.replacementHitBuffs?.[0],savedHit=hitEnemy;let before=null;
   if(effect)hitEnemy=function(owner,target,...rest){before=ArkOperatorCombat.sourceBuffActive(target,effect.key);return savedHit(owner,target,...rest);};
   try{assert.equal(useMode(o),true);settleMode();}finally{hitEnemy=savedHit;}
   const power=100*(1.5+atk),damage=p.plan.damageType==='arts'?Math.round(power*.75):Math.round(Math.max(power-30,power*.05));
   assert.equal(e.maxHp-e.hp,damage,c.id+' source mode damage');
   if(effect){assert.equal(before,false,'source after-body hit state');modeNear(ArkOperatorCombat.attackMultiplier(e),1+c.bb['attack@waaifu_s_1[debuff].atk']);
    modeNear(e.operatorAttackMultipliers[effect.key].until,B.time+c.bb['attack@waaifu_s_1[debuff].duration']);}
  }else assert.equal(ArkSkillModes.action(o),undefined,'pure Buff delegates base action');
  B.enemies=[];B.projectiles=[];o.cd=999;B.time=started+duration;update(0,0);
  assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(operatorAction(o),'attack');
  modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(operatorDefense(o),200);
  assert.equal(ArkSkillModes.deployed(o,true),false,'expiry cannot retrigger same deployment');
  update(.1,.1);assert.equal(o.skillState,null);assert.equal(o.sp,0);
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }}finally{ArkEquipSkillStacks.onSkillStarted=savedStarted;}
 assert.equal(activeStartEvents,0,'deploy controller never emits active cast-start hook');
 // Engine death/respawn clears the per-life guard, then runs the appropriate
 // deployment phase again. HP cost occurs once on the next life as well.
 for(const id of ['skchr_utage_2','skchr_gravel_2']){
  const c=deploymentCases.find(c=>c.id===id&&c.level===7),o=makeDeployment(c);deployThroughEngine(o);
  o.hp=0;tryKill(o);assert.equal(o.clientProgramState,undefined);assert.ok(o.dead);
  o.respawnAt=B.time;window.onRespawn=()=>true;respawnOperators();assert.equal(o.sourceDeploymentStarted,undefined);assert.equal(o.skillState,null);
  deployThroughEngine(o);assert.ok(o.clientProgramState);if(id==='skchr_utage_2')assert.equal(o.hp,5000);
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of deploymentCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,0);assert.ok(r.skill.isPassive);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:2031,name:'部署公共模式'});
 const hostIds=['skchr_gravel_1','skchr_gravel_2','skchr_utage_2','skchr_waaifu_1'];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+deploymentHelper);
  for(const id of hostIds){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeDeployment(${JSON.stringify(c)});o.playerId='one';deployThroughEngine(o);${id==='skchr_waaifu_1'?'modeEnemy(o,500);useMode(o);settleMode();':''}o.cd=999;`);
   const checkpoint=runtime.snapshot();runtime.advance(2.3);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(2.3);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' source deployment state/periodic/target status replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-deployment-receipts.json',JSON.stringify({scope:'Seven newly bound deployment bodies plus three generic provider migrations; all source vectors, available season bindings and documented phase convention',receipts,seasonReceipts,hostRestores:hostIds},null,2));
 console.log('SKILL MODE DEPLOYMENT OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostIds.length+' host restores; engine phase/idempotency, finite expiry/respawn, native shield decay, self cost and prefixed after-body debuff');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
