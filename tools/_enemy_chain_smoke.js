'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const helpers=`
function chainBattle(){
 startBattle(Array.from({length:5},(_,i)=>({id:i+1,charId:'char_002_amiya',col:3+i,row:3,position:'MELEE',maxHp:10000,
  atk:0,def:100,magicRes:i===1?20:0,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const [i,o]of B.operators.entries())Object.assign(o,{hp:10000,maxHp:10000,atk:0,def:100,magicRes:i===1?20:0,
  attributeBase:{atk:0,def:100,aspd:1},basicAttack:{action:'attack',damageType:'phys'},
  cd:999,deployed:true,deployT:5,deployAt:0,skill:null,skillState:null,blockCnt:0,
  combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,flow:null,
  attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,epResistance:0,epThreshold:10000});
 const e={enemyId:'enemy_1225_dkmage',x:3,y:.5,hp:100000,maxHp:100000,atk:800,
  def:0,magicRes:0,rangeRadius:2.2,applyWay:'RANGED',attackTime:2,moveSpeed:0,
  atkType:'arts',dead:false,cd:0,visualId:22,route:-1,sourceTalentBlackboard:[]};
 setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return e;
}
function chainStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function chainLaunch(){for(let i=0;i<120&&!B.projectiles.some(p=>p.enemyChain);i++)chainStep();
 const p=B.projectiles.find(p=>p.enemyChain);if(!p)throw Error('real generated chain profile never launches');return p;}
function chainImpact(){const p=B.projectiles.find(p=>p.enemyChain);if(p)p.speed=1000;chainStep();}
function chainMetrics(){return {hp:B.operators.map(o=>o.hp),ep:B.operators.map(o=>o.ep?.apoptosis||0),
 phase:B.enemies[0].atkPhase,pending:B.enemies[0].atkSchedule?.pendingProjectiles||0,projectiles:B.projectiles.length};}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=chainBattle(),p=chainLaunch();
  assert.equal(p.enemyChain.kind,'chain');assert.equal(p.enemyChain.chain.maxTargets,4);
  assert.equal(p.enemyChain.element.type,'apoptosis');assert.equal(e.atkPhase,'projectile');
  assert.equal(e.atkSchedule.pendingProjectiles,1);
  p.speed=.01;chainStep(90);
  assert.equal(e.atkPhase,'projectile','the cast waits past its animation for the actual projectile');
  assert.equal(B.projectiles.length,1,'ready cooldown does not launch a second cast while waiting');
  assert.ok(e.cd<0,'cooldown keeps running while the released projectile owns its clock');
  assert.ok(B.operators.every(o=>o.hp===10000),'no early damage before the projectile arrives');
  e.atk=9000;chainImpact();
  assert.deepEqual(Array.from(B.operators,o=>10000-o.hp),[800,544,578,491,0],
   'four unique targets, each defense, and exponential decay use the released attack snapshot');
  const expected=[240,204,173.4,147.39,0];
  B.operators.forEach((o,i)=>assert.ok(Math.abs((o.ep?.apoptosis||0)-expected[i])<1e-7,'each hop delivers its source elemental packet'));
  assert.equal(e.atkPhase,null);assert.equal(e.atkSchedule,null);assert.equal(B.projectiles.length,0);

  e=chainBattle();p=chainLaunch();p.target.dead=true;chainImpact();
  assert.ok(B.operators.slice(1).every(o=>o.hp===10000),'lost trace target never retargets a nearby operator');
  assert.equal(e.atkPhase,null,'lost-target disposal releases the waiting cast');
  e=chainBattle();p=chainLaunch();p.life=.001;p.speed=.001;chainStep();
  assert.equal(e.atkPhase,null,'expiry dispatches completion before recycling');
  assert.ok(B.operators.every(o=>o.hp===10000));

  e=chainBattle();p=chainLaunch();
  const oldToken=p.castToken;
  e.atkSchedule={projectileToken:oldToken+1,pendingProjectiles:1};e.atkPhase='projectile';
  chainImpact();assert.equal(e.atkSchedule.projectileToken,oldToken+1,'old projectile cannot finish a replacement cast');
  assert.equal(e.atkSchedule.pendingProjectiles,1);

  e=chainBattle();e.sourceTalentBlackboard=[{key:'irrelevant.max_target',value:99},{key:'epdamage.attack@max_target',value:2}];
  p=chainLaunch();assert.equal(p.enemyChain.chain.maxTargets,2);chainImpact();
  assert.deepEqual(Array.from(B.operators,o=>10000-o.hp),[800,544,0,0,0]);
  e=chainBattle();e.sourceTalentBlackboard=[{key:'epdamage.attack@chain.atk_scale',value:0}];
  chainLaunch();chainImpact();
  assert.deepEqual(Array.from(B.operators,o=>10000-o.hp),[800,0,0,0,0],'explicit zero decay stays zero after the first target');
  e=chainBattle();e.sourceTalentBlackboard=[{key:'epdamage.attack@max_target',value:0}];
  chainStep(90);assert.equal(B.projectiles.length,0,'invalid exact-scope configuration cannot fall back to an ordinary shot');
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'链弹存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'chainBattle();chainLaunch();');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.projectiles[0].castToken,checkpoint.battle.enemies[0].atkSchedule.projectileToken);
  assert.equal(checkpoint.battle.projectiles[0].attackPacket.atk,800);
  machine.run('chainImpact();');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('chainImpact();');
  assert.deepEqual(runtime.snapshot().battle,after.battle,'in-flight restore preserves target references, payload, one completion and deterministic chain selection');
 }finally{runtime.dispose();}
 console.log('CHAIN OK: real source batch, flight/completion, distinct targets, damage and EP decay, scoped overrides, invalidation, stale cast and VM restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
