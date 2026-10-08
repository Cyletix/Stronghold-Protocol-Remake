'use strict';
// Source-linked normal/elite traits. Never derive executable rules from display text.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const activity=read('data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const out={schemaVersion:1,seasons:{},enemyTags:{}};
for(const e of read('data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json').enemies){
 for(const variant of e.Value){const tags=variant.enemyData.enemyTags;if(tags?.m_defined)out.enemyTags[e.Key]=tags.m_value||[];}
}
for(const [sid,s]of Object.entries(activity.activity.AUTOCHESS_SEASON)){
 const season=out.seasons[sid]={operators:{},chess:{},traits:{},items:s.trapChessDataDict};
 for(const [id,g]of Object.entries(s.garrisonDataDict))season.traits[id]={id,eventType:g.eventType,kind:g.effectType,rune:g.battleRuneKey||'',label:g.eventTypeDesc,icon:g.eventTypeIcon,desc:g.garrisonDesc||g.description||'',bb:Object.fromEntries(g.blackboard.map(b=>[b.key,b.valueStr??b.value]))};
 for(const [id,c]of Object.entries(s.charShopChessDatas)){
  const normal=s.charChessDataDict[id],elite=s.charChessDataDict[c.goldenChessId];if(!normal)continue;
  const p={chessId:id,charId:c.charId||c.backupCharId,tier:c.chessLevel,elite:false,bonds:normal.bondIds,upgradeNum:normal.upgradeNum,normal:normal.garrisonIds||[],golden:elite?.garrisonIds||[]};
  season.chess[id]=p;if(c.goldenChessId)season.chess[c.goldenChessId]={...p,elite:true};
  for(const cid of new Set([c.charId,c.backupCharId].filter(Boolean)))(season.operators[cid]??=[]).push(p);
 }
 for(const p of Object.values(season.chess))for(const id of [...p.normal,...p.golden])if(!season.traits[id])throw Error(sid+' missing trait '+id);
}
const target=path.join(root,'web/garrison_data.json'),body=JSON.stringify(out);
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==body)throw Error('Rebuild garrison_data.json');}
else fs.writeFileSync(target,body);
console.log('GARRISON',Object.entries(out.seasons).map(([s,v])=>s+': '+Object.keys(v.chess).length+' chess variants').join('; '));
