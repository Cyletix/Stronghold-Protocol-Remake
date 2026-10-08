'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const browser=require('./_browser_fixture');
async function main(){
 const b=browser();await b.run('initMode()');b.ctx.assert=assert;
 b.run(`
  setSetupSeason('act2autochess');curDiff='extreme';
  openDetail('char_103_angel');selectRosterSkill(0);
  assert.equal(getOpAccount('char_103_angel').selectedSkill,0);
  assert.ok(document.getElementById('detail-skills').innerHTML.includes('冲锋模式'));
  const cards=document.getElementById('roster-groups').innerHTML;
  assert.ok(cards.indexOf('<h3>'+TIER_CN[1]+' ')<cards.indexOf('<h3>'+TIER_CN[4]+' '));assert.ok(cards.includes('6星'));
  applyPreset(4);assert.equal(getOpAccount('char_103_angel').selectedSkill,0);
  assert.equal(JSON.parse(localStorage.getItem('arknightsRoster')).ops.char_103_angel.selectedSkill,0);
  chooseBand('band_amiya');
  const one=finalizeOperator(ROSTER.char_103_angel,{atk:1,hp:1,def:1,aspd:1},[],false).skill;
  assert.equal(one.sourceId,SKILL_CHOICES.char_103_angel[0].skillId);
  assert.equal(one.spCost,SKILL_CHOICES.char_103_angel[0].normal.spCost);
  assert.ok(one.combatMechanic.next,'selected Exusiai S1 must strengthen the next attack');
  assert.equal(one.blackboard.times,SKILL_CHOICES.char_103_angel[0].normal.blackboard.times);
  selectRosterSkill(2);
  assert.equal(finalizeOperator(ROSTER.char_103_angel,{atk:1,hp:1,def:1,aspd:1},[],false).skill.sourceId,one.sourceId,'changing next-run preferences cannot alter current battle');
  chooseBand('band_amiya');assert.equal(validSkillIndex('char_103_angel',G.skillChoices.char_103_angel),2);
  assert.equal(finalizeOperator(ROSTER.char_103_angel,{atk:1,hp:1,def:1,aspd:1},[],true).skill.sourceId,SKILL_CHOICES.char_103_angel[2].skillId);
  G.equipInv=[{uid:9911,id:'eff_acarm066',name:'盟约之币',kind:'use',mods:{}},{uid:9912,id:'eff_acarm073',name:'变形同构体',kind:'stat',mods:{}}];
  const money=G.money;onEquipBenchClick(9911);assert.equal(G.money,money);assert.equal(G.equipInv.length,2);
  onEquipDeploy(9911,-123,0);assert.equal(G.money,money);
  addOperator('char_102_texas',false);const target=G.ops.find(o=>o.charId==='char_102_texas');
  target.equip=[{id:'existing',name:'已有装备'},null];onEquipDeploy(9911,target.id,0);
  assert.equal(G.money,money+1);assert.equal(target.equip[0].id,'existing');assert.equal(target.equip[1],null);
  onEquipDeploy(9911,target.id,0);assert.equal(G.money,money+1,'replayed drop cannot consume twice');
  onEquipBenchClick(9912);setDetailTab('talent');
  const talent=document.getElementById('hand-detail').innerHTML;
  assert.ok(talent.includes('维式重锤')&&talent.includes('卡西米尔竞技旗')&&talent.includes('奥术法阵'));
  setDetailTab('feature');assert.ok(document.getElementById('hand-detail').innerHTML.includes('每名干员最多携带两件'));
  assert.equal(equipIconPath('盟约之币'),'equip_icons/'+encodeURIComponent('盟约之币')+'.svg');
  toggleGameDebug();const gold=G.money;debugAddGold();assert.equal(G.money,gold+1);
 `);
 for(const listener of b.listeners.pointerdown||[])listener({target:{closest:()=>false}});
 assert.equal(b.run('gameDebugActive()'),false);
 const filename=require.resolve('./lib/room-game-runtime'),code=fs.readFileSync(filename,'utf8'),injected=new Module(filename,module);
 injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(code.replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=injected.exports;
 const config={...runtime.defaultRoomSettings(),bandId:'band_amiya',skillChoices:{char_103_angel:0}};
 const p=await runtime.createPlayerRuntime(config,{seed:11,name:'技能测试'});
 try{
  assert.equal(p.snapshot().session.skillChoices.char_103_angel,0);
  assert.equal(p.snapshot().account.ops.char_103_angel.selectedSkill,0);
  assert.equal(p.__testMachine.run('finalizeOperator(ROSTER.char_103_angel,{atk:1,hp:1,def:1,aspd:1},[],false).skill.sourceId'),require('../web/skill_choices.json').char_103_angel[0].skillId);
  const snapshot=p.snapshot();assert.deepEqual(p.restore(JSON.parse(JSON.stringify(snapshot))),snapshot);
  await assert.rejects(runtime.createPlayerRuntime({...config,skillChoices:{char_103_angel:9}}),/技能/);
 }finally{p.dispose();}
 console.log('LOADOUT / ITEMS OK: tier grouping, account persistence, one selected skill per run, real source effects, server/restore, invalid skill rejection, targeted consumables, equipment talents and outside-click debug dismissal');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
