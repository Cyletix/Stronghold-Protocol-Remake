'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
if(process.argv.includes('--source-only')){
 for(const args of [['-B','tools/build_client_stat_buffs.py','--check'],['-B','-m','unittest','discover','-s','tools','-p','test_client_stat_buffs.py']]){
  const result=require('node:child_process').spawnSync('python',args,{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw result.error||Error(result.stdout+result.stderr);
  console.log('CLIENT STAT GRAPH SOURCE OK '+(result.stdout+result.stderr).trim());
 }
}else main().catch(error=>{console.error(error);process.exitCode=1;});
async function main(){
 const f=require('./_browser_fixture')(),source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
 await f.run('initMode()');
 const profiles=f.run('ArkClientStatBuffData.profiles'),cases=[];
 for(const [id,p]of Object.entries(profiles))for(const charId of p.charIds){
  const index=chars[charId].skills.findIndex(s=>s.skillId===id),max=[4,7,10][chars[charId].phases.length-1];
  source[id].levels.slice(0,max).forEach((lv,i)=>cases.push({id,charId,index,level:i+1,bb:Object.fromEntries(lv.blackboard.map(x=>[x.key,x.value])),duration:lv.duration,spCost:lv.spData.spCost,initSp:lv.spData.initSp,spType:lv.spData.spType}));
 }
 f.ctx.assert=assert;f.ctx.statCases=cases;
 const helpers=`
 function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-7,msg+': '+a+' != '+b);}
 function makeStat(c,staticSpeed=1.5){
  Object.assign(B,{over:false,phase:'battle',time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],projectiles:[],particles:[],damageFeedback:[],summoneds:[],operators:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
  G.skillChoices[c.charId]=c.index;ACCOUNT.ops[c.charId]={evolve:2,level:1,skillLevel:c.level,potential:1,selectedSkill:c.index,trust:0};
  const entry=debugTacticalEntry(c.charId);assert.ok(entry,c.charId+' reachable through library');
  const r=finalizeOperator(entry,null,[],false),grids=entryRangeGrids(entry,false);
  const o={...r,id:1,charId:c.charId,name:entry.name,profession:entry.profession,position:entry.position,dir:'right',row:3,col:3,rangeGrids:grids,range:3,
   hp:10000,maxHp:10000,atk:120,def:240,magicRes:0,attributeBase:{atk:100,def:200,aspd:staticSpeed},attackTime:2/staticSpeed,
   combatTalents:[],events:[],attackCrit:null,garrisonAdd:null,cd:999,buffs:[],sp:0,deployAt:0,deployed:true,deployT:2};
  o.cells=rangeCellsFor(o);B.operators=[o];return o;
 }
 function statAction(o){
  o.cd=0;o._droneTarget=null;o._droneHits=0;
  const cell=o.cells.find(c=>c[0]!==o.row||c[1]!==o.col)||[o.row,o.col];
  if(operatorAction(o)==='heal'){
   const ally={id:200,row:cell[0],col:cell[1],hp:1,maxHp:1e8,deployAt:0,deployT:2,basicAttack:{action:'damage'}};B.operators.push(ally);
   assert.equal(performHealingAction(o),true,o.charId+' heal');B.operators.pop();return ally.hp-1;
  }
  const e={id:100,enemyId:'enemy_1002_nsabr',x:cell[1],y:cell[0],hp:1e8,maxHp:1e8,atk:0,def:0,magicRes:0,moveSpeed:0,canAttack:false,stunUntil:999,route:0,seg:0,cp:0,cd:999};B.enemies=[e];
  assert.equal(ArkOperatorCombat.attack(o),true,o.charId+' attack');
  for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);B.projectiles=[];return e.maxHp-e.hp;
 }
 `;
 const receipts=f.run(`(()=>{chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};${helpers}
  const done=[],roster=ROSTER_LIST.map(x=>x.charId).join(',');
  for(const c of statCases){
   const o=makeStat(c),s=o.skill,b=c.bb;assert.ok(s.clientStatGraph,c.id);
   if(ArkClientStatBuffData.profiles[c.id].modeGraph){assert.equal(s.clientStatGraph.modeContract.charId,c.charId);assert.equal(s.clientStatGraph.modeContract.kind,'all_serialized_modes_preserve_attack');}
   for(const key of ['duration','spCost','initSp','spType'])assert.equal(s[key],c[key],c.id+'/'+key);
   assert.deepEqual(JSON.parse(JSON.stringify(s.blackboard)),JSON.parse(JSON.stringify(b)));
   o.sp=s.spCost;assert.equal(castSkill(o),true);assert.equal(castSkill(o),false);assert.equal(o.sp,0);
   near(o.atk*buffMul(o).atk,120+100*(b.atk||0),'percent adds to raw base');
   near(o.def*buffMul(o).def,240+200*(b.def||0),'defense raw base');
   const expectedInterval=(2+(b.base_attack_time||0))/ArkAttributes.clampSpeed(1.5+(b.attack_speed||0)/100);
   near(ArkOperatorCombat.attackInterval(o,s),expectedInterval,'base seconds before static and active speed');
   const dealt=statAction(o);assert.ok(dealt>0,c.id+' real action');near(o.cd,expectedInterval,'actual action cooldown');
   const saved={buffs:o.buffs,state:o.skillState};o.buffs=[];o.skillState=null;const base=statAction(o);o.buffs=saved.buffs;o.skillState=saved.state;
   assert.ok(Math.abs(dealt-base*(120+100*(b.atk||0))/120)<=4,c.id+' damage/healing multiplier');
   if(b.def)assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},o),Math.round(1000-(240+200*b.def)));
   if(s.clientStatGraph.constants?.defense_scale===0){assert.equal(ArkClientStatBuffSkills.defense(o,1e9),0);assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},o),1000);}
   B.enemies=[];o.cd=999;B.phase='rest';update(.25,0);assert.equal(B.time,0);B.phase='battle';
   B.time=s.duration-1e-5;update(0,0);assert.ok(o.skillState);assert.equal(o.sp,0);B.time=s.duration;update(0,0);assert.equal(o.skillState,null);
   near(buffMul(o).atk,1);near(buffMul(o).def,1);near(ArkOperatorCombat.attackInterval(o,null),2/1.5);
   o.sp=s.spCost;castSkill(o);o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);
   done.push({charId:c.charId,skillId:c.id,level:c.level});
  }
  assert.equal(ROSTER_LIST.map(x=>x.charId).join(','),roster);
  for(const change of [{extra:1},{atk:NaN},{atk:-.5}])assert.throws(()=>ArkClientStatBuffSkills.configure({sourceId:'skcom_atk_up[1]',blackboard:change,duration:20},ArkClientStatBuffData.profiles['skcom_atk_up[1]'].charIds[0]),/Invalid client stat graph/);
  const unknown={sourceId:'unknown',blackboard:{atk:1},effects:[{type:'marker'}]};ArkClientStatBuffSkills.configure(unknown);assert.equal(unknown.effects[0].type,'marker');
  const modeCase=statCases.find(c=>c.id==='skchr_vigna_2'&&c.level===7),modeSkill=makeStat(modeCase).skill;
  for(const wrong of [undefined,'char_102_texas','char_134_ifrit'])assert.throws(()=>ArkClientStatBuffSkills.configure({...modeSkill},wrong),/Invalid client stat graph/,'mode proof requires its actual character');
  const profile=ArkClientStatBuffData.profiles.skchr_vigna_2,realMode=profile.modeGraph;
  try{
   for(const changed of [{...realMode,kind:'different_mode_attack'},{...realMode,characters:['char_102_texas']},{...realMode,proofs:[]},{...realMode,proofs:realMode.proofs.map(p=>({...p,combat_graph_sha256:'unreviewed'}))}]){
    profile.modeGraph=changed;assert.throws(()=>ArkClientStatBuffSkills.configure({...modeSkill},'char_290_vigna'),/Invalid client stat graph/);
   }
  }finally{profile.modeGraph=realMode;}
  const oldDamageType=ArkAttackProfiles.char_290_vigna.damageType;
  try{ArkAttackProfiles.char_290_vigna.damageType='magic';assert.throws(()=>ArkClientStatBuffSkills.configure({...modeSkill},'char_290_vigna'),/Invalid client stat graph/);}
  finally{ArkAttackProfiles.char_290_vigna.damageType=oldDamageType;}
  const vigna1=statCases.find(c=>c.id==='skchr_vigna_1'&&c.level===7),vigna2=makeStat(modeCase);vigna2.sp=vigna2.skill.spCost;castSkill(vigna2);endOperatorSkill(vigna2);
  const nextVigna=makeStat(vigna1);assert.equal(nextVigna.skill.sourceId,vigna1.id);assert.equal(nextVigna.skill.clientStatGraph.modifiers.base_attack_time,undefined);near(ArkOperatorCombat.attackInterval(nextVigna,null),2/1.5);
  const gyukiCase=statCases.find(c=>c.id==='skchr_gyuki_2'&&c.level===7),gyuki=makeStat(gyukiCase);gyuki.sp=gyuki.skill.spCost;castSkill(gyuki);
  gyuki.buffs.push({def:1.5,until:999});gyuki.flow={def:50};gyuki.elementDefLoss=-20;gyuki.erosionUntil=999;gyuki.erosionFactor=.5;
  assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},gyuki),1000,'final zero follows buffs, flat additions and erosion');
  const gyukiEntry=debugTacticalEntry('char_289_gyuki');assert.equal(buildOperatorDetailModel(gyukiEntry,gyuki,true).def,0,'active detail shows real zero');
  updateOperatorBaseStats(gyuki,{...gyuki,def:600,attributeBase:{...gyuki.attributeBase,def:500}});
  assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},gyuki),1000,'live base recalculation cannot undo final zero');
  endOperatorSkill(gyuki);assert.equal(enemyDamageToOperator({atk:1000,atkType:'phys'},gyuki),560,'expiry restores updated base plus independent bonuses');
  assert.equal(buildOperatorDetailModel(gyukiEntry,gyuki,true).def,440,'detail follows remaining buffs, additions and erosion after zero expires');
  const zero=makeStat(gyukiCase);zero.row=14;zero.col=7;zero.def=900;zero.attributeBase.def=900;zero.sp=zero.skill.spCost;castSkill(zero);
  const ordinary=(id,def)=>({...zero,id,charId:'test',def,attributeBase:{atk:100,def,aspd:1.5},buffs:[],skillState:null,skill:null,cd:999,flow:null,elementDefLoss:0});
  B.operators=[zero,ordinary(2,400),ordinary(3,250)];
  const bossBase=SOURCE_BATTLES.levels['activities/act1autochess/level_act1autochess_h07_04'].enemies.enemy_1521_dslily;
  const boss={...bossBase,x:10,y:15,hp:bossBase.maxHp,cd:0,dead:false,route:0,seg:0,cp:0,wait:0};setupEnemy(boss,bossBase);B.enemies=[boss];update(.001,0);
  assert.deepEqual(boss.atkTargets.map(x=>x.id),[2,3],'engine highest-defense targets exclude the active zero');
  endOperatorSkill(zero);boss.atkPhase=null;boss.cd=0;update(.001,0);assert.deepEqual(boss.atkTargets.map(x=>x.id),[1,2],'target eligibility recovers after skill');
  const linker={id:10,charId:'char_245_cello',row:14,col:6,cells:[[14,7]],range:2,deployAt:0,deployT:2,hp:1000,maxHp:1000,atk:100,def:100,buffs:[],
   skill:{sourceId:'skchr_cello_3',blackboard:{'cello_s_3[max_hp].max_hp':0,'cello_s_3[atk].atk':0,'cello_s_3[def].def':.5}},skillState:{until:999}};
  B.operators.push(linker);zero.sp=zero.skill.spCost;castSkill(zero);ArkElementOperators.cast(linker);
  assert.ok(B.operators[1].buffs.some(b=>b.elementOwner===10&&b.def===1.5),'defense-link targeting sees zero after skill');
  assert.ok(!zero.buffs.some(b=>b.elementOwner===10&&b.def));
  endOperatorSkill(zero);ArkElementOperators.cast(linker);assert.ok(zero.buffs.some(b=>b.elementOwner===10&&b.def===1.5),'defense-link target returns on expiry');
  const invalidConstant=ArkClientStatBuffData.profiles.skchr_gyuki_2.constants;
  try{ArkClientStatBuffData.profiles.skchr_gyuki_2.constants={defense_scale:.5};assert.throws(()=>makeStat(gyukiCase),/Invalid client stat graph/);}
  finally{ArkClientStatBuffData.profiles.skchr_gyuki_2.constants=invalidConstant;}
  const c=statCases.find(c=>c.id==='skchr_glassb_1'&&c.level===7),o=makeStat(c);o.sp=o.skill.spCost;castSkill(o);
  updateOperatorBaseStats(o,{...o,attributeBase:{atk:100,def:200,aspd:2},attackTime:1});
  near(ArkOperatorCombat.attackInterval(o,o.skill),(2+c.bb.base_attack_time)/2,'live static-speed recalculation');
  endOperatorSkill(o);near(o.attackTime,1);near(ArkOperatorCombat.attackInterval(o,null),1);
  return done;
 })()`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const runtime=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:244,name:'原图增益验证'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;runtime.__testMachine.run(helpers);
  for(const id of ['skchr_astesi_1','skchr_glassb_1','skchr_hsguma_1','skchr_ifrit_1','skchr_lisa_1','skchr_shining_1','skchr_vigna_1','skchr_vigna_2','skchr_gyuki_2']){
   const c=cases.find(c=>c.id===id&&c.level===7);assert.ok(c);
   runtime.__testMachine.run(`var o=makeStat(${JSON.stringify(c)});o.playerId='one';o.sp=o.skill.spCost;castSkill(o);var t={...o,id:2,col:4,playerId:'two',buffs:[],skillState:null,skill:null,cd:999};B.operators.push(t);`);
   const checkpoint=runtime.snapshot();assert.equal(checkpoint.battle.operators[1].buffs.length,0);
   runtime.advance(.25);const expected=runtime.snapshot();runtime.restore(checkpoint);runtime.advance(.25);const actual=runtime.snapshot();
   assert.deepEqual(actual.battle,expected.battle,id+' signed replay');assert.deepEqual(actual.rng,expected.rng);
  }
 }finally{runtime.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/client-stat-buff-receipts.json'),JSON.stringify({scope:'strict timed self-stat graph bodies, isolated talents and native frame timing',receipts},null,2));
 console.log('CLIENT STAT GRAPHS OK '+receipts.length+' identity/skill/level actions, '+Object.keys(profiles).length+' skill IDs; nine signed two-owner restores');
}
