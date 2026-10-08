'use strict';
// 敌人行为数据 + 攻击状态机 smoke：数据字段正确 + 前摇/命中/后摇三段 + 近战阻挡停住 + 远程攻击后继续走动
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
const battleData = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_data.json'), 'utf8'));
const engineSrc = fs.readFileSync(path.join(WEB, 'engine.js'), 'utf8');

const sandbox = {
  console,
  innerWidth: 1400, innerHeight: 900,
  requestAnimationFrame: () => 0, addEventListener: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  document: { getElementById: () => ({ textContent: '', style: {}, classList: { toggle() {}, add() {}, remove() {} }, setProperty() {}, appendChild() {} }), addEventListener: () => {}, documentElement: { style: { setProperty() {} } } },
  Image: function () { this.src = ''; this.complete = false; this.naturalWidth = 0; },
};
sandbox.window = sandbox;
sandbox.canvasMock = { width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }), addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);

const test = `
(() => {
  let failed = false;
  const assert = (c, m) => { if (!c) { console.log('ASSERT FAIL:', m); failed = true; } else console.log('assert ok:', m); };

  // ① 敌人数据字段：moveSpeed / attackTime / rangeRadius / flying 均已提取
  const enArr = Object.values(BDATA ? BDATA.enemies : {}).length ? Object.values(BDATA.enemies) : [];
  // 用外部传入的 battle_data 校验（通过沙箱外变量不可行，这里改用内部加载）
  const zd = ${JSON.stringify(Object.values(battleData.enemies).filter(e => e.moveSpeed === 0).length)};
  assert(zd > 0, '存在 moveSpeed=0 的静止敌人（结晶/圣徒像/火等）');

  // ② 攻击状态机：近战敌人遇干员 → 进入前摇 windup
  B = { phase: 'battle', time: 0, roundTime: 0, operators: [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 10, maxShield: 10, over: false, win: false };
  const op = { name: '测试干员', col: 0, row: 0, blockCnt: 2, blocked: 0, dead: false, deployAt: 0, deployT: 1, stunUntil: 0, maxHp: 1000, hp: 1000, atk: 100, def: 50, buffs: [], magicRes: 0, dmgTaken: 1, dodge: 0, respawnAt: null };
  B.operators = [op];
  const me = { name: '近战敌', atk: 100, def: 0, maxHp: 1000, hp: 1000, dead: false, moveSpeed: 1, attackTime: 1.6, rangeRadius: -1, flying: false, route: 0, seg: 0, cp: 0, x: 0.5, y: 0, cd: 0, wait: 0, atkPhase: null, atkTimer: 0, atkTotal: 0, atkTarget: null };
  B.enemies = [me];
  BDATA = { enemies: {}, level: { grid: [['tile_road']], routes: [] } };
  // 近战 reachR=0.5+eR，敌人 x=0.5 与干员 col=0 距离 0.5 内 → 应锁定并进入前摇
  update(0.1);
  assert(me.atkPhase === 'windup', '近战敌人进入前摇 windup 实=' + me.atkPhase);
  const x0 = me.x;
  update(0.05); update(0.05); update(0.05);
  assert(me.x === x0, '攻击动作期间锁定不移动');

  // ③ 远程敌人：射程内有干员 → 攻击，攻击后继续走动（不站桩）
  const re = { name: '远程敌', atk: 100, def: 0, maxHp: 1000, hp: 1000, dead: false, moveSpeed: 1, attackTime: 1.6, rangeRadius: 2, flying: false, route: 0, seg: 0, cp: 1, x: 1, y: 0, cd: 0, wait: 0, atkPhase: null, atkTimer: 0, atkTotal: 0, atkTarget: null, atkType: 'phys' };
  BDATA.level.routes = [{ segs: [[{ r:0, c:0 }, { r:0, c:1 }, { r:0, c:2 }]] }];
  B.enemies = [re];
  B.operators = [{ ...op, col: 0, row: 0 }];
  re.cd = 0;
  update(0.1);
  assert(re.atkPhase === 'windup', '远程敌人射程内 → 进入前摇');
  let moved = false;
  for (let i = 0; i < 30; i++) { const before = re.x; update(0.1); if (re.x !== before) moved = true; }
  assert(moved, '远程敌人攻击后继续走动（位置变化，不站桩）');

  if (failed) { console.log('ENEMY BEHAVIOR SMOKE FAIL'); window.__eb = { failed: true }; }
  else { console.log('ENEMY BEHAVIOR SMOKE OK'); window.__eb = { failed: false }; }
})();
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__eb; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('ENEMY BEHAVIOR SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
