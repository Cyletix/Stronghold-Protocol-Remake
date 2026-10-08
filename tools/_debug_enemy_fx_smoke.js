'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();setSetupSeason('act2autochess');curDiff='extreme';chooseBand('band_amiya');
 const initialMoney=G.money,initialOps=G.ops.length;
 assert.equal(debugAddGold(),false);assert.equal(debugSkipRound(),false);assert.equal(G.money,initialMoney);
 assert.equal(toggleGameDebug(),true);assert.equal(debugAddGold(),true);assert.equal(G.money,initialMoney+1);
 const entry=ROSTER_LIST.find(o=>o.position==='RANGED');G.bannedOperators=[entry.charId];
 assert.equal(debugAddOperator(entry.charId),true);assert.equal(G.ops.length,initialOps+1);assert.ok(!G.bannedOperators.includes(entry.charId));assert.ok(G.ops.at(-1).bench);
 debugAddOperator(entry.charId);debugAddOperator(entry.charId);assert.ok(G.ops.find(o=>o.charId===entry.charId&&o.elite));assert.ok(G._mergeReward);
 const reward=G._mergeReward;assert.equal(debugAddOperator(entry.charId),false);assert.strictEqual(G._mergeReward,reward,'another debug merge cannot overwrite the saved shop');
 assert.equal(debugSkipRound(),true);assert.equal(G.round,2);assert.equal(G.phase,'rest');assert.equal(G._mergeReward,null);assert.equal(G.roundResults?.length||0,0,'skip does not fabricate kills or victory history');
 debugSkipRound();assert.equal(G.round,3);assert.equal(document.getElementById('decision-modal').style.display,'flex');debugSkipRound();assert.equal(G.round,4);assert.equal(document.getElementById('decision-modal').style.display,'none');
 const available=candidateCells(BDATA.level).length;G.ops=[];G.equipInv=Array.from({length:available},(_,i)=>({uid:500+i}));
 const beforeBan=G.bannedOperators.slice();assert.equal(debugAddOperator(entry.charId),false);assert.equal(G.ops.length,0);assert.deepEqual(G.bannedOperators,beforeBan);G.equipInv=[];
 G._mergeReward=null;startBattleRound();assert.equal(G.phase,'battle');const oldBoard=B;
 assert.equal(debugAddOperator(entry.charId),false,'cannot rebuild an active battle through the roster');assert.strictEqual(B,oldBoard);
 spawnProjectile({kind:'arrow',life:2,x:0,y:0,tx:1,ty:1,speed:1});const oldShot=B.projectiles[0];
 debugSkipRound();assert.equal(G.round,5);assert.notStrictEqual(B,oldBoard);assert.equal(oldBoard.projectiles.length,0);assert.equal(oldShot.owner,null);
 const before=JSON.stringify(G);window.__roomRemoteSimulation=true;assert.equal(debugAddGold(),false);assert.equal(debugSkipRound(),false);assert.equal(debugAddOperator(entry.charId),false);assert.equal(toggleGameDebug(),false);assert.equal(JSON.stringify(G),before);window.__roomRemoteSimulation=false;
 toggleGameDebug();assert.equal(gameDebugActive(),false);toggleGameDebug();
 const finalRound=runModeData().rounds.at(-1).round;startRound(finalRound);debugSkipRound();assert.equal(G.phase,'over');assert.equal(gameDebugActive(),false);assert.equal(document.getElementById('debug-panel').hidden,true);
 chooseBand('band_amiya');assert.equal(gameDebugActive(),false,'a new session defaults to debug off');
 // Use the extracted variant, the ordinary engine clock and the real damage path.
 const bomb=Object.values(SOURCE_BATTLES.levels).map(l=>l.enemies.enemy_1040_bombd).find(Boolean);
 assert.ok(bomb?.bombAttack);assert.equal(bomb.canAttack,false);assert.equal(bomb.bombAttack.moveMultiplier,2);
 window.onBattleEnd=()=>{};window.onLeak=()=>{};
 function battle(){
  startBattle([{id:3,charId:'char_002_amiya',col:3,row:3,position:'MELEE',maxHp:3000,atk:0,def:100,attackTime:100,blockCnt:0,range:0},
   {id:2,charId:'char_002_amiya',col:4,row:4,position:'MELEE',maxHp:3000,atk:0,def:300,attackTime:100,blockCnt:0,range:0},
   {id:1,charId:'char_002_amiya',col:5,row:3,position:'MELEE',maxHp:3000,atk:0,def:0,attackTime:100,blockCnt:0,range:0}],[],100);
  for(const o of B.operators){o.cd=999;o.deployed=true;o.deployT=5;o.skill=null;o.events=[];}
  const e={...bomb,x:3,y:2,hp:bomb.maxHp,dead:false,route:-1,cd:0,visualId:100};setupEnemy(e,bomb);B.enemies=[e];return e;
 }
 let enemy=battle();const hp=B.operators.map(o=>o.hp);
 for(let i=0;i<29;i++)update(1/30,1/60);
 assert.equal(B.projectiles.length,0);assert.deepEqual(B.operators.map(o=>o.hp),hp,'no basic attack before skill cooldown');
 for(let i=0;i<18;i++)update(1/30,1/60);
 assert.equal(B.projectiles.length,1);assert.equal(B.projectiles[0].kind,'bomb');assert.equal(enemy.bombDropped,true);assert.deepEqual(B.operators.map(o=>o.hp),hp,'damage waits for impact');
 const shot=B.projectiles[0];enemy.dead=true;update(1/30,1/60);assert.equal(B.over,false,'a dead last bomber does not cancel an airborne bomb');
 for(let i=0;i<24&&!B.over;i++)update(1/30,1/60);
 assert.equal(B.operators.find(o=>o.id===3).hp,3000-(bomb.atk-100));assert.equal(B.operators.find(o=>o.id===2).hp,3000-(bomb.atk-300),'diagonal tile gets its own defense calculation');assert.equal(B.operators.find(o=>o.id===1).hp,3000,'outside the nine tiles is safe');
 assert.equal(B.combatEffects.length,1);assert.equal(B.over,true);assert.equal(B.damageFeedback.length,2);
 const plain=spawnProjectile({kind:'arrow',life:1,x:0,y:0,tx:1,ty:1,speed:1});assert.strictEqual(plain,shot);assert.equal(plain.bombSource,null,'pooled ordinary shots cannot retain bomb payload');
 // Once used, it never attacks again; MULTIPLIER +2 means three times speed.
 enemy=battle();enemy.bombDropped=true;enemy.bombCooldown=0;enemy.moveSpeed=.3;enemy.route=0;enemy.seg=0;enemy.cp=0;enemy.wait=0;
 BDATA.level.routes[0]={segs:[[{c:30,r:2}]]};const x=enemy.x;update(.1,.05);assert.ok(Math.abs(enemy.x-x-.09)<1e-8);assert.equal(B.projectiles.length,0);
 for(let i=0;i<180;i++)update(1/30,1/60);assert.equal(B.projectiles.length,0);assert.deepEqual(B.operators.map(o=>o.hp),hp);
 const frost=Object.values(SOURCE_BATTLES.levels).map(l=>l.enemies.enemy_1042_frostd).find(Boolean);
 B.enemies=[{...frost,x:3,y:3,dead:false}];assert.equal(ArkBattlePresentation.frostAmount(B,B.operators[0]),-.5);assert.equal(buffMul(B.operators[0]).aspd,.5);
 B.enemies[0].x=30;assert.equal(ArkBattlePresentation.frostAmount(B,B.operators[0]),0);assert.equal(buffMul(B.operators[0]).aspd,1);
 let arcs=0,rects=0;const ctx=new Proxy({arc(){arcs++;},rect(){rects++;}},{get:(t,k)=>t[k]||(()=>{})});
 B.enemies[0].x=3;B.projectiles=[{kind:'bomb',life:1,tx:3,ty:3,tileRadius:1}];ArkBattlePresentation.drawAreas(ctx,B,50);assert.ok(arcs>=1);assert.equal(rects,1);
 console.log('DEBUG / ENEMY FX OK gated cheats, banned roster, full bench, merge, battle/decision/final skip; Frost radius, one-shot bomb, delayed nine-tile damage, post-drop speed, dead-owner impact and pooled reuse');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
