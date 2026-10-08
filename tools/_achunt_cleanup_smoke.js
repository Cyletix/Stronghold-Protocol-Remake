'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {enemyVariant}=require('./lib/source-battle');
const db=new Map(require('../data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json').enemies.map(r=>[r.Key,r.Value]));
const ids=['enemy_9017_achunt','enemy_9018_actrpa','enemy_9019_actrpb','enemy_9020_actrpc'];
const bases=Object.fromEntries(ids.map(id=>[id,enemyVariant({id,level:0,useDb:true},db)]));
const variants=['NORMAL','ELITE','BOSS'].map(levelType=>enemyVariant({id:ids[1],level:0,useDb:true,overwrittenData:{levelType:{m_defined:true,m_value:levelType},attributes:{maxHp:{m_defined:true,m_value:777}}}},db));
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,cleanupBases:bases,cleanupVariants:variants});
const helpers=`
function cleanupBattle(keepAlive=true){
 startBattle([],[],100);B.sourceBattle=null;B.waveScheduler=null;B.spawn=keepAlive?[{at:999,enemyId:'none'}]:[];B.enemies=[];B.summoneds=[];B.leader=null;B.leaderEnemyId=null;
 for(const [id,base] of Object.entries(cleanupBases))BDATA.enemies[id]=base;
 const owner={id:1,playerId:'ally',charId:'ordinary',col:0,row:3,cells:[[3,1]],range:1,atk:100,atkType:'arts',position:'RANGED',profession:'CASTER',hp:1000,maxHp:1000,def:0,attackTime:99,cd:999,blockCnt:0,events:[],buffs:[],deployed:true,deployAt:0,deployT:5,sp:0,basicAttack:{action:'attack',kind:'single',damageType:'arts'},combatTalents:[]};B.operators=[owner];
 const enemies=Object.keys(cleanupBases).map((id,i)=>{const e=spawnEnemyAt(id,{x:i?8+i:1,y:3,route:-1,seg:0,cp:0});e.hp=100;e.maxHp=100;e.atk=0;e.def=0;e.magicRes=0;e.shield=0;e.moveSpeed=0;e.canAttack=false;e.skill=null;e.cd=999;return e;});
 return {boss:enemies[0],parts:enemies.slice(1),owner};
}
function cleanupSteps(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/30);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 let p=cleanupBattle();
 assert.equal(Object.values(ArkEnemyPassiveData.enemies).filter(x=>x.permanentMarks?.includes('achunt_mark')).length,4);
 assert.equal(ArkEnemyPassiveData.enemies.enemy_9017_achunt.deathCleanup.maxTargets,null);
 for(const e of [p.boss,...p.parts]){assert.equal(e.id,undefined,'uses real spawn identity');assert.ok(Number.isSafeInteger(e.visualId));}
 const queue=[{enemyId:'unrelated',at:999,parent:{sourceWave:2}}];B.enemyDeathSpawns=queue;
 let damageEvents=0;const taking=ArkEnemyPassives.onTakingDamage;ArkEnemyPassives.onTakingDamage=(...args)=>{damageEvents++;return taking(...args);};
 const originalRng=JSON.stringify(ArkSim.snapshot());killEnemy(p.boss,p.owner);
 assert.ok(p.parts.every(e=>e.dead&&e.hp===0),'all three actual marked children, including out-of-range units, die');
 assert.equal(p.owner._kills,1,'child suicides are not credited to the operator that killed the boss');assert.equal(B.stats.kills,4);
 assert.equal(damageEvents,0,'InstantKill does not dispatch a damage modifier');assert.equal(JSON.stringify(ArkSim.snapshot()),originalRng);
 assert.equal(B.enemyDeathSpawns,queue,'other delayed spawns remain intact');assert.equal(p.boss.passiveDeathCleanupDone,true);
 killEnemy(p.boss,p.owner);assert.equal(B.stats.kills,4);assert.equal(p.owner._kills,1);
 assert.equal(ArkEnemyPassives.onKilled(p.boss,B,()=>assert.fail('duplicate callback')).status,'already-dispatched');ArkEnemyPassives.onTakingDamage=taking;
 p=cleanupBattle();const duplicate=spawnEnemyAt('enemy_9018_actrpa',{x:9,y:3,route:-1,seg:0,cp:0});killEnemy(p.boss);assert.ok(p.parts.every(e=>e.dead));assert.equal(duplicate.dead,true);assert.equal(B.stats.kills,5,'selector has no one-target cap or enemyId deduplication');
 // The static marker is not the periodic achunt_mark_by_boss graph, and it cannot be silenced.
 p=cleanupBattle();p.boss.silenceUntil=999;for(const e of p.parts){e.silenceUntil=999;e.def=999999;e.magicRes=100;e.shield=999;e.sleepUntil=999;}
 killEnemy(p.boss);assert.ok(p.parts.every(e=>e.dead&&e.hp===0),'direct suicide bypasses HP damage mitigation and sleep eligibility');
 // Final death only; InstantKill's skipReborn=false retains the target's existing revive transition.
 p=cleanupBattle();p.boss.revive=true;killEnemy(p.boss);assert.equal(p.boss.dead,false);assert.ok(p.parts.every(e=>!e.dead));assert.equal(p.boss.passiveDeathCleanupDone,undefined);
 p.parts[0].revive=true;killEnemy(p.boss);assert.equal(p.parts[0].dead,false);assert.equal(p.parts[0].hp,50);assert.equal(p.parts[0].revived,true);assert.ok(p.parts.slice(1).every(e=>e.dead));
 killEnemy(p.boss);assert.equal(p.parts[0].hp,50,'repeated owner death cannot kill a revived child again');
 // The source has no excluded fall-down reason; a leak is not ON_OWNER_KILLED.
 p=cleanupBattle();killEnemy(p.boss,undefined,'FALLDOWN');assert.ok(p.parts.every(e=>e.dead));
 p=cleanupBattle();p.boss.dead=true;leak(p.boss);assert.ok(p.parts.every(e=>!e.dead));assert.equal(p.boss.passiveDeathCleanupDone,undefined);
 p=cleanupBattle();inflictDamage(p.boss,100,false,'true',true,{skipModifierEvents:true,noSourceDamage:true});killEnemy(p.boss);assert.ok(p.parts.every(e=>e.dead),'skipped modifier events do not suppress final death events');
 // Fresh selector excludes dead/unselectable/wrong source identities and ignores same IDs on another board.
 p=cleanupBattle();p.parts[0].untargetable=true;p.parts[1].targetFree=true;p.parts[2].enemyId='enemy_9020_actrpc_2';killEnemy(p.boss);assert.ok(p.parts.every(e=>!e.dead));
 p=cleanupBattle();p.parts[0].dead=true;p.parts[0].hp=0;killEnemy(p.boss);assert.equal(B.stats.kills,3,'already dead child not killed twice');
 p=cleanupBattle();const outside={...p.parts[0],visualId:999,hp:100};const otherBoard={enemies:[outside]};killEnemy(p.boss);assert.equal(otherBoard.enemies[0].hp,100);
 p=cleanupBattle();p.boss.enemyId='unbound';killEnemy(p.boss);assert.ok(p.parts.every(e=>!e.dead),'no graph inferred from names or arbitrary marker state');
 p=cleanupBattle();p.boss.sourceTalentBlackboard=[{key:'ability_name',valueStr:'UnknownSelector'}];killEnemy(p.boss);assert.ok(p.parts.every(e=>!e.dead));assert.equal(B.enemyPassiveDiagnostics[0].reason,'unsupported-selector-alias');
 p=cleanupBattle();const secondBoss=spawnEnemyAt('enemy_9017_achunt',{x:9,y:3,route:-1,seg:0,cp:0});killEnemy(p.boss);assert.ok(p.parts.every(e=>!e.dead));assert.equal(secondBoss.dead,false);assert.equal(B.enemyPassiveDiagnostics[0].reason,'unsupported-multiple-cleanup-owners');
 // Level mask7 accepts NORMAL/ELITE/BOSS after actual source stage merging; no accidental BOSS-only restriction.
 for(const base of cleanupVariants){p=cleanupBattle();B.enemies=[p.boss];BDATA.enemies[base.enemyId]=base;const sourceJson=JSON.stringify(base),target=spawnEnemyAt(base.enemyId,{x:8,y:3,route:0,seg:2,cp:3});
  assert.equal(target.sourceLevelType,base.sourceLevelType);assert.equal(target.hp,777);assert.equal(target.maxHp,777);killEnemy(p.boss);assert.equal(target.dead,true);assert.equal(target.hp,0);assert.equal(target.route,0);assert.equal(target.seg,2);assert.equal(target.cp,3);assert.equal(JSON.stringify(base),sourceJson);
 }
 p=cleanupBattle();p.parts[0].sourceLevelType='UNKNOWN';killEnemy(p.boss);assert.equal(p.parts[0].dead,false,'unknown stage level never bypasses source mask');
 // Clear before ordinary victory evaluation; an already queued independent enemy still prevents early victory.
 p=cleanupBattle(false);killEnemy(p.boss);assert.ok(p.parts.every(e=>e.dead));cleanupSteps(1);assert.equal(B.over,true);assert.equal(B.win,true);
 p=cleanupBattle(false);B.enemyDeathSpawns=[{enemyId:'enemy_9018_actrpa',at:10,parent:{x:8,y:3,route:-1,seg:0,cp:0}}];killEnemy(p.boss);cleanupSteps(1);assert.equal(B.over,false);
 p=cleanupBattle();B.leader=p.boss;B.leaderEnemyId=p.boss.enemyId;p.boss.hp=0;cleanupSteps(1);assert.ok(p.parts.every(e=>e.dead));assert.equal(B.endReason,'leader-defeated');assert.equal(B.enemies.length,0,'cleanup precedes immediate leader victory');
 // Real operator projectile hits the boss; its children are outside range and do not need a damage hit.
 p=cleanupBattle();p.owner.cd=0;ArkOperatorCombat.attack(p.owner);p.owner.cd=999;assert.ok(B.projectiles.length);cleanupSteps(20);assert.ok(p.parts.every(e=>e.dead));assert.equal(p.owner._kills,1);
 // Three neighboring transfer graphs stay refused until the TARGET-context implementation is recovered.
 for(const id of ['enemy_9018_actrpa','enemy_9019_actrpb','enemy_9020_actrpc']){p=cleanupBattle();const part=p.parts.find(e=>e.enemyId===id);inflictDamage(part,20,false,'arts');assert.equal(p.boss.hp,100);}
 })()`);
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:',m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));assert.equal(source.split(marker).length,2);m._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'};
 const runtime=await m.exports.createPlayerRuntime(config,{seed:41}),other=await m.exports.createPlayerRuntime(config,{seed:42});
 try{
  for(const r of [runtime,other]){r.startBattle();r.__testMachine.context.cleanupBases=bases;r.__testMachine.run(helpers+'cleanupBattle();');}
  runtime.__testMachine.run("{const p=cleanupBattle();p.parts[0].revive=true;spawnProjectile({target:p.boss,owner:p.owner,enemy:false,x:0,y:3,tx:1,ty:3,speed:1,life:5,kind:'orb',dmg:100,damageType:'arts'});}");
  runtime.advance(.1);const checkpoint=runtime.snapshot(),otherBefore=other.snapshot();runtime.advance(.5);const expected=runtime.snapshot();
  assert.equal(expected.battle.enemies.length,1);assert.equal(expected.battle.enemies[0].enemyId,'enemy_9018_actrpa');assert.equal(expected.battle.enemies[0].hp,50);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.5);const restored=runtime.snapshot(),withoutParticles=({particles,...battle})=>battle;
  assert.deepEqual(withoutParticles(restored.battle),withoutParticles(expected.battle));assert.deepEqual(restored.rng,expected.rng);
  assert.deepEqual(other.snapshot(),otherBefore,'a different authority board remains untouched');
  runtime.__testMachine.run("{const p=cleanupBattle();p.parts[0].revive=true;killEnemy(p.boss);}");
  const afterDeath=runtime.snapshot();assert.equal(afterDeath.battle.enemies.find(e=>e.enemyId==='enemy_9017_achunt').passiveDeathCleanupDone,true);
  runtime.restore(JSON.parse(JSON.stringify(afterDeath)));runtime.__testMachine.run("const boss=B.enemies.find(e=>e.enemyId==='enemy_9017_achunt');killEnemy(boss);ArkEnemyPassives.onKilled(boss,B,()=>{throw Error('repeat restored cleanup');});");
  assert.equal(runtime.snapshot().battle.enemies.find(e=>e.enemyId==='enemy_9018_actrpa').hp,50);
 }finally{runtime.dispose();other.dispose();}
 console.log('ACHUNT CLEANUP OK: 4 real permanent marks, final-death global cleanup, direct suicide/revive, filters, stage levels/HP/routes, no extra credit or RNG, real projectile and isolated authenticated restore; TARGET transfer refused');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
