'use strict';
// 从多个 autoChess 关卡文件批量生成 web/battle_levels.json
// 复用现有 battle_data.json 的 operators/enemies（已正确），仅重建各关卡的 level（含 fix_routes 的 BFS 路线 segs）
const fs = require('fs'), path = require('path');
const ROOT = __dirname.replace(/tools$/, '');
const DATA_ROOT = path.join(ROOT, 'data', 'ArknightsGameData', 'zh_CN', 'gamedata');
const WEB = path.join(ROOT, 'web');

// 关卡清单：三个赛季的 主模式(_m*) 关卡全部纳入。act1vautochess 为"盟约"(当前规则，有真实名)；
// act1autochess/act2autochess 在 stage_table 中 code/name 为空(历史/其它赛季)，这里按季+序号生成可识别名。
const SEASONS = ['act1vautochess', 'act1autochess', 'act2autochess'];
const SEASON_CN = { act1autochess: '初版', act1vautochess: '盟约', act2autochess: 'Ⅱ' };
const KNOWN_V1 = { 1: 'AC-TR-1 教学关', 2: 'AC-1', 3: 'AC-2', 4: 'AC-2', 5: 'AC-2' };
// 玩法归属：act1vautochess=第一版（AC-*，规则与盟约不通用）；act1autochess=盟约；act2autochess=盟约II。
// 盟约玩法(auto)只应用于 covenant / covenant2；v1（第一版）从盟约关列表隐藏。
const SEASON_KIND = { act1vautochess: 'v1', act1autochess: 'covenant', act2autochess: 'covenant2' };
function collectLevels() {
  const ALL = [];
  for (const season of SEASONS) {
    const dir = path.join(DATA_ROOT, 'levels', 'activities', season);
    if (!fs.existsSync(dir)) continue;
    const seasonList = [];
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(new RegExp('^level_' + season + '_m(\\d+)\\.json$'));
      if (!m) continue;
      const idx = parseInt(m[1], 10);
      const name = (season === 'act1vautochess')
        ? (KNOWN_V1[idx] || ('盟约·第' + idx + '关'))
        : (SEASON_CN[season] + '·第' + idx + '关');
      seasonList.push({ season, idx, file: f, name, id: season + '_m' + String(idx).padStart(2, '0'), kind: SEASON_KIND[season] });
    }
    seasonList.sort((a, b) => a.idx - b.idx);
    ALL.push(...seasonList);
  }
  return ALL;
}
const LEVELS = collectLevels();

