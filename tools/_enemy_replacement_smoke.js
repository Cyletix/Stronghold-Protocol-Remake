'use strict';
const assert=require('assert/strict'),r=require('../web/src/simulation/enemy-replacement');
// Regression fixtures derived from documented native operation order. These test
// the port; client correspondence is established by the referenced ARM64 bodies.
const constants={enemyMaxHpFactor:1,enemyAtkFactor:2,enemyDefFactor:3,enemyMagicResistanceFactor:4,minReplacedEnemyCount:1,maxReplacedEnemyCount:50,
 templateEnemyNormal:'walk',templateEnemyNormalFly:'fly',templateEnemyToken:'token',templateEnemyTokenFly:'token-fly'};
const attrs={maxHp:100,atk:10,def:5,magicResistance:2};
assert.equal(r.enemyAttrPower(attrs,constants),143);
const origin={enemyKey:'old',enemyBattleEffectivenessFactor:2},target={enemyKey:'new',enemyBattleEffectivenessFactor:4};
const action={key:'old',count:10,interval:0.25,preDelay:3,routeIndex:7,useExtraRoute:true,hiddenGroup:'branch'};
assert.equal(r.actionBattleEffectiveness(action,attrs,origin,constants),715);
assert.equal(r.enemyCountByBattleEffectiveness(715,attrs,target,constants),20);
const replacement=r.replaceAction(action,attrs,origin,attrs,target,constants);
assert.deepEqual(replacement,{...action,key:'new',count:20,interval:0.125});
assert.equal(action.key,'old');assert.equal(action.count,10);
assert.equal(replacement.count*replacement.interval,action.count*action.interval);
assert.equal(JSON.parse(JSON.stringify(replacement)).interval,0.125);
for(const [input,expected] of [[0.5,0],[1.5,2],[2.5,2],[3.5,4],[-0.5,0],[-1.5,-2],[-2.5,-2],[-3.5,-4]])assert.equal(r.roundToEven(input),expected);
const unit={maxHp:1,atk:0,def:0,magicResistance:0},one={enemyKey:'unit',enemyBattleEffectivenessFactor:1};
assert.equal(r.enemyCountByBattleEffectiveness(2.5,unit,one,constants),2);
assert.equal(r.enemyCountByBattleEffectiveness(3.5,unit,one,constants),4);
assert.equal(r.enemyCountByBattleEffectiveness(2.50000001,unit,one,constants),2,'quotient rounds to float32 before midpoint test');
assert.equal(r.enemyCountByBattleEffectiveness(2.50000024,unit,one,constants),3);
assert.equal(r.enemyCountByBattleEffectiveness(1000,unit,one,constants),50);
assert.equal(r.enemyCountByBattleEffectiveness(0.1,unit,one,constants),1);
assert.equal(r.actionBattleEffectiveness(action,attrs,null,constants),0);
assert.equal(r.enemyCountByBattleEffectiveness(99,attrs,null,constants),0);
const zero={maxHp:0,atk:0,def:0,magicResistance:0};
assert.equal(r.enemyCountByBattleEffectiveness(99,zero,one,constants),0,'native unit=0 returns before minimum clamp');
assert.throws(()=>r.replaceAction(action,attrs,origin,zero,one,constants),/non-finite/);
const zeroFactor={enemyKey:'factor-zero',enemyBattleEffectivenessFactor:0};
assert.equal(r.actionBattleEffectiveness(action,attrs,zeroFactor,constants),Infinity);
assert.equal(r.enemyCountByBattleEffectiveness(99,attrs,zeroFactor,constants),1,'positive power / zero factor gives infinite unit, finite budget / unit gives zero, clamped to minimum');
assert.throws(()=>r.replaceAction(action,attrs,zeroFactor,attrs,target,constants),/non-finite/);
assert.throws(()=>r.enemyAttrPower({...attrs,atk:NaN},constants),/int32/);
const roundingAttrs={maxHp:16777216,atk:1,def:1,magicResistance:0};
const allOne={...constants,enemyAtkFactor:1,enemyDefFactor:1};
assert.equal(r.enemyAttrPower(roundingAttrs,allOne),16777216,'each float32 addition rounds separately');
const templates=['unrelated','fly','token','walk','token-fly'].map(key=>({key}));
for(const [fly,token,index] of [[false,false,3],[true,false,1],[false,true,2],[true,true,4]])assert.deepEqual(r.selectSpEnemyActionData({isFlyEnemy:fly},templates,token,constants),{action:templates[index],actionIndex:index});
assert.deepEqual(r.selectSpEnemyActionData(null,templates,false,constants),{action:templates[0],actionIndex:0});
assert.deepEqual(r.selectSpEnemyActionData({isFlyEnemy:false},[],false,constants),{action:null,actionIndex:0});
function rng(seed){let state=seed>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
assert.equal(r.selectWeighted([{randomWeight:1,key:'a'},{randomWeight:1,key:'b'}],()=>0.5000025).key,'a','native LE tolerance admits the first interval edge');
assert.equal(r.selectWeighted([{randomWeight:1,key:'a'},{randomWeight:1,key:'b'}],()=>0.50001).key,'b');
const fixture={constants:{...constants,maxLevelCnt:5,specialEnemyNum:1,enemyTypeIdentifierToFillRandom:1},
 types:{DEFAULT:{type:'DEFAULT',typeIdentifier:1,involveRandom:false},FLY:{type:'FLY',typeIdentifier:2,involveRandom:true}},
 seasons:{season:{typeDraw:{FLY:{count:3,weight:99}},modes:{mode:{inactiveEnemyKey:['blocked']}},specialEnemyInfo:{}}}};
for(const [type,id] of [['DEFAULT',1],['FLY',2]])for(const early of [true,false]){
 const key=type+(early?'early':'late');fixture.seasons.season.specialEnemyInfo[key]={type,specialEnemyKey:key,isInFirstHalf:early,randomWeight:1,attachedNormalEnemyKeys:['normal-a','normal-b'],attachedEliteEnemyKeys:['elite']};
}
fixture.seasons.season.specialEnemyInfo.blocked={type:'FLY',specialEnemyKey:'forbidden',isInFirstHalf:true,randomWeight:999,attachedNormalEnemyKeys:[],attachedEliteEnemyKeys:[]};
const plan=r.generatePlan(fixture,'season','mode',{random:rng(15)});
assert.deepEqual(plan,r.generatePlan(fixture,'season','mode',{random:rng(15)}));
assert.equal(plan.roundTypes.filter(x=>x===2).length,3);assert.equal(plan.roundTypes.filter(x=>x===1).length,2);assert.deepEqual(plan.missingRounds,[]);
for(const row of Object.values(plan.rounds)){
 assert.ok(row.specialKey.endsWith(row.round<=2?'early':'late'),'odd maxLevelCnt halves at integer truncation');
 assert.equal(row.eliteKey,'elite');assert.notEqual(row.specialEntryKey,'blocked');
}
const supplied=r.generatePlan(fixture,'season','mode',{random:rng(1),roundEnemies:[{round:2,enemyType:2},{round:5,enemyType:2}]});
assert.deepEqual(supplied.roundTypes,[1,2,1,1,2]);
assert.throws(()=>r.generatePlan(fixture,'season','mode',{}),/explicit random/);
const sourceFixture={level:{id:'demo'},waves:[{fragments:[{actions:[{...action,key:'walk',actionType:'SPAWN'},{...action,key:'fly',actionType:'SPAWN'},{...action,key:'fixed',actionType:'SPAWN'}]},{actions:[{...action,key:'walk',actionType:'SPAWN'}]}]}],enemies:{walk:{sourceAttributes:attrs},fixed:{sourceAttributes:attrs},new:{sourceAttributes:attrs}}};
const replaceFixture={constants,attributes:{walk:{...origin,enemyKey:'walk'},fly:{...origin,enemyKey:'fly'},new:{...target,isFlyEnemy:false}},quantityAttributes:{new:{...attrs,maxHp:999}},enemies:{new:{sourceAttributes:{...attrs,maxHp:999}}}};
const sourceBefore=JSON.stringify(sourceFixture),applied=r.applyToSource(sourceFixture,{normalKey:'new'},replaceFixture);
assert.equal(JSON.stringify(sourceFixture),sourceBefore);
assert.deepEqual(applied.waves[0].fragments[0].actions.map(x=>x.key),['new','fixed']);
assert.equal(applied.waves[0].fragments[0].actions[0].count,20,'target level override takes priority over global quantity attributes');
assert.strictEqual(applied.waves[0].fragments[1],sourceFixture.waves[0].fragments[1]);
assert.strictEqual(applied.enemies.new,sourceFixture.enemies.new);
console.log('ENEMY REPLACEMENT OK native power, divisor semantics, float32 operation order, round-to-even, count clamp, interval conservation, template slots, JSON boundary');
