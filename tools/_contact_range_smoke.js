'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run('initMode()');
 f.run(`
 chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 function contactSetup({dx=-1,dy=0,dir='right',group=true,speed=1,count=3}={}){
  B.over=false;B.phase='battle';B.time=0;B.roundTime=0;B.roundLimit=999;B.waveScheduler=null;B.spawn=[{at:999,enemyId:'none'}];
  B.enemies=[];B.projectiles=[];B.particles=[];B.summoneds=[];B.operatorZones=[];B.combatEffects=[];B.leader=null;B.leaderEnemyId=null;
  BDATA.level={...BDATA.level,rows:10,cols:10,sourceRoutes:true,buildable:Array.from({length:10},()=>Array(10).fill('MELEE')),routes:[]};
  const guard={id:1,charId:'ordinary',position:'MELEE',row:4,col:4,dir,cells:[[4,4]],rangeGrids:[{row:0,col:0}],range:0,
   atk:100,atkType:'phys',attackTime:1,cd:0,hp:100000,maxHp:100000,def:0,blockCnt:3,events:[],buffs:[],deployed:true,deployAt:0,deployT:1,sp:0,
   basicAttack:{kind:group?'blockCount':'single'}};
  const sniper={...guard,id:2,col:7,position:'RANGED',blockCnt:0,cells:[[4,4],[4,5],[4,6],[4,7]],rangeGrids:[{row:0,col:0},{row:0,col:-1},{row:0,col:-2},{row:0,col:-3}],basicAttack:{kind:'single'}};
  B.operators=[guard,sniper];
  for(let i=0;i<count;i++){
   const side=(i-1)*.2,x=4+dx*1.2-dy*side,y=4+dy*1.2+dx*side;
   BDATA.level.routes.push({segs:[[{c:x,r:y},{c:4-dx*4-dy*side,r:4-dy*4+dx*side}]]});
   B.enemies.push({id:10+i,visualId:10+i,x,y,maxHp:10000,hp:10000,def:0,magicRes:0,dead:false,canAttack:false,
    moveSpeed:speed,route:i,seg:0,cp:1,wait:0,cd:0,applyWay:'MELEE',attackTime:1,atk:10});
  }
  return guard;
 }
 function advanceContact(seconds,dt=1/30){for(let i=0;i<Math.round(seconds/dt);i++)update(dt,dt);}
 let guard=contactSetup();advanceContact(1);
 assert.equal(guard.blocked,3);
 assert.ok(B.enemies.every(e=>e.hp<10000),'own-tile group attacker must hit all three blocked enemies behind it');
 assert.ok(B.enemies.every(e=>Math.abs(e.x-3.5)<1e-9),'movement stops at the own-tile border, not the outside visual radius');
 assert.equal(B.operators[1].atkAnimAt,undefined,'extended ranged boundary must not acquire these same enemies');
 for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])for(const dir of ['up','down','left','right']){
  guard=contactSetup({dx,dy,dir});B.operators.length=1;advanceContact(1);
  assert.ok(B.enemies.every(e=>e.blockerId===guard.id&&e.hp<10000),'all four approach sides work independently of facing');
  assert.ok(B.enemies.every(e=>Math.abs(Math.max(Math.abs(e.x-4),Math.abs(e.y-4))-.5)<1e-9));
 }
 guard=contactSetup({group:false});advanceContact(1);
 assert.equal(B.enemies.filter(e=>e.hp<10000).length,1,'a single-target defender must remain single-target');
 guard=contactSetup({speed:100,count:4});B.operators.length=1;const overflow=B.enemies[3];update(.1,.1);update(0,0);
 assert.equal(B.enemies.filter(e=>e.blockerId===guard.id).length,3,'a fast movement step must not tunnel past available blockers');
 assert.ok(B.enemies.slice(0,3).every(e=>Math.abs(e.x-3.5)<1e-9&&e.hp<10000));
 assert.ok(overflow.x>4.5,'the fourth enemy passes a full three-block operator');
 guard=contactSetup({dx:-1,dy:-1,count:1,speed:100});B.operators.length=1;update(.1,.1);update(0,0);
 assert.ok(B.enemies[0].hp<10000,'diagonal own-tile corner contact remains targetable');
 // Exact edges, either side of them, seams inside a shape, and a missing own cell.
 guard=contactSetup();const target={x:3.5,y:4,hp:10000};
 assert.equal(enemyInOperatorRange(guard,target),false,'geometric range never grants the own-tile contact exception');
 assert.equal(enemyInBasicAttackRange(guard,{...target,blockerId:guard.id}),true);
 assert.equal(enemyInBasicAttackRange(guard,target),false,'contact requires this operator to actually block the enemy');
 assert.equal(enemyInOperatorRange(guard,{...target,x:3.4999}),false);
 assert.equal(enemyInOperatorRange(B.operators[1],target),false);
 assert.equal(enemyInOperatorRange(B.operators[1],{...target,x:3.5001}),true);
 assert.equal(enemyInOperatorRange(B.operators[1],{...target,x:4.5}),true,'internal seams are not holes in a continuous range');
 assert.equal(enemyInOperatorRange({...guard,cells:[[4,5]]},target),false,'do not invent an own tile absent from the range');
 assert.equal(skillTargets(guard,{rangeGrids:[{row:0,col:0}]},[target]).length,0,'independent skill effects require geometric entry');
 assert.equal(skillTargets(B.operators[1],{},[target]).length,0,'generic skill targeting obeys the same boundary');
 assert.equal(enemyInOperatorRange({...guard,cells:null},target),false,'radius-only effects also exclude the border');
 assert.equal(enemyInBasicAttackRange({...guard,cells:null},{...target,blockerId:guard.id}),true);
 assert.equal(enemyInOperatorRange({...guard,cells:null}, {...target,x:3.4999}),false);
 // Logic must not depend on the pixels-per-tile chosen for a viewport.
 const originalTile=TILE;
 for(const tile of [16,60,120]){TILE=tile;guard=contactSetup();advanceContact(1);assert.ok(B.enemies.every(e=>e.x===3.5&&e.hp<10000));}
 TILE=originalTile;
 // Sweep order follows the first physical contact, not the operator array order.
 guard=contactSetup({speed:100,count:1});const closer={...guard,id:3,col:3,cells:[[4,3]],cd:999};B.operators=[guard,closer];
 update(.1,.1);assert.equal(B.enemies[0].blockerId,closer.id);
 // Normal approach/attack/release; attacks must not leave the contact point drifting.
 guard=contactSetup();B.operators.length=1;B.enemies.length=1;const foe=B.enemies[0];foe.canAttack=true;guard.cd=999;
 advanceContact(2);assert.ok(guard.hp<guard.maxHp);assert.equal(foe.blockerId,guard.id);assert.ok(Math.abs(foe.x-3.5)<1e-9);
 guard.dead=true;foe.atkPhase=null;advanceContact(.3);assert.equal(foe.blockerId,null);assert.ok(foe.x>3.5);
 for(const flag of ['flying','unblockable']){
  guard=contactSetup();B.operators.length=1;B.enemies.length=1;B.enemies[0][flag]=true;advanceContact(1);
  assert.equal(B.enemies[0].blockerId,null);assert.equal(guard.blocked,0);assert.ok(B.enemies[0].x>3.5);
 }
 // A stage can allow ranged operators on ground, but it cannot change their
 // source deployment identity. Extra block does not grant a rear basic target.
 for(const count of [1,2,3]){
  guard=contactSetup({count});B.operators.length=1;
  Object.assign(guard,{charId:'char_134_ifrit',position:'MELEE',basicAttack:{kind:'rangeAll'}});
  advanceContact(1);assert.equal(guard.blocked,count);assert.ok(B.enemies.every(e=>e.hp===10000),'Ifrit remains natively ranged even with a temporary placement override');
  for(const e of B.enemies)e.x=3.51;
  update(0,0);assert.ok(B.enemies.every(e=>e.hp<10000),'ranged AoE acquires all enemies once their centres actually enter');
 }
 // Opening a buff skill is not equivalent to using an independent damage selector.
 guard=contactSetup();B.operators.length=1;
 guard.skill={sourceId:'test_normal_attack_buff',spCost:1,duration:10,effects:[{type:'buff_atk',power:1}]};guard.sp=1;
 castSkill(guard);advanceContact(1);assert.ok(B.enemies.every(e=>e.hp===9800),'ground group attacks retain contact while buffed');
 // The reported proxy is Reignfrost, not the original SilverAsh's S3.
 guard=contactSetup();B.operators.length=1;
 const proxy=SKILL_CHOICES.char_1045_svash2[2];guard.charId='char_1045_svash2';
 guard.skill={...proxy.normal,sourceId:proxy.skillId};guard.sp=guard.skill.spCost;
 castSkill(guard);advanceContact(1);assert.ok(B.enemies.every(e=>e.hp===10000));
 assert.equal(operatorUsesIndependentTargeting(guard,guard.skill),true);
 assert.equal(operatorUsesIndependentTargeting({...guard,charId:'char_172_svrash'},{sourceId:'skchr_svrash_3'}),false);
 for(const e of B.enemies)e.x=3.51;update(0,0);assert.ok(B.enemies.some(e=>e.hp<10000));
 for(const e of B.enemies){e.x=3.5;e.hp=10000;}endOperatorSkill(guard);guard.cd=0;update(0,0);
 assert.ok(B.enemies.every(e=>e.hp<10000),'ending the proxy skill restores the ground basic-attack selector');
 // Summoned entities obey their own identity and selector, not their master's.
 for(const [charId,nativePosition,canHit] of [['test_ground_token','MELEE',true],['test_ranged_token','RANGED',false],['token_10052_radian_tower2','MELEE',false]]){
  guard=contactSetup({count:2});B.operators=[];
  const token={...guard,charId,nativePosition,position:'MELEE',life:10};B.summoneds=[token];
  advanceContact(1);assert.equal(token.blocked,2);assert.equal(B.enemies.some(e=>e.hp<10000),canHit,charId);
  if(!canHit){for(const e of B.enemies)e.x=3.51;token.cd=0;update(0,0);assert.ok(B.enemies.some(e=>e.hp<10000),charId+' can hit inside');}
 }
 console.log('CONTACT RANGE OK: boundary stop, own/extended edges, facing, target cap, fast movement, release and exclusions');
 `);
 // Use the actual room authority VM and signed snapshot restore, not a second
 // copy of the geometric formulas. A restore must preserve contact and damage.
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m._compile(source.replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_single_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:11,name:'contact'});
 try{
  p.startBattle();p.__testMachine.run(f.run('contactSetup.toString()')+'\ncontactSetup();');
  p.advance(1);
  assert.ok(p.__testMachine.run('B.enemies.every(e=>e.x===3.5&&e.blockerId===1&&e.hp<10000)'));
  assert.equal(p.__testMachine.run('B.operators[1].atkAnimAt'),undefined);
  const checkpoint=p.snapshot();p.advance(1.2);
  const state=()=>({enemies:p.snapshot().battle.enemies,operators:p.snapshot().battle.operators,rng:p.snapshot().rng});
  const next=state();p.restore(checkpoint);p.advance(1.2);assert.deepEqual(state(),next);
  assert.ok(p.__testMachine.run('B.enemies.every(e=>e.x===3.5&&e.blockerId===1)'));
  p.__testMachine.run("contactSetup();B.operators.length=1;Object.assign(B.operators[0],{charId:'char_134_ifrit',position:'MELEE',basicAttack:{kind:'rangeAll'}});");
  p.advance(1);const rangedCheckpoint=p.snapshot();p.restore(rangedCheckpoint);p.advance(1);
  assert.ok(p.__testMachine.run('B.enemies.every(e=>e.hp===10000&&e.blockerId===1)'));
  p.__testMachine.run("contactSetup();B.operators.length=1;const o=B.operators[0],s=SKILL_CHOICES.char_1045_svash2[2];o.charId='char_1045_svash2';o.skill={...s.normal,sourceId:s.skillId};o.sp=o.skill.spCost;castSkill(o);");
  p.advance(1);const proxyCheckpoint=p.snapshot();p.restore(proxyCheckpoint);p.advance(1);
  assert.ok(p.__testMachine.run('B.enemies.every(e=>e.hp===10000&&e.blockerId===1)'));
  console.log('CONTACT SERVER OK: authoritative damage, border position and deterministic restore');
 }finally{p.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
