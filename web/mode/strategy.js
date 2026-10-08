// ---- 开局情报（两屏：1/2 确认本局信息 → 2/2 选择策略）----
let PLAYER_NAME = '博士';
let pickedBandIdx = -1;
let BOND_BANS = [];   // 本局禁用干员：[{bid,name,ops:[entry]}]
let setupSeasonId=null,setupStageKey=null;
let localRunSetup=null;
function setupModeId(){return curDiff==='training'?'mode_training_1':'mode_'+(curMatch==='team'?'multi':'single')+'_'+DIFF_GAMEDATA[curDiff].toLowerCase();}
function setupSeason(){return setupSeasonId || 'act2autochess';}
function setupBands(){return SOURCE_BATTLES.seasons[setupSeason()]?.bands||MDATA.bands||[];}
function runBandEffects(){return SOURCE_BATTLES?.seasons[G?.seasonId]?.bands||BAND_EFFECTS||[];}
function setupBandDetail(band){return band?.desc!=null?{血量:band.hp,效果:band.desc.replaceAll('\\n','\n')}:BAND_DATA[band?.name]||{};}
function resetBattleView(){
  window.__preview=false;window.__previewWave=null;window.__viewRect=null;window.__bossBattle=false;window.viewMode=0;
  selected=null;drag=null;hover=null;cam.f=0;fitS=NaN;benchHide=0;simulationClock=null;last=null;
  syncHalfLabel();
}
function setSetupSeason(value){
  if(!SOURCE_BATTLES.seasons[value])return;
  setupSeasonId=value;buildRoster();setupStageKey=null;refreshSourceSetupInfo();
}
function selectSetupMap(key){
  const mode=SOURCE_BATTLES.seasons[setupSeason()]?.modes[setupModeId()];
  if(!mode?.stageChoices.some(x=>x.levelKey===key))return;
  setupStageKey=key;refreshSourceSetupInfo();
}
function refreshSetupMaps(){
  const sid=setupSeason(),season=SOURCE_BATTLES.seasons[sid],mid=setupModeId(),choices=season?.modes[mid]?.stageChoices||[];
  const selector=document.getElementById('season-select');if(selector)selector.value=sid;
  if(!choices.some(x=>x.levelKey===setupStageKey))setupStageKey=choices.find(x=>x.stageId===playableLevels()[CUR]?.id)?.levelKey||choices[0]?.levelKey||null;
  const maps=document.getElementById('map-select');if(maps){
    maps.innerHTML=choices.map(x=>{const map=playableLevels().find(l=>l.id===x.stageId);return '<option value="'+x.levelKey+'">'+escapeHtml(map?.name||x.stageId)+'</option>';}).join('');
    maps.value=setupStageKey||'';maps.disabled=!choices.length;
  }
  const note=document.getElementById('map-note');if(note)note.textContent=choices.length?'当前模式可选 '+choices.length+' 张地图；确认策略后才开始对局。':'当前赛季没有此模式，请调整难度或联机方式。';
}
function backToSetupInfo(){
  document.getElementById('setup-info').style.display='flex';document.getElementById('setup-pick').style.display='none';refreshSourceSetupInfo();
}
// 首页核心盟约顺序（势力盟约，参照截图 6 个）
const CORE_BONDS = ['sargonShip','victoriaShip','lateranoShip','egirShip','yanShip','kjeragShip'];
function setupBondIcon(bid, name, missing) {
  return '<div class="setup-bond-icon" style="border-color:'+(BOND_COLOR[bid]||'#ffd54f')+'">'
    + '<img src="bond_avatars/icon_'+bid+'.png" alt="'+escapeHtml(name)+'" onerror="avErr(event)">'
    + (missing>0?'<span class="bond-missing" aria-label="缺席'+missing+'名干员">−'+missing+'</span>':'')+'</div>';
}
function setPlayerName(v){ PLAYER_NAME = ((v||'').trim()) || '博士'; const iEl=document.getElementById('player-name'); if(iEl && iEl.value !== PLAYER_NAME) iEl.value = PLAYER_NAME; }
const ROMAN = ['','Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ'];
function tierToRoman(t){ const n = parseInt(t,10); return (n>=1 && n<=7) ? ROMAN[n] : (t||''); }
function bannedOpsFor(bid, n){ const pool=(ROSTER_LIST||[]).filter(e=>e.seasonBond===bid); for(let i=pool.length-1;i>0;i--){const j=Math.floor(gameRandom()*(i+1)); const t=pool[i];pool[i]=pool[j];pool[j]=t;} return pool.slice(0,n); }
function opCharIdByName(nm){ if (BATTLE && BATTLE.operators) { const o = BATTLE.operators.find(x => x.name === nm); return o ? o.charId : ''; } return ''; }
const BAND_AVATARS = {};   // bandId -> charId（主键缓存；仅在策略头像缺失时回退到干员头像）
// 策略阶段使用卫戍协议专用头像（PRTS「策略发起人」立绘，web/band_avatars/<bandId>.png），不再套用干员头像。
function avatarUrlForBand(band){
  if (!band) return '';
  return 'band_avatars/' + band.bandId + '.png';
}
// 策略头像加载失败 → 回退干员头像 → 仍失败则占位 '?'
function bandAvatarFallback(ev, bandId){
  if (!ev || !ev.target) return;
  const img = ev.target;
  const band = (MDATA.bands || []).find(b => b.bandId === bandId);
  if (band && !img.dataset.fb) {
    const c = (band.charId || opCharIdByName(band.name)) || '';
    img.dataset.fb = '1';
    if (c) { img.onerror = avErr; img.src = 'avatars/' + c + '.png'; return; }
  }
  avErr(ev);
}
function avErr(ev){ ev.target.onerror = null; ev.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%231c202b'/><text x='40' y='48' font-size='30' fill='%235a6274' text-anchor='middle'>?</text></svg>"; }
// 页面 shell 状态：menu/setup/battle 三态，决定哪些全局 HUD 显示（见 topbar.css 的 body.mode-* 规则）
function setUiMode(mode) {
  if (typeof document === 'undefined' || !document.body || !document.body.classList) return;   // 无 DOM 环境（测试 sandbox）下跳过
  document.body.classList.remove('mode-menu', 'mode-setup', 'mode-battle');
  if (mode) document.body.classList.add(mode);
}
function showSetup() {
  if(window.ArkSim)window.ArkSim.seed(Date.now());
  setUiMode('mode-setup');
  curBoss = null;curEnemyType = null;curEnemyTypes = [];pickedBandIdx = -1;
  if(!setupSeasonId)setupSeasonId='act2autochess';
  if(!setupStageKey&&setupSeasonId==='act2autochess')setupStageKey='activities/act2autochess/level_act2autochess_m01';
  setDifficulty(curDiff);setMatch(curMatch);
  const setup = document.getElementById('setup'); if (setup) setup.style.display = 'flex';
  const info = document.getElementById('setup-info'); if (info) info.style.display = 'flex';
  const pick = document.getElementById('setup-pick'); if (pick) pick.style.display = 'none';
  const main = document.getElementById('main'); if (main) main.style.display = 'none';
  const menu = document.getElementById('menu'); if (menu) menu.style.display = 'none';
  // 第一屏：boss + 敌人类型
  refreshSourceSetupInfo();
  // 禁用名单必须来自本局规则，不能凭页面随机生成没有实际效果的名单。
  BOND_BANS = [];
  // 核心盟约 + 缺失/被ban
  const bm = document.getElementById('bond-meta'); if (bm) bm.innerHTML = CORE_BONDS.map(bid=>{
    const d = BOND_DEFS[bid]; if (!d) return '';
    const banInfo = BOND_BANS.find(x=>x.bid===bid);
    const lack = !!banInfo; const cnt = banInfo ? banInfo.ops.length : 0;
    return '<div class="bond-cell'+(lack?' lack':' have')+'" title="'+(lack?('被ban：'+banInfo.ops.map(o=>o.name).join('、')):'阵容完整')+'">'+setupBondIcon(bid,d.name,cnt)+'<div class="bn">'+d.name+'</div><div class="bb">'+(lack?('被ban '+cnt+'：'+banInfo.ops.map(o=>o.name).join('、')):'阵容完整')+'</div></div>';
  }).join('');
  // 本局禁用干员：具体名单（盟约在左，干员头像矩阵在右）
  const bo = document.getElementById('banned-ops'); if (bo) bo.innerHTML = BOND_BANS.length
    ? BOND_BANS.map(b=>'<div class="banned-row">'+setupBondIcon(b.bid,b.name,b.ops.length)+'<div class="bond-nm">'+b.name+'</div><div class="opps">'
        + b.ops.map(op=>'<div class="op"><img src="avatars/'+op.charId+'.png" onerror="avErr(event)"><span class="tier">'+escapeHtml(tierToRoman(op.tier))+'</span></div>').join('')
        + '</div></div>').join('')
    : '<div class="banned-none"></div>';
  renderSetupRoster();
  const pn = document.getElementById('player-name'); if (pn) pn.value = PLAYER_NAME;
  const rc = document.getElementById('ready-count-num'); if (rc) rc.textContent = '下一步选择策略';
  const bgm = document.getElementById('bgm');
  if (bgm && !bgm.muted && bgm.paused) bgm.play().catch(()=>{});
}
// 原情报页的参战干员名册；房间与本机入口共用同一展示。
function renderSetupRoster(){
  const rl = document.getElementById('roster-list');
  if (rl) {
    const byTier = {};
    for (const e of ROSTER_LIST) { (byTier[e.tier] = byTier[e.tier] || []).push(e); }
    rl.innerHTML = '<div class="blk-title">参战干员名单 <span class="warn">特许=4/5★ · 原型=6★</span></div>'
      + [1, 2, 3, 4, 5, 6].map(t => {
        const list = (byTier[t] || []).sort((a, b) => b.rarity - a.rarity);
        if (!list.length) return '';
        return '<div class="roster-tier"><b class="rt-tier">'+tierToRoman(t)+'</b><span class="rt-ops">'
          + list.map(e => '<span class="roster-op '+(e.rarity <= 5 ? 'concess' : 'proto')+'" title="'+(e.rarity <= 5 ? '特许干员' : '原型补位')+'">'+escapeHtml(e.name)+'</span>').join('')
          + '</span></div>';
      }).join('');
  }
}
// 2/2 选择策略：准备就绪后进入，渲染 4 玩家 + 策略矩阵
function infoReady() {
  if(!selectedRunContext())return;
  const info = document.getElementById('setup-info'); if (info) info.style.display = 'none';
  const pick = document.getElementById('setup-pick'); if (pick) pick.style.display = 'flex';
  if(setupBands().some(band=>band.bandId===pickedBandIdx)){pickBand(pickedBandIdx);return;}
  // 单人模式：仅"我"一个玩家，昵称来自主界面设置
  const left = document.getElementById('pick-left'); if (left) left.classList.remove('open');
  const card = document.getElementById('pick-card'); if (card) card.classList.remove('open');
  const body = document.getElementById('pick-card-body'); if (body) body.innerHTML = '';
  renderPickPlayers(); renderBandMatrix();
}
const ME_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><circle cx='24' cy='19' r='9' fill='%237ce0ad'/><path d='M6 46c0-9 8-14 18-14s18 5 18 14v2H6z' fill='%237ce0ad'/></svg>";
function renderPickPlayers() {
  const el = document.getElementById('pick-players'); if (!el) return;
  let bname = '请选择策略…';
  if (pickedBandIdx !== -1 && pickedBandIdx != null) { const band=(MDATA.bands||[]).find(b=>b.bandId===pickedBandIdx); const bd=band?(BAND_DATA[band.name]||{}):null; if (band) bname = band.name+(bd.策略?' · '+bd.策略:''); }
  let html = '<div class="player me">'
    + '<img class="pav" src="'+ME_AVATAR+'">'
    + '<div style="flex:1;min-width:0"><div class="pname">'+escapeHtml(PLAYER_NAME)+'</div><div class="pband">'+escapeHtml(bname)+'</div></div>'
    + '</div>';
  // 同盟模拟：追加电脑队友
  for (const ai of (TEAM_AI || [])) {
    html += '<div class="player"><img class="pav" src="band_avatars/'+ai.bandId+'.png" onerror="bandAvatarFallback(event,\''+ai.bandId+'\')">'
      + '<div style="flex:1;min-width:0"><div class="pname">'+escapeHtml(ai.name)+'</div><div class="pband">'+escapeHtml(ai.bandName||'')+'</div></div></div>';
  }
  el.innerHTML = html;
}
function renderBandMatrix() {
  const el = document.getElementById('band-matrix'); if (!el) return;
  el.innerHTML = setupBands().map((b)=>{
    return '<button type="button" class="band-cell'+(b.bandId===pickedBandIdx?' sel':'')+'" title="'+escapeHtml(b.name)+'" aria-label="选择策略：'+escapeHtml(b.name)+'" onclick="pickBand(\''+b.bandId+'\')">'
      + '<img src="'+avatarUrlForBand(b)+'" alt="'+escapeHtml(b.name)+'" onerror="bandAvatarFallback(event,\''+b.bandId+'\')">'
      + (b.bandId===pickedBandIdx ? '<span class="band-selected-label">SELECTED</span><span class="band-selected-arrow"></span>' : '')
      + '</button>';
  }).join('');
}
function pickBand(bandId) {
  const band = setupBands().find(b=>b.bandId===bandId); if (!band) return;
  pickedBandIdx = bandId;
  const bd = setupBandDetail(band);
  const body = document.getElementById('pick-card-body');
  if (body) body.innerHTML = '<img src="'+avatarUrlForBand(band)+'" onerror="bandAvatarFallback(event,\''+band.bandId+'\')">'
    + '<div class="pc-hp">初始生命值 '+(bd.血量!=null?bd.血量:'—')+'</div>'
    + '<div class="pc-name">'+escapeHtml(band.name)+'</div>'
    + '<div class="pc-eff">'+escapeHtml(stripRich(bd.效果||''))+'</div>'
    + '<button id="pick-confirm-btn" class="pc-pick" onclick="chooseBand(\''+band.bandId+'\')">☑ 确认选择</button>';
  const left = document.getElementById('pick-left'); if (left) left.classList.add('open');
  const card = document.getElementById('pick-card'); if (card) card.classList.add('open');
  renderPickPlayers();
  renderBandMatrix();
}
function closePickCard() {
  pickedBandIdx = -1;
  const left = document.getElementById('pick-left'); if (left) left.classList.remove('open');
  const card = document.getElementById('pick-card'); if (card) card.classList.remove('open');
  const body = document.getElementById('pick-card-body'); if (body) body.innerHTML = '';
  renderBandMatrix(); renderPickPlayers();
}
// 点击弹出卡片以外的地方，收起策略详情卡片（仅在选择策略界面生效，局内 setup 已隐藏时不处理）
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
document.addEventListener('click', function (ev) {
  if (pickedBandIdx === -1 || pickedBandIdx == null) return;
  const setup = document.getElementById('setup');
  if (!setup || setup.style.display === 'none' || document.getElementById('setup-pick')?.style.display === 'none') return;
  const t = ev.target;
  if (t && t.closest && (t.closest('.band-cell') || t.closest('#pick-card') || t.closest('.setup-head') || t.closest('.setup-ready'))) return;
  closePickCard();
});
}

