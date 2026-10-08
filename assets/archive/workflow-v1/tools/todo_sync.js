'use strict';
// 把手写 docs/todo.md 的未完成条目（- [ ]），抽象成结构化任务单元（docs/tasks/T-*.md）
// 幂等：docs/tasks/todo-map.json 记录「todo 行号 → 任务单元ID」，已抽象的不重复生成。
// 用法：node tools/todo_sync.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TODO = path.join(ROOT, 'docs', 'todo.md');
const TASKDIR = path.join(ROOT, 'docs', 'tasks');
const MAPFILE = path.join(TASKDIR, 'todo-map.json');

// 任务主题（内置分类）：todo 条目文本命中关键词 → 归入对应任务文件
const THEMES = [
  { file: 'T-002.md', taskId: 'T-002', title: '卫戍协议可玩性打磨',
    kw: /按钮|弹道|贴图|镜头|火焰|地图选择|商店|立绘|冻结|刷新|准备就绪|放大镜|盟约|图标|显示|布局|位置|画面|BGM|延迟|售卖|编队|手牌|候选|操作盘|范围|面积|收钱|资金/ },
  { file: 'T-003.md', taskId: 'T-003', title: '卫戍协议机制深化（剩余）',
    kw: /技能|天赋|敌人|策略|代码|损伤|召唤|变身|吞噬|光环|debuff|band|拆分|数值|效果|复活|攻击类型|元素|机制/ },
];

// 解析 docs/todo.md：返回 [{line, done, text}]（line=1-based 行号）
function parseTodo() {
  const lines = fs.readFileSync(TODO, 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((ln, i) => {
    const m = ln.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
    if (m) out.push({ line: i + 1, done: m[1].trim() !== '', text: m[2].trim() });
  });
  return out;
}

function loadMap() {
  try { return JSON.parse(fs.readFileSync(MAPFILE, 'utf8')); } catch { return {}; }
}
function saveMap(m) { fs.writeFileSync(MAPFILE, JSON.stringify(m, null, 2)); }

// 读任务文件：返回 { raw, units:[{id,done}] }；不存在返回 null
function loadTask(file) {
  const p = path.join(TASKDIR, file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const units = [...raw.matchAll(/^- \[([ xX])\] `([^`]+)`/gm)].map(m => ({ id: m[2], done: m[1].trim() !== '' }));
  return { raw, units };
}

// 新建任务文件（frontmatter + FINAL）
function createTask(theme) {
  const raw = `---
task_id: ${theme.taskId}
title: ${theme.title}
status: queued
next: null
completion: manual
updated_at: 2026-08-30T00:00:00+00:00
completed_at: null
blocker: null
resume_when: null
attempts: 0
---

# ${theme.title}

## Work units

- [ ] \`FINAL\` 收尾：重跑 smoke + 浏览器视觉验证
`;
  fs.writeFileSync(path.join(TASKDIR, theme.file), raw, 'utf8');
  return loadTask(theme.file);
}

// 在任务文件 FINAL 单元前插入一个新单元
function appendUnit(theme, id, text) {
  const t = loadTask(theme.file) || createTask(theme);
  const line = `- [ ] \`${id}\` ${text}`;
  const next = t.raw.replace(/(\r?\n- \[[ xX]\] `FINAL`)/, `\n${line}$1`);
  fs.writeFileSync(path.join(TASKDIR, theme.file), next, 'utf8');
}

// todo 条目文本 → 主题（关键词匹配）
function themeOf(text) {
  for (const t of THEMES) if (t.kw.test(text)) return t;
  return null;
}

// 任务单元 id 生成：现有 U-编号最大值 + 1
function nextUnitId(theme) {
  const t = loadTask(theme.file);
  if (!t) return 'U-001';
  const ns = t.units.filter(u => u.id !== 'FINAL').map(u => parseInt(u.id.replace(/\D/g, ''), 10) || 0);
  const max = ns.length ? Math.max(...ns) : 0;
  return 'U-' + String(max + 1).padStart(3, '0');
}

function main() {
  if (!fs.existsSync(TODO)) { console.error('找不到 docs/todo.md'); process.exit(1); }
  const todo = parseTodo();
  const map = loadMap();
  const open = todo.filter(t => !t.done);
  const pending = open.filter(t => map[t.line] == null);

  console.log(`todo 共 ${todo.length} 条，未完成 ${open.length} 条，其中未抽象 ${pending.length} 条`);

  let added = 0;
  for (const item of pending) {
    const theme = themeOf(item.text) || THEMES[1];   // 无法分类 → 归入机制任务
    const id = nextUnitId(theme);
    appendUnit(theme, id, item.text);
    map[item.line] = theme.taskId + '/' + id;
    console.log(`  + [${theme.taskId}/${id}] L${item.line} ${item.text.slice(0, 40)}`);
    added++;
  }
  if (added) saveMap(map);

  // 反向提示：任务已完成（done）的单元，对应 todo 条目可勾选（此步留待手动/后续反向同步）
  const mapped = open.filter(t => map[t.line] != null);
  if (mapped.length && !added) console.log('所有未完成条目均已抽象，无需操作。');
}

main();
