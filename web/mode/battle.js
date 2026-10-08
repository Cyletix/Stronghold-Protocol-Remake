// ---- 开战 / 结算 ----
function selectedRunContext(silent=false) {
  const map=playableLevels()[CUR] || playableLevels()[0];
  const seasonId=setupSeason();
  const modeId=curDiff==='training'?'mode_training_1':'mode_'+(curMatch==='team'?'multi':'single')+'_'+DIFF_GAMEDATA[curDiff].toLowerCase();
  const mode=SOURCE_BATTLES.seasons[seasonId]?.modes[modeId];
  if(!mode) { if(!silent)flash('当前赛季没有所选模式，请调整难度或地图'); return null; }
  const stage=setupStageKey?mode.stageChoices.find(s=>s.levelKey===setupStageKey):(mode.stageChoices.find(s=>s.stageId===map?.id)||mode.stageChoices[0]);
  if(!stage){if(!silent)flash('请在对局设置中选择当前模式支持的地图');return null;}
  return {seasonId,modeId,mapKey:stage.levelKey,roundChoices:{}};
}
function runModeData() { return G?.modeId?SOURCE_BATTLES.seasons[G.seasonId].modes[G.modeId]:null; }
function sourceBossInfo(bossId) { return SOURCE_BATTLES.seasons[G?.seasonId]?.bosses?.[bossId] || null; }
function selectSourceRoundIndex(alternatives) {
  const weights=alternatives.map(a=>{const weight=sourceBossInfo(a.bossId)?.weight;return Number.isFinite(weight)?Math.max(0,weight):1;});
  const total=weights.reduce((sum,weight)=>sum+weight,0);
  if(!total)return Math.floor(gameRandom()*alternatives.length);
  let point=gameRandom()*total;
  for(let i=0;i<weights.length;i++){point-=weights[i];if(point<0)return i;}
  return weights.findLastIndex(weight=>weight>0);
}
function currentSourceBattle() { return G?.sourceLevelKey?SOURCE_BATTLES.levels[G.sourceLevelKey]:null; }
function battleSourceForRun(){
  const original=currentSourceBattle();if(!original)return null;
  const record=G.enemyPlan?.rounds[G.round];
  const base=record?window.ArkEnemyReplacement.applyToSource(original,record,ENEMY_ENCOUNTERS):original;
  let waves=base.waves,enemies=base.enemies;
  const bounties=(G.bounties||[]).filter(b=>b.round===G.round);
  if(bounties.length){
    waves=JSON.parse(JSON.stringify(waves));enemies={...enemies};
    for(const bounty of bounties){
      const enemy=SOURCE_BATTLES.seasons[G.seasonId]?.decisionEnemies?.[bounty.enemyId];if(!enemy)continue;
      const actions=base.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions)).filter(a=>a.actionType==='SPAWN'&&a.count>0);
      const route=actions.find(a=>!!base.enemies[a.key]?.flying===!!enemy.flying)||actions.find(a=>!base.enemies[a.key]?.flying);
      if(!route)continue;
      enemies[bounty.enemyId]=enemy;
      waves[0].fragments[0].actions.push({...route,key:bounty.enemyId,count:bounty.count,interval:1,preDelay:2,bountyCoin:bounty.coin,randomSpawnGroupKey:null});
    }
  }
  // 保留既有本地悬赏约定：追加两名普通地面敌人；不改写源表或宣称这是客户端分支。
  if(G.bountyRounds>0){
    const pair=base.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions)).find(a=>a.actionType==='SPAWN'&&a.count>0&&!base.enemies[a.key]?.flying&&!BOSS_LIST.some(b=>b.id===a.key));
    if(pair){waves=JSON.parse(JSON.stringify(waves));const fragment=waves[0].fragments[0];fragment.actions.push({...pair,count:2,interval:1,preDelay:(pair.preDelay||0)+2,randomSpawnGroupKey:null});}
  }
  return {...base,waves,enemies,enemyModifiers:G.decisionEnemyMods||[],enemyStatMultiplier:G.enemyNerf??1,leaderEnemyId:sourceBossInfo(G.sourceBossId)?.enemyId};
}
function previewCurrentWave(){
  const source=battleSourceForRun();
  if(source)return source.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions.flatMap(a=>a.actionType==='SPAWN'?Array.from({length:a.count??1},()=>({enemyId:a.key,route:a.routeIndex})):[])));
  const rng=window.ArkSim?.snapshot();try{return genWaves(GMODE==='normal'?3:(G?.round||1));}finally{if(rng)window.ArkSim.restore(rng);}
}
function prepareSourceRound(n, {preserveFormation=false}={}) {
  const mode=runModeData();if(!mode)return;
  // Only a real round transition may relocate a formation. Loading a rest save
  // uses stored absolute cells, even if resetBattleView left another zone active.
  const oldZone=preserveFormation&&BDATA?.level?window.modeBattleZoneRows(BDATA.level):null;
  const oldPositions=new Map();
  if(oldZone)for(const o of G.ops)if(o.row!=null&&o.row>=oldZone.lb&&o.row<oldZone.rb&&isDeployable(o.row,o.col,o))oldPositions.set(o,{row:o.row,col:o.col});
  const round=mode.rounds.find(r=>r.round===n);if(!round)throw new Error('模式没有第 '+n+' 轮');
  const saved=G.roundChoices[n];
  const choice=round.alternatives[saved??(G.roundChoices[n]=selectSourceRoundIndex(round.alternatives))];
  const source=SOURCE_BATTLES.levels[choice.levelKey],map=SOURCE_BATTLES.levels[G.mapKey];
  const notes=source.warnings.filter(w=>!w.includes('unreachable')&&!w.includes('PATROL_MOVE'));
  G.sourceLevelKey=choice.levelKey;G.sourceBossId=choice.bossId;G.sourceIsSpPrepare=choice.isSpPrepare;
  window.__bossBattle=!!choice.bossId;
  const level=window.ArkSourceMap.convertBattle(map.level,source,notes);
  G.sourceWarnings=[...new Set(notes)];
  setLevel({level,enemies:{...BATTLE.enemies,...battleSourceForRun().enemies}});
  // Keep the formation's relative rows when the battlefield moves to its leader
  // section; only invalid destinations or collisions return to the reserve.
  const zone=window.modeBattleZoneRows(level);
  const moved=oldZone&&zone&&(oldZone.lb!==zone.lb||oldZone.rb!==zone.rb),occupied=new Set();
  for(const o of G.ops){
    if(o.row==null)continue;
    const old=oldPositions.get(o),row=moved&&old?old.row+zone.lb-oldZone.lb:o.row,col=o.col,key=row+','+col;
    if(!zone||row<zone.lb||row>=zone.rb||!isDeployable(row,col,o)||occupied.has(key)){o.row=null;o.col=null;delete o.bench;delete o.tacticalPlacement;}
    else {
      if(moved&&old&&o.tacticalPlacement)o.tacticalPlacement.row+=zone.lb-oldZone.lb;
      o.row=row;o.col=col;occupied.add(key);
    }
  }
}

