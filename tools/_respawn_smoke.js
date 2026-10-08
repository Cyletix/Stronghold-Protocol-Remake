'use strict';
// 干员阵亡原地复活 smoke：验证 tryKill 进入待复活态 → respawnOperators 按「CD + 资金」复活
const fs = require('fs'), path = require('path'), vm = require('vm');
const WEB = path.join(__dirname, '..', 'web');
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

  // 模拟 mode.js 的 onRespawn（资金门控）
  let money = 0;
  window.onRespawn = function(cost) {
    if (money < cost) return false;
    money -= cost; return true;
  };

  const mkOp = (hp, maxHp) => ({ name: '测试干员', charId: 'x', col: 0, row: 0, maxHp, hp, atk: 100, def: 50, attackTime: 1, range: 1, skill: { initSp: 0, spCost: 10 }, sp: 0, cd: 0, buffs: [], dead: false, cost: 3, stunUntil: 0 });

  // ① 阵亡进入待复活态
  B = { phase: 'battle', time: 10, operators: [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 10, maxShield: 10, over: false, win: false };
  const op = mkOp(0, 100);
  B.operators.push(op);
  tryKill(op);
  assert(op.dead === true, 'tryKill 后 dead=true');
  assert(op.respawnAt === 10 + RESPAWN_TIME, 'respawnAt = 当前时间 + RESPAWN_TIME');
  assert(op.respawnCost === RESPAWN_COST, 'respawnCost 默认=RESPAWN_COST');

  // ② CD 未到不复活
  B.time = 10 + RESPAWN_TIME - 1;
  respawnOperators();
  assert(op.dead === true, 'CD 未到仍阵亡');

  // ③ CD 已到但资金不足不复活
  B.time = 10 + RESPAWN_TIME + 1;
  money = 0;
  respawnOperators();
  assert(op.dead === true, '资金不足不复活');

  // ④ 资金足够立即复活（满血、清空待复活态、扣费）
  money = 5;
  respawnOperators();
  assert(op.dead === false, '资金足够→复活');
  assert(op.hp === op.maxHp, '复活后满血');
  assert(op.respawnAt === null && op.respawnCost === null, '复活后清空待复活字段');
  assert(money === 2, '复活扣费 3（5-3=2）');

  // ⑤ 复活后不会被 filter 误删（保留在场上且未阵亡）
  B.operators = B.operators.filter(o => !o.dead || o.respawnAt != null);
  assert(B.operators.length === 1 && B.operators[0].dead === false, '复活后保留在场上');

  if (failed) { console.log('RESPAWN SMOKE FAIL'); window.__respawn = { failed: true }; }
  else { console.log('RESPAWN SMOKE OK'); window.__respawn = { failed: false }; }
})();
`;
vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__respawn; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('RESPAWN SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
