(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkBossMechanics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
let profiles={};
function configure(data){if(data?.schemaVersion!==1||!data.profiles)throw Error('Unsupported boss mechanics catalog');profiles=data.profiles;}
function profileFor(enemy){return enemy?.bossMechanics||profiles[enemy?.enemyId]||null;}
function attach(enemy){const profile=profiles[enemy?.enemyId];if(profile)enemy.bossMechanics=profile;return profile||null;}
function stationary(enemy){return profileFor(enemy)?.movement==='fixed';}
function rect(enemy){
 const box=profileFor(enemy)?.hitbox;if(!box)return null;
 const x=enemy.x+(box.offsetX||0),y=enemy.y-(box.offsetY||0);
 return {xMin:x-box.width/2,xMax:x+box.width/2,yMin:y-box.height/2,yMax:y+box.height/2};
}
function intersectsCell(enemy,row,col){const r=rect(enemy);return !!r&&r.xMin<=col+0.5&&r.xMax>=col-0.5&&r.yMin<=row+0.5&&r.yMax>=row-0.5;}
function distanceTo(enemy,x,y){const r=rect(enemy);if(!r)return Math.hypot(enemy.x-x,enemy.y-y);return Math.hypot(Math.max(r.xMin-x,0,x-r.xMax),Math.max(r.yMin-y,0,y-r.yMax));}
function attackType(enemy,fallback){return profileFor(enemy)?.attack?.damageType||fallback;}
// Called only when locking a fresh attack. The caller has already filtered
// range/visibility/deployment validity; random target selection consumes one RNG draw.
function selectAttackTargets(enemy,candidates,options={}){
 const rule=profileFor(enemy)?.attack;if(!rule)return null;
 const available=candidates.filter(o=>!o.dead);if(!available.length)return [];
 if(rule.selection==='highestDefense'){
  const defense=options.defenseOf||((o)=>o.def||0);
  return available.map((op,index)=>({op,index,def:defense(op)})).sort((a,b)=>b.def-a.def||a.index-b.index).slice(0,rule.targets).map(x=>x.op);
 }
 if(rule.selection==='random'){
  const random=options.random;if(typeof random!=='function')throw Error('Boss random targeting requires session RNG');
  return [available[Math.min(available.length-1,Math.max(0,Math.floor(random()*available.length)))]];
 }
 return null;
}
function talent(enemy,key){const value=enemy?.sourceTalentBlackboard?.find(x=>x.key===key)?.value;return Number.isFinite(value)?value:null;}
function phaseActive(enemy,rule){const threshold=talent(enemy,rule?.thresholdKey);if(threshold==null||!(enemy.maxHp>0))return false;const hp=enemy.hp/enemy.maxHp;return rule.inclusive?hp<=threshold:hp<threshold;}
function incomingMultiplier(enemy,type){
 if(!['phys','physical','arts','magic'].includes(type))return 1;
 const rule=profileFor(enemy)?.damageReduction;if(!rule||!phaseActive(enemy,rule))return 1;
 const scale=talent(enemy,rule.scaleKey);return scale==null?1:Math.max(0,Math.min(1,scale));
}
function defenseMultiplier(enemy){const rule=profileFor(enemy)?.defensePhase;if(!rule||!phaseActive(enemy,rule))return 1;return 1+(talent(enemy,rule.defenseKey)??0);}
function resistanceBonus(enemy){const rule=profileFor(enemy)?.defensePhase;if(!rule||!phaseActive(enemy,rule))return 0;return talent(enemy,rule.resistanceKey)??0;}
function activeSkills(enemy,mode){const rules=profileFor(enemy)?.skills||{};return (enemy.sourceSkills||[]).filter(s=>rules[s.prefabKey]?.mode===mode);}
function setMode(enemy,mode){
 if(!Number.isInteger(mode)||mode<0||mode>2)throw Error('Unsupported boss mode');
 enemy.bossMode=mode;enemy.bossSkillState={mode,cooldowns:{}};
 for(const skill of activeSkills(enemy,mode))enemy.bossSkillState.cooldowns[skill.prefabKey]=Math.max(0,skill.initCooldown??skill.cooldown??0);
}
// Returns at most one cast per simulation tick. The engine decides when an
// action can begin and delivers the returned targets after damageDelay. These
// records intentionally do not trigger mode transitions or predefined traps.
function advanceSkills(enemy,dt,options={}){
 if(!profileFor(enemy)?.skills||enemy.dead)return [];
 if(!enemy.bossSkillState)setMode(enemy,enemy.bossMode??0);
 const state=enemy.bossSkillState,rules=profileFor(enemy).skills,skills=activeSkills(enemy,state.mode);
 for(const skill of skills)state.cooldowns[skill.prefabKey]=Math.max(0,(state.cooldowns[skill.prefabKey]??skill.initCooldown??0)-Math.max(0,dt));
 if(options.canCast===false)return [];
 const candidates=(options.candidates||[]).filter(o=>!o.dead);if(!candidates.length)return [];
 const ready=skills.filter(s=>state.cooldowns[s.prefabKey]<=1e-9&&s.cooldown>0&&s.blackboard?.some(b=>b.key==='atk_scale'&&Number.isFinite(b.value)));
 if(!ready.length)return [];
 ready.sort((a,b)=>(b.priority||0)-(a.priority||0));const priority=ready[0].priority||0,tied=ready.filter(s=>(s.priority||0)===priority);
 let skill=tied[0];if(tied.length>1){if(typeof options.random!=='function')throw Error('Boss skill tie requires session RNG');skill=tied[Math.min(tied.length-1,Math.max(0,Math.floor(options.random()*tied.length)))];}
 const rule=rules[skill.prefabKey],value=key=>skill.blackboard?.find(b=>b.key===key)?.value;
 let targets=candidates;
 if(rule.selection==='highestDefense'){
  const defense=options.defenseOf||((o)=>o.def||0);
  targets=candidates.map((op,index)=>({op,index,def:defense(op)})).sort((a,b)=>b.def-a.def||a.index-b.index).slice(0,rule.targets).map(x=>x.op);
 }
 state.cooldowns[skill.prefabKey]=skill.cooldown;
 return [{type:'damage',skillKey:skill.prefabKey,mode:state.mode,targets,damageType:rule.damageType,atkScale:value('atk_scale'),elementType:rule.elementType,epDamageRatio:value('ep_damage_ratio')??0,damageDelay:rule.damageDelay}];
}
return {configure,profileFor,attach,stationary,rect,intersectsCell,distanceTo,attackType,selectAttackTargets,incomingMultiplier,defenseMultiplier,resistanceBonus,setMode,advanceSkills};
});
