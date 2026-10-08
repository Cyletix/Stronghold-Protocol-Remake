'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].activation==='passive'&&data.profiles[id].capability==='passive-skill');
assert.equal(ids.length,2,'run only after the complete passive provider has been generated');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:0}));});
assert.equal(cases.length,20);
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const passiveHelper=`
function makePassive(c){
 const o=makeMode(c),lv=ArkSkillLevels.get(c.id,c.level);assert.ok(lv);
 Object.assign(o.skill,{blackboard:{...lv.blackboard},duration:lv.duration,spCost:0,isPassive:true});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);
 o.sp=0;o.cd=999;o.skillState=null;delete o.clientProgramState;
 return o;
}
function noPassiveCast(o){
 assert.ok(!o.skillState,'passive binding must not manufacture an active skill state');
 assert.equal(o.clientProgramState,undefined,'passive source has no active Buff cursor');
 assert.equal(o.sp,0);assert.equal(castSkill(o),false,'passive cannot be manually cast');
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,passiveCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${passiveHelper}
 const rows=[];
 for(const c of passiveCases){
  const o=makePassive(c);assert.ok(o.skill.clientProgram);assert.ok(o.skill.skillMode);assert.deepEqual(o.skill.effects,[]);
  assert.equal(o.skill.isPassive,true);assert.equal(o.skill.spCost,0);noPassiveCast(o);
  if(c.id==='skchr_zumama_1'){
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*c.bb.atk,'passive ATK adds source base exactly once');
   modeNear(operatorDefense(o),200*(1+c.bb.def),'passive DEF without active skillState');
   for(let i=0;i<3;i++)update(.1,.1);noPassiveCast(o);
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*c.bb.atk,'repeated updates cannot stack owner passive');
   o.buffs.push({atk:1.2,def:1.1,until:10});
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*(c.bb.atk+.2),'legacy percentage plus passive source');
   modeNear(operatorDefense(o),200*(1+c.bb.def+.1));o.buffs=[];
   o.atk=0;o.def=0;o.attributeBase.atk=0;o.attributeBase.def=0;
   modeNear(operatorAttackPower(o,buffMul(o).atk),0);modeNear(operatorDefense(o),0);
   o.atk=150;o.def=200;o.attributeBase.atk=100;o.attributeBase.def=200;
  }else{
   const e1=modeEnemy(o,100),e2=modeEnemy(o,101),outside=modeEnemy(o,102,{x:o.col-4}),air=modeEnemy(o,103,{flying:true});
   assert.equal(operatorAction(o),'attack');assert.equal(useMode(o),true);settleMode();o.cd=999;
   for(const e of [e1,e2]){
    assert.equal(e.maxHp-e.hp,120,'passive mode delivers one physical body to each eligible enemy');
    modeNear(ArkOperatorCombat.movementMultiplier(e),1+c.bb.move_speed);
    assert.equal(ArkOperatorCombat.sourceBuffActive(e,'mantic_s_1'),true);
    modeNear(e.operatorMoveSpeedDebuffs.mantic_s_1.until,c.bb.duration);
   }
   assert.equal(outside.hp,outside.maxHp);assert.equal(air.hp,air.maxHp);assert.equal(ArkOperatorCombat.sourceBuffActive(air,'mantic_s_1'),false);
   noPassiveCast(o);B.time=c.bb.duration-.01;modeNear(ArkOperatorCombat.movementMultiplier(e1),1+c.bb.move_speed);
   B.time=c.bb.duration;assert.equal(ArkOperatorCombat.movementMultiplier(e1),1,'finite hit Buff expires independently of permanent source binding');
   o.cd=0;assert.equal(useMode(o),true);settleMode();o.cd=999;
   const until=e1.operatorMoveSpeedDebuffs.mantic_s_1.until;assert.ok(until>B.time);
   o.hp=0;tryKill(o);assert.ok(o.dead);assert.ok(!ArkSkillModes.active(o));
   modeNear(ArkOperatorCombat.movementMultiplier(e1),1+c.bb.move_speed,'emitted finite Buff survives its source death');
   B.time=until;assert.equal(ArkOperatorCombat.movementMultiplier(e1),1);
  }
  o.hp=0;if(!o.dead)tryKill(o);assert.ok(o.dead);assert.equal(ArkClientPrograms.layers(o,'atk',B.time).multiplier,0);
  assert.equal(o.clientProgramState,undefined);assert.ok(!o.skillState);
  o.dead=false;o.hp=o.maxHp;o.row=3;o.col=3;o.deployAt=B.time;o.deployT=2;o.deployed=true;
  noPassiveCast(o);assert.equal(operatorAction(o),'attack');
  if(c.id==='skchr_zumama_1'){modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*c.bb.atk);modeNear(operatorDefense(o),200*(1+c.bb.def));}
  else assert.ok(ArkSkillModes.active(o),'passive attack mode returns through binding, not a new cast');
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of passiveCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.isPassive,true);assert.equal(r.skill.spCost,0);assert.deepEqual(r.skill.effects,[]);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    assert.ok(!r.skillState);rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:7112,name:'公共被动技能'});
 const hostRestores=[];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+passiveHelper);
  for(const id of ids)for(const phase of ['attached','source-dead']){
   const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var o=makePassive(${JSON.stringify(c)});o.playerId='one';var e=modeEnemy(o);useMode(o);settleMode();o.cd=999;`);
   runtime.advance(.3);
   if(phase==='source-dead')runtime.__testMachine.run('o.hp=0;tryKill(o);');
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' '+phase+' passive source replay');assert.deepEqual(actual.rng,expected.rng);
   runtime.__testMachine.run('assert.ok(!B.operators[0].skillState);assert.equal(B.operators[0].clientProgramState,undefined);');
   hostRestores.push({skillId:id,phase});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-passive-receipts.json',JSON.stringify({scope:'Complete PassiveSkill owner attributes and mode attachment hit Buffs. No active cast, SP lock or skillState; not whole-operator completion.',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL PASSIVE OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostRestores.length+' host restores; no cast/SP/skillState, permanent owner layers, finite hit lifecycle and redeploy');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
