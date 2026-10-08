'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {enemyVariant}=require('./lib/source-battle');
const raw=require('../data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json');
const db=new Map(raw.enemies.map(x=>[x.Key,x.Value])),live=require('../web/battle_data.json');
const ids=['enemy_1067_snslime','enemy_1069_icebrk','enemy_1069_icebrk_2'];
const bases=Object.fromEntries(ids.map(id=>[id,enemyVariant({id,level:0,useDb:true},db,live.enemies[id])]));
const f=require('./_browser_fixture')();f.ctx.assert=assert;f.ctx.coldBases=bases;
const helpers=`
function coldBattle(keepAlive=true){
 startBattle([1,2,3].map((id,i)=>({id,charId:'char_002_amiya',col:3+i,row:3+(i===1?1:0),position:'MELEE',maxHp:10000,atk:0,def:100+100*i,attackTime:100,blockCnt:0,range:0})),[],100);
 B.waveScheduler=null;B.spawn=keepAlive?[{at:999,enemyId:'unused',route:0}]:[];B.enemies=[];
 B.operators.sort((a,b)=>a.id-b.id);
 for(const o of B.operators){o.cd=999;o.deployed=true;o.deployT=5;o.deployAt=0;o.skill=null;o.events=[];}
}
function coldEnemy(id='enemy_1067_snslime',extra={}){
 const base=coldBases[id],e={...base,x:3,y:3,hp:base.maxHp,route:-1,cd:999,dead:false,visualId:100+B.enemies.length,...extra};
 setupEnemy(e,base);B.enemies.push(e);return e;
}
function stepCold(n){for(let i=0;i<n&&!B.over;i++)update(1/30,1/60);}
`;
async function main(){
 await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onLeak=()=>{};${helpers}
 coldBattle(false);const e=coldEnemy();assert.equal(e.deathCold.scale,2);assert.equal(e.deathCold.duration,10);
 for(const id of Object.keys(coldBases)){
  const legacy=BATTLE.enemies[id],unit={...legacy};setupEnemy(unit,legacy);
  assert.equal(unit.atk,legacy.atk,id+' legacy classifier cannot give unconditional attack bonus');
  assert.equal(unit.atkType,'phys',id+' handbook PHYSIC overrides legacy magic-resistance guess');assert.equal(unit.applyWay,'MELEE');assert.equal(unit.canAttack,true);assert.equal(unit.flying,false);
  if(unit.frozenAttackScale)assert.ok(legacy.talents.some(t=>t.type==='buff_atk'),'regression fixture actually exercises old talent classification');
 }
 for(const stage of Object.values(SOURCE_BATTLES.levels))for(const id of Object.keys(coldBases)){
  const variant=stage.enemies[id];if(!variant)continue;const unit={...variant};setupEnemy(unit,variant);
  const bb=Object.fromEntries(variant.sourceTalentBlackboard.map(x=>[x.key,x.value]));
  if(unit.deathCold){assert.equal(unit.deathCold.scale,bb['boom.atk_scale']);assert.equal(unit.deathCold.duration,bb['boom.freeze']);}
  else {assert.equal(unit.frozenAttackScale,bb['atkup.atk_scale']);assert.equal(unit.atk,variant.atk);}
 }
 killEnemy(e);killEnemy(e);assert.equal(B.projectiles.length,1,'true death schedules once');
 const shot=B.projectiles[0];e.atk=99999;stepCold(29);
 assert.equal(B.over,false,'last enemy death waits for explosion');assert.equal(B.operators[0].hp,10000);
 stepCold(2);assert.equal(B.over,true);assert.equal(B.operators[0].hp,9500);assert.equal(B.operators[1].hp,9600,'diagonal target uses its defense');assert.equal(B.operators[2].hp,10000,'2 tiles outside circular blast');
 assert.ok(B.operators[0].coldUntil>B.time);assert.equal(buffMul(B.operators[0]).aspd,.7);
 const arrow=spawnProjectile({kind:'arrow',enemy:false,life:1,x:0,y:0,tx:1,ty:1,speed:1});assert.strictEqual(arrow,shot);assert.equal(arrow.coldSource,null,'pooled payload cleared');
 coldBattle();const op=B.operators[0];op.buffs=[{aspd:1.5}];ArkEnemyCold.apply(op,10,B.time);assert.equal(buffMul(op).aspd,1.2,'cold subtracts 30 speed, does not multiply by 0.7');
 B.time=2;ArkEnemyCold.apply(op,10,B.time);assert.equal(op.frozenUntil,12);assert.equal(op.coldUntil,0);assert.equal(operatorCanAct(op),false);
 op.skill={spCost:1,duration:1,effects:[]};op.sp=1;assert.equal(castSkill(op),false,'frozen blocks skill activation');
 B.time=4;ArkEnemyCold.apply(op,10,B.time);assert.equal(op.frozenUntil,14,'enemy cold refreshes existing enemy freeze');
 B.time=14;assert.equal(operatorCanAct(op),true);assert.equal(ArkEnemyCold.display(op,B.time),null);
 ArkEnemyCold.apply(op,5,B.time);B.time=19;assert.equal(buffMul(op).aspd,1.5,'cold expires without residual attack-speed change');
 op.frozenImmune=true;ArkEnemyCold.apply(op,10,B.time);ArkEnemyCold.apply(op,10,B.time);assert.ok(op.coldUntil>B.time);assert.equal(ArkEnemyCold.frozen(op,B.time),false);delete op.frozenImmune;
 ArkEnemyCold.clear(op);op.statusResistance=.5;ArkEnemyCold.apply(op,10,B.time);assert.equal(op.coldUntil,24);delete op.statusResistance;
 ArkEnemyCold.clear(op);op.coldImmune=true;ArkEnemyCold.apply(op,10,B.time);assert.equal(op.coldUntil,0);delete op.coldImmune;
 // Both extracted icebreakers: base ATK unchanged, scale only against currently frozen targets, before DEF.
 for(const id of ['enemy_1069_icebrk','enemy_1069_icebrk_2']){
  const breaker=coldEnemy(id),scale=id.endsWith('_2')?3:2.5;assert.equal(breaker.atk,coldBases[id].atk,id+' must not receive old unconditional buff_atk');
  assert.equal(breaker.frozenAttackScale,scale);ArkEnemyCold.clear(op);
  assert.equal(enemyDamageToOperator(breaker,op),breaker.atk-op.def);ArkEnemyCold.apply(op,10,B.time);assert.equal(enemyDamageToOperator(breaker,op),breaker.atk-op.def,'cold alone gives no bonus');
  ArkEnemyCold.apply(op,10,B.time);breaker.silenceUntil=999;assert.equal(enemyDamageToOperator(breaker,op),breaker.atk*scale-op.def,'NORMAL talent is not silenceable');
  op.frozenUntil=B.time;assert.equal(enemyDamageToOperator(breaker,op),breaker.atk-op.def,'expiry removes bonus');
  const variant={...coldBases[id],sourceTalentBlackboard:[{key:'atkup.atk_scale',value:1.7}]},unit={...variant};setupEnemy(unit,variant);assert.equal(unit.frozenAttackScale,1.7,'stage override wins');
 }
 // Actual windup -> melee hit, not just a damage-helper call; the second hit is normal after expiry.
 coldBattle();const target=B.operators[0],striker=coldEnemy('enemy_1069_icebrk_2');
 target.blockCnt=1;target.buffs=[];striker.x=target.col;striker.y=target.row-.5;striker.cd=0;
 BDATA.level.buildable[target.row][target.col]='MELEE';
 stepCold(1);assert.equal(striker.atkPhase,'windup');
 const freezeDuration=striker.atkSchedule.windup+.5;
 ArkEnemyCold.apply(target,freezeDuration,B.time);ArkEnemyCold.apply(target,freezeDuration,B.time);
 // Follow the generated source attack event instead of the old 29-frame
 // approximation, which stopped one frame before the current melee emission.
 stepCold(Math.ceil(striker.atkSchedule.windup*30));assert.equal(target.hp,6800,'frozen target takes 1100*3-100 at melee impact');
 const nextHitBudget=Math.ceil((striker.attackTime+striker.atkSchedule.windup)*30);
 for(let frames=0;frames<nextHitBudget&&target.hp===6800;frames++)stepCold(1);
 assert.equal(target.hp,5800,'next melee attack after thaw takes 1100-100');
 coldBattle();const silenced=coldEnemy(undefined,{silenceUntil:1});killEnemy(silenced);assert.equal(B.projectiles.length,0,'silenced death cannot explode');
 const revived=coldEnemy();revived.revive=true;killEnemy(revived);assert.equal(B.projectiles.length,0,'revive is not final death');killEnemy(revived);assert.equal(B.projectiles.length,1);
 coldBattle();const leaked=coldEnemy();leaked.dead=true;leak(leaked);assert.equal(B.projectiles.length,0,'leaking is not death');
 coldBattle();const inv=B.operators[0];inv.dodge=1;const air=B.operators[1];air.flying=true;const waiting=B.operators[2];waiting.col=3;waiting.deployAt=999;
 killEnemy(coldEnemy());stepCold(31);assert.ok(B.operators.every(o=>o.hp===10000&&!o.coldUntil),'dodged, airborne and undeployed targets excluded');
 coldBattle();B.operators[0].col=4.65;B.operators[1].col=4.6501;B.operators[1].row=3;B.operators[2].col=5;
 const token={...B.operators[0],id:10,col:3,row:4,life:99,ownerId:B.operators[0].id,combatToken:true,playerId:'ally'};B.summoneds=[token];
 killEnemy(coldEnemy());stepCold(31);assert.ok(B.operators[0].hp<10000,'circle includes boundary');assert.equal(B.operators[1].hp,10000);assert.ok(token.coldUntil>B.time,'summon and other player affected');
 const victim=B.operators[0];ArkEnemyCold.apply(victim,10,B.time);victim.hp=0;tryKill(victim);assert.equal(victim.frozenUntil,0);assert.equal(victim.coldUntil,0);
 victim.respawnAt=B.time;window.onRespawn=()=>true;respawnOperators();assert.equal(victim.dead,false);assert.equal(ArkEnemyCold.display(victim,B.time),null,'redeployment clears statuses');
 token.hp=0;tryKill(token);assert.equal(token.coldUntil,0,'dead summons clear status');
 let circles=[],labels=[];const canvas=new Proxy({arc(x,y,r){circles.push(r)},fillText(t){labels.push(t)}},{get:(t,k)=>t[k]||(()=>{})});
 B.over=false;B.projectiles=[{kind:'death-cold',life:1,tx:3,ty:3,radius:1.65}];ArkBattlePresentation.drawAreas(canvas,B,50);assert.ok(circles.includes(82.5),'warning circle matches actual hit radius');
 victim.deployT=5;ArkEnemyCold.apply(victim,10,B.time);ArkBattlePresentation.draw(canvas,B,50);assert.ok(labels.some(t=>t.startsWith('寒冷')));ArkEnemyCold.apply(victim,10,B.time);ArkBattlePresentation.draw(canvas,B,50);assert.ok(labels.some(t=>t.startsWith('冻结')));
 })()`);
 // Real server VM / authenticated checkpoint, with both owners in one field.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(source.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:113,name:'冰爆复核'});
 try{
  runtime.startBattle();runtime.__testMachine.context.coldBases=bases;
  runtime.__testMachine.run(`${helpers}coldBattle();B.operators[0].playerId='one';B.operators[1].playerId='two';killEnemy(coldEnemy());`);
  runtime.advance(.2);const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.projectiles[0].owner,null);
  runtime.advance(.4);const impact=runtime.snapshot();assert.equal(impact.battle.operators[0].hp,9500);assert.equal(impact.battle.operators[1].hp,9600);
  runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.4);assert.deepEqual(runtime.snapshot().battle,impact.battle,'cold/dead-source explosion round-trip deterministically');
  runtime.__testMachine.run('killEnemy(coldEnemy());');runtime.advance(.6);const frozen=runtime.snapshot();assert.ok(frozen.battle.operators[0].frozenUntil>frozen.battle.time);
  runtime.advance(.1);const after=runtime.snapshot();runtime.restore(frozen);runtime.advance(.1);assert.deepEqual(runtime.snapshot().battle,after.battle,'frozen countdown survives authenticated restore');
 }finally{runtime.dispose();}
 console.log('ENEMY COLD OK: 3 source IDs, conditional pre-defense multipliers, delayed circular death blast, cold/freeze/expiry, immunity/dodge, death/redeploy, render geometry, both owners and authenticated restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
