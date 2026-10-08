'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const ids=['skchr_acsupo_2','skchr_cuttle_2','skchr_mantic_2'];
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((lv,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost})):[]));
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,statusCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helper}
  const receipts=[];
  for(const c of statusCases){
   const o=makeMode(c);assert.ok(o.skill.skillMode);assert.equal(o.skill.combatMechanic,undefined);assert.equal(castSkill(o),true);
   const plan=ArkSkillModes.active(o).plan,effect=plan.replacementHitBuffs[0],count=c.id==='skchr_mantic_2'?4:c.bb['attack@max_target']||1;
   for(let i=0;i<4;i++)modeEnemy(o,100+i);
   const savedHit=hitEnemy,phase=[];
   hitEnemy=function(owner,e,...args){phase.push(ArkOperatorCombat.sourceBuffActive(e,effect.key));return savedHit(owner,e,...args);};
   try{assert.equal(useMode(o),true);settleMode();}finally{hitEnemy=savedHit;}
   assert.equal(phase.length,count);assert.ok(phase.every(active=>active===(effect.phase==='before-body')),'source phase reaches common hit consumer');
   const power=100*(1.5+(c.bb.atk||0)),damage=c.id==='skchr_acsupo_2'?Math.round(power*.75):Math.round(Math.max(power-30,power*.05));
   const hit=B.enemies.filter(e=>e.hp<e.maxHp);assert.equal(hit.length,count);
   for(const e of hit){
    assert.equal(e.maxHp-e.hp,damage);assert.ok(ArkOperatorCombat.sourceBuffActive(e,effect.key));
    if(effect.kind==='stun')modeNear(e.stunUntil,c.bb['attack@stun']);
    else{modeNear(ArkOperatorCombat.movementMultiplier(e),c.id==='skchr_acsupo_2'?.2:1+c.bb['attack@move_speed']);modeNear(e.operatorMoveSpeedDebuffs[effect.key].until,c.bb['attack@sluggish']||c.bb['attack@duration']);}
   }
   assert.equal(o.sp,0,'active mode hit does not recover SP');endOperatorSkill(o);
   assert.ok(hit.every(e=>ArkOperatorCombat.sourceBuffActive(e,effect.key)),'target finite status outlives source mode');
   B.time=effect.duration;assert.ok(hit.every(e=>!ArkOperatorCombat.sourceBuffActive(e,effect.key)),'status ends at exact expiry');
   receipts.push({charId:c.cid,skillId:c.id,level:c.level});
  }
  // The inclusive source HP minimum is independent from defense priority. The
  // lowest current DEF wins even if its base DEF is higher or it is farther.
  {const c=statusCases.find(c=>c.id==='skchr_cuttle_2'&&c.level===7),o=makeMode(c);castSkill(o);
   const below=modeEnemy(o,201,{hp:499999,def:0}),equal=modeEnemy(o,202,{hp:500000,def:100}),other=modeEnemy(o,203,{hp:900000,def:30});
   equal.operatorDefMultipliers={test:{value:.1,until:99}};
   assert.equal(useMode(o),true);settleMode();assert.ok(equal.hp<500000);assert.equal(other.hp,900000);assert.equal(below.hp,499999);
   B.enemies=[equal,below];assert.equal(useMode(o),false,'no fallback below minimum');
  }
  {const c=statusCases.find(c=>c.id==='skchr_mantic_2'&&c.level===7),o=makeMode(c);castSkill(o);
   const immune=modeEnemy(o,211,{stunImmune:true}),resistant=modeEnemy(o,212,{statusResistance:.5});
   useMode(o);settleMode();assert.ok(!immune.stunUntil);modeNear(resistant.stunUntil,c.bb['attack@stun']*.5);
  }
  // Ordinary source projectiles freeze status parameters before source expiry.
  {const c=statusCases.find(c=>c.id==='skchr_acsupo_2'&&c.level===7),o=makeMode(c),e=modeEnemy(o);castSkill(o);useMode(o);
   assert.ok(B.projectiles.length);endOperatorSkill(o);o.skill.blackboard['attack@sluggish']=99;settleMode();
   modeNear(e.operatorMoveSpeedDebuffs.sluggish.until,c.bb['attack@sluggish']);
  }
  return receipts;
 })()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of statusCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1937,name:'命中状态模式'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of ['skchr_acsupo_2','skchr_mantic_2']){
   const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(c)});o.playerId='one';modeEnemy(o,500);castSkill(o);useMode(o);o.cd=999;`);
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' status/projectile replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-hit-buff-receipts.json',JSON.stringify({scope:'three finite hit-status mode bodies; source values and phases within documented refresh/timing boundaries',receipts,seasonReceipts,hostRestores:2},null,2));
 console.log('SKILL MODE HIT BUFFS OK '+receipts.length+' source levels; '+seasonReceipts.length+' season variants; 2 host restores; source phases, HP minimum/DEF priority, immunity, expiry and in-flight freezing');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
