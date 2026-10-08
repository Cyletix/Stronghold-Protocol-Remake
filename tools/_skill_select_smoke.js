'use strict';
// 技能选择 + 技能等级（固定养成）smoke：defaultSkillIndex → 取对应技能；普通=技能4、精锐=技能7
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

  // ① defaultSkillIndex 选择：德克萨斯 defaultSkillIndex=1 → 剑雨（非 0 号冲锋号令）
  const texas = ROSTER['char_102_texas'];
  assert(texas && texas.skill && texas.skill.realName === '剑雨', '德克萨斯默认技能=剑雨(索引1) 实=' + (texas && texas.skill && texas.skill.realName));

  // ② 等级区分：普通=技能4、精锐=技能7（initSp/spCost 取不同变体）
  const vulpis = ROSTER['char_4026_vulpis'];
  assert(!!vulpis, '忍冬在 ROSTER');
  if (vulpis) {
    const fn = finalizeOperator(vulpis, null, [], false);
    const fe = finalizeOperator(vulpis, null, [], true);
    assert(fn.skill.spCost === SKILL_DATA['char_4026_vulpis'].normal.spCost, '忍冬普通 spCost 取技能4 变体');
    assert(fn.skill.initSp === SKILL_DATA['char_4026_vulpis'].normal.initSp, '忍冬普通 initSp 取技能4 变体');
    assert(fe.skill.spCost === SKILL_DATA['char_4026_vulpis'].elite.spCost, '忍冬精锐 spCost 取技能7 变体');
    assert(fe.skill.initSp === SKILL_DATA['char_4026_vulpis'].elite.initSp, '忍冬精锐 initSp 取技能7 变体');
    assert(fe.skill.elite === true, '精锐技能标记 elite=true');
  }

  window.__skillsel = { failed };
  console.log('SKILL SELECT SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('SKILL SELECT SMOKE FAIL', e.message, e.stack); window.__skillsel = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__skillsel; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('SKILL SELECT SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
