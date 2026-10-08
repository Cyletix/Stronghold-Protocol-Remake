const fs = require('fs');
const D = JSON.parse(fs.readFileSync('D:/OneDrive/Project/卫戍协议私服/web/battle_data.json', 'utf8'));
function dist(a,b){ const ar=a.row??Math.round(a.y??0), ac=a.col??Math.round(a.x??0), br=b.row??Math.round(b.y??0), bc=b.col??Math.round(b.x??0); return Math.max(Math.abs(ar-br), Math.abs(ac-bc)); }
const op = {row:4, col:6};
const en = {x:6.2, y:4.0};
console.log('dist(op,en) 应为~2:', dist(op, en));
const rt = D.level.routes[0];
console.log('route[0] 长度:', rt.length, '起点:', rt[0], '终点:', rt[rt.length-1]);
let x = rt[0][1], y = rt[0][0], cp = 1;
const speed = 1.1, dt = 0.5;
for (let i=0;i<20;i++) {
  const t = rt[cp];
  const dx = t[1]-x, dy = t[0]-y, d = Math.hypot(dx,dy), step = speed*dt;
  if (d <= step) { cp++; x=t[1]; y=t[0]; if (cp>=rt.length) break; }
  else { x += dx/d*step; y += dy/d*step; }
}
console.log('20 tick 后: cp=', cp, '/', rt.length, ' pos=(', x.toFixed(1), ',', y.toFixed(1), ')');
console.log('波次数:', D.level.waves.length);
console.log('第一波:', JSON.stringify(D.level.waves[0]));
console.log('可部署格数量:', D.level.buildable.flat().filter(b=>b==='MELEE'||b==='ALL').length);