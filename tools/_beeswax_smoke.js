'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const levels=['skchr_beewax_1','skchr_beewax_2'].flatMap((id,slot)=>skills[id].levels.map((s,i)=>({id,slot,level:i+1,sp:s.spData.spCost,init:s.spData.initSp,duration:s.duration,bb:Object.fromEntries(s.blackboard.map(b=>[b.key,b.value]))})));
const tokens=chars.token_10011_beewax_oblisk.phases.slice(1).flatMap((p,i)=>p.attributesKeyFrames.map(f=>({phase:i+1,level:f.level,hp:f.data.maxHp,def:f.data.def,atk:f.data.atk})));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function beeswax(c,entry=null,elite=false){
 const cid='char_344_beewax';ACCOUNT.ops[cid]={evolve:c.phase??2,level:c.charLevel??1,skillLevel:c.level,potential:1,trust:0,selectedSkill:c.slot};G.skillChoices[cid]=c.slot;
 const e=entry||debugTacticalEntry(cid),stats=finalizeOperator(e,null,[],elite);
 startBattle([{...stats,id:1,charId:cid,name:e.name,profession:e.profession,position:e.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(e,elite),garrisonAdd:null}],[],100);
 Object.assign(B,{dp:7,time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];Object.assign(o,{sp:0,cd:0,deployAt:0,deployT:2,deployed:true});return o;
}
function emptyMelee(cells){const lv=BDATA.level;lv.buildable=Array.from({length:lv.rows},()=>Array(lv.cols).fill('NONE'));for(const [r,c]of cells){lv.buildable[r][c]='MELEE';lv.grid[r][c]='tile_road';}}
function foe(x,y,extra={}){const e={id:100+B.enemies.length,enemyId:'fixture',x,y,hp:100000,maxHp:100000,def:0,magicRes:0,atk:10,canAttack:true,applyWay:'MELEE',rangeRadius:0,moveSpeed:0,attackTime:2,cd:999,path:[{x,y},{x:x+2,y}],pi:1,...extra};B.enemies.push(e);return e;}
function startSkill(o){o.sp=o.skill.spCost;assert.equal(castSkill(o),true);}
function verify(c,entry=null,elite=false){
 let o=beeswax(c,entry,elite),before=JSON.stringify(o.cells),hp=o.maxHp;assert.equal(o.skill.spCost,c.sp);assert.equal(o.skill.initSp,c.init);assert.equal(o.skill.duration,c.duration);
 const ratio=o.basicAttack.training.evolve===1?.025:.04;o.hp=hp/2;ArkOperatorCombat.update(1);near(o.hp,hp*(.5+ratio),'idle source recovery');o.basicAttack.noDirectHeal=true;ArkOperatorCombat.update(.5);near(o.hp,hp*(.5+ratio*1.5),'regen ignores direct healing prohibition');o.basicAttack.noDirectHeal=false;
 near(buffMul(o).def,1+o.attributeBase.def*2/o.def,'idle phalanx defense');assert.equal(operatorAction(o),'none');
 emptyMelee([[3,6]]);const ground=foe(6,3),air=foe(6,3,{flying:true}),immune=foe(6,3,{stunImmune:true}),outside=foe(8,3);
 startSkill(o);assert.equal(o.skillState.until,c.duration);near(buffMul(o).def,1,'skill removes passive defense');near(o.sp,0);const healthy=o.hp;ArkOperatorCombat.update(.5);near(o.hp,healthy,'skill stops idle regeneration');
 if(c.slot===0){
  assert.equal(B.summoneds.length,0);assert.equal(o.skill.rangeGrids.length,o.cells.length);near(buffMul(o).atk,1+o.attributeBase.atk*c.bb.atk/o.atk);
  const a=ground.hp,b=air.hp;ArkOperatorCombat.attack(o);assert.ok(ground.hp<a&&air.hp<b,'S1 range-all arts including air');
 }else{
  assert.equal(B.summoneds.length,1);const s=B.summoneds[0];assert.equal(s.charId,'token_10011_beewax_oblisk');assert.equal(s.row,3);assert.equal(s.col,6);assert.equal(s.blockCnt,3);assert.equal(s.canAttack,false);assert.equal(B.dp,7,'skill does not cost DP');
  near(100000-ground.hp,Math.round(operatorAttackPower(o,buffMul(o).atk)*c.bb.atk_scale),'current caster-power interpretation');near(100000-air.hp,100000-ground.hp);near(ground.stunUntil,c.bb.stun);assert.equal(immune.stunUntil,undefined);assert.equal(outside.hp,100000);assert.ok(B.combatEffects.some(e=>e.kind==='obelisk-rise'));
  s.hp-=100;assert.equal(healOperator(o,s,100),0);assert.equal(healOperator(o,s,100,{regen:true}),0);assert.equal(healOperator(s,s,100,{regen:true}),0);assert.equal(healOperator(s,s,100),0,'obelisk cannot heal itself');
  s.hp=s.maxHp;o.cd=999;const firstHp=ground.hp;B.time=1;update(.1,.1);assert.equal(ground.hp,firstHp,'obelisk has no recurring attack');
 }
 endOperatorSkill(o);assert.equal(JSON.stringify(o.cells),before);assert.ok(B.summoneds.every(s=>s.dead));near(buffMul(o).def,1+o.attributeBase.def*2/o.def);o.hp=hp/2;ArkOperatorCombat.update(1);near(o.hp,hp*(.5+ratio),'end restores idle recovery');
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,levelCases:levels,tokenCases:tokens});f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of levelCases)verify(c);`);
 f.run(`for(const t of tokenCases){const c={...levelCases.at(-1),phase:t.phase,charLevel:t.level},o=beeswax(c);emptyMelee([[3,6]]);startSkill(o);const s=B.summoneds[0];near(s.maxHp,t.hp);near(s.def,t.def);near(s.atk,t.atk);near(s.magicRes,10);}`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');for(const e of Object.values(ROSTER).filter(e=>e.charId==='char_344_beewax'))for(const elite of [false,true])for(const slot of [0,1]){const tr=trainingProfile(e,elite),c=levelCases.find(c=>c.slot===slot&&c.level===tr.skillLevel);verify(c,e,elite);done.push([sid,elite,slot]);}}return done;})()`);assert.equal(bindings.length,4);
 f.run(`{
 const c=levelCases.at(-1);let o=beeswax(c);emptyMelee([]);const random=ArkSim.snapshot();startSkill(o);assert.equal(B.summoneds.length,0);assert.equal(operatorAction(o),'attack');assert.equal(JSON.stringify(ArkSim.snapshot()),JSON.stringify(random),'no tile consumes no selection RNG');
 o=beeswax(c);emptyMelee([[3,6],[3,7],[4,6]]);B.operators.push({id:2,row:3,col:6,hp:100});B.traps=[{id:'trap',row:4,col:6}];startSkill(o);assert.equal(B.summoneds.length,1);assert.equal(B.summoneds[0].col,7);B.traps=[];
 o=beeswax(c);emptyMelee([[3,6]]);startSkill(o);let s=B.summoneds[0];const e1=foe(6,3),e2=foe(6,3),e3=foe(6,3),e4=foe(6,3),air=foe(6,3,{flying:true});ArkOperatorCombat.assignBlocks();assert.equal([e1,e2,e3,e4].filter(e=>e.blockerId===s.id).length,3);assert.equal(air.blockerId,null);
 s.hp=0;tryKill(s);ArkOperatorCombat.assignBlocks();assert.ok([e1,e2,e3].every(e=>e.blockerId!==s.id));B.time=100;assert.equal(s.dead,true,'no cooldown revival');
 o=beeswax(c);emptyMelee([[3,6]]);startSkill(o);s=B.summoneds[0];assert.equal(ArkTactician.retreat(s),true);assert.equal(s.removed,true);assert.equal(s.tacticalDormant,false);
 o=beeswax(c);emptyMelee([[3,6]]);startSkill(o);s=B.summoneds[0];o.hp=0;tryKill(o);assert.equal(s.dead,true);B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);assert.ok(B.summoneds.every(x=>x.dead),'owner return does not resurrect previous obelisk');
 o=beeswax(c);emptyMelee([[3,6]]);startSkill(o);s=B.summoneds[0];B.time=19.9;update(.1,.1);assert.ok(s.dead,'20s expiry');
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:51666,name:'尖碑'});
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);rt.__testMachine.run(`var o=beeswax(${JSON.stringify(levels.at(-1))});o.playerId='one';emptyMelee([[3,6],[3,7],[4,6]]);o.sp=o.skill.spCost;B.operators.push({...o,id:2,playerId:'two',row:7,col:1,sp:0});`);
  const checkpoint=rt.snapshot();rt.__testMachine.run('castSkill(B.operators[0])');rt.advance(.7);const expected=rt.snapshot();rt.restore(checkpoint);rt.__testMachine.run('castSkill(B.operators[0])');rt.advance(.7);const actual=rt.snapshot();assert.deepEqual(actual.battle,expected.battle);assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.summoneds[0].playerId,'one');assert.equal(actual.battle.summoneds[0].ownerId,1);
  const live=rt.snapshot();rt.advance(20);const expired=rt.snapshot();rt.restore(live);rt.advance(20);assert.deepEqual(rt.snapshot().battle,expired.battle);assert.deepEqual(rt.snapshot().rng,expired.rng);
 }finally{rt.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/beeswax-receipts.json'),JSON.stringify({skillLevels:levels.length,tokenFrames:tokens.length,bindings,signedReplays:2,limits:'uniform legal-cell selection, caster damage snapshot and immediate spawn are local interpretations; exact client selection/timing and module HP bonus pending'},null,2));
 console.log('BEESWAX OK 20 skill levels, 4 token endpoints, '+bindings.length+' hidden-slot variants, blocker/expiry/death/regeneration and signed RNG restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
