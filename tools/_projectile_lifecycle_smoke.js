'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();window.onBattleEnd=()=>{};window.onLeak=()=>{};
 function setup(){
  startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:1000,atk:0,def:0,attackTime:100,blockCnt:0,range:0}], [{at:99999,enemyId:'unused',route:0}],100);
  B.operators[0].cd=999;B.operators[0].deployed=true;B.operators[0].deployT=5;B.operators[0].skill=null;
  const enemy={x:3,y:3,hp:1000,maxHp:1000,atk:0,def:0,magicRes:0,rangeRadius:0,moveSpeed:0,dead:false,route:-1,cd:999};B.enemies=[enemy];return {op:B.operators[0],enemy};
 }
 function shot(target,enemy=true){return spawnProjectile({x:0,y:3,tx:3,ty:3,target,owner:enemy?B.enemies[0]:B.operators[0],enemy,dmg:100,speed:10,life:6,kind:'orb'});}
 let {op,enemy}=setup();const p=shot(op);op.dead=true;update(0.4,0.4);
 assert.equal(enemy.hp,1000,'enemy projectile must not hit its own nearby ally when the operator dies');
 assert.equal(p.target,null);assert.equal(p.owner,null,'recycled projectile releases owner reference');
 ({op,enemy}=setup());const deadEnemy={...enemy,dead:true},neighbor=enemy;shot(deadEnemy,false);update(0.4,0.4);
 assert.equal(neighbor.hp,1000,'single-target shot does not retarget a neighbor after original target dies');
 ({op,enemy}=setup());const moving=shot(enemy,false);enemy.x=4;update(0.1,0.1);
 assert.equal(moving.tx,4,'live target continues to be tracked');update(0.4,0.4);assert.equal(enemy.hp,900,'exactly one live-target hit');
 ({op,enemy}=setup());shot(op,true);update(0.4,0.4);assert.equal(op.hp,900,'enemy projectile still hits living operator');
 ({op,enemy}=setup());const old=shot(op,true);old.life=0;compactProjectiles(B.projectiles);
 const reused=spawnProjectile({x:0,y:3,tx:3,ty:3,dmg:0,speed:1,life:1,kind:'arrow'});
 assert.equal(reused,old,'test crosses the same pooled object');assert.equal(reused.enemy,false);assert.equal(reused.owner,null);assert.equal(reused.target,null);
 releaseProjectiles(B.projectiles);B.projectiles=[];assert.equal(reused.target,null);assert.equal(reused.owner,null);
 assert.ok(projectilePool.stats().free>0);
 console.log('PROJECTILE LIFECYCLE OK dead targets, factions, moving targets, one-hit damage, pooled reuse and reference cleanup');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
