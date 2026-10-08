'use strict';
const assert=require('assert/strict'),fixture=require('./_browser_fixture')();fixture.ctx.assert=assert;
fixture.run(`(async()=>{
 await initMode();CUR=playableLevels().findIndex(x=>x.kind==='covenant');curDiff='difficult';curMatch='team';chooseBand('band_amiya');
 startRound(13);assert.equal(window.modeBattleZoneRows(BDATA.level).lb,6);
 const entry=ROSTER_LIST.find(e=>e.position==='MELEE');
 const make=(id,row,col)=>({id,charId:entry.charId,entry,row,col,dir:'left',equip:[]});
 const eq=EQUIPS[0],equipment={uid:50,id:eq.id,name:eq.name,mods:{...eq.mods},tier:1,kind:'stat'};
 G.ops=[make(1,6,5),make(2,7,6),make(3,6,11),make(4,6,5),make(5,7,13),make(6,null,null)];G.nextId=100;
 G.ops[0].equip.push(equipment);
 assert.ok(isDeployable(6,11,G.ops[2]),'old legal destination can differ in the boss section');
 assert.ok(!isDeployable(7,13,G.ops[4]),'previously illegal cells are not eligible for relocation');
 startRound(14);assert.ok(G.sourceBossId);assert.equal(window.modeBattleZoneRows(BDATA.level).lb,13);
 assert.equal(G.ops[0].row,13);assert.equal(G.ops[0].col,5);assert.equal(G.ops[0].dir,'left');assert.equal(G.ops[0].equip[0],equipment);
 assert.equal(G.ops[1].row,14);assert.equal(G.ops[1].col,6);
 for(const index of [2,3,4,5])assert.equal(G.ops[index].row,null,'invalid, occupied and reserve cells stay in reserve');
 assert.equal(battleSourceForRun().leaderEnemyId,sourceBossInfo(G.sourceBossId).enemyId);
 const positions=JSON.stringify(G.ops.map(o=>[o.row,o.col]));
 prepareSourceRound(14,{preserveFormation:true});assert.equal(JSON.stringify(G.ops.map(o=>[o.row,o.col])),positions,'same-zone rebuild is idempotent');
 G.frozen=true;assert.equal(saveRestRun(),true);window.formationSave=localStorage.getItem(RUN_SAVE_KEY);
 resetBattleView();prepareSourceRound(14);assert.equal(JSON.stringify(G.ops.map(o=>[o.row,o.col])),positions,'default preparation never relocates saved absolute cells');
 G.ops=[];assert.equal(loadRestRun(),true);assert.equal(JSON.stringify(G.ops.map(o=>[o.row,o.col])),positions);
 assert.equal(G.ops[0].equip[0].uid,50);assert.equal(G.ops[0].dir,'left');
 console.log('BOSS FORMATION OK relative rows, directions/equipment, collisions/invalid cells, repeated preparation and rest reload');
})()`).then(async()=>{
 const fresh=require('./_browser_fixture')();fresh.ctx.assert=assert;fresh.storage.set('arknightsAutoRestV1',fixture.ctx.formationSave);
 await fresh.run('(async()=>{await initMode();assert.equal(loadRestRun(),true);assert.equal(G.round,14);assert.equal(G.ops[0].row,13);assert.equal(G.ops[0].col,5);assert.equal(G.ops[1].row,14);assert.equal(G.ops[1].col,6);assert.equal(G.ops[0].equip[0].uid,50);console.log("BOSS FORMATION fresh-page reload preserved cells");})()');
}).catch(error=>{console.error(error);process.exitCode=1;});
