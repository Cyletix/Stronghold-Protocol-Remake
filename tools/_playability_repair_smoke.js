'use strict';
const assert=require('node:assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();setSetupSeason('act2autochess');curDiff='extreme';chooseBand('band_amiya');
 // Adjacent enemies behind the unit no longer bypass its displayed cells.
 startBattleRound();B.over=false;B.time=0;B.roundTime=0;B.waveScheduler=null;B.spawn=[];B.projectiles=[];B.particles=[];B.summoneds=[];
 const op={id:99,charId:'ordinary',position:'MELEE',row:3,col:3,cells:[[3,4]],range:1,atk:100,atkType:'phys',attackTime:1,cd:0,hp:1000,maxHp:1000,events:[],deployed:true};
 B.operators=[op];B.enemies=[{id:1,x:2.4,y:3,hp:1000,maxHp:1000,def:30,stunUntil:100,dead:false}];
 update(0,0);assert.equal(B.enemies[0].hp,1000,'near contact outside cells cannot initiate an attack');
 B.enemies[0].x=4;update(0,0);assert.equal(B.enemies[0].hp,930);assert.equal(B.damageFeedback.at(-1).amount,70);
 op.cd=0;op.attackCrit={probability:1,skillProbability:1,attackBonus:1};update(0,0);
 assert.equal(B.enemies[0].hp,760);assert.equal(B.damageFeedback.at(-1).amount,170);assert.equal(B.damageFeedback.at(-1).critical,true);
 B.enemies[0].hp=3;inflictDamage(B.enemies[0],900);assert.equal(B.damageFeedback.at(-1).amount,3,'report actual HP removed, not overkill');
 assert.equal(boardView({...op,entry:{}}).attackCrit,op.attackCrit,'critical metadata survives the battle view boundary');
 const frost=Object.values(SOURCE_BATTLES.levels).map(l=>l.enemies.enemy_1042_frostd).find(Boolean);
 assert.equal(frost.canAttack,false);assert.equal(frost.attackSpeedAura.radius,2.5);assert.equal(frost.attackSpeedAura.amount,-.5);
 B.enemies=[{...frost,id:3,x:3,y:3,hp:frost.maxHp,dead:false,cd:0,atkPhase:'windup',atkTimer:0,atkTarget:op}];
 op.cd=100;op.deployT=2;op.hp=1000;const hp=op.hp;update(0,0);assert.equal(op.hp,hp);assert.equal(B.enemies[0].atkPhase,null);assert.equal(buffMul(op).aspd,.5);
 B.enemies[0].x=20;assert.equal(buffMul(op).aspd,1,'leaving aura restores attack speed');
 // A real source critical talent must reach combat; it must not become a permanent on-hit buff.
 const caper=ROSTER['char_4100_caper'];assert.ok(caper);const final=finalizeOperator(caper,{},[],true);assert.equal(final.attackCrit.probability,.25);assert.equal(final.attackCrit.scale,1.5);assert.ok(!final.events.some(e=>e.type==='burst_damage'&&e.trigger==='attack'));
 // Category is sampled once, concrete choices and RNG survive redraws and confirmation.
 startRound(3);const offer=JSON.stringify(G._decisionOffer),rng=JSON.stringify(ArkSim.snapshot());showDecision();decisionOptions();showDecision();
 assert.equal(JSON.stringify(G._decisionOffer),offer);assert.equal(JSON.stringify(ArkSim.snapshot()),rng);
 assert.ok(G._decisionOffer.options.length>=3);assert.ok(G._decisionOffer.options.every(o=>o.kind===G._decisionOffer.kind));
 assert.ok(!decisionOptions().some(o=>['bounty','supply','tactic'].includes(o.id)));
 const pools=decisionCandidates();for(const kind of ['bounty','supply','tactic'])assert.ok(pools[kind].length>=3,kind);
 G._decisionOffer={round:G.round,kind:'bounty',options:pools.bounty.slice(0,3)};showDecision();const choice=decisionOptions()[0],money=G.money;
 previewDecision(choice.id);applyDecision(choice.id);assert.equal(G.money,money,'bounty never pays before a kill');
 const source=battleSourceForRun(),action=source.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions)).find(a=>a.bountyCoin>0);
 assert.equal(action.key,choice.enemyId);assert.ok(source.enemies[action.key]);
 const events=ArkWaves.advance(ArkWaves.create(source.waves),20,()=>false);assert.ok(events.some(e=>e.enemyId===choice.enemyId&&e.bountyCoin===choice.bb.coin));
 G._nextRoundCoin=0;onKillCoin(choice.enemyId,{bountyCoin:choice.bb.coin});assert.equal(G._nextRoundCoin,choice.bb.coin);
 B.sourceBattle=true;B.moveMultiplier=1;B.enemyStatMultiplier=1;B.enemyModifiers=pools.tactic.flatMap(e=>e.mechs);
 const foe={maxHp:100,hp:100,atk:100,def:200,magicRes:20,moveSpeed:1};applySourceEnemyModifiers(foe);assert.equal(foe.atk,95);assert.equal(foe.def,100);assert.equal(foe.magicRes,17);
 assert.equal(EQUIP_MODS['阿戈尔重刃'].aspd,.9);assert.equal(EQUIP_MODS['蒸汽之心'].aspd,1.3);assert.equal(equipmentModifiers({name:'阿戈尔重刃',mods:{aspd:-10}}).aspd,.9);
 const baseAttack=finalizeOperator(caper,{},[],false),equipped=finalizeOperator(caper,{},[{name:'阿戈尔重刃',mods:{aspd:-10}}],false);assert.ok(equipped.attackTime>baseAttack.attackTime);
 G.phase='rest';const member=ROSTER_LIST.find(e=>e.seasonBond==='lateranoShip'&&e.tier<3);G.ops=[{id:1,charId:member.charId,entry:member,row:3,col:4,dir:'up',equip:[],elite:false}];G.shop=[{type:'op',entry:member,cost:2}];renderShop();assert.ok(document.getElementById('shop').innerHTML.includes('present-bond'),'one deployed member highlights a not-yet-active shop bond');
 selectedBond='lateranoShip';renderBondDetail(selectedBond);const details=document.getElementById('bond-detail').innerHTML;assert.ok(details.includes('absent'));assert.ok(details.includes(member.charId));
 const counts=ROSTER_LIST.filter(e=>e.seasonBond==='lateranoShip').length;assert.equal((details.match(/class="bd-op/g)||[]).length,counts,'all roster members appear, not only deployed ones');
 window.viewMode=0;G.phase='battle';G.sourceBossId=null;window.__preview=false;stepView(1);togglePreview();assert.equal(window.viewMode,0);assert.equal(window.__preview,false);G.sourceBossId='boss_1';stepView(1);assert.notEqual(window.viewMode,0);
 // UI interpolation never mutates the authoritative snapshot or crosses teleports/views.
 const p=ArkBattlePresentation;p.reset();const first={phase:'battle',time:1,enemies:[{visualId:1,x:1,y:2,seg:0}],projectiles:[]},second={phase:'battle',time:1.2,enemies:[{visualId:1,x:2,y:2,seg:0}],projectiles:[]};
 p.ingest(first,'self',0);p.ingest(second,'self',100);assert.equal(p.sample(second,150).enemies[0].x,1.5);assert.equal(second.enemies[0].x,2);
 assert.equal(p.sample(second,200).enemies[0].x,2);p.ingest(second,'ally',250);assert.strictEqual(p.sample(second,270),second);
 const tele={...second,time:1.4,enemies:[{visualId:1,x:6,y:2,seg:1}]};p.ingest(tele,'ally',350);assert.equal(p.sample(tele,360).enemies[0].x,6);
 let rings=0;const ctx=new Proxy({arc(){rings++;}},{get:(t,k)=>t[k]||(()=>{})}),board={operators:[{id:2,col:1,row:1}],damageFeedback:[]};
 p.reset();p.observeSession({ops:[]},'run',0);p.observeSession({ops:[{id:2,elite:true}]},'run',10);p.draw(ctx,board,50,100);assert.equal(rings,1);
 p.draw(ctx,board,50,1200);assert.equal(rings,1,'merge effect expires');p.reset();p.observeSession({ops:[{id:2,elite:true}]},'new',1300);p.draw(ctx,board,50,1400);assert.equal(rings,1,'restored elite is not a new merge');
 const renderBefore=render;let frames=0;render=()=>{frames++;};window.__roomRemoteSimulation=true;lastRender=0;last=null;for(let i=0;i<=144;i++)loop(i*1000/144);assert.ok(frames>=59&&frames<=61,'60 render frames per real second, regardless of logic snapshots');render=renderBefore;
 console.log('PLAYABILITY REPAIR OK range, actual/critical damage, Frost passive/no attacks, concrete stable decisions, bounty rewards, source debuffs, immutable interpolation and merge feedback');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
