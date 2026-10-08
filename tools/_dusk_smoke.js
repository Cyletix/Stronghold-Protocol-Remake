'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const levels=[1,2,3].flatMap((n,slot)=>skills['skchr_dusk_'+n].levels.map((s,i)=>({slot,level:i+1,id:'skchr_dusk_'+n,sp:s.spData.spCost,init:s.spData.initSp,duration:s.duration,bb:Object.fromEntries(s.blackboard.map(b=>[b.key,b.value]))})));
const talents=chars.char_2015_dusk.talents[0].candidates.map(t=>({phase:Number(t.unlockCondition.phase.slice(-1)),potential:t.requiredPotentialRank,cap:t.blackboard.find(b=>b.key==='max_stack_cnt').value}));
const eq=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json').uniequip_002_dusk;
const modules=eq.phases.flatMap(p=>[0,4].map(potential=>({phase:2,potential,module:p.equipLevel,cap:(p.parts.flatMap(x=>x.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.name==='化境'&&t.requiredPotentialRank<=potential).at(-1)||chars.char_2015_dusk.talents[0].candidates.filter(t=>t.unlockCondition.phase==='PHASE_2'&&t.requiredPotentialRank<=potential).at(-1)).blackboard.find(b=>b.key==='max_stack_cnt').value})));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function dusk(c={},entry=null,elite=false){
 const cid='char_2015_dusk';ACCOUNT.ops[cid]={evolve:c.phase??2,level:c.charLevel??1,skillLevel:c.level??7,potential:(c.potential??0)+1,trust:0,selectedSkill:c.slot??2};G.skillChoices[cid]=c.slot??2;
 let e=entry||{...ROSTER[cid],debugLibrary:true,module:null};
 if(c.module){const b=ROSTER[cid];e={...b,profile:{...b.profile,backupCharPotRank:c.potential,normal:{...b.profile.normal,evolvePhase:'PHASE_2',charLevel:60,equipLevel:c.module}}};}
 const stats=finalizeOperator(e,null,[],elite);startBattle([{...stats,id:1,charId:cid,name:e.name,profession:e.profession,position:e.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(e,elite),garrisonAdd:null}],[],100);
 Object.assign(B,{time:0,dp:7,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null,traps:[]});
 const o=B.operators[0];Object.assign(o,{sp:0,cd:0,deployAt:0,deployT:2,deployed:true});
 const lv=BDATA.level;lv.buildable=Array.from({length:lv.rows},()=>Array(lv.cols).fill('MELEE'));lv.grid=Array.from({length:lv.rows},()=>Array(lv.cols).fill('tile_road'));return o;
}
function foe(x,y,extra={}){const e={id:100+B.enemies.length,visualId:100+B.enemies.length,enemyId:'fixture',x,y,hp:100000,maxHp:100000,def:0,magicRes:0,atk:10,canAttack:true,applyWay:'MELEE',rangeRadius:0,moveSpeed:0,attackTime:2,cd:999,path:[{x,y},{x:x+2,y}],pi:1,...extra};B.enemies.push(e);return e;}
function land(){for(const p of B.projectiles.splice(0))if(p.basicAttack)ArkOperatorCombat.impact(p);}
function fire(o){assert.equal(ArkOperatorCombat.attack(o),true);land();}
function verify(c,entry=null,elite=false){
 const o=dusk(c,entry,elite),cells=JSON.stringify(o.cells);assert.equal(o.skill.spCost,c.sp);assert.equal(o.skill.initSp,c.init);assert.equal(o.skill.duration,c.duration);near(buffMul(o).atk,1,'no unconditional kill stacks');
 const target=foe(6,3),nearby=foe(7.3,3),air=foe(6,3,{flying:true});if(c.slot===1){nearby.hp=40000;air.hp=50000;}o.sp=o.skill.spCost;
 if(c.slot!==0)assert.equal(castSkill(o),true);
 const plan=ArkOperatorCombat.planFor(o,o.skill);const power=operatorAttackPower(o,buffMul(o).atk),before=target.hp;fire(o);
 const expected=Math.round(power*(c.slot===0?c.bb.atk_scale:1));near(before-target.hp,expected,'actual skill arts damage');assert.ok(air.hp<100000,'caster can hit air');
 if(c.slot!==1)assert.ok(nearby.hp<100000,'enlarged splash');
 else {near(40000-nearby.hp,Math.round(power*c.bb.damage_scale),'below half HP arts bonus');near(50000-air.hp,Math.round(power),'exact half HP excludes bonus');near(o.cd,o.attackTime/buffMul(o).aspd,'S2 source attack-speed cadence');}
 if(c.slot===2){near(o.cd,o.attackTime*(1+c.bb.base_attack_time)/buffMul(o).aspd,'interval multiplied by 1.4');assert.equal(o.cells.length,o.skill.rangeGrids.length);}
 assert.equal(B.summoneds.length,1,'first main attack creates one entity even on range-all skill');const s=B.summoneds[0];assert.equal(s.charId,'token_10015_dusk_drgn');assert.equal(B.dp,7);assert.equal(s.blockCnt,2);assert.equal(s.atk,398);assert.equal(s.maxHp,1997);assert.equal(s.def,302);assert.equal(s.magicRes,50);near(s.attackTime,1.9);assert.equal(s.cells.length,5);assert.ok(B.combatEffects.some(f=>f.kind==='ink-rise'));
 s.hp=100;B.time=5;fire(o);if(c.slot===2){assert.equal(s.hp,s.maxHp);assert.equal(s.expiresAt,30);}else {assert.equal(s.hp,100);assert.equal(s.expiresAt,25);}
 endOperatorSkill(o);assert.equal(JSON.stringify(o.cells),cells);assert.equal(s.dead,false,'skill end keeps remaining summon lifetime');near(buffMul(o).atk,1);return o;
}
function stackCase(c){
 const o=dusk({...c,slot:0,level:1}),t=o.combatTalents.find(t=>t.name==='化境');assert.ok(t);assert.equal(t.blackboard.find(b=>b.key==='max_stack_cnt').value,c.cap);
 for(let i=0;i<c.cap+2;i++)killEnemy(foe(6,3),o);assert.equal(o._duskStacks,c.cap);near(ArkOperatorCombat.attackBonus(o),c.cap*.02);near(buffMul(o).atk,1+o.attributeBase.atk*c.cap*.02/o.atk);
 const previous=o._duskStacks;killEnemy(B.enemies[0],o);assert.equal(o._duskStacks,previous,'dead enemy counted once');o.hp=0;tryKill(o);assert.equal(o._duskStacks,0);B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);near(ArkOperatorCombat.attackBonus(o),0);
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,levels,talents,modules});f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of levels)verify(c);for(const c of talents)stackCase(c);for(const c of modules)stackCase(c);`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');for(const e of ROSTER_LIST.filter(e=>e.charId==='char_2015_dusk'))for(const elite of [false,true])for(const slot of [0,1,2]){const tr=trainingProfile(e,elite),c=levels.find(c=>c.slot===slot&&c.level===tr.skillLevel);verify(c,e,elite);done.push([sid,elite,slot]);}}return done;})()`);assert.equal(bindings.length,6);
 f.run(`{
 let o=dusk({phase:0,slot:0,level:1});foe(6,3);fire(o);assert.equal(B.summoneds.length,0,'unpromoted lacks first attack talent');
 o=dusk({slot:0,level:10});o.sp=o.skill.spCost;assert.equal(ArkOperatorCombat.attack(o),false);assert.equal(o.sp,o.skill.spCost);assert.equal(B.summoneds.length,0,'no target holds first attack and skill');foe(6,3,{flying:true});fire(o);assert.equal(B.summoneds.length,1,'air target over legal ground still creates ground token');
 o=dusk({slot:0,level:1});BDATA.level.buildable[3][6]='RANGED';foe(6,3);fire(o);assert.equal(B.summoneds.length,0);BDATA.level.buildable[3][6]='MELEE';fire(o);assert.equal(B.summoneds.length,0,'failed first summon still consumes first attack');
 o=dusk();const e=foe(6,3);fire(o);let s=B.summoneds[0];s.hp=100;assert.equal(healOperator(o,s,50),0);assert.equal(healOperator(s,s,50),0);near(healOperator(o,s,50,{regen:true}),50,'regeneration allowed');
 s.hp=s.maxHp;const b=foe(6,3),third=foe(6,3),air=foe(6,3,{flying:true});ArkOperatorCombat.assignBlocks();assert.equal([e,b,third].filter(e=>e.blockerId===s.id).length,2);assert.equal(air.blockerId,null);
 s.cd=0;const before=e.hp,unhit=b.hp;fire(s);near(before-e.hp,398);assert.equal(b.hp,unhit,'token single-target arts');assert.equal(air.hp,100000);near(s.cd,1.9);
 const spare=foe(7,3);spare.hp=100;fire(s);assert.ok(!spare.dead,'own blocked enemies have priority');
 third.dead=true;air.dead=true;o.sp=o.skill.spCost;castSkill(o);const plan=ArkOperatorCombat.planFor(o,o.skill);assert.equal(plan.preferUnblocked,true);ArkOperatorCombat.attack(o);assert.equal(B.projectiles.at(-1).target,spare,'S3 prefers unblocked over nearer blocked');land();
 s.hp=0;tryKill(s);ArkOperatorCombat.assignBlocks();assert.ok(e.blockerId!==s.id);assert.equal(s.tacticalDormant,undefined);B.time=99;assert.equal(s.dead,true);
 o=dusk();foe(6,3);fire(o);s=B.summoneds[0];assert.equal(ArkTactician.retreat(s),true);assert.equal(s.removed,true);assert.equal(s.tacticalDormant,false);
 o=dusk();const doomed=foe(6,3,{hp:1});fire(o);s=B.summoneds[0];assert.ok(doomed.dead);assert.equal(o._duskStacks,1,'summon precedes lethal main attack');near(ArkOperatorCombat.attackBonus(o),.02);
 const kill=foe(6,3,{hp:1});fire(s);assert.equal(o._duskStacks,2,'own token kill feeds caster');const other={...s,id:'other',ownerId:999};killEnemy(foe(7,3),other);assert.equal(o._duskStacks,2);
 o=dusk();foe(6,3);fire(o);s=B.summoneds[0];o.cd=999;s.cd=999;B.time=24.9;update(.05,.05);assert.equal(s.dead,false);update(.05,.05);assert.equal(s.dead,true,'absolute 25-second expiry');
 o=dusk();foe(6,3);ArkOperatorCombat.attack(o);const pending=B.projectiles[0];o.hp=0;tryKill(o);B.dp=99;B.time=o.respawnAt;respawnOperators();ArkOperatorCombat.impact(pending);assert.equal(B.summoneds.length,0,'old epoch projectile cannot spawn on new deployment');
 B.projectiles=[];B.enemies=[];foe(6,3);fire(o);assert.equal(B.summoneds.length,1,'new deployment first attack restored');s=B.summoneds[0];o.hp=0;tryKill(o);assert.equal(s.dead,true,'owner death removes token');
 o=dusk();B.operators.push({id:20,row:3,col:6,hp:100,dead:false});foe(6,3);fire(o);assert.equal(B.summoneds.length,0,'operator occupancy prevents overwrite');
 o=dusk();B.traps=[{row:3,col:6}];foe(6,3);fire(o);assert.equal(B.summoneds.length,0,'trap occupancy prevents overwrite');
 for(const c of modules){o=dusk({...c,slot:2});assert.equal(JSON.stringify(o.rangeGrids),JSON.stringify(ArkAttackProfiles.char_2015_dusk.modules.uniequip_002_dusk[c.module-1].rangeGrids));const before=JSON.stringify(o.cells);o.sp=o.skill.spCost;castSkill(o);endOperatorSkill(o);assert.equal(JSON.stringify(o.cells),before,'module range restored after skill');}
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:2015,name:'小自在'});
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);rt.__testMachine.run(`var o=dusk({slot:2,level:10});o.playerId='one';foe(6,3);o.sp=o.skill.spCost;castSkill(o);B.operators.push({...o,id:2,playerId:'two',row:7,col:1,sp:0,cd:999,skillState:null});ArkOperatorCombat.attack(o);`);
  const saved=rt.snapshot();rt.advance(.6);const expected=rt.snapshot();rt.restore(saved);rt.advance(.6);let actual=rt.snapshot();assert.deepEqual(actual.battle,expected.battle);assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.summoneds[0].playerId,'one');assert.equal(actual.battle.summoneds[0].ownerId,1);
  rt.__testMachine.run(`var s=B.summoneds[0];s.hp=100;B.time=5;fire(B.operators[0]);`);const refreshed=rt.snapshot();rt.advance(26);const ended=rt.snapshot();rt.restore(refreshed);rt.advance(26);actual=rt.snapshot();assert.deepEqual(actual.battle,ended.battle);assert.deepEqual(actual.rng,ended.rng);
 }finally{rt.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/dusk-receipts.json'),JSON.stringify({skillLevels:levels.length,talents:talents.length,modules:modules.length,bindings,signedReplays:2,limits:'exact projectile frame phase, cross-copy refresh, Y/ISW modules and complete mode effect combinations pending'},null,2));
 console.log('DUSK OK 30 skill levels, 4 talent candidates, 6 X-module variants, '+bindings.length+' fixed-slot skill variants, freeling lifecycle and 2 signed restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
