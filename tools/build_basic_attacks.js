'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),source='data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json';
const chars=JSON.parse(fs.readFileSync(path.join(root,source),'utf8')),profiles={};
const modules=JSON.parse(fs.readFileSync(path.join(root,'web/module_data.json'),'utf8'));
const modeRules=JSON.parse(fs.readFileSync(path.join(root,'web/mode_rules.json'),'utf8'));
const equips=JSON.parse(fs.readFileSync(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/excel/battle_equip_table.json'),'utf8'));
const ranges=JSON.parse(fs.readFileSync(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/excel/range_table.json'),'utf8'));
const standardDolls=new Set(['char_4016_kazema','char_1023_ghost2','char_369_bena','char_4107_vrdant']);
const tacticalTokens={char_427_vigil:'token_10028_vigil_wolf',char_452_bstalk:'token_10014_bstalk_crab',char_249_mlyss:'token_10030_mlyss_wtrman',char_476_blkngt:'token_10021_blkngt_hypnos',char_4147_mitm:'token_10037_mitm_trshrb',char_4215_buddy:'token_10063_buddy_bddg',char_4228_closur:'token_10066_closur_ourbase'};
const skills=require(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'));
function tacticalDescription(s){
 const bb=Object.fromEntries(s.blackboard.map(b=>[b.key,b.value]));
 return s.description.replace(/\{([^}:]+)(?::([^}]*))?\}/g,(m,key,format)=>key in bb?String(Math.round(bb[key]*(format?.includes('%')?100:1)*100)/100)+(format?.includes('%')?'%':''):m);
}
for(const [id,c]of Object.entries(chars)){
 if(!id.startsWith('char_'))continue;
 const sub=c.subProfessionId,desc=(c.description||'').replace(/<[^>]*>/g,'');
 const action=sub==='incantationmedic'?'attack':c.profession==='MEDIC'?'heal':['bard','blessing','phalanx','librator'].includes(sub)?sub:'attack';
 const p=profiles[id]={action,subProfession:sub,damageType:/法术伤害/.test(desc)?'arts':'phys',source:source+'#'+id,description:c.description};
 p.mechanicsVersion=2;
 if(id==='char_328_cammou')p.releasedDrone={version:1,skills:['skchr_cammou_2']};
 // JP 36.7.22 serialized Modes/S1,S2,S3 contain 2,2,3 FunnelActions.
 // GdglowHitBehaviour + DicePRD native branch and explosion prefab supply
 // the proc order, per-ability counters and geometry; see funnel.md.
 if(id==='char_377_gdglow')p.releasedDrone={version:2,skills:['skchr_gdglow_1','skchr_gdglow_2','skchr_gdglow_3'],
  modes:{skchr_gdglow_1:{count:2},skchr_gdglow_2:{count:2},skchr_gdglow_3:{count:3,global:true,disarm:true}},
  explosion:{radius:1.1,delay:.32,source:'JP 36.7.22: GdglowHitBehaviour.DealHitTarget 0x24190b4; DicePRD 0x32aa7b4'}};
 if(id==='char_4040_rockr')p.releasedDrone={version:2,skills:['skchr_rockr_2'],modes:{skchr_rockr_2:{count:1,overloadRatio:.5}},
  source:'JP 36.7.22: BasicSkill.get_overloadRatio 0x2102de0; MultiFunnelTrait.UpdateMaxAtkScaleMultiplier 0x25755cc'};
 if(id==='char_108_silent'){
  const tid=c.skills.find(s=>s.skillId==='skchr_silent_2').overrideTokenKey,t=chars[tid];
  p.medicDrone={charId:tid,name:t.name,position:t.position,source:source+'#'+tid,
   phases:t.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames,rangeGrids:ranges[p.rangeId].grids})),
   lifetime:skills[t.skills[0].skillId].levels[0].duration};
 }
 if(id==='char_344_beewax'){
  const tid=c.skills.find(s=>s.skillId==='skchr_beewax_2').overrideTokenKey,t=chars[tid],tk=skills.sktok_beewax;
  p.obelisk={charId:tid,name:t.name,position:t.position,source:source+'#'+tid,
   phases:t.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames})),rangeGrids:ranges[tk.levels[0].rangeId].grids,
   lifetime:t.talents[0].candidates[0].blackboard.find(b=>b.key==='duration').value};
  for(let i=0;i<tk.levels.length;i++)if(JSON.stringify(tk.levels[i].blackboard)!==JSON.stringify(skills.skchr_beewax_2.levels[i].blackboard))throw Error('Review Beeswax token skill inheritance');
 }
 if(id==='char_2015_dusk'){
  const tid=c.skills.find(s=>s.skillId==='skchr_dusk_3').overrideTokenKey,t=chars[tid];
  p.freeling={charId:tid,name:t.name,position:t.position,source:source+'#'+tid,
   phases:t.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames,rangeGrids:ranges[p.rangeId].grids})),
   lifetime:t.talents[0].candidates[0].blackboard.find(b=>b.key==='duration').value};
 }
 // Only these module families have curated consumers. Other medics' module
 // attributes must not imply that their range/trait/conditional effects run.
 if(['char_4196_reckpr','char_4139_papyrs','char_128_plosis','char_171_bldsk','char_108_silent'].includes(id)){
  const mid='uniequip_002_'+id.split('_').at(-1),parts=p=>p.parts.filter(p=>!p.isToken&&!p.validInGameTag&&!p.validInMapTag);
  p.medicModules={[mid]:equips[mid].phases.map(phase=>({
   traits:parts(phase).flatMap(p=>p.overrideTraitDataBundle?.candidates||[]).map(t=>({potential:t.requiredPotentialRank,bb:Object.fromEntries(t.blackboard.map(b=>[b.key,b.value]))})),
   talents:parts(phase).flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).filter(t=>t.name).map(t=>({potential:t.requiredPotentialRank,name:t.name,blackboard:t.blackboard}))
  }))};
  if(id==='char_128_plosis')for(const [i,phase]of equips[mid].phases.entries()){
   const hidden=parts(phase).flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).find(t=>t.rangeId);
   if(!hidden||hidden.rangeId!=='y-3')throw Error('Review Ptilopsis module range');
   p.medicModules[mid][i].rangeGrids=ranges[hidden.rangeId].grids;
  }
 }
 if(sub==='hunter')p.hunter={reloadInterval:c.phases[0].attributesKeyFrames[0].data.baseAttackTime};
 // Veen's merged/transposed energy is a different lifecycle, not nine ordinary shots.
 if(sub==='mystic'&&id!=='char_4226_veen')p.mystic={version:1,storage:'standard'};
 if(standardDolls.has(id)){
  const rangeId=c.trait.candidates[0].rangeId||c.talents[0].candidates.find(t=>t.rangeId)?.rangeId;
  if(!ranges[rangeId])throw Error('Missing substitute range '+id);
  p.dollkeeper={version:1,rangeId,rangeGrids:ranges[rangeId].grids};
 }
 if(tacticalTokens[id]){
  const tid=tacticalTokens[id],t=chars[tid];
  p.tactician={version:1,kind:id==='char_427_vigil'?'wolf':id==='char_249_mlyss'?'flow':id==='char_476_blkngt'?'hypnos':id==='char_4147_mitm'?'cherry':id==='char_4215_buddy'?'hound':id==='char_4228_closur'?'center':'crab',charId:tid,name:t.name,position:t.position,
   phases:t.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames,rangeGrids:ranges[p.rangeId].grids})),talents:t.talents.map(t=>t.candidates.map(c=>({...c,rangeGrids:ranges[c.rangeId]?.grids||null})))};
  p.tactician.moduleTokenTraits=Object.fromEntries(['uniequip_002_'+id.split('_').at(-1)].filter(mid=>equips[mid]).map(mid=>[mid,equips[mid].phases.map(p=>p.parts.filter(p=>p.isToken).flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]))]));
  p.tactician.skillLevels=Object.fromEntries(c.skills.map(({skillId})=>[skillId,skills[skillId].levels.map(s=>({name:s.name,desc:tacticalDescription(s),...s.spData,maxCharge:s.spData.maxChargeTime,spIncrement:s.spData.increment,duration:s.duration,durationType:s.durationType,skillType:s.skillType,isPassive:s.skillType==='PASSIVE',rangeId:s.rangeId,rangeGrids:ranges[s.rangeId]?.grids||null,prefabId:s.prefabId,blackboard:Object.fromEntries(s.blackboard.map(x=>[x.key,x.value])),effects:[]}))]));
  p.tactician.tokenSkills=t.skills.filter(s=>s.skillId).map(({skillId})=>({...skills[skillId].levels[0],rangeGrids:ranges[skills[skillId].levels[0].rangeId]?.grids||null}));
  if(id==='char_249_mlyss')p.tactician.copySkills=t.skills.map(s=>require(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json'))[s.skillId].levels[0]);
 }
 if(['splashcaster','aoesniper','bombarder','fortress'].includes(sub)){
  p.kind='splash';p.radius={splashcaster:1.1,aoesniper:1,bombarder:.9,fortress:1}[sub];
  if(['char_509_acast','char_612_accast'].includes(id))p.radius=.9;
  if(id==='char_253_greyy')p.radius=1;
  p.geometrySource='https://prts.wiki/w/溅射半径一览';
 }
 if(['bombarder','fortress'].includes(sub))p.groundOnly=true;
 if(sub==='bombarder'){p.aftershocks=1;p.aftershockScale=.5;}
 if(['centurion','crusher'].includes(sub))p.kind='blockCount';
 if(sub==='chain'){p.kind='chain';p.chainRadius=1.7;p.chainDecay=.85;}
 if(sub==='lord'){p.airTarget=true;p.rangedScale=.8;}
 if(sub==='spreadshooter'||sub==='reaperrange'){p.kind='rangeAll';p.frontScale=1.5;}
 if(sub==='funnel')p.drone=true;
 if(sub==='stalker'){p.kind='rangeAll';p.traitDodge=.5;}
 if(sub==='hammer'){p.kind='splash';p.radius=1;p.secondaryScale=.5;}
 if(id==='char_391_rosmon'||id==='char_2015_dusk'||id==='char_4211_snhunt'||id==='char_469_indigo'||standardDolls.has(id)||sub==='chain'||tacticalTokens[id]){
  p.modules={};
  const moduleIds=new Set([tacticalTokens[id]?"uniequip_002_"+id.split("_").at(-1):null,modules[id]?.uniEquipId,...Object.values(modeRules.seasons).flatMap(s=>Object.values(s.operators).filter(p=>p.charId===id).map(p=>p.defaultUniEquipId))].filter(Boolean));
  for(const moduleId of moduleIds){
  const eq=equips[moduleId];
  if(eq)p.modules[moduleId]=eq.phases.map(phase=>({
   traits:phase.parts.filter(p=>!p.isToken&&!p.validInGameTag&&!p.validInMapTag).flatMap(p=>p.overrideTraitDataBundle?.candidates||[]).map(t=>({potential:t.requiredPotentialRank,bb:Object.fromEntries(t.blackboard.map(b=>[b.key,b.value]))})),
   talents:phase.parts.filter(p=>!p.isToken&&!p.validInGameTag&&!p.validInMapTag).flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).map(t=>({potential:t.requiredPotentialRank,name:t.name,blackboard:t.blackboard}))
  }));
  }
  p.moduleLevels=p.modules[modules[id]?.uniEquipId]; // legacy audit alias
  if(id==='char_2015_dusk')for(const [i,phase]of equips.uniequip_002_dusk.phases.entries()){
   const hidden=phase.parts.flatMap(p=>p.addOrOverrideTalentDataBundle?.candidates||[]).find(t=>t.rangeId);
   if(hidden?.rangeId!=='3-1')throw Error('Review Dusk X module range');
   p.modules.uniequip_002_dusk[i].rangeGrids=ranges[hidden.rangeId].grids;
  }
 }
 // Keep source token attributes with the owner, using the same training phase/level.
 if(id==='char_391_rosmon'){
  const token=chars.token_10012_rosmon_shield;
  p.token={charId:'token_10012_rosmon_shield',name:token.name,phases:token.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames})),defReduction:token.talents[0].candidates[0].blackboard.find(b=>b.key==='def').value};
 }
 if(id==='char_4016_kazema'){
  const tid='token_10022_kazema_shadow',t=chars[tid];
  p.paperToken={charId:tid,name:t.name,position:t.position,phases:t.phases.map(p=>({maxLevel:p.maxLevel,frames:p.attributesKeyFrames,rangeGrids:ranges[p.rangeId].grids})),talents:t.talents[0].candidates};
 }
 if(sub==='sword'&&/两次/.test(desc)){p.kind='double';p.hits=2;}
 if(['blastcaster','phalanx','reaper'].includes(sub)&&/群体/.test(desc))p.kind='rangeAll';
 if(sub==='ringhealer')p.healTargets=3;
 if(/无法.*被友方角色治疗|不成为其他角色的治疗目标/.test(desc))p.noDirectHeal=true;
 if(c.trait?.candidates?.length)p.traits=c.trait.candidates.map(t=>({phase:Number(t.unlockCondition.phase.slice(-1)),level:t.unlockCondition.level,potential:t.requiredPotentialRank,bb:Object.fromEntries(t.blackboard.map(b=>[b.key,b.valueStr??b.value]))}));
}
const buffs=JSON.parse(fs.readFileSync(path.join(root,'data/ArknightsGameData/zh_CN/gamedata/buff_table.json'),'utf8'));
const modifier=(id,attribute)=>buffs[id].attributes.attributeModifiers.find(m=>m.attributeType===attribute).value;
const hunterRules={coldAspd:modifier('c2e_cold[debuff]','ATTACK_SPEED'),freezeResist:modifier('c2e_freeze','MAGIC_RESISTANCE')};
const out='// Generated by tools/build_basic_attacks.js; do not edit.\nwindow.ArkAttackProfiles='+JSON.stringify(profiles,null,1)+';\nwindow.ArkHunterRules='+JSON.stringify(hunterRules)+';\n';
const target=path.join(root,'web/basic_attacks.js');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==out)throw Error('basic_attacks.js drift');}else fs.writeFileSync(target,out);
console.log('BASIC ATTACK PROFILES '+Object.keys(profiles).length+' source-backed operators');
