(function(root){
 'use strict';
 const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
 let previous=null,current=null,arrived=0,interval=100,viewKey='',eliteIds=null,merges=[],endAt=null,endTime=null;
 function ingest(board,key,at=now()){
  if(key!==viewKey||!board||board.phase!=='battle'||!current||board.time<current.time){previous=null;interval=100;}
  else {previous=current;interval=Math.max(40,Math.min(250,at-arrived));if(at-arrived>600)previous=null;}
  current=board;arrived=at;viewKey=key;
 }
 function sample(board,at=now()){
  if(board!==current||!previous||board.over)return board;
  const fraction=Math.min(1,Math.max(0,(at-arrived)/interval));
  const interpolate=key=>{const old=new Map((previous[key]||[]).map(o=>[o.visualId??o.id,o]));return (board[key]||[]).map(o=>{
   const p=old.get(o.visualId??o.id);if(!p||o.visualId==null&&o.id==null||o.seg!==p.seg||Math.hypot((o.x||0)-(p.x||0),(o.y||0)-(p.y||0))>2)return o;
   return {...o,...(Number.isFinite(o.x)?{x:p.x+(o.x-p.x)*fraction,y:p.y+(o.y-p.y)*fraction}:{})};
  });};
  return {...board,time:previous.time+(board.time-previous.time)*fraction,enemies:interpolate('enemies'),projectiles:interpolate('projectiles')};
 }
 function observeSession(session,key,at=now()){
  const ids=new Set((session?.ops||[]).filter(o=>o.elite).map(o=>o.id));
  if(eliteIds?.key===key){for(const o of session.ops||[])if(o.elite&&!eliteIds.ids.has(o.id))merges.push({id:o.id,at});}
  else merges=[];
  eliteIds={key,ids};
 }
 function frostSources(board){return (board.enemies||[]).filter(e=>!e.dead&&e.attackSpeedAura?.amount<0);}
 function activeOperator(o,board){return !o.dead&&o.col!=null&&(o.deployAt??0)<=board.time&&(o.deployT??1)>=1;}
 function frostAmount(board,op){
  if(!activeOperator(op,board))return 0;
  return frostSources(board).reduce((v,e)=>Math.hypot(e.x-op.col,e.y-op.row)<=e.attackSpeedAura.radius?Math.min(v,e.attackSpeedAura.amount):v,0);
 }
 function tileArea(ctx,x,y,r,tile){ctx.rect((x-r)*tile,(y-r)*tile,(r*2+1)*tile,(r*2+1)*tile);}
 // Areas use exactly the same radii/tiles as damage and buff checks. They sit under units.
 function drawAreas(ctx,board,tile){
  if(board.phase!=='battle'||board.over)return;
  ctx.save();
  for(const e of frostSources(board)){
   const x=(e.x+.5)*tile,y=(e.y+.5)*tile,r=e.attackSpeedAura.radius*tile;
   ctx.fillStyle='rgba(91,190,245,.075)';ctx.strokeStyle='rgba(135,218,255,.5)';ctx.lineWidth=1.5;
   ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(x,y,r*((board.time*.5)%1),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  for(const p of board.projectiles||[])if(p.kind==='bomb'&&p.life>0){
   ctx.fillStyle='rgba(255,127,48,.13)';ctx.strokeStyle='rgba(255,176,86,.8)';ctx.lineWidth=2;
   ctx.beginPath();tileArea(ctx,p.tx,p.ty,p.tileRadius,tile);ctx.fill();ctx.stroke();
  }
  for(const p of board.projectiles||[])if(p.kind==='enemy-static-area'&&p.life>0){
   ctx.fillStyle='rgba(255,127,48,.13)';ctx.strokeStyle='rgba(255,176,86,.8)';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc((p.tx+.5)*tile,(p.ty+.5)*tile,p.enemyActionPacket.radius*tile,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  for(const p of board.projectiles||[])if(p.kind==='death-cold'&&p.life>0){
   ctx.fillStyle='rgba(103,205,255,.12)';ctx.strokeStyle='#a2eaff';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc((p.tx+.5)*tile,(p.ty+.5)*tile,p.radius*tile,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  ctx.restore();
 }
 function draw(ctx,board,tile,at=now()){
  if(!board.over){endAt=null;endTime=null;}else if(endTime!==board.time){endTime=board.time;endAt=at;}
  const visualTime=board.time+(board.over?(at-endAt)/1000:0);
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  root.ArkHunter?.draw(ctx,board,tile);
  root.ArkMystic?.draw(ctx,board,tile);
  root.ArkDollkeeper?.draw(ctx,board,tile);
  root.ArkTactician?.draw(ctx,board,tile);
  root.ArkBlacknight?.draw(ctx,board,tile);
  root.ArkMedicDrone?.draw(ctx,board,tile);
  const elements={nervous:['神','#25bea2'],erosion:['蚀','#548eea'],burn:['灼','#f17c32'],apoptosis:['凋','#b09bcc'],rampage:['躁','#ed556b']};
  for(const o of board.operators||[])if(!o.dead)for(const d of o.releasedDrones||(o.releasedDrone?[o.releasedDrone]:[]))if(d.targetId!=null){
   const x=(d.x+.75+(d.index||0)*.14)*tile,y=(d.y+.2-(d.index||0)*.13)*tile;
   ctx.fillStyle='#b6f5ed';ctx.strokeStyle='#397773';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-tile*.10);ctx.lineTo(x+tile*.12,y);ctx.lineTo(x,y+tile*.10);ctx.lineTo(x-tile*.12,y);ctx.closePath();ctx.fill();ctx.stroke();
  }
  for(const token of board.summoneds||[])if(token.combatToken&&!token.tacticalToken&&!token.medicDrone&&!token.dead){
   const x=token.col*tile,y=token.row*tile;
   if(token.freeling){
    ctx.fillStyle='#173531';ctx.strokeStyle='#8ef3c2';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x+tile*.18,y+tile*.70);ctx.quadraticCurveTo(x+tile*.70,y+tile*.92,x+tile*.74,y+tile*.46);
    ctx.lineTo(x+tile*.82,y+tile*.28);ctx.lineTo(x+tile*.62,y+tile*.34);ctx.lineTo(x+tile*.47,y+tile*.16);ctx.lineTo(x+tile*.48,y+tile*.46);
    ctx.quadraticCurveTo(x+tile*.18,y+tile*.48,x+tile*.18,y+tile*.70);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#eefbd2';ctx.fillRect(x+tile*.63,y+tile*.42,tile*.05,tile*.05);
    ctx.fillStyle='#183029';ctx.fillRect(x+tile*.12,y+tile*.85,tile*.76,tile*.05);ctx.fillStyle='#73f6b0';ctx.fillRect(x+tile*.12,y+tile*.85,tile*.76*Math.max(0,token.hp/token.maxHp),tile*.05);
    ctx.fillStyle='#78ada0';ctx.fillRect(x+tile*.12,y+tile*.93,tile*.76*Math.max(0,Math.min(1,(token.expiresAt-board.time)/25)),tile*.025);continue;
   }
   if(token.obelisk){
    ctx.fillStyle='#826e40';ctx.strokeStyle='#f8db90';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x+tile*.5,y+tile*.02);ctx.lineTo(x+tile*.76,y+tile*.28);ctx.lineTo(x+tile*.72,y+tile*.84);ctx.lineTo(x+tile*.28,y+tile*.84);ctx.lineTo(x+tile*.24,y+tile*.28);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x+tile*.5,y+tile*.15);ctx.lineTo(x+tile*.5,y+tile*.76);ctx.stroke();
    ctx.fillStyle='#183029';ctx.fillRect(x+tile*.12,y+tile*.89,tile*.76,tile*.05);ctx.fillStyle='#efd17e';ctx.fillRect(x+tile*.12,y+tile*.89,tile*.76*Math.max(0,token.hp/token.maxHp),tile*.05);continue;
   }
   ctx.fillStyle='rgba(33,53,62,.95)';ctx.strokeStyle='#9adbdc';ctx.lineWidth=2;
   ctx.fillRect(x+tile*.15,y+tile*.06,tile*.7,tile*.8);ctx.strokeRect(x+tile*.15,y+tile*.06,tile*.7,tile*.8);
   ctx.beginPath();ctx.moveTo(x+tile*.3,y+tile*.14);ctx.lineTo(x+tile*.7,y+tile*.75);ctx.moveTo(x+tile*.7,y+tile*.14);ctx.lineTo(x+tile*.3,y+tile*.75);ctx.stroke();
   ctx.fillStyle='#183029';ctx.fillRect(x+tile*.12,y+tile*.89,tile*.76,tile*.05);
   ctx.fillStyle='#73f6b0';ctx.fillRect(x+tile*.12,y+tile*.89,tile*.76*Math.max(0,token.hp/token.maxHp),tile*.05);
  }
  for(const zone of board.operatorZones||[])if(zone.until>board.time){
   ctx.fillStyle='rgba(60,153,198,.16)';for(const [r,c]of zone.cells)ctx.fillRect(c*tile+2,r*tile+2,tile-4,tile-4);
  }
  for(const op of board.operators||[])if(!board.over&&frostAmount(board,op)<0){
   const x=(op.col+.5)*tile,iceX=(op.col+.8)*tile,y=(op.row+.25)*tile;
   ctx.strokeStyle='#a4e8ff';ctx.lineWidth=1.5;ctx.fillStyle='rgba(64,183,236,.12)';ctx.fillRect(op.col*tile+3,op.row*tile+3,tile-6,tile-6);
   for(let i=0;i<3;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(iceX+Math.cos(a)*tile*.11,y+Math.sin(a)*tile*.11);ctx.lineTo(iceX-Math.cos(a)*tile*.11,y-Math.sin(a)*tile*.11);ctx.stroke();}
   ctx.font='bold '+Math.max(7,tile*.13)+'px sans-serif';ctx.fillStyle='#c4f2ff';ctx.strokeStyle='#123748';ctx.lineWidth=2;
   const text=Math.round(frostAmount(board,op)*100)+'%';ctx.strokeText(text,x,(op.row+.85)*tile);ctx.fillText(text,x,(op.row+.85)*tile);
  }
  for(const p of board.projectiles||[])if(p.kind==='bomb'&&p.life>0){
   const t=Math.max(0,Math.min(1,(visualTime-p.launchedAt)/p.flightTime));
   const x=(p.sx+(p.tx-p.sx)*t+.5)*tile,y=(p.sy+(p.ty-p.sy)*t+.5)*tile-tile*(.35*(1-t)+Math.sin(t*Math.PI)*.5);
   ctx.strokeStyle='#ffcf7a';ctx.lineWidth=3;ctx.fillStyle='#49291f';ctx.beginPath();ctx.arc(x,y,tile*.13,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.fillStyle='#fff1b1';ctx.beginPath();ctx.arc(x+tile*.08,y-tile*.15,3,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#ff9e5877';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-(p.tx-p.sx)*tile*.12,y-tile*.3);ctx.stroke();
  }
  for(const op of [...(board.operators||[]),...(board.summoneds||[])]){
   if(board.over||!activeOperator(op,board))continue;
   if(op.medicBarrier?.until>board.time&&op.medicBarrier.amount>0){
    // A compact pale-blue shield bar above HP; no additional full-screen layer.
    const width=Math.min(tile-6,Math.max(2,(tile-6)*op.medicBarrier.amount/Math.max(1,op.maxHp)));
    ctx.fillStyle='#a9e7ff';ctx.fillRect((op.col+1)*tile-3-width,(op.row+1)*tile-14,width,3);
   }
   const state=root.ArkEnemyCold?.display(op,board.time);if(!state)continue;
   const x=(op.col+.5)*tile,y=(op.row+.65)*tile;
   ctx.fillStyle=state.label==='冻结'?'rgba(112,205,250,.33)':'rgba(112,205,250,.15)';
   ctx.fillRect(op.col*tile+3,op.row*tile+3,tile-6,tile-6);
   ctx.font='bold '+Math.max(9,tile*.15)+'px sans-serif';ctx.fillStyle='#daf5ff';ctx.strokeStyle='#123748';ctx.lineWidth=3;
   const label=state.label+' '+Math.ceil(state.seconds);ctx.strokeText(label,x,y);ctx.fillText(label,x,y);
  }
  for(const fx of board.combatEffects||[]){
   if(['doll-change','doll-blast','mystic-root-pulse'].includes(fx.kind))continue; // Drawn by their own renderer, not the bomb fallback.
   const age=visualTime-fx.at;if(age<0||age>=fx.duration)continue;
   const t=age/fx.duration,x=(fx.x+.5)*tile,y=(fx.y+.5)*tile;
   if(fx.kind==='enemy-melee-finish'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#ffe2a0';ctx.lineWidth=Math.max(2,tile*.045)*(1-t*.5);
    const r=tile*(.18+t*.28);ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);
    ctx.moveTo(x-r,y+r);ctx.lineTo(x+r,y-r);ctx.stroke();continue;
   }
   if(fx.kind==='released-drone-hit'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#a0e9f4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo((fx.sx+.5)*tile,(fx.sy+.5)*tile);ctx.lineTo(x,y);ctx.stroke();continue;
   }
   if(fx.kind==='ink-rise'){
    ctx.strokeStyle='#84dcb7';ctx.fillStyle='rgba(27,84,71,.25)';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse((fx.x+.5)*tile,(fx.y+.5)*tile,tile*.40,tile*.24,0,0,Math.PI*2);ctx.fill();ctx.stroke();continue;
   }
   if(fx.kind==='obelisk-rise'){
    ctx.globalAlpha=1-t;ctx.fillStyle='rgba(236,200,118,.2)';ctx.strokeStyle='#ffe3a0';ctx.lineWidth=2;
    for(const [r,c]of fx.cells||[])ctx.fillRect(c*tile+2,r*tile+2,tile-4,tile-4);
    ctx.beginPath();ctx.moveTo(x-tile*.2,y+tile*.2);ctx.lineTo(x,y-tile*(.1+t*.7));ctx.lineTo(x+tile*.2,y+tile*.2);ctx.stroke();continue;
   }
   if(fx.kind==='flow-pull'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#8cecdf';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,tile*fx.radius*(1-t),0,Math.PI*2);ctx.stroke();continue;
   }
   if(fx.kind==='hunter-reload'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#80ead1';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(x,y,tile*(.1+t*.22),0,Math.PI*2);ctx.stroke();continue;
   }
   if(fx.kind==='dp-gain'){
    ctx.globalAlpha=1-t;ctx.font='bold '+Math.max(9,tile*.17)+'px sans-serif';ctx.fillStyle='#a9ffe1';ctx.strokeStyle='#0c3028';ctx.lineWidth=2;
    const text='费用 +'+fx.amount;ctx.strokeText(text,x,y-t*tile*.35);ctx.fillText(text,x,y-t*tile*.35);continue;
   }
   if(fx.kind==='cold-blast'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#c9f2ff';ctx.fillStyle='rgba(133,215,255,.22)';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(x,y,tile*fx.radius*(.8+t*.2),0,Math.PI*2);ctx.fill();ctx.stroke();
    for(let i=0;i<12;i++){const a=i*Math.PI/6,r=tile*fx.radius*(.3+t*.7);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7);ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.stroke();}
    continue;
   }
   if(fx.kind==='element-burst'){
    ctx.globalAlpha=1-t;ctx.strokeStyle=elements[fx.type]?.[1]||'#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,tile*(.2+t*.55),0,Math.PI*2);ctx.stroke();continue;
   }
   if(fx.kind==='chain'){
    ctx.globalAlpha=1-t;ctx.strokeStyle=fx.color||'#bcb0ff';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo((fx.sx+.5)*tile,(fx.sy+.5)*tile);ctx.lineTo((fx.sx+fx.x+1)*tile/2+tile*.08,(fx.sy+fx.y+1)*tile/2-tile*.08);ctx.lineTo(x,y);ctx.stroke();continue;
   }
   if(fx.kind==='operator-blast'){
    ctx.globalAlpha=1-t;ctx.strokeStyle=fx.aftershock?'#b5e6ff':'#ffdaa5';ctx.fillStyle=fx.aftershock?'rgba(144,220,255,.15)':'rgba(255,204,141,.17)';ctx.lineWidth=fx.aftershock?2:3;
    ctx.beginPath();ctx.arc(x,y,tile*fx.radius*(.75+t*.25),0,Math.PI*2);ctx.fill();ctx.stroke();continue;
   }
   if(fx.kind==='sword-rain'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#fff2ae';ctx.lineWidth=Math.max(1.5,tile*.035);
    const fall=Math.min(1,t*3);
    for(const [row,col]of fx.cells||[]){
     const cx=(col+.5)*tile,cy=(row+.5)*tile;
     ctx.beginPath();ctx.moveTo(cx,cy-tile*(.65-.45*fall));ctx.lineTo(cx,cy+tile*.2*fall);
     ctx.moveTo(cx-tile*.1,cy-tile*.08);ctx.lineTo(cx+tile*.1,cy-tile*.08);ctx.stroke();
    }
    continue;
   }
   if(fx.kind==='medic-blood'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#ff788d';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y,tile*(.18+t*.25),0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-tile*.1,y);ctx.lineTo(x,y-tile*.16);ctx.lineTo(x+tile*.1,y);ctx.stroke();continue;
   }
   if(fx.kind==='heal'){
    ctx.globalAlpha=1-t;ctx.strokeStyle='#83ffc3';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo((fx.sx+.5)*tile,(fx.sy+.5)*tile);ctx.lineTo(x,y);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,tile*(.18+t*.25),0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-tile*.08,y);ctx.lineTo(x+tile*.08,y);ctx.moveTo(x,y-tile*.08);ctx.lineTo(x,y+tile*.08);ctx.stroke();continue;
   }
   ctx.globalAlpha=1-t;ctx.fillStyle=t<.18?'rgba(255,241,180,.6)':'rgba(255,117,35,.2)';ctx.strokeStyle='#ffb45f';ctx.lineWidth=3;
   ctx.beginPath();tileArea(ctx,fx.x,fx.y,fx.tileRadius,tile);ctx.fill();ctx.stroke();
   ctx.beginPath();ctx.arc(x,y,tile*(.15+t*(fx.tileRadius+1.1)),0,Math.PI*2);ctx.stroke();
   for(let i=0;i<10;i++){const a=i*Math.PI/5,r=tile*(.2+t*1.2);ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);ctx.lineTo(x+Math.cos(a)*(r+tile*.2),y+Math.sin(a)*(r+tile*.2));ctx.stroke();}
  }
  ctx.globalAlpha=1;
  for(const unit of [...(board.enemies||[]),...(board.operators||[]),...(board.summoneds||[])]){
   if(unit.col!=null&&!activeOperator(unit,board))continue;
   const state=root.ArkElements?.display(unit,board.time);if(!state)continue;
   const [label,color]=elements[state.type],x=((unit.x??unit.col)+.5)*tile,y=((unit.y??unit.row)+(unit.col!=null?.76:.92))*tile,w=tile*.72,h=Math.max(5,tile*.065);
   ctx.fillStyle='rgba(8,16,24,.92)';ctx.fillRect(x-w/2-tile*.12,y-h*1.8,w+tile*.24,h*2.6);
   ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.strokeRect(x-w/2,y,w,h);
   ctx.fillStyle=state.burst?color:'#fff';ctx.fillRect(x-w/2+1,y+1,(w-2)*state.ratio,h-2);
   ctx.font='bold '+Math.max(8,tile*.12)+'px sans-serif';ctx.fillStyle=state.burst?'#fff':color;
   ctx.fillText(label+(state.burst?' '+state.seconds.toFixed(1)+'s':' '+Math.round(state.value)+'/'+state.threshold),x,y-h*.85,w+tile*.15);
  }
  for(const hit of board.damageFeedback||[]){const age=(visualTime-hit.at)*4;if(age<0||age>1.4)continue;
   ctx.globalAlpha=Math.min(1,(1.4-age)/.5);ctx.font='bold '+(Math.max(16,tile*.27)*.7)+'px sans-serif';ctx.lineWidth=2.1;ctx.strokeStyle='#091016';ctx.fillStyle=hit.critical?'#ff4d45':hit.damageType==='elemental'?'#ceb0ff':'#fff0cc';
   const x=(hit.x+.5)*tile+((hit.id%3)-1)*9,y=(hit.y+.15)*tile-age*tile*.4,text=String(hit.amount)+(hit.critical?'!':'');ctx.strokeText(text,x,y);ctx.fillText(text,x,y);
  }
  merges=merges.filter(e=>at-e.at<1000);
  for(const event of merges){const op=[...(board.operators||[]),...(board.bench||[])].find(o=>o.id===event.id);if(!op||op.col==null)continue;
   const t=(at-event.at)/1000,x=(op.col+.5)*tile,y=(op.row+.5)*tile;ctx.globalAlpha=1-t;ctx.strokeStyle='#ffdf72';ctx.lineWidth=3;
   ctx.beginPath();ctx.arc(x,y,tile*(.3+t*.7),0,Math.PI*2);ctx.stroke();
   for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=tile*(.3+t*.7);ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*r,y+Math.sin(angle)*r);ctx.lineTo(x+Math.cos(angle)*(r+tile*.2),y+Math.sin(angle)*(r+tile*.2));ctx.stroke();}
  }
  ctx.restore();
 }
 root.ArkBattlePresentation={ingest,sample,observeSession,draw,drawAreas,frostAmount,reset(){previous=current=null;viewKey='';eliteIds=null;merges=[];endAt=endTime=null;}};
})(typeof window!=='undefined'?window:globalThis);
