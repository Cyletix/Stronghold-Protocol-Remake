'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const data=JSON.parse(fs.readFileSync('web/next_attack_skill_data.js','utf8').split('window.ArkNextAttackSkillData=')[1].trim().replace(/;$/,''));
const ids=Object.keys(data.profiles).filter(id=>data.profiles[id].spellExtras);assert.equal(ids.length,1);
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const cases=ids.flatMap(id=>{const cid=data.profiles[id].charIds[0],index=chars[cid].skills.findIndex(s=>s.skillId===id);
 return skills[id].levels.map((lv,i)=>({cid,index,id,level:i+1,bb:Object.fromEntries(lv.blackboard.map(b=>[b.key,b.value])),sp:lv.spData.spCost,maxCharge:lv.spData.maxChargeTime}));});
const helper=fs.readFileSync(require.resolve('./_next_attack_skills_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
const extra=`
function extraAlly(o,id=2,changes={}){const cell=rangeCellsFor({...o,rangeGrids:o.skill.rangeGrids}).find(c=>c[0]!==o.row||c[1]!==o.col);
 const a={...o,id,charId:'char_002_amiya',row:cell[0],col:cell[1],skill:null,skillState:null,sp:0,cd:999,hp:1000,...changes};B.operators.push(a);return a;}
`;
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');Object.assign(f.ctx,{assert,cases,skills});
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}${extra}
 const rows=[];
 for(const c of cases){const o=makeNext(c),a=extraAlly(o),b=extraAlly(o,3,{hp:3000}),outside=extraAlly(o,4,{hp:100,col:20}),free=extraAlly(o,5,{hp:100,basicAttack:{noDirectHeal:true}});
  o.sp=c.sp*c.maxCharge;assert.equal(ArkOperatorCombat.attack(o),false);assert.equal(o.sp,c.sp*c.maxCharge);assert.equal(a.hp,1000,'wounded ally alone cannot trigger the main attack');
  const e=nextEnemy(o);assert.equal(ArkOperatorCombat.attack(o),true);
  assert.equal(e.maxHp-e.hp,Math.round(100*c.bb.atk_scale-30));assert.equal(a.hp,1000+100*c.bb.heal_scale);
  assert.equal(b.hp,3000);assert.equal(outside.hp,100);assert.equal(free.hp,100);assert.equal(o.sp,c.sp*(c.maxCharge-1));assert.ok(!o.skillState);
  o.sp=0;o.cd=0;const hp=a.hp;ArkOperatorCombat.attack(o);assert.equal(a.hp,hp,'ordinary uncharged attack has no lingering listener');
  o.sp=c.sp;o.cd=0;a.hp=a.maxHp;b.hp=b.maxHp;assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(o.sp,0,'full-health extra selector cannot cancel main damage');
  o.sp=c.sp;o.cd=0;o.hp=100;ArkOperatorCombat.attack(o);assert.equal(o.hp,100+100*c.bb.heal_scale,'extra includes owner');
  rows.push({skillId:c.id,level:c.level});
 }
 // One emission, not per target or per damage roll; critical attack multiplier does not leak into healing.
 {const c=cases[6],o=makeNext(c),a=extraAlly(o);nextEnemy(o);o.attackCrit={probability:1,scale:4};
  ArkOperatorCombat.attack(o);assert.equal(a.hp,1000+100*c.bb.heal_scale);assert.equal(o.sp,0);}
 // Natural engine dispatch, source death, and fresh redeployment do not replay the listener.
 {const c=cases[6],o=makeNext(c),a=extraAlly(o);nextEnemy(o);o.skill.spType='INCREASE_WHEN_ATTACK';update(.01,.01);
  assert.equal(a.hp,1000+100*c.bb.heal_scale);assert.equal(o.sp,0);o.cd=999;const hp=a.hp;update(.1,.1);assert.equal(a.hp,hp);
  o.hp=0;tryKill(o);update(.1,.1);assert.equal(a.hp,hp);o.dead=false;o.hp=o.maxHp;o.deployed=true;o.deployT=2;o.cd=999;update(.1,.1);assert.equal(a.hp,hp);}
 return rows;})()`);
 const seasonReceipts=f.run(`(()=>{const rows=[];for(const season of ['act1autochess','act2autochess']){
  setupSeasonId=season;setupStageKey=null;BOND_BANS=[];localRunSetup=null;curMatch='solo';curDiff='extreme';chooseBand('band_amiya');startBattleRound();
  const c=cases[6];if(!ROSTER[c.cid])continue;for(const elite of [false,true]){G.skillChoices[c.cid]=c.index;const r=finalizeOperator(ROSTER[c.cid],null,[],elite),level=elite?7:4;
   assert.equal(r.skill.sourceId,c.id);assert.ok(r.skill.combatMechanic?.next);assert.ok(!r.skill.combatMechanic.replacementHeal);assert.deepEqual(r.skill.effects,[]);
   assert.deepEqual(JSON.parse(JSON.stringify(r.skill.blackboard)),Object.fromEntries(skills[c.id].levels[level-1].blackboard.map(b=>[b.key,b.value])));rows.push({season,elite,level});}
 }return rows;})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:31851,name:'主动作附加治疗'}),hostRestores=[];
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper+extra);
  for(const phase of ['charged','emitted','dead']){rt.__testMachine.run(`var o=makeNext(${JSON.stringify(cases[6])});o.playerId='one';var a=extraAlly(o);a.playerId='two';nextEnemy(o);${phase!=='charged'?'ArkOperatorCombat.attack(o);o.cd=999;':''}${phase==='dead'?'o.hp=0;tryKill(o);':''}`);
   const checkpoint=rt.snapshot();rt.advance(.5);const expected=rt.snapshot();rt.restore(checkpoint);rt.advance(.5);const actual=rt.snapshot();
   assert.deepEqual(actual.battle,expected.battle,phase+' full battle replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({phase});}
 }finally{rt.dispose();}
 fs.writeFileSync('.runtime/next-attack-compound-receipts.json',JSON.stringify({receipts,seasonReceipts,hostRestores,scope:'Complete replacement main actor + once-spell selector heal; native event phase and whole talent/module composition remain outside.'},null,2));
 console.log('COMPOUND NEXT ATTACK OK '+receipts.length+' levels; '+seasonReceipts.length+' season variants; '+hostRestores.length+' host restores; charge, once-spell heal, selectors, natural engine and no replay');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