function startBattleRound() {
  if (G.phase !== 'rest') return;
  if(G._mergeReward||document.getElementById('decision-modal')?.style.display==='flex'){flash('请先完成当前选择');return;}
  if (GMODE === 'normal') { startNormalBattle(); return; }   // 普通模式：单波限时防守
  const board = G.ops.filter(o => o.row!=null);
  // Empty-board rounds are valid (notably Lee's zero-allowance first two rounds).
  const routeProblem=sourceRouteProblem(battleSourceForRun());if(routeProblem){flash(routeProblem);return;}
  window.__preview=false;window.__viewRect=null;window.__previewWave=null;
  G.addLayers??={};window.onBondGarrison=onBondGarrison;
  garrisonPrepareBattle();
  applyBandStrategy(G.band, board);   // 策略效果（U-STRATEGY）：开战前按 band_effects.json 应用（如华法琳盟约层数+2）
  const { active } = resolveBoard();
  G.activeBonds = active;
  const source=battleSourceForRun();
  const spawn = source ? [] : genWaves(G.round);
  const shield = roundShield(G.round);
  // Ordinary unspent funds expire when preparation ends; Cannot explicitly carries them.
  G.money=bandCoinCarryOver(G.money)>0?G.money:0;
  G.shield = shield; G.shieldMax = shield;
  G.roundStartLife=G.life;
  if (!dispatchSessionCommand('session/patch', { fields:{ phase:'battle' } })) G.phase = 'battle';
  window.__bossBattle = source ? !!G.sourceBossId : G.round > NORMAL_ROUNDS;
  selectedHand = null; selBoardOp = null; shopPreview = -1;   // 开战：清除选中/预览，禁用购买与操作
  document.getElementById('start-btn').style.display = 'none';
  const views = G.ops.filter(o=>o.row!=null).map(o => boardView(o));
  startBattle(views, spawn, shield, source);
  renderAll();
  showCenterBanner(G.sourceBossId?'领袖作战':'作战开始','回合 '+String(G.round).padStart(2,'0')+' · 守住防线',2.8,G.sourceBossId?'boss':'battle');
}
// 普通模式开战：一批固定强度的敌潮，无需资金/回合/商店
function startNormalBattle() {
  if (G.phase !== 'rest') return;
  const board = G.ops.filter(o => o.row!=null);
  if (!board.length) { flash('至少部署一名干员再开战'); return; }
  window.__preview=false;window.__viewRect=null;window.__previewWave=null;
  G.addLayers = {}; G._gar = {}; window.onBondGarrison = onBondGarrison;   // 本场 ADD_BOND 层数清零并挂回调
  const { active } = resolveBoard();
  G.activeBonds = active;
  const spawn = genWaves(3);
  const shield = roundShield(3);
  G.shield = shield; G.shieldMax = shield;
  if (!dispatchSessionCommand('session/patch', { fields:{ phase:'battle' } })) G.phase = 'battle';
  window.__bossBattle = false;   // 普通模式单波：不用 boss 作战区
  selectedHand = null; selBoardOp = null; shopPreview = -1;   // 开战：清除选中/预览
  document.getElementById('start-btn').style.display = 'none';
  const views = G.ops.filter(o=>o.row!=null).map(o => boardView(o));
  startBattle(views, spawn, shield);
  renderAll();
  flash('作战开始：守住防线！');
}

