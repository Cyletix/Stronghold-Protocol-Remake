'use strict';
// UI 布局重构 smoke：验证商店右对齐(6槽)、地图候选区、抽屉/冻结胶囊状态
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');
const modeSrc = fs.readFileSync(path.join(WEB, 'mode.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const cssSrc = fs.readdirSync(path.join(WEB, 'styles')).filter(f => f.endsWith('.css')).sort().map(f => fs.readFileSync(path.join(WEB, 'styles', f), 'utf8')).join('\n');
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
const shopLevelData = JSON.parse(fs.readFileSync(path.join(WEB, 'shop_level.json'), 'utf8'));

const elements = new Map();
function mkCl() { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; } if (f) s.add(c); else s.delete(c); return !!f; } }; }
function el(id) { if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkCl() }); return elements.get(id); }
const sandbox = {
  console, htmlSrc, cssSrc, innerWidth: 1400, innerHeight: 900, requestAnimationFrame: () => 0,
  addEventListener: () => {}, setTimeout: () => 0, clearTimeout: () => {},
  document: { getElementById: el, addEventListener: () => {} },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => {
    const name = String(url).split('/').pop();
    const map = { 'battle_data.json': battleData, 'battle_levels.json': battleLevels, 'operator_tiers.json': tierData, 'band_data.json': bandData, 'range_data.json': rangeData, 'level_data.json': levelData, 'appellation.json': appellation, 'talent_data.json': talentData, 'battle_richterm.json': richTerm, 'skill_data.json': skillData, 'shop_level.json': shopLevelData };
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

  // 开局策略入口与回合 HUD 共用居中容器：按钮作为 HUD 的直接左邻项，不再用固定像素猜测位置。
  // 情报弹层嵌套在按钮内，不能在第一个嵌套 </div> 截断整个 HUD 容器。
  const cluster = htmlSrc.match(/<div id="hud-cluster">([\\s\\S]*?)<div id="tb-right">/);
  assert(!!cluster, '存在顶部 hud-cluster');
  assert(!!cluster && cluster[1].indexOf('id="intel-btn"') < cluster[1].indexOf('id="hud"'), '开局策略入口紧贴在回合 HUD 左侧');
  assert(/\\.intel-btn\\{[^}]*position:(?:static|relative);[^}]*background:rgba\\(18,58,43,0\\.62\\)/.test(cssSrc), '开局策略入口保持正常布局流且为半透明深绿色方形');
  assert((htmlSrc.match(/id="intel-btn"/g) || []).length === 1, '开局策略与敌方情报只有一个入口');
  toggleIntel();
  const intelHtml = document.getElementById('intel-body').innerHTML;
  assert(document.getElementById('intel-panel').style.display === 'block', '点击统一情报入口打开面板');
  assert(intelHtml.indexOf('策略（阵营）') >= 0 && intelHtml.indexOf('关卡进度') >= 0 && intelHtml.indexOf('本轮敌人') >= 0, '同一面板同时包含开局策略与源轮次敌方情报');
  toggleIntel();
  assert(document.getElementById('intel-panel').style.display === 'none', '再次点击同一入口关闭面板');

  // 商店：固定 SHOP_SLOTS(6) 卡槽；商品不足时左侧补「空槽」占位框，总卡槽数恒为 6
  renderShop();
  const shopHtml = document.getElementById('shop').innerHTML;
  const emptySlots = (shopHtml.match(/shop-card empty/g) || []).length;
  const realCards = (shopHtml.match(/shop-card/g) || []).length - emptySlots;
  console.log('  商店(初始): 空槽=' + emptySlots + ' 卡=' + realCards + ' 商店条目=' + G.shop.length);
  const shopN = (typeof shopSlots === 'function') ? shopSlots() : 6;   // 商店槽位随调度中心等级（gamedata shopLevelDataDict）
  assert(emptySlots === (shopN - G.shop.length), '空槽数=shopSlots-条目(' + emptySlots + '=' + (shopN - G.shop.length) + ')');
  assert(realCards === G.shop.length, '真实卡数=商店条目数(' + realCards + '=' + G.shop.length + ')');
  assert(realCards >= 1, '有真实商品卡');
  assert((emptySlots + realCards) === shopN, '总卡槽固定为 shopSlots=' + shopN);
  // 买 1 张后：条目减少，空槽相应补位，总槽仍为 SHOP_SLOTS
  if (G.money >= G.shop[0].cost) { buyShop(0); renderShop(); }
  const shopHtml2 = document.getElementById('shop').innerHTML;
  const emptySlots2 = (shopHtml2.match(/shop-card empty/g) || []).length;
  const realCards2 = (shopHtml2.match(/shop-card/g) || []).length - emptySlots2;
  console.log('  商店(买1张): 空槽=' + emptySlots2 + ' 卡=' + realCards2 + ' 商店条目=' + G.shop.length);
  assert(emptySlots2 === (shopN - G.shop.length), '买后空槽补位=shopSlots-条目');
  assert(realCards2 === G.shop.length, '买后真实卡数=剩余条目(' + realCards2 + '=' + G.shop.length + ')');
  assert((emptySlots2 + realCards2) === shopN, '买后总卡槽仍固定 shopSlots=' + shopN);

  // 卫戍协议候选区：由引擎在真实 tile_achand 绘制，DOM 手牌不常驻
  refreshBoard();
  layoutBench();
  assert(document.getElementById('bench').style.display === 'none', '卫戍协议隐藏 DOM 备战席');
  assert(!(document.getElementById('bench').classList.contains('vertical')), '卫戍协议不使用左侧纵列类');
  assert((B.bench || []).every(o => BDATA.level.grid[o.row][o.col] === 'tile_achand'), '候选实体只位于真实 tile_achand');
  updateCountdown(ROUND_LIMIT);
  assert(String(document.getElementById('countdown-big').textContent) === String(ROUND_LIMIT), '休整期显示大号数码倒计时待机值');
  G.shop = [{ type:'equip', equip:EQUIPS.find(x=>x.id==='tea'), cost:2 }, { type:'equip', equip:EQUIPS.find(x=>x.id==='ding'), cost:4 }];
  renderShop();
  const equipHtml = document.getElementById('shop').innerHTML;
  assert((equipHtml.match(/<svg/g) || []).length === 2, '装备卡使用各自矢量立绘');
  assert(equipHtml.indexOf('♥') < 0, '装备卡不再使用通用爱心占位符');

  // 冻结胶囊状态
  toggleFreeze();
  assert(document.getElementById('freeze-btn').classList.contains('on'), '冻结后 freeze-btn 有 on 类');
  toggleFreeze();
  assert(!document.getElementById('freeze-btn').classList.contains('on'), '解冻后 freeze-btn 无 on 类');

  // 抽屉收起/展开
  const d = document.getElementById('shopdrawer');
  toggleDrawer();
  assert(d.classList.contains('collapsed'), '收起后带 collapsed');
  toggleDrawer();
  assert(!d.classList.contains('collapsed'), '展开后无 collapsed');

  // 镜头联动：收起→镜头拉近(fitS 增大)，展开→恢复；右侧「展开/收起」按钮文本随之切换
  // 镜头保留区为动画插值，先 step 若干帧让其收敛到目标，再断言 fitS 变化（模拟浏览器 rAF）
  const stepCam = () => { for (let s=0;s<24;s++) if (window.__stepCamera) window.__stepCamera(0.05); };
  computeFit(); const fitExpanded = fitS;
  toggleDrawer(); stepCam(); computeFit(); const fitCollapsed = fitS;
  // 收起后镜头应拉近或不变（fitS 由宽/高瓶颈决定：方正地图改高度会拉近，扁长 32 列地图宽度是瓶颈则不变）
  assert(fitCollapsed >= fitExpanded, '收起后镜头拉近/不变(fitS ' + fitCollapsed.toFixed(3) + '>=' + fitExpanded.toFixed(3) + ')');
  assert(window.__shopCollapsed === true, '收起时 __shopCollapsed=true');
  assert(document.getElementById('collapse-label').textContent === '展开 ▼', '收起后按钮为「展开 ▼」');
  toggleDrawer(); stepCam(); computeFit();
  assert(Math.abs(fitS - fitExpanded) < 1e-6, '展开后镜头恢复(fitS=' + fitS.toFixed(3) + ')');
  assert(window.__shopCollapsed === false, '展开时 __shopCollapsed=false');
  assert(document.getElementById('collapse-label').textContent === '收起 ▲', '展开后按钮为「收起 ▲」');

  window.__layout = { failed };
  console.log('UI LAYOUT SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('UI LAYOUT SMOKE FAIL', e.message); window.__layout = { failed: true }; });
`;
vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__layout; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('UI LAYOUT SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
