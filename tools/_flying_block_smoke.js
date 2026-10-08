'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'web'),f=require('./_browser_fixture')({root});
const source=JSON.parse(fs.readFileSync(path.join(root,'source_battles.json'),'utf8'));
const air={};
for(const level of Object.values(source.levels))for(const [id,e]of Object.entries(level.enemies))if(id.startsWith('enemy_1005_yokai'))air[id]=e;
assert.ok(air.enemy_1005_yokai,'real source 妖怪 must be included');
const groundRanged=Object.values(source.levels).map(level=>level.enemies.enemy_2010_csdcr).find(Boolean);
assert.ok(groundRanged&&!groundRanged.flying&&groundRanged.canAttack,'real ground ranged source must be included');
f.ctx.assert=assert;f.ctx.sourceAir=air;f.ctx.movementSources=[...Object.values(air).filter(e=>e.canAttack),groundRanged];
async function main(){
 await f.run('initMode()');
 f.run(`
 chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 const movementResults=[];
 for(const source of movementSources){
  B.over=false;B.phase='battle';B.time=0;B.roundTime=0;B.roundLimit=999;B.waveScheduler=null;
  B.enemies=[];B.projectiles=[];B.summoneds=[];B.operatorZones=[];B.combatEffects=[];B.leader=null;B.leaderEnemyId=null;
  BDATA.level={...BDATA.level,rows:10,cols:10,sourceRoutes:true,buildable:Array.from({length:10},()=>Array(10).fill('MELEE')),
   routes:[{segs:[[{c:2,r:4},{c:8,r:4}]]}]};
  // A durable nonblocking target remains in range across several attacks. Its
  // own attack range never touches the route; enemy stats/timers remain source data.
  const target={id:1,charId:'ordinary',position:'RANGED',row:5,col:4,dir:'right',cells:[[5,4]],rangeGrids:[{row:0,col:0}],
   atk:0,atkType:'phys',attackTime:1,cd:0,hp:1000000,maxHp:1000000,def:0,blockCnt:0,blocked:0,events:[],buffs:[],
   deployed:true,deployAt:0,deployT:1,sp:0,basicAttack:{kind:'single'}};
  B.operators=[target];BDATA.enemies[source.enemyId]=source;B.spawn=[{at:0,enemyId:source.enemyId,route:0},{at:999,enemyId:'none'}];
  update(0,0);const enemy=B.enemies[0];
  const result={id:source.enemyId,attacks:[],stoppedFrames:0,cooldownMovement:0,castMovement:0};
  let lastCast=null;
  for(let frame=0;frame<Math.ceil(source.attackTime*5*60);frame++){
   if(enemy.atkPhase&&enemy.atkAnimAt!==lastCast){lastCast=enemy.atkAnimAt;result.attacks.push({time:B.time,x:enemy.x});}
   const before={x:enemy.x,y:enemy.y,phase:enemy.atkPhase,cast:enemy.atkAnimAt};
   update(1/60,1/60);
   const moved=Math.hypot(enemy.x-before.x,enemy.y-before.y);
   if(before.phase&&enemy.atkPhase&&before.cast===enemy.atkAnimAt){
    if(moved>1e-9)result.castMovement++;else result.stoppedFrames++;
   }
   if(!before.phase&&!enemy.atkPhase&&!enemy.dead&&enemy.cd>0&&moved>1e-9&&
      Math.hypot(enemy.x-target.col,enemy.y-target.row)<=source.rangeRadius+.5)result.cooldownMovement++;
   assert.equal(enemy.blockerId??null,null,source.enemyId+' has no physical blocker in this fixture');
   assert.ok(!target.dead&&target.hp>0,'target must survive for the complete natural cadence');
  }
  result.x=enemy.x;result.damage=target.maxHp-target.hp;movementResults.push(result);
 }
 // Keep both source-class diagnostics when a shared timing regression occurs.
 for(const result of movementResults){
  assert.ok(result.attacks.length>=2,'repeated actual attacks: '+JSON.stringify(movementResults));
  assert.ok(result.damage>0,'source attack reaches the living target: '+JSON.stringify(movementResults));
  assert.ok(result.stoppedFrames>0&&result.castMovement===0,'normal attack animation holds position: '+JSON.stringify(movementResults));
  assert.ok(result.cooldownMovement>0&&result.attacks[1].x>result.attacks[0].x+.1,
   'natural attack -> cooldown movement -> next attack, without overriding enemy cooldown: '+JSON.stringify(movementResults));
 }
 for(const [id,source]of Object.entries(sourceAir))for(const prepend of [false,true]){
  assert.equal(source.flying,true,id);
  B.over=false;B.phase='battle';B.time=0;B.roundTime=0;B.roundLimit=999;B.waveScheduler=null;
  B.enemies=[];B.projectiles=[];B.summoneds=[];B.operatorZones=[];B.combatEffects=[];B.leader=null;B.leaderEnemyId=null;
  BDATA.level={...BDATA.level,rows:10,cols:10,sourceRoutes:true,buildable:Array.from({length:10},()=>Array(10).fill('MELEE')),
   routes:[{segs:[[{c:2,r:4},{c:8,r:4}]]}]};
  const guard={id:1,charId:'ordinary',position:'MELEE',row:4,col:4,dir:'right',cells:[[4,4]],rangeGrids:[{row:0,col:0}],
   atk:1,atkType:'phys',attackTime:1,cd:999,hp:100000,maxHp:100000,def:0,blockCnt:3,blocked:3,events:[],buffs:[],deployed:true,deployAt:0,deployT:1,sp:0,basicAttack:{kind:'single'}};
  B.operators=[guard];
  const ground=[-.2,0,.2].map((dy,i)=>({id:10+i,visualId:10+i,x:3.5,y:4+dy,route:0,seg:0,cp:1,wait:0,cd:0,blockerId:1,
   maxHp:10000,hp:10000,def:0,dead:false,canAttack:false,moveSpeed:1,applyWay:'MELEE',attackTime:1}));
  B.enemies=ground.slice();BDATA.enemies[id]=source;B.spawn=[{at:0,enemyId:id,route:0},{at:999,enemyId:'none'}];
  update(0,0);const drone=B.enemies.find(e=>!ground.includes(e));
  assert.equal(drone.flying,true,'source spawn preserves flight');
  if(prepend)B.enemies=[drone,...ground];
  for(let frame=0;frame<900;frame++){
   update(1/30,1/30);
   assert.equal(drone.blockerId??null,null,id+' must never acquire a blocker');
   assert.equal(guard.blocked,3,'the existing three ground blocks remain');
   assert.ok(ground.every(e=>e.blockerId===1&&e.x===3.5),'air does not displace or release any ground enemy');
   if(source.canAttack===false)assert.ok(!drone.atkPhase,'unarmed 妖怪 never attacks');
  }
  // Natural attack/cooldown scheduling must carry armed air past the occupied
  // ground tile too. Never clear its cast or inject a large cooldown here.
  assert.ok(drone.x>3.5||drone.dead,JSON.stringify({id,x:drone.x,cd:drone.cd,phase:drone.atkPhase,speed:drone.moveSpeed,seg:drone.seg,cp:drone.cp}));
 }
 `);
 console.log('FLYING BLOCK OK: real 妖怪/MKII spawn, three occupied ground slots, both array orders, natural armed-air/ground-ranged attack-stop-move cycles, durable targets, no forced enemy cooldown');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

