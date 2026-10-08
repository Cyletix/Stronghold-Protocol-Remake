'use strict';
// 保留未确认字段的原名，不把storeCntMax改名成共享卡池上限。
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),source='data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json';
const raw=fs.readFileSync(path.join(root,source)),a=JSON.parse(raw),seasons={};
for(const [id,s]of Object.entries(a.activity.AUTOCHESS_SEASON))seasons[id]={
  constData:s.constData,shopLevelDataDict:s.shopLevelDataDict,shopCharChessInfoData:s.shopCharChessInfoData,
  charShopChessDatas:s.charShopChessDatas,trapShopChessDatas:s.trapShopChessDatas,
  shopLevelDisplayDataDict:s.shopLevelDisplayDataDict,diyChessDict:s.diyChessDict,
  modeDataDict:s.modeDataDict,effectChoiceInfoDict:s.effectChoiceInfoDict
};
const artifact={schemaVersion:1,source,sha256:crypto.createHash('sha256').update(raw).digest('hex'),
  limitations:['storeCntMax语义未确认','未找到每棋子库存容量、商店抽取概率表或出售返池规则','normalPhaseTime阶段边界待核对，不能直接当作休整时长'],
  global:{constData:a.autoChessData.constData,turnInfoDataDict:a.autoChessData.turnInfoDataDict,gameTipsList:a.autoChessData.gameTipsList},seasons};
const target=path.join(root,'docs/generated/shop-source.json'),out=JSON.stringify(artifact,null,2)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==out)throw Error('shop-source.json漂移，请运行node tools/extract_shop_research.js');}
else fs.writeFileSync(target,out);
console.log('SHOP SOURCE OK '+Object.keys(seasons).length+' seasons; preserved stock candidate, prices, roster, choice definitions, phase times and client tips');
