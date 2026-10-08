// ---- UI 渲染 ----
function renderAll() {
  if (!G) return;
  if(typeof renderGameDebug==='function')renderGameDebug();
  if(!window.__roomRemoteSimulation)window.ArkBattlePresentation?.observeSession(G,G);
  const saveButton=document.getElementById('save-run-btn');if(saveButton){saveButton.disabled=GMODE!=='auto'||G.phase!=='rest';saveButton.title=restSaveProblem()||'保存当前休整进度，下次从主菜单继续';}
  const note=document.getElementById('source-note');
  if(note){note.textContent=G.sourceWarnings?.length?'本关含简化机制':'';note.title=(G.sourceWarnings||[]).join('\n');}
  updateHud();
  if (G.phase !== 'battle') updateCountdown(G.prepareRemaining??60);
  if (GMODE === 'normal') {
    // 普通模式：无商店/装备/羁绊，手牌=全部干员（无上限），部署直接开战
    renderNormalHand();
    const sd = document.getElementById('shopdrawer'); if (sd) sd.style.display = 'none';
    const sf = document.getElementById('shop-fabs'); if (sf) sf.style.display = 'none';
    const bb = document.getElementById('bondbar'); if (bb) bb.style.display = 'none';
    const mg1 = document.getElementById('mag-band'); if (mg1) mg1.style.display = 'none';
    const mg2 = document.getElementById('mag-enemy'); if (mg2) mg2.style.display = 'none';
    closeIntel();
    // 候选区位置统一交给 layoutBench()
    renderSelected(); renderOpInfo(); updatePlacement();
  } else {
    renderShop(); renderHand(); renderBonds();
    renderSelected(); renderOpInfo(); updatePlacement();
    // 候选区位置统一交给 layoutBench()
    const sd = document.getElementById('shopdrawer'); if (sd) sd.style.display = '';
    const sf = document.getElementById('shop-fabs'); if (sf) sf.style.display = '';
    const bb = document.getElementById('bondbar'); if (bb) bb.style.display = '';
    const mg1 = document.getElementById('mag-band'); if (mg1) mg1.style.display = '';
    const mg2 = document.getElementById('mag-enemy'); if (mg2) mg2.style.display = '';
  }
  const sb = document.getElementById('start-btn');
  const nb = document.getElementById('next-btn');
  if (G.phase === 'rest') { sb.style.display='flex'; nb.style.display='none'; }
  else if (G.phase === 'battle') { sb.style.display='none'; nb.style.display = G.battleDone ? 'inline-block' : 'none'; }
  else { sb.style.display='none'; nb.style.display='none'; }
  syncShopDrawer();   // 战斗中自动收起商店，休整期恢复手动选择
  layoutBench();   // 卫戍协议候选实体在棋盘 tile_achand；普通模式保留 DOM 横排
  if(window.__syncHudReserve)window.__syncHudReserve();
}

// DOM 手牌只属于普通模式；卫戍协议候选实体由 engine 在 tile_achand 上绘制。
function layoutBench() {
  const bench = document.getElementById('bench');
  if (!bench) return;
  if (GMODE === 'normal') {
    bench.classList.remove('vertical');
    bench.style.display = 'flex';
    bench.style.left = ''; bench.style.right = ''; bench.style.top = ''; bench.style.bottom = '12px';
    bench.style.transform = 'translateX(-50%)'; bench.style.maxWidth = '';
    return;
  }
  bench.classList.remove('vertical');
  bench.style.display = 'none';
  bench.style.left = ''; bench.style.right = ''; bench.style.top = ''; bench.style.bottom = '';
  bench.style.transform = ''; bench.style.maxWidth = '';
}

// 可同时在场上的部署上限：本赛季 constData，不随调度中心等级增长。
function deployLimit() { return (GMODE === 'normal') ? Infinity : (G ? (SOURCE_BATTLES.seasons[G.seasonId]?.constData.maxBattleChessCnt ?? 8) + (G._deployBonus || 0) : 0); }   // _deployBonus：特殊装备「人事部文档」部署次数加成
// 供 engine 拖拽、松手和悬停共用；不把满员后的移动/交换误判成新增部署。
window.onCanDeploy = function(row, col, op=null, moving=null) {
  if(op?.isTactical)return tacticalCanPlace(op.ownerUnitId,row,col);
  if(B?.phase==='battle')return !!tacticalCopyTarget(row,col)&&!!G?.ops.some(o=>o.id===op?.id&&o.row==null);
  if (!G || G.phase !== 'rest') return false;
  const id=op?.id??drag?.op?.id??selectedHand??selBoardOp;
  const unit=G.ops.find(o=>o.id===id)||op||drag?.op;
  if(!unit)return isDeployable(row,col);
  // 装置不占干员名额，但仍不能放在禁部署格、干员或另一装置上。
  if(unit?.isTrap)return isDeployable(row,col)&&!G.ops.some(o=>o.row===row&&o.col===col)&&!B?.traps?.some(o=>o.row===row&&o.col===col);
  return !operatorPlacementProblem(unit,row,col,moving??(unit?.row!=null));
};
// 「剩余可放置角色」：休整期计算可部署上限减已部署数
function updatePlacement() {
  const el = document.getElementById('placement');
  if (!el) return;
  const num = document.getElementById('placement-num');
  if (G.phase === 'rest' && GMODE !== 'normal') {   // 普通模式无部署上限，隐藏「剩余可放置」
    const placed = G.ops.filter(o=>o.row!=null&&o.charId!=='char_4215_buddy').length;
    const remain = Math.max(0, deployLimit() - placed);
    el.style.display = 'block';
    if (num) num.textContent = remain;
  } else {
    el.style.display = 'none';
  }
}

