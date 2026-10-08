'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const battleSources=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/source_battles.json'),'utf8'));
const deliverySources=Object.fromEntries(['enemy_1005_yokai_2','enemy_2010_csdcr'].map(id=>{
 const source=Object.values(battleSources.levels).map(level=>level.enemies[id]).find(Boolean);
 assert.ok(source?.canAttack&&source.rangeRadius>0,'real ranged-selector source '+id);return [id,source];
}));
f.ctx.deliveryScope=JSON.parse(fs.readFileSync(path.join(__dirname,'../work/garrison-encounter-scope.json'),'utf8')).eligibleEnemyIDs;
function assertCombatRestore(actual,expected,message){
 // Hit-particle trajectories use cosmetic Math.random; gameplay clocks,
 // projectiles, damage and the separate simulation RNG must restore exactly.
 assert.deepEqual({...actual.battle,particles:[]},{...expected.battle,particles:[]},message);
 assert.deepEqual(actual.rng,expected.rng,'source timing restore preserves combat RNG');
}
const setup=`
const externalDeliverySources=${JSON.stringify(deliverySources)};
function externalBattle(ranged=false){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:10000,atk:0,def:0,magicRes:0,attackTime:100,blockCnt:1,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 const o=B.operators[0];Object.assign(o,{cd:999,deployed:true,deployT:5,deployAt:0,skill:null,events:[],dodge:0});
 const e={enemyId:'enemy_10011_sgshot',x:3,y:2.5,hp:10000,maxHp:10000,atk:100,def:0,rangeRadius:ranged?3:0,
   applyWay:ranged?'RANGED':'MELEE',attackTime:2,moveSpeed:0,atkType:'phys',dead:false,cd:0,visualId:22,route:-1};
 B.enemies.push(e);return e;
}
function externalStep(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function sourceDeliveryBattle(enemyId){
 externalBattle(true);B.enemies=[];
 BDATA.level={...BDATA.level,rows:10,cols:10,sourceRoutes:true,
  buildable:Array.from({length:10},()=>Array(10).fill('MELEE')),routes:[{segs:[[{c:5,r:3},{c:8,r:3}]]}]};
 BDATA.enemies[enemyId]=externalDeliverySources[enemyId];
 B.spawn=[{at:0,enemyId,route:0},{at:999,enemyId:'unused',route:0}];
 update(0,0);return B.enemies[0];
}
function sourceTimingContract(schedule,timing,interval){
 const total=schedule.windup+schedule.strike+schedule.recovery,playback=timing.playback;
 assert.ok(total>0);assert.ok(schedule.windup>=0&&schedule.windup<=total);
 assert.ok(Math.abs(schedule.windup/total-timing.hit/timing.duration)<1e-9,'OnAttack stays at its source animation timestamp ratio');
 if(!playback){assert.equal(schedule.source,'community-proportional-onattack-v1');assert.ok(Math.abs(total-interval)<1e-9);return;}
 assert.equal(schedule.source,'native-attack-time-capped-animation');assert.equal(playback.timeMode,0);assert.equal(playback.minScale,.1);
 assert.ok(total+1e-9>=timing.duration*.1,'native minimum animation scale');
 if(playback.maxScale>=0)assert.ok(total<=timing.duration*playback.maxScale+1e-9,'native maximum animation scale');
 if(interval>=timing.duration*.1&&(playback.maxScale<0||interval<=timing.duration*playback.maxScale))assert.ok(Math.abs(total-interval)<1e-9);
 if(playback.maxScale>=0&&interval>timing.duration*playback.maxScale)assert.ok(Math.abs(total-timing.duration*playback.maxScale)<1e-9,'long attack cooldown leaves an animation-free gap');
 if(schedule.hitOffsets){assert.equal(schedule.hitOffsets.length,timing.hits.length);for(let i=0;i<timing.hits.length;i++)assert.ok(Math.abs(schedule.hitOffsets[i]/total-timing.hits[i]/timing.duration)<1e-9);}
}
function channelBattle(blocked){
 const e=externalBattle(true);e.enemyId='enemy_1272_nhtank';
 if(!blocked){e.x=5;e.y=3;}
 return e;
}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${setup}
 const data=ArkExternalCombatData;assert.equal(data.counts.profiles,Object.keys(data.enemies).length);
 assert.ok(data.counts.timings>600);assert.ok(data.counts.projectileSpeeds>400);
 const appearanceScope=new Set(deliveryScope);let explicitDeliveryCount=0;
 for(const [enemyId,p]of Object.entries(data.enemies)){
   const e={enemyId};
   if(p.delivery){
    explicitDeliveryCount++;assert.ok(appearanceScope.has(enemyId),'new flat delivery stays in the real appearance pool: '+enemyId);
    assert.ok(['direct','projectile'].includes(p.delivery));assert.ok(p.timing);
    assert.ok(!p.channels&&!p.modes&&!p.preAttack&&p.projectile?.kind!=='chain','dedicated contracts retain ownership: '+enemyId);
    for(const rangeRadius of [0,3])assert.equal(ArkExternalCombat.attackTiming({...e,rangeRadius},2,{channel:'attack'}).delivery,p.delivery,'source delivery is independent from acquisition range: '+enemyId);
    if(p.delivery==='projectile')assert.ok(p.projectile?.key&&p.projectile.speed>0,'ranged source needs a supported projectile: '+enemyId);
    else assert.equal(p.projectile,undefined,'direct root cannot inherit an unrelated ordinary projectile: '+enemyId);
   }
   if(p.projectile?.kind==='chain'){
    const chain=ArkExternalCombat.attackTiming(e,2,{channel:'attack'});
    assert.equal(chain.delivery,'projectile');assert.equal(chain.projectileContract.kind,'chain','chain behavior cannot degrade into ordinary flat delivery');
   }
   if(p.timing&&!p.preAttack){const t=ArkExternalCombat.attackTiming(e,2);sourceTimingContract(t,p.timing,2);}
   if(p.projectile)assert.equal(ArkExternalCombat.projectileSpeed(e,7),p.projectile.speed);
   for(const [channel,source]of Object.entries(p.channels||{})){
    const t=ArkExternalCombat.attackTiming(e,2,{channel});
    if(source===null){assert.equal(t,null);assert.equal(ArkExternalCombat.canAttack(e,{channel}),false);continue;}
    assert.equal(t.channel,channel);assert.equal(t.delivery,source.delivery);
    if(p.preAttack){
     assert.equal(t.source,p.preAttack.rule);assert.equal(t.firstAttack,true);assert.equal(t.windup,p.preAttack.first.hit);
     const repeat=ArkExternalCombat.attackTiming(e,2,{channel});assert.equal(repeat.firstAttack,false);assert.equal(repeat.windup,p.preAttack.repeat.hit);
    }
    else sourceTimingContract(t,source.timing,2);
   }
 }
 assert.ok(explicitDeliveryCount>1);assert.equal(data.enemies.enemy_1005_yokai_2.delivery,'direct');
 assert.equal(data.enemies.enemy_2010_csdcr.delivery,'projectile');
 assert.equal(data.enemies.enemy_10027_vtsk?.delivery,undefined,'mixed source root types cannot use the first root as a flat contract');
 assert.equal(ArkExternalCombat.attackTiming({enemyId:'missing'},2),null);
 assert.equal(ArkExternalCombat.projectileSpeed({enemyId:'missing'},7),7);
 assert.equal(ArkExternalCombat.attackTiming({enemyId:'enemy_10011_sgshot',bossMechanics:{attack:{damageDelay:.3}}},2),null);
 assert.equal(ArkExternalCombat.attackTiming({enemyId:'enemy_1005_yokai_2',bossMechanics:{attack:{damageDelay:.3}}},3),null,'flat delivery cannot take over a dedicated Boss attack');
 assert.equal(ArkExternalCombat.projectileSpeed({enemyId:'enemy_10011_sgshot',bossMechanics:{attack:{}}},7),7);
 assert.equal(ArkExternalCombat.attackTiming({attackTiming:{windup:.1,recovery:.2}},2).windup,.1);
 // Public basic-attack dispatch must obey both native caps, including the
 // uncapped source value -1, without changing explicit manual schedules.
 const clockId='test_native_animation_clock';
 data.enemies[clockId]={timing:{duration:2,hit:.5,playback:{rule:'native-attack-time-capped-animation',timeMode:0,minScale:.1,maxScale:1}}};
 for(const [interval,total,hit]of [[10,2,.5],[1,1,.25],[.05,.2,.05]]){
  const timing=ArkExternalCombat.attackTiming({enemyId:clockId},interval);
  assert.equal(timing.total,total);assert.equal(timing.windup,hit);assert.equal(timing.recovery,total-hit);
 }
 data.enemies[clockId].timing.playback.maxScale=-1;
 assert.equal(ArkExternalCombat.attackTiming({enemyId:clockId},10).total,10);
 assert.equal(ArkExternalCombat.attackTiming({enemyId:clockId},10).windup,2.5);
 const override=ArkExternalCombat.attackTiming({enemyId:clockId,attackTiming:{windup:.1,recovery:.2}},10);
 assert.equal(override.windup,.1);assert.equal(override.recovery,.2);assert.equal(override.source,'override');
 data.enemies[clockId].timing.playback.maxScale=0;
 assert.equal(ArkExternalCombat.attackTiming({enemyId:clockId},10),null,'invalid declared native contract cannot silently use legacy timing');
 delete data.enemies[clockId];
 assert.equal(ArkExternalCombat.projectileSpeed({enemyId:'enemy_10011_sgshot',basicProjectileSpeed:13},7),13);
 const manualTiming=ArkExternalCombat.attackTiming({enemyId:'enemy_1272_nhtank',attackTiming:{windup:.1,recovery:.2}},2,{channel:'combat'});
 assert.equal(manualTiming.windup,.1);assert.equal(manualTiming.delivery,'direct','timing override does not erase independent channel delivery');
 const noAttackId=Object.keys(data.attackCapabilities)[0];assert.ok(noAttackId);
 assert.equal(ArkExternalCombat.canAttack({enemyId:noAttackId}),false);
 assert.equal(ArkExternalCombat.canAttack({enemyId:'missing'}),true);
 assert.equal(ArkExternalCombat.canAttack({enemyId:noAttackId,canAttack:true}),true);
 assert.equal(ArkExternalCombat.canAttack({enemyId:noAttackId,applyWay:'RANGED'}),true);
 assert.equal(ArkExternalCombat.canAttack({enemyId:noAttackId,bossMechanics:{attack:{}}}),true);
 assert.equal(ArkExternalCombat.canAttack({enemyId:noAttackId,canAttack:false,bossMechanics:{attack:{}}}),false);
 assert.equal(ArkExternalCombat.canAttack({enemyId:'missing',applyWay:'NONE'}),false);
 // Exact source MeleeAttack may acquire targets at range: MKII's output occurs
 // on OnAttack itself. The ordinary ranged source has a real flight phase.
 let sourceEnemy=sourceDeliveryBattle('enemy_1005_yokai_2');
 assert.equal(sourceEnemy.flying,true);assert.equal(sourceEnemy.rangeRadius,2);
 assert.equal(sourceEnemy.atkSchedule.delivery,'direct');assert.equal(sourceEnemy.blockerId??null,null);
 externalStep(7);assert.equal(B.operators[0].hp,10000);assert.equal(B.projectiles.length,0);
 externalStep(2);assert.equal(B.operators[0].hp,10000-sourceEnemy.atk,'source melee output lands at its 0.2666667s event despite ranged acquisition');
 assert.equal(B.projectiles.length,0,'MKII must never fabricate an arrow projectile');
 sourceEnemy=sourceDeliveryBattle('enemy_2010_csdcr');
 assert.equal(sourceEnemy.atkSchedule.delivery,'projectile');
 externalStep(14);assert.equal(B.operators[0].hp,10000);assert.equal(B.projectiles.length,0);
 externalStep(1);assert.equal(B.operators[0].hp,10000,'ranged output must wait for the actual projectile arrival');
 assert.equal(B.projectiles.filter(p=>p.owner===sourceEnemy).length,1);assert.equal(B.projectiles[0].speed,data.enemies[sourceEnemy.enemyId].projectile.speed);
 externalStep(7);assert.ok(B.operators[0].hp<10000);
 let nonAttacker=externalBattle();nonAttacker.enemyId=noAttackId;delete nonAttacker.applyWay;
 // The source flag also cancels an in-flight windup, and does not mutate a
 // permanent canAttack value that would block a later level/mode override.
 Object.assign(nonAttacker,{atkPhase:'windup',atkTimer:0,atkTarget:B.operators[0],atkTotal:2});
 externalStep(75);assert.equal(B.operators[0].hp,10000);assert.equal(nonAttacker.atkPhase,null);
 assert.equal(nonAttacker.canAttack,undefined);nonAttacker.canAttack=true;
 externalStep(75);assert.ok(B.operators[0].hp<10000,'explicit enable restores attacks');
 let e=externalBattle();externalStep(1);assert.equal(e.atkSchedule.source,'native-attack-time-capped-animation');
 assert.ok(Math.abs(e.atkSchedule.windup-1.2)<1e-8,'1.8333s capped source animation emits at its raw 1.2s OnAttack');
 externalStep(35);assert.equal(B.operators[0].hp,10000,'source-backed windup remains pending before 1.2s');
 externalStep(2);assert.equal(B.operators[0].hp,9900,'generic melee attack lands at its native animation event');
 assert.equal(e.atkPhase,'recover');
 e=externalBattle(true);let speed=null;const originalSpawn=spawnProjectile;
 spawnProjectile=function(p){if(p.enemy&&p.owner===e)speed=p.speed;return originalSpawn(p);};
 externalStep(45);assert.equal(speed,10,'real ranged attack consumes exact projectile-key speed');
 assert.equal(B.operators[0].hp,9900);
 spawnProjectile=originalSpawn;
 e=channelBattle(true);let launches=0;
 spawnProjectile=function(p){if(p.enemy&&p.owner===e)launches++;return originalSpawn(p);};
 externalStep(1);assert.equal(e.atkSchedule.channel,'combat');assert.equal(e.atkSchedule.delivery,'direct');
 externalStep(50);assert.equal(launches,0);assert.ok(B.operators[0].hp<10000);
 e=channelBattle(false);externalStep(1);assert.equal(e.atkSchedule.channel,'attack');
 assert.equal(e.atkSchedule.delivery,'projectile');externalStep(55);assert.ok(launches>0);
 assert.ok(B.operators[0].hp<10000);spawnProjectile=originalSpawn;
 for(const [enemyId,hit]of [['enemy_1153_dsexcu',.6],['enemy_1501_demonk',1.1333]]){
  e=externalBattle();e.enemyId=enemyId;externalStep(1);
  const timing=data.enemies[enemyId].timing;
  assert.ok(Math.abs(timing.hit-hit)<1e-5);
  sourceTimingContract(e.atkSchedule,timing,2);
  const expectedHit=enemyId==='enemy_1153_dsexcu'?.6:2*1.1333/3.5;
  assert.ok(Math.abs(e.atkSchedule.windup-expectedHit)<1e-8,'configured preDelay is not added or used as a floor');
  externalStep(Math.max(0,Math.ceil(e.atkSchedule.windup*30)-1));
  assert.equal(B.operators[0].hp,10000,'event-gated hit remains pending before its source event');
  externalStep(2);assert.equal(B.operators[0].hp,9900,'event-gated basic attack lands at its source event');
 }
 e=externalBattle();e.enemyId='enemy_10118_ymgprc';externalStep(1);
 assert.equal(e.atkSchedule.hitOffsets.length,2);
 externalStep(20);assert.equal(B.operators[0].hp,9900);assert.equal(e.atkSchedule.nextHit,1);
 externalStep(8);assert.equal(B.operators[0].hp,9900,'second hit waits for its own event');
 externalStep(2);assert.equal(B.operators[0].hp,9800);assert.equal(e.atkSchedule.nextHit,2);
 externalStep(20);assert.equal(B.operators[0].hp,9800,'recovery adds no extra hit');
 e=externalBattle();e.enemyId='enemy_10118_ymgprc';externalStep(1);update(1.1,1/60);
 assert.equal(B.operators[0].hp,9800,'one frame crossing both events emits exactly two hits');
 e=externalBattle();e.enemyId='enemy_10118_ymgprc';externalStep(21);
 const deadTarget=B.operators[0];deadTarget.dead=true;externalStep(15);assert.equal(deadTarget.hp,9900,'later event ignores a dead target');
 e=externalBattle();e.enemyId='enemy_10118_ymgprc';externalStep(1);e.palsyStacks=1;
 externalStep(30);assert.equal(B.operators[0].hp,10000);assert.equal(e.atkPhase,null);assert.equal(e.atkSchedule,null);
 e=externalBattle(true);e.enemyId='enemy_10165_tjggb';e.x=5;e.y=3;launches=0;
 spawnProjectile=function(p){if(p.enemy&&p.owner===e)launches++;return originalSpawn(p);};
 externalStep(1);update(1.5,1/60);assert.equal(launches,3,'fixed ranged combo emits three projectiles even across a large frame');
 e=externalBattle(true);e.enemyId='enemy_1504_cqbw';e.x=5;e.y=3;launches=0;
 externalStep(55);assert.equal(launches,1,'plain RangedAttack does not recast on its second animation event');
 e=externalBattle(true);e.enemyId='enemy_1500_skulsr';e.x=5;e.y=3;B.operators[0].def=10;
 let emittedDamage=null;spawnProjectile=function(p){if(p.enemy&&p.owner===e)emittedDamage=p.dmg;return originalSpawn(p);};
 externalStep(35);assert.equal(emittedDamage,16,'source .26 ATK scale applies before DEF');
 spawnProjectile=originalSpawn;
 // Actual spawn configuration consumes the constrained native initial rule.
 e=externalBattle(true);e.enemyId='enemy_5055_dqkill';e.x=5;e.y=3;
 setupEnemy(e,{talents:[],skills:[]});assert.equal(e.externalCombatMode,0);
 externalStep(1);assert.equal(e.atkSchedule.damageType,'arts');
 ArkExternalCombat.setMode(e,1);assert.equal(ArkExternalCombat.configure(e),false);
 assert.equal(e.externalCombatMode,1,'configuration cannot overwrite a restored or explicit mode');
 const unresolvedDefault={enemyId:'enemy_2056_smedzi'};
 assert.equal(ArkExternalCombat.configure(unresolvedDefault),false);
 assert.equal(unresolvedDefault.externalCombatMode,undefined,'active positive override is not guessed');
 assert.equal(ArkExternalCombat.configure({enemyId:'enemy_5055_dqkill',bossMechanics:{attack:{}}}),false);
 // Changes in blocking affect the next cast, not the locked target/channel.
 e=externalBattle(true);e.enemyId='enemy_5055_dqkill';e.x=5;e.y=3;
 setupEnemy(e,{talents:[],skills:[]});externalStep(1);
 const lockedRanged=e.atkSchedule,originalTarget=B.operators[0];
 B.operators.push({...originalTarget,id:2,col:5,row:3,blocked:0});externalStep(1);
 assert.equal(ArkOperatorCombat.blockerOf(e),B.operators[1]);
 assert.equal(e.atkSchedule,lockedRanged);assert.equal(e.atkTarget,originalTarget);
 externalStep(90);assert.equal(originalTarget.hp,9900);
 assert.equal(B.operators[1].hp,10000,'empty combat channel prevents the next cast after locked ranged attack finishes');
 e=externalBattle(true);e.enemyId='enemy_1516_jakill';ArkExternalCombat.setMode(e,1);externalStep(1);
 const lockedCombat=e.atkSchedule;assert.equal(lockedCombat.channel,'combat');
 B.operators[0].blockCnt=0;externalStep(1);assert.equal(ArkOperatorCombat.blockerOf(e),null);
 assert.equal(e.atkSchedule,lockedCombat);externalStep(90);
 assert.equal(B.operators[0].hp,9900,'locked combat cast completes but empty ranged channel prevents another cast');
 // Equal timestamps in different phases still carry different damage/delivery.
 e=externalBattle(true);e.enemyId='enemy_5055_dqkill';e.x=5;e.y=3;
 Object.assign(B.operators[0],{def:80,magicRes:25});
 assert.equal(e.externalCombatMode,undefined,'source mode is not silently initialized to zero');
 assert.equal(ArkExternalCombat.setMode(e,0),true);externalStep(1);
 assert.equal(e.atkSchedule.modeIndex,0);assert.equal(e.atkSchedule.damageType,'arts');
 assert.equal(e.atkSchedule.delivery,'projectile');externalStep(44);
 assert.equal(B.operators[0].hp,9925,'phase 0 uses RES and a projectile');
 assert.equal(ArkExternalCombat.setMode(e,1),true);e.cd=0;externalStep(1);
 assert.equal(e.atkSchedule.modeIndex,1);assert.equal(e.atkSchedule.damageType,'phys');
 assert.equal(e.atkSchedule.delivery,'direct');externalStep(40);
 assert.equal(B.operators[0].hp,9905,'phase 1 uses DEF and direct damage');
 assert.equal(ArkExternalCombat.setMode(e,99),false);assert.equal(e.externalCombatMode,1);
 assert.equal(ArkExternalCombat.canAttack({...e,applyWay:'NONE'},{channel:'attack'}),false);
 assert.equal(ArkExternalCombat.setMode({...e,bossMechanics:{attack:{}}},0),false);
 e=externalBattle(true);e.enemyId='enemy_1516_jakill';e.x=5;e.y=3;
 ArkExternalCombat.setMode(e,0);externalStep(1);externalStep(10);
 const retainedCd=e.cd;ArkExternalCombat.setMode(e,1);assert.equal(e.cd,retainedCd);
 assert.equal(e.atkSchedule,null);externalStep(60);
 assert.equal(B.operators[0].hp,10000,'switch cancels old windup; absent ranged channel does not fall back to legacy attack');
 e.x=3;e.y=2.5;e.cd=0;externalStep(45);assert.equal(B.operators[0].hp,9900,'phase 1 still attacks in combat channel');
 e=externalBattle(true);e.enemyId='enemy_5055_dqkill';e.x=5;e.y=3;
 Object.assign(B.operators[0],{def:80,magicRes:25});ArkExternalCombat.setMode(e,0);
 let retainedProjectile=null;
 spawnProjectile=function(p){if(p.enemy&&p.owner===e){p.speed=.2;retainedProjectile=p;}return originalSpawn(p);};
 externalStep(40);assert.ok(retainedProjectile);assert.equal(retainedProjectile.damageType,'arts');
 assert.equal(retainedProjectile.dmg,75);ArkExternalCombat.setMode(e,1);
 assert.equal(retainedProjectile.damageType,'arts');assert.equal(retainedProjectile.dmg,75,'already emitted packet survives phase change');
 spawnProjectile=originalSpawn;
 })()`);
 // Same index.html dependency order in the authoritative VM; timer state and
 // target reference must survive its authenticated snapshot/restore.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:113,name:'批量动作参数'});
 try{
   runtime.startBattle();runtime.__testMachine.run(`${setup}externalBattle();`);
   runtime.advance(.2);const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.enemies[0].atkSchedule.source,'native-attack-time-capped-animation');
   assert.ok(Math.abs(checkpoint.battle.enemies[0].atkSchedule.windup-1.2)<1e-8);
   assert.ok(Math.abs(checkpoint.battle.enemies[0].atkSchedule.total-1.8333)<1e-8);
   runtime.advance(.6);const after=runtime.snapshot();assert.equal(after.battle.operators[0].hp,9900);
   runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.6);assertCombatRestore(runtime.snapshot(),after);
   runtime.__testMachine.run('channelBattle(false);');runtime.advance(.05);
   const channelCheckpoint=runtime.snapshot();assert.equal(channelCheckpoint.battle.enemies[0].atkSchedule.channel,'attack');
   runtime.advance(.6);const channelAfter=runtime.snapshot();
   runtime.restore(JSON.parse(JSON.stringify(channelCheckpoint)));runtime.advance(.6);
   assertCombatRestore(runtime.snapshot(),channelAfter,'selected channel and projectile state survive restore');
   runtime.__testMachine.run("externalBattle().enemyId='enemy_10118_ymgprc';externalStep(21);");
   const comboCheckpoint=runtime.snapshot();assert.equal(comboCheckpoint.battle.enemies[0].atkSchedule.nextHit,1);
   assert.equal(comboCheckpoint.battle.operators[0].hp,9900);
   runtime.advance(.2);const comboAfter=runtime.snapshot();assert.equal(comboAfter.battle.operators[0].hp,9800);
   runtime.restore(JSON.parse(JSON.stringify(comboCheckpoint)));runtime.advance(.2);
   assertCombatRestore(runtime.snapshot(),comboAfter,'mid-combo restore consumes only remaining events');
   runtime.__testMachine.run("{const e=externalBattle(true);e.enemyId='enemy_5055_dqkill';e.x=5;e.y=3;ArkExternalCombat.setMode(e,1);externalStep(10);}");
   const modeCheckpoint=runtime.snapshot();assert.equal(modeCheckpoint.battle.enemies[0].externalCombatMode,1);
   assert.equal(modeCheckpoint.battle.enemies[0].atkSchedule.delivery,'direct');
   runtime.advance(.6);const modeAfter=runtime.snapshot();
   runtime.restore(JSON.parse(JSON.stringify(modeCheckpoint)));runtime.advance(.6);
   assertCombatRestore(runtime.snapshot(),modeAfter,'mode and packet state survive authoritative restore');
   runtime.__testMachine.run("sourceDeliveryBattle('enemy_1005_yokai_2');");runtime.advance(.05);
   const directCheckpoint=runtime.snapshot();assert.equal(directCheckpoint.battle.enemies[0].atkSchedule.delivery,'direct');
   assert.equal(directCheckpoint.battle.operators[0].hp,10000);assert.equal(directCheckpoint.battle.projectiles.length,0);
   runtime.advance(.15);const directAfter=runtime.snapshot();
   assert.equal(directAfter.battle.operators[0].hp,10000-deliverySources.enemy_1005_yokai_2.atk);
   assert.equal(directAfter.battle.projectiles.length,0);
   runtime.restore(JSON.parse(JSON.stringify(directCheckpoint)));runtime.advance(.15);
   assertCombatRestore(runtime.snapshot(),directAfter,'actual ranged-selector/direct-output source preserves delivery and target across VM restore');
 }finally{runtime.dispose();}
 console.log('EXTERNAL COMBAT OK: source initial mode, mode damage/delivery, empty channels, existing combos and VM restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
