'use strict';
// 立绘技能加成 + 三合一奖励 smoke：skillBonusText + showMergeReward/selectMergeReward
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

  // ① 技能加成文本
  assert(skillBonusText([{ type:'buff_atk', power:0.3 }]) === '攻击力+30%', 'skillBonusText buff_atk+30%');
  assert(skillBonusText([{ type:'buff_def', power:0.2 }, { type:'buff_atkspd', power:0.1 }]) === '防御力+20%、攻击速度+10%', 'skillBonusText 多算子');
  assert(skillBonusText([]) === '', 'skillBonusText 空返回空串');
  // 真实技能加成：忍冬 dp_gain → 部署费用
  const vulpis = ROSTER['char_4026_vulpis'];
  if (vulpis) {
    const fm = finalizeOperator(vulpis, null, [], false);
    const txt = skillBonusText(fm.skill && fm.skill.effects);
    assert(txt.indexOf('部署费用') >= 0, '忍冬技能加成含「部署费用」实=' + txt);
  }

  // ② 三合一奖励
  G.level = 3;
  const e0 = ROSTER_LIST.find(e => e.tier === 1);
  assert(!!e0, '有1阶干员用于合成测试');
  if (e0) {
    const savedShop = G.shop.slice();
    addOperator(e0.charId, false); addOperator(e0.charId, false); addOperator(e0.charId, false);
    assert(G.ops.some(o => o.elite && o.charId === e0.charId), '三合一后出现精锐卡');
    assert(G._mergeReward != null, '合成精锐后触发晋升调配特许');
    assert(G.shop.length === 3 && G.shop.every(s => s.type === 'op' && s.entry.tier === 4), '商店切换显示 3 个 4 阶干员');
    const chosen = G.shop[0].entry.name;
    selectMergeReward(0);
    assert(G._mergeReward == null, '选择后清除特许状态');
    assert(G.ops.some(o => o.entry.name === chosen && !o.elite), '选择的干员加入候选区');
    assert(G.shop.length === savedShop.length, '选择后恢复商店原页面（槽数一致）');
  }

  // ②b 通过 buyShop 购买 3 个同名 → 合并奖励应显示 3 个（回归：splice 顺序，避免误删奖励卡）
  {
    const e1 = ROSTER_LIST.find(e => e.tier === 2 && !NON_SHOP.includes(e.charId));
    const eOther = ROSTER_LIST.find(e => e.tier === 1);
    if (e1 && eOther) {
      G.ops = [];
      G.shop = [{type:'op',entry:e1,cost:3},{type:'op',entry:e1,cost:3},{type:'op',entry:e1,cost:3},{type:'op',entry:eOther,cost:2}];
      G.money = 100; G.level = 3; G._mergeReward = null;
      buyShop(0); buyShop(0); buyShop(0);
      assert(G._mergeReward != null, 'buyShop 第3次购买触发合并奖励');
      assert(G.shop.length === 3, '合并奖励显示3个干员 实=' + G.shop.length);
      const savedLen = G._mergeReward ? G._mergeReward.savedShop.length : -1;
      assert(savedLen === 1, '合并奖励 savedShop 保留原页面（1个其他干员）实=' + savedLen);
    }
  }

  window.__uifix = { failed };
  console.log('UI FIXES SMOKE ' + (failed ? 'FAIL' : 'OK'));
})().catch(e => { console.error('UI FIXES SMOKE FAIL', e.message, e.stack); window.__uifix = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__uifix; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('UI FIXES SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
