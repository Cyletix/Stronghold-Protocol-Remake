'use strict';
// 策略(band)效果逐条验收：坎诺特【利滚利】/ 巫恋【替身娃娃】/ 老鲤【得闲饮茶】/ 梓兰【猎头顾问】
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const load = n => JSON.parse(fs.readFileSync(path.join(WEB, n), 'utf8'));
const battleData = load('battle_data.json'), battleLevels = load('battle_levels.json'), modeData = load('mode_data.json');
const tierData = load('operator_tiers.json'), bandData = load('band_data.json'), rangeData = load('range_data.json');
const levelData = load('level_data.json'), appellation = load('appellation.json'), talentData = load('talent_data.json');
const richTerm = load('battle_richterm.json'), skillData = load('skill_data.json');
const bandEffects = load('band_effects.json');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');

const elements = new Map();
function mkCl() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; } if (f) s.add(c); else s.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkCl() }); return elements.get(id); }
const sandbox = {
  console, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  document: { getElementById: el, addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => { const name = String(url).split('/').pop(); const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData, 'band_effects.json': bandEffects }; if (map[name]) return { json: async () => map[name] }; return { json: async () => modeData }; },
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
  setSetupSeason('act2autochess');
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // ① 坎诺特【利滚利】coin_carry_over：剩余资金继承 + 剩余≥5 计息
  chooseBand('band_cannot');
  assert(bandCoinCarryOver(7) === 8, '坎诺特：剩余7(≥5)=继承7+利息1=8');
  assert(bandCoinCarryOver(3) === 3, '坎诺特：剩余3(<5)只继承3、无利息');
  G.money = 7;
  startRound(2);
  assert(G.money === roundMoney(2) + 8, '坎诺特：第2回合资金=基础5+继承8=13');

  // ② 巫恋【替身娃娃】first_sell_char_chess_exchange_char_chess_in_shop：首次出售改为交换
  chooseBand('band_vodfox');
  const e0 = (G.shop.find(s => s.type === 'op') || {}).entry || (ROSTER_LIST && ROSTER_LIST[0]);
  assert(!!e0, '巫恋：有真实干员 entry 可用');
  addOperator(e0.charId, false);
  const vop = G.ops.find(o => o.row == null);
  assert(vop != null, '巫恋：候选区有干员');
  G.money = 10; G._firstSellUsed = false;
  sellHand(vop.id);
  assert(!G.ops.some(o => o.id === vop.id), '巫恋：首次出售干员移除');
  assert(G.money === 10, '巫恋：首次出售不返还资金(改为交换)');
  assert(G._firstSellUsed === true, '巫恋：首次出售标记置位');
  addOperator(e0.charId, false);
  const vop2 = G.ops.find(o => o.row == null);
  const mBefore2 = G.money;
  sellHand(vop2.id);
  assert(G.money === mBefore2 + 1, '巫恋：第二次出售正常返还资金+1');

  // ③ 老鲤【得闲饮茶】prep_start_gain_chess_from_pool_in_round：第3回合获得2/4阶干员
  chooseBand('band_lmlee');
  G.shop = [];
  applyBandOnRound('band_lmlee', 3);
  const tiers = G.shop.filter(s => s.type === 'op').map(s => s.entry.tier);
  assert(tiers.includes(2) && tiers.includes(4), '老鲤：第3回合获得2阶与4阶干员各1名');

  // ④ 梓兰【猎头顾问】band_shop_refresh_copy_max_lv_char：复制最高阶干员
  chooseBand('band_orchid');
  const r5 = ROSTER_LIST.find(x => x.tier === 5) || ROSTER_LIST[0];
  const r3 = ROSTER_LIST.find(x => x.tier === 3) || ROSTER_LIST[0];
  G.shop = [{ type:'op', entry: r5, cost: 1 }, { type:'op', entry: r3, cost: 1 }];
  const cm = bandRefreshCopyMaxLv();
  assert(cm && cm.entry.charId === r5.charId && cm.cnt === 1, '梓兰：复制当前商店最高阶干员(count=1)');

  window.__bandstrat = { failed };
  console.log('BAND STRATEGY SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('BAND STRATEGY SMOKE FAIL', e.message, e.stack); window.__bandstrat = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__bandstrat; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('BAND STRATEGY SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
