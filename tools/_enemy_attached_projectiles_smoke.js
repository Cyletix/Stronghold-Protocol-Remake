'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const record=require('../web/enemy_encounters.json').enemies.enemy_1112_emppnt;
const old=fs.readFileSync(require.resolve('./_enemy_selective_attacks_smoke'),'utf8').match(/const helpers=`([\s\S]*?)`;/)[1];
// Reuse the existing real battle setup, with this source encounter and local positions.
const helpers=old.replace('${JSON.stringify(record)}',JSON.stringify(record))+`
function attachedBattle(){const e=selectiveBattle();Object.assign(e,{x:5,y:3,moveSpeed:0});
 B.operators[2].row=3.5;B.operators[2].col=6;B.operators[3].col=9;return e;}
function attachedShots(){return B.projectiles.filter(p=>p.enemyActionPacket?.provider==='enemy-attached-projectiles');}
function attachedStart(e){selectiveUntil(()=>e.atkSchedule?.attachedProjectile);return e.atkSchedule;}
function attachedFirst(e){const s=attachedStart(e);selectiveUntil(()=>s.nextHit===1);return attachedShots()[0];}
`;
async function main(){
 const f=require('./_browser_fixture')();f.ctx.assert=assert;await f.run(`(async()=>{await initMode();chooseBand('band_amiya');window.onBattleEnd=()=>{};${helpers}
 let e=attachedBattle(),s=attachedStart(e);assert.equal(e.rangeRadius,2);assert.equal(e.atkTarget,B.operators[0]);
 assert.equal(s.damageType,'phys');assert.equal(s.channel,'attack');assert.ok(Math.abs(s.total-1.1666666)<1e-7);
 selectiveUntil(()=>s.nextHit===1);let p=attachedShots()[0];assert.ok(p);const atk=p.enemyActionPacket.atk,at=p.resolveAt;
 assert.ok(Math.abs(at-B.time-3)<1e-7);assert.deepEqual(selectiveLosses(),[0,0,0,0]);
 assert.equal(p.tx,6);assert.equal(p.ty,3);e.atk=9000;e.cd=999;B.operators[0].col=10;
 // Current occupants are hit even if trace and owner disappear; no forced trace damage.
 B.operators[1].row=3;B.operators[1].col=6;const target=B.operators[1];
 B.time=at-.0001;update(0,0);assert.equal(target.hp,100000);
 e.hp=0;killEnemy(e);B.time=at;update(0,0);
 assert.equal(attachedShots().length,0);assert.equal(B.operators[0].hp,100000);
 assert.equal(target.hp,100000-Math.round(Math.max(atk-100,atk*.05)));
 assert.equal(B.operators[2].hp,target.hp,'impact ignores camouflage but respects the locked area');assert.equal(B.operators[3].hp,100000);
 const after=target.hp;update(0,0);assert.equal(target.hp,after,'exactly one area impact');
 // Generic source-marker query is a fixture; this batch does not invent a marker producer.
 e=attachedBattle();B.operators[1].sourceMarkerBuffs=[{key:'mark_neutral[effect]',until:20}];s=attachedStart(e);
 assert.equal(e.atkTarget,B.operators[1],'marked group before unmarked high hatred');
 e=attachedBattle();for(const o of B.operators)o.col=20;selectiveStep(10);assert.ok(!e.atkSchedule,'no generic out-of-range fallback');
 e=attachedBattle();s=attachedStart(e);e.stunUntil=20;selectiveStep();assert.equal(e.atkSchedule,null);assert.equal(attachedShots().length,0);
 // Capped animation releases walking while the ordinary cooldown is still live.
 e=attachedBattle();p=attachedFirst(e);e.route=0;e.seg=0;e.cp=1;e.moveSpeed=.5;e.wait=0;
 selectiveUntil(()=>!e.atkSchedule);const startX=e.x,startY=e.y;assert.ok(e.cd>0);
 selectiveStep(3);assert.ok(Math.hypot(e.x-startX,e.y-startY)>0,'natural post-animation walking');assert.ok(e.cd>0);
 // Dead selected target before emission suppresses delivery rather than retargeting.
 e=attachedBattle();s=attachedStart(e);B.operators[0].hp=0;tryKill(B.operators[0]);selectiveUntil(()=>s.nextHit===1);assert.equal(attachedShots().length,0);
 // The other ordinary channel uses the same complete selector and packet.
 e=attachedBattle();const ground=BDATA.level.buildable.flatMap((row,r)=>row.map((kind,c)=>({kind,col:c,row:r}))).find(c=>c.kind!=='RANGED');
 Object.assign(B.operators[0],{...ground,blockCnt:1});Object.assign(e,{x:ground.col,y:ground.row,flying:false,unblockable:false});
 s=attachedStart(e);assert.equal(s.channel,'combat');assert.equal(s.attachedProjectile,true);
 // Delayed shots keep the round alive when its final enemy is removed.
 e=attachedBattle();p=attachedFirst(e);B.spawn=[];e.hp=0;killEnemy(e);selectiveStep();assert.equal(B.over,false);assert.equal(attachedShots().length,1);
 // Pool reuse clears the delayed provider and deadline.
 B.time=p.resolveAt;update(0,0);const plain=spawnProjectile({kind:'arrow',x:0,y:0,tx:1,ty:1,life:1});
 assert.equal(plain.enemyActionPacket,null);assert.ok(!plain.resolveAt);
})()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:89112,name:'固定落点延迟弹体'}),hostRestores=[];
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helpers);
  for(const phase of ['windup','emitted','owner-dead']){
   rt.__testMachine.run(`var e=attachedBattle();${phase==='windup'?'attachedStart(e);':'attachedFirst(e);'}e.cd=999;${phase==='owner-dead'?'e.hp=0;killEnemy(e);':''}`);
   const checkpoint=rt.snapshot();rt.advance(4);const expected=rt.snapshot();rt.restore(checkpoint);rt.advance(4);const actual=rt.snapshot();
   assert.deepEqual(actual.battle,expected.battle,phase+' complete battle replay');assert.deepEqual(actual.rng,expected.rng);hostRestores.push({enemyId:record.enemyId||'enemy_1112_emppnt',phase});
  }
 }finally{rt.dispose();}
 fs.writeFileSync('.runtime/enemy-attached-projectiles-receipts.json',JSON.stringify({source:'enemy_1112_emppnt',channels:['combat','attack'],hostRestores,scope:'Ordinary static delayed physical area body; not marker producers, original frame phase or full enemy completion.'},null,2));
 console.log('ENEMY ATTACHED PROJECTILES OK: actual source, both channels, fixed area/physical power, delayed owner-independent impact, cancellation, no fallback, pool reset and 3 host restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
