'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
const setup=`
function modeProviderBattle(enemyId='enemy_4001_toxcar',blocked=true){
 startBattle([{id:1,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:10000,atk:0,def:0,magicRes:0,attackTime:100,blockCnt:1,range:0}],[],100);
 B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
 Object.assign(B.operators[0],{cd:999,deployed:true,deployT:5,deployAt:0,skill:null,events:[],dodge:0});
 const e={enemyId,x:blocked?3:5,y:blocked?2.5:3,hp:10000,maxHp:10000,atk:100,def:0,rangeRadius:3,
  applyWay:'RANGED',attackTime:2,moveSpeed:0,atkType:'phys',dead:false,cd:0,visualId:22,route:-1};
 setupEnemy(e,{talents:[],skills:[]});B.enemies.push(e);return e;
}
function modeProviderStep(n=1){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await fixture.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${setup}
 const data=ArkExternalCombatData;
 assert.equal(Object.values(data.enemies).filter(p=>p.modeProviders?.some(x=>x.kind==='blocked-toggle-mode')).length,2);
 assert.equal(data.enemies.enemy_2013_csbot.modeProviders,undefined,'missing mode 0 must not acquire a partial provider');
 for(const id of ['enemy_4001_toxcar','enemy_4001_toxcar_2']){
  let e=modeProviderBattle(id);assert.equal(e.externalCombatMode,0);modeProviderStep();
  const p=data.enemies[id].modeProviders[0];
  assert.equal(e.externalCombatMode,1);assert.equal(e.externalModeProviders[p.id].active,true);
  assert.equal(e.atkSchedule.delivery,'direct');
  const cast=e.atkSchedule;modeProviderStep(3);assert.equal(e.atkSchedule,cast,'steady blocking does not restart a cast every frame');
  B.operators[0].blockCnt=0;modeProviderStep();
  assert.equal(e.externalCombatMode,0);assert.equal(e.externalModeProviders[p.id].active,false);
  assert.equal(e.atkSchedule,null,'detaching the old mode cancels its pending cast');
  e.cd=0;modeProviderStep();assert.equal(e.atkSchedule.delivery,'projectile');
  assert.equal(e.externalCombatMode,0,'a ranged target is not a physical blocker');
  modeProviderStep(50);assert.ok(B.operators[0].hp<10000,'restored mode executes its projectile attack');
  e=modeProviderBattle(id);modeProviderStep();e.silenced=true;modeProviderStep();
  assert.equal(e.externalCombatMode,0,'silencing the carrier talent removes its mode Buff');
  e.silenced=false;modeProviderStep();assert.equal(e.externalCombatMode,1,'active checker remounts the Buff after silence');
  e.stunUntil=B.time+10;B.operators[0].blockCnt=0;modeProviderStep();
  assert.equal(e.externalCombatMode,0,'passive checker is evaluated through the action stun gate');
  e=modeProviderBattle(id,false);e.sourceTalentBlackboard=[{key:'cnt',value:0}];modeProviderStep();
  assert.equal(e.externalCombatMode,1,'native cnt overrides the lower bound, including zero');
  e=modeProviderBattle(id);e.sourceTalentBlackboard=[{key:'cnt',value:2}];modeProviderStep();
  assert.equal(e.externalCombatMode,0,'blocked boolean cannot satisfy a threshold of two');
  e=modeProviderBattle(id);e.bossMechanics={attack:{}};modeProviderStep();
  assert.equal(e.externalCombatMode,0);assert.equal(e.externalModeProviders,undefined,'dedicated Boss retains ownership');
 }
 const e=modeProviderBattle(),p=data.enemies[e.enemyId].modeProviders[0];
 const invalid=JSON.parse(JSON.stringify(p));invalid.events.ON_BUFF_START.push({kind:'unhandled-side-effect'});
 assert.equal(ArkExternalCombat.dispatchModeEvent(e,invalid,'ON_BUFF_START'),false);
 assert.equal(e.externalCombatMode,0,'unknown sibling prevents every action of the event');
 invalid.events.ON_BUFF_START=[{...p.events.ON_BUFF_START[0],restartFSM:true}];
 assert.equal(ArkExternalCombat.dispatchModeEvent(e,invalid,'ON_BUFF_START'),false,'broader FSM restart is not silently ignored');
 assert.equal(e.externalCombatMode,0);
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:114,name:'公共模式事件'});
 try{
  runtime.startBattle();runtime.__testMachine.run(setup+'modeProviderBattle();');runtime.advance(.2);
  const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.enemies[0].externalCombatMode,1);
  assert.ok(Object.values(checkpoint.battle.enemies[0].externalModeProviders)[0].active);
  runtime.__testMachine.run('B.operators[0].blockCnt=0;');runtime.advance(.4);const after=runtime.snapshot();
  assert.equal(after.battle.enemies[0].externalCombatMode,0);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));
  runtime.__testMachine.run('B.operators[0].blockCnt=0;');runtime.advance(.4);
  assert.deepEqual(runtime.snapshot().battle,after.battle,'restoring the active Buff dispatches its finish edge exactly once');
 }finally{runtime.dispose();}
 console.log('MODE PROVIDERS OK: shared blocked Buff edges, real mode attacks, cnt, silence, stun, whole-event rejection and VM restore');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
