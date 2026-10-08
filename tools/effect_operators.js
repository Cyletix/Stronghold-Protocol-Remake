'use strict';
// 效果算子分类（共享模块）：把技能/天赋的 desc + blackboard 拆成「效果算子」列表
// 每个算子 = 原子效果 { type, power }，引擎依次执行，综合成最终效果。
// 技能 classify_skills.js 与天赋 classify_talents.js 共用此模块。

// 元素类型：从 desc 的 <$ba.dt.xxx> 标记或中文关键词解析
function epTypeFromDesc(d) {
  if (/dt\.neural|神经/.test(d)) return 'nervous';
  if (/dt\.erosion|侵蚀/.test(d)) return 'erosion';
  if (/dt\.burning|灼燃|灼烧/.test(d)) return 'burn';
  if (/dt\.apoptosis|凋亡/.test(d)) return 'apoptosis';
  if (/dt\.rampage|狂躁/.test(d)) return 'rampage';
  return 'element';
}

// 按 blackboard 键（结构化）逐键识别，desc 关键词兜底；值区分 flat（固定值）与百分比
function classifyOperators(desc, bb) {
  const d = desc || '', keys = Object.keys(bb || {});
  const has = k => keys.includes(k);
  const hasN = p => keys.some(x => x.startsWith(p));
  const g = k => (bb && bb[k] != null) ? bb[k] : null;
  const ops = [];
  const push = (type, power, extra) => { if (power != null) ops.push(Object.assign({ type, power }, extra || {})); };
  const dur = g('duration');   // 通用持续时间（天赋 buff）
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
  // 伤害（含 damage_by_atk_scale）
  if (has('atk_scale') || has('damage') || has('damage_by_atk_scale') || hasN('attack@times') || hasN('attack@poison') || hasN('attack@damage')) {
    const scale = g('atk_scale') != null ? g('atk_scale') : (g('damage_by_atk_scale') != null ? g('damage_by_atk_scale') : (g('damage') != null ? g('damage') : 1.5));
    push((d.includes('范围内') || d.includes('所有')) ? 'aoe_damage' : 'burst_damage', scale);
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
  // 通用 flat value（天赋：恢复X生命 / 防御+X / 攻击+X / 生命+X，固定数值）
  if (has('value') && !ops.length) {
    const v = g('value');
    if (d.includes('恢复') || d.includes('回复') || d.includes('治疗')) push('heal', v, { flat: true });
    else if (d.includes('防御')) push('buff_def', v, { flat: true });
    else if (d.includes('攻击')) push('buff_atk', v, { flat: true });
    else if (d.includes('生命')) push('buff_maxhp', v, { flat: true });
  }
  // desc 兜底（无 blackboard 信号时）
  if (!ops.length) {
    if (d.includes('治疗') || d.includes('回复') || d.includes('恢复')) push((d.includes('自身') || d.includes('自己') || d.includes('最大生命')) ? 'heal_self' : 'heal', 0.3);
    else if (d.includes('攻击力') && d.includes('攻击速度')) { push('buff_atk', 0.05); push('buff_atkspd', 0.1); }
    else if (d.includes('攻击力')) push('buff_atk', 0.1);
    else if (d.includes('防御力')) push('buff_def', 0.1);
    else if (d.includes('攻击速度') || d.includes('攻速')) push('buff_atkspd', 0.1);
    else if (d.includes('伤害')) push((d.includes('范围内') || d.includes('所有')) ? 'aoe_damage' : 'burst_damage', 1.5);
  }
  // duration 附加到 buff/heal 类算子（天赋的持续时间）
  if (dur != null) for (const e of ops) if (e.type.startsWith('buff') || e.type === 'heal' || e.type === 'heal_self') e.duration = dur;
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

module.exports = { classifyOperators, normalizePower, epTypeFromDesc };