function genWaves(r) {
  const spawn = [];
  let t = 0;
  const rc = BDATA.level.routes.length;
  // 非联防（单人）：只用左半区红门路线，避免敌人从右侧红门出；无左半路线则兜底用全部
  const _half = Math.ceil(BDATA.level.cols / 2);
  const leftRoutes = [];
  for (let _i = 0; _i < rc; _i++) { const _rt = BDATA.level.routes[_i]; const _s = _rt && _rt.segs && _rt.segs[0] && _rt.segs[0][0]; if (_s && _s.c != null && _s.c < _half) leftRoutes.push(_i); }
  if (!leftRoutes.length) for (let _i = 0; _i < rc; _i++) leftRoutes.push(_i);
  const routeFor = _i => leftRoutes[_i % leftRoutes.length];
  // 本局特训敌人类型 → 敌人列表（特训敌人 + 附属敌人）；无类型则兜底用普通敌人池
  const typePool = (ENEMY_TYPE_POOL && curEnemyType) ? (ENEMY_TYPE_POOL[curEnemyType] || []) : [];
  const pool = typePool.length
    ? typePool.map(enemyId => ({ enemyId, isFly: !!(BDATA.enemies[enemyId] && (BDATA.enemies[enemyId].flying || BDATA.enemies[enemyId].isFly)) }))
    : ((MDATA && MDATA.enemyPool) || []);
  const pick = arr => arr[Math.floor(gameRandom() * arr.length)];
  // 敌人攻/血按「难度 × 回合」官方加成表缩放（PRTS 独立模拟列）；防御无官方数据，保留自创线性
  const d = (DIFFICULTY[curDiff] || DIFFICULTY.standard);
  const nerf = (G && G.enemyNerf) || 1;
  const coreMul = (G && G.secretCore) ? 2.5 : 1;   // 隐秘核心：敌人整体性能大幅增强
  const dm = d.mul(r) * nerf * coreMul;
  const hpK = dm, atkK = dm, defK = 1 + 0.15 * (r - 1);
  const push = (id, route, at) => {
    const base = BDATA.enemies[id]; if (!base) return;
    spawn.push({ enemyId: id, route, at,
      hpOverride: Math.round(base.maxHp * hpK),
      atkOverride: Math.round(base.atk * atkK),
      defOverride: Math.round(base.def * defK) });
  };
  // 敌人池按 maxHp 分档（弱→强），回合越后越强
  const inactive = (G && G.inactiveEnemyKey) || [];
  const valid = pool.filter(p => BDATA.enemies[p.enemyId] && !inactive.includes(p.enemyId));
  const byHp = valid.slice().sort((a, b) => (BDATA.enemies[a.enemyId].maxHp || 0) - (BDATA.enemies[b.enemyId].maxHp || 0));
  const ground = byHp.filter(p => !p.isFly), fly = byHp.filter(p => p.isFly);
  const pickTier = (list, rr) => {
    if (!list || !list.length) return null;
    const maxIdx = Math.max(1, Math.min(list.length - 1, Math.floor(list.length * rr / 5)));
    const tier = list.slice(0, maxIdx + 1);
    return tier[Math.floor(gameRandom() * tier.length)];
  };
  const isBoss = r > NORMAL_ROUNDS;
  if (isBoss) {
    const boss = BOSS_LIST[Math.floor(gameRandom() * BOSS_LIST.length)];
    const bbase = BDATA.enemies[boss.id];
    spawn.push({ enemyId: boss.id, route: 0, at: t + 3,
      hpOverride: Math.round((bbase ? bbase.maxHp : 25000) * dm),
      atkOverride: Math.round((bbase ? bbase.atk : 350) * dm),
      defOverride: Math.round((bbase ? bbase.def : 250) * (1 + 0.2 * (r - 1))),
      moveSpeed: bbase ? bbase.moveSpeed : 0.35 });
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < 4 + r; i++) { const g = pickTier(ground, r); if (g) push(g.enemyId, routeFor(i), t); t += 0.9; }
      t += 3;
    }
    return spawn;
  }
  const waves = Math.min(5, 2 + Math.floor(r / 2));
  for (let w = 0; w < waves; w++) {
    const count = 3 + r + w;
    for (let i = 0; i < count; i++) {
      // 飞行单位从第2回合穿插（奇数波）；地面/飞行池缺失时互相回退，避免 FLY 特训类型第1回合无怪
      const list = (r >= 2 && w % 2 === 1 && fly.length) ? fly : (ground.length ? ground : fly);
      const g = pickTier(list, r);
      if (g) push(g.enemyId, routeFor(i), t);
      t += 0.8;
    }
    t += 2.2;
  }
  // 悬赏决策：接下来数轮额外加入敌人（击倒给额外资金由 kill_coin 机制覆盖）
  if (G && G.bountyRounds > 0 && ground.length) {
    for (let b = 0; b < 2; b++) { const g = ground[Math.floor(gameRandom() * ground.length)]; if (g) push(g.enemyId, routeFor(b), t); }
  }
  return spawn;
}

