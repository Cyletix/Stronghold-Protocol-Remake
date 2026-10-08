'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const season=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON.act2autochess;
const equip=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json').uniequip_002_indigo;
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,mysticChars:chars,mysticSkills:skills,mysticSeason:season,mysticEquip:equip});
const helpers=`
function mysticBattle(index=0,elite=false){
 setupSeasonId='act2autochess';setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 G.skillChoices.char_469_indigo=index;G.bannedOperators=[];G.ops=[];G.equipInv=[];
 const src=addOperator('char_469_indigo',elite);src.row=3;src.col=0;src.dir='right';resolveBoard();
 startBattle([boardView(src)],[],100);B.waveScheduler=null;B.spawn=[{at:9999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=9999;
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=0;o.sp=0;ArkMystic.ensure(o);return o;
}
function mysticEnemy(id=100,x=1,y=3){
 const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,maxHp:1e7,hp:1e7,def:100,magicRes:20,moveSpeed:0,
  dead:false,canAttack:false,cd:999,attackTime:1,atk:50,route:0,cp:0,seg:0,wait:999,flying:false,skills:[],talents:[],buffs:[]};
 BDATA.level.routes[0]={segs:[[{r:3,c:20}]]};B.enemies.push(e);return e;
}
function mysticStep(n){for(let i=0;i<n;i++)update(1/30,0);}
function mysticNear(a,b,label){assert.ok(Math.abs(a-b)<1e-7,label+': '+a+' != '+b);}
`;
async function main(){
 await f.run('initMode()');
 // Hash pristine catalogs before the fixture installs synthetic routes.
 f.run('catalogFingerprint()');
 const receipts=f.run(`(()=>{
 ${helpers}
 const receipts=[];
 assert.deepEqual(ArkMystic.skillIds.slice(),['skchr_indigo_1','skchr_indigo_2']);
 assert.throws(()=>ArkMystic.configure({sourceId:'skchr_indigo_1',duration:4,blackboard:{base_attack_time:-.8}}),/Invalid/);
 for(const elite of [false,true])for(const index of [0,1]){
  const o=mysticBattle(index,elite),slot=mysticSeason.charShopChessDatas[ROSTER.char_469_indigo.chessId];
  const training=mysticSeason.charChessDataDict[elite?slot.goldenChessId:slot.chessId].status;
  const raw=mysticSkills[o.skill.sourceId].levels[training.skillLevel-1],b=Object.fromEntries(raw.blackboard.map(x=>[x.key,x.value]));
  assert.equal(o.basicAttack.training.evolve,Number(training.evolvePhase.slice(-1)));assert.equal(o.basicAttack.training.level,training.charLevel);
  for(const k of ['spCost','initSp','spType'])assert.equal(o.skill[k],raw.spData[k]);assert.equal(o.skill.duration,raw.duration);assert.equal(o.skill.realRangeId,raw.rangeId);
  assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(b));assert.equal(o.skill.effects.length,0,'remove guessed AS/range effects');
  const max=elite?mysticEquip.phases[0].parts[0].overrideTraitDataBundle.candidates[0].blackboard[0].value:mysticChars.char_469_indigo.trait.candidates[0].blackboard[0].value;
  assert.equal(o.mystic.max,max);assert.equal(o.mystic.charges,0);
  const t=o.combatTalents.find(t=>t.name==='柔光缚目'),tb=Object.fromEntries(t.blackboard.map(x=>[x.key,x.value]));assert.equal(tb.prob,elite?.18:.12);assert.equal(tb.duration,4);
  assert.ok(!o.events.length,'talent is an independent per-hit trigger');
  const plain=finalizeOperator({...ROSTER.char_469_indigo,module:null},null,[],elite),moduleAtk=elite?45:0;
  // Module flat bonus is before the static mode modifiers, compared in the saved attribute base.
  mysticNear(o.attributeBase.atk-plain.attributeBase.atk,moduleAtk,'default module ATK');
  mysticNear(o.attributeBase.aspd-plain.attributeBase.aspd,elite?.03:0,'default module AS');
  update(0,0);assert.equal(o.mystic.charges,1);assert.equal(B.projectiles.length,0,'storage has no attack target');
  for(let n=1;n<max;n++){update(o.cd,0);assert.equal(o.mystic.charges,n+1);}
  update(o.cd,0);update(.2,0);assert.equal(o.mystic.charges,max);assert.ok(o.cd<=0,'full storage waits ready');
  o.sp=o.skill.spCost;assert.equal(castSkill(o),true);assert.equal(o.sp,0);assert.equal(castSkill(o),false);
  const interval=o.attackTime*(index===0?1+b.base_attack_time:b.base_attack_time)/buffMul(o).aspd;
  mysticNear(ArkOperatorCombat.attackInterval(o,o.skill),interval,'source interval interpretation');
  const e=mysticEnemy();o.cd=0;assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(o.mystic.charges,0);assert.equal(B.projectiles.length,max+1,'one normal plus each stored energy');
  mysticNear(o.cd,interval,'real attack writes interval');
  const random=gameRandom;let calls=0;gameRandom=()=>{calls++;return .999;};
  for(const p of B.projectiles)ArkOperatorCombat.impact(p);gameRandom=random;
  assert.equal(calls,max+1,'independent talent roll for every projectile');
  const damage=Math.round(o.atk*(index===0?b['attack@atk_scale']:1)*.8);
  assert.equal(e.maxHp-e.hp,(max+1)*damage,'each source shot separately mitigated/rounded');assert.ok(!e.rootUntil);
  B.projectiles=[];B.enemies=[];o.cd=0;update(0,0);assert.equal(o.mystic.charges,1,'storage also uses skill cadence');mysticNear(o.cd,interval,'storage interval');
  const cells=JSON.stringify(o.skillState.cells);B.time=o.skillState.until;update(0,0);assert.equal(o.skillState,null);assert.equal(JSON.stringify(o.cells),cells,'source range restored');assert.equal(o.mystic.charges,1,'skill expiry keeps trait energy');
  o.hp=0;tryKill(o);assert.equal(o.mystic,null);o.respawnAt=B.time;o.respawnCost=0;respawnOperators();ArkMystic.ensure(o);assert.equal(o.mystic.charges,0,'new deployment starts empty');
  receipts.push({season:'act2autochess',chessId:elite?slot.goldenChessId:slot.chessId,skillId:o.skill.sourceId,max});
 }
 // Each energy rolls; bound enemies leave the selection pool but in-flight shots still hit.
 let o=mysticBattle(1,true),e=mysticEnemy();o.sp=o.skill.spCost;castSkill(o);o.mystic.charges=4;
 ArkOperatorCombat.attack(o);const shots=B.projectiles.slice(),random=gameRandom;let rolls=[.449999,.45,.99,0,.8],count=0;
 gameRandom=()=>rolls[count++];for(const shot of shots)ArkOperatorCombat.impact(shot);gameRandom=random;
 assert.equal(count,5);assert.equal(e.rootUntil,4);assert.equal(B.damageFeedback.length,5);B.projectiles=[];
 const second=mysticEnemy(101,2);o.cd=0;ArkOperatorCombat.attack(o);assert.equal(B.projectiles[0].target,second);
 B.projectiles=[];second.bindUntil=10;o.cd=0;assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(o.mystic.charges,1,'all targets bound -> storage');
 o.stunUntil=10;o.cd=0;update(0,0);assert.equal(o.mystic.charges,1,'control cannot complete storage');o.stunUntil=0;
 B.phase='rest';const time=B.time;update(3,0);assert.equal(B.time,time);assert.equal(o.mystic.charges,1);B.phase='battle';
 // S1's stored projectile multiplier follows current activation; the normal shot retains its attack plan.
 o=mysticBattle();e=mysticEnemy();o.mystic.charges=2;o.sp=o.skill.spCost;castSkill(o);ArkOperatorCombat.attack(o);
 const flying=B.projectiles.slice();o.combatTalents=[];endOperatorSkill(o);for(const p of flying)ArkOperatorCombat.impact(p);
 assert.equal(e.maxHp-e.hp,Math.round(o.atk*.35*.8)+2*Math.round(o.atk*.8),'stored energy scale is not frozen when charged or fired');
 // Aura has no ordinary-attack dispatch, includes other sources of root, excludes stationary/self-bound/waiting targets.
 o=mysticBattle(1);e=mysticEnemy();e.bindUntil=100;const stationary=mysticEnemy(101,2);stationary.selfBind=true;
 const outside=mysticEnemy(102,20);outside.rootUntil=100;o.sp=o.skill.spCost;castSkill(o);o.cd=999;
 const one=Math.round(o.atk*.12*.8),original=gameRandom;gameRandom=()=>{throw Error('aura must not roll normal-attack talents');};
 B.time=.49;ArkMystic.advance(o,B.time);assert.equal(e.hp,e.maxHp);B.time=.5;ArkMystic.advance(o,B.time);assert.equal(e.maxHp-e.hp,one);
 ArkMystic.advance(o,B.time);assert.equal(e.maxHp-e.hp,one,'same tick is idempotent');B.time=19.5;ArkMystic.advance(o,B.time);assert.equal(e.maxHp-e.hp,39*one);
 update(.5,0);gameRandom=original;assert.equal(e.maxHp-e.hp,40*one,'last due tick settles before expiry');assert.equal(o.skillState,null);assert.equal(stationary.hp,stationary.maxHp);assert.equal(outside.hp,outside.maxHp);
 assert.equal(e.bindUntil,100,'aura never reapplies or extends root');
 // Timed damage pauses with battle time, and cannot outlive its caster.
 o=mysticBattle(1);e=mysticEnemy();e.rootUntil=100;o.sp=o.skill.spCost;castSkill(o);o.cd=999;
 B.phase='rest';update(3,0);assert.equal(B.time,0);assert.equal(e.hp,e.maxHp);B.phase='battle';
 update(.5,0);const lastHp=e.hp;assert.ok(lastHp<e.maxHp);o.hp=0;tryKill(o);update(.5,0);assert.equal(e.hp,lastHp,'dead caster emits no aura');
 // Trait storage observes deployment gates; air targets remain valid ranged targets.
 o=mysticBattle();o.deployAt=5;o.deployed=false;update(0,0);assert.equal(o.mystic.charges,0);
 o.deployAt=0;o.deployed=true;e=mysticEnemy();e.flying=true;e.statusResistance=.5;o.cd=0;
 ArkOperatorCombat.attack(o);assert.equal(B.projectiles[0].target,e);const airRandom=gameRandom;gameRandom=()=>0;
 ArkOperatorCombat.impact(B.projectiles[0]);gameRandom=airRandom;assert.equal(e.rootUntil,2,'generic status resistance shortens root');
 // Moving and attacking are independent: root stops walking, not attack/skill clocks or blocking.
 o=mysticBattle();o.skill=null;o.cd=999;e=mysticEnemy();e.wait=0;e.moveSpeed=1;e.rootUntil=2;
 update(.5,0);assert.equal(e.x,1);e.wait=.5;update(.25,0);assert.equal(e.wait,.25,'root does not pause route WAIT');assert.equal(e.x,1);
 e.wait=0;e.rootUntil=0;update(.25,0);assert.equal(e.x,1.25,'movement resumes');
 e.x=.5;e.canAttack=true;e.applyWay='MELEE';e.rootUntil=100;e.cd=0;o.blockCnt=1;BDATA.level.buildable[o.row][o.col]='ALL';
 update(0,0);assert.equal(e.blockerId,o.id);assert.equal(e.atkPhase,'windup');const hp=o.hp;update(.31,0);assert.ok(o.hp<hp,'rooted enemy still attacks');assert.equal(e.blockerId,o.id);
 // No postmortem root, and rebirth clears the previous status.
 o=mysticBattle();e=mysticEnemy();o.mystic.charges=1;ArkOperatorCombat.attack(o);const lethal=B.projectiles[0];e.hp=1;e.revive=true;e.rootUntil=50;
 const oldRandom=gameRandom;gameRandom=()=>0;ArkOperatorCombat.impact(lethal);gameRandom=oldRandom;
 assert.equal(e.revived,true);assert.equal(e.rootUntil,0);e.rootImmune=true;e.hp=e.maxHp;gameRandom=()=>0;ArkOperatorCombat.impact(B.projectiles[1]);gameRandom=oldRandom;assert.equal(e.rootUntil,0);
 // Five source branches share only ordinary storage. Veen's merged energy remains explicitly excluded.
 for(const [id,c]of Object.entries(mysticChars).filter(([id,c])=>c.subProfessionId==='mystic')){
  const u={...o,charId:id,basicAttack:{...ArkAttackProfiles[id],bb:Object.fromEntries(c.trait.candidates[0].blackboard.map(x=>[x.key,x.value]))},mystic:null};
  if(id==='char_4226_veen'){assert.equal(ArkMystic.ensure(u),null);continue;}
  assert.equal(ArkMystic.ensure(u).max,3);u.cd=0;assert.equal(ArkMystic.store(u,3),true);assert.equal(ArkMystic.take(u),1);
 }
 const canvasCalls=[];const canvas=new Proxy({arc(...a){assert.ok(a.every(Number.isFinite));canvasCalls.push('arc');},ellipse(...a){assert.ok(a.every(Number.isFinite));canvasCalls.push('ellipse');}},{get:(t,k)=>t[k]||(()=>{})});
 o=mysticBattle();update(0,0);e=mysticEnemy();e.rootUntil=5;(B.combatEffects||=[]).push({kind:'mystic-root-pulse',x:e.x,y:e.y,at:B.time,duration:.25});ArkBattlePresentation.draw(canvas,B,50);assert.ok(canvasCalls.filter(x=>x==='arc').length>=3);assert.ok(canvasCalls.includes('ellipse'));
 // Exact preceding rest catalog rebuilds the current season profile; no live snapshot migration.
 o=mysticBattle(1,true);G.phase='rest';G.ops[0].row=null;G.ops[0].col=null;
 const old=JSON.parse(encodeRestSave());old.catalog='204770eab6b6cec2';const loaded=decodeRestSave(JSON.stringify(old));
 const fresh=finalizeOperator(loaded.session.ops[0].entry,null,[],true);
 assert.equal(fresh.basicAttack.bb.times,4);assert.equal(fresh.skill.mysticMechanic.kind,'root-aura');assert.ok(fresh.combatTalents.some(t=>t.name==='柔光缚目'));
 return receipts;
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(text.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:477,name:'mystic-check'});
 try{
  runtime.startBattle();runtime.__testMachine.run(`${helpers}const first=mysticBattle(1,true);first.playerId='one';first.mystic.charges=4;first.sp=first.skill.spCost;castSkill(first);const second={...first,id:2,col:1,playerId:'two',skillState:null,buffs:[],mystic:{max:4,charges:2}};B.operators.push(second);mysticEnemy(100,2);ArkOperatorCombat.attack(first);second.cd=999;`);
  runtime.advance(.1);const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.operators[0].mystic.charges,0);assert.equal(checkpoint.battle.operators[1].mystic.charges,2);
  runtime.advance(.7);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.7);const restored=runtime.snapshot();
  assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]},'two owners: storage/projectiles/root/pulses survive authenticated restore');assert.deepEqual(restored.rng,after.rng);
  runtime.__testMachine.run('B.operators[0].hp=0;tryKill(B.operators[0])');assert.equal(runtime.snapshot().battle.operators[0].skillState,null);assert.equal(runtime.snapshot().battle.operators[1].mystic.charges,2);
 }finally{runtime.dispose();}
 const out=process.argv.indexOf('--receipts');if(out>=0){assert.ok(process.argv[out+1]);fs.writeFileSync(process.argv[out+1],JSON.stringify({scope:'Indigo fixed normal/elite S1/S2; branch fixtures are not whole-character acceptance',receipts},null,2)+'\n');}
 console.log('MYSTIC OK: '+receipts.length+' actual Indigo normal/elite/skill cases; source module 3/4 charges, storage/volleys, independent root rolls, interval/range/damage, root movement vs attack, aura final tick, death/redeploy, rest migration and signed two-owner restore; 5 branch-only source fixtures, Veen excluded');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
