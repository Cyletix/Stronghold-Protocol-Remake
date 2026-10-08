'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run('initMode()');
 f.run(`
 const originalIds=Object.keys(ROSTER).sort().join(','),originalCount=ROSTER_LIST.length;
 const all=rosterLibraryEntries();assert.equal(all.length,BATTLE.operators.length);assert.equal(all.length,454);
 assert.equal(new Set(all.map(e=>e.charId)).size,all.length);
 openRoster();assert.equal(document.getElementById('roster-count').textContent,'454 / 454');
 assert.ok(document.getElementById('roster-groups').innerHTML.includes('其他资料'));
 document.getElementById('roster-debug-search').value='伊芙利特';filterRoster();
 assert.equal(document.getElementById('roster-count').textContent,'1 / 454');
 assert.ok(document.getElementById('roster-groups').innerHTML.includes('伊芙利特'));
 openDetail('char_134_ifrit');assert.ok(document.getElementById('detail-basic').innerHTML.includes('未纳入卫戍名册'));
 assert.ok(document.getElementById('detail-skills').innerHTML.includes('炎爆'));
 selectRosterSkill(2);applyPreset(4);
 assert.equal(getOpAccount('char_134_ifrit').selectedSkill,2);assert.equal(getOpAccount('char_134_ifrit').skillLevel,10);
 assert.equal(getOpAccount('char_134_ifrit').evolve,2);assert.equal(getOpAccount('char_134_ifrit').level,1);
 for(const e of all){const acc=getOpAccount(e.charId),phases=LEVEL_DATA[e.charId];
  assert.ok(acc.evolve<phases.length);assert.ok(acc.level<=phases[acc.evolve].maxLevel);assert.ok(acc.skillLevel<=maxSkillLevel(acc.evolve));}
 assert.equal(getOpAccount('char_285_medic2').evolve,0,'robot cannot gain nonexistent promotion');
 document.getElementById('roster-debug-search').value='';document.getElementById('roster-scope').value='mode';filterRoster();
 assert.equal(document.getElementById('roster-count').textContent,originalCount+' / '+originalCount);
 assert.ok(!document.getElementById('roster-groups').innerHTML.includes('其他资料'));
 document.getElementById('roster-debug-search').value='no_such_operator';filterRoster();
 assert.ok(document.getElementById('roster-groups').innerHTML.includes('没有找到'));
 document.getElementById('roster-debug-search').value='';document.getElementById('roster-scope').value='all';
 chooseBand('band_amiya');toggleGameDebug();renderRoster();
 const ifrit=all.find(e=>e.charId==='char_134_ifrit'),unsupported=all.find(e=>e.charId==='char_285_medic2');
 assert.ok(ArkClientStatBuffSkills.supported.includes('skchr_ifrit_1'));
 assert.ok(!ArkClientStatBuffSkills.supported.includes('skchr_ifrit_3'),'S1 graph support does not claim S3');
 setOpField(ifrit.charId,'selectedSkill',0);
 assert.ok(opCardHtml(ifrit).includes('+ 加入测试'));assert.ok(!opCardHtml(ifrit).includes('disabled'));
 const before=G.ops.length;assert.equal(debugAddOperator(ifrit.charId),true);assert.equal(G.ops.length,before+1);
 const added=G.ops.at(-1),compiled=finalizeOperator(added.entry,null,[],false);assert.equal(added.debugLibrary,true);
 assert.equal(compiled.skill.sourceId,'skchr_ifrit_1');assert.ok(compiled.skill.clientStatGraph);
 assert.equal(ROSTER[unsupported.charId],undefined);assert.equal(debugTacticalEntry(unsupported.charId),null);
 assert.ok(opCardHtml(unsupported).includes('disabled'));assert.equal(debugAddOperator(unsupported.charId),false);assert.equal(G.ops.length,before+1);
 assert.equal(Object.keys(ROSTER).sort().join(','),originalIds);assert.equal(ROSTER_LIST.length,originalCount,'catalog browsing does not add game/season entries');
 assert.equal(debugAddOperator('char_102_texas'),true);assert.equal(G.ops.length,before+2,'existing debug add remains functional');
 `);
 console.log('ROSTER CATALOG OK: 454 characters, search/scope/detail, capped training, selected skills, unchanged mode pool and debug eligibility');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