function onLeak(e) {
  if (G && G.phase === 'battle') {
    G.life = Math.max(0, G.life - (e.lifePointReduce || 1));
    updateHud();
    if (G.life <= 0&&!B.resolvingLeaks) window.haltBattle(false);
  }
}
// 击杀奖励金币：仅 kill_coin.json 指定的敌人（按 enemy_id + 当前回合 round）掉落；普通击杀不掉钱（I-20260901-020）
window.onKillCoin = function(enemyId,enemy) {
  if(G&&enemy?.bountyCoin>0){
    G._nextRoundCoin=(G._nextRoundCoin||0)+enemy.bountyCoin;
    flash('悬赏完成：下轮资金 +'+enemy.bountyCoin);return;
  }
  if (!G || !Array.isArray(KILL_COIN)) return;
  const cur = G.round;
  let gain = 0;
  for (const k of KILL_COIN) if (k.enemyId === enemyId && (k.round == null || k.round === cur)) gain += (k.coin || 0) * (k.count || 1);
  if (gain) { if (!dispatchSessionCommand('economy/add', { amount:gain })) G.money += gain; updateHud(); flash('击杀奖励 +' + gain + ' ¥'); }
};

function onBattleEnd(win, remainingShield) {
  if (!G || G.phase !== 'battle' || G.battleDone) return;   // G 可能已被 backToMenu 置空
  G.battleDone = true;
  G.lastBattleWin = !!win;
  recordRoundResult(win);
  playSfx(win ? 'b_ui_win' : 'b_ui_lose');   // 回合胜负音效
  if (GMODE === 'normal') {   // 普通模式：单波定胜负，无下一回合/商店
    document.getElementById('result').textContent = win ? '🎉 作战胜利' : '💀 防线失守';
    flash(win ? '作战胜利！守住阵地' : '作战失败…');
    renderAll();
    showCenterBanner(win ? '作战胜利' : '作战失败', win ? '守住防线' : '防线被击穿', 3);
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('menu-btn').style.display = 'inline-block';   // 返回菜单
    return;
  }
  let evalText;
  if(win && G.sourceBossId && B?.endReason==='leader-defeated'){
    nextRound();   // 最终领袖立即结算；符合原有门槛时进入隐藏领袖准备
    return;
  }
  if (win) {
    if(!G.modeId){
      const deployed=G.ops.filter(o=>o.row!=null).length;
      const dmg=remainingShield+deployed+(G.round>NORMAL_ROUNDS?30:0);
      G.enemyHp-=dmg;
      flash('回合胜利！对敌方造成 '+dmg+' 点伤害');
    }else flash('回合胜利！本轮作战完成');
    document.getElementById('result').textContent = '回合 '+G.round+' 胜利';
    const full = remainingShield >= roundShield(G.round);   // 满盾=零漏怪
    evalText = full ? '完美作战！' : (remainingShield >= Math.floor(roundShield(G.round)/2) ? '坚守阵地' : '作战胜利');
  } else {
    const reason=B?.endReason==='timeout'?'作战超时：场内 '+B.endCounts.alive+' 名，待出场 '+B.endCounts.pending+' 名':'防线失守（本轮发生漏怪）';
    flash('回合失败：'+reason);
    document.getElementById('result').textContent = '回合 '+G.round+' 失败';
    evalText = reason;
  }
  renderAll();
  document.getElementById('next-btn').style.display = 'inline-block';   // 保留手动下一回合兜底
  // 回合结束：中央大字「作战结束」+ 评价，停留 3s 后自动进入下一回合的商店购买阶段
  showCenterBanner('作战结束', evalText, 3);
  const r = G.round;
  setTimeout(() => { if (G && G.phase === 'battle' && G.battleDone && G.round === r) nextRound(); }, 3000);
}

