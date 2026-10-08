'use strict';
const assert=require('assert/strict'),f=require('./_browser_fixture')();f.ctx.assert=assert;
f.run(`(async()=>{
 await initMode();chooseBand('band_amiya');startBattleRound();
 function check(charId,position,expected){
 B.over=false;B.time=0;B.roundTime=0;B.waveScheduler=null;B.spawn=[];B.projectiles=[];B.particles=[];B.summoneds=[];
 B.enemies=[1,2,5].map((x,i)=>({id:i,x,y:3,hp:1000,maxHp:1000,def:30,magicRes:0,stunUntil:100,dead:false}));
 B.operators=[{id:1,charId,position,row:3,col:0,cells:[[3,1],[3,2]],range:2,atk:100,atkType:'phys',attackTime:1,cd:0,hp:1000,maxHp:1000,events:[],deployed:true}];
 update(0,0);assert.deepEqual(B.enemies.map(e=>1000-e.hp),expected);assert.equal(B.operators[0].cd,1);
 }
 check('char_010_chen','MELEE',[140,0,0]);
 check('char_134_ifrit','RANGED',[70,70,0]);
 check('ordinary','MELEE',[70,0,0]);
 // A real medic and bard must not enter the enemy-targeting attack path.
 function setupSupport(charId){
   check('ordinary','MELEE',[70,0,0]);
   const healer=B.operators[0];Object.assign(healer,{charId,profession:'MEDIC',position:'RANGED',cd:0});
   B.enemies.forEach(e=>e.hp=e.maxHp);
   const ally={id:2,charId:'ordinary',row:3,col:1,hp:200,maxHp:1000,atk:100,cd:99,deployAt:0,deployed:true};
   B.operators.push(ally);return {healer,ally};
 }
 let {healer,ally}=setupSupport('char_108_silent');
 update(0,0);assert.equal(B.projectiles.length,0,'medical normal action must never fire at enemies');
 assert.equal(ally.hp,300,'medical normal action heals one ally for ATK');
 ({healer,ally}=setupSupport('char_1012_skadi2'));healer.profession='SUPPORT';
 update(.1,.1);assert.equal(B.projectiles.length,0,'bard must never fire at enemies');assert.equal(ally.hp,201,'bard regenerates 10% ATK per simulation second');
 ({healer,ally}=setupSupport('char_108_silent'));
 const clone=(id,col,hp=200)=>({...ally,id,col,hp});
 const outside=clone(3,5,1),dead={...clone(4,2,0),dead:true},future={...clone(5,2,1),deployAt:50};
 const mudrock={...clone(6,2,1),charId:'char_311_mudrok'};
 B.operators.push(outside,dead,future,mudrock);healer.cells=[[3,1],[3,2]];
 update(0,0);assert.equal(ally.hp,300);assert.equal(outside.hp,1);assert.equal(dead.hp,0);assert.equal(future.hp,1);assert.equal(mudrock.hp,1,'direct healing cannot target Mudrock');
 ally.hp=1000;healer.cd=0;update(0,0);assert.equal(healer.cd,0,'no valid wounded target keeps healing ready');
 ally.hp=950;update(0,0);assert.equal(ally.hp,1000,'healing clamps to max HP');
 healer.cd=0;healer.frozenUntil=20;ally.hp=200;update(0,0);assert.equal(ally.hp,200,'frozen healer cannot act');
 healer.frozenUntil=0;healer.hp=500;healer.cells=[[3,0]];update(0,0);assert.equal(healer.hp,600,'self healing uses the same range filter');

 ({healer,ally}=setupSupport('char_179_cgbird'));
 const group=[ally,clone(3,2,300),clone(4,3,400),clone(5,4,500)];
 B.operators=[healer,...group];healer.cells=group.map(t=>[t.row,t.col]);
 update(0,0);assert.deepEqual(group.map(t=>t.hp),[300,400,500,500],'group medic heals exactly three distinct targets');
 assert.equal(healer.cd,1);

 ({healer,ally}=setupSupport('char_4139_papyrs'));
 const chained=[ally,clone(3,2,300),clone(4,3,400),clone(5,8,1)];
 B.operators=[healer,...chained];healer.cells=[[3,1]];
 update(0,0);assert.deepEqual(chained.map(t=>t.hp),[300,375,456.25,1],'chain hops from first target with per-hop decay, cannot jump across map');

 ({healer,ally}=setupSupport('char_1016_agoat2'));
 ally.hp=1000;ally.ep={nervous:120,burn:20};
 update(0,0);assert.equal(ally.hp,1000);assert.deepEqual(ally.ep,{nervous:70,burn:0},'wandering medic heals elemental damage even at full HP');

 ({healer,ally}=setupSupport('char_1012_skadi2'));ally.charId='char_311_mudrok';
 healer.cells=[[3,0],[3,1]];healer.hp=500;
 for(let i=0;i<10;i++)update(.1,.1);
 assert.ok(Math.abs(ally.hp-210)<1e-6);assert.ok(Math.abs(healer.hp-510)<1e-6,'bard regen includes self and cannot-be-healed allies');
 assert.equal(B.projectiles.length,0);

 ({healer,ally}=setupSupport('char_1020_reed2'));healer.atkType='arts';
 B.enemies.forEach(e=>e.magicRes=50);B.enemies[0].hp=10;
 update(0,0);assert.equal(ally.hp,200,'incantation healing must wait for hit');assert.equal(B.projectiles.length,1);
 update(.11,.11);assert.equal(ally.hp,225,'incantation converts mitigated 50 damage, including overkill, to 25 HP');
 assert.equal(B.enemies.length,2);
 hitEnemy(healer,B.enemies[0],80);assert.equal(ally.hp,265,'damage skills also trigger incantation recovery');

 ({healer,ally}=setupSupport('char_343_tknogi'));healer.atkType='arts';
 update(0,0);assert.equal(B.projectiles.length,1,'blessing supporter normally attacks');
 B.projectiles=[];healer.cd=0;healer.skillState={until:20,deltas:{}};
 update(0,0);assert.equal(ally.hp,275,'blessing supporter heals at 75% ATK during skill');assert.equal(B.projectiles.length,0);
 healer.skillState=null;healer.cd=0;update(0,0);assert.equal(B.projectiles.length,1,'attack resumes after skill');

 ({healer,ally}=setupSupport('char_344_beewax'));healer.atkType='arts';
 update(0,0);assert.equal(B.projectiles.length,0);assert.equal(B.enemies[0].hp,1000,'phalanx does not attack outside skill');
 assert.equal(buffMul(healer).def,3);assert.equal(enemyDamageToOperator({atk:100,atkType:'arts'},healer),80);
 healer.skillState={until:20,deltas:{}};update(0,0);
 assert.deepEqual(B.enemies.map(e=>e.hp),[900,900,1000]);assert.equal(buffMul(healer).def,1);

 ({healer,ally}=setupSupport('char_4064_mlynar'));healer.blockCnt=3;
 update(0,0);assert.equal(operatorAction(healer),'none');assert.equal(operatorBlockCount(healer),0);
 updateSupportRecovery(40);assert.equal(buffMul(healer).atk,3);
 healer.skillState={until:50,deltas:{},range:healer.range,cells:healer.cells};
 assert.equal(operatorAction(healer),'attack');assert.equal(operatorBlockCount(healer),3);
 endOperatorSkill(healer);assert.equal(buffMul(healer).atk,1);assert.equal(operatorBlockCount(healer),0);

 ({healer,ally}=setupSupport('char_4042_lumen'));
 healer.skill={sourceId:'skchr_lumen_3',blackboard:{heal_scale:1.35}};
 healer.skillState={until:20,ammo:4,deltas:{}};
 update(0,0);assert.equal(ally.hp,300);assert.equal(healer.skillState.ammo,4,'ordinary Lumen heal does not spend ammo');
 healer.cd=0;ally.stunUntil=10;update(0,0);
 assert.equal(ally.hp,435);assert.equal(ally.stunUntil,0);assert.equal(healer.skillState.ammo,3);

 for(const entry of ROSTER_LIST){const resolved=finalizeOperator(entry,null,[],false);
   assert.ok(resolved.basicAttack,'source action required: '+entry.name);
   if(entry.profession==='MEDIC')assert.equal(resolved.basicAttack.action,entry.subProfession==='incantationmedic'?'attack':'heal');
   if(entry.subProfession==='bard')assert.equal(operatorAction({...resolved,charId:entry.charId}),'none');
 }
 const flower=finalizeOperator(ROSTER.char_181_flower,null,[],false);
 assert.ok(flower.skill.clientProgram);assert.deepEqual(flower.skill.effects,[]);
 ({healer,ally}=setupSupport('char_181_flower'));healer.skill=flower.skill;healer.def=200;healer.buffs=[];healer.sp=healer.skill.spCost;
 assert.equal(castSkill(healer),true);assert.equal(performHealingAction(healer),true);
 assert.equal(healer.cd,2,'negative source attack speed doubles actual healing interval');assert.equal(operatorDefense(healer),200,'source attack speed never breaks armor');
 const skadi=finalizeOperator(ROSTER.char_1012_skadi2,null,[],false);
 ({healer,ally}=setupSupport('char_1012_skadi2'));healer.skill=skadi.skill;healer.skillState={until:20,deltas:{}};healer.hp=500;
 update(1,1);assert.equal(ally.hp,200,'Skadi S3 replaces passive healing');assert.equal(B.enemies[0].hp,960);assert.equal(healer.hp,450);
 assert.equal(B.projectiles.length,0);assert.equal(operatorAttackPower(ally),ally.atk+65);
 console.log('BASIC ATTACK OK source coverage; direct/group/chain/elemental healing; range/life/deployment/CC; bard regen and S3; incantation hit and skill recovery; blessing/phalanx states; Lumen conditional ammo; baseline damage');
})()`).catch(e=>{console.error(e);process.exitCode=1;});
