'use strict';
const chars=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
function buildTacticianCases(){
 const cases=[];
 for(const [seasonId,s]of Object.entries(seasons))for(const slot of Object.values(s.charShopChessDatas))if(['char_427_vigil','char_249_mlyss'].includes(slot.charId)&&!slot.isHidden&&['PRESET','NORMAL'].includes(slot.chessType))for(const elite of [false,true])for(const [index,sk]of chars[slot.charId].skills.entries()){
  const cid=elite?slot.goldenChessId:slot.chessId,training=s.charChessDataDict[cid].status;
  cases.push({id:seasonId+'/'+cid+'/'+sk.skillId,seasonId,charId:slot.charId,chessId:cid,elite,index,training,defaultModule:slot.defaultUniEquipId,source:skills[sk.skillId].levels[training.skillLevel-1]});
 }
 return cases;
}
module.exports={buildTacticianCases};