// 社区门槛按赛季隔离；真实多人接入时必须传全体玩家记录，不能用TEAM_AI名字虚构层数。
function hiddenBossEligibility(players){
  return window.ArkHiddenBoss.eligibility({seasonId:G?.seasonId,modeId:G?.modeId,
    players:players||[{id:'local',life:G?.life??0,activeBonds:G?.activeBonds||{}}]});
}
function canEnterSecretCore() {
  if (!G || curDiff === 'training' || curDiff === 'standard') return false;
  return hiddenBossEligibility().eligible;
}
function nextRound() {
  if (G.phase !== 'battle') return;
  if (G.modeId && !G.battleDone) return;
  // Source runs finish at their configured leaders; the legacy synthetic HP pool
  // is not a source victory condition (full video: round 14, then hidden leader).
  if (!G.modeId && G.enemyHp <= 0) { endRun(true); return; }
  if (G.life <= 0 && !G.secretCore) { endRun(false); return; }   // 隐秘核心失败不判负（不影响通关）
  const mode=runModeData();
  if(mode){
    const index=mode.rounds.findIndex(r=>r.round===G.round),next=mode.rounds[index+1];
    if(!next){endRun(G.secretCore || G.lastBattleWin === true);return;}
    // 保留既有隐秘核心条件；配置列表含候选关，不将隐藏候选自动变为必经关。
    if(G.sourceBossId && next.alternatives.every(a=>sourceBossInfo(a.bossId)?.isHidingBoss===true)){
      if(!G.lastBattleWin){endRun(false);return;}
      if(!canEnterSecretCore()){endRun(true);return;}
      G.secretCore=true;
    }
    document.getElementById('next-btn').style.display='none';document.getElementById('start-btn').style.display='flex';
    startRound(next.round);return;
  }
  if (G.round > NORMAL_ROUNDS) {
    if (G.round === 14 && canEnterSecretCore()) {
      G.secretCore = true;
      flash('？？：隐秘核心来袭！');
      document.getElementById('next-btn').style.display = 'none';
      document.getElementById('start-btn').style.display = 'flex';
      startRound(15);
      return;
    }
    endRun(true);
    return;
  }
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('start-btn').style.display = 'flex';
  startRound(G.round + 1);
}

function showFailFlash() {
  const ff = document.getElementById('fail-flash');
  if (!ff || !ff.classList) return;
  ff.classList.add('on');
  setTimeout(() => { if (ff.classList) ff.classList.remove('on'); }, 1200);
}
function endRun(win) {
  G.phase = 'over';
  document.getElementById('result').textContent = win ? '🎉 通关胜利' : '💀 战败';
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('menu-btn').style.display = 'inline-block';
  flash(win ? '卫戍协议通关！' : '模拟结束');
  if (!win) {
    showFailFlash();   // 失败：红色失败动画
    renderAll();
  }else renderAll();
  if(GMODE!=='normal')showSettlement(win);
}
