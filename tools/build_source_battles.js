'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {enemyVariant,convertLevel}=require('./lib/source-battle');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const rounds=read('web/mode_rounds.json'),db=read('data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json');
const base=read('web/battle_data.json'),database=new Map(db.enemies.map(x=>[x.Key,x.Value]));
const activity=read(rounds.source);
for(const [id,season]of Object.entries(rounds.seasons)){
  const source=activity.activity.AUTOCHESS_SEASON[id];
  season.modeConfigs=source.modeDataDict;season.shopLevels=source.shopLevelDataDict;
  // Keep source selection weights and explicit hidden-boss identity. Blood-point fields
  // are retained for research; they do not by themselves define an enemy's combat HP.
  season.bosses=Object.fromEntries(Object.entries(source.bossInfoDict).map(([bossId,boss])=>[
    bossId,{...activity.autoChessData.bossInfoDict[bossId],...boss}
  ]));
  // Shared mode/round phase timings; retain bossTurnHpReduceTime as source data
  // without inferring a damage interval or wiring it into combat here.
  season.turnInfo=activity.autoChessData.turnInfoDataDict;
  season.constData={maxBattleChessCnt:source.constData.maxBattleChessCnt,shopRefreshPrice:source.constData.shopRefreshPrice};
  season.shopPrices=source.shopCharChessInfoData;
  // Source effects are retained separately from the unknown server event pools.
  season.decisionEffects=Object.values(source.effectInfoDataDict).filter(e=>['ENEMY_GAIN','BUFF_GAIN'].includes(e.effectType)).map(e=>({...e,
    mechs:(source.effectBuffInfoDataDict[e.effectId]||[]).map(m=>({key:m.key,bb:Object.fromEntries((m.blackboard||[]).map(x=>[x.key,x.valueStr??x.value]))}))}));
  season.decisionEnemies={};
  for(const effect of season.decisionEffects)for(const m of effect.mechs){
    const id=m.bb.enemy_id;
    if(id&&database.has(id))season.decisionEnemies[id]=enemyVariant({id,level:0,useDb:true},database,base.enemies[id]);
  }
  season.bands=Object.values(source.bandDataListDict).map(b=>({
    bandId:b.bandId,name:activity.autoChessData.bandDataDict[b.bandId]?.bandName||b.bandId,
    sortId:b.sortId,hp:b.totalHp,desc:b.bandDesc,modeTypeList:b.modeTypeList,
    mechs:(source.effectBuffInfoDataDict[b.effectId]||[]).map(m=>({key:m.key,countType:m.countType,
      bb:(m.blackboard||[]).map(x=>({k:x.key,v:x.valueStr??x.value}))}))
  })).sort((a,b)=>a.sortId-b.sortId);
}
const sourceHashes={};for(const f of ['web/mode_rounds.json','web/battle_data.json','data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'])sourceHashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const levels={};
for(const [key,raw]of Object.entries(rounds.levels)){
  if(!raw)continue;const warnings=[],enemies={};
  for(const ref of raw.enemyDbRefs||[])enemies[ref.id]=enemyVariant(ref,database,base.enemies[ref.id]);
  for(const item of raw.enemies||[]){const id=item.Key||item.id;enemies[id]=enemyVariant({id,level:0,useDb:false,overwrittenData:item.Value||item.enemyData},database,base.enemies[id]);}
  const level=convertLevel(raw,warnings);
  if(Object.keys(raw.branches||{}).length)warnings.push('动态分支尚未触发，仅执行主波次');
  if(raw.waves.some(w=>w.fragments.some(f=>f.actions.some(a=>a.randomSpawnGroupKey))))warnings.push('随机组组合尚未适配，按声明动作执行');
  if(raw.runes?.length||raw.globalBuffs?.length)warnings.push('关卡runes/globalBuffs尚未完整解释');
  levels[key]={level,enemies,rawRoutes:raw.routes,waves:raw.waves,options:raw.options,warnings:[...new Set(warnings)]};
}
const out={schemaVersion:1,sourceHashes,seasons:rounds.seasons,levels};
const file=path.join(root,'web/source_battles.json'),text=JSON.stringify(out)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text){console.error('STALE source_battles.json');process.exitCode=1;}}
else fs.writeFileSync(file,text);
console.log('SOURCE BATTLES',Object.keys(levels).length,'levels;',Object.values(levels).reduce((n,l)=>n+Object.keys(l.enemies).length,0),'level enemy variants;',Object.values(levels).filter(l=>l.warnings.length).length,'levels with explicit approximation notes');
