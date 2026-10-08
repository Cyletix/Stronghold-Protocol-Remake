'use strict';
// 天赋效果分类（算子组合版）：给 talent_data.json 每项追加 effects:[{type,power},...]
// 数据源：talent_data.json（extract_talent_data.py 已从 character_table.talents 提取）
const fs = require('fs'), path = require('path');
const { classifyOperators } = require('./effect_operators');
const ROOT = path.join(__dirname, '..');
const TALENT = path.join(ROOT, 'web', 'talent_data.json');
const talent = JSON.parse(fs.readFileSync(TALENT, 'utf8'));

let withEffect = 0, noEffect = 0, total = 0;
for (const cid of Object.keys(talent)) {
  for (const group of talent[cid]) {          // 天赋分组（天赋1/天赋2），每组多个潜能候选
    for (const t of group) {                  // 单个候选 {phase,potential,name,description,blackboard}
      total++;
      const bb = {};
      for (const b of (t.blackboard || [])) bb[b.key] = b.value;
      t.effects = classifyOperators(t.description, bb);
      // 触发时机：部署后 / 攻击时 / 被动常驻（攻击时若带 prob 则为概率触发）
      const d = t.description || '';
      let trigger = 'passive';
      if (d.includes('部署后') || d.includes('部署经过') || d.includes('部署时')) trigger = 'deploy';
      else if (d.includes('攻击时') || d.includes('每次攻击') || d.includes('普通攻击') || d.includes('攻击造成') || d.includes('攻击会使') || d.includes('攻击命中')) trigger = 'attack';
      for (const eff of t.effects) { eff.trigger = trigger; if (trigger === 'attack' && bb.prob != null) eff.prob = bb.prob; }
      if (t.effects.length) withEffect++; else noEffect++;
    }
  }
}
fs.writeFileSync(TALENT, JSON.stringify(talent, null, 2));
console.log('wrote', TALENT, '| total:', total, '| withEffect:', withEffect, '| noEffect:', noEffect);
