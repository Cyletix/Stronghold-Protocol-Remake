'use strict';
// 干员索敌 smoke：近战不攻击飞行单位（回归），远程可攻击飞行；技能图标 URL 正确
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

  // ① 近战干员不攻击飞行单位
  B = { phase: 'battle', time: 0, roundTime: 0, operators: [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 10, maxShield: 10, over: false, win: false };
  BDATA = { enemies: {}, level: { grid: [['tile_road']], routes: [] } };
  const meleeOp = { name:'近战', charId:'x', col:0, row:0, position:'MELEE', range:1, cells:[[0,1],[0,-1],[1,0],[-1,0]], atk:100, def:0, attackTime:1, cd:0, deployAt:0, deployT:1, dead:false, maxHp:1000, hp:1000, buffs:[], magicRes:0, dmgTaken:1, dodge:0, atkType:'phys', stunUntil:0, respawnAt:null, skill:null };
  B.operators = [meleeOp];
  const fly = { name:'飞行敌', atk:10, def:0, maxHp:1000, hp:1000, dead:false, flying:true, x:1, y:0, route:0, seg:0, cp:0, moveSpeed:1, attackTime:1.6, rangeRadius:-1, cd:0, wait:0, atkPhase:null };
  B.enemies = [fly];
  update(0.1);
  assert(fly.hp === 1000, '近战干员不攻击飞行单位（hp 不变）实=' + fly.hp);

  // ② 远程干员可攻击飞行单位
  B = { phase: 'battle', time: 0, roundTime: 0, operators: [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 10, maxShield: 10, over: false, win: false };
  const rangedOp = { name:'远程', charId:'y', col:0, row:0, position:'RANGED', range:3, cells:[[0,1],[0,2],[0,3]], atk:100, def:0, attackTime:1, cd:0, deployAt:0, deployT:1, dead:false, maxHp:1000, hp:1000, buffs:[], magicRes:0, dmgTaken:1, dodge:0, atkType:'phys', stunUntil:0, respawnAt:null, skill:null };
  B.operators = [rangedOp];
  const fly2 = { name:'飞行敌2', atk:10, def:0, maxHp:1000, hp:1000, dead:false, flying:true, x:1, y:0, route:0, seg:0, cp:0, moveSpeed:1, attackTime:1.6, rangeRadius:-1, cd:0, wait:0, atkPhase:null };
  B.enemies = [fly2];
  update(0.1);
  assert(fly2.hp < 1000, '远程干员攻击飞行单位（hp 降低）实=' + fly2.hp);

  // ③ 技能图标 URL
  const sim = getSkillIcon('skcom_charge_cost');
  assert(sim && sim.src === 'ui/skillicons/skill_icon_skcom_charge_cost.png', 'getSkillIcon 返回正确 URL');
  assert(getSkillIcon(null) === null, '无 prefabId 返回 null');

  if (failed) { console.log('OP TARGET SMOKE FAIL'); window.__opt = { failed: true }; }
  else { console.log('OP TARGET SMOKE OK'); window.__opt = { failed: false }; }
})();
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__opt; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('OP TARGET SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
