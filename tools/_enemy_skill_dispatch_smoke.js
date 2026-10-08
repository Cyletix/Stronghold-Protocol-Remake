'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const helpers=`
function skillBattle(){
 startBattle(Array.from({length:3},(_,i)=>({id:i+1,charId:'char_002_amiya',col:3+i,row:3,position:'MELEE',maxHp:10000,
  atk:0,def:100,magicRes:25,attackTime:100,blockCnt:i===0?1:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const [i,o]of B.operators.entries())Object.assign(o,{hp:10000,maxHp:10000,atk:0,def:100,magicRes:25,
  attributeBase:{atk:0,def:100,aspd:1},basicAttack:{action:'attack',damageType:'phys'},
  cd:999,deployed:true,deployT:5,deployAt:0,skill:null,skillState:null,blockCnt:i===0?1:0,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,
  attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1});
 const e={enemyId:'enemy_1373_ltnhor_2',x:3,y:2.5,hp:100000,maxHp:100000,atk:800,def:0,magicRes:0,
  rangeRadius:3,applyWay:'RANGED',attackTime:2,moveSpeed:0,atkType:'phys',dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return e;
}
function skillStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function skillUntil(test,max=600){for(let i=0;i<max;i++){if(test())return;skillStep();}throw Error('skill condition did not occur');}
function skillMetrics(){const e=B.enemies[0];return {mode:e.externalCombatMode,sp:e.externalSkills.sp,
  slots:e.externalSkills.skills,phase:e.atkPhase,skill:e.atkSchedule?.skillKey,
  targets:(e.atkTargets||[]).map(o=>o.id),projectiles:B.projectiles.map(p=>({type:p.damageType,target:p.target?.id,dmg:p.dmg})),
  hp:B.operators.map(o=>o.hp)};}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=skillBattle(),data=ArkExternalCombat.profile(e);
  assert.equal(data.skills.length,2);assert.equal(data.skillSp.regenPerSecond,0);
  assert.equal(e.externalCombatMode,0);assert.equal(e.externalSkills.sp,0);
  e.cd=999;skillStep(60);assert.equal(e.externalSkills.sp,0,'source increment zero does not become one SP per second');
  e.cd=0;skillStep();assert.equal(e.atkPhase,'windup');assert.equal(e.externalSkills.sp,0,'cast start is not ON_SPELL_ON');
  skillUntil(()=>e.atkSchedule?.enemySpCharged===true);
  assert.equal(e.externalSkills.sp,1);assert.ok(!e.atkSchedule.skillId);
  ArkEnemySkills.onSpellOn(e,e.atkSchedule);assert.equal(e.externalSkills.sp,1,'repeated event callback does not charge twice');
  skillUntil(()=>!!e.atkSchedule?.skillId);
  assert.equal(e.atkSchedule.skillKey,'attackTwoTarget');
  assert.equal(e.externalSkills.sp,0,'two actual source charge events are spent before the skill windup');
  assert.deepEqual(Array.from(e.atkTargets,o=>o.id),[1,3],'physical blocker first, then highest hatred/deployment order');
  const slot=e.externalSkills.skills[e.atkSchedule.skillId],normalCd=e.cd;
  assert.equal(slot.casts,1);
  const beforeHp=B.operators.map(o=>o.hp);
  skillUntil(()=>e.atkPhase==='recover');
  assert.equal(e.cd,normalCd,'a skill pauses the normal attack cooldown');
  assert.equal(e.externalSkills.sp,0,'the two-target skill has no ordinary-ability charge siblings');
  const emitted=B.projectiles.filter(p=>p.owner===e);
  assert.ok(emitted.length>=1);assert.ok(emitted.every(p=>p.damageType==='phys'));
  skillUntil(()=>B.projectiles.length===0);
  assert.deepEqual(Array.from(B.operators,(o,i)=>beforeHp[i]-o.hp),[700,0,700]);
  assert.equal(slot.casts,1,'damage targets cannot increase the cast count');

  e=skillBattle();e.externalSkills.sp=1;const state=e.externalSkills;
  ArkExternalCombat.setMode(e,1);assert.equal(e.externalSkills,state);assert.equal(state.sp,1,'owner SP is shared across mode attachments');
  state.sp=2;skillStep();assert.equal(e.atkSchedule.skillKey,'attackTwoTarget_enthu');
  assert.equal(e.atkSchedule.damageType,'arts');assert.equal(state.sp,0);
  const consumedSlot=state.skills[e.atkSchedule.skillId];
  ArkExternalCombat.setMode(e,0);assert.equal(e.atkSchedule,null);assert.equal(state.sp,0,'mode cancellation never refunds the spent SP');
  assert.equal(consumedSlot.casts,1);

  e=skillBattle();e.externalSkills.sp=2;e.silenced=true;skillStep();
  assert.ok(!e.atkSchedule?.skillId,'silence prevents starting an enemy skill');
  assert.equal(e.externalSkills.sp,2);
  e=skillBattle();e.sourceSkills=[];e.externalSkills.sp=2;skillStep();assert.ok(!e.atkSchedule?.skillId,'explicit empty source skill list disables imported skills');
  e=skillBattle();e.externalSkills.sp=2;B.operators.forEach(o=>o.untargetable=true);skillStep();
  assert.ok(!e.atkSchedule?.skillId);assert.equal(e.externalSkills.sp,2,'no valid selector target cannot spend SP');

  e=skillBattle();e.sourceSkills=data.skills.map(s=>({prefabKey:s.skillKey,priority:0,spCost:2,cooldown:5,initCooldown:0,
    blackboard:[{key:'max_target',value:1},{key:'atk_scale',value:1.5}]}));
  e.externalSkills.sp=2;skillStep();assert.equal(e.atkTargets.length,1);assert.equal(e.atkSchedule.atkScale,1.5);
  const overrideSlot=e.externalSkills.skills[e.atkSchedule.skillId];
  assert.equal(overrideSlot.cooldown,5,'shared native successful cast resets a nonzero ranged cooldown at start');
  skillUntil(()=>!e.atkPhase);
  assert.ok(overrideSlot.cooldown>0&&overrideSlot.cooldown<5,'cast completion does not reset the shared cooldown again');
  e=skillBattle();e.externalSkills.sp=2;e.bossMechanics={attack:{}};skillStep();assert.ok(!e.atkSchedule?.skillId,'dedicated Boss execution retains ownership');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'共享SP技能存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'skillBattle();skillUntil(()=>!!B.enemies[0].atkSchedule?.skillId);');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies[0].externalSkills.sp,0);
  assert.equal(checkpoint.battle.enemies[0].atkTargets.length,2);
  machine.run('skillStep(40);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('skillStep(40);');
  const restored=runtime.snapshot();
  // Cosmetic hit particles use the renderer's unseeded random source. Compare
  // all battle logic, including HP, SP, targets, cast counters and projectiles.
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'mid-windup restore preserves SP spending, cast count, both targets and typed projectiles');
 }finally{runtime.dispose();}
 console.log('ENEMY SKILLS OK: source SP zero, complete ordinary charge, start-time spending, two-target cast, modes, silence, overrides and VM restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
