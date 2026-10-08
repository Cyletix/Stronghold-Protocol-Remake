'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const f=require('./_browser_fixture')(),chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const eq=require('../data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json').uniequip_002_silent;
const candidates=chars.char_108_silent.talents[0].candidates.map(t=>({phase:Number(t.unlockCondition.phase.slice(-1)),potential:t.requiredPotentialRank,speed:t.blackboard[0].value}));
const modules=eq.phases.flatMap(p=>[0,4].map(potential=>({phase:2,potential,level:p.equipLevel,speed:(p.parts.flatMap(x=>x.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.requiredPotentialRank<=potential).at(-1)||chars.char_108_silent.talents[0].candidates.filter(t=>t.unlockCondition.phase==='PHASE_2'&&t.requiredPotentialRank<=potential).at(-1)).blackboard[0].value})));
const helper=`
function near(a,b,label=''){assert.ok(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);}
function silence(c,entry=null,elite=false){
 const cid='char_108_silent';G.skillChoices[cid]=0;ACCOUNT.ops[cid]={evolve:c.phase,level:1,skillLevel:7,potential:c.potential+1,trust:0,selectedSkill:0};
 let e=entry||debugTacticalEntry(cid);if(c.level){const base=ROSTER[cid];e={...base,profile:{...base.profile,backupCharPotRank:c.potential,normal:{...base.profile.normal,evolvePhase:'PHASE_2',charLevel:50,equipLevel:c.level}}};}
 const stats=finalizeOperator(e,null,[],elite),initial={...stats,id:1,charId:cid,name:e.name,profession:e.profession,position:e.position,row:3,col:5,dir:'right',rangeGrids:entryRangeGrids(e,elite),hp:100000,maxHp:100000,garrisonAdd:null};
 startBattle([initial],[],100);Object.assign(B,{time:0,roundTime:0,roundLimit:999,waveScheduler:null,spawn:[{at:999,enemyId:'none'}],enemies:[],summoneds:[],projectiles:[],particles:[],operatorZones:[],combatEffects:[],elementShields:[],leader:null,leaderEnemyId:null});
 const o=B.operators[0];Object.assign(o,{sp:0,cd:999,deployAt:0,deployT:2,deployed:true});return o;
}
function ally(extra={}){const t={id:B.operators.length+1,charId:'fixture',name:'fixture',profession:'MEDIC',position:'RANGED',row:3,col:6,dir:'right',cells:[[3,6],[3,7]],rangeGrids:[{row:0,col:0},{row:0,col:1}],hp:500,maxHp:10000,atk:100,def:0,attributeBase:{atk:100,def:0,aspd:1},attackTime:2,cd:999,buffs:[],events:[],combatTalents:[],deployed:true,deployAt:0,deployT:2,basicAttack:{action:'heal'},...extra};B.operators.push(t);return t;}
function verify(c,entry=null,elite=false){
 const o=silence(c,entry,elite);assert.equal(o.combatTalents.find(t=>t.name==='强化注射').blackboard[0].value,c.speed);near(ArkMedicSkills.attackSpeedBonus(o),c.speed/100);
 const base=o.attributeBase.aspd;near(buffMul(o).aspd,(base+c.speed/100)/base,'no double permanent talent');
 const t=ally({row:0,col:0});near(buffMul(t).aspd,1+c.speed/100,'global medic on other side');
 t.basicAttack={action:'attack',subProfession:'incantationmedic'};near(buffMul(t).aspd,1+c.speed/100,'incantation profession qualifies');
 for(const profession of ['TANK','SUPPORT','TOKEN']){t.profession=profession;t.basicAttack={action:'heal'};near(buffMul(t).aspd,1,'non medic healer excluded');}t.profession='MEDIC';
 B.operators.pop();B.summoneds.push(t);near(buffMul(t).aspd,1,'summons excluded even if fixture labels MEDIC');B.summoneds=[];B.operators.push(t);
 t.row=3;t.col=6;const patient=ally({profession:'GUARD',row:3,col:7});t.cd=0;performHealingAction(t);near(t.cd,2/(1+c.speed/100),'actual heal cadence');
 t.buffs=[{aspd:1.2,until:5}];near(buffMul(t).aspd,1.2+c.speed/100,'add to other ASPD');B.time=5;near(buffMul(t).aspd,1+c.speed/100);t.buffs=[];
 for(const field of ['stunUntil','sleepUntil','freezeUntil']){o[field]=99;near(buffMul(t).aspd,1+c.speed/100,'in field aura is not an attack');o[field]=0;}
 o.deployAt=99;near(buffMul(t).aspd,1);o.deployAt=0;t.deployAt=99;near(buffMul(t).aspd,1);t.deployAt=0;
 const copy={...o,id:50,combatTalents:[{name:'强化注射',blackboard:[{key:'attack_speed',value:c.speed+2}]}]};B.operators.push(copy);near(buffMul(t).aspd,1+(c.speed+2)/100,'same aura highest only');B.operators.pop();
 o.hp=0;tryKill(o);near(buffMul(t).aspd,1,'source death removes aura');B.dp=99;B.time=o.respawnAt;respawnOperators();assert.equal(o.dead,false);o.deployAt=B.time;near(buffMul(t).aspd,1+c.speed/100,'redeployment restores one aura');
 const drone={id:80,charId:'token_10000_silent_healrb',profession:'TOKEN',row:3,col:4,hp:100,maxHp:100,attackTime:.5,basicAttack:{action:'none'},buffs:[],attributeBase:{atk:90,def:0,aspd:1}};B.summoneds.push(drone);near(buffMul(drone).aspd,1,'medical device keeps own interval');
}
`;
async function main(){
 await f.run('initMode()');Object.assign(f.ctx,{assert,candidates,modules});f.run(`chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};${helper}for(const c of candidates)verify(c);for(const c of modules)verify(c);`);
 const bindings=f.run(`(()=>{const done=[];for(const sid of ['act1autochess','act2autochess']){setupSeasonId=sid;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 for(const entry of ROSTER_LIST.filter(e=>e.charId==='char_108_silent'))for(const elite of [false,true]){const tr=trainingProfile(entry,elite),c=(tr.equipLevel?modules:candidates).filter(c=>c.phase<=tr.evolve&&c.potential<=tr.potential&&(!c.level||c.level===tr.equipLevel)).at(-1);assert.ok(c);verify({...c,level:0},entry,elite);done.push([sid,elite]);}}
 return done;})()`);assert.equal(bindings.length,4);
 // S1 ending does not revoke a separate in-field talent; E0 has no talent.
 f.run(`{const o=silence(candidates[2]),t=ally();o.sp=o.skill.spCost;assert.equal(castSkill(o),true);near(buffMul(t).aspd,1.12);endOperatorSkill(o);near(buffMul(t).aspd,1.12);silence({phase:0,potential:0});near(ArkMedicSkills.attackSpeedBonus(B.operators[0]),0);}`);
 const file=require.resolve('./lib/room-game-runtime'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8').replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),file);
 const rt=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:6166,name:'医疗攻速'});
 try{rt.startBattle();rt.__testMachine.context.assert=assert;rt.__testMachine.run(helper);
 for(const c of [candidates[2],modules.at(-1)]){rt.__testMachine.run(`var o=silence(${JSON.stringify(c)});o.playerId='one';var t=ally({playerId:'two'});near(buffMul(t).aspd,1+${c.speed}/100);`);const save=rt.snapshot();rt.advance(.8);const expected=rt.snapshot();rt.restore(save);rt.advance(.8);const actual=rt.snapshot();assert.deepEqual(actual.battle,expected.battle);assert.deepEqual(actual.rng,expected.rng);assert.equal(actual.battle.operators[1].playerId,'two');}
 }finally{rt.dispose();}
 fs.writeFileSync(path.join(__dirname,'../.runtime/medic-aura-receipts.json'),JSON.stringify({candidates:candidates.length,modules:modules.length,bindings,signedReplays:2,limits:'same-aura strongest is local rule; ground-healing module trait and complete aura isolation interactions pending'},null,2));
 console.log('MEDIC AURA OK 4 source candidates, 6 module/potential variants, 4 season bindings, profession/lifecycle/cadence and 2 signed replays');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
