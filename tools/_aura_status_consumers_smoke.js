'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={B:{time:10},gameRandom:()=>0};context.window=context;vm.createContext(context);
for(const file of ['external_combat_data.js','basic_attacks.js','src/simulation/enemy-cold.js','src/simulation/enemy-skills.js',
 'src/simulation/hunter.js','src/simulation/mystic.js','src/simulation/operator-combat.js'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),context,{filename:file});
const chars=require('../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const talent=chars.char_469_indigo.talents.flatMap(t=>t.candidates).filter(t=>t.name==='柔光缚目').at(-1);
assert.ok(talent);const duration=talent.blackboard.find(b=>b.key==='duration').value;
const owner={id:5,charId:'char_469_indigo',combatTalents:[talent]};
const skill=Object.values(context.ArkExternalCombatData.enemies).flatMap(e=>e.skills||[]).find(s=>s.kind==='selector-sp-tagged-ranged');
assert.ok(skill);const effect=skill.action.activeBuffs[0];
const packet={skillId:skill.id,activeBuffs:[{...effect,duration:skill.blackboard[effect.duration.key]??effect.duration.default}]};
const api=context.ArkOperatorCombat,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' != '+b);
for(const useAura of [false,true]){
 const calls=[];
 context.ArkSkillAuras=useAura?{statusResistance:(unit,time)=>{calls.push({unit,time});return .5;}}:{};
 const resistance=useAura?.5:.25;
 const cold={hp:100,statusResistance:.25};context.ArkEnemyCold.apply(cold,4,10);near(cold.coldUntil,10+4*(1-resistance));
 context.ArkEnemyCold.apply(cold,4,10.5);near(cold.frozenUntil,10.5+4*(1-resistance));
 const hunter={hp:100,statusResistance:.25,atkPhase:'windup'};
 context.ArkHunter.cold(hunter,4,10);near(hunter.allyColdUntil,10+4*(1-resistance));
 context.ArkHunter.cold(hunter,4,10.5);near(hunter.allyFrozenUntil,10.5+4*(1-resistance));assert.equal(hunter.atkPhase,null);
 const root={hp:100,statusResistance:.25};context.ArkMystic.onHit(owner,root,{mysticAttack:true},false);near(root.rootUntil,10+duration*(1-resistance));
 const stun={hp:100,statusResistance:.25};context.ArkEnemySkills.applyProjectileBuffs(packet,stun,10,false);
 near(stun.stunUntil,10+packet.activeBuffs[0].duration*(1-resistance));
 const loaded={hp:100,statusResistance:.25};assert.equal(api.applySourceBuff(owner,loaded,{kind:'stun',key:'stun',duration:4}),true);
 near(loaded.stunUntil,10+4*(1-resistance));
 const unaffected={hp:100,statusResistance:.25};context.ArkEnemySkills.applyProjectileBuffs(
  {...packet,activeBuffs:[{...packet.activeBuffs[0],statusResistible:false}]},unaffected,10,false);
 near(unaffected.stunUntil,10+packet.activeBuffs[0].duration);
 if(useAura){assert.equal(calls.length,7);assert.ok(calls.every(call=>[10,10.5].includes(call.time)));}
}
context.ArkSkillAuras={statusResistance:()=>1};
const allResist={hp:100,statusResistance:0};context.ArkMystic.onHit(owner,allResist,{mysticAttack:true},false);
assert.equal(allResist.rootUntil,undefined);assert.equal(api.applySourceBuff(owner,allResist,{kind:'stun',key:'stun',duration:4}),false);
const immune={hp:100,coldImmune:true};context.ArkEnemyCold.apply(immune,4,10);context.ArkHunter.cold(immune,4,10);
assert.equal(immune.coldUntil,undefined);assert.equal(immune.allyColdUntil,undefined);
// Enemy base intervals already include source attackSpeed. Combine cold and
// aura additions before one normalization, rather than multiplying two ratios.
const enemy={sourceAttributes:{attackSpeed:120},allyColdUntil:11},cold=context.ArkHunterRules.coldAspd;
context.ArkSkillAuras=undefined;near(context.ArkHunter.enemyTempo(enemy,10),Math.max(10,120+cold)/120);
let calls=0;context.ArkSkillAuras={attribute:(unit,attribute,base,current,time)=>{
 assert.equal(unit,enemy);assert.equal(attribute,'attack_speed');assert.equal(base,120);assert.equal(current,120+cold);assert.equal(time,10);calls++;return current-60;
}};
near(context.ArkHunter.enemyTempo(enemy,10),Math.max(10,120+cold-60)/120);assert.equal(calls,1);
context.ArkSkillAuras={attribute:()=>-100};near(context.ArkHunter.enemyTempo(enemy,10),10/120);
context.ArkSkillAuras={attribute:()=>800};near(context.ArkHunter.enemyTempo(enemy,10),600/120);
console.log('AURA STATUS CONSUMERS OK: enemy/friendly cold and freeze, source projectile stun, loaded stun, Indigo root, fallback/immunity and one enemy ASPD normalization');
