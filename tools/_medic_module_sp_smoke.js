'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),eq=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json'),ranges=require('../data/ArknightsGameData/zh_CN/gamedata/excel/range_table.json');
const cases=['char_128_plosis','char_171_bldsk'].flatMap(cid=>eq['uniequip_002_'+cid.split('_').at(-1)].phases.map(p=>({cid,level:p.equipLevel,talents:p.parts.flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.name),traits:p.parts.flatMap(p=>p.overrideTraitDataBundle?.candidates||[])})));
const helper=`
function near(a,b,msg=''){assert.ok(Math.abs(a-b)<1e-6,msg+': '+a+' != '+b);}
function moduleMedic(c,skill=0){
 G.skillChoices[c.cid]=skill;const base=ROSTER[c.cid];assert.ok(base);
 const entry={...base,profile:{...base.profile,normal:{...base.profile.normal,evolvePhase:'PHASE_2',charLevel:50,equipLevel:c.level}}},stats=finalizeOperator(entry,null,[],false);
 const x={...stats,id:1,charId:c.cid,name:entry.name,profession:entry.profession,position:entry.position,row:6,col:5,dir:'right',rangeGrids:entryRangeGrids(entry,false),hp:100000,maxHp:100000,atk:100,attributeBase:{atk:100,def:0,aspd:1},buffs:[],events:[],garrisonAdd:null};
 startBattle([x],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});const o=B.operators[0];Object.assign(o,{deployed:true,deployAt:0,deployT:2,sp:0,cd:999});return o;
}
function receiver(row,col,extra={}){const t={id:B.operators.length+1,charId:'recipient',row,col,dir:'right',cells:[[row,col]],hp:100,maxHp:10000,atk:0,def:0,cd:999,attackTime:2,buffs:[],events:[],combatTalents:[],deployAt:0,deployT:2,deployed:true,sp:0,basicAttack:{action:'attack'},skill:{sourceId:'fixture',name:'fixture',spCost:99,maxCharge:1,spType:'INCREASE_WITH_TIME',duration:0,effects:[]},...extra};B.operators.push(t);return t;}
function moduleDeath(o,enemyLevel='NORMAL',enemyId='fixture'){const [y,x]=o.cells.find(([r,c])=>r!==o.row||c!==o.col),e={enemyId,id:90+B.enemies.length,x,y,hp:0,maxHp:100,...(enemyLevel?{enemyLevel}:{})};B.enemies.push(e);killEnemy(e);}
function verifyModule(c){
 let o=moduleMedic(c),original=JSON.stringify(o.cells);
 if(c.cid==='char_128_plosis'){
  assert.equal(JSON.stringify(o.rangeGrids),JSON.stringify(sourceRange));const nearValue=c.talents[0]?.blackboard[0].value||.3;
  const t=receiver(6,8),far=receiver(0,0);near(ArkMedicSkills.naturalSpBonus(t),nearValue);near(ArkMedicSkills.naturalSpBonus(far),.3);
  update(1,1);near(t.sp,1+nearValue);near(far.sp,1.3);
  t.skill.spType='INCREASE_WHEN_ATTACK';near(ArkMedicSkills.naturalSpBonus(t),0);t.skill.spType='INCREASE_WITH_TIME';t.skillState={until:99,deltas:{}};update(1,1);near(t.sp,1+nearValue);
  t.skillState=null;t.col=99;near(ArkMedicSkills.naturalSpBonus(t),.3);t.col=8;
  B.operators.push({...o,id:50});near(ArkMedicSkills.naturalSpBonus(t),nearValue,'duplicate aura takes highest');B.operators.pop();o.dead=true;near(ArkMedicSkills.naturalSpBonus(t),0);o.dead=false;
  const token=receiver(6,7);B.operators.pop();B.summoneds.push(token);near(ArkMedicSkills.naturalSpBonus(token),0);
  o=moduleMedic(c,1);const u=receiver(5,8);near(ArkMedicSkills.naturalSpBonus(u),.3);o.sp=o.skill.spCost;assert.equal(castSkill(o),true);near(ArkMedicSkills.naturalSpBonus(u),nearValue);assert.equal(o.cells.length,15);endOperatorSkill(o);assert.equal(JSON.stringify(o.cells),original);near(ArkMedicSkills.naturalSpBonus(u),.3);
  const m=receiver(6,8);o.cd=0;performHealingAction(o);near(m.hp,200,'expanded module cell receives normal healing');
 }else{
  const t=receiver(6,6),b=Object.fromEntries((c.talents[0]?.blackboard||[]).map(x=>[x.key,x.value]));
  for(const level of ['NORMAL','ELITE','BOSS']){o.sp=t.sp=0;moduleDeath(o,level);const value=b['bldsk_t_1[self]['+(level==='NORMAL'?'no':'ex')+'].sp']||2;near(o.sp,value);near(t.sp,value);}
  for(const level of ['ELITE','BOSS']){const id=Object.entries(ArkElementData.enemies).find(([,e])=>e.enemyLevel===level)[0];o.sp=t.sp=0;moduleDeath(o,null,id);near(t.sp,b['bldsk_t_1[rand][ex].sp']||2,'source handbook rank');}
  o.sp=t.sp=0;t.skillState={until:99,deltas:{}};moduleDeath(o,'ELITE');near(t.sp,0);t.skillState=null;
  t.hp=4999;near(healOperator(o,t,100),115);t.hp=5000;near(healOperator(o,t,100),100);t.hp=100;near(healOperator(o,t,100,{regen:true}),100);
  t.hp=100;t.basicAttack.noDirectHeal=true;near(healOperator(o,t,100),0);t.basicAttack.noDirectHeal=false;t.row=99;t.sp=0;o.sp=0;moduleDeath(o,'ELITE');near(t.sp,0);
 }
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,moduleCases:cases,sourceRange:ranges['y-3'].grids});f.run(`chooseBand('band_amiya');window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of moduleCases)verifyModule(c);`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:8264,name:'SP模块'});
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);
  for(const c of cases.filter(c=>c.level===3)){rt.__testMachine.run(`var o=moduleMedic(${JSON.stringify(c)});o.playerId='one';receiver(6,6,{playerId:'two'});receiver(6,7,{playerId:'two'});`);const save=rt.snapshot(),event=c.cid==='char_171_bldsk'?'moduleDeath(B.operators[0],"BOSS")':'';
   if(event)rt.__testMachine.run(event);rt.advance(.7);const expected=rt.snapshot();rt.restore(save);if(event)rt.__testMachine.run(event);rt.advance(.7);assert.deepEqual(rt.snapshot().battle,expected.battle);assert.deepEqual(rt.snapshot().rng,expected.rng);
  }
 }finally{rt.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/medic-module-sp-receipts.json'),JSON.stringify({date:'2026-09-14',variants:cases.map(c=>({charId:c.cid,level:c.level})),signedReplays:2,limits:'other SP aura families, precise frame phases and healing bonus stacking pending'},null,2));
 console.log('MEDIC MODULE SP OK 6 source modules, expanded heal/skill ranges, elite/boss source rank, locks, duplicates and 2 signed replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
