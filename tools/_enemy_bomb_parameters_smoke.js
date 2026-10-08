'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies.enemy_1040_bombd;
const helpers=`
const bombSourceFixture=${JSON.stringify(source)};
function bombBattle(){
 startBattle([1,2,3].map((id,i)=>({id,charId:'char_002_amiya',col:3+i,row:3,position:'MELEE',
  maxHp:50000,atk:0,def:100,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const op of B.operators)Object.assign(op,{deployed:true,deployT:5,deployAt:0,cd:999,atk:0,
  skill:null,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:0,attributeBase:{atk:0,def:100,aspd:1}});
 const source=JSON.parse(JSON.stringify(bombSourceFixture));
 const e={...source,enemyId:'enemy_1040_bombd',x:3,y:2,hp:source.maxHp,dead:false,route:-1,cd:0,visualId:100};
 setupEnemy(e,source);B.enemies.push(e);return e;
}
function bombStep(n=1){for(let i=0;i<n;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{await initMode();chooseBand('band_amiya');${helpers}
  let e=bombBattle();const p=enemyBombParameters(e);
  assert.equal(p.moveMultiplier,3);assert.ok(Math.abs(p.windup-8/30)<1e-6);
  e.attackTime=.5;assert.ok(Math.abs(enemyBombParameters(e).windup-4/30)<1e-6);
  e.attackTime=.01;assert.ok(Math.abs(enemyBombParameters(e).windup-.02666667)<1e-6);
  e.attackTime=2;e.sourceSkills[0].blackboard[0].value=0;assert.equal(enemyBombParameters(e).moveMultiplier,1);
  e.sourceSkills[0].blackboard[0].value=4;assert.equal(enemyBombParameters(e).moveMultiplier,5);
  e.sourceSkills[0].initCooldown=0;assert.equal(enemyBombParameters(e).initialCooldown,0);
  e.sourceSkills[0].blackboard.push({key:'unknown',value:1});assert.equal(enemyBombParameters(e),null);
  e=bombBattle();e.bombCooldown=0;advanceEnemyBomb(e,0);
  const remaining=e.bombWindup;advanceEnemyBomb(e,.1,.05);
  assert.ok(Math.abs(e.bombWindup-(remaining-.05))<1e-9,'attack slowdown affects windup, not source initial cooldown');
  e=bombBattle();B.operators[0].camouflageUntil=100;B.operators[1].untargetable=true;B.operators[2].removed=true;
  e.bombCooldown=0;assert.equal(advanceEnemyBomb(e,0),false);assert.equal(e.bombAim,null);
  B.operators[0].camouflageUntil=0;assert.equal(advanceEnemyBomb(e,0),true);
  assert.ok(Math.abs(e.bombWindup-8/30)<1e-6);
  bombStep(7);assert.equal(B.projectiles.length,0);bombStep(2);assert.equal(B.projectiles.length,1);
  const shot=B.projectiles[0];assert.equal(shot.halfWidth,1.5);assert.equal(shot.halfHeight,1.5);
  assert.equal(B.operators[0].hp,50000,'launch does not deal damage');
  B.operators[0].camouflageUntil=100;B.operators[1].untargetable=false;
  B.operators[1].col=4.49;B.operators[2].removed=false;B.operators[2].col=4.51;
  e.dead=true;bombStep(24);
  assert.ok(B.operators[0].hp<50000,'area hit ignores camouflage');
  assert.ok(B.operators[1].hp<50000,'source half width includes 1.49');
  assert.equal(B.operators[2].hp,50000,'outside 1.5 is excluded');
  assert.equal(B.projectiles.length,0);
  const reused=spawnProjectile({kind:'arrow',life:1,x:0,y:0});assert.equal(reused.halfWidth,null);
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),hostSource=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(hostSource.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(hostSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:991,name:'暴鸰参数恢复'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'bombBattle();B.enemies[0].bombCooldown=0;advanceEnemyBomb(B.enemies[0],0);bombStep(3);');
  for(const phase of ['windup','projectile']){
   const saved=JSON.parse(JSON.stringify(runtime.snapshot()));
   assert.ok(phase==='windup'?saved.battle.enemies[0].bombWindup>0:saved.battle.projectiles.length===1);
   machine.run('bombStep(45);');const after=runtime.snapshot();
   runtime.restore(saved);machine.run('bombStep(45);');const restored=runtime.snapshot();
   delete after.battle.particles;delete restored.battle.particles;
   assert.deepEqual(restored.battle,after.battle,'source bomb '+phase+' resumes deterministically');
   runtime.restore(saved);machine.run('bombStep(7);');
  }
 }finally{runtime.dispose();}
 console.log('BOMB PARAMETERS OK source windup/scaling, multiplier overrides, geometry, target validity, one throw and host windup/flight restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
