'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const helpers=`
function shieldBattle(){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:8,position:'MELEE',maxHp:10000,atk:0,def:0,attackTime:999,blockCnt:2,range:0,equip:[{id:'riot_shield',mods:{}}]}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 const o=B.operators[0];o.cd=999;o.deployed=true;o.deployT=5;o.deployAt=0;o.skill=null;o.events=[];
 BDATA.level.buildable[o.row][o.col]='MELEE';return o;
}
function shieldEnemy(x=3,y=8){
 const e=spawnEnemyAt('enemy_1007_slime',{x,y,route:-1,seg:0,cp:0});
 if(!e)throw Error('source spawn fixture missing');e.atk=500;e.def=0;e.cd=999;e.moveSpeed=0;e.hp=e.maxHp=10000;e.atkType='phys';return e;
}
function shieldShot(source,target,distance=2){return spawnProjectile({kind:'arrow',enemy:true,x:target.col+distance,y:target.row,tx:target.col,ty:target.row,target,owner:source,speed:2,life:6,dmg:500});}
function shieldStep(n){for(let i=0;i<n;i++)update(1/30,1/60);}
`;
async function main(){await f.run(`(async()=>{
 await initMode();setSetupSeason('act1autochess');curDiff='standard';curMatch='solo';chooseBand('band_amiya');
 window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 const data=ArkEquipProtectionData;assert.equal(data.effectId,'eff_acarm060');
 for(const season of ['act1autochess','act2autochess']){
  G.seasonId=season;G.level=6;const card=shopEquipmentPool().find(e=>e.id==='riot_shield');assert.ok(card);assert.ok(data.seasons[season].shopIds.includes(card.chessId));
 }
 G.seasonId='act1autochess';const op=shieldBattle(),held=shieldEnemy(),ranged=shieldEnemy(7,8);ArkOperatorCombat.assignBlocks();
 assert.equal(held.id,undefined,'actual enemy uses visualId, not a test-invented id');assert.ok(held.visualId!==ranged.visualId);assert.equal(held.blockerId,op.id);
 const hit=(source,options={})=>inflictDamage(op,500,false,'phys',false,{source,...options});
 assert.equal(hit(held),500,'own blocked attacker has no reduction');assert.equal(hit(ranged),300,'same enemyId but different source unit is reduced');
 const beforeUnknown=op.hp;assert.equal(inflictDamage(op,500),500);assert.equal(beforeUnknown-op.hp,500,'missing source remains explicit boundary');
 assert.equal(hit(ranged,{noSourceDamage:true}),500);assert.equal(hit(ranged,{skipModifierEvents:true}),500);
 op.equip.push({id:'riot_shield',mods:{}});assert.equal(hit(ranged),300,'current local duplicate-copy policy; upstream registration is unresolved');
 op.equip=[];assert.equal(hit(ranged),500);op.equip=[{id:'eff_acarm060',mods:{}}];assert.equal(hit(ranged),300,'reward effect identity also supported');
 held.x=8;ArkOperatorCombat.assignBlocks();assert.equal(hit(ranged),500,'no current block releases protection');
 held.x=3;ArkOperatorCombat.assignBlocks();op.stunUntil=B.time+1;assert.equal(hit(ranged),500);op.stunUntil=0;op.frozenUntil=B.time+1;assert.equal(hit(ranged),300,'freeze itself does not release blocking');op.frozenUntil=0;
 assert.equal(ArkEquipProtection.scale(op,ranged,B,{seasonId:'unknown'}),1);
 assert.equal(ArkEquipProtection.scale(op,ranged,B,{seasonId:G.seasonId,kind:'heal'}),1);
 // Actual delayed projectile, block acquired after launch, then inverse case.
 let o=shieldBattle(),a=shieldEnemy(8,8),b=shieldEnemy(7,8);shieldShot(b,o);shieldStep(10);assert.equal(o.hp,10000);a.x=3;shieldStep(21);assert.equal(o.hp,9700);
 o=shieldBattle();a=shieldEnemy();b=shieldEnemy(7,8);shieldShot(b,o);shieldStep(10);a.x=8;shieldStep(21);assert.equal(o.hp,9500);
 // Ordinary melee windup reaches the actual source hook, so the held attacker remains unreduced.
 o=shieldBattle();a=shieldEnemy();a.cd=0;a.attackTime=1;a.rangeRadius=0;shieldStep(25);assert.equal(o.hp,9500);
 // Acquire through actual buy/attach/rest-save consumers. No training special choice is fabricated.
 chooseBand('band_amiya');G.money=100;G.level=3;const eq=shopEquipmentPool().find(e=>e.id==='riot_shield');assert.ok(eq);
 G.shop=[{type:'equip',equip:eq,cost:eq.cost}];buyShop(0);const purchased=G.equipInv.at(-1);assert.equal(purchased.id,'riot_shield');assert.equal(purchased.effectId,'eff_acarm060');
 const entry=ROSTER_LIST.find(e=>e.charId==='char_498_inside');G.shop=[{type:'op',entry,cost:1}];buyShop(0);attachEquip(G.ops[0],purchased,0);
 const owned=JSON.stringify(G.ops[0].equip);decodeRestSave(encodeRestSave());assert.equal(saveRestRun(),true);G.ops[0].equip=[null,null];assert.equal(loadRestRun(),true);assert.equal(JSON.stringify(G.ops[0].equip),owned);
 function badSave(change,pattern){const envelope=JSON.parse(encodeRestSave()),payload=JSON.parse(envelope.body);change(payload.session);envelope.body=JSON.stringify(payload);envelope.checksum=saveHash(envelope.body);assert.throws(()=>decodeRestSave(JSON.stringify(envelope)),pattern);}
 badSave(s=>{s.ops[0].equip[1]={id:'riot_shield',mods:null,uid:s.nextId++};},/装备损坏/);
 badSave(s=>{s.ops[0].equip[1]={...s.ops[0].equip[0]};},/实体编号损坏/);
 badSave(s=>{s.equipInv.push(null);},/装备损坏/);
 console.log('EQUIP PROTECTION local OK: real source identities, conditions, no-source/skip boundaries, launch-impact transitions, melee, market/purchase/attach/rest');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const p=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:86713});
 try{
  p.startBattle();p.__testMachine.run(`${helpers}const own=shieldBattle();own.playerId='ally';shieldEnemy();shieldShot(shieldEnemy(7,8),own);`);
  p.advance(.2);const checkpoint=p.snapshot();assert.ok(checkpoint.battle.projectiles.length);p.advance(.4);const impact=p.snapshot();assert.equal(impact.battle.operators[0].hp,9700);
  p.restore(JSON.parse(JSON.stringify(checkpoint)));p.advance(.4);const replay=p.snapshot();
  // Existing spawnHitParticles uses Math.random, outside ArkSim's saved stream.
  // Preserve and check the hit effect count, but do not claim identical cosmetic trajectories.
  const combat=b=>{const {particles,...rest}=b;return rest;};
  assert.equal(replay.battle.particles.length,impact.battle.particles.length);assert.deepEqual(combat(replay.battle),combat(impact.battle));assert.deepEqual(replay.rng,impact.rng);
  console.log('EQUIP PROTECTION room OK: authenticated in-flight restore preserves source alias, ally equipment and current blocking');
 }finally{p.dispose();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
