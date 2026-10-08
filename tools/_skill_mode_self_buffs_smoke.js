'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8').split('window.ArkSkillModeData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].capability==='bounded-self-buffs');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost}));});
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const selfHelper=`
function makeSelfCase(c){
 const o=makeMode(c),lv=ArkSkillLevels.get(c.id,c.level);assert.ok(lv);
 Object.assign(o.skill,{blackboard:{...lv.blackboard},duration:lv.duration,spCost:lv.spCost,isPassive:lv.isPassive});
 ArkClientPrograms.configure(o.skill,c.cid);ArkSkillModes.configure(o.skill,c.cid);
 o.sp=o.skill.spCost;o.cd=999;o.statusResistance=0;B.dp=0;B.dpMax=999;return o;
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,selfCases:cases,sourceSkills:skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${selfHelper}
 const rows=[];
 for(const c of selfCases){
  const o=makeSelfCase(c),duration=c.bb.duration??c.duration;
  assert.ok(o.skill.clientProgram);assert.ok(o.skill.skillMode);assert.deepEqual(o.skill.effects,[]);assert.equal(o.skill.combatMechanic,undefined);
  assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);modeNear(o.skillState.until,duration);
  assert.equal(operatorAction(o),'attack','self actions preserve basic attack');assert.equal(o.sp,0);
  if(c.id==='skchr_liskam_1'){
   modeNear(operatorDefense(o),200*(1+c.bb.def));
   assert.equal(inflictDamage(o,1500,false,'phys'),0,'source first hit blocked');
   assert.equal(o.clientProgramState.buffs[1].damageBlockOnce.remaining,0);
   assert.equal(inflictDamage(o,500,false,'arts'),500,'second hit reaches HP');
   modeNear(operatorDefense(o),200*(1+c.bb.def),'DEF sibling still active');assert.ok(o.skillState);
  }else if(c.id==='skchr_branch_1'){
   modeNear(operatorDefense(o),200*(1+c.bb.def));
   modeNear(ArkSkillAuras.statusResistance(o),.5,'source derived status');
   const child=ArkSkillSelfBuffs.effective(o);assert.equal(child.length,1);assert.equal(child[0].stacking.overrideKey,'status_resistance[bonus]');
   assert.equal(child[0].sourceId,o.id);assert.equal(child[0].parentBuffIndex,0);assert.equal(child[0].until,duration);
  }else{
   const p=ArkClientPrograms.defensePenetration(o),ratio=c.bb.def_penetrate||0,fixed=c.bb.def_penetrate_fixed||0;
   modeNear(p.ratio,ratio);modeNear(p.fixed,fixed);
   modeNear(operatorAttackPower(o,buffMul(o).atk),150+100*(c.bb.atk||0));
   const e=modeEnemy(o,100,{def:500});
   assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'phys'}).amount,Math.round(1000-(500*(1-ratio)-fixed)));
   assert.equal(calcDamageResult(o,e,1,{raw:1000,type:'arts'}).amount,750);
   assert.equal(useMode(o),true);settleMode();assert.ok(e.hp<e.maxHp,'source buffs do not disarm');o.cd=999;
   if(c.id==='skchr_acpion_2'){
    const money=G.money;B.time=c.bb.interval-.0001;update(0,0);assert.equal(B.dp,0,'wait first full source interval');
    B.time=c.bb.interval;update(0,0);assert.equal(B.dp,c.bb.cost);
    update(0,0);assert.equal(B.dp,c.bb.cost,'same frame never pays twice');
    B.time=duration-.0001;update(0,0);assert.equal(B.dp,c.bb.cost*c.bb.trig_cnt);
    assert.equal(o.clientProgramState.buffs[0].periodicActions.emittedCount,c.bb.trig_cnt);
    assert.equal(G.money,money,'battle DP cannot create shop money');
   }
  }
  B.time=duration+.01;update(0,0);assert.equal(o.clientProgramState,undefined);assert.equal(o.skillState,null);
  modeNear(operatorDefense(o),200);modeNear(ArkSkillAuras.statusResistance(o),0);
  assert.deepEqual(JSON.parse(JSON.stringify(ArkClientPrograms.defensePenetration(o))),{fixed:0,ratio:0});
  if(c.id==='skchr_acpion_2')assert.equal(B.dp,c.bb.cost*c.bb.trig_cnt,'count cap and no expiry payment');
  rows.push({charId:c.cid,skillId:c.id,level:c.level});
 }
 // Death/explicit end cancels only remaining payments and child lifetime.
 for(const id of ['skchr_branch_1','skchr_acpion_2']){
  const c=selfCases.find(c=>c.id===id&&c.level===7),o=makeSelfCase(c);castSkill(o);B.time=.2;
  if(id==='skchr_branch_1'){o.hp=0;tryKill(o);assert.deepEqual(ArkSkillSelfBuffs.effective(o),[]);}
  else{endOperatorSkill(o);B.time=20;update(0,0);assert.equal(B.dp,0,'cancel does not pay future DP');}
 }
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of selfCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4,source=sourceSkills[c.id].levels[level-1];
    assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.skillMode);assert.ok(r.skill.clientProgram);assert.equal(r.skill.spCost,source.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
    rows.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
   }
  }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:3047,name:'有限自身Buff'});
 const hostRestores=[];
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper+selfHelper);
  for(const id of ids)for(const stage of ['active','expiry']){const c=cases.find(c=>c.id===id&&c.level===7),duration=c.bb.duration??c.duration;
   runtime.__testMachine.run(`var o=makeSelfCase(${JSON.stringify(c)});o.playerId='one';castSkill(o);o.cd=999;${id==='skchr_liskam_1'?'inflictDamage(o,100,false,\'arts\');':''}`);
   runtime.advance(stage==='active'?.6:duration-.3);const checkpoint=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.8);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' '+stage+' bounded self source replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({skillId:id,stage});
  }
 }finally{runtime.dispose();}
 fs.writeFileSync('.runtime/skill-mode-self-buffs-receipts.json',JSON.stringify({scope:'Four complete source self programs: one-shot block, parent-derived status, fixed/ratio DEF penetration and finite cost triggers; native ordering/frame boundaries retained',receipts,seasonReceipts,hostRestores},null,2));
 console.log('SKILL MODE SELF BUFFS OK '+receipts.length+' source levels; '+seasonReceipts.length+' actual season variants; '+hostRestores.length+' host restores; source block/child/penetration/cost plus detach/death/expiry');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
