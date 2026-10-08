'use strict';
// 从 activity_table.json 提取卫戍协议经济规则，生成 web/shop_level.json + web/kill_coin.json（数据驱动，供 mode.js/engine.js 消费）。
// - shop_level.json：mode_single_normal 各调度中心等级的干员卡数/物品卡数/升本费用（gamedata shopLevelDataDict）。
// - kill_coin.json：add_enemy_kill_gain_coin 的 109 条（指定敌人编号在第某回合被击杀掉指定金币）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SRC = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json');
const act = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const c = (act.activity && act.activity.AUTOCHESS_SEASON && act.activity.AUTOCHESS_SEASON.act2autochess) || {};

// 1) 商店等级（单人普通模式）
const shopRaw = (c.shopLevelDataDict || {})['mode_single_normal'] || {};
const shopLevel = Object.values(shopRaw)
  .map(v => ({ level: v.shopLevel, charChessCount: v.charChessCount, itemCount: v.itemCount, upgrade: v.initialUpgradePrice }))
  .sort((a, b) => a.level - b.level);
fs.writeFileSync(path.join(WEB, 'shop_level.json'), JSON.stringify(shopLevel, null, 1), 'utf8');

// 2) 击杀奖励金币
const buff = (c.effectBuffInfoDataDict || {});
const killCoin = [];
for (const k in buff) {
  const arr = buff[k];
  (Array.isArray(arr) ? arr : [arr]).forEach(e => {
    if (e && e.key === 'add_enemy_kill_gain_coin') {
      const bb = (e.blackboard || []);
      const g = key => { const b = bb.find(x => x.key === key); return b ? (b.valueStr != null ? b.valueStr : b.value) : null; };
      const enemyId = g('enemy_id'), coin = g('coin');
      if (enemyId && coin != null) killCoin.push({ enemyId, round: g('round'), count: g('count') || 1, coin });
    }
  });
}
fs.writeFileSync(path.join(WEB, 'kill_coin.json'), JSON.stringify(killCoin, null, 1), 'utf8');

console.log('shop_level.json', shopLevel.length, '级；kill_coin.json', killCoin.length, '条');
