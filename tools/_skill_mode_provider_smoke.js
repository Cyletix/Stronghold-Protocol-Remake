'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const selected=['skchr_svrash_3','skchr_huang_2','skchr_vigna_1','skchr_vigna_2','skchr_snakek_2','skchr_huang_1'];
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>selected.includes(s.skillId)?[{cid,index,id:s.skillId,level:7}]:[]));
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,providerCases:cases,providerSource:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helper}
  assert.equal(Object.keys(ArkSkillModeData.profiles).filter(id=>ArkNextAttackSkillData.profiles[id]).length,0,'source-mode and next-attack discoveries are disjoint');
  for(const id of ['skchr_svrash_3','skchr_huang_2','skchr_vigna_1','skchr_vigna_2']){
   const o=makeMode(providerCases.find(c=>c.id===id)),b=o.skill.blackboard;
   assert.equal(o.skill.combatMechanic,undefined,'legacy combat branch removed');
   assert.equal(o.skill.medicMechanic,undefined);assert.deepEqual(o.skill.effects,[]);
   o.buffs.push({atk:1.4,def:1.25,until:100});o.flow={def:50};castSkill(o);
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*(.4+b.atk),'one source ATK bucket plus external bonus');
   const expectedDef=id==='skchr_svrash_3'?(200+200*.25+50)*(1+b.def):200+200*(.25+(b.def||0))+50;
   modeNear(operatorDefense(o),expectedDef,'one source DEF bucket/final scaler plus external flat DEF');
   modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2+(b.base_attack_time||0),'interval not applied by both stat graph and source program');
   assert.equal(o.buffs.length,1,'no legacy skill Buff appended alongside program Buff');
   assert.equal(o.clientProgramState.buffs.length,1);
   const plan=ArkOperatorCombat.planFor(o,o.skill);assert.equal(plan.skillId,id);assert.ok(ArkSkillModes.active(o));
   endOperatorSkill(o);modeNear(operatorAttackPower(o,buffMul(o).atk),190);modeNear(operatorDefense(o),300);
  }
  // A deliberately conflicting ordinary provider must not win over the complete
  // mode contract. This is a provider-order test, not a source skill variant.
  {
   const id='skchr_vigna_1',oldP=ArkClientProgramData.profiles[id],oldB=ArkClientProgramData.programs[id];
   try{
    ArkClientProgramData.profiles[id]={...ArkSkillModeData.profiles[id]};
    ArkClientProgramData.programs[id]=JSON.parse(JSON.stringify(ArkSkillModeData.programs[id]));
    ArkClientProgramData.programs[id].buffs[0].modifiers[0].value={constant:99};
    const o=makeMode(providerCases.find(c=>c.id===id));castSkill(o);
    modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*o.skill.blackboard.atk,'mode provider wins once');
   }finally{if(oldP)ArkClientProgramData.profiles[id]=oldP;else delete ArkClientProgramData.profiles[id];if(oldB)ArkClientProgramData.programs[id]=oldB;else delete ArkClientProgramData.programs[id];}
  }
  {
   const o=makeMode(providerCases.find(c=>c.id==='skchr_snakek_2'));o.hp=1000;castSkill(o);
   o.clientProgramState.buffs[0].flags=['no_direct_heal'];const ally=modeAlly(o);
   assert.equal(healOperator(ally,o,100),0,'direct-heal gate coexists with mode program');
   update(.1);modeNear(o.hp,1000+o.maxHp*o.skill.blackboard.hp_recovery_per_sec_by_max_hp_ratio*.1,'regeneration bypass remains distinct');
  }
  {
   const o=makeMode(providerCases.find(c=>c.id==='skchr_huang_1'));assert.ok(o.skill.combatMechanic.next);assert.equal(o.skill.skillMode,undefined);assert.equal(o.skill.clientProgram,undefined);
   modeEnemy(o);o.sp=o.skill.spCost;const before=o.sp;ArkOperatorCombat.attack(o);settleMode();assert.ok(o.sp<before,'next-attack consumer still owns replacement activation');
  }
 `);
 console.log('SKILL MODE PROVIDERS OK legacy migration, external attribute layering, overlapping provider priority, regeneration/direct-heal distinction, next-attack ownership');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
