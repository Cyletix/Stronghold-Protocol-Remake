'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const ids=['skchr_bpipe_3','skchr_excu_2','skchr_skadi_3','skchr_angel_2','skchr_lisa_2','skchr_archet_3','skchr_aglina_1'];
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>ids.includes(s.skillId)?[{cid,index,id:s.skillId}]:[]));
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,expansionCases:cases,sourceSkills:skills});
 const result=f.run(`(()=>{
  const receipts=[],absent=[];
  for(const season of ['act1autochess','act2autochess']){
   setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of expansionCases){
    const entry=ROSTER[c.cid];
    if(!entry){absent.push({seasonId:season,charId:c.cid,skillId:c.id,reason:'not-in-actual-season-roster'});continue;}
    G.skillChoices[c.cid]=c.index;
    for(const elite of [false,true]){
     const level=elite?7:4,source=sourceSkills[c.id].levels[level-1],r=finalizeOperator(entry,null,[],elite);
     assert.equal(r.skill.sourceId,c.id,'actual season skill selection');
     assert.equal(r.skill.spCost,source.spData.spCost);assert.equal(r.skill.spType,source.spData.spType);
     assert.ok(r.skill.skillMode,c.id+' mode provider bound');assert.ok(r.skill.clientProgram,c.id+' attribute provider bound');
     assert.equal(r.skill.combatMechanic,undefined,'legacy combat provider does not overlap');
     assert.deepEqual(JSON.parse(JSON.stringify(r.skill.effects)),[],'legacy effects do not overlap');
     assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(source.blackboard.map(b=>[b.key,b.value])));
     receipts.push({seasonId:season,charId:c.cid,skillId:c.id,elite,level});
    }
   }
  }
  assert.equal(new Set(receipts.map(r=>r.skillId)).size,expansionCases.length,'all seven skills have an actual season binding');
  return {scope:'seven added mode skills: actual season roster selection and ordinary/elite provider binding only',sourceFingerprint:ArkSkillModeData.sourceFingerprint,receipts,absent};
 })()`);
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/skill-mode-expansion-season-receipts.json',JSON.stringify(result,null,2));
 const normal=result.receipts.filter(r=>!r.elite).length,elite=result.receipts.filter(r=>r.elite).length;
 console.log('SKILL MODE EXPANSION SEASONS OK '+result.receipts.length+' actual variants ('+normal+' ordinary, '+elite+' elite); '+result.absent.length+' absent season identities recorded');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