function updateHud() {
  const phaseTxt = G.phase==='rest' ? '休息一下' : (G.phase==='battle' ? '作战中' : '已结束');
  const el = document.getElementById('hud');
  if (el) el.innerHTML =
    '<span class="hud-elm">回合 <b>'+G.round+'</b></span>'+
    '<span class="hud-elm">'+phaseTxt+'</span>'+
    '<span class="hud-elm">❤ <b>'+G.life+'</b></span>'+
    (G.modeId?'':'<span class="hud-elm">敌方 <b>'+Math.max(0,G.enemyHp)+'</b></span>')+
    '<span class="hud-elm">调度中心 <b>'+G.level+'</b>级</span>';
  updateBossHud();
}
function updateBossHud(){
  const el=document.getElementById('boss-health');if(!el)return;
  const info=G?.sourceBossId?sourceBossInfo(G.sourceBossId):null,base=info?.enemyId?BDATA.enemies[info.enemyId]:null;
  document.getElementById('topbar')?.classList?.toggle('has-boss',!!base&&['rest','battle'].includes(G?.phase));
  if(!base||!['rest','battle'].includes(G?.phase)){el.style.display='none';return;}
  const leader=G.phase==='battle'?B?.leader:null;
  const max=leader?.maxHp??base.maxHp,hp=Math.max(0,leader?.hp??max);
  const text=escapeHtml(base.name||info.enemyId)+' · '+Math.ceil(hp)+' / '+Math.ceil(max);
  el.style.display='block';el.innerHTML='<span>'+text+'</span><progress aria-label="领袖生命" value="'+hp+'" max="'+max+'"></progress>';
}
// 大号倒计时（顶部右侧）：战斗中显示回合剩余秒数，≤10s 变红；右侧 12 段 LED 进度柱自下而上点亮
window.updateCountdown = function(remain) {
  updateBossHud();
  const dp=document.getElementById('deployment-cost');
  if(dp){dp.style.display=G?.phase==='battle'&&!G.battleDone?'block':'none';
    if(B){const full=B.dp>=(B.dpMax??99),filled=full?30:Math.min(29,Math.floor((B.dpProgress||0)*30));
      const markup='<b>部署费用 <span>'+Math.floor(B.dp||0)+'</span></b><div class="dp-meter" role="progressbar" aria-label="'+(full?'部署费用已满':B.dp<0?'负费用：自然回复速度减半':'每游戏秒回复1费用')+'" aria-valuemin="0" aria-valuemax="30" aria-valuenow="'+filled+'">'+Array.from({length:30},(_,i)=>'<i'+(i<filled?' class="on"':'')+'></i>').join('')+'</div>';
      if(dp.innerHTML!==markup)dp.innerHTML=markup;}}
  const cd = document.getElementById('countdown-big');
  const meter = document.getElementById('round-progress');
  if (cd) {
    if (G && (G.phase === 'battle' || G.phase === 'rest')) {
      cd.textContent = Math.ceil(remain);
      if (cd.classList) cd.classList.toggle('danger', remain <= 10);
      if (cd.classList) cd.classList.toggle('standby', G.phase === 'rest');
    } else { cd.textContent = ''; }
  }
  // 普通休整与战斗各自重新计时，按当前阶段上限显示进度。
  if (meter && meter.children) {
    const segs = meter.children, n = segs.length || 12;
    const limit=G?.phase==='rest'?(G.prepareLimit??preparationLimit()):(B?.roundLimit??ROUND_LIMIT);
    const ratio = (G && (G.phase === 'battle' || G.phase === 'rest')) ? Math.min(1,Math.max(0, remain)/limit) : 0;
    const on = Math.round(ratio * n);
    for (let i = 0; i < n; i++) segs[i].classList.toggle('on', i < on);
  }
};

function equipArtSvg(id) {
  const common = 'viewBox="0 0 96 96" aria-hidden="true"';
  const art = {
    whammer:'<path d="M18 72 55 35l-8-8 10-10 22 22-10 10-8-8-37 37z" fill="#d8e0e8"/><path d="m53 14 29 29" stroke="#fff" stroke-width="5"/>',
    egir_blade:'<path d="M18 78 33 59 69 15l12 3-4 12-43 38z" fill="#d7edf2"/><path d="m27 67 13 13" stroke="#75d7e8" stroke-width="6"/><circle cx="25" cy="79" r="6" fill="#b9d7df"/>',
    shield:'<path d="M48 10 78 22v24c0 21-13 34-30 41-17-7-30-20-30-41V22z" fill="#c8d0d8"/><path d="M48 20v54c11-6 19-16 19-29V30z" fill="#7d8a98"/>',
    goliath:'<path d="M20 64V42c0-20 12-31 28-31s28 11 28 31v22H60V43H36v21z" fill="#d4c4a5"/><path d="M31 70h34l-6 16H37z" fill="#7b6b55"/>',
    scope:'<circle cx="48" cy="48" r="29" fill="none" stroke="#d6e6ef" stroke-width="9"/><circle cx="48" cy="48" r="9" fill="#8fe4ff"/><path d="M48 8v21M48 67v21M8 48h21M67 48h21" stroke="#d6e6ef" stroke-width="5"/>',
    grenade:'<path d="M30 38h36l7 43H23z" fill="#82917c"/><path d="M39 24h20v15H39zM54 17h20v8H54z" fill="#c7d1c1"/><path d="m29 54 38 17M67 54 29 71" stroke="#4e5b4b" stroke-width="5"/>',
    tea:'<path d="M35 12h26v13l-7 9v10c14 10 20 23 17 39H25c-3-16 3-29 17-39V34l-7-9z" fill="#d8e4df"/><path d="M31 65c9-8 25-10 34 0v13H31z" fill="#d99444"/><path d="M40 19h16" stroke="#fff" stroke-width="5"/>',
    ice:'<path d="m48 8 10 24 24 16-24 16-10 24-10-24L14 48l24-16z" fill="#bceeff"/><path d="M48 20v56M24 48h48M31 31l34 34M65 31 31 65" stroke="#54b9db" stroke-width="4"/>',
    abyssal:'<path d="M29 16h38l-5 13v48l-14 10-14-10V29z" fill="#c8d9df"/><path d="M36 47c8-8 16 8 25 0v27l-13 8-12-8z" fill="#613b79"/><path d="M39 37c4-7 14-7 18 0" fill="none" stroke="#8659a0" stroke-width="5"/>',
    sant:'<path d="m48 8 10 25 27 3-20 18 6 27-23-14-23 14 6-27-20-18 27-3z" fill="#f2d070"/><path d="M33 57 62 28M36 29l31 31" stroke="#8a6821" stroke-width="5"/>',
    ding:'<path d="M22 20h52v61H22z" fill="#d9c48f"/><path d="M31 20v61M39 32h25M39 43h25M39 54h18M39 65h21" stroke="#79643c" stroke-width="4"/><path d="m22 20 10-8h50v61l-8 8V20z" fill="none" stroke="#f4dfa6" stroke-width="4"/>',
    steam:'<circle cx="48" cy="52" r="27" fill="#aeb8c1"/><circle cx="48" cy="52" r="13" fill="#69c8df"/><path d="M48 8v17M22 17l12 15M74 17 62 32M12 47h14M70 47h14" stroke="#dfe7eb" stroke-width="7" stroke-linecap="round"/>'
  };
  return '<svg '+common+'>'+(art[id] || art.steam)+'</svg>';
}

