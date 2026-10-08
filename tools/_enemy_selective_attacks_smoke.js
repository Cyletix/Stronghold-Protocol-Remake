'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const encounter=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies;
const record=encounter.enemy_9021_acduml_2;
assert.ok(record,'requires the actual garrison encounter record');
const helpers=`
const selectiveSource=${JSON.stringify(record)};
function selectiveBattle(){
 const positions=[[1,6,3],[2,6,4],[3,6,2],[4,3,5]];
 startBattle(positions.map(([id,col,row])=>({id,charId:'char_002_amiya',col,row,position:'MELEE',maxHp:100000,
  atk:0,def:100,magicRes:25,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 B.operators.sort((a,b)=>a.id-b.id);
 for(const o of B.operators)Object.assign(o,{atk:0,def:100,magicRes:25,attributeBase:{atk:0,def:100,aspd:1},
  basicAttack:{action:'attack',damageType:'phys'},cd:999,deployed:true,deployT:5,deployAt:0,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,
  skill:null,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  flow:null,attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:0});
 B.operators[0].tauntLevel=20;
 // Hidden characters cannot be selected, but the compiled explosion ignores camouflage.
 B.operators[2].camouflageUntil=999;
 const source=JSON.parse(JSON.stringify(selectiveSource));
 const e={...source,x:0,y:.5,hp:source.maxHp,atkType:'arts',dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,source);B.enemies.push(e);return e;
}
function selectiveStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function selectiveUntil(test,max=1200){for(let i=0;i<max;i++){if(test())return;selectiveStep();}throw Error('selective attack condition did not occur');}
function selectiveShots(){return B.projectiles.filter(p=>p.enemyActionPacket?.provider==='enemy-selective-attacks');}
function selectiveStart(e){selectiveUntil(()=>e.atkSchedule?.selectiveAttack);return e.atkSchedule;}
function selectiveFirst(e){const cast=selectiveStart(e);selectiveUntil(()=>cast.nextHit===1);return cast;}
function selectiveAll(e){const cast=selectiveStart(e);selectiveUntil(()=>cast.nextHit===3);return cast;}
function selectiveLosses(){return Array.from(B.operators,o=>100000-o.hp);}
function selectiveModeOneFixture(){
 // This explicit state proves selector consumption only. The real target's
 // spawning, natural mode switches and retaliation are not supplied by this provider.
 const target={enemyId:'enemy_9023_acdums',x:6,y:3,hp:100000,maxHp:100000,def:0,magicRes:0,
  externalCombatMode:1,applyWay:'NONE',canAttack:false,atk:0,attackTime:4,moveSpeed:0,
  cd:999,route:-1,dead:false,visualId:23};
 B.enemies.push(target);return target;
}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=selectiveBattle();const data=ArkExternalCombat.profile(e).selectableAttack;
  assert.ok(data);assert.equal(e.rangeRadius,-1);assert.equal(e.atk,300);assert.equal(e.attackTime,3);
  let cast=selectiveStart(e);
  assert.equal(cast.branchIndex,1);assert.equal(e.atkTarget,B.operators[0]);assert.equal(cast.skillId,undefined);
  assert.equal(e.atkTargets.length,1);assert.equal(e.cd,3,'ordinary shared cooldown begins at cast start');
  const expected=ArkExternalCombat.actionTiming(data.action,e.attackTime);
  assert.ok(Math.abs(cast.windup-expected.windup)<1e-8);
  assert.ok(Math.abs(cast.hitOffsets[1]-cast.hitOffsets[0]-.25)<1e-8);
  assert.ok(Math.abs(cast.hitOffsets[2]-cast.hitOffsets[0]-.5)<1e-8);
  selectiveUntil(()=>cast.nextHit===1);
  assert.equal(selectiveShots().length,1);assert.deepEqual(selectiveLosses(),[0,0,0,0]);
  assert.equal(selectiveShots()[0].target,B.operators[0]);assert.equal(selectiveShots()[0].speed,10);
  assert.equal(selectiveShots()[0].enemyActionPacket.damageType,'arts');
  assert.ok(e.cd>0&&e.cd<3,'ordinary cooldown counts down while the source animation occupies the action');
  selectiveUntil(()=>cast.nextHit===3);
  assert.equal(selectiveShots().length,3,'all three actual outputs are in flight before the first arrival');
  assert.ok(selectiveShots().every(p=>p.enemyActionPacket.atk===300));
  e.atk=9000;
  selectiveUntil(()=>selectiveShots().length===0);
  assert.deepEqual(selectiveLosses(),[675,675,675,0],
   'three frozen 300 arts packets each deal 225 after RES; trace is not double-hit, hidden neighbour is included, outside is excluded');
  assert.equal(cast.nextHit,3);assert.ok(e.atkSchedule===cast&&e.cd>0,'projectiles do not finish the still-recovering ordinary animation');

  const before=Array.from(B.operators,o=>o.hp),target=B.operators[0];
  const plain=spawnProjectile({enemy:true,owner:e,target,sx:target.col-.01,sy:target.row,x:target.col-.01,y:target.row,
   tx:target.col,ty:target.row,dmg:1,damageType:'arts',speed:10,life:6,kind:'orb'});
  assert.equal(plain.enemyActionPacket,null,'recycled projectile resets the provider packet');
  selectiveStep();assert.deepEqual(Array.from(B.operators,(o,i)=>before[i]-o.hp),[1,0,0,0],
   'ordinary pooled output cannot inherit an explosion or its stored ATK');

  e=selectiveBattle();
  const blocker=B.operators[3],ground=BDATA.level.buildable.flatMap((row,r)=>row.map((kind,c)=>({kind,col:c,row:r})))
   .find(cell=>cell.kind!=='RANGED');
  assert.ok(ground);Object.assign(blocker,{col:ground.col,row:ground.row,blockCnt:1});
  Object.assign(e,{x:blocker.col,y:blocker.row});
  cast=selectiveStart(e);
  assert.equal(ArkOperatorCombat.blockerOf(e),blocker);assert.equal(cast.channel,'attack');
  assert.equal(e.atkTarget,B.operators[0],
   'source combat slot is absent: actual blocking does not replace the global selector with generic melee');
  assert.equal(cast.selectiveAttack,true);

  e=selectiveBattle();
  const savedRoutes=BDATA.level.routes;
  BDATA.level.routes=[...savedRoutes,{segs:[[{c:0,r:.5},{c:10,r:.5}]]}];
  Object.assign(e,{route:savedRoutes.length,seg:0,cp:1,wait:0});
  for(const o of B.operators)o.invisibleUntil=999;
  selectiveStep(15);
  assert.ok(e.x>.2&&!e.atkSchedule&&e.cd<0,'without an eligible global target, route movement and ordinary cooldown continue');
  B.operators[0].invisibleUntil=0;
  cast=selectiveStart(e);const stoppedAt=e.x;
  selectiveUntil(()=>cast.nextHit===3);
  assert.equal(e.x,stoppedAt,'the source attack animation occupies movement only for its current action');
  assert.ok(e.cd<e.attackTime&&e.cd>0);
  B.operators[0].invisibleUntil=999;
  selectiveUntil(()=>!e.atkSchedule);selectiveStep(3);
  assert.ok(e.x>stoppedAt,'route movement resumes after recovery when no further target is selectable');
  BDATA.level.routes=savedRoutes;

  e=selectiveBattle();cast=selectiveFirst(e);const first=selectiveShots()[0];
  e.hp=0;killEnemy(e);assert.equal(e.dead,true);
  selectiveUntil(()=>selectiveShots().length===0);
  assert.deepEqual(selectiveLosses(),[225,225,225,0],
   'source death cancels the unissued second and third shots but preserves the already emitted one');
  assert.equal(cast.nextHit,1);assert.ok(first.enemyActionPacket==null,'completed packet is cleared before pooling');

  e=selectiveBattle();cast=selectiveAll(e);
  for(const p of selectiveShots()){p.life=1/30;p.speed=.001;}
  selectiveStep();
  assert.deepEqual(selectiveLosses(),[675,675,675,0],'source lifetime expiry forces arrival at a still-valid trace');
  assert.equal(selectiveShots().length,0);

  e=selectiveBattle();cast=selectiveFirst(e);B.operators[0].removed=true;
  const removedHp=B.operators[0].hp;
  selectiveUntil(()=>selectiveShots().length===0);
  assert.equal(B.operators[0].hp,removedHp,'removed target cannot receive the forced trace output');
  // No new target is selected for later outputs; the emitted circle can still
  // resolve at its last position, according to this provider's explicit model.
  selectiveUntil(()=>cast.nextHit===3);
  assert.equal(selectiveShots().length,0,'invalid locked input never retargets the remaining burst');

  e=selectiveBattle();const sourceTarget=ArkExternalCombatData.enemies.enemy_9023_acdums;
  assert.ok(sourceTarget);assert.equal(sourceTarget.modes,undefined);assert.equal(sourceTarget.initialMode,undefined);
  assert.equal(sourceTarget.modeProviders,undefined,'natural target mode and retaliation remain an explicit dependency');
  const sameSide=selectiveModeOneFixture();cast=selectiveFirst(e);
  assert.equal(cast.branchIndex,0);assert.equal(e.atkTarget,sameSide);
  assert.equal(selectiveShots()[0].target,sameSide,'generic enemy projectile gates must retain a same-side trace');
  selectiveAll(e);selectiveUntil(()=>selectiveShots().length===0);
  assert.equal(sameSide.hp,99100,'forced trace receives one 300 arts output from each shot');
  assert.deepEqual(selectiveLosses(),[675,675,675,0],'opposing circle victims remain separate from same-side trace selection');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:121,name:'选择连射途中恢复'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'selectiveBattle();selectiveFirst(B.enemies[0]);');
  for(const deadSource of [false,true]){
   if(deadSource)machine.run('selectiveBattle();selectiveAll(B.enemies[0]);B.enemies[0].hp=0;killEnemy(B.enemies[0]);');
   const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
   assert.equal(checkpoint.battle.projectiles.length,deadSource?3:1);
   if(!deadSource)assert.equal(checkpoint.battle.enemies[0].atkSchedule.nextHit,1);
   assert.ok(checkpoint.battle.projectiles.every(p=>p.enemyActionPacket?.atk===300));
   machine.run('selectiveStep(60);');const after=runtime.snapshot();
   runtime.restore(checkpoint);machine.run('selectiveStep(60);');const restored=runtime.snapshot();
   delete after.battle.particles;delete restored.battle.particles;
   assert.deepEqual(restored.battle,after.battle,
    deadSource?'host restore preserves emitted packets after source death':'host restore continues the existing hit cursor and in-flight owner/target references without duplicate outputs');
   assert.deepEqual(Array.from(restored.battle.operators,o=>100000-o.hp),[675,675,675,0]);
  }
 }finally{runtime.dispose();}
 console.log('SELECTIVE ATTACKS OK: source engine entry, shared CD, three arts circles, explicit same-side mode fixture, source death, pool reset and two host restores');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
