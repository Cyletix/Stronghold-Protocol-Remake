'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function segment(source,start,end){
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 assert.ok(begin>=0&&finish>begin,'bounded runtime segment exists');return source.slice(begin,finish);
}
function setup(){
 const c=vm.createContext({assert,console});c.window=c;
 for(const file of ['web/external_combat_data.js','web/src/simulation/external-combat.js','web/src/simulation/enemy-skills.js'])vm.runInContext(read(file),c,{filename:file});
 vm.runInContext(`
  const data=ArkExternalCombatData.enemies.enemy_1373_ltnhor_2;
  assert.equal(data.skills.length,2,'test uses both actual compiled source skills');
  const normal=data.skills.find(s=>s.modeIndices.includes(0));
  const alternate=data.skills.find(s=>s.modeIndices.includes(1));
  function enemy(extra={}){
   const e={enemyId:'enemy_1373_ltnhor_2',x:0,y:0,rangeRadius:4,hp:9000,dead:false,...extra};
   ArkExternalCombat.configure(e);ArkEnemySkills.configure(e);return e;
  }
  function target(id,col,extra={}){return {id,col,row:0,hp:100,deployAt:id,deployT:1,...extra};}
  function context(candidates,extra={}){return {time:10,interval:3,channel:'attack',candidates,...extra};}
  function charge(e){
   const schedule={channel:'attack',modeIndex:e.externalCombatMode};
   assert.equal(ArkEnemySkills.onSpellOn(e,schedule),true);
   assert.equal(ArkEnemySkills.onSpellOn(e,schedule),false,'one charge per spell-on regardless of repeated callback');
   return schedule;
  }
 `,c);return c;
}

test('explicit source skill overrides and legacy ownership cannot create a duplicate or fallback skill',()=>{
 const c=setup();vm.runInContext(`
  let e=enemy({sourceSkills:[]});e.externalSkills.sp=2;
  assert.equal(ArkEnemySkills.start(e,context([target(1,1)])),null,'an explicit empty skills table cannot inherit compiled source skills');
  assert.equal(Object.keys(e.externalSkills.skills).length,0);
  assert.equal(ArkEnemySkills.ownsLegacy(e,{prefabKey:normal.skillKey}),true,'old shortcut is suppressed for the same compiled source key');
  assert.equal(ArkEnemySkills.ownsLegacy(e,{prefabKey:'unrelated-skill'}),false,'unrelated legacy mechanics remain owned by their existing path');
  e=enemy({sourceSkills:null});e.externalSkills.sp=2;
  assert.equal(ArkEnemySkills.start(e,context([target(1,1)])),null,'an explicit malformed skills table cannot inherit compiled source skills');
  e=enemy({sourceSkills:[{prefabKey:normal.skillKey,blackboard:[],priority:normal.priority,spCost:0,
   cooldown:0,initCooldown:0}]});
  let cast=ArkEnemySkills.start(e,context([target(1,1)]));assert.ok(cast,'literal zero SP cost stays zero');
  assert.equal(e.externalSkills.sp,0);assert.equal(cast.schedule.skillId,normal.id);
  e.sourceSkills.push({...e.sourceSkills[0]});
  assert.equal(ArkEnemySkills.start(e,context([target(1,1)])),null,'duplicate source keys cannot choose one silently');
  e=enemy({sourceSkills:[{prefabKey:normal.skillKey,blackboard:[{key:'max_target',value:0}]}]});e.externalSkills.sp=2;
  assert.equal(ArkEnemySkills.start(e,context([target(1,1)])),null,'invalid exact override cannot fall back to defaults');
 `,c);
});

