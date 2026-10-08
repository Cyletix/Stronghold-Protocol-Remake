'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,chars,skills});
const helpers=`
function battle(charId='char_4147_mitm',index=0,level=10,potential=1,phase=null){
 setupSeasonId='act2autochess';setupStageKey=null;curMatch='solo';curDiff='extreme';localRunSetup=null;chooseBand('band_amiya');
 ACCOUNT.ops[charId]={selectedSkill:index,evolve:phase??(charId==='char_4215_buddy'?0:2),level:1,skillLevel:level,potential,trust:0};
 G.ops=[];G.equipInv=[];G.bannedOperators=[];G.debugEnabled=true;assert.ok(debugAddOperator(charId));
 const run=G.ops[0];run.row=3;run.col=3;run.dir='right';run.tacticalPlacement={row:3,col:4,dir:'right'};
 resolveBoard();startBattle([boardView(run)],[],100);G.phase='battle';G.battleDone=false;
 B.waveScheduler=null;B.spawn=[{at:99999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=99999;
 for(let r=1;r<=5;r++)for(let c=1;c<=8;c++){BDATA.level.buildable[r][c]='ALL';BDATA.level.passable[r][c]='ALL';}
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=999;o.sp=0;B.time=0;ArkTactician.advance();return o;
}
function enemy(id=1,x=4,y=3){const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,hp:1e6,maxHp:1e6,def:0,magicRes:0,atk:100,atkType:'phys',moveSpeed:0,attackTime:1,canAttack:false,dead:false,cd:99999,route:0,cp:0,seg:0,wait:99999,flying:false,skills:[],talents:[],buffs:[]};BDATA.level.routes[0]={segs:[[{r:3,c:15}]]};B.enemies.push(e);return e;}
function shots(){const list=B.projectiles;B.projectiles=[];for(const p of list)ArkOperatorCombat.impact(p);}
function near(a,b){assert.ok(Math.abs(a-b)<1e-5,a+' != '+b);}
function bonus(o,key,value){near(buffMul(o)[key],1+o.attributeBase[key]*value/o[key]);}
function cast(o){o.sp=o.skill.spCost;assert.ok(castSkill(o));}
function ally(id=202,row=3,col=5){const a={...B.operators[0],charId:'char_002_amiya',id,playerId:'teammate',row,col,position:'MELEE',blockCnt:1,basicAttack:{action:'attack',kind:'single'},combatTalents:[],skill:null,skillState:null,buffs:[],tacticalPlacement:null,rangeGrids:[{row:0,col:0}],cost:13};a.cells=rangeCellsFor(a);B.operators.push(a);return a;}
`;
async function main(){
 await f.run('initMode()');
 f.run(`(()=>{${helpers}
 for(const cid of ['char_4147_mitm','char_4215_buddy','char_4228_closur'])for(let phase=0;phase<chars[cid].phases.length;phase++){
  const o=battle(cid,0,1,1,phase),s=ArkTactician.point(o),data=chars[s.charId].phases[phase].attributesKeyFrames[0].data;
  for(const key of ['maxHp','atk','def'])assert.equal(s[key],data[key]);assert.equal(s.interval,cid==='char_4147_mitm'?[20,17,15][phase]:cid==='char_4215_buddy'?60:15);
  BDATA.level.buildable[2][4]='RANGED';assert.equal(ArkTactician.legal(o,2,4),cid==='char_4228_closur','native token terrain permission');
  s.commandShield=1;ArkTactician.retreat(s);assert.ok(!s.commandShield);B.time=s.nextStackAt;ArkTactician.advance();assert.ok(!s.dead);assert.equal(s.hp,s.maxHp);
 }
 for(const cid of ['char_4147_mitm','char_4228_closur'])for(let index=0;index<chars[cid].skills.length;index++)for(let level=1;level<=10;level++){
  const o=battle(cid,index,level),s=ArkTactician.point(o),raw=skills[chars[cid].skills[index].skillId].levels[level-1];
  assert.equal(o.skill.spCost,raw.spData.spCost);assert.equal(o.skill.duration,raw.duration);assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value]))));
  const e=enemy();e.blockerId=s.id;const before=e.hp;cast(o);
  if(cid==='char_4147_mitm'){
   if(index===0){assert.equal(B.dp,6);assert.ok(e.hp<before);assert.ok(s.tacticalDormant);assert.equal(B.summoneds.filter(s=>s.remnant).length,0);B.time=1/30;ArkTactician.advance();const debris=B.summoneds.filter(s=>s.remnant);assert.equal(debris.length,3);for(const a of debris){assert.equal(a.maxHp,Math.round(s.maxHp*.5));assert.equal(operatorBlockCount(a),1);assert.equal(operatorAction(a),'none');assert.equal(a.atk,0);assert.equal(a.def,0);}assert.ok(ArkTactician.retreat(debris[0]));assert.ok(debris[0].removed);B.time=15;ArkTactician.advance();assert.equal(s.hp,s.maxHp);assert.ok(!s.dead);assert.ok(!debris[1].removed,'debris lifetime independent of main respawn');}
   else {assert.equal(operatorAction(s),'none');assert.equal(operatorBlockCount(s),2);near(buffMul(s).def,1+o.skill.blackboard['mitm_s_2[to_token].def']);bonus(o,'atk',o.skill.blackboard.atk);B.time=15;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,12);endOperatorSkill(o);assert.ok(s.tacticalDormant);}
  }else {
   assert.equal(operatorAction(s),'none');assert.equal(operatorBlockCount(s),index===1?3:2);assert.equal(s.cells.length,[5,9,9][index]);
   if(index===0){assert.equal(s.commandShield,1);const hp=s.hp;assert.equal(inflictDamage(s,100),0);assert.equal(s.hp,hp);assert.equal(inflictDamage(s,100),100);B.time=o.skill.duration;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,3);}
   if(index===1){bonus(o,'atk',o.skill.blackboard.atk);near(buffMul(s).def,1+o.skill.blackboard.def);B.time=30;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,o.skill.blackboard.cost+15);}
   if(index===2){const p=ArkOperatorCombat.planFor(o,o.skill);assert.equal(p.scale,o.skill.blackboard['attack@atk_scale']);assert.equal(p.targets,1);o.skillState.commandAttacks=54;assert.equal(ArkOperatorCombat.planFor(o,o.skill).targets,7);B.time=30;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,18);}
  }
 }
 // Absent or recovering points do not suppress source DP generation.
 {const o=battle();B.summoneds=[];delete o.tacticalPlacement;cast(o);assert.equal(B.dp,6);}
 {const o=battle('char_4147_mitm',1),s=ArkTactician.point(o);cast(o);s.hp=0;tryKill(s);B.time=.04;ArkTactician.advance();const a=B.summoneds.find(s=>s.remnant);assert.equal(buffMul(a).def,1);assert.equal(operatorBlockCount(a),1);o.dead=true;ArkTactician.death(o);B.time=99;ArkTactician.advance();assert.ok(B.summoneds.every(s=>s.removed));}
 // All six actual account potentials select one exact bomb candidate.
 for(let pot=1;pot<=6;pot++){
  const o=battle('char_4215_buddy',0,1,pot),s=ArkTactician.point(o);assert.equal(o.skill,null);assert.equal(s.blockCnt,1);assert.equal(s.interval,60);
  const e=enemy(1,4,3);o.cells=[[3,4]];o.cd=0;assert.ok(ArkOperatorCombat.attack(o));shots();assert.equal(e.hp,e.maxHp);assert.equal(e.buddyBombs.length,1);
  const m=e.buddyBombs[0];near(m.scale,[1.5,2.3,2.8,3.5,4.2,5][pot-1]);hitEnemy(o,e,10);assert.equal(e.buddyBombs.length,1,'caster cannot detonate own bomb');
  const before=e.hp;hitEnemy(s,e,1);assert.equal(e.buddyBombs.length,0);near(before-e.hp,1+Math.round(m.power*m.scale));assert.equal(B.dp,1);near(e.stunUntil,[2,2.2,2.4,2.6,2.8,3][pot-1]);
  e.stunUntil=0;o.cd=0;ArkOperatorCombat.attack(o);shots();assert.equal(e.buddyBombs.length,0,'never mount same target twice');
  for(let id=2;id<=4;id++){B.enemies=[];const target=enemy(id);ArkOperatorCombat.attack(o);shots();assert.equal(target.buddyBombs?.length||0,id<=3?1:0);}
 }
 {const o=battle('char_4215_buddy',0,1),s=ArkTactician.point(o);const e=enemy(1,4,3),air=enemy(2,4,4);air.flying=true;s.houndStrikePending=true;ArkTactician.advance();assert.ok(air.hp<air.maxHp,'landing hits air');assert.ok(e.hp<e.maxHp);e.blockerId=null;B.enemies=[e];assert.equal(ArkOperatorCombat.attack(s),false,'hound only attacks own blocker');e.blockerId=s.id;assert.ok(ArkOperatorCombat.attack(s));ArkTactician.retreat(s);B.time=60;ArkTactician.advance();assert.ok(!s.dead);const hp=e.hp;ArkTactician.advance();assert.ok(e.hp<hp,'restoration repeats landing');}
 // Command zone affects allies, not unrelated points; no leakage across owners.
 {const o=battle('char_4228_closur',1),s=ArkTactician.point(o),a=ally(),outside=ally(303,5,7);cast(o);assert.equal(operatorBlockCount(a),2);assert.equal(operatorBlockCount(outside),1);bonus(a,'def',.6);
  const e=enemy(1,7,3);e.blockerId=a.id;o.cells=[[3,3]];assert.ok(ArkOperatorCombat.attack(o),'S2 selects allies blockers outside range');shots();
  ArkTacticalSpecials.operatorDeployed(a);const dp=B.dp;assert.equal(B.dp,dp);B.time=1/30;ArkTactician.advance();assert.equal(B.dp,dp+6);ArkTactician.advance();assert.equal(B.dp,dp+6,'refund exactly once');
  ArkTactician.retreat(s);assert.equal(operatorBlockCount(a),1);assert.equal(buffMul(a).def,1);assert.equal(ArkTacticalSpecials.additionalRange(o,e),false);
 }
 {const o=battle('char_4228_closur',0),s=ArkTactician.point(o);for(let n=3;n<=8;n++){cast(o);B.dp=0;B.time+=o.skill.duration/o.skillState.commonDp.total/2;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,1,'S1 first tick half interval');B.time=o.skillState.until;ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,Math.min(7,n));endOperatorSkill(o);}ArkTactician.death(o);assert.ok(!o.commandCasts);}
 {const o=battle('char_4228_closur',2),s=ArkTactician.point(o),a=ally();a.cells=[[2,7]];o.cells=[[3,3]];const e=enemy(1,7,2);cast(o);assert.ok(ArkOperatorCombat.attack(o));shots();near(ArkTacticalSpecials.tempo(e),.94);for(let i=0;i<15;i++){ArkOperatorCombat.attack(o);shots();}near(ArkTacticalSpecials.tempo(e),.4);B.time=3;assert.equal(ArkTacticalSpecials.tempo(e),1);}
 // Carry talent also works from bench; negative DP slows natural recovery only.
 {const o=battle('char_4228_closur',0);assert.equal(B.dpFloor,-3);B.dp=0;assert.ok(onRespawn(3,o));assert.equal(B.dp,-3);assert.equal(onRespawn(1,o),false);o.skill.isPassive=true;update(2,2);assert.equal(B.dp,-2);update(4,4);assert.equal(B.dp,0);update(1,1);assert.equal(B.dp,1);B.dp=-3;onSkillDp(4,o);assert.equal(B.dp,1);}
 {battle('char_4228_closur');G.phase='rest';B.phase='rest';G.ops[0].row=null;G.ops[0].col=null;delete G.ops[0].tacticalPlacement;const carrier=G.ops[0],rhodes=ROSTER_LIST.find(e=>e.power.includes('rhodes')&&e.charId!=='char_4228_closur');const o=addOperator(rhodes.charId,false);o.row=3;o.col=3;resolveBoard();const boosted=o.atk;G.ops=G.ops.filter(a=>a!==carrier);resolveBoard();assert.ok(boosted>o.atk);G.ops.push(carrier);document.getElementById('decision-modal').style.display='none';const save=encodeRestSave();assert.ok(decodeRestSave(save).session.ops.some(o=>o.charId==='char_4228_closur'&&o.entry.debugLibrary));}
 // Module effects remain conditional and source-owned; no universal stat buff.
 for(const cid of ['char_4147_mitm','char_4228_closur'])for(const level of [2,3]){
  const o=battle(cid,0),run=G.ops[0];run.entry={...run.entry,debugLibrary:false,profile:{normal:{evolvePhase:'PHASE_2',charLevel:60,skillLevel:10,equipLevel:level}},module:{uniEquipId:'uniequip_002_'+cid.split('_').at(-1)}};
  resolveBoard();const fm=finalizeOperator(run.entry,null,[],false);o.basicAttack=fm.basicAttack;o.combatTalents=fm.combatTalents;B.summoneds=[];ArkTactician.advance();const s=ArkTactician.point(o);
  if(cid==='char_4147_mitm'){assert.equal(o.basicAttack.bb.atk_scale,1.65);assert.equal(s.blockedTargetPriority,1);ArkTactician.retreat(s);B.time=.04;ArkTactician.advance();const a=B.summoneds.find(s=>s.remnant);assert.equal(a.maxHp,Math.round(s.maxHp*(level===2?.65:.7)));}
  else {const a=ally(),e=enemy();e.blockerId=a.id;near(ArkTactician.protection(a,e),.85);e.blockerId=s.id;assert.equal(ArkTactician.protection(a,e),1);assert.equal(commandCarriedBonus().floor,level===2?-4:-5);near(commandCarriedBonus().atk,level===2?.06:.08);}
 }
 // Resistible status clocks slow, but debuff lifetime and route WAIT are not extended.
 {const o=battle('char_4228_closur',2),e=enemy();e.commandSlow={one:{amount:.6,until:3},two:{amount:.3,until:8}};e.stunUntil=1;e.allyFrozenUntil=2;e.sleepUntil=1;e.hypnosSleep={external:0,published:1,revived:false,sources:{one:1}};
  B.time=1;ArkTacticalSpecials.advanceStatusClocks(1);near(e.stunUntil,1.6);near(e.allyFrozenUntil,2.6);near(e.hypnosSleep.sources.one,1.6);assert.equal(e.commandSlow.one.until,3);near(ArkTacticalSpecials.tempo(e),.4);B.time=3;near(ArkTacticalSpecials.tempo(e),.7);
 }
 // Expiring or missing damage sources never grant phantom refunds.
 {const o=battle('char_4215_buddy',0,1),e=enemy();ArkOperatorCombat.attack(o);shots();assert.equal(e.buddyBombs.length,1);hitEnemy(null,e,1);assert.equal(e.buddyBombs.length,1);B.time=30;ArkTactician.advance();assert.equal(e.buddyBombs.length,0);assert.equal(B.dp,0);}
 {const o=battle('char_4228_closur',0),a=ally();cast(o);o.sp=0;o.skill.isPassive=true;const ctx=new Proxy({},{get:(_,key)=>key==='measureText'?()=>({width:5}):(...args)=>{assert.ok(args.filter(x=>typeof x==='number').every(Number.isFinite));}});ArkTactician.draw(ctx,B,48);}
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 for(const cid of ['char_4147_mitm','char_4215_buddy','char_4228_closur']){
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:918});
 try{
  runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helpers+`const o=battle('${cid}',0),s=ArkTactician.point(o);ally();enemy();if(o.skill){cast(o);o.skill.isPassive=true;}else{ArkOperatorCombat.attack(o);shots();}s.cd=999;`);
  runtime.advance(.2);const checkpoint=runtime.snapshot();runtime.advance(1.7);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(1.7);const restored=runtime.snapshot();assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]});assert.deepEqual(restored.rng,after.rng);
 }finally{runtime.dispose();}
 }
 console.log('TACTICAL SPECIALS OK: 50 source skill levels, six potentials, debris/hound/bombs/center, source-owned bonuses, DP/refunds, save and authenticated restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
