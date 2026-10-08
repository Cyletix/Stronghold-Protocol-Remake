'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const context={window:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../web/next_attack_skill_data.js'),'utf8'),context);
const profiles=Object.fromEntries(Object.entries(context.window.ArkNextAttackSkillData.profiles).filter(([,p])=>p.kind==='next-heal'));
const cases=Object.entries(chars).flatMap(([cid,char])=>char.skills.flatMap((s,index)=>profiles[s.skillId]?.charIds.includes(cid)?skills[s.skillId].levels.map((lv,i)=>({
 cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),sp:lv.spData.spCost,spType:lv.spData.spType,maxCharge:lv.spData.maxChargeTime})):[]));
const helper=`
function makeHeal(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',
  range:3,rangeGrids:entryRangeGrids(entry,false),basicAttack:{...r.basicAttack,traits:[]},hp:10000,maxHp:10000,atk:100,def:200,
  attackTime:2,attributeBase:{atk:100,def:200,aspd:1},cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function healAlly(o,id=100,ratio=.1,outside=false){
 const cells=o.skill.rangeGrids?rangeCellsFor({...o,rangeGrids:o.skill.rangeGrids}):o.cells,cell=cells.find(c=>c[1]>o.col)||cells.find(c=>c[0]!==o.row)||[o.row,o.col];
 const t={id,charId:'fixture-heal-recipient',profession:'GUARD',position:'MELEE',row:outside?20:cell[0],col:outside?20:cell[1],hp:10000*ratio,maxHp:10000,atk:0,def:100,attackTime:2,cd:999,buffs:[],sp:0,events:[],combatTalents:[],deployed:true,deployAt:0,deployT:2,range:0,rangeGrids:[{row:0,col:0}],basicAttack:{action:'attack'}};
 t.cells=rangeCellsFor(t);B.operators.push(t);return t;
}
function landHeal(){for(const p of B.projectiles.slice())if(p.plan?.replacementHeal)ArkOperatorCombat.impact(p);B.projectiles=B.projectiles.filter(p=>!p.plan?.replacementHeal);}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,healCases:cases,sourceHealSkills:skills});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of healCases){
  const o=makeHeal(c),p=ArkNextAttackSkillData.profiles[c.id],s=o.skill;
  assert.ok(s.combatMechanic.replacementHeal);assert.equal(s.medicMechanic,undefined,'one consumer owns replacement charges');
  assert.equal(s.spCost,c.sp);assert.equal(s.maxCharge,c.maxCharge);assert.equal(s.spType,c.spType);
  assert.deepEqual(JSON.parse(JSON.stringify(s.blackboard)),JSON.parse(JSON.stringify(c.bb)));
  assert.equal(castSkill(o),false,'replacement healing cannot be manually spent without its action request');
  assert.equal(ArkOperatorCombat.replacementHealingAction(o),null);assert.equal(o.sp,c.sp,'no wounded ally preserves charge');
  const allies=Array.from({length:5},(_,i)=>healAlly(o,100+i,.1+i*.03)),outside=healAlly(o,190,.01,true),full=healAlly(o,191,1);
  const blocked=healAlly(o,192,.001);blocked.basicAttack.noDirectHeal=true;
  const dead=healAlly(o,193,.001);dead.dead=true;
  assert.equal(castSkill(o),false,'even with wounded allies a manual cast cannot consume a replacement charge');
  assert.equal(operatorAction(o),'heal','charged guardian and medic enter common healing action');
  assert.equal(performHealingAction(o),true);assert.equal(o.sp,0);assert.ok(!o.skillState);
  const count=p.targetKey?c.bb[p.targetKey]:p.targetCount;
  assert.equal(B.projectiles.length,p.delivery==='projectile'?count:0,'source delivery and target budget');
  if(p.delivery==='projectile')assert.ok(allies.every((t,i)=>t.hp===10000*(.1+i*.03)),'ranged heal waits for real impact');
  landHeal();for(let i=0;i<allies.length;i++)assert.ok(Math.abs(allies[i].hp-(10000*(.1+i*.03)+(i<count?100*c.bb.heal_scale:0)))<1e-7,c.id+' independent source heal amount');
  assert.equal(outside.hp,100);assert.equal(full.hp,10000);assert.equal(blocked.hp,10);assert.equal(dead.hp,10);
  assert.equal(o.sp,0,'replacement heal does not refill own charge');
  gainOperatorSp(o,c.spType,c.sp*c.maxCharge+10);assert.equal(o.sp,c.sp*c.maxCharge);
  for(let charge=c.maxCharge;charge>0;charge--){o.cd=0;performHealingAction(o);landHeal();assert.equal(o.sp,c.sp*(charge-1));}
  const invalid={...s,blackboard:{...s.blackboard,unknown_healing:1}};assert.throws(()=>ArkOperatorCombat.configure(invalid),/Invalid replacement/);
 }
 // The source max-HP selector explicitly includes equality. Only qualifying
 // allies trigger the guardian; otherwise its ordinary attack remains available.
 {const c=healCases.find(c=>ArkNextAttackSkillData.profiles[c.id].hpThreshold!=null),o=makeHeal(c),t=healAlly(o,201,.50001);
  assert.equal(operatorAction(o),'attack');assert.equal(ArkOperatorCombat.replacementHealingAction(o),null);assert.equal(o.sp,c.sp);
  t.hp=5000;assert.equal(operatorAction(o),'heal');update(0,0);assert.equal(t.hp,5000+100*c.bb.heal_scale,'real engine guardian replacement respects inclusive source threshold');
  o.sp=0;o.cd=0;assert.equal(operatorAction(o),'attack');
 }
 // SP-empty medics still perform ordinary healing; charge readiness does not
 // disable their base action or accidentally consume a second body.
 {const c=healCases.find(c=>c.id==='skchr_rosesa_1'),o=makeHeal(c),t=healAlly(o);o.sp=0;
  assert.equal(operatorAction(o),'heal');performHealingAction(o);assert.equal(t.hp,1100);assert.equal(o.sp,0);}
 // A source ranged heal travels to a friendly unit and lands through the real
 // engine loop. Removed/redeployed targets cannot receive an old projectile.
 {const c=healCases.find(c=>c.id==='skchr_reckpr_1'),o=makeHeal(c),t=healAlly(o);performHealingAction(o);o.cd=999;
  const before=t.hp;update(.5,.5);assert.equal(t.hp,before+100*c.bb.heal_scale);assert.equal(B.projectiles.length,0);
  o.sp=c.sp;o.cd=0;performHealingAction(o);o.cd=999;t.medicLifeEpoch=1;const hp=t.hp;update(.5,.5);assert.equal(t.hp,hp);
  o.sp=c.sp;o.cd=0;performHealingAction(o);o.cd=999;t.removed=true;update(.5,.5);assert.equal(t.hp,hp);
 }
 window.healSeasonCount=0;
 for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  for(const c of healCases.filter(c=>c.level===7&&ROSTER[c.cid]))for(const elite of [false,true]){
   G.skillChoices[c.cid]=c.index;const entry=ROSTER[c.cid],r=finalizeOperator(entry,null,[],elite),lv=sourceHealSkills[c.id].levels[(elite?7:4)-1];
   assert.ok(r.skill.combatMechanic.replacementHeal);assert.equal(r.skill.medicMechanic,undefined);assert.equal(r.skill.spCost,lv.spData.spCost);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])));window.healSeasonCount++;
  }
 }
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1919,name:'治疗模板批次'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helper);
  for(const sid of Object.keys(profiles)){
   const c=cases.find(c=>c.id===sid&&c.level===7);runtime.__testMachine.run(`var healer=makeHeal(${JSON.stringify(c)});healer.playerId='one';for(let i=0;i<4;i++){var t=healAlly(healer,100+i,.1+i*.05);t.playerId='two';}`);
   const before=runtime.snapshot();runtime.__testMachine.run('performHealingAction(healer);healer.cd=999;');const flight=runtime.snapshot();runtime.advance(.8);const expected=runtime.snapshot();
   runtime.restore(flight);runtime.advance(.8);assert.deepEqual(runtime.snapshot().battle,expected.battle,sid+' friendly heal flight restore');
   runtime.restore(before);runtime.__testMachine.run('healer=B.operators[0];performHealingAction(healer);healer.cd=999;');runtime.advance(.8);assert.deepEqual(runtime.snapshot().battle,expected.battle,sid+' charged healing restore');
  }
 }finally{runtime.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/next-heal-skill-receipts.json'),JSON.stringify({scope:'complete source single-body healing graph; native Heal-to-node bridge and event timing retain documented model boundaries',receipts:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level}))},null,2));
 console.log('NEXT HEAL SKILLS OK '+cases.length+' source-level executions, '+f.run('healSeasonCount')+' actual season variants, '+Object.keys(profiles).length*2+' host replays; thresholds, charges, delivery and healing restrictions');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
