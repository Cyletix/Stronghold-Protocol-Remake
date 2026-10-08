'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const equip=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json');
const ids=['char_4196_reckpr','char_128_plosis','char_171_bldsk'];
const cases=ids.flatMap(cid=>chars[cid].talents[0].candidates.map(t=>({cid,phase:Number(t.unlockCondition.phase.slice(-1)),potential:t.requiredPotentialRank,name:t.name,bb:Object.fromEntries(t.blackboard.map(b=>[b.key,b.value]))})));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function support(c,entry=null,elite=false){
 G.skillChoices[c.cid]=0;ACCOUNT.ops[c.cid]={evolve:c.phase,level:1,skillLevel:7,potential:c.potential+1,trust:0,selectedSkill:0};
 const e=entry||debugTacticalEntry(c.cid),stats=finalizeOperator(e,null,[],elite);
 const initial={...stats,id:1,charId:c.cid,name:e.name,profession:e.profession,position:e.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(e,elite),hp:100000,maxHp:100000,atk:100,attributeBase:{atk:100,def:200,aspd:1},buffs:[],events:[],garrisonAdd:null,attackCrit:null};
 startBattle([initial],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];o.sp=0;o.cd=999;o.deployAt=0;o.deployT=2;o.deployed=true;return o;
}
function friend(o,id=2,extra={}){
 const [row,col]=o.cells.find(([r,c])=>r!==o.row||c!==o.col);
 const t={id,charId:'patient',name:'patient',profession:'GUARD',position:'MELEE',row,col,dir:'right',rangeGrids:[{row:0,col:0}],cells:[[row,col]],hp:100000,maxHp:100000,atk:100,attributeBase:{atk:100,def:0,aspd:1},attackTime:2,cd:999,sp:0,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,basicAttack:{action:'attack'},skill:{sourceId:'fixture_skill',name:'fixture',spCost:100,maxCharge:1,spType:'INCREASE_WITH_TIME',spIncrement:1,duration:5,effects:[{type:'buff_atk',power:.1}]},...extra};B.operators.push(t);return t;
}
function castFriend(t){t.sp=t.skill.spCost;return castSkill(t);}
function defeatAt(o,extra={}){const [y,x]=o.cells.find(([r,c])=>r!==o.row||c!==o.col);const e={enemyId:'enemy_fixture',id:99,x,y,hp:0,maxHp:100,...extra};B.enemies.push(e);killEnemy(e);return e;}
function verifyTalent(c,entry=null,elite=false){
 const o=support(c,entry,elite),talent=o.combatTalents.find(t=>t.name===c.name);assert.ok(talent,c.cid);assert.equal(JSON.stringify(Object.fromEntries(talent.blackboard.map(b=>[b.key,b.value]))),JSON.stringify(c.bb));
 assert.equal(o.events.length,0);near(buffMul(o).aspd,1,'talent does not become permanent attack speed');
 const t=friend(o);
 if(c.cid==='char_4196_reckpr'){
  assert.equal(castFriend(t),true);near(o.sp,c.bb.sp);near(buffMul(o).aspd,1+c.bb.attack_speed/100);near(o.buffs.find(b=>b.medicTalent).until,c.bb.duration);
  B.time=2;endOperatorSkill(t);castFriend(t);near(o.sp,2*c.bb.sp);assert.equal(o.buffs.filter(b=>b.medicTalent).length,1);near(o.buffs.find(b=>b.medicTalent).until,2+c.bb.duration);
  B.time=2+c.bb.duration;near(buffMul(o).aspd,1);
 }else if(c.cid==='char_128_plosis'){
  near(ArkMedicSkills.naturalSpBonus(t),c.bb.sp_recovery_per_sec);update(1,1);near(o.sp,1+c.bb.sp_recovery_per_sec);near(t.sp,1+c.bb.sp_recovery_per_sec);
  o.hp=0;tryKill(o);update(1,1);near(t.sp,2+c.bb.sp_recovery_per_sec,'aura stops on caster death');
 }else{
  t.skill.spType='INCREASE_WHEN_ATTACK';const e=defeatAt(o);near(o.sp,c.bb['bldsk_t_1[self].sp']);near(t.sp,c.bb['bldsk_t_1[rand].sp']);killEnemy(e);near(o.sp,c.bb['bldsk_t_1[self].sp'],'one death event only');
 }
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,talentCases:cases});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of talentCases)verifyTalent(c);`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  for(const entry of ROSTER_LIST.filter(e=>talentCases.some(c=>c.cid===e.charId)))for(const elite of [false,true]){
   const tr=trainingProfile(entry,elite),c=talentCases.filter(c=>c.cid===entry.charId&&c.phase<=tr.evolve&&c.potential<=tr.potential).at(-1);assert.ok(c);verifyTalent(c,entry,elite);done.push([sid,entry.charId,elite?'elite':'normal'].join('/'));
  }
 }return done;})()`);
 // Extracted module upgrades preserve the exact source candidates; run them through real finalizeOperator.
 const modules=equip.uniequip_002_reckpr.phases.flatMap(p=>p.parts.flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.name==='学成于聚').map(t=>({level:p.equipLevel,cid:'char_4196_reckpr',phase:2,potential:t.requiredPotentialRank,name:t.name,bb:Object.fromEntries(t.blackboard.map(b=>[b.key,b.value]))})));
 for(const c of modules){f.ctx.modCase=c;f.run(`{
  const c=modCase,base=ROSTER.char_4196_reckpr;assert.ok(base);
  const profile={...base.profile,backupCharPotRank:c.potential,normal:{...base.profile.normal,evolvePhase:'PHASE_2',charLevel:50,equipLevel:c.level}};
  verifyTalent(c,{...base,profile},false);
 }`);}
 const moduleEffects=[];
 for(const cid of ['char_4196_reckpr','char_4139_papyrs'])for(const phase of equip['uniequip_002_'+cid.split('_').at(-1)].phases)for(const potential of [0,4]){
  const candidates=phase.parts.flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.name&&t.requiredPotentialRank<=potential),base=chars[cid].talents[0].candidates.filter(t=>t.unlockCondition.phase==='PHASE_2'&&t.requiredPotentialRank<=potential).at(-1);
  const talent=candidates.at(-1)||base,trait=phase.parts.flatMap(p=>p.overrideTraitDataBundle?.candidates||[]).filter(t=>t.requiredPotentialRank<=potential).at(-1);
  const c={cid,phase:2,level:phase.equipLevel,potential,name:talent.name,bb:Object.fromEntries(talent.blackboard.map(b=>[b.key,b.value])),trait:Object.fromEntries(trait.blackboard.map(b=>[b.key,b.value]))};moduleEffects.push(c);f.ctx.effectCase=c;
  f.run(`{
   const c=effectCase,base=ROSTER[c.cid],entry={...base,profile:{...base.profile,backupCharPotRank:c.potential,normal:{...base.profile.normal,evolvePhase:'PHASE_2',charLevel:50,equipLevel:c.level}}};
   const o=support(c,entry,false),t=friend(o,2,{hp:1000});
   assert.equal(JSON.stringify(Object.fromEntries(o.combatTalents.find(t=>t.name===c.name).blackboard.map(b=>[b.key,b.value]))),JSON.stringify(c.bb));
   for(const [key,value]of Object.entries(c.trait))assert.equal(o.basicAttack.bb[key],value,'source module trait '+key);
   if(c.cid==='char_4196_reckpr'){
    t.hp=49999;near(healOperator(o,t,100),115);t.hp=50000;near(healOperator(o,t,100),100,'strict half boundary');t.hp=1000;near(healOperator(o,t,100,{regen:true}),100,'regeneration is not direct healing');
    t.hp=1000;o.cd=0;performHealingAction(o);near(t.hp,1115,'normal healing gets source module modifier');
    t.hp=99999;near(healOperator(o,t,100),1);t.hp=1000;t.basicAttack.noDirectHeal=true;assert.equal(healOperator(o,t,100),0);
   }else{
    const next=friend(o,3,{hp:2000}),last=friend(o,4,{hp:3000});o.cd=0;performHealingAction(o);
    near(t.hp,1100);near(next.hp,2085);near(last.hp,3072.25,'two source 15% chain decays');
    for(const target of [t,next,last]){near(target.medicBarrier.amount,100*c.bb['attack@scale']);near(target.medicBarrier.until,c.bb['attack@shield_duration']);}
   }
  }`);
 }
 f.run(`{
 const rec=talentCases.find(c=>c.cid==='char_4196_reckpr'&&c.phase===2&&c.potential===0),pt=talentCases.find(c=>c.cid==='char_128_plosis'&&c.phase===2),war=talentCases.find(c=>c.cid==='char_171_bldsk'&&c.phase===2);
 let o=support(rec),t=friend(o);t.row=99;castFriend(t);assert.equal(o.sp,0);assert.ok(!o.buffs.some(b=>b.medicTalent));
 o=support(rec);t=friend(o);B.operators.pop();t.combatToken=true;B.summoneds.push(t);castFriend(t);assert.equal(o.sp,0,'summon skill is not an operator skill event');
 o=support(rec);t=friend(o);o.skillState={until:99,deltas:{}};const locked=ArkElements.skillLocked;try{ArkElements.skillLocked=u=>u===o;castFriend(t);assert.equal(o.sp,1,'explicit forced SP ignores skill and element lock');}finally{ArkElements.skillLocked=locked;}
 o.sp=o.skill.spCost*o.skill.maxCharge;endOperatorSkill(t);castFriend(t);assert.equal(o.sp,o.skill.spCost*o.skill.maxCharge,'charge cap');o.hp=0;tryKill(o);assert.ok(!o.buffs.some(b=>b.medicTalent));
 B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);assert.ok(!o.buffs.some(b=>b.medicTalent));
 // A real next-heal skill emits one start event; Gavial's passive charge does not.
 o=support(rec);t=friend(o,2,{hp:1000});o.sp=o.skill.spCost;o.cd=0;assert.equal(performHealingAction(o),true);assert.equal(o.sp,1);
 o=support(rec);t=friend(o);const s=ArkSkillLevels.get('skchr_ccheal_1',7);t.charId='char_187_ccheal';t.basicAttack={action:'heal'};t.skill={...s,sourceId:'skchr_ccheal_1',maxCharge:1,spCost:s.spCost};ArkMedicSkills.configure(t.skill);t.cells=[[o.row,o.col]];o.hp=1000;t.cd=0;t.sp=t.skill.spCost;assert.equal(performHealingAction(t),true);assert.equal(o.sp,0,'no false Gavial skill-start event');
 // Aura is strongest-only, global, natural-only, and does not unfreeze a skill clock.
 o=support(pt);t=friend(o);const copy={...o,id:3,combatTalents:JSON.parse(JSON.stringify(o.combatTalents))};B.operators.push(copy);near(ArkMedicSkills.naturalSpBonus(t),.3);
 t.row=99;near(ArkMedicSkills.naturalSpBonus(t),.3);t.skill.spType='INCREASE_WHEN_ATTACK';update(1,1);assert.equal(t.sp,0);near(ArkMedicSkills.naturalSpBonus(t),0);
 t.skill.spType='INCREASE_WHEN_TAKEN_DAMAGE';near(ArkMedicSkills.naturalSpBonus(t),0);t.skill.spType='INCREASE_WITH_TIME';t.skillState={until:99,deltas:{}};update(1,1);assert.equal(t.sp,0);
 B.operators.pop();o.deployAt=99;near(ArkMedicSkills.naturalSpBonus(t),0);o.deployAt=0;B.operators.splice(B.operators.indexOf(t),1);B.summoneds.push(t);near(ArkMedicSkills.naturalSpBonus(t),0,'summon exclusion');
 // Warfarin selects locked or full-SP allies; those selections are not redirected.
 for(const type of ['INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE']){o=support(war);t=friend(o);t.skill.spType=type;defeatAt(o);assert.equal(t.sp,2);}
 o=support(war);t=friend(o);const e=defeatAt(o,{x:99,y:99});assert.equal(o.sp,0);assert.equal(t.sp,0);
 o=support(war);defeatAt(o);assert.equal(o.sp,2,'self-only works');
 o=support(war);t=friend(o);t.skillState={until:99};defeatAt(o);assert.equal(o.sp,2);assert.equal(t.sp,0);
 o=support(war);o.skillState={until:99};t=friend(o);defeatAt(o);assert.equal(o.sp,0);assert.equal(t.sp,2,'source skill lock does not stop ally grant');
 o=support(war);t=friend(o,2,{isolated:true});const before=ArkSim.snapshot();defeatAt(o);assert.equal(t.sp,0);assert.equal(JSON.stringify(ArkSim.snapshot()),JSON.stringify(before),'empty pool consumes no RNG');
 o=support(war);t=friend(o);const alive=defeatAt(o,{revive:true});assert.equal(alive.dead,undefined);assert.equal(o.sp,0);alive.hp=0;killEnemy(alive);assert.equal(o.sp,2,'revival is not final death');
 o=support(war);t=friend(o);const leakEnemy={enemyId:'fixture',id:99,lifePointReduce:1};leak(leakEnemy);assert.equal(o.sp,0,'leaks do not grant SP');
 o=support(war);t=friend(o);B.operators.pop();B.summoneds.push(t);defeatAt(o);assert.equal(t.sp,2,'external SP can select friendly summons');
 for(const roll of [0,.999]){o=support(war);t=friend(o,2,{playerId:'one'});const u=friend(o,2,{playerId:'two'}),rng=gameRandom;try{gameRandom=()=>roll;defeatAt(o);}finally{gameRandom=rng;}assert.equal(t.sp,roll===0?2:0);assert.equal(u.sp,roll===0?0:2);}
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:501117,name:'医疗技力'});
 try{p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const cid of ids){const c=cases.find(c=>c.cid===cid&&c.phase===2&&c.potential===0);p.__testMachine.run(`var medic=support(${JSON.stringify(c)});medic.playerId='one';var ally=friend(medic,2,{playerId:'two'});friend(medic,3,{playerId:'two'});`);
   const checkpoint=p.snapshot(),event=cid==='char_171_bldsk'?'defeatAt(B.operators[0])':cid==='char_4196_reckpr'?'castFriend(B.operators[1])':'';
   if(event)p.__testMachine.run(event);p.advance(.6);const expected=p.snapshot();p.restore(checkpoint);if(event)p.__testMachine.run(event);p.advance(.6);const actual=p.snapshot();assert.deepEqual(actual.battle,expected.battle,cid+' signed replay');assert.deepEqual(actual.rng,expected.rng);
   if(cid==='char_171_bldsk')assert.notDeepEqual(actual.rng,checkpoint.rng);else assert.deepEqual(actual.rng,checkpoint.rng);assert.equal(actual.battle.operators[1].playerId,'two');
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/medic-talents-receipts.json'),JSON.stringify({date:'2026-09-14',candidates:cases.map(c=>({charId:c.cid,phase:c.phase,potential:c.potential})),bindings,moduleCandidates:modules.length,moduleEffects:moduleEffects.map(c=>({charId:c.cid,level:c.level,potential:c.potential})),signedReplays:ids.length,limits:'base talent bodies; other SP auras, complete isolation sources, healing-boost interactions and precise animation events pending'},null,2));
 console.log('MEDIC TALENTS OK '+cases.length+' source candidates, '+bindings.length+' season variants, '+modules.length+' talent upgrades, '+moduleEffects.length+' module variants, '+ids.length+' signed replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
