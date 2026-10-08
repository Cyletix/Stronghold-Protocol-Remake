'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const sourceGraphs=require('../work/client-logic/program-compilation.json').rejections;
const dataContext={window:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../web/next_attack_skill_data.js'),'utf8'),dataContext);
// Compound listeners have their own damage/heal and host replay matrix.
const profiles=Object.fromEntries(Object.entries(dataContext.window.ArkNextAttackSkillData.profiles).filter(([,p])=>p.kind==='next-attack'&&!p.spellExtras)),ids=Object.keys(profiles);
const cases=Object.entries(chars).flatMap(([cid,c])=>c.skills.flatMap((s,index)=>profiles[s.skillId]?.charIds.includes(cid)?skills[s.skillId].levels.map((lv,i)=>{
 const rows=sourceGraphs[s.skillId].components,attack=rows.find(r=>['MeleeAttack','MultiMeleeAttack','RangedAttack'].some(t=>r.type==='Torappu.Battle.Abilities.'+t)),a=attack.fields;
 const selector=rows.find(r=>r.node_id===a._selector.m_PathID),t=selector?.fields,bb=Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value]));
 return {cid,index,id:s.skillId,level:i+1,bb,sp:lv.spData.spCost,spType:lv.spData.spType,maxCharge:lv.spData.maxChargeTime,
  hits:1+(a._additionalTimes||0),damageType:a._damageType,groundOnly:t?._targetMotion===1,
  defenseScale:a._activeBuffs.some(buff=>buff.attributes.attributeModifiers.some(m=>m.attributeType===2&&m.formulaItem===3))?1+bb.def:1,
  count:!t?1:t._limitedMaxTargetNumToBlockedCnt?'block':t._limitTargetNum?(bb[t._maxTargetKey]??t._maxNum):selector.type==='Torappu.Battle.AdvancedSelector'?'all':1,
  delivery:attack.type==='Torappu.Battle.Abilities.RangedAttack'?'projectile':'direct'};
}):[]));
const helper=`
function makeNext(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',range:3,rangeGrids:entryRangeGrids(entry,false),
  hp:10000,maxHp:10000,atk:100,def:200,attackTime:2,attributeBase:{atk:100,def:200,aspd:1},cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function nextEnemy(o,id=100,outside=false,flying=false){
 const cell=o.cells.find(c=>c[1]>o.col)||[o.row,o.col];const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x:outside?o.col-3:cell[1],y:cell[0],hp:1e6,maxHp:1e6,atk:0,def:30,magicRes:25,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0,flying};B.enemies.push(e);return e;
}
function settleNext(){for(const p of B.projectiles.slice())if(p.basicAttack&&p.kind!=='operator-pulse')ArkOperatorCombat.impact(p);B.projectiles=B.projectiles.filter(p=>p.kind==='operator-pulse');}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,nextCases:cases,nextSourceSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of nextCases){
  const o=makeNext(c),s=o.skill,p=ArkNextAttackSkillData.profiles[c.id];
  assert.ok(s.combatMechanic?.next,c.id+' actual finalized skill registered');assert.equal(s.spCost,c.sp);assert.equal(s.maxCharge,c.maxCharge);assert.equal(s.spType,c.spType);assert.deepEqual(JSON.parse(JSON.stringify(s.blackboard)),JSON.parse(JSON.stringify(c.bb)));
  assert.equal(ArkOperatorCombat.attack(o),false);assert.equal(o.sp,c.sp,'no enemy preserves charge');
  const expectedCount=c.count==='block'?operatorBlockCount(o):c.count==='all'?(c.groundOnly?6:7):c.count;
  for(let i=0;i<6;i++)nextEnemy(o,100+i);const outside=nextEnemy(o,190,true),air=nextEnemy(o,191,false,true);
  assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(o.sp,0,'enhanced attack spends charge only once');assert.ok(!o.skillState,'one attack does not become a timed buff');
  assert.equal(B.projectiles.filter(p=>p.kind!=='operator-pulse').length,c.delivery==='projectile'?expectedCount:0,c.id+' delivery follows source ability');
  if(p.waitForProjectile){o.sp=c.sp;assert.equal(ArkOperatorCombat.attack(o),false,'source action waits for all its projectiles');assert.equal(o.sp,c.sp);o.sp=0;}
  settleNext();const damaged=B.enemies.filter(e=>e.hp<e.maxHp);assert.equal(damaged.length,expectedCount,c.id+' source target budget');
  const one=c.damageType===2?Math.round(100*c.bb.atk_scale*.75):Math.round(Math.max(5,100*c.bb.atk_scale-30*c.defenseScale));
  for(const e of damaged)assert.equal(e.maxHp-e.hp,one*c.hits,c.id+' independently calculated real damage');
  assert.equal(outside.hp,outside.maxHp,'out-of-range never selected');if(p.groundOnly)assert.equal(air.hp,air.maxHp,'melee source excludes air');
  for(const effect of p.hitBuffs||[]){
   if(effect.kind==='movement-multiplier')for(const e of damaged){assert.ok(Math.abs(ArkOperatorCombat.movementMultiplier(e)-effect.value)<1e-9);assert.equal(ArkOperatorCombat.isSlowed(e),true);}
   if(effect.kind==='defense-multiplier')for(const e of damaged)assert.ok(Math.abs(ArkOperatorCombat.defenseMultiplier(e)-(1+c.bb[effect.valueKey]))<1e-9);
  }
  if(p.hitBuffs?.some(effect=>effect.kind==='delayed-conditional-hit')){
   const before=air.hp,ground=B.enemies[0].hp;o.cd=999;update(.06,.06);assert.equal(air.hp,before,'delayed Buff is not immediate damage');
   o.atk=200;o.attributeBase.atk=200;update(.06,.06);
   assert.equal(before-air.hp,Math.round(200*c.bb[p.hitBuffs[0].scaleKey]*.75),'all levels use source delayed scale and live source ATK');
   assert.equal(B.enemies[0].hp,ground,'ground target fails the source condition');assert.equal(Object.keys(air.replacementBuffTokens).length,0);
   o.atk=100;o.attributeBase.atk=100;
  }
  B.enemies=[];nextEnemy(o,200);o.sp=0;o.cd=0;ArkOperatorCombat.attack(o);settleNext();assert.equal(o.sp,c.spType==='INCREASE_WHEN_ATTACK'?1:0,'ordinary recovery respects source SP type');
  o.sp=0;gainOperatorSp(o,c.spType,c.sp*c.maxCharge+10);assert.equal(o.sp,c.sp*c.maxCharge,'source charge capacity caps recovery');
  for(let charge=c.maxCharge;charge>0;charge--){o.cd=0;ArkOperatorCombat.attack(o);settleNext();assert.equal(o.sp,c.sp*(charge-1),'one enhanced attack consumes one charge');}
  const malformed={...s,blackboard:{...s.blackboard,unknown:1}};assert.throws(()=>ArkOperatorCombat.configure(malformed),/Invalid replacement/);
  const owner=makeNext(c);owner.hp=0;tryKill(owner);assert.ok(!owner.skillState,'no replacement state leaks on death');
 }
 // A two-hit body applies defense per hit and stops after a killing first hit.
 {const c=nextCases.find(c=>c.id==='skchr_etlchi_1'&&c.level===10),o=makeNext(c),e=nextEnemy(o);e.hp=1;e.maxHp=1;
  const hit=hitEnemy;let calls=0;try{hitEnemy=(...args)=>{calls++;return hit(...args);};ArkOperatorCombat.attack(o);settleNext();assert.equal(calls,1);}finally{hitEnemy=hit;}}
  // This source ranged replacement can acquire a flying enemy; ground-only variants cannot.
  {const c=nextCases.find(c=>c.id==='skchr_haini_1'),o=makeNext(c),e=nextEnemy(o,300,false,true);ArkOperatorCombat.attack(o);settleNext();assert.ok(e.hp<e.maxHp);}
  // An AdvancedSelector without a limit is an entire-range body, including air,
  // even though its damage node is MeleeAttack and must never emit a projectile.
  {const c=nextCases.find(c=>c.count==='all'),o=makeNext(c);nextEnemy(o);nextEnemy(o,301,false,true);
   ArkOperatorCombat.attack(o);assert.equal(B.projectiles.length,0);assert.ok(B.enemies.every(e=>e.hp<e.maxHp));}
  // A configured next attack with no eligible replacement targets keeps its charge.
  {const c=nextCases.find(c=>c.groundOnly),o=makeNext(c);o.position='RANGED';nextEnemy(o,302,false,true);
   ArkOperatorCombat.attack(o);settleNext();assert.equal(o.sp,c.sp);assert.ok(!o.skillState);}
  // Buff trigger conditions are evaluated later; replacement refresh cannot
  // leave two queued copies of a maxStackCnt=1 effect on the same target.
  {const c=nextCases.find(c=>ArkNextAttackSkillData.profiles[c.id].hitBuffs?.some(effect=>effect.kind==='delayed-conditional-hit')),o=makeNext(c),e=nextEnemy(o,303,false,true);
   const scale=c.bb[ArkNextAttackSkillData.profiles[c.id].hitBuffs[0].scaleKey];
   ArkOperatorCombat.attack(o);o.cd=999;update(.05,.05);o.sp=c.sp;ArkOperatorCombat.attack(o);o.cd=999;
   const afterTwo=e.hp;update(.06,.06);assert.equal(e.hp,afterTwo,'replaced timer cannot fire');update(.05,.05);
   assert.equal(afterTwo-e.hp,Math.round(100*scale*.75),'only current single-stack timer fires');
   o.sp=c.sp;ArkOperatorCombat.attack(o);o.cd=999;const beforeGround=e.hp;e.flying=false;update(.14,.14);assert.equal(e.hp,beforeGround,'condition uses current motion');
   o.sp=c.sp;ArkOperatorCombat.attack(o);o.cd=999;const beforeFlight=e.hp;e.flying=true;update(.14,.14);assert.equal(beforeFlight-e.hp,Math.round(100*scale*.75));
   o.sp=c.sp;ArkOperatorCombat.attack(o);o.cd=999;e.dead=true;const beforeDeath=e.hp;update(.14,.14);assert.equal(e.hp,beforeDeath,'dead target cannot receive delayed damage');
  }
  // The engine consumes the shared slow query for movement and abnormal-state
  // damage bonuses. A stronger legacy slow remains effective alongside it.
  {const c=nextCases.find(c=>ArkNextAttackSkillData.profiles[c.id].hitBuffs?.some(effect=>effect.kind==='movement-multiplier')),o=makeNext(c),e=nextEnemy(o,304,false,true);
   const routes=BDATA.level.routes;BDATA.level.routes=[{segs:[[{c:30,r:3}]]}];
   try{e.x=4;e.y=3;e.moveSpeed=1;ArkOperatorCombat.attack(o);settleNext();o.cd=999;
    const from=e.x;update(.25,.25);assert.ok(Math.abs(e.x-from-.05)<1e-8,'source slow changes real walking distance');
    o.garrisonStats={abDamage:2};assert.equal(calcDamageResult(o,e,1,{raw:100,type:'arts'}).amount,150,'slow enables actual abnormal damage bonus');
    e.slowUntil=B.time+1;e.slowFactor=.1;const strong=e.x;update(.25,.25);assert.ok(Math.abs(e.x-strong-.025)<1e-8,'existing stronger slow retained');
    e.slowUntil=0;B.time=Math.max(...Object.values(e.operatorMoveSpeedDebuffs).map(d=>d.until))+.01;
    const normal=e.x;update(.25,.25);assert.ok(Math.abs(e.x-normal-.25)<1e-8,'expired Buff restores walking');
    assert.equal(ArkOperatorCombat.isSlowed(e),false);assert.equal(calcDamageResult(o,e,1,{raw:100,type:'arts'}).amount,75);
   }finally{BDATA.level.routes=routes;}
  }
  // Ranged ActionController attaches its DEF Buff before running damage. Two
  // casters keep independent expiry but one buff family never multiplies itself.
  {const c=nextCases.find(c=>c.level===10&&ArkNextAttackSkillData.profiles[c.id].hitBuffs?.some(effect=>effect.kind==='defense-multiplier')),o=makeNext(c),e=nextEnemy(o,305);
   const effect=ArkNextAttackSkillData.profiles[c.id].hitBuffs[0];ArkOperatorCombat.attack(o);settleNext();o.cd=999;
   assert.equal(e.maxHp-e.hp,Math.round(100*c.bb.atk_scale-30*(1+c.bb.def)),'first hit includes its own native-before-body DEF debuff');
   const other={...o,id:2,buffs:[],skill:{...o.skill,blackboard:{...o.skill.blackboard,def:-.2}},sp:c.sp};B.operators.push(other);B.time=1;
   ArkOperatorCombat.attack(other);settleNext();other.cd=999;
   assert.equal(Object.keys(e.operatorDefMultipliers).length,2);assert.ok(Math.abs(ArkOperatorCombat.defenseMultiplier(e)-(1+c.bb.def))<1e-9);
   B.time=c.bb.duration+.01;assert.ok(Math.abs(ArkOperatorCombat.defenseMultiplier(e)-.8)<1e-9,'weaker surviving caster reappears after strong expiry');
   B.time=1+c.bb.duration+.01;assert.equal(ArkOperatorCombat.defenseMultiplier(e),1);
  }
  window.nextFixedCount=0;
  for(const sid of ['act1autochess','act2autochess']){
   setupSeasonId=sid;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
   for(const c of nextCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
    G.skillChoices[c.cid]=c.index;const entry=ROSTER[c.cid],r=finalizeOperator(entry,null,[],elite),expected=nextSourceSkills[c.id].levels[(elite?7:4)-1];
    assert.equal(r.skill.sourceId,c.id);assert.equal(r.skill.spCost,expected.spData.spCost);
    assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(expected.blackboard.map(b=>[b.key,b.value])));
    const o=makeNext(c);o.skill=r.skill;o.sp=r.skill.spCost;nextEnemy(o);ArkOperatorCombat.attack(o);settleNext();assert.equal(o.sp,0);assert.ok(B.enemies[0].hp<B.enemies[0].maxHp);window.nextFixedCount++;
   }
  }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1515,name:'普攻强化批次'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var caster=makeNext(${JSON.stringify(c)});caster.playerId='one';for(let i=0;i<6;i++)nextEnemy(caster,100+i);
    if(ArkNextAttackSkillData.profiles[caster.skill.sourceId].hitBuffs?.some(effect=>effect.kind==='delayed-conditional-hit'))nextEnemy(caster,106,false,true);
    B.operators.push({...caster,id:2,col:5,playerId:'two',hp:5000,buffs:[],sp:0,skill:null,skillState:null,cd:999});`);
   const before=runtime.snapshot();runtime.__testMachine.run('ArkOperatorCombat.attack(caster);caster.cd=999;');const shot=runtime.snapshot();runtime.advance(.6);const expected=runtime.snapshot();
   runtime.restore(shot);runtime.advance(.6);assert.deepEqual(runtime.snapshot().battle,expected.battle,id+' in-flight restore');
   runtime.restore(before);runtime.__testMachine.run('caster=B.operators[0];ArkOperatorCombat.attack(caster);caster.cd=999;');runtime.advance(.6);
   assert.deepEqual(runtime.snapshot().battle,expected.battle,id+' charged attack restore');assert.equal(runtime.snapshot().battle.operators[1].hp,5000);
  }
 }finally{runtime.dispose();}
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/next-attack-skill-receipts.json',JSON.stringify({scope:'source replacement body, charge/target/delivery and closed delayed conditional hit; native action timing, retarget and refund boundaries remain',receipts:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level}))},null,2));
 console.log('NEXT ATTACK SKILLS OK '+cases.length+' level executions, '+f.run('nextFixedCount')+' actual season variants; '+ids.length+' structural source bodies, target caps, direct/projectile damage, multi-charge recovery and '+(ids.length*2)+' host replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
