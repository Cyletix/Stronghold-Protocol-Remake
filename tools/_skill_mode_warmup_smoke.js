'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const id='skchr_zumama_3',cid='char_416_zumama';
const cases=skills[id].levels.map((lv,i)=>({cid,index:2,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const warmHelper=`
function makeWarmup(c){
 const o=makeMode(c),lv=ArkSkillLevels.get(c.id,c.level);assert.ok(lv);
 Object.assign(o.skill,{blackboard:{...lv.blackboard},duration:lv.duration,spCost:lv.spCost,isPassive:lv.isPassive});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);
 o.sp=o.skill.spCost;o.cd=999;o.statusResistance=0;return o;
}
function sourceStun(o){return ArkEnemySkills.applyProjectileBuffs({skillId:'source-stun-test',activeBuffs:[
 {kind:'stun',duration:4,isDamageMissable:false,statusResistible:true}]},o,B.time,false);}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,warmCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${warmHelper}
 const rows=[];
 for(const c of warmCases){
  const o=makeWarmup(c),baseBlock=operatorBlockCount(o),baseCells=JSON.stringify(o.cells),total=1.5+c.duration;o.hp=1000;
  assert.equal(o.skill.sourceId,c.id);assert.equal(o.skill.spCost,c.sp);assert.deepEqual(JSON.parse(JSON.stringify(o.skill.blackboard)),JSON.parse(JSON.stringify(c.bb)));
  assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.equal(o.sp,0);modeNear(o.skillState.until,total);
  assert.equal(o.clientProgramState.flow.stageIndex,0);assert.equal(operatorAction(o),'none');assert.equal(o.skillEndEffectState,undefined,'no finalizer before main child entry');
  const attack=150+100*c.bb.atk;modeNear(operatorAttackPower(o,buffMul(o).atk),attack);modeNear(operatorDefense(o),200*(1+c.bb.def));
  assert.equal(operatorBlockCount(o),baseBlock+c.bb.block_cnt,'persistent owner attributes begin at preparation');
  const e=modeEnemy(o);o.cd=0;update(.25,.25);assert.equal(e.hp,e.maxHp,'natural dispatcher cannot attack while preparing');
  modeNear(o.hp,1000+10000*c.bb.hp_recovery_per_sec_by_max_hp_ratio*.25,'recovery starts during preparation');o.cd=999;
  B.time=1.4999;update(0,0);assert.equal(operatorAction(o),'none');assert.equal(o.clientProgramState.flow.stageIndex,0);
  B.time=1.5;update(0,0);assert.equal(operatorAction(o),'attack');assert.equal(o.clientProgramState.flow.stageIndex,1);
  assert.ok(o.skillEndEffectState?.armed);assert.equal(o.clientProgramState.flow.childUntil,total);
  assert.equal(o.clientProgramState.flow.completed.length,1);assert.equal(o.clientProgramState.flow.completed[0].at,1.5);
  modeNear(operatorAttackPower(o,buffMul(o).atk),attack);modeNear(operatorDefense(o),200*(1+c.bb.def));
  B.enemies=[];const enemies=Array.from({length:operatorBlockCount(o)+1},(_,i)=>modeEnemy(o,100+i,i>0?{blockerId:o.id}:{}));
  const outside=modeEnemy(o,190,{x:o.col-4,y:o.row}),air=modeEnemy(o,191,{flying:true});
  assert.equal(useMode(o),true);settleMode();const hit=enemies.filter(e=>e.hp<e.maxHp);
  // Native LimitMaxNumToBlockCnt = min(source maxNum, max(1, blockCnt));
  // DoFindTargets_DISPOSE stops the blocked loop at that budget. This mode's
  // maxNum remains 1: extra blocking capacity does not create splash attacks.
  assert.equal(hit.length,1,'source maxNum=1 caps increased block capacity');
  assert.equal(hit[0].id,enemies[1].id,'owned blocked target wins over earlier unblocked candidate');
  for(const untouched of [enemies[0],...enemies.slice(2)])assert.equal(untouched.hp,untouched.maxHp,'other blocked enemies take no damage');
  for(const enemy of hit)assert.equal(enemy.maxHp-enemy.hp,Math.round(Math.max(attack-30,attack*.05)),'independent physical damage');
  assert.equal(outside.hp,outside.maxHp);assert.equal(air.hp,air.maxHp);o.cd=999;
  B.time=c.duration;update(0,0);assert.ok(o.skillState,'full source body duration starts after preparation');
  B.time=total;update(0,0);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillEndEffectState,undefined);
  const status=o.sourceSkillEndStatuses;assert.equal(status.length,1);modeNear(status[0].until,total+c.bb.stun);
  assert.equal(ArkSkillEndEffects.stunned(o,B.time),true);assert.equal(operatorCanAct(o),false);
  modeNear(operatorAttackPower(o,buffMul(o).atk),150);modeNear(operatorDefense(o),200);assert.equal(operatorBlockCount(o),baseBlock);assert.equal(JSON.stringify(o.cells),baseCells);
  o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'finishing stun blocks recast');o.sp=0;
  const before=JSON.stringify(status);endOperatorSkill(o);assert.equal(JSON.stringify(o.sourceSkillEndStatuses),before,'once-only finalizer');
  B.time=total+c.bb.stun;assert.equal(ArkSkillEndEffects.stunned(o,B.time),false);assert.equal(operatorCanAct(o),true);
  rows.push({charId:c.cid,skillId:c.id,level:c.level,warmupModelSeconds:1.5,activeSeconds:c.duration});
 }
 const c=warmCases[6];
 // Real consumers: projectile stun, two cold applications, and nervous burst.
 {const o=makeWarmup(c);castSkill(o);assert.equal(sourceStun(o),true);assert.ok(!(o.stunUntil>B.time));
  ArkEnemyCold.apply(o,5,B.time);ArkEnemyCold.apply(o,5,B.time);assert.ok(o.coldUntil>B.time);assert.equal(ArkEnemyCold.frozen(o,B.time),false,'only frozen is immune, cold remains');
  const hp=o.hp;assert.equal(ArkElements.burst(o,'nervous'),true);assert.ok(o.hp<hp,'nervous damage is not suppressed');assert.ok(!(o.stunUntil>B.time),'nervous stun respects casting immunity');
  ArkElements.clear(o);ArkEnemyCold.clear(o);B.time=1.5;update(0,0);sourceStun(o);assert.equal(o.stunUntil,5.5,'immunity ends with preparation');
  o.stunUntil=0;ArkEnemyCold.apply(o,5,B.time);ArkEnemyCold.apply(o,5,B.time);assert.equal(ArkEnemyCold.frozen(o,B.time),true);
 }
 for(const phase of ['warmup','active'])for(const reason of ['interrupt','death']){
  const o=makeWarmup(c);castSkill(o);const cursor=o.clientProgramState.flow.cursor;
  if(phase==='active'){B.time=1.5;update(0,0);}else B.time=.5;
  if(reason==='death'){o.hp=0;tryKill(o);}else endOperatorSkill(o,'interrupt');
  assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillEndEffectState,undefined);
  assert.equal(cursor.phase,'cancelled');assert.equal(ArkSkillEndEffects.stunned(o,B.time),phase==='active'&&reason==='interrupt');
  if(reason==='death')assert.equal(o.sourceSkillEndStatuses,undefined,'destruction cannot carry finishing stun into next deployment');
  modeNear(operatorDefense(o),200);modeNear(operatorAttackPower(o,buffMul(o).atk),150);
 }
 // The root's infinite attribute carrier stops recovery at actual body expiry.
 {const o=makeWarmup(c);castSkill(o);B.time=1.5;update(0,0);
  B.time=1.5+c.duration-.05;o.clientProgramState.recoveryAt=B.time;o.hp=1000;update(.1,.1);
  modeNear(o.hp,1000+10000*c.bb.hp_recovery_per_sec_by_max_hp_ratio*.05,'final partial recovery interval');assert.equal(o.skillState,null);
  const hp=o.hp;update(.1,.1);modeNear(o.hp,hp,'no regeneration after root cleanup');}
 // Native allowZeroBlockCntLimit=false preserves the one source attack slot
 // even when an external loss of block capacity reduces the live count to 0.
 {const o=makeWarmup(c);castSkill(o);B.time=1.5;update(0,0);o.blockCnt=-c.bb.block_cnt;
  assert.equal(operatorBlockCount(o),0);assert.equal(ArkSkillModes.plan(o,{}).targets,1);
  const enemy=modeEnemy(o);assert.equal(useMode(o),true);settleMode();assert.ok(enemy.hp<enemy.maxHp);}
 // Natural frame boundary enters the active attack mode through the scheduler.
 {const o=makeWarmup(c),e=modeEnemy(o);castSkill(o);o.cd=0;B.time=1.49;update(.02,.02);settleMode();assert.ok(e.hp<e.maxHp);assert.equal(o.clientProgramState.flow.stageIndex,1);}
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  const c=warmCases[6];if(!ROSTER[c.cid])continue;for(const elite of [false,true]){G.skillChoices[c.cid]=c.index;
   const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
   assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
   rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});}
 }return rows;})()`);
 assert.ok(seasonReceipts.length>=2,'at least one actual source season with both normal/elite variants');
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:30461,name:'准备动作与模式终结'}),hostRestores=[];
 try{runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+warmHelper);
  for(const phase of ['warmup','active','end-stun']){
   runtime.__testMachine.run(`var o=makeWarmup(${JSON.stringify(cases[6])});o.playerId='one';o.hp=3000;castSkill(o);o.cd=999;`);
   const elapsed=phase==='warmup'?1.2:cases[6].duration+(phase==='active'?1.2:1.6);
   runtime.advance(Math.min(30,elapsed));if(elapsed>30)runtime.advance(elapsed-30);
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,phase+' complete battle replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,phase});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-warmup-receipts.json',JSON.stringify({scope:'Complete cached warmup, persistent owner attributes, selected block-budget melee mode, and owner end status. Animation duration completion and cancellation mapping remain inferred; no whole operator/native frame claim.',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL WARMUP OK '+receipts.length+' levels; '+seasonReceipts.length+' season variants; '+hostRestores.length+' host restores; preparation immunity, persistent attributes, active attack, expiry, interruption and death');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
