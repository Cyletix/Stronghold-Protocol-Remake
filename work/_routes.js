const fs=require('fs');
const base='data/ArknightsGameData/zh_CN/gamedata/levels/activities/act1vautochess/';
const lv=JSON.parse(fs.readFileSync(base+'level_act1vautochess_01-01.json','utf8'));
const md=lv.mapData; const tiles=md.tiles; const mp=md.map;
const short={'tile_forbidden':'.','tile_road':'#','tile_floor':'_','tile_start':'R','tile_end':'B','tile_telin':'I','tile_telout':'O'};
function tileAt(row,col){ const idx=mp[row]?mp[row][col]:undefined; if(idx==null)return 'OUT'; const t=tiles[idx]||{}; return (short[t.tileKey]||t.tileKey||'?')+':'+ (t.buildableType||'-') +'/'+(t.passableMask||'-'); }
function posStr(p){ return p? ('['+p.row+','+p.col+']') : '(none)'; }
console.log('routes:', lv.routes.length);
lv.routes.forEach((r,i)=>{
  console.log('--- route',i,'---');
  console.log('  motionMode:', JSON.stringify(r.motionMode), ' start:', posStr(r.startPosition),'->',tileAt(r.startPosition.row,r.startPosition.col),' end:', posStr(r.endPosition),'->',tileAt(r.endPosition.row,r.endPosition.col));
  (r.checkpoints||[]).forEach((c,j)=>console.log('    cp'+j, c.type, 'pos', posStr(c.position),'->',tileAt(c.position.row,c.position.col), 'time', c.time, 'reach', c.reachDistance));
});
