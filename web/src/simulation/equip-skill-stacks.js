(function(root){
 'use strict';
 const data=()=>root.ArkEquipSkillStacksData;
 function effectId(eq){const aliases=data()?.aliases||{};return aliases[eq?.id]||aliases[eq?.effectId]||null;}
 function sourceIdentity(eq){const id=effectId(eq);return id?{effectId:id,tier:id==='eff_acgarm040'?2:1}:null;}
 const handles=eq=>effectId(eq)!==null;
 function clear(owner){if(owner)delete owner.equipSkillStacks;}
 function onSkillStarted(owner,context={}){
  const profiles=data()?.seasons[context.seasonId];
  if(!profiles||!owner?.charId||owner.enemyId||owner.dead||owner.id==null)return false;
  // One-profile local policy; multiple-item registration/COUNTING is unverified.
  const id=(owner.equip||[]).map(effectId).find(x=>x&&profiles[x]);if(!id)return false;
  const profile=profiles[id];let state=owner.equipSkillStacks;
  if(!state||state.version!==1||state.effectId!==id||state.seasonId!==context.seasonId){state=owner.equipSkillStacks={version:1,effectId:id,seasonId:context.seasonId,count:profile.initialStacks};}
  if(!Number.isSafeInteger(state.count)||state.count<0||state.count>profile.maxStacks)throw Error('Invalid equipment activation count');
  if(typeof context.random!=='function')throw Error('Equipment skill-start event requires the saved battle RNG');
  // Native Dice calls Range for every positive probability BEFORE the LT cap.
  const roll=context.random();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('Invalid equipment random draw');
  if(roll>profile.probability+0.00001||state.count>=profile.maxStacks)return false;
  state.count+=profile.increment;return true;
 }
 function attackBonus(owner){
  const state=owner?.equipSkillStacks,profile=state&&data()?.seasons[state.seasonId]?.[state.effectId];
  if(!profile||state.version!==1||!Number.isSafeInteger(state.count)||state.count<0||state.count>profile.maxStacks)return 0;
  return profile.atkPerStack*state.count;
 }
 root.ArkEquipSkillStacks={effectId,handles,sourceIdentity,onSkillStarted,attackBonus,clear};
})(typeof window!=='undefined'?window:globalThis);
