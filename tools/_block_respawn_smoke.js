'use strict';
// 阻挡数 / 复活时间 数据正确性 smoke：finalizeOperator 按「固定养成」阶段取 blockCnt/respawnTime
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
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // 找一个 Ⅰ/Ⅱ阶且 blockCnt 精一→精二 有变化的近卫（如艾丝黛尔 2→3）
  let te = null;
  for (const e of ROSTER_LIST) {
    const ph = LEVEL_DATA[e.charId] || [];
    if (ph.length >= 3 && ph[1].blockCnt !== ph[2].blockCnt && e.tier <= 2) { te = e; break; }
  }
  assert(!!te, '找到 blockCnt 精一→精二 有变化的Ⅰ/Ⅱ阶干员');
  if (te) {
    const fmN = finalizeOperator(te, null, [], false);
    const fmE = finalizeOperator(te, null, [], true);
    const p1 = LEVEL_DATA[te.charId][1].blockCnt, p2 = LEVEL_DATA[te.charId][2].blockCnt;
    assert(fmN.blockCnt === p1, te.name + ' 普通(精一) blockCnt=' + p1 + ' 实=' + fmN.blockCnt);
    assert(fmE.blockCnt === p2, te.name + ' 精锐(精二) blockCnt=' + p2 + ' 实=' + fmE.blockCnt);
  }

  // 复活时间：普通=70s（大多数）、快活/处决者=18s
  const normal = ROSTER_LIST.find(e => (LEVEL_DATA[e.charId] || [])[0] && (LEVEL_DATA[e.charId][0]).respawnTime === 70);
  const fast = ROSTER_LIST.find(e => (LEVEL_DATA[e.charId] || [])[0] && (LEVEL_DATA[e.charId][0]).respawnTime === 18);
  assert(!!normal, '存在 respawnTime=70 的普通干员');
  if (normal) { const fm = finalizeOperator(normal, null, [], false); assert(fm.respawnTime === 70, normal.name + ' 复活时间=70s 实=' + fm.respawnTime); }
  assert(!!fast, '存在 respawnTime=18 的快活干员');
  if (fast) { const fm = finalizeOperator(fast, null, [], false); assert(fm.respawnTime === 18, fast.name + ' 复活时间=18s 实=' + fm.respawnTime); }

  // 阻挡数基础分布：重装=3、先锋/近卫=2、远程=1（抽样验证）
  const tank = ROSTER_LIST.find(e => e.profession === 'TANK');
  const sniper = ROSTER_LIST.find(e => e.profession === 'SNIPER');
  if (tank) { const fm = finalizeOperator(tank, null, [], false); assert(fm.blockCnt >= 2, tank.name + ' 重装阻挡数≥2 实=' + fm.blockCnt); }
  if (sniper) { const fm = finalizeOperator(sniper, null, [], false); assert(fm.blockCnt === 1, sniper.name + ' 狙击阻挡数=1 实=' + fm.blockCnt); }

  window.__blockresp = { failed };
  console.log('BLOCK RESPAWN SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('BLOCK RESPAWN SMOKE FAIL', e.message, e.stack); window.__blockresp = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__blockresp; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('BLOCK RESPAWN SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
