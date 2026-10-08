'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture'),d=require('../web/diy_roster.json'),rules=require('../web/mode_rules.json'),api=require('../web/src/rules/diy-roster');
const source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json'),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const choose=(sid,ids)=>Object.fromEntries(d.seasons[sid].slots.map((s,i)=>[s.slotId,{charId:ids[i],skillIndex:2,potentialRank:i%6,uniEquipId:d.operators[ids[i]].modules[0]?.uniEquipId||null}]));
async function main(){
 let variants=0;
 for(const [sid,s]of Object.entries(d.seasons)){
  const raw=source.activity.AUTOCHESS_SEASON[sid];assert.deepEqual(s.slots.map(x=>x.slotId).sort(),Object.keys(raw.diyChessDict).sort());
  assert.deepEqual(s.slots.map(x=>x.tier),[5,5,6,6]);
  for(const id of s.eligibleCharIds){
   const c=chars[id];assert.equal(c.rarity,'TIER_6');assert.equal(c.isNotObtainable,false);
   assert.ok(!Object.values(raw.charShopChessDatas).some(p=>p.chessType!=='DIY'&&[p.charId,p.backupCharId].includes(id)));
   const power=[c.mainPower||c,...(c.subPower||[])].flatMap(x=>[x.nationId,x.groupId,x.teamId]).filter(Boolean);
   const bonds=Object.keys(raw.bondInfoDict).filter(id=>source.autoChessData.bondInfoDict[id]?.isPower&&source.autoChessData.bondInfoDict[id].powerIdList.some(p=>power.includes(p)));
   assert.deepEqual(api.bonds(d,sid,id),bonds.length?bonds:[raw.constData.fallbackBondId]);
   for(const slot of s.slots){const [p]=api.profiles(d,rules,sid,{[slot.slotId]:{charId:id}});assert.equal(p.charId,id);assert.equal(p.tier,raw.charShopChessDatas[slot.slotId].chessLevel);assert.deepEqual(p.normal,raw.charChessDataDict[slot.slotId].status);assert.deepEqual(p.elite,raw.charChessDataDict[p.goldenChessId].status);assert.deepEqual(p.garrisonIds,[]);variants++;}
  }
  const a=s.slots[0].slotId,b=s.slots[1].slotId,id=s.eligibleCharIds[0];
  for(const bad of [{bad:{charId:id}},{[a]:{charId:'char_002_amiya'}},{[a]:{charId:s.excludedCharIds.find(id=>chars[id]?.rarity==='TIER_6')}},{[a]:{charId:id},[b]:{charId:id}},{[a]:{charId:id,skillIndex:99}},{[a]:{charId:id,uniEquipId:'uniequip_002_svrash'}},{[a]:{charId:id,potentialRank:6}},{[a]:{charId:id,atk:999}}])assert.throws(()=>api.normalize(d,sid,bad));
 }
 // Hidden powers can contribute several core bonds. These operators need not be selectable in this season.
 assert.deepEqual(api.bonds(d,'act2autochess','char_103_angel'),['yanShip','lateranoShip']);
 const f=fixture();Object.assign(f.ctx,{assert,d,choose});await f.run('initMode()');
 const saves=[];
 for(const sid of ['act1autochess','act2autochess']){
  const ids=['char_456_ash','char_340_shwaz','char_4055_bgsnow','char_180_amgoat'],picks=choose(sid,ids);
  f.ctx.sid=sid;f.ctx.picks=picks;
  f.run(`{setupSeasonId=sid;localRunSetup=null;BOND_BANS=[];ACCOUNT={ops:{}};curDiff='extreme';curMatch='solo';ArkDiyRoster.save(localStorage,sid,picks);chooseBand('band_amiya');G.bannedOperators=[];
   assert.equal(ROSTER_LIST.length,(sid==='act1autochess'?95:112)+4);assert.equal(Object.keys(G.diySelections).length,4);
   for(const [slot,v]of Object.entries(picks)){
    const e=ROSTER[v.charId];assert.equal(e.chessId,slot);assert.equal(e.isHidden,false);assert.equal(garrisonTraits(e).length,0,'no borrowed season traits');assert.equal(operatorSkillSource(e.charId).index,v.skillIndex);
    assert.equal(trainingProfile(e,false).potential,v.potentialRank);assert.equal(trainingProfile(e,false).skillLevel,4);assert.equal(trainingProfile(e,true).skillLevel,7);assert.equal(trainingProfile(e,true).equipLevel,d.seasons[sid].slots.find(s=>s.slotId===slot).elite.equipLevel);
    for(const elite of [false,true]){const fm=finalizeOperator(e,null,[],elite);assert.ok(fm.atk>0&&fm.maxHp>0);assert.equal(fm.skill.sourceId,SKILL_CHOICES[e.charId][v.skillIndex].skillId);}
    G.ops=[];G.level=4;genShop();assert.ok(!G.shop.some(x=>x?.entry?.charId===e.charId),'tier gate');G.level=6;G.money=100;G._mergeReward=null;
    const eligible=ROSTER_LIST.filter(e=>!NON_SHOP.includes(e.charId)),total=eligible.reduce((n,e)=>n+8-e.tier,0),before=eligible.slice(0,eligible.indexOf(e)).reduce((n,e)=>n+8-e.tier,0),rng=gameRandom;
    gameRandom=()=> (before+(8-e.tier)/2)/total;genShop();gameRandom=rng;
    let i=G.shop.findIndex(x=>x?.entry?.charId===e.charId);assert.ok(i>=0,'actual weighted draw');const money=G.money,cost=G.shop[i].cost;buyShop(i);assert.equal(G.money,money-cost);assert.equal(G.ops[0].entry,e);
    addOperator(e.charId,false);addOperator(e.charId,false);assert.equal(G.ops.length,1);assert.equal(G.ops[0].elite,true);assert.equal(G.ops[0].entry.chessId,slot);
    G.shop=G._mergeReward?.savedShop||G.shop;G._mergeReward=null;G._upgradeConfirm=false;
    G.bannedOperators=[e.charId];genShop();assert.ok(!G.shop.some(x=>x?.entry?.charId===e.charId));G.bannedOperators=[];
   }
   G.ops=[];G.equipInv=[];G.shop=[];G._mergeReward=null;G._upgradeConfirm=false;G.phase='rest';addOperator('char_456_ash',false);addOperator('char_340_shwaz',true);
   const selected=G.ops.map((o,i)=>({...o,row:1,col:i})),bond=computeBonds(selected);assert.equal(!!bond.active.emptyShip,sid==='act2autochess','season-specific threshold');
   const spare=ROSTER_LIST.find(e=>e.regBonds.includes('emptyShip')&&e.profile.chessType!=='DIY');selected.push({id:999,charId:spare.charId,entry:spare,elite:false,row:1,col:3});
   const effects=computeBonds(selected).mods;assert.equal(effects[selected[0].id].cooperationDamage,1.2);assert.equal(effects[selected[1].id].cooperationDamage,1.4);assert.equal(effects[selected[0].id].cooperationResistance,.8);assert.equal(effects[selected[0].id].atk,1,'damage is not ATK');
   const plain=ROSTER_LIST.find(e=>!e.regBonds.includes('emptyShip'));selected.push({id:998,charId:plain.charId,entry:plain,elite:false,row:2,col:3});
   assert.equal(computeBonds(selected).mods[998].cooperationDamage||1,sid==='act1autochess'?1.2:1,'correct season damage recipients');
   const owner={atk:100,atkType:'phys',cooperationDamage:1.2},target={enemyId:'fixture',hp:1000,maxHp:1000,def:40,magicRes:0,x:1,y:1};B.time=0;B.damageFeedback=[];
   assert.equal(calcDamage(owner,target,1),60);assert.equal(hitEnemy(owner,target,calcDamage(owner,target,1)),72,'post-defense damage, no double scaling');
   assert.equal(enemyDamageToOperator({atk:100,atkType:'arts'},{def:0,magicRes:0,cooperationResistance:.8}),80);
   window.diySave=encodeRestSave();ArkDiyRoster.save(localStorage,sid,{});buildRoster(BATTLE.operators,sid,{});
   const loaded=decodeRestSave(window.diySave);assert.equal(loaded.session.ops[0].entry.chessId,Object.keys(picks)[0]);assert.equal(ROSTER.char_456_ash,undefined,'decode never mutates active roster');}
  `);
  saves.push({sid,text:f.ctx.diySave});
 }
 for(const {sid,text}of saves){const fresh=fixture();fresh.storage.set('arknightsAutoRestV1',text);fresh.ctx.assert=assert;await fresh.run('initMode()');fresh.run(`assert.equal(loadRestRun(),true);assert.equal(Object.keys(G.diySelections).length,4);assert.equal(ROSTER.char_456_ash.profile.chessType,'DIY');assert.equal(operatorSkillSource('char_456_ash').index,2);assert.equal(G.ops[0].entry,ROSTER.char_456_ash);genShop();`);assert.equal(fresh.run('G.seasonId'),sid);}
 // Two authoritative players choose the same operator in different tiers/skills.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),src=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(src.split(marker).length,2);const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(src.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const base={seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:require('../web/source_battles.json').seasons.act2autochess.modes.mode_multi_normal.stageChoices[0].levelKey,bandId:'band_amiya'};
 const p1={chess_char_5_diy1_a:{charId:'char_4228_closur',skillIndex:0,potentialRank:1}},p2={chess_char_6_diy2_a:{charId:'char_4228_closur',skillIndex:2,potentialRank:5}};
 const players=[];try{
  for(const picks of [p1,p2])players.push(await mod.exports.createPlayerRuntime({...base,diySelections:picks},{seed:23}));
  for(let i=0;i<2;i++){const p=players[i],vm=p.__testMachine;vm.run("addOperator('char_4228_closur',true);refreshBoard()");const checkpoint=p.snapshot();assert.equal(checkpoint.session.ops[0].entry.tier,5+i);assert.equal(vm.run("operatorSkillSource('char_4228_closur').index"),i*2);assert.deepEqual(p.restore(JSON.parse(JSON.stringify(checkpoint))),checkpoint);assert.equal(p.command('game/freeze').ok,true);assert.equal(p.snapshot().session.ops[0].entry.tier,5+i);}
  const host=players[0].__testMachine;host.context.__diyPeer=JSON.stringify(players[1].snapshot().session);
  const peerSkill=host.run(`(()=>{const previous=G;try{G=JSON.parse(__diyPeer);return finalizeOperator(G.ops[0].entry,null,[],true).skill.sourceId;}finally{G=previous;}})()`);
  assert.equal(peerSkill,'skchr_closur_3','paired owner context must not inherit host same-character DIY default');
  await assert.rejects(mod.exports.createPlayerRuntime({...base,diySelections:{chess_char_5_diy1_a:{charId:'char_102_texas'}}}),e=>e.code==='INVALID_CONFIG');
 }finally{players.forEach(p=>p.dispose());}
 console.log('DIY ROSTER OK:',variants,'source identity/slot pairs; both seasons real shops, tiers, skill/module/training, merge, bans, cooperation damage, frozen saves and two independent signed room restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
