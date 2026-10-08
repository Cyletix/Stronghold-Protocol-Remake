'use strict';
// 冒烟测试：用 vm 模拟浏览器环境，端到端跑一遍模式层逻辑（不含真实渲染）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..', 'web');
const stateSrc = fs.readFileSync(path.join(WEB, 'src', 'domain', 'game-state.js'), 'utf8');
const commandSrc = fs.readFileSync(path.join(WEB, 'src/rules/session-commands.js'), 'utf8');
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
function mkClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c), remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, f) => { if (f === undefined) { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; } if (f) set.add(c); else set.delete(c); return !!f; },
  };
}
function el(id) {
  if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', style: {}, classList: mkClassList() });
  return elements.get(id);
}

const sandbox = {
  console,
  innerWidth: 1400,
  innerHeight: 900,
  requestAnimationFrame: () => 0,
  addEventListener: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  failed: false,
  document: {
    getElementById: el,
    addEventListener: () => {},
  },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
  fetch: async (url) => {
    const name = String(url).split('/').pop();
    if (name === 'battle_data.json') return { json: async () => battleData };
    if (name === 'battle_levels.json') return { json: async () => battleLevels };
    if (name === 'operator_tiers.json') return { json: async () => tierData };
    if (name === 'band_data.json') return { json: async () => bandData };
    if (name === 'range_data.json') return { json: async () => rangeData };
    if (name === 'level_data.json') return { json: async () => levelData };
    if (name === 'appellation.json') return { json: async () => appellation };
    if (name === 'talent_data.json') return { json: async () => talentData };
    if (name === 'battle_richterm.json') return { json: async () => richTerm };
    if (name === 'skill_data.json') return { json: async () => skillData };
    return { json: async () => modeData };
  },
};
sandbox.window = sandbox;
sandbox.canvasMock = {
  width: 0, height: 0,
  getContext: () => new Proxy({}, { get: (t, k) => (typeof k === 'string' ? () => {} : t[k]), set: (t, k, v) => (t[k] = v, true) }),
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
};
// engine 里 canvas = document.getElementById('cv')
el('cv').getContext = sandbox.canvasMock.getContext;
el('cv').addEventListener = () => {};
el('cv').getBoundingClientRect = sandbox.canvasMock.getBoundingClientRect;

require('./_mode_rules_fixture')(sandbox);
vm.createContext(sandbox);
vm.runInContext(stateSrc, sandbox);
vm.runInContext(commandSrc, sandbox);
vm.runInContext(engineSrc, sandbox);
vm.runInContext(modeSrc, sandbox);

