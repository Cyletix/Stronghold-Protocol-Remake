'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const source=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const supported=['skcom_charge_cost[1]','skcom_charge_cost[2]','skcom_charge_cost[3]','skcom_assist_cost[2]','skcom_assist_cost[3]'];
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,chars,skillSource:source,sourceSeasons:seasons,costSkillIds:supported});
const helpers=`
function costBattle(id='char_4119_wanqin',elite=false){
 const stats=finalizeOperator(ROSTER[id],null,[],elite);
 startBattle([{...stats,id:1,charId:id,name:ROSTER[id].name,col:3,row:3,dir:'up'}],[],100);
 B.waveScheduler=null;B.spawn=[{at:9999,enemyId:'unused',route:0}];B.enemies=[];
 B.dp=0;B.dpProgress=0;B.dpInterval=1e12;B.dpMax=99;
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.sp=o.skill.spCost;o.cd=0;
 return o;
}
function stepCost(frames){for(let i=0;i<frames;i++)update(1/30,0);}
function costTarget(o){
 const e={id:100,enemyId:'enemy_1002_nsabr',hp:1e8,maxHp:1e8,atk:0,def:0,magicRes:0,x:o.col,y:o.row-.5,
  speed:0,moveSpeed:0,stunUntil:999,route:0,seg:0,segT:0,cd:999,attackTime:999,flying:false,canAttack:false,skills:[],effects:[],events:[],buffs:[]};
 B.enemies=[e];BDATA.level.buildable[o.row][o.col]='MELEE';return e;
}
`;
async function main(){
 await f.run('initMode()');
 const verified=f.run(`(()=>{
 ${helpers}
 assert.equal(ArkCommonSkills.costSupported.slice().sort().join(','),costSkillIds.slice().sort().join(','));
 const untouched={sourceId:'skcom_assist_cost[999]',effects:[{type:'sentinel'}]};ArkCommonSkills.configure(untouched);assert.equal(untouched.effects[0].type,'sentinel','no prefix/name guessing');
 assert.throws(()=>ArkCommonSkills.configure({sourceId:'skcom_assist_cost[2]',blackboard:{cost:1},duration:8}),/Invalid/);
 // Audit all 18 source bindings, but only real season slots below are gameplay acceptance.
 let catalogBindings=0;
 for(const [id,c]of Object.entries(chars))for(const rawSkill of c.skills||[]){
  if(!costSkillIds.includes(rawSkill.skillId))continue;
  const current=SKILL_CHOICES[id]?.find(s=>s.skillId===rawSkill.skillId);assert.ok(current,id+' selectable source catalog');
  for(const [variant,index]of [['normal',3],['elite',6]]){
   const actual=current[variant],raw=skillSource[rawSkill.skillId].levels[index];
   assert.equal(actual.spCost,raw.spData.spCost,id+' SP');assert.equal(actual.initSp,raw.spData.initSp,id+' initial SP');
   assert.equal(actual.duration,raw.duration);assert.equal(actual.spType,raw.spData.spType);assert.equal(actual.spIncrement,raw.spData.increment);
   assert.equal(actual.rangeId,raw.rangeId);assert.equal(actual.skillType,raw.skillType);
   assert.equal(JSON.stringify(actual.blackboard),JSON.stringify(Object.fromEntries(raw.blackboard.map(x=>[x.key,x.value]))));
  }
  catalogBindings++;
 }
 assert.equal(catalogBindings,18);
 const verified=[];
 for(const sid of ['act1autochess','act2autochess']){
  setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
  const before=ROSTER_LIST.map(e=>e.charId).join(',');
  for(const entry of ROSTER_LIST)for(const choice of SKILL_CHOICES[entry.charId]||[]){
   if(!costSkillIds.includes(choice.skillId))continue;
   G.skillChoices[entry.charId]=choice.index;
   for(const elite of [false,true]){
    const o=costBattle(entry.charId,elite);
    // Golden ID is stored on the raw shop slot, not every runtime profile.
    const slot=sourceSeasons[sid].charShopChessDatas[entry.chessId];
    const raw=skillSource[choice.skillId].levels[sourceSeasons[sid].charChessDataDict[elite?slot.goldenChessId:slot.chessId].status.skillLevel-1];
    assert.equal(o.skill.sourceId,choice.skillId);assert.equal(o.skill.spCost,raw.spData.spCost);assert.equal(o.skill.initSp,raw.spData.initSp);
    assert.equal(o.skill.duration,raw.duration);assert.equal(o.skill.realRangeId,raw.rangeId);
    const money=G.money,block=o.blockCnt,b=o.skill.blackboard;
    assert.equal(castSkill(o),true,entry.name+' cast without enemies');
    if(o.skill.commonMechanic.kind==='instant-dp'){
     assert.equal(B.dp,b.cost);assert.ok(!o.skillState);assert.equal(operatorBlockCount(o),block);
     assert.equal(castSkill(o),false,'cannot double-spend same SP');stepCost(30);assert.equal(B.dp,b.cost);
    }else{
     assert.equal(B.dp,0);assert.equal(operatorAction(o),'none');assert.equal(operatorBlockCount(o),0);
     stepCost(240);assert.equal(B.dp,b.value);assert.equal(o.skillState,null);assert.equal(operatorAction(o),'attack');assert.equal(operatorBlockCount(o),block);
     assert.ok(o.sp<1e-8,'duration locks SP');
    }
    assert.equal(G.money,money,'battle DP never adds shop money');
    verified.push([sid,entry.charId,choice.skillId,elite?'elite':'normal'].join('/'));
   }
  }
  assert.equal(ROSTER_LIST.map(e=>e.charId).join(','),before,'no library/template inserted into shop');
 }
 assert.equal(verified.length,8,'4 actual season bindings x 2 variants');
 setupSeasonId='act1autochess';setupStageKey=null;chooseBand('band_amiya');G.skillChoices.char_4119_wanqin=0;
 // Exercise all five exact handlers with source catalog variants. Non-roster carriers
 // remain source fixtures, never asserted to be obtainable gameplay entities.
 for(const skillId of costSkillIds)for(const variant of ['normal','elite']){
  const catalog=Object.values(SKILL_CHOICES).flat().find(s=>s.skillId===skillId),lv=catalog[variant];
  const o=costBattle();o.skill={...lv,sourceId:skillId,name:lv.name};ArkCommonSkills.configure(o.skill);o.sp=o.skill.spCost;
  assert.equal(castSkill(o),true);
  if(skillId.startsWith('skcom_charge'))assert.equal(B.dp,lv.blackboard.cost);
  else{
   update(lv.blackboard.interval-.001,0);assert.equal(B.dp,0,'first tick waits interval');
   update(.001,0);assert.equal(B.dp,1);assert.equal(o.skillState.commonDp.emitted,1);
   ArkCommonSkills.advance(o,B.time);assert.equal(B.dp,1,'repeated update at same time is idempotent');
   update(lv.duration-lv.blackboard.interval,0);assert.equal(B.dp,lv.blackboard.value,'batched frame includes final due tick before expiry');
   assert.equal(o.skillState,null);update(.2,0);assert.equal(B.dp,lv.blackboard.value);
  }
 }
 const o=costBattle(),target=costTarget(o);o.blockCnt=4;ArkOperatorCombat.assignBlocks();assert.equal(target.blockerId,o.id);
 assert.equal(castSkill(o),true);stepCost(1);assert.equal(target.blockerId,null,'bearer skill releases existing blocker');assert.equal(o.blocked,0);
 const hp=target.hp;stepCost(238);assert.equal(target.hp,hp,'no basic attacks throughout channel');assert.equal(o.sp,0);
 stepCost(2);assert.equal(operatorBlockCount(o),4,'final zero restores live bonus');assert.equal(target.blockerId,o.id);assert.ok(target.hp<hp,'attacks resume');
 // FROZEN keeps blocking outside skill; the bearer trait, not freezing, disables it.
 ArkEnemyCold.apply(o,10,B.time);ArkEnemyCold.apply(o,10,B.time);ArkOperatorCombat.assignBlocks();assert.equal(target.blockerId,o.id);ArkEnemyCold.clear(o);
 const cap=costBattle();B.dp=99;B.dpProgress=.5;castSkill(cap);stepCost(30);assert.equal(B.dp,99);assert.equal(B.dpProgress,0);assert.equal((B.combatEffects||[]).filter(e=>e.kind==='dp-gain').length,0);
 B.dp=90;ArkCommonSkills.advance(cap,B.time);assert.equal(B.dp,90,'discard capped payments, never bank them');stepCost(10);assert.equal(B.dp,91,'only new tick is credited');
 const dead=costBattle();castSkill(dead);stepCost(30);assert.equal(B.dp,2);dead.hp=0;tryKill(dead);assert.equal(dead.skillState,null);dead.respawnAt=999;
 stepCost(240);assert.equal(B.dp,2,'death cancels remaining stream');dead.respawnAt=B.time;dead.respawnCost=0;respawnOperators();assert.equal(dead.dead,false);dead.sp=dead.skill.spCost;dead.deployed=true;dead.deployT=2;dead.deployAt=0;
 assert.equal(castSkill(dead),true);stepCost(30);assert.equal(B.dp,4,'new deployment starts a fresh ledger');
 const paused=costBattle();castSkill(paused);B.phase='rest';update(3,0);assert.equal(B.time,0);assert.equal(B.dp,0);B.phase='battle';stepCost(14);assert.equal(B.dp,1);
 const labels=[],canvas=new Proxy({fillText:t=>labels.push(t)},{get:(t,k)=>t[k]||(()=>{})});ArkBattlePresentation.draw(canvas,B,50);assert.ok(labels.includes('费用 +1'),'actual DP feedback drawn');
 return verified;
 })()`);
 // The production server loads the same index modules. Its signed checkpoint
 // must preserve BOTH casters' fractional progress and already-issued amounts.
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),sourceText=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(sourceText.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(sourceText.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'};
 const a=await injected.exports.createPlayerRuntime(config,{seed:119,name:'cost-check'}),b=await injected.exports.createPlayerRuntime(config,{seed:120,name:'other-field'});
 try{
  a.startBattle();b.startBattle();a.__testMachine.run(`${helpers}G.skillChoices.char_4119_wanqin=0;const first=costBattle();first.playerId='one';const second={...first,id:2,col:4,playerId:'two',skill:JSON.parse(JSON.stringify(first.skill)),skillState:null,buffs:[]};B.operators.push(second);castSkill(first);castSkill(second);`);
  const other=b.snapshot();a.advance(.31);const checkpoint=a.snapshot();assert.equal(checkpoint.battle.dp,2);assert.equal(checkpoint.battle.operators[0].skillState.commonDp.emitted,1);
  a.advance(1);const after=a.snapshot();assert.equal(after.battle.dp,10);
  a.restore(JSON.parse(JSON.stringify(checkpoint)));a.advance(1);assert.deepEqual(a.snapshot().battle,after.battle,'authenticated fractional-progress restore pays each tick once');
  a.advance(3);assert.equal(a.snapshot().battle.dp,36,'both owners contribute exactly 18 to existing board DP');assert.deepEqual(b.snapshot().battle,other.battle,'independent field has no leaked payments');
 }finally{a.dispose();b.dispose();}
 console.log('COMMON COST OK: 5 explicit handlers; 18 source-only catalog bindings; '+verified.length+' real season/variant cases ('+verified.join(', ')+'); channel/attack/block/cap/death/redeploy/pause/feedback and authenticated two-owner restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
