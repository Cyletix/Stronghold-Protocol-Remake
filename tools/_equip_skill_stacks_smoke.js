'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const helpers=`
function knifeBattle(id='yan_dagger'){
 startBattle([{id:1,charId:'char_002_amiya',name:'fixture',col:3,row:8,position:'MELEE',maxHp:10000,atk:100,def:0,attackTime:99,blockCnt:1,range:2,equip:id?[{id,mods:{}}]:[]}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 const o=B.operators[0];o.attributeBase={atk:100,def:0,aspd:1};o.cd=999;o.deployed=true;o.deployT=5;o.deployAt=0;o.events=[];o.combatTalents=[];
 o.skill={name:'controlled successful activation',spCost:1,duration:0,effects:[]};o.sp=1;
 BDATA.level.buildable[o.row][o.col]='MELEE';return o;
}
function knifeCast(o){o.sp=o.skill.spCost;return castSkill(o);}
function knifeEnemy(){const e=spawnEnemyAt('enemy_1007_slime',{x:3,y:8,route:-1,seg:0,cp:0});e.atk=0;e.def=0;e.magicRes=0;e.cd=999;e.moveSpeed=0;e.hp=e.maxHp=10000;return e;}
function knifeStep(n){for(let i=0;i<n;i++)update(1/30,1/30);}
`;
async function main(){await f.run(`(async()=>{
 await initMode();setSetupSeason('act1autochess');curDiff='standard';curMatch='solo';chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};window.onBondGarrison=()=>{};${helpers}
 const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,msg||a+' != '+b);
 for(const season of ['act1autochess','act2autochess'])for(const [id,step]of [['yan_dagger',.05],['eff_acarm040',.05],['eff_acgarm040',.08]]){
  G.seasonId=season;const o=knifeBattle(id);assert.equal(buffMul(o).atk,1,'no permanent pre-activation bonus');
  for(let n=1;n<=12;n++){
   const before=ArkSim.snapshot();gameRandom();const expected=JSON.stringify(ArkSim.snapshot());ArkSim.restore(before);
   assert.equal(knifeCast(o),true);assert.equal(JSON.stringify(ArkSim.snapshot()),expected,'one native Dice draw, even prob=1 or capped');
   assert.equal(o.equipSkillStacks.count,Math.min(10,n));close(buffMul(o).atk,1+Math.min(10,n)*step);
  }
  o.atk=150;close(operatorAttackPower(o,buffMul(o).atk),150+100*10*step,'add base ATK increments alongside an existing bonus');
 }
 G.seasonId='act1autochess';let o=knifeBattle(),e=knifeEnemy();
 assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(e.hp,9900);
 assert.equal(knifeCast(o),true);assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(e.hp,9795,'subsequent real basic attack uses the 5% bonus');
 const sourceSkill=SKILL_CHOICES['char_002_amiya'][0],sourceLevel=sourceSkill.normal;
 o=knifeBattle();e=knifeEnemy();o.skill={...sourceLevel,sourceId:sourceSkill.skillId,effects:sourceLevel.effects.map(x=>({...x})),blackboard:{...sourceLevel.blackboard}};ArkOperatorCombat.configure(o.skill);
 assert.equal(knifeCast(o),true);assert.equal(o.equipSkillStacks.count,1);assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(e.hp,9895,'actual Amiya S1 enters the common start hook and its subsequent attack receives the knife bonus');endOperatorSkill(o);
 o.skill={name:'controlled activation',spCost:1,duration:0,effects:[]};
 const other={...o,id:2,playerId:'ally',equip:[{id:'eff_acgarm040',mods:{}}]};delete other.equipSkillStacks;B.operators.push(other);assert.equal(knifeCast(other),true);close(buffMul(other).atk,1.08);close(buffMul(o).atk,1.05);
 o.skill.duration=2;knifeCast(o);assert.ok(o.skillState);endOperatorSkill(o);assert.equal(o.equipSkillStacks.count,2,'skill finish does not clear non-durable deployment buffs');
 const count=o.equipSkillStacks.count;updateOperatorBaseStats(o,{...o,atk:120,attributeBase:{atk:120,def:0,aspd:1}});assert.equal(o.equipSkillStacks.count,count);close(operatorAttackPower(o,buffMul(o).atk),132);
 o.reviveChance=1;o.hp=-1;tryKill(o);assert.ok(!o.dead);assert.equal(o.equipSkillStacks.count,2,'prevented death does not remove the deployment');
 o.reviveChance=0;o.hp=-1;tryKill(o);assert.ok(o.dead);assert.equal(o.equipSkillStacks,undefined);assert.equal(ArkEquipSkillStacks.attackBonus(o),0);
 o=knifeBattle();assert.equal(o.equipSkillStacks,undefined,'new battle does not inherit a deployment counter');const unchanged=JSON.stringify(ArkSim.snapshot());
 o.sp=0;assert.equal(castSkill(o),false);o.sp=1;o.skill.isPassive=true;assert.equal(castSkill(o),false);o.skill.isPassive=false;o.stunUntil=1;assert.equal(castSkill(o),false);o.stunUntil=0;o.skill.effects=[{type:'burst_damage',power:1}];assert.ok(!castSkill(o));
 assert.equal(o.equipSkillStacks,undefined);assert.equal(JSON.stringify(ArkSim.snapshot()),unchanged,'unsuccessful starts consume no equipment RNG');
 for(const [id,season]of [['unresolved','act1autochess'],['yan_dagger','unknown']]){G.seasonId=season;o=knifeBattle(id);const rng=JSON.stringify(ArkSim.snapshot());knifeCast(o);assert.equal(o.equipSkillStacks,undefined);assert.equal(JSON.stringify(ArkSim.snapshot()),rng);}
 // Actual two-season market, reward, attach and rest-save consumers.
 for(const season of ['act1autochess','act2autochess']){
  setSetupSeason(season);chooseBand('band_amiya');G.level=6;G.money=100;
  const card=shopEquipmentPool().find(eq=>eq.id==='yan_dagger');assert.ok(card);assert.ok(!shopEquipmentPool().some(eq=>eq.effectId==='eff_acgarm040'));
  const source=SHOP_ITEMS.seasons[season].find(x=>x.itemId===card.chessId);assert.equal(card.cost,source.purchasePrice);
  G.shop=[{type:'equip',equip:card,cost:card.cost}];buyShop(0);const purchased=G.equipInv.at(-1);assert.equal(purchased.effectId,'eff_acarm040');assert.equal(purchased.tier,1);
  const entry=ROSTER_LIST.find(x=>x.charId==='char_498_inside');G.shop=[{type:'op',entry,cost:1}];buyShop(0);const owned=G.ops[0];const stats=o=>finalizeOperator(o.entry,{},o.equip,o.elite);const baseline=stats(owned).atk;attachEquip(owned,purchased,0);assert.equal(stats(owned).atk,baseline,'purchase/attach does not apply former static 1.05 mods');
  assert.equal(garrisonGiveItem('eff_acgarm040'),true);const golden=G.equipInv.at(-1);normalizeRewardEquipment(golden);assert.equal(golden.tier,2);assert.equal(golden.effectId,'eff_acgarm040');assert.equal(Object.keys(equipmentModifiers(golden)).length,0);
  const legacy={id:'eff_acgarm040',name:'炎国短刀',tier:1,mods:{atk:1.08}};normalizeRewardEquipment(legacy);assert.equal(legacy.tier,2);assert.equal(Object.keys(legacy.mods).length,0);
  owned.equip[0].mods={atk:1.05};const before=JSON.stringify(ArkSim.snapshot());assert.equal(saveRestRun(),true);owned.equip=[null,null];assert.equal(loadRestRun(),true);assert.equal(JSON.stringify(ArkSim.snapshot()),before);assert.equal(G.ops[0].equip[0].id,'yan_dagger');assert.equal(Object.keys(G.ops[0].equip[0].mods).length,0);assert.equal(stats(G.ops[0]).atk,baseline);
 }
 console.log('EQUIP SKILL STACKS local OK: two-season normal/golden, actual hits, additive ATK, cap RNG, failed casts, lifecycle, ownership, purchase/reward/rest');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const p=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:73519});
 try{
  p.startBattle();p.__testMachine.run(`${helpers}const own=knifeBattle('eff_acgarm040');own.playerId='ally';own.skill.duration=2;knifeCast(own);`);
  const checkpoint=p.snapshot();assert.equal(checkpoint.battle.operators[0].equipSkillStacks.count,1);
  const next=`endOperatorSkill(B.operators[0]);knifeCast(B.operators[0]);`;
  p.__testMachine.run(next);p.advance(.3);const expected=p.snapshot();assert.equal(expected.battle.operators[0].equipSkillStacks.count,2);
  p.restore(JSON.parse(JSON.stringify(checkpoint)));p.__testMachine.run(next);p.advance(.3);const replay=p.snapshot();assert.deepEqual(replay.battle,expected.battle);assert.deepEqual(replay.rng,expected.rng);
  console.log('EQUIP SKILL STACKS room OK: authenticated checkpoint retains ally source profile, activation count and subsequent RNG');
 }finally{p.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
