'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
// Source replacement healing now has its own full-level/season/flight/restore
// acceptance in _next_heal_skills_smoke; this suite retains the curated families.
const ids=f.ctx.ArkMedicSkills.baseSkills.filter(id=>f.ctx.ArkNextAttackSkillData?.profiles[id]?.kind!=='next-heal');
const cases=Object.entries(chars).flatMap(([cid,c])=>(c.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((r,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(r.blackboard.map(b=>[b.key,b.value])),duration:r.duration,spCost:r.spData.spCost,initSp:r.spData.initSp,max:r.spData.maxChargeTime,range:r.rangeId})):[]));
const helper=`
function near(a,b,message=''){assert.ok(Math.abs(a-b)<1e-6,message+': '+a+' != '+b);}
function medic(c,entry=null,elite=false){
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const e=entry||debugTacticalEntry(c.cid);assert.ok(e,c.cid+' accessible library entry');const r=finalizeOperator(e,null,[],elite);
 const o={...r,id:1,charId:c.cid,name:e.name,profession:e.profession,position:e.position,col:5,row:3,dir:'right',rangeGrids:entryRangeGrids(e,elite),
  hp:100000,maxHp:100000,atk:100,def:200,attributeBase:{atk:100,def:200,aspd:1},cd:999,attackTime:r.attackTime,sp:r.skill.spCost*r.skill.maxCharge,buffs:[],events:[],combatTalents:[],garrisonAdd:null,attackCrit:null};
 startBattle([o],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const unit=B.operators[0];unit.sp=unit.skill.spCost*unit.skill.maxCharge;unit.deployed=true;unit.deployAt=0;unit.deployT=2;unit.cd=999;return unit;
}
function patient(o,id=100,cell=null,extra={}){
 const pos=cell||o.cells.filter(c=>c[0]!==o.row||c[1]!==o.col)[(id-100)%Math.max(1,o.cells.length-1)];
 const t={id,charId:'fixture-patient',row:pos[0],col:pos[1],dir:'right',cells:[pos],profession:'GUARD',position:'MELEE',basicAttack:{action:'attack'},hp:1000+(id-100)*20,maxHp:100000,atk:0,def:0,attackTime:2,cd:999,sp:0,skill:null,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,...extra};B.operators.push(t);return t;
}
function patients(o){return Array.from({length:6},(_,i)=>patient(o,100+i));}
function baseCount(o){return operatorAttackProfile(o).healTargets||1;}
function checkMedic(c,entry=null,elite=false){
 const o=medic(c,entry,elite),s=o.skill,b=c.bb,m=s.medicMechanic||(s.clientProgram&&{kind:'sustain'});assert.ok(m);assert.equal(s.sourceId,c.id);assert.equal(s.spCost,c.spCost);assert.equal(s.initSp,c.initSp);assert.equal(s.duration,c.duration);assert.equal(s.maxCharge,c.max);assert.equal(s.realRangeId,c.range);assert.equal(JSON.stringify(s.blackboard),JSON.stringify(b));assert.equal(operatorAction(o),'heal');
 const charged=o.sp,originalCells=JSON.stringify(o.cells),originalInterval=o.attackTime;
 if(m.kind!=='sustain'){assert.equal(castSkill(o),false,'no eligible healing target');assert.equal(performHealingAction(o),false);assert.equal(o.sp,charged);}
 const targets=patients(o),before=targets.map(t=>t.hp);
 const bad=patient(o,120,null,{basicAttack:{action:'attack',noDirectHeal:true}}),out=patient(o,121,[99,99]),dead=patient(o,122,null,{dead:true}),pending=patient(o,123,null,{deployAt:99});
 const exclusions=[bad,out,dead,pending],excludedBefore=exclusions.map(t=>t.hp);
 B.enemies=[{id:999,x:o.col+1,y:o.row,hp:999,maxHp:999,moveSpeed:0,canAttack:false}];
 let count=baseCount(o),scale=1,extra=0;
 if(m.kind==='next'){
  assert.equal(castSkill(o),false,'auto next-heal cannot be manually spent');update(0,0);assert.equal(o.sp,charged);assert.equal(targets[0].hp,before[0],'next-heal waits for healing interval');
  o.cd=0;let added=[];const heal=healOperator;try{healOperator=(source,target,amount,options)=>{if(target===targets[0])added.push(amount);return heal(source,target,amount,options);};assert.equal(performHealingAction(o),true);}finally{healOperator=heal;}
  count=c.id==='skchr_myrrh_1'?2:c.id==='skchr_reckpr_1'?b.max_target:baseCount(o);scale=b.heal_scale||1;extra=c.id==='skchr_bldsk_1'?b.hp_ratio:0;
  if(extra)assert.deepEqual(added,[targets[0].maxHp*extra,100],'extra HP heal precedes normal heal');
  assert.equal(o.sp,charged-s.spCost,'exactly one charge, no self recharge');assert.ok(!o.skillState);
 }else if(m.kind==='burst'){
  assert.equal(castSkill(o),true);count=targets.length;scale=b.heal_scale;assert.ok(!o.skillState);assert.equal(o.cd,999,'instant burst leaves normal healing timer alone');
 }else{
  assert.equal(castSkill(o),true);assert.equal(targets[0].hp,before[0],'sustained skill must not add an opening heal');assert.equal(o.sp,charged-s.spCost);assert.ok(o.skillState);assert.equal(castSkill(o),false);
  if(s.rangeGrids)assert.equal(JSON.stringify(o.cells),JSON.stringify(rangeCellsFor({...o,rangeGrids:s.rangeGrids})));
  if(c.id==='skchr_folnic_1'){
   const old=JSON.parse(originalCells),delta=o.cells.filter(cell=>!old.some(c=>c[0]===cell[0]&&c[1]===cell[1]));assert.equal(delta.length,new Set(old.map(c=>c[0])).size*b.ability_range_forward_extend);assert.ok(delta.every(c=>c[1]>o.col));
  }
  const random=gameRandom;try{gameRandom=()=>0;o.cd=0;assert.equal(performHealingAction(o),true);}finally{gameRandom=random;}
  count=c.id==='skchr_myrrh_2'?baseCount(o)+1:c.id==='skchr_breeze_1'?baseCount(o)-1:c.id==='skchr_finlpp_2'?1:baseCount(o);
  scale=(1+(b.atk||0))*(b['attack@heal_scale']||1);
  const interval=c.id==='skchr_plosis_2'?originalInterval+b.base_attack_time:c.id==='skchr_finlpp_2'?originalInterval*b.base_attack_time:originalInterval;
  near(o.cd,interval/(1+(b.attack_speed||0)/100),'actual healing interval');
 }
 for(let i=0;i<targets.length;i++){
  const p=operatorAttackProfile(o),far=p.subProfession==='healer'&&dist(o,targets[i])>2?p.bb.heal_scale:1;
  const moduleHeal=['char_4196_reckpr','char_171_bldsk'].includes(c.cid)&&entry&&trainingProfile(entry,elite).equipLevel>0?1.15:1;
  near(targets[i].hp-before[i],i<count?(100*scale*far+targets[i].maxHp*extra)*moduleHeal:0,c.id+' actual target '+i);
 }
 for(let i=0;i<exclusions.length;i++)assert.equal(exclusions[i].hp,excludedBefore[i]);assert.equal(B.enemies[0].hp,999,'medical actions never harm enemy');
 if(m.kind==='sustain'){
  o.cd=999;B.enemies=[];B.time=s.duration;update(0,0);assert.equal(o.skillState,null);near(buffMul(o).atk,1);near(buffMul(o).aspd,1);assert.equal(JSON.stringify(o.cells),originalCells);near(o.sp,0);
  o.sp=s.spCost;assert.equal(castSkill(o),true);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);assert.equal(JSON.stringify(o.cells),originalCells);
 }
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,medicCases:cases,sourceSeasons:seasons});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of medicCases)checkMedic(c);`);
 const bindings=f.run(`(()=>{const verified=[];for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');const rosterBefore=ROSTER_LIST.map(o=>o.chessId).join(',');
  for(const entry of ROSTER_LIST)for(const initial of medicCases.filter(c=>c.cid===entry.charId&&c.level===1))for(const elite of [false,true]){
   const slot=sourceSeasons[sid].charShopChessDatas[entry.chessId],level=sourceSeasons[sid].charChessDataDict[elite?slot.goldenChessId:slot.chessId].status.skillLevel;
   const c=medicCases.find(c=>c.id===initial.id&&c.level===level);checkMedic(c,entry,elite);verified.push([sid,c.cid,c.id,elite?'elite':'normal'].join('/'));
  }assert.equal(ROSTER_LIST.map(o=>o.chessId).join(','),rosterBefore);
 }return verified;})()`);
 f.run(`{
 // Two uses per battle survive death/redeployment; starting the next battle resets them.
 const c=medicCases.find(c=>c.id==='skchr_susuro_2'&&c.level===10);let o=medic(c);patient(o);assert.equal(ArkMedicSkills.remaining(o),2);castSkill(o);assert.equal(ArkMedicSkills.remaining(o),1);o.hp=0;tryKill(o);
 B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);assert.equal(ArkMedicSkills.remaining(o),1);o.sp=o.skill.spCost;assert.equal(castSkill(o),true);assert.equal(ArkMedicSkills.remaining(o),0);endOperatorSkill(o,'expire');o.sp=o.skill.spCost;const sp=o.sp;assert.equal(castSkill(o),false);assert.equal(o.sp,sp);assert.equal(o.buffs.length,0);
 startBattle([o],[],100);o=B.operators[0];assert.equal(ArkMedicSkills.remaining(o),2);
 // Warfarin tests the HP condition before either healing component; exactly 50% does not trigger.
 o=medic(medicCases.find(c=>c.id==='skchr_bldsk_1'&&c.level===10));let t=patient(o,100,null,{hp:50000});o.cd=0;o.sp=4;performHealingAction(o);assert.equal(t.hp,50100);assert.equal(o.sp,5,'ordinary healing grants attack-recovery SP');
 t.hp=49999;o.cd=0;o.sp=4;performHealingAction(o);assert.equal(t.hp,75099);assert.equal(o.sp,0);
 // Failure to activate preserves the charge and leaves only normal healing.
 o=medic(medicCases.find(c=>c.id==='skchr_myrrh_1'&&c.level===10));t=patient(o);let second=patient(o,101);o.cd=0;const cast=castSkill,spBefore=o.sp;
 try{castSkill=()=>false;performHealingAction(o);}finally{castSkill=cast;}assert.equal(t.hp,1100);assert.equal(second.hp,1020);assert.equal(o.sp,spBefore);
 // Pure target RNG: both ends of the sorted injured pool are reachable, and full HP is excluded.
 o=medic(medicCases.find(c=>c.id==='skchr_finlpp_2'&&c.level===10));const pool=patients(o);const full=patient(o,110,null,{hp:100000});castSkill(o);const rand=gameRandom;
 try{for(const roll of [0,.999]){const old=pool.map(t=>t.hp);gameRandom=()=>roll;o.cd=0;performHealingAction(o);assert.equal(pool.filter((t,i)=>t.hp>old[i]).length,1);const wanted=roll===0?0:5;assert.ok(pool[wanted].hp>old[wanted]);}}finally{gameRandom=rand;}assert.equal(full.hp,100000);
 // Perfumer's existing global regeneration reads the skill-modified attack, including no-direct-heal targets.
 o=medic(medicCases.find(c=>c.id==='skchr_flower_2'&&c.level===10));t=patient(o,110,[99,99],{basicAttack:{action:'attack',noDirectHeal:true}});o.combatTalents=[{name:'薰衣草',blackboard:[{key:'atk_to_hp_recovery_ratio',value:.05}]}];castSkill(o);const hp=t.hp;ArkOperatorCombat.update(.5);near(t.hp-hp,100*3.5*.05*.5);
 assert.throws(()=>ArkMedicSkills.configure({sourceId:'skchr_myrrh_1',duration:0,blackboard:{heal_scale:1,ct:1,unknown:1}}),/Invalid/);
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:181117,name:'医疗技能'});
 try{p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   p.__testMachine.run(`var healer=medic(${JSON.stringify(c)});healer.playerId='one';var ally=patient(healer,100,null,{playerId:'two'});var ally2=patient(healer,101);if(healer.skill.medicMechanic?.kind!=='next')castSkill(healer);healer.cd=.1;`);
   const checkpoint=p.snapshot();p.advance(.7);const expected=p.snapshot();p.restore(checkpoint);p.advance(.7);const actual=p.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' signed healing replay');assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.operators[1].buffs.length,0);assert.equal(actual.battle.operators[1].sp,0);assert.equal(actual.battle.operators[1].medicSkillUses,undefined);
   if(id==='skchr_susuro_2')assert.equal(actual.battle.operators[0].medicSkillUses[id],1,'use count survives authenticated restore');
   if(id==='skchr_finlpp_2')assert.notDeepEqual(actual.rng,checkpoint.rng,'random healing advances durable RNG');
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/medic-skill-receipts.json'),JSON.stringify({date:'2026-09-14',levels:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level})),bindings,limits:'skill bodies, not full operator/talent/module acceptance; Purestream outer-range trait remains approximate'},null,2));
 console.log('MEDIC SKILLS OK '+cases.length+' source-level executions, '+bindings.length+' season variants, '+ids.length+' signed healing/charge/RNG replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
