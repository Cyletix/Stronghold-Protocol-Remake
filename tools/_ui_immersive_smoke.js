'use strict';
// 沉浸式全屏 UI smoke：验证 ① 棋盘铺屏(sizeCanvas 避让缩小) ② 盟约悬浮图标按场上人数分段点亮/激活 ③ 商店无空槽占位+金币图标 ④ 右侧动作面板仅选中时出现
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
  // ① 棋盘铺屏：Layer0 画布铺满 100vw×100vh，网格缩放交由 computeFit 拉满
  const lv = BDATA.level;
  const expTile = Math.max(20, Math.floor(Math.min(1400 / lv.cols, 900 / lv.rows)));
  assert(TILE === expTile, 'TILE 按视口求 min(' + TILE + '=' + expTile + ')');
  assert(canvas.width === 1400 && canvas.height === 900, '画布=全屏视口(1400x900) 实=' + canvas.width + 'x' + canvas.height);
  assert(canvas.width >= 1000, '棋盘画布铺满视口 ' + canvas.width);
  computeFit();
  assert(isFinite(fitS) && fitS > 0, 'computeFit 正常运行(fitS=' + fitS.toFixed(3) + ')');
  const fillsW = lv.cols * TILE >= 1400 - TILE, fillsH = lv.rows * TILE >= 900 - TILE;
  assert(fillsW || fillsH, '棋盘沿一轴铺满(lv ' + lv.cols + 'x' + lv.rows + ' TILE=' + TILE + ')');
  onMove({ clientX: 9999, clientY: 9999 });
  assert(hover === null, '鼠标移到棋盘外时不绘制红色悬停块');

  // ② 盟约悬浮图标：相同干员（同 charId 多份）只算一人，不同干员才累加
  G.ops = [
    { id: 1, charId: 'charA', row: 0, col: 0, elite: false, entry: { seasonBond: 'yanShip', regBonds: ['swiftShip'] } },
    { id: 2, charId: 'charA', row: 1, col: 0, elite: false, entry: { seasonBond: 'yanShip', regBonds: ['swiftShip'] } },
  ];
  let c = fieldBondCounts();
  assert(c['yanShip'] === 1, '【炎】同干员2份只算1人=' + c['yanShip']);
  assert(c['swiftShip'] === 1, '【迅捷】同干员2份只算1人=' + c['swiftShip']);
  G.ops.push({ id: 3, charId: 'charB', row: 2, col: 0, elite: false, entry: { seasonBond: 'yanShip', regBonds: ['swiftShip'] } });
  c = fieldBondCounts();
  assert(c['yanShip'] === 2, '【炎】不同干员2人=2');
  assert(c['swiftShip'] === 2, '【迅捷】不同干员2人=2');
  renderBonds();
  const bondHtml = document.getElementById('bonds-track').innerHTML;
  assert(bondHtml.indexOf('<svg') >= 0, '盟约图标渲染为SVG环形');
  assert(bondHtml.indexOf('2/3') >= 0, '【炎】显示 2/3（未满 segment）');
  assert(bondHtml.indexOf('2/2') >= 0, '【迅捷】显示 2/2');
  assert(bondHtml.indexOf('active') >= 0, '达阈值的【迅捷】带 active 类');
  assert(bondHtml.indexOf('onBondClick') >= 0, '盟约图标带点击处理');

  // ③ 商店
  G.ops = [];
  renderShop();
  assert((document.getElementById('shop').innerHTML.match(/shop-slot/g) || []).length === 0, '商店无空槽占位框(shop-slot)');
  assert(document.getElementById('shop-money').innerHTML.indexOf('coin') >= 0, '资金区含金币图标(coin)');
  assert(document.getElementById('shop-money').innerHTML.indexOf('<b>') >= 0, '资金区含大号数值');

  // ④ 右侧动作面板
  assert(!document.getElementById('side').classList.contains('show'), '未选中时 #side 隐藏');
  const lv2 = BDATA.level;
  let dr = -1, dc = -1;
  outer: for (let r = 0; r < lv2.rows; r++) for (let c = 0; c < lv2.cols; c++) { const b = lv2.buildable[r][c]; if (b === 'MELEE' || b === 'ALL') { dr = r; dc = c; break outer; } }
  for (let i = 0; i < G.shop.length; i++) { if (G.shop[i].type === 'op' && G.money >= G.shop[i].cost) { buyShop(i); break; } }
  if (G.ops.length) { onDeploy({ id: G.ops[0].id }, dr, dc, 'up'); selBoardOp = G.ops[0].id; }
  renderSelected();
  assert(document.getElementById('hand-detail').style.display === 'block', '选中在场干员后左侧立绘面板显示');

  // ⑤ 商店两阶段购买：首次点击=预览(高亮/确认按钮/左侧面板)，再次点击同一张=购买；点别处=取消
  renderShop();
  let buyIdx = G.shop.findIndex(s => s.type === 'op' && G.money >= s.cost);
  if (buyIdx < 0) buyIdx = G.shop.findIndex(s => G.money >= s.cost);   // 无合适干员卡则抬第一张可负担的
  if (buyIdx >= 0) {
    const before = G.shop.length;
    onShopCardClick(buyIdx);
    assert(shopPreview === buyIdx, '首次点击进入预览(shopPreview=' + shopPreview + ')');
    assert(document.getElementById('shop').innerHTML.indexOf('shop-prev') >= 0, '选中卡带 shop-prev 高亮类');
    assert(document.getElementById('shop').innerHTML.indexOf('buy-confirm') >= 0, '卡上出现「确认购买」按钮');
    assert(document.getElementById('hand-detail').style.display === 'block', '左侧预览面板弹出');
    onShopCardClick(buyIdx);   // 再次点击同一张 → 购买
    assert(G.shop.length === before - 1, '再次点击后购买(移除该项 ' + before + '→' + G.shop.length + ')');
    assert(shopPreview === -1, '购买后取消预览(shopPreview=' + shopPreview + ')');
    assert(document.getElementById('hand-detail').style.display === 'none', '购买后预览面板关闭');
  } else {
    console.log('  跳过购买断言（无可负担卡，money=' + G.money + '）');
  }

  // ⑤b 候选区属于地图：未部署干员进入真实 tile_achand，DOM 手牌隐藏
  const cands = G.ops.filter(o=>o.row==null);
  assert(cands.every(o => (B.bench || []).some(x=>x.id===o.id)), '引擎 B.bench 包含所有有槽位的未部署干员');
  assert((B.bench || []).every(o => BDATA.level.grid[o.row][o.col] === 'tile_achand'), '所有候选实体均位于真实 tile_achand');
  layoutBench();
  assert(document.getElementById('bench').style.display === 'none', '卫戍协议隐藏 DOM 备战席');
  if (cands.length) {
    onBenchClick(cands[0].id);
    assert(document.getElementById('hand-detail').style.display === 'block', '点地图候选干员弹出左侧立绘详情');
  }

  // ⑥c 开战镜头与顺序部署：隐藏底部两行候选区，干员按左下→右上、横向优先以 0.1s 间隔落场
  const entryOps = [
    { id:91, charId:'a', name:'A', row:2, col:3, maxHp:100, rangeGrids:[] },
    { id:92, charId:'b', name:'B', row:4, col:5, maxHp:100, rangeGrids:[] },
    { id:93, charId:'c', name:'C', row:4, col:1, maxHp:100, rangeGrids:[] },
  ];
  assert(battleBenchRowCount() === 2, '当前关卡底部两行 tile_achand 均属于候选区');
  startBattle(entryOps, [{ enemyId:'missing', route:0, at:999 }], 10);
  assert(B.operators.map(o=>o.id).join(',') === '93,92,91', '部署顺序=行自下而上、行内自左而右');
  assert(B.operators.map(o=>o.deployAt.toFixed(1)).join(',') === '0.0,0.1,0.2', '部署间隔固定 0.1s');
  update(0.05);
  assert(B.operators[0].deployT > 0 && B.operators[1].deployT === 0 && B.operators[2].deployT === 0, '未轮到的干员不提前进入部署计时');
  for (let s=0;s<24;s++) window.__stepCamera(0.05);
  assert(Math.abs(benchHide - 2) < 1e-6, '开战镜头完整隐藏两行候选区(benchHide='+benchHide+')');

  // ⑥ 普通模式闭环：全干员手牌(无上限) → 选中看立绘 → 部署 → 开战 → 结算
  backToMenu();
  enterNormalMode();
  assert(GMODE === 'normal', '普通模式 GMODE=normal');
  assert(G.ops.length === ROSTER_LIST.length && G.ops.length > 0, '普通模式手牌=全部干员(' + G.ops.length + ')');
  assert(document.getElementById('handbar').innerHTML.indexOf('handcell') >= 0, '普通模式手牌渲染 handcell');
  assert(document.getElementById('shopdrawer').style.display === 'none', '普通模式隐藏商店');
  assert(G.shop.length === 0, '普通模式无商店(shop=0)');
  assert(deployLimit() === Infinity, '普通模式部署无上限');
  const mop = G.ops.find(o=>o.row==null);
  if (mop) { selectHand(mop.id); assert(document.getElementById('hand-detail').style.display === 'block', '点击手牌显示左侧立绘/范围'); }
  const lv3 = BDATA.level; let dr3 = -1, dc3 = -1;
  outer3: for (let r = 0; r < lv3.rows; r++) for (let c = 0; c < lv3.cols; c++) { const b = lv3.buildable[r][c]; if (b === 'MELEE' || b === 'ALL') { dr3 = r; dc3 = c; break outer3; } }
  const dOp = G.ops.find(o=>o.row==null);
  if (dOp && dr3 >= 0) onDeploy({ id: dOp.id, charId: dOp.charId, name: dOp.entry.name }, dr3, dc3, 'up');
  assert(G.ops.filter(o=>o.row!=null).length >= 1, '普通模式已部署至少1名');
  startBattleRound();
  assert(G.phase === 'battle', '普通模式开战 phase=battle');
  let g3 = 0; while (!B.over && g3++ < 50000) update(0.05);
  assert(B.over === true, '普通模式战斗结束');
  assert(document.getElementById('result').textContent.length > 0, '普通模式结算: ' + document.getElementById('result').textContent);
  assert(document.getElementById('menu-btn').style.display === 'inline-block', '普通模式结算后显示返回(menu-btn)');

  window.__immersive = { failed };
  console.log('UI IMMERSIVE SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('UI IMMERSIVE SMOKE FAIL', e.message, e.stack); window.__immersive = { failed: true }; });
`;
vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__immersive; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('UI IMMERSIVE SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
