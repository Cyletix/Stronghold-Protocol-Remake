'use strict';
const assert=require('assert/strict');
const {eligibility,rules}=require('../web/src/rules/hidden-boss');
const player=(id,layers,life=2)=>({id,life,activeBonds:{first:layers,disabled:0}});
for(const [seasonId,rule]of Object.entries(rules)){
  for(const [kind,threshold]of [['single',rule.solo],['multi',rule.team]]){
    const options={seasonId,modeId:'mode_'+kind+'_normal',players:[player('a',threshold)]};
    assert.equal(eligibility(options).eligible,false,'strict threshold '+seasonId+' '+kind);
    options.players[0].activeBonds.first++;
    const yes=eligibility(options);assert.equal(yes.eligible,true);assert.equal(yes.threshold,threshold);assert.equal(yes.layers,threshold+1);
    assert.equal(yes.sourceType,'community');assert.equal(yes.evidence,'Inferred');assert.ok(yes.source.startsWith('https://prts.wiki/'));
    options.players[0].life=1;assert.equal(eligibility(options).eligible,false,'strict life threshold');
    options.players[0].life=2;options.players[0].activeBonds.first=1;
    assert.equal(eligibility(options).eligible,false,'a later snapshot does not accumulate previous rounds');
  }
  const team={seasonId,modeId:'mode_multi_hard',players:[player('a',rule.team-1,0),player('b',2,2),player('c',0,0),player('d',0,0)]};
  const before=JSON.stringify(team),result=eligibility(team);
  assert.equal(result.eligible,true,'all players current bonds and combined life count');assert.equal(result.playerCount,4);assert.equal(result.life,2);assert.equal(JSON.stringify(team),before,'pure query');
  team.players.push(player('a',9999));assert.equal(eligibility(team).reasonCode,'invalid-players','duplicate player IDs cannot inflate totals');
  for(const modeId of ['mode_single_funny','mode_multi_funny','mode_training_1','unknown'])
    assert.equal(eligibility({seasonId,modeId,players:[player('a',9999)]}).eligible,false);
}
const base={seasonId:'act1autochess',modeId:'mode_single_hard',players:[player('a',301)]};
assert.equal(eligibility(base).eligible,true);assert.equal(eligibility({...base,seasonId:'act2autochess'}).eligible,false,'season thresholds cannot leak');
assert.equal(eligibility({...base,modeId:'mode_single_abyss'}).eligible,false,'first season has no abyss mode');
assert.equal(eligibility({...base,seasonId:'act2autochess',modeId:'mode_single_abyss',players:[player('a',351)]}).eligible,true);
assert.equal(eligibility({...base,players:[player('a',400),player('b',400)]}).eligible,false,'solo does not accept team aggregates');
for(const players of [[],null,[player('',9999)],[player('a',Infinity)],[player('a',-1)],[player('a',9999,NaN)]])
  assert.equal(eligibility({...base,players}).eligible,false,'invalid data cannot unlock a hidden fight');
assert.equal(eligibility({}).eligible,false);assert.equal(eligibility({...base,seasonId:'unknown'}).eligible,false);
console.log('HIDDEN BOSS RULES OK: season-specific strict bounds, current participating-player totals, life, difficulty, invalid/duplicate data and purity');