// 情报按钮：策略/领袖/敌方情报 合并到一个弹出界面（深绿方形按钮，回合数左边）
function toggleIntel() {
  if (!G) return;
  const panel = document.getElementById('intel-panel');
  const body = document.getElementById('intel-body');
  if (!panel || !body) return;
  if (panel.style.display === 'block') { closeIntel(); return; }
  if(document.body?.appendChild&&panel.parentElement!==document.body)document.body.appendChild(panel);
  const bd = BAND_DATA[G.bandName] || {};
  const names = (curEnemyTypes && curEnemyTypes.length) ? curEnemyTypes.map(t => t.name) : [];
  const playedMap=G.mapKey?playableLevels().find(m=>G.mapKey.endsWith('/level_'+m.id)):playableLevels()[CUR];
  const bosses=(runModeData()?.rounds||[]).flatMap(r=>{
    const choice=r.alternatives[G.roundChoices?.[r.round]??0],boss=sourceBossInfo(choice?.bossId);
    return boss?[{round:r.round,...boss}]:[];
  });
  const banned=(G.bannedOperators||[]).map(id=>ROSTER[id]).filter(Boolean);
  const absent=CORE_BONDS.map(bid=>({bid,ops:banned.filter(o=>o.seasonBond===bid)})).filter(g=>g.ops.length);
  body.innerHTML = '<h4>开局情报</h4>'
    + '<div class="intel-line"><b>地图：</b>'+escapeHtml(playedMap?.name||'—')+'</div>'
    + '<div class="intel-line">顶部「路线」切换当前敌潮的地面／飞行路线；重合路段合并显示。围栏格可部署，但地面敌人无法通过；黄框交叉格为阻隔工事。</div>'
    + '<div class="intel-line intel-band"><img src="'+avatarUrlForBand({bandId:G.band})+'" alt="" onerror="avErr(event)"><span><b>策略：</b>' + escapeHtml(G.bandName || '—') + '</span></div>'
    + '<div class="intel-line"><b>生命：</b>' + G.life + '</div>'
    + '<div class="intel-line"><b>效果：</b>' + escapeHtml(G.bandEffect || bd.效果 || '—') + '</div>'
    + '<div class="intel-line"><b>关卡进度：</b>' + (G.modeId?('第 '+G.round+' / '+runModeData().rounds.length+' 轮'+(G.sourceBossId?' · 领袖战':'')):escapeHtml(curBoss ? curBoss.name : '—')) + '</div>'
    + '<div class="intel-line"><b>本轮敌人：</b>' + (G.modeId?escapeHtml([...new Set(previewCurrentWave().map(x=>BDATA.enemies[x.enemyId]?.name||x.enemyId))].join('、')):(names.length ? escapeHtml(names.join('、')) : '—')) + '</div>'
    + (bosses.length?'<div class="intel-bosses">'+bosses.map(b=>'<div><img src="enemy_avatars/'+b.enemyId+'.png" alt="" onerror="avErr(event)"><span>第 '+b.round+' 轮 · '+escapeHtml(BATTLE.enemies[b.enemyId]?.name||b.enemyId)+(b.isHidingBoss?'（隐藏）':'')+'</span></div>').join('')+'</div>':'')
    + (absent.length?'<div class="intel-line"><b>本局缺席干员</b></div>'+absent.map(g=>'<div class="intel-absent">'+setupBondIcon(g.bid,BOND_DEFS[g.bid]?.name,g.ops.length)+'<span>'+escapeHtml(g.ops.map(o=>o.name).join('、'))+'</span></div>').join(''):'')
    + (G.modeId?'':'<div class="intel-line"><b>敌方势力生命：</b>' + Math.max(0, G.enemyHp) + '</div>');
  if(G.sourceWarnings?.length)body.innerHTML+='<div class="intel-line"><b>当前还原差异：</b>'+escapeHtml(G.sourceWarnings.join('；'))+'</div>';
  body.innerHTML+=communityEnemyNotesHtml(previewCurrentWave().map(spawn=>spawn.enemyId));
  if(G.modeId){const hidden=hiddenBossEligibility();if(hidden.threshold!=null)body.innerHTML+='<div class="intel-line"><b>隐藏领袖条件：</b>已激活盟约层数须大于 '+hidden.threshold+'，剩余生命须大于 1；当前记录 '+hidden.playerCount+' 名玩家、'+hidden.layers+' 层。'+(curMatch==='team'?'同盟应统计全部参与者，当前游戏仅有本机记录。':'')+'门槛依据为对应赛季PRTS社区资料。</div>';}
  panel.style.display = 'block';
}
function closeIntel() {
  const panel = document.getElementById('intel-panel');
  if (panel) { panel.style.display = 'none'; if (panel.dataset) panel.dataset.which = ''; }
}

