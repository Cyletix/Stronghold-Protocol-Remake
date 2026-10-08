'use strict';
// 从官方解包 activity_table.json 提取「卫戍协议：盟约」盟约 + 干员chess归属（权威数据），生成 web/bond_data.json
// 覆盖：bondInfoDict（desc 效果 + activeCount 激活人数阈值）、charChessDataDict（每干员 bondIds/garrisonIds/status）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json');
const OUT = path.join(ROOT, 'web', 'bond_data.json');

const act = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const c = (act.activity && act.activity.AUTOCHESS_SEASON && act.activity.AUTOCHESS_SEASON.act2autochess) || {};
if (!c || !c.bondInfoDict) { console.error('未找到 act2autochess.bondInfoDict'); process.exit(1); }
// 顶层 bondInfoDict 提供 order/isPower/powerIdList/icon（per-activity 版本没有这些字段）
const topBonds = (((act.autoChessData || {}).bondInfoDict) || {});
const strip = s => String(s || '')
  .replace(/<\/?@ba\.vup>/g, '').replace(/<\/?@ba\.acrem>/g, '')
  .replace(/<@autochess\.\w+>/g, '').replace(/<\/>/g, '')
  .replace(/<\/?@[^>]*>/g, '').trim();

// —— 盟约（权威 desc 效果 + activeCount 激活人数；order/isPower/powerIdList 取自顶层）——
const bonds = Object.values(c.bondInfoDict).map(b => {
  const top = topBonds[b.bondId] || {};
  return {
    bondId: b.bondId,
    name: b.name,
    type: b.bondType || top.bondType,   // SEASON 势力 / REGULAR 通用
    order: top.bondOrder != null ? top.bondOrder : 0,
    isPower: !!top.isPower,
    activeCount: b.activeCount != null ? b.activeCount : (b.bondType === 'SEASON' ? 3 : 2), // 官方未给时按通用规则兜底
    activeCondition: b.activeCondition || '',
    powerIdList: (top.powerIdList || []),
    desc: strip(b.desc || b.name),
  };
});

// —— 干员chess归属（权威 bondIds + garrison 特质，未做名字 join，仅存原始 chessId）——
const garrison = c.garrisonDataDict || {};
const opers = Object.values(c.charChessDataDict || {}).map(ch => ({
  chessId: ch.chessId,
  status: ch.status ? { phase: ch.status.evolvePhase, level: ch.status.charLevel, skill: ch.status.skillLevel } : null,
  bonds: ch.bondIds || [],
  garrison: (ch.garrisonIds || []).map(gid => ({ id: gid, desc: (garrison[gid] && (garrison[gid].garrisonDesc || garrison[gid].description || '')) || '' })),
}));

const out = { source: 'activity_table.json:act2autochess', bonds, opers };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
console.log('bonds:', bonds.length, 'opers:', opers.length, '->', OUT);

// 快速自检：bondId 唯一
const ids = new Set(bonds.map(b => b.bondId));
if (ids.size !== bonds.length) { console.error('bonds bondId 冲突'); process.exit(1); }
