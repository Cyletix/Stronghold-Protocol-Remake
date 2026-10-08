'use strict';
// 抽取卫戍协议「装备/特殊装备」语义：effectInfoDataDict(名称/描述) × effectBuffInfoDataDict(机制)
// 产出 web/equips.json：{id,name,desc,tier,kind,key,mods,mechanics}
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const ac = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json'), 'utf8'));
const c = ac.activity.AUTOCHESS_SEASON.act2autochess;
const info = c.effectInfoDataDict || {};
const buff = c.effectBuffInfoDataDict || {};

function tierOf(id) { if (/acgarm/.test(id)) return 'golden'; if (/acarm/.test(id)) return 'normal'; return 'other'; }
function bbArr(e) { const o = []; for (const b of (e.blackboard || [])) o.push((b.valueStr != null ? b.valueStr : b.value)); return o; }
function statKeyOf(bb) {
  // 从 env_gbuff 黑板上解析成 {atk,hp,def,aspd,...};  百分比(0..1)=乘区 1+v，其余保留原值
  const m = {}; const raw = {};
  for (const b of (bb || [])) {
    const k = b.key, v = b.value;
    if (typeof v !== 'number') continue;
    if (k === 'atk' || k === 'def') { if (v > -1 && v < 1) m[k] = (m[k] || 1) * (1 + v); else raw[k] = v; }
    else if (k === 'max_hp' || k === 'init_max_hp' || k === 'ex_max_hp') { if (v > -1 && v < 1) m.hp = (m.hp || 1) * (1 + v); else raw[k] = v; }
    else if (k === 'attack_speed') m.aspd = v;       // 攻速（正=更快，游戏为扁平值）
    else raw[k] = v;
  }
  return { mods: m, raw };
}

const out = [];
const buffInfo = (id) => (buff[id] || []).map(e => ({ key: e.key, countType: e.countType || '', blackboard: (e.blackboard || []).map(b => ({ key: b.key, value: (b.valueStr != null ? b.valueStr : b.value) })) }));
for (const id in info) {
  const e = info[id];
  if (e.effectType !== 'EQUIP') continue;
  const mechs = buffInfo(id);
  const kinds = mechs.map(m => m.key);
  // These two IDs share the verified ON_SKILL_START graph. Its atk blackboard
  // is a per-activation increment, not an always-on equipment modifier.
  const skillStackReactive=['eff_acarm040','eff_acgarm040'].includes(id);
  if(skillStackReactive){assert.equal(mechs.length,1);assert.equal(mechs[0].key,'env_gbuff_new_with_verify');assert.equal(mechs[0].blackboard.find(b=>b.key==='key')?.value,'act1vautochess_equip_acarm024_global_buff');}
  const kind = skillStackReactive ? 'reactive' : /^use_equip|^equip_destory|^sell_char|^char_chess_transform|^equip_round_start/.test(kinds.join(',')) ? 'use'
    : /env_gbuff/.test(kinds.join(',')) ? 'stat'
    : (kinds.length ? 'misc' : 'none');
  let mods = null;
  const gb = (mechs.find(m => /env_gbuff/.test(m.key)) || {}).blackboard || [];
  if (kind === 'stat') { const p = statKeyOf(gb); mods = p.mods; }
  const o = { id, name: e.effectName || id, desc: e.effectDesc || '', tier: tierOf(id), kind };
  if (kind === 'stat' || skillStackReactive) o.key = (gb.find(b => b.key === 'key') || {}).value || null;
  if (mods && Object.keys(mods).length) o.mods = mods;
  o.raw = statKeyOf(gb).raw;
  o.mechanics = mechs;
  out.push(o);
}
out.sort((x, y) => x.id.localeCompare(y.id));
function writeArtifact(name, text) {
  const file=path.join(ROOT,'web',name);
  if(process.argv.includes('--check')) {
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)throw Error('STALE '+name+'; run node tools/build_equip_data.js');
  } else fs.writeFileSync(file,text,'utf8');
}
writeArtifact('equips.json', JSON.stringify(out, null, 1));
// Keep market identity separate from effect identity and equipment mechanics.
// A row is source eligibility/price data, not proof its effect is executable.
const source='data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json';
const shopItems={schemaVersion:1,source,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,source))).digest('hex'),seasons:{}};
for(const [sid,season]of Object.entries(ac.activity.AUTOCHESS_SEASON)) {
  shopItems.seasons[sid]=Object.values(season.trapShopChessDatas).map(row=>{
    const chess=season.trapChessDataDict[row.itemId];
    if(!chess||chess.charId!==row.trapId||chess.itemType!==row.itemType||!Number.isFinite(chess.purchasePrice))throw Error('Invalid shop item '+sid+'/'+row.itemId);
    return {...row,effectId:chess.effectId,purchasePrice:chess.purchasePrice,isGolden:chess.isGolden};
  });
}
writeArtifact('shop_items.json',JSON.stringify(shopItems,null,1)+'\n');
const kindCount = out.reduce((m, x) => (m[x.kind] = (m[x.kind] || 0) + 1, m), {});
console.log('equips.json:', out.length, '件 |', JSON.stringify(kindCount));
console.log('shop_items.json:',Object.entries(shopItems.seasons).map(([sid,rows])=>sid+' '+rows.length).join('; '));