function renderShop() {
  const bondCounts=fieldBondCounts(),bondClass=id=>(bondCounts[id]||0)>0?' present-bond':'';
  const reward=!!G._mergeReward,shopFrozen=!reward&&G.frozen;
  for(const id of ['refresh-btn','freeze-btn']){const button=document.getElementById(id);if(button)button.disabled=reward||G.phase!=='rest';}
  const refreshButton=document.getElementById('refresh-btn'),freeRefresh=G._garrisonFreeRefresh||0;
  if(refreshButton){refreshButton.title=freeRefresh?'免费刷新剩余 '+freeRefresh+' 次':'刷新商店';const badge=refreshButton.querySelector?.('.fab-cost');if(badge){badge.textContent=freeRefresh?'FREE':'①';badge.classList.toggle('free',freeRefresh>0);badge.setAttribute?.('aria-label',freeRefresh?'免费刷新，剩余 '+freeRefresh+' 次':'刷新费用 1');}}
  const upgrade=document.getElementById('shop-left');
  if(upgrade){upgrade.setAttribute?.('aria-disabled',String(reward||G.phase!=='rest'));upgrade.title=reward?'请先选择晋级奖励':'点击调度中心升阶（消耗资金）';}
  const lvEl = document.getElementById('shop-level');
  if (lvEl) lvEl.innerHTML = G._upgradeConfirm
    ? '<div class="lv-cost-hex"><span>'+G.upgradeCost+'</span></div>'
      +'<div class="lv-title">调度中心</div>'
      +'<div class="lv-num">'+G.level+'</div>'
      +'<div class="lv-foot"><span class="lv-key">G</span><span class="lv-act">确认升本</span></div>'
    : '<div class="lv-cost-hex"><span>'+G.upgradeCost+'</span></div>'
      +'<div class="lv-title">调度中心</div>'
      +'<div class="lv-num">'+G.level+'</div>'
      +'<div class="lv-foot"><span class="lv-key">G</span><span class="lv-act">升级</span></div>';
  const slEl = document.getElementById('shop-left');
  if (slEl && slEl.classList) slEl.classList.toggle('confirm', !!G._upgradeConfirm);   // 升本确认高亮（I-20260902-028）
  // 右：资金显示（金币图标 + 大号数值；移除调试式槽计数；收起按钮在 HTML 静态区）
  const moneyEl = document.getElementById('shop-money');
  if (moneyEl) moneyEl.innerHTML = '<div class="money-hex"><span class="coin"></span><b>'+G.money+'</b></div>'+(reward?'<span class="n">选择晋级奖励</span>':shopFrozen?'<span class="n" style="color:#b8e9ff">❄ 冻结</span>':'');
  // 冻结胶囊状态（刷新/冻结胶囊移到底栏右上方 #shop-fabs）
  const fb = document.getElementById('freeze-btn');
  if (fb && fb.classList) fb.classList.toggle('on', !!shopFrozen);
  if(fb){if(fb.setAttribute)fb.setAttribute('aria-pressed',String(!!shopFrozen));fb.title=reward?'晋级奖励不能冻结':shopFrozen?'商店已冻结：点击解冻':'商店未冻结：点击保留到下一轮';}
  const fl = document.getElementById('freeze-label');
  if (fl) fl.textContent = shopFrozen ? '解冻' : '冻结';
  // 中：最多 SHOP_SLOTS 槽；商品不足时「右对齐」——左侧补空槽占位，真实卡靠右
  const el = document.getElementById('shop');
  const frozenCls = shopFrozen ? ' frozen' : '';
  const freezeMark = shopFrozen ? '<div class="freeze-mark"><span class="frost-ico">❄</span></div>' : '';
  const cards = G.shop.map((s,i)=>{
    const isPrev = shopPreview === i;   // 首次点击→预览待确认
    const prevCls = isPrev ? ' shop-prev' : '';
    const confirmBtn = isPrev ? '<div class="shop-preview-mask">'+(reward
      ? '<button type="button" class="merge-confirm" onclick="event.stopPropagation();confirmMergeReward('+i+')">确认选择</button>'
      : '<button class="buy-confirm" onclick="event.stopPropagation();confirmBuy('+i+')">确认购买 ¥'+s.cost+'</button>')+'</div>' : '';
    if (s.type === 'equip') {
      const m = s.equip.mods || {};
      const tierColor = ['','#9e9e9e','#8bc34a','#2196f3','#9c27b0','#ff9800','#f44336'][s.cost] || '#2196f3';
      return '<div class="shop-card equip-card'+frozenCls+prevCls+'" style="--tier-color:'+tierColor+';--tier-glow:'+tierColor+'55;border-color:'+tierColor+'" onclick="onShopCardClick('+i+')">'
        +'<div class="eq-art"><img class="eq-icon" src="'+equipIconPath(s.equip.name)+'" onerror="this.remove()">'+equipArtSvg(s.equip.id)+'</div>'
        +'<div class="cost-hex"><span>'+s.cost+'</span></div>'
        +'<div class="rt">'+fmtMods(m)+'</div>'
        +'<div class="eq-name">'+s.equip.name+'</div>'
        +'<div class="nm">装备</div>'
        +freezeMark
        +confirmBtn+'</div>';
    }
    const e = s.entry;
    const tier = e.tier || 1;
    const high = tier >= 5;   // 5~6 阶高阶：金色主题
    const theme = high ? '#E5A93C' : '#1AA883';
    const roman = 'ⅠⅡⅢⅣⅤⅥ'[tier-1] || String(tier);
    const faction = e.seasonBond ? ((BOND_DEFS[e.seasonBond]||{}).name || '') : '';
    const contract = (e.regBonds || []).map(bid => (BOND_DEFS[bid]||{}).name).filter(Boolean)[0] || '';
    const profCn = PROF_CN[e.profession] || '';
    const profShort = PROF_SHORT[e.profession] || (profCn||'?').slice(0,1);
    return '<div class="shop-card op-card'+(high?' hi':'')+frozenCls+prevCls+'" style="--theme:'+theme+'" onclick="onShopCardClick('+i+')">'
      +'<img class="op-art" src="avatars/'+e.charId+'.png" onerror="this.style.display=\'none\'">'
      +'<div class="op-grad"></div>'
      +'<div class="op-watermark">❖</div>'
      +'<div class="cost-hex"><span>'+(G._mergeReward ? '选' : s.cost)+'</span></div>'
      +'<div class="tier-badge">'+roman+'</div>'
      +'<div class="op-meta">'
        +(faction ? '<div class="op-faction'+bondClass(e.seasonBond)+'"><i>❖</i>'+faction+'</div>' : '')
        +(contract ? '<div class="op-contract'+bondClass((e.regBonds||[])[0])+'"><i>⚙</i>'+contract+'</div>' : '')
      +'</div>'
      +'<div class="op-namebar"><img class="op-prof" src="assets/profession_icons/'+(PROF_ICON[e.profession]||'')+'.png"><span class="op-name">'+e.name+'</span></div>'
      +freezeMark
      +confirmBtn+'</div>';
  });
  // 固定槽位（随调度中心等级变化，gamedata shopLevelDataDict）；商品不足时左侧补「空槽」占位，真实卡靠右紧密对齐
  const shopN = typeof shopSlots === 'function' ? shopSlots() : SHOP_SLOTS;
  const pad = Math.max(0, shopN - cards.length);
  el.innerHTML = '<div class="shop-card empty">[ NO INFO ]</div>'.repeat(pad) + cards.join('');
  // 刷新/冻结胶囊显隐由 syncShopDrawer 统一控制（休整期且商店展开时显示）
}

function renderHand() {
  const hand = G.ops.filter(o=>o.row==null);
  const el = document.getElementById('handbar');
  const MAXH = 10;   // 自走棋手牌上限：10 格（与战场一格同高）
  const cells = hand.slice(0, MAXH).map(o=>{
    const e = o.entry;
    const cost = (o.cost != null) ? o.cost : BUY_COST;
    const profColor = PROF_COLOR[e.profession] || '#8fb7ff';
    const profShort = PROF_SHORT[e.profession] || (PROF_CN[e.profession]||'?').slice(0,1);
    return '<div class="handcell'+(selectedHand===o.id?' sel':'')+'" onmousedown="event.preventDefault();handDown('+o.id+',event)" title="'+escapeHtml(e.name)+'（'+TIER_CN[e.tier]+'阶） · '+PROF_CN[e.profession]+'">'
      +'<img src="avatars/'+e.charId+'.png" onerror="this.style.display=&#39;none&#39;">'
      +'<div class="fade"></div>'
      +'<img class="prof-badge" src="assets/profession_icons/'+(PROF_ICON[e.profession]||'')+'.png">'
      +'<span class="cost">'+cost+'</span>'
      +'<span class="tier-badge">'+escapeHtml(TIER_CN[e.tier]||(''+(e.tier)))+'</span>'
      +'<div class="nm">'+escapeHtml(e.name)+'</div>'
      +'<div class="tier-note">'+escapeHtml(PROF_CN[e.profession]||'')+'</div>'
      +'</div>';
  }).join('');
  const over = hand.length > MAXH ? '<div class="tip" style="align-self:center;font-size:11px;color:#ffd54f">…+'+(hand.length-MAXH)+'</div>' : '';
  el.innerHTML = (cells + over) || '<div class="tip" style="padding:12px;text-align:center">空备战席<br><span style="font-size:11px">在下方商店招募干员</span></div>';
}

