'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const table=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const ids=f.ctx.ArkMedicSkills.periodicSkills;
const cases=Object.entries(chars).flatMap(([cid,c])=>(c.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?table[s.skillId].levels.map((r,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(r.blackboard.map(b=>[b.key,b.value])),spCost:r.spData.spCost,initSp:r.spData.initSp,max:r.spData.maxChargeTime})):[]));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function periodicMedic(c,entry=null,elite=false){
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const e=entry||debugTacticalEntry(c.cid),r=finalizeOperator(e,null,[],elite);
 const initial={...r,id:1,charId:c.cid,name:e.name,profession:e.profession,position:e.position,col:5,row:3,dir:'right',rangeGrids:entryRangeGrids(e,elite),
  hp:100000,maxHp:100000,atk:100,def:200,attributeBase:{atk:100,def:200,aspd:1},cd:999,sp:r.skill.spCost*r.skill.maxCharge,buffs:[],events:[],combatTalents:[],garrisonAdd:null,attackCrit:null};
 startBattle([initial],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];o.sp=o.skill.spCost*o.skill.maxCharge;o.deployed=true;o.deployAt=0;o.deployT=2;o.cd=999;return o;
}
function recipient(o,id=100,extra={}){
 const cell=o.cells.find(([r,c])=>r!==o.row||c!==o.col);
 const t={id,charId:'patient',col:cell[1],row:cell[0],dir:'right',cells:[cell],profession:'GUARD',position:'MELEE',basicAttack:{action:'attack'},hp:10000,maxHp:100000,atk:100,def:0,attributeBase:{atk:100,def:0,aspd:1},attackTime:2,cd:999,sp:0,skill:null,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,...extra};B.operators.push(t);return t;
}
function activatePeriodic(o){if(o.skill.medicMechanic.passiveCharge){o.cd=0;return performHealingAction(o);}return castSkill(o);}
function ticks(time){B.time=time;ArkMedicSkills.update();}
function verifyPeriodic(c,entry=null,elite=false){
 const o=periodicMedic(c,entry,elite),s=o.skill,b=c.bb,isHeal=c.id!=='skchr_bldsk_2';
 assert.equal(s.sourceId,c.id);assert.ok(s.medicMechanic);assert.equal(s.duration,-1);assert.equal(s.spCost,c.spCost);assert.equal(s.initSp,c.initSp);assert.equal(s.maxCharge,c.max);assert.equal(JSON.stringify(s.blackboard),JSON.stringify(b));assert.equal(operatorAction(o),'heal');
 const t=recipient(o,100,{hp:isHeal?10000:100000}),sp=o.sp;
 if(c.id==='skchr_ccheal_1'){
  assert.equal(castSkill(o),false);update(0,0);assert.equal(o.sp,sp);assert.equal(t.hp,10000);assert.ok(!t.medicEffects?.length);
  const hook=window.onBondGarrison;let events=0;o.garrisonAdd={};window.onBondGarrison=kind=>{if(kind==='skill')events++;};try{assert.equal(activatePeriodic(o),true);}finally{window.onBondGarrison=hook;o.garrisonAdd=null;}assert.equal(events,0,'Gavial charge is not a skill-start event');assert.equal(t.hp,10100);
 }else{assert.equal(activatePeriodic(o),true);assert.equal(t.hp,isHeal?10000:100000,'no initial extra heal or HP loss');}
 assert.equal(o.sp,sp-s.spCost);assert.ok(!o.skillState,'target effect does not lock caster SP');assert.equal(t.medicEffects.length,1);
 const before=t.hp;t.commandShield=3;t.elementShields=[{capacity:999}];const targetSp=t.sp;
 ticks(.999);assert.equal(t.hp,before);ticks(1);
 near(t.hp-before,isHeal?100*b.heal_scale_2:-t.maxHp*b.hp_ratio);assert.equal(t.commandShield,3);assert.equal(t.sp,targetSp);
 if(isHeal){
  o.atk=9999;t.hp=50000;ticks(2);near(t.hp,50000+100*b.heal_scale,'cached ATK, live HP threshold with strict half boundary');
  t.hp=49999;ticks(3);near(t.hp,49999+100*b.heal_scale_2);t.hp=t.maxHp-1;ticks(4);assert.equal(t.hp,t.maxHp,'healing clamps to max');
 }else{near(buffMul(o).atk,1+b.atk);near(buffMul(t).atk,1+b.atk);assert.ok(B.combatEffects.some(e=>e.kind==='medic-blood'));
  t.buffs.push({atk:1.5,until:999});near(buffMul(t).atk,1.5+b.atk,'shared additive ATK layer');
 }
 const hp=t.hp,previous=t.medicEffects[0]?.ticks||b.duration/b.interval;ticks(b.duration);
 if(!isHeal)near(t.hp,hp-t.maxHp*b.hp_ratio*(b.duration/b.interval-previous));
 assert.equal(t.medicEffects.length,0);if(!isHeal)near(buffMul(t).atk,1.5);
 const ended=t.hp;ticks(b.duration+3);assert.equal(t.hp,ended,'expiry does not leak later ticks');
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,periodicCases:cases,sourceSeasons:seasons});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of periodicCases)verifyPeriodic(c);`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  for(const entry of ROSTER_LIST)for(const c0 of periodicCases.filter(c=>c.cid===entry.charId&&c.level===1))for(const elite of [false,true]){
   const slot=sourceSeasons[sid].charShopChessDatas[entry.chessId],level=sourceSeasons[sid].charChessDataDict[elite?slot.goldenChessId:slot.chessId].status.skillLevel;
   verifyPeriodic(periodicCases.find(c=>c.id===c0.id&&c.level===level),entry,elite);done.push([sid,c0.id,elite?'elite':'normal'].join('/'));
  }
 }return done;})()`);
 f.run(`{
 const gav=periodicCases.find(c=>c.id==='skchr_ccheal_2'&&c.level===10),war=periodicCases.find(c=>c.id==='skchr_bldsk_2'&&c.level===10);
 // Full HP recipients may receive S2; direct-heal exclusions still hold on later ticks.
 let o=periodicMedic(gav),t=recipient(o),full=recipient(o,101,{hp:100000}),bad=recipient(o,102,{basicAttack:{noDirectHeal:true}}),dead=recipient(o,103,{dead:true}),pending=recipient(o,104,{deployAt:99}),out=recipient(o,105,{row:99,col:99});
 activatePeriodic(o);assert.equal(full.medicEffects.length,1);for(const e of [bad,dead,pending,out])assert.ok(!e.medicEffects?.length);
 t.basicAttack={noDirectHeal:true};ticks(1);assert.equal(t.hp,10000);t.basicAttack={action:'attack'};
 // Caster death does not cancel a recipient's cached heal; no positional/range recheck.
 o.hp=0;tryKill(o);t.col=99;const hp=t.hp;ticks(2);near(t.hp,hp+80);assert.equal(o.medicEffects.length,0);
 t.hp=0;tryKill(t);assert.equal(t.medicEffects.length,0);B.dp=99;B.time=t.respawnAt;respawnOperators();assert.equal(t.dead,false);t.hp=50000;ticks(B.time+1);assert.equal(t.hp,50000,'no effect on next deployment');
 // Deterministic ticks and threshold transitions across a long update.
 function sequence(times){o=periodicMedic(gav);t=recipient(o,100,{hp:49990});activatePeriodic(o);for(const time of times)ticks(time);return t.hp;}
 near(sequence([1,2,3,4,5,6,7,8,9,10]),sequence([10]));
 // Same caster refresh is bounded (local stacking convention), with no compounded ATK each frame.
 o=periodicMedic(war);t=recipient(o,100,{hp:100000});activatePeriodic(o);ticks(1);o.sp=o.skill.spCost;activatePeriodic(o);assert.equal(t.medicEffects.length,1);near(buffMul(t).atk,1.9);ticks(2);near(t.hp,94000);ticks(16);near(buffMul(t).atk,1);assert.equal(t.medicEffects.length,0);
 // Self-only is valid; others may include non-healable allies and summons, never an enemy or absent unit.
 o=periodicMedic(war);assert.equal(castSkill(o),true);assert.equal(o.medicEffects.length,1);o=periodicMedic(war);t=recipient(o,100,{basicAttack:{noDirectHeal:true}});activatePeriodic(o);assert.equal(t.medicEffects.length,1);
 o=periodicMedic(war);t=recipient(o);B.operators.pop();t.combatToken=true;B.summoneds.push(t);activatePeriodic(o);assert.equal(t.medicEffects.length,1);
 t.hp=1;t.commandShield=5;ticks(1);assert.equal(t.dead,true);assert.equal(t.commandShield,5);assert.equal(t.medicEffects.length,0);
 // A lasting ally buff remains after its caster dies, but clears on recipient form change.
 o=periodicMedic(war);t=recipient(o,100,{hp:100000});activatePeriodic(o);o.hp=0;tryKill(o);ticks(1);near(t.hp,97000);near(buffMul(t).atk,1.9);
 t.hp=0;tryKill(t);assert.equal(t.medicEffects.length,0);near(buffMul(t).atk,1);
 // Death prevention must not erase the still-living recipient's effect.
 o=periodicMedic(war);t=recipient(o,100,{hp:1});activatePeriodic(o);const immortal=ArkOperatorCombat.immortal;try{ArkOperatorCombat.immortal=x=>x===t;ticks(1);}finally{ArkOperatorCombat.immortal=immortal;}assert.equal(t.hp,1);assert.equal(t.dead,undefined);assert.equal(t.medicEffects.length,1);
 // Source-supported dormant tactical and doll transforms clear recipient state through their own lifecycles.
 t.basicAttack={action:'attack',subProfession:'dollkeeper',bb:{duration:20,max_hp:0},dollkeeper:{rangeGrids:[{row:0,col:0}]}};t.charId='char_369_bena';
 assert.equal(ArkDollkeeper.enter(t),true);assert.equal(t.medicEffects.length,0);assert.ok(!t.buffs.some(b=>b.medicEffectKey));
 o=periodicMedic(war);t=recipient(o,100,{hp:100000,tacticalToken:true,temporary:false,stacks:1,blockCnt:1,blockPerStack:1,interval:10});B.operators.pop();B.summoneds.push(t);activatePeriodic(o);ArkTactician.retreat(t);assert.equal(t.medicEffects.length,0);
 // Two copies with the same local unit ID have different player/source effect keys.
 o=periodicMedic(war);o.playerId='one';t=recipient(o,100,{hp:100000});activatePeriodic(o);const firstKey=t.medicEffects[0].key;
 o.playerId='two';o.sp=o.skill.spCost;activatePeriodic(o);assert.equal(t.medicEffects.length,2);assert.notEqual(t.medicEffects[1].key,firstKey);near(buffMul(t).atk,2.8,'explicit cross-copy local stacking convention');
 // RNG endpoints can select either ally; consumes the game's persisted stream once per cast.
 for(const roll of [0,.999]){o=periodicMedic(war);const a=recipient(o,100),b=recipient(o,101);const rng=gameRandom;try{gameRandom=()=>roll;activatePeriodic(o);}finally{gameRandom=rng;}assert.equal(!!a.medicEffects?.length,roll===0);assert.equal(!!b.medicEffects?.length,roll!==0);}
 o=periodicMedic(gav);t=recipient(o);activatePeriodic(o);o.sp=0;o.cd=999;update(.5,.5);near(o.sp,.5,'SP recharges while recipient HoT lives');assert.equal(t.hp,10000);update(.5,.5);near(t.hp,10080,'real update consumes periodic ledger');
 startBattle([o],[],100);assert.equal(B.operators[0].medicEffects.length,0,'next battle resets effect state');
 assert.throws(()=>ArkMedicSkills.configure({sourceId:'skchr_ccheal_2',duration:-1,blackboard:{...gav.bb,interval:0}}),/Invalid/);
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:481115,name:'持续治疗'});
 try{p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   p.__testMachine.run(`var healer=periodicMedic(${JSON.stringify(c)});healer.playerId='one';var patient=recipient(healer,100,{playerId:'two',hp:40000});activatePeriodic(healer);healer.sp=0;healer.cd=999;`);
   const checkpoint=p.snapshot();p.advance(1.2);const expected=p.snapshot();p.restore(checkpoint);p.advance(1.2);const actual=p.snapshot();assert.deepEqual(actual.battle,expected.battle,id+' signed two-owner periodic replay');assert.deepEqual(actual.rng,expected.rng);
   const target=actual.battle.operators[1];assert.equal(target.playerId,'two');assert.equal(target.medicEffects[0].sourcePlayerId,'one');assert.equal(target.medicEffects[0].ticks,2);assert.equal(target.sp,0);
   nearHost(target.hp,id==='skchr_bldsk_2'?34000:id==='skchr_ccheal_1'?40204:40100);
  }
  const war=cases.find(c=>c.id==='skchr_bldsk_2'&&c.level===7);
  p.__testMachine.run(`var healer=periodicMedic(${JSON.stringify(war)});healer.playerId='one';recipient(healer,100,{playerId:'two',hp:100000});recipient(healer,101,{playerId:'two',hp:100000});`);
  const before=p.snapshot();p.__testMachine.run('activatePeriodic(healer)');const selected=p.snapshot();assert.notDeepEqual(selected.rng,before.rng,'activation consumes durable random state');
  p.restore(before);p.__testMachine.run('healer=B.operators[0];activatePeriodic(healer)');const replay=p.snapshot();assert.deepEqual(replay.battle,selected.battle,'restored RNG selects the same ally');assert.deepEqual(replay.rng,selected.rng);
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/periodic-medic-receipts.json'),JSON.stringify({date:'2026-09-14',levels:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level})),bindings,limits:'source bodies only; stacking across copies, module healing modifiers, exact client tick phase pending'},null,2));
 console.log('PERIODIC MEDIC OK '+cases.length+' source levels, '+bindings.length+' season variants, '+ids.length+' signed two-owner replays');
}
function nearHost(a,b){assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);}
main().catch(e=>{console.error(e);process.exitCode=1;});
