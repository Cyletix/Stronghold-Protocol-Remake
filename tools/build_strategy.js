'use strict';
// 提取卫戍协议「策略(band)效果」机制，生成 web/band_effects.json（供 U-STRATEGY 逐条复现）。
// 来源：activity_table.json act2autochess.bandDataListDict（effectId/totalHp/bandDesc）× autoChessData.bandDataDict（bandName）× act2autochess.effectBuffInfoDataDict（机制 key+blackboard）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SRC = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel', 'activity_table.json');
const act = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const c = (act.activity && act.activity.AUTOCHESS_SEASON && act.activity.AUTOCHESS_SEASON.act2autochess) || {};
const list = (c.bandDataListDict || {});
const names = ((act.autoChessData || {}).bandDataDict || {});
const buff = (c.effectBuffInfoDataDict || {});

const out = [];
for (const k in list) {
  const b = list[k];
  const mechs = (buff[b.effectId] || []);
  const arr = Array.isArray(mechs) ? mechs : [mechs];
  const keys = [...new Set(arr.map(e => e.key).filter(Boolean))];
  out.push({
    bandId: b.bandId,
    name: (names[b.bandId] || {}).bandName || b.bandId,
    sortId: b.sortId,
    hp: b.totalHp,
    effectId: b.effectId,
    desc: b.bandDesc || '',
    keys,
    mechs: arr.map(e => ({ key: e.key, bb: (e.blackboard || []).map(x => ({ k: x.key, v: (x.valueStr != null ? x.valueStr : x.value) })) })),
  });
}
out.sort((a, b) => (a.sortId || 0) - (b.sortId || 0));
fs.writeFileSync(path.join(WEB, 'band_effects.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('band_effects.json', out.length, '条策略；effect key 种类', new Set(out.flatMap(o => o.keys)).size);
