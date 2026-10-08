'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const {spawnSync}=require('child_process');
if(process.argv.includes('--source-only')){
 const r=spawnSync('python',['-B','tools/build_client_programs.py','--check'],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
}else main().catch(e=>{console.error(e);process.exitCode=1;});
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 const source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
 const profiles=f.run('ArkClientProgramData.profiles'),old=f.run('ArkClientStatBuffData.profiles'),cases=[];
 for(const [id,p]of Object.entries(profiles))for(const charId of p.charIds){
  const max=[4,7,10][chars[charId].phases.length-1],index=chars[charId].skills.findIndex(s=>s.skillId===id);
  source[id].levels.slice(0,max).forEach((lv,i)=>cases.push({id,charId,index,level:i+1,bb:Object.fromEntries(lv.blackboard.map(x=>[x.key,x.value])),duration:lv.duration,spCost:lv.spData.spCost,new:!old[id]}));
 }
 f.ctx.cases=cases;
 const helpers=`
 function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
 function makeProgramUnit(c){
  Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],damageFeedback:[],summoneds:[],operators:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
  G.skillChoices[c.charId]=c.index;ACCOUNT.ops[c.charId]={evolve:2,level:1,skillLevel:c.level,potential:1,selectedSkill:c.index,trust:0};
  const entry=debugTacticalEntry(c.charId)||ROSTER[c.charId];assert.ok(entry,'reachable '+c.charId);
  const r=finalizeOperator(entry,null,[],false),grids=entryRangeGrids(entry,false);
  const o={...r,id:1,charId:c.charId,name:entry.name,profession:entry.profession,position:entry.position,dir:'right',row:3,col:3,rangeGrids:grids,range:3,
   hp:400,maxHp:1000,atk:150,def:240,magicRes:20,attributeBase:{atk:100,def:200,maxHp:1000,aspd:1.5},attackTime:2/1.5,
   combatTalents:[],events:[],attackCrit:null,garrisonAdd:null,cd:999,buffs:[],sp:0,deployAt:0,deployed:true,deployT:2};
  o.cells=rangeCellsFor(o);B.operators=[o];return o;
 }
 `;
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helpers}
  const receipt=[];
  near(ArkClientPrograms.calculate(100,100,-3,{addition:0,multiplier:0,final_addition:20,final_scaler:1}),20,'native percentage bucket clamps before final addition');
  for(const c of cases){
   const o=makeProgramUnit(c);assert.ok(o.skill.clientProgram,c.id);assert.deepEqual(o.skill.effects,[],'description operators replaced');
   assert.equal(o.skill.sourceId,c.id);assert.equal(o.skill.spCost,c.spCost);assert.deepEqual(JSON.parse(JSON.stringify(o.skill.blackboard)),JSON.parse(JSON.stringify(c.bb)));
   o.sp=o.skill.spCost;assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.equal(o.sp,0);
   assert.ok(o.clientProgramState.buffs.length>0);assert.ok(o.clientProgramState.buffs.every(b=>b.sourceId===o.id&&b.targetId===o.id));
   if(c.new){
    near(operatorAttackPower(o,buffMul(o).atk),150+100*(c.bb.atk||0),'source ATK');
    near(operatorDefense(o),240+200*(c.bb.def||0),'source DEF');
    near(o.maxHp,1000*(1+(c.bb.max_hp||0)),'source HP');near(o.hp/o.maxHp,.4,'native HP ratio');
    const res=20*(1+(c.bb.magic_resistance||0));near(operatorResistance(o),res,'source MR');
    const damage=enemyDamageToOperator({atk:1000,atkType:'arts'},o);assert.equal(damage,Math.round(1000*(1-res/100)),'actual arts damage');
    o.hp=o.maxHp;inflictDamage(o,damage,false,'arts');near(o.hp,o.maxHp-damage,'actual arts HP consumer');
    const detail=buildOperatorDetailModel(debugTacticalEntry(c.charId)||ROSTER[c.charId],o,true);
    near(detail.atk,operatorAttackPower(o,buffMul(o).atk),'live ATK panel');near(detail.def,operatorDefense(o),'live DEF panel');near(detail.magicRes,res,'live MR panel');
    o.hp=o.maxHp*.25;
    const e={id:99,enemyId:'enemy_1002_nsabr',x:3,y:3,hp:1e8,maxHp:1e8,atk:0,def:0,magicRes:0,moveSpeed:0,route:0,seg:0,cp:0};B.enemies=[e];o.cd=0;
    assert.equal(ArkOperatorCombat.attack(o),true);for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);
    assert.ok(e.hp<e.maxHp,'new source body produces actual attack');B.enemies=[];B.projectiles=[];
   }
   const activeRatio=o.hp/o.maxHp,end=o.skillState.until;B.time=end;endOperatorSkill(o,'expire');
   assert.equal(o.clientProgramState,undefined);near(o.maxHp,1000);near(o.hp/1000,activeRatio);near(operatorDefense(o),240);near(operatorResistance(o),20);near(buffMul(o).atk,1);
   o.sp=o.skill.spCost;castSkill(o);o.hp=0;tryKill(o);assert.equal(o.clientProgramState,undefined);assert.equal(o.hp,0);
   receipt.push({charId:c.charId,skillId:c.id,level:c.level,new:c.new});
  }
  // Independently calculated fixture: ((100+10)*2+20)*0.5 = 120,
  // a second Buff adds +40 speed only until t=4. No legacy effect objects.
  const c=cases.find(c=>c.id==='skchr_acfend_1'),o=makeProgramUnit(c),p=ArkClientProgramData.programs[o.skill.clientProgram.prefabId],saved=JSON.parse(JSON.stringify(p.buffs));
  p.buffs=[{id:'fixture-atk',scope:'self',stacking:{max_stacks:1},lifetime:{kind:'timed',duration:{constant:10}},modifiers:[
   {attribute:'atk',formula:'addition',value:{constant:10}},{attribute:'atk',formula:'multiplier',value:{constant:.5}},
   {attribute:'atk',formula:'final_addition',value:{constant:20}},{attribute:'atk',formula:'final_scaler',value:{constant:.5}}]},
   {id:'fixture-speed',scope:'self',stacking:{max_stacks:1},lifetime:{kind:'timed',duration:{constant:4}},modifiers:[{attribute:'attack_speed',formula:'addition',value:{constant:40}}]}];
  try{
   o.sp=o.skill.spCost;castSkill(o);near(operatorAttackPower(o,buffMul(o).atk),120);near(ArkOperatorCombat.attackInterval(o,o.skill),2/1.9);
   o.flow={atk:20};near(operatorAttackPower(o,buffMul(o).atk),130,'final multiplier includes external flat attack');
   B.time=4;ArkClientPrograms.tick(o,B.time);assert.equal(o.clientProgramState.buffs.length,1);near(ArkOperatorCombat.attackInterval(o,o.skill),2/1.5);
   endOperatorSkill(o);near(operatorAttackPower(o,buffMul(o).atk),170);
  }finally{p.buffs=saved;}
  const h=makeProgramUnit(c);h.sp=h.skill.spCost;castSkill(h);h.hp=h.maxHp*.3;
  updateOperatorBaseStats(h,{...h,maxHp:2000,attributeBase:{...h.attributeBase,maxHp:2000}});near(h.maxHp,2000*(1+c.bb.max_hp));near(h.hp/h.maxHp,.3);
  endOperatorSkill(h);near(h.maxHp,2000);near(h.hp,600);
  // A real Cello S3 link owns an independent HP delta. Program ticks/removal
  // must not erase it, and removing the link must not leave that delta behind.
  for(const sourceId of ['skchr_vigna_1','skchr_acfend_1']){
   const q=makeProgramUnit(cases.find(x=>x.id===sourceId&&x.level===7));q.sp=q.skill.spCost;castSkill(q);
   const cap=q.maxHp,hp=q.hp,grant=cap*.5;
   const linker={...q,id:10,charId:'char_245_cello',maxHp:100,hp:100,clientProgramState:undefined,buffs:[],cells:[[q.row,q.col]],
    skill:{sourceId:'skchr_cello_3',blackboard:{'cello_s_3[max_hp].max_hp':.5,'cello_s_3[atk].atk':0,'cello_s_3[def].def':0}},skillState:{until:100,deltas:{}}};
   B.operators.push(linker);ArkElementOperators.cast(linker);near(q.maxHp,cap+grant);near(q.hp,hp+grant);
   ArkClientPrograms.tick(q,0);near(q.maxHp,cap+grant);near(q.hp,hp+grant);near(ArkElementOperators.hpBonus(q),grant);
   if(sourceId==='skchr_vigna_1'){endOperatorSkill(q);near(q.maxHp,cap+grant);near(q.hp,hp+grant);}
   else{endOperatorSkill(linker);near(q.maxHp,cap);ArkClientPrograms.tick(q,0);near(q.maxHp,cap);const ratio=q.hp/cap;endOperatorSkill(q);near(q.maxHp,1000);near(q.hp,1000*ratio);}
  }
  const invalid={sourceId:c.id,spCost:10,duration:20,blackboard:{...c.bb,unknown:1}};assert.throws(()=>ArkClientPrograms.configure(invalid,c.charId),/Invalid client program/);
  return receipt;
 })()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:312,name:'源程序验证'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helpers);
  for(const c of cases.filter(c=>c.new&&c.level===7)){
   runtime.__testMachine.run(`var o=makeProgramUnit(${JSON.stringify(c)});o.playerId='one';o.sp=o.skill.spCost;castSkill(o);B.operators.push({...o,id:2,col:4,playerId:'two',clientProgramState:undefined,buffs:[],skillState:null,skill:null,cd:999});`);
   const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.operators[1].clientProgramState,undefined);
   runtime.advance(.25);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.25);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,c.id+' active program replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{runtime.dispose();}
 fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/client-program-receipts.json',JSON.stringify({scope:'shared program skill bodies; native and local timing boundaries retained',receipts},null,2));
 console.log('CLIENT PROGRAMS OK '+receipts.length+' identity/level cast-expire-death cases; '+new Set(receipts.filter(x=>x.new).map(x=>x.skillId)).size+' new skill IDs; four formula layers/multi-Buff/HP ratio/rebind and signed two-owner replay');
}
