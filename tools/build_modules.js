'use strict';
// 模组（uniequip）属性加成提取：卫戍协议「固定养成」精锐带模组（normal.equipLevel=0、elite.equipLevel=1/2/3）。
// 数据源：mode_rules.json（defaultUniEquipId + equipLevel）× battle_equip_table.json（phases[].attributeBlackboard）× uniequip_table.json（名称）。
// 输出 web/module_data.json：{ charId: { uniEquipId, name, normal:{hp,atk,def,aspd,magicRes}, elite:{...} } }
// attributeBlackboard 语义：max_hp/atk/def/magic_resistance 为扁平加法；attack_speed 为百分比攻速（+N ≈ 攻速 ×(1+N/100)）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const JSONDIR = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata', 'excel');
const OUT = path.join(ROOT, 'web', 'module_data.json');

const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'mode_rules.json'), 'utf8'));
const battleEquip = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'battle_equip_table.json'), 'utf8'));
const uniequipTable = JSON.parse(fs.readFileSync(path.join(JSONDIR, 'uniequip_table.json'), 'utf8'));

// charId → { defaultUniEquipId, normalEquipLevel, eliteEquipLevel }（act2 优先，回退 act1）
const chess = {};
for (const sk of ['act2autochess', 'act1autochess']) {
  const season = (rules.seasons || {})[sk];
  const ops = season && season.operators;
  const arr = Array.isArray(ops) ? ops : Object.values(ops || {});
  for (const c of arr) {
    if (c && c.charId && !chess[c.charId]) chess[c.charId] = c;
  }
}

// phases[].attributeBlackboard → 各属性加成（扁平 + 攻速百分比）
function attrOf(uniEquipId, equipLevel) {
  const e = (uniEquipId && battleEquip[uniEquipId]) || null;
  const phases = e && e.phases;
  const phase = (phases && phases[equipLevel - 1]) || null;
  const bb = (phase && phase.attributeBlackboard) || [];
  const out = { hp: 0, atk: 0, def: 0, aspd: 0, magicRes: 0 };
  for (const a of bb) {
    const v = Number(a.value) || 0;
    if (a.key === 'max_hp') out.hp += v;
    else if (a.key === 'atk') out.atk += v;
    else if (a.key === 'def') out.def += v;
    else if (a.key === 'attack_speed') out.aspd += v / 100;
    else if (a.key === 'magic_resistance') out.magicRes += v;
  }
  return out;
}

const out = {};
let withModule = 0, noModule = 0;
for (const charId of Object.keys(chess)) {
  const c = chess[charId];
  const uni = c.defaultUniEquipId;
  if (!uni) { noModule++; continue; }
  const eqNormal = (c.normal && c.normal.equipLevel) || 0;
  const eqElite = (c.elite && c.elite.equipLevel) || 0;
  const name = (uniequipTable.equipDict && uniequipTable.equipDict[uni] && uniequipTable.equipDict[uni].uniEquipName) || '';
  out[charId] = {
    uniEquipId: uni,
    name,
    normal: attrOf(uni, eqNormal),
    elite: attrOf(uni, eqElite),
  };
  withModule++;
}
// Runtime mode entries use the exact season/chess slot. Top-level aliases remain
// for the out-of-mode library and older data consumers, never mode selection.
out.bySeason={};
for(const [sid,season] of Object.entries(rules.seasons)){
  out.bySeason[sid]={};
  for(const [chessId,c] of Object.entries(season.operators)){
    const uni=c.defaultUniEquipId;if(!uni)continue;
    out.bySeason[sid][chessId]={uniEquipId:uni,name:uniequipTable.equipDict[uni]?.uniEquipName||'',
      normal:attrOf(uni,c.normal.equipLevel),elite:attrOf(uni,c.elite.equipLevel)};
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT, '| withModule:', withModule, '| noModule:', noModule);
