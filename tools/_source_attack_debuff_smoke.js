'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const combat=fs.readFileSync(path.join(__dirname,'../web/src/simulation/operator-combat.js'),'utf8');
// Exercise the actual shared enemy consumers without starting unrelated game modes.
const engine=fs.readFileSync(path.join(__dirname,'../web/engine.js'),'utf8');
const consumers=engine.slice(engine.indexOf('function enemyAttackPower('),engine.indexOf('// 敌人施放技能（主动）'));
function machine(time=0){
 const context={window:{},B:{time},operatorDefense:o=>o.def||0,operatorResistance:o=>o.res||0};
 vm.runInNewContext(combat+'\n'+consumers,context);
 return {context,api:context.window.ArkOperatorCombat};
}
const {context,api}=machine(),owner={id:7},target={id:1,hp:100,atk:1000,statusResistance:1};
const effect={kind:'attack-multiplier',key:'source[atk-down]',duration:3,value:.6};
assert.equal(api.attackMultiplier(target),1);
assert.equal(api.applySourceBuff(owner,target,effect),true);
assert.equal(api.sourceBuffActive(target,effect.key),true);
assert.equal(api.movementMultiplier(target),1,'attack reduction cannot reduce movement or count as slow');
assert.equal(api.isSlowed(target),false);
assert.equal(target.operatorAttackMultipliers[effect.key].ownerId,7);
assert.equal(target.operatorAttackMultipliers[effect.key].until,3,'ATK modifier is not shortened by abnormal status resistance');
assert.equal(context.enemyAttackPower(target),600);
assert.equal(context.enemyAttackPower(target,2),1200,'shared attack scale follows source final scaler');
assert.equal(context.enemyDamageToOperator(target,{def:100,res:25},1,'phys'),500);
assert.equal(context.enemyDamageToOperator(target,{def:100,res:25},1,'arts'),450);
context.B.time=1;
api.applySourceBuff({id:8},target,{...effect,value:.8,duration:1});
assert.equal(target.operatorAttackMultipliers[effect.key].ownerId,8,'non-independent key records the latest source');
assert.equal(target.operatorAttackMultipliers[effect.key].until,3,'existing max-expiry model is retained');
assert.equal(api.attackMultiplier(target),.8,'same key does not multiply per owner');
api.applySourceBuff(owner,target,{...effect,key:'different-key',value:.5,duration:1});
assert.equal(api.attackMultiplier(target),.4,'distinct final-scaler keys multiply');
const cached={atk:context.enemyAttackPower(target)};
const restored=machine(1),copy=JSON.parse(JSON.stringify(target));
assert.equal(restored.api.sourceBuffActive(copy,effect.key),true);
assert.equal(restored.context.enemyAttackPower(copy),400,'serialized active key/source/value/expiry affects enemy attacks');
restored.context.B.time=2;
assert.equal(restored.api.sourceBuffActive(copy,'different-key'),false);
assert.equal(restored.context.enemyAttackPower(copy),800);
restored.context.B.time=3;
assert.equal(restored.api.sourceBuffActive(copy,effect.key),false);
assert.equal(restored.context.enemyAttackPower(copy),1000);
assert.equal(cached.atk,400,'a packet that already cached attack power retains its emitted value');
for(const bad of [{...effect,value:NaN},{...effect,value:1},{...effect,value:-.1},{...effect,duration:0},{...effect,duration:Infinity},{...effect,key:''}])
 assert.equal(api.applySourceBuff(owner,target,bad),false);
assert.equal(api.applySourceBuff(owner,{hp:0},effect),false);
assert.equal(api.applySourceBuff(owner,{hp:100,dead:true},effect),false);
context.B.time=3;api.applySourceBuff(owner,target,{...effect,value:0,duration:1});
assert.equal(context.enemyAttackPower(target),0,'zero attack final scaler is valid');
console.log('SOURCE ATK DEBUFF OK: exact keys, ownership, finite validation, expiry/refresh, multiplicative keys, engine attack/damage and serialized restore');
