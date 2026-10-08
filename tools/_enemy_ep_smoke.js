'use strict';
// Legacy command kept operational, now with real page modules and typed EP.
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
(async()=>{await f.run('initMode()');f.run(`
chooseBand('band_amiya');startBattleRound();B.enemies=[];B.operators=[];
const base={talents:[{type:'ep_attack',power:.15},{type:'deathrattle',enemyKey:'enemy_x',cnt:2}],skills:[]};
const e={name:'test',atk:100,def:0,hp:1000,maxHp:1000,epType:'nervous',route:0,seg:0,cp:0,x:1,y:1};setupEnemy(e,base);
const o={name:'test',atk:100,def:100,maxHp:10000,hp:10000,col:1,row:1,buffs:[],dead:false};B.enemies=[e];B.operators=[o];
applyEnemyEpDamage(e,o);assert.equal(o.ep.nervous,15);o.ep.nervous=999;applyEnemyEpDamage(e,o);assert.equal(o.hp,9000);assert.equal(o.stunUntil,B.time+10);
ArkElements.clear(o);o.epResistance=50;applyEnemyEpDamage(e,o);assert.equal(o.ep.nervous,7.5);
ArkElements.clear(o);applyEnemyEpDamage({atk:100,epAttack:.2},o);assert.deepEqual(JSON.stringify(o.ep),'{}','unknown element must not default to burn');
BDATA={...BDATA,enemies:{...BDATA.enemies,enemy_x:{name:'child',maxHp:100,atk:10,def:0,dead:false,flying:false}}};
killEnemy(e,null);assert.equal(e.dead,true);assert.equal(B.enemies.length,3);assert.equal(B.enemies.filter(x=>!x.dead).length,2);
console.log('ENEMY EP OK typed damage, immunity, resistance, unknown type and deathrattle');
`);})().catch(e=>{console.error(e);process.exitCode=1;});
