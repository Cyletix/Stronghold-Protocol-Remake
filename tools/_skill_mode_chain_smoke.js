'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const ids=['skchr_leizi_2','skchr_pasngr_2'];
// Decorative particles use Math.random; gameplay state and its RNG must match.
const combatState=b=>{const out=structuredClone(b);delete out.particles;return out;};
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((lv,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost})):[]));
const chainHelper=`
function chainTargets(o){for(let i=0;i<8;i++)modeEnemy(o,100+i,{x:o.col+1+i*1.1,y:o.row});}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,chainCases:cases,sourceSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helper}${chainHelper}
 for(const c of chainCases){
  const o=makeMode(c);chainTargets(o);assert.equal(castSkill(o),true);
  const expectedCount=c.bb['attack@max_target']||o.basicAttack.bb['attack@max_target'];
  const expectedDecay=c.id==='skchr_leizi_2'?1:o.basicAttack.bb['attack@chain.atk_scale']??.8500000238418579;
  const expectedSlow=o.basicAttack.bb['attack@sluggish'];
  assert.equal(useMode(o),true);assert.equal(B.projectiles.length,1,'one initial target, not chain-count projectiles');
  const shot=B.projectiles[0];assert.equal(shot.speed,15);assert.equal(shot.life,10);
  assert.equal(shot.plan.chainCount,expectedCount);modeNear(shot.plan.chainDecay,expectedDecay);assert.equal(shot.plan.slow,0);
  o.cd=0;assert.equal(useMode(o),false,'wait for existing source projectile to invalidate');
  // Both profile edits and skill expiry must leave emitted hit parameters intact.
  o.basicAttack.bb={...o.basicAttack.bb,'attack@sluggish':99,'attack@max_target':1};endOperatorSkill(o);settleMode();
  const damaged=B.enemies.filter(e=>e.hp<e.maxHp);assert.equal(damaged.length,expectedCount);
  const raw=100*(1.5+(c.bb.atk||0));
  for(let i=0;i<damaged.length;i++){
   assert.equal(damaged[i].maxHp-damaged[i].hp,Math.round(raw*Math.pow(expectedDecay,i)*.75),c.id+' independent hop damage');
   modeNear(damaged[i].operatorMoveSpeedDebuffs.sluggish.until,expectedSlow);modeNear(ArkOperatorCombat.movementMultiplier(damaged[i]),.2);
  }
 }
 // Runtime trait inheritance, rather than a constant hidden in the provider.
 for(const c of chainCases.filter(c=>c.level===7))for(const count of [3,4]){
  const o=makeMode(c);o.basicAttack.bb={...o.basicAttack.bb,'attack@max_target':count,'attack@sluggish':.8,'attack@chain.atk_scale':1};
  castSkill(o);chainTargets(o);useMode(o);const p=B.projectiles[0].plan;
  assert.equal(p.chainCount,c.bb['attack@max_target']||count);assert.equal(p.chainDecay,1);assert.equal(p.replacementHitBuffs[0].duration,.8);
  settleMode();assert.ok(B.enemies.filter(e=>e.hp<e.maxHp).every(e=>e.operatorMoveSpeedDebuffs.sluggish.until===.8));
 }
 {const c=chainCases.find(c=>c.level===7),o=makeMode(c);castSkill(o);const first=modeEnemy(o,200,{x:o.col+1}),hidden=modeEnemy(o,201,{x:o.col+2,invisibleUntil:99}),free=modeEnemy(o,202,{x:o.col+2,untargetable:true}),removed=modeEnemy(o,203,{x:o.col+2,removed:true});
  const edge=modeEnemy(o,204,{x:o.col+2.7001});useMode(o);settleMode();assert.ok(first.hp<first.maxHp);for(const e of [hidden,free,removed,edge])assert.equal(e.hp,e.maxHp,'invalid or out-of-chain-range target');
 }
 window.chainSeasons=[];
 for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of chainCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
   G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),lv=elite?7:4;
   assert.ok(r.skill.skillMode);assert.equal(r.skill.sourceId,c.id);assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(sourceSkills[c.id].levels[lv-1].blackboard.map(b=>[b.key,b.value])));
   const o=makeMode(c);o.skill=r.skill;o.sp=o.skill.spCost;o.basicAttack=r.basicAttack;castSkill(o);
   assert.equal(ArkSkillModes.active(o).plan.replacementHitBuffs[0].duration,r.basicAttack.bb['attack@sluggish']);
   chainSeasons.push({season,skillId:c.id,elite});
  }
 }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1825,name:'链式模式公共批次'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+chainHelper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeMode(${JSON.stringify(c)});castSkill(o);chainTargets(o);useMode(o);endOperatorSkill(o);o.cd=999;`);
   const before=runtime.snapshot();assert.equal(before.battle.projectiles.length,1);runtime.advance(.2);const expected=runtime.snapshot();runtime.restore(before);runtime.advance(.2);const actual=runtime.snapshot();
   assert.deepEqual(combatState(actual.battle),combatState(expected.battle));assert.deepEqual(actual.rng,expected.rng);
   assert.ok(expected.battle.enemies.filter(e=>e.hp<e.maxHp).length>=3,'real engine step resolves the source chain after mode expiry');
  }
 }finally{runtime.dispose();}
 const receipt={sourceLevels:cases.length,traitCountCases:4,hostRestores:2,seasonVariants:JSON.parse(f.run('JSON.stringify(chainSeasons)')),skills:ids,boundary:'Complete source fields and current shared nearest/no-repeat same-frame chain model; native per-hop phase remains unverified.'};
 fs.writeFileSync('.runtime/skill-mode-chain-receipts.json',JSON.stringify(receipt,null,2));
 console.log('SKILL MODE CHAIN OK',cases.length,'levels;',receipt.seasonVariants.length,'season variants; trait/phase values, no repeat, invalidation, range, 2 host restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
