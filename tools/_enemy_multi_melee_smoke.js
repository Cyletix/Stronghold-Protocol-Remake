'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies.enemy_1516_jakill;
const helpers=`
const multiSource=${JSON.stringify(record)};
function multiBattle(){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:100000,
  atk:0,def:100,magicRes:0,attackTime:100,blockCnt:1,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 const o=B.operators[0];Object.assign(o,{atk:0,def:100,magicRes:0,attributeBase:{atk:0,def:100,aspd:1},
  basicAttack:{action:'attack',damageType:'phys'},cd:999,deployed:true,deployT:5,deployAt:0,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,
  skill:null,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  flow:null,attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:1});
 const source=JSON.parse(JSON.stringify(multiSource));
 const e={...source,enemyId:'enemy_1516_jakill',x:3,y:2.5,hp:source.maxHp,atkType:'arts',dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,source);B.enemies.push(e);
 // Explicit mode is the tested contract boundary, not a fake Reborn implementation.
 ArkExternalCombat.setMode(e,1);return e;
}
function multiSkill(e){return ArkExternalCombat.profile(e).skills.find(s=>s.kind==='selector-sp-multi-melee');}
function multiStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function multiUntil(test,max=1800){for(let i=0;i<max;i++){if(test())return;multiStep();}throw Error('multi-melee condition did not occur');}
function multiReady(e){e.externalSkills.sp=3;multiUntil(()=>e.atkSchedule?.skillId===multiSkill(e).id);return e.atkSchedule;}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=multiBattle(),skill=multiSkill(e);assert.ok(skill);
  assert.equal(e.externalSkills.sp,0);e.cd=999;multiStep(60);assert.equal(e.externalSkills.sp,0);
  e=multiBattle();multiUntil(()=>e.externalSkills.sp===3);
  assert.ok(!e.atkSchedule.skillId,'three ordinary successful outputs charge shared SP');
  multiUntil(()=>e.atkSchedule?.skillId===skill.id);assert.equal(e.externalSkills.sp,0);
  let cast=e.atkSchedule,o=B.operators[0],hp=o.hp;
  assert.equal(cast.hitOffsets.length,2);assert.ok(Math.abs(cast.hitOffsets[1]-cast.hitOffsets[0]-.2)<1e-9);
  assert.ok(Math.abs(cast.total-e.attackTime)<1e-6,'negative maxAnimScale does not cap the duration at one animation');
  assert.equal(ArkEnemySkills.defensePenetration(e,cast),.6);
  e.epAttack=.8;e.epType='nervous';
  multiUntil(()=>cast.nextHit===1);assert.equal(hp-o.hp,660,'700 ATK - (100 DEF * 40%) = 660 per hit');
  assert.ok(!(B.combatEffects||[]).some(f=>f.kind==='enemy-melee-finish'),'first hit does not feed the final-only effect');
  // Changing the source board mid-cast cannot alter its remaining strike or Buff.
  e.sourceSkills.find(s=>s.prefabKey==='armorpiercing').blackboard.find(b=>b.key==='def_penetrate').value=.1;
  multiUntil(()=>cast.nextHit===2);assert.equal(hp-o.hp,1320);assert.equal(e.externalSkills.sp,0);
  assert.equal(o.ep.nervous,undefined,'complete direct skill payload excludes ordinary attack EP');e.epAttack=0;
  assert.equal(B.combatEffects.filter(f=>f.kind==='enemy-melee-finish').length,1);
  multiUntil(()=>cast.skillFinished);assert.equal(cast.castBuff,undefined);
  assert.equal(ArkEnemySkills.defensePenetration(e,cast),0);hp=o.hp;
  multiUntil(()=>o.hp<hp);assert.equal(hp-o.hp,600,'the following ordinary melee hit has no cast penetration');

  e=multiBattle();o=B.operators[0];o.dodge=1;cast=multiReady(e);multiUntil(()=>cast.nextHit===2);
  assert.equal(o.hp,100000);assert.equal(B.combatEffects.filter(f=>f.kind==='enemy-melee-finish').length,1,
   'source nonmissable visual still occurs on a dodged final attack');

  e=multiBattle();o=B.operators[0];cast=multiReady(e);multiUntil(()=>cast.nextHit===1);hp=o.hp;o.removed=true;
  multiUntil(()=>cast.skillFinished);assert.equal(o.hp,hp,'removed input is never hit or replaced by a nearby target');
  assert.ok(!(B.combatEffects||[]).some(f=>f.kind==='enemy-melee-finish'));

  e=multiBattle();cast=multiReady(e);multiUntil(()=>cast.nextHit===1);
  e.hp=0;killEnemy(e);assert.ok(e.dead);assert.equal(cast.castBuff,undefined);
  assert.equal(ArkEnemySkills.defensePenetration(e,cast),0,'death clears the ability-owned Buff');

  e=multiBattle();cast=multiReady(e);multiUntil(()=>cast.nextHit===1);hp=B.operators[0].hp;
  ArkExternalCombat.setMode(e,0);assert.equal(e.atkSchedule,cast,'source interruptOnDetach=false retains its cast');
  multiUntil(()=>cast.nextHit===2);assert.equal(hp-B.operators[0].hp,660,'retained cast keeps physical damage and its own Buff');
  multiUntil(()=>cast.skillFinished);assert.equal(cast.castBuff,undefined);

  e=multiBattle();o=B.operators[0];o.blockCnt=0;e.externalSkills.sp=3;e.cd=999;multiStep(60);
  assert.ok(!e.atkSchedule?.skillId,'input-target melee needs its physical blocker, not any nearby ranged target');
  o.blockCnt=1;e.silenceUntil=B.time+3;multiStep(30);assert.ok(!e.atkSchedule?.skillId);e.silenceUntil=0;
  cast=multiReady(e);ArkEnemySkills.finish(e,cast,'interrupted');
  assert.equal(cast.castBuff,undefined);assert.equal(ArkEnemySkills.defensePenetration(e,cast),0);

  e=multiBattle();cast=multiReady(e);o=B.operators[0];hp=o.hp;
  cast.elapsed=cast.hitOffsets[0]-.01;update(.25,.125);
  assert.equal(cast.nextHit,2);assert.equal(hp-o.hp,1320,'a large simulation tick drains both due outputs once');

  e=multiBattle();cast=multiReady(e);o=B.operators[0];hp=o.hp;
  const originalInflict=inflictDamage;
  inflictDamage=function(target,...args){const result=originalInflict(target,...args);
   if(target===o&&!e.dead){e.hp=0;killEnemy(e);}return result;};
  try{cast.elapsed=cast.hitOffsets[0]-.01;update(.25,.125);}finally{inflictDamage=originalInflict;}
  assert.equal(cast.nextHit,1);assert.equal(hp-o.hp,660,'owner death during first hit cancels a second output due in the same tick');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:117,name:'多段近战施法存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'const e=multiBattle();const cast=multiReady(e);multiUntil(()=>cast.nextHit===1);');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies[0].atkSchedule.nextHit,1);
  assert.equal(checkpoint.battle.enemies[0].atkSchedule.castBuff.value,.6);
  machine.run('multiStep(150);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('multiStep(150);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'host restore preserves hit cursor, cast Buff, cleanup, damage and SP');
 }finally{runtime.dispose();}
 console.log('MULTI MELEE OK: explicit mode, two separate penetrated hits, final effect, cast cleanup, source SP and real host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
