'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const table=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const ids=f.ctx.ArkMedicSkills.protectiveSkills;
const cases=Object.entries(chars).flatMap(([cid,c])=>(c.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?table[s.skillId].levels.map((r,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(r.blackboard.map(b=>[b.key,b.value])),duration:r.duration,spCost:r.spData.spCost,initSp:r.spData.initSp,max:r.spData.maxChargeTime})):[]));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function protectiveMedic(c,entry=null,elite=false){
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const e=entry||debugTacticalEntry(c.cid),r=finalizeOperator(e,null,[],elite);
 const initial={...r,id:1,charId:c.cid,name:e.name,profession:e.profession,position:e.position,col:5,row:3,dir:'right',rangeGrids:entryRangeGrids(e,elite),
  hp:100000,maxHp:100000,atk:100,def:200,attributeBase:{atk:100,def:200,aspd:1},cd:999,sp:r.skill.spCost*r.skill.maxCharge,buffs:[],events:[],garrisonAdd:null,attackCrit:null};
 startBattle([initial],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];o.sp=o.skill.spCost*o.skill.maxCharge;o.deployed=true;o.deployAt=0;o.deployT=2;o.cd=999;return o;
}
function patient(o,id=100,extra={}){
 const cell=o.cells.find(([r,c])=>r!==o.row||c!==o.col);
 const t={id,charId:'patient',col:cell[1],row:cell[0],dir:'right',cells:[cell],profession:'GUARD',position:'MELEE',basicAttack:{action:'attack'},hp:10000,maxHp:100000,atk:100,def:0,attributeBase:{atk:100,def:0,aspd:1},attackTime:2,cd:999,sp:0,skill:null,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,...extra};B.operators.push(t);return t;
}
function barrierScale(o){return Object.fromEntries(o.combatTalents.find(t=>t.name==='博览古卷').blackboard.map(b=>[b.key,b.value]))['attack@scale'];}
function activateProtective(o){if(o.skill.sourceId==='skchr_papyrs_1'){o.cd=0;return performHealingAction(o);}return castSkill(o);}
function verifyProtective(c,entry=null,elite=false){
 const o=protectiveMedic(c,entry,elite),s=o.skill,b=c.bb,t=patient(o),sp=o.sp;
 const hasModule=entry&&trainingProfile(entry,elite).equipLevel>0,decay=hasModule ? .85 : .75;
 assert.equal(s.sourceId,c.id);assert.equal(s.duration,c.duration);assert.equal(s.spCost,c.spCost);assert.equal(s.initSp,c.initSp);assert.equal(s.maxCharge,c.max);assert.equal(JSON.stringify(s.blackboard),JSON.stringify(b));assert.equal(operatorAction(o),'heal');
 if(c.id==='skchr_papyrs_1'){
  assert.equal(castSkill(o),false);const others=[patient(o,101,{hp:20000}),patient(o,102,{hp:30000}),patient(o,103,{hp:40000})];
  assert.equal(activateProtective(o),true);near(t.hp,10000+100*b.heal_scale);near(others[0].hp,20000+100*b.heal_scale*decay);near(others[1].hp,30000+100*b.heal_scale*decay*decay);assert.equal(others[2].hp,40000);
  for(const a of [t,...others.slice(0,2)])near(a.medicBarrier.amount,100*barrierScale(o)*b.shield_scale_skill,'shield is not reduced by chain decay');
  assert.ok(!o.skillState);o.cd=0;activateProtective(o);near(t.medicBarrier.amount,100*barrierScale(o)*b.shield_scale_skill,'no stacking');assert.equal(o.sp,sp-2*s.spCost);return;
 }
 assert.equal(activateProtective(o),true);assert.equal(o.sp,sp-s.spCost+(c.id==='skchr_reckpr_2'?1:0));near(o.skillState.until,c.duration);near(buffMul(o).atk,1+b.atk);
 if(c.id==='skchr_papyrs_2'){
  assert.equal(ArkMedicSkills.primary(o),t);t.hp=t.maxHp;const others=[patient(o,101,{maxHp:99999}),patient(o,102,{maxHp:99999}),patient(o,103,{maxHp:99999}),patient(o,104,{maxHp:99999})];
  o.cd=0;assert.equal(performHealingAction(o),true);near(t.medicBarrier.amount,100*(1+b.atk)*barrierScale(o));
  for(let i=0;i<3;i++)near(others[i].hp,10000+100*(1+b.atk)*Math.pow(decay,i+1));assert.equal(others[3].hp,10000);
  near(o.cd,o.attackTime+b.base_attack_time);others[3].maxHp=200000;assert.equal(ArkMedicSkills.primary(o),t,'does not retarget when HP ranking changes');
 }else{
  o.cd=0;performHealingAction(o);const hp=t.hp;near(hp,10000+100*(1+b.atk)*(hasModule?1.15:1));assert.equal(t.medicReactions.length,1);near(t.medicReactions[0].until,b['attack@buff_duration']);
  assert.equal(inflictDamage(t,200,false,'arts'),200);near(t.hp,hp-200+b['attack@fixed_heal_value']);assert.equal(B.damageFeedback.at(-1).amount,200,'reports damage before reaction healing');
  t.commandShield=1;inflictDamage(t,99);near(t.hp,hp-200+b['attack@fixed_heal_value'],'no healing for an absorbed hit');
 }
 endOperatorSkill(o);near(buffMul(o).atk,1);assert.equal(ArkMedicSkills.primary(o),undefined);assert.equal(ArkMedicSkills.interval(o,null),null);
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,protectiveCases:cases,sourceSeasons:seasons,sourcePapTalents:chars.char_4139_papyrs.talents[0].candidates});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of protectiveCases)verifyProtective(c);`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  for(const entry of ROSTER_LIST)for(const c0 of protectiveCases.filter(c=>c.cid===entry.charId&&c.level===1))for(const elite of [false,true]){
   const slot=sourceSeasons[sid].charShopChessDatas[entry.chessId],level=sourceSeasons[sid].charChessDataDict[elite?slot.goldenChessId:slot.chessId].status.skillLevel;
   verifyProtective(protectiveCases.find(c=>c.id===c0.id&&c.level===level),entry,elite);done.push([sid,c0.id,elite?'elite':'normal'].join('/'));
  }
 }return done;})()`);
 f.run(`{
 const pap1=protectiveCases.find(c=>c.id==='skchr_papyrs_1'&&c.level===10),pap2=protectiveCases.find(c=>c.id==='skchr_papyrs_2'&&c.level===10),rec=protectiveCases.find(c=>c.id==='skchr_reckpr_2'&&c.level===10);
 // Barrier absorption is independent of damage type, precedes actual-HP feedback, and expires exactly.
 for(const type of ['phys','arts','true']){
  const o=protectiveMedic(pap1),t=patient(o);activateProtective(o);const hp=t.hp,shield=t.medicBarrier.amount;
  assert.equal(inflictDamage(t,shield/2,false,type),0);assert.equal(t.hp,hp);assert.equal(B.damageFeedback.length,0);
  near(inflictDamage(t,shield,false,type),shield/2);near(t.hp,hp-shield/2);assert.equal(t.medicBarrier,null);
 }
 let o=protectiveMedic(pap1),t=patient(o);activateProtective(o);B.time=t.medicBarrier.until;assert.equal(inflictDamage(t,100),100);ArkMedicSkills.update();assert.equal(t.medicBarrier,null);
 // Every extracted phase/potential candidate drives the barrier, without the old heal-self approximation.
 for(const candidate of sourcePapTalents){
  o=protectiveMedic(pap1);t=patient(o);o.combatTalents=[{name:candidate.name,blackboard:candidate.blackboard}];o.sp=0;o.cd=0;performHealingAction(o);
  const b=Object.fromEntries(candidate.blackboard.map(b=>[b.key,b.value]));near(t.medicBarrier.amount,100*b['attack@scale']);near(t.medicBarrier.until,b['attack@shield_duration']);
 }
 o=protectiveMedic(pap2);assert.equal(castSkill(o),false);assert.equal(o.sp,o.skill.spCost);patient(o,100,{dead:true});patient(o,101,{deployAt:99});patient(o,102,{basicAttack:{noDirectHeal:true}});patient(o,103,{col:99});assert.equal(castSkill(o),false);
 t=patient(o,104,{maxHp:200000});B.operators.pop();t.combatToken=true;B.summoneds.push(t);assert.equal(castSkill(o),true);assert.equal(ArkMedicSkills.primary(o),t);
 t.hp=0;tryKill(t);assert.ok(!o.skillState,'locked summon leaving ends the skill immediately');near(buffMul(o).atk,1);
 o=protectiveMedic(pap2);t=patient(o);activateProtective(o);t.row=99;assert.equal(performHealingAction(o),false,'out-of-range locked target does not retarget');assert.ok(o.skillState);t.row=o.cells[0][0];
 ArkMedicSkills.clear(t);assert.ok(!o.skillState,'retreat/form-change ends the lock');assert.equal(t.medicLifeEpoch,1);
 // Lock identity distinguishes equal local IDs belonging to different players.
 o=protectiveMedic(pap2);t=patient(o,100,{playerId:'one'});const other=patient(o,100,{playerId:'two',maxHp:90000});activateProtective(o);assert.equal(ArkMedicSkills.primary(o),t);ArkMedicSkills.clear(other);assert.ok(o.skillState);ArkMedicSkills.clear(t);assert.ok(!o.skillState);
 // Ally reactions remain after caster skill/death, expire, do not resurrect, and refresh once per caster.
 o=protectiveMedic(rec);t=patient(o);activateProtective(o);o.cd=0;performHealingAction(o);o.cd=0;performHealingAction(o);assert.equal(t.medicReactions.length,1);endOperatorSkill(o);const hp=t.hp;o.hp=0;tryKill(o);inflictDamage(t,200);near(t.hp,hp-50);
 B.time=10;const expired=t.hp;inflictDamage(t,200);near(t.hp,expired-200);ArkMedicSkills.update();assert.equal(t.medicReactions.length,0);
 o=protectiveMedic(rec);t=patient(o);activateProtective(o);o.cd=0;performHealingAction(o);t.hp=100;inflictDamage(t,200);assert.equal(t.hp,-100);tryKill(t);assert.equal(t.dead,true);assert.equal(t.medicReactions.length,0);
 o=protectiveMedic(rec);t=patient(o);activateProtective(o);o.cd=0;performHealingAction(o);t.medicBarrier={amount:200,until:10};let hp2=t.hp;inflictDamage(t,200);near(t.hp,hp2,'barrier blocks reaction');inflictDamage(t,200);near(t.hp,hp2-50);
 t.hp=t.maxHp-5;inflictDamage(t,1);assert.equal(t.hp,t.maxHp,'reaction healing clamps');
 ArkMedicSkills.clear(t);assert.equal(t.medicBarrier,null);assert.equal(t.medicReactions.length,0);
 o=protectiveMedic(pap2);t=patient(o);activateProtective(o);o.cd=999;o.sp=0;update(.5,.5);near(o.sp,0,'sustain locks SP');B.time=o.skillState.until-.1;update(.2,.2);assert.ok(!o.skillState);near(buffMul(o).atk,1);
 startBattle([o],[],100);assert.equal(B.operators[0].medicBarrier,null);assert.equal(B.operators[0].medicReactions.length,0);
 }`);
 // The shared display path includes a bounded, finite blue barrier indicator.
 const calls=[],ctx=new Proxy({},{get:(_,key)=>key==='fillRect'?((...a)=>{assert.ok(a.every(Number.isFinite));calls.push(a);}):()=>{},set:()=>true});
 f.ctx.ArkBattlePresentation.draw(ctx,{time:1,phase:'battle',operators:[{col:2,row:3,deployAt:0,deployT:2,maxHp:100,medicBarrier:{until:8,amount:20}}],enemies:[],summoneds:[]},64,0);assert.ok(calls.some(a=>a[3]===3&&a[2]>0),'barrier indicator rendered');
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:491116,name:'防护医疗'});
 try{p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   p.__testMachine.run(`var healer=protectiveMedic(${JSON.stringify(c)});healer.playerId='one';var target=patient(healer,100,{playerId:'two',hp:40000});activateProtective(healer);if(healer.skillState){healer.cd=0;performHealingAction(healer);}healer.sp=0;healer.cd=999;`);
   const checkpoint=p.snapshot();p.advance(.6);p.__testMachine.run('inflictDamage(B.operators[1],300)');const expected=p.snapshot();p.restore(checkpoint);p.advance(.6);p.__testMachine.run('inflictDamage(B.operators[1],300)');const actual=p.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' signed two-owner replay');assert.deepEqual(actual.rng,expected.rng);assert.deepEqual(actual.rng,checkpoint.rng,'deterministic protection does not consume RNG');assert.equal(actual.battle.operators[1].playerId,'two');
   if(id==='skchr_papyrs_2')p.__testMachine.run("assert.equal(ArkMedicSkills.primary(B.operators[0]),B.operators[1]);ArkMedicSkills.clear(B.operators[1]);assert.ok(!B.operators[0].skillState);");
   if(id==='skchr_reckpr_2')assert.equal(actual.battle.operators[1].medicReactions[0].source.playerId,'one');
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/protective-medic-receipts.json'),JSON.stringify({date:'2026-09-14',levels:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level})),bindings,talentCandidates:6,signedReplays:ids.length,limits:'source bodies; exact chain distance, barrier replacement priority, reaction stacking and lethal-order exceptions pending'},null,2));
 console.log('PROTECTIVE MEDIC OK '+cases.length+' source levels, '+bindings.length+' season variants, 6 talent candidates, '+ids.length+' signed two-owner replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
