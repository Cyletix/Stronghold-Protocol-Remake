'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'render', 'render-policy.js'), 'utf8');
const sandbox = { console, navigator: { deviceMemory: 16, hardwareConcurrency: 16 } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const render = sandbox.ArkRender;
if (!render || render.getProfile().id !== 'balanced') throw new Error('Auto quality must not infer a fast GPU from CPU/RAM.');
render.setQuality('high');
if(render.getProfile().id!=='high')throw new Error('Explicit high quality remains available.');
let changed = null;
const unsubscribe = render.onQualityChange((profile) => { changed = profile.id; });
render.setQuality('low');
if (changed !== 'low' || render.getProfile().warpGrid !== 12 || render.getProfile().projectileBudget !== 500) throw new Error('Quality change was not published.');
unsubscribe();

const rect = { colLeft: 4, colRight: 16, rowTop: 5, rowBot: 12 };
if (!render.isMapPointVisible(5, 6, rect, 0)) throw new Error('Visible point was culled.');
if (render.isMapPointVisible(2, 6, rect, 0)) throw new Error('Offscreen point was retained.');

let nextId = 0;
const pool = render.createObjectPool(() => ({ poolId: ++nextId }), 2);
const first = pool.acquire();
pool.release(first);
if (pool.acquire() !== first) throw new Error('Pool did not reuse the released object.');
if (pool.stats().created !== 1) throw new Error('Pool allocated unexpectedly.');

console.log('RENDER POLICY SMOKE OK');
