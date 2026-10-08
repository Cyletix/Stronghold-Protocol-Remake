'use strict';
const assert=require('assert/strict'),r=require('../web/src/simulation/enemy-replacement');
const encounters=require('../web/enemy_encounters.json'),sources=require('../web/source_battles.json');
assert.equal(encounters.constants.maxLevelCnt,15,'native maxLevelCnt must survive extraction');
assert.ok(encounters.quantityAttributes,'database attributes for quantity math must be exported separately from battle-only overrides');
function rng(seed){let state=seed>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
const templates=new Set(['templateEnemyNormal','templateEnemyNormalFly','templateEnemyElite','templateEnemyEliteFly','templateEnemySpecial','templateEnemySpecialFly'].map(k=>encounters.constants[k]));
let modes=0,levelRoundPairs=0,replaced=0;
for(const [seasonId,season] of Object.entries(encounters.seasons))for(const modeId of Object.keys(season.modes)){
 const plan=r.generatePlan(encounters,seasonId,modeId,{random:rng(17)});
 assert.deepEqual(plan,r.generatePlan(encounters,seasonId,modeId,{random:rng(17)}));
 assert.equal(plan.selectedTypes.length,3);assert.equal(new Set(plan.selectedTypes).size,3);
 assert.equal(plan.roundTypes.length,15);assert.deepEqual(plan.missingRounds,[]);
 for(const type of plan.selectedTypes)assert.equal(plan.roundTypes.filter(id=>id===encounters.types[type].typeIdentifier).length,season.typeDraw[type].count);
 for(const record of Object.values(plan.rounds)){
  assert.ok(!season.modes[modeId].inactiveEnemyKey.includes(record.specialEntryKey));
  assert.equal(season.specialEnemyInfo[record.specialEntryKey].isInFirstHalf,record.round<=7);
  for(const key of [record.specialKey,record.normalKey,record.eliteKey])assert.ok(encounters.enemies[key]&&encounters.attributes[key]&&encounters.quantityAttributes[key],key);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
 modes++;
 // Exercise every source level against each established category for this season.
 for(const [key,source] of Object.entries(sources.levels)){
  if(!key.includes('/'+seasonId+'/'))continue;
  const before=JSON.stringify(source);
  for(const record of Object.values(plan.rounds)){
   const result=r.applyToSource(source,record,encounters);
   assert.equal(JSON.stringify(source),before);
   const original=source.waves?.[0]?.fragments?.[0]?.actions||[],actual=result.waves?.[0]?.fragments?.[0]?.actions||[];
   const unchanged=original.filter(a=>a.actionType!=='SPAWN'||!templates.has(a.key));
   assert.deepEqual(actual.filter(a=>unchanged.includes(a)),unchanged);
   for(const action of actual){
    if(action.actionType==='SPAWN'&&templates.has(action.key))assert.ok([record.specialKey,record.normalKey,record.eliteKey].includes(action.key),'unselected template spawn remains: '+key+' '+action.key);
    if(action.actionType==='SPAWN')assert.ok(Number.isFinite(action.count)&&Number.isFinite(action.interval),'non-finite action');
   }
   assert.deepEqual(result.waves.slice(1),source.waves.slice(1));
   assert.deepEqual(result.waves[0]?.fragments.slice(1),source.waves[0]?.fragments.slice(1));
   assert.ok(JSON.stringify(result).length>0);
   replaced+=original.filter(a=>a.actionType==='SPAWN'&&templates.has(a.key)).length;
   levelRoundPairs++;
  }
 }
}
console.log('ENEMY PLAN SOURCE OK',modes,'season/mode plans,',levelRoundPairs,'level/round pairs,',replaced,'template action decisions; no reroll, non-finite action or input mutation');
