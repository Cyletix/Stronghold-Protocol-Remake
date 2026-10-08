'use strict';
// 提取卫戍协议敌人池：activity_table.autoChessData.randomEnemyAttributeDict → mode_data.json.enemyPool
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const act = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json'), 'utf8'));
const acd = act['autoChessData'] || {};
const pool = acd.randomEnemyAttributeDict || {};
const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_data.json'), 'utf8'));
md.enemyPool = Object.keys(pool).map(k => {
  const e = pool[k];
  return { enemyId: e.enemyKey, level: e.level || 0, isFly: !!e.isFlyEnemy, extraEnemyKeyList: e.extraEnemyKeyList || null, effectiveness: e.enemyBattleEffectivenessFactor || 1 };
});
// 同时把召唤列表/飞行标记写进 battle_data.json 敌人（引擎死亡分裂召唤用）
const bd = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'battle_data.json'), 'utf8'));
for (const p of md.enemyPool) {
  const en = bd.enemies[p.enemyId]; if (!en) continue;
  en.extraEnemyKeyList = p.extraEnemyKeyList;
  if (p.isFly) en.flying = true;
}
fs.writeFileSync(path.join(ROOT, 'web', 'battle_data.json'), JSON.stringify(bd, null, 2));
fs.writeFileSync(path.join(ROOT, 'web', 'mode_data.json'), JSON.stringify(md, null, 1));
const byLv = {};
for (const e of md.enemyPool) byLv[e.level] = (byLv[e.level] || 0) + 1;
console.log('wrote mode_data.json | enemyPool:', md.enemyPool.length, '| 等级分布:', JSON.stringify(byLv));
