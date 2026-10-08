'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
const f=require('./_browser_fixture')(),source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const pairs=[['char_499_kaitou',0,'skchr_kaitou_1'],['char_499_kaitou',1,'skchr_kaitou_2'],['char_4081_warmy',0,'skchr_warmy_1'],['char_4102_threye',0,'skchr_threye_1'],['char_4102_threye',1,'skchr_threye_2']];
const cases=pairs.flatMap(([charId,index,id])=>source[id].levels.map((s,i)=>({charId,index,id,level:i+1,bb:Object.fromEntries(s.blackboard.map(b=>[b.key,b.value])),spCost:s.spData.spCost,initSp:s.spData.initSp,duration:s.duration,charges:Math.max(1,s.spData.maxChargeTime||1)})));
Object.assign(f.ctx,{assert,elementCases:cases});
const helpers=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function sourceOp(cid,index=0,level=10){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],damageFeedback:[],summoneds:[],operators:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[cid]=index;ACCOUNT.ops[cid]={evolve:2,level:1,skillLevel:level,potential:1,selectedSkill:index,trust:0};
 const entry=debugTacticalEntry(cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:cid,name:entry.name,position:entry.position,profession:entry.profession,dir:'right',row:3,col:0,cells:[[3,0],[3,1],[3,2]],range:3,
  // Independent ATK100 damage oracle. Source talents, training and skill stay live.
  atk:100,attributeBase:undefined,hp:10000,maxHp:10000,def:0,magicRes:0,attackTime:2,cd:999,blockCnt:0,buffs:[],events:[],sp:0,deployAt:0,deployed:true,deployT:2};
 B.operators=[o];return o;
}
function sourceEnemy(id=10,x=1){const e={id,visualId:id,x,y:3,hp:100000,maxHp:100000,atk:100,def:5000,magicRes:50,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0};B.enemies.push(e);return e;}
function sourceAttack(o){o.cd=0;assert.equal(ArkOperatorCombat.attack(o),true);for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];}
`;
(async()=>{
 await f.run('initMode()');f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helpers}
 for(const c of elementCases){
  const o=sourceOp(c.charId,c.index,c.level),s=o.skill,e=sourceEnemy(),other=sourceEnemy(11,2),b=c.bb;
  assert.equal(s.sourceId,c.id);assert.deepEqual(JSON.parse(JSON.stringify(s.blackboard)),JSON.parse(JSON.stringify(b)));assert.equal(s.spCost,c.spCost);assert.equal(s.initSp,c.initSp);assert.equal(s.maxCharge,c.charges);
  o.sp=s.spCost;
  if(c.id==='skchr_threye_1'){
   B.enemies=[];update(0,0);assert.equal(o.sp,s.spCost,'no wasted charge without a target');B.enemies=[e,other];
   gainOperatorSp(o,'INCREASE_WITH_TIME',9999);assert.equal(o.sp,s.spCost*c.charges);sourceAttack(o);assert.equal(o.sp,s.spCost*(c.charges-1));assert.ok(!o.skillState);
  }else {assert.equal(castSkill(o),true);assert.equal(e.ep,undefined,'casting is not an on-hit elemental event');sourceAttack(o);}
  const atk=100*(1+(b.atk||0)),physicalHit=Math.round(atk*(b.atk_scale||1)*.5);
  assert.equal(e.maxHp-e.hp,physicalHit,c.id+' actual arts hit');
  const ratio=b['attack@ep_damage_ratio']??b.ep_damage_ratio??0,type=c.id==='skchr_warmy_1'?'burn':'apoptosis';
  const loss=(c.id.startsWith('skchr_threye')?atk:physicalHit)*ratio;
  near(e.ep?.[type]||0,loss,c.id+' Lv'+c.level+' actual elemental accumulation');
  assert.equal(ArkElements.display(e)?.type,loss?type:undefined);
  const two=['skchr_kaitou_2','skchr_threye_2'].includes(c.id);assert.equal(other.hp<other.maxHp,two,c.id+' target count');
  if(two)near(other.ep?.[type]||0,loss);
  if(s.skillState)throw Error('skill state belongs to operator, not skill');
  if(o.skillState){B.time=o.skillState.until;update(0,0);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);}
 }
 // Conditional talent: starts/stops with a live in-range apoptosis burst.
 let o=sourceOp('char_499_kaitou'),e=sourceEnemy();near(buffMul(o).atk,1);ArkElements.burst(e,'apoptosis');near(buffMul(o).atk,1.18);
 e.x=9;near(buffMul(o).atk,1);e.x=1;e.dead=true;near(buffMul(o).atk,1);e.dead=false;B.time=15;near(buffMul(o).atk,1);
 // S2 adds real elemental HP damage, never another accumulation packet.
 o=sourceOp('char_499_kaitou',1);e=sourceEnemy();ArkElements.burst(e,'apoptosis');o.sp=o.skill.spCost;castSkill(o);sourceAttack(o);
 assert.equal(e.maxHp-e.hp,59+89);assert.equal(e.ep.apoptosis,undefined);assert.ok(B.damageFeedback.some(h=>h.damageType==='elemental'&&h.amount===89));
 // S1's threshold-crossing hit has no burst-only extra damage. The next hit does.
 o=sourceOp('char_499_kaitou');e=sourceEnemy();ArkElements.add(e,'apoptosis',995);o.sp=o.skill.spCost;castSkill(o);sourceAttack(o);assert.equal(e.maxHp-e.hp,105);assert.ok(ArkElements.active(e));
 const hp=e.hp;sourceAttack(o);assert.equal(hp-e.hp,114+114,'ATK +110% skill and +18% talent add at the same layer');
 // Warmy's source talent also responds to an ally's burn, once, in range only.
 o=sourceOp('char_4081_warmy');e=sourceEnemy();ArkElements.add(e,'burn',1000);assert.equal(e.maxHp-e.hp,7000+300);ArkElements.add(e,'burn',1000);assert.equal(e.maxHp-e.hp,7300);
 const far=sourceEnemy(12,8);ArkElements.add(far,'burn',1000);assert.equal(far.maxHp-far.hp,7000);
 // Valarqvin's IS4-only talent must not leak into normal mode attacks.
 o=sourceOp('char_4102_threye',1);e=sourceEnemy();sourceAttack(o);assert.equal(e.ep,undefined);
 // Source-defined special/ordinary boss variants retain separate attack talents.
 for(const [id,level] of [['enemy_9017_achunt','h07_02'],['enemy_9017_achunt_2','h08_02']]){
  o=sourceOp('char_499_kaitou');
  const special=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_'+level+'_s'].enemies[id];
  e={...special,id:30,x:1,y:3,hp:special.maxHp};setupEnemy(e,special);assert.equal(e.epAttack,.4);applyEnemyEpDamage(e,o);near(o.ep.erosion,e.atk*.4);
  ArkElements.clear(o);const normal=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_'+level].enemies[id];
  e={...normal,id:30,x:1,y:3,hp:normal.maxHp};setupEnemy(e,normal);applyEnemyEpDamage(e,o);assert.ok(!o.ep.erosion);
 }
 console.log('ELEMENT SOURCES OK: 50 real source skill levels; conditional talents, hit/extra damage, charge/range/expiry, IS4 exclusion, 4 boss variants');
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_single_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:41,name:'element-source-test'});
 try{
  p.startBattle();p.__testMachine.run(helpers.replace(/function near[^\n]*\n/,''));
  p.__testMachine.run("const o=sourceOp('char_4081_warmy'),e=sourceEnemy();ArkElements.add(e,'burn',999);o.sp=o.skill.spCost;castSkill(o);ArkOperatorCombat.attack(o);");
  const snapshot=p.snapshot();assert.ok(snapshot.battle.projectiles.length,'snapshot while actual hit is in flight');
  p.advance(.5);const expected=p.snapshot().battle;assert.equal(expected.enemies[0].epBurst.type,'burn');
  p.restore(snapshot);p.advance(.5);assert.deepEqual(p.snapshot().battle,expected,'signed restore preserves on-hit plan and burst talent');
  console.log('ELEMENT SOURCES ROOM OK: in-flight hit restored through burn burst and talent');
 }finally{p.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
