'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const helpers=`
function propBattle(){
 startBattle([],[],100);B.waveScheduler=null;B.spawn=[{at:999,enemyId:'none'}];B.enemies=[];B.summoneds=[];B.leader=null;B.leaderEnemyId=null;
 const o={id:1,charId:'char_002_amiya',row:3,col:0,cells:[[3,1],[3,2],[3,3]],range:3,atk:10000,atkType:'arts',position:'RANGED',profession:'CASTER',
  hp:1000,maxHp:1000,attackTime:99,cd:999,def:0,blockCnt:0,events:[],buffs:[],deployed:true,deployAt:0,deployT:5,sp:0,
  basicAttack:{action:'attack',kind:'single',damageType:'arts'},combatTalents:[]};B.operators=[o];return o;
}
function propEnemy(id='enemy_1204_msfhu',extra={}){
 const base=ArkEnemyDeathSpawn.fallback(id),e={...base,visualId:100+B.enemies.length,x:1,y:3,hp:base.maxHp,route:-1,seg:0,cp:0,moveSpeed:0,cd:999,dead:false,...extra};
 setupEnemy(e,base);B.enemies.push(e);return e;
}
function propStep(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/30);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 const nativeHp=[2,3,3,4,30,35,3,4,4,6,12,15,35,45];let index=0;
 for(const [id,base] of Object.entries(ArkEnemyDeathSpawnData.children)){
  propBattle();const e=propEnemy(id);assert.equal(e.maxHp,nativeHp[index++],id+' source HP is the hit count');
  for(const type of ['phys','arts','true','elemental',null]){
   e.hp=e.maxHp;const expected=!base.propLike.acceptSpecificDamageType||type==='arts'||type==='true'?1:0;
   assert.equal(inflictDamage(e,999999,false,type),expected,id+' '+type);assert.equal(e.hp,e.maxHp-expected);
   assert.equal(inflictDamage(e,.00001,false,type),expected,'tiny positive HP loss is also one accepted hit');
  }
  const before=e.hp;assert.equal(inflictDamage(e,0,false,'arts'),0);assert.equal(inflictDamage(e,-100,false,'heal'),0);assert.equal(e.hp,before);
  assert.equal(ArkEnemyDeathSpawn.hpDelta(e,100,'heal'),0,'positive HP modifier cannot restore a prop');
  e.hp=e.maxHp;let hits=0;while(!e.dead){hitEnemy(null,e,123456,false,'true');hits++;assert.ok(hits<=e.maxHp);}
  assert.equal(hits,e.maxHp,id+' dies at exactly source HP accepted hits');
 }
 propBattle();const regular={enemyId:'unbound',hp:500,maxHp:500};assert.equal(inflictDamage(regular,80,false,'phys'),80);assert.equal(regular.hp,420);
 const altered=propEnemy(undefined,{hp:10,maxHp:10,sourceLevel:4});assert.equal(inflictDamage(altered,1000,false,'arts'),1);assert.equal(altered.hp,9,'do not replace stage HP with catalog hit count');
 B.sourceBattle={};B.enemyStatMultiplier=2;B.moveMultiplier=1;B.enemyModifiers=[];const scaled=spawnEnemyAt('enemy_1204_msfhu',{x:1,y:3,route:-1,seg:0,cp:0},ArkEnemyDeathSpawn.fallback('enemy_1204_msfhu'));
 assert.equal(scaled.hp,scaled.maxHp);assert.equal(scaled.maxHp,8,'existing HP modifier changes hit count');assert.equal(inflictDamage(scaled,1000,false,'true'),1);
 // Real generic arrow/orb consumption preserves explicit type through the pool.
 propBattle();let e=propEnemy();spawnProjectile({target:e,enemy:false,x:1,y:3,tx:1,ty:3,speed:10,life:1,kind:'arrow',dmg:999,damageType:'phys'});propStep(1);assert.equal(e.hp,4);
 const shot=spawnProjectile({target:e,enemy:false,x:1,y:3,tx:1,ty:3,speed:10,life:1,kind:'orb',dmg:999,damageType:'arts'});propStep(1);assert.equal(e.hp,3);
 const unknown=spawnProjectile({target:e,enemy:false,x:1,y:3,tx:1,ty:3,speed:10,life:1,kind:'arrow',dmg:999});assert.equal(unknown.damageType,null,'pooled projectile cannot keep previous magical damage type');propStep(1);assert.equal(e.hp,3,'untyped hit is not silently magical');
 // Real common attack planner -> missile -> hit, followed by a separate true hit.
 let o=propBattle();e=propEnemy();o.cd=0;ArkOperatorCombat.attack(o);o.cd=999;assert.ok(B.projectiles.length);propStep(15);assert.equal(e.hp,3,'magical basic attack is one hit');
 o=propBattle();e=propEnemy();o.atkType='phys';o.cd=0;ArkOperatorCombat.attack(o);o.cd=999;propStep(15);assert.equal(e.hp,4,'physical basic attack rejected');
 // Actual computed weakness type must win over the original plan type.
 o=propBattle();e=propEnemy(undefined,{def:99999,magicRes:0});o.atkType='phys';o.garrisonStats={weakness:true};
 const result=calcDamageResult(o,e,1);assert.equal(result.type,'arts');assert.equal(calcDamage(o,e,1),result.amount,'legacy numerical API preserved');
 ArkOperatorCombat.impact({owner:o,target:e,plan:{kind:'single',power:10000,scale:1,damageType:'phys',hits:1},tx:1,ty:3});assert.equal(e.hp,3);
 // Independent skill damage and actual Indigo continuous arts route.
 o=propBattle();e=propEnemy();ArkOperatorCombat.impact({owner:o,target:e,plan:{kind:'single',power:10000,scale:1,damageType:'arts',hits:2,independentSkill:true},tx:1,ty:3});assert.equal(e.hp,2,'two skill hits remain two modifiers');
 o=propBattle();e=propEnemy();e.rootUntil=10;o.skill={sourceId:'skchr_indigo_2',blackboard:{'indigo_s_2[damage].interval':1,'indigo_s_2[damage].atk_scale':100}};o.skillState={until:10,mysticPulse:{startedAt:0,ticks:0}};
 B.time=1;ArkMystic.advance(o,1);assert.equal(e.hp,3,'continuous magical tick is one hit');
 // Elemental HP damage is rejected by magical-only props; EP accumulation is separate.
 o=propBattle();e=propEnemy();assert.equal(ArkElements.deal(e,1000,'elemental',o),0);assert.equal(ArkElements.deal(e,1000,'true',o),1);
 const ep=ArkElements.add(e,'burn',10,o);assert.ok(ep>0);assert.ok(e.ep.burn>0,'PropLike override does not invent EP immunity');
 o.basicAttack={action:'bard'};o.skill={sourceId:'skchr_skadi2_3',blackboard:{atk_scale:1,hp_ratio:.01}};o.skillState={until:99};updateSupportRecovery(1);assert.equal(e.hp,2,'bard true DOT reaches magical-only prop');
 // Final parent -> delayed children -> exact number of accepted hits -> victory.
 o=propBattle();B.spawn=[];const parent={enemyId:'enemy_1195_sfyin',hp:0,maxHp:10,x:1,y:3,route:-1,seg:0,cp:0,dead:false};B.enemies=[parent];killEnemy(parent);propStep(22);assert.equal(B.enemies.length,2);assert.equal(B.over,false);
 for(const child of B.enemies.slice()){assert.equal(child.hp,2);hitEnemy(o,child,999,false,'phys');assert.equal(child.dead,false);hitEnemy(o,child,999,false,'phys');assert.equal(child.dead,true);}propStep(1);assert.equal(B.win,true);
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));assert.equal(source.split(marker).length,2);
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:41});
 try{
  runtime.startBattle();runtime.__testMachine.run(`${helpers}propBattle();const e=propEnemy();spawnProjectile({target:e,enemy:false,x:0,y:3,tx:1,ty:3,speed:1,life:5,kind:'orb',dmg:999,damageType:'arts'});`);
  runtime.advance(.1);const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.projectiles[0].damageType,'arts');
  runtime.advance(.5);const expected=runtime.snapshot();assert.equal(expected.battle.enemies[0].hp,3);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.5);
  const restored=runtime.snapshot(),withoutParticles=({particles,...battle})=>battle;
  assert.deepEqual(withoutParticles(restored.battle),withoutParticles(expected.battle),'typed projectile and remaining hit count survive authenticated restore');
  assert.deepEqual(restored.rng,expected.rng,'cosmetic Math.random particles do not affect combat RNG');
 }finally{runtime.dispose();}
 console.log('ENEMY PROP OK: 14 exact HP counts; physical/magical/pure/elemental/heal, typed basic/skill/projectile/DOT, HP overrides, EP boundary, parent queue and room restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

