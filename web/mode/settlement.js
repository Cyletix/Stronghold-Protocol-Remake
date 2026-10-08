// 两屏结算结构来自用户结算画面1/2；只显示真实本局记录，不推算服务器奖杯/经验/称号。
function recordRoundResult(win){
  if(!G||GMODE==='normal')return;
  G.roundResults ||= [];
  if(G.roundResults.some(r=>r.round===G.round))return;
  G.roundResults.push({round:G.round,win:!!win,hidden:!!G.secretCore,bossId:G.sourceBossId||null,
    life:Math.max(0,G.life),lifeLost:Math.max(0,(G.roundStartLife??G.life)-G.life),
    kills:B?.stats?.kills??0,leaks:B?.stats?.leaks??0,battleSeconds:B?.roundTime??0});
}
function makeSettlement(win){
  const results=(G.roundResults||[]).map(r=>({...r}));
  // “通过回合”包含带漏怪仍存活通过的普通轮；隐藏挑战单列，不把??伪装成第15普通轮。
  const passed=Math.max(0,(G.round||1)-1,...results.filter(r=>!r.hidden&&(r.win||r.life>0&&!r.bossId)).map(r=>r.round));
  return {win:!!win,passed,life:Math.max(0,G.life),elapsed:Math.floor(G.runElapsed||0),elapsedPartial:!!G.runElapsedPartial||G.runElapsed==null,
    historyPartial:results.filter(r=>r.round<G.round).length<Math.max(0,G.round-1),endedAt:new Date().toISOString(),
    playerName:PLAYER_NAME||'博士',bandName:G.bandName||'',bandId:G.band||'',difficulty:DIFFICULTY[curDiff]?.label||curDiff,
    results,hiddenAttempted:results.some(r=>r.hidden),hiddenDefeated:results.some(r=>r.hidden&&r.win),
    operators:G.ops.filter(o=>o.row!=null).map(o=>({charId:o.charId,name:o.entry?.name||o.charId,tier:o.entry?.tier||1,elite:!!o.elite,
      training:trainingProfile(o.entry,!!o.elite),equipment:Array.from({length:2},(_,i)=>{const e=o.equip?.[i];return e?{name:e.name,id:e.id}:null;})})),
    bonds:Object.entries(G.activeBonds||{}).filter(([,n])=>n>0).map(([id])=>({id,name:BOND_DEFS[id]?.name||id,layers:bondLayerCount(id)}))};
}
function settlementDuration(seconds){const n=Math.max(0,Math.floor(seconds||0));return String(Math.floor(n/3600)).padStart(2,'0')+':'+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function settlementPromotionIcon(phase){
  if(!phase)return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l16 12M20 5L4 17'+(phase>1?'M4 10l16 12M20 10L4 22':'')+'"/></svg>';
}
function settlementOperatorCard(o){
  const esc=escapeHtml,train=o.training||null,tier=Math.min(6,Math.max(1,o.tier||1));
  const phase=train?['精0','精一','精二'][train.evolve]:'练度未记录';
  const slots=Array.from({length:2},(_,i)=>{const equip=o.equipment?.[i],name=equip?.name||equip?.id;
    return '<div class="settlement-equip'+(equip?' equipped':' empty')+'" title="'+esc(name||'空装备槽')+'" aria-label="装备'+(i+1)+'：'+esc(name||'空')+'">'+(equip?'<img src="'+equipIconPath(equip.name||equip.id)+'" alt="'+esc(name)+'">':'<span aria-hidden="true">⊖</span>')+'</div>';
  }).join('');
  return '<article class="settlement-op'+(o.elite?' elite':'')+'" aria-label="'+esc(o.name)+' · '+(o.elite?'精锐 · ':'')+phase+(train?' '+train.level+'级':'')+'">'
    +'<div class="settlement-portrait"><img class="settlement-avatar" src="avatars/'+esc(o.charId)+'.png" alt="'+esc(o.name)+'">'
    +'<img class="settlement-tier" src="ui/autochess/autochess_level_'+tier+'.png" alt="'+tier+'阶">'
    +'<div class="settlement-training" title="'+phase+(train?' · '+train.level+'级':'')+'">'+settlementPromotionIcon(train?.evolve)+'<b>'+(train?train.level:'—')+'</b></div>'
    +'<span class="settlement-name">'+esc(o.name)+'</span>'+(o.elite?'<span class="settlement-elite" title="精锐">◆</span>':'')+'</div>'
    +'<div class="settlement-equipment">'+slots+'</div></article>';
}
function renderSettlement(page=1){
  const el=document.getElementById('settlement');if(!el||!G?.settlement)return;
  const s=G.settlement,esc=escapeHtml;
  const duration=(s.elapsedPartial?'继续存档后用时 ':'本局用时 ')+settlementDuration(s.elapsed)+(s.elapsedPartial?'（此前用时未知）':'');
  const head='<div class="settlement-head"><span>'+esc(s.difficulty)+' · '+(curMatch==='team'?'同盟模拟':'独立模拟')+'</span><span>'+page+' / 2</span></div>';
  const title='<h1>'+(s.win?'模拟完成':'模拟结束')+'</h1>';
  if(page===1){
    const cards=s.operators.map(settlementOperatorCard).join('');
    const emptySlots=Array.from({length:Math.max(0,10-s.operators.length)},()=>'<article class="settlement-op vacant" aria-label="空干员栏位"><span>NO INFO</span></article>').join('');
    const bonds=s.bonds.map(b=>'<div class="settlement-bond" title="'+esc(b.name)+' · '+b.layers+'层"><img src="bond_avatars/icon_'+esc(b.id)+'.png" alt="'+esc(b.name)+'"><b>'+b.layers+'</b></div>').join('');
    el.innerHTML='<div class="settlement-sheet">'+head+'<div class="settlement-personal"><section>'+title+'<p class="settlement-label">通过回合</p><strong class="settlement-round">'+s.passed+'</strong><p>'+esc(s.playerName)+' · '+esc(s.bandName)+'</p><p>'+(s.hiddenAttempted?(s.hiddenDefeated?'隐藏领袖已击败':'已完成常规领袖 · 隐藏挑战未通过'):'')+'</p></section><section class="settlement-deployment"><div class="settlement-roster">'+cards+emptySlots+'</div><div class="settlement-bonds" aria-label="已激活盟约与层数">'+(bonds||'<span>暂无已激活盟约</span>')+'</div></section></div><footer><span>'+duration+'</span><button onclick="renderSettlement(2)">下一步 →</button></footer></div>';
  }else{
    const rows=s.results.map(r=>'<tr><td>'+(r.hidden?'??':r.round)+'</td><td>'+(r.win?'作战完成':'未能完美防守')+'</td><td>'+r.kills+'</td><td>'+r.leaks+'</td><td>'+r.lifeLost+'</td></tr>').join('');
    el.innerHTML='<div class="settlement-sheet">'+head+title+'<div class="settlement-overview"><article><img src="'+avatarUrlForBand({bandId:s.bandId})+'" alt=""><h2>'+esc(s.playerName)+'</h2><p>'+esc(s.bandName)+'</p><p>通过回合 <b>'+s.passed+'</b></p><p>剩余生命 '+s.life+'</p></article><section><h2>作战回顾</h2>'+(s.historyPartial?'<p>旧存档未记录此前回合的详细统计</p>':'')+'<div class="settlement-table"><table><thead><tr><th>回合</th><th>结果</th><th>击杀</th><th>漏怪</th><th>失去生命</th></tr></thead><tbody>'+rows+'</tbody></table></div></section></div><footer><span>'+duration+'</span><button class="secondary" onclick="renderSettlement(1)">上一页</button><button onclick="closeSettlement();backToMenu()">返回主页</button></footer></div>';
  }
  el.style.display='flex';
}
function showSettlement(win){if(!G)return;G.settlement ||= makeSettlement(win);renderSettlement(1);}
function closeSettlement(){const el=document.getElementById('settlement');if(el){el.style.display='none';el.innerHTML='';}}
window.updateRunClock=function(dt){if(G&&GMODE!=='normal'&&['rest','battle'].includes(G.phase))G.runElapsed=(G.runElapsed||0)+Math.max(0,dt);};
