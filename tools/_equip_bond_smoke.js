'use strict';
// 装备进候选区 + 拖拽穿戴 + 售卖退回装备 + 盟约详情面板
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const load = n => JSON.parse(fs.readFileSync(path.join(WEB, n), 'utf8'));
const battleData = load('battle_data.json'), battleLevels = load('battle_levels.json'), modeData = load('mode_data.json');
const tierData = load('operator_tiers.json'), bandData = load('band_data.json'), rangeData = load('range_data.json');
const levelData = load('level_data.json'), appellation = load('appellation.json'), talentData = load('talent_data.json');
const richTerm = load('battle_richterm.json'), skillData = load('skill_data.json');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');

const elements = new Map();
function mkCl() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; } if (f) s.add(c); else s.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkCl() }); return elements.get(id); }
const sandbox = {
  console, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  document: { getElementById: el, addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => { const name = String(url).split('/').pop(); const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData }; if (map[name]) return { json: async () => map[name] }; return { json: async () => modeData }; },
};
sandbox.window = sandbox;
sandbox.canvasMock = { width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (typeof k === 'string' ? () => {} : t[k]), set: (t, k, v) => (t[k] = v, true) }), addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }) };
el('cv').getContext = sandbox.canvasMock.getContext; el('cv').addEventListener = () => {}; el('cv').getBoundingClientRect = sandbox.canvasMock.getBoundingClientRect;
require('./_mode_rules_fixture')(sandbox);
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
vm.runInContext(modeSrc, sandbox);

const test = `
(async () => {
  await initMode();
  chooseBand('band_amiya');
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // 抓一个真实干员 entry 备用（shop 里 op 卡，兜底 ROSTER_LIST[0]）
  const realOpEntry = (G.shop.find(s => s.type === 'op') || {}).entry || (ROSTER_LIST && ROSTER_LIST[0]);
  assert(!!realOpEntry, '有真实干员 entry 可用');

  // ① 购买装备 → 进入候选区（带 uid + bench 格）
  G.equipInv = [];
  G.shop = [{ type: 'equip', equip: { id: 'whammer', name: '维式重锤', mods: { atk: 1.15 }, cost: 1 }, cost: 1 }];
  G.money = 10;
  buyShop(0);
  assert(G.equipInv.length === 1, '购买装备后 equipInv=1');
  assert(G.equipInv[0].uid != null, '装备带唯一 uid');
  refreshBoard();
  assert(G.equipInv[0].bench != null, '装备分配到候选格(bench)');
  assert((B.bench || []).some(b => b.type === 'equip'), '装备进入引擎候选区(B.bench)');
  const eqCell = G.equipInv[0].bench;
  assert(BDATA.level.grid[eqCell.row][eqCell.col] === 'tile_achand', '装备候选只落在真实 tile_achand');
  const eqEmpty = candidateCells(BDATA.level).find(cell => !(B.bench || []).some(x=>x.row===cell.row && x.col===cell.col));
  if (eqEmpty) {
    onBenchMove(G.equipInv[0].uid, eqEmpty.row, eqEmpty.col);
    assert(G.equipInv[0].bench.row===eqEmpty.row && G.equipInv[0].bench.col===eqEmpty.col, '装备可在 tile_achand 间自由排序');
  }

  // ② 拖拽穿戴：onEquipDeploy 装备到干员，且从候选区移除
  addOperator(realOpEntry.charId, false);
  const op = G.ops.find(o => o.row == null);
  assert(op != null, '候选区有干员');
  const uid = G.equipInv[0].uid;
  onEquipDeploy(uid, op.id);
  assert(op.equip && op.equip[0] && op.equip[0].id === 'whammer' && op.equip[1] === null, '拖拽装备穿戴成功（左槽，右槽空）');
  assert(G.equipInv.length === 0, '装备已从候选区移除');

  // ③ 售卖带装备干员 → 装备退回候选区
  sellHand(op.id);
  assert(!G.ops.some(o => o.id === op.id), '售卖后干员移除');
  assert(G.equipInv.length === 1 && G.equipInv[0].id === 'whammer', '售卖退回装备到候选区');
  refreshBoard();
  assert((B.bench || []).some(b => b.type === 'equip'), '退回的装备重新进候选区');

  // ③b 双槽穿戴 + 满两槽拖入替换（销毁原装备）
  addOperator(realOpEntry.charId, false);
  const op2 = G.ops[G.ops.length - 1];
  assert(op2 != null && op2.row == null, '新增候选干员用于双槽测试');
  G.equipInv = [];   // 清空上一步售卖退回的装备，双槽测试只算这两件
  G.equipInv.push({ uid: G.nextId++, id: 'whammer', name: '维式重锤', mods: { atk: 1.15 }, tier: 1 });
  G.equipInv.push({ uid: G.nextId++, id: 'tea', name: '萨尔贡浓茶', mods: { aspd: 1.15 }, tier: 1 });
  onEquipDeploy(G.equipInv[0].uid, op2.id, 0);
  onEquipDeploy(G.equipInv[0].uid, op2.id, 1);
  assert(op2.equip[0].id === 'whammer' && op2.equip[1].id === 'tea', '两槽各一件');
  G.equipInv.push({ uid: G.nextId++, id: 'ding', name: '天师古鼎', mods: { hp: 1.45 }, tier: 1 });
  onEquipDeploy(G.equipInv[0].uid, op2.id, 0);
  assert(op2.equip[0].id === 'ding' && op2.equip[1].id === 'tea', '满两槽拖入左槽→替换并销毁原装备');

  // ④ 盟约详情面板：同干员2份只算1人，头像一行4个
  G.ops = [
    { id: 1, charId: 'charA', row: 0, col: 0, elite: false, entry: { charId: 'charA', name: '阿', seasonBond: 'yanShip', regBonds: [] } },
    { id: 2, charId: 'charA', row: 1, col: 0, elite: false, entry: { charId: 'charA', name: '阿', seasonBond: 'yanShip', regBonds: [] } },
  ];
  onBondClick('yanShip');
  const bd = document.getElementById('bond-detail');
  assert(bd.style.display === 'block', '盟约详情面板显示');
  assert(bd.innerHTML.indexOf('生效人数') >= 0, '详情含生效人数');
  assert(bd.innerHTML.indexOf('bd-op') >= 0, '详情含成员头像');
  assert(bd.innerHTML.indexOf('charA.png') >= 0, '成员头像用 charId 图片');
  onBondClick('yanShip');
  assert(bd.style.display === 'none', '再点同一盟约关闭详情');

  window.__equipbond = { failed };
  console.log('EQUIP BOND SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('EQUIP BOND SMOKE FAIL', e.message, e.stack); window.__equipbond = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__equipbond; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('EQUIP BOND SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
