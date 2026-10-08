'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const levels=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json').skchr_svrash_3.levels;
const helpers=`
 function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-7,msg+': '+a+' != '+b);}
 function defenseEntry(){assert.ok(ROSTER.char_172_svrash);return {...ROSTER.char_172_svrash,debugLibrary:true,module:null};}
 function makeDefense(level=7){
  Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],damageFeedback:[],summoneds:[],operators:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
  const charId='char_172_svrash';G.skillChoices[charId]=2;ACCOUNT.ops[charId]={evolve:2,level:1,skillLevel:level,potential:1,selectedSkill:2,trust:0};
  const entry=defenseEntry(),r=finalizeOperator(entry,null,[],false);
  const o={...r,id:1,charId,name:entry.name,profession:entry.profession,position:entry.position,dir:'right',row:3,col:3,rangeGrids:entryRangeGrids(entry,false),range:3,
   hp:10000,maxHp:10000,atk:120,def:390,magicRes:20,attributeBase:{atk:100,def:300,aspd:1},attackTime:2,
   combatTalents:[],events:[],attackCrit:null,garrisonAdd:null,cd:999,buffs:[{def:1.25,until:999}],sp:0,deployAt:0,deployed:true,deployT:2};
  o.cells=rangeCellsFor(o);B.operators=[o];return o;
 }
`;
(async()=>{
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;f.ctx.defenseLevels=levels;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helpers}
 for(let level=1;level<=defenseLevels.length;level++){
  const o=makeDefense(level),raw=Object.fromEntries(defenseLevels[level-1].blackboard.map(x=>[x.key,x.value]));
  assert.equal(o.skill.sourceId,'skchr_svrash_3');assert.equal(o.skill.blackboard.def,raw.def);near(operatorDefense(o),465);
  ArkElements.add(o,'erosion',1000);assert.equal(o.elementDefLoss,-100,'real elemental burst applies persistent flat loss');near(operatorDefense(o),365);
  const hp=o.hp;o.sp=o.skill.spCost;assert.equal(castSkill(o),true);near(operatorDefense(o),365*(1+raw.def));
  const amount=enemyDamageToOperator({atk:500,atkType:'phys'},o);assert.equal(amount,Math.round(500-365*(1+raw.def)));
  inflictDamage(o,amount,false,'phys');assert.equal(o.hp,hp-amount,'real HP consumer uses post-flat final defense');
  assert.equal(enemyDamageToOperator({atk:500,atkType:'arts'},o),400,'defense does not alter arts');
  near(buildOperatorDetailModel(defenseEntry(),o,true).def,operatorDefense(o),'detail shares actual defense');
  updateOperatorBaseStats(o,{...o,def:500,attributeBase:{...o.attributeBase,def:400}});near(operatorDefense(o),500*(1+raw.def),'base rebuild retains final order');
  endOperatorSkill(o);near(operatorDefense(o),500,'expiry retains independent buff and persistent erosion');
  o.buffs.push({def:0,until:10});o.flow={def:200};near(operatorDefense(o),0,'zero final factor covers flat additions without division');B.time=10;near(operatorDefense(o),700,'expired factor does not suppress retained additions');
 }
 // Selection uses the same real attribute, including flat loss and the current final factor.
 const o=makeDefense();o.row=14;o.col=7;o.buffs=[];o.def=1000;o.attributeBase.def=1000;ArkElements.add(o,'erosion',1000);o.sp=o.skill.spCost;castSkill(o);
 const other=(id,def)=>({...o,id,charId:'test',def,attributeBase:{atk:100,def,aspd:1},buffs:[],skillState:null,skill:null,elementDefLoss:0,epBurst:null,cd:999});
 B.operators=[o,other(2,285),other(3,250)];
 const base=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_h07_04'].enemies.enemy_1521_dslily;
 const boss={...base,x:10,y:15,hp:base.maxHp,cd:0,dead:false,route:0,seg:0,cp:0,wait:0};setupEnemy(boss,base);B.enemies=[boss];update(0,0);assert.deepEqual(boss.atkTargets.map(a=>a.id),[2,1],'source boss ranks 285 above 270 after flat loss');
 B.enemies=[];const linker={...other(10,100),charId:'char_245_cello',col:6,row:14,cells:[[14,7]],skill:{sourceId:'skchr_cello_3',blackboard:{'cello_s_3[max_hp].max_hp':0,'cello_s_3[atk].atk':0,'cello_s_3[def].def':.5}},skillState:{until:100},buffs:[]};B.operators.push(linker);
 ArkElementOperators.cast(linker);assert.ok(B.operators[1].buffs.some(b=>b.elementOwner===10&&b.def===1.5),'defense link ranks the same 285 target');
 endOperatorSkill(o);ArkElementOperators.cast(linker);assert.ok(o.buffs.some(b=>b.elementOwner===10&&b.def===1.5),'link returns to source after final factor ends');
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const r=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:6124});
 try{
  r.startBattle();r.__testMachine.context.assert=assert;r.__testMachine.run(helpers);
  r.__testMachine.run(`var o=makeDefense();o.playerId='one';ArkElements.add(o,'erosion',1000);o.sp=o.skill.spCost;castSkill(o);B.operators.push({...o,id:2,playerId:'two',charId:'test',skill:null,skillState:null,buffs:[],elementDefLoss:0,epBurst:null,col:4});`);
  const saved=r.snapshot();r.advance(.25);const expected=r.snapshot();const expectedDef=r.__testMachine.run('operatorDefense(B.operators[0])');
  r.restore(saved);r.advance(.25);assert.deepEqual(r.snapshot().battle,expected.battle);assert.deepEqual(r.snapshot().rng,expected.rng);assert.equal(r.__testMachine.run('operatorDefense(B.operators[0])'),expectedDef);
 }finally{r.dispose();}
 console.log('FINAL DEFENSE OK: 10 SilverAsh source levels, actual erosion/HP, additions/zero/expiry, boss/link/detail and signed two-owner restore');
})().catch(e=>{console.error(e);process.exitCode=1;});
