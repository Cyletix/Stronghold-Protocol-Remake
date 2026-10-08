'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].capability==='maintained-aura');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const auraHelper=`
function makeAura(c){const o=makeMode(c);o.cd=999;return o;}
function quietAura(){for(const o of B.operators)o.cd=999;}
function sourceAuraEnd(o,at){B.time=at;quietAura();update(0,0);}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,auraCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 ${helper}${auraHelper}
 const rows=[];
 for(const c of auraCases){
  const o=makeAura(c);assert.equal(o.skill.sourceId,c.id);assert.ok(o.skill.skillMode);assert.ok(o.skill.clientProgram);
  assert.equal(o.skill.combatMechanic,undefined);assert.equal(o.skill.medicMechanic,undefined);assert.deepEqual(o.skill.effects,[]);
  if(c.id.startsWith('skchr_slbell')){
   const a=modeEnemy(o,100),b=modeEnemy(o,101,{flying:true}),outside=modeEnemy(o,102,{x:o.col-6}),invalid=modeEnemy(o,103,{untargetable:true});
   assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.equal(o.sp,0);
   for(const e of [a,b])assert.ok(ArkSkillAuras.has(e));assert.equal(ArkSkillAuras.has(outside),false);assert.equal(ArkSkillAuras.has(invalid),false);
   if(c.id==='skchr_slbell_1'){
    modeNear(ArkSkillAuras.attribute(a,'attack_speed',100),100+c.bb.attack_speed);
    modeNear(ArkHunter.enemyTempo(a,B.time),Math.max(.1,(100+c.bb.attack_speed)/100),'actual enemy action tempo consumes source ASPD');
    assert.equal(enemyDef(a),30);
   }else{
    modeNear(enemyDef(a),30*(1+c.bb.def));
    modeNear(ArkSkillAuras.attribute(a,'magic_resistance',25),25*(1+c.bb.magic_resistance));
   }
   const saved=[a.x,a.y];a.x=o.col-6;ArkSkillAuras.update();assert.equal(ArkSkillAuras.has(a),false,'leave range withdraws source');
   [a.x,a.y]=saved;ArkSkillAuras.update();assert.ok(ArkSkillAuras.has(a),'entry reapplies source');
   B.enemies=[a,b,outside];assert.equal(useMode(o),true);assert.ok(B.projectiles.length);
   B.time=.499999;quietAura();update(0,0);assert.equal(a.hp,a.maxHp);assert.equal(b.hp,b.maxHp,'no body before source delay');
   B.time=.5;quietAura();update(0,0);
   const count=c.bb['attack@max_target']||1,res=25*(1+(c.bb.magic_resistance||0)),damage=Math.round(150*(1-res/100));
   assert.equal(B.enemies.filter(e=>e.hp<e.maxHp).length,count);
   for(const e of B.enemies.filter(e=>e.hp<e.maxHp))assert.equal(e.maxHp-e.hp,damage,'delayed source body uses effective target RES');
   assert.equal(outside.hp,outside.maxHp);assert.equal(o.sp,0);
   sourceAuraEnd(o,c.duration);assert.equal(ArkSkillAuras.has(a),false);assert.equal(enemyDef(a),30);
  }else if(c.id==='skchr_ceylon_2'){
   o.hp=9000;const a=modeAlly(o,2,{hp:1000,cd:999}),b=modeAlly(o,3,{hp:2000,cd:999}),other=modeAlly(o,4,{hp:3000,cd:999}),outside=modeAlly(o,5,{row:o.row,col:o.col-6,cd:999});
   assert.equal(castSkill(o),true);assert.equal(operatorAction(o),'heal');assert.equal(o.sp,0);
   for(const a of [o,...B.operators.filter(x=>x!==o&&x!==outside)])modeNear(ArkSkillAuras.statusResistance(a),-c.bb.one_minus_status_resistance);
   assert.equal(ArkSkillAuras.statusResistance(outside),0);
   const healed=100*(1.5+c.bb.atk);assert.equal(performHealingAction(o),true);
   modeNear(a.hp,1000+healed);modeNear(b.hp,2000+healed);assert.equal(other.hp,3000);assert.equal(o.hp,9000);
   assert.equal(o.sp,0);sourceAuraEnd(o,c.duration);
   assert.equal(ArkSkillAuras.statusResistance(a),0);modeNear(operatorAttackPower(o,buffMul(o).atk),150);
   assert.equal(operatorAction(o),'heal','base medic action survives controller detach');
  }else{
   const caster=modeAlly(o,2,{profession:'CASTER',row:o.row,col:o.col-6,cd:999}),guard=modeAlly(o,3,{profession:'WARRIOR',cd:999});
   assert.equal(castSkill(o),true);assert.equal(ArkSkillModes.action(o),undefined);
   modeNear(operatorAttackPower(o,buffMul(o).atk),100*(1.5+c.bb.atk));
   modeNear(operatorAttackPower(caster,buffMul(caster).atk),100*(1.5+c.bb.atk),'global caster receives multiplier once');
   modeNear(operatorAttackPower(guard,buffMul(guard).atk),150,'profession-filtered ally is excluded');
   modeNear(ArkOperatorCombat.attackInterval(o,o.skill),2/(1+c.bb.attack_speed/100));
   sourceAuraEnd(o,c.duration);modeNear(operatorAttackPower(caster,buffMul(caster).atk),150);
  }
  assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillAuraState,undefined);
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }
 // An already launched direct body holds its source plan across skill expiry;
 // owner death cancels the pending body. These are shared timing conventions.
 for(const id of ['skchr_slbell_1','skchr_slbell_2']){
  const c=auraCases.find(c=>c.id===id&&c.level===7);let o=makeAura(c),e=modeEnemy(o);
  castSkill(o);useMode(o);endOperatorSkill(o);B.time=.5;quietAura();update(0,0);assert.equal(e.maxHp-e.hp,Math.round(150*.75));
  o=makeAura(c);e=modeEnemy(o);castSkill(o);useMode(o);o.hp=0;tryKill(o);B.time=.5;quietAura();update(0,0);
  assert.equal(e.hp,e.maxHp,'dead owner cannot deliver pending body');assert.equal(ArkSkillAuras.has(e),false);
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of auraCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:2035,name:'持续光环模式'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+auraHelper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   const body=id.startsWith('skchr_slbell')?'modeEnemy(o,501);castSkill(o);useMode(o);':'modeAlly(o,2,{profession:"CASTER",hp:1000,cd:999});castSkill(o);';
   runtime.__testMachine.run(`var o=makeAura(${JSON.stringify(c)});o.playerId='one';${body}quietAura();`);
   const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' aura ownership/priority and pending body replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-aura-receipts.json',JSON.stringify({scope:'Four complete maintained-aura skills; native source values with documented timing and override conventions',receipts,seasonReceipts,hostRestores:ids},null,2));
 console.log('SKILL MODE AURA OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+ids.length+' host restores; source entry/exit/expiry, two-target healing, caster-only global attributes and delayed direct body');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
