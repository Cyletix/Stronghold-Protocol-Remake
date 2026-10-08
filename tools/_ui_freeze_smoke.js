'use strict';
// 冻结语义 + 候选区自由排序 smoke：验证 ① 冻结能跨越回合保住卡池且回合更替自动解冻 ② 升本不因冻结停止刷新 ③ 手动刷新取消冻结 ④ 候选区拖拽交换位置
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
for (const script of ['src/domain/game-state.js','src/rules/session-commands.js']) vm.runInContext(fs.readFileSync(path.join(WEB,script),'utf8'),sandbox);
sandbox.fetch = async url => ({ json: async () => load(String(url).split('/').pop()) });
vm.runInContext(engineSrc, sandbox);
vm.runInContext(modeSrc, sandbox);

const test = `
(async () => {
  await initMode();
  chooseBand('band_amiya');
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // ① 冻结跨越回合：冻结 → startRound(2) → 卡池保留 + 自动解冻
  const shop0 = G.shop.map(s => s.type + ':' + ((s.type==='op') ? s.entry.charId : s.equip.id));
  const frozenOn = !G.frozen;
  toggleFreeze();
  assert(G.frozen === true, '冻结后 G.frozen=true');
  startRound(2);
  assert(G.frozen === false, '回合更替后自动解冻(G.frozen=false)');
  assert(shop0.join('|') === G.shop.map(s => s.type + ':' + ((s.type==='op') ? s.entry.charId : s.equip.id)).join('|'), '冻结的卡池保留到下一回合(未刷新)');
  assert(G.round === 2, '进入第2回合');

  // ② 升本不因冻结停止刷新：冻结 → 升本 → 卡池刷新 + 等级提升
  toggleFreeze();
  assert(G.frozen === true, '再次冻结(G.frozen=true)');
  const lvB = G.level;
  const need = G.upgradeCost;
  G.money = need;
  window.GameActions.upgradeShop();
  assert(G.level === lvB && G.money === need, '首次点击仅确认升阶，不扣款');
  window.GameActions.upgradeShop();
  assert(G.level === lvB + 1, '升本后等级+1(' + lvB + '→' + G.level + ')');
  const levelInfo = SOURCE_BATTLES.seasons[G.seasonId].shopLevels[G.modeId][G.level];
  assert(G.money === 0, '二次确认只扣一次升阶费用');
  assert(G.shop.length === levelInfo.charChessCount + levelInfo.itemCount, '升本后按真实等级配置刷新卡数(冻结不阻断)');

  // ③ 手动刷新取消冻结（升本后冻结仍保持，刷新才取消）
  assert(G.frozen === true, '升本后冻结仍保持(G.frozen=true)');
  G.money = REFRESH_COST;
  refreshShop();
  assert(G.frozen === false, '手动刷新后取消冻结(G.frozen=false)');

  // ④ 地图候选区：购买干员后进入真实 tile_achand，DOM 手牌不常驻
  G.money = 100;   // 便于购买候选干员
  while (G.ops.filter(o => o.row==null).length < 2 && G.shop.length) {
    const idx = G.shop.findIndex(s => s.type === 'op' && G.money >= s.cost);
    if (idx < 0) break;
    buyShop(idx);
  }
  const cands = G.ops.filter(o => o.row==null);
  if (cands.length) {
    const a = cands[0];
    layoutBench();
    const bop = (B.bench || []).find(x => x.id === a.id);
    assert(document.getElementById('bench').style.display === 'none', '卫戍协议不常驻 DOM 备战席');
    assert(!!bop, '未部署干员进入引擎 B.bench');
    assert(!!bop && BDATA.level.grid[bop.row][bop.col] === 'tile_achand', '候选干员只落在真实 tile_achand');

    // 候选格自由移动到另一个真实空位
    const empty = candidateCells(BDATA.level).find(cell => !(B.bench || []).some(x=>x.row===cell.row && x.col===cell.col));
    if (bop && empty) {
      onBenchMove(a.id, empty.row, empty.col);
      assert(a.bench.row===empty.row && a.bench.col===empty.col, '候选干员可在 tile_achand 间自由排序');
    }

    // ⑤ 模拟地图候选实体拖拽部署：startBenchDrag→落到可部署格→拖出确认朝向
    computeFit();
    const cellScreen = (r,c) => mapPoint(c*TILE + TILE/2, r*TILE + TILE/2, cam.f);
    const lv = BDATA.level;
    let dr=-1, dc=-1;
    outer6: for (let r=0;r<lv.rows-1;r++) for (let c=0;c<lv.cols;c++) { if (isDeployable(r,c) && !G.ops.some(x=>x.row===r&&x.col===c)) { dr=r; dc=c; break outer6; } }
    if (dr>=0) {
      const toS = cellScreen(dr, dc);
      const or2 = (dr-2 >= 0) ? dr-2 : dr+2;
      const outS = cellScreen(or2, dc);
      const live = (B.bench || []).find(x=>x.id===a.id);
      const fromS = cellScreen(live.row, live.col);
      startBenchDrag(live, live.col*TILE+TILE/2, live.row*TILE+TILE/2, fromS[0], fromS[1]);
      onMove({ clientX: toS[0], clientY: toS[1] });
      onUp({ clientX: toS[0], clientY: toS[1] });    // 落到绿格 → 进入二次确认(facing)
      onDown({ clientX: toS[0], clientY: toS[1] });    // 二次按下确认拖离
      onMove({ clientX: outS[0], clientY: outS[1] });  // 拖出格子设定方向
      onUp({ clientX: outS[0], clientY: outS[1] });    // 松手确认部署
      const dep = G.ops.find(x=>x.id===a.id);
      assert(dep.row===dr && dep.col===dc, '拖拽部署生效(候选 ' + a.id + ' → ' + dr + ',' + dc + ' 实=' + dep.row + ',' + dep.col + ')');
    } else {
      console.log('  跳过部署断言（无可部署格）');
    }
  } else {
    console.log('  跳过备战席部署断言（不可负担/无干员卡，money=' + G.money + '）');
  }

  window.__freeze = { failed };
  console.log('UI FREEZE SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('UI FREEZE SMOKE FAIL', e.message, e.stack); window.__freeze = { failed: true }; });
`;
vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__freeze; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('UI FREEZE SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
