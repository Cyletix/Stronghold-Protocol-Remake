'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].capability==='end-effects');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const endHelper=`
function makeEndCase(c){
 const o=makeMode(c),lv=ArkSkillLevels.get(c.id,c.level);assert.ok(lv);
 Object.assign(o.skill,{blackboard:{...lv.blackboard},duration:lv.duration,spCost:lv.spCost,isPassive:lv.isPassive});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);
 o.sp=o.skill.spCost;o.cd=999;o.statusResistance=0;return o;
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,endCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${endHelper}
 const rows=[];
 for(const c of endCases){
  const o=makeEndCase(c),baseBlock=operatorBlockCount(o),rawAttack=150+100*(c.bb.atk||0);
  assert.ok(o.skill.clientProgram);assert.ok(o.skill.skillMode);assert.deepEqual(o.skill.effects,[]);assert.equal(o.skill.combatMechanic,undefined);
  assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);modeNear(o.skillState.until,c.duration);
  assert.ok(o.skillEndEffectState?.armed);assert.equal(ArkSkillEndEffects.stunned(o,B.time),false);assert.equal(o.sp,0);
  const liveAttack=operatorAttackPower(o,buffMul(o).atk);modeNear(liveAttack,rawAttack);
  if(c.id==='skchr_aurora_1'){
   modeNear(operatorDefense(o),200*(1+c.bb.def));assert.equal(operatorBlockCount(o),baseBlock+c.bb.block_cnt);
   modeNear(ArkSkillAuras.statusResistance(o),.5);const own=ArkSkillSelfBuffs.effective(o);assert.equal(own.length,1);
   assert.equal(own[0].stacking.overrideKey,'status_resistance[bonus]');assert.equal(own[0].until,30);
   assert.equal(o.clientProgramState.buffs[1].derivedBuffs,undefined,'finite root override is not a derived child');
   const e=modeEnemy(o);assert.equal(useMode(o),true);settleMode();assert.ok(e.hp<e.maxHp);o.cd=999;
  }else if(c.id==='skchr_fmout_2'){
   const enemies=[1,2,3].map(i=>modeEnemy(o,100+i));assert.equal(useMode(o),true);settleMode();
   for(const e of enemies)assert.equal(e.maxHp-e.hp,Math.round(liveAttack*.75),'all source range targets receive arts');o.cd=999;
  }else{
   modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2*(1+c.bb.base_attack_time));
   const count=c.bb['attack@max_target'],enemies=Array.from({length:count+1},(_,i)=>modeEnemy(o,100+i));
   const plan=o.skillState.sourceMode.plan,delay=plan.attackPreDelay;
   modeNear(plan.replacementHitBuffs[0].chance,c.bb['attack@buff_prob']);assert.ok(delay>0);
   const random=gameRandom;let rolls=0;gameRandom=()=>{rolls++;return .01;};
   try{
    assert.equal(useMode(o),true);assert.ok(enemies.every(e=>e.hp===e.maxHp),'source body waits before first hit');
    B.time=delay-.0001;update(0,0);assert.ok(enemies.every(e=>e.hp===e.maxHp));
    B.time=delay;update(0,0);const hit=enemies.filter(e=>e.hp<e.maxHp);assert.equal(hit.length,count);
    for(const e of hit){assert.equal(e.maxHp-e.hp,Math.round(liveAttack*.75));modeNear(e.stunUntil,B.time+c.bb['attack@stun']);}
    assert.equal(rolls,count,'one RNG draw per hit target');
    const old=hit.map(e=>e.stunUntil);gameRandom=()=>.99;assert.equal(useMode(o),true);B.time+=delay;update(0,0);
    for(let i=0;i<hit.length;i++){assert.equal(hit[i].maxHp-hit[i].hp,2*Math.round(liveAttack*.75));assert.equal(hit[i].stunUntil,old[i],'failed probability cannot refresh stun');}
   }finally{gameRandom=random;}
  }
  B.time=c.duration;update(0,0);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillState,null);
  assert.equal(o.skillEndEffectState,undefined);const status=o.sourceSkillEndStatuses;
  assert.equal(status.length,1);assert.equal(status[0].ownerId,o.id);assert.equal(status[0].skillId,c.id);
  const expected=c.bb.stun??c.bb.time;modeNear(status[0].until,c.duration+expected,'active self resistance already removed');
  assert.equal(ArkSkillEndEffects.stunned(o,B.time),true);assert.equal(o.stunUntil,undefined,'end state keeps independent source timer');
  modeNear(operatorDefense(o),200);modeNear(ArkSkillAuras.statusResistance(o),0);assert.equal(operatorBlockCount(o),baseBlock);
  o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'end stun blocks next skill');o.sp=0;
  const before=JSON.stringify(status);endOperatorSkill(o);assert.equal(JSON.stringify(o.sourceSkillEndStatuses),before,'no duplicate end emission');
  B.time=c.duration+expected;assert.equal(ArkSkillEndEffects.stunned(o,B.time),false);
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }
 // A full source cast killed while active discards its armed end action.
 for(const id of new Set(endCases.map(c=>c.id))){const c=endCases.find(c=>c.id===id&&c.level===7),o=makeEndCase(c);castSkill(o);o.hp=0;tryKill(o);
  assert.equal(o.skillEndEffectState,undefined);assert.equal(o.sourceSkillEndStatuses,undefined);}
 // Probability endpoints are semantic constants, not wasted RNG draws.
 for(const chance of [0,1]){const c=endCases.find(c=>c.id==='skchr_liskam_2'&&c.level===7),o=makeEndCase(c);
  o.skill.blackboard['attack@buff_prob']=chance;ArkSkillModes.configure(o.skill,c.cid);castSkill(o);const e=modeEnemy(o);
  const random=gameRandom;gameRandom=()=>{throw Error('Probability endpoint consumed RNG');};
  try{assert.equal(useMode(o),true);B.time=o.skillState.sourceMode.plan.attackPreDelay;update(0,0);
   assert.ok(e.hp<e.maxHp);assert.equal(!!(e.stunUntil>B.time),chance===1);
  }finally{gameRandom=random;}}
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of endCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:3050,name:'技能结束来源状态'});
 const hostRestores=[];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+endHelper);
  for(const id of ids)for(const stage of ['active','expiry','end-status']){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeEndCase(${JSON.stringify(c)});o.playerId='one';castSkill(o);o.cd=999;${id==='skchr_liskam_2'&&stage==='active'?'modeEnemy(o);useMode(o);':''}`);
   const elapsed=stage==='active'?.2:stage==='expiry'?c.duration-.3:c.duration+.1;
   runtime.advance(Math.min(30,elapsed));if(elapsed>30)runtime.advance(elapsed-30);
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' '+stage+' source end/child/probability replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,stage});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-end-effects-receipts.json',JSON.stringify({scope:'Three complete source modes, armed after-affecting owner stun, finite DB own resistance, per-target source hit chance; lifecycle/frame/random-correlation boundaries retained',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL MODE END EFFECTS OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostRestores.length+' host restores; full attack/finite override/probability/expiry/death');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