const BGM_PREFERENCE_KEY='arknightsAudioV1';
function syncBgmControls(){
  const bgm=document.getElementById('bgm');if(!bgm)return;
  const buttons=[document.getElementById('bgm-btn'),...(document.querySelectorAll?document.querySelectorAll('.audio-toggle'):[])];
  for(const button of buttons)if(button){button.classList.toggle('muted',bgm.muted&&window.gameSfxPreference.muted);button.title='声音设置';}
  for(const [type,muted,volume]of [['bgm',bgm.muted,bgm.volume],['sfx',window.gameSfxPreference.muted,window.gameSfxPreference.volume]]){
    const button=document.getElementById('audio-'+type+'-toggle'),input=document.getElementById('settings-'+type+'-volume'),output=document.getElementById('audio-'+type+'-value');
    if(button){button.textContent=muted?'已静音':'已开启';button.setAttribute?.('aria-pressed',String(!muted));}
    if(input)input.value=volume;if(output)output.textContent=Math.round(volume*100)+'%';
  }
}
function openAudioSettings(){syncBgmControls();const dialog=document.getElementById('audio-settings');if(dialog&&!dialog.open)dialog.showModal();}
function closeAudioSettings(){document.getElementById('audio-settings')?.close();}
function toggleGameSfx(){window.gameSfxPreference.muted=!window.gameSfxPreference.muted;syncSfxPreference();saveBgmPreference();}
function setGameSfxVolume(value){window.gameSfxPreference.volume=Math.max(0,Math.min(1,Number(value)||0));syncSfxPreference();saveBgmPreference();}
function saveBgmPreference(){
  const bgm=document.getElementById('bgm');if(!bgm)return;
  try{const value=JSON.stringify({muted:!!bgm.muted,volume:bgm.volume,effectsMuted:window.gameSfxPreference.muted,effectsVolume:window.gameSfxPreference.volume});if(localStorage.getItem(BGM_PREFERENCE_KEY)!==value)localStorage.setItem(BGM_PREFERENCE_KEY,value);}catch(e){}
  syncBgmControls();
}
function loadBgmPreference(){
  const bgm=document.getElementById('bgm');if(!bgm)return;
  let pref={muted:true,volume:0.5};
  try{const saved=JSON.parse(localStorage.getItem(BGM_PREFERENCE_KEY));if(saved&&typeof saved.muted==='boolean'&&Number.isFinite(saved.volume)&&saved.volume>=0&&saved.volume<=1)pref=saved;}catch(e){}
  window.gameSfxPreference={muted:pref.effectsMuted===true,volume:Number.isFinite(pref.effectsVolume)?Math.max(0,Math.min(1,pref.effectsVolume)):0.5};
  syncSfxPreference();bgm.muted=pref.muted;bgm.volume=pref.volume;
  if(bgm.muted&&bgm.pause)bgm.pause();
  bgm.onvolumechange=saveBgmPreference;syncBgmControls();
}
if(typeof window.addEventListener==='function')window.addEventListener('storage',event=>{if(event.key===BGM_PREFERENCE_KEY)loadBgmPreference();});
function toggleBgm() {
  const bgm = document.getElementById('bgm');
  if (!bgm) return;
  bgm.muted = !bgm.muted;
  if(bgm.muted){if(bgm.pause)bgm.pause();}else if(bgm.play)bgm.play().catch(()=>{});
  saveBgmPreference();
}

