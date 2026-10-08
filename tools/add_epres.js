'use strict';
// 给 battle_data.json 追加 epRes（元素损伤抗性）：敌人从 enemy_database.attributes.epDamageResistance 提取，干员默认 0
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GD = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata');
const bd = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'battle_data.json'), 'utf8'));
const ed = JSON.parse(fs.readFileSync(path.join(GD, 'levels', 'enemydata', 'enemy_database.json'), 'utf8'));
const unwrap = v => (v && v.m_defined) ? v.m_value : (typeof v === 'number' ? v : 0);

// 干员：默认 0（character_table attributesKeyFrames 无 epDamageResistance 字段）
for (const o of bd.operators) { if (o.epRes == null) o.epRes = 0; }
// 敌人：从 enemy_database 提取
const byKey = {};
for (const e of (ed.enemies || [])) {
  const key = e.Key;
  const ed0 = (e.Value && e.Value[0]) ? e.Value[0].enemyData : null;
  if (key && ed0 && ed0.attributes) byKey[key] = unwrap(ed0.attributes.epDamageResistance);
}
let n = 0;
for (const key of Object.keys(bd.enemies)) {
  const v = byKey[key];
  if (v != null) { bd.enemies[key].epRes = v; if (v) n++; }
  else if (bd.enemies[key].epRes == null) bd.enemies[key].epRes = 0;
}
fs.writeFileSync(path.join(ROOT, 'web', 'battle_data.json'), JSON.stringify(bd, null, 2));
console.log('wrote battle_data.json | 有元素损伤抗性的敌人:', n);
