'use strict';
const assert=require('assert/strict'),mechanics=require('../web/src/simulation/boss-mechanics');
const catalog=require('../web/boss_mechanics.json'),sources=require('../web/source_battles.json');
mechanics.configure(catalog);
for(const[enemyId,profile]of Object.entries(catalog.profiles)){
 const evidence=catalog.prefabEvidence[profile.prefabKey];
 assert.ok(evidence.commonBuffs.some(x=>x.attributes.abnormalFlags.includes(22)));
 assert.equal(profile.hitbox.width,evidence.collider.m_Size.x);assert.equal(profile.hitbox.height,evidence.collider.m_Size.y);
 const e={enemyId,x:10,y:15};mechanics.attach(e);assert.equal(mechanics.stationary(e),true);
 const rect=mechanics.rect(e);assert.ok(Math.abs(rect.xMin-7.525)<1e-6);assert.ok(Math.abs(rect.yMin-12.525)<1e-6);
 assert.equal(mechanics.intersectsCell(e,13,8),true);assert.equal(mechanics.intersectsCell(e,11,8),false);
 assert.equal(mechanics.distanceTo(e,8,13),0);assert.ok(mechanics.distanceTo(e,5,14)>2.5);
}
const ordinary={enemyId:'enemy_1005_yokai',x:1,y:2};assert.equal(mechanics.stationary(ordinary),false);assert.equal(mechanics.rect(ordinary),null);assert.equal(mechanics.selectAttackTargets(ordinary,[]),null);
const source=sources.levels['activities/act1autochess/level_act1autochess_h07_04'].enemies.enemy_1521_dslily;
const quintus={...source,x:10,y:15,hp:source.maxHp};mechanics.attach(quintus);
const phaseEvidence=catalog.prefabEvidence.enemy_1521_dslily;
for(const[name,parent]of Object.entries({GrowUp1:'Default',GrowUp2:'G1',AtkUp1:'G1',AtkUp2:'G2'})){
 assert.equal(phaseEvidence.phaseBindings[name].hierarchy,`enemy_1521_dslily/Modes/${parent}/Talents/${name}`);
 assert.equal(typeof phaseEvidence.phaseBindings[name].pathId,'string','Unity path IDs must not lose integer precision');
}
for(const[name,mode]of Object.entries({GrowUp1:1,GrowUp2:2})){
 const hpBuff=phaseEvidence.phaseBindings[name].buffs.find(b=>b.templateKey==='dslily_growup_hp_ratio');
 assert.equal(hpBuff.blackboard.find(b=>b.key==='times').value,mode);
 assert.equal(hpBuff.blackboard.find(b=>b.key==='mode').value,mode);
}
const grow2=phaseEvidence.phaseBindings.GrowUp2.buffs.find(b=>b.templateKey==='dslily_growup[countdown]');
assert.equal(grow2.durationKey,'growup_duration');assert.equal(grow2.triggerInterval,-1);
const hpActions=phaseEvidence.phaseTemplates.templates.dslily_growup_hp_ratio.events[0].actions;
assert.equal(hpActions[0].$type,'Torappu.Battle.Action.Nodes+HpRatioTrigger');assert.equal(hpActions[0]._condType,'GT');
assert.equal(hpActions[1]._loadModeFromBlackboard,true);assert.equal(hpActions[1]._restartFSM,true);
for(const[name,trigger]of Object.entries(phaseEvidence.skillTriggers)){
 assert.equal(trigger._checkParentActive,name.endsWith('G1')||name.endsWith('G2')?1:0);assert.equal(trigger._resetCdWaitFirstPeriod,1);assert.equal(trigger._overwriteInitCooldown,-1);
}
const candidates=[{id:1,def:100},{id:2,def:400},{id:3,def:250},{id:4,def:900,dead:true}];
assert.deepEqual(mechanics.selectAttackTargets(quintus,candidates).map(x=>x.id),[2,3]);
assert.deepEqual(mechanics.selectAttackTargets(quintus,candidates,{defenseOf:o=>o.id===1?1000:o.def}).map(x=>x.id),[1,2]);
assert.equal(mechanics.attackType(quintus,'arts'),'phys');
const armour={...sources.levels['activities/act1autochess/level_act1autochess_h07_01_s'].enemies.enemy_9013_acstmk};mechanics.attach(armour);
let draws=0;assert.deepEqual(mechanics.selectAttackTargets(armour,candidates,{random:()=>{draws++;return 0.8;}}).map(x=>x.id),[3]);assert.equal(draws,1);assert.equal(mechanics.attackType(armour,'phys'),'arts');
armour.hp=armour.maxHp*0.2;assert.equal(mechanics.incomingMultiplier(armour,'phys'),1);armour.hp--;
assert.equal(mechanics.incomingMultiplier(armour,'phys'),0.5);assert.equal(mechanics.incomingMultiplier(armour,'arts'),0.5);assert.equal(mechanics.incomingMultiplier(armour,'true'),1);
armour.sourceTalentBlackboard=[];assert.equal(mechanics.incomingMultiplier(armour,'arts'),1,'empty level override must not restore database talents');
const lion={...sources.levels['activities/act1autochess/level_act1autochess_h07_06'].enemies.enemy_9032_aclionk};mechanics.attach(lion);
lion.hp=lion.maxHp/2+1;assert.equal(mechanics.defenseMultiplier(lion),1);assert.equal(mechanics.resistanceBonus(lion),0);
lion.hp--;assert.equal(mechanics.defenseMultiplier(lion),2);assert.equal(mechanics.resistanceBonus(lion),45);
// Actual source timers: first-mode Rockfall at 37s, Tidewater at 45s.
const options={candidates,random:()=>0};assert.deepEqual(mechanics.advanceSkills(quintus,36.99,options),[]);
const rock=mechanics.advanceSkills(quintus,0.01,options)[0];assert.equal(rock.skillKey,'Rockfall');assert.equal(rock.atkScale,1.4);assert.equal(rock.damageDelay,1);assert.equal(rock.damageType,'phys');assert.deepEqual(rock.targets.map(x=>x.id),[2,3]);
assert.deepEqual(mechanics.advanceSkills(quintus,8,{...options,canCast:false}),[]);
const tide=mechanics.advanceSkills(quintus,0,options)[0];assert.equal(tide.skillKey,'Tidewater');assert.equal(tide.damageType,'arts');assert.equal(tide.atkScale,0.5);assert.equal(tide.epDamageRatio,0.5);assert.deepEqual(tide.targets.map(x=>x.id),[1,2,3]);
assert.equal(quintus.bossSkillState.mode,0,'unverified transitions cannot enable later-mode skills');
mechanics.setMode(quintus,1);assert.deepEqual(mechanics.advanceSkills(quintus,3.99,options),[]);
const rock1=mechanics.advanceSkills(quintus,0.01,options)[0];assert.equal(rock1.skillKey,'RockfallG1');assert.equal(rock1.targets.length,3);
mechanics.setMode(quintus,2);const tide2=mechanics.advanceSkills(quintus,1,options)[0];assert.equal(tide2.skillKey,'TidewaterG2');assert.equal(tide2.atkScale,0.2);
const missing={...quintus,sourceSkills:[],bossSkillState:null};assert.deepEqual(mechanics.advanceSkills(missing,100,options),[]);
// A serialized trigger node is evidence of an entry point, not of its formula.
// Even the single-player BB with 0.33 and 75/200 must not enable guessed phases.
const singleSource=sources.levels['activities/act1autochess/level_act1autochess_h07_04_s'].enemies.enemy_1521_dslily;
const unresolvedPhase={...singleSource,hp:singleSource.maxHp*0.01};mechanics.attach(unresolvedPhase);
mechanics.advanceSkills(unresolvedPhase,300,{...options,canCast:false});assert.equal(unresolvedPhase.bossSkillState.mode,0);
console.log('BOSS MECHANICS OK real prefab rectangles, fixed movement, two-target/random attacks, conditional defenses, source-timed mode-specific casts');
