'use strict';
// Each fixed source slot must reach the real shop/purchase/profile path. This
// verifies identity/configuration, NOT the execution of every talent or skill.
const assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./_browser_fixture');
const source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const equipment=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json');
async function main(){
 const f=fixture();Object.assign(f.ctx,{assert,source,chars,skills,equipment});await f.run('initMode()');
 const verified=f.run(`(()=>{
  const verified=[];const originalRandom=gameRandom;
  for(const [sid,season]of Object.entries(source)){
   setupSeasonId=sid;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';ACCOUNT={ops:{}};
   chooseBand('band_amiya');G.bannedOperators=[];
   const expected=Object.values(season.charShopChessDatas).filter(p=>!p.isHidden&&['PRESET','NORMAL'].includes(p.chessType));
   assert.equal(ROSTER_LIST.map(e=>e.charId).sort().join(','),expected.map(p=>p.charId).sort().join(','),sid+' exact eligible membership');
   assert.equal(G.seasonId,sid);assert.equal(ROSTER_LIST.length,sid==='act1autochess'?95:112);
   for(const p of expected){
    const label=sid+'/'+p.chessId+' '+p.charId,entry=ROSTER[p.charId];
    assert.equal(entry.chessId,p.chessId,label);assert.equal(entry.tier,p.chessLevel,label+' tier');
    assert.equal([...new Set([entry.seasonBond,...entry.regBonds].filter(Boolean))].sort().join(','),season.charChessDataDict[p.chessId].bondIds.slice().sort().join(','),label+' bonds');
    assert.equal(getOpAccount(p.charId).selectedSkill,p.defaultSkillIndex,label+' default skill');
    assert.equal(entry.module?.uniEquipId||null,p.defaultUniEquipId,label+' module');
    // Target a point strictly inside each real weighted interval. Other entries
    // stay in the pool: missing identities cannot pass via a synthetic shop card.
    G.ops=[];G.level=6;G.money=100;G._mergeReward=null;G.equipInv=[];
    const eligible=ROSTER_LIST.filter(e=>!NON_SHOP.includes(e.charId)),total=eligible.reduce((n,e)=>n+8-e.tier,0);
    const before=eligible.slice(0,eligible.indexOf(entry)).reduce((n,e)=>n+8-e.tier,0);
    gameRandom=()=> (before+(8-entry.tier)/2)/total;genShop();gameRandom=originalRandom;
    const index=G.shop.findIndex(x=>x?.type==='op'&&x.entry.charId===p.charId);assert.ok(index>=0,label+' real draw');
    const money=G.money,cost=G.shop[index].cost;buyShop(index);
    const purchased=G.ops.find(o=>o.charId===p.charId);assert.ok(purchased,label+' purchase');assert.equal(purchased.entry,entry);
    assert.equal(G.money,money-cost,label+' purchase cost');
    for(const elite of [false,true]){
     const raw=season.charChessDataDict[elite?p.goldenChessId:p.chessId].status,training=trainingProfile(entry,elite);
     assert.equal(training.evolve,Number(raw.evolvePhase.slice(-1)),label+' evolve');assert.equal(training.level,raw.charLevel,label+' level');
     assert.equal(training.skillLevel,raw.skillLevel,label+' skill rank');assert.equal(training.equipLevel,raw.equipLevel,label+' module rank');
     const unit=finalizeOperator(entry,null,[],elite),skillId=chars[p.charId].skills[p.defaultSkillIndex].skillId,lv=skills[skillId].levels[raw.skillLevel-1];
     assert.ok(Number.isFinite(unit.atk)&&unit.maxHp>0,label+' usable stats');assert.equal(unit.skill.sourceId,skillId,label+' skill identity');
     assert.equal(unit.skill.spCost,lv.spData.spCost,label+' SP');assert.equal(unit.skill.initSp,lv.spData.initSp,label+' initial SP');
     assert.equal(operatorSkillSource(p.charId)[elite?'elite':'normal'].duration,lv.duration,label+' source duration');assert.equal(unit.skill.realRangeId,lv.rangeId,label+' range');
     const mods={hp:0,atk:0,def:0,aspd:0,magicRes:0};
     for(const a of equipment[p.defaultUniEquipId]?.phases?.[raw.equipLevel-1]?.attributeBlackboard||[]){
      const key={max_hp:'hp',atk:'atk',def:'def',attack_speed:'aspd',magic_resistance:'magicRes'}[a.key];if(key)mods[key]+=a.value*(key==='aspd'?.01:1);
     }
     assert.equal(JSON.stringify(entry.module?.[elite?'elite':'normal']||mods),JSON.stringify(mods),label+' module attributes');
    }
    // Bans exclude this exact identity from all random refreshes.
    G.bannedOperators=[p.charId];genShop();assert.ok(!G.shop.some(x=>x?.entry?.charId===p.charId),label+' banned draw');G.bannedOperators=[];
    verified.push(label);
   }
   assert.ok(!ROSTER_LIST.some(e=>e.isHidden),'hidden slots excluded');
   G.ops=[];assert.ok(grantSpecificOperator('char_616_pithst',false),'explicit Pith reward survives');
   assert.ok(!ROSTER_LIST.some(e=>e.charId==='char_616_pithst'),'reward identity never enters random roster');
   // Opening bans are selected against this same season and its source bonds.
   const config={seasonId:sid,modeId:G.modeId,mapKey:G.mapKey};
   for(let seed=1;seed<=30;seed++){
    const info=ArkRunSetup.setupInfo({source:SOURCE_BATTLES,rules:MODE_RULES,operators:BATTLE.operators},config,G.roundChoices,seed);
    for(const b of info.bannedOperators)assert.ok(expected.some(p=>p.charId===b.charId&&season.charChessDataDict[p.chessId].bondIds.includes(b.bondId)),'season ban '+b.charId);
   }
  }
  // Act I-only operator, explicit skill, save in I and restore in a fresh II page.
  G.ops=[];G.equipInv=[];G.shop=[];G._mergeReward=null;G.money=100;G.phase='rest';
  ACCOUNT.ops.char_134_ifrit={...getOpAccount('char_134_ifrit'),selectedSkill:1};G.skillChoices=accountSkillChoices();addOperator('char_134_ifrit',false);
  window.seasonSave=encodeRestSave();window.seasonFingerprint=catalogFingerprint();
  buildRoster(BATTLE.operators,'act2autochess');assert.equal(ROSTER.char_134_ifrit,undefined);
  const saved=decodeRestSave(window.seasonSave);assert.equal(saved.session.ops[0].entry.seasonId,'act1autochess');
  assert.equal(ROSTER.char_134_ifrit,undefined,'decode has no active-roster side effect');
  return verified;
 })()`);
 const fresh=fixture();fresh.ctx.assert=assert;fresh.storage.set('arknightsAutoRestV1',f.ctx.seasonSave);await fresh.run('initMode()');
 fresh.run(`assert.equal(loadRestRun(),true);assert.equal(G.seasonId,'act1autochess');assert.equal(ROSTER_LIST.length,95);assert.equal(G.ops[0].entry,ROSTER.char_134_ifrit);assert.equal(operatorSkillSource('char_134_ifrit').index,1);genShop();assert.ok(G.shop.filter(x=>x?.entry).every(x=>x.entry.seasonId==='act1autochess'));`);
 console.log('SEASON ROSTER OK:',verified.length,'fixed slots individually drawn, purchased, banned and compared to source; hidden reward; fresh cross-season save; catalog',f.ctx.seasonFingerprint);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
