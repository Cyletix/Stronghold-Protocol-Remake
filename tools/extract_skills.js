'use strict';
// 干员技能提取：battle_data operators × mode_rules 指定技能索引 × skill_table 的普通Lv4/精锐Lv7。
// 输出 web/skill_data.json；后续必须运行 classify_skills.js 恢复 effects 分类和 skill_patch 补丁。
// desc 中 {key} 占位符按 blackboard 值替换（不可用则保留原样）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const JSONDIR = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel');
const battle = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'battle_data.json'), 'utf8'));
const charTable = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'character_table.json'), 'utf8'));
const skillTable = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'skill_table.json'), 'utf8'));
const ranges = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'range_table.json'), 'utf8'));
const OUT = path.join(ROOT, 'web', 'skill_data.json');

// 数值格式化：整数不带小数；百分比带 %（desc 里已有 % 则不加）
function fmtNum(v) {
  if (v == null) return '';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
// 把 desc 里的 {key} / {key:默认值} 替换成 blackboard 值（默认值带 % 表示百分比：值×100 加 %）。desc 富文本标记保留（渲染层 richText 处理）。
function fillDesc(desc, blackboard) {
  const bb = {};
  for (const b of (blackboard || [])) bb[b.key] = b.value;
  return String(desc || '').replace(/\{([a-zA-Z0-9_@]+)(?::([^}]*))?\}/g, function(m, key, def) {
    if (key in bb) {
      const v = Number(bb[key]);
      if (!isFinite(v)) return String(bb[key]);
      if (def != null && def.indexOf('%') >= 0) return fmtNum(v * 100) + '%';   // 百分比占位：值×100
      return fmtNum(v);
    }
    if (def != null && def !== '') return def;   // 无对应值：用默认值兜底
    return m;
  });
}

// 卫戍协议「固定养成」技能选择：defaultSkillIndex（mode_rules.json，act2 优先）→ 取对应技能；普通=技能4、精锐=技能7。
const modeRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_rules.json'), 'utf8'));
const skillIdx = {};
for (const sk of ['act2autochess', 'act1autochess']) {
  const season = (modeRules.seasons || {})[sk];
  const ops = season && season.operators;
  const arr = Array.isArray(ops) ? ops : Object.values(ops || {});
  for (const c of arr) { if (c && c.charId && skillIdx[c.charId] == null) skillIdx[c.charId] = c.defaultSkillIndex || 0; }
}

function extractLevel(sk, lvIdx) {
  if (!sk || !sk.levels || !sk.levels[lvIdx]) return null;
  const lv = sk.levels[lvIdx];
  const bb = lv.blackboard || [];
  const spData = lv.spData || {};
  return {
    name: lv.name || '',
    desc: fillDesc(lv.description, bb),
    rangeId: lv.rangeId || null,
    rangeGrids: lv.rangeId ? (ranges[lv.rangeId]?.grids || null) : null,
    spType: spData.spType,
    spIncrement: spData.increment,
    skillType: lv.skillType,
    durationType: lv.durationType,
    spCost: spData.spCost != null ? spData.spCost : null,
    initSp: spData.initSp != null ? spData.initSp : 0,
    maxCharge: spData.maxChargeTime != null ? spData.maxChargeTime : 1,
    duration: lv.duration != null ? lv.duration : 0,
    blackboard: bb.reduce((o, b) => { o[b.key] = b.value; return o; }, {}),
    prefabId: lv.prefabId || null,
  };
}

if (require.main === module) {
const out = {};
let noSkill = 0, used = 0;
for (const op of (battle.operators || [])) {
  const ch = charTable[op.charId];
  if (!ch || !ch.skills || !ch.skills.length) { noSkill++; continue; }
  const idx = Math.min(skillIdx[op.charId] || 0, ch.skills.length - 1);
  const sid = ch.skills[idx].skillId;
  if (!sid || !skillTable[sid]) { noSkill++; continue; }
  const sk = skillTable[sid];
  const normal = extractLevel(sk, 3);   // 普通=技能4（固定养成）
  const elite = extractLevel(sk, 6);    // 精锐=技能7（固定养成）
  if (!normal && !elite) { noSkill++; continue; }
  const lv = (elite && sk.levels[6]) || (normal && sk.levels[3]) || sk.levels[0];
  const bb = lv.blackboard || [];
  out[op.charId] = {
    name: lv.name || '',
    desc: fillDesc(lv.description, bb),
    rangeId: lv.rangeId || null,
    type: lv.skillType || 'AUTO',
    durationType: lv.durationType || 'NONE',
    skillId: sid,
    normal: normal,
    elite: elite,
  };
  used++;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT, 'withSkill:', used, 'noSkill:', noSkill, 'total:', battle.operators.length);
// 样例
for (const cid of ['char_123_fang', 'char_376_therex', 'char_285_medic2']) {
  if (out[cid]) console.log(' ', cid, '=>', out[cid].name, '|', out[cid].desc.slice(0, 30) + '...', '| sp=' + ((out[cid].elite||{}).spCost));
  else console.log(' ', cid, '=> (无技能)');
}

}
module.exports={extractLevel};
