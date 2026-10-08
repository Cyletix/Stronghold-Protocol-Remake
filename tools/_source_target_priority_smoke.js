'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const helper=fs.readFileSync(require.resolve('./_operator_skill_modes_smoke'),'utf8').match(/const helper=`([\s\S]*?)`;/)[1];
async function main(){
 const f=require('./_browser_fixture')();await f.run('initMode()');f.ctx.assert=assert;
 f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}
 const originalPlan=ArkSkillModes.plan;
 ArkSkillModes.plan=(o,plan)=>o.targetContract?{...plan,...o.targetContract}:originalPlan(o,plan);
 function select(flags,rows){
  const o=makeMode({cid:'char_174_slbell',index:0,level:7});
  o.skill=null;o.skillState=null;o.charId='target-contract-fixture';o.subProfession='';
  o.basicAttack={action:'attack',kind:'single',damageType:'phys'};o.targetContract=flags;
  for(const [i,row]of rows.entries())modeEnemy(o,i+100,{enemyId:'target-contract-enemy',x:o.col+1,y:o.row,...row});
  const emitted=ArkOperatorCombat.attack(o);return emitted?B.projectiles[0].target.id:null;
 }
 const base=[{applyWay:'RANGED',position:'MELEE',flying:false},{applyWay:'MELEE',position:'RANGED',flying:true}];
 assert.equal(select({},base),100,'legacy equal-distance order remains unchanged');
 assert.equal(select({airFirst:true},base),101,'postFilter6 gives flight priority');
 assert.equal(select({airFirst:true,priorityApplyWay:'ranged'},base),100,'secondary ranged applyWay outranks flight');
 assert.equal(select({airFirst:true,priorityApplyWay:'ranged'},[{applyWay:'MELEE',position:'RANGED'},{applyWay:'MELEE',flying:true}]),101,'no ranged target falls back to flight; position is irrelevant');
 for(const way of ['ALL',2,3])assert.equal(select({airFirst:true,priorityApplyWay:'ranged'},[{applyWay:'MELEE',flying:true},{applyWay:way,flying:false}]),101,'source ranged bit matches '+way);
 assert.equal(select({airFirst:true,priorityApplyWay:'ranged'},[{applyWay:'RANGED'},{applyWay:'RANGED',flying:true}]),101,'flight order remains within the ranged group');
 assert.throws(()=>select({airFirst:true,priorityApplyWay:'ranged',targets:2},base),/requires one target/,'single-target proof cannot silently admit a multi-target plan');
 assert.equal(select({airFirst:true},[{flying:true,tauntLevel:0},{flying:true,sourceAttributes:{tauntLevel:2}}]),101,'source hatred orders equally flying candidates');
 assert.equal(select({airFirst:true},[{flying:true,tauntLevel:2},{flying:true,tauntLevel:2}]),100,'equal source priority retains stable existing tie order');
 for(const state of [{removed:true},{untargetable:true},{targetFree:true},{invisibleUntil:1},{camouflageUntil:1},{dead:true},{hp:0}])
  assert.equal(select({airFirst:true,priorityApplyWay:'ranged'},[{applyWay:'RANGED',flying:true,...state},{applyWay:'MELEE'}]),101,'invalid preferred target cannot displace an eligible target');
 assert.equal(select({airFirst:true},[{targetFree:true},{removed:true}]),null,'no eligible target means no emitted action');
 ArkSkillModes.plan=originalPlan;
 // Read the live public attribute consumer from an actual owned finite Buff.
 const a={id:1,hp:100,row:3,col:3,deployAt:0,deployT:2,tauntLevel:0};
 const b={...a,id:2,deployAt:1};
 const skill=Object.values(ArkExternalCombatData.enemies).flatMap(p=>p.skills||[]).find(s=>s.kind==='selector-sp-tagged-ranged');assert.ok(skill);
 const e={x:3,y:3,rangeRadius:5},params={maxTargets:1},context={time:2,candidates:[a,b],blocker:b};
 assert.equal(ArkEnemySkills.targets(e,skill,params,context)[0],b,'existing equal-hatred deployment order');
 b.skill={clientProgram:{prefabId:'taunt-contract-fixture'}};b.skillState={until:4};
 b.clientProgramState={ownerId:b.id,prefabId:'taunt-contract-fixture',buffs:[{sourceId:b.id,targetId:b.id,until:4,modifiers:[{attribute:'taunt_level',formula:'addition',value:-1}]}]};
 assert.equal(ArkClientPrograms.targetPriority(b,2),-1);
 assert.equal(ArkEnemySkills.targets(e,skill,params,context)[0],a,'tagged source skill consumes live taunt layer, without blocker override');
 const ordinary={...skill,kind:'selector-sp-ranged'};
 assert.equal(ArkEnemySkills.targets(e,ordinary,params,context)[0],b,'physical-blocker priority is retained for its existing selector contract');
 context.blocker=null;assert.equal(ArkEnemySkills.targets(e,ordinary,params,context)[0],a);
 const restored=JSON.parse(JSON.stringify(b));assert.equal(ArkClientPrograms.targetPriority(restored,2),-1,'owned attribute state restores without rebinding');
 context.time=4;assert.equal(ArkEnemySkills.targets(e,skill,params,context)[0],b,'expired taunt layer restores original deployment ordering');
 for(const state of [{removed:true},{untargetable:true},{targetFree:true},{invisibleUntil:5},{camouflageUntil:5},{dead:true},{hp:0},{deployAt:5},{deployT:0}])
  assert.equal(ArkEnemySkills.validTarget({...a,...state},4),false);
 `);
 // The standalone enemy dispatcher must still work without ClientPrograms.
 const c={};c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/src/simulation/enemy-skills.js'),'utf8'),c);
 const a={id:1,hp:100,col:0,row:0,deployT:1,tauntLevel:2},b={...a,id:2,tauntLevel:0,deployAt:1};
 assert.equal(c.ArkEnemySkills.targets({x:0,y:0,rangeRadius:3},{kind:'selector-sp-ranged'}, {maxTargets:1},{time:2,candidates:[a,b]})[0],a);
 console.log('SOURCE TARGET PRIORITY OK: secondary ranged applyWay before flight, actual hatred, fallback/ties, invalid targets, live/expired/restored taunt and existing blocker contracts');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
