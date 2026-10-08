'use strict';
// 回合结束横幅 + 自动进入下一回合 smoke：验证 showCenterBanner 文本/代次、onBattleEnd 展示「作战结束」、
// 以及 3s 定时器触发后自动 nextRound → startRound 并弹出「第 X 回合 · 获得资金 ¥Y」。
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
function mkCl() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; } if (f) s.add(c); else s.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkCl() }); return elements.get(id); }

// 可捕获/可冲刷的 setTimeout，用于手动触发 3s 自动下一回合定时器
const timerMap = new Map(); let timerId = 1;
function schedule(fn, ms) { timerMap.set(timerId, fn); return timerId++; }
function cancel(id) { timerMap.delete(id); }
function flushTimers() { let n = 0; while (timerMap.size && n++ < 200) { const entries = [...timerMap.entries()]; timerMap.clear(); for (const [, fn] of entries) fn(); } }

const sandbox = {
  console, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0,
  addEventListener: () => {}, setTimeout: schedule, clearTimeout: cancel, flushTimers,
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
  chooseBand('band_amiya');
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // 1) showCenterBanner：设标题/副标题文本 + 'show' 类
  showCenterBanner('作战结束', '完美作战！', 3);
  assert(document.getElementById('center-banner').classList.contains('show'), '横幅带 show 类');
  assert(document.getElementById('cb-title').textContent === '作战结束', '横幅主标题=作战结束');
  assert(document.getElementById('cb-sub').textContent === '完美作战！', '横幅评价=完美作战！');

  // 2) 先买 1 名干员，再部署并发起一回合，驱动真实 onBattleEnd
  for (let i = 0; i < G.shop.length; i++) { if (G.shop[i].type === 'op' && G.money >= G.shop[i].cost) { buyShop(i); break; } }
  assert(G.ops.length > 0, '已购买一名干员（G.ops=' + G.ops.length + '）');
  const lv = BDATA.level;
  let dr = -1, dc = -1;
  outer: for (let r = 0; r < lv.rows; r++) for (let c = 0; c < lv.cols; c++) { const b = lv.buildable[r][c]; if (b === 'MELEE' || b === 'ALL') { dr = r; dc = c; break outer; } }
  if (G.ops.length) onDeploy({ id: G.ops[0].id }, dr, dc, 'up');
  refreshBoard();
  startBattleRound();
  let guard = 0; while (!B.over && guard++ < 50000) update(0.05);
  assert(G.battleDone === true, 'battleDone 已置位');
  assert(document.getElementById('cb-title').textContent === '作战结束', 'onBattleEnd 展示「作战结束」');
  assert(document.getElementById('cb-sub').textContent.length > 0, 'onBattleEnd 展示评价文本');
  assert(document.getElementById('next-btn').style.display === 'inline-block', 'next-btn 显示（手动兜底）');

  // 3) 冲刷 3s 定时器：应自动进入下一回合并弹出「第 X 回合」
  const roundBefore = G.round;
  flushTimers();
  assert(G.phase === 'rest', '自动进入下一回合休整期');
  assert(G.round === roundBefore + 1, '回合数 +1（' + roundBefore + '→' + G.round + '）');
  assert(document.getElementById('cb-title').textContent === '准备阶段', '回合开始横幅标明准备阶段');
  assert(document.getElementById('cb-sub').textContent.includes(String(G.round).padStart(2,'0')), '准备横幅包含真实回合');
  assert(document.getElementById('cb-sub').textContent.includes('当前资金'), '准备横幅含当前资金');

  window.__round = { failed };
})().catch(e => { console.error('SMOKE FAIL', e); failed = true; });
`;
vm.runInContext(test, sandbox);
if (sandbox.__round && sandbox.__round.failed) process.exitCode = 1;
