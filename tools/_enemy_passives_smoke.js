'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const helpers=`
function passiveBattle(id='enemy_9018_actrpa',x=4){
 startBattle([],[],100);B.sourceBattle=null;B.waveScheduler=null;B.spawn=[{at:999,enemyId:'none'}];B.enemies=[];B.summoneds=[];B.leader=null;B.leaderEnemyId=null;
 BDATA.level={...BDATA.level,rows:10,cols:10,sourceRoutes:true,buildable:Array.from({length:10},()=>Array(10).fill('MELEE')),routes:[{segs:[[{c:2,r:4},{c:8,r:4}]]}]};
 const o={id:1,charId:'ordinary',row:4,col:4,cells:[[4,3],[4,4],[4,5],[4,6]],range:3,atk:100,atkType:'phys',position:'MELEE',profession:'WARRIOR',
  hp:100000,maxHp:100000,attackTime:99,cd:999,def:0,blockCnt:1,blocked:0,events:[],buffs:[],deployed:true,deployAt:0,deployT:5,sp:0,
  basicAttack:{action:'attack',kind:'single',damageType:'phys'},combatTalents:[]};B.operators=[o];
 const e={id:10,visualId:10,enemyId:id,x,y:4,hp:12345,maxHp:12345,atk:42,def:0,magicRes:0,moveSpeed:2,route:0,seg:0,cp:1,wait:0,cd:999,
  dead:false,canAttack:false,attackTime:1,applyWay:'MELEE',sourceLevel:2,sourceTalentBlackboard:[],unblockable:false};
 setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return {o,e};
}
function passiveStep(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/30);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 const ids=Object.keys(ArkEnemyPassiveData.enemies);assert.equal(ids.length,9);
 for(const id of ids){
  const {o,e}=passiveBattle(id);assert.equal(e.unblockable,true,id);assert.equal(ArkEnemyPassiveData.enemies[id].isSilenceable,false);
  assert.equal(e.hp,12345);assert.equal(e.maxHp,12345);assert.equal(e.atk,42);assert.equal(e.sourceLevel,2);assert.equal(e.moveSpeed,2);assert.equal(e.sourceTalentBlackboard.length,0);
  e.silenceUntil=999;ArkOperatorCombat.assignBlocks();assert.equal(e.blockerId,null);assert.equal(o.blocked,0,id+' permanent source buff does not become silenceable');
  e.blockerId=o.id;o.blocked=1;e.unblockable=false;ArkEnemyPassives.sync(B);assert.equal(e.blockerId,null);assert.equal(o.blocked,0);
  ArkEnemyPassives.sync(B);assert.equal(o.blocked,0,'repeated release cannot make negative occupancy');
 }
 // No inference from names, postfixes, source HP shape, or a different flag.
 for(const id of ['unbound','enemy_9018_actrpa_2',...Object.keys(ArkEnemyDeathSpawnData.children)]){
  const {o,e}=passiveBattle(id);assert.equal(ArkEnemyPassives.blockFree(e),false,id+' is outside this evidence batch');
  assert.equal(e.unblockable,false);ArkOperatorCombat.assignBlocks();assert.equal(e.blockerId,o.id);assert.equal(o.blocked,1);
 }
 let p=passiveBattle('unbound');p.e.unblockable=true;ArkEnemyPassives.sync(B);assert.equal(p.e.unblockable,true,'existing independent blocker restrictions survive');
 // Real source-staged spawn preserves stage attributes/level and its route, then attaches the prefab flag.
 p=passiveBattle();const stageBase={...p.e,hp:undefined,maxHp:777,atk:83,sourceLevel:6,sourceTalentBlackboard:[]};BDATA.enemies[p.e.enemyId]=stageBase;
 const before=JSON.stringify(stageBase),spawn=spawnEnemyAt(p.e.enemyId,{x:3,y:4,route:0,seg:0,cp:1});
 assert.equal(spawn.unblockable,true);assert.equal(spawn.maxHp,777);assert.equal(spawn.hp,777);assert.equal(spawn.atk,83);assert.equal(spawn.sourceLevel,6);assert.equal(spawn.route,0);assert.equal(spawn.x,3);assert.equal(JSON.stringify(stageBase),before,'source entry is not mutated');
 // Actual sweep and movement cannot attach to a ground blocker, and a ranged tile cannot block the control enemy.
 p=passiveBattle('unbound',2);assert.equal(ArkOperatorCombat.moveToContact(p.e,6,4),true);assert.equal(p.e.x,3.5);assert.equal(p.e.blockerId,p.o.id);
 p=passiveBattle('enemy_9018_actrpa',2);assert.equal(ArkOperatorCombat.moveToContact(p.e,6,4),false);assert.equal(p.e.x,2);passiveStep(60);assert.ok(p.e.x>4.5);assert.equal(p.e.blockerId,null);assert.equal(p.o.blocked,0);
 p=passiveBattle('unbound');BDATA.level.buildable[4][4]='RANGED';ArkOperatorCombat.assignBlocks();assert.equal(p.e.blockerId,null);
 // BLOCK_FREE does not grant flight, invisibility, or damage immunity. Both source identities still attack it in range.
 for(const position of ['MELEE','RANGED']){
  p=passiveBattle();p.e.moveSpeed=0;p.o.position=position;p.o.cd=0;if(position==='RANGED')BDATA.level.buildable[4][4]='RANGED';
  ArkOperatorCombat.assignBlocks();assert.equal(p.e.blockerId,null);assert.equal(ArkOperatorCombat.attack(p.o),true,position+' ordinary attack can target');p.o.cd=999;passiveStep(20);assert.ok(p.e.hp<p.e.maxHp,position+' actual impact damages enemy');
 }
 // Actual Rosmontis and Specter Alter planners retain blocked-only/own-blocked qualifications.
 for(const skill of [{sourceId:'skchr_rosmon_3',blackboard:{'attack@max_target':2},combatMechanic:{}},{sourceId:'skchr_ghost2_3',blackboard:{},combatMechanic:{}}]){
  p=passiveBattle();p.o.skill=skill;p.o.skillState={until:999};p.e.blockerId=p.o.id;p.o.blocked=1;p.e.unblockable=false;
  ArkEnemyPassives.sync(B);const plan=ArkOperatorCombat.planFor(p.o,skill);assert.ok(plan.blockedOnly||plan.ownBlocked);
  assert.equal(ArkOperatorCombat.attack(p.o),false,skill.sourceId+' cannot target permanent block-free enemy');assert.equal(B.projectiles.length,0);
  p=passiveBattle('unbound');p.o.skill=skill;p.o.skillState={until:999};ArkOperatorCombat.assignBlocks();assert.equal(p.e.blockerId,p.o.id);assert.equal(ArkOperatorCombat.attack(p.o),true,skill.sourceId+' blocked control can be targeted');
 }
 // Summoned blockers lose stale occupancy too; no wholesale immunity is assigned.
 p=passiveBattle();B.operators=[];B.summoneds=[p.o];p.e.blockerId=p.o.id;p.o.blocked=1;ArkEnemyPassives.sync(B);assert.equal(p.e.blockerId,null);assert.equal(p.o.blocked,0);
 assert.equal(p.e.stunImmune,undefined);assert.equal(p.e.silenceImmune,undefined);assert.equal(p.e.flying,undefined);
 })()`);
 // The public authority snapshot signs/restores the whole board. Exercise a legacy
 // stale link before its first update, then deterministic uninterrupted vs resumed movement.
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:',m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));assert.equal(source.split(marker).length,2);
 m._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:41});
 try{
  runtime.startBattle();runtime.__testMachine.run(helpers+"const {o,e}=passiveBattle('enemy_9018_actrpa',4);e.unblockable=false;e.blockerId=o.id;o.blocked=1;e.silenceUntil=999;");
  const stale=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(stale)));runtime.advance(.1);
  const current=runtime.snapshot();assert.equal(current.battle.enemies[0].unblockable,true);assert.equal(current.battle.enemies[0].blockerId,null);assert.equal(current.battle.operators[0].blocked,0);assert.equal(current.battle.enemies[0].hp,12345);
  runtime.advance(.4);const expected=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(current)));runtime.advance(.4);const restored=runtime.snapshot();
  assert.deepEqual(restored.battle,expected.battle,'permanent flag, release, route and untouched combat state survive authoritative restore');assert.deepEqual(restored.rng,expected.rng);
 }finally{runtime.dispose();}
 console.log('ENEMY PASSIVES OK: 9 source bindings, stage overrides, silence, release, ground/ranged targeting, blocked-only exclusions, unrelated IDs and authoritative restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
