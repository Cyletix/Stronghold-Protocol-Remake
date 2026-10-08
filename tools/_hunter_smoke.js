'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const buffs=require('../data/ArknightsGameData/zh_CN/gamedata/buff_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,hunterChars:chars,hunterSkills:skills,hunterBuffs:buffs});
const helpers=`
function hunterBattle(skillIndex=0,elite=false){
 const id='char_4211_snhunt';G.skillChoices[id]=skillIndex;
 const e=ROSTER[id],stats=finalizeOperator(e,null,[],elite);
 startBattle([{...stats,id:1,charId:id,name:e.name,row:3,col:0,dir:'right',position:'RANGED',rangeGrids:entryRangeGrids(e,elite)}],[],100);
 B.waveScheduler=null;B.spawn=[{at:9999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=9999;
 const o=B.operators[0];o.deployT=2;o.deployAt=0;o.deployed=true;o.cd=0;o.sp=0;ArkHunter.ensure(o);return o;
}
function hunterEnemy(id=100,x=1,y=3){
 const e={id,enemyId:'enemy_1002_nsabr',visualId:id,x,y,maxHp:100000,hp:100000,def:100,magicRes:20,moveSpeed:.01,
  dead:false,canAttack:false,cd:10,attackTime:2,atk:0,route:0,cp:0,seg:0,wait:999,flying:false,skills:[],talents:[],buffs:[]};
 BDATA.level.routes[0]={segs:[[{r:3,c:30}]]};B.enemies.push(e);return e;
}
function hunterStep(n){for(let i=0;i<n;i++)update(1/30,0);}
`;
async function main(){
 await f.run('initMode()');
 const receipts=f.run(`(()=>{
 ${helpers}
 assert.equal(ArkHunterRules.coldAspd,hunterBuffs['c2e_cold[debuff]'].attributes.attributeModifiers[0].value);
 assert.equal(ArkHunterRules.freezeResist,hunterBuffs.c2e_freeze.attributes.attributeModifiers.find(m=>m.attributeType==='MAGIC_RESISTANCE').value);
 const receipts=[];
 for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  const entry=ROSTER.char_4211_snhunt,rosterIds=ROSTER_LIST.map(e=>e.charId).join(',');
  for(const elite of [false,true])for(const index of [0,1]){
   let o=hunterBattle(index,elite),enemy=hunterEnemy();
   const train=trainingProfile(entry,elite),id=hunterChars[o.charId].skills[index].skillId,lv=hunterSkills[id].levels[train.skillLevel-1];
   assert.equal(o.skill.sourceId,id);assert.equal(o.skill.spCost,lv.spData.spCost);assert.equal(o.skill.initSp,lv.spData.initSp);assert.equal(o.skill.maxCharge,lv.spData.maxChargeTime);
   assert.equal(o.hunter.max,8);assert.equal(o.basicAttack.hunter.reloadInterval,1.6);assert.equal(o.basicAttack.bb.extra_add||0,elite?1:0,'source default module 0/1');
   assert.equal(o.combatTalents.length,1);assert.equal(o.buffs.length,0,'skill-on-cast talent never becomes a passive ATK buff');
   update(0,0);assert.equal(o.hunter.ammo,7);assert.equal(B.projectiles.length,1);
   const ordinary=Math.max(1,Math.round(o.atk*1.2-enemy.def));hunterStep(15);assert.equal(enemy.hp,enemy.maxHp-ordinary,'source 120% basic shot, mitigated at impact');
   o=hunterBattle(index,elite);enemy=hunterEnemy();o.sp=o.skill.spCost;
   if(index===0){
    update(0,0);assert.equal(o.sp,0);assert.equal(o.hunter.ammo,7);assert.equal(B.projectiles.length,2,'S1 regular bullet plus independent talent');
    const shot=B.projectiles.find(p=>!p.plan.hunterTalent),shotScale=shot.plan.scale;assert.equal(shotScale,lv.blackboard[0].value);assert.equal(shot.plan.hunterScale,1.2);
    const talentScale=o.combatTalents[0].blackboard.find(x=>x.key==='atk_scale').value;
    hunterStep(15);assert.equal(enemy.hp,enemy.maxHp-Math.round(o.atk*talentScale-100)-Math.round(o.atk*1.2*shotScale-100));
    assert.ok(enemy.allyColdUntil>B.time);assert.equal(o.sp,0,'empowered action cannot refill its own attack SP');
   }else{
    o.hunter.ammo=0;assert.equal(castSkill(o),true);assert.equal(o.hunter.ammo,0,'special rounds do not consume magazine');
    const shots=B.projectiles.filter(p=>p.plan.hunterSpecial);assert.equal(shots.length,2);assert.notEqual(shots[0].x,shots[1].x);
    assert.equal(shots[0].plan.hunterScale,1);assert.equal(shots[0].plan.hits,1);assert.equal(B.projectiles.filter(p=>p.plan.hunterTalent).length,1);
    hunterStep(15);const bb=o.skill.blackboard,talentScale=o.combatTalents[0].blackboard.find(x=>x.key==='atk_scale').value;
    assert.equal(enemy.hp,enemy.maxHp-2*Math.round(o.atk*bb.atk_scale_2-100)-Math.round(o.atk*talentScale-100),'two separately mitigated stationary hits and talent');
   }
   receipts.push(sid+'/'+(elite?'elite':'normal')+'/'+id);
  }
  assert.equal(ROSTER_LIST.map(e=>e.charId).join(','),rosterIds);
 }
 setupSeasonId='act1autochess';setupStageKey=null;chooseBand('band_amiya');
 let charged=hunterBattle(1,true);hunterEnemy();charged.hunter.ammo=0;charged.sp=charged.skill.spCost*2;
 assert.equal(castSkill(charged),true);assert.equal(charged.sp,charged.skill.spCost);assert.equal(castSkill(charged),true);assert.equal(charged.sp,0);assert.equal(castSkill(charged),false);
 assert.equal(B.projectiles.filter(p=>p.plan.hunterSpecial).length,4);assert.equal(B.projectiles.filter(p=>p.plan.hunterTalent).length,2);assert.equal(charged.hunter.ammo,0);
 G.phase='rest';G.ops=[];G.equipInv=[];G._mergeReward=null;addOperator('char_4211_snhunt',true);
 const oldRest=JSON.parse(encodeRestSave());oldRest.catalog='797e6a34c8838c34';
 const decoded=decodeRestSave(JSON.stringify(oldRest));assert.equal(decoded.session.ops[0].charId,'char_4211_snhunt');assert.equal(decoded.session.skillChoices.char_4211_snhunt,1);
 const rebound=finalizeOperator(decoded.session.ops[0].entry,null,[],true);rebound.charId='char_4211_snhunt';ArkHunter.ensure(rebound);assert.equal(rebound.hunter.ammo,8);assert.equal(rebound.basicAttack.bb.extra_add,1,'compatible rest inventory derives fresh hunter rules');
 let o=hunterBattle();o.skill=null;o.combatTalents=[];o.hunter.ammo=7;update(0,0);assert.equal(o.hunter.reloadLeft,1.6);
 o.buffs=[{aspd:5,until:999}];o.attackTime=.1;update(1.5,0);assert.equal(o.hunter.ammo,7);update(.1,0);assert.equal(o.hunter.ammo,8,'reload ignores attack speed and attack-interval buffs');
 update(10,0);assert.equal(o.hunter.ammo,8);assert.equal(o.hunter.reloadLeft,0,'full magazine stays full');
 for(const elite of [false,true]){
  o=hunterBattle(0,elite);o.skill=null;o.combatTalents=[];o.hunter.ammo=3;update(0,0);hunterStep(48);assert.equal(o.hunter.ammo,4,'nonempty magazine always reloads one, including module1');
  o=hunterBattle(0,elite);o.skill=null;o.combatTalents=[];const enemy=hunterEnemy();o.hunter.ammo=0;update(0,0);
  assert.equal(B.projectiles.length,0,'empty magazine cannot shoot');hunterStep(47);assert.equal(B.projectiles.length,0);hunterStep(1);
  assert.equal(o.hunter.ammo,elite?1:0,'empty reload yields 1 / module 2, then one real shot is consumed');assert.equal(B.projectiles.length,1);
  o.hunter.ammo=0;o.hunter.reloadLeft=0;o.cd=0;update(0,0);update(.7,0);o.stunUntil=B.time+2;update(.1,0);
  assert.equal(o.hunter.reloadLeft,0);assert.equal(o.hunter.ammo,0,'interrupted reload pays nothing');
  o.stunUntil=0;o.cd=0;update(0,0);assert.equal(o.hunter.reloadLeft,1.6,'starts new action after stun');
 }
 // An actual attack grants attack-recovery SP; reloading never does.
 o=hunterBattle();o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'S1 without targets retains SP');assert.equal(o.sp,o.skill.spCost);
 hunterEnemy();o.hunter.ammo=0;update(0,0);assert.equal(o.sp,o.skill.spCost,'S1 empty magazine retains SP');assert.equal(B.projectiles.length,0);hunterStep(48);assert.equal(o.sp,0);assert.equal(B.projectiles.length,2,'S1 activates only after an actual round was loaded');
 o=hunterBattle();o.combatTalents=[];let enemy=hunterEnemy();update(0,0);assert.equal(o.sp,1);B.enemies=[];o.cd=0;update(0,0);hunterStep(48);assert.equal(o.sp,1);
 o=hunterBattle(1);o.hunter.ammo=0;o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'no target: retain S2 charge');assert.equal(o.sp,o.skill.spCost);
 enemy=hunterEnemy();o.combatTalents=[];castSkill(o);const shots=B.projectiles.filter(p=>p.plan.hunterSpecial),hp=enemy.hp;
 enemy.wait=0;ArkOperatorCombat.impact(shots[0]);assert.equal(enemy.hp,hp-Math.round(o.atk*o.skill.blackboard.atk_scale_1-100));
 enemy.wait=2;ArkOperatorCombat.impact(shots[1]);assert.equal(enemy.hp,hp-Math.round(o.atk*o.skill.blackboard.atk_scale_1-100)-Math.round(o.atk*o.skill.blackboard.atk_scale_2-100),'each impact reads current movement state');
 enemy.teleporting=true;assert.equal(ArkHunter.nonMoving(enemy),false);delete enemy.teleporting;
 enemy.wait=0;const defenderEntry=ROSTER.char_150_snakek;assert.ok(defenderEntry);const defender={...finalizeOperator(defenderEntry,null,[],false),charId:defenderEntry.charId,id:2,col:1,row:3,deployAt:0,deployT:1,deployed:true,buffs:[]};
 defender.hp=defender.maxHp;B.operators.push(defender);ArkOperatorCombat.assignBlocks();assert.equal(enemy.blockerId,defender.id);assert.equal(ArkHunter.nonMoving(enemy),true,'real assigned blocker counts as non-moving');
 o.sp=o.skill.spCost;castSkill(o);let lastShot=B.projectiles.filter(p=>p.plan.hunterSpecial).at(-1),beforeHit=enemy.hp;ArkOperatorCombat.impact(lastShot);assert.equal(beforeHit-enemy.hp,Math.round(o.atk*o.skill.blackboard.atk_scale_2-100));
 defender.dead=true;ArkOperatorCombat.assignBlocks();assert.equal(ArkHunter.nonMoving(enemy),false,'dead blocker releases movement state');
 enemy.stunUntil=B.time+2;o.sp=o.skill.spCost;castSkill(o);lastShot=B.projectiles.filter(p=>p.plan.hunterSpecial).at(-1);beforeHit=enemy.hp;ArkOperatorCombat.impact(lastShot);assert.equal(beforeHit-enemy.hp,Math.round(o.atk*o.skill.blackboard.atk_scale_2-100),'controlled target uses stationary hit multiplier');
 // Dead/hidden/outside target is not a substitute target for a lost special shot.
 o=hunterBattle(1);o.sp=o.skill.spCost;enemy=hunterEnemy();enemy.invisibleUntil=999;assert.equal(castSkill(o),false);enemy.invisibleUntil=0;enemy.x=50;assert.equal(castSkill(o),false);
 enemy.x=1;castSkill(o);const bystander=hunterEnemy(101,1.05);enemy.dead=true;o.cd=999;hunterStep(15);assert.equal(bystander.hp,bystander.maxHp,'no retarget after launch');
 // Friendly cold is pairwise; it never consumes enemy-origin cold/freeze.
 o=hunterBattle(1);o.cd=999;o.skill=null;enemy=hunterEnemy();enemy.coldUntil=100;enemy.frozenUntil=100;
 ArkHunter.cold(enemy,2,B.time);assert.equal(enemy.allyFrozenUntil,undefined);assert.equal(enemy.coldUntil,100);assert.equal(enemy.frozenUntil,100);
 delete enemy.coldUntil;delete enemy.frozenUntil;B.time=.5;ArkHunter.cold(enemy,3,B.time);assert.equal(enemy.allyFrozenUntil,3.5);assert.equal(enemy.allyColdUntil,0);
 B.time=1;ArkHunter.cold(enemy,2,B.time);assert.equal(enemy.allyFrozenUntil,3.5,'third cold starts a fresh pair instead of extending freeze');assert.equal(enemy.allyColdUntil,3);
 B.time=1.5;ArkHunter.cold(enemy,4,B.time);assert.equal(enemy.allyFrozenUntil,5.5);assert.equal(enemy.allyColdUntil,0);
 assert.equal(calcDamage(o,enemy,1,{raw:100,type:'arts'}),95,'friendly freeze subtracts 15 RES');B.time=6;assert.equal(calcDamage(o,enemy,1,{raw:100,type:'arts'}),80);
 ArkHunter.clearCold(enemy);enemy.frozenImmune=true;ArkHunter.cold(enemy,2,B.time);ArkHunter.cold(enemy,3,B.time);assert.equal(enemy.allyFrozenUntil,0);assert.ok(enemy.allyColdUntil>B.time);
 ArkHunter.clearCold(enemy);enemy.coldImmune=true;ArkHunter.cold(enemy,3,B.time);assert.equal(enemy.allyColdUntil,0);delete enemy.coldImmune;delete enemy.frozenImmune;
 enemy.statusResistance=1;ArkHunter.cold(enemy,4,B.time);assert.equal(enemy.allyColdUntil,0);enemy.statusResistance=.5;ArkHunter.cold(enemy,4,B.time);assert.equal(enemy.allyColdUntil,B.time+2);delete enemy.statusResistance;
 ArkHunter.clearCold(enemy);enemy.sourceAttributes={attackSpeed:150};ArkHunter.cold(enemy,3,B.time);assert.equal(ArkHunter.enemyTempo(enemy,B.time),.8);delete enemy.sourceAttributes;
 enemy.cd=10;update(1,0);assert.ok(Math.abs(enemy.cd-9.3)<1e-8,'cold changes actual enemy attack cooldown');const timer=enemy.cd;enemy.atkPhase='windup';enemy.atkTarget=o;enemy.atkTargets=[o];ArkHunter.cold(enemy,3,B.time);assert.equal(enemy.atkPhase,null,'freeze interrupts an unlaunched attack');assert.equal(enemy.atkTargets,null);update(.5,0);assert.equal(enemy.cd,timer,'freeze stops enemy actions');
 enemy.revive=true;enemy.hp=0;killEnemy(enemy);assert.equal(enemy.dead,false);assert.equal(enemy.allyFrozenUntil,0,'rebirth clears previous cold');
 enemy.revived=false;enemy.hp=1;ArkOperatorCombat.impact({owner:o,target:enemy,plan:{kind:'single',hits:1,power:1000,scale:1,damageType:'phys',cold:3,hunterTalent:true}});assert.equal(enemy.dead,false);assert.equal(enemy.allyColdUntil,0,'lethal talent hit cannot apply pre-death cold to the revived enemy');
 o=hunterBattle();o.hunter.ammo=2;o.hunter.reloadLeft=.5;o.hp=0;tryKill(o);assert.equal(o.hunter,null);o.respawnAt=B.time;o.respawnCost=0;respawnOperators();ArkHunter.ensure(o);assert.equal(o.hunter.ammo,8,'redeploy refills and clears reload');
 // Phase capacities use source trait candidates even outside the fixed mode profile.
 for(const phase of [0,1,2]){GMODE='normal';ACCOUNT.ops.char_4211_snhunt={...getOpAccount('char_4211_snhunt'),evolve:phase,level:1};const u=finalizeOperator(ROSTER.char_4211_snhunt,null,[],false);u.charId='char_4211_snhunt';ArkHunter.ensure(u);assert.equal(u.hunter.max,[4,6,8][phase]);}GMODE='auto';
 o=hunterBattle();o.skill=null;o.hunter.ammo=7;update(0,0);hunterStep(48);enemy=hunterEnemy();ArkHunter.cold(enemy,3,B.time);
 let rectangles=0,labels=[];const canvas=new Proxy({fillRect(...a){assert.ok(a.every(Number.isFinite));rectangles++;},arc(...a){assert.ok(a.every(Number.isFinite));},fillText(t){labels.push(t)}},{get:(t,k)=>t[k]||(()=>{})});
 ArkBattlePresentation.draw(canvas,B,50);assert.ok(rectangles>=9,'eight ammo cells plus backing');assert.ok(labels.includes('寒冷'));
 return receipts;
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(text.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:227,name:'hunter-verify'});
 try{
  runtime.startBattle();runtime.__testMachine.run(`${helpers}const first=hunterBattle(1);first.playerId='one';first.hunter.ammo=0;const second={...first,id:2,col:1,playerId:'two',hunter:{...first.hunter},buffs:[]};B.operators.push(second);hunterEnemy(100,2,3);first.sp=first.skill.spCost;castSkill(first);update(0,0);`);
  const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.projectiles.length,3);assert.ok(checkpoint.battle.operators.every(o=>o.hunter.reloadLeft>0));
  runtime.advance(.9);const after=runtime.snapshot();assert.ok(after.battle.enemies[0].allyColdUntil>after.battle.time);
  // Hit particles use cosmetic Math.random; gameplay state and simulation RNG must match exactly.
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.9);const restored=runtime.snapshot();
  assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]},'signed restore of independent magazines/reloads/special rounds/talent cold');assert.deepEqual(restored.rng,after.rng);
 }finally{runtime.dispose();}
 console.log('HUNTER OK: '+receipts.length+' actual season/normal/elite/skill cases; source 4/6/8 magazines and module; basic/S1/S2/talent, no-target SP, empty reload/interruption/death, per-hit stationary scaling, friendly cold/RES/tempo, finite render and two-owner authenticated restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
