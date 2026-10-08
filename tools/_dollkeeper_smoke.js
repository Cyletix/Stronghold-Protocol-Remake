'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const ranges=require('../data/ArknightsGameData/zh_CN/gamedata/excel/range_table.json');
const equips=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json');
const cases=require('./lib/dollkeeper-cases').buildDollkeeperCases();assert.equal(cases.length,20);
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,dollCases:cases,dollChars:chars,dollSkills:skills,dollRanges:ranges,dollEquips:equips});
const helpers=`
function dollBattle(c){
 setupSeasonId=c.seasonId;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 G.skillChoices[c.charId]=c.index;G.bannedOperators=[];G.ops=[];G.equipInv=[];
 const src=addOperator(c.charId,c.elite);src.row=3;src.col=3;src.dir='right';resolveBoard();
 startBattle([boardView(src)],[],100);G.phase='battle';G.battleDone=false;B.waveScheduler=null;B.spawn=[{at:99999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.roundLimit=99999;
 for(let r=2;r<=4;r++)for(let c=2;c<=4;c++)BDATA.level.buildable[r][c]='MELEE';
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=0;o.sp=0;return o;
}
function dollEnemy(id=100,x=3.4,y=3){
 const e={id,visualId:id,enemyId:'enemy_1002_nsabr',x,y,maxHp:1e6,hp:1e6,def:100,magicRes:20,moveSpeed:0,
 dead:false,canAttack:false,cd:99999,attackTime:1,atk:50,route:0,cp:0,seg:0,wait:99999,flying:false,skills:[],talents:[],buffs:[]};
 BDATA.level.routes[0]={segs:[[{r:3,c:15}]]};B.enemies.push(e);return e;
}
function dollNear(a,b,label){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function settleDollShots(){for(const p of B.projectiles)ArkOperatorCombat.impact(p);B.projectiles=[];}
`;
async function main(){
 await f.run('initMode()');f.run('catalogFingerprint()');
 const receipts=f.run(`(()=>{${helpers}
 const receipts=[];
 for(const c of dollCases){
  let o=dollBattle(c),e=dollEnemy(),air=dollEnemy(101,3,3.3);air.flying=true;
  const b=Object.fromEntries(c.source.blackboard.map(x=>[x.key,x.value]));
  assert.equal(o.skill.sourceId,dollChars[c.charId].skills[c.index].skillId);
  assert.equal(JSON.stringify(o.skill.blackboard),JSON.stringify(b));for(const k of ['spCost','initSp','spType'])assert.equal(o.skill[k],c.source.spData[k]);
  assert.equal(o.skill.duration,c.source.duration);assert.equal(o.skill.realRangeId,c.source.rangeId);assert.equal(o.basicAttack.training.evolve,Number(c.training.evolvePhase.slice(-1)));assert.equal(o.basicAttack.training.level,c.training.charLevel);
  assert.equal(o.basicAttack.bb.atk,c.elite?.15:0);assert.ok(o.combatTalents.length);assert.equal(o.skill.dollMechanic,true);
  assert.equal(JSON.stringify(o.basicAttack.dollkeeper.rangeGrids),JSON.stringify(dollRanges['x-4'].grids));
  const withModule=finalizeOperator(ROSTER[c.charId],null,[],c.elite),plain=finalizeOperator({...ROSTER[c.charId],module:null},null,[],c.elite);
  const moduleStats=c.elite?Object.fromEntries(dollEquips[c.defaultModule].phases[0].attributeBlackboard.map(b=>[b.key,b.value])):{};
  for(const key of ['atk','def'])dollNear(withModule.attributeBase[key]-plain.attributeBase[key],moduleStats[key]||0,'source module '+key);
  const baseHp=o.maxHp,cells=JSON.stringify(o.cells),sp=2;o.sp=sp;o.buffs=[{atk:2,until:99}];o.stunUntil=99;o.hp=0;tryKill(o);
  assert.equal(o.dead,false);assert.equal(o.doll.until,20);assert.equal(o.hp,o.maxHp);assert.ok(o.respawnAt==null);assert.equal(operatorBlockCount(o),0);assert.equal(o.stunUntil,0);assert.equal(o.buffs.length,0);
  assert.equal(castSkill(o),false);gainOperatorSp(o,o.skill.spType,5);assert.equal(o.sp,sp);o.cd=999;
  if(c.charId==='char_4016_kazema'){
   const t=o.combatTalents.find(t=>t.name==='折纸生花'),ratio=Object.fromEntries(t.blackboard.map(x=>[x.key,x.value])).damage_scale;
   const dmg=Math.round((o.atk+o.attributeBase.atk*(c.elite?.15:0))*ratio*.8);assert.equal(e.maxHp-e.hp,dmg);assert.equal(air.maxHp-air.hp,dmg,'appearance explosion includes air');
   B.enemies=[air];o.cd=0;ArkOperatorCombat.attack(o);settleDollShots();assert.ok(air.maxHp-air.hp>dmg,'substitute can attack air');
  }else{
   assert.equal(e.hp,e.maxHp);ArkOperatorCombat.attack(o);assert.equal(B.projectiles.length,0,'Specter substitute has no normal attack');
   update(1,0);const dmg=Math.round((o.atk+o.attributeBase.atk*(c.elite?.15:0))*.4*.8);assert.equal(e.maxHp-e.hp,dmg);assert.equal(air.hp,air.maxHp,'aura is ground only');assert.equal(e.slowFactor,.6);
  }
  B.enemies=[];B.phase='rest';const t=B.time;update(3,0);assert.equal(B.time,t);B.phase='battle';
  update(20-B.time,0);assert.equal(o.doll,null);assert.equal(o.hp,baseHp);assert.equal(JSON.stringify(o.cells),cells);assert.equal(o.sp,sp,'return tick does not refill blocked time');
  o.hp=0;tryKill(o);o.hp=0;tryKill(o);assert.equal(o.dead,true);assert.equal(o.doll,null);assert.equal(o.maxHp,baseHp);assert.ok(o.respawnAt>B.time,'second defeat enters normal cost redeploy');
  const callbacks=window.onRespawn;let cost=null;window.onRespawn=n=>{cost=n;return true;};B.time=o.respawnAt;respawnOperators();window.onRespawn=callbacks;assert.equal(o.dead,false);assert.equal(cost,o.cost);assert.equal(o.doll,null);
  // All five fixed-roster skills run through the actual source-selected board path.
  o=dollBattle(c);e=dollEnemy();o.sp=o.skill.spCost;const hp=o.hp;
  if(c.charId==='char_4016_kazema'&&c.index===0){
   ArkOperatorCombat.attack(o);settleDollShots();assert.equal(e.maxHp-e.hp,Math.round(o.atk*b.atk_scale-e.def));dollNear(o.hp,hp-o.maxHp*.1,'S1 self loss');assert.equal(o.sp,0);assert.equal(o.skillState,null,'next attack skill ends after one action');
   const priorHp=o.hp,enemyHp=e.hp;o.cd=0;ArkOperatorCombat.attack(o);assert.equal(enemyHp-e.hp,Math.round(o.atk-e.def));assert.equal(o.hp,priorHp);assert.equal(o.sp,1,'ordinary follow-up recovers SP once');
  }else if(c.charId==='char_4016_kazema'){
   e.x=3;e.y=2; // Make the source priority's enemy-occupied legal tile unambiguous.
   const occupying={...o,id:2,charId:'ordinary',row:2,col:2,skill:null,combatTalents:[],basicAttack:{action:'attack'},cd:999};B.operators.push(occupying);
   assert.equal(castSkill(o),true);dollNear(o.hp,hp*.5,'S2 current HP');assert.equal(B.summoneds.length,1);const p=B.summoneds[0];assert.notEqual(p.row+','+p.col,'2,2');assert.ok(p.paperToken);assert.equal(p.blockCnt,0);assert.equal(p.ownerId,o.id);assert.equal(p.playerId,o.playerId);
   const data=o.basicAttack.paperToken,phase=data.phases[o.basicAttack.training.evolve],a=phase.frames[0],z=phase.frames.at(-1),mix=(o.basicAttack.training.level-a.level)/(z.level-a.level);
   const atk=Math.round(a.data.atk+(z.data.atk-a.data.atk)*mix);assert.equal(p.atk,atk);dollNear(p.atk*buffMul(p).atk,atk*(1+b.atk),'paper receives skill ATK, not caster module trait');
   assert.equal(p.row,2);assert.equal(p.col,3);const paperTalent=data.talents.filter(t=>Number(t.unlockCondition.phase.slice(-1))<=o.basicAttack.training.evolve&&t.requiredPotentialRank===0).at(-1);
   const scale=paperTalent.blackboard.find(x=>x.key==='damage_scale').value;assert.equal(e.maxHp-e.hp,Math.round(atk*(1+b.atk)*scale*.8),'paper appearance deals source-scaled arts damage');
   B.enemies=[];const aerial=dollEnemy(104,p.col,p.row);aerial.flying=true;p.cd=0;ArkOperatorCombat.attack(p);assert.equal(B.projectiles.length,0);assert.equal(aerial.hp,aerial.maxHp);
   const ground=dollEnemy(105,p.col,p.row);p.cd=0;ArkOperatorCombat.attack(p);assert.ok(ground.hp<ground.maxHp,'paper attacks through common executor');
   endOperatorSkill(o);assert.equal(p.dead,true,'skill end removes paper');
   o.sp=o.skill.spCost;castSkill(o);const withdrawn=B.summoneds.at(-1),reserveBefore=G.ops.length;
   assert.equal(tacticalAction('retreat',o.id,0,0,'up',0,withdrawn.id),true);assert.ok(withdrawn.removed);assert.equal(withdrawn.tacticalDormant,false);
   assert.equal(G.ops.length,reserveBefore,'paper withdrawal consumes this skill entity without inventing a reserve card');
   assert.equal(o.dead,false);assert.ok(!o.doll,'withdrawing paper cannot transform its owner');endOperatorSkill(o);
   o.sp=o.skill.spCost;castSkill(o);const next=B.summoneds.at(-1);assert.ok(!next.dead);o.hp=0;tryKill(o);assert.ok(o.doll);assert.equal(next.dead,true,'owner form switch removes paper');
  }else if(c.index===0){
   const ally={...o,id:2,charId:'ordinary',col:4,skill:null,combatTalents:[],basicAttack:{action:'attack'},hp:100,maxHp:1000,cd:999};B.operators.push(ally);o.hp=o.maxHp*.7;const before=JSON.stringify(o.cells);
   castSkill(o);dollNear(o.hp,o.maxHp*.1,'S1 swaps ratios');dollNear(ally.hp,700,'S1 ally ratio');assert.equal(JSON.stringify(o.cells),before,'swap range is not ordinary attack expansion');
  }else if(c.index===1){
   castSkill(o);o.hp=0;tryKill(o);assert.equal(o.hp,1);assert.ok(!o.doll);assert.equal(o.dead,false);o.cd=999;B.enemies=[];
   update(c.source.duration,0);assert.ok(o.doll);assert.equal(o.doll.startedAt,B.time);assert.equal(o.hp,o.maxHp);assert.equal(o.skillState,null,'S2 expiry really switches');
  }else{
   castSkill(o);e.blockerId=o.id;const ignored=dollEnemy(102,3.3,3.1);ignored.blockerId='other';const power=o.atk*buffMul(o).atk;
   const otherBlocked=[dollEnemy(103,3.2,3.2),dollEnemy(104,3.1,3.3)];for(const target of otherBlocked)target.blockerId=o.id;
   ArkOperatorCombat.attack(o);assert.equal(e.maxHp-e.hp,Math.round(power-e.def)+Math.round(power*b['attack@atk_scale_ex']-e.def));assert.equal(ignored.hp,ignored.maxHp,'S3 only own blocked enemies');
   for(const target of otherBlocked)assert.equal(target.hp,e.hp,'S3 hits every own blocked target');B.enemies=[e,ignored];
   o.cd=0;e.hp=e.maxHp*.1;const ownHp=o.hp;ArkOperatorCombat.attack(o);dollNear(o.hp,ownHp-o.maxHp*b['attack@hp_ratio'],'S3 low-ratio target costs HP');
  }
  receipts.push(c.id);
 }
 // Library-only source fixtures validate shared mechanics without adding shop identities.
 for(const id of ['char_369_bena','char_4107_vrdant'])for(const index of [0,1]){
  let o=dollBattle(dollCases[0]);const raw=dollChars[id],phase=raw.phases[2],a=phase.attributesKeyFrames[0].data;
  const skill=dollSkills[raw.skills[index].skillId].levels[6];
  o={...o,charId:id,name:raw.name,atk:500,def:200,maxHp:2000,hp:2000,attackTime:a.baseAttackTime,attributeBase:{version:1,atk:500,def:200,aspd:1},
   basicAttack:{...ArkAttackProfiles[id],bb:Object.fromEntries(raw.trait.candidates[0].blackboard.map(x=>[x.key,x.value])),training:{evolve:2,level:1}},
   combatTalents:raw.talents.map(t=>t.candidates.filter(t=>Number(t.unlockCondition.phase.slice(-1))<=2&&t.requiredPotentialRank===0).at(-1)),
   skill:{sourceId:raw.skills[index].skillId,blackboard:Object.fromEntries(skill.blackboard.map(x=>[x.key,x.value])),spCost:skill.spData.spCost,initSp:skill.spData.initSp,spType:skill.spData.spType,duration:skill.duration,isPassive:skill.skillType==='PASSIVE',name:skill.name},buffs:[],events:[]};
  ArkDollkeeper.configure(o.skill);B.operators=[o];
  if(index===1){const e=dollEnemy();o.sp=o.skill.spCost;castSkill(o);const hp=o.hp;ArkOperatorCombat.attack(o);dollNear(o.hp,hp-o.maxHp*o.skill.blackboard.hp_ratio,'shared per-hit self loss');if(id==='char_4107_vrdant')assert.equal(e.maxHp-e.hp,Math.round(o.atk*.8));}
  if(index===0&&id==='char_369_bena'){const e=dollEnemy();o.sp=o.skill.spCost;castSkill(o);assert.equal(o.maxHp,1000);ArkOperatorCombat.attack(o);assert.equal(e.maxHp-e.hp,Math.round(o.atk*buffMul(o).atk-e.def*(1-o.skill.blackboard.def_penetrate)));}
  if(index===0&&id==='char_4107_vrdant')assert.deepEqual(ArkDollkeeper.passive(o.skill),o.skill.blackboard);
  o.hp=0;tryKill(o);const enemy={atk:1000,atkType:'arts'};
  if(id==='char_369_bena')assert.equal(enemyDamageToOperator(enemy,o),600,'Bena form-only reduction');
  else{o.hp=o.maxHp*.5;o.cd=999;B.enemies=[];const hp=o.hp;update(1,0);dollNear(o.hp,hp+o.maxHp*.035,'Verdant form-only regeneration');}
  // Source form HP modifiers remain stable when the shared mode recomputes base stats.
  o.basicAttack={...o.basicAttack,bb:{...o.basicAttack.bb,max_hp:.2}};
  const src={...o,maxHp:2000,range:1,respawnTime:70,dmgTaken:1};o.hp=900;const old=o.maxHp;
  updateOperatorBaseStats(o,src);assert.equal(o.maxHp,2400);const hp=o.hp;updateOperatorBaseStats(o,src);assert.equal(o.maxHp,2400);assert.equal(o.hp,hp,'repeated base rebind is not healing');
  ArkDollkeeper.leave(o);assert.equal(o.maxHp,2000);
 }
 // Passive S1 goes through the real normal-mode finalizer rather than a timed deploy buff.
 {const id='char_4107_vrdant',raw=BATTLE.operators.find(e=>e.charId===id);GMODE='normal';ACCOUNT.ops[id]={evolve:2,level:50,skillLevel:7,potential:0,trust:0,selectedSkill:0};
  const entry={...raw,baseAttackTime:raw.attackTime,talents:TALENT_DATA[id],skill:SKILL_DATA[id],module:null};
  const normal=finalizeOperator({...entry,skill:null},null,[],false),passive=finalizeOperator(entry,null,[],false),b=dollSkills.skchr_vrdant_1.levels[6].blackboard;
  assert.equal(passive.maxHp,Math.round(normal.maxHp*(1+b.find(x=>x.key==='max_hp').value)));assert.equal(passive.magicRes,normal.magicRes+b.find(x=>x.key==='magic_resistance').value);assert.ok(!passive.events.some(e=>e.type==='buff_maxhp'));}
 const excluded=Object.entries(dollChars).filter(([id,c])=>id.startsWith('char_')&&c.subProfessionId==='dollkeeper'&&!ArkDollkeeper.ids.includes(id));assert.equal(excluded.length,2);
 for(const [id]of excluded)assert.ok(!ArkAttackProfiles[id].dollkeeper,'nonstandard form excluded: '+id);
 {const o=dollBattle(dollCases[0]);o.hp=0;tryKill(o);const calls=[];const ctx=new Proxy({arc(...args){assert.ok(args.every(Number.isFinite));calls.push('arc');},fillText(t){calls.push(t);}},{get:(t,k)=>t[k]||(()=>{})});ArkBattlePresentation.draw(ctx,B,50);assert.ok(calls.includes('替身'));assert.ok(calls.includes('arc'));}
 // Previous rest inventory rebinds derived doll rules, not in-flight state.
 {const c=dollCases.find(c=>c.charId==='char_4016_kazema'&&c.index===1&&c.elite);dollBattle(c);G.phase='rest';G.ops[0].row=null;G.ops[0].col=null;
 const old=JSON.parse(encodeRestSave());old.catalog='cefbd9a84feece9c';const loaded=decodeRestSave(JSON.stringify(old));
 const fresh=finalizeOperator(loaded.session.ops[0].entry,null,[],true);assert.ok(fresh.basicAttack.dollkeeper);assert.equal(fresh.skill.dollMechanic,true);assert.equal(fresh.basicAttack.bb.atk,.15);}
 return receipts;
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),text=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(text.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(text.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:914,name:'dollkeeper-batch'});
 try{
  runtime.startBattle();const c=cases.find(c=>c.charId==='char_4016_kazema'&&c.index===1&&c.elite);
  runtime.__testMachine.run(`${helpers}const first=dollBattle(${JSON.stringify(c)});first.playerId='one';first.hp=0;tryKill(first);first.cd=999;
   const second={...first,id:2,col:4,playerId:'two',doll:null,rangeGrids:first.doll.baseRangeGrids,buffs:[],skillState:null,sp:first.skill.spCost};second.cells=rangeCellsFor(second);B.operators.push(second);castSkill(second);second.cd=999;dollEnemy();`);
  runtime.advance(.3);const checkpoint=runtime.snapshot();assert.ok(checkpoint.battle.operators[0].doll);assert.equal(checkpoint.battle.operators[1].doll,null);assert.equal(checkpoint.battle.summoneds[0].playerId,'two');
  runtime.advance(.8);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.8);const restored=runtime.snapshot();
  assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]});assert.deepEqual(restored.rng,after.rng,'paper selection and form timer share deterministic RNG/state');
  runtime.__testMachine.run('B.time=B.operators[0].doll.until;update(0,0)');const ended=runtime.snapshot();assert.equal(ended.battle.operators[0].doll,null);assert.equal(ended.battle.operators[1].skillState,null);assert.equal(ended.battle.summoneds.length,0);
 }finally{runtime.dispose();}
 const out=process.argv.indexOf('--receipts');if(out>=0)fs.writeFileSync(process.argv[out+1],JSON.stringify({receipts,libraryFixtures:4},null,2));
 console.log('DOLLKEEPER OK: '+receipts.length+' real fixed-season skill configurations, 4 library source fixtures; forms, source skills, paper, HP loss, blocking/SP, death/redeploy, passive training, base rebinding and signed two-owner restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
