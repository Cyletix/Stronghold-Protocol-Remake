(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkDiyRoster=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const KEY='ark-diy-roster-v1',object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 function normalize(data,sid,value={}){
  const s=data.seasons[sid];if(!s||!object(value))throw Error('甄选编队格式无效');
  const out={},used=new Set();
  for(const key of Object.keys(value))if(!s.slots.some(x=>x.slotId===key))throw Error('甄选栏位不存在');
  for(const slot of s.slots){
   const v=value[slot.slotId];if(v==null)continue;
   if(!object(v)||Object.keys(v).some(k=>!['charId','skillIndex','potentialRank','uniEquipId'].includes(k)))throw Error('甄选配置无效');
   if(!s.eligibleCharIds.includes(v.charId))throw Error('只能甄选当季固定名册以外的六星干员');
   if(used.has(v.charId))throw Error('同一干员不能占用两个甄选栏位');used.add(v.charId);
   const op=data.operators[v.charId],skillIndex=v.skillIndex??op.skills[0].index,potentialRank=v.potentialRank??5,uniEquipId=v.uniEquipId??null;
   if(!op.skills.some(x=>x.index===skillIndex))throw Error('甄选技能不存在');
   if(!Number.isInteger(potentialRank)||potentialRank<0||potentialRank>5)throw Error('甄选潜能无效');
   if(uniEquipId!==null&&!op.modules.some(x=>x.uniEquipId===uniEquipId))throw Error('甄选模组不属于此干员');
   out[slot.slotId]={charId:v.charId,skillIndex,potentialRank,uniEquipId};
  }return out;
 }
 function bonds(data,sid,charId){const s=data.seasons[sid],p=data.operators[charId]?.powerIds||[],ids=s.coreBonds.filter(b=>b.powerIdList.some(id=>p.includes(id))).map(b=>b.bondId);return ids.length?ids:[s.fallbackBondId];}
 function profiles(data,rules,sid,value){return Object.entries(normalize(data,sid,value)).map(([id,v])=>{
  const base=rules.seasons[sid].operators[id];if(!base||base.chessType!=='DIY')throw Error('甄选源槽位缺失');
  const bondIds=bonds(data,sid,v.charId);
  return {...base,charId:v.charId,defaultSkillIndex:v.skillIndex,defaultUniEquipId:v.uniEquipId,backupCharPotRank:v.potentialRank,
   bondIds,goldenBondIds:bondIds,garrisonIds:[],goldenGarrisonIds:[]};
 });}
 function moduleFor(data,profile){const m=data.operators[profile.charId]?.modules.find(m=>m.uniEquipId===profile.defaultUniEquipId);return m?{uniEquipId:m.uniEquipId,name:m.name,normal:m.phases[profile.normal.equipLevel-1]||null,elite:m.phases[profile.elite.equipLevel-1]||null}:null;}
 function read(storage,sid){try{return JSON.parse(storage.getItem(KEY)||'{}')[sid]||{};}catch{return {};}}
 function save(storage,sid,value){let all;try{all=JSON.parse(storage.getItem(KEY)||'{}');}catch{}if(!object(all))all={};all[sid]=value;storage.setItem(KEY,JSON.stringify(all));}
 return Object.freeze({normalize,bonds,profiles,moduleFor,read,save});
});