// 卫戍协议默认二倍速（引擎 GAME_SPEED=2，不提供倍速切换按钮）

// —— 真实网络延迟：对当前页面发 HEAD 请求计时（本地执行≈0ms，不再假装固定 256ms）——
let pingBest = -1;
function measureLatency() {
  try {
    const hasPerf = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function');
    if (typeof fetch !== 'function') return;
    const t0 = hasPerf ? performance.now() : Date.now();
    const href = (typeof location !== 'undefined' && location) ? (location.pathname || '/') : '/';
    fetch(href + '?_ping=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
      .catch(() => null)   // 本地/file:// 请求失败按 0ms 处理
      .finally(() => {
        const dt = Math.max(0, Math.round((hasPerf ? performance.now() : Date.now()) - t0));
        const best = (pingBest < 0) ? dt : Math.min(pingBest, dt);
        pingBest = best;
        const el = document.getElementById('ping');
        if (el) el.textContent = best + 'ms';
      });
  } catch (e) { /* 忽略测量异常，保持显示默认 0ms */ }
}


function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ---- 主界面（首屏：干员/编队/关卡 + 进入卫戍协议）----
function showMenu() {
  for(const id of ['covenant-entry','game-settings']){const pane=document.getElementById(id);if(pane)pane.hidden=true;}
  setUiMode('mode-menu');
  const menu = document.getElementById('menu'); if (menu) menu.style.display = 'flex';
  const st = document.getElementById('setup'); if (st) st.style.display = 'none';
  const mn = document.getElementById('main'); if (mn) mn.style.display = 'none';
  const run = G ? ('进行中：第 '+G.round+' 回合 · '+(G.phase==='battle'?'作战中':'休整期')) : '尚未开始作战';
  const _pl = playableLevels();
  const lvl = (_pl && _pl[CUR]) ? _pl[CUR].name : '—';
  const info = document.getElementById('menu-info');
  if (info) info.innerHTML = '<b>卫戍协议：</b>选择游玩方式、难度和地图；查看本局情报后选择策略。<br><b>进度：</b>'+run
    +'<br>「继续休整存档」恢复上次手动保存的本机进度。「作战终端」暂未开放。';
}
function enterMode() {
  if(window.RoomHome?.enabled&&!window.__roomRemoteSimulation){void window.RoomHome.open('mode');return;}
  const home=externalGameHome();if(home&&!window.__roomRemoteSimulation){location.href=home+'/room-lab.html?mode=solo';return;}
  if(!window.__roomRemoteSimulation){location.href='room-lab.html?mode=solo';return;}
  const menu = document.getElementById('menu'); if (menu) menu.style.display = 'none';
  const mb = document.getElementById('menu-btn'); if (mb) mb.style.display = 'inline-block';   // 选策略界面也可退出
  showSetup();
}
// 退出战斗：先弹确认框，确认后才真正退出
function confirmExit() {
  const ec = document.getElementById('exit-confirm');
  if (ec) ec.style.display = 'flex';
}
function confirmBackToMenu() {
  const ec = document.getElementById('exit-confirm');
  if (ec) ec.style.display = 'none';
  backToMenu();
}
function cancelExit() {
  const ec = document.getElementById('exit-confirm');
  if (ec) ec.style.display = 'none';
}
function backToMenu() {
  const returnToLocalRoom=!!localRunSetup&&document.getElementById('setup')?.style.display==='flex';
  localRunSetup=null;
  hideCenterBanner();
  closeSettlement();
  replaceGameSession(null, 'mode.back-to-menu'); // 结束当前模拟
  const ec = document.getElementById('exit-confirm'); if (ec) ec.style.display = 'none';   // 关闭退出确认框（含自动退出路径）
  selectedBond = null; hideBondDetail();        // 关闭盟约详情浮层
  if (typeof B !== 'undefined' && B) { B.over = true; B.phase = 'over'; }   // 停止后台战斗，避免结束回调在 G=null 后报错
  resetBattleView();closeIntel();
  const st = document.getElementById('setup'); if (st) st.style.display = 'none';
  const mn = document.getElementById('main'); if (mn) mn.style.display = 'none';
  document.getElementById('result').textContent = '';
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('next-btn').style.display = 'none';
  const mb = document.getElementById('menu-btn'); if (mb) mb.style.display = 'none';
  const rb = document.getElementById('roster-btn-top'); if (rb) rb.style.display = 'inline-block';
  showMenu();
  if(returnToLocalRoom){location.href='room-lab.html?mode=solo&return=solo';return;}
  if(typeof location!=='undefined'&&typeof history!=='undefined'){const url=new URL(location.href);if(url.searchParams.has('solo')){url.searchParams.delete('solo');history.replaceState(null,'',url.href);}}
}
// 普通塔防模式：无自走棋经济/回合/商店，直接部署全部干员并开战（手牌底部无上限）
function enterNormalMode() {
  if(window.ArkSim)window.ArkSim.seed(Date.now());
  GMODE = 'normal';
  resetBattleView();
  const map=playableLevels()[CUR]||playableLevels()[0];
  setLevel({enemies:BATTLE.enemies,level:map.level});
  replaceGameSession({
    phase:'rest', round:1, money:0, life:LIFE0, enemyHp:ENEMY_HP0,
    level:1, upgradeCost:UPGRADE_COST_INIT, shop:[], ops:[], equipInv:[], activeBonds:{},
    band:'', bandName:'普通模式', bandEffect:'', over:false, shield:0, shieldMax:0, nextId:1, battleDone:false, frozen:false,
  }, 'mode.normal-started');
  G.ops = (ROSTER_LIST || []).map(e => ({ id:G.nextId++, charId:e.charId, entry:e, elite:false, equip:[], row:null, col:null, dir:'up' }));
  const m = document.getElementById('menu'); if (m) m.style.display = 'none';
  document.getElementById('setup').style.display = 'none';
  document.getElementById('main').style.display = 'flex';
  setUiMode('mode-battle');
  document.getElementById('result').textContent = '';
  const rb = document.getElementById('roster-btn-top'); if (rb) rb.style.display = 'none';
  const mb = document.getElementById('menu-btn'); if (mb) mb.style.display = 'inline-block';
  selectedHand = null; selBoardOp = null; selectedEquip = null;
  refreshBoard(); renderAll();
  flash('普通模式：点底部干员选中看立绘/范围；拖到绿格部署；点「准备就绪」开战');
}
function showStages() {
  enterMode();
}
function showFormation() {
  window.ArkDiySelection.open(setupSeason(),{chooseSeason:true});
}

// 难度模式（5 档）+ 敌人每轮攻/血加成（来源：PRTS 卫戍协议·盟约 下半「敌方属性加成情况」独立模拟列）。
// atk 与 hp 同表同值；防御无官方数据，保留自创线性成长。入门协议官方未给数值 → [Inferred] 弱化近似。
const MATCH = {
  solo: { label:'独立模拟', note:'敌人生命/攻击×0.7', base:{standard:0.7, difficult:0.7, extreme:0.8, ultimate:1} },
  team: { label:'同盟模拟', note:'敌人生命/攻击×0.8（4人联防，单人复刻）', base:{standard:0.8, difficult:0.8, extreme:1, ultimate:1} },
};
let curMatch = 'solo';
let TEAM_AI = [];   // 同盟模拟的电脑队友（简版：显示 + 每回合支援资金，不做复杂 AI）
function buildTeamAI() {
  TEAM_AI = [];
  if (curMatch !== 'team') return;
  const bands = (MDATA && MDATA.bands) ? MDATA.bands.slice() : [];
  const pick3 = [];
  for (let i = 0; i < 3; i++) { const b = bands[Math.floor(gameRandom()*bands.length)]; if (b) pick3.push(b); }
  TEAM_AI = pick3.map((b, i) => ({ name: '队友'+(i+1), bandId: b.bandId, bandName: b.name }));
}
function setMatch(v) {
  if(v==='team'&&document.body?.classList?.contains('local-covenant')){flash('多人同盟请从通用包主页创建或加入房间。');v='solo';}
  curMatch = (v && MATCH[v]) ? v : 'solo';
  const s = document.getElementById('match-select'); if (s) s.value = curMatch;
  const n = document.getElementById('match-note');
  if (n) { const m = MATCH[curMatch]; n.textContent = m.note; }
  buildTeamAI();
  refreshSourceSetupInfo();
  return curMatch;
}
const DIFFICULTY = {
  training:  { label:'入门协议', note:'教程 · 仅预置干员',        mul: r => 0.5 },
  standard:  { label:'标准模拟', note:'敌方×0.7(独立)/0.8(同盟)', mul: r => MATCH[curMatch].base.standard },
  difficult: { label:'险境模拟', note:'随轮次递增',               mul: r => MATCH[curMatch].base.difficult * Math.pow(1.2, expDifficult(r)) },
  extreme:   { label:'绝境模拟', note:'随轮次递增',               mul: r => MATCH[curMatch].base.extreme * Math.pow(1.2, expExtreme(r)) },
  ultimate:  { label:'终极模拟', note:'不降低 · 随轮次递增',       mul: r => MATCH[curMatch].base.ultimate * Math.pow(1.2, expUltimate(r)) },
};
function expDifficult(r) { return r <= 3 ? 0 : r <= 7 ? 1 : r <= 10 ? 2 : r === 11 ? 3 : r === 12 ? 4 : 5; }
function expExtreme(r)  { return r <= 4 ? 0 : r <= 8 ? 1 : r <= 10 ? 2 : r <= 12 ? 3 : 4; }
function expUltimate(r) { return r === 1 ? 1 : r <= 5 ? 2 : r <= 9 ? 3 : r === 10 ? 4 : r <= 12 ? 5 : r === 13 ? 6 : 7; }
let curDiff = 'extreme';
function setDifficulty(v) {
  curDiff = (v && DIFFICULTY[v]) ? v : 'standard';
  const s = document.getElementById('diff-select'); if (s) s.value = curDiff;
  const n = document.getElementById('diff-note');
  if (n) { const d = DIFFICULTY[curDiff]; n.textContent = d.note; }
  refreshSourceSetupInfo();
  return curDiff;
}
function externalGameHome(){try{const home=new URL(location.href).searchParams.get('home');return /^http:\/\/127\.0\.0\.1:\d+$/.test(home||'')?home:null;}catch{return null;}}
async function startCovenantEntry(mode){
  if(window.RoomHome?.enabled){await window.RoomHome.open(mode==='team'?'team':'mode');return;}
  const home=externalGameHome();if(home){location.href=home+'/room-lab.html?mode=solo'+(mode==='team'?'&view=team':'');return;}
  location.href='room-lab.html?mode=solo'+(mode==='team'?'&view=team':'');
}

function showGameSettings(){showMenu();document.getElementById('game-settings').hidden=false;const input=document.getElementById('settings-bgm-volume'),bgm=document.getElementById('bgm');if(input&&bgm)input.value=bgm.volume;}
function setGameBgmVolume(value){const bgm=document.getElementById('bgm');if(bgm){bgm.volume=Math.max(0,Math.min(1,Number(value)||0));saveBgmPreference();}}
function applyHomeRoute(){
  if(window.__roomRemoteSimulation||typeof location==='undefined'||typeof location.href!=='string'||typeof URL!=='function')return;
  try{
    window.ArkSolo?.receive();
    if(new URL(location.href).searchParams.has('solo')){
      const run=window.ArkSolo?.read(),config=run?.config,mode=SOURCE_BATTLES.seasons[config?.seasonId]?.modes[config?.modeId];
      if(!mode||!/^mode_(single_|training_1$)/.test(config.modeId)||!mode.stageChoices.some(s=>s.levelKey===config.mapKey)||!Number.isInteger(run.seed))throw Error('单人配置已失效，请返回房间重新选择。');
      setupSeasonId=config.seasonId;setupStageKey=config.mapKey;curMatch='solo';TEAM_AI=[];
      curDiff=config.modeId==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(k=>DIFF_GAMEDATA[k].toLowerCase()===config.modeId.split('_').at(-1));
      setPlayerName(run.profile?.name||'博士');showSetup();
      const choices=window.ArkRunSetup.roundChoices(SOURCE_BATTLES,config,run.seed);
      const info=window.ArkRunSetup.setupInfo({source:SOURCE_BATTLES,bonds:OP_BONDS,tiers:TIER_DATA,rules:MODE_RULES,operators:BATTLE.operators,encounters:ENEMY_ENCOUNTERS},config,choices,run.seed);
      localRunSetup={...run,config:{...config,diySelections:run.diySelections||{}},choices,info};renderRoomStrategyIntel(localRunSetup.config,info);document.body.classList.add('local-covenant');return;
    }
  }catch(error){flash(error.message);return;}
  const screen=new URL(location.href).searchParams.get('screen');
  if(screen==='roster')openRoster();else if(screen==='formation')showFormation();else if(screen==='practice')enterNormalMode();else if(screen==='settings')showGameSettings();
}
function renderRoomStrategyIntel(config,info={}){
  if(!config)return;
  buildRoster(BATTLE.operators,config.seasonId);
  const season=SOURCE_BATTLES.seasons[config.seasonId],mode=season?.modes[config.modeId],meta=season?.modeConfigs[config.modeId];if(!mode||!meta)return;
  const map=mode.stageChoices.find(x=>x.levelKey===config.mapKey),mapName=playableLevels().find(x=>x.id===map?.stageId)?.name||map?.stageId||'当前地图';
  const knownBosses=info.bosses||info.bossSchedule||[],candidateIds=[...new Set(mode.rounds.flatMap(r=>r.alternatives.map(a=>a.bossId).filter(Boolean)))];
  const bossNames=knownBosses.length?knownBosses.map(b=>'第 '+b.round+' 轮 · '+(b.name||BATTLE.enemies[b.enemyId]?.name||b.bossId)+(b.hidden?'（满足解锁条件后）':'')):candidateIds.map(id=>BATTLE.enemies[season.bosses[id]?.enemyId]?.name||id);
  const first=info.firstLevelKey||info.firstRound?.levelKey||(mode.rounds[0]?.alternatives.length===1?mode.rounds[0].alternatives[0].levelKey:null),original=SOURCE_BATTLES.levels[first];
  const source=original&&info.enemyPlan?window.ArkEnemyReplacement.applyToSource(original,info.enemyPlan.rounds[1],ENEMY_ENCOUNTERS):original;
  const enemies=source?[...new Set(source.waves.flatMap(w=>w.fragments.flatMap(f=>f.actions.filter(a=>a.actionType==='SPAWN').map(a=>source.enemies[a.key]?.name||BATTLE.enemies[a.key]?.name||a.key))))]:[];
  const inactive=new Set(meta.inactiveBondIdList||[]),active=new Set(meta.activeBondIdList||[]);
  const bannedIds=new Set((info.bannedOperators||[]).map(op=>typeof op==='string'?op:op.charId));
  BOND_BANS=CORE_BONDS.map(bid=>({bid,name:BOND_DEFS[bid]?.name||bid,ops:(ROSTER_LIST||[]).filter(op=>op.seasonBond===bid&&bannedIds.has(op.charId))})).filter(group=>group.ops.length);
  document.getElementById('boss-name').textContent=knownBosses.length?'本局首领日程':'首领候选';
  document.getElementById('boss-desc').textContent=(config.seasonId==='act2autochess'?'盟约Ⅱ':'盟约')+' · '+meta.name+' · '+mapName+'\n'+(bossNames.join('\n')||'本模式没有首领战');
  const bossImage=document.getElementById('boss-img'),shownBoss=knownBosses.find(b=>!b.hidden)||knownBosses[0],enemyId=shownBoss?.enemyId||season.bosses[candidateIds[0]]?.enemyId;
  bossImage.style.display=enemyId?'block':'none';if(enemyId){bossImage.src='enemy_avatars/'+enemyId+'.png';bossImage.alt=shownBoss?.name||'本局首领';bossImage.onerror=avErr;}
  document.getElementById('enemy-types').innerHTML=enemies.map(name=>'<span class="tag">'+escapeHtml(name)+'</span>').join('');
  document.getElementById('bond-meta').innerHTML=CORE_BONDS.map(id=>{const name=BOND_DEFS[id]?.name||id,off=inactive.has(id)||(active.size&&!active.has(id)),ban=BOND_BANS.find(group=>group.bid===id),count=ban?.ops.length||0,label=count?'缺席 '+count+'：'+ban.ops.map(op=>op.name).join('、'):off?'本模式未启用':'本局可用';return '<div class="bond-cell'+(off||count?' lack':' have')+'" title="'+escapeHtml(label)+'">'+setupBondIcon(id,name,count)+'<div class="bn">'+escapeHtml(name)+'</div><div class="bb">'+escapeHtml(label)+'</div></div>';}).join('');
  document.getElementById('bond-meta-note').textContent=BOND_BANS.length?'部分盟约有缺席干员':'';
  document.getElementById('banned-ops-note').textContent=info.banStatus==='not-configured'?'本局未配置禁用规则':'';
  document.getElementById('banned-ops').innerHTML=BOND_BANS.length?BOND_BANS.map(group=>'<div class="banned-row">'+setupBondIcon(group.bid,group.name,group.ops.length)+'<div class="bond-nm">'+escapeHtml(group.name)+'</div><div class="opps">'+group.ops.map(op=>'<div class="op"><img src="avatars/'+op.charId+'.png" onerror="avErr(event)"><span class="tier">'+escapeHtml(tierToRoman(op.tier))+'</span></div>').join('')+'</div></div>').join(''):'<div class="banned-none">本局没有已配置的禁用干员。</div>';
  renderSetupRoster();
}
function refreshSourceSetupInfo(){
  if(!SOURCE_BATTLES)return;
  buildRoster();
  if(localRunSetup){renderRoomStrategyIntel(localRunSetup.config,localRunSetup.info);return;}
  refreshSetupMaps();
  const context=selectedRunContext(true),mode=context?SOURCE_BATTLES.seasons[context.seasonId].modes[context.modeId]:null;
  const desc=context?SOURCE_BATTLES.seasons[context.seasonId].modeConfigs[context.modeId].desc:'当前赛季没有所选模式，请调整难度或地图';
  const diffNote=document.getElementById('diff-note');if(diffNote)diffNote.textContent=desc;
  const matchNote=document.getElementById('match-note');if(matchNote)matchNote.textContent=curMatch==='team'?'同盟配置':'独立模拟 · 按每轮关卡编排';
  document.getElementById('boss-name').textContent=mode?('模式配置 '+mode.rounds.length+' 轮'):'模式不可用';
  document.getElementById('boss-desc').textContent=mode?'每轮从该模式的关卡候选中选择；进入休整后可预览实际敌人。隐藏关是否进入仍按当前通关条件判断。':desc;
  document.getElementById('boss-img').style.display='none';
  document.getElementById('enemy-types').textContent='';
  const ready=document.getElementById('setup-ready-btn');ready.disabled=!mode;
}
// 当前难度/联机方式 → gamedata modeDataDict 的 modeId（读可用/禁用盟约、禁用敌人）
const DIFF_GAMEDATA = { standard:'FUNNY', difficult:'NORMAL', extreme:'HARD', ultimate:'ABYSS' };
function currentMode() {
  const t = (curMatch === 'team') ? 'MULTI' : 'SINGLE';
  const d = DIFF_GAMEDATA[curDiff];
  if (!d || !MDATA || !Array.isArray(MDATA.modes)) return null;
  return MDATA.modes.find(m => m.modeType === t && m.modeDifficulty === d) || null;
}
function chooseBand(bandId) {
  const context=selectedRunContext();if(!context)return;
  const diySelections=context.modeId==='mode_training_1'?{}:currentDiySetup(context.seasonId);
  buildRoster(BATTLE.operators,context.seasonId,diySelections);
  if(localRunSetup){context.roundChoices={...localRunSetup.choices};window.ArkSim?.seed(localRunSetup.seed);}
  context.enemySeed=localRunSetup?.seed??window.__roomEnemySeed??window.ArkSim?.snapshot().state??Math.floor(gameRandom()*4294967296);
  context.enemyPlan=window.ArkRunSetup.enemyPlan(ENEMY_ENCOUNTERS,context,context.enemySeed);
  resetBattleView();
  const mapIndex=playableLevels().findIndex(x=>SOURCE_BATTLES.seasons[context.seasonId].modes[context.modeId].stageChoices.some(s=>s.levelKey===context.mapKey&&s.stageId===x.id));
  if(mapIndex>=0)CUR=mapIndex;
  // 重开一局时清掉上一局尚未选择的决策，避免第一回合残留六选一弹窗。
  const decision = document.getElementById('decision-modal');
  if (decision) decision.style.display = 'none';
  selectedBond = null; hideBondDetail(); closeIntel();   // 新一局：关闭上一局残留的盟约详情与情报浮层
  GMODE = 'auto';
  const band = SOURCE_BATTLES.seasons[context.seasonId].bands.find(b=>b.bandId===bandId);
  if(!band){flash('当前赛季没有此策略');return;}
  closeSettlement();
  const bd = setupBandDetail(band);
  // LocalPlayer._LoadRunTimeData copies miscConfig.initialHp into player.hp
  // once when creating the training run; later round/rest restoration must not refill it.
  const training=TRAINING_CONFIG?.seasons[context.seasonId];
  const life = training?.modeId===context.modeId ? training.initialHp : (bd.血量 != null) ? bd.血量 : LIFE0;
  const mode = SOURCE_BATTLES.seasons[context.seasonId].modeConfigs[context.modeId];
  replaceGameSession({
    ...context,
    diySelections,
    skillChoices:accountSkillChoices(),
    bannedOperators:BOND_BANS.flatMap(group=>group.ops.map(op=>op.charId)),
    phase:'setup', round:0, money:0, life: life, enemyHp: ENEMY_HP0,
    runElapsed:0,roundResults:[],
    level:1, upgradeCost:UPGRADE_COST_INIT, shop:[], ops:[], equipInv:[], activeBonds:{},
    band: bandId, bandName: band ? band.name : '', bandEffect: bd.效果 || '',
    over:false, shield:0, shieldMax:0, nextId:1, battleDone:false,
    frozen:false,   // 商店冻结：回合更替不刷新卡池
    activeBondIdList: mode ? mode.activeBondIdList : null,   // 本难度可用盟约（null=不限）
    inactiveEnemyKey: mode ? (mode.inactiveEnemyKey || []) : [],   // 本难度禁用敌人
  }, 'mode.session-started');
  G.upgradeCost=shopLevelInfo(1).upgrade ?? UPGRADE_COST_INIT;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('main').style.display = 'flex';
  setUiMode('mode-battle');
  document.getElementById('result').textContent='';
  const rb = document.getElementById('roster-btn-top'); if (rb) rb.style.display = 'none';   // 开始卫戍协议后禁用干员库
  const mb = document.getElementById('menu-btn'); if (mb) mb.style.display = 'inline-block'; // 局内可随时退出
  const st = document.getElementById('side-tip');
  if (st) st.innerHTML = '<b style="color:#8bc34a">休整期</b>：点左侧备战席干员→拖到绿格→拖方向确认朝向→穿装备→点「准备就绪」。<br>'
    +'<b style="color:#ffd54f">3 名同名干员</b>自动合成精锐；商店刷新干员/装备；调度中心等级 ≥ 干员<b style="color:#ff9800">阶</b>才刷出。<br>'
    +'<b style="color:#42a5f5">点棋盘干员</b>看攻击范围/详情；<b style="color:#ff9800">右键</b>撤离；技能自动充能释放。<br>'
    +'<b style="color:#c62828">红格</b>=刷怪　<b style="color:#1565c0">蓝格</b>=漏怪　<b style="color:#8bc34a">绿格</b>=可部署　<b style="color:#6a1b9a">紫格</b>=传送';
  flash('策略：'+(G.bandName||'')+'（'+G.life+' 生命）');
  startRound(1);
}

// [Inferred] Opening 4 and the 4/5/6 curve: gameplay reports + Lee's 0/0/15 source replacement.
// Later +1/round, capped at 10, is a temporary local rule, NOT verified server data.
// FUNNY/ABYSS allowances still need a mode-specific trace; see findings R13.
function roundMoney(r){
  const training=trainingConfig()?.trainingRoundInfos?.[r];
  if(training&&Number.isInteger(training.coin))return training.coin; // LocalPlayer sets currentCoin; startRound also replaces G.money.
  const override=runBandEffects().find(b=>b.bandId===G?.band)?.mechs.find(m=>m.key==='give_coin_in_round'&&bbNum(m.bb,'round')===r);
  return override?bbNum(override.bb,'coin'):Math.min(10,r+3);
}
function roundShield(r){ return 10 + r; }

// 中央大字横幅（回合结束/回合开始）：浮于棋盘上方，约 3s 淡出；用代次 token 防止上一横幅定时器清掉新横幅
let bannerGen = 0, bannerTimer = null;
function hideCenterBanner(){bannerGen++;clearTimeout(bannerTimer);document.getElementById('center-banner')?.classList.remove('show');}
function showCenterBanner(title, sub, dur, kind='end') {
  const el = document.getElementById('center-banner');
  if (!el || !el.classList) return;
  const g = ++bannerGen;
  const t = document.getElementById('cb-title');
  const s = document.getElementById('cb-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub || '';
  const mark=document.getElementById('cb-mark');if(mark)mark.textContent={prepare:'◈',battle:'⚔',joint:'⇄',boss:'⚠',end:'✓'}[kind]||'◈';
  el.setAttribute?.('data-phase',kind);
  el.classList.remove('show');void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { if (g === bannerGen) el.classList.remove('show'); }, (dur || 3) * 1000);
}

