'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'web/engine.js'),'utf8');
const contract=()=>({kind:'chain',speed:1,lifeTime:1,damageType:'arts',
 chain:{maxTargets:4,radius:2,decay:.8,allowRepeat:false,interval:0},
 sourceKeys:{radius:'chain.radius'},element:{type:'apoptosis',ratio:.1},
 lifecycle:{waitForProjectileInvalid:true,finishWhenInvalid:false,waitForAnimEnd:false,minPostDelay:0}});
const channel=projectile=>({delivery:'projectile',projectile,timing:{duration:1,hit:.2}});
function segment(source,start,end){
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 assert.ok(begin>=0&&finish>begin,'expected bounded source segment');return source.slice(begin,finish);
}

test('root, channel and mode use the selected chain contract and reject unsupported lifecycles',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'web/src/simulation/external-combat.js'),'utf8'),c);
 const api=c.ArkExternalCombat,enemy={enemyId:'fixture',externalCombatMode:0,sourceTalentBlackboard:[{key:'chain.radius',value:-1}]};
 c.ArkExternalCombatData={enemies:{fixture:{initialMode:0,modes:{0:{channels:{attack:channel(contract())}}}}}};
 assert.equal(api.canAttack(enemy,{channel:'attack'}),false);
 assert.equal(api.attackTiming(enemy,1,{channel:'attack'}),null,'invalid chain cannot become an ordinary projectile');
 delete enemy.externalCombatMode;
 c.ArkExternalCombatData.enemies.fixture={channels:{attack:channel(contract())}};
 assert.equal(api.canAttack(enemy,{channel:'attack'}),false);
 assert.equal(api.canAttack(enemy),false);
 const bad=contract();bad.lifeTime=Infinity;
 c.ArkExternalCombatData.enemies.fixture={projectile:bad,modes:{0:{channels:{attack:channel({speed:2})}}}};
 enemy.externalCombatMode=0;
 assert.equal(api.canAttack(enemy,{channel:'attack'}),true,'unselected bad root chain cannot block an ordinary active mode');
 enemy.bossMechanics={attack:{}};assert.equal(api.canAttack(enemy,{channel:'attack'}),true);
 for(const mutate of [c=>c.lifeTime=Infinity,c=>c.chain.maxTargets=65,c=>c.element.type='unknown',
   c=>c.lifecycle.waitForProjectileInvalid=false,c=>c.lifecycle.waitForAnimEnd=true]){
  const invalid=contract();mutate(invalid);assert.equal(api.chainProjectile({},invalid),null);
 }
});

test('chain lifetime bounds flight, callback follows its restored owner and pooled state is cleared',()=>{
 const pool={items:[],acquire(){return this.items.pop()||{};},release(value){this.items.push(value);}};
 const c=vm.createContext({assert,window:{},projectilePool:pool,playSfx(){},finishDefeatedLeader:()=>false,
  spawnHitParticles(){},gameRandom:()=>1,operatorDodge:()=>0,enemyDamagePacketToOperator:atk=>atk,
  inflictDamage:(target,value)=>{target.hp-=value;},gainOperatorSp(){},tryKill:target=>{target.dead=true;}});
 vm.runInContext(segment(engine,'function recycleProjectile(','function compactParticles('),c);
 vm.runInContext(segment(engine,'function finishEnemyProjectile(','function refreshEnemyModeProviders('),c);
 const flights=segment(engine,'  // 弹道飞行：','  // 粒子推进');
 const aging=engine.match(/  if \(B\.projectiles\) \{ for \(const p of B\.projectiles\).*compactProjectiles\(B\.projectiles\); \}/)[0];
 vm.runInContext(`function advanceFlights(dt){${flights}\n${aging}}`,c);
 const room=fs.readFileSync(path.join(__dirname,'lib/room-game-runtime.js'),'utf8');
 vm.runInContext(segment(room,'function roomBattleLinks(','function roomCapture('),c);
 c.chain=contract();
 vm.runInContext(`
  function setup(life,targetX=.3){
   const target={col:targetX,row:0,hp:100,deployAt:0,deployT:1};
   const owner={atkPhase:'projectile',atkSchedule:{projectileToken:1,pendingProjectiles:1}};
   B={time:1,operators:[target],enemies:[owner],projectiles:[]};
   spawnProjectile({enemy:true,enemyChain:chain,attackPacket:{atk:10,outputScale:1,damageType:'arts',frozenAttackScale:1},
     owner,target,castToken:1,sx:0,sy:0,x:0,y:0,tx:targetX,ty:0,speed:1,life});
  }
  setup(.1);advanceFlights(.5);
  assert.equal(B.operators[0].hp,100,'a frame longer than remaining lifetime cannot hit beyond expiry');
  assert.equal(B.enemies[0].atkSchedule,null,'timeout releases its own waiting cast');
  setup(1);const links=roomBattleLinks();B=JSON.parse(JSON.stringify(B));roomRestoreBattleLinks(links);
  assert.equal(B.projectiles[0].owner,B.enemies[0]);assert.equal(B.projectiles[0].target,B.operators[0]);
  advanceFlights(.4);assert.equal(B.operators[0].hp,90);assert.equal(B.enemies[0].atkSchedule,null);
  setup(.1);B.enemies[0].atkSchedule={projectileToken:2,pendingProjectiles:1};B.enemies[0].atkPhase='windup';
  advanceFlights(.5);assert.equal(B.enemies[0].atkSchedule.pendingProjectiles,1,'old cast callback cannot finish a newer mode cast');
  setup(1);B.operators[0].dead=true;B.operators.push({col:.3,row:0,hp:100,deployAt:0,deployT:1});
  advanceFlights(.4);assert.equal(B.operators[1].hp,100,'lost first target cannot retarget another unit');
  assert.equal(B.enemies[0].atkSchedule,null);
  const normal=spawnProjectile({enemy:true,dmg:7,life:1});
  assert.equal(normal.enemyChain,null);assert.equal(normal.attackPacket,null);assert.equal(normal.castToken,null);assert.equal(normal.enemyCompleted,false);
 `,c);
});
