'use strict';
// 提取卫戍协议「额外道具/装置」系统数据，生成 web/trap_data.json（U-ITEMS 子系统基础）。
// 来源：act2autochess.trapChessDataDict（装置定义）+ trapShopChessDatas（商店装置池）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SRC = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json');
const c = (JSON.parse(fs.readFileSync(SRC, 'utf8')).activity.AUTOCHESS_SEASON || {}).act2autochess || {};
const ct = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'character_table.json'), 'utf8'));

const traps = {};
for (const id in (c.trapChessDataDict || {})) {
  const t = c.trapChessDataDict[id];
  traps[id] = { chessId: t.chessId, charId: t.charId, name: (ct[t.charId] && ct[t.charId].name) || t.charId, purchasePrice: t.purchasePrice, isGolden: !!t.isGolden, upgradeChessId: t.upgradeChessId, trapDuration: t.trapDuration, effectId: t.effectId };
}
const shop = {};
for (const id in (c.trapShopChessDatas || {})) {
  const s = c.trapShopChessDatas[id];
  shop[id] = { itemId: s.itemId, goldenItemId: s.goldenItemId, itemLevel: s.itemLevel, itemType: s.itemType, trapId: s.trapId, shopLevelSortId: s.shopLevelSortId, hideInShop: !!s.hideInShop };
}
fs.writeFileSync(path.join(WEB, 'trap_data.json'), JSON.stringify({ traps, shop }, null, 1), 'utf8');
console.log('trap_data.json：traps', Object.keys(traps).length, '；shop', Object.keys(shop).length);
