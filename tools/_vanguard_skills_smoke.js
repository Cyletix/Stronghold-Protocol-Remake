'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const ids=['skchr_scave_2','skchr_blackd_2','skchr_texas_2'];
const cases=Object.entries(chars).flatMap(([cid,c])=>(c.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?source[s.skillId].levels.map((raw,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value])),duration:raw.duration,spCost:raw.spData.spCost,initSp:raw.spData.initSp})):[]));
const helper=`
function near(a,b){assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);}
function vanguard(c,entry=null,elite=false){
 G.skillChoices[c.cid]=c.index;
 ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const e=entry||debugTacticalEntry(c.cid),r=finalizeOperator(e,null,[],elite);
 const o={...r,id:1,charId:c.cid,name:e.name,position:e.position,profession:e.profession,row:3,col:3,dir:'right',range:1,rangeGrids:entryRangeGrids(e,elite),
  hp:10000,maxHp:10000,atk:100,def:200,attackTime:2,attributeBase:{atk:100,def:200,aspd:1},atkType:'phys',cd:999,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);startBattle([o],[],100);
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[o],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null,dp:0,dpMax:99,dpProgress:0,dpInterval:1e12});
 BDATA.level.buildable[o.row][o.col]='MELEE';return o;
}
function enemyAt(x,y,id=100){
 const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,hp:1e6,maxHp:1e6,atk:0,def:10000,magicRes:37,moveSpeed:0,speed:0,canAttack:false,cd:999,route:0,seg:0,cp:0,skills:[],effects:[],events:[],buffs:[]};B.enemies.push(e);return e;
}
function step(seconds,dt=1/30){for(let t=0;t<seconds-1e-9;t+=dt)update(Math.min(dt,seconds-t),0);}
function verifyVanguard(c,entry=null,elite=false){
 const o=vanguard(c,entry,elite),s=o.skill,b=c.bb,money=G.money,block=operatorBlockCount(o),cells=JSON.stringify(o.cells);
 assert.equal(s.sourceId,c.id);assert.equal(s.spCost,c.spCost);assert.equal(s.initSp,c.initSp);assert.equal(s.duration,c.duration);
 assert.equal(JSON.stringify(s.blackboard),JSON.stringify(b));
 assert.equal(castSkill(o),true,'DP skill may activate without enemies');assert.equal(o.sp,0);
 assert.equal(castSkill(o),false,'one SP charge cannot be spent twice');
 assert.equal(operatorAction(o),'attack');assert.equal(operatorBlockCount(o),block);
 assert.equal(B.dp,c.id==='skchr_blackd_2'?3:b.cost);assert.equal(G.money,money);
 if(c.id==='skchr_texas_2'){
  assert.ok(!o.skillState);assert.equal(JSON.stringify(o.cells),cells,'instant skill preserves normal range');
  assert.equal(B.combatEffects.find(fx=>fx.kind==='sword-rain').cells.length,13);
  const pool=rangeCellsFor({...o,rangeGrids:s.rangeGrids}).map(([r,col],i)=>enemyAt(col,r,100+i));
  pool[0].flying=true;pool[1].stunImmune=true;
  const outside=enemyAt(o.col+2,o.row+1,199),border=enemyAt(o.col+2.5,o.row,198),sleep=enemyAt(o.col,o.row,197);sleep.sleepUntil=99;
  let basicHits=0,skillCasts=0;const basic=onBasicAttackHit,bond=window.onBondGarrison;
  try{onBasicAttackHit=()=>basicHits++;window.onBondGarrison=()=>skillCasts++;o.garrisonAdd={};o.sp=s.spCost;assert.equal(castSkill(o),true);}finally{onBasicAttackHit=basic;window.onBondGarrison=bond;o.garrisonAdd=null;}
  assert.equal(basicHits,0,'Sword Rain is not a basic-attack trigger');assert.equal(skillCasts,1);
  for(const e of pool){assert.equal(e.maxHp-e.hp,2*Math.round(100*b.atk_scale*.63),'two independently mitigated arts hits');near(e.stunUntil||0,e.stunImmune?0:b.stun);}
  for(const e of [outside,border,sleep])assert.equal(e.hp,e.maxHp);
  for(const dir of ['up','down','left','right']){o.dir=dir;o.sp=s.spCost;const behind=enemyAt(o.col-1,o.row,200);castSkill(o);assert.ok(behind.hp<behind.maxHp,'skill diamond is independent of facing');}
  o.sp=s.spCost;B.dp=98;castSkill(o);assert.equal(B.dp,99);assert.equal(B.dpProgress,0);
 }else{
  const courier=c.id==='skchr_blackd_2',mul=buffMul(o);
  near(mul.atk,courier?1:1+b.atk);near(mul.def,courier?1+b['blackd_s_2[period].def']:1);
  // Actual attack and incoming damage use the sustained modifier; blocking stays enabled.
  const e=enemyAt(o.col+.5,o.row);e.magicRes=0;e.def=30;o.cd=0;
  ArkOperatorCombat.assignBlocks();assert.equal(e.blockerId,o.id);
  assert.equal(ArkOperatorCombat.attack(o),true);for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];
  assert.equal(e.maxHp-e.hp,Math.round(100*mul.atk-30));
  near(enemyDamageToOperator({atk:1000,atkType:'phys'},o),Math.round(1000-200*mul.def));
  B.enemies=[];o.cd=999;
  if(courier){step(1.86);assert.equal(B.dp,3);step(.01);assert.equal(B.dp,4,JSON.stringify({entry:entry?.chessId,elite,time:B.time,phase:B.phase,over:B.over,state:o.skillState,dead:o.dead}));step(15-1.87);}else step(15);
  assert.equal(B.dp,11);assert.equal(o.skillState,null);near(o.sp,0);near(buffMul(o).atk,1);near(buffMul(o).def,1);
  step(.5);near(o.sp,.5);assert.equal(B.dp,11);
  o.sp=s.spCost;castSkill(o);o.hp=0;tryKill(o);const paid=B.dp;assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);step(3);assert.equal(B.dp,paid,'death cancels remaining DP');
 }
 assert.equal(G.money,money);return o;
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,vanguardCases:cases,sourceSeasons:seasons,skillSource:source});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of vanguardCases)verifyVanguard(c);
 `);
 const bindings=f.run(`(()=>{const verified=[];
 for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  const before=ROSTER_LIST.map(e=>e.chessId).join(',');
  for(const entry of ROSTER_LIST){const c=vanguardCases.find(c=>c.cid===entry.charId);if(!c)continue;
   for(const elite of [false,true]){
    const slot=sourceSeasons[sid].charShopChessDatas[entry.chessId],status=sourceSeasons[sid].charChessDataDict[elite?slot.goldenChessId:slot.chessId].status;
    const exact=vanguardCases.find(c=>c.cid===entry.charId&&c.level===status.skillLevel);assert.ok(exact);
    verifyVanguard(exact,entry,elite);verified.push([sid,entry.charId,elite?'elite':'normal'].join('/'));
   }
  }assert.equal(ROSTER_LIST.map(e=>e.chessId).join(','),before,'skill support never expands shop roster');
 }return verified;})()`);
 // Courier ledger: batched time, the cap, death/redeployment, and recovery use the same scheduler.
 f.run(`{
 const c=vanguardCases.find(c=>c.id==='skchr_blackd_2'&&c.level===7);
 let o=vanguard(c);castSkill(o);step(15,3);assert.equal(B.dp,11);assert.equal(o.skillState,null);near(o.sp,0);
 o=vanguard(c);B.dp=98;castSkill(o);step(4);assert.equal(B.dp,99);B.dp=90;step(.01);assert.equal(B.dp,90,'capped ticks are not banked');step(1.6);assert.equal(B.dp,91);
 o=vanguard(c);castSkill(o);step(4);const paid=B.dp;o.hp=0;tryKill(o);assert.equal(o.skillState,null);step(2);assert.equal(B.dp,paid);
 o.dead=false;o.deployed=true;o.hp=o.maxHp;o.deployAt=0;o.sp=o.skill.spCost;castSkill(o);assert.equal(B.dp,paid+3);step(1.87);assert.equal(B.dp,paid+4,'new deployment gets its own stream');
 const saved=JSON.stringify(B.combatEffects);assert.ok(saved.includes('dp-gain'));
 assert.throws(()=>ArkOperatorCombat.configure({sourceId:'skchr_scave_2',blackboard:{atk:.7,cost:11,unknown:1},duration:15}),/Invalid/);
 // FX uses source cells at several tile sizes, expires, and never falls through to a bomb radius.
 const texas=vanguard(vanguardCases.find(c=>c.id==='skchr_texas_2'));castSkill(texas);
 const fx=B.combatEffects.find(e=>e.kind==='sword-rain');let strokes=0;
 const ctx=new Proxy({},{get:(_,key)=>(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),key+' finite');if(key==='stroke')strokes++;}});
 for(const tile of [32,64,110]){const before=strokes;ArkBattlePresentation.draw(ctx,{time:.1,phase:'battle',operators:[],enemies:[],combatEffects:[fx]},tile,0);assert.equal(strokes-before,13);}
 const before=strokes;ArkBattlePresentation.draw(ctx,{time:1,phase:'battle',operators:[],enemies:[],combatEffects:[fx]},64,0);assert.equal(strokes,before,'expired swords are not drawn');
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:149198,name:'先锋技能'});
 try{
  p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   p.__testMachine.run(`var caster=vanguard(${JSON.stringify(c)});caster.playerId='one';var target=enemyAt(caster.col+1,caster.row);castSkill(caster);
    var ally={...caster,id:2,playerId:'two',col:5,hp:5000,buffs:[],sp:0,skill:null,skillState:null,cd:999};B.operators.push(ally);`);
   p.advance(.1);const checkpoint=p.snapshot();p.advance(3.9);const expected=p.snapshot();p.restore(checkpoint);p.advance(3.9);const actual=p.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' signed restore');assert.deepEqual(actual.rng,expected.rng);
   assert.equal(actual.battle.operators[1].hp,5000);assert.equal(actual.battle.operators[1].sp,0);assert.equal(actual.battle.operators[1].buffs.length,0);
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/vanguard-skill-receipts.json'),JSON.stringify({date:'2026-09-14',levels:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level})),bindings,limits:'Sword Rain exact frame spacing not known; talents/modules are separate checks'},null,2));
 console.log('VANGUARD SKILLS OK '+cases.length+' source-level executions, '+bindings.length+' season variants, 3 signed two-owner replays');
 console.log(bindings.join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
