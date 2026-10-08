'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const sources=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies;
const sourceText=JSON.stringify(Object.fromEntries(['enemy_1151_dslntc','enemy_1151_dslntc_2'].map(key=>[key,sources[key]])));
const helpers=`
const selfSources=${sourceText};
function selfBattle(id='enemy_1151_dslntc'){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:10000,atk:0,def:0,
  attackTime:100,blockCnt:1,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const o of B.operators)Object.assign(o,{atk:0,cd:999,deployAt:0,deployT:5,skill:null,skillState:null,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,blockCnt:1});
 const source=JSON.parse(JSON.stringify(selfSources[id]));
 const e={...source,enemyId:id,hp:source.maxHp,x:3,y:2.5,dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,source);B.enemies.push(e);return e;
}
function selfStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  for(const id of Object.keys(selfSources)){
   let e=selfBattle(id),data=ArkExternalCombat.profile(e),skill=data.skills.find(s=>s.kind==='always-self-cast');
   assert.ok(skill);assert.equal(skill.trigger.kind,'source-listener');assert.equal(skill.action.duration,1);
   assert.equal(e.externalCombatMode,0);assert.equal(ArkExternalCombat.canAttack(e,{channel:'combat'}),false);
   const before=B.operators[0].hp;selfStep(60);
   assert.equal(e.atkPhase,null,'AlwaysTrigger declaration does not become a birth-time automatic cast');
   assert.equal(B.operators[0].hp,before,'empty source combat cannot use the legacy minimum-damage attack');
   assert.equal(ArkEnemySkillLifecycle.canMove(e),false);
   ArkEnemySkillLifecycle.tick(e,29,{time:B.time+29});
   assert.equal(ArkEnemySkillLifecycle.canMove(e),true,'30 seconds removes only the movement restriction');
   assert.equal(e.externalCombatMode,0);assert.equal(e.externalSkills.skills[skill.id].casts,0);
   assert.equal(ArkEnemySkillLifecycle.disarmed(e),true,'permanent listener/disarm remains after sleep timer');
   e.hp=e.maxHp*.9999;selfStep();assert.equal(e.atkPhase,null,'strict LT excludes threshold equality');
   e.hp=e.maxHp*.99;e.unbalanced=true;selfStep();assert.equal(e.atkPhase,null,'explicit UNBALANCE blocks listener');
   e.unbalanced=false;e.cd=999;e.palsyUntil=B.time+10;selfStep();
   assert.equal(e.atkPhase,'self','force listener bypasses readiness and interrupts an ordinary cooldown');
   assert.equal(e.palsyUntil,0);assert.equal(e.externalSkills.sp,0);
   assert.equal(e.atkSchedule.target,'owner');assert.equal(e.atkTarget,null,'owner binding is a plain descriptor, not a cyclic damage target');
   assert.equal(e.externalSkills.skills[skill.id].casts,1);assert.ok(ArkEnemySkillLifecycle.hasMark(e,data.selfCastLifecycle.awakeMark));
   selfStep(14);assert.equal(e.externalCombatMode,0);assert.equal(e.cd,999);
   selfStep(15);assert.equal(e.externalCombatMode,1,'one second of source animation finishes the cast');
   assert.equal(e.atkSchedule,null);assert.equal(e.externalSelfCast.sleepRemaining,0);
   assert.equal(ArkEnemySkillLifecycle.disarmed(e),false);assert.equal(B.operators[0].hp,before);
   assert.equal(B.projectiles.length,0,'empty self animation emits neither damage nor projectiles');
   ArkExternalCombat.setMode(e,0);selfStep(3);
   assert.equal(e.externalSkills.skills[skill.id].casts,1,'persistent mark prevents repeated wake on re-entry');
   assert.equal(e.atkPhase,null);

   e=selfBattle(id);e.sourceSkills=[];e.hp*=.5;selfStep(3);
   assert.equal(e.atkPhase,null,'explicitly absent skill prevents the caller from manufacturing one');
   e=selfBattle(id);e.sourceTalentBlackboard.push({key:'sleepwalking.hp_ratio',value:.3});e.hp*=.5;selfStep();
   assert.equal(e.atkPhase,null,'duplicate exact listener overrides reject the lifecycle');
   e=selfBattle(id);e.hp*=.5;selfStep(5);const active=e.atkSchedule;
   ArkExternalCombat.setMode(e,1);assert.equal(e.atkSchedule,active,'source interrupt-on-detach=false preserves self cast');
   assert.equal(e.externalSelfCast.sleepRemaining,0,'old mode listener and sleep detach independently');
   ArkExternalCombat.setMode(e,0);assert.equal(e.atkSchedule,active);
   selfStep(25);assert.equal(e.externalCombatMode,1);assert.equal(e.atkSchedule,null);
   assert.equal(e.externalSkills.skills[skill.id].casts,1);
  }
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'自身施法存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'selfBattle();B.enemies[0].hp*=.5;selfStep(10);');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies[0].atkPhase,'self');
  machine.run('selfStep(40);');const after=runtime.snapshot();
  runtime.restore(checkpoint);assert.equal(machine.run('B.enemies[0].atkSchedule.target'), 'owner');
  machine.run('selfStep(40);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'restore retains owner binding, permanent mark, timer phase, cast count and mode completion');
 }finally{runtime.dispose();}
 console.log('SELF CAST OK: source listener, disarm, timed immobility, explicit force, no output, once mark, modes and VM restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
