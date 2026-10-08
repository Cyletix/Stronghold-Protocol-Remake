'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const dataText=fs.readFileSync(path.join(__dirname,'../web/skill_mode_data.js'),'utf8');
const modeData=JSON.parse(dataText.slice(dataText.indexOf('window.ArkSkillModeData=')+'window.ArkSkillModeData='.length).trim().replace(/;$/,''));
const ids=Object.keys(modeData.profiles).filter(id=>!['deploy','passive','toggle'].includes(modeData.profiles[id].activation)&&!['maintained-aura','finite-ammo','blockee-effects','bounded-self-buffs','end-effects','ability-flow'].includes(modeData.profiles[id].capability));
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((lv,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),duration:lv.duration,sp:lv.spData.spCost})):[]));
const helper=`
function modeNear(actual,expected,label=''){assert.ok(Math.abs(actual-expected)<1e-6,label+': '+actual+' != '+expected);}
function makeMode(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid)||ROSTER[c.cid];assert.ok(entry,'reachable mode identity '+c.cid);
 const r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',range:3,rangeGrids:entryRangeGrids(entry,false),
  hp:10000,maxHp:10000,atk:150,def:200,attackTime:2,attributeBase:{atk:100,def:200,maxHp:10000,aspd:1},cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function modeEnemy(o,id=100,extra={}){
 const cell=o.cells.find(c=>c[0]===o.row&&c[1]>o.col)||o.cells.find(c=>c[1]>o.col)||[o.row,o.col];
 const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x:cell[1],y:cell[0],hp:1e6,maxHp:1e6,atk:0,def:30,magicRes:25,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0,...extra};B.enemies.push(e);return e;
}
function modeAlly(o,id=2,extra={}){
 const cell=o.cells.find(c=>c[0]===o.row&&c[1]>o.col)||o.cells.find(c=>c[1]>o.col)||[o.row,o.col];
 const a={...o,id,charId:'char_103_angel',row:cell[0],col:cell[1],skill:null,skillState:null,clientProgramState:undefined,basicAttack:{action:'attack'},buffs:[],sp:0,cd:999,hp:2500,...extra};B.operators.push(a);return a;
}
function settleMode(){for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];}
function useMode(o){if(operatorAction(o)==='none')return false;if(operatorAction(o)==='heal')return performHealingAction(o);return ArkOperatorCombat.attack(o);}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,modeCases:cases,modeSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of modeCases){
  const o=makeMode(c),baseCells=JSON.stringify(o.cells),baseBlock=operatorBlockCount(o);
  assert.equal(o.skill.sourceId,c.id);assert.equal(o.skill.spCost,c.sp);assert.deepEqual(JSON.parse(JSON.stringify(o.skill.blackboard)),JSON.parse(JSON.stringify(c.bb)));
  assert.ok(o.skill.clientProgram,c.id+' source attribute program bound');assert.ok(o.skill.skillMode,c.id+' source mode bound');
  assert.deepEqual(o.skill.effects,[],'legacy description operators removed');assert.equal(operatorAction(o),'attack');
  assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.equal(o.sp,0);modeNear(o.skillState.until,c.duration===-1?Number.MAX_SAFE_INTEGER:c.duration);
  const expectedAtk=150+100*(c.bb.atk||0);modeNear(operatorAttackPower(o,buffMul(o).atk),expectedAtk,'source ATK uses base once');
  const outsider=modeEnemy(o,190,{x:o.col-4,y:o.row});
  if(c.id==='skchr_podego_1'){
   assert.equal(operatorAction(o),'heal');
   const enemy=modeEnemy(o),target=modeAlly(o,2),other=modeAlly(o,3,{hp:5000}),forbidden=modeAlly(o,4,{hp:100,basicAttack:{action:'attack',noDirectHeal:true}}),outside=modeAlly(o,5,{hp:100,row:o.row,col:o.col-4});
   assert.equal(useMode(o),true);modeNear(target.hp,2500+expectedAtk,'one lowest-ratio ally healed');assert.equal(other.hp,5000);assert.equal(forbidden.hp,100);assert.equal(outside.hp,100);assert.equal(enemy.hp,enemy.maxHp);assert.equal(o.sp,0,'skill healing cannot recharge active skill');
   B.operators=[o];o.hp=1000;o.cd=0;assert.equal(useMode(o),true);modeNear(o.hp,1000+expectedAtk,'mode can heal its owner');
  }else if(c.id==='skchr_prove_2'){
   const forbidden=modeEnemy(o,101,{hp:800001}),target=modeEnemy(o,102,{hp:800000}),other=modeEnemy(o,103,{hp:799999});
   assert.equal(useMode(o),true);settleMode();assert.equal(forbidden.hp,800001,'HP above threshold excluded');
   assert.equal(target.hp,800000-Math.round(expectedAtk-30),'exact 80% target accepted');assert.equal(other.hp,799999,'single target budget');
   B.enemies=[forbidden];o.cd=0;assert.equal(useMode(o),false,'no fallback to forbidden high HP target');
  }else if(c.id==='skchr_spikes_1'||c.id==='skchr_spikes_2'){
   assert.equal(operatorBlockCount(o),c.id==='skchr_spikes_1'?0:baseBlock);
   for(let i=0;i<4;i++)modeEnemy(o,100+i);
   assert.equal(useMode(o),true);settleMode();const damaged=B.enemies.filter(e=>e.hp<e.maxHp),count=c.id==='skchr_spikes_2'?c.bb['attack@max_target']:1;
   assert.equal(damaged.length,count,'source mode target budget');
   const damage=c.id==='skchr_spikes_1'?Math.round(Math.max(150*c.bb['attack@atk_scale']*.8-30,150*c.bb['attack@atk_scale']*.8*.05))*2:Math.round(150*c.bb['attack@atk_scale']*.75);
   for(const e of damaged)assert.equal(e.maxHp-e.hp,damage,c.id+' independently calculated mode damage');
  }else if(ArkSkillModes.action(o)==='none'){
   const e=modeEnemy(o);o.hp=1000;o.cd=0;assert.equal(useMode(o),false);update(.1);
   modeNear(o.hp,1000+10000*c.bb.hp_recovery_per_sec_by_max_hp_ratio*.1,'source max-HP recovery');
   assert.equal(e.hp,e.maxHp,'natural engine does not attack while disarmed');assert.equal(o.sp,0,'disarmed channel does not gain attack recovery');
   assert.equal(B.projectiles.length,0);assert.equal(ArkSkillModes.active(o).channeling.phase,'active');
   if(c.id==='skchr_utage_1')assert.equal(operatorBlockCount(o),0);else assert.equal(operatorBlockCount(o),baseBlock+c.bb.block_cnt);
  }else{
   const frozen=ArkSkillModes.active(o).plan;
   for(let i=0;i<8;i++)modeEnemy(o,100+i);
   assert.equal(useMode(o),true);settleMode();
   const limit=frozen.blockCountLimit?(frozen.all?operatorBlockCount(o):Math.min(frozen.targets,operatorBlockCount(o))):(frozen.all?8:frozen.targets);
   const damaged=B.enemies.filter(e=>e.hp<e.maxHp);assert.equal(damaged.length,Math.min(8,limit),c.id+' generic source selector budget');
   const attack=100*(1.5+(c.bb.atk||0))*frozen.scale*(operatorAttackProfile(o).frontScale||1),one=frozen.damageType==='arts'?Math.round(attack*.75):Math.round(Math.max(attack-30,attack*.05));
   for(const e of damaged)assert.equal(e.maxHp-e.hp,one*frozen.hits,c.id+' independently calculated generic source attack');
   if(frozen.groundOnly){B.enemies=[];const air=modeEnemy(o,199,{flying:true});assert.equal(useMode(o),false,'source ground filter');assert.equal(air.hp,air.maxHp);}
   if(frozen.blockCountLimit){const oldBlock=o.blockCnt;o.blockCnt=0;B.enemies=[];modeEnemy(o);assert.equal(useMode(o),false,'zero block target budget cannot fallback to one');o.blockCnt=oldBlock;}
  }
  assert.equal(outsider.hp,outsider.maxHp);B.projectiles=[];endOperatorSkill(o,'expire');
  assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(operatorAction(o),'attack');modeNear(operatorAttackPower(o,buffMul(o).atk),150);assert.equal(operatorBlockCount(o),baseBlock);assert.equal(JSON.stringify(o.cells),baseCells,'base range restored');
 }
 // Distinguish the source target selector from ordinary targeting and check both
 // action modes through the actual engine update, rather than only the adapter.
 {
  const o=makeMode(modeCases.find(c=>c.id==='skchr_podego_1'&&c.level===7)),target=modeAlly(o),enemy=modeEnemy(o);castSkill(o);o.cd=0;update(.01);
  assert.ok(target.hp>2500);assert.equal(enemy.hp,enemy.maxHp,'engine dispatches healing mode');
  endOperatorSkill(o);o.cd=0;update(.01);settleMode();assert.ok(enemy.hp<enemy.maxHp,'skill end restores attack mode');
 }
 {
  const o=makeMode(modeCases.find(c=>c.id==='skchr_spikes_2'&&c.level===7));castSkill(o);const e=modeEnemy(o,400,{flying:true});o.cd=0;update(.01);settleMode();assert.ok(e.hp<e.maxHp,'engine mode can attack flying target');
 }
 {
  const o=makeMode(modeCases.find(c=>c.id==='skchr_spikes_2'&&c.level===7));castSkill(o);
  const own=modeEnemy(o,410,{x:o.col,y:o.row,blockerId:o.id}),air=modeEnemy(o,411,{x:o.col+1,y:o.row,flying:true}),drone=modeEnemy(o,412,{x:o.col+2,y:o.row,flying:true,sourceTags:['drone']});
  assert.equal(useMode(o),true);settleMode();assert.ok(own.hp<own.maxHp,'own blocked target keeps first priority');assert.ok(drone.hp<drone.maxHp,'explicit source drone tag has secondary priority');assert.equal(air.hp,air.maxHp,'flight alone is not the source drone tag');
 }
 for(const id of ['skchr_spikes_1','skchr_podego_1']){
  const o=makeMode(modeCases.find(c=>c.id===id&&c.level===7));castSkill(o);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.ok(!ArkSkillModes.active(o),'death removes active mode');
 }
 for(const id of modeCases.filter(c=>c.level===7&&ArkSkillModeData.profiles[c.id].action==='none').map(c=>c.id)){
  const c=modeCases.find(c=>c.id===id&&c.level===7),o=makeMode(c),e=modeEnemy(o);o.hp=1000;castSkill(o);
  o.skill.spType='INCREASE_WHEN_ATTACK';o.cd=0;update(.1);assert.equal(o.sp,0);assert.equal(e.hp,e.maxHp);
  // Advance to the last partial interval without earning earlier recovery.
  B.time=c.duration-.05;o.clientProgramState.recoveryAt=B.time;o.hp=1000;o.cd=999;update(.1);
  modeNear(o.hp,1000+o.maxHp*c.bb.hp_recovery_per_sec_by_max_hp_ratio*.05,'expiry clips final recovery interval');
  assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(operatorAction(o),'attack');
  o.cd=0;update(.01);settleMode();assert.ok(e.hp<e.maxHp,'natural expiry resumes basic attack');assert.equal(o.sp,1,'attack SP resumes after disarm ends');
  o.sp=o.skill.spCost;castSkill(o);o.hp=0;tryKill(o);assert.ok(!ArkSkillModes.active(o));assert.equal(o.clientProgramState,undefined);
 }
 window.modeFixedCount=0;
 for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of modeCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
   G.skillChoices[c.cid]=c.index;const entry=ROSTER[c.cid],r=finalizeOperator(entry,null,[],elite),source=modeSkills[c.id].levels[(elite?7:4)-1];
   assert.equal(r.skill.sourceId,c.id);assert.equal(r.skill.spCost,source.spData.spCost);assert.ok(r.skill.skillMode);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
   const o=makeMode(c);o.skill=r.skill;o.sp=r.skill.spCost;castSkill(o);if(c.id==='skchr_podego_1')modeAlly(o);else modeEnemy(o,500,{hp:500000});
   assert.equal(useMode(o),operatorAction(o)!=='none');settleMode();window.modeFixedCount++;
  }
 }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1715,name:'技能模式批次'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of ['skchr_spikes_2','skchr_podego_1','skchr_snakek_2','skchr_utage_1','skchr_huang_2']){
   const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var caster=makeMode(${JSON.stringify(c)});caster.playerId='one';castSkill(caster);
    caster.hp=1000;modeAlly(caster,2,{playerId:'two'});modeEnemy(caster,700);modeEnemy(caster,701);`);
   const active=runtime.snapshot();
   if(id==='skchr_spikes_2')runtime.__testMachine.run('useMode(caster);endOperatorSkill(caster);caster.cd=999;');
   const checkpoint=runtime.snapshot();runtime.advance(.6);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.6);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' source-mode checkpoint replay');assert.deepEqual(actual.rng,expected.rng);
   if(id==='skchr_spikes_2'){
    assert.ok(checkpoint.battle.projectiles.length>0,'checkpoint includes mode projectile after skill expiry');
    assert.equal(expected.battle.operators[1].hp,2500,'other owner is not damaged by attack mode');
    runtime.restore(active);runtime.__testMachine.run('caster=B.operators[0];useMode(caster);endOperatorSkill(caster);caster.cd=999;');runtime.advance(.6);
    assert.deepEqual(runtime.snapshot().battle,expected.battle,'restored active mode emits the same snapshotted attack');
   }else if(id==='skchr_podego_1')assert.ok(expected.battle.operators.some(o=>o.hp>1000&&o.id===1),'restored active healing mode heals lowest ratio');
   else if(id==='skchr_huang_2')assert.ok(expected.battle.operators[0].skillState,'until-detach mode remains active');
   else{assert.ok(expected.battle.operators[0].hp>1000,'restored stopped-attack mode regenerates');assert.equal(expected.battle.projectiles.length,0);assert.ok(expected.battle.enemies.every(e=>e.hp===e.maxHp));}
  }
 }finally{runtime.dispose();}
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/operator-skill-mode-receipts.json',JSON.stringify({scope:'garrison compiled mode bodies; source selectors, attribute programs and lifecycle; native frame phase and complex talent combinations remain outside this batch',sourceFingerprint:modeData.sourceFingerprint,receipts:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level}))},null,2));
 console.log('OPERATOR SKILL MODES OK '+cases.length+' level executions; '+f.run('modeFixedCount')+' actual season variants; selectors, damage, none/recovery/natural expiry, until-detach and five host mode replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
