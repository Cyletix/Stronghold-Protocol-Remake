'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./_browser_fixture')(),prefix='../data/ArknightsGameData/zh_CN/gamedata/excel/';
const chars=require(prefix+'character_table.json'),skills=require(prefix+'skill_table.json'),ranges=require(prefix+'range_table.json');
const copy=x=>JSON.parse(JSON.stringify(x));
async function main(){
 await f.run('initMode()');f.ctx.assert=assert;const data=f.ctx.ArkOperatorSkillData;let levels=0,bindings=0;
 for(const [cid,ids] of Object.entries(data.characters))assert.deepEqual(copy(ids),chars[cid].skills.map(s=>s.skillId).filter(Boolean),cid+' source identity');
 for(const [id,deltas] of Object.entries(data.skills))for(let i=0;i<deltas.length;i++){
  const actual=copy(f.ctx.ArkSkillLevels.get(id,i+1)),raw=skills[id].levels[i];
  for(const [key,value] of Object.entries({name:raw.name,rangeId:raw.rangeId||null,rangeGrids:raw.rangeId?ranges[raw.rangeId].grids:null,spType:raw.spData.spType,spIncrement:raw.spData.increment,spCost:raw.spData.spCost,initSp:raw.spData.initSp,maxCharge:raw.spData.maxChargeTime,duration:raw.duration,durationType:raw.durationType,skillType:raw.skillType,isPassive:raw.skillType==='PASSIVE',blackboard:Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value]))}))assert.deepEqual(actual[key],value,id+'/Lv'+(i+1)+'/'+key);
  const mutable=f.ctx.ArkSkillLevels.get(id,i+1);mutable.blackboard.test=999;if(mutable.rangeGrids?.length)mutable.rangeGrids[0].col=999;
  assert.deepEqual(copy(f.ctx.ArkSkillLevels.get(id,i+1)),actual,'callers cannot mutate source');levels++;
 }
 assert.equal(f.ctx.ArkSkillLevels.get('missing',1),null);assert.equal(f.ctx.ArkSkillLevels.get('skchr_mm_1',11),null);
 assert.equal(f.ctx.ArkSkillLevels.get('skchr_mm_1',1.5),null);
 // Exercise real account -> finalizer -> UI for every library skill and supported phase cap.
 f.run('GMODE="normal"');
 for(const [cid,ids] of Object.entries(data.characters))for(let index=0;index<ids.length;index++){
  const id=ids[index],max=Math.min([4,7,10][chars[cid].phases.length-1],skills[id].levels.length);
  for(const level of [...new Set([1,Math.min(4,max),Math.min(7,max),max])]){
   f.ctx.binding={cid,index,level,max};
   const actual=f.run(`(()=>{const {cid,index,level,max}=binding;ACCOUNT.ops[cid]={evolve:2,level:1,skillLevel:level,potential:0,selectedSkill:index,trust:0};
    const raw=BATTLE.operators.find(o=>o.charId===cid),entry={...raw,skill:SKILL_DATA[cid],talents:[],module:null,baseAttackTime:raw.attackTime};
    const s=finalizeOperator(entry,null,[],false).skill;
    assert.equal(normalizeOpAccount(cid,{...ACCOUNT.ops[cid],skillLevel:99}).skillLevel,max);
    return {skill:s,description:rosterSkillDescription(cid,SKILL_CHOICES[cid][index],level)};})()`);
   const raw=skills[id].levels[level-1];assert.equal(actual.skill.sourceId,id);assert.equal(actual.skill.spCost,raw.spData.spCost);assert.equal(actual.skill.realDuration,raw.duration);
   assert.deepEqual(copy(actual.skill.blackboard),Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value])));assert.equal(actual.skill.realDesc,actual.description);bindings++;
  }
 }
 console.log('OPERATOR SKILL LEVELS OK '+levels+' source levels and '+bindings+' real account/finalizer/UI bindings; independent level caps and no source mutation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
