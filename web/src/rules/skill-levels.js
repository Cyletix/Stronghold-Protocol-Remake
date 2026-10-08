// Decode only the selected level; never expand the entire catalog in memory.
(function(root){
 'use strict';
 function count(id){return root.ArkOperatorSkillData?.skills[id]?.length||0;}
 function get(id,level){
  const levels=root.ArkOperatorSkillData?.skills[id];
  if(!levels||!Number.isInteger(level)||level<1||level>levels.length)return null;
  const value={};for(let i=0;i<level;i++)Object.assign(value,levels[i]);
  return {...value,blackboard:{...value.blackboard},rangeGrids:value.rangeGrids?.map(c=>({...c}))||null};
 }
 root.ArkSkillLevels={get,count};
})(typeof window!=='undefined'?window:globalThis);
