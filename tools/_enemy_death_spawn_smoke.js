'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const {enemyVariant}=require('./lib/source-battle'),raw=require('../data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json');
const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/enemy_death_spawn_data.js'),'utf8'),box);
const data=box.window.ArkEnemyDeathSpawnData,db=new Map(raw.enemies.map(x=>[x.Key,x.Value]));
const bases=Object.fromEntries(Object.keys(data.enemies).map(id=>[id,enemyVariant({id,level:0,useDb:true},db,{})]));
const f=require('./_browser_fixture')();f.ctx.assert=assert;f.ctx.deathSpawnBases=bases;
const helpers=`
function deathSpawnBattle(keepAlive=true){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:10000,atk:0,def:100,attackTime:100,blockCnt:0,range:0}],[],100);
 B.waveScheduler=null;B.spawn=keepAlive?[{at:999,enemyId:'unused',route:0}]:[];B.enemies=[];
 for(const o of B.operators){o.cd=999;o.deployed=true;o.deployT=5;o.deployAt=0;o.skill=null;o.events=[];}
}
function deathSpawnEnemy(id='enemy_1195_sfyin',extra={}){
 const base=deathSpawnBases[id],e={...base,x:3,y:3,hp:base.maxHp,route:-1,seg:0,cp:0,cd:999,dead:false,visualId:100+B.enemies.length,...extra};
 setupEnemy(e,base);B.enemies.push(e);return e;
}
function stepDeathSpawn(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 // Native-confirmed profile scope, child counts, and the local seeded timing contract.
 let total=0;
 for(const [id,base] of Object.entries(deathSpawnBases)){
  deathSpawnBattle();const e=deathSpawnEnemy(id,{sourceWave:2,sourceFragment:1,blockFragment:true,dontBlockWave:true});
  const bb=Object.fromEntries(base.sourceTalentBlackboard.map(x=>[x.key,x.valueStr??x.value]));
  const planned=ArkEnemyDeathSpawn.plan(e,{time:4,random:()=>.5});
  assert.equal(planned.length,bb['DeadSpawn.cnt']);assert.ok(planned.every(p=>p.enemyId===bb['DeadSpawn.enemy_key']&&p.at===4.35));
  assert.ok(planned.every(p=>p.parent.dontBlockWave===false&&p.parent.sourceWave===2&&p.parent.sourceFragment===1&&p.parent.blockFragment));
  const before=JSON.stringify(e);ArkEnemyDeathSpawn.plan(e,{time:0,random:()=>0});assert.equal(JSON.stringify(e),before,'planner does not mutate enemy');
  killEnemy(e);killEnemy(e);assert.equal(B.enemyDeathSpawns.length,bb['DeadSpawn.cnt'],'death is idempotent '+id);
  stepDeathSpawn(23);assert.equal(B.enemyDeathSpawns.length,0);assert.equal(B.enemies.length,bb['DeadSpawn.cnt']);
  assert.ok(B.enemies.every(c=>c.enemyId===bb['DeadSpawn.enemy_key']&&c.route===-1&&c.sourceWave===2&&!c.dontBlockWave));total+=B.enemies.length;
 }
 assert.equal(total,54,'all 14 database counts exercised');
 for(const source of Object.values(SOURCE_BATTLES.levels))for(const [id,base] of Object.entries(source.enemies)){
  if(!ArkEnemyDeathSpawn.owns(base))continue;
  const before=JSON.stringify(base),bb=Object.fromEntries(base.sourceTalentBlackboard.map(x=>[x.key,x.valueStr??x.value]));
  const plan=ArkEnemyDeathSpawn.plan(base,{time:0,random:()=>0});
  assert.equal(plan.length,bb['DeadSpawn.cnt'],source.id+' '+id);assert.ok(plan.every(p=>p.enemyId===bb['DeadSpawn.enemy_key']));assert.equal(JSON.stringify(base),before);
 }
 // Final-parent removal cannot end the battle while a delayed child is queued.
 deathSpawnBattle(false);const last=deathSpawnEnemy();killEnemy(last);
 for(const p of B.enemyDeathSpawns)p.at=1;stepDeathSpawn(29);assert.equal(B.enemies.length,0);assert.equal(B.over,false);
 stepDeathSpawn(2);assert.equal(B.enemies.length,2);assert.equal(B.over,false);
 for(const e of B.enemies.slice())killEnemy(e);stepDeathSpawn(1);assert.equal(B.over,true);assert.equal(B.win,true);
 // No spawn on exit or first revival. Silence does not suppress this prefab buff.
 deathSpawnBattle();const fallen=deathSpawnEnemy();killEnemy(fallen,null,'FALLDOWN');assert.equal(B.enemyDeathSpawns.length,0);
 const revived=deathSpawnEnemy();revived.revive=true;killEnemy(revived);assert.equal(B.enemyDeathSpawns.length,0);killEnemy(revived);assert.equal(B.enemyDeathSpawns.length,2);
 deathSpawnBattle();const leaked=deathSpawnEnemy();leaked.dead=true;leak(leaked);assert.equal(B.enemyDeathSpawns.length,0);
 const silent=deathSpawnEnemy(undefined,{silenced:true,silenceUntil:999});killEnemy(silent);assert.equal(B.enemyDeathSpawns.length,2);
 // A source blackboard override is authoritative, including explicit emptiness.
 deathSpawnBattle();const override=deathSpawnEnemy(undefined,{sourceTalentBlackboard:[{key:'DeadSpawn.cnt',value:3},{key:'DeadSpawn.enemy_key',valueStr:'enemy_1200_msfjin'}]});
 BDATA.enemies.enemy_1200_msfjin={...ArkEnemyDeathSpawn.fallback('enemy_1200_msfjin'),sourceLevel:7,maxHp:4321,atk:987};
 override.extraEnemyKeyList=['enemy_1196_msfyin'];override.deathrattleKey='enemy_1196_msfyin';override.deathrattleCnt=99;
 killEnemy(override);stepDeathSpawn(23);assert.equal(B.enemies.length,3,'explicit profile does not also take legacy branch');
 assert.ok(B.enemies.every(c=>c.enemyId==='enemy_1200_msfjin'&&c.maxHp===4321&&c.hp===4321&&c.atk===987&&c.sourceLevel===7),'current stage child variant precedes catalog fallback');
 const empty=deathSpawnEnemy(undefined,{sourceTalentBlackboard:[]});killEnemy(empty);assert.equal(B.enemyDeathSpawns.length,0);
 const unknown={enemyId:'unbound',sourceTalentBlackboard:override.sourceTalentBlackboard};assert.equal(ArkEnemyDeathSpawn.plan(unknown,{time:0,random:()=>0}),null,'matching blackboard alone never expands source scope');
 // Queue snapshots retain coordinates/route checkpoints even after parent mutation.
 deathSpawnBattle();const routed=deathSpawnEnemy(undefined,{route:2,seg:3,cp:4,x:5.25,y:6.5,sourceWave:0,sourceFragment:0,blockFragment:true});killEnemy(routed);
 routed.x=0;routed.cp=99;assert.equal(B.enemyDeathSpawns[0].parent.x,5.25);assert.equal(B.enemyDeathSpawns[0].parent.cp,4);
 const child=spawnEnemyAt(B.enemyDeathSpawns[0].enemyId,B.enemyDeathSpawns[0].parent,ArkEnemyDeathSpawn.fallback(B.enemyDeathSpawns[0].enemyId));
 assert.equal(child.route,2);assert.equal(child.seg,3);assert.equal(child.cp,4);assert.equal(child.x,5.25);assert.equal(child.y,6.5);
 assert.equal(ArkEnemyDeathSpawn.waitingIn(B.enemyDeathSpawns,0,0,true),true);assert.equal(ArkEnemyDeathSpawn.waitingIn(B.enemyDeathSpawns,0,null,false),true);assert.equal(ArkEnemyDeathSpawn.waitingIn(B.enemyDeathSpawns,1,null,false),false);
 // Actual wave scheduler sees pending children, then the spawned children.
 deathSpawnBattle(false);const parent=deathSpawnEnemy(undefined,{sourceWave:0,sourceFragment:0});killEnemy(parent);for(const p of B.enemyDeathSpawns)p.at=1;
 B.waveScheduler=ArkWaves.create([{fragments:[]},{fragments:[{actions:[{actionType:'SPAWN',key:'next-wave-marker',count:1,routeIndex:0}]}]}]);
 stepDeathSpawn(5);assert.equal(B.waveScheduler.wave,0,'pending death spawn blocks wave advance');stepDeathSpawn(27);assert.equal(B.waveScheduler.wave,0,'live generated child blocks wave advance');
 for(const e of B.enemies.slice())killEnemy(e);stepDeathSpawn(1);assert.equal(B.waveScheduler.wave,1,'next wave advances after all children die');
 // Timeout counts delayed children instead of treating the board as cleared.
 deathSpawnBattle(false);killEnemy(deathSpawnEnemy());for(const p of B.enemyDeathSpawns)p.at=1;B.roundLimit=.01;stepDeathSpawn(1);assert.equal(B.win,false);assert.equal(B.endReason,'timeout');assert.equal(B.endCounts.pending,2);
 })()`);
 // Actual host VM and authenticated room checkpoint: pending plain values survive
 // full board capture/restore alongside a serialized projectile.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:418,name:'死亡生成复核'});
 try{
  runtime.startBattle();runtime.__testMachine.context.deathSpawnBases=bases;
  runtime.__testMachine.run(`${helpers}deathSpawnBattle();B.operators[0].playerId='one';killEnemy(deathSpawnEnemy('enemy_1201_sfzhi'));for(const p of B.enemyDeathSpawns)p.at+=.5;spawnProjectile({kind:'death-cold',enemy:true,tx:20,ty:20,x:20,y:20,radius:1,resolveAt:2,life:3,coldSource:{atk:100,atkType:'phys',duration:1}});`);
  runtime.advance(.1);const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.enemyDeathSpawns.length,15);assert.equal(checkpoint.battle.projectiles.length,1);
  runtime.advance(.6);const after=runtime.snapshot();assert.equal(after.battle.enemyDeathSpawns.length,0);assert.equal(after.battle.enemies.length,15);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.6);assert.deepEqual(runtime.snapshot().battle,after.battle,'pending generation, born children and projectile survive authenticated restore deterministically');
 }finally{runtime.dispose();}
 console.log('ENEMY DEATH SPAWN OK: 14 real IDs / 54 children, final death/revive/fall/exit/silence, source overrides, route snapshot, queue/wave/victory/timeout, authenticated room restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

