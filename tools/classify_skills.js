'use strict';
// 技能效果分类（算子组合版）：把每个技能拆成「效果算子」列表 effects:[{type,power},...]
// 每个算子是一个原子效果（治疗/增益/伤害/减速/闪避/扩范围/回费…），引擎依次执行，综合成最终效果。
// 数据源：data/ArknightsGameData（严格 Kengxxiao gamedata，与 extract_skills.js 同源；勿用 ArknightsStoryParse 的旧整理数据）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const JSONDIR = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel');
const SKILL = path.join(ROOT, 'web', 'skill_data.json');

const skill = JSON.parse(fs.readFileSync(SKILL, 'utf8'));
const charTable = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'character_table.json'), 'utf8'));
const skillTable = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'skill_table.json'), 'utf8'));
const PATCH = JSON.parse(fs.readFileSync(path.join(__dirname, 'skill_patch.json'), 'utf8'));   // 手工补丁表（覆盖启发式）

// 通用技能（skcom_*）→ 算子列表（key=blackboard 参数键，power 由 normalizePower 解析）
const SKCOM = {
  'skcom_atk_up':           [{ type: 'buff_atk',    key: 'atk' }],
  'skcom_quickattack':      [{ type: 'buff_atk',    key: 'atk' }, { type: 'buff_atkspd', key: 'attack_speed' }],
  'skcom_attack_speed_up':  [{ type: 'buff_atkspd', key: 'attack_speed' }],
  'skcom_def_up':           [{ type: 'buff_def',    key: 'def' }],
  'skcom_heal_up':          [{ type: 'buff_atk',    key: 'atk' }],   // 治疗干员：攻击力↑ = 治疗↑
  'skcom_heal_self':        [{ type: 'heal_self',   key: 'heal_scale' }],
  'skcom_charge_cost':      [{ type: 'dp_gain',     key: 'cost' }],
};

// 把技能拆成多个效果算子：按 blackboard 键（结构化）逐键识别，desc 关键词兜底
function classifyOperators(desc, bb) {
  const d = desc || '', keys = Object.keys(bb || {});
  const has = k => keys.includes(k);
  const hasN = p => keys.some(x => x.startsWith(p));
  const g = k => (bb && bb[k] != null) ? bb[k] : null;
  const ops = [];
  const push = (type, power, extra) => { if (power != null) ops.push(Object.assign({ type, power }, extra || {})); };
  // 元素类型：从 desc 的 <$ba.dt.xxx> 标记或中文关键词解析
  const epTypeFromDesc = (dd) => {
    if (/dt\.neural|神经/.test(dd)) return 'nervous';
    if (/dt\.erosion|侵蚀/.test(dd)) return 'erosion';
    if (/dt\.burning|灼燃|灼烧/.test(dd)) return 'burn';
    if (/dt\.apoptosis|凋亡/.test(dd)) return 'apoptosis';
    if (/dt\.rampage|狂躁/.test(dd)) return 'rampage';
    return 'element';
  };
  // 治疗
  if (has('heal_scale')) push((d.includes('自身') || d.includes('自己')) ? 'heal_self' : 'heal', g('heal_scale'));
  // 持续回血（每秒恢复）
  if (hasN('hp_recovery') || d.includes('每秒恢复') || d.includes('每秒回复')) push('heal_self', 0.03);
  // 部署费用
  if (has('cost') && d.includes('部署费用')) push('dp_gain', g('cost'));
  // 生命上限 / 防御 / 法抗（负值=敌方减益，近似为破甲 debuff_def）
  if (has('max_hp')) { const v = g('max_hp'); push(v < 0 ? 'debuff_def' : 'buff_maxhp', Math.abs(v)); }
  if (has('def')) { const v = g('def'); push(v < 0 ? 'debuff_def' : 'buff_def', Math.abs(v)); }
  if (has('magic_resistance')) push('buff_def', 0.1);   // 法抗无对应机制，近似防御
  // 伤害
  if (has('atk_scale') || has('damage') || hasN('attack@times') || hasN('attack@poison') || hasN('attack@damage')) {
    push((d.includes('范围内') || d.includes('所有')) ? 'aoe_damage' : 'burst_damage', g('atk_scale') != null ? g('atk_scale') : (g('damage') != null ? g('damage') : 1.5));
  }
  // 元素损伤：攻击附带元素损伤累积（按攻击力比例，累积满则爆发元素异常）
  const epRatio = g('ep_damage_ratio') != null ? g('ep_damage_ratio')
    : (g('attack@ep_damage_ratio') != null ? g('attack@ep_damage_ratio')
    : (g('ep_damage_scale') != null ? g('ep_damage_scale')
    : (g('element_atk_scale') != null ? g('element_atk_scale')
    : g('attack@extra_ep_damage_scale'))));
  if (epRatio != null) push('ep_damage', epRatio, { epType: epTypeFromDesc(d) });
  // 攻速（负值=敌方减益）
  if (has('attack_speed')) { const v = g('attack_speed'); push(v < 0 ? 'debuff_def' : 'buff_atkspd', Math.abs(v) / 100); }
  if (has('base_attack_time')) push('buff_atkspd', 0.1);
  // 攻击力（负值=敌方减益）
  if (has('atk')) { const v = g('atk'); push(v < 0 ? 'debuff_def' : 'buff_atk', Math.abs(v)); }
  // 减速/控制（停顿/晕眩/沉睡/冰冻/减速）
  if (hasN('move_speed') || has('sluggish') || has('stun') || has('frozen') || has('sleep') || d.includes('停顿') || d.includes('晕眩') || d.includes('沉睡')) push('slow', 0.4);
  // 闪避
  if (has('prob') && (d.includes('闪避') || d.includes('闪躲'))) push('dodge', g('prob') != null ? g('prob') : 0.3);
  // 扩范围
  if (hasN('ability_range') || d.includes('攻击范围')) push('buff_range', 1);
  // desc 兜底（无 blackboard 信号时）
  if (!ops.length) {
    if (d.includes('治疗') || d.includes('回复') || d.includes('恢复')) push((d.includes('自身') || d.includes('自己') || d.includes('最大生命')) ? 'heal_self' : 'heal', 0.3);
    else if (d.includes('攻击力') && d.includes('攻击速度')) { push('buff_atk', 0.05); push('buff_atkspd', 0.1); }
    else if (d.includes('攻击力')) push('buff_atk', 0.1);
    else if (d.includes('防御力')) push('buff_def', 0.1);
    else if (d.includes('攻击速度') || d.includes('攻速')) push('buff_atkspd', 0.1);
    else if (d.includes('伤害')) push((d.includes('范围内') || d.includes('所有')) ? 'aoe_damage' : 'burst_damage', 1.5);
  }
  return ops;
}

