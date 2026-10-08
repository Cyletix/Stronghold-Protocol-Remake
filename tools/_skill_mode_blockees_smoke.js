'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].capability==='blockee-effects');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const blockHelper=`
function makeBlockeeCase(c){
 const o=makeMode(c),lv=ArkSkillLevels.get(c.id,c.level);assert.ok(lv);
 Object.assign(o.skill,{blackboard:{...lv.blackboard},duration:lv.duration,spCost:lv.spCost,isPassive:lv.isPassive});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);o.sp=o.skill.spCost;o.cd=999;
 return o;
}
function contactEnemy(o,id=100,extra={}){return modeEnemy(o,id,{x:o.col+.1,y:o.row,...extra});}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,blockeeCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${blockHelper}
 const rows=[];
 for(const c of blockeeCases){
  const o=makeBlockeeCase(c),baseBlock=operatorBlockCount(o),e=contactEnemy(o),outside=modeEnemy(o,999,{x:o.col+3});
  ArkOperatorCombat.assignBlocks();assert.equal(e.blockerId,o.id);assert.equal(outside.blockerId,null);
  assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.ok(o.skillBlockeeState);assert.deepEqual(o.skill.effects,[]);
  assert.equal(o.skill.combatMechanic,undefined);assert.equal(o.sp,0);
  if(c.id==='skchr_acfend_3'){
   const damage=Math.round(150*c.bb.atk_scale*.75);assert.equal(e.maxHp-e.hp,damage,'source first periodic pulse');
   modeNear(operatorDefense(o),200*(1+c.bb.def));assert.equal(operatorBlockCount(o),baseBlock+c.bb.block_cnt);
   B.time=.99;update(0,0);assert.equal(e.maxHp-e.hp,damage,'source interval boundary');
   B.time=1;update(0,0);assert.equal(e.maxHp-e.hp,2*damage);assert.equal(o.skillBlockeeState.effects[0].emitted,2);
   const e2=contactEnemy(o,101);ArkOperatorCombat.assignBlocks();assert.equal(e2.blockerId,o.id);
   e.x=o.col+2;ArkOperatorCombat.assignBlocks();B.time=2;update(0,0);
   assert.equal(e.maxHp-e.hp,2*damage,'unblocked target receives no future pulse');assert.equal(e2.maxHp-e2.hp,damage,'new blockee joins next pulse');
   o.atk=200;const live=operatorAttackPower(o,buffMul(o).atk);assert.equal(live,200);B.time=3;update(0,0);
   assert.equal(e2.maxHp-e2.hp,damage+Math.round(live*c.bb.atk_scale*.75),'live owner ATK with shared buffs');
   assert.equal(o.sp,0);assert.equal(B.projectiles.length,0,'Buff pulse emits no basic projectile');
  }else{
   assert.equal(e.hp,e.maxHp,'maintained status does not deal periodic damage');assert.ok(ArkSkillBlockees.stunned(e));
   assert.equal(e.stunUntil,undefined,'source status owns a separate clock');assert.ok(enemyActionInterrupted(e));
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*c.bb.atk);
   modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2+c.bb.base_attack_time);
   assert.equal(useMode(o),true);settleMode();assert.ok(e.hp<e.maxHp,'ordinary mode attack remains active');o.cd=999;
   const state=e.sourceBlockeeStatuses;ArkSkillBlockees.update();assert.equal(e.sourceBlockeeStatuses.length,1,'repeated membership update is idempotent');
   e.stunUntil=9;e.x=o.col+2;ArkOperatorCombat.assignBlocks();assert.equal(ArkSkillBlockees.stunned(e),false,'query rechecks unblock before cleanup');
   ArkSkillBlockees.update();assert.equal(e.sourceBlockeeStatuses,undefined);assert.equal(e.stunUntil,9,'other source stun is not erased');
   e.x=o.col+.1;ArkOperatorCombat.assignBlocks();ArkSkillBlockees.update();assert.ok(ArkSkillBlockees.stunned(e));
   e.stunImmune=true;assert.equal(ArkSkillBlockees.stunned(e),false);e.stunImmune=false;
   assert.equal(state[0].sourceId,o.id);
  }
  assert.equal(outside.hp,outside.maxHp);endOperatorSkill(o);assert.equal(o.skillBlockeeState,undefined);assert.equal(e.sourceBlockeeStatuses,undefined);
  assert.equal(ArkSkillBlockees.stunned(e),false);modeNear(operatorDefense(o),200);assert.equal(operatorBlockCount(o),baseBlock);
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }
 // Periodic clocks cross the last partial step before expiry, exclude the
 // exact end boundary, and preserve damage statistics/kill delivery.
 {const c=blockeeCases.find(c=>c.id==='skchr_acfend_3'&&c.level===7),o=makeBlockeeCase(c),e=contactEnemy(o);ArkOperatorCombat.assignBlocks();castSkill(o);
  const damage=Math.round(150*c.bb.atk_scale*.75),count=Math.ceil(c.duration);B.time=c.duration+.25;update(0,0);
  assert.equal(e.maxHp-e.hp,damage*count,'all source nextAt < until emitted before expiry');assert.equal(o.skillBlockeeState,undefined);
  const dead=contactEnemy(o,111,{hp:1,maxHp:1});o.sp=o.skill.spCost;ArkOperatorCombat.assignBlocks();const kills=o._kills||0;castSkill(o);
  assert.ok(dead.dead);assert.equal(o._kills,kills+1);assert.ok(B.damageFeedback.some(h=>h.damageType==='arts'));
 }
 // Ending just one source never clears other source records or timed stun.
 {const c=blockeeCases.find(c=>c.id==='skchr_zumama_2'&&c.level===7),o=makeBlockeeCase(c),e=contactEnemy(o);ArkOperatorCombat.assignBlocks();castSkill(o);e.stunUntil=50;
  e.sourceBlockeeStatuses.push({key:'unrelated',sourceId:999,skillId:'other',effectIndex:0,kind:'stun',buffKey:'stun',until:50});
  endOperatorSkill(o);assert.equal(e.stunUntil,50);assert.equal(e.sourceBlockeeStatuses.length,1);assert.equal(e.sourceBlockeeStatuses[0].sourceId,999);
 }
 // Death clears both owner state and only its maintained target source.
 for(const id of new Set(blockeeCases.map(c=>c.id))){const c=blockeeCases.find(c=>c.id===id&&c.level===7),o=makeBlockeeCase(c),e=contactEnemy(o);ArkOperatorCombat.assignBlocks();castSkill(o);o.hp=0;tryKill(o);
  assert.equal(o.skillBlockeeState,undefined);assert.equal(ArkSkillBlockees.stunned(e),false);}
 // Natural enemy execution cancels an unissued old action during maintained
 // stun and resumes after the owning skill ends.
 {const c=blockeeCases.find(c=>c.id==='skchr_zumama_2'&&c.level===7),o=makeBlockeeCase(c),e=contactEnemy(o,800,{canAttack:true,atk:1000,attackTime:1,cd:0,applyWay:'MELEE'});
  o.sp=0;update(.01,.01);assert.ok(e.atkPhase,'ordinary enemy begins a real action');
  o.sp=o.skill.spCost;castSkill(o);const hp=o.hp;update(.5,.5);
  assert.equal(e.atkPhase,null,'maintained source stun cancels unissued action');assert.equal(o.hp,hp);
  endOperatorSkill(o);e.cd=0;update(.01,.01);assert.ok(e.atkPhase);update(1,1);assert.ok(o.hp<hp,'enemy action resumes after source detach');
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of blockeeCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:3043,name:'阻挡关系模式'});
 const hostRestores=[];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+blockHelper);
  for(const id of ids)for(const stage of ['active','expiry']){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makeBlockeeCase(${JSON.stringify(c)});o.playerId='one';contactEnemy(o);ArkOperatorCombat.assignBlocks();castSkill(o);o.cd=999;`);
   runtime.advance(stage==='active'?.55:c.duration-.3);const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' '+stage+' blockee source/clock replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,stage});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-blockees-receipts.json',JSON.stringify({scope:'Two full owner-to-blockees source programs: periodic arts damage and source-owned maintained stun; native frame and enemy defensive-SP boundaries retained',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL MODE BLOCKEES OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostRestores.length+' host restores; unblock/detach/death, exact source clock, existing stun preservation and damage/kill consumers');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
