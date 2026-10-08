'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies.enemy_1516_jakill;
assert.ok(record,'test requires the actual garrison encounter record');
const helpers=`
const taggedSource=${JSON.stringify(record)};
function taggedBattle(){
 const positions=[[1,3,3],[2,4,3],[3,3,4],[4,2,3],[5,6,3],[6,3,1]];
 startBattle(positions.map(([id,col,row])=>({id,charId:'char_002_amiya',col,row,position:'MELEE',maxHp:100000,
  atk:0,def:100,magicRes:25,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const o of B.operators)Object.assign(o,{atk:0,def:100,magicRes:25,attributeBase:{atk:0,def:100,aspd:1},
  basicAttack:{action:'attack',damageType:'phys'},cd:999,deployed:true,deployT:5,deployAt:0,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,
  skill:null,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  flow:null,attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:0});
 const source=JSON.parse(JSON.stringify(taggedSource));
 const e={...source,enemyId:'enemy_1516_jakill',x:3,y:2.5,hp:source.maxHp,atkType:'arts',dead:false,
  cd:0,visualId:22,route:-1};
 setupEnemy(e,source);B.enemies.push(e);return e;
}
function taggedOp(id){return B.operators.find(o=>o.id===id);}
function taggedSkill(e){return ArkExternalCombat.profile(e).skills.find(s=>s.skillKey==='ironsandstorm');}
function taggedSlot(e){return e.externalSkills.skills[taggedSkill(e).id];}
function taggedStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function taggedUntil(test,max=1200){for(let i=0;i<max;i++){if(test())return;taggedStep();}throw Error('tagged ranged condition did not occur');}
function taggedStart(e){taggedUntil(()=>e.atkSchedule?.skillId===taggedSkill(e).id);return e.atkSchedule;}
function taggedSummon(id=20,col=2,row=2){
 const token={id,charId:'token_tagged_test',col,row,hp:100000,maxHp:100000,atk:0,def:100,magicRes:25,
  deployT:5,deployAt:0,cd:999,life:100,canAttack:false,blockCnt:0,ep:{},epThreshold:100000,dodge:0,
  buffs:[],combatTalents:[],events:[],dmgTaken:1,cooperationResistance:1};
 B.summoneds.push(token);return token;
}
function taggedTargetFixture(){
 // Explicit selector fixtures, not a claim that garrison currently contains
 // a prison device. Tags are source data and must never be guessed from names.
 Object.assign(taggedOp(1),{tauntLevel:20,name:'prison is only a display label here'});
 Object.assign(taggedOp(2),{tauntLevel:10,position:'RANGED',col:5,row:2.5});
 Object.assign(taggedOp(3),{tauntLevel:100,sourceTags:['prison']});
 Object.assign(taggedOp(4),{tauntLevel:100,flying:true});
 Object.assign(taggedOp(5),{tauntLevel:100,col:5.0001,row:2.5});
 Object.assign(taggedOp(6),{tauntLevel:100,invisibleUntil:999});
}
function taggedReady(e){
 // Controlled ready-SP setup only; natural source charging is tested below.
 e.externalSkills.sp=3;e.cd=0;return taggedStart(e);
}
function taggedShots(e){return B.projectiles.filter(p=>p.owner===e&&p.sourceSkillPacket?.skillId===taggedSkill(e).id);}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=taggedBattle(),skill=taggedSkill(e);
  assert.ok(skill,'complete source tagged-ranged skill must be generated');
  assert.equal(e.externalCombatMode,0);assert.equal(skill.skillKey,'ironsandstorm');
  assert.equal(skill.kind,'selector-sp-tagged-ranged');
  assert.equal(e.externalSkills.sp,0);e.cd=999;taggedStep(60);
  assert.equal(e.externalSkills.sp,0,'attack-type SP cannot turn into time regeneration');

  e=taggedBattle();for(const o of B.operators)o.dodge=1;
  taggedStep();assert.ok(e.atkSchedule&&!e.atkSchedule.skillId);assert.equal(e.externalSkills.sp,0,
   'ordinary attack startup is not the successful output-attack-or-heal event');
  taggedUntil(()=>e.externalSkills.sp===1);
  assert.ok(B.projectiles.some(p=>p.owner===e&&!p.sourceSkillPacket),'the successful ordinary output emits a projectile');
  ArkEnemySkills.onOutputAttackOrHeal(e,e.atkSchedule);
  assert.equal(e.externalSkills.sp,1,'the same ordinary output callback cannot charge twice');
  taggedUntil(()=>e.externalSkills.sp===2);taggedUntil(()=>e.externalSkills.sp===3);
  assert.ok(!e.atkSchedule.skillId,'three successful ordinary outputs fill the shared owner SP');
  taggedStart(e);assert.equal(e.externalSkills.sp,0);assert.equal(taggedSlot(e).casts,1);
  taggedUntil(()=>taggedShots(e).length>0);
  assert.equal(taggedShots(e).length,2);assert.equal(e.externalSkills.sp,0,
   'SP recovery is stopped while the skill emits its two targets');
  taggedUntil(()=>taggedShots(e).length===0);
  assert.equal(e.externalSkills.sp,0,'two skill impacts cannot recharge the same cast');
  assert.ok(B.operators.every(o=>o.hp===100000),'dodging damage does not prevent successful ordinary attack SP');

  e=taggedBattle();const shared=e.externalSkills;
  Object.assign(taggedOp(1),{blockCnt:1});
  assert.equal(ArkExternalCombat.setMode(e,1),true);taggedUntil(()=>e.externalSkills.sp===1);
  assert.equal(e.externalSkills,shared,'ordinary mode output charges the same owner SP across mode changes');
  assert.equal(ArkExternalCombat.setMode(e,0),true);assert.equal(e.externalSkills.sp,1,
   'explicit source mode selection retains SP charged by its ordinary output; automatic rebirth is not claimed');

  e=taggedBattle();taggedTargetFixture();
  const token=taggedSummon();token.tauntLevel=5;
  taggedOp(1).dodge=1;
  e.epAttack=.8;e.epType='nervous'; // Collision fixture: this source skill has no ordinary EP packet.
  const cast=taggedReady(e);
  assert.deepEqual(Array.from(e.atkTargets,o=>o.id),[1,2],
   'ground targets at owner radius 2 are valid; prison, flying, hidden and the point just beyond 2 are excluded');
  assert.equal(e.externalSkills.sp,0,'three source SP are consumed at successful cast start');
  assert.equal(taggedSlot(e).casts,1);
  assert.ok(Math.abs(skill.action.timing.duration-2.0667)<1e-5&&Math.abs(skill.action.timing.hit-1.4667)<1e-5,
   'C1_Skill timing matches the frozen source animation and emission event');
  assert.ok(Math.abs(cast.windup-1.4667)<1e-5&&Math.abs(cast.windup+cast.strike+cast.recovery-2.0667)<1e-5,
   'timeMode 0 retains capped source timing rather than stretching to the four-second ordinary interval');
  assert.equal(taggedOp(1).hp,100000);assert.equal(taggedOp(2).hp,100000);
  assert.ok(!(taggedOp(1).stunUntil>B.time)&&!(taggedOp(2).stunUntil>B.time),'active Buff does not apply at skill start');
  taggedUntil(()=>taggedShots(e).length>0);
  assert.equal(taggedShots(e).length,2);assert.ok(taggedShots(e).every(p=>p.speed===10&&p.damageType==='arts'));
  assert.equal(taggedOp(1).hp,100000);assert.equal(taggedOp(2).hp,100000,'damage waits for actual projectile arrival');
  e.sourceSkills.find(s=>s.prefabKey==='ironsandstorm').blackboard.find(x=>x.key==='stun').value=99;
  assert.equal(ArkExternalCombat.setMode(e,1),true);
  assert.equal(e.externalSkills.sp,0,'explicit source-mode selection retains the same owner SP');
  e.cd=999;
  taggedUntil(()=>taggedOp(2).stunUntil>B.time);
  assert.equal(taggedOp(1).hp,100000);assert.ok(!(taggedOp(1).stunUntil>B.time),
   'DB isDamageMissable=true: a dodged projectile applies neither damage nor stun');
  assert.equal(taggedOp(2).hp,99475,'arts projectile consumes the actual source ATK 700 and target RES 25');
  assert.equal(taggedOp(2).ep.nervous,undefined,'launched skill packet cannot inherit ordinary EP after its source mode changes');
  assert.ok(Math.abs(taggedOp(2).stunUntil-B.time-3)<1e-7,
   'arrival consumes the launched three-second Buff snapshot, not new mode/skill parameters');
  assert.equal(taggedSlot(e).casts,1);
  taggedUntil(()=>taggedShots(e).length===0);
  const healed=taggedOp(2);healed.stunUntil=0;
  const before=healed.hp;
  const plain=spawnProjectile({enemy:true,owner:e,target:healed,sx:3,sy:2.5,x:3,y:2.5,
   tx:healed.col,ty:healed.row,dmg:1,damageType:'arts',speed:10,life:6,kind:'orb'});
  assert.equal(plain.sourceSkillPacket,null,'pooled ordinary projectile does not inherit the prior skill Buff');
  taggedUntil(()=>healed.hp<before);
  assert.equal(healed.hp,before-1);assert.equal(healed.stunUntil,0);

  e=taggedBattle();taggedTargetFixture();const groundToken=taggedSummon();groundToken.tauntLevel=30;
  taggedReady(e);
  assert.deepEqual(Array.from(e.atkTargets,o=>o.id),[20,1],'ground summons are selectable characters, while names do not synthesize prison tags');
  taggedUntil(()=>groundToken.stunUntil>B.time);
  assert.equal(groundToken.hp,99475);assert.ok(Math.abs(groundToken.stunUntil-B.time-3)<1e-7);

  e=taggedBattle();taggedTargetFixture();taggedOp(1).stunImmune=true;taggedOp(2).statusResistance=.5;
  e.sourceSkills.find(s=>s.prefabKey==='ironsandstorm').blackboard.find(x=>x.key==='stun').value=1.2;
  taggedReady(e);taggedUntil(()=>taggedOp(2).stunUntil>B.time);
  assert.equal(taggedOp(1).hp,99475);assert.ok(!(taggedOp(1).stunUntil>B.time),'stun immunity blocks the status without cancelling damage');
  assert.equal(taggedOp(2).hp,99475);assert.ok(Math.abs(taggedOp(2).stunUntil-B.time-.6)<1e-7,
   'status-resistible DB Buff consumes the stun key override before target duration resistance');

  e=taggedBattle();taggedTargetFixture();taggedReady(e);taggedUntil(()=>taggedShots(e).length>0);
  const expiring=taggedShots(e);assert.ok(expiring.every(p=>p.life>9.9&&p.life<=10),'source projectile lifetime is ten seconds');
  // Age the actual emitted packets to their final tick, keeping valid targets
  // out of this tick's travel distance. Source death must not cancel them.
  for(const p of expiring){p.life=1/30;Object.assign(p.target,{col:7,row:7});}
  e.dead=true;taggedStep();
  assert.equal(taggedOp(1).hp,99475);assert.equal(taggedOp(2).hp,99475);
  assert.ok(taggedOp(1).stunUntil>B.time&&taggedOp(2).stunUntil>B.time,
   'source-invalid continuation and lifetime force-reach still deliver the stored Buff to valid original targets');
  assert.equal(taggedShots(e).length,0);

  e=taggedBattle();taggedTargetFixture();taggedReady(e);taggedUntil(()=>taggedShots(e).length>0);
  taggedOp(1).removed=true;Object.assign(taggedOp(3),{col:taggedOp(1).col,row:taggedOp(1).row});
  taggedUntil(()=>taggedShots(e).length===0);
  assert.equal(taggedOp(1).hp,100000);assert.ok(!(taggedOp(1).stunUntil>B.time));
  assert.equal(taggedOp(3).hp,100000,'a removed trace target cannot redirect the projectile to its neighbour');
  assert.equal(taggedOp(2).hp,99475);

 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),hostSource=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(hostSource.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(hostSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'标签远程技能弹体存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+`taggedBattle();taggedTargetFixture();taggedOp(1).dodge=1;
   taggedReady(B.enemies[0]);taggedUntil(()=>taggedShots(B.enemies[0]).length>0);B.enemies[0].cd=999;`);
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies[0].externalSkills.sp,0);
  assert.equal(checkpoint.battle.projectiles.length,2);
  assert.ok(checkpoint.battle.projectiles.every(p=>p.sourceSkillPacket?.skillId),
   'live skill projectiles carry their serializable source effect packet');
  machine.run('taggedStep(60);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('taggedStep(60);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'real host restore preserves in-flight owner/target links, Buff packets, SP, damage and stun');
 }finally{runtime.dispose();}
 console.log('TAGGED RANGED OK: real source entry, tag/ground selectors, typed projectiles, DB Buff missability, launch snapshots and host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