// —— 手牌手势：按下后移动超过阈值=拖拽部署；否则视为点击=选中查看（左侧立绘 + 攻击范围）——
let handGest = null;
function handDown(id, e) {
  if (G.phase !== 'rest' || handGest) return;
  handGest = { id, sx: e.clientX, sy: e.clientY, dragging: false };
}
function onHandMove(e) {
  if (!handGest || handGest.dragging) return;
  const dx = e.clientX - handGest.sx, dy = e.clientY - handGest.sy;
  if (dx*dx + dy*dy > 36) { handGest.dragging = true; startHandDrag(handGest.id); }   // 拖拽
}
function onHandUp() {
  if (!handGest) return;
  const g = handGest; handGest = null;
  if (!g.dragging && G && G.phase === 'rest') selectHand(g.id);   // 点击 → 选中查看
}

// 普通模式手牌：全部干员，底部横排、无数量上限（点击/拖拽同 self-chess）
function renderNormalHand() {
  const el = document.getElementById('handbar');
  const hand = G.ops.filter(o=>o.row==null);
  const cells = hand.map(o=>{
    const e = o.entry;
    const profColor = PROF_COLOR[e.profession] || '#8fb7ff';
    const profShort = PROF_SHORT[e.profession] || (PROF_CN[e.profession]||'?').slice(0,1);
    return '<div class="handcell'+(selectedHand===o.id?' sel':'')+'" onmousedown="event.preventDefault();handDown('+o.id+',event)" title="'+escapeHtml(e.name)+'（'+TIER_CN[e.tier]+'阶） · '+PROF_CN[e.profession]+'">'
      +'<img src="avatars/'+e.charId+'.png" onerror="this.style.display=&#39;none&#39;">'
      +'<div class="fade"></div>'
      +'<img class="prof-badge" src="assets/profession_icons/'+(PROF_ICON[e.profession]||'')+'.png">'
      +'<span class="tier-badge">'+escapeHtml(TIER_CN[e.tier]||(''+(e.tier)))+'</span>'
      +'<div class="nm">'+escapeHtml(e.name)+'</div>'
      +'</div>';
  }).join('');
  el.innerHTML = cells || '<div class="tip" style="padding:12px;text-align:center">无可用干员</div>';
}

function fmtMods(m) {
  const p = [];
  if (m.atk && m.atk!==1) p.push('攻击'+(m.atk>1?'+':'')+Math.round((m.atk-1)*100)+'%');
  if (m.hp && m.hp!==1) p.push('生命'+(m.hp>1?'+':'')+Math.round((m.hp-1)*100)+'%');
  if (m.def && m.def!==1) p.push('防御'+(m.def>1?'+':'')+Math.round((m.def-1)*100)+'%');
  if (m.aspd && m.aspd!==1) p.push('攻速'+(m.aspd>1?'+':'')+Math.round((m.aspd-1)*100)+'%');
  return p.join('、') || '—';
}
// 技能效果算子 → 加成文本（立绘面板技能页展示；power 语义与 classify_skills 一致）
function skillBonusText(effects) {
  if (!effects || !effects.length) return '';
  const parts = [];
  for (const e of effects) {
    const p = (e.power != null) ? e.power : 1;
    if (e.type === 'buff_atk') parts.push('攻击力+' + Math.round(p * 100) + '%');
    else if (e.type === 'buff_def') parts.push('防御力+' + Math.round(p * 100) + '%');
    else if (e.type === 'buff_maxhp') parts.push('生命上限+' + Math.round(p * 100) + '%');
    else if (e.type === 'buff_atkspd') parts.push('攻击速度+' + Math.round(p * 100) + '%');
    else if (e.type === 'heal') parts.push('治疗' + Math.round(p * 100) + '%');
    else if (e.type === 'heal_self') parts.push('自身治疗' + Math.round(p * 100) + '%');
    else if (e.type === 'dp_gain') parts.push('部署费用+' + p);
    else if (e.type === 'aoe_damage') parts.push('范围伤害' + Math.round(p * 100) + '%攻击力');
    else if (e.type === 'burst_damage') parts.push('伤害' + Math.round(p * 100) + '%攻击力');
    else if (e.type === 'slow') parts.push('减速');
    else if (e.type === 'dodge') parts.push('闪避' + Math.round(p * 100) + '%');
    else if (e.type === 'buff_range') parts.push('攻击范围扩大');
    else if (e.type === 'debuff_def') parts.push('破甲' + Math.round(p * 100) + '%');
    else if (e.type === 'ep_damage') parts.push('元素损伤' + Math.round(p * 100) + '%');
  }
  return parts.join('、');
}

// 统计当前场上（已部署）各盟约的干员人数（含未达激活阈值部分，用于显示分段点亮进度）
function fieldBondCounts() {
  const members = {};
  for (const bid in BOND_DEFS) members[bid] = new Set();
  for (const o of (G.ops || [])) {
    if (o.row == null || G.bannedOperators?.includes(o.charId)) continue;   // 仅统计本局可用的已部署干员
    const e = o.entry;
    if (e.seasonBond) members[e.seasonBond].add(o.charId);
    for (const bid of e.regBonds) members[bid].add(o.charId);
    if (o.elite) members['suntShip'].add(o.charId);
  }
  const out = {};
  for (const bid in BOND_DEFS) out[bid] = members[bid].size;
  return out;
}

// 环形分段 SVG：外圈按 need 分 N 段(2/3)，从 12 点(0 点方向)起逆时针点亮前 lit 段；淡绿主题色
function bondSegmentSVG(need, lit) {
  const seg = 100 / need, gap = 4, dash = Math.max(3, seg - gap);
  const on = lit >= need;
  const col = '#1AA883';   // 卫戍协议主题淡绿（26,168,131）
  const C = 24, R = 21, SW = 4;   // 内缘半径19，图标半径15，保留4px间隙。
  let s = '<svg viewBox="0 0 48 48" width="48" height="48">';
  s += '<circle cx="'+C+'" cy="'+C+'" r="'+(R-SW/2)+'" fill="'+(on ? 'rgba(26,168,131,0.30)' : 'transparent')+'"/>';
  s += '<circle cx="'+C+'" cy="'+C+'" r="'+R+'" fill="none" stroke="#2a3040" stroke-width="'+SW+'"/>';
  for (let k = 0; k < need; k++) {
    if (k >= lit) continue;
    // 12 点方向为第 0 段，之后逆时针（负角度递增）
    s += '<circle cx="'+C+'" cy="'+C+'" r="'+R+'" fill="none" stroke="'+col+'" stroke-width="'+SW+'" pathLength="100" stroke-dasharray="'+dash+' 100" transform="rotate('+(-90 - k*(360/need) - gap*1.8)+' '+C+' '+C+')"/>';
  }
  s += '</svg>';
  return s;
}

