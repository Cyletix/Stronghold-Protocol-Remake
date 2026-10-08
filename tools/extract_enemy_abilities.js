'use strict';
// 提取敌人技能/天赋：从 enemy_database 提取 skills + talentBlackboard，分类为敌人效果算子，写入 battle_data.json 的敌人
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GD = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata');
const bd = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'battle_data.json'), 'utf8'));
const ed = JSON.parse(fs.readFileSync(path.join(GD, 'levels', 'enemydata', 'enemy_database.json'), 'utf8'));

const unwrap = v => (v && v.m_defined) ? v.m_value : (typeof v === 'number' ? v : 0);

// 敌人天赋 blackboard 键 → 敌人效果算子（只映射可接引擎的：护盾/复活/攻防/移速；其余行为模式暂缓）
function classifyTalentKey(key, value) {
  const k = String(key).toLowerCase();
  if (k.includes('damage_resistance') || k.includes('shield')) return { type: 'shield', power: value };   // 伤害减免比例
  if (k.includes('reborn')) return { type: 'revive', power: 1 };                                          // 复活一次
  if (k.includes('atkup') || k.includes('atk_up')) return { type: 'buff_atk', power: value };
  if (k.includes('defup') || k.includes('def_up')) return { type: 'buff_def', power: value };
  if (k.includes('move_speed') && !k.includes('duration') && !k.includes('interval')) return { type: 'speed_up', power: value };
  if (k.includes('epdamage') && (k.includes('ep_damage_ratio') || k.includes('attack@ep_damage_ratio'))) return { type: 'ep_attack', power: value };   // 敌人元素损伤（攻击附带）
  return null;
}

// 敌人主动技能 prefabKey → 技能类型（只映射可接引擎的：强化攻击/晕眩/加速；召唤/变身等行为暂缓）
function classifyEnemySkill(prefabKey) {
  const k = String(prefabKey || '').toLowerCase();
  if (/bigattack|powerattack|multiattack|crossattack|chargeattack|steal|splash|slapshot|fire|boom/.test(k)) return 'strong_attack';
  if (/stun|cold|shine|freeze|frozen|sleep/.test(k)) return 'stun';
  if (/startrun|rush|fly|takeoff|speed/.test(k) || k === 'charge') return 'speed_up';
  if (/invisible/.test(k)) return 'invisible';
  if (/bornbugs|bornanim|summon|produce|spawn/.test(k)) return 'summon';
  if (/blink/.test(k)) return 'teleport';
  return null;
}

let withTalent = 0, withSkill = 0, talentCount = 0;
for (const e of (ed.enemies || [])) {
  const key = e.Key;
  const ed0 = (e.Value && e.Value[0]) ? e.Value[0].enemyData : null;
  if (!key || !bd.enemies[key] || !ed0) continue;
  // 天赋（被动）→ 效果算子
  const talents = [];
  for (const b of (ed0.talentBlackboard || [])) {
    const m = classifyTalentKey(b.key, unwrap(b.value));
    if (m) talents.push(m);
  }
  // deathrattle：死亡触发召唤（enemy_key 在 valueStr，cnt=数量）
  const drEnemy = (ed0.talentBlackboard || []).find(b => String(b.key).toLowerCase().includes('deathrattle.enemy_key'));
  if (drEnemy && drEnemy.valueStr) {
    const drCnt = (ed0.talentBlackboard || []).find(b => String(b.key).toLowerCase().includes('deathrattle.cnt'));
    talents.push({ type: 'deathrattle', enemyKey: drEnemy.valueStr, cnt: drCnt ? (unwrap(drCnt.value) || 1) : 1 });
  }
  if (talents.length) { bd.enemies[key].talents = talents; withTalent++; talentCount += talents.length; }
  // 技能（主动）→ 分类为敌人技能类型
  if (ed0.skills && ed0.skills.length) {
    bd.enemies[key].skills = ed0.skills.map(s => {
      const bb = (s.blackboard || []).reduce((o, b) => { o[b.key] = unwrap(b.value); return o; }, {});
      return { prefabKey: s.prefabKey, cooldown: unwrap(s.cooldown), spCost: unwrap(s.spCost), blackboard: bb, skillType: classifyEnemySkill(s.prefabKey) };
    }).filter(s => s.skillType);
    if (bd.enemies[key].skills.length) withSkill++;
  }
}
fs.writeFileSync(path.join(ROOT, 'web', 'battle_data.json'), JSON.stringify(bd, null, 2));
console.log('wrote battle_data.json | 有天赋敌人:', withTalent, '| 天赋算子数:', talentCount, '| 有技能敌人:', withSkill);
