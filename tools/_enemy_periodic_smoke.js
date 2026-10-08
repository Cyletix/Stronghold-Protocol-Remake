'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const sources=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies;
const sourceText=JSON.stringify(Object.fromEntries(['enemy_1151_dslntc','enemy_1151_dslntc_2'].map(key=>[key,sources[key]])));
const helpers=`
const periodicSources=${sourceText};
function periodicBattle(id='enemy_1151_dslntc'){
 startBattle([3,5,6].map((col,i)=>({id:i+1,charId:'char_002_amiya',col,row:3,position:'MELEE',maxHp:100000,
  atk:0,def:99999,magicRes:100,attackTime:100,blockCnt:i===0?1:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const o of B.operators)Object.assign(o,{atk:0,attributeBase:{atk:0,def:99999,aspd:1},cd:999,deployAt:0,deployT:5,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,skill:null,skillState:null,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,attackCrit:null,dodge:0});
 const source=JSON.parse(JSON.stringify(periodicSources[id]));
 const e={...source,enemyId:id,hp:source.maxHp,x:3,y:2.5,dead:false,cd:999,visualId:22,route:-1};
 setupEnemy(e,source);B.enemies.push(e);return e;
}
function periodicStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  for(const id of Object.keys(periodicSources)){
   let e=periodicBattle(id),base=e.moveSpeed;
   assert.ok(ArkExternalCombat.profile(e).periodicAbilities);
   assert.equal(ArkExternalCombat.attribute(e,'moveSpeed',base),base);
   ArkExternalCombat.setMode(e,1);
   assert.ok(Math.abs(ArkExternalCombat.attribute(e,'moveSpeed',base)-base*6)<1e-9,'source +500% multiplier produces six times base');
   const inside=B.operators[0],other=B.operators[1],outside=B.operators[2];
   const token={id:20,col:3,row:0,hp:10000,maxHp:10000,deployT:5,deployAt:0,ep:{},epThreshold:100000};
   B.summoneds.push(token);
   const hp=inside.hp,max=e.maxHp;advanceEnemyPeriodic(e,0);
   assert.equal(e.hp,max,'self damage waits for its first full interval');
   assert.equal(inside.hp,hp,'zero physical scale does not emit minimum-one HP damage');
   assert.equal(inside.ep.nervous,e.atk*.2);assert.equal(other.ep.nervous,e.atk*.2);
   assert.equal(token.ep.nervous,e.atk*.2,'source circle includes deployed summons at the exact radius');
   assert.equal(outside.ep.nervous,undefined);
   const schedule={modeIndex:1,channel:'combat',elapsed:.4,nextHit:0};e.atkSchedule=schedule;e.atkPhase='windup';
   const cd=e.cd;advanceEnemyPeriodic(e,.5);assert.equal(e.hp,max);
   let callbacks=0;const taking=ArkEnemyPassives.onTakingDamage;
   ArkEnemyPassives.onTakingDamage=()=>{callbacks++;};
   advanceEnemyPeriodic(e,.5);ArkEnemyPassives.onTakingDamage=taking;
   assert.equal(e.hp,max*.96);assert.equal(callbacks,0,'source skipModifierEvent suppresses on-taking-damage reactions');
   assert.equal(e.atkSchedule,schedule);assert.equal(schedule.elapsed,.4);assert.equal(e.cd,cd);
   assert.equal(inside.ep.nervous,e.atk*.4,'second direct named cast does not wait for ordinary attack recovery');
   const ep=inside.ep.nervous,kills=B.stats.kills;e.hp=1;advanceEnemyPeriodic(e,1);
   assert.equal(e.dead,true);assert.equal(B.stats.kills,kills+1);
   assert.equal(inside.ep.nervous,ep,'lethal periodic damage stops same-time and later named casts');
   advanceEnemyPeriodic(e,5);assert.equal(B.stats.kills,kills+1);

   e=periodicBattle(id);ArkExternalCombat.setMode(e,1);
   const op=B.operators[0];e.atkSchedule=ArkExternalCombat.attackTiming(e,e.attackTime,{channel:'combat'});
   performEnemyBasicHit(e,[op],0);
   assert.equal(op.ep.nervous,e.atk*.1,'normal attack element has exactly one source packet despite legacy epAttack');
   assert.ok(op.hp<op.maxHp,'ordinary attack still deals its physical packet');
   ArkExternalCombat.setMode(e,0);applyEnemyEpDamage(e,op);assert.equal(op.ep.nervous,e.atk*.1);
   assert.equal(ArkExternalCombat.attribute(e,'moveSpeed',base),base);
   ArkExternalCombat.setMode(e,1);assert.equal(e.moveSpeed,base);
   assert.ok(Math.abs(ArkExternalCombat.attribute(e,'moveSpeed',base)-base*6)<1e-9,'mode re-entry never multiplies stored base speed');
   e.sourceTalentBlackboard.push({key:'revive.move_speed',value:8});
   assert.equal(ArkEnemyPeriodic.resolve(e),null,'ambiguous source namespace rejects the complete group');
   assert.equal(ArkExternalCombat.attribute(e,'moveSpeed',base),base);

   e=periodicBattle(id);ArkExternalCombat.setMode(e,1);B.operators.forEach(o=>{o.col=7;o.row=7;});
   const oldRoutes=BDATA.level.routes;BDATA.level.routes=[{segs:[[{c:3,r:0}]]}];
   Object.assign(e,{route:0,seg:0,cp:0,x:3,y:2,wait:0});periodicStep(3);
   assert.ok(Math.abs(e.y-(2-base*6*.1))<1e-7,'battle movement consumes the dynamic mode attribute');
   BDATA.level.routes=oldRoutes;
  }
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'周期能力存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'periodicBattle();ArkExternalCombat.setMode(B.enemies[0],1);periodicStep(15);');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.ok(checkpoint.battle.enemies[0].externalPeriodic.elapsed>.4);
  machine.run('periodicStep(75);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('periodicStep(75);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'mid-period restore keeps all callback phases, damage, EP and mode state');
 }finally{runtime.dispose();}
 console.log('PERIODIC OK: real source groups, dynamic speed, lethal maxHP damage, independent named EP, single normal EP and VM restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
