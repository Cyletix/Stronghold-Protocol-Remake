'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 const originalPlan=ArkSkillModes.plan;
 ArkSkillModes.plan=(o,plan)=>o.delayContract?{...plan,replacementDelivery:'direct',attackPreDelay:o.delayContract.delay}:originalPlan(o,plan);
 function delayedFixture(delay=.5){
  const o=makeMode({cid:'char_174_slbell',index:0,level:7});
  // Isolate the public delivery contract from any particular skill/controller.
  o.skill=null;o.skillState=null;o.charId='delay-contract-fixture';o.subProfession='';
  o.basicAttack={action:'attack',kind:'single',damageType:'arts'};o.delayContract={delay};
  const e=modeEnemy(o,100,{def:0,magicRes:0});return {o,e};
 }
 {
  const {o,e}=delayedFixture(0);assert.equal(o.position,'RANGED');
  assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(e.maxHp-e.hp,150);assert.equal(B.projectiles.length,0,'explicit direct remains immediate without delay');
 }
 {
  const {o,e}=delayedFixture();o.attackTime=.1;
  assert.equal(ArkOperatorCombat.attack(o),true);modeNear(o.cd,.1,'delivery delay does not rewrite attack interval');
  const p=B.projectiles[0];assert.equal(p.kind,'operator-pulse');assert.equal(p.resolveAt,.5);assert.equal(e.hp,e.maxHp);
  ArkOperatorCombat.impact(p);assert.equal(e.hp,e.maxHp,'an early impact cannot bypass the body delay');
  update(.1,.1);assert.equal(B.projectiles.length,1,'naturally expired cooldown cannot emit a second pending body');
  assert.equal(ArkOperatorCombat.attack(o),false,'public action uses the same pending gate');
  o.atk=900;o.delayContract.delay=0;o.cd=999;
  update(.399,.399);assert.equal(e.hp,e.maxHp);
  update(.001,.001);assert.equal(e.maxHp-e.hp,150,'the emitted plan retains original power and delay');
  assert.equal(B.projectiles.length,0);
  o.cd=0;assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(e.maxHp-e.hp,1050,'gate clears after the body finishes');
 }
 for(const invalid of ['removed','untargetable','undeployed','absent','stunned']){
  const {o,e}=delayedFixture();assert.equal(ArkOperatorCombat.attack(o),true);o.cd=999;
  if(invalid==='absent')B.operators=[];
  else if(invalid==='undeployed'){o.deployed=false;o.deployAt=1;}
  else if(invalid==='stunned')o.stunUntil=1;
  else o[invalid]=true;
  update(.5,.5);assert.equal(e.hp,e.maxHp,invalid+' owner cancels the unfinished direct body');assert.equal(B.projectiles.length,0);
 }
 ArkSkillModes.plan=originalPlan;`);
 console.log('DELAYED ATTACK BODY OK: direct/immediate delivery, fixed interval, natural pending gate, frozen power/delay and invalid-owner cancellation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
