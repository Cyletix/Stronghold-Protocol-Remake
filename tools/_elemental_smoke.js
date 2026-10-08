'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),f=require('./_browser_fixture')();f.ctx.assert=assert;
(async()=>{
 await f.run('initMode()');
 f.run(`
 chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 function setupElement(cid=null,index=0){
  Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],summoneds:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
  let r={};if(cid){G.skillChoices[cid]=index;r=finalizeOperator(ROSTER[cid],null,[],false);}
  const o={...r,id:1,charId:cid||'test',name:'test',profession:ROSTER[cid]?.profession||'GUARD',position:ROSTER[cid]?.position||'MELEE',
   row:3,col:0,cells:[[3,0],[3,1],[3,2],[3,3],[2,1]],range:3,atk:100,maxHp:10000,hp:10000,def:0,magicRes:0,attackTime:2,cd:999,
   attributeBase:undefined, // This fixture replaces source stats with an independent ATK100 oracle.
   events:[],buffs:[],blockCnt:0,deployed:true,deployT:1,deployAt:0,sp:0};B.operators=[o];return o;
 }
 function elementEnemy(id=10,x=1){const e={id,visualId:id,x,y:3,maxHp:100000,hp:100000,atk:100,def:0,magicRes:0,moveSpeed:0,canAttack:false,dead:false,cd:999,route:0,seg:0,cp:0};B.enemies.push(e);return e;}
 function elementAdvance(s){for(let i=0;i<Math.round(s*30);i++)update(1/30,1/30);}
 function elementAlly(id,atk=100,hp=10000){const a={...B.operators[0],id,charId:'test',col:id,atk,attributeBase:undefined,maxHp:hp,hp,def:100,skill:null,skillState:null,combatTalents:[],buffs:[],elementAuraHp:0};B.operators.push(a);return a;}
 const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 let o=setupElement(),e=elementEnemy();
 ArkElements.add(e,'apoptosis',999);assert.equal(e.hp,100000);assert.equal(ArkElements.display(e).value,999);
 ArkElements.add(e,'apoptosis',1);assert.ok(ArkElements.active(e,'apoptosis'));assert.equal(ArkElements.display(e).ratio,0);
 assert.equal(ArkElements.add(e,'burn',5000),0,'every element is immune during another burst');assert.equal(ArkElements.heal(e,9999),0);
 assert.equal(enemyDamageToOperator(e,o),50);elementAdvance(1);assert.equal(e.hp,99200);assert.ok(enemyDamageToOperator(e,o)>50);
 elementAdvance(14);assert.equal(e.hp,88000,'15 source ticks of 800, independent of HP/DEF/RES');assert.ok(!ArkElements.active(e));assert.equal(ArkElements.display(e),null);
 ArkElements.add(e,'burn',100);assert.equal(e.ep.burn,100,'fresh accumulation after cooldown');elementAdvance(1);assert.equal(e.ep.burn,100,'no invented automatic EP recovery');
 // Boss EP limit and the two independent resistance attributes.
 o=setupElement();e=elementEnemy();e.enemyId='enemy_1521_dslily';assert.equal(ArkElements.threshold(e),2000);ArkElements.add(e,'apoptosis',1000);assert.ok(!e.epBurst);
 e.epResistance=50;e.epDamageResistance=80;ArkElements.add(e,'apoptosis',2000);assert.ok(e.epBurst);elementAdvance(1);assert.equal(e.hp,99840);
 o=setupElement();e=elementEnemy();e.epResistance=100;ArkElements.add(e,'apoptosis',100);assert.equal(e.ep.apoptosis,5,'damage formula has a 5% floor');
 // Raw source burst values: instant effects, durable erosion, and paralysis.
 o=setupElement();e=elementEnemy();e.magicRes=60;ArkElements.add(e,'burn',1000);assert.equal(e.hp,93000);assert.equal(ArkElements.resDelta(e),-20);
 elementAdvance(10);assert.equal(ArkElements.resDelta(e),0);assert.equal(e.hp,93000);
 o=setupElement();e=elementEnemy();e.def=300;ArkElements.add(e,'erosion',1000);assert.equal(e.hp,95000);assert.equal(enemyDef(e),180);elementAdvance(8);ArkElements.add(e,'erosion',1000);assert.equal(enemyDef(e),60);
 o=setupElement();e=elementEnemy();ArkElements.add(e,'nervous',1000);assert.equal(e.hp,94000);assert.equal(e.palsyStacks,3);assert.ok(!e.stunUntil);
 Object.assign(e,{atkPhase:'windup',atkTimer:0,atkAnimAt:0});assert.equal(ArkElements.interruptAttack(e),true);assert.equal(e.palsyStacks,2);assert.equal(e.atkPhase,null);
 // Character bursts differ from enemy bursts, including SP lock and death cleanup.
 o=setupElement();o.magicRes=20;o.sp=20;ArkElements.add(o,'apoptosis',1000);o.skill={sourceId:'test',spCost:5,spType:'INCREASE_WITH_TIME',duration:10,effects:[]};
 assert.equal(castSkill(o),false);gainOperatorSp(o,'INCREASE_WITH_TIME',100);assert.equal(o.sp,20);o.skill.spCost=999;elementAdvance(15);assert.equal(o.hp,8800);close(o.sp,5);
 o=setupElement();ArkElements.add(o,'nervous',1000);assert.equal(o.hp,9000);assert.equal(o.stunUntil,10);
 o=setupElement();o.def=200;ArkElements.add(o,'erosion',1000);assert.equal(o.hp,9300);assert.equal(ArkElements.defDelta(o),-100);elementAdvance(10);assert.equal(ArkElements.defDelta(o),-100);tryKill(o);assert.equal(ArkElements.defDelta(o),0);assert.equal(ArkElements.display(o),null);
 o=setupElement();o.magicRes=50;ArkElements.add(o,'burn',1000);assert.equal(o.hp,9160,'1200 arts uses RES after -20');
 o=setupElement();ArkElements.add(o,'rampage',1000);assert.equal(ArkElements.aspdBonus(o),.5);ArkElements.onAction(o);elementAdvance(1);assert.equal(o.hp,9850);for(let i=0;i<15;i++)ArkElements.onAction(o);elementAdvance(1);assert.equal(o.hp,9250,'action growth capped at 600 true damage');
 // Simultaneous EP keeps separate values; healing restores all, display picks worst.
 o=setupElement();ArkElements.add(o,'apoptosis',400);ArkElements.add(o,'burn',600);assert.equal(ArkElements.display(o).type,'burn');ArkElements.heal(o,200);assert.equal(o.ep.apoptosis,200);assert.equal(o.ep.burn,400);
 // Real source talent path. Virtuosa passively accumulates without an attack.
 o=setupElement('char_245_cello',0);o.sp=0;e=elementEnemy();elementAdvance(1);assert.equal(e.hp,100000);close(e.ep.apoptosis,12);
 o.sp=o.skill.spCost;o.cd=0;update(0,0);assert.equal(o.sp,0);elementAdvance(.3);close(e.ep.apoptosis,114);assert.equal(e.hp,99790);
 ArkElements.burst(e,'apoptosis');o.sp=o.skill.spCost;update(0,0);assert.equal(o.sp,o.skill.spCost,'S1 waits for a target outside elemental burst');
 o=setupElement('char_245_cello',2);e=elementEnemy();o.sp=o.skill.spCost;castSkill(o);elementAdvance(1);close(e.ep.apoptosis,28.29);assert.equal(e.hp,100000,'S3 does not perform regular attacks');
 assert.ok(!Number.isNaN(e.slowFactor),'Cello aura never inherits another skill slow parameter');
 // Linked allies refresh without stacking, free HP healing, or stale targets after redeployment.
 o=setupElement('char_245_cello',2);o.skill.rangeGrids=null;let a=elementAlly(2,300,12000),b=elementAlly(3,250,11000);o.sp=o.skill.spCost;castSkill(o);
 assert.equal(a.maxHp,14400);assert.equal(buffMul(a).atk,1.2);a.hp=10000;elementAdvance(1);assert.equal(a.hp,10000);assert.equal(a.maxHp,14400);
 b.atk=350;elementAdvance(.4);assert.equal(buffMul(a).atk,1);assert.equal(buffMul(b).atk,1.2);b.col=20;elementAdvance(.1);assert.equal(buffMul(a).atk,1.2);assert.equal(buffMul(b).atk,1);
 endOperatorSkill(o);assert.equal(a.maxHp,12000);assert.equal(buffMul(a).atk,1);
 o=setupElement('char_245_cello',1);o.skill.rangeGrids=null;a=elementAlly(2,300);b=elementAlly(3,250);e=elementEnemy();o.sp=o.skill.spCost;castSkill(o);assert.equal(o.skillState.elementAlly,2);
 hitEnemy(a,e,20,false,'elemental');close(e.ep.apoptosis,18);b.atk=350;elementAdvance(.4);assert.equal(o.skillState.elementAlly,3);const beforeLoss=e.ep.apoptosis;hitEnemy(a,e,20);close(e.ep.apoptosis,beforeLoss);hitEnemy(b,e,20);close(e.ep.apoptosis,beforeLoss+18);
 // Nymph S3 changes actual damage type, S1 accumulates from mitigated arts damage.
 o=setupElement('char_4146_nymph',0);e=elementEnemy();e.magicRes=50;o.sp=o.skill.spCost;castSkill(o);o.cd=0;update(0,0);elementAdvance(.3);assert.equal(e.hp,99920);close(e.ep.apoptosis,8);
 o=setupElement('char_4146_nymph',2);e=elementEnemy();e.def=9000;e.magicRes=100;ArkElements.burst(e,'apoptosis');o.sp=o.skill.spCost;castSkill(o);o.cd=0;update(0,0);elementAdvance(.3);
 assert.equal(e.hp,99758,'100 x (1 + skill 140% + source talent 2%), ignores physical and arts defenses');assert.equal(e.elementDots.length,1);assert.ok(B.damageFeedback.some(d=>d.damageType==='elemental'));
 elementAdvance(1);assert.ok(e.hp<98900,'Nymph talent adds a separate elemental DoT');
 o=setupElement('char_4146_nymph',1);e=elementEnemy();e.magicRes=50;const neighbor=elementEnemy(11,1.4);neighbor.magicRes=50;o.sp=o.skill.spCost;castSkill(o);elementAdvance(.3);
 assert.equal(e.hp,99730);assert.equal(neighbor.hp,99865);close(e.ep.apoptosis,48.6);close(neighbor.ep.apoptosis,24.3);
 // Mode-exclusive auxiliary applies all 3 types, with neural first on a tie.
 o=setupElement('char_616_pithst',0);e=elementEnemy();o.cd=0;update(0,0);elementAdvance(.3);close(e.ep.nervous,18);close(e.ep.burn,18);close(e.ep.apoptosis,18);
 o.cd=0;e.ep={nervous:990,burn:990,apoptosis:990};update(0,0);elementAdvance(.3);assert.equal(e.epBurst.type,'nervous');assert.equal(e.palsyStacks,3);
 // Enemy source talent ratios preserve type, rather than mapping every enemy to burn.
 o=setupElement();const base=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_h07_04_s'].enemies.enemy_1521_dslily;
 e={...base,x:1,y:3,hp:base.maxHp};setupEnemy(e,base);assert.equal(e.epType,'nervous');assert.equal(e.epAttack,.2);applyEnemyEpDamage(e,o);close(o.ep.nervous,e.atk*.2);
 const normal=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_h07_04'].enemies.enemy_1521_dslily;
 const ordinary={...normal,x:1,y:3,hp:normal.maxHp};setupEnemy(ordinary,normal);assert.ok(!ordinary.epAttack,'do not import another stage variant attack ratio');
 // Wandering medic shared barrier, full-HP EP healing, active cooldown immunity.
 o=setupElement('char_1016_agoat2',1);const patient={id:2,charId:'test',row:3,col:1,maxHp:10000,hp:10000,def:0,magicRes:0,cd:999,deployAt:0,deployed:true,deployT:1,buffs:[],blockCnt:0};B.operators.push(patient);
 o.sp=o.skill.spCost;castSkill(o);assert.equal(B.elementShields[0].amount,500);ArkElements.add(patient,'burn',600);assert.equal(patient.ep.burn,28,'12% loss reduction then shared barrier absorption');assert.equal(B.elementShields[0].amount,0);
 ArkElements.burst(patient,'burn');const before=patient.epBurst.until;o.cd=0;performHealingAction(o);assert.equal(patient.epBurst.until,before);assert.equal(ArkElements.display(patient).burst,true);
 console.log('ELEMENTS OK source values, 5 systems, resistance separation, ticks/lock/immunity, healing, real operator attacks and indicators');
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_single_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:32,name:'element-test'});
 try{
  p.startBattle();p.__testMachine.run(f.run('setupElement.toString()')+'\n'+f.run('elementEnemy.toString()'));
  p.__testMachine.run("setupElement('char_4146_nymph',2);const enemy=elementEnemy();ArkElements.add(enemy,'apoptosis',1000);const op=B.operators[0];op.sp=op.skill.spCost;castSkill(op);op.cd=0;");
  p.advance(.5);const save=p.snapshot();assert.ok(save.battle.enemies[0].elementDots.length);
  const state=()=>({...p.snapshot().battle,particles:[]});p.advance(2);const next=state();p.restore(save);p.advance(2);assert.deepEqual(state(),next,'room restore keeps exact EP cooldown, DoT, talent stacks and typed damage');
  console.log('ELEMENT ROOM OK authenticated restore matches uninterrupted battle');
 }finally{p.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
