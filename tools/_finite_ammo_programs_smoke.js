'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helper}
 const id='finite_ammo_contract_fixture';
 const program={controller:{kind:'cast_skill_with_limit_times',activation:'cast',duration_policy:'ammo_count',pre_delay:0,
  wait_for_casting:false,wait_for_attack_event:true,ammo:{count:{key:'count'},progressSource:'effective-main-attack',sourceCountEvent:4,
  expendPerTrigger:1,finishOnEmpty:true,canDiscardRemaining:true,resetAfterEnd:true,resetImmediatelyWhenProgressEnd:false,
  resetWhenAttackFinished:false,modeIndex:1}},source:{},buffs:[{id:'ammo-own',scope:'self',lifetime:{kind:'until_detach'},stacking:{max_stacks:1},
  modifiers:[{attribute:'atk',formula:'multiplier',value:{constant:.5}},{attribute:'taunt_level',formula:'addition',value:{constant:-1}}]}]};
 ArkSkillModeData.programs[id]=program;ArkSkillModeData.profiles[id]={prefabId:id,charIds:['char_290_vigna'],blackboardKeys:['count']};
 function fixture(){
  const o=makeMode({cid:'char_290_vigna',index:0,level:7});o.position='RANGED';o.blockCnt=0;
  o.skill={sourceId:id,name:'Finite ammo contract',blackboard:{count:3},spCost:10,duration:0,durationType:'AMMO',ammoCount:3,effects:[]};
  assert.equal(ArkClientPrograms.configure(o.skill,o.charId),true);o.sp=10;return o;
 }
 let o=fixture();
 for(const change of [{durationType:'NONE'},{ammoCount:2},{ammoCount:0},{duration:5}])
  assert.throws(()=>ArkClientPrograms.configure({...o.skill,...change},o.charId),/Invalid finite ammo/);
 assert.equal(castSkill(o),true);assert.equal(o.skillState.ammo,3);assert.equal(o.skillState.until,Number.MAX_SAFE_INTEGER);
 assert.equal(o.sp,0);assert.equal(ArkClientPrograms.targetPriority(o,B.time),-1);
 assert.equal(ArkOperatorCombat.attack(o),false);assert.equal(o.skillState.ammo,3,'no target consumes no bullet');
 B.time=100;ArkClientPrograms.tick(o,1,B.time);assert.equal(o.skillState.ammo,3,'zero source duration is not an expiry');
 const e=modeEnemy(o,100,{magicRes:0,def:0});
 const oldNotify=notifyGarrisonAmmo,notifications=[];
 notifyGarrisonAmmo=source=>{notifications.push(source.id);oldNotify(source);};
 for(let count=2;count>=0;count--){
  assert.equal(ArkOperatorCombat.attack(o),true);assert.equal(o.skillState?.ammo||0,count);
  assert.equal(o.sp,0,'the exhausting attack cannot refund its own SP');
 }
 assert.deepEqual(notifications,[1,1,1],'one common notification per spent bullet');
 assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);assert.equal(ArkClientPrograms.targetPriority(o,B.time),0);
 assert.equal(B.projectiles.length,3,'launched bodies survive ammo exhaustion');
 for(const shot of B.projectiles)assert.equal(shot.plan.power,200,'each shot freezes active attack power before depletion');
 // A missed/removed target does not refund bullets or suppress their notifications.
 e.dead=true;settleMode();assert.equal(notifications.length,3);assert.equal(o.skillState,null);
 o.sp=10;assert.equal(castSkill(o),true);assert.equal(o.skillState.ammo,3,'a new activation has a fresh source count');
 endOperatorSkill(o);assert.equal(o.clientProgramState,undefined);assert.equal(ArkClientPrograms.targetPriority(o,B.time),0);
 o=fixture();assert.equal(castSkill(o),true);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.clientProgramState,undefined);
 // The actual ordinary enemy attack entry reads live priority, not only the
 // source EnemySkill selector. A physical blocker remains a separate policy.
 o=fixture();assert.equal(castSkill(o),true);o.cd=999;
 const other=modeAlly(o,2,{col:4,row:3,deployT:2,deployAt:0,deployed:true,skill:null,skillState:null,clientProgramState:undefined,blockCnt:0});
 const enemy=modeEnemy(o,200,{enemyId:'taunt-contract-enemy',x:5,y:3,canAttack:true,applyWay:'RANGED',rangeRadius:5,attackTime:2,cd:0,flying:true});
 update(0,0);assert.equal(enemy.atkTarget,other,'negative active taunt avoids ordinary ranged targeting');
 finishEnemyAttack(enemy);enemy.cd=0;endOperatorSkill(o);o.sp=0;
 update(0,0);assert.equal(enemy.atkTarget,o,'expiry restores equal-priority stable board order');
 finishEnemyAttack(enemy);enemy.cd=0;o.untargetable=true;
 update(0,0);assert.equal(enemy.atkTarget,other,'shared qualification excludes an untargetable candidate');
 notifyGarrisonAmmo=oldNotify;
 `);
 console.log('FINITE AMMO PROGRAMS OK strict controller, idle/ammo lifetime, launch consumption, notifications, SP lock, frozen final shots, end/death/recast and actual enemy hatred');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