// 按解包说明中的显式条件拆档；保留原文，不把层数门槛误当成所需人数。
function bondDetailStages(bid) {
  const d=BOND_DEFS[bid],stages=[{kind:'members',need:d.need,label:d.need+'名干员',text:''}],notes=[];
  for(const line of String(BOND_EFFECT_TXT[bid]||'').split('\n').filter(Boolean)){
    const condition=line.match(/^<([^>]+)>(.*)$/),members=condition?.[1].match(/在场(\d+)名/),layers=condition?.[1].match(/(\d+)层/);
    if(members||layers){
      const kind=members?'members':condition[1].includes('每叠加')?'repeat':'layers',need=Number((members||layers)[1]);
      const stage={kind,need,label:members?need+'名干员':condition[1],text:condition[2]};
      if(stages.length===1&&!stages[0].text&&kind==='members'&&need===d.need)stages[0]=stage;else stages.push(stage);
    }else if(line.startsWith('选择策略')||line.startsWith('（所有'))notes.push(line);
    else stages.at(-1).text+=(stages.at(-1).text?'\n':'')+line;
  }
  return {stages,notes};
}
function renderBonds() {
  // 顶部悬浮横向图标条：图标在上、名字在下，外圈按 need 分段点亮，激活则整体发光；点击弹出详情
  const el = document.getElementById('bonds-track');
  if (!el) return;
  const counts = fieldBondCounts();
  const rows = Object.keys(BOND_DEFS)
    .filter(bid => counts[bid] > 0)   // 仅显示场上存在成员的盟约
    // 与当前computeBonds一致展示已部署成员；完整模式目录限制应连同计算一起迁移，不能只隐藏界面。
    .map(bid => {
      const d = BOND_DEFS[bid];
      const n = counts[bid], on = (G.activeBonds?.[bid]||0)>0;
      const bonus=d.type==='SEASON'&&G.activeBonds?.maniShip?1:0,effective=n+bonus;
      const needs=bondDetailStages(bid).stages.filter(s=>s.kind==='members').map(s=>s.need);
      const need=needs.find(t=>t>effective)||needs.at(-1)||d.need,lit=bid==='soloShip'&&n!==1?0:Math.min(effective,need);
      return '<div class="bond'+(on?' active':'')+(selectedBond===bid?' sel':'')+'" onclick="onBondClick(\''+bid+'\')" title="'+escapeHtml(BOND_EFFECT_TXT[bid])+'">'
        +'<div class="ring">'+bondSegmentSVG(need, lit)+'<img class="bicon" src="bond_avatars/icon_'+bid+'.png" onerror="this.remove()"><strong class="bond-layers" aria-label="'+escapeHtml(d.name)+' '+bondLayerCount(bid)+'层">'+bondLayerCount(bid)+'</strong></div>'
        +'<b>'+d.name+'</b>'+(bid==='soloShip'&&n>1?'<span class="cnt">失效</span>':'')+'</div>';
    }).join('');
  el.innerHTML = rows || '<div class="tip" style="margin:0;font-size:12px;color:#9aa0b0">部署干员以点亮盟约</div>';
  const viewport = document.getElementById('bonds');
  if (viewport && viewport.resetBounds) viewport.resetBounds();
  if (selectedBond) renderBondDetail(selectedBond);
}

