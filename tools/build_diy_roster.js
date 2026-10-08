'use strict';
// DIY selection metadata. Source chess slots remain distinct from fixed recruits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),dir='data/ArknightsGameData/zh_CN/gamedata/excel/';
const files=['activity_table.json','character_table.json','uniequip_table.json','battle_equip_table.json'];
const raw=files.map(f=>fs.readFileSync(path.join(root,dir,f))),[activity,chars,uni,equip]=raw.map(x=>JSON.parse(x));
const battle=require('../web/battle_data.json'),skills=require('../web/skill_choices.json');
const attributes=bb=>{const out={hp:0,atk:0,def:0,aspd:0,magicRes:0};for(const x of bb||[]){const k={max_hp:'hp',atk:'atk',def:'def',attack_speed:'aspd',magic_resistance:'magicRes'}[x.key];if(k)out[k]+=x.value*(k==='aspd'?.01:1);}return out;};
const operators={};
for(const op of battle.operators){
 const c=chars[op.charId];if(c?.rarity!=='TIER_6'||c.isNotObtainable)continue;
 if(!skills[op.charId]?.length)throw Error('Missing DIY skills: '+op.charId);
 const powers=[c.mainPower||c,...(c.subPower||[])].flatMap(p=>[p.nationId,p.groupId,p.teamId]).filter(Boolean);
 operators[op.charId]={charId:op.charId,name:c.name,rarity:6,powerIds:[...new Set(powers)],
  skills:skills[op.charId].map(s=>({index:s.index,skillId:s.skillId,name:s.name})),
  modules:Object.values(uni.equipDict).filter(u=>u.charId===op.charId&&!u.tmplId&&u.type==='ADVANCED'&&!u.isSpecialEquip&&equip[u.uniEquipId]?.phases?.length).map(u=>({uniEquipId:u.uniEquipId,name:u.uniEquipName,phases:equip[u.uniEquipId].phases.map(p=>attributes(p.attributeBlackboard))}))};
}
const seasons={};
for(const [sid,s] of Object.entries(activity.activity.AUTOCHESS_SEASON)){
 const shops=Object.values(s.charShopChessDatas),excluded=[...new Set(shops.filter(p=>p.chessType!=='DIY').flatMap(p=>[p.charId,p.backupCharId]).filter(Boolean))];
 seasons[sid]={slots:shops.filter(p=>p.chessType==='DIY').map(p=>({slotId:p.chessId,tier:p.chessLevel,rarity:s.diyChessDict[p.chessId],normal:s.charChessDataDict[p.chessId].status,elite:s.charChessDataDict[p.goldenChessId].status})),excludedCharIds:excluded,
  eligibleCharIds:Object.keys(operators).filter(id=>!excluded.includes(id)),fallbackBondId:s.constData.fallbackBondId,
  fallbackRule:{activeCount:s.bondInfoDict.emptyShip.activeCount,desc:s.bondInfoDict.emptyShip.desc,blackboard:s.effectBuffInfoDataDict.bondeffect_empty[0].blackboard},
  coreBonds:Object.keys(s.bondInfoDict).map(id=>activity.autoChessData.bondInfoDict[id]).filter(b=>b?.isPower).map(b=>({bondId:b.bondId,name:b.name,powerIdList:b.powerIdList}))};
}
const out={schemaVersion:1,sources:files.map((f,i)=>({path:dir+f,sha256:crypto.createHash('sha256').update(raw[i]).digest('hex')})),operators,seasons};
const target=path.join(root,'web/diy_roster.json'),text=JSON.stringify(out,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==text)throw Error('DIY roster is stale');}else fs.writeFileSync(target,text);
console.log('DIY ROSTER OK:',Object.entries(seasons).map(([id,s])=>id+' '+s.slots.length+' slots / '+s.eligibleCharIds.length+' eligible').join('; '));
