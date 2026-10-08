'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json'),skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const focused=process.argv.includes('--source-hit-buffs');
const ids=f.ctx.ArkOperatorCombat.marksmanSkills.filter(id=>!focused||['skchr_mm_1','skchr_shotst_1'].includes(id));
const cases=Object.entries(chars).flatMap(([cid,c])=>(c.skills||[]).flatMap((s,index)=>ids.includes(s.skillId)?skills[s.skillId].levels.map((raw,i)=>({cid,index,id:s.skillId,level:i+1,bb:Object.fromEntries(raw.blackboard.map(b=>[b.key,b.value])),duration:raw.duration})):[]));
const helper=`
function near(a,b){assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);}
function marksman(c){
 Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],operators:[],summoneds:[],projectiles:[],particles:[],damageFeedback:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 G.skillChoices[c.cid]=c.index;ACCOUNT.ops[c.cid]={evolve:2,level:1,skillLevel:c.level,potential:0,trust:0,selectedSkill:c.index};
 const entry=debugTacticalEntry(c.cid),r=finalizeOperator(entry,null,[],false);
 const o={...r,id:1,charId:c.cid,name:entry.name,position:entry.position,profession:entry.profession,row:3,col:3,dir:'right',range:3,rangeGrids:entryRangeGrids(entry,false),
  hp:10000,maxHp:10000,atk:100,def:200,attackTime:2,attributeBase:{atk:100,def:200,aspd:1},atkType:'phys',cd:0,buffs:[],sp:r.skill.spCost,events:[],combatTalents:[],attackCrit:null,garrisonAdd:null,deployed:true,deployAt:0,deployT:2};
 o.cells=rangeCellsFor(o);B.operators=[o];return o;
}
function markEnemy(o,id=100){const cell=o.cells.find(c=>c[1]>o.col)||[o.row,o.col];const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x:cell[1],y:cell[0],hp:1e6,maxHp:1e6,atk:0,def:30,magicRes:0,moveSpeed:0,canAttack:false,cd:999,route:0,seg:0,cp:0};B.enemies.push(e);return e;}
function land(){for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,markCases:cases});
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 for(const c of markCases){
  let o=marksman(c),s=o.skill,b=c.bb;assert.equal(s.sourceId,c.id);assert.ok(s.combatMechanic);
  if(s.combatMechanic.next){
   const sp=o.sp;assert.equal(ArkOperatorCombat.attack(o),false);assert.equal(o.sp,sp,'no target preserves charged shot');
   const a=markEnemy(o),other=markEnemy(o,101);const outside={...a,id:199,x:o.col-2};B.enemies.push(outside);
   assert.equal(ArkOperatorCombat.attack(o),true);
   if(ArkNextAttackSkillData.profiles[c.id]?.delivery==='direct')assert.equal(B.projectiles.length,0,'source direct body resolves without a projectile');
   else assert.equal(a.hp,a.maxHp,'projectile has not hit yet');
   assert.equal(o.sp,0);assert.ok(!o.skillState);
   // Only S1 matches the proven ordinary Projectile.ActionController closure:
   // AttachBuffs precedes RunActions, so this first damage uses its new DEF debuff.
   land();const hit=Math.round(Math.max(5,100*b.atk_scale-30*(c.id==='skchr_shotst_1'?1+b.def:1)));assert.equal(a.maxHp-a.hp,hit*(b.times||1));
   assert.equal(other.maxHp-other.hp,c.id==='skchr_totter_1'?hit:0);assert.equal(outside.hp,outside.maxHp);
   if(c.id==='skchr_mm_1'){assert.ok(ArkOperatorCombat.sourceBuffActive(a,'sluggish'));near(a.operatorMoveSpeedDebuffs.sluggish.until,b.sluggish);near(ArkOperatorCombat.movementMultiplier(a),.2);assert.ok(!a.stunUntil);}
   if(c.id==='skchr_shotst_1'){near(enemyDef(a),30*(1+b.def));const defense=enemyDef(a);o.sp=s.spCost;ArkOperatorCombat.attack(o);land();near(enemyDef(a),defense,'same debuff refresh');B.time=b.duration;near(enemyDef(a),30);}
   B.enemies=[markEnemy(o,102)];o.sp=0;o.cd=0;ArkOperatorCombat.attack(o);land();assert.equal(o.sp,1,'normal attacks recover one SP');
  }else if(c.id==='skchr_shotst_2'){
   assert.equal(castSkill(o),false);assert.equal(o.sp,s.spCost);
   for(let i=0;i<7;i++)markEnemy(o,100+i);assert.equal(castSkill(o),true);assert.equal(o.sp,0);assert.ok(!o.skillState,'negative source duration is a single volley');land();
   assert.equal(B.enemies.filter(e=>e.hp<e.maxHp).length,5);for(const e of B.enemies.filter(e=>e.hp<e.maxHp)){assert.equal(e.maxHp-e.hp,Math.round(100*b.atk_scale-30));near(enemyDef(e),30*(1+b.def));}
   B.time=b.duration;for(const e of B.enemies)near(enemyDef(e),30);
  }else{
   const a=markEnemy(o);assert.equal(castSkill(o),true);assert.ok(o.skillState);assert.equal(a.hp,a.maxHp,'sustained skill does not nuke on cast');
   const power=100*(1+(b.atk||0));let scale=c.id==='skchr_totter_2'?b['attack@s2c.atk_scale']:1;
   ArkOperatorCombat.attack(o);land();assert.equal(a.maxHp-a.hp,Math.round(power*scale-30));
   near(o.cd,2*(c.id==='skchr_mm_2'?1+b.base_attack_time:1)/(1+(b.attack_speed||0)/100));
   if(c.id==='skchr_totter_2'){
    B.enemies=[];for(let i=0;i<4;i++)markEnemy(o,110+i);o.cd=0;ArkOperatorCombat.attack(o);
    assert.equal(B.projectiles.length,3);B.projectiles[0].target.dead=true;land();
    for(const e of B.enemies.filter(e=>!e.dead&&e.hp<e.maxHp))assert.equal(e.maxHp-e.hp,70,'launch count governs bonus despite midflight death');
   }else{
    near(a.slowUntil,b['attack@sluggish']);const random=gameRandom;
    try{for(const [roll,immune,stunned]of [[0,false,true],[.99,false,false],[0,true,false]]){
     gameRandom=()=>roll;const e=markEnemy(o,120);e.stunImmune=immune;B.enemies=[e];o.cd=0;ArkOperatorCombat.attack(o);land();
     assert.equal((e.stunUntil||0)>B.time,stunned);near(e.slowUntil,b['attack@sluggish']);if(stunned)near(e.stunUntil,b['attack@stun']);
    }}finally{gameRandom=random;}
   }
   B.time=c.duration;o.cd=999;B.enemies=[];update(0,0);assert.equal(o.skillState,null);near(buffMul(o).atk,1);near(buffMul(o).aspd,1);near(ArkOperatorCombat.attackInterval(o,null),2);
   o.sp=s.spCost;castSkill(o);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);
  }
 }
 // Failed activation cannot fire an enhanced shot for free (for example under SP lock).
 {const c=markCases[0],o=marksman(c),e=markEnemy(o);const cast=castSkill;try{castSkill=()=>false;ArkOperatorCombat.attack(o);land();assert.equal(e.maxHp-e.hp,70);assert.equal(o.sp,o.skill.spCost);}finally{castSkill=cast;}}
 `);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:1414,name:'技能批次'});
 try{
  p.startBattle();p.__testMachine.context.assert=assert;p.__testMachine.run(helper);
  for(const id of ids){const c=cases.find(c=>c.id===id&&c.level===7);
   p.__testMachine.run(`var caster=marksman(${JSON.stringify(c)});caster.playerId='one';markEnemy(caster);markEnemy(caster,101);if(!caster.skill.combatMechanic.next)castSkill(caster);ArkOperatorCombat.attack(caster);
    var ally={...caster,id:2,playerId:'two',col:5,hp:5000,buffs:[],sp:0,skill:null,skillState:null,cd:999};B.operators.push(ally);caster.cd=999;`);
   const checkpoint=p.snapshot();p.advance(.6);const expected=p.snapshot();p.restore(checkpoint);p.advance(.6);const actual=p.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' signed in-flight restore');assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.operators[1].hp,5000);assert.equal(actual.battle.operators[1].sp,0);
  }
 }finally{p.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/'+(focused?'marksman-hit-buff':'marksman-skill')+'-receipts.json'),JSON.stringify({date:'2026-09-18',receipts:cases.map(c=>({charId:c.cid,skillId:c.id,level:c.level,accepted:!c.id.startsWith('skchr_shotst_')})),limits:'Meteor S1 native ordinary projectile applies DEF before first damage; S2 ordering, cross-skill stacking and exact native DEFAULT refresh remain partial; talent/module not included'},null,2));
 console.log('MARKSMAN SKILLS OK '+cases.length+' source-level executions, '+ids.length+' signed two-owner replays; Meteor S1 before-body contract covered, S2 ordering remains partial');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
