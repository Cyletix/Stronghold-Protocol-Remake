'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const chars=read('data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const {extractLevel}=require('./extract_skills');
const {computeEffects}=require('./classify_skills');
const defaults=read('web/skill_data.json'), choices={};
for(const op of read('web/battle_data.json').operators){
 choices[op.charId]=(chars[op.charId]?.skills||[]).flatMap((s,index)=>{
  const sk=skills[s.skillId];if(!sk)return [];
  const previous=defaults[op.charId]?.skillId===s.skillId?defaults[op.charId]:null;
  const variant=n=>({...extractLevel(sk,n),...computeEffects(op.charId,sk,n,null)});
  const normal=variant(Math.min(3,sk.levels.length-1)),elite=variant(Math.min(6,sk.levels.length-1));
  const iconId=[sk.iconId,s.skillId,elite.prefabId].find(id=>id&&fs.existsSync(path.join(root,'web/ui/skillicons/skill_icon_'+id+'.png'))) || null;
  return [{...(previous||{name:elite.name,desc:elite.desc,type:elite.skillType,durationType:elite.durationType,normal,elite}),skillId:s.skillId,iconId,index,unlockCond:s.unlockCond}];
 });
}
const details={}, traps=Object.values(read('web/trap_data.json').traps);
for(const eq of read('web/equips.json')){
 const t=traps.find(t=>t.effectId===eq.id),ch=chars[t?.charId];
 details[eq.id]={description:eq.desc||'',golden:t?.isGolden||eq.tier==='golden',talents:(ch?.talents||[]).flatMap(t=>t.candidates?.slice(-1)||[]).map(t=>({name:t.name,description:t.description})),skills:(ch?.skills||[]).map(s=>extractLevel(skills[s.skillId],0)).filter(s=>s?.desc)};
}
for(const [file,data] of [['skill_choices.json',choices],['equipment_details.json',details]]){
 const output=JSON.stringify(data,null,2)+'\n',dest=path.join(root,'web',file);
 if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==output)throw Error(file+' needs regeneration');}
 else fs.writeFileSync(dest,output);
 console.log(file+': '+Object.keys(data).length+' entries');
}
