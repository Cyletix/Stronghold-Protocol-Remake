(function(root){
  'use strict';
  // Render-only RNG: stable while inspecting a round, independent of shop/spawn RNG.
  function layout(level,section,wave,seed=''){
    const cells=[],cols=level.halfBoard?Math.ceil(level.cols/2):level.cols;
    const allowed=new Set(['tile_floor','tile_road','tile_acfloor','tile_acroad']);
    for(let r=section[0];r<section[1];r++)for(let c=0;c<cols;c++)if(allowed.has(level.grid[r]?.[c]))cells.push({r,c});
    const counts=new Map();for(const spawn of wave||[])if(spawn.enemyId)counts.set(spawn.enemyId,(counts.get(spawn.enemyId)||0)+1);
    let state=2166136261;for(const ch of String(seed)+JSON.stringify([...counts]))state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    // Farthest candidate selection spreads types across the usable area, while
    // cell jitter removes rows/columns and keeps the complete icon inside a tile.
    const used=[],positions=[];
    for(const [enemyId,count]of counts){
      if(!cells.length)break;
      let best=null,score=-1;
      for(let n=0;n<64;n++){
        const cell=cells[Math.floor(random()*cells.length)],p={r:cell.r+(random()-.5)*.32,c:cell.c+(random()-.5)*.32};
        const distance=used.length?Math.min(...used.map(q=>(p.r-q.r)**2+(p.c-q.c)**2)):random();
        if(distance>score){best=p;score=distance;}
      }
      used.push(best);positions.push({...best,enemyId,count,radius:.29});
    }
    const bounds=cells.length?{colLeft:Math.min(...cells.map(p=>p.c))-1,colRight:Math.max(...cells.map(p=>p.c))+2,rowTop:section[0],rowBot:section[1]}:null;
    return {positions,bounds};
  }
  root.ArkEnemyPreview={layout};
  if(typeof module==='object')module.exports=root.ArkEnemyPreview;
})(typeof window==='object'?window:globalThis);
