'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
const f=require('./_browser_fixture')(),source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const ids=f.run('ArkCommonSkills.supported.slice()');
const links=require('../web/battle_levels.json').operators.flatMap(e=>(chars[e.charId]?.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?[{charId:e.charId,index,id:s.skillId,name:e.name}]:[]));
const cases=links.flatMap(p=>source[p.id].levels.slice(0,[4,7,10][chars[p.charId].phases.length-1]).map((lv,i)=>({...p,level:i+1,
 expected:{bb:Object.fromEntries(lv.blackboard.map(x=>[x.key,x.value])),duration:lv.duration,spCost:lv.spData.spCost,initSp:lv.spData.initSp,spType:lv.spData.spType,spIncrement:lv.spData.increment,type:lv.skillType}})));
Object.assign(f.ctx,{assert,commonCases:cases});
const helpers=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function makeCommon(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],damageFeedback:[],summoneds:[],operators:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.charId]=c.index;ACCOUNT.ops[c.charId]={evolve:2,level:1,skillLevel:c.level,potential:1,selectedSkill:c.index,trust:0};
 const entry=debugTacticalEntry(c.charId);assert.ok(entry,c.charId+' accessible library entry');
 const r=finalizeOperator(entry,null,[],false);
 const grids=entryRangeGrids(entry,false);
 const o={...r,id:1,charId:c.charId,name:entry.name,position:entry.position,profession:entry.profession,dir:'right',row:3,col:3,
  rangeGrids:grids,range:3,hp:10000,maxHp:10000,atk:100,def:200,magicRes:0,attributeBase:{atk:100,def:200,aspd:1},attackTime:2,
  // Isolate the skill body from separately unverified talents/garrisons.
  combatTalents:[],events:[],attackCrit:null,garrisonAdd:null,cd:999,blockCnt:r.blockCnt,buffs:[],sp:0,deployAt:0,deployed:true,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function commonTarget(o){const cell=o.cells.find(c=>c[0]!==o.row||c[1]!==o.col)||[o.row,o.col];
 const e={id:100,enemyId:'enemy_1002_nsabr',x:cell[1],y:cell[0],hp:1e8,maxHp:1e8,atk:0,def:0,magicRes:0,moveSpeed:0,canAttack:false,stunUntil:999,route:0,seg:0,cp:0,cd:999};B.enemies=[e];return e;}
function commonHit(o){
 o.cd=0;o._droneTarget=null;o._droneHits=0;
 if(operatorAction(o)==='heal'){
  const cell=o.cells.find(c=>Math.hypot(c[0]-o.row,c[1]-o.col)===1)||[o.row,o.col];
  const ally={id:200,row:cell[0],col:cell[1],hp:1,maxHp:1e8,deployAt:0,deployT:2,basicAttack:{action:'damage'}};
  B.operators.push(ally);assert.equal(performHealingAction(o),true);B.operators.pop();return ally.hp-1;
 }
 const e=commonTarget(o);assert.equal(ArkOperatorCombat.attack(o),true,o.name+' actual attack');
 for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];return e.maxHp-e.hp;
}
`;
async function main(){
 await f.run('initMode()');
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helpers}
 const poolBefore=ROSTER_LIST.map(e=>e.charId).join(','),done=[];
 for(const c of commonCases){
  const o=makeCommon(c),s=o.skill,b=c.expected.bb,m=s.commonMechanic;
  assert.equal(s.sourceId,c.id);assert.ok(m,c.id);
  for(const k of ['spCost','initSp','spType','spIncrement','duration'])assert.equal(s[k],c.expected[k],c.charId+'/'+c.id+'/Lv'+c.level+'/'+k);
  assert.equal(s.realType,c.expected.type);assert.deepEqual(JSON.parse(JSON.stringify(s.blackboard)),JSON.parse(JSON.stringify(b)));
  assert.equal(rosterSkillDescription(c.charId,SKILL_CHOICES[c.charId].find(s=>s.skillId===c.id),c.level),s.realDesc,'library and combat description agree');
  if(c.level===1){const account=getOpAccount(c.charId);const excessive=normalizeOpAccount(c.charId,{...account,skillLevel:99});assert.equal(excessive.skillLevel,Math.min(maxSkillLevel(account.evolve),ArkCommonSkillData.skillLevels[c.id].length),'training stops at source skill maximum');}
  o.sp=s.spCost;
  if(m.kind==='deployment-buff'){
   assert.equal(castSkill(o),false);o.deployed=false;update(0,0);near(o.atk*buffMul(o).atk,100*(1+b.atk));near(o.def*buffMul(o).def,200*(1+b.def));
   assert.equal(o.buffs.filter(b=>b.commonDeployment).length,1);update(0,0);assert.equal(o.buffs.filter(b=>b.commonDeployment).length,1,'deploy once');
   B.time=s.duration;update(0,0);near(buffMul(o).atk,1);near(buffMul(o).def,1);
   o.deployed=false;update(0,0);o.hp=0;tryKill(o);assert.ok(!o.buffs.some(b=>b.commonDeployment));o.respawnAt=B.time;o.respawnCost=0;respawnOperators();o.deployT=2;update(0,0);near(o.atk*buffMul(o).atk,100*(1+b.atk),'fresh deployment buff');
  }else if(m.kind==='self-recovery'){
   assert.equal(castSkill(o),false,'full HP preserves SP');assert.equal(o.sp,s.spCost);o.hp=1000;
   assert.equal(castSkill(o),true);near(o.hp,1000+10000*b.heal_scale);assert.equal(o.sp,0);assert.ok(!o.skillState);
   assert.ok(B.combatEffects.some(e=>e.kind==='heal'));o.sp=s.spCost;o.hp=9999;castSkill(o);near(o.hp,10000,'recovery clamps to max HP');
  }else if(m.kind==='instant-dp'||m.kind==='periodic-dp'){
   B.dp=0;const gold=G.money;assert.equal(castSkill(o),true);
   if(m.kind==='periodic-dp'){assert.equal(operatorAction(o),'none');B.time=s.duration;update(0,0);near(B.dp,b.value,'whole stream once');update(0,0);near(B.dp,b.value);}
   else near(B.dp,b.cost);
   assert.equal(G.money,gold,'deployment fees are not shop gold');
  }else{
   const normalCells=JSON.stringify(o.cells),normalGrids=JSON.stringify(o.rangeGrids);
   assert.equal(castSkill(o),true);assert.equal(o.sp,0);assert.equal(castSkill(o),false);
   near(o.atk*buffMul(o).atk,100*(1+(b.atk||0)));near(o.def*buffMul(o).def,200*(1+(b.def||0)));
   near(ArkOperatorCombat.attackInterval(o,s),2/(1+(b.attack_speed||0)/100));
   const amount=commonHit(o);assert.ok(amount>0,c.charId+' actual damage/heal');
   const activeBuffs=o.buffs,activeProgram=o.clientProgramState;o.buffs=[];delete o.clientProgramState;const plain=commonHit(o);o.buffs=activeBuffs;if(activeProgram)o.clientProgramState=activeProgram;
   assert.ok(Math.abs(amount-plain*(1+(b.atk||0)))<=4,c.charId+'/'+c.id+' actual damage/heal matches source multiplier');
   if(m.family==='defense')assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},o),Math.round(1000-200*(1+b.def)),'actual physical damage uses strengthened defense');
   if(m.kind==='forward-range'){
    assert.ok(o.cells.length>JSON.parse(normalCells).length);
    const before=JSON.parse(normalGrids),front=Math.max(...before.filter(g=>g.row===0).map(g=>g.col));
    const ally={id:200,row:o.row,col:o.col+front+b.ability_range_forward_extend,hp:1,maxHp:1000,deployAt:0,deployT:2};
    B.operators.push(ally);o.cd=0;assert.equal(performHealingAction(o),true);assert.ok(ally.hp>1,'new forward cell heals');B.operators.pop();
   }
   B.time=s.duration;B.enemies=[];o.cd=999;update(0,0);assert.equal(o.skillState,null);near(buffMul(o).atk,1);near(buffMul(o).def,1);assert.equal(JSON.stringify(o.cells),normalCells);assert.equal(JSON.stringify(o.rangeGrids),normalGrids);
   o.sp=s.spCost;assert.equal(castSkill(o),true);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);
  }
  done.push({charId:c.charId,skillId:c.id,level:c.level,kind:m.kind});
 }
 assert.equal(ROSTER_LIST.map(e=>e.charId).join(','),poolBefore,'library testing never expands shop');
 // Four orientations: extend only the facing edge, keep the base source grids immutable.
 for(const dir of ['up','down','left','right']){
  const c=commonCases.find(c=>c.id==='skcom_range_extend'&&c.level===4),o=makeCommon(c);o.dir=dir;o.cells=rangeCellsFor(o);const old=JSON.stringify(o.rangeGrids);
  o.sp=o.skill.spCost;castSkill(o);const cells=o.cells.map(c=>c.join(','));assert.equal(new Set(cells).size,cells.length);assert.ok(o.cells.length>JSON.parse(old).length);endOperatorSkill(o);assert.equal(JSON.stringify(o.rangeGrids),old);
 }
 return done;
 })()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:212,name:'公共技能验证'});
 try{
  p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helpers);
  for(const skill of ['skcom_born_up[3]','skcom_range_extend','skcom_heal_self[3]','skcom_assist_cost[3]']){
   const c=cases.find(c=>c.id===skill&&c.level===7);assert.ok(c);
   p.__testMachine.run(`var testUnit=makeCommon(${JSON.stringify(c)});testUnit.playerId='one';testUnit.hp=1000;testUnit.sp=testUnit.skill.spCost;testUnit.deployed=false;update(0,0);
    var teammate={...testUnit,id:2,playerId:'two',col:4,sp:0,hp:5000,buffs:[],skillState:null,skillFx:0,deployed:true,skill:null};B.operators.push(teammate);
    if(!testUnit.skill.isPassive)castSkill(testUnit);`);
   const checkpoint=p.snapshot();assert.equal(checkpoint.battle.operators[1].buffs.length,0);assert.equal(checkpoint.battle.operators[1].hp,5000);
   p.advance(.35);const expected=p.snapshot();p.restore(checkpoint);p.advance(.35);const actual=p.snapshot();
   assert.deepEqual(actual.battle,expected.battle,skill+' exact signed battle replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/common-expansion-receipts.json'),JSON.stringify({date:'2026-09-14',scope:'account-level common skill bodies; not complete characters or shop eligibility',receipts},null,2));
 console.log('COMMON EXPANSION OK '+receipts.length+' per-identity/skill/level cases, '+new Set(receipts.map(c=>c.charId)).size+' characters, '+new Set(receipts.map(c=>c.skillId)).size+' skill IDs; four authoritative two-owner checkpoint replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

