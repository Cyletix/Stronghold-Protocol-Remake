'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');
const web = path.join(__dirname, '..', 'web');
const source = fs.readFileSync(path.join(web, 'mode.js'), 'utf8');
const handlers = {}, windowHandlers = {};
const track = { style:{}, scrollWidth:900 }, classes = new Set();
const viewport = { clientWidth:300, classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}, addEventListener:(t,f)=>handlers[t]=f };
const ctx = { document:{getElementById:id=>id==='bonds'?viewport:track}, window:{addEventListener:(t,f)=>windowHandlers[t]=f} };
vm.createContext(ctx);
// 执行真实函数，驱动输入事件；不依赖浏览器全局状态。
const dragStart = source.indexOf('function setupBondsDrag()');
vm.runInContext(source.slice(dragStart, source.indexOf('window.viewMode =', dragStart)), ctx);
vm.runInContext(source.slice(source.indexOf('function rangeGridHtml('), source.indexOf('function renderOpInfo(')), ctx);
ctx.setupBondsDrag();
const down = x => handlers.pointerdown({button:0,pointerId:1,clientX:x});
const move = x => windowHandlers.pointermove({pointerId:1,clientX:x});
const up = () => windowHandlers.pointerup({pointerId:1});
down(100); move(300);
let x = Number(track.style.transform.match(/translateX\((.*)px\)/)[1]);
assert(x > 0 && x < 56, 'left edge has bounded elastic offset');
up(); assert.equal(track.style.transform, 'translateX(0px)');
let suppressed = false; handlers.click({stopPropagation(){suppressed=true;},preventDefault(){}}); assert(suppressed);
down(600); move(-400); assert(Number(track.style.transform.match(/translateX\((.*)px\)/)[1]) < -600);
up(); assert.equal(track.style.transform, 'translateX(-600px)');
viewport.clientWidth=1000; viewport.resetBounds(); assert.equal(track.style.transform,'translateX(0px)');
down(10); move(100); windowHandlers.pointercancel({pointerId:1}); assert.equal(track.style.transform,'translateX(0px)');
for(const grids of [[{row:0,col:0}], [{row:0,col:0},{row:2,col:3}]]) assert(ctx.rangeGridHtml(grids).includes('--range-cell:20px'));
assert(ctx.rangeGridHtml([{row:0,col:0},{row:6,col:8}]).includes('--range-cell:9px'));
for(const name of ['vanguard','guard','defender','sniper','caster','medic','supporter','specialist']) {
  const png = fs.readFileSync(path.join(web,'assets/profession_icons',name+'.png'));
  assert.equal(png.subarray(1,4).toString(),'PNG'); assert(png.readUInt32BE(16)>0 && png.readUInt32BE(20)>0);
}
console.log('QUICK UI SMOKE OK: elastic boundaries, release/cancel, click suppression, resize, range sizing, 8 PNG assets');
