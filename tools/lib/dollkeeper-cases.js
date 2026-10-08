'use strict';
const chars=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json');
const skills=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json');
const seasons=require('../../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
const ids=['char_4016_kazema','char_1023_ghost2','char_369_bena','char_4107_vrdant'];
function buildDollkeeperCases(){
 const cases=[];
 for(const [seasonId,s]of Object.entries(seasons))for(const slot of Object.values(s.charShopChessDatas))if(ids.includes(slot.charId)&&!slot.isHidden&&['PRESET','NORMAL'].includes(slot.chessType)){
  for(const elite of [false,true])for(const [index,skill]of chars[slot.charId].skills.entries()){
   const cid=elite?slot.goldenChessId:slot.chessId,training=s.charChessDataDict[cid].status;
   cases.push({id:seasonId+'/'+cid+'/'+skill.skillId,seasonId,charId:slot.charId,chessId:cid,defaultModule:slot.defaultUniEquipId,elite,index,training,source:skills[skill.skillId].levels[training.skillLevel-1]});
  }
 }
 return cases;
}
module.exports={ids,buildDollkeeperCases};
