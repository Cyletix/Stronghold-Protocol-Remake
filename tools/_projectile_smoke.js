'use strict';
// 攻击弹道 smoke：验证「远程发射弹道(物理=箭矢/法术=光球)、近战瞬时结算」的拆分与分类
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const load = n => JSON.parse(fs.readFileSync(path.join(WEB, n), 'utf8'));
const battleData = load('battle_data.json'), battleLevels = load('battle_levels.json'), modeData = load('mode_data.json');
const tierData = load('operator_tiers.json'), bandData = load('band_data.json'), rangeData = load('range_data.json');
const levelData = load('level_data.json'), appellation = load('appellation.json'), talentData = load('talent_data.json');
const richTerm = load('battle_richterm.json'), skillData = load('skill_data.json');
const renderSrc = fs.readFileSync(path.join(WEB, 'src', 'render', 'render-policy.js'), 'utf8');
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
vm.runInContext(renderSrc, sandbox);
vm.runInContext(engineSrc, sandbox);
vm.runInContext(modeSrc, sandbox);

const test = `
(async () => {
  await initMode();
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };
  BDATA = { enemies: {}, level: { routes: {} } };

  const mkOp = (id, position, atkType, col, row, range) => ({
    id, position, atkType, atk: 100, def: 0, maxHp: 1000, hp: 1000, range, cells: null, blockCnt: 0,
    cd: 0, deployAt: 0, deployed: true, deployT: 5, buffs: [], skill: null, events: [], attackTime: 10, col, row,
  });
  const mkEn = (x, y) => ({ x, y, hp: 1000, maxHp: 1000, atk: 10, def: 0, magicRes: 0, moveSpeed: 0, dead: false, flying: false, route: -1, seg: 0, cp: 0, wait: 0 });
  B = { phase: 'battle', time: 0, roundTime: 0, over: false, win: false, shield: 99, maxShield: 99,
        operators: [ mkOp('rArts','RANGED','arts',0,0,3), mkOp('rPhys','RANGED','phys',10,0,3), mkOp('mlee','MELEE','phys',5,5,1) ],
        enemies: [ mkEn(0,3), mkEn(10,3), mkEn(6,5) ], spawn: [], projectiles: [], particles: [], bench: [] };

  update(0.05);
  const pj = B.projectiles;
  assert(pj.length === 2, '远程 2 发弹道（近战不发射） 实=' + pj.length);
  const hasOrb = pj.some(p => p.kind === 'orb' && !p.enemy);
  const hasArrow = pj.some(p => p.kind === 'arrow' && !p.enemy);
  assert(hasOrb, '远程法术(arts)弹道 kind=orb');
  assert(hasArrow, '远程物理(phys)弹道 kind=arrow');
  assert(B.enemies[2].hp === 900, '近战瞬时结算 E3.hp=900 实=' + B.enemies[2].hp);
  assert(B.enemies[0].hp === 1000 && B.enemies[1].hp === 1000, '远程目标尚未命中 E1/E2.hp=1000');

  let guard = 0;
  const hp0 = () => B.enemies[0].hp, hp1 = () => B.enemies[1].hp;
  while ((hp0() === 1000 || hp1() === 1000) && guard++ < 200) update(0.05);
  assert(B.enemies[0].hp < 1000, '远程法术弹道命中扣血 E1.hp=' + B.enemies[0].hp);
  assert(B.enemies[1].hp < 1000, '远程物理弹道命中扣血 E2.hp=' + B.enemies[1].hp);
  assert(projectilePool.stats().created === 2 && projectilePool.stats().free === 2, '弹道命中后回收到对象池');
  for (let i = 0; i < 20; i++) update(0.05);
  assert(particlePool.stats().created > 0 && particlePool.stats().free === particlePool.stats().created, '命中粒子过期后回收到对象池');

  if (failed) { console.log('PROJECTILE SMOKE FAIL'); }
  else console.log('PROJECTILE SMOKE OK');
})();
`;
vm.runInContext(test, sandbox);
if (sandbox.failed) process.exitCode = 1;
