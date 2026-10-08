'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'),ranges=require('../data/ArknightsGameData/zh_CN/gamedata/excel/range_table.json');
const cases=require('./lib/tactician-cases').buildTacticianCases();assert.equal(cases.length,18);
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,tacticCases:cases,tacticChars:chars,tacticSkills:skills,tacticRanges:ranges});
const helpers=`
function tacticBattle(c){
 setupSeasonId=c.seasonId;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 G.skillChoices[c.charId]=c.index;G.bannedOperators=[];G.ops=[];G.equipInv=[];
 const src=addOperator(c.charId,c.elite);src.row=3;src.col=3;src.dir='right';src.tacticalPlacement={row:3,col:4,dir:'right'};resolveBoard();
 startBattle([boardView(src)],[],100);G.phase='battle';G.battleDone=false;B.waveScheduler=null;B.spawn=[{at:99999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=99999;
 for(let r=1;r<=5;r++)for(let c=1;c<=7;c++)BDATA.level.buildable[r][c]='MELEE';
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=0;o.sp=0;B.time=0;ArkTactician.advance();return o;
}
function tacticEnemy(id=100,x=4,y=3){const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,hp:1e6,maxHp:1e6,def:300,magicRes:20,atk:1000,atkType:'phys',moveSpeed:0,attackTime:1,canAttack:false,dead:false,cd:99999,route:0,cp:0,seg:0,wait:99999,flying:false,skills:[],talents:[],buffs:[]};BDATA.level.routes[0]={segs:[[{r:3,c:15}]]};B.enemies.push(e);return e;}
function tacticShots(){for(const p of B.projectiles)ArkOperatorCombat.impact(p);B.projectiles=[];}
function near(a,b,label){assert.ok(Math.abs(a-b)<1e-5,label+': '+a+' != '+b);}
`;
async function main(){
 await f.run('initMode()');f.run('catalogFingerprint()');
 const receipts=f.run(`(()=>{${helpers}
 const receipts=[];
 for(const c of tacticCases){
  let o=tacticBattle(c),s=ArkTactician.point(o),b=Object.fromEntries(c.source.blackboard.map(x=>[x.key,x.value]));
  assert.ok(s);assert.equal(s.ownerId,o.id);assert.equal(o.skill.sourceId,tacticChars[c.charId].skills[c.index].skillId);assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(b));
  for(const k of ['spCost','initSp','spType'])assert.equal(o.skill[k],c.source.spData[k]);assert.equal(o.skill.duration,c.source.duration);assert.equal(o.skill.effects.length,0);
  const raw=tacticChars[s.charId],phase=raw.phases[Number(c.training.evolvePhase.slice(-1))],a=phase.attributesKeyFrames[0],z=phase.attributesKeyFrames.at(-1),mix=(c.training.charLevel-a.level)/(z.level-a.level);
  for(const [key,src]of [['maxHp','maxHp'],['atk','atk'],['def','def']])assert.equal(s[key],Math.round(a.data[src]+(z.data[src]-a.data[src])*mix),'source token '+key);
  assert.equal(s.protection,c.training.equipLevel>0?.85:1,c.id+' module');assert.equal(s.interval,25);assert.equal(directHealAllowed(o,s),false);
  const air=tacticEnemy(101,s.col,s.row);air.flying=true;const ground=tacticEnemy(102,s.col+.5,s.row);ArkOperatorCombat.assignBlocks();assert.equal(air.blockerId,null);assert.equal(ground.blockerId,s.id);
  B.enemies=[ground];o.garrisonStats=null;const enemy=ground,atk=o.atk*buffMul(o).atk;o.cd=0;const before=enemy.hp;ArkOperatorCombat.attack(o);tacticShots();
  const penetrate=c.charId==='char_427_vigil'?175:0;assert.equal(before-enemy.hp,Math.round(Math.max(atk*1.5*.05,atk*1.5-Math.max(0,enemy.def-penetrate))));
  enemy.blockerId=null;o.cd=0;const hp=enemy.hp;ArkOperatorCombat.attack(o);tacticShots();assert.equal(hp-enemy.hp,Math.round(Math.max(atk*.05,atk-enemy.def)),'no global trait/penetration');
  const incoming=enemyDamageToOperator({...enemy,blockerId:s.id},s),other=enemyDamageToOperator({...enemy,blockerId:null},s);assert.equal(incoming,Math.round(other*s.protection));
  if(c.charId==='char_427_vigil'){
   assert.equal(s.stacks,2);assert.equal(operatorBlockCount(s),2);s.hp=0;tryKill(s);assert.equal(s.stacks,1);assert.equal(s.hp,s.maxHp);assert.ok(!s.dead);
   s.hp=0;tryKill(s);assert.equal(s.tacticalDormant,true);assert.equal(operatorBlockCount(s),0);assert.equal(operatorPresent(s),false);assert.equal(enemy.blockerId,null);
   o.skill.isPassive=true;o.sp=0;o.cd=999;B.enemies=[];update(24,0);assert.ok(s.tacticalDormant);o.sp=0;update(1,0);assert.equal(s.stacks,1);assert.ok(!s.dead);o.sp=0;update(25,0);assert.equal(s.stacks,2);o.sp=0;update(25,0);assert.equal(s.stacks,3);
   o=tacticBattle(c);s=ArkTactician.point(o);let paid=[];const callback=window.onSkillDp;window.onSkillDp=(n,unit)=>paid.push([n,unit.id]);
   o.sp=o.skill.spCost;assert.equal(castSkill(o),true);
   if(c.index===0){assert.equal(s.stacks,3);assert.equal(paid[0][0],7);s.hp=1;o.sp=o.skill.spCost;castSkill(o);assert.equal(s.hp,s.maxHp);}
   if(c.index===1){assert.equal(paid[0][0],2);o.sp=o.skill.spCost;assert.equal(castSkill(o),false,'charge cannot pay repeatedly');const e=tacticEnemy(100,s.col,s.row);e.hp=1;e.blockerId=s.id;s.hp=s.maxHp*.5;s.cd=0;ArkOperatorCombat.attack(s);assert.equal(e.dead,true);near(s.hp,s.maxHp*(.5+b['vigil_wolf_s_2.hp_ratio']),'next attack heals');assert.equal(paid.length,2);assert.equal(paid[1][0],1);assert.equal(s.nextTacticalAttack,null);}
   if(c.index===2){const e=tacticEnemy(100,s.col,s.row);e.blockerId=s.id;o.garrisonStats=null;const power=o.atk*buffMul(o).atk;
    ArkOperatorCombat.attack(o);tacticShots();const phys=Math.round(power*1.5-Math.max(0,e.def-175)),arts=Math.round(power*1.5*b['attack@vigil_s_3.atk_scale']*.8);assert.equal(e.maxHp-e.hp,3*(phys+arts));
    const hp=e.hp;s.cd=0;ArkOperatorCombat.attack(s);assert.equal(hp-e.hp,s.stacks*(Math.round(s.atk-Math.max(0,e.def-175))+Math.round(power*b['attack@vigil_s_3.atk_scale']*.8)));
    B.enemies=[];o.cd=999;update(o.skill.duration,0);assert.equal(paid.reduce((n,x)=>n+x[0],0),b.value);assert.equal(o.skillState,null);assert.ok(ArkTactician.point(o));
   }window.onSkillDp=callback;
  }else{
   assert.equal(s.flow.kind,'base');const preset={charId:'char_002_amiya',name:'复制样例',maxHp:2000,atk:600,def:400,magicRes:20,blockCnt:3,attackTime:1.2,position:'MELEE',rangeGrids:[{row:0,col:0}],atkType:'arts'};
   const ratio=c.training.equipLevel===3?1:.9;assert.equal(s.copyScale,ratio);assert.equal(ArkFlowShape.copy(s,preset),true);assert.equal(s.maxHp,2000*ratio);assert.equal(s.atk,600*ratio);assert.equal(s.blockCnt,3);assert.equal(s.attackTime,1.2);assert.equal(s.skill,undefined);assert.equal(s.combatTalents,undefined);
   const e=tacticEnemy(201,s.col+.5,s.row);e.blockerId=s.id;s.cd=0;ArkOperatorCombat.attack(s);tacticShots();assert.equal(s.flow.atk,10);assert.equal(s.flow.def,10);assert.equal(ArkFlowShape.stolen(e,'def'),10);
   s.flow.atk=250;s.flow.def=250;s.cd=0;ArkOperatorCombat.attack(s);tacticShots();assert.equal(s.flow.atk,250);
   o.sp=o.skill.spCost;let paid=[];const callback=window.onSkillDp;window.onSkillDp=(n,unit)=>paid.push([n,unit.id]);castSkill(o);near(buffMul(s).atk,1+b.atk,'flow skill shared attack');
   if(c.index===1){s.hp=500;ArkFlowShape.advance(s,o,1);near(s.hp,500+s.maxHp*b.hp_recovery_per_sec_by_max_hp_ratio,'melee regeneration');near(ArkFlowShape.protection(s),1-b.damage_resistance,'melee sanctuary');}
   if(c.index===2){e.blockerId=s.id;ArkFlowShape.advance(s,o,0);assert.ok(e.stunUntil>B.time);}
   B.enemies=[];o.cd=999;s.cd=999;update(o.skill.duration,0);assert.equal(o.skillState,null);assert.equal(paid.reduce((n,x)=>n+x[0],0),c.index?b.cost:b.fake_cost);assert.ok(ArkTactician.point(o));window.onSkillDp=callback;
   ArkFlowShape.copy(s,{...preset,position:'RANGED'});assert.equal(s.flow.atk,0);assert.equal(s.flow.kind,'ranged');const mainHp=s.hp;s.hp=0;tryKill(s);assert.ok(s.tacticalDormant);B.time=s.nextStackAt;ArkTactician.advance();assert.equal(s.flow.kind,'ranged');assert.equal(s.hp,mainHp);assert.equal(s.blockCnt,3);
   o.sp=o.skill.spCost;castSkill(o);const enemy=tacticEnemy(220,s.col,s.row);enemy.blockerId=s.id;const p=ArkOperatorCombat.planFor(s,null);assert.equal(p.hits,1);assert.equal(p.targets,1);
   if(c.index===1)assert.equal(p.randomShots,2);if(c.index===2)assert.ok(B.summoneds.filter(x=>x.temporary).length>0);
   s.cd=0;ArkOperatorCombat.attack(s);tacticShots();if(c.index===2)assert.ok(enemy.flowRootUntil>B.time);
   if(c.index===2){enemy.revive=true;enemy.hp=1;enemy.flowRootUntil=B.time+9;s.cd=0;ArkOperatorCombat.attack(s);tacticShots();assert.equal(enemy.revived,true);assert.equal(enemy.flowRootUntil,0,'old-life root is not reapplied after revival');}
   if(c.index===1){const other=tacticEnemy(221,s.col+.1,s.row);B.enemies=[enemy,other];B.projectiles=[];const random=gameRandom;let roll=0;gameRandom=()=>roll++%2?.999:0;s.cd=0;ArkOperatorCombat.attack(s);gameRandom=random;assert.equal(B.projectiles.length,2);assert.notEqual(B.projectiles[0].target.id,B.projectiles[1].target.id,'each S2 projectile selects independently');tacticShots();}
   if(o.skillState)endOperatorSkill(o);s.flow.hits=9;s.cd=0;ArkOperatorCombat.attack(s);tacticShots();assert.equal(s.flow.hits,0);assert.ok(B.summoneds.some(x=>x.temporary));
   const child=B.summoneds.find(x=>x.temporary);assert.equal(child.ownerId,o.id);assert.equal(child.skill,undefined);child.hp=0;tryKill(child);assert.equal(child.removed,true);assert.equal(child.tacticalDormant,false);
  }
  // Every exact configuration cleans up at owner death and creates a new source entity after redeploy.
  const old=ArkTactician.point(o);o.hp=0;tryKill(o);assert.equal(old.removed,true);assert.equal(ArkTactician.point(o),undefined);
  o.dead=false;o.hp=o.maxHp;o.deployed=true;o.respawnAt=null;ArkTactician.advance();const next=ArkTactician.point(o);assert.ok(next&&next.id!==old.id);
  receipts.push(c.id);
 }
 // Beanstalk is library-only. Its source crab and two skills are not wolf stacks.
 for(const elite of [false,true])for(const index of [0,1]){
  let o=tacticBattle(tacticCases[0]);B.summoneds=[];const raw=tacticChars.char_452_bstalk,sk=tacticSkills[raw.skills[index].skillId].levels[elite?6:3];
  o={...o,charId:'char_452_bstalk',name:raw.name,basicAttack:{...ArkAttackProfiles.char_452_bstalk,bb:{atk_scale:1.5},training:{evolve:2,level:elite?60:1,potential:0}},combatTalents:[],
   skill:{sourceId:raw.skills[index].skillId,blackboard:Object.fromEntries(sk.blackboard.map(x=>[x.key,x.value])),spCost:sk.spData.spCost,spType:sk.spData.spType,duration:sk.duration,name:sk.name},buffs:[],events:[],tacticalRetryAt:0};
  ArkTactician.configure(o.skill);B.operators=[o];ArkTactician.advance();const s=ArkTactician.point(o);assert.equal(s.tacticalKind,'crab');assert.equal(s.stacks,1);assert.equal(s.interval,15);
  const phase=tacticChars.token_10014_bstalk_crab.phases[2],a=phase.attributesKeyFrames[0],z=phase.attributesKeyFrames.at(-1);assert.equal(s.atk,Math.round(a.data.atk+(z.data.atk-a.data.atk)*(o.basicAttack.training.level-a.level)/(z.level-a.level)));
  s.hp=0;tryKill(s);assert.ok(s.tacticalDormant);let paid=0;const callback=window.onSkillDp;window.onSkillDp=n=>paid+=n;o.sp=o.skill.spCost;castSkill(o);
  if(!index){assert.equal(paid,8);assert.equal(s.hp,s.maxHp);assert.equal(s.dead,false);assert.equal(B.summoneds.length,1);}
  else{const children=B.summoneds.filter(t=>t.temporary);assert.equal(children.length,3,'occupied owner tile excluded');assert.ok(children.every(t=>t.ownerId===o.id&&t.tacticalKind==='crab'));
   for(const t of children)near(buffMul(t).def,1+o.skill.blackboard['attack@def'],'crab defense');
   o.sp=0;o.cd=999;B.enemies=[];update(15,0);assert.equal(paid,12);assert.equal(s.dead,false);assert.equal(o.skillState,null);assert.ok(children.every(t=>t.removed));assert.equal(buffMul(s).def,1);
  }window.onSkillDp=callback;
 }
 // A manually opened window consumes an owned bench donor's copied attributes only.
 {const c=tacticCases.find(x=>x.charId==='char_249_mlyss'&&x.elite);const o=tacticBattle(c),run=G.ops[0],donor=addOperator('char_469_indigo',false);donor.row=null;donor.col=null;
  const preset=flowCopyPreset(run,donor.id);assert.equal(preset.charId,donor.charId);assert.equal(preset.atkType,'arts');assert.equal(Object.hasOwn(preset,'skill'),false);
  const s=ArkTactician.point(o);ArkTactician.advance(0);assert.equal(s.flow.kind,'base','SP alone never chooses a donor');assert.ok(ArkFlowShape.open(s));assert.ok(ArkFlowShape.copying(s));assert.ok(tacticalAction('copy-target',run.id,0,0,'up',donor.id,s.id));assert.equal(s.flow.sourceId,donor.charId);
  donor.row=3;donor.col=2;assert.equal(flowCopyPreset(run,donor.id),null);
  const calls=[];const ctx=new Proxy({arc(...args){assert.ok(args.every(Number.isFinite));calls.push('arc');},fillText(t){calls.push(t);}},{get:(t,k)=>t[k]||(()=>{})});
  (B.combatEffects||=[]).push({kind:'flow-pull',x:s.col,y:s.row,radius:1.5,at:B.time,duration:.35});ArkBattlePresentation.draw(ctx,B,50);assert.ok(calls.includes('arc'));assert.ok(calls.includes(preset.name));
 }
 // Placement exhaustion does not spend SP; flight never takes a wolf block slot.
 {const o=tacticBattle(tacticCases[0]);for(const s of B.summoneds)ArkTactician.remove(s);o.cells=[[o.row,o.col]];o.tacticalRetryAt=0;ArkTactician.advance();o.sp=o.skill.spCost;assert.equal(castSkill(o),false);assert.equal(o.sp,o.skill.spCost);}
 assert.equal(ArkFlowShape.pullDistance(1,0,3),0);near(ArkFlowShape.pullDistance(1,0,2),.03,'measured slight pull endpoint');near(ArkFlowShape.pullDistance(1,0,1),.35,'measured light pull endpoint');
 return receipts;
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));assert.equal(text.split(marker).length,2);injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:917,name:'tactical-batch'});
 try{
  const c=cases.find(c=>c.charId==='char_249_mlyss'&&c.elite&&c.index===2);
  runtime.__testMachine.run(`${helpers}const first=tacticBattle(${JSON.stringify(c)});first.playerId='one';first.skill.isPassive=true;first.cd=999;const token=ArkTactician.point(first);token.playerId='one';
   ArkFlowShape.copy(token,{charId:'fixture',name:'远程流形',maxHp:2000,atk:600,def:400,magicRes:20,blockCnt:1,attackTime:1.2,position:'RANGED',rangeGrids:[{row:0,col:0}],atkType:'arts'});token.flow.hits=9;
   for(let r=1;r<=5;r++)for(let c=14;c<=18;c++)BDATA.level.buildable[r][c]='MELEE';
   const second={...first,id:2,col:17,dir:'left',side:'right',playerId:'two',tacticalPlacement:{row:3,col:16,dir:'left'},tacticalRetryAt:0,buffs:[],flowCopyPreset:null};second.cells=rangeCellsFor(second);B.operators.push(second);ArkTactician.advance();const two=ArkTactician.point(second);two.hp=0;tryKill(two);tacticEnemy(401,token.col,token.row);`);
  runtime.advance(.3);const checkpoint=runtime.snapshot();assert.ok(checkpoint.battle.summoneds.some(s=>s.temporary&&s.playerId==='one'));assert.ok(checkpoint.battle.summoneds.some(s=>s.tacticalDormant&&s.playerId==='two'&&s.col>=Math.floor(checkpoint.battleLevel.cols/2)));
  runtime.advance(.8);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.8);const restored=runtime.snapshot();assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]});assert.deepEqual(restored.rng,after.rng);
 }finally{runtime.dispose();}
 const out=process.argv.indexOf('--receipts');if(out>=0)fs.writeFileSync(process.argv[out+1],JSON.stringify({receipts,libraryFixtures:4},null,2));
 console.log('TACTICIAN OK '+receipts.length+' fixed source configurations, 4 crab source fixtures, preparation/ownership/DP/restore/render checks');
}
main().catch(e=>{console.error(e);process.exitCode=1;});