const testSrc = `
(async () => {
  await initMode();
  console.log('ROSTER size', ROSTER_LIST.length);
  console.log('BOSS_LIST', BOSS_LIST.length, BOSS_LIST[0].name);
  const withSeason = ROSTER_LIST.filter(o => o.seasonBond).length;
  console.log('ops with season bond', withSeason, '/', ROSTER_LIST.length);

  chooseBand('band_amiya');
  document.getElementById('decision-modal').style.display = 'flex';
  chooseBand('band_amiya');
  if (document.getElementById('decision-modal').style.display !== 'none') throw new Error('Stale decision survived a new game');
  if (!window.GameActions || window.GameActions.toggleFreeze !== toggleFreeze) throw new Error('Missing HTML action entry');
  const oldFrozen = G.frozen;
  window.GameActions.toggleFreeze();
  if (G.frozen === oldFrozen) throw new Error('HTML freeze action failed');
  window.GameActions.toggleFreeze();
  if (ArkState.getSnapshot().session !== G) throw new Error('GameState session is not the legacy G object');
  console.log('[R1] round', G.round, 'money', G.money, 'shop', G.shop.length, 'level', G.level, 'upgrade', G.upgradeCost, 'LIFE', G.life, 'band', G.bandName);
  console.log('shop types', G.shop.map(s=>s.type).join(','));

  // 混合商店：买 5 次（可能买到干员或装备）
  let eqCount = 0;
  for (let i = 0; i < 5; i++) {
    const s = G.shop[0]; if (!s) break;
    if (s.type === 'equip') eqCount++;
    buyShop(0);
  }
  console.log('owned ops', G.ops.length, 'equips bought', eqCount, 'equipInv', G.equipInv.length, 'money after buy', G.money);
  if (G.ops.length) console.log('op0 tier', G.ops[0].entry.tier, 'name', G.ops[0].entry.name, 'rarity', G.ops[0].entry.rarity);

  const lv = BDATA.level;
  let dr = -1, dc = -1;
  outer: for (let r = 0; r < lv.rows; r++) for (let c = 0; c < lv.cols; c++) {
    const b = lv.buildable[r][c]; if (b === 'MELEE' || b === 'ALL') { dr = r; dc = c; break outer; }
  }
  console.log('deploy tile', dr, dc);
  if (G.ops.length) {
    onDeploy({ id: G.ops[0].id }, dr, dc, 'up');
  }
  console.log('board count', G.ops.filter(o => o.row != null).length);
  // 卫戍协议部署范围取固定养成；以下独立验证普通模式仍随账号精英化变化。
  const dbg = G.ops.find(o => o.row != null);
  if (dbg) console.log('deployed', dbg.entry.name, 'rangeGrids精2格数 =', (boardView(dbg).rangeGrids || []).length);
  const cid = 'char_4100_caper';   // 跃跃：精0=3-3(12格) / 精1/2=y-7(15格)
  if (ROSTER[cid]) {
    GMODE = 'normal';
    ACCOUNT.ops[cid] = { level: 80, evolve: 0, skillLevel: 7, trust: 100, potential: 6 };
    const g0 = entryRangeGrids(ROSTER[cid]);
    ACCOUNT.ops[cid].evolve = 1;
    const g1 = entryRangeGrids(ROSTER[cid]);
    ACCOUNT.ops[cid].evolve = 2;
    const g2 = entryRangeGrids(ROSTER[cid]);
    console.log('跃跃 range 精0/精1/精2 格数 =', g0 && g0.length, g1 && g1.length, g2 && g2.length, ' 精0≠精2 =', !!(g0 && g2 && g0.length !== g2.length));
    ACCOUNT.ops[cid].evolve = 0;
    const t0 = activeTalents(ROSTER[cid]).map(t => t.name);
    ACCOUNT.ops[cid].evolve = 1;
    const t1 = activeTalents(ROSTER[cid]).map(t => t.name);
    console.log('跃跃天赋 精0/精1 =', JSON.stringify(t0), JSON.stringify(t1), ' 精1解锁新天赋 =', t1.length > t0.length);
    GMODE = 'auto';
  }
  if (G.ops.length) console.log('op0 final stats hp/atk/def', G.ops[0].maxHp, G.ops[0].atk, G.ops[0].def);
  console.log('activeBonds', JSON.stringify(G.activeBonds));

  startBattleRound();
  if (!ArkState.getSnapshot().battle || ArkState.getSnapshot().battle.phase !== 'battle') throw new Error('GameState battle was not registered');
  console.log('phase', G.phase, 'shield', G.shield, 'spawn len', G.spawn ? 'n/a' : 'n/a');
  let guard = 0;
  while (!B.over && guard < 50000) { update(0.05); guard++; }
  console.log('battle done:', 'over', B.over, 'win', B.win, 'battleDone', G.battleDone, 'enemyHp', G.enemyHp, 'life', G.life);

  nextRound();
  console.log('[R2] round', G.round, 'money', G.money, 'phase', G.phase);

  // ---- 完整一局：自动购买+部署+开战，直到终局 ----
  let safety = 0;
  while (G.phase !== 'over' && safety++ < 40) {
    // 每回合把手牌部署到可部署格（尽量）
    const lv2 = BDATA.level;
    let used = new Set(G.ops.filter(o=>o.row!=null).map(o=>o.row*100+o.col));
    for (const o of G.ops) {
      if (o.row != null) continue;
      let placed = false;
      for (let r=0;r<lv2.rows && !placed;r++) for (let c=0;c<lv2.cols && !placed;c++) {
        const b = lv2.buildable[r][c]; const key = r*100+c;
        if ((b==='MELEE'||b==='ALL') && !used.has(key)) { used.add(key); o.row=r; o.col=c; placed=true; }
      }
    }
    refreshBoard();
    if (G.phase === 'over') break;
    if (!G.ops.some(o=>o.row!=null)) { console.log('no ops to deploy at round', G.round); break; }
    startBattleRound();
    let g2 = 0; while (!B.over && g2++ < 50000) update(0.05);
    console.log('R'+G.round, 'win', B.win, 'enemyHp', G.enemyHp, 'life', G.life);
    nextRound();
  }
  console.log('FINAL round', G.round, 'phase', G.phase, 'enemyHp', G.enemyHp, 'life', G.life, 'result', document.getElementById('result').textContent);
  console.log('SMOKE OK');
})().catch(e => { console.error('SMOKE FAIL', e); failed = true; });
`;
vm.runInContext(testSrc, sandbox);
if (sandbox.failed) process.exitCode = 1;
