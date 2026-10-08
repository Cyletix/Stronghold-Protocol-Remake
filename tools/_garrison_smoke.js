'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
(async()=>{
 await f.run('initMode()');
 f.run(`
 chooseBand('band_amiya');
 const fresh=JSON.stringify(G);
 function clearTraits(){G=JSON.parse(fresh);G.ops=[];G.addLayers={};G.activeBonds={};G.equipInv=[];G._nextRoundCoin=0;G._gar={};G._mergeReward=null;G._garrisonRewardQueue=[];G.money=100;G.bannedOperators=[];B.time=0;return G;}
 function sourceTrait(id){return garrisonSeason().traits[id];}
 function ownerOf(id,elite=false){const entry=ROSTER_LIST.find(e=>{const p=garrisonProfile(e);return (elite?p?.golden:p?.normal)?.includes(id);});assert.ok(entry,'source owner '+id);const o={id:G.nextId++,charId:entry.charId,entry,elite,equip:[],row:5,col:5,dir:'up'};G.ops.push(o);return o;}
 function activate(ids){for(const id of ids){const members=ROSTER_LIST.filter(e=>garrisonBonds(e).includes(id));for(const entry of members.slice(0,6)){if(G.ops.some(x=>x.charId===entry.charId))continue;G.ops.push({id:G.nextId++,charId:entry.charId,entry,elite:false,equip:[],row:8,col:G.ops.length,dir:'up'});}}resolveBoard();}
 clearTraits();let a=ownerOf('garrison_25_a');a.row=null;garrisonEvent('SERVER_GAIN',a);for(const id of garrisonBonds(a))assert.equal(G.addLayers[id],2);
 a.elite=true;garrisonEvent('SERVER_GAIN',a);for(const id of garrisonBonds(a))assert.equal(G.addLayers[id],6,'elite gain uses four, not normal two');
 const retained={...G.addLayers};garrisonPrepareBattle();for(const id of Object.keys(retained))assert.equal(G.addLayers[id],retained[id],'gain persists into combat');
 clearTraits();a=ownerOf('garrison_113_a');G.ops=[];a=addOperator(a.charId,false);assert.equal(G._garrisonFreeRefresh,1);const money=G.money;refreshShop();assert.equal(G.money,money);assert.equal(G._garrisonFreeRefresh,0);assert.equal(G._garrisonRoundRefresh,1);
 clearTraits();a=ownerOf('garrison_67_a');a.row=null;sellHand(a.id);assert.equal(G._nextRoundCoin,1);const m=G.money;assert.ok(m>=100);assert.equal(G.ops.length,0);
 clearTraits();assert.equal(operatorPurchasePrice({charId:'char_290_vigna',tier:1}),1);
 clearTraits();a=ownerOf('garrison_93_a');a.equip=[{uid:G.nextId++,id:'hammer',name:'锤',mods:{atk:1.1}}];const id=a.charId;addOperator(id,false);assert.equal(G.ops.filter(o=>o.charId===id).length,1);assert.equal(G.ops.find(o=>o.charId===id).elite,true);assert.equal(G.ops.find(o=>o.charId===id).equip.length,1);
 clearTraits();a=ownerOf('garrison_138_a');activate(['lateranoShip','preciShip']);G.addLayers={};const unit=boardView(a);for(let i=0;i<20;i++)onBondGarrison('kill',unit);assert.equal(G.addLayers.lateranoShip,3);assert.equal(G.addLayers.preciShip,3,'same event cap applies to both bonds');
 clearTraits();a=ownerOf('garrison_138_a');resolveBoard();onBondGarrison('kill',boardView(a));assert.deepEqual(G.addLayers,{},'combat layers require active bond');
 clearTraits();a=ownerOf('garrison_73_a');const front=ownerOf('garrison_25_a');front.row=4;front.col=5;activate(['preciShip']);garrisonPrepareBattle();assert.ok(garrisonTraits(front).some(g=>g.id.includes('@'+a.id)));const layers=G.addLayers.preciShip||0;onBondGarrison('skill',boardView(front));assert.ok(G.addLayers.preciShip>layers);
 const inherited=garrisonTraits(front).length;garrisonPrepareBattle();assert.equal(garrisonTraits(front).length,inherited,'no accumulation of borrowed traits on next battle');
 clearTraits();a=ownerOf('garrison_03_a');resolveBoard();const plain=finalizeOperator(a.entry,null,[],false);assert.ok(a.atk>plain.atk&&a.maxHp>plain.maxHp,'fixed trait buffs execute');
 const before=a.atk;resolveBoard();assert.equal(a.atk,before,'recalculation is idempotent');
 const enemy={enemyId:'test',def:900,magicRes:0,shield:0};B.time=0;assert.equal(calcDamage({atk:100,atkType:'phys',garrisonStats:{weakness:true}},enemy,1),100);assert.equal(calcDamage({atk:100,atkType:'phys'},enemy,1),5,'physical minimum is 5% of attack power');
 const drone=Object.keys(GARRISON_DATA.enemyTags).find(id=>GARRISON_DATA.enemyTags[id].includes('drone'));assert.ok(drone);assert.equal(calcDamage({atk:100,garrisonStats:{targetBonuses:[{tag:'drone',atk:1.5}]}},{enemyId:drone,def:0},1),150);
 clearTraits();a=ownerOf('garrison_31_a');activate(['yanShip']);G._garrisonRoundGained=7;G.addLayers={};garrisonExecute(sourceTrait('garrison_31_a'),a);assert.equal(G.addLayers.yanShip,7);
 G._garrisonRoundSpent=8;activate(['skillfulShip','arcaneShip']);G.addLayers={};garrisonExecute(sourceTrait('garrison_121_a'),a);assert.equal(G.addLayers.skillfulShip,4);assert.equal(G.addLayers.arcaneShip,4);
 const originalHTML=garrisonTraitHtml(a);a.elite=true;const eliteHTML=garrisonTraitHtml(a);assert.notEqual(originalHTML,eliteHTML);assert.ok(eliteHTML.includes('精锐'));
 clearTraits();a=ownerOf('garrison_99_a');const copy=ownerOf('garrison_99_a');a.row=5;a.col=5;a.dir='up';copy.row=4;copy.col=5;copy.dir='down';garrisonEvent('SERVER_PREP_FIN');assert.deepEqual(G.addLayers,{},'copy cycles terminate without invented rewards');
 clearTraits();a=ownerOf('garrison_25_a');a.elite=true;resolveBoard();selectedBond='suntShip';renderBondDetail('suntShip');const html=document.getElementById('bond-detail').innerHTML;assert.ok(html.includes(a.charId));assert.equal((html.match(/class="bd-op/g)||[]).length,1,'ultimate bond displays only contributing deployed elite');
 // Engine-observed status edges and ammunition, not one trigger per animation frame.
 const callback=window.onBondGarrison,calls=[];window.onBondGarrison=(event,op)=>calls.push([event,op.id]);
 const watcher={id:80,row:2,col:2,dir:'right',range:2,cells:[[2,3]],deployed:true,garrisonAdd:[sourceTrait('garrison_28_a'),sourceTrait('garrison_125_a'),sourceTrait('garrison_22_a')]};
 const target={enemyId:'edge',x:3,y:2,freezeUntil:10,stunUntil:10};B.time=1;B.operators=[watcher];B.enemies=[target];notifyGarrisonStatuses();notifyGarrisonStatuses();
 assert.equal(calls.filter(x=>x[0]==='freeze').length,1);assert.equal(calls.filter(x=>x[0]==='sleepstun').length,1);
 B.time=11;notifyGarrisonStatuses();target.freezeUntil=20;B.time=12;notifyGarrisonStatuses();assert.equal(calls.filter(x=>x[0]==='freeze').length,2);
 notifyGarrisonAmmo({row:2,col:3});notifyGarrisonAmmo({row:5,col:5});assert.equal(calls.filter(x=>x[0]==='ammo').length,1,'adjacent ammo only');
 const sk={name:'ammo fixture',spType:'INCREASE_WITH_TIME',spCost:1,initSp:1,ammoCount:2,duration:0,maxCharge:1,effects:[{type:'buff_atk',power:1}]};
 startBattle([{id:81,name:'ammo',row:2,col:2,dir:'right',position:'MELEE',maxHp:1000,atk:100,def:100,attackTime:.1,range:1,blockCnt:0,skill:sk}],[],100);
 const shooter=B.operators[0];shooter.deployAt=0;shooter.deployed=true;B.enemies=[{enemyId:'ammo-target',x:3,y:2,hp:10000,maxHp:10000,def:0,magicRes:0,attackTime:99,rangeRadius:-1,moveSpeed:0,route:0,seg:0,cp:0,wait:999,cd:99}];
 castSkill(shooter);assert.equal(shooter.skillState.ammo,2);assert.ok(Number.isFinite(shooter.buffs[0].until),'checkpoint-safe ammo buff duration');
 update(.1,.1);assert.equal(shooter.skillState.ammo,1);assert.equal(buffMul(shooter).atk,2);update(.1,.1);assert.equal(shooter.skillState,null);assert.equal(buffMul(shooter).atk,1);
 shooter.garrisonAdd=[sourceTrait('garrison_138_a')];const victim={enemyId:'skill-target',x:3,y:2,hp:1,maxHp:1,def:0,magicRes:0};B.enemies=[victim];applyEffect(shooter,{type:'aoe_damage',power:2},[victim],[]);assert.ok(victim.dead);assert.ok(calls.some(x=>x[0]==='kill'&&x[1]===81),'skill damage attributes the kill');
 const deployCalls=calls.filter(x=>x[0]==='deploy'&&x[1]===81).length;shooter.respawnTime=0;shooter.reviveChance=0;window.onRespawn=()=>true;tryKill(shooter);assert.equal(shooter.respawnAt,B.time);respawnOperators();B.enemies=[];B.over=false;update(.01,.01);assert.equal(calls.filter(x=>x[0]==='deploy'&&x[1]===81).length,deployCalls+1,'automatic redeploy fires deploy traits once');window.onBondGarrison=callback;
 clearTraits();a=ownerOf('garrison_115_a');activate(['kazimierzShip']);G.addLayers.kazimierzShip=50;G.phase='battle';a._garrisonDeployAt=0;B.time=0;resolveBoard();const boosted=a.atk;B.time=101;resolveBoard();assert.ok(a.atk<boosted,'deployment-only base stats expire at 100 seconds');
 console.log('GARRISON OK source variants; acquisition/sale/price/free refresh; merge/equipment; persistent and active layers; per-event multi-bond cap; transfer reset; buffs/weakness/tags; spending/gain counters; copy cycles; ultimate roster; status edges; actual ammo consumption; skill kill credit; timed deployment stats');
 `);
})().catch(e=>{console.error(e);process.exitCode=1;});
