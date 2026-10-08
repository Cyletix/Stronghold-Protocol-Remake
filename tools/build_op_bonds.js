'use strict';
// 生成 web/op_bonds.json：把「官方逐干员盟约归属 + 特质(garrison)」从 activity_table 关联到 charId。
// 桥：charShopChessDatas[chessId].charId —— 这是官方 chessId→charId 权威映射，无需 wiki 名单。
// 输出：charId → { name, seasonBond, regBonds, powerIds, garrison:[{eventType,effectType,desc,blackboard}] }
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');
const SRC = path.join(__dirname, '..', 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json');
const act = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const c = act.activity.AUTOCHESS_SEASON.act2autochess;
const topBonds = act.autoChessData.bondInfoDict || {};
const bondType = bid => (topBonds[bid] && topBonds[bid].bondType) || (c.bondInfoDict[bid] && c.bondInfoDict[bid].bondType) || 'REGULAR';
const nameByChar = {};
for (const o of JSON.parse(fs.readFileSync(path.join(WEB, 'battle_data.json'), 'utf8')).operators || []) nameByChar[o.charId] = o.name;
for (const o of JSON.parse(fs.readFileSync(path.join(WEB, 'mode_data.json'), 'utf8')).operators || []) if (!nameByChar[o.charId]) nameByChar[o.charId] = o.name;

const garrison = c.garrisonDataDict || {};
const out = {};
const seen = new Set();
for (const [chessId, ch] of Object.entries(c.charShopChessDatas || {})) {
  const charId = ch.charId || ch.backupCharId;
  if (!charId || seen.has(charId)) continue;   // 去重（_a/_b 同一干员）
  seen.add(charId);
  const detail = (c.charChessDataDict && c.charChessDataDict[chessId]) || {};
  const bonds = (detail.bondIds || []);
  const seasonBond = bonds.find(bid => bondType(bid) === 'SEASON') || null;
  const regBonds = bonds.filter(bid => bondType(bid) !== 'SEASON');
  const gar = (detail.garrisonIds || []).map(gid => {
    const g = garrison[gid] || {};
    const bb = (g.blackboard || []);
    const bondIds = [...new Set(bb.filter(b => b.key === 'bond_id' && b.valueStr).map(b => b.valueStr))];
    const divide = bb.find(b => b.key === 'divide_num' && typeof b.value === 'number');
    return {
      id: gid, eventType: g.eventType || '', kind: g.effectType || '',
      desc: (g.garrisonDesc || g.description || ''),
      blackboard: bb,
      rule: { kind: (g.effectType || ''), eventType: (g.eventType || ''), bondIds, perDivide: divide ? divide.value : null },
    };
  });
  out[charId] = { name: nameByChar[charId] || '', seasonBond, regBonds, garrison: gar };
}
fs.writeFileSync(path.join(WEB, 'op_bonds.json'), JSON.stringify(out, null, 1), 'utf8');
const withBond = Object.values(out).filter(o => o.seasonBond || o.regBonds.length).length;
const withGar = Object.values(out).filter(o => o.garrison.length).length;
console.log('op_bonds.json:', Object.keys(out).length, '干员 | 有盟约归属:', withBond, '| 有特质:', withGar);
// 抽样
const sample = Object.values(out).find(o => o.name === '阿米娅') || Object.values(out)[0];
console.log('样例:', JSON.stringify(sample, null, 1).slice(0, 500));
