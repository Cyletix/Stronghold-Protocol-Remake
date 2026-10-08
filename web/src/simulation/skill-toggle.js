// Source toggle modes share the normal skill Buff and combat-mode lifecycles.
(function(root){
 'use strict';
 function profile(unit){return root.ArkSkillModeData?.profiles[unit.skill?.skillMode?.profileId]||null;}
 function validate(p,program,skill){
  const c=program?.controller,t=c?.toggle;
  if(p?.capability!=='toggle-skill'||p.activation!=='toggle'||p.lifetime?.kind!=='until_toggle'||
   p.action!=='attack'||p.modeIndex!==1||p.modeBuffIndex!==null||c?.kind!=='toggle_skill'||
   c.activation!=='toggle'||c.duration_policy!=='until_toggle'||c.pre_delay!==0||
   c.wait_for_casting!==false||c.wait_for_attack_event!==false||c.allow_no_target!==true||
   c.sp_recovery_while_active!==false||t?.onModeIndex!==1||t.offModeIndex!==0||
   t.restartFSM!==false||t.useAbilityHandleToggle!==false||skill.isPassive||skill.duration!==0||
   !(skill.spCost>0)||skill.spType!=='INCREASE_WITH_TIME'||(skill.maxCharge||1)!==1||
   !Array.isArray(program.buffs)||!program.buffs.length||program.buffs.some(b=>b.lifetime?.kind!=='until_detach'))
   throw Error('Invalid complete source toggle mode');
  return true;
 }
 function active(unit){const p=profile(unit);return !!(p?.activation==='toggle'&&unit.skillState?.sourceMode?.profileId===unit.skill.sourceId);}
 function deactivate(unit){
  if(!active(unit))return null;
  if(unit.dead||unit.removed||!operatorCanAct(unit)||sourceHealingBusy(unit)||unit.deployAt>B.time||
   root.ArkDollkeeper?.active(unit)||root.ArkElements?.skillLocked(unit)||unit.sp<unit.skill.spCost)return false;
  // Native ToggleSkill.DoCast reduces the same SP cost before either mode
  // transition. Maintained Buffs do not keep the instantaneous cast affecting.
  unit.sp-=unit.skill.spCost;
  endOperatorSkill(unit,'toggle-off');notifyOperatorSkillStarted(unit);return true;
 }
 root.ArkSkillToggle={validate,active,deactivate};
})(typeof window!=='undefined'?window:globalThis);
