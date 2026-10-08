'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const graph=require('../work/client-logic/program-compilation.json').rejections;
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/direct_skill_data.js'),'utf8'),ctx);
const profiles=ctx.window.ArkDirectSkillData.profiles;
const cases=Object.entries(profiles).filter(([,p])=>p.castSchedule).flatMap(([id,p])=>p.charIds.flatMap(cid=>skills[id].levels.map((lv,i)=>{
 const a=graph[id].components.find(r=>r.type==='Torappu.Battle.Abilities.MultiRangedAttack').fields;
 return {id,cid,index:chars[cid].skills.findIndex(s=>s.skillId===id),level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),sp:lv.spData.spCost,
  preDelay:a._preDelay,interval:a._triggerDelta,rounds:a._additionalTimes+1};
})));
const combatState=b=>{const copy=structuredClone(b);delete copy.particles;return copy;};
const helper=`
function makeDirect(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',range:3,rangeGrids:entryRangeGrids(entry,false),
  hp:10000,maxHp:10000,atk:100,def:200,attackTime:2,attributeBase:{atk:100,def:200,aspd:1},cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];B.dpInterval=1e9;B.dpProgress=0;return o;
}
function directEnemy(o,id=100,outside=false,flying=false){
 const cell=o.cells.find(c=>c[1]>o.col)||[o.row,o.col];const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x:outside?o.col-3:cell[1],y:cell[0],hp:1e6,maxHp:1e6,atk:0,def:30,magicRes:25,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0,flying};B.enemies.push(e);return e;
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,timedCases:cases,profiles,timedSourceSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 function tickTo(at){while(B.time<at-1e-8){const dt=Math.min(.04,at-B.time);update(dt,dt);}}
 const randomBefore=gameRandom;gameRandom=()=>0;
 try{
 for(const c of timedCases){
  const o=makeDirect(c),e=directEnemy(o);o.cd=999;B.dp=0;B.dpMax=99;
  assert.equal(castSkill(o),true);assert.ok(Math.abs(o.sp)<1e-9);assert.equal(B.dp,0,'cost is source ON_SPELL_ON, not prematurely on CastStart');
  assert.equal(B.projectiles.length,0);assert.equal(operatorAction(o),'none');assert.equal(castSkill(o),false,'pending cast cannot reenter');
  gainOperatorSp(o,'INCREASE_WHEN_TAKEN_DAMAGE',1);assert.ok(Math.abs(o.sp)<1e-9);
  assert.equal(ArkDirectSkills.spLockTime(o,-1,10),c.preDelay+c.interval*(c.rounds-1));
  tickTo(c.preDelay-.01);assert.equal(e.hp,e.maxHp);assert.equal(B.projectiles.length,0);assert.ok(Math.abs(o.sp)<1e-9);
  tickTo(c.preDelay);assert.equal(B.projectiles.length,1);assert.equal(B.dp,c.bb.cost);assert.ok(Math.abs(o.sp)<1e-9);
  const first=B.projectiles[0],life=profiles[c.id].projectile.life;
  assert.ok(first.directSkillPacket);assert.ok(!first.basicAttack);assert.equal(first.resolveAt,c.preDelay+life);
  tickTo(first.resolveAt+.00001);const amount=Math.round(100*c.bb.atk_scale*.75);assert.equal(e.maxHp-e.hp,amount);
  assert.ok(e.stunUntil>B.time);assert.ok(Math.abs(o.sp)<1e-9);
  const newcomer=directEnemy(o,102),outside=directEnemy(o,103,true);o.atk=200;o.attributeBase.atk=200;
  tickTo(c.preDelay+c.interval+.00001);assert.equal(B.projectiles.filter(p=>p.directSkillPacket).length,2,'each spell refreshes targets');
  assert.equal(B.dp,c.bb.cost,'cost action only once across rounds');assert.equal(operatorAction(o),'attack');assert.ok(!o.directCast);
  o.atk=500;o.attributeBase.atk=500;
  tickTo(c.preDelay+c.interval+life+.0001);
  assert.equal(e.maxHp-e.hp,amount+Math.round(200*c.bb.atk_scale*.75),'power captured at each spell emission');
  assert.equal(newcomer.maxHp-newcomer.hp,Math.round(200*c.bb.atk_scale*.75));assert.equal(outside.hp,outside.maxHp);
  assert.ok(o.sp>0&&o.sp<.3,'only time after final spell resumes SP');
 }
 // Source allows DP casting without an enemy; both empty waves still complete.
 {const c=timedCases[0],o=makeDirect(c);o.cd=999;B.dp=0;B.dpMax=99;assert.equal(castSkill(o),true);tickTo(c.preDelay+c.interval+.01);assert.equal(B.dp,c.bb.cost);assert.equal(B.projectiles.length,0);assert.ok(!o.directCast);}
 // Cancelling un-emitted rounds must not remove a fired stopWhenSourceInvalid=0 packet.
 {const c=timedCases[0],o=makeDirect(c),e=directEnemy(o);o.cd=999;B.dp=0;castSkill(o);tickTo(c.preDelay);
  const due=B.projectiles[0].resolveAt;o.dead=true;ArkDirectSkills.death(o);assert.ok(!o.directCast);tickTo(due+.01);
  assert.equal(e.maxHp-e.hp,Math.round(100*c.bb.atk_scale*.75));tickTo(c.preDelay+c.interval+1);assert.equal(B.projectiles.length,0);}
 // Interruption before the first spell cancels the queue without granting DP.
 {const c=timedCases[0],o=makeDirect(c),e=directEnemy(o);o.cd=999;B.dp=0;castSkill(o);o.stunUntil=10;tickTo(c.preDelay+.01);assert.ok(!o.directCast);assert.equal(B.dp,0);assert.equal(e.hp,e.maxHp);}
 // Birth delay is bounded and uses the shared seeded gameplay random hook.
 {const c=timedCases[0],o=makeDirect(c);o.cd=999;directEnemy(o);gameRandom=()=>.5;castSkill(o);tickTo(c.preDelay);
  assert.ok(Math.abs(B.projectiles[0].resolveAt-(c.preDelay+profiles[c.id].projectile.life+.25))<1e-9);gameRandom=()=>0;}
 // Pool reset prevents a released skill packet from taking over the next basic shot.
 {const c=timedCases[0],o=makeDirect(c),e=directEnemy(o);o.cd=999;castSkill(o);tickTo(c.preDelay);const old=B.projectiles.pop();recycleProjectile(old);
  spawnProjectile({owner:o,target:e,enemy:false,basicAttack:true,kind:'arrow',x:o.col,y:o.row,tx:e.x,ty:e.y,speed:10,life:1,dmg:5});assert.equal(B.projectiles.at(-1).directSkillPacket,null);}
 }finally{gameRandom=randomBefore;}
 window.timedSeasonVariants=0;
 for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of timedCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
   G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),expected=timedSourceSkills[c.id].levels[(elite?7:4)-1];
   assert.equal(r.skill.sourceId,c.id);assert.equal(r.skill.spCost,expected.spData.spCost);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(expected.blackboard.map(b=>[b.key,b.value])));
   const o=makeDirect(c);o.skill=r.skill;o.sp=r.skill.spCost;o.cd=999;const e=directEnemy(o);B.dp=0;assert.equal(castSkill(o),true);
   tickTo(c.preDelay+c.interval+1);assert.ok(e.hp<e.maxHp);assert.equal(B.dp,r.skill.blackboard.cost);window.timedSeasonVariants++;
  }
 }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:68754,name:'公共定时施放'});
 try{
  runtime.startBattle();runtime.__testMachine.run(helper);
  for(const id of Object.keys(profiles).filter(id=>profiles[id].castSchedule)){
   const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var caster=makeDirect(${JSON.stringify(c)});caster.playerId='one';caster.cd=999;B.dp=0;B.dpMax=99;directEnemy(caster);directEnemy(caster,101,false,true);
    B.operators.push({...caster,id:2,col:caster.col-5,playerId:'two',hp:5000,buffs:[],sp:0,skill:null,skillState:null,cd:999});castSkill(caster);`);
   const queued=runtime.snapshot();runtime.advance(c.preDelay+.02);const inFlight=runtime.snapshot();runtime.advance(2);const expected=runtime.snapshot();
   runtime.restore(inFlight);runtime.advance(2);assert.deepEqual(combatState(runtime.snapshot().battle),combatState(expected.battle),'in-flight projectile/remaining-wave replay');assert.deepEqual(runtime.snapshot().rng,expected.rng,'in-flight seeded RNG replay');
   runtime.restore(queued);runtime.advance(c.preDelay+.02);runtime.advance(2);assert.deepEqual(combatState(runtime.snapshot().battle),combatState(expected.battle),'queued cast with seeded random delay replay');assert.deepEqual(runtime.snapshot().rng,expected.rng,'queued cast seeded RNG replay');
   assert.equal(runtime.snapshot().battle.operators[1].hp,5000);
  }
 }finally{runtime.dispose();}
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/direct-skill-projectiles-receipts.json',JSON.stringify({passed:true,sourceLevels:cases.length,actualSeasonVariants:f.run('timedSeasonVariants'),hostReplays:2,boundary:'source preDelay/interval and uniform shared RNG delivery; native animation phase and recovery remain explicit boundaries',checks:['multi-round independent target/power','one SP charge and one source cost event','partial interval SP lock','queued cast and emitted projectile restore','seeded RNG state restore','owner death leaves fired delivery','interruption cancels future waves','exactly initialized pooled packet']},null,2));
 console.log('DIRECT SKILL PROJECTILES OK',cases.length,'source levels; source delayed waves, target/power snapshots, locks, pool, interruption and 2 host replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

