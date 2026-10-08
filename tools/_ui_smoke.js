'use strict';
// 针对最近 UI 改动的新路径运行时测试（覆盖冒烟测试没跑到的分支）
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');
const battleData = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_data.json'), 'utf8'));
const modeData = JSON.parse(fs.readFileSync(path.join(WEB, 'mode_data.json'), 'utf8'));
const battleLevels = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_levels.json'), 'utf8'));
const tierData = JSON.parse(fs.readFileSync(path.join(WEB, 'operator_tiers.json'), 'utf8'));
const bandData = JSON.parse(fs.readFileSync(path.join(WEB, 'band_data.json'), 'utf8'));
const rangeData = JSON.parse(fs.readFileSync(path.join(WEB, 'range_data.json'), 'utf8'));
const levelData = JSON.parse(fs.readFileSync(path.join(WEB, 'level_data.json'), 'utf8'));
const appellation = JSON.parse(fs.readFileSync(path.join(WEB, 'appellation.json'), 'utf8'));
const talentData = JSON.parse(fs.readFileSync(path.join(WEB, 'talent_data.json'), 'utf8'));
const richTerm = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_richterm.json'), 'utf8'));
const skillData = JSON.parse(fs.readFileSync(path.join(WEB, 'skill_data.json'), 'utf8'));

const elements = new Map();
function el(id) {
  if (!elements.has(id)) {
    const cl = new Set();
    elements.set(id, { id, innerHTML: '', textContent: '', style: {}, display: '',
      classList: { add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c),
        toggle: (c, f) => { if (f === undefined) { cl.has(c) ? cl.delete(c) : cl.add(c); } else { f ? cl.add(c) : cl.delete(c); } return cl.has(c); } } });
  }
  return elements.get(id);
}
const audio = { src: '', paused: true, muted: false, volume: 0, play: () => { audio.paused = false; return Promise.resolve(); } };
const sandbox = {
  console, innerWidth: 1400, innerHeight: 900,
  requestAnimationFrame: () => 0, addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  failed: false,
  document: { getElementById: (id) => id === 'bgm' ? audio : el(id), addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => {
    const name = String(url).split('/').pop();
    const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData };
    return { json: async () => (map[name] || modeData) };
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
  // 买一个干员放进手牌
  let bought = null;
  for (let i = 0; i < G.shop.length; i++) { const s = G.shop[i]; if (s.type === 'op') { buyShop(i); bought = s.entry; break; } }
  if (!bought) { const s = G.shop.find(x=>x.type==='op'); if (s) { buyShop(G.shop.indexOf(s)); bought = s.entry; } }
  console.log('hand ops', G.ops.filter(o=>o.row==null).length);
  // 选中手牌（点击选中 → 设置 selectedHand）
  const hand = G.ops.find(o=>o.row==null);
  if (hand) { selectHand(hand.id); console.log('selectedHand', selectedHand); }
  // 开始拖动 → 左侧立即弹出人物大图
  if (hand) {
    startHandDrag(hand.id);
    console.log('detail display', document.getElementById('hand-detail').style.display);
    onHandDragCancel();                            // 拖动中途取消 → 关闭左侧详情
    console.log('afterCancel selectedHand', selectedHand);
    onTileClick(-1, -1);                           // 点空白 → 取消选中并关闭
    console.log('afterTile selBoardOp', selBoardOp, 'selectedHand', selectedHand);
  }
  // 选中棋盘干员
  const board = G.ops.find(o=>o.row!=null);
  if (board) { onOpClick(board.id); console.log('selBoardOp', selBoardOp); }
  renderAll();
  // BGM 相关：静音应整钮变灰(muted类)且文字不变
  showSetup();
  const bgmBtn = document.getElementById('bgm-btn');
  const btxt = bgmBtn.textContent;
  toggleBgm();
  const mutedGray = bgmBtn.classList.contains('muted');
  const textSame = bgmBtn.textContent === btxt;
  toggleBgm();
  console.log('bgm muted', document.getElementById('bgm').muted);
  console.log('bgm 文字不变', textSame, ' 静音变灰(muted类)', mutedGray);
  console.log('roster-btn display', (document.getElementById('roster-btn-top')||{}).style);
  console.log('UI SMOKE OK');
})().catch(e => { console.error('UI SMOKE FAIL', e); failed = true; });
`;
vm.runInContext(test, sandbox);
if (sandbox.failed) process.exitCode = 1;
