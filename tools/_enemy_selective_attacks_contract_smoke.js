'use strict';
// These assertions verify the simulation contract, not native ordering proof.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const ROOT=path.resolve(__dirname,'..');
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function setup(){
 const c=vm.createContext({console});c.window=c;
 for(const file of ['web/external_combat_data.js','web/src/simulation/external-combat.js','web/src/simulation/enemy-selective-attacks.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),c,{filename:file,displayErrors:false});
 const api=c.ArkEnemySelectiveAttacks;
 const enemy={enemyId:'enemy_9021_acduml_2',hp:5000,x:0,y:0,cd:7,externalCombatMode:0};
 const boss={enemyId:'enemy_9023_acdums',hp:5000,x:50,y:40,externalCombatMode:1};
 const ally=(id,col=50,row=40,extra={})=>({id,col,row,hp:1000,deployT:1,deployAt:0,...extra});
 const a=ally('a'),b=ally('b',51,40,{deployAt:1});
 const context={time:5,interval:8,channel:'attack',candidates:[a,b],allEntities:[enemy,boss,a,b],attackPower:400,outputScale:1.2};
 const begin=(ctx=context)=>{const result=api.start(enemy,ctx);if(result)enemy.atkSchedule=result.schedule;return result;};
 return {c,api,enemy,boss,a,b,ally,context,begin,data:api.profile(enemy)};
}
test('actual closed provider uses one shared ordinary cooldown and existing timing cursor',()=>{
 const {api,enemy,boss,context,begin,data}=setup();
 const result=begin();assert.ok(result);assert.equal(result.targets[0],boss);assert.equal(result.schedule.branchIndex,0);
 assert.equal(enemy.cd,7);assert.equal(result.schedule.skillId,undefined);assert.equal(result.schedule.provider,'enemy-selective-attacks');
 assert.equal(result.schedule.nextHit,0);assert.equal(result.schedule.elapsed,0);assert.equal(result.schedule.hitOffsets.length,3);
 const timing=data.action.timing;
 near(result.schedule.hitOffsets[0],timing.hit);
 near(result.schedule.hitOffsets[1]-result.schedule.hitOffsets[0],.25);
 near(result.schedule.hitOffsets[2]-result.schedule.hitOffsets[0],.5);
 near(result.schedule.total,timing.duration);
 const quick=api.start(enemy,{...context,interval:.01});
 near(quick.schedule.hitOffsets[0],timing.hit*.1);
 near(quick.schedule.hitOffsets[1]-quick.schedule.hitOffsets[0],.25);
 near(quick.schedule.total,quick.schedule.hitOffsets[2]);
 assert.equal(api.enabled(enemy,'combat'),false);
 assert.equal(api.enabled({...enemy,externalCombatMode:1}),false);
 assert.equal(api.profile({...enemy,bossMechanics:{attack:{}}}),null);
 enemy.targetFree=true;enemy.untargetable=true;
 assert.ok(api.start(enemy,context),'being unselectable does not itself forbid the owner from attacking');
});
test('global branch qualification uses exact source mode; fallback uses live hatred without range or blocker',()=>{
 const {c,api,enemy,boss,a,b,context}=setup();
 boss.externalCombatMode=0;boss.rank=1;boss.modeIndex=1;
 a.tauntLevel=10;b.tauntLevel=2;
 assert.equal(api.start(enemy,context).targets[0],a);
 c.ArkClientPrograms={targetPriority:target=>target===b?30:0};
 assert.equal(api.start(enemy,context).targets[0],b);
 boss.externalCombatMode=1;
 assert.equal(api.start(enemy,context).targets[0],boss,'first eligible source branch wins over opponent hatred');
 for(const flag of ['dead','removed','untargetable','targetFree']){
  boss[flag]=true;assert.equal(api.start(enemy,context).targets[0],b,flag);delete boss[flag];
 }
 boss.invisibleUntil=6;assert.equal(api.start(enemy,context).targets[0],b);
 boss.invisibleUntil=0;boss.camouflageUntil=6;assert.equal(api.start(enemy,context).targets[0],b);
 boss.camouflageUntil=0;
 assert.equal(api.start(enemy,{...context,allEntities:[enemy,a,b]}).targets[0],b,'no stale entity references');
 assert.equal(api.start(enemy,{...context,candidates:[],allEntities:[enemy]}),null);
});
test('each shot freezes its source packet and locked target; finished or invalid casts cannot emit',()=>{
 const {api,enemy,boss,context,begin,data}=setup();
 const {schedule,targets}=begin();
 const [shot]=api.delivery(enemy,schedule,targets,context);
 assert.equal(shot.target,boss);assert.equal(shot.speed,10);assert.equal(shot.life,10);
 assert.equal(shot.enemyActionPacket.atk,400);assert.equal(shot.enemyActionPacket.damageType,'arts');
 assert.equal(shot.enemyActionPacket.outputScale,1.2);assert.equal(shot.enemyActionPacket.castEndPolicy,'emitted-projectiles-independent');
 data.projectile.radius=99;assert.notEqual(shot.enemyActionPacket.radius,99);
 schedule.selectablePacket.projectile.speed=12;assert.equal(shot.enemyActionPacket.projectile.speed,10);
 const [next]=api.delivery(enemy,schedule,targets,{...context,attackPower:250});
 assert.equal(next.enemyActionPacket.atk,250);assert.equal(shot.enemyActionPacket.atk,400);
 boss.externalCombatMode=0;boss.camouflageUntil=10;
 assert.equal(api.delivery(enemy,schedule,targets,context).length,1,'selection is locked at cast start');
 boss.dead=true;assert.equal(api.delivery(enemy,schedule,targets,context).length,0,'no fallback target after selection');
 boss.dead=false;enemy.atkSchedule=null;assert.equal(api.delivery(enemy,schedule,targets,context).length,0,'finished cast');
 enemy.atkSchedule=schedule;enemy.dead=true;assert.equal(api.delivery(enemy,schedule,targets,context).length,0,'dead source');
 enemy.dead=false;
 assert.equal(api.delivery(enemy,schedule,targets,{...context,allEntities:[enemy]}).length,0,'removed target reference');
});
test('impact circle filters opposing entities then adds the live trace once, independently of source death',()=>{
 const {api,enemy,boss,a,b,ally,context,begin}=setup();
 const {schedule,targets}=begin();
 const [shot]=api.delivery(enemy,schedule,targets,context);
 const p={...shot,x:boss.x,y:boss.y,owner:enemy};
 const edge=ally('edge',boss.x+shot.enemyActionPacket.radius,boss.y,{flying:true});
 const outside=ally('outside',boss.x+shot.enemyActionPacket.radius+.001,boss.y);
 const hidden=ally('hidden',50,40,{invisibleUntil:10,camouflageUntil:10});
 const forbidden=ally('forbidden',50,40,{targetFree:true});
 const stale=ally('stale');
 const ctx={...context,candidates:[a,b,b,edge,outside,hidden,forbidden,stale],allEntities:[enemy,boss,a,b,edge,outside,hidden,forbidden]};
 const victims=api.areaVictims(p,ctx);
 assert.deepEqual(Array.from(victims),[a,b,edge,hidden,boss]);
 enemy.dead=true;enemy.atkSchedule=null;
 assert.equal(api.projectileTarget(p,ctx),boss);assert.deepEqual(Array.from(api.areaVictims(p,ctx)),[a,b,edge,hidden,boss]);
 p.target=a;assert.equal(api.areaVictims(p,ctx).filter(target=>target===a).length,1,'trace already in circle must not double hit');
 p.target=boss;boss.x=100;assert.ok(api.areaVictims(p,ctx).includes(boss),'end trace policy is independent of circle distance');
 boss.removed=true;assert.equal(api.projectileTarget(p,ctx),null);assert.ok(!api.areaVictims(p,ctx).includes(boss));
});
test('action cursor and emitted packets survive JSON snapshots without new nested entity references',()=>{
 const {api,enemy,boss,context,begin}=setup();
 const {schedule,targets}=begin();schedule.nextHit=1;schedule.elapsed=schedule.hitOffsets[0];
 const [shot]=api.delivery(enemy,schedule,targets,context);
 const frozen=clone({schedule,projectile:{x:boss.x,y:boss.y,enemyActionPacket:shot.enemyActionPacket}});
 assert.equal(frozen.schedule.nextHit,1);near(frozen.schedule.elapsed,schedule.elapsed);
 assert.equal(JSON.stringify(frozen).includes('"hp"'),false,'only existing top-level links contain entities');
 const restoredEnemy=clone(enemy),restoredBoss=clone(boss);
 restoredEnemy.atkSchedule=frozen.schedule;
 const restored={...context,allEntities:[restoredEnemy,restoredBoss,...context.candidates]};
 assert.equal(api.delivery(restoredEnemy,frozen.schedule,[restoredBoss],restored).length,1);
 const p={...frozen.projectile,owner:restoredEnemy,target:restoredBoss};
 assert.equal(api.projectileTarget(p,restored),restoredBoss);
 assert.ok(api.areaVictims(p,restored).includes(restoredBoss));
 assert.equal(api.projectileTarget({...p,target:boss},restored),null,'unrebound snapshot clone is rejected');
});
test('unsupported explicit policies or malformed action data fail as a whole',()=>{
 for(const modify of [
  d=>{d.projectile.tracePolicy='ignore-side';},
  d=>{d.projectile.castEndPolicy='clear-at-cast-end';},
  d=>{d.branches[1].selector.side='ally';},
  d=>{d.action.repeat.interval=-1;},
  d=>{d.action.maxAnimScale=0;},
 ]){
  const {api,enemy,context,data}=setup();modify(data);assert.equal(api.start(enemy,context),null);
 }
});
