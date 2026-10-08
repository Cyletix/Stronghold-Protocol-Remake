'use strict';
// 保留原始字段语义：不把 isSpPrepare 擅自解释成决策弹窗的前/后回合时机。
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const source = 'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json';
const raw = fs.readFileSync(path.join(root, source));
const activity = JSON.parse(raw), seasons = {};
for (const [seasonId, season] of Object.entries(activity.activity.AUTOCHESS_SEASON)) {
  const operators = {};
  for (const shop of Object.values(season.charShopChessDatas)) {
    const normal = season.charChessDataDict[shop.chessId];
    const elite = season.charChessDataDict[shop.goldenChessId];
    if (!normal || !normal.status || !elite || !elite.status) throw new Error('Missing chess status: ' + shop.chessId);
    operators[shop.chessId] = {
      chessId:shop.chessId, charId:shop.charId, backupCharId:shop.backupCharId, chessType:shop.chessType,
      isHidden:shop.isHidden, tmplId:shop.tmplId, backupTmplId:shop.backupTmplId,
      shopLevelSortId:shop.shopLevelSortId, bondIds:normal.bondIds, goldenBondIds:elite.bondIds,
      tier:shop.chessLevel, defaultSkillIndex:shop.defaultSkillIndex,
      defaultUniEquipId:shop.defaultUniEquipId, backupCharSkillIndex:shop.backupCharSkillIndex,
      backupCharUniEquipId:shop.backupCharUniEquipId, backupCharPotRank:shop.backupCharPotRank,
      normal:normal.status, elite:elite.status, goldenChessId:shop.goldenChessId,
      garrisonIds:normal.garrisonIds, goldenGarrisonIds:elite.garrisonIds,
    };
  }
  seasons[seasonId] = { operators, battleData:season.battleDataDict, stages:season.stageDatasDict };
}
const output = { schemaVersion:1, source, sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),
  cultivateEffects:activity.autoChessData.cultivateEffectList, seasons };
fs.writeFileSync(path.join(root, 'web/mode_rules.json'), JSON.stringify(output, null, 2) + '\n');
console.log('MODE RULES:', Object.entries(seasons).map(([id, s]) => `${id}: ${Object.keys(s.operators).length} chess profiles, ${Object.keys(s.battleData).length} modes`).join('; '));
