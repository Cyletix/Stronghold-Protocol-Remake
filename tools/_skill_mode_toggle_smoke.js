'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const ids=['skchr_f12yin_2','skchr_svrash_2'];
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((lv,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost})):[]));
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,toggleCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 const rows=[];
 for(const c of toggleCases){
  const o=makeMode(c),block=operatorBlockCount(o),cells=JSON.stringify(o.cells);
  assert.ok(o.skill.skillMode);assert.ok(o.skill.clientProgram);assert.equal(ArkSkillToggle.active(o),false);
  o.sp=c.sp-.1;assert.equal(castSkill(o),false);assert.equal(o.skillState,undefined);
  o.sp=c.sp;o.hp=1000;assert.equal(castSkill(o),true,'toggle permits no enemy');assert.equal(o.sp,0);assert.equal(ArkSkillToggle.active(o),true);
  assert.equal(o.skillState.sourceMode.modeIndex,1);assert.ok(o.skillState.until>1e12);assert.equal(castSkill(o),false,'turning off requires same SP');
  const atk=150+100*(c.bb.atk||0),def=c.id==='skchr_f12yin_2'?200*(1+c.bb.def):200+200*c.bb.def;
  modeNear(operatorAttackPower(o,buffMul(o).atk),atk);modeNear(operatorDefense(o),def);assert.equal(operatorBlockCount(o),block+(c.bb.block_cnt||0));
  const outside=modeEnemy(o,190,{x:o.col+5,y:o.row});for(let i=0;i<5;i++)modeEnemy(o,100+i);
  assert.equal(useMode(o),true);settleMode();const damaged=B.enemies.filter(e=>e.hp<e.maxHp),limit=c.id==='skchr_f12yin_2'?block+c.bb.block_cnt:1;
  assert.equal(damaged.length,limit);for(const e of damaged)assert.equal(e.maxHp-e.hp,Math.round(Math.max(atk-30,atk*.05)));
  assert.equal(outside.hp,outside.maxHp);B.enemies=[];const air=modeEnemy(o,199,{flying:true});assert.equal(useMode(o),false);assert.equal(air.hp,air.maxHp);
  B.enemies=[];o.cd=999;update(.5,.5);modeNear(o.hp,1000+10000*c.bb.hp_recovery_per_sec_by_max_hp_ratio*.5,'source max-HP recovery');modeNear(o.sp,.5,'stance recharges after instantaneous cast');
  o.stunUntil=10;o.sp=c.sp;assert.equal(castSkill(o),false);assert.equal(o.sp,c.sp);o.stunUntil=0;
  assert.equal(castSkill(o),true);assert.equal(o.sp,0);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(ArkSkillToggle.active(o),false);
  assert.equal(operatorBlockCount(o),block);modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(operatorDefense(o),200);assert.equal(JSON.stringify(o.cells),cells);
  const hp=o.hp;update(.5,.5);assert.equal(o.hp,hp,'off stance has no residual regeneration');modeNear(o.sp,.5);
  o.sp=c.sp;assert.equal(castSkill(o),true);endOperatorSkill(o,'round-end');assert.equal(ArkSkillToggle.active(o),false);assert.equal(o.clientProgramState,undefined);
  o.sp=c.sp;castSkill(o);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(ArkSkillModes.active(o),null);
  rows.push({skillId:c.id,level:c.level,spCost:c.sp,modeIndex:1,offModeIndex:0});
 }
 for(const c of toggleCases.filter(c=>c.level===7)){
  const o=makeMode(c);o.hp=1000;o.cd=999;update(.1,.1);assert.equal(ArkSkillToggle.active(o),true,'natural dispatcher activates stance');
  o.sp=c.sp;update(.1,.1);assert.equal(ArkSkillToggle.active(o),true,'auto battle keeps active stance after SP fills');assert.equal(o.sp,c.sp);
  assert.equal(castSkill(o),true);assert.equal(o.sp,0);update(.1,.1);assert.equal(ArkSkillToggle.active(o),false,'no instant reopening before recharged');
 }
 // Both native ToggleSkill.DoCast directions emit the same skill trigger.
 // Exercise its existing real equipment consumer, including failed-off RNG.
 for(const c of toggleCases.filter(c=>c.level===7)){
  G.seasonId='act2autochess';const o=makeMode(c);o.equip=[{id:'yan_dagger',mods:{}}];
  assert.equal(castSkill(o),true);assert.equal(o.equipSkillStacks.count,1);
  const before=JSON.stringify(ArkSim.snapshot());assert.equal(castSkill(o),false);assert.equal(JSON.stringify(ArkSim.snapshot()),before);assert.equal(o.equipSkillStacks.count,1);
  o.sp=c.sp;assert.equal(castSkill(o),true);assert.equal(o.equipSkillStacks.count,2,'paid off transition notifies actual equipment once');
  modeNear(operatorAttackPower(o,buffMul(o).atk),160,'off mode retains its two real equipment increments');
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{${helper}const rows=[];for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of toggleCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){G.skillChoices[c.cid]=c.index;
   const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4;
   assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(sourceSkills[c.id].levels[level-1].blackboard.map(b=>[b.key,b.value])));
   const o=makeMode(c);o.skill=r.skill;o.sp=r.skill.spCost;o.hp=1000;assert.equal(castSkill(o),true);modeEnemy(o);assert.equal(useMode(o),true);settleMode();
   o.sp=r.skill.spCost;assert.equal(castSkill(o),true);assert.equal(o.skillState,null);
   rows.push({seasonId:season,skillId:c.id,elite,level});}
 }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:32116,name:'切换技能'}),hostRestores=[];
 try{runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const c of cases.filter(c=>c.level===7))for(const phase of ['active','off','dead']){
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(c)});o.playerId='one';o.hp=1000;castSkill(o);o.cd=999;`);
   runtime.advance(.3);
   if(phase==='off')runtime.__testMachine.run('o.sp=o.skill.spCost;castSkill(o);');
   if(phase==='dead')runtime.__testMachine.run('o.hp=0;tryKill(o);');
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,c.id+' '+phase+' complete battle replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:c.id,phase});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-toggle-receipts.json',JSON.stringify({scope:'Complete two-state source toggle bodies with attached attributes, source mode attack and same SP cost in both directions. Auto combat keeps active stance; active recharge is explicit simulation bridge, not decoded BasicSkill.OnTick.',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL TOGGLE OK '+receipts.length+' levels; '+seasonReceipts.length+' season variants; '+hostRestores.length+' host restores; mode attack, regeneration, paid transitions, SP recovery and detach');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
