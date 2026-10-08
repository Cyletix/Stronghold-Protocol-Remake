(() => {
  'use strict';

  const TOTALS = Object.freeze({
    operators: 64,
    enemies: 320,
    projectiles: 1500,
    particles: 4000,
    aoePerSecond: 200,
  });
  const TICK_SECONDS = 1 / 30;
  const GRID = 24;
  const WARMUP_FRAMES = 30;
  const SAMPLE_FRAMES = 180;
  const stage = document.querySelector('#stage');
  const ctx = stage.getContext('2d', { alpha: false });
  const statusEl = document.querySelector('#status');
  const resultEl = document.querySelector('#result');
  const observedLongTasks = [];
  const longTaskObserver = typeof PerformanceObserver !== 'undefined'
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) observedLongTasks.push(entry.duration);
      })
    : null;
  try { longTaskObserver?.observe({ type: 'longtask', buffered: true }); } catch (_) { /* unsupported */ }

  function rng32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentile(values, ratio) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
  }

  function stats(values) {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return {
      p50: +percentile(values, 0.50).toFixed(3),
      p95: +percentile(values, 0.95).toFixed(3),
      max: +Math.max(...values).toFixed(3),
      mean: +(sum / values.length).toFixed(3),
    };
  }

  function distribute(total, boardCount, boardIndex) {
    return Math.floor(total / boardCount) + (boardIndex < total % boardCount ? 1 : 0);
  }

  function makeEntities(count, random, extra) {
    return Array.from({ length: count }, (_, id) => ({
      id,
      x: random() * 24,
      y: random() * 16,
      vx: (random() - 0.5) * 1.7,
      vy: (random() - 0.5) * 1.7,
      life: 2 + random() * 5,
      cd: random() * 0.12,
      ...extra,
    }));
  }

  function makeBoard(boardCount, index, seed) {
    const random = rng32(seed + index * 7919);
    const surface = document.createElement('canvas');
    const viewportW = Math.max(480, Math.floor(1920 / (boardCount === 1 ? 1 : 2)));
    const viewportH = Math.max(270, Math.floor(1080 / (boardCount === 1 ? 1 : 2)));
    // 模拟现有 sceneCanvas：整张地图以屏幕相关分辨率逐帧重绘，再分成 24×24 块贴回。
    surface.width = viewportW;
    surface.height = viewportH;
    return {
      index,
      random,
      surface,
      surfaceCtx: surface.getContext('2d', { alpha: false }),
      operators: makeEntities(distribute(TOTALS.operators, boardCount, index), random, { range: 3.8 }),
      enemies: makeEntities(distribute(TOTALS.enemies, boardCount, index), random, { hp: 1000 }),
      projectiles: makeEntities(distribute(TOTALS.projectiles, boardCount, index), random, { target: 0 }),
      particles: makeEntities(distribute(TOTALS.particles, boardCount, index), random, { size: 1 + random() * 2 }),
      aoePerTick: TOTALS.aoePerSecond * TICK_SECONDS / boardCount,
      aoeCarry: 0,
    };
  }

  function makeScenario(boardCount) {
    return {
      boardCount,
      boards: Array.from({ length: boardCount }, (_, index) => makeBoard(boardCount, index, 0x51a7f00d)),
    };
  }

  function updateBoard(board) {
    const { enemies, operators, projectiles, particles } = board;
    for (const enemy of enemies) {
      enemy.x += enemy.vx * TICK_SECONDS;
      enemy.y += enemy.vy * TICK_SECONDS;
      if (enemy.x < 0 || enemy.x > 24) enemy.vx *= -1;
      if (enemy.y < 0 || enemy.y > 16) enemy.vy *= -1;
    }

    // 对齐当前 engine.js 的每干员 filter + sort 全量索敌路径，并施加高攻速。
    for (const operator of operators) {
      operator.cd -= TICK_SECONDS;
      if (operator.cd > 0) continue;
      const inRange = enemies.filter((enemy) => Math.hypot(enemy.x - operator.x, enemy.y - operator.y) <= operator.range);
      if (inRange.length) {
        inRange.sort((a, b) => Math.hypot(a.x - operator.x, a.y - operator.y) - Math.hypot(b.x - operator.x, b.y - operator.y));
        operator.cd = 0.12;
      }
    }

    // 大范围伤害同样走全量 filter，查询频率累计为四战场每秒 200 次。
    board.aoeCarry += board.aoePerTick;
    const aoeQueries = Math.floor(board.aoeCarry);
    board.aoeCarry -= aoeQueries;
    for (let query = 0; query < aoeQueries; query++) {
      const cx = board.random() * 24;
      const cy = board.random() * 16;
      enemies.filter((enemy) => Math.hypot(enemy.x - cx, enemy.y - cy) <= 6);
    }

    for (const projectile of projectiles) {
      const target = enemies[projectile.target++ % enemies.length];
      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.hypot(dx, dy) || 1;
      projectile.x += dx / distance * 0.35;
      projectile.y += dy / distance * 0.35;
    }
    for (const particle of particles) {
      particle.x += particle.vx * TICK_SECONDS;
      particle.y += particle.vy * TICK_SECONDS;
      particle.life -= TICK_SECONDS;
      if (particle.life <= 0) particle.life = 2 + board.random() * 5;
    }

    // 当前实现每 tick 以 filter 重建热数组；保留该分配行为作为基线。
    board.enemies = board.enemies.filter((enemy) => enemy.hp > 0);
    board.projectiles = board.projectiles.filter((projectile) => projectile.life > 0);
    board.particles = board.particles.filter((particle) => particle.life > 0);
  }

  function drawTerrainScene(board) {
    const surface = board.surface;
    const scene = board.surfaceCtx;
    const tileW = surface.width / 24;
    const tileH = surface.height / 16;
    scene.fillStyle = '#121820';
    scene.fillRect(0, 0, surface.width, surface.height);
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 24; col++) {
        scene.fillStyle = (row + col) % 2 ? '#263441' : '#2c3b49';
        scene.fillRect(col * tileW + 0.5, row * tileH + 0.5, tileW - 1, tileH - 1);
      }
    }
  }

  function drawDynamicScene(board, clear) {
    const surface = board.surface;
    const scene = board.surfaceCtx;
    const tileW = surface.width / 24;
    const tileH = surface.height / 16;
    if (clear) scene.clearRect(0, 0, surface.width, surface.height);
    scene.fillStyle = '#65d1ff';
    for (const operator of board.operators) {
      scene.fillRect(operator.x * tileW - 5, operator.y * tileH - 5, 10, 10);
    }
    scene.fillStyle = '#ff6b66';
    for (const enemy of board.enemies) {
      scene.beginPath();
      scene.arc(enemy.x * tileW, enemy.y * tileH, 5, 0, Math.PI * 2);
      scene.fill();
    }
    scene.fillStyle = '#ffd166';
    for (const projectile of board.projectiles) {
      scene.fillRect(projectile.x * tileW, projectile.y * tileH, 2, 2);
    }
    scene.fillStyle = 'rgba(210,235,255,.55)';
    for (const particle of board.particles) {
      scene.fillRect(particle.x * tileW, particle.y * tileH, particle.size, particle.size);
    }
  }

  function drawScene(board) {
    drawTerrainScene(board);
    drawDynamicScene(board, false);
  }

  function compositeWarped(board, viewport, destination, sourceOverride) {
    const target = destination || ctx;
    const source = sourceOverride || board.surface;
    const cellW = source.width / GRID;
    const cellH = source.height / GRID;
    target.save();
    target.beginPath();
    target.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    target.clip();
    for (let row = 0; row < GRID; row++) {
      const v = row / (GRID - 1);
      const squeeze = 0.84 + v * 0.16;
      for (let col = 0; col < GRID; col++) {
        const sx = col * cellW;
        const sy = row * cellH;
        const dw = viewport.w / GRID * squeeze + 1;
        const dh = viewport.h / GRID + 1;
        const dx = viewport.x + viewport.w * (1 - squeeze) / 2 + col * viewport.w / GRID * squeeze;
        const dy = viewport.y + row * viewport.h / GRID;
        target.drawImage(source, sx, sy, cellW + 1, cellH + 1, dx, dy, dw, dh);
      }
    }
    target.restore();
  }

  function prepareLayered(scenario) {
    const cols = scenario.boardCount === 1 ? 1 : 2;
    const rows = scenario.boardCount === 1 ? 1 : 2;
    const viewportW = stage.width / cols;
    const viewportH = stage.height / rows;
    for (const board of scenario.boards) {
      const terrain = board.surface;
      drawTerrainScene(board);
      const projected = document.createElement('canvas');
      projected.width = viewportW; projected.height = viewportH;
      compositeWarped(board, { x:0, y:0, w:viewportW, h:viewportH }, projected.getContext('2d'), terrain);
      board.terrainProjected = projected;
      const dynamicSurface = document.createElement('canvas');
      dynamicSurface.width = terrain.width; dynamicSurface.height = terrain.height;
      board.surface = dynamicSurface; board.surfaceCtx = dynamicSurface.getContext('2d');
    }
  }

  function renderScenario(scenario, pipeline) {
    const cols = scenario.boardCount === 1 ? 1 : 2;
    const rows = scenario.boardCount === 1 ? 1 : 2;
    const viewportW = stage.width / cols;
    const viewportH = stage.height / rows;
    ctx.fillStyle = '#0c1117';
    ctx.fillRect(0, 0, stage.width, stage.height);
    if (pipeline === 'layered') {
      for (const board of scenario.boards) {
        ctx.drawImage(board.terrainProjected, board.index % cols * viewportW, Math.floor(board.index / cols) * viewportH);
      }
    }
    const sceneStart = performance.now();
    for (const board of scenario.boards) {
      if (pipeline === 'layered') drawDynamicScene(board, true);
      else drawScene(board);
    }
    const compositeStart = performance.now();
    for (const board of scenario.boards) {
      compositeWarped(board, {
        x: board.index % cols * viewportW,
        y: Math.floor(board.index / cols) * viewportH,
        w: viewportW,
        h: viewportH,
      });
    }
    return { sceneMs: compositeStart - sceneStart, compositeMs: performance.now() - compositeStart };
  }

  async function benchmark(boardCount, pipeline) {
    const scenario = makeScenario(boardCount);
    if (pipeline === 'layered') prepareLayered(scenario);
    const simulation = [];
    const render = [];
    const sceneRedraw = [];
    const warpComposite = [];
    const total = [];
    let framesOver50Ms = 0;
    const longTaskStart = observedLongTasks.length;
    for (let frame = 0; frame < WARMUP_FRAMES + SAMPLE_FRAMES; frame++) {
      const start = performance.now();
      for (const board of scenario.boards) updateBoard(board);
      const afterSimulation = performance.now();
      const renderParts = renderScenario(scenario, pipeline);
      const end = performance.now();
      if (frame >= WARMUP_FRAMES) {
        simulation.push(afterSimulation - start);
        render.push(end - afterSimulation);
        sceneRedraw.push(renderParts.sceneMs);
        warpComposite.push(renderParts.compositeMs);
        total.push(end - start);
        if (end - start > 50) framesOver50Ms++;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      boards: boardCount,
      pipeline,
      objects: TOTALS,
      warpDrawImageCallsPerFrame: boardCount * GRID * GRID,
      cachedBackgroundDrawsPerFrame: pipeline === 'layered' ? boardCount : 0,
      samples: SAMPLE_FRAMES,
      simulationMs: stats(simulation),
      renderMs: stats(render),
      sceneRedrawMs: stats(sceneRedraw),
      warpCompositeMs: stats(warpComposite),
      totalMs: stats(total),
      framesOver50Ms,
      browserLongTasks: observedLongTasks.slice(longTaskStart).map((value) => +value.toFixed(1)),
    };
  }

  async function run() {
    const dpr = window.devicePixelRatio || 1;
    stage.width = Math.round(1920 * dpr);
    stage.height = Math.round(1080 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    statusEl.textContent = '单战场测试中';
    const single = await benchmark(1, 'current');
    statusEl.textContent = '四战场测试中';
    const four = await benchmark(4, 'current');
    statusEl.textContent = '四战场分层预览测试中';
    const layeredFour = await benchmark(4, 'layered');
    const memory = performance.memory ? {
      usedJSHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      totalJSHeapMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
      heapLimitMB: +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(1),
    } : null;
    const report = {
      schemaVersion: 1,
      benchmark: 'current-style-canvas2d-baseline',
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr },
      renderSurface: { width: stage.width, height: stage.height },
      fixedTickHz: 30,
      generatedAt: new Date().toISOString(),
      scenarios: { single, four },
      optimizedPreview: { four: layeredFour },
      memory,
      caveat: 'Deterministic synthetic workload modeled on engine.js full-array queries, per-tick filters, full-scene redraw and 24x24 warp. It is a regression baseline, not an exact gameplay FPS prediction.',
    };
    window.__PERF_RESULT__ = report;
    document.body.dataset.benchmarkState = 'complete';
    resultEl.textContent = JSON.stringify(report, null, 2);
    const withinBudget = four.simulationMs.p95 <= 6 && four.totalMs.p95 <= 16.7 && four.framesOver50Ms === 0;
    const lowHeadroom = 16.7 - four.totalMs.p95 < 3.34;
    statusEl.textContent = !withinBudget ? '完成：超过预算' : (lowHeadroom ? '完成：临界' : '完成：预算内');
    longTaskObserver?.disconnect();
  }

  run().catch((error) => {
    document.body.dataset.benchmarkState = 'failed';
    statusEl.textContent = '失败';
    resultEl.textContent = error.stack || String(error);
  });
})();
