'use strict';
// 提取卫戍协议「特训敌人类型 → 敌人列表」：activity.AUTOCHESS_SEASON.act2autochess.specialEnemyInfoDict
// 每类含 specialEnemyKey + attachedNormal/EliteEnemyKeys，供 genWaves 按本局类型出怪
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const act = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json'), 'utf8'));
const ac2 = (act.activity && act.activity.AUTOCHESS_SEASON && act.activity.AUTOCHESS_SEASON.act2autochess) || {};
const sei = ac2.specialEnemyInfoDict || {};
const pool = {};
for (const k in sei) {
  const e = sei[k];
  (pool[e.type] = pool[e.type] || []).push(e.specialEnemyKey);
  for (const n of (e.attachedNormalEnemyKeys || [])) pool[e.type].push(n);
  for (const n of (e.attachedEliteEnemyKeys || [])) pool[e.type].push(n);
}
for (const t in pool) pool[t] = [...new Set(pool[t])];
fs.writeFileSync(path.join(ROOT, 'web', 'enemy_type_pool.json'), JSON.stringify(pool, null, 1));
const summary = Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length]));
console.log('wrote enemy_type_pool.json:', Object.keys(pool).length, '类', JSON.stringify(summary));
