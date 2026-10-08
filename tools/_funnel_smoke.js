'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const levels=[1,2,3].flatMap((n,slot)=>skills['skchr_gdglow_'+n].levels.map((s,i)=>({slot,level:i+1,id:'skchr_gdglow_'+n,sp:s.spData.spCost,init:s.spData.initSp,duration:s.duration,bb:Object.fromEntries(s.blackboard.map(x=>[x.key,x.value]))})));
const talents=chars.char_377_gdglow.talents.flatMap(t=>t.candidates.map(c=>({phase:Number(c.unlockCondition.phase.slice(-1)),potential:c.requiredPotentialRank,name:c.name,bb:Object.fromEntries(c.blackboard.map(x=>[x.key,x.value]))})));
const rockLevels=skills.skchr_rockr_2.levels.map((s,i)=>({level:i+1,bb:Object.fromEntries(s.blackboard.map(x=>[x.key,x.value]))}));
const rockTalents=chars.char_4040_rockr.talents[0].candidates.map(c=>({phase:Number(c.unlockCondition.phase.slice(-1)),potential:c.requiredPotentialRank,bb:Object.fromEntries(c.blackboard.map(x=>[x.key,x.value]))}));
const logicBattle=b=>{const {particles,...rest}=b;return rest;};
const helper=`
function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-6,msg+': '+a+' != '+b);}
function glow(c={}){const cid=c.cid||'char_377_gdglow';ACCOUNT.ops[cid]={evolve:c.phase??2,level:1,skillLevel:c.level??10,potential:(c.potential??0)+1,trust:0,selectedSkill:c.slot??2};G.skillChoices[cid]=c.slot??2;
 const entry={...debugTacticalEntry(cid),module:null},stats=finalizeOperator(entry,null,[],false);
 startBattle([{...stats,id:1,charId:cid,name:entry.name,profession:entry.profession,position:entry.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(entry,false),garrisonAdd:null}],[],100);
 Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];Object.assign(o,{sp:0,cd:999,deployAt:0,deployT:2,deployed:true});return o;
}
function foe(x=6,y=3,extra={}){const e={id:100+B.enemies.length,visualId:100+B.enemies.length,enemyId:'fixture',x,y,hp:1000000,maxHp:1000000,def:0,magicRes:0,atk:0,canAttack:false,moveSpeed:0,attackTime:2,cd:999,path:[{x,y},{x:x+2,y}],pi:1,...extra};B.enemies.push(e);return e;}
function begin(o){o.sp=o.skill.spCost;assert.equal(castSkill(o),true);}
function tick(o){B.time=Math.max(B.time,...o.releasedDrones.map(d=>d.nextAt));ArkOperatorCombat.update(0);}
function land(){for(const p of B.projectiles.splice(0))ArkOperatorCombat.impact(p);}
 function verify(c){
 const o=glow(c),cells=JSON.stringify(o.cells);assert.equal(o.skill.spCost,c.sp);assert.equal(o.skill.initSp,c.init);assert.equal(o.skill.duration,c.duration);near(buffMul(o).atk,1,'explosion talent is not an unconditional ATK buff');
 const random=gameRandom;gameRandom=()=>.999;begin(o);const count=c.slot===2?3:2;assert.equal(o.releasedDrones.length,count);assert.equal(B.summoneds.length,0);
 if(c.slot===1){assert.ok(o.skillState.until>1e12);assert.equal(o.cells.length,o.skill.rangeGrids.length);}else near(o.skillState.until,c.duration);
 const e=foe(),power=operatorAttackPower(o,buffMul(o).atk),interval=ArkOperatorCombat.attackInterval(o,o.skill);
 for(let i=0;i<8;i++){const hp=e.hp;tick(o);near(hp-e.hp,count*Math.round(power*Math.min(1.1,.2+.15*i)),'per-unit ramp');for(const d of o.releasedDrones)near(d.nextAt-B.time,interval);}
 if(c.slot===2){near(e.slowUntil,B.time+c.bb['attack@sluggish']);assert.equal(ArkOperatorCombat.attack(o),false,'S3 suppresses caster attack');}
 else {const hp=e.hp;assert.equal(ArkOperatorCombat.attack(o),true);land();near(hp-e.hp,Math.round(power),'body has no attached duplicate unit');}
 e.x=14;e.y=0;const hp=e.hp;tick(o);assert.ok(e.hp<hp,'locks survive leaving caster range');const fresh=foe();tick(o);assert.equal(fresh.hp,1000000,'new enemy cannot steal locks');e.dead=true;const before=fresh.hp;tick(o);near(before-fresh.hp,count*Math.round(power*.2),'each new target resets ramp');
 for(const field of ['stunUntil','sleepUntil','freezeUntil']){o[field]=B.time+10;const hp=fresh.hp;tick(o);assert.ok(fresh.hp<hp,'existing locks survive '+field);o[field]=0;}
 endOperatorSkill(o);assert.equal(o.releasedDrones,null);assert.equal(JSON.stringify(o.cells),cells);const stopped=fresh.hp;ArkOperatorCombat.update(1);assert.equal(fresh.hp,stopped);gameRandom=random;
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,levels,talents,rockLevels,rockTalents});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of levels)verify(c);`);
 f.run(`{
 const random=gameRandom;
 // The basic funnel prefab has no GdglowHitBehaviour; source talent candidates
 // explicitly restrict self-explosion to skill-active released units.
 let plain=glow(),plainTarget=foe();gameRandom=()=>{throw Error('basic attached funnel must not sample explosion PRD');};
 const plainPower=operatorAttackPower(plain,buffMul(plain).atk);
 for(let i=0;i<40;i++){const before=plainTarget.hp;assert.equal(ArkOperatorCombat.attack(plain),true);land();near(before-plainTarget.hp,Math.round(plainPower)+Math.round(plainPower*Math.min(1.1,.2+.15*i)),'normal body plus ramped attached funnel');assert.equal(B.projectiles.length,0);}
 assert.equal(plain.funnelPrd,undefined);assert.equal(plain.releasedDrones,undefined);
 // Native PRD chance is c*n, tested before ordinary damage; 40 is forced.
 let o=glow(),e=foe();begin(o);let draws=0;gameRandom=()=>{draws++;return .999;};
 for(let i=0;i<39;i++)tick(o);assert.equal(draws,117);assert.equal(B.projectiles.length,0);
 const hp=e.hp,power=operatorAttackPower(o,buffMul(o).atk);tick(o);assert.equal(draws,117,'forced success takes no RNG');assert.equal(e.hp,hp,'explosion replaces this normal hit');assert.equal(B.projectiles.length,3);assert.ok(Object.values(o.funnelPrd).every(n=>n===0));
 const pending=B.projectiles.slice(),x=e.x,y=e.y,nearby=foe(x+1.09,y,{invisibleUntil:999}),outside=foe(x+1.11,y),air=foe(x,y,{flying:true});
 for(const p of pending){near(p.resolveAt-B.time,.32);near(p.plan.radius,1.1);near(p.plan.scale,3);}land();
 near(hp-e.hp,3*Math.round(power*3));near(1000000-nearby.hp,3*Math.round(power*3),'splash can hit invisible neighbor');assert.equal(outside.hp,1000000);near(1000000-air.hp,3*Math.round(power*3));
 tick(o);assert.equal(o.releasedDrones[0].hits,6,'self-explosion keeps same-target ramp');
 // Chance 0.015, 0.030: first attempt fails .02, second succeeds .02.
 o=glow();e=foe();begin(o);gameRandom=()=>.02;tick(o);assert.equal(B.projectiles.length,0);tick(o);assert.equal(B.projectiles.length,3);
 // Each ability owns its own PRD counter, retained across changing targets.
 o=glow();e=foe();begin(o);const seq=[.001,.999,.999];gameRandom=()=>seq.shift()??.999;tick(o);assert.deepEqual(Object.values(o.funnelPrd),[0,1,1]);e.dead=true;foe();tick(o);assert.deepEqual(Object.values(o.funnelPrd),[1,2,2]);
 o=glow({slot:0});begin(o);foe(14,0);ArkOperatorCombat.update(0);assert.ok(o.releasedDrones.every(d=>d.targetId===null),'S1 cannot start outside range');
 o=glow({slot:1});begin(o);foe(14,0);ArkOperatorCombat.update(0);assert.ok(o.releasedDrones.every(d=>d.targetId===null),'S2 cannot start outside range');
 o=glow();begin(o);e=foe(14,0,{flying:true});gameRandom=()=>.999;ArkOperatorCombat.update(0);assert.ok(e.hp<e.maxHp,'S3 finds entire board including air');
 o=glow();begin(o);e=foe(14,0,{invisibleUntil:999});ArkOperatorCombat.update(0);assert.equal(e.hp,e.maxHp,'global targeting does not reveal invisible enemy');
 o=glow();begin(o);e=foe();o.stunUntil=10;ArkOperatorCombat.update(0);assert.equal(e.hp,e.maxHp);o.stunUntil=0;ArkOperatorCombat.update(0);o.hp=0;tryKill(o);assert.equal(o.releasedDrones,null);assert.equal(o.funnelPrd,null);B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);assert.equal(o.releasedDrones,null);
 for(const c of talents){o=glow(c);const t=o.combatTalents.find(t=>t.name===c.name);assert.ok(t);for(const [k,v]of Object.entries(c.bb))near(t.blackboard.find(x=>x.key===k).value,v);}
 for(const potential of [0,5]){o=glow({potential});e=foe(6,3,{magicRes:50});const penetration=potential===5?18:15;near(ArkOperatorCombat.resistancePenetration(o),penetration);near(calcDamage(o,e,1,{raw:1000,type:'arts'}),1000*(1-(50-penetration)/100));near(calcDamage(o,e,1,{raw:1000,type:'phys'}),1000);e.magicRes=3;near(calcDamage(o,e,1,{raw:1000,type:'arts'}),1000,'penetration clamps RES at zero');}
 o=glow({phase:0,slot:0,level:1});assert.equal(o.combatTalents.length,0);begin(o);foe();gameRandom=()=>{throw Error('no talent must not sample PRD');};for(let i=0;i<3;i++)tick(o);
  gameRandom=random;
  }`);
 f.run(`{
 for(const c of rockLevels){
  const o=glow({...c,cid:'char_4040_rockr',slot:1}),e=foe();begin(o);assert.equal(o.releasedDrones.length,1);assert.equal(o.skillState.overloadAt,20);assert.equal(o.skillState.until,40);
  near(buffMul(o).atk,1,'initial half has no overload ATK');near(buffMul(o).aspd,1+c.bb.attack_speed/100);
  const first=e.hp;tick(o);near(first-e.hp,Math.round(operatorAttackPower(o,buffMul(o).atk)*.2));
  B.time=19.999;const talent=o.combatTalents[0],tb=Object.fromEntries(talent.blackboard.map(x=>[x.key,x.value]));near(ArkOperatorCombat.attackBonus(o),tb.atk);
  B.time=20;near(ArkOperatorCombat.attackBonus(o),tb.atk+c.bb.atk,'overload starts in second half');
  for(let i=0;i<20;i++)tick(o);const unit=o.releasedDrones[0],cap=1.1*c.bb.scale;assert.equal(unit.hits,Math.ceil((cap-.2)/.15));const hp=e.hp;tick(o);near(hp-e.hp,Math.round(operatorAttackPower(o,buffMul(o).atk)*cap),'overload increases actual cap and stack limit');
  assert.equal(B.projectiles.length,0,'Rockrock has no explosion');B.time=40;endOperatorSkill(o);assert.equal(o.releasedDrones,null);near(o.stunUntil,60,'20 seconds of overload produce 20 seconds stun');
 }
 for(const elapsed of [10,20,25,40]){const o=glow({cid:'char_4040_rockr',slot:1});begin(o);B.time=elapsed;endOperatorSkill(o);near(o.stunUntil||0,elapsed>20?elapsed+(elapsed-20):0,'early end only penalizes actual overload');}
 for(const c of rockTalents){const o=glow({...c,cid:'char_4040_rockr',slot:0});for(const time of [0,14.999,15,30,100]){B.time=time;near(ArkOperatorCombat.attackBonus(o),c.bb.atk*Math.min(c.bb.max_stack_cnt,Math.floor(time/15)));}}
 }`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:377,name:'澄闪'});
 try{
  rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);rt.__testMachine.run(`var o=glow();o.playerId='one';foe(14,0);begin(o);ArkOperatorCombat.update(0);B.operators.push({...o,id:2,playerId:'two',sp:0,skillState:null,releasedDrones:null,funnelPrd:null});`);
  const start=rt.snapshot();rt.advance(12);const expected=rt.snapshot();rt.restore(start);rt.advance(12);let actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(expected.battle));assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.operators[1].releasedDrones,null);
  rt.__testMachine.run(`o=B.operators[0];o.funnelPrd=Object.fromEntries(o.releasedDrones.map(d=>[o.skill.sourceId+':'+d.index,39]));B.time=Math.max(...o.releasedDrones.map(d=>d.nextAt));ArkOperatorCombat.update(0);`);
  const bomb=rt.snapshot();assert.equal(bomb.battle.projectiles.length,3);rt.advance(.4);const landed=rt.snapshot();rt.restore(bomb);rt.advance(.4);actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(landed.battle));assert.deepEqual(actual.rng,landed.rng);
  const live=rt.snapshot();rt.advance(30);rt.advance(5);const expired=rt.snapshot();rt.restore(live);rt.advance(30);rt.advance(5);actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(expired.battle));assert.deepEqual(actual.rng,expired.rng);assert.equal(actual.battle.operators[0].releasedDrones,null);
  rt.__testMachine.run(`o=glow({cid:'char_4040_rockr',slot:1});o.playerId='one';foe();begin(o);B.time=19.9;`);
  const beforeOverload=rt.snapshot();rt.advance(.2);const overload=rt.snapshot();rt.restore(beforeOverload);rt.advance(.2);actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(overload.battle));assert.deepEqual(actual.rng,overload.rng);assert.ok(actual.battle.time>actual.battle.operators[0].skillState.overloadAt);
  const rockLive=rt.snapshot();rt.advance(10);const rockEnd=rt.snapshot();rt.restore(rockLive);rt.advance(10);actual=rt.snapshot();assert.deepEqual(logicBattle(actual.battle),logicBattle(rockEnd.battle));assert.deepEqual(actual.rng,rockEnd.rng);assert.equal(actual.battle.operators[0].releasedDrones,null);assert.ok(actual.battle.operators[0].stunUntil>actual.battle.time);assert.ok(Math.abs(actual.battle.operators[0].stunUntil-60)<1e-6);
 }finally{rt.dispose();}
 console.log('FUNNEL OK 40 Goldenglow/Rockrock skill levels, 10 talent variants, locks/PRD/explosion/overload/RES and 5 signed restores');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
