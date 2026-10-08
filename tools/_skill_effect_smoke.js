'use strict';
// 技能真实效果接入 smoke：验证 skill_data.json 分类 → finalizeOperator 覆盖 type/power → castSkill 执行新效果类型
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

  // ① 真实效果算子列表已写入 ROSTER（固定养成：普通=技能4、精锐=技能7，取 normal 变体校验）
  assert(ROSTER && ROSTER['char_381_bubble'], '泡泡在 ROSTER');
  const bubbleFx = ((ROSTER['char_381_bubble'].skill.normal || {}).effects || []).map(e => e.type);
  assert(bubbleFx.includes('buff_def'), '泡泡含 buff_def 算子 实=' + bubbleFx.join(','));
  assert(((ROSTER['char_4026_vulpis'].skill.normal || {}).effects || []).some(e => e.type === 'dp_gain'), '忍冬含 dp_gain 算子');
  const snakeFx = ((ROSTER['char_150_snakek'].skill.normal || {}).effects || []).map(e => e.type);
  assert(snakeFx.includes('heal_self') && snakeFx.includes('buff_def'), '蛇屠箱=防御+回血 双算子 实=' + snakeFx.join('+'));

  // ② finalizeOperator 产出 effects 算子列表
  const bubble = ROSTER['char_381_bubble'];
  const fm = finalizeOperator(bubble, null, [], false);
  assert((fm.skill.effects || []).some(e => e.type === 'buff_def'), 'finalize 后 effects 含 buff_def');

  // ③ castSkill 执行多算子：buff_def / heal_self / dp_gain / 多算子组合
  B = { phase: 'battle', time: 1, operators: [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 10, maxShield: 10, over: false, win: false };
  const op = { name: '测试', maxHp: 1000, hp: 500, atk: 100, def: 100, attackTime: 1, range: 3, col: 0, row: 0, skillFx: null, buffs: [], sp: 99, skill: { effects: [{ type: 'buff_def', power: 0.2 }], duration: 8, spCost: 10, name: '防御力强化' } };
  B.operators.push(op);
  castSkill(op);
  assert(op.buffs.length === 1 && Math.abs(op.buffs[0].def - 1.2) < 1e-9, 'buff_def 生效(1+0.2)');
  const bm = buffMul(op);
  assert(Math.abs(bm.def - 1.2) < 1e-9, 'buffMul 含 def 倍率');
  // heal_self
  endOperatorSkill(op); // 以下是独立算子样本，先结束上一技能生命周期。
  op.skill = { effects: [{ type: 'heal_self', power: 0.2 }], spCost: 10, name: '生命回复' };
  op.hp = 500;
  castSkill(op);
  assert(op.hp === 700, 'heal_self 恢复 maxHp*0.2=200 → 700 实=' + op.hp);
  // dp_gain
  endOperatorSkill(op);
  G.money = 0;
  op.skill = { effects: [{ type: 'dp_gain', power: 12 }], spCost: 10, name: '冲锋号令' };
  castSkill(op);
  assert(G.money === 12, 'dp_gain 获得资金 12 实=' + G.money);
  // 多算子组合（buff_atk + buff_atkspd 同技能两个算子）
  endOperatorSkill(op);
  op.buffs = [];
  op.skill = { effects: [{ type: 'buff_atk', power: 0.1 }, { type: 'buff_atkspd', power: 0.2 }], duration: 6, spCost: 10, name: '迅捷打击' };
  castSkill(op);
  assert(op.buffs.length === 2, '多算子技能产生 2 个 buff 实=' + op.buffs.length);

  // ④ 事件钩子 applyEvents（onDeploy / onAttack + 概率）
  const en = { x: 0, y: 0, dead: false, def: 0, magicRes: 0, hp: 100, maxHp: 100, slowUntil: 0, slowFactor: 1, moveSpeed: 1, col: undefined };
  B.enemies = [en];
  op.events = [{ type: 'heal_self', power: 0.2, trigger: 'deploy' }, { type: 'slow', power: 0.4, trigger: 'attack', prob: 1 }];
  op.hp = 500;
  applyEvents(op, 'deploy', B.enemies, B.operators);
  assert(op.hp === 700, 'onDeploy 触发 heal_self → 700 实=' + op.hp);
  applyEvents(op, 'attack', [en], B.operators);
  assert(en.slowUntil > 0, 'onAttack 触发 slow');

  if (failed) { console.log('SKILL EFFECT SMOKE FAIL'); window.__skilleff = { failed: true }; }
  else { console.log('SKILL EFFECT SMOKE OK'); window.__skilleff = { failed: false }; }
})().catch(e => { console.error('SKILL EFFECT SMOKE FAIL', e.message, e.stack); window.__skilleff = { failed: true }; });
`;

vm.runInContext(test, sandbox);
let tries = 0;
function poll() { const r = sandbox.window.__skilleff; if (r) { if (r.failed) process.exitCode = 1; return; } if (++tries > 200) { console.error('SKILL EFFECT SMOKE TIMEOUT'); process.exitCode = 1; return; } setImmediate(poll); }
poll();
