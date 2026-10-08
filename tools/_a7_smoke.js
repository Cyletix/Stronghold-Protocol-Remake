'use strict';
// A7 干员技能真实化 smoke：验证 finalizeOperator 合并真实技能字段 + 技能 Tab 富文本输出
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');
const battleData = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_data.json'), 'utf8'));
const battleLevels = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_levels.json'), 'utf8'));
const modeData = JSON.parse(fs.readFileSync(path.join(WEB, 'mode_data.json'), 'utf8'));
const tierData = JSON.parse(fs.readFileSync(path.join(WEB, 'operator_tiers.json'), 'utf8'));
const bandData = JSON.parse(fs.readFileSync(path.join(WEB, 'band_data.json'), 'utf8'));
const rangeData = JSON.parse(fs.readFileSync(path.join(WEB, 'range_data.json'), 'utf8'));
const levelData = JSON.parse(fs.readFileSync(path.join(WEB, 'level_data.json'), 'utf8'));
const appellation = JSON.parse(fs.readFileSync(path.join(WEB, 'appellation.json'), 'utf8'));
const talentData = JSON.parse(fs.readFileSync(path.join(WEB, 'talent_data.json'), 'utf8'));
const richTerm = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_richterm.json'), 'utf8'));
const skillData = JSON.parse(fs.readFileSync(path.join(WEB, 'skill_data.json'), 'utf8'));

const elements = new Map();
function mkClassList() { const set = new Set(); return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), toggle: (c, f) => { if (f === undefined) { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; } if (f) set.add(c); else set.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkClassList() }); return elements.get(id); }
const sandbox = {
  console, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0,
  addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  failed: false,
  document: { getElementById: el, addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => {
    const name = String(url).split('/').pop();
    const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData };
    if (map[name]) return { json: async () => map[name] };
    return { json: async () => modeData };
  },
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

  // 找一个有真实技能的干员条目（ROSTER_LIST 元素即 entry）
  const real = ROSTER_LIST.find(o => o.skill && o.skill.realName);
  assert(!!real, 'ROSTER 中存在带真实技能(realName)的干员: ' + (real ? real.name : '无'));
  const fm = finalizeOperator(real, '_new', null, null);
  assert(!!fm.skill, 'finalizeOperator 产出 skill');
  assert(!!fm.skill.realName, 'skill 含 realName（真实技能名）');
  assert(!!fm.skill.realDesc, 'skill 含 realDesc（真实技能描述）');
  console.log('  样例技能:', fm.skill.realName, '| sp=' + fm.skill.realSpCost, '| type=' + fm.skill.realType);

  // 技能 Tab 输出：用真实技能富文本
  const skE = ROSTER_LIST.find(o => (o.skill && o.skill.realDesc && o.skill.realDesc.indexOf('ba-') >= 0));
  const e = skE || real; const sk = e.skill;
  const tabHtml = opDetailTabBody(e, null, [], false, 'skill', rangeGridHtml(entryRangeGrids(e)), sk, [], '');
  console.log('  技能Tab HTML:', tabHtml.slice(0, 120) + '...');
  assert(tabHtml.indexOf('ba-tag') >= 0, '技能Tab描述经 richText 生成高亮词条(ba-tag)');
  assert(tabHtml.indexOf('$ba') < 0 && tabHtml.indexOf('@ba') < 0, '技能Tab无残留方舟标记');

  const withReal = ROSTER_LIST.filter(o => o.skill && o.skill.realName).length;
  console.log('ROSTER total', ROSTER_LIST.length, 'with real skill', withReal);
  window.__a7 = { failed, withReal, total: ROSTER_LIST.length };
  console.log('A7 SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('A7 SMOKE FAIL', e.message); window.__a7 = { failed: true }; });
`;
vm.runInContext(test, sandbox);
// 轮询等待异步 initMode 完成后读取结果
let tries = 0;
function poll() {
  const r = sandbox.window.__a7;
  if (r) { if (r.failed) process.exitCode = 1; return; }
  if (++tries > 200) { console.error('A7 SMOKE TIMEOUT'); process.exitCode = 1; return; }
  setImmediate(poll);
}
poll();
