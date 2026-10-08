'use strict';
// 模组（uniequip）扁平属性加成 smoke：精锐带模组 → 扁平 hp/atk/def/magicRes + 攻速百分比
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const load = n => JSON.parse(fs.readFileSync(path.join(WEB, n), 'utf8'));
const battleData = load('battle_data.json'), battleLevels = load('battle_levels.json'), modeData = load('mode_data.json');
const tierData = load('operator_tiers.json'), bandData = load('band_data.json'), rangeData = load('range_data.json');
const levelData = load('level_data.json'), appellation = load('appellation.json'), talentData = load('talent_data.json');
const richTerm = load('battle_richterm.json'), skillData = load('skill_data.json'), moduleData = load('module_data.json');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');

const elements = new Map();
function mkCl() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; } if (f) s.add(c); else s.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkCl() }); return elements.get(id); }
const sandbox = {
  console, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  document: { getElementById: el, addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => { const name = String(url).split('/').pop(); const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData, 'module_data.json': moduleData }; if (map[name]) return { json: async () => map[name] }; return { json: async () => modeData }; },
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

  // 德克萨斯精锐模组：hp+100 / atk+35 / def+15
  const texas = ROSTER['char_102_texas'];
  assert(!!(texas && texas.module && texas.module.elite), '德克萨斯有精锐模组');
  if (texas && texas.module) {
    assert(texas.module.elite.atk === 35, '德克萨斯精锐模组 atk+35 实=' + texas.module.elite.atk);
    const feWith = finalizeOperator(texas, null, [], true);
    const saved = texas.module; texas.module = null;
    const feWithout = finalizeOperator(texas, null, [], true);
    texas.module = saved;
    assert(feWith.atk - feWithout.atk === 35, '精锐模组 atk+35 已应用 实差=' + (feWith.atk - feWithout.atk));
    assert(feWith.maxHp - feWithout.maxHp === 100, '精锐模组 hp+100 已应用 实差=' + (feWith.maxHp - feWithout.maxHp));
    assert(feWith.def - feWithout.def === 15, '精锐模组 def+15 已应用 实差=' + (feWith.def - feWithout.def));
    // 普通（equipLevel=0）无模组加成
    const fn = finalizeOperator(texas, null, [], false);
    const saved2 = texas.module; texas.module = null;
    const fnWithout = finalizeOperator(texas, null, [], false);
    texas.module = saved2;
    assert(fn.atk === fnWithout.atk && fn.maxHp === fnWithout.maxHp, '普通无模组加成（equipLevel=0）');
  }

  window.__module = { failed };
  console.log('MODULE SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('MODULE SMOKE FAIL', e.message, e.stack); window.__module = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__module; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('MODULE SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