// 场上属于某盟约的不同干员（同一干员多份只算一个）
function bondMemberOps(bid) {
  const seen = new Set(); const out = [];
  for (const o of (G.ops || [])) {
    if (o.row == null || G.bannedOperators?.includes(o.charId)) continue;
    const e = o.entry;
    const inBond = (e.seasonBond === bid) || (e.regBonds && e.regBonds.includes(bid)) || (bid === 'suntShip' && o.elite);
    if (inBond && !seen.has(o.charId)) { seen.add(o.charId); out.push(o); }
  }
  return out;
}
function onBondClick(bid) {
  if (selectedBond === bid) { selectedBond = null; hideBondDetail(); renderBonds(); return; }
  selectedBond = bid;
  renderBondDetail(bid);
  renderBonds();
}
function hideBondDetail() {
  const el = document.getElementById('bond-detail');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
function renderBondDetail(bid) {
  const d = BOND_DEFS[bid]; if (!d) return;
  const el = document.getElementById('bond-detail'); if (!el) return;
  const n = (fieldBondCounts())[bid] || 0, on = (G.activeBonds?.[bid]||0)>0,layers=bondLayerCount(bid);
  const bonus=d.type==='SEASON'&&G.activeBonds?.maniShip?1:0,details=bondDetailStages(bid);
  const stages=details.stages.map(stage=>{
    const value=stage.kind==='members'?n+bonus:layers,met=on&&value>=stage.need;
    const invalid=bid==='soloShip'&&n>1,status=invalid?'人数超出，已失效':stage.kind==='repeat'?'每'+stage.need+'层触发一次':met?'已达成':'未达成';
    return '<section class="bd-stage'+(met?' reached':'')+'"><div class="bd-stage-head"><b>'+escapeHtml(stage.label)+'</b><span>'+status+' · '+(stage.kind==='members'&&!invalid?Math.min(value,stage.need):value)+'/'+stage.need+'</span></div>'+(stage.text?'<p>'+escapeHtml(stage.text)+'</p>':'')+'</section>';
  }).join('');
  const present = new Set(bondMemberOps(bid).map(o=>o.charId));
  const members = ROSTER_LIST.filter(e=>bid==='suntShip'?present.has(e.charId):e.seasonBond===bid||e.regBonds?.includes(bid));
  const banned=new Set(G.bannedOperators||[]);
  const memberHtml=e=>'<div class="bd-op'+(banned.has(e.charId)?' banned':present.has(e.charId)?'':' absent')+'" title="'+escapeHtml(e.name)+(banned.has(e.charId)?' · 本局禁用':present.has(e.charId)?' · 已上场':' · 未上场')+'"><img src="avatars/'+e.charId+'.png" onerror="this.style.display=\'none\'"><span>'+escapeHtml(e.name)+'</span></div>';
  const imgs=members.filter(e=>!banned.has(e.charId)).map(memberHtml).join('');
  const bannedImgs=members.filter(e=>banned.has(e.charId)).map(memberHtml).join('');
  el.innerHTML =
    '<div class="bd-head"><span class="bd-name">'+d.name+'</span><span class="bd-type">'+(d.type==='SEASON'?'势力盟约':'通用盟约')+'</span><span class="bd-close" onclick="onBondClick(\''+bid+'\')">✕</span></div>'
    +'<div class="bd-count">当前 <b>'+layers+'</b> 层 · 上场 '+n+' 人'+(bonus?'，调和补足1人':'')+(on?'（已激活）':'（未激活）')+'</div>'
    +'<div class="bd-stages">'+stages+'</div>'+(details.notes.length?'<p class="bd-effect">'+escapeHtml(details.notes.join('\n'))+'</p>':'')
    +'<div class="bd-members">'+(imgs || '<span class="bd-empty">本局无可用成员</span>')+'</div>'
    +(bannedImgs?'<div class="bd-banned-title">本局禁用</div><div class="bd-members bd-banned">'+bannedImgs+'</div>':'');
  el.style.display = 'block';
}

function skillDesc(sk) {
  switch (sk.type) {
    case 'burst_damage': return '对'+ (sk.count||3) +'名敌人造成攻击力×'+sk.power+'伤害';
    case 'aoe_damage': return '对范围内所有敌人造成攻击力×'+sk.power+'伤害';
    case 'snipe': return '对生命比例最低的敌人造成攻击力×'+sk.power+'伤害';
    case 'heal': return '治疗范围内受伤最重的友军（攻击力×'+sk.power+'）';
    case 'buff_atk': return '攻击力+'+(sk.power*100).toFixed(0)+'%，持续'+sk.duration+'秒';
    case 'buff_atkspd': return '攻速+'+(sk.power*100).toFixed(0)+'%，持续'+sk.duration+'秒';
    case 'shield': return '回复生命上限'+(sk.power*100).toFixed(0)+'%的生命';
    default: return '—';
  }
}

function renderSelected() {
  if(tacticalDetail())return;
  document.getElementById('hand-detail')?.classList.remove('tactical-detail');
  if (shopPreview >= 0) {   // 商店预览中：左侧立绘面板由 showShopPreview 维护，右侧不再有独立动作栏
    return;
  }
  const hd = document.getElementById('hand-detail');
  let o = null, onBoard = false;
  if (selBoardOp) { o = G.ops.find(x=>x.id===selBoardOp); onBoard = true; }
  else if (selectedHand) { o = G.ops.find(x=>x.id===selectedHand); }
  if (!o) {
    // 装备选中：左侧面板显示装备详情（立绘图标 + 名称 + 品质 + 数值），与干员一致
    const eq = (selectedEquip != null) ? G.equipInv.find(x => x.uid === selectedEquip) : null;
    if (eq && hd) {
      hd.classList.add('equip');
      hd.style.display = 'block';
      hd.innerHTML = '<div class="bgfx"><div class="fade"></div></div>'
        + '<div class="txt">' + renderEquipmentDetail(eq) + '</div>';
    } else if (hd) {
      hd.classList.remove('equip');
      hd.style.display = 'none';
    }
    return;
  }
  const e = o.entry;
  const bonds = [];
  if (e.seasonBond) bonds.push(BOND_DEFS[e.seasonBond].name);
  for (const b of e.regBonds) bonds.push(BOND_DEFS[b].name);
  // 左侧立绘面板：候选 / 已部署 共用（信息全部在立绘卡；动作统一走菱形操作盘）
  if (hd) {
    hd.classList.remove('equip');
    hd.style.display='block';
    hd.innerHTML = '<div class="bgfx">'
      +'<div class="art" style="background-image:url(portraits/'+e.charId+'.png)"></div>'
      +'<div class="fade"></div>'
      +'</div>'
      +'<div class="txt">'+opDetailHtml(e, o, bonds, onBoard)+'</div>';
  }
}

// 左侧立绘面板详情：生命数值条 + 属性 + 攻击范围 + 技能 + 天赋 + 盟约 + 装备（还原方舟信息卡）
let detailTab = 'trait';   // 左侧详情面板当前选中的 Tab（'trait'特质/'skill'技能/'feature'特性/'talent'天赋）
function setDetailTab(t) {
  detailTab = t;
  if (selBoardOp != null || selectedHand != null || selectedEquip != null) renderSelected();   // 重新渲染选中干员面板
  else if (shopPreview >= 0) showShopPreview(shopPreview);            // 商店预览时同步重绘预览面板 Tab
}
// 详情面板关闭：现有交互已由 cancelShopPreview() / 全局点击外部关闭承担，无需 ESC 按钮
// 详情数据准备：只做属性/HP/练度/盟约计算，不碰 DOM（rules → view model）
function buildOperatorDetailModel(e, o, onBoard) {
  const mods={atk:1,hp:1,def:1,aspd:1};
  if(GMODE!=='normal')garrisonStatMods({...o,entry:e},G?.activeBonds||{},mods);
  const fm = finalizeOperator(e, mods, o.equip, o.elite);
  if(GMODE!=='normal')garrisonFinalize({...o,entry:e},G?.activeBonds||{},fm);
  let hpMax = onBoard ? (o.maxHp || fm.maxHp) : fm.maxHp;
  let hpCur = hpMax;
  if (onBoard) {
    // 战斗中：从引擎战场取实时生命（G.ops 不保存战斗血量）
    const bop = (B && B.phase === 'battle') ? (B.operators || []).find(x => x.id === o.id) : null;
    if (bop && bop.hp != null && bop.maxHp != null) { hpCur = bop.hp; hpMax = bop.maxHp; }
    else if (o.hp != null) hpCur = o.hp;
  }
  const hpPct = hpMax > 0 ? Math.round(100*hpCur/hpMax) : 100;
  const liveDefOp=onBoard&&B?.phase==='battle'?(B.operators||[]).find(x=>x.id===o.id)||o:o;
  const atk = onBoard ? (B?.phase==='battle'&&liveDefOp.skill?.clientProgram?operatorAttackPower(liveDefOp,buffMul(liveDefOp).atk):(o.atk??fm.atk)) : fm.atk;
  const def = onBoard ? (B?.phase==='battle'&&liveDefOp.def!=null?operatorDefense(liveDefOp):(o.def??fm.def)) : fm.def;
  const blockVal = onBoard ? ((o.blockCnt != null) ? o.blockCnt : fm.blockCnt) : fm.blockCnt;
  const block = (blockVal != null) ? blockVal : (e.baseBlockCnt != null ? e.baseBlockCnt : 1);
  const magicRes = onBoard ? (B?.phase==='battle'&&liveDefOp.skill?.clientProgram?operatorResistance(liveDefOp):(o.magicRes??fm.magicRes)) : fm.magicRes;
  const skill = onBoard ? o.skill : fm.skill;
  const range = rangeGridHtml(entryRangeGrids(e, o.elite));
  const talents = activeTalents(e, o.elite);
  const cost = (o.cost != null) ? o.cost : BUY_COST;
  const tierCn = TIER_CN[e.tier] || (''+e.tier);
  const theme = (e.tier >= 5) ? '#E5A93C' : '#1AA883';   // 等阶主题色：高阶金/普通绿（与商店卡片一致）
  // 练度规则来自 mode_rules 逐棋子配置；普通测试模式保留账号养成入口。
  // 战斗属性另加 selfHoldMult（自持有加成，来自干员库练度的少量加成）。
  const elite = !!o.elite;
  const train = trainingProfile(e, elite);
  const trainPhase = train.evolve;
  const trainLv = train.level;
  const trainSkill = train.skillLevel;
  const phaseCn = ['精0','精一','精二'][trainPhase];
  const phaseIcon = phaseCn;

  // 契约（盟约）列表：赛季盟约 + 常规盟约
  const bondList = [];
  if (e.seasonBond) bondList.push(e.seasonBond);
  for (const b of (e.regBonds || [])) bondList.push(b);
  return { e, o, onBoard, hpCur, hpMax, hpPct, atk, def, block, magicRes, skill, range, talents, cost, tierCn, theme, phaseCn, phaseIcon, trainLv, trainSkill, elite, bondList };
}

// 详情 DOM 渲染：只拼 HTML，不再计算（view model → HTML）
function renderOperatorDetail(vm, bonds) {
  const { e, o, onBoard, hpCur, hpMax, hpPct, atk, def, block, magicRes, skill, range, talents, cost, tierCn, theme, phaseCn, phaseIcon, trainLv, trainSkill, elite, bondList } = vm;
  // —— 上半区：立绘半身底图 + 左侧基础信息 / 右侧战术卡块 ——
  let h = '<div class="od-header">'
    // HUD coordinate plane: left column = class/name/tier/stats, right column = attack range/bond, center = artwork breathing area
    + '<img class="od-skill-icon" src="assets/profession_icons/'+(PROF_ICON[e.profession]||'')+'.png">'
    + '<div class="od-namerow"><span class="od-title">'+escapeHtml(e.name)+'</span><span class="od-app">'+escapeHtml(e.appellation||'')+'</span></div>'
    + '<div class="od-tierrow">'
    + '<img class="od-tiericon" src="ui/autochess/autochess_level_'+e.tier+'.png" title="'+escapeHtml(tierCn)+'" onerror="this.style.display=\'none\'">'
    + '<span class="od-tierbadge" style="border-color:'+theme+';color:'+theme+'">'+escapeHtml(tierCn)+'</span>'
    + '<span class="od-eliteicon" title="'+escapeHtml(phaseCn)+' · '+skillLevelLabel(trainSkill)+'">'+phaseIcon+'</span>'
    + '<span class="od-lvrow">LV <b>'+trainLv+'</b>'+(elite?'<span class="od-elite">精锐</span>':'')+'</span>'
    + '</div>'
    + '<ul class="od-stat-list">'
    + '<li><span>攻击</span><b>'+atk+'</b></li>'
    + '<li><span>防御</span><b>'+def+'</b></li>'
    + '<li><span>法抗</span><b>'+(magicRes!=null?magicRes:0)+'</b></li>'
    + '<li><span>阻挡</span><b>'+block+'</b></li>'
    + '<li><span>费用</span><b>'+cost+'</b></li>'
    + '</ul>';
  if (range) h += '<div class="od-widget od-rangebox"><div class="od-range">'+range+'</div><div class="od-wlabel">攻击范围</div></div>';
  if (bondList.length) {
    let chips = '';
    for (const b of bondList) {
      const bn = (BOND_DEFS[b]||{}).name || b;
      chips += '<div class="od-bonditem"><img class="od-bondicon" src="bond_avatars/icon_'+b+'.png" onerror="this.remove()"><span class="od-bondname">'+escapeHtml(bn)+'</span></div>';
    }
    h += '<div class="od-widget od-bond">'+chips+'</div>';
  }
  h += '</div>';   // /od-header

  // —— 中间血条 HUD：左贯通青蓝进度条 + 右实色战术胶囊 ——
  h += '<div class="od-hpbar">'
    + '<div class="od-hptrack"><div class="od-hpfill" style="width:'+hpPct+'%"></div></div>'
    + '<div class="od-hpbadge">生命 '+hpCur+'/'+hpMax+'</div>'
    + '</div>';

  // —— 下半区：实色暗底面板 + 四 Tab 分页 ——
  if(o.charId==='char_249_mlyss')h+='<div class="od-sec">部署候选区的流形，再点流形开启复制窗口，将候选干员拖到它身上。</div>';
  h += renderDetailTabs(opDetailTabBody(e, o, bonds, onBoard, detailTab, range, skill, talents));
  return h;
}

// 详情面板入口：数据准备 → DOM 渲染
function opDetailHtml(e, o, bonds, onBoard) {
  return renderOperatorDetail(buildOperatorDetailModel(e, o, onBoard), bonds);
}
// 当前 Tab 的内容
function communityReferenceLink(source) {
  const url=String(source?.url||'');
  return /^https:\/\/prts\.wiki\//.test(url)?'<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">PRTS 来源</a>':'PRTS 资料';
}
function communitySkillNotesHtml(skillId, name='') {
  const notes=COMMUNITY_REFERENCES.skills[skillId]||[];
  if(!notes.length)return '';
  return '<details class="od-sec" onclick="event.stopPropagation()"><summary>'+escapeHtml(name?name+' · ':'')+'机制补充（PRTS 资料）</summary>'
    +notes.map(note=>'<div>'+escapeHtml(note.text).replace(/\n/g,'<br>')+'</div>'+communityReferenceLink(note.source)).join('')+'</details>';
}
function communityEnemyNotesHtml(ids) {
  return [...new Set(ids)].flatMap(id=>(COMMUNITY_REFERENCES.enemies[id]||[]).map(row=>
    '<details class="intel-line"><summary>'+escapeHtml(row.name)+' · 机制资料</summary>'
    +row.levels.map(level=>'<div><b>资料等级 '+level.levels.map(escapeHtml).join(' / ')+'</b><br>'+escapeHtml(level.text).replace(/\n/g,'<br>')+'</div>').join('')
    +communityReferenceLink(row.source)+'</details>')).join('');
}
function opDetailTabBody(e, o, bonds, onBoard, tab, range, skill, talents) {
  if (tab === 'feature') {
    // 特质 = 当前佩戴装备列表（卡片化：左深色图标框 + 右装备名/效果文本）
    const eqs = (o.equip || []).filter(Boolean);
    if (!eqs.length) return '<div class="od-empty">未佩戴任何装备</div>';
    return eqs.map(eq => {
      const d = EQUIP_DESC[eq.name] || {};
      const tier = d.tier || 'normal';   // golden=进阶
      const desc = (d.desc != null) ? richText(d.desc) : equipFallbackDesc(eq);
      return '<div class="od-trait">'
        + '<div class="od-itemicon'+(tier==='golden'?' od-gold':'')+'"><img src="'+equipIconPath(eq.name)+'" onerror="this.remove()"></div>'
        + '<div class="od-itemdesc"><h4>'+escapeHtml(eq.name)+(tier==='golden'?' <span class="od-goldtag">进阶</span>':'')+'</h4>'
        + '<p>'+desc+'</p></div>'
        + '</div>';
    }).join('');
  }
  if (tab === 'skill') {
    // 优先真实技能（A7 skill_data.json 的 name/desc/范围/技力）；无真实技能则回退职业模板描述
    const skName = (skill && skill.realName) ? skill.realName : (skill ? skill.name : '无');
    const skDesc = (skill && skill.realDesc) ? richText(skill.realDesc) : (skill ? richText(skillDesc(skill)) : '无');
    const spCost = (skill && skill.realSpCost != null) ? skill.realSpCost : (skill ? skill.spCost : null);
    const spType = skill && skill.isPassive ? '被动' : '自动施放';
    const recovery = skill && skill.isPassive ? '' : ({ INCREASE_WITH_TIME:'自动回复', INCREASE_WHEN_ATTACK:'攻击回复', INCREASE_WHEN_TAKEN_DAMAGE:'受击回复' }[skill && skill.spType] || '特殊回复');
    const skIcon = (skill && skill.realIcon)
      ? '<img class="od-sk-icon" src="ui/skillicons/skill_icon_'+skill.realIcon+'.png" onerror="this.style.display=\'none\'">' : '';
    const skBonus = skillBonusText(skill && skill.effects);
    return '<div class="od-sec">'+skIcon+'<b class="od-sk-name">'+escapeHtml(skName)+'</b>'
      +(skill && skill.realType ? ' <span class="od-tag">'+spType+'</span>' : '')+'</div>'
      +(recovery ? '<div class="od-sec">'+recovery+'</div>' : '')
      +'<div class="od-sec">'+skDesc+'</div>'
      +(skBonus ? '<div class="od-sec"><span class="od-hl">加成</span> '+skBonus+'</div>' : '')
      +(spCost != null ? '<div class="od-sec"><span class="od-hl">技力消耗</span> <b class="od-num">'+spCost+'</b>'
        + ((skill && skill.realInitSp) ? ' · 初始 '+skill.realInitSp : '')
        + ((skill && skill.realMaxCharge > 1) ? ' · 充能'+skill.realMaxCharge : '')
        + ((skill && skill.realDuration) ? (skill.durationType === 'AMMO' ? ' · 弹药机制' : skill.realDuration < 0 ? ' · 无限持续' : ' · 持续'+skill.realDuration+'秒') : '')+'</div>' : '')
      +(skill && skill.rangeGrids ? '<div class="od-sec">技能范围'+rangeGridHtml(skill.rangeGrids)+'</div>' : '')
      +(skill && skill.timingApproximate && !skill.isPassive ? '<div class="od-sec">特殊充能/弹药机制尚未完整适配</div>' : '')
      +communitySkillNotesHtml(skill?.sourceId);
  }
  if (tab === 'trait') {
    return garrisonTraitHtml({...o,entry:e});
  }
  if (tab === 'talent') {
    if (!talents.length) return '<div class="od-empty">无（该精英化阶段未解锁天赋）</div>';
    return talents.map(t =>
      '<div class="od-sec"><b class="od-tal-name">'+escapeHtml(t.name)+(t.phase>0?'（精'+('一二'[t.phase-1])+'）':'')+'</b>'
      +'<div>'+richText(t.description||'')+'</div></div>').join('');
  }
  return '';
}
// 装备效果文本兜底：硬编码 EQUIPS.desc，再回退属性乘区格式化
function equipFallbackDesc(eq) {
  const hard = EQUIPS.find(x => x.name === eq.name);
  if (hard && hard.desc) return escapeHtml(hard.desc);
  return escapeHtml(fmtMods(eq.mods));
}

// 装备详情分发：按 kind 区分 被动装备(stat/use) vs 可部署装置(trap)
function renderDetailTabs(body) {
  const tabs = [['trait','特质'],['skill','技能'],['feature','装备'],['talent','天赋']];
  return '<div class="od-body"><div class="od-tabs">'+tabs.map(([id,label])=>'<button class="od-tab'+(detailTab===id?' on':'')+'" onclick="event.stopPropagation();setDetailTab(\''+id+'\')">'+label+'</button>').join('')+'</div><div class="od-tabbody">'+body+'</div></div>';
}
function renderEquipmentDetail(eq) {
  const source = EQUIPMENT_DETAILS[eq.id] || EQUIPMENT_DETAILS[eq.effectId] || {};
  const desc = source.description || EQUIP_DESC[eq.name]?.desc || eq.desc || fmtMods(eq.mods);
  let body;
  if(detailTab==='talent') body=(source.talents||[]).map(t=>'<div class="od-sec"><b>'+escapeHtml(t.name)+'</b><div>'+richText(t.description).replace(/\n/g,'<br>')+'</div></div>').join('')||'<div class="od-empty">无天赋</div>';
  else if(detailTab==='skill') body=(source.skills||[]).map(t=>'<div class="od-sec"><b>'+escapeHtml(t.name)+'</b><div>'+richText(t.desc)+'</div></div>').join('')||'<div class="od-empty">无主动技能</div>';
  else if(detailTab==='feature') body='<div class="od-sec">'+(eq.kind==='use'?'拖动到任意己方干员身上使用，包括候选区干员。使用后销毁，不占装备槽。':eq.kind==='trap'?'拖动到允许放置的空格部署。':'拖动到己方干员身上装备。每名干员最多携带两件装备。')+'</div>';
  else body='<div class="od-sec">'+richText(desc).replace(/\n/g,'<br>')+'</div>';
  return '<div class="od-header"><img class="eq-main-icon" src="'+equipIconPath(eq.name)+'" alt=""><div class="eq-name">'+escapeHtml(eq.name)+'</div><div class="od-tierrow"><span class="od-tierbadge">'+(source.golden?'进阶':'普通')+'</span></div></div>'+renderDetailTabs(body);
}
function renderPassiveEquipmentDetail(eq) { return renderEquipmentDetail(eq); }
function renderDeployableEquipmentDetail(eq) { return renderEquipmentDetail(eq); }
// 装置特性文本：env_gbuff 全局增益
function trapEffectDesc(effectId) {
  const ev = (Array.isArray(TRAP_EFFECTS) ? TRAP_EFFECTS : []).find(x => x.effectId === effectId);
  if (!ev || !ev.effects || !ev.effects.length) return '';
  const parts = [];
  for (const e of ev.effects) {
    if (e.key === 'env_gbuff_new_with_verify') {
      const atk = (e.bb || []).find(b => b.k === 'atk');
      if (atk) parts.push('部署后全队攻击力 +' + Math.round((Number(atk.v) || 0) * 100) + '%');
    }
  }
  return parts.join('、');
}

// 攻击范围小格子 HTML（用于 #hand-detail 立绘面板详情）
function rangeGridHtml(grids) {
  if (!grids || !grids.length) return '';
  const rows = grids.map(g => g.row), cols = grids.map(g => g.col);
  const minR = Math.min.apply(null, rows.concat(0)), maxR = Math.max.apply(null, rows.concat(0));
  const minC = Math.min.apply(null, cols.concat(0)), maxC = Math.max.apply(null, cols.concat(0));
  const colsN = maxC - minC + 1;
  const rowsN = maxR - minR + 1;
  const cell = Math.max(1, Math.min(20, Math.floor((104 - 2*(colsN-1))/colsN), Math.floor((104 - 2*(rowsN-1))/rowsN)));
  // 2D 矩阵：统一小方格尺寸（20px，3×4 范围正好放下不变形），矩阵居中，不随容器撑满变形
  let h = '<div class="od-rangegrid" style="--range-cell:'+cell+'px;grid-template-columns:repeat('+colsN+','+cell+'px)">';
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const on = grids.some(g => g.row===r && g.col===c);
      const isSelf = r===0 && c===0;
      h += '<span style="grid-column:'+(c-minC+1)+';grid-row:'+(r-minR+1)+';background:'+(isSelf?'#ffd54f':(on?'#4fc3f7':'#2a3040'))+'"></span>';
    }
  }
  h += '</div>';
  return h;
}
function renderOpInfo() {
  // 旧版左上角信息卡(#opinfo)已废弃：信息统一放入 #hand-detail 立绘面板，不再单独弹出
  const el = document.getElementById('opinfo');
  if (!el) return;
  el.style.display = 'none'; return;
}
