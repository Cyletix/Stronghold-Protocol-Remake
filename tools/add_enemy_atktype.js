'use strict';
// 敌人攻击类型（物理/法术）：gamedata JSON 无此字段（在敌人攻击 prefab 里），用名字启发式近似
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const bd = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'battle_data.json'), 'utf8'));
const ARTS = /法术|术师|法师|咒术|巫术|源石技艺|元素|寒|霜|冻|冰|灼|焚|炎|雷|电|静电/;
let arts = 0, phys = 0;
const artsNames = [];
for (const key of Object.keys(bd.enemies)) {
  const en = bd.enemies[key];
  const atkType = ARTS.test(String(en.name || '')) ? 'arts' : 'phys';
  en.atkType = atkType;
  if (atkType === 'arts') { arts++; if (artsNames.length < 15) artsNames.push(en.name); }
  else phys++;
}
fs.writeFileSync(path.join(ROOT, 'web', 'battle_data.json'), JSON.stringify(bd, null, 2));
console.log('wrote battle_data.json | 法术敌人:', arts, '| 物理敌人:', phys);
console.log('法术敌人样例:', artsNames.join(', '));
