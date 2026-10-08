(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkSourceMap=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function pathBetween(level, a, b, motion, diagonal) {
  if(motion==='FLY')return [a,b];
  const key=p=>p.r+','+p.c, end=key(b), prev=new Map([[key(a),null]]),queue=[a];let head=0;
  const dirs=diagonal?[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1]];
  const can=(r,c)=>['ALL','WALK_ONLY'].includes(level.passable[r]?.[c]);
  if(!can(a.r,a.c)||!can(b.r,b.c))return null;
  while(head<queue.length){const p=queue[head++];if(key(p)===end)break;
    for(const [dr,dc]of dirs){const n={r:p.r+dr,c:p.c+dc},nk=key(n);if(prev.has(nk)||n.r<0||n.c<0||n.r>=level.rows||n.c>=level.cols)continue;
      if(!can(n.r,n.c))continue;
      if(dr&&dc&&(!can(p.r+dr,p.c)||!can(p.r,p.c+dc)))continue;
      prev.set(nk,p);queue.push(n);
    }
  }
  if(!prev.has(end))return null;
  const out=[];for(let p=b;p;p=prev.get(key(p)))out.push(p);return out.reverse();
}
function convertLevel(raw, warnings=[]) {
  const map=raw.mapData, field=(name,fallback)=>map.map.map(row=>row.map(i=>map.tiles[i]?.[name]??fallback));
  const level=raw.layout ? {...raw.layout,sourceRoutes:true} : {levelId:raw.levelId || raw.source,rows:map.map.length,cols:map.map[0].length,halfBoard:false,sourceRoutes:true,
    grid:field('tileKey','tile_forbidden'),buildable:field('buildableType','NONE'),passable:field('passableMask','FORBIDDEN'),height:field('heightType','')};
  // Source route rows count upward; mapData.map is stored top to bottom.
  // E.g. act1autochess_01 row 12 maps to array row 6, not the bench/separator below.
  const pointAt=position=>({r:level.rows-1-(position?.row??0),c:position?.col??0});
  if(!raw.layout){
    level.devices=(raw.predefines?.tokenInsts||[]).filter(t=>!t.hidden).map(t=>({id:t.inst.characterKey,...pointAt(t.position),direction:t.direction}));
    for(const t of level.devices){
      if(t.id==='trap_1105_accrate'){
        level.passable[t.r][t.c]='FLY_ONLY';level.buildable[t.r][t.c]='NONE';
      }else if(t.id==='trap_1106_achplat'){
        level.passable[t.r][t.c]='FLY_ONLY';level.buildable[t.r][t.c]='RANGED';level.height[t.r][t.c]='HIGHLAND';
      }
    }
    // These are inventory/service tiles even though native placement masks allow chess storage.
    for(let r=0;r<level.rows;r++)for(let c=0;c<level.cols;c++)if(['tile_achand','tile_acshop'].includes(level.grid[r][c]))level.buildable[r][c]='NONE';
  }
  level.routes=(raw.routes||[]).map((route,index)=>{
    const segs=[];let points=[pointAt(route.startPosition)],invalid=false;
    const flush=()=>{if(points?.length){const out=[points[0]];for(const point of points.slice(1)){const start=out[out.length-1];const path=pathBetween(level,start,point,route.motionMode,route.allowDiagonalMove);
      if(!path){warnings.push('route '+index+': unreachable waypoint');invalid=true;}else {const tail=path.slice(1);if(tail.length)Object.assign(tail[tail.length-1],point);else Object.assign(out[out.length-1],point);out.push(...tail);}}
      segs.push(out);}points=null;};
    for(const cp of route.checkpoints||[]){const p=pointAt(cp.position);
      if(cp.type==='MOVE'||cp.type==='PATROL_MOVE'){if(cp.type==='PATROL_MOVE')warnings.push('route '+index+': PATROL_MOVE executed once');(points ||= []).push(p);}
      else if(cp.type==='WAIT_FOR_SECONDS'){if(points?.length)points[points.length-1].wait=(points[points.length-1].wait||0)+(cp.time||0);}
      else if(cp.type==='DISAPPEAR')flush();
      else if(cp.type==='APPEAR_AT_POS')points=[p];
      else warnings.push('route '+index+': unsupported '+cp.type);
    }
    if(points){points.push(pointAt(route.endPosition));flush();}
    return invalid?{motion:route.motionMode,segs:[],error:'unreachable waypoint'}:{motion:route.motionMode,segs};
  });
  return level;
}
function convertBattle(layout, source, warnings=[]){
  const motions=new Map();
  for(const wave of source.waves||[])for(const fragment of wave.fragments||[])for(const action of fragment.actions||[]){
    if(action.actionType!=='SPAWN'||action.count===0)continue;
    const enemy=source.enemies[action.key];if(!enemy)continue;
    const set=motions.get(action.routeIndex)||new Set();set.add(enemy.flying?'FLY':'WALK');motions.set(action.routeIndex,set);
  }
  // The enemy's source motion determines traversal; some flying bosses reference nominal WALK routes.
  const routes=source.rawRoutes.map((route,i)=>{
    const types=motions.get(i);
    return types?.size===1?{...route,motionMode:[...types][0]}:route;
  });
  const result=convertLevel({layout,routes},warnings);
  result.activeRouteIndices=[...motions.keys()];
  return result;
}
return {convertLevel,convertBattle};
});
