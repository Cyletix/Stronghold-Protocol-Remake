'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const id='skchr_sunbr_2',cases=skills[id].levels.map((lv,i)=>({cid:'char_196_sunbr',index:1,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const flowHelper=`
function enterHealing(c){const o=makeMode(c);castSkill(o);o.cd=999;B.time=10;update(0,0);return o;}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,flowCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${flowHelper}
 const rows=[];
 for(const c of flowCases){
  const o=makeMode(c),a=modeAlly(o);assert.equal(castSkill(o),true);o.cd=999;
  assert.equal(o.skillState.until,40,'root duration cannot truncate child sequence');
  assert.equal(operatorAction(o),'none');modeNear(operatorDefense(o),200*(1+c.bb.def));
  modeNear(operatorAttackPower(o,buffMul(o).atk),150,'second child ATK must not start early');
  B.time=9.99;update(0,0);assert.equal(a.hp,2500);assert.equal(o.clientProgramState.flow.stageIndex,0);
  B.time=10;update(0,0);assert.equal(operatorAction(o),'heal');assert.equal(o.clientProgramState.flow.stageIndex,1);
  assert.equal(o.clientProgramState.flow.completed.length,1);assert.equal(o.clientProgramState.flow.completed[0].at,10);
  modeNear(operatorDefense(o),200);const power=150+100*c.bb.atk;modeNear(operatorAttackPower(o,buffMul(o).atk),power);
  assert.equal(performHealingAction(o),true);o.cd=999;assert.equal(a.hp,2500);assert.equal(B.projectiles.length,1);
  const p=B.projectiles[0];modeNear(p.resolveAt,10.4333);modeNear(o.sourceHealAction.until,11.3333);
  B.time=10.4332;update(0,0);assert.equal(a.hp,2500);B.time=10.4333;update(0,0);modeNear(a.hp,2500+power);
  assert.equal(operatorAction(o),'none','healing event does not prematurely release animation occupancy');
  B.time=11.3333;update(0,0);assert.equal(operatorAction(o),'heal');assert.equal(o.sp,0);
  B.time=30;update(0,0);assert.ok(o.skillState,'root 30 seconds is not total duration');
  B.time=40;update(0,0);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(operatorAction(o),'attack');
  modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(operatorDefense(o),200);
  rows.push({skillId:c.id,level:c.level,stages:2,totalDuration:40,healEvent:.4333});
 }
 const c=flowCases[6];
 // Issued payload retains power across skill end; invalid source/target epochs cancel it.
 for(const reason of ['skill-end','source-stun','source-death','target-death','target-redeploy']){
  const o=enterHealing(c),a=modeAlly(o);performHealingAction(o);o.cd=999;const power=150+100*c.bb.atk;
  if(reason==='skill-end')endOperatorSkill(o);
  if(reason==='source-stun')o.stunUntil=20;
  if(reason==='source-death'){o.hp=0;tryKill(o);}
  if(reason==='target-death'){a.hp=0;tryKill(a);}
  if(reason==='target-redeploy')a.medicLifeEpoch=(a.medicLifeEpoch||0)+1;
  const hp=a.hp;B.time=10.5;update(0,0);modeNear(a.hp,hp+(reason==='skill-end'?power:0),reason);
  assert.equal(B.projectiles.length,0);
 }
 // Fast ASPD uses animation floor; no-cap source timing remains expressible.
 for(const uncapped of [false,true]){
  const o=enterHealing(c);modeAlly(o);const timing=o.skillState.sourceMode.plan.healTiming;
  if(uncapped){timing.maxScale=-1;o.attackTime=10;}else o.buffs.push({aspd:1000,until:50});
  const interval=ArkOperatorCombat.attackInterval(o,o.skill),scale=Math.max(.1,Math.min(uncapped?Infinity:1,interval/1.3333));
  performHealingAction(o);modeNear(B.projectiles[0].resolveAt,10+.4333*scale);modeNear(o.sourceHealAction.until,10+1.3333*scale);
  assert.equal(performHealingAction(o),false,'no second emission while animation occupies actor');
 }
 // Natural frame dispatcher, not a direct helper invocation, enters and heals.
 {const o=makeMode(c),a=modeAlly(o);castSkill(o);o.cd=0;B.time=9.99;update(.02,.02);assert.equal(B.projectiles.length,1);assert.equal(a.hp,2500);update(.44,.44);assert.ok(a.hp>2500);}
 // Skipping frame intervals cannot activate a child twice or leave residual buffs.
 {const o=makeMode(c);castSkill(o);o.cd=999;B.time=40.1;update(0,0);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillState,null);}
 {const o=makeMode(c);castSkill(o);o.hp=0;tryKill(o);B.time=11;update(0,0);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillState,null);}
 // Early finish enters the next stage once, using its full own duration.
 {const o=makeMode(c);castSkill(o);o.cd=999;o.clientProgramState.buffs[0].until=2;B.time=2;update(0,0);
  assert.equal(o.clientProgramState.flow.stageIndex,1);assert.equal(o.clientProgramState.flow.childUntil,32);
  B.time=32;update(0,0);assert.equal(o.skillState,null);}
 {const o=makeMode(c);castSkill(o);const cursor=o.clientProgramState.flow.cursor;endOperatorSkill(o);
  assert.equal(cursor.phase,'cancelled');assert.equal(cursor.nodes[Object.keys(cursor.nodes)[1]].phase,'cancelled');}
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  const c=flowCases[6];if(!ROSTER[c.cid])continue;for(const elite of [false,true]){G.skillChoices[c.cid]=c.index;
   const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4;
   assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(sourceSkills[c.id].levels[level-1].blackboard.map(b=>[b.key,b.value])));
   rows.push({seasonId:season,skillId:c.id,elite,level});}
 }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:32112,name:'顺序技能'}),hostRestores=[];
 try{runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+flowHelper);
  for(const phase of ['stage-transition','healing','pending-heal','legacy-stage-transition','legacy-healing']){
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(cases[6])});o.playerId='one';castSkill(o);o.cd=999;var a=modeAlly(o);`);
   runtime.advance(phase.endsWith('stage-transition')?9.7:10.1);
   if(phase==='pending-heal')runtime.__testMachine.run('performHealingAction(o);o.cd=999;');
   if(phase.startsWith('legacy-'))runtime.__testMachine.run('delete o.clientProgramState.flow.cursor;');
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,phase+' complete battle replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,phase});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-flow-receipts.json',JSON.stringify({scope:'Sequential finite source buffs, disarm/channel completion then timed healing. Not other flow leaf families or whole operator completion.',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL FLOW OK '+receipts.length+' levels; '+seasonReceipts.length+' season variants; '+hostRestores.length+' host restores; stages, timed healing, cancellation, snapshot payload and animation occupancy');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
