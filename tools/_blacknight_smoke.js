'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,nightChars:chars,nightSkills:skills});
const helpers=`
function nightBattle(index=0,level=10,evolve=2,charId='char_476_blkngt'){
 setupSeasonId='act2autochess';setupStageKey=null;curMatch='solo';curDiff='extreme';localRunSetup=null;chooseBand('band_amiya');
 ACCOUNT.ops[charId]={selectedSkill:index,evolve,level:1,skillLevel:level,potential:0,trust:0};
 G.ops=[];G.equipInv=[];G.bannedOperators=[];G.debugEnabled=true;assert.ok(debugAddOperator(charId));
 const run=G.ops[0];run.row=3;run.col=3;run.dir='right';run.tacticalPlacement={row:3,col:4,dir:'right'};
 resolveBoard();startBattle([boardView(run)],[],100);G.phase='battle';G.battleDone=false;
 B.waveScheduler=null;B.spawn=[{at:99999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=99999;
 for(let r=1;r<=5;r++)for(let c=1;c<=8;c++)BDATA.level.buildable[r][c]='ALL';
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=999;o.sp=0;B.time=0;ArkTactician.advance();return o;
}
function nightEnemy(id=1,x=4,y=3){const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,hp:1e6,maxHp:1e6,def:300,magicRes:20,atk:1000,atkType:'phys',moveSpeed:0,attackTime:1,canAttack:false,dead:false,cd:99999,route:0,cp:0,seg:0,wait:99999,flying:false,skills:[],talents:[],buffs:[]};BDATA.level.routes[0]={segs:[[{r:3,c:15}]]};B.enemies.push(e);return e;}
function nightShots(){for(const p of B.projectiles)ArkOperatorCombat.impact(p);B.projectiles=[];}
function nearNight(a,b){assert.ok(Math.abs(a-b)<1e-5,a+' != '+b);}
`;
async function main(){
 await f.run('initMode()');
 f.run(`(()=>{${helpers}
 for(let index=0;index<2;index++)for(let level=1;level<=10;level++){
  const o=nightBattle(index,level),s=ArkTactician.point(o),raw=nightSkills[nightChars.char_476_blkngt.skills[index].skillId].levels[level-1];
  assert.equal(o.skill.sourceId,nightChars.char_476_blkngt.skills[index].skillId);assert.equal(o.skill.spCost,raw.spData.spCost);assert.equal(o.skill.maxCharge,raw.spData.maxChargeTime);assert.equal(o.skill.duration,raw.duration);
  assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value]))));
  assert.equal(s.name,'眠兽');assert.equal(s.blockCnt,1);assert.equal(s.interval,15);assert.equal(s.rangeGrids.length,5);
  let paid=0;const callback=window.onSkillDp;window.onSkillDp=n=>paid+=n;o.sp=o.skill.spCost;assert.ok(castSkill(o));assert.ok(!o.skillState,'both owner skills are instantaneous');
  assert.equal(paid,index?4:11);window.onSkillDp=callback;
  if(!index){
   assert.ok(ArkBlacknight.resting(s));assert.equal(operatorAction(s),'none');const enemy=nightEnemy();ArkOperatorCombat.assignBlocks();assert.equal(enemy.blockerId,s.id,'rest keeps blocking');
   s.hp=s.maxHp*.3;B.time=1;ArkTactician.advance(1);nearNight(s.hp,s.maxHp*(.3+o.skill.blackboard.hp_recovery_per_sec_by_max_hp_ratio));
   inflictDamage(s,0);assert.ok(ArkBlacknight.resting(s));inflictDamage(s,1);assert.ok(!ArkBlacknight.resting(s));nearNight(buffMul(s).atk,1+o.skill.blackboard['blkngt_hypnos_s_1[rage].atk']);nearNight(buffMul(s).aspd,1+o.skill.blackboard['blkngt_hypnos_s_1[rage].attack_speed']);
   B.time+=10;ArkTactician.advance();assert.equal(buffMul(s).atk,1);assert.equal(buffMul(s).aspd,1);
  }
 }
 for(const phase of [0,1,2]){const o=nightBattle(0,1,phase),s=ArkTactician.point(o),raw=nightChars[s.charId].phases[phase].attributesKeyFrames[0].data;for(const [a,b]of [['maxHp','maxHp'],['atk','atk'],['def','def']])assert.equal(s[a],raw[b]);assert.equal(s.interval,[20,17,15][phase]);s.hp=0;tryKill(s);assert.ok(s.tacticalDormant);B.time=s.nextStackAt;ArkTactician.advance();assert.ok(!s.dead);assert.equal(s.hp,s.maxHp);}
 for(let index=0;index<2;index++)for(let level=1;level<=10;level++){
  const o=nightBattle(index,level,2,'char_452_bstalk'),s=ArkTactician.point(o),raw=nightSkills[nightChars.char_452_bstalk.skills[index].skillId].levels[level-1];
  assert.equal(o.skill.spCost,raw.spData.spCost);assert.equal(o.skill.duration,raw.duration);assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value]))));
  const enemy=nightEnemy();enemy.blockerId=s.id;s.hp=1;o.sp=o.skill.spCost;castSkill(o);
  if(index){assert.equal(B.summoneds.filter(s=>s.temporary).length,3);nearNight(buffMul(s).def,1+o.skill.blackboard['attack@def']);endOperatorSkill(o);assert.ok(B.summoneds.filter(s=>s.temporary).every(s=>s.removed));}
  else assert.equal(s.hp,s.maxHp);
 }
 {const o=nightBattle(0,10,2,'char_452_bstalk'),run=G.ops[0];run.entry={...run.entry,debugLibrary:false,profile:{normal:{evolvePhase:'PHASE_2',charLevel:1,skillLevel:10,equipLevel:3}},module:{uniEquipId:'uniequip_002_bstalk'}};resolveBoard();o.basicAttack=G.ops[0].basicAttack;B.summoneds=[];ArkTactician.advance();const s=ArkTactician.point(o);
  assert.equal(o.basicAttack.bb.atk_scale,1.65);assert.equal(s.blockedTargetPriority,1);s.blocked=1;nearNight(buffMul(s).def,1.15);s.blocked=0;assert.equal(buffMul(s).def,1);
  const near=nightEnemy(1,3.6,3),far=nightEnemy(2,4.5,3);far.blockerId=s.id;o.cd=0;ArkOperatorCombat.attack(o);assert.equal(B.projectiles[0].target.id,far.id,'blocked target priority beats distance');
 }
 {nightBattle();G.phase='rest';B.phase='rest';G.ops=[];const rhine=ROSTER_LIST.find(e=>e.power.includes('rhine')&&e.charId!=='char_249_mlyss');assert.ok(rhine);const run=addOperator(rhine.charId,false);run.row=3;run.col=3;resolveBoard();const base=run.cost;assert.equal(boardView(run).cost,base);const carrier=addOperator('char_249_mlyss',false);resolveBoard();assert.equal(run.cost,base-2,'bench Muelsyse carry talent');G.ops.push({...carrier,id:G.nextId++});resolveBoard();assert.equal(run.cost,base-2,'same carry talent does not stack');G.ops=G.ops.filter(o=>o.charId!=='char_249_mlyss');resolveBoard();assert.equal(run.cost,base);}
 {const o=nightBattle(1),s=ArkTactician.point(o),a=nightEnemy(1,4,3),b=nightEnemy(2,5,3),air=nightEnemy(3,4,3),immune=nightEnemy(4,4,3),outside=nightEnemy(5,7,3);air.flying=true;immune.sourceAttributes={sleepImmune:true};a.invisibleUntil=10;
  o.sp=o.skill.spCost*2;assert.ok(castSkill(o));assert.equal(o.sp,o.skill.spCost);assert.equal(castSkill(o),false,'auto casting preserves the next charge');
  assert.equal(a.sleepUntil,6);assert.equal(b.sleepUntil,6);assert.ok(!air.sleepUntil&&!immune.sleepUntil&&!outside.sleepUntil);delete a.invisibleUntil;
  ArkOperatorCombat.assignBlocks();assert.equal(a.blockerId,s.id);assert.equal(air.blockerId,null);
  const hp=a.hp;assert.equal(hitEnemy(o,a,1000),0);assert.equal(a.hp,hp,'ordinary skills cannot damage a sleeping target');assert.equal(inflictDamage(a,1000),0,'direct periodic damage also respects sleep');
  B.enemies=[a,b];o.cd=0;assert.equal(ArkOperatorCombat.attack(o),false);
  s.cd=0;assert.ok(ArkOperatorCombat.attack(s));nightShots();
  const damage=Math.round(s.atk*2.1*.8);assert.equal(hp-a.hp,damage);assert.equal(b.maxHp-b.hp,damage,'sleeping secondary splash target takes arts damage');
  B.time=6;ArkTactician.advance();assert.equal(ArkOperatorCombat.planFor(s,null).damageType,'phys');assert.ok(castSkill(o));
  assert.ok(ArkTactician.retreat(s));assert.ok(s.tacticalDormant);assert.ok(!(a.sleepUntil>B.time));
  o.sp=o.skill.spCost;assert.ok(castSkill(o));assert.ok(a.sleepUntil>B.time,'S2 can sleep around a dormant point');B.time=s.nextStackAt;ArkTactician.advance();assert.ok(!(a.sleepUntil>B.time));
 }
 // Two source-owned sleeps overlap: removing one point cannot wake the other's targets.
 {const o=nightBattle(1),s=ArkTactician.point(o),other={...o,id:202,playerId:'two',tacticalPlacement:{row:3,col:5,dir:'left'},buffs:[]};B.operators.push(other);ArkTactician.advance();const two=ArkTactician.point(other),e=nightEnemy(1,4.5,3);e.sleepUntil=2;
  o.sp=o.skill.spCost;castSkill(o);B.time=1;other.sp=other.skill.spCost;castSkill(other);assert.equal(e.sleepUntil,7);ArkTactician.retreat(s);assert.equal(e.sleepUntil,7);ArkTactician.retreat(two);assert.equal(e.sleepUntil,2,'external sleep preserved');
 }
 // Source-backed module candidates are conditional, not a permanent text-classifier buff.
 {const o=nightBattle(1),run=G.ops[0];run.entry={...run.entry,debugLibrary:false,profile:{normal:{evolvePhase:'PHASE_2',charLevel:1,skillLevel:10,equipLevel:3}},module:{uniEquipId:'uniequip_002_blkngt'}};resolveBoard();
  const fm=finalizeOperator(run.entry,null,[],false);assert.ok(fm.combatTalents.some(t=>t.name==='点梦'));o.basicAttack=fm.basicAttack;o.combatTalents=fm.combatTalents;
  B.summoneds=[];ArkTactician.advance();const s=ArkTactician.point(o);assert.equal(s.protection,.85);assert.equal(buffMul(o).atk,1);const e=nightEnemy();e.sleepUntil=2;B.time=.1;nearNight(buffMul(o).atk,1+o.attributeBase.atk*.1/o.atk);nearNight(buffMul(s).atk,1.1);e.sleepUntil=0;assert.equal(buffMul(s).atk,1);
  const other=nightEnemy(2);other.sleepUntil=2;assert.equal(buffMul(s).atk,1,'a second provider must wait for detection');B.time=.2;nearNight(buffMul(s).atk,1.1);
 }
 // Debug adds are scoped attachments to this run, never a shop/season catalog mutation.
 {nightBattle(0);const ids=Object.keys(ROSTER).join(',');G.phase='rest';G.battleDone=false;B.phase='rest';G.ops[0].row=null;G.ops[0].col=null;delete G.ops[0].tacticalPlacement;document.getElementById('decision-modal').style.display='none';
  const save=encodeRestSave(),restored=decodeRestSave(save);assert.equal(restored.session.ops[0].entry.debugLibrary,true);assert.equal(Object.keys(ROSTER).join(','),ids);assert.ok(!ROSTER.char_476_blkngt);
  const forged=JSON.parse(save),body=JSON.parse(forged.body);body.session.debugUsed=false;forged.body=JSON.stringify(body);forged.checksum=saveHash(forged.body);assert.throws(()=>decodeRestSave(JSON.stringify(forged)),/干员损坏/);
 }
 })()`);
 // Authenticated snapshot restore advances real combat time, retaining sleep ownership and rest state.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:917});
 try{
  runtime.__testMachine.context.assert=assert;
  runtime.__testMachine.run(helpers+`const o=nightBattle(1),s=ArkTactician.point(o);nightEnemy();o.sp=o.skill.spCost;castSkill(o);o.sp=0;o.skill.isPassive=true;s.cd=999;`);
  runtime.advance(.2);const checkpoint=runtime.snapshot();runtime.advance(.7);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.7);const restored=runtime.snapshot();assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]});assert.deepEqual(restored.rng,after.rng);
 }finally{runtime.dispose();}
 console.log('BLACKNIGHT/BEANSTALK OK: 40 skill levels, 3 phases, live debug deployment, rest/wake, sleep targeting/damage/ownership, conditional modules, carry cost, save and signed battle restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
