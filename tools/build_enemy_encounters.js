'use strict';
// Preserve the encounter inputs that were lost by flattening enemy_type_pool.
// Native-backed template replacement consumes these source-isolated inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {enemyVariant}=require('./lib/source-battle'),root=path.resolve(__dirname,'..');
const sources={},read=file=>{const bytes=fs.readFileSync(path.join(root,file));sources[file]=crypto.createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);};
const activity=read('data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json');
const db=read('data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json');
const base=read('web/battle_data.json'),common=activity.autoChessData;
const overridePath='data/ArknightsGameData/zh_CN/gamedata/levels/'+common.constData.enemyDataLevelId.toLowerCase()+'.json';
const overrideLevel=read(overridePath),refs=new Map(overrideLevel.enemyDbRefs.map(ref=>[ref.id,ref]));
const database=new Map(db.enemies.map(e=>[e.Key,e.Value])),seasons={};
const ids=new Set(Object.keys(common.randomEnemyAttributeDict));
for(const [id,s]of Object.entries(activity.activity.AUTOCHESS_SEASON)){
  seasons[id]={specialEnemyInfo:s.specialEnemyInfoDict,enemyInfo:s.enemyInfoDict,typeDraw:s.specialEnemyRandomTypeDict,
    trainingTypes:s.constData.trSpecialEnemyTypes,modes:Object.fromEntries(Object.entries(s.modeDataDict).map(([k,m])=>[k,{name:m.name,modeType:m.modeType,modeDifficulty:m.modeDifficulty,inactiveEnemyKey:m.inactiveEnemyKey}])),
    // These source factors may be reward factors. Do not use them as HP multipliers.
    sourceModeFactor:s.modeFactorInfo,sourceDifficultyFactor:s.difficultyFactorInfo};
  for(const id of Object.values(s.enemyInfoDict).flat())ids.add(id);
  for(const e of Object.values(s.specialEnemyInfoDict))for(const id of [e.specialEnemyKey,...e.attachedNormalEnemyKeys,...e.attachedEliteEnemyKeys])ids.add(id);
}
for(const id of refs.keys())ids.add(id);
const enemies={};
for(const id of [...ids].sort()){
  const attr=common.randomEnemyAttributeDict[id],ref=refs.get(id)||{id,level:attr?.level??0,useDb:true};
  enemies[id]=enemyVariant(ref,database,base.enemies[id]);
}
// Quantity fallback reads the database at entry.level; the dedicated encounter
// level's overwrittenData applies to combat, not to this fallback power budget.
const quantityAttributes=Object.fromEntries(Object.entries(common.randomEnemyAttributeDict).map(([id,entry])=>
  [id,enemyVariant({id,level:entry.level,useDb:true},database).sourceAttributes]));
const data={schemaVersion:1,sourceHashes:sources,status:'native-template-replacement',types:common.enemyTypeDatas,
  constants:Object.fromEntries(Object.entries(common.constData).filter(([k])=>/enemy/i.test(k)||k==='maxLevelCnt')),
  attributes:common.randomEnemyAttributeDict,quantityAttributes,enemyOverrides:overrideLevel.enemyDbRefs,seasons,enemies};
const file=path.join(root,'web/enemy_encounters.json'),text=JSON.stringify(data)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text){console.error('STALE enemy_encounters.json');process.exitCode=1;}}
else fs.writeFileSync(file,text);
console.log('ENEMY ENCOUNTERS',Object.keys(enemies).length,'enemies;',refs.size,'combat overrides;',Object.keys(quantityAttributes).length,'separate quantity attributes; two season groups retained');
