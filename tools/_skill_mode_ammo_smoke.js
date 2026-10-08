'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].capability==='finite-ammo');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,ammoCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 const rows=[];
 for(const c of ammoCases){
  const o=makeMode(c),count=c.bb['attack@trigger_time'];assert.ok(o.skill.clientProgram);assert.ok(o.skill.skillMode);
  assert.equal(o.skill.sourceId,c.id);assert.equal(o.skill.ammoCount,count);assert.equal(o.skill.duration,0);assert.equal(o.skill.durationType,'AMMO');
  assert.deepEqual(o.skill.effects,[]);assert.equal(o.skill.combatMechanic,undefined);assert.equal(castSkill(o),true);
  assert.equal(o.skillState.ammo,count);assert.equal(o.skillState.until,Number.MAX_SAFE_INTEGER);assert.equal(o.sp,0);
  modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*(c.bb.atk||0));
  modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2*(1+(c.bb.base_attack_time||0)));
  assert.equal(ArkClientPrograms.targetPriority(o,B.time),c.id==='skchr_inside_2'?-1:0);
  const before=o.skillState.ammo;assert.equal(useMode(o),false);assert.equal(o.skillState.ammo,before,'no target does not expend real source ammo');
  const ground=modeEnemy(o,100,{applyWay:'MELEE'}),air=modeEnemy(o,101,{flying:true,applyWay:'MELEE'}),ranged=modeEnemy(o,102,{applyWay:'RANGED'});
  const expected=c.id==='skchr_inside_1'?air:ranged,power=100*(1.5+(c.bb.atk||0))*(c.bb['attack@atk_scale']||1),damage=Math.round(Math.max(power-30,power*.05));
  let notifications=0;const savedNotify=notifyGarrisonAmmo;
  notifyGarrisonAmmo=function(source){if(source===o)notifications++;return savedNotify(source);};
  try{for(let used=1;used<=count;used++){
   assert.equal(useMode(o),true);assert.equal(B.projectiles.length,1);assert.equal(B.projectiles[0].target.id,expected.id,'source selector composition');
   if(used<count){assert.equal(o.skillState.ammo,count-used);assert.equal(o.sp,0);}
   else{assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(o.sp,0,'last source action remains SP locked');}
   settleMode();assert.equal(expected.maxHp-expected.hp,damage*used,'source final projectile keeps source scale after ammo expiry');
  }}finally{notifyGarrisonAmmo=savedNotify;}
  assert.equal(notifications,count,'garrison consumer notified per real consumed round');
  assert.equal(ground.hp,ground.maxHp);assert.equal((c.id==='skchr_inside_1'?ranged:air).hp,1e6);
  modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(ArkOperatorCombat.attackInterval(o,null),2);
  assert.equal(ArkClientPrograms.targetPriority(o,B.time),0,'source taunt addition withdrawn');
  rows.push({charId:c.cid,skillId:c.id,level:c.level,rounds:count});
 }
 // Distinct source variants retain their original selection filters and
 // programmatic detach cleanup without a new player manual-stop control.
 {const c=ammoCases.find(c=>c.id==='skchr_inside_2'&&c.level===7),o=makeMode(c);castSkill(o);
  const air=modeEnemy(o,500,{flying:true,applyWay:'MELEE'}),ground=modeEnemy(o,501,{applyWay:'MELEE'});
  useMode(o);assert.equal(B.projectiles[0].target,air,'no ranged apply-way falls back to flying-first');settleMode();
  endOperatorSkill(o);assert.equal(o.skillState,null);assert.equal(ArkClientPrograms.targetPriority(o,B.time),0);
 }
 // The provider binding independently rejects counter-mode drift and a
 // caller relabelling a timed skill as an ammunition skill.
 {const c=ammoCases[0],o=makeMode(c),profile=ArkSkillModeData.profiles[c.id],program=ArkSkillModeData.programs[profile.prefabId];
  const original=program.controller.ammo.modeIndex;program.controller.ammo.modeIndex=original+1;
  try{assert.throws(()=>ArkSkillModes.configure(o.skill,c.cid),/finite ammo binding/);}finally{program.controller.ammo.modeIndex=original;}
  const count=o.skill.ammoCount;o.skill.ammoCount=count+.5;assert.throws(()=>ArkSkillModes.configure(o.skill,c.cid),/finite ammo binding/);
  o.skill.ammoCount=count;o.skill.durationType='NONE';assert.throws(()=>ArkSkillModes.configure(o.skill,c.cid),/finite ammo binding/);
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of ammoCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    assert.equal(r.skill.ammoCount,source.blackboard.find(b=>b.key==='attack@trigger_time').value);
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:2041,name:'有限弹药模式'});
 const hostRestores=[];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of ids)for(const stage of ['mid-ammo','final-projectile']){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(c)});o.playerId='one';modeEnemy(o,501,{applyWay:'RANGED'});castSkill(o);var shots=${stage==='mid-ammo'?1:c.bb['attack@trigger_time']};for(var i=0;i<shots;i++){useMode(o);if(i<shots-1)settleMode();}o.cd=999;`);
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' '+stage+' source ammo/taunt/flight replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,stage});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-ammo-receipts.json',JSON.stringify({scope:'Two full source finite-ammo skills, single effective main actor and ON_SPELL_ON inference boundary; no new manual-stop UI',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL MODE AMMO OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostRestores.length+' host restores; all source rounds/damage, garrison notifications, ranged-apply-way then flying priority, taunt cleanup and SP lock');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