// 归一化算子 power（SKCOM 的 key 解析 + 各类单位换算）
function normalizePower(type, key, bb) {
  const g = k => (bb && bb[k] != null) ? bb[k] : null;
  switch (type) {
    case 'buff_atkspd': return key === 'attack_speed' ? (g(key) != null ? g(key) / 100 : 0.1) : 0.1;
    case 'buff_atk': case 'buff_def': return g(key) != null ? g(key) : 0.1;
    case 'buff_maxhp': return g(key) != null ? g(key) : 0.15;
    case 'heal_self': return g(key) != null ? g(key) : 0.2;
    case 'heal': return g(key) != null ? g(key) : 0.3;
    case 'dp_gain': return g(key) != null ? g(key) : 5;
    case 'aoe_damage': case 'burst_damage': return g(key) != null ? g(key) : 1.5;
    case 'ep_damage': return g(key) != null ? g(key) : 0.1;
    default: return 1;
  }
}

// 卫戍协议「固定养成」技能选择：defaultSkillIndex → 取对应技能；普通=技能4、精锐=技能7（与 extract_skills.js 同源）。
const modeRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_rules.json'), 'utf8'));
const skillIdx = {};
for (const sk of ['act2autochess', 'act1autochess']) {
  const season = (modeRules.seasons || {})[sk];
  const ops = season && season.operators;
  const arr = Array.isArray(ops) ? ops : Object.values(ops || {});
  for (const c of arr) { if (c && c.charId && skillIdx[c.charId] == null) skillIdx[c.charId] = c.defaultSkillIndex || 0; }
}

function computeEffects(cid, sk, lvIdx, patch) {
  const lv = (sk && sk.levels && sk.levels[lvIdx]) ? sk.levels[lvIdx] : null;
  if (!lv) return null;
  const prefabId = lv.prefabId || null;
  const bb = (lv.blackboard || []).reduce((o, b) => { o[b.key] = b.value; return o; }, {});
  let effects = [];
  if (patch) {
    effects = (patch.effects || []).map(e => ({ type: e.type, power: e.power }));
    if (!effects.length && patch.effectType) effects = [{ type: patch.effectType, power: patch.effectPower }];   // 兼容旧单效果补丁
  } else if (SKCOM[prefabId]) {
    effects = SKCOM[prefabId].map(o => ({ type: o.type, power: normalizePower(o.type, o.key, bb) }));
  } else {
    effects = classifyOperators(lv.description, bb);
  }
  return { prefabId, isPassive: (lv.skillType === 'PASSIVE'), effects };
}

if (require.main === module) {
let mapped = 0, unmapped = 0, noSkill = 0;
for (const cid of Object.keys(skill)) {
  const ch = charTable[cid];
  const idx = (ch && ch.skills && ch.skills.length) ? Math.min(skillIdx[cid] || 0, ch.skills.length - 1) : 0;
  const sid = (ch && ch.skills && ch.skills[idx]) ? ch.skills[idx].skillId : null;
  const sk = (sid && skillTable[sid]) ? skillTable[sid] : null;
  const patch = PATCH[cid];
  let any = false;
  for (const [variant, lvIdx] of [['normal', 3], ['elite', 6]]) {
    if (!skill[cid][variant]) continue;
    const res = computeEffects(cid, sk, lvIdx, patch);
    if (res) { skill[cid][variant].prefabId = res.prefabId; skill[cid][variant].isPassive = res.isPassive; skill[cid][variant].effects = res.effects; any = true; if (res.effects.length) mapped++; else unmapped++; }
    else skill[cid][variant].effects = [];
  }
  if (!any) noSkill++;
}
fs.writeFileSync(SKILL, JSON.stringify(skill, null, 2));
console.log('wrote', SKILL, '| mapped:', mapped, '| unmapped:', unmapped, '| noSkill:', noSkill);

}
module.exports={computeEffects};
