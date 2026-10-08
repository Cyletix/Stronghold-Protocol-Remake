'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
const helpers=`
function recoveryUnit(level=10){
 const charId=ArkClientProgramData.profiles.skchr_yak_1.charIds[0];
 G.skillChoices[charId]=0;ACCOUNT.ops[charId]={evolve:2,level:1,skillLevel:level,potential:1,selectedSkill:0,trust:0};
 const entry=debugTacticalEntry(charId)||ROSTER[charId];
 const r=finalizeOperator(entry,null,[],false);
 startBattle([{...r,id:1,charId,row:3,col:3,dir:'up',hp:400,maxHp:1000,atk:0,def:0,
  attributeBase:{...r.attributeBase,atk:0,maxHp:1000},combatTalents:[],events:[],garrisonStats:null,garrisonAdd:null}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 const o=B.operators[0];o.cd=999;o.deployAt=0;o.deployT=2;o.hp=400;o.maxHp=1000;
 o.sp=o.skill.spCost;assert.equal(o.skill.sourceId,'skchr_yak_1');assert.equal(castSkill(o),true);return o;
}
function near(a,b,label){assert.ok(Math.abs(a-b)<1e-7,label+': '+a+' != '+b);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
 for(let level=1;level<=10;level++){
  const o=recoveryUnit(level),base=o.hp,rate=o.skill.blackboard.hp_recovery_per_sec;
  assert.ok(o.skill.clientProgram);assert.deepEqual(o.skill.effects,[]);
  for(let n=0;n<15;n++)update(1/30,1/60);
  near(o.hp,base+rate*.5,'source recovery level '+level);
  ArkClientPrograms.advance(o,B.time,1/30,healOperator);near(o.hp,base+rate*.5,'same-tick replay');
  const remaining=o.skillState.until-B.time;
  // Large tick crosses expiry: only the actual live fraction heals.
  o.hp=10;B.time=o.skillState.until-.01;o.clientProgramState.recoveryAt=B.time;
  update(.03,.015);near(o.hp,(10+rate*.01)/(1+o.skill.blackboard.max_hp),'final partial tick and HP ratio restore');
  assert.equal(o.clientProgramState,undefined);
 }
 let o=recoveryUnit(),base=o.hp;o.stunUntil=B.time+1;update(.5,.25);
 near(o.hp,base+20,'regeneration continues during stun');
 o.basicAttack={...operatorAttackProfile(o),noRegeneration:true};base=o.hp;update(.2,.1);near(o.hp,base,'no-regeneration gate');
 o.basicAttack.noRegeneration=false;o.hp=o.maxHp-1;update(.2,.1);near(o.hp,o.maxHp,'cap');
 o.hp=0;tryKill(o);assert.equal(o.clientProgramState,undefined);
 // Public block-count layer: zero scaler and additive modifiers are read by
 // the real blocker consumer and disappear without rewriting base blockCnt.
 o=recoveryUnit();const before=o.blockCnt;
 o.clientProgramState.buffs[0].modifiers.push({attribute:'block_cnt',formula:'final_scaler',value:0});
 assert.equal(operatorBlockCount(o),0);assert.equal(o.blockCnt,before);
 endOperatorSkill(o);assert.equal(operatorBlockCount(o),before);
 o=recoveryUnit();const ordinary={blockCnt:3,basicAttack:{action:'attack'}};
 const oldBlock=o.blockCnt;o.clientProgramState.buffs[0].modifiers.push({attribute:'block_cnt',formula:'addition',value:2});
 assert.equal(operatorBlockCount(o),oldBlock+2);assert.equal(operatorBlockCount(ordinary),3);
 endOperatorSkill(o);assert.equal(operatorBlockCount(o),oldBlock);assert.equal(operatorBlockCount(ordinary),3);
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:619});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helpers+'recoveryUnit();update(.25,.125);');
  const checkpoint=runtime.snapshot();runtime.advance(.5);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.5);
  assert.deepEqual(runtime.snapshot().battle.operators,expected.battle.operators,'host regeneration cursor restores without duplicate healing');
 }finally{runtime.dispose();}
 console.log('PROGRAM RECOVERY OK 10 source levels, actual regeneration, partial expiry, status/cap/death gates, block consumer and host restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
