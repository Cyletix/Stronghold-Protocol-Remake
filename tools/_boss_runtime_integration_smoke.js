'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');startBattleRound();B.waveScheduler=null;B.spawn=[];B.roundLimit=10000;
 const base=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_h07_04'].enemies.enemy_1521_dslily;
 const boss={...base,x:10,y:15,hp:base.maxHp,cd:0,dead:false,route:0,seg:0,cp:0,wait:0};setupEnemy(boss,base);B.enemies=[boss];
 assert.equal(boss.atkType,'phys');assert.ok(boss.bossMechanics);
 const start=[boss.x,boss.y];for(let i=0;i<300;i++)update(1/30,1/60);
 assert.deepEqual([boss.x,boss.y],start,'fixed bosses cannot follow their route to the gate');assert.equal(B.stats.leaks,0);
 const op=(id,def)=>({id,charId:'test',row:14,col:7,def,maxHp:100000,hp:100000,atk:1000,magicRes:20,position:'MELEE',range:0,cells:[[14,8]],attackTime:1,cd:1000,deployAt:0,deployT:2,deployed:true,dead:false,blockCnt:0,buffs:[]});
 B.operators=[op(1,100),op(2,400),op(3,250)];boss.cd=0;
 update(1/30,1/60);assert.deepEqual(boss.atkTargets.map(o=>o.id),[2,3]);assert.equal(boss.atkTimer,boss.attackTime*0.3);
 const hp=boss.hp;B.operators[0].cd=0;update(1/30,1/60);assert.ok(boss.hp<hp,'a melee range cell touching the large rectangle must hit even outside center cell');
 // Drive the actual source cooldowns without unrelated basic attacks masking skill damage.
 for(const o of B.operators){o.hp=100000;o.cd=10000;}
 update(boss.atkTimer,0);assert.equal(B.projectiles.length,0,'the source delayed damage buff is not an extra flying damage projectile');
 assert.equal(B.bossSkillEvents.length,2);assert.ok(Math.abs(B.bossSkillEvents[0].at-B.time-0.4)<0.00001);
 assert.equal(B.operators[1].hp,100000);B.bossSkillEvents=[];
 boss.atkPhase=null;boss.cd=10000;B.projectiles=[];ArkBossMechanics.setMode(boss,0);
 update(37,0);assert.equal(B.bossSkillEvents.length,0,'skill clocks advance while attack readiness is blocked');boss.cd=0;
 update(1/30,0);assert.equal(B.bossSkillEvents.length,1);assert.equal(B.bossSkillEvents[0].skillKey,'Rockfall');
 assert.equal(B.operators[1].hp,100000,'delayed impact must not occur at cast start');
 const rockDamage=enemyDamageToOperator({...boss,atk:boss.atk*1.4,atkType:'phys'},B.operators[1]);
 update(1,0);assert.equal(B.operators[1].hp,100000-rockDamage);assert.equal(B.operators[0].hp,100000);
 boss.cd=1000;update(8,0);boss.cd=0;const before=B.operators.map(o=>o.hp);update(1/30,0);
 for(let i=0;i<3;i++){assert.equal(before[i]-B.operators[i].hp,enemyDamageToOperator({...boss,atk:boss.atk*0.5,atkType:'arts'},B.operators[i]));assert.equal(B.operators[i].ep.nervous,Math.round(boss.atk*0.5));}
 assert.equal(boss.bossMode,0,'later-mode skills must not silently activate');
 const target=B.operators[0],targetHp=target.hp;B.bossSkillEvents=[{owner:boss,at:B.time,targets:[target],baseAtk:boss.atk,atkScale:2,damageType:'phys'}];target.dead=true;resolveBossSkillEvents();assert.equal(target.hp,targetHp,'a lost target cannot receive delayed damage');target.dead=false;
 B.bossSkillEvents=[{owner:boss,at:B.time,targets:[target],baseAtk:boss.atk,atkScale:2,damageType:'phys'}];boss.dead=true;resolveBossSkillEvents();assert.equal(target.hp,targetHp,'dead caster cancels unresolved local skill events');
 console.log('BOSS RUNTIME OK stationary source boss, melee footprint, two-defense targets, cast delays/types/element damage and dead-target cleanup');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
