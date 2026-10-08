'use strict';
// Shared input for the next batch's runtime assertions. Source/import checks
// alone never mark gameplay checkboxes or register an executable skill handler.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const source='data/ArknightsGameData/zh_CN/gamedata/excel/';
const families=[
 {id:'attack',keys:['atk'],skills:['skcom_atk_up[2]','skcom_atk_up[3]']},
 {id:'defense',keys:['def'],skills:['skcom_def_up[2]','skcom_def_up[3]']},
 {id:'healing',keys:['atk'],skills:['skcom_heal_up[2]','skcom_heal_up[3]']},
 {id:'attack-and-speed',keys:['atk','attack_speed'],skills:['skcom_quickattack[3]']},
 {id:'attack-speed',keys:['attack_speed'],skills:['skcom_magic_rage[2]','skcom_magic_rage[3]']}
];
function buildCommonBuffCases(){
 const chars=read(source+'character_table.json'),skills=read(source+'skill_table.json');
 const seasons=read(source+'activity_table.json').activity.AUTOCHESS_SEASON;
 const bySkill=new Map(families.flatMap(f=>f.skills.map(id=>[id,f]))),cases=[];
 for(const [seasonId,season]of Object.entries(seasons))for(const slot of Object.values(season.charShopChessDatas)){
  if(slot.isHidden||slot.tmplId||!slot.charId||!['NORMAL','PRESET'].includes(slot.chessType))continue;
  const char=chars[slot.charId];assert.ok(char,slot.charId);
  for(const [skillIndex,link]of char.skills.entries()){
   const family=bySkill.get(link.skillId);if(!family)continue;
   for(const [variant,chessId]of [['normal',slot.chessId],['elite',slot.goldenChessId]]){
    const training=season.charChessDataDict[chessId]?.status;assert.ok(training,chessId);
    const level=skills[link.skillId]?.levels[training.skillLevel-1];assert.ok(level,link.skillId+'/'+training.skillLevel);
    assert.deepEqual(level.blackboard.map(b=>b.key).sort(),[...family.keys].sort(),link.skillId+' changed source shape: review before template reuse');
    for(const value of level.blackboard)assert.ok(Number.isFinite(value.value)&&value.valueStr==null,link.skillId+' numeric modifier');
    cases.push({id:seasonId+'/'+chessId+'/'+link.skillId,family:family.id,seasonId,charId:slot.charId,name:char.name,chessId,
     variant,skillId:link.skillId,skillIndex,training:structuredClone(training),moduleId:slot.defaultUniEquipId,
     reviewId:'op/'+slot.charId+'/skill/'+link.skillId,
     expected:{spType:level.spData.spType,spIncrement:level.spData.increment,spCost:level.spData.spCost,initSp:level.spData.initSp,
      maxCharge:Math.max(1,level.spData.maxChargeTime||1),skillType:level.skillType,durationType:level.durationType,
      duration:level.duration,rangeId:level.rangeId,blackboard:Object.fromEntries(level.blackboard.map(b=>[b.key,b.value]))}});
   }
  }
 }
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length,'duplicate fixed source case');
 return cases.sort((a,b)=>a.id.localeCompare(b.id));
}
function checkImportedCases(cases){
 const choices=read('web/skill_choices.json'),failures=[];
 for(const c of cases){
  const imported=choices[c.charId]?.find(s=>s.skillId===c.skillId)?.[c.variant];
  try{assert.ok(imported,'missing import');for(const [key,value]of Object.entries(c.expected))assert.deepEqual(imported[key],value,key);}
  catch(error){failures.push({id:c.id,error:error.message});}
 }
 return failures;
}
function summary(cases){return {sourceCases:cases.length,operators:new Set(cases.map(c=>c.charId)).size,
 skillIds:new Set(cases.map(c=>c.skillId)).size,families:families.map(f=>{const rows=cases.filter(c=>c.family===f.id);return {
  id:f.id,skillIds:f.skills,operators:new Set(rows.map(c=>c.charId)).size,sourceCases:rows.length,names:[...new Set(rows.map(c=>c.name))]};})};}
module.exports={buildCommonBuffCases,checkImportedCases,summary};
if(require.main===module){
 const cases=buildCommonBuffCases(),failures=checkImportedCases(cases);
 console.log(JSON.stringify({...summary(cases),importFailures:failures,scope:'parameter/import audit only; runtime damage, healing, stacking and lifecycle still need per-case assertions'},null,2));
 if(failures.length)process.exitCode=1;
}
