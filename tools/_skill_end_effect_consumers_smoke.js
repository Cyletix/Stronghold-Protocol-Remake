'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const endHelper=fs.readFileSync(require.resolve('./_skill_mode_end_effects_smoke'),'utf8').match(/const endHelper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${endHelper}
 const o=makeEndCase({cid:'char_107_liskam',id:'skchr_liskam_2',index:1,level:7});o.playerId='one';
 o.equip=[{id:'riot_shield',mods:{}}];BDATA.level.buildable[o.row][o.col]='MELEE';
 const held=modeEnemy(o,100,{x:o.col+.1,y:o.row}),ranged=modeEnemy(o,101,{x:o.col+3,y:o.row});
 ArkOperatorCombat.assignBlocks();assert.equal(held.blockerId,o.id);
 const season='act2autochess';
 modeNear(ArkEquipProtection.scale(o,ranged,B,{seasonId:season}),ArkEquipProtectionData.seasons[season].damageScale);
 const healer={id:2,charId:'char_4042_lumen',profession:'MEDIC',position:'RANGED',row:o.row,col:o.col-1,
  cells:[[o.row,o.col]],range:3,atk:100,attackTime:1,cd:0,hp:1000,maxHp:1000,events:[],buffs:[],sp:0,
  deployed:true,deployAt:0,deployT:2,playerId:'one',garrisonAdd:[{bb:{key:'sleepstun_inrange'}}],
  skill:{sourceId:'skchr_lumen_3',blackboard:{heal_scale:1.35}},skillState:{until:100,ammo:4,deltas:{}}};
 B.operators.push(healer);const events=[];window.onBondGarrison=(event,unit)=>events.push([event,unit.id]);
 assert.equal(castSkill(o),true);B.time=.2;endOperatorSkill(o,'manual');
 assert.equal(operatorCanAct(o),false);assert.equal(ArkOperatorCombat.sourceBuffActive(o,'stun'),true);
 assert.equal(ArkOperatorCombat.sourceBuffActive(o,'unrelated'),false);
 assert.equal(ArkOperatorCombat.blockerOf(held),undefined,'query rejects stunned owner before assignment refresh');
 assert.equal(ArkEquipProtection.scale(o,ranged,B,{seasonId:season}),1,'stale blocker relation cannot protect stunned owner');
 notifyGarrisonStatuses();notifyGarrisonStatuses();assert.deepEqual(events,[['sleepstun',healer.id]],'owned status emits once into actual garrison observer');
 ArkOperatorCombat.assignBlocks();assert.equal(held.blockerId,null,'source stun releases actual block relation');
 o.cd=0;o.hp=10000;healer.cd=999;const before=held.hp;update(0,0);assert.equal(held.hp,before,'natural operator action gate respects owned stun');
 // Actual Lumen healing consumes one ammo and clears an end status without
 // touching any future pending after-affecting action.
 o.hp=1000;healer.cd=0;assert.equal(performHealingAction(healer),true);
 assert.equal(o.sourceSkillEndStatuses,undefined);assert.equal(healer.skillState.ammo,3);assert.equal(operatorCanAct(o),true);
 ArkOperatorCombat.assignBlocks();assert.equal(held.blockerId,o.id);
 o.sp=o.skill.spCost;assert.equal(castSkill(o),true);const pending=o.skillEndEffectState;o.stunUntil=B.time+1;o.hp=1000;healer.cd=0;
 assert.equal(performHealingAction(healer),true);assert.equal(o.stunUntil,0);assert.equal(healer.skillState.ammo,2);
 assert.equal(o.skillEndEffectState,pending,'cleanse preserves pending cast arm');
 endOperatorSkill(o,'interrupt');assert.equal(ArkSkillEndEffects.stunned(o,B.time),true,'later completion still emits exactly once');
 o.hp=0;tryKill(o);assert.equal(o.sourceSkillEndStatuses,undefined);assert.equal(o.skillEndEffectState,undefined);
 B.dp=100;o.respawnAt=B.time;o.respawnCost=0;respawnOperators();assert.equal(o.dead,false);
 assert.equal(o.sourceSkillEndStatuses,undefined);assert.equal(o.skillEndEffectState,undefined);assert.equal(o.deployed,false);
 `);
 console.log('SKILL END CONSUMERS OK: action/block/gear/status-key/events, actual Lumen cleanse preserves arm, death and redeployment');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
