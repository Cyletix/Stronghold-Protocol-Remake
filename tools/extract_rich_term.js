'use strict';
// 从官方 gamedata_const.json 的 termDescriptionDict 提取方舟富文本词条（ba.* → 中文释义）
// 输出：web/battle_richterm.json —— { "stun":{name:"晕眩",desc:"无法移动、阻挡..."}, ... }
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'gamedata_const.json');
const OUT = path.join(ROOT, 'web', 'battle_richterm.json');
const cfg = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const dd = cfg.termDescriptionDict || {};
const out = {};
for (const k of Object.keys(dd)) {
  if (!k.startsWith('ba.')) continue;
  const key = k.slice('ba.'.length);        // 'dt.neural2' / 'stun' / 'fragile' ...
  const v = dd[k] || {};
  if (v.termName) out[key] = { name: v.termName, desc: v.description || '' };
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT, 'entries:', Object.keys(out).length);
// 打印几个样例校验
for (const k of ['stun', 'fragile', 'dt.neural', 'cold', 'mujica']) {
  if (out[k]) console.log('  ', k, '=>', out[k].name, '::', out[k].desc.slice(0, 40) + '...');
}
