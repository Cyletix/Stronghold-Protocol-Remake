'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/enemy_encounters.json'),'utf8')).enemies.enemy_1525_blkswb;
assert.ok(source,'test requires the actual garrison encounter record');
const helpers=`
const areaSource=${JSON.stringify(source)};
function areaBattle(){
 const positions=[[1,4,3],[2,4.5,3],[3,4.5001,3],[4,3,4.25],[5,3,5],[6,2,3]];
 startBattle(positions.map(([id,col,row])=>({id,charId:'char_002_amiya',col,row,position:'MELEE',maxHp:100000,
  atk:0,def:100,magicRes:0,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 for(const o of B.operators)Object.assign(o,{atk:0,def:100,magicRes:0,attributeBase:{atk:0,def:100,aspd:1},
  basicAttack:{action:'attack',damageType:'phys'},cd:999,deployed:true,deployT:5,deployAt:0,
  hp:100000,maxHp:100000,epThreshold:100000,ep:{},epBurst:null,epResistance:0,
  skill:null,skillState:null,combatTalents:[],events:[],buffs:[],garrisonAdd:null,garrisonStats:null,
  flow:null,attackCrit:null,dodge:0,dmgTaken:1,cooperationResistance:1,blockCnt:0});
 const record=JSON.parse(JSON.stringify(areaSource));
 const e={...record,enemyId:'enemy_1525_blkswb',x:3,y:3,hp:record.maxHp,atkType:'phys',dead:false,
  cd:999,visualId:22,route:-1};
 setupEnemy(e,record);B.enemies.push(e);return e;
}
function areaOp(id){return B.operators.find(o=>o.id===id);}
function areaSkill(e){return ArkExternalCombat.profile(e).skills.find(s=>s.kind==='selector-cooldown-area-melee');}
function areaSlot(e){return e.externalSkills.skills[areaSkill(e).id];}
function areaStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
function areaUntil(test,max=900){for(let i=0;i<max;i++){if(test())return;areaStep();}throw Error('area skill condition did not occur');}
function areaStart(e){areaUntil(()=>e.atkSchedule?.skillId===areaSkill(e).id);return e.atkSchedule;}
function areaSummon(id=20,col=3,row=4.5){
 const token={id,charId:'token_area_test',col,row,hp:100000,maxHp:100000,atk:0,def:100,magicRes:0,
  deployT:5,deployAt:0,cd:999,life:100,canAttack:false,blockCnt:0,ep:{},epThreshold:100000,dodge:0,
  buffs:[],combatTalents:[],events:[],dmgTaken:1,cooperationResistance:1};
 B.summoneds.push(token);return token;
}
`;
async function main(){
 await fixture.run(`(async()=>{
  await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
  let e=areaBattle(),skill=areaSkill(e);
  assert.ok(skill,'real source CircleAttack must be selected by the complete area-melee compiler');
  assert.equal(skill.skillKey,'CircleAttack');assert.equal(e.externalCombatMode,0);
  assert.equal(areaSlot(e).cooldown,15);assert.equal(e.externalSkills.sp,0);
  assert.equal(e.rangeRadius,0,'skill range cannot come from the ordinary attack radius');
  areaStep(449);assert.equal(areaSlot(e).casts,0,'initial cooldown does not fire before 15 seconds');
  areaStart(e);assert.ok(B.time>=15-1e-8&&B.time<15.1);
  assert.ok(e.cd>980,'skill starts while the independent ordinary attack cooldown is still positive');
  assert.equal(areaSlot(e).casts,1);
  assert.equal(areaSlot(e).cooldown,15,'successful cast start resets the source skill cooldown');
  const raw=skill.action.timing,scale=Math.min(Math.max(e.attackTime/raw.duration,.1),1);
  assert.ok(Math.abs(raw.duration-2.0667)<1e-5&&Math.abs(raw.hit-.6333)<1e-5,
   'compiled timing matches the frozen source A_Skill2 animation and its single attack event');
  assert.ok(Math.abs(e.atkSchedule.windup-raw.hit*scale)<1e-9,'timeMode 0 scales the hit by the capped owner-attack-time factor');
  assert.ok(Math.abs(e.atkSchedule.windup+e.atkSchedule.strike+e.atkSchedule.recovery-raw.duration*scale)<1e-9,
   'maxAnimScale 1 prevents stretching the source animation to the ordinary four-second interval');

  e=areaBattle();e.attackTime=raw.duration/2;areaStart(e);
  assert.ok(Math.abs(e.atkSchedule.windup-raw.hit/2)<1e-9,'faster owner attack time accelerates the source hit');
  assert.ok(Math.abs(e.atkSchedule.windup+e.atkSchedule.strike+e.atkSchedule.recovery-raw.duration/2)<1e-9);
  e=areaBattle();e.attackTime=raw.duration*.01;areaStart(e);
  assert.ok(Math.abs(e.atkSchedule.windup-raw.hit*.1)<1e-9,'native epsilon 0.1 caps animation acceleration');

  e=areaBattle();areaStep(420);e.cd=0;Object.assign(areaOp(1),{col:3,row:3,blockCnt:1});
  areaStep();const ordinary=e.atkSchedule;
  assert.ok(ordinary&&!ordinary.skillId,'a real ordinary attack begins before the skill becomes ready');
  areaStep(30);assert.equal(e.atkSchedule,ordinary,'ready skill cannot interrupt an existing ordinary attack');
  assert.equal(areaSlot(e).casts,0);areaStart(e);assert.equal(areaSlot(e).casts,1);

  e=areaBattle();areaOp(6).invisibleUntil=999;
  const token=areaSummon(),cast=areaStart(e),input=e.atkTarget,castAt=B.time,normalCooldown=e.cd;
  assert.equal(cast.skillKind,'selector-cooldown-area-melee');
  assert.ok([1,2,4].includes(input.id));
  const [departed,boundary]=[1,2,4].map(areaOp).filter(o=>o!==input);
  Object.assign(departed,{col:8,row:7});Object.assign(boundary,{col:4.5,row:3});
  Object.assign(areaOp(5),{col:3,row:4.4});
  e.epAttack=.8;e.epType='nervous'; // Collision fixture: ordinary EP must not leak into this source skill.
  const hitEvents=[],onAttacked=ArkElementOperators.onAttacked;
  ArkElementOperators.onAttacked=(owner,target)=>{hitEvents.push(target.id);return onAttacked(owner,target);};
  try{
   areaUntil(()=>hitEvents.length>0);
   assert.equal(boundary.hp,99200,'source radius 1.5 includes its boundary, outside ordinary radius 0.5');
   assert.equal(areaOp(5).hp,99200,'a target entering during windup is selected at emission');
   assert.equal(departed.hp,100000,'a non-input target leaving during windup is not retained');
   assert.equal(areaOp(3).hp,100000,'the point beyond radius 1.5 is excluded');
   assert.equal(areaOp(6).hp,100000,'invisible targets are excluded');
   assert.equal(token.hp,99200,'deployed summons participate in the same area selector');
   assert.equal(input.hp,99200,'the input target is emitted once despite also matching the area query');
   assert.equal(hitEvents.length,4,'one attack event per selected entity, with no duplicate input');
   for(const target of [...B.operators,token])assert.equal(target.ep.nervous,undefined,'source skill has no ordinary EP packet');
   const afterHit=[...B.operators,token].map(o=>o.hp);
   areaUntil(()=>!e.atkPhase);
   assert.ok(areaSlot(e).cooldown<15,'cast completion does not reset the successful-start cooldown again');
   assert.ok(Math.abs(areaSlot(e).cooldown-(15-(B.time-castAt)))<1e-7,
    'documented local bridge keeps the skill cooldown ticking during its cast');
   assert.equal(e.cd,normalCooldown,'documented local bridge retains the ordinary cooldown during skill casting');
   areaStep(30);
   assert.deepEqual(Array.from([...B.operators,token],o=>o.hp),afterHit,'recovery does not emit another hit');
   assert.equal(areaSlot(e).casts,1);
  }finally{ArkElementOperators.onAttacked=onAttacked;}

  // Base native UpdateTargets is known; using it for the unreadable MeleeAttack
  // override is an explicit inference. It replaces the last reselected target
  // with a living input target, even when the input is out of range/invisible.
  e=areaBattle();areaStart(e);const originalInput=e.atkTarget;
  const reselection=B.operators.filter(o=>o!==originalInput).slice(0,2);
  for(const o of B.operators)o.untargetable=o!==originalInput&&!reselection.includes(o);
  for(const [index,o]of reselection.entries())Object.assign(o,{col:4+index*.2,row:3});
  Object.assign(originalInput,{col:8,row:8,invisibleUntil:999});
  areaUntil(()=>originalInput.hp<originalInput.maxHp);
  assert.equal(originalInput.hp,99200,'living original input bypasses current range and invisibility');
  assert.equal(reselection.filter(o=>o.hp<o.maxHp).length,1,'input replaces the last candidate instead of increasing a nonempty target set');
  assert.equal(B.operators.filter(o=>o.hp<o.maxHp).length,2);

  // Isolated lifecycle fixture only: the real source has no compiled mode 1.
  // Inject one compatible empty transition destination to verify preservation;
  // this does not claim that the source enemy can enter this phase in battle.
  e=areaBattle();const profile=ArkExternalCombat.profile(e),oldMode1=profile.modes[1];
  try{
   profile.modes[1]={...JSON.parse(JSON.stringify(profile.modes[0])),modeIndex:1};
   const retained=areaStart(e),target=e.atkTarget;
   assert.equal(retained.interruptOnDetach,false);
   assert.equal(ArkExternalCombat.setMode(e,1),true);
   assert.equal(e.atkSchedule,retained,'verified non-interrupting detach preserves the existing skill');
   assert.equal(retained.modeIndex,0,'cast retains its original source mode snapshot');
   e.sourceSkills.find(s=>s.prefabKey==='CircleAttack').blackboard.find(x=>x.key==='range_radius').value=.25;
   const entrant=B.operators.find(o=>o!==target);Object.assign(entrant,{col:4.25,row:3});
   areaUntil(()=>entrant.hp<entrant.maxHp);
   assert.equal(entrant.hp,99200,'preserved cast uses its original range rather than new mode/parameter state');
   areaUntil(()=>!e.atkPhase);assert.equal(areaSlot(e).casts,1);
  }finally{if(oldMode1===undefined)delete profile.modes[1];else profile.modes[1]=oldMode1;}
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),hostSource=fs.readFileSync(filename,'utf8');
 const marker='return Object.freeze({fingerprint,config:';assert.equal(hostSource.split(marker).length,2);
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(hostSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',
  mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'范围近战技能存档'});
 try{
  runtime.startBattle();const machine=runtime.__testMachine;
  machine.run(helpers+'areaBattle();areaSummon();areaStart(B.enemies[0]);areaStep();');
  const checkpoint=JSON.parse(JSON.stringify(runtime.snapshot()));
  assert.equal(checkpoint.battle.enemies[0].atkSchedule.skillKind,'selector-cooldown-area-melee');
  assert.equal(checkpoint.battle.enemies[0].atkPhase,'windup');
  assert.ok(checkpoint.battle.enemies[0].atkTimer<checkpoint.battle.enemies[0].atkSchedule.windup);
  machine.run('areaStep(90);');const after=runtime.snapshot();
  runtime.restore(checkpoint);machine.run('areaStep(90);');const restored=runtime.snapshot();
  delete after.battle.particles;delete restored.battle.particles;
  assert.deepEqual(restored.battle,after.battle,'real host restore retains input targets, range, mode, damage and cooldown');
 }finally{runtime.dispose();}
 console.log('AREA MELEE OK: real source entry, independent initial cooldown, live range selection, summons, EP isolation and host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
