'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const ids=['skchr_bpipe_3','skchr_excu_2','skchr_skadi_3','skchr_angel_2','skchr_lisa_2','skchr_archet_3','skchr_aglina_1'];
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((lv,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost,spType:lv.spData.spType})):[]));
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,expansionCases:cases});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helper}
  const receipts=[];
  for(const c of expansionCases){
   const o=makeMode(c),baseCells=JSON.stringify(o.cells),baseBlock=operatorBlockCount(o),beforeHp=o.maxHp;
   assert.ok(o.skill.skillMode,c.id);assert.ok(o.skill.clientProgram,c.id);assert.equal(o.skill.combatMechanic,undefined,'one provider');
   assert.equal(o.skill.spType,c.spType);assert.equal(castSkill(o),true);assert.equal(o.sp,0);
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*(c.bb.atk||0),c.id+' one source ATK bonus');
   modeNear(operatorDefense(o),200*(1+(c.bb.def||0)),c.id+' source DEF');
   modeNear(o.maxHp,beforeHp*(1+(c.bb.max_hp||0)),c.id+' source max HP');
   assert.equal(operatorBlockCount(o),baseBlock+(c.bb.block_cnt||0),'block modifier applied once');
   const buffs=ArkSkillModeData.programs[c.id].buffs;assert.equal(o.clientProgramState.buffs.length,buffs.length);
   assert.equal(o.buffs.length,0,'legacy skill effects do not overlap program instances');
   if(c.id==='skchr_bpipe_3')assert.equal(buffs.length,2,'complete secondary visual Buff retained');
   if(c.bb.ability_range_forward_extend){
    assert.ok(o.cells.length>JSON.parse(baseCells).length,'source range attribute expands active selector');
    const state=JSON.stringify(o.clientProgramState);ArkClientPrograms.tick(o,B.time);assert.equal(JSON.stringify(o.clientProgramState),state,'range extension not applied twice');
   }
   const ground=ArkSkillModes.active(o).plan.groundOnly;for(let i=0;i<8;i++)modeEnemy(o,100+i);
   assert.equal(useMode(o),true);const shots=B.projectiles.slice();
   if(ArkSkillModeData.profiles[c.id].plan.projectile){
    assert.ok(shots.length);for(const shot of shots){assert.equal(shot.speed,ArkSkillModeData.profiles[c.id].plan.projectile.speed);assert.equal(shot.life,ArkSkillModeData.profiles[c.id].plan.projectile.life);}
   }
   settleMode();
   const n=c.id==='skchr_excu_2'?8:c.bb['attack@max_target']||1;
   assert.equal(B.enemies.filter(e=>e.hp<e.maxHp).length,n,c.id+' target budget');
   const hits=c.id==='skchr_bpipe_3'?3:c.id==='skchr_excu_2'?2:c.bb['attack@times']||1;
   const sourceAtk=(100*(1.5+(c.bb.atk||0)))*(c.bb['attack@atk_scale']||1);
   // Executor's unchanged spreadshooter trait applies in the front three cells.
   const power=sourceAtk*(c.id==='skchr_excu_2'?1.5:1),arts=['skchr_aglina_1','skchr_lisa_2'].includes(c.id);
   const damage=(arts?Math.round(power*.75):Math.round(Math.max(power-30,power*.05)))*hits;
   for(const e of B.enemies.filter(e=>e.hp<e.maxHp))assert.equal(e.maxHp-e.hp,damage,c.id+' independently calculated repeated damage');
   assert.equal(o.sp,0,'active attacks cannot recover skill SP');
   if(ground){B.enemies=[];modeEnemy(o,199,{flying:true});assert.equal(useMode(o),false,'mode ground selector');}
   endOperatorSkill(o);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillState,null);
   assert.equal(JSON.stringify(o.cells),baseCells,'base range restored');assert.equal(operatorBlockCount(o),baseBlock);modeNear(o.maxHp,beforeHp);
   modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(operatorDefense(o),200);
   receipts.push({charId:c.cid,skillId:c.id,level:c.level});
  }
  // Attack-recovery reopens only after the mode is gone; range restoration also
  // occurs through natural expiry, without a direct call to endOperatorSkill.
  {const c=expansionCases.find(c=>c.id==='skchr_archet_3'&&c.level===7),o=makeMode(c),base=JSON.stringify(o.cells);castSkill(o);modeEnemy(o);B.time=c.duration-.01;o.cd=999;update(.02);assert.equal(o.skillState,null);assert.equal(JSON.stringify(o.cells),base);o.cd=0;update(.01);assert.equal(o.sp,1);}
  return receipts;
 })()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1821,name:'公共模式扩展'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of ['skchr_bpipe_3','skchr_archet_3','skchr_lisa_2']){
   const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(c)});o.playerId='one';castSkill(o);modeEnemy(o,700);modeEnemy(o,701);`);
   const checkpoint=runtime.snapshot();runtime.advance(.6);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.6);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' complete mode checkpoint replay');assert.deepEqual(actual.rng,expected.rng);
   runtime.__testMachine.run('var restored=B.operators[0];restored.hp=0;tryKill(restored);assert.equal(restored.clientProgramState,undefined);assert.equal(restored.skillState,null);');
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-expansion-receipts.json',JSON.stringify({scope:'seven added mode bodies; complete multi-Buff/repeat/projectile/range contracts within recorded timing boundaries',receipts},null,2));
 console.log('SKILL MODE EXPANSION OK '+receipts.length+' new source levels; multiple self Buffs, repeated shots, projectile metadata, range/SP lifecycle and 3 host restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
