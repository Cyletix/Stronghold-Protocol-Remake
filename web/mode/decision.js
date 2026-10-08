// ---- 机变：随机事件类型 → 具体候选预览 → 确认 ----
const DECISION_ROUNDS = {
  standard:  { solo: [],          team: [2, 8] },
  difficult: { solo: [5, 8],      team: [2, 5, 8] },
  extreme:   { solo: [3, 8, 10],  team: [2, 8, 10] },
  ultimate:  { solo: [2, 8, 10],  team: [2, 8, 10] },
};
function decisionRound(n) {
  if(n<=1)return false;
  // 源 battleDataDict 标记的是本轮特殊休整，不能把“上一轮后”当成本轮开始。
  // 菜单中的具体决策候选仍是本地近似；此处仅接入已选关卡的阶段标记。
  if(G?.modeId)return n===G.round && G.sourceIsSpPrepare===true;
  const d = DECISION_ROUNDS[curDiff];
  return !!(d && (d[curMatch] || []).includes(n));
}
function rewardEquip() {
  if (!EQUIPS || !EQUIPS.length) return;
  const eq = EQUIPS[Math.floor(gameRandom() * EQUIPS.length)];
  G.equipInv.push({ uid: G.nextId++, id: eq.id, name: eq.name, mods: { ...(EQUIP_MODS[eq.name] || eq.mods) }, tier: 1, kind: (eq.kind || 'stat') });
}
function decisionCandidates() {
  const season=SOURCE_BATTLES?.seasons[G?.seasonId],effects=season?.decisionEffects||[];
  // The source has effects, but not server pool weights. Only executable choices enter this local pool.
  const bounty=effects.filter(e=>e.mechs.length===1&&e.mechs[0].key==='add_enemy_kill_gain_coin'&&e.mechs[0].bb.round===1&&e.mechs[0].bb.coin>0&&!e.effectId.startsWith('enemyeffect_b_')&&season.decisionEnemies[e.mechs[0].bb.enemy_id]);
  const tactic=effects.filter(e=>['enemydebuff_select_1','enemydebuff_select_2','enemydebuff_select_3'].includes(e.effectId));
  return {bounty:bounty.map(e=>({id:e.effectId,kind:'bounty',title:e.effectName,desc:e.effectDesc,enemyId:e.mechs[0].bb.enemy_id,bb:e.mechs[0].bb})),
    supply:EQUIPS.map(e=>({id:'equip:'+e.id,kind:'supply',title:e.name,desc:'获得这件装备：'+(EQUIP_DESC[e.name]?.desc||e.desc),equipId:e.id})),
    tactic:tactic.map(e=>({id:e.effectId,kind:'tactic',title:e.effectName,desc:e.effectDesc,mechs:e.mechs.filter(m=>m.key.startsWith('enemy_attribute_'))}))};
}
function prepareDecisionOffer() {
  if(G._decisionOffer?.round===G.round)return G._decisionOffer;
  const pools=decisionCandidates(),kinds=Object.keys(pools).filter(k=>pools[k].length&&(curDiff!=='standard'||k!=='bounty'));
  const kind=kinds[Math.floor(gameRandom()*kinds.length)],pool=[...(pools[kind]||[])];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(gameRandom()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  G._decisionRemaining=15;
  return G._decisionOffer={round:G.round,kind,options:pool.slice(0,curMatch==='team'?6:3)};
}
function decisionOptions() {
  // Rendering and repeated previews must never reroll a choice or consume simulation RNG.
  return (G._decisionOffer?.round===G.round?G._decisionOffer.options:[]).map(o=>({...o,ico:o.kind==='bounty'?'🎯':o.kind==='supply'?'🎁':'⚙️',apply(){
    if(o.kind==='supply'){
      const e=EQUIPS.find(e=>e.id===o.equipId);if(!e)return;
      G.equipInv.push({uid:G.nextId++,id:e.id,name:e.name,mods:{...(EQUIP_MODS[e.name]||e.mods)},tier:1,kind:e.kind||'stat'});
    }else if(o.kind==='bounty'){
      (G.bounties||(G.bounties=[])).push({enemyId:o.enemyId,count:o.bb.count,coin:o.bb.coin,round:G.round});
    }else if(o.kind==='tactic'){
      (G.decisionEnemyMods||(G.decisionEnemyMods=[])).push(...o.mechs);
    }
  }}));
}
function decisionPlain(text){return String(text||'').replace(/<[^>]*>/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function decisionIconHtml(option){
  if(option.kind==='supply'){
    const equip=EQUIPS.find(e=>e.id===option.equipId);
    return '<img src="'+equipIconPath(equip?.name||option.title)+'" alt="'+escapeHtml(option.title)+'" onerror="this.remove()">'+equipArtSvg(option.equipId);
  }
  if(option.kind==='bounty')return '<img src="enemy_avatars/'+escapeHtml(option.enemyId)+'.png" alt="'+escapeHtml(option.title)+'" onerror="this.hidden=true">';
  const key=Object.keys(option.mechs?.[0]?.bb||{}).join(' ');
  const glyph=key.includes('magic')?'<circle cx="48" cy="48" r="27"/><path d="m48 24 17 24-17 24-17-24z"/>':key.includes('def')?'<path d="M48 12 76 24v24c0 18-12 30-28 38-16-8-28-20-28-38V24z"/>':'<path d="m28 70 39-52 12 4-3 13-40 43M20 61l23 20M21 82l10-13"/>';
  return '<svg viewBox="0 0 96 96" role="img" aria-label="'+escapeHtml(option.title)+'"><g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round">'+glyph+'<path d="m65 63 9 10 10-10M74 53v20"/></g></svg>';
}
function renderDecisionCountdown(){
  const counter=document.getElementById('decision-countdown');
  if(counter)counter.textContent=Math.ceil(G?._decisionRemaining??15)+'s';
}
// Real seconds, owned by the local loop or the player's authoritative room runtime.
function advanceDecisionClock(dt){
  if(!G||G.phase!=='rest'||!decisionRound(G.round)||G._decisionResolvedRound===G.round)return dt;
  const used=Math.min(Math.max(0,dt),G._decisionRemaining??15);
  G._decisionRemaining=Math.max(0,(G._decisionRemaining??15)-used);renderDecisionCountdown();
  if(G._decisionRemaining===0){
    const options=decisionOptions(),choice=options.find(o=>o.id===G._decisionSelection?.id)||options[0];
    if(choice){previewDecision(choice.id);applyDecision(choice.id);}
  }
  return dt-used;
}
function showDecision() {
  if(!G||G.phase!=='rest'||!decisionRound(G.round)||G._decisionResolvedRound===G.round)return;
  const el = document.getElementById('decision-modal'); if (!el) return;
  hideCenterBanner();
  const opts = decisionOptions();
  const selected=G._decisionSelection?.round===G.round?G._decisionSelection.id:null;
  el.innerHTML = '<div class="dec-head">'+({bounty:'悬赏决策',supply:'道具补给',tactic:'战术决策'}[G._decisionOffer?.kind]||'机变决策')+' · 选择一项 <span id="decision-countdown">'+Math.ceil(G._decisionRemaining??15)+'s</span></div><div class="dec-body">'
    + opts.map(o => '<button type="button" class="dec-opt" aria-pressed="'+(selected===o.id)+'"'+(selected===o.id?' style="border-color:#ffd54f"':'')+' onclick="previewDecision(\''+o.id+'\')"><div class="dec-ico">'+decisionIconHtml(o)+'</div><div class="dec-title">'+decisionPlain(o.title)+'</div><div class="dec-desc">'+decisionPlain(o.desc)+'</div></button>').join('')
    + '</div><div class="dec-actions"><button type="button" class="dec-confirm" '+(selected?'onclick="applyDecision(\''+selected+'\')"':'disabled')+'>确认选择</button><p class="dec-timeout-hint">15 秒内确认；超时采用已选项，未选择则采用第一项。</p></div>';
  el.style.display = 'flex';
}
function previewDecision(id) {
  if(!G||G.phase!=='rest'||!decisionRound(G.round)||G._decisionResolvedRound===G.round||document.getElementById('decision-modal')?.style.display!=='flex')return false;
  if(!decisionOptions().some(o=>o.id===id))return false;
  G._decisionSelection={round:G.round,id};showDecision();return true;
}
function applyDecision(id) {
  if(!G||G.phase!=='rest'||!decisionRound(G.round)||G._decisionResolvedRound===G.round||document.getElementById('decision-modal')?.style.display!=='flex')return false;
  const o = decisionOptions().find(x => x.id === id);
  if(!o)return false;
  // Verified: 客户端 training_1_r3_prepare 先 effect_expand，后 effect_confirm。
  // 保留 applyDecision(id) 入口；旧的一键调用也必须先选中，不能绕过确认。
  if(G._decisionSelection?.round!==G.round||G._decisionSelection.id!==id){previewDecision(id);return false;}
  G._decisionResolvedRound=G.round;G._decisionSelection=null;
  const el = document.getElementById('decision-modal'); if (el) el.style.display = 'none';
  o.apply(); flash('决策：'+o.title);
  refreshBoard(); renderAll();return true;
}
function startRound(n) {
  const oldDecision=document.getElementById('decision-modal');if(oldDecision)oldDecision.style.display='none';
  if(G){G._decisionSelection=null;G._decisionResolvedRound=null;G._decisionOffer=null;G._decisionRemaining=null;}
  const prevMoney = (G && typeof G.money === 'number') ? G.money : 0;   // 剩余资金（坎诺特【利滚利】继承/计息用）
  if (!dispatchSessionCommand('round/begin', { round:n, money:roundMoney(n) })) {
    G.round = n; G.phase = 'rest'; G.battleDone = false; G.money = roundMoney(n);
  }
  if (G._mergeReward) { G.shop = G._mergeReward.savedShop; G._mergeReward = null; }   // 上回合未选择的晋升调配特许：恢复原商店并清除，避免卡住商店
  const carry = bandCoinCarryOver(prevMoney);   // 坎诺特【利滚利】：剩余资金继承 + 计息
  if (carry > 0) { G.money += carry; updateHud(); flash('利滚利：继承资金 +' + carry); }
  if(G.modeId)prepareSourceRound(n,{preserveFormation:true});else window.__bossBattle = (n > NORMAL_ROUNDS);
  if (G._nextRoundCoin) { G.money += G._nextRoundCoin; G._nextRoundCoin = 0; }   // 特殊装备「见钱眼开玩偶」下回合资金加成
  G._firstBuyUsed = false;   // 首购折扣标记重置（每回合一次）
  G._refreshGrant = 0;       // 贾维每回合获得干员次数上限重置
  G._firstSellUsed = false;  // 巫恋【替身娃娃】每回合首次出售标记重置
  if(n>1) G.upgradeCost = Math.max(0, G.upgradeCost - 1);
  const frozen = G.frozen;                           // 上回合是否冻结商店：先读后重置，冻结才能跨越回合保住卡池
  G.frozen = false;                                  // 冻结只保护一次回合更替，之后自动解冻（可按需重新冻结）
  const rt = document.getElementById('result'); if (rt) rt.textContent = '';   // 清除上一回合停留的「胜利/失败」文字
  genShop({ keepCards: frozen });
  if (frozen) { flash('已保留冻结商品并补齐空位（本轮已自动解冻）'); }
  garrisonPrepareStart();
  applyBandOnRound(G.band, n);   // 策略回合开始效果（U-STRATEGY：如老鲤第3回合 +15 金币）
  // 继承上回合排布（不再撤回干员）
  selectedHand = null; selBoardOp = null; selectedEquip = null; shopPreview = -1;
  G.prepareLimit=preparationLimit();G.prepareRemaining=G.prepareLimit;
  refreshBoard(); renderAll();
  // 回合开始：中央大字「第 X 回合」+ 本回合资金，浮于棋盘上方
  if (G.bountyRounds > 0) G.bountyRounds--;   // 悬赏轮次递减
  showCenterBanner('准备阶段', '回合 '+String(n).padStart(2,'0')+' · 当前资金 '+G.money, 2.8, 'prepare');
  if (decisionRound(n)) {prepareDecisionOffer();showDecision();}   // 决策轮次：弹出 3选1/6选1
}
function preparationLimit(){
  const configured=SOURCE_BATTLES.seasons[G?.seasonId]?.turnInfo?.[G?.modeId]?.[G?.round]?.normalPhaseTime;
  return Number.isFinite(configured)&&configured>0?configured:60;
}
window.updatePreparationClock=function(dt){
  if(!G||GMODE==='normal'||G.phase!=='rest')return;
  // 特殊选择是独立阶段；现有本地候选池未还原多人轮选，不能吞掉后续普通休整时间。
  dt=advanceDecisionClock(dt);
  if(document.getElementById('decision-modal')?.style.display==='flex')return;
  G.prepareRemaining=Math.max(0,(G.prepareRemaining??preparationLimit())-Math.max(0,dt));
  if(window.updateCountdown)window.updateCountdown(G.prepareRemaining);
  if(G.prepareRemaining===0&&!G._mergeReward)startBattleRound();
};

// 当前赛季/模式/等级 → 商店卡数与初始升本费；普通测试模式兼容旧目录。
function trainingConfig(){
  const cfg=TRAINING_CONFIG?.seasons[G?.seasonId];
  return cfg&&G?.modeId===cfg.modeId?cfg:null;
}
// Native LocalPlayer uses an integer Range(0,sum(count)) then MathUtil.LE before subtracting.
// Keep that boundary, including the first ticket at zero. The seeded Web RNG is a local adapter.
function trainingShopPick(rows, random=gameRandom){
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  if(!rows.length||total<=0)return null;
  let ticket=Math.floor(random()*total);
  for(const row of rows){if(ticket<=row.count)return row;ticket-=row.count;}
  return rows[rows.length-1];
}
function genTrainingShop(rows,keepCards){
  const kept=keepCards?G.shop.slice():[],needed=Math.max(0,shopLevelInfo().charChessCount-kept.length);
  if(keepCards&&!needed)return;
  const cfg=trainingConfig(),byChess=seasonRoster(G.seasonId,BATTLE.operators,G.diySelections||{}).byChess;
  // Resolve exact source chess identities. User bans may empty a pool; never substitute another tier.
  const candidates=rows.filter(row=>{
    const entry=byChess[row.chessId],binding=cfg.operatorBindings[row.chessId];
    if(!entry||entry.charId!==binding?.charId)throw Error('训练商品来源不匹配：'+row.chessId);
    return !G.bannedOperators?.includes(entry.charId);
  });
  G.shop=[];
  for(let i=0;i<needed;i++){
    const selected=trainingShopPick(candidates);if(!selected)break;
    const entry=byChess[selected.chessId];
    G.shop.push({type:'op',entry,cost:operatorPurchasePrice(entry)});
  }
  G.shop.push(...kept);
}
function shopLevelInfo(level=G?.level) {
  const source=G?.modeId?SOURCE_BATTLES.seasons[G.seasonId]?.shopLevels[G.modeId]?.[level]:null;
  if(source)return {charChessCount:source.charChessCount,itemCount:source.itemCount,upgrade:source.initialUpgradePrice};
  const l = (G && Array.isArray(SHOP_LEVEL)) ? SHOP_LEVEL[level - 1] : null;
  return l || { charChessCount: 3, itemCount: 1, upgrade: 5 };
}
function shopPriceInfo(tier,golden=false){return SOURCE_BATTLES?.seasons[G?.seasonId]?.shopPrices?.[tier]?.find(x=>x.isGolden===golden);}
function operatorPurchasePrice(entry){const price=GMODE==='normal'?null:garrisonTraits({entry,elite:false},false).find(g=>g.kind==='SERVER_CHESS_PRICE')?.bb.price;return price??shopPriceInfo(entry.tier)?.purchasePrice??TIER_PRICE[entry.tier]??BUY_COST;}
function operatorSoldPrice(op){return shopPriceInfo(op.entry.tier,!!op.elite)?.chessSoldPrice??SELL_REFUND;}
function shopRefreshPrice(){return SOURCE_BATTLES?.seasons[G?.seasonId]?.constData?.shopRefreshPrice??REFRESH_COST;}
function shopEquipmentPool(level=G?.level) {
  // The mode owns its market. Missing/empty source data must not expose the legacy pool.
  if(!G?.modeId)return EQUIPS;
  const byEffect=new Map(EQUIPS.map(e=>[e.effectId,e]));
  return (SHOP_ITEMS?.seasons[G.seasonId]||[]).filter(row=>row.hideInShop===false&&row.itemType==='EQUIP'&&!row.isGolden
    &&Number.isInteger(row.itemLevel)&&row.itemLevel<=level&&Number.isFinite(row.purchasePrice)&&row.purchasePrice>=0&&byEffect.has(row.effectId))
    .map(row=>({...byEffect.get(row.effectId),chessId:row.itemId,shopLevel:row.itemLevel,cost:row.purchasePrice}));
}
// 特殊刷新策略（U-STRATEGY）：杜遥夜【广交豪杰】(band_first_self_refresh_present_char)/佩佩【博学多通】(up_shop_next_refresh_must_present_bond_char) → 刷新优先出指定盟约干员
function bandRefreshBond() {
  if (!G || !Array.isArray(BAND_EFFECTS)) return null;
  const be = runBandEffects().find(x => x.bandId === G.band); if (!be) return null;
  const m = be.mechs.find(x => x.key === 'band_first_self_refresh_present_char') || be.mechs.find(x => x.key === 'up_shop_next_refresh_must_present_bond_char');
  return m ? bbStr(m.bb || [], 'bond') : null;
}
function shopSlots() { const l = shopLevelInfo(); return (l.charChessCount ?? 3) + (l.itemCount ?? 0); }
function genShop({ keepCards = false } = {}) {
  const trainingRows=trainingConfig()?.trainingShopInfos?.[G.level];
  if(trainingRows)return genTrainingShop(trainingRows,keepCards);
  const kept = keepCards ? G.shop.slice() : [];
  const info = shopLevelInfo(), configuredItems = info.itemCount ?? 0;
  const capacity = (info.charChessCount ?? 3) + configuredItems;
  const slots = keepCards ? Math.max(0, capacity - kept.length) : capacity;
  if (keepCards && !slots) return;   // 满栏/策略额外商品原样保留，也不消耗抽卡随机数
  const itemCount = keepCards
    ? Math.min(slots, Math.max(0, configuredItems - kept.filter(s => s.type === 'equip').length))
    : configuredItems;
  // 本地近似：低阶高概率；尚未取得源概率/有限库存表，不能视为原版抽卡分布。
  // 盟约·辅助干员/预备干员-辅助等「特殊干员」不进普通商店卡池（由特定策略/机制开局自带）
  const NON_SHOP = ['char_616_pithst', 'char_606_csuppo'];
  const weighted = [];
  for (const o of ROSTER_LIST) {
    if(G.bannedOperators?.includes(o.charId))continue;
    if (o.tier > G.level) continue;
    if (NON_SHOP.includes(o.charId)) continue;
    weighted.push({ entry: o, w: Math.max(1, 8 - o.tier) });   // 阶越低权重越高（tier1→7 … tier6→2）
  }
  const bondB = keepCards && kept.some(s => s.type === 'op') ? null : bandRefreshBond();
  const equipmentPool=shopEquipmentPool();
  G.shop = [];
  for (let i=0;i<slots;i++) {
    if (i < itemCount) {   // 物品卡：属性装备（穿戴到干员）
      // Equal weights remain a local approximation; source rows only constrain eligibility/price.
      if(!equipmentPool.length)continue;
      const eq = equipmentPool[Math.floor(gameRandom()*equipmentPool.length)];
      const mods = EQUIP_MODS[eq.name] || eq.mods;
      G.shop.push({ type:'equip', equip: { ...eq, mods, kind: 'stat' }, cost: eq.cost });
    } else if (bondB && i === itemCount) {   // 首个干员位；无可执行道具时也保留策略保证
      const beforeGrant=G.shop.length;
      grantBandOperator({ bond: bondB, tierMax: G.level, intoShop: true });
      if (G.shop.length === beforeGrant) { const e = ROSTER_LIST.find(x => !G.bannedOperators?.includes(x.charId)&&bandBondsOf(x).includes(bondB)); if (e) { G.shop.push({ type:'op', entry: e, cost: operatorPurchasePrice(e) }); } }
    } else {
      const total = weighted.reduce((s,x)=>s+x.w,0);
      if (!total) continue;
      let r = gameRandom()*total, pick = weighted[0].entry;
      for (const x of weighted) { r -= x.w; if (r <= 0) { pick = x.entry; break; } }
      G.shop.push({ type:'op', entry: pick, cost: operatorPurchasePrice(pick) });
    }
  }
  // 商品购买后向右靠齐；新增卡填在左侧空位，保留原卡顺序、屏幕位置和全部属性。
  G.shop.push(...kept);
}
function refreshShop() {
  if (!G || G.phase !== 'rest') return;
  if (G._mergeReward) { flash('请先选择晋升调配奖励'); return; }
  const voucher=(G._garrisonFreeRefresh||0)>0;
  let free = voucher;
  if (!free&&G.activeBonds && G.activeBonds['miraShip']) free = gameRandom() < Math.min(0.95, 0.25+0.003*G.activeBonds['miraShip']);
  if (!free && G.money < shopRefreshPrice()) { flash('资金不足（刷新需 '+shopRefreshPrice()+'）'); return; }
  if (!free) { if (!dispatchSessionCommand('economy/spend', { amount:shopRefreshPrice(), reason:'shop-refresh' })) G.money -= shopRefreshPrice(); }
  else {if(voucher)G._garrisonFreeRefresh--;flash(voucher?'特质：使用免费刷新，剩余 '+G._garrisonFreeRefresh+' 次':'奇迹盟约：本次刷新免费');}
  G._garrisonRoundSpent=(G._garrisonRoundSpent||0)+(free?0:shopRefreshPrice());
  G._garrisonRoundRefresh=(G._garrisonRoundRefresh||0)+1;
  resolveBoard();garrisonEvent('SERVER_REFRESH_SHOP');
  G.frozen = false;      // 手动刷新即主动更换卡池，本次冻结随之取消（若无冻结也无副作用）
  // 贾维【团伙行动】：主动刷新达 refresh_count 次 → 获得 1 名 ≤ 当前等级 bond 干员（每回合至多 max_count 名）
  if (G.band && Array.isArray(BAND_EFFECTS)) {
    const be = runBandEffects().find(x => x.bandId === G.band);
    if (be) {
      const m = be.mechs.find(x => x.key === 'refresh_shop_count_gain_coin_bond_char_chess');
      if (m) { const bb = m.bb || []; const th = bbNum(bb, 'refresh_count') || 6, bond = bbStr(bb, 'bond'), mx = bbNum(bb, 'max_count') || 2;
        G._refreshCount = (G._refreshCount || 0) + 1; G._refreshGrant = (G._refreshGrant || 0);
        if (G._refreshCount >= th && G._refreshGrant < mx) { G._refreshCount = 0; G._refreshGrant++; grantBandOperator({ bond, tierMax: G.level, intoShop: true }); flash('团伙行动：获得 ' + (BOND_DEFS[bond] ? BOND_DEFS[bond].name : '') + ' 干员'); } }
    }
  }
  const copyMax = bandRefreshCopyMaxLv();   // 梓兰【猎头顾问】：主动刷新复制当前商店最高阶干员
  genShop();
  if (copyMax) { for (let i = 0; i < copyMax.cnt; i++) G.shop.push({ type: 'op', entry: copyMax.entry, cost: operatorPurchasePrice(copyMax.entry) }); flash('猎头顾问：复制最高阶干员'); }
  renderAll();
}

function upgradeShop() {
  if (!G || G.phase !== 'rest') return;
  if (G._mergeReward) { flash('请先选择晋升调配奖励'); return; }
  if (G.level >= MAX_LEVEL) { flash('调度中心已满级'); return; }
  if (G.money < G.upgradeCost) { flash('资金不足（升级需 '+G.upgradeCost+'）'); return; }
  // 升本二次确认（I-20260902-028）：首次点击提示，再次点击确认，点其他处取消
  // 升本二次确认（I-20260902-028）：卡片文字+高亮提示，再点确认、点无关处取消
  if (!G._upgradeConfirm) { G._upgradeConfirm = true; renderShop(); return; }
  G._upgradeConfirm = false;
  const nextLevel = G.level + 1;
  G._garrisonRoundSpent=(G._garrisonRoundSpent||0)+G.upgradeCost;
  const nextUpgradeCost = shopLevelInfo(nextLevel).upgrade ?? (4 + nextLevel);
  if (!dispatchSessionCommand('shop/upgrade', { cost:G.upgradeCost, nextCost:nextUpgradeCost })) {
    G.money -= G.upgradeCost; G.level = nextLevel; G.upgradeCost = nextUpgradeCost; G._upgradeConfirm = false;
  }
  // 凯瑟琳【博学多通】up_shop_add_special_goods：升本后加特殊装备（specialeq）
  if (G.band && Array.isArray(BAND_EFFECTS)) { const be = runBandEffects().find(x => x.bandId === G.band); const m = be && be.mechs.find(x => x.key === 'up_shop_add_special_goods'); if (m) { rewardSpecialEquip(bbNum(m.bb || [], 'count') || 3); flash('获得特殊装备'); } }
  genShop();     // 升本解锁更高阶干员，必定刷新卡池——冻结不阻断升本刷新（否则会锁死在旧卡池）
  renderAll();
}

// 冻结 / 解冻商店：回合更替保留现有商品，只补空位（也可手动刷新）
function toggleFreeze() {
  if (!G || G.phase !== 'rest') { flash('仅休整期可冻结商店'); return; }
  if (G._mergeReward) { flash('请先选择晋升调配奖励'); return; }
  if (!dispatchSessionCommand('shop/toggle-freeze')) G.frozen = !G.frozen;
  flash(G.frozen ? '已冻结商店：下一轮保留商品并补齐空位' : '已解冻商店');
  renderAll();
}
// 同步商店抽屉：战斗中自动收起并隐藏展开手柄（禁用购买/操作），休整期恢复用户手动选择
function syncShopDrawer() {
  if (GMODE === 'normal') return;   // 普通模式无商店
  const d = document.getElementById('shopdrawer');
  if (!d) return;
  const inBattle = (G && G.phase === 'battle');
  document.body?.classList.toggle('battle-camera-locked',!!inBattle);
  document.body?.classList.toggle('boss-camera-open',!!(inBattle&&G.sourceBossId));
  const preview=document.getElementById('preview-btn');if(preview){preview.disabled=!!inBattle;preview.title=inBattle?'作战期间不能查看敌人预览':'查看怪物预览';}
  const collapsed = inBattle ? true : !!window.__shopCollapsed;
  d.classList.toggle('collapsed', collapsed);
  if (window.__setShopReserve) window.__setShopReserve(collapsed);
  const lbl = document.getElementById('collapse-label');
  if (lbl) lbl.textContent = collapsed ? '展开 ▼' : '收起 ▲';
  // 刷新/冻结按钮：仅休整期且商店展开时显示（战斗中或收起后隐藏）
  const fabs = document.getElementById('shop-fabs');
  if (fabs) fabs.classList.toggle('hidden', collapsed);
}
// 收起 / 展开底部商店抽屉（仅休整期可手动切换）
function toggleDrawer() {
  if (!G || G.phase !== 'rest') return;
  window.__shopCollapsed = !window.__shopCollapsed;
  syncShopDrawer();
  layoutBench();
}

function buyShop(i) {
  if (!G || G.phase !== 'rest') return;
  const s = G.shop[i]; if (!s) return;
  let cost = s.cost;
  if (s.type !== 'equip') { const disc = bandFirstBuyDiscount(s.entry); if (disc > 0) { cost = Math.max(0, cost - disc); flash('首购折扣 -' + disc); } }
  if (G.money < cost) { flash('资金不足'); return; }
  if (!dispatchSessionCommand('economy/spend', { amount:cost, reason:'shop-purchase' })) G.money -= cost;
  G._garrisonRoundSpent=(G._garrisonRoundSpent||0)+cost;
  // 累计花费策略（U-STRATEGY 自动覆盖该类）：每/累计使用资金 → 获得干员（绮良每20、潘格尼尼累计55）
  if (G.band && Array.isArray(BAND_EFFECTS)) {
    const be = runBandEffects().find(x => x.bandId === G.band);
    if (be) {
      G._spentMoney = (G._spentMoney || 0) + cost;
      if (be.mechs.some(m => m.key === 'band_coin_cost_gain_random_char_by_shop_level')) {
        while ((G._spentMoney || 0) >= 20) { G._spentMoney -= 20; grantBandOperator({ tierMax: G.level, intoShop: true }); flash('通关奖励：获得随机干员'); }
      }
      if (be.mechs.some(m => m.key === 'band_cost_coin_reach_cnt_gain_chess_from_pool')) {
        if ((G._spentMoney || 0) >= 55) { G._spentMoney -= 55; grantBandOperator({ tierMin: 4, bond: 'lateranoShip', intoShop: true }); flash('定制铳械：获得精锐拉特兰干员'); }
      }
    }
  }
  // 玛恩纳【业务指标】：每购买 bond(卡西米尔)干员 → 下回合资金加成计数（至多 max_count）
  if (s.type !== 'equip' && G.band && Array.isArray(BAND_EFFECTS)) {
    const be = runBandEffects().find(x => x.bandId === G.band);
    if (be) {
      const m = be.mechs.find(x => x.key === 'round_start_gain_coin_by_bond_char_chess_buy');
      if (m) { const bb = m.bb || []; const bond = bbStr(bb, 'bond'), mx = bbNum(bb, 'max_count') || 3;
        if (bond && bandBondsOf(s.entry).includes(bond) && (G._bondBuyBonus || 0) < mx) G._bondBuyBonus = (G._bondBuyBonus || 0) + bbNum(bb, 'count') || 1; }
    }
  }
  G.shop.splice(i, 1);   // 买完后该栏位移除（先移除：合并奖励时 savedShop 才是「原页面」，且不会误删奖励卡）
  if (s.type === 'equip') G.equipInv.push({ uid: G.nextId++, id: s.equip.id, ...(s.equip.chessId?{chessId:s.equip.chessId,effectId:s.equip.effectId}:{}), name: s.equip.name, mods: { ...s.equip.mods }, tier:1, kind: (s.equip && s.equip.kind) || 'stat' });
  else addOperator(s.entry.charId, false);
  refreshBoard();        // 更新引擎候选区（B.bench）
  renderAll();
}

// —— 商店两阶段购买：首次点击=预览(左侧面板+卡高亮+确认按钮)，再次点击同一张/点确认=购买，点别处=取消 ——
function onShopCardClick(i) {
  if (!G || G.phase !== 'rest') return;
  if (!G.shop[i]) return;
  if (!G._mergeReward && shopPreview === i) { confirmBuy(i); return; }   // 普通商品再次点击可购买；晋升奖励必须点确认按钮
  selectedHand = null; selBoardOp = null;              // 商店预览与「手牌/场上选中」互斥，避免左侧立绘面板叠两套
  shopPreview = i;
  renderShop();
  showShopPreview(i);
}
// 预览只留在本机；联机时仅确认后通过 selectMergeReward 提交领取命令。
function confirmMergeReward(i) {
  if (!G || G.phase !== 'rest' || !G._mergeReward || shopPreview !== i) return;
  return selectMergeReward(i);
}
// 晋升调配特许领取：确认后免费加入候选区，恢复商店原页面。
function selectMergeReward(i) {
  if (!G || G.phase !== 'rest') return;
  const s = G.shop[i]; if (!s || s.type !== 'op' || !G._mergeReward) return;
  // 先恢复底层商店再发奖励；奖励触发另一次晋级时，新奖励会保留这份正确快照。
  G.shop = G._mergeReward.savedShop;
  G._mergeReward = null;
  cancelShopPreview();
  addOperator(s.entry.charId, false);
  if(!G._mergeReward&&G._garrisonRewardQueue?.length)showMergeReward(G._garrisonRewardQueue.shift());
  refreshBoard(); renderAll();
  flash('晋升调配特许：获得 '+s.entry.name);
}
function confirmBuy(i) {
  if (!G || G.phase !== 'rest') return;
  const s = G.shop[i]; if (!s) { cancelShopPreview(); return; }
  if (G.money < s.cost) { flash('资金不足'); return; }   // 保持预览，不取消
  cancelShopPreview();
  buyShop(i);
}
function cancelShopPreview() {
  shopPreview = -1;
  const el = document.getElementById('hand-detail');
  if (el && !selectedHand && !selBoardOp) el.style.display = 'none';
  renderShop();   // 移除高亮与确认按钮
}
function hideShopPreview() { const el = document.getElementById('hand-detail'); if (el && !selectedHand && !selBoardOp) el.style.display = 'none'; }
// 左侧干员/装备预览面板：统一写入 #hand-detail（与手牌/场上干员共用同一立绘面板，保证互斥、不再叠两套）
function showShopPreview(i) {
  const el = document.getElementById('hand-detail');
  if (!el) return;
  const s = G.shop[i]; if (!s) return;
  let body;
  if (s.type === 'equip') {
    body = renderEquipmentDetail(s.equip);
    el.classList.add('equip');
  } else {
    const e = s.entry;
    const bonds = [];
    if (e.seasonBond) bonds.push(BOND_DEFS[e.seasonBond].name);
    for (const b of e.regBonds) bonds.push(BOND_DEFS[b].name);
    body = opDetailHtml(e, { entry:e, charId:e.charId, elite:false, equip:[] }, bonds, false);
    el.classList.remove('equip');
  }
  const artUrl = (s.type === 'equip') ? '' : 'portraits/'+s.entry.charId+'.png';
  const confirmButton = G._mergeReward
    ? '<button type="button" class="merge-confirm" onclick="event.stopPropagation();confirmMergeReward('+i+')">确认选择</button>'
    : '<button class="mini buy-confirm" onclick="event.stopPropagation();confirmBuy('+i+')">确认购买 ¥'+s.cost+'</button>';
  el.innerHTML = '<div class="bgfx">'
    +'<div class="art" style="background-image:url('+ (artUrl ? "'"+artUrl+"'" : '') +')"></div>'
    +'<div class="fade"></div>'
    +'</div>'
    +'<div class="txt">'+body
    +'<div style="margin-top:12px">'+confirmButton+'</div>'
    +'</div>';
  el.style.display = 'block';
}

function addOperator(charId, elite, chain=new Set()) {
  if(G.bannedOperators?.includes(charId)||!ROSTER[charId])return false;
  let gained;
  if (!elite) {
    const same = G.ops.filter(o => o.charId===charId && !o.elite);
    const needed=Math.max(2,garrisonProfile(ROSTER[charId])?.upgradeNum||3)-1;
    if (same.length >= needed) {
      const consumed=same.slice(0,needed),placed=consumed.find(o=>o.row!=null);
      const equipment=consumed.flatMap(o=>(o.equip||[]).filter(Boolean));
      consumed.forEach(o => removeOp(o.id));
      gained={ id:G.nextId++, charId, entry: ROSTER[charId], elite:true, equip:equipment.slice(0,2), row:placed?.row??null, col:placed?.col??null, dir:placed?.dir||'up' };
      G.ops.push(gained);G.equipInv.push(...equipment.slice(2).map(eq=>({...eq,uid:G.nextId++})));
      flash('★ 合成精锐：'+ROSTER[charId].name);
      showMergeReward();   // 晋升调配特许：商店切换显示 3 个高一阶随机干员
    }
  }
  if(!gained){gained={ id:G.nextId++, charId, entry: ROSTER[charId], elite:!!elite, equip:[], row:null, col:null, dir:'up' };G.ops.push(gained);}
  G._garrisonRoundGained=(G._garrisonRoundGained||0)+1;
  resolveBoard();garrisonEvent('SERVER_GAIN',gained,chain);
  return gained;
}

// 晋升调配特许：三合一合成精锐后，商店切换显示 3 个比当前调度中心高一阶的随机干员，选择 1 个加入候选区后恢复商店原页面
function showMergeReward(requestedTier) {
  if (!G || G.phase !== 'rest' || !Array.isArray(ROSTER_LIST)) return;
  const tier = requestedTier??Math.min(6, (G.level || 1) + 1);
  if(G._mergeReward){(G._garrisonRewardQueue??=[]).push(tier);return;}
  const pool = ROSTER_LIST.filter(e => e.tier === tier && !NON_SHOP.includes(e.charId)&&!G.bannedOperators?.includes(e.charId));
  if (!pool.length) return;
  const picked = [];
  const copy = pool.slice();
  for (let i = 0; i < 3 && copy.length; i++) {
    const idx = Math.floor(gameRandom() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  G._mergeReward = { savedShop: G.shop };
  G.shop = picked.map(e => ({ type: 'op', entry: e, cost: 0 }));
  G._upgradeConfirm = false;
  cancelShopPreview();
  flash('晋升调配特许：选择一个「'+tier+' 阶」干员加入候选区');
}

function removeOp(id) { G.ops = G.ops.filter(o => o.id !== id); }

function sellHand(id) {
  const o = G.ops.find(x => x.id===id); if (!o || o.row!=null) return;
  let refund = operatorSoldPrice(o);   // 出售固定返还 1（原版为固定值，不按阶返还）
  if (G.activeBonds && G.activeBonds['investShip']) refund += 1;
  // 售卖带装备的干员：把装备退回候选区
  if (o.equip && o.equip.length) {
    for (const eq of o.equip) if (eq) G.equipInv.push({ uid: G.nextId++, id: eq.id, name: eq.name, mods: { ...eq.mods }, tier: eq.tier || 1 });
  }
  removeOp(id);
  resolveBoard();garrisonEvent('SERVER_CHESS_SOLD',o);
  if (!bandFirstSellExchange()) G.money += refund;   // 巫恋【替身娃娃】：每回合首次出售改为与调度中心干员交换
  if (selectedHand===id) selectedHand = null;
  refreshBoard();        // 从候选区移除该干员（装备已退回候选区）
  renderAll();
}

function recallBoard(id) {
  const o = G.ops.find(x => x.id===id); if (!o || o.row==null) return;
  if (G.phase !== 'rest') { flash('战斗中无法撤离'); return; }   // 战斗中撤离无效
  o.row = null; o.col = null; delete o.tacticalPlacement;
  selBoardOp = null; setSelected(null);
  refreshBoard(); renderAll();
}
function onOpRightClick(id) { recallBoard(id); }
// 场上干员拖回候选区指定格：撤回到拖放目标 tile_achand（目标格已有候选干员则交换到其原位）
function onBenchRecall(id, toRow, toCol) {
  if (G.phase !== 'rest') { flash('战斗中无法撤离'); return; }
  const o = G.ops.find(x => x.id===id); if (!o || o.row==null) return;
  if (!candidateCells(BDATA.level).some(x=>x.row===toRow && x.col===toCol)) { recallBoard(id); return; }
  o.row = null; o.col = null; delete o.tacticalPlacement;
  o.bench = { row: toRow, col: toCol };
  const other = G.ops.find(x => x.row==null && x.id!==id && x.bench && x.bench.row===toRow && x.bench.col===toCol);
  if (other) other.bench = null;   // 被顶走的候选干员让 refreshBoard 重新分配
  selBoardOp = null; setSelected(null);
  refreshBoard(); renderAll();
}
// 菱形盘「装备」按钮：把装备栏第一件装备直接穿到该干员身上（无独立浮层，装备即买即用）
function onEquipClick(id) {
  if (shopPreview >= 0) shopPreview = -1;
  selBoardOp = id; setSelected(id);
  if (!G.equipInv.length) { flash('无装备可穿戴（可在商店购买装备后再点「装备」）'); return; }
  const o = G.ops.find(x => x.id===id); if (!o) return;
  attachEquip(o, G.equipInv[0], equipNextSlot(o));
}

function selectHand(id) { if (shopPreview >= 0) shopPreview = -1; selectedHand = id; renderAll(); }
function onOpClick(id) { if (shopPreview >= 0) shopPreview = -1; selBoardOp = (selBoardOp===id) ? null : id; selectedHand = null; setSelected(selBoardOp); renderAll(); }
// 候选区（地图底行）干员：点击=选中（左侧立绘 + 菱形盘「出售」），再点=取消
function onBenchClick(id) {
  if (shopPreview >= 0) shopPreview = -1;
  selBoardOp = null;
  selectedHand = (selectedHand===id) ? null : id;
  setSelected((selectedHand == null) ? null : id);
  renderAll();
}
function onBenchSell(id) {
  if (G.equipInv.some(x => x.uid === id)) { sellEquip(id); return; }   // 候选区装备 → 出售装备
  sellHand(id);
}
// 已部署干员售卖（操作盘右上「售卖」按钮）：返还 SELL_REFUND，装备退回候选区，干员移除
function onOpSell(id) {
  if (G.phase !== 'rest') { flash('战斗中无法出售'); return; }
  const o = G.ops.find(x => x.id===id); if (!o) return;
  let refund = operatorSoldPrice(o);
  if (G.activeBonds && G.activeBonds['investShip']) refund += 1;
  if (o.equip && o.equip.length) {
    for (const eq of o.equip) if (eq) G.equipInv.push({ uid: G.nextId++, id: eq.id, name: eq.name, mods: { ...eq.mods }, tier: eq.tier || 1 });
  }
  removeOp(id);
  resolveBoard();garrisonEvent('SERVER_CHESS_SOLD',o);
  if (!bandFirstSellExchange()) G.money += refund;   // 巫恋【替身娃娃】：每回合首次出售改为与调度中心干员交换
  selBoardOp = null; setSelected(null);
  refreshBoard(); renderAll();
}

function onTileClick(row, col) {
  // 点空格子：取消选中/商店预览（部署改为拖拽）；取消手牌/装备选中并关闭左侧详情
  if (G) G._upgradeConfirm = false;   // 升本二次确认：点无关处取消（I-20260902-028）
  if (shopPreview >= 0) cancelShopPreview();
  selBoardOp = null; selectedHand = null; selectedEquip = null; setSelected(null);
  renderAll();
}

function startHandDrag(id) {
  if (G.phase !== 'rest') return;
  const o = G.ops.find(x => x.id===id); if (!o || o.row!=null) return;
  // 开始拖动即在左侧弹出人物大图（对应 renderSelected 的 #hand-detail 分支）
  if (selectedHand !== id) { selectedHand = id; renderAll(); }
  startDrag({ id: o.id, charId: o.entry.charId, name: o.entry.name, position:o.entry.position, rangeGrids: entryRangeGrids(o.entry, o.elite) });
}

// 拖动中途取消（未部署/点取消按钮/不可部署）：取消手牌选中并关闭左侧详情（由 engine.onUp 回调触发）
function onHandDragCancel() {
  if (selectedHand != null) { selectedHand = null; renderSelected(); }
}

// 获得道具：trapChessDataDict 同时包含装备和装置，不能由字典名推断部署方式。
function rewardTrap(chessId) {
  if (!G || !TRAP_DATA || !TRAP_DATA.traps) return;
  const t = TRAP_DATA.traps[chessId]; if (!t) return;
  const item={ uid: G.nextId++, id: t.chessId, charId: t.charId, effectId: t.effectId, name: t.name, mods: {}, tier: t.isGolden?2:1, kind: 'trap' };
  normalizeRewardEquipment(item);
  G.equipInv.push(item);
}
// 装置部署：放到棋盘格（B.traps），应用 env_gbuff 效果。
function deployTrap(op, row, col, dir) {
  if (!G || G.phase !== 'rest' || !B) return;
  if (!B.traps) B.traps = [];
  if (B.traps.some(t => t.row === row && t.col === col)) { flash('该格已有装置'); return; }
  B.traps.push({ uid: op.id, charId: op.charId, effectId: op.effectId, row, col });
  G.equipInv = G.equipInv.filter(x => x.uid !== op.id);
  applyTrapEffect(op.effectId);
  refreshBoard(); renderAll();
}
function applyTrapEffect(effectId) {
  const ev = (Array.isArray(TRAP_EFFECTS) ? TRAP_EFFECTS : []).find(x => x.effectId === effectId); if (!ev) return;
  for (const e of (ev.effects || [])) {
    if (e.key === 'env_gbuff_new_with_verify') {
      const atk = e.bb.find(b => b.k === 'atk');
      if (atk) { G._trapAtk = (G._trapAtk || 0) + Number(atk.v || 0); flash('装置：全队攻击 +' + Math.round((atk.v * 100)) + '%'); }
    } else flash('装置效果待接入：' + e.key);
  }
}
// 铃兰 SERVER_GAIN：干员「获得时」特质（garrison eventType=SERVER_GAIN）按 effectType(g.kind) 生效。已实现：盟约层数(SERVER_ADD_BOND_CHESS_ALL)、下回合金币(SERVER_ONCE_GOLD)、按等级加层(SERVER_ADD_BOND_METHOD)；其余标注待接入。
function applyServerGain(g,o){garrisonExecute(g,o);return true;}
// 唯一的干员落位检查：预览、部署、移动和交换共用，始终以本局干员资料判定。
function operatorPlacementProblem(op, row, col, moving=false) {
  if(!G||G.phase!=='rest')return '仅休整期可调整部署';
  const unit=G.ops.find(o=>o.id===op?.id)||op;
  if(!unit)return '未选择干员';
  if((B?.summoneds||[]).some(s=>!s.removed&&s.row===row&&s.col===col))return '该格已有召唤物或战术点';
  if(!isDeployable(row,col,unit)){
    const kind=BDATA.level.buildable[row]?.[col];
    return kind==='RANGED'?'此处仅可部署高台干员':kind==='MELEE'?'此处仅可部署地面干员':'这里不能部署此干员';
  }
  const other=G.ops.find(o=>o.id!==unit?.id&&o.row===row&&o.col===col);
  if(other){
    if(!moving)return '该格已有干员';
    if(unit?.row==null||!isDeployable(unit.row,unit.col,other))return '交换对象不能部署到原位置';
  }
  if(!moving&&unit?.charId!=='char_4215_buddy'&&G.ops.filter(o=>o.row!=null&&o.charId!=='char_4215_buddy').length>=deployLimit())return '可部署角色已达上限（'+deployLimit()+'）';
  return '';
}
function onDeploy(op, row, col, dir) {
  if (G.phase !== 'rest') return;
  if (op && op.isTrap) { deployTrap(op, row, col, dir); return; }   // 装置部署（U-ITEMS）
  const o = G.ops.find(x => x.id===op.id);
  if (!o || o.row!=null) return;
  const problem=operatorPlacementProblem(o,row,col);
  if(problem){flash(problem);if(window.onDeployReject)window.onDeployReject();return;}
  o.row = row; o.col = col; o.dir = dir || 'up'; o.deployTime = Date.now();
  selectedHand = null;
  refreshBoard(); renderAll();
  flash('部署 '+o.entry.name);
  playSfx('b_char_set');
}

// 拖动场上已部署干员到新位置（onMoveOp 由 engine 拖拽回调）；目标格已有干员时视为交换
function onMoveOp(id, row, col, dir) {
  if (G.phase !== 'rest') return;
  const o = G.ops.find(x => x.id===id); if (!o || o.row==null) return;
  const problem=operatorPlacementProblem(o,row,col,true);
  if(problem){flash(problem);return;}
  const moved=o.row!==row||o.col!==col;
  const other = G.ops.find(x => x.id!==id && x.row===row && x.col===col);
  if (other) {
    // 交换：目标格干员保持朝向；双方位置互换，并各自播放重新部署下落动画（与部署/开局风格一致）
    other.row = o.row; other.col = o.col;
    other.deployTime = Date.now();
    o.row = row; o.col = col; o.dir = dir || o.dir || 'up';
    o.deployTime = Date.now();
    refreshBoard(); renderAll();
    flash('交换 '+o.entry.name+' ↔ '+other.entry.name);
    playSfx('b_char_set');
    return;
  }
  o.row = row; o.col = col; o.dir = dir || o.dir || 'up';
  o.deployTime = Date.now();   // 场上移动也触发重新部署下落动画
  refreshBoard(); renderAll();
  flash('移动 '+o.entry.name);
  if(moved)playSfx('b_char_set');
}

function refreshBoard() {
  resolveBoard();
  const board = G.ops.filter(o => o.row!=null).map(o => boardView(o));
  if (GMODE === 'normal') { showBoard(board, []); return; }
  showBoard(board, []);prepareTacticalPoints();assignBenchCells();
  // 卫戍协议候选区是关卡内真实 tile_achand 功能格，不是屏幕边缘 DOM 手牌栏。
  const candidates = G.ops.filter(o => o.row==null).map(benchView)
    .concat(G.equipInv.map(equipBenchView),tacticalCandidates().map(tacticalBenchView)).filter(Boolean);
  B.bench=candidates;
}
function flowCopyPreset(o,targetId){
  if(o.charId!=='char_249_mlyss')return null;
  const donor=G.ops.find(x=>x.id===targetId&&x.id!==o.id&&x.row==null);if(!donor)return null;
  const stats=finalizeOperator(donor.entry,null,donor.equip,donor.elite),sub=stats.basicAttack?.subProfession;
  const physical=['PIONEER','WARRIOR','SNIPER','SPECIAL','TANK'].includes(donor.entry.profession)&&sub!=='artsfghter'||sub==='craftsman';
  return {charId:donor.charId,name:donor.entry.name,maxHp:stats.maxHp,atk:stats.atk,def:stats.def,magicRes:stats.magicRes||0,blockCnt:stats.blockCnt,
    position:donor.entry.position,attackTime:donor.entry.baseAttackTime||donor.entry.attackTime,rangeGrids:entryRangeGrids(donor.entry,donor.elite),atkType:physical?'phys':'arts'};
}
function boardView(o) {
  return { id:o.id, charId:o.charId, name:o.entry.name, profession:o.entry.profession, position:o.entry.position,
    row:o.row, col:o.col, tier:o.entry.tier, elite:o.elite, equip:o.equip, maxHp:o.maxHp, atk:o.atk, def:o.def,
    blockCnt:o.blockCnt, respawnTime:o.respawnTime, attackTime:o.attackTime, range:o.range, reviveChance:o.reviveChance, dmgTaken:o.dmgTaken, cooperationDamage:o.cooperationDamage,cooperationResistance:o.cooperationResistance,dodge:o.dodge,
    magicRes:o.magicRes, atkType:o.atkType, events:o.events,attackCrit:o.attackCrit,basicAttack:o.basicAttack,combatTalents:o.combatTalents,attributeBase:o.attributeBase,
    garrisonAdd:garrisonTraits(o),garrisonStats:o.garrisonStats,
    tacticalPlacement:o.tacticalPlacement?{...o.tacticalPlacement}:null,
    costFloor:commandCarriedBonus().floor,cost:(o.cost != null) ? o.cost : BUY_COST,
    skill:o.skill, dir:o.dir || 'up', rangeGrids: entryRangeGrids(o.entry, o.elite), deployTime:o.deployTime || 0 };
}
function candidateCells(lv) {
  const cells = [];
  if (!lv || !lv.grid) return cells;
  // 只取当前作战段（中段/2区）内的 tile_achand，避免把买的干员放到 boss 区/屏外。
  const zone = (typeof window !== 'undefined' && window.modeBattleZoneRows) ? window.modeBattleZoneRows(lv) : null;
  const lb = zone ? zone.lb : 0, rb = zone ? zone.rb : lv.rows;
  for (let r=lb;r<rb;r++) for (let c=0;c<lv.cols;c++) {
    if (lv.grid[r] && lv.grid[r][c] === 'tile_achand') cells.push({ row:r, col:c });
  }
  // 原图候选区位于底部两排；从最底排开始填充，保持视觉顺序稳定。
  return cells.sort((a,b) => (b.row-a.row) || (a.col-b.col));
}
function candidateItems() {
  return G.ops.filter(o=>o.row==null).concat(G.equipInv,tacticalCandidates());
}
// 仅使用关卡数据明确标记的 tile_achand；没有真实候选格时不制造底行 fallback。
function assignBenchCells() {
  if (!BDATA || !BDATA.level) return;
  const lv = BDATA.level;
  const blocked = new Set(G.ops.filter(o=>o.row!=null).map(o=>o.row+','+o.col));
  const avail = candidateCells(lv).filter(cell=>!blocked.has(cell.row+','+cell.col));
  const valid = new Set(avail.map(cell=>cell.row+','+cell.col));
  const cands = candidateItems();
  const used = new Set();
  // 保留仍落在真实候选格、且不与其它候选重复的位置，避免刷新覆盖自由排序。
  for (const o of cands) {
    if (o.bench) {
      const key = o.bench.row+','+o.bench.col;
      if (valid.has(key) && !used.has(key)) used.add(key);
      else o.bench = null;
    }
  }
  const free = avail.filter(cell=>!used.has(cell.row+','+cell.col));
  for (const o of cands) {
    if (o.bench) continue;
    const cell = free.shift();
    o.bench = cell ? { row:cell.row, col:cell.col } : null;
  }
}
// 候选区移动：干员和装备均可在真实 tile_achand 间交换/移到空位。
function onBenchMove(fromId, toRow, toCol) {
  if (!G || G.phase !== 'rest') return;
  if (!candidateCells(BDATA.level).some(x=>x.row===toRow && x.col===toCol)) return;
  const items = candidateItems();
  const itemId = x => x.uid != null ? x.uid : x.id;
  const from = items.find(x => itemId(x)===fromId); if (!from) return;
  const to = items.find(x => x.bench && x.bench.row===toRow && x.bench.col===toCol);
  if (to && itemId(to) !== fromId) { const tb = to.bench; to.bench = from.bench; from.bench = tb; }
  else if (!to) { from.bench = { row: toRow, col: toCol }; }                                      // 移动到空位
  refreshBoard(); renderAll();
}
function benchView(o) {
  const cell = o.bench; if (!cell) return null;
  return { id:o.id, charId:o.charId, name:o.entry.name, profession:o.entry.profession,
    position:o.entry.position, row:cell.row, col:cell.col, bench:true, elite:o.elite, equip:o.equip,
    rangeGrids: entryRangeGrids(o.entry, o.elite), skill:o.skill || null };
}
// 候选区装备项：拖到干员头上即穿戴（场上/候选均可）
function equipBenchView(eq) {
  const cell = eq.bench; if (!cell) return null;
  if (eq.kind === 'trap') return { id: eq.uid, type:'trap', isTrap: true, charId: eq.charId, effectId: eq.effectId, name: eq.name, row: cell.row, col: cell.col, bench: true, rangeGrids: [] };   // 装置候选走部署通道
  return { id: eq.uid, type:'equip', name: eq.name, mods: eq.mods, row: cell.row, col: cell.col, bench: true };
}
