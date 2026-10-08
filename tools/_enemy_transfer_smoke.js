'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const database=new Map(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'),'utf8')).enemies.map(r=>[r.Key,r.Value]));
const {enemyVariant}=require('./lib/source-battle');
f.ctx.transferStageVariants=['BOSS','NORMAL'].map(levelType=>enemyVariant({id:'enemy_9013_acstmk',level:0,useDb:true,overwrittenData:{levelType:{m_defined:true,m_value:levelType},attributes:{maxHp:{m_defined:true,m_value:777}}}},database));
const helpers=`
function transferBattle(id='enemy_9014_acstma'){
 startBattle([],[],100);B.sourceBattle=null;B.waveScheduler=null;B.spawn=[{at:999,enemyId:'none'}];B.enemies=[];B.summoneds=[];B.leader=null;B.leaderEnemyId=null;
 const o={id:1,charId:'ordinary',row:3,col:0,cells:[[3,1],[3,2],[3,3]],range:3,atk:100,atkType:'arts',position:'RANGED',profession:'CASTER',
  hp:1000,maxHp:1000,attackTime:99,cd:999,def:0,blockCnt:0,events:[],buffs:[],deployed:true,deployAt:0,deployT:5,sp:0,
  basicAttack:{action:'attack',kind:'single',damageType:'arts'},combatTalents:[]};B.operators=[o];
 function enemy(enemyId,visualId,x,hp){const e={enemyId,id:visualId,visualId,x,y:3,hp,maxHp:hp,atk:50,def:0,magicRes:0,moveSpeed:0,route:-1,seg:0,cp:0,wait:0,cd:999,dead:false,canAttack:false,attackTime:99,applyWay:'MELEE',sourceLevel:0,sourceTalentBlackboard:[]};setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return e;}
 const part=enemy(id,10,1,200),boss=enemy('enemy_9013_acstmk',11,9,1000);boss.sourceLevelType='BOSS';return {o,part,boss};
}
function transferStep(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/30);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 for(const id of ['enemy_9014_acstma','enemy_9015_acstmb']){
  for(const type of ['phys','arts','true','elemental']){
   const {part,boss}=transferBattle(id);boss.def=999999;boss.magicRes=100;const actual=inflictDamage(part,30,false,type);
   assert.equal(actual,30);assert.equal(part.hp,170);assert.equal(boss.hp,970,id+' '+type+' transfers pure value without DEF/RES recalculation');
  }
  let {part,boss}=transferBattle(id);part.hp=5;assert.equal(inflictDamage(part,70,false,'phys'),5);assert.equal(boss.hp,930,'modifier value, not actual HP clipped to remaining 5');
  ({part,boss}=transferBattle(id));part.silenceUntil=999;inflictDamage(part,20,false,'arts');assert.equal(boss.hp,980,'source transfer is not silenceable');
  ({part,boss}=transferBattle(id));boss.hp=10;inflictDamage(part,30,false,'true');assert.equal(boss.dead,true,'transfer handles boss lethal HP itself');assert.equal(part.hp,170);
 }
 let p=transferBattle();const seen=[];ArkEnemyPassives.onTakingDamage(p.part,12,B,(target,n,flags)=>seen.push({hp:p.part.hp,id:target.enemyId,n,flags}),{kind:'damage'});
 assert.equal(seen[0].hp,200);assert.equal(seen[0].id,'enemy_9013_acstmk');assert.equal(seen[0].flags.skipModifierEvents,true);assert.equal(seen[0].flags.noSourceDamage,true);
 // Event filters reject healing, cancellation and skipped modifier events without a recursive dispatch.
 for(const context of [{kind:'heal'},{kind:'damage',cancelled:true},{kind:'damage',skipModifierEvents:true}]){
  p=transferBattle();let calls=0;ArkEnemyPassives.onTakingDamage(p.part,100,B,()=>calls++,context);assert.equal(calls,0);assert.equal(p.boss.hp,1000);
 }
 for(const amount of [0,-5,NaN,Infinity]){p=transferBattle();let calls=0;ArkEnemyPassives.onTakingDamage(p.part,amount,B,()=>calls++,{kind:'damage'});assert.equal(calls,0);}
 for(const field of ['dead','untargetable']){p=transferBattle();p.part[field]=true;inflictDamage(p.part,30,false,'arts');assert.equal(p.boss.hp,1000,'cancelled incoming hit '+field);}
 p=transferBattle();p.part.sleepUntil=999;inflictDamage(p.part,30,false,'arts');assert.equal(p.boss.hp,1000,'sleep rejection happens before event');
 // The skip-events engine path changes HP and feedback, without recursively emitting damage callbacks.
 p=transferBattle();inflictDamage(p.part,30,false,'true',true,{skipModifierEvents:true,noSourceDamage:true});assert.equal(p.part.hp,170);assert.equal(p.boss.hp,1000);
 // First trigger uses a fresh global selector, not nearest enemy or cached boss reference.
 p=transferBattle();B.enemies.unshift({...p.boss,id:20,visualId:20,enemyId:'unrelated_boss',x:1});inflictDamage(p.part,30,false,'phys');assert.equal(B.enemies[0].hp,1000);assert.equal(p.boss.hp,970);
 p=transferBattle();p.boss.dead=true;assert.equal(ArkEnemyPassives.onTakingDamage(p.part,20,B,()=>assert.fail('dead target'),{kind:'damage'}).status,'no-target');
 p=transferBattle();p.boss.sourceLevelType='NORMAL';inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,1000,'stage levelType override must preserve BOSS requirement');
 for(const base of transferStageVariants){
  p=transferBattle();B.enemies=[p.part];BDATA.enemies[base.enemyId]=base;const snapshot=JSON.stringify(base),stageBoss=spawnEnemyAt(base.enemyId,{x:9,y:3,route:-1,seg:0,cp:0});
  assert.equal(stageBoss.sourceLevelType,base.sourceLevelType);assert.equal(stageBoss.maxHp,777);inflictDamage(p.part,20,false,'arts');assert.equal(stageBoss.hp,base.sourceLevelType==='BOSS'?757:777);assert.equal(JSON.stringify(base),snapshot);
 }
 p=transferBattle();B.enemies.push({...p.boss,id:12,visualId:12});inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,1000);assert.equal(B.enemies[2].hp,1000);assert.equal(p.part.hp,180);assert.equal(B.enemyPassiveDiagnostics[0].reason,'ambiguous-boss-selector');
 inflictDamage(p.part,20,false,'arts');assert.equal(B.enemyPassiveDiagnostics.length,1,'ambiguity diagnostics are deduplicated');
 p=transferBattle();p.part.sourceTalentBlackboard=[{key:'ability_name',valueStr:'UnknownSelector'}];inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,1000);assert.equal(B.enemyPassiveDiagnostics[0].reason,'unsupported-selector-alias');
 p=transferBattle();p.part.sourceTalentBlackboard=[{key:'atk_scale',value:2}];inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,960,'source fixed damage atk_scale override');
 p=transferBattle();p.part.sourceTalentBlackboard=[{key:'atk_scale',value:-1}];inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,1000);assert.equal(B.enemyPassiveDiagnostics[0].reason,'unsupported-transfer-scale');
 for(const id of ['unbound','enemy_9018_actrpa','enemy_9019_actrpb','enemy_9020_actrpc']){p=transferBattle(id);inflictDamage(p.part,20,false,'arts');assert.equal(p.boss.hp,1000,id+' is not widened into this transfer contract');}
 // Actual operator -> common projectile -> inflictDamage consumer; boss is outside operator range.
 p=transferBattle();p.o.cd=0;ArkOperatorCombat.attack(p.o);p.o.cd=999;assert.ok(B.projectiles.length);transferStep(20);assert.equal(p.part.hp,100);assert.equal(p.boss.hp,900);
 })()`);
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:',m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));assert.equal(source.split(marker).length,2);m._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:41});
 try{
  runtime.startBattle();runtime.__testMachine.run(helpers+"const {part,boss}=transferBattle();spawnProjectile({target:part,enemy:false,x:0,y:3,tx:1,ty:3,speed:1,life:5,kind:'orb',dmg:30,damageType:'arts'});");
  runtime.advance(.1);const checkpoint=runtime.snapshot();runtime.advance(.5);const expected=runtime.snapshot();assert.equal(expected.battle.enemies.find(e=>e.enemyId==='enemy_9013_acstmk').hp,970);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.5);const restored=runtime.snapshot(),withoutParticles=({particles,...battle})=>battle;
  assert.deepEqual(withoutParticles(restored.battle),withoutParticles(expected.battle),'pending real projectile reselects boss and transfers once after authenticated restore');assert.deepEqual(restored.rng,expected.rng);
  runtime.__testMachine.context.transferStageVariant=f.ctx.transferStageVariants[1];
  runtime.__testMachine.run("const p2=transferBattle();B.enemies=[p2.part];BDATA.enemies[transferStageVariant.enemyId]=transferStageVariant;spawnEnemyAt(transferStageVariant.enemyId,{x:9,y:3,route:-1,seg:0,cp:0});spawnProjectile({target:p2.part,enemy:false,x:0,y:3,tx:1,ty:3,speed:1,life:5,kind:'orb',dmg:30,damageType:'arts'});");
  runtime.advance(.1);const staged=runtime.snapshot();assert.equal(staged.battle.enemies[1].sourceLevelType,'NORMAL');runtime.restore(JSON.parse(JSON.stringify(staged)));runtime.advance(.5);assert.equal(runtime.snapshot().battle.enemies[1].hp,777,'real levelType stage override remains excluded after restore');
 }finally{runtime.dispose();}
 console.log('ENEMY TRANSFER OK: 2 exact root graphs, modifier value/overkill, pure no-source skip-events, cancellation, silence, selector rejection, stage overrides, real projectile and authenticated restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
