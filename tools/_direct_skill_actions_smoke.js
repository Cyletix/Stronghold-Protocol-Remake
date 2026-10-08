'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const combatState=b=>{const x=structuredClone(b);delete x.particles;return x;};
const sourceGraphs=require('../work/client-logic/program-compilation.json').rejections;
const dataContext={window:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../web/direct_skill_data.js'),'utf8'),dataContext);
const profiles=dataContext.window.ArkDirectSkillData.profiles;
const cases=Object.entries(profiles).filter(([,p])=>!p.castSchedule).flatMap(([id,p])=>p.charIds.flatMap(cid=>skills[id].levels.map((lv,i)=>{
 const rows=sourceGraphs[id].components,attack=rows.find(r=>['MeleeAttack','Heal'].some(t=>r.type==='Torappu.Battle.Abilities.'+t)),a=attack.fields;
 const selector=rows.find(r=>r.node_id===a._selector.m_PathID),t=selector.fields,bb=Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value]));
 return {cid,index:chars[cid].skills.findIndex(s=>s.skillId===id),id,level:i+1,bb,sp:lv.spData.spCost,maxCharge:lv.spData.maxChargeTime,heal:attack.type.endsWith('.Heal'),
  damageType:a._damageType,groundOnly:t._targetMotion===1,count:t._limitTargetNum?(bb[t._maxTargetKey]??t._maxNum):selector.type==='Torappu.Battle.AdvancedSelector'?'all':1};
})));
const helper=`
function makeDirect(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',range:3,rangeGrids:entryRangeGrids(entry,false),
  hp:10000,maxHp:10000,atk:100,def:200,attackTime:2,attributeBase:{atk:100,def:200,aspd:1},cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function directEnemy(o,id=100,outside=false,flying=false){
 const cell=o.cells.find(c=>c[1]>o.col)||[o.row,o.col];const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x:outside?o.col-3:cell[1],y:cell[0],hp:1e6,maxHp:1e6,atk:0,def:30,magicRes:25,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0,flying};B.enemies.push(e);return e;
}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,directCases:cases,directSourceSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of directCases){
  const o=makeDirect(c),s=o.skill,p=ArkDirectSkillData.profiles[c.id];B.dp=0;B.dpMax=99;
  assert.ok(s.directSkill,c.id+' registered after actual finalize');assert.equal(s.spCost,c.sp);assert.equal(s.maxCharge,c.maxCharge);
  assert.ok(!s.combatMechanic&&!s.medicMechanic,'old body removed to prevent double execution');assert.equal(s.effects.length,0);
  if(p.requiresTarget){assert.equal(castSkill(o),false,'no eligible target preserves SP');assert.equal(o.sp,c.sp);}
  if(c.heal){
   o.hp=5000;const inside={...o,id:2,col:o.col+1,hp:6000,skill:null,buffs:[],cd:999},out={...o,id:3,col:o.col-5,hp:6000,skill:null,buffs:[],cd:999};B.operators.push(inside,out);
   assert.equal(castSkill(o),true);assert.equal(o.hp,5000+100*c.bb.heal_scale);assert.equal(inside.hp,6000+100*c.bb.heal_scale);assert.equal(out.hp,6000);
  }else{
   for(let i=0;i<6;i++)directEnemy(o,100+i);const outside=directEnemy(o,190,true),air=directEnemy(o,191,false,true);
   assert.equal(castSkill(o),true);const damaged=B.enemies.filter(e=>e.hp<e.maxHp),count=c.count==='all'?(c.groundOnly?6:7):c.count;
   assert.equal(damaged.length,count,c.id+' source target budget');
   const raw=100*c.bb.atk_scale,amount=c.damageType===2?Math.round(raw*.75):Math.round(Math.max(raw*.05,raw-Math.max(0,30-(c.bb.def_penetrate_fixed||0))));
   for(const e of damaged)assert.equal(e.maxHp-e.hp,amount,c.id+' source damage without basic-action hooks');
   assert.equal(outside.hp,outside.maxHp);if(c.groundOnly)assert.equal(air.hp,air.maxHp);
   if(p.onHit.length){
    const e=damaged[0];assert.equal(e.operatorMoveSpeedDebuffs.sluggish.until,c.bb.sluggish);assert.ok(!(e.stunUntil>0),'first hit slow only');
    o.sp=c.sp;castSkill(o);assert.equal(e.stunUntil,c.bb.stun,'second hit reads existing slow before adding stun');
   }
  }
  assert.equal(o.sp,0,'one charge consumed, no basic-attack SP');assert.ok(!o.skillState,'direct source never leaves persistent active skill');
  assert.equal(B.dp,(c.bb.cost||0)*(p.onHit.length?2:1),'cost action exactly once per cast');
  assert.throws(()=>ArkDirectSkills.configure({...s,blackboard:{...c.bb,unconsumed:1}},c.cid),/Invalid direct skill/);
  ArkDirectSkills.death(o);assert.ok(!o.directSkillShots);
 }
 // Exact source Buff identity: unrelated slow cannot satisfy CheckContainsBuff(sluggish).
 {const c=directCases.find(c=>c.id==='skchr_vulpis_2'&&c.level===7),o=makeDirect(c),e=directEnemy(o);e.slowUntil=100;e.slowFactor=.2;
  ArkOperatorCombat.applySourceBuff(o,e,{kind:'slow',key:'other-slow',duration:100,value:.5});
  assert.equal(ArkOperatorCombat.sourceBuffActive(e,'sluggish'),false);castSkill(o);assert.ok(!(e.stunUntil>0));
  assert.ok(ArkOperatorCombat.sourceBuffActive(e,'sluggish'));B.time=c.bb.sluggish+.01;assert.equal(ArkOperatorCombat.sourceBuffActive(e,'sluggish'),false);
  o.sp=c.sp;castSkill(o);assert.ok(!(e.stunUntil>B.time),'expired exact Buff does not leave condition true');
  o.sp=c.sp;e.stunImmune=true;castSkill(o);assert.ok(!(e.stunUntil>B.time),'stun immunity remains');
 }
 // A source-loaded sluggish from the shared replacement provider is the same Buff key.
 {const c=directCases.find(c=>c.id==='skchr_vulpis_2'&&c.level===7),o=makeDirect(c),e=directEnemy(o),effect=ArkNextAttackSkillData.profiles.skchr_mm_1.hitBuffs.find(x=>x.kind==='movement-multiplier');
  ArkOperatorCombat.applySourceBuff({...o,id:2},e,effect,{[effect.durationKey]:2});assert.ok(ArkOperatorCombat.sourceBuffActive(e,'sluggish'));
  castSkill(o);assert.equal(e.stunUntil,c.bb.stun,'shared source sluggish enables the source conditional branch');
 }
 // Dynamic no-direct-heal gate remains effective even for a self-targeted direct heal.
 {const c=directCases.find(c=>c.heal),o=makeDirect(c);o.hp=5000;const old=ArkClientPrograms.noDirectHeal;try{ArkClientPrograms.noDirectHeal=()=>true;assert.equal(castSkill(o),false);assert.equal(o.hp,5000);assert.equal(o.sp,c.sp);}finally{ArkClientPrograms.noDirectHeal=old;}}

 window.directFixedCount=0;
 for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of directCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
   G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),expected=directSourceSkills[c.id].levels[(elite?7:4)-1];
   assert.equal(r.skill.sourceId,c.id);assert.equal(r.skill.spCost,expected.spData.spCost);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(expected.blackboard.map(b=>[b.key,b.value])));
   const o=makeDirect(c);o.skill=r.skill;o.sp=r.skill.spCost;if(c.heal)o.hp=5000;else directEnemy(o);assert.equal(castSkill(o),true);assert.equal(o.sp,0);window.directFixedCount++;
  }
 }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:41315,name:'直接施放公共批次'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const id of Object.keys(profiles).filter(id=>!profiles[id].castSchedule)){const c=cases.find(c=>c.id===id&&c.level===7);
   runtime.__testMachine.run(`var caster=makeDirect(${JSON.stringify(c)});caster.playerId='one';caster.cd=999;B.dp=0;B.dpMax=99;
    if(${c.heal})caster.hp=5000;else for(let i=0;i<6;i++)directEnemy(caster,100+i);
    if(caster.skill.sourceId==='skchr_vulpis_2'){const effect=ArkNextAttackSkillData.profiles.skchr_mm_1.hitBuffs.find(x=>x.kind==='movement-multiplier');ArkOperatorCombat.applySourceBuff(caster,B.enemies[0],effect,{[effect.durationKey]:2});}
    B.operators.push({...caster,id:2,col:caster.col-5,playerId:'two',hp:5000,buffs:[],sp:0,skill:null,skillState:null,cd:999});`);
   const before=runtime.snapshot();runtime.__testMachine.run('castSkill(caster);');const shot=runtime.snapshot();runtime.advance(.1);const expected=runtime.snapshot();
   runtime.restore(shot);runtime.advance(.1);assert.deepEqual(combatState(runtime.snapshot().battle),combatState(expected.battle),id+' post-cast status restore');
   runtime.restore(before);runtime.__testMachine.run('caster=B.operators[0];castSkill(caster);');runtime.advance(.1);
   assert.deepEqual(combatState(runtime.snapshot().battle),combatState(expected.battle),id+' pre-cast deterministic replay');assert.equal(runtime.snapshot().battle.operators[1].hp,5000);
  }
 }finally{runtime.dispose();}
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/direct-skill-actions-receipts.json',JSON.stringify({sourceLevels:cases.length,actualSeasonVariants:f.run('directFixedCount'),hostReplays:Object.values(profiles).filter(p=>!p.castSchedule).length*2,boundary:dataContext.window.ArkDirectSkillData.boundary,receipts:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level}))},null,2));
 console.log('DIRECT SKILL ACTIONS OK',cases.length,'source levels/identities; damage/targets/penetration/healing/DP/conditional status/no duplicate/charge gates');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