function canWalk(m, motion) {
  if (motion === 'FLY') return m === 'ALL' || m === 'FLY_ONLY';
  return m === 'ALL' || m === 'WALK_ONLY';
}
function passable(mp, tiles, r, c) {
  if (r >= 0 && r < mp.length && c >= 0 && c < mp[r].length) {
    const idx = mp[r][c];
    if (idx !== null && idx !== undefined && idx < tiles.length) return tiles[idx]['passableMask'] || 'ALL';
  }
  return 'FORBIDDEN';
}
function bfs(mp, tiles, a, b, motion) {
  if (a[0] === b[0] && a[1] === b[1]) return [a];
  const prev = new Map(); prev.set(a.join(','), null);
  const q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur[0] === b[0] && cur[1] === b[1]) break;
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const n = [cur[0]+dr, cur[1]+dc];
      const key = n.join(',');
      if (prev.has(key)) continue;
      if (n[0] === b[0] && n[1] === b[1] || canWalk(passable(mp, tiles, n[0], n[1]), motion)) {
        prev.set(key, cur); q.push(n);
      }
    }
  }
  if (!prev.has(b.join(','))) { return null; }
  const p = []; let c = b;
  while (c) { p.push(c); const cc = prev.get(c.join(',')); c = cc; }
  return p.reverse();
}
function buildSegment(mp, tiles, seg, motion) {
  if (!seg || !seg.length) return [];
  const out = [Object.assign({}, seg[0])];
  for (let i = 1; i < seg.length; i++) {
    const a = [out[out.length-1].r, out[out.length-1].c];
    const b = [seg[i].r, seg[i].c];
    let p = bfs(mp, tiles, a, b, motion);
    const cells = p ? p.slice(1) : [b];
    cells.forEach((cr, j) => {
      const wp = { r: cr[0], c: cr[1] };
      if (j === cells.length-1 && seg[i].wait) wp.wait = seg[i].wait;
      out.push(wp);
    });
  }
  return out;
}
function buildRoute(mp, tiles, r) {
  const sp = r['startPosition'] || { row:0, col:0 };
  const ep = r['endPosition'] || { row:0, col:0 };
  const motion = r['motionMode'] || 'WALK';
  const segs = []; let cur = [{ r: sp.row, c: sp.col }];
  for (const cp of r['checkpoints'] || []) {
    const t = cp['type']; const pos = cp['position'] || {};
    const rr = pos['row'] || 0, cc = pos['col'] || 0;
    if (t === 'MOVE') { cur = cur || []; cur.push({ r: rr, c: cc }); }
    else if (t === 'WAIT_FOR_SECONDS') { if (cur && cur.length) cur[cur.length-1].wait = cp['time'] || 0; }
    else if (t === 'DISAPPEAR') { if (cur && cur.length) segs.push(cur); cur = null; }
    else if (t === 'APPEAR_AT_POS') cur = [{ r: rr, c: cc }];
  }
  if (cur === null) cur = [];
  if (cur.length) {
    const last = cur[cur.length-1];
    if (last.r !== ep.row || last.c !== ep.col) cur.push({ r: ep.row, c: ep.col });
  }
  if (cur.length) segs.push(cur);
  return { motion, segs: segs.map(s => buildSegment(mp, tiles, s, motion)) };
}
// 红门(tile_start)→蓝门(tile_end) BFS 路线，紫门(telin→telout) 处切分 segs（引擎在 seg 间瞬间传送）
// 替代旧 buildRoute：旧版用关卡文件的 startPosition/endPosition，这些坐标在 mapData 里是 tile_forbidden 禁格，
// 导致敌人出生在禁格、终点也是禁格（而非蓝门），走完即被漏怪判负。
function computeRoutes(grid, passableM) {
  const rows = grid.length, cols = grid[0].length;
  const starts = [], ends = [], telins = [], telouts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = grid[r][c];
    if (k === 'tile_start') starts.push([r, c]);
    else if (k === 'tile_end') ends.push([r, c]);
    else if (k === 'tile_telin') telins.push([r, c]);
    else if (k === 'tile_telout') telouts.push([r, c]);
  }
  telins.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  telouts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pair = {};
  telins.forEach((t, i) => { if (telouts[i]) pair[t[0] + ',' + t[1]] = telouts[i]; });
  const key = n => n[0] + ',' + n[1];
  const walkable = (r, c) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const m = passableM[r][c];
    return m === 'ALL' || m === 'WALK_ONLY';
  };
  function bfs(a, b) {
    const prev = {}; prev[key(a)] = null;
    const q = [a];
    while (q.length) {
      const cur = q.shift();
      if (cur[0] === b[0] && cur[1] === b[1]) break;
      if (pair[key(cur)]) {   // 踩上 telin 必须传送（只走传送边）
        const n = pair[key(cur)];
        if (!(key(n) in prev)) { prev[key(n)] = cur; q.push(n); }
        continue;
      }
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [cur[0] + dr, cur[1] + dc];
        if (key(n) in prev) continue;
        if ((n[0] === b[0] && n[1] === b[1]) || walkable(n[0], n[1])) { prev[key(n)] = cur; q.push(n); }
      }
    }
    if (!(key(b) in prev)) return null;
    const path = []; let c = b;
    while (c) { path.push(c); c = prev[key(c)]; }
    return path.reverse();
  }
  const routes = [];
  for (const st of starts) {
    let best = null;
    for (const en of ends) {
      const p = bfs(st, en);
      if (p && (!best || p.length < best.length)) best = p;
    }
    if (!best) continue;
    const segs = []; let cur = [];
    for (let i = 0; i < best.length; i++) {
      const node = best[i];
      cur.push({ r: node[0], c: node[1] });
      if (pair[key(node)] && i + 1 < best.length && key(best[i + 1]) === key(pair[key(node)])) {
        segs.push(cur); cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    routes.push({ motion: 'WALK', segs });
  }
  return routes;
}

function extractLevel(season, file) {
  const lv = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, 'levels', 'activities', season, file), 'utf8'));
  const md = lv.mapData; const mp = md.map; const tiles = md.tiles;
  const grid = mp.map(row => row.map(idx => (idx != null && idx < tiles.length) ? tiles[idx].tileKey : 'tile_forbidden'));
  const buildable = mp.map((row, r) => row.map((idx, c) => {
    const k = grid[r][c];
    if (k === 'tile_achand' || k === 'tile_acshop') return 'NONE';   // 手牌区/驳船区：功能格不参战，禁止部署（数据层干净，避免"绿的可部署+行为不可部署"语义混乱）
    return (idx != null && idx < tiles.length) ? tiles[idx].buildableType || 'NONE' : 'NONE';
  }));
  const passableM = mp.map(row => row.map(idx => (idx != null && idx < tiles.length) ? tiles[idx].passableMask || 'ALL' : 'ALL'));
  const height = mp.map(row => row.map(idx => (idx != null && idx < tiles.length) ? tiles[idx].heightType || '' : ''));
  const routes = computeRoutes(grid, passableM);
  const waves = [];
  for (const w of lv.waves || []) {
    for (const fr of w.fragments || []) {
      for (const a of fr.actions || []) {
        if (a.actionType === 'SPAWN') waves.push({ enemyId: a.key, count: a.count || 1, interval: a.interval || 5.0, routeIndex: a.routeIndex || 0, preDelay: (fr.preDelay || 0) + (w.preDelay || 0) });
      }
    }
  }
  return { levelId: path.basename(file, '.json'), rows: grid.length, cols: (grid[0]||[]).length, halfBoard: (grid[0]||[]).length >= 24, grid, buildable, passable: passableM, height, routes, waves };
}

const bd = JSON.parse(fs.readFileSync(path.join(WEB, 'battle_data.json'), 'utf8'));
const enemies = bd.enemies, operators = bd.operators;
const levels = [];
for (const L of LEVELS) {
  const level = extractLevel(L.season, L.file);
  const okGrid = level.rows > 0 && level.cols > 0;
  const okRoutes = level.routes.every(r => r.segs && r.segs.length && r.segs.every(s => s.length >= 1)) && level.routes.length > 0;
  const okWaves = level.waves.length > 0 && level.waves.every(w => enemies[w.enemyId]);
  const ok = okGrid && okRoutes && okWaves;
  levels.push({ name: L.name, id: L.id, kind: L.kind, ok: ok, level: level });
  console.log((ok ? 'OK   ' : 'FAIL ') + L.name, L.id, 'rows', level.rows, 'cols', level.cols, 'routes', level.routes.length, 'waves', level.waves.length, 'grid', okGrid, 'routesOk', okRoutes, 'wavesOk', okWaves);
}
const good = levels.filter(l => l.ok).map(l => ({ name: l.name, id: l.id, kind: l.kind, level: l.level }));
const out = { operators, enemies, levels: good };
fs.writeFileSync(path.join(WEB, 'battle_levels.json'), JSON.stringify(out, null, 0));
console.log('WROTE', good.length, 'levels -> web/battle_levels.json');
