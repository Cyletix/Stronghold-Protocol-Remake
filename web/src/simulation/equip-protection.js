(function(root){
 'use strict';
 // Called at impact, before absorb/shield accounting. Never cache on projectile launch.
 function scale(owner,source,board,context={}){
  const data=root.ArkEquipProtectionData,season=data?.seasons[context.seasonId];
  if(!season||owner?.enemyId||!owner?.charId||owner.dead||owner.untargetable||owner.id==null||!board)return 1;
  if(context.cancelled||context.skipModifierEvents||context.noSourceDamage||context.kind&&context.kind!=='damage')return 1;
  if(!source?.enemyId||(!(board.enemies||[]).includes(source)&&!Number.isSafeInteger(source.visualId)))return 1;
  if(!(owner.equip||[]).some(e=>e&&data.equipmentIds.includes(e.id)))return 1;
  if(owner.stunUntil>board.time||owner.sleepUntil>board.time||root.ArkSkillEndEffects?.stunned(owner,board.time))return 1;
  const held=(board.enemies||[]).filter(e=>!e.dead&&e.hp>0&&e.blockerId===owner.id);
  if(!held.length||held.some(e=>e===source||source.visualId!=null&&e.visualId===source.visualId))return 1;
  // Duplicate equipment registration is unresolved. The current local policy
  // evaluates one bound profile per hit; maxStackCnt alone does not prove deduplication.
  return season.damageScale;
 }
 root.ArkEquipProtection={scale};
})(typeof window!=='undefined'?window:globalThis);
