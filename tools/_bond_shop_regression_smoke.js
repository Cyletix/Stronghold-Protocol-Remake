'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');G.frozen=true;renderAll();chooseBand('band_amiya');
 assert.equal(G.frozen,false);assert.ok(!document.getElementById('shop').innerHTML.includes('freeze-mark'));assert.match(document.getElementById('freeze-btn').title,/未冻结/);
 const members=ROSTER_LIST.filter(e=>e.regBonds.includes('raidShip')).slice(0,3);assert.ok(members.length>=2);
 const zone=window.modeBattleZoneRows(BDATA.level),cells=[];for(let r=zone.lb;r<zone.rb;r++)for(let c=0;c<BDATA.level.cols;c++)if(isDeployable(r,c))cells.push([r,c]);
 G.ops=members.map((entry,i)=>({id:G.nextId++,charId:entry.charId,entry,equip:[],dir:'up',row:null,col:null}));refreshBoard();renderAll();assert.ok(!document.getElementById('bonds-track').innerHTML.includes("onBondClick('raidShip')"));
 for(let i=0;i<G.ops.length;i++){onDeploy({id:G.ops[i].id},...cells[i],'up');const html=document.getElementById('bonds-track').innerHTML;assert.ok(html.includes("onBondClick('raidShip')"),'deployed bond must remain visible even with mixed legacy mode catalog');assert.ok(html.includes('stroke-dasharray'));assert.ok(html.includes('bond-layers'));assert.ok(!/<span class="cnt">[0-9]/.test(html),'progress arc replaces member fractions');}
 const beforeRecall=document.getElementById('bonds-track').innerHTML;recallBoard(G.ops[0].id);assert.notEqual(document.getElementById('bonds-track').innerHTML,beforeRecall,'recall updates the circular progress');
 toggleFreeze();assert.equal(G.frozen,true);assert.match(document.getElementById('freeze-btn').title,/已冻结/);toggleFreeze();assert.equal(G.frozen,false);
 console.log('BOND/SHOP REGRESSION OK fresh run unfreezes; deploy/recall progress; visible bonds match calculation; explicit freeze state');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