test('one owner SP pool persists across modes while selected skill counters remain separate',()=>{
 const c=setup();vm.runInContext(`
  const e=enemy(),a=target(1,1);const saved=charge(e);
  ArkEnemySkills.tick(e,100,{});assert.equal(e.externalSkills.sp,1,'literal zero source regen never becomes time charging');
  ArkExternalCombat.setMode(e,1);assert.equal(e.externalSkills.sp,1);
  assert.equal(ArkEnemySkills.onSpellOn(e,saved),false,'former mode schedule cannot charge again');
  charge(e);let cast=ArkEnemySkills.start(e,context([a]));assert.equal(cast.schedule.skillId,alternate.id);
  assert.equal(e.externalSkills.sp,0);assert.equal(e.externalSkills.skills[alternate.id].casts,1);
  assert.equal(e.externalSkills.skills[normal.id].casts,0);
  e.atkSchedule=cast.schedule;e.atkPhase='windup';e.atkTarget=a;e.atkTargets=cast.targets;
  assert.equal(ArkEnemySkills.start(e,context([a])),null,'an active cast occupies the shared action lane');
  assert.equal(ArkEnemySkills.onSpellOn(e,cast.schedule),false,'skill emissions cannot charge their own SP');
  ArkExternalCombat.setMode(e,0);assert.equal(e.atkSchedule,null);assert.equal(e.externalSkills.sp,0,'cancel has no refund');
  assert.equal(cast.schedule.skillFinished,true);assert.equal(e.externalSkills.skills[alternate.id].casts,1);
  charge(e);charge(e);cast=ArkEnemySkills.start(e,context([a]));
  assert.equal(cast.schedule.skillId,normal.id);assert.equal(e.externalSkills.skills[normal.id].casts,1);
  assert.equal(e.externalSkills.skills[alternate.id].casts,1);
 `,c);
});

test('locked target sets, serialized references and spell-on charge markers survive checkpoint restore',()=>{
 const c=setup();
 vm.runInContext(segment(read('web/engine.js'),'function performEnemyBasicHit(','function finishEnemyProjectile('),c);
 vm.runInContext(segment(read('tools/lib/room-game-runtime.js'),'function roomBattleLinks(','function roomCapture('),c);
 vm.runInContext(`
  function enemyDamageToOperator(){return 10;}
  function spawnProjectile(packet){B.projectiles.push(packet);return packet;}
  function gameRandom(){return 1;}
  function operatorDodge(){return 0;}
  const ENEMY_PROJECTILE_SPEED=8;
  const a=target(1,1),b=target(2,2),later=target(3,3,{tauntLevel:5});
  const e=enemy();B={operators:[a,b,later],enemies:[e],projectiles:[]};charge(e);charge(e);
  const cast=ArkEnemySkills.start(e,context(B.operators,{blocker:a}));
  assert.deepEqual(Array.from(cast.targets,x=>x.id),[a.id,later.id],'physical blocker wins first, then highest hatred');
  e.atkSchedule=cast.schedule;e.atkPhase='windup';e.atkTargets=cast.targets;e.atkTarget=cast.targets[0];
  b.tauntLevel=100;const links=roomBattleLinks();B=JSON.parse(JSON.stringify(B));roomRestoreBattleLinks(links);
  const restored=B.enemies[0];
  assert.equal(restored.atkTarget,B.operators[0]);assert.equal(restored.atkTargets[1],B.operators[2]);
  B.operators[0].dead=true;performEnemyBasicHit(restored,restored.atkTargets,4);
  assert.equal(B.projectiles.length,1,'dead locked target is dropped, newly higher hatred is not substituted');
  assert.equal(B.projectiles[0].target,B.operators[2]);assert.equal(restored.externalSkills.sp,0);
  const projectile=B.projectiles[0];ArkExternalCombat.setMode(restored,1);
  assert.equal(B.projectiles[0],projectile,'mode switch retains already emitted projectiles');
  const pLinks=roomBattleLinks();B=JSON.parse(JSON.stringify(B));roomRestoreBattleLinks(pLinks);
  assert.equal(B.projectiles[0].owner,B.enemies[0]);assert.equal(B.projectiles[0].target,B.operators[2]);
  const restoredEnemy=B.enemies[0];const normalSchedule=charge(restoredEnemy);
  restoredEnemy.atkSchedule=normalSchedule;const chargedLinks=roomBattleLinks();
  B=JSON.parse(JSON.stringify(B));roomRestoreBattleLinks(chargedLinks);
  assert.equal(ArkEnemySkills.onSpellOn(B.enemies[0],B.enemies[0].atkSchedule),false);
  assert.equal(B.enemies[0].externalSkills.sp,1,'restoring a charged normal cast never duplicates SP');
 `,c);
});
