// ---- 干员库（练度界面）----
function openRoster() { document.getElementById('roster-modal').style.display = 'flex'; renderRoster();
  const scroll=document.querySelector?.('#roster-modal .roster-scroll');if(scroll&&!scroll._wheelBound){scroll._wheelBound=true;scroll.addEventListener('wheel',event=>{if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;const before=scroll.scrollLeft;scroll.scrollLeft+=event.deltaY*(event.deltaMode===1?24:event.deltaMode===2?scroll.clientWidth:1);if(scroll.scrollLeft!==before)event.preventDefault();},{passive:false});}
}
function closeRoster() { document.getElementById('roster-modal').style.display = 'none'; if (G) renderAll(); }
function rosterSkillDescription(charId,skill,level){
  return window.ArkSkillLevels?.get(skill.skillId,level)?.desc||window.ArkAttackProfiles?.[charId]?.tactician?.skillLevels?.[skill.skillId]?.[level-1]?.desc||window.ArkCommonSkillData?.skillLevels?.[skill.skillId]?.[level-1]?.desc||window.ArkElementData?.skillLevels?.[skill.skillId]?.[level-1]?.desc||skill.elite?.desc||skill.desc;
}

// The extracted character library is broader than the implemented mode roster.
// Keep display/training entries separate: browsing must never change a shop pool.
let rosterCatalogCache=null;
function rosterLibraryEntries() {
  if(!rosterCatalogCache||rosterCatalogCache.operators!==BATTLE.operators||rosterCatalogCache.roster!==ROSTER){
    const entries=BATTLE.operators.map(e=>ROSTER[e.charId]||{...e,tier:0,appellation:APP_DATA[e.charId]||''});
    rosterCatalogCache={operators:BATTLE.operators,roster:ROSTER,entries,byId:Object.fromEntries(entries.map(e=>[e.charId,e]))};
  }
  return rosterCatalogCache.entries;
}
function filterRoster() {
  renderRoster();
  const scroll=document.querySelector?.('#roster-modal .roster-scroll');if(scroll)scroll.scrollLeft=0;
}
function renderRoster() {
  const debug=typeof gameDebugActive==='function'&&gameDebugActive();
  const toolbar=document.getElementById('roster-debug-tools');if(toolbar)toolbar.hidden=!debug;
  const query=(document.getElementById('roster-debug-search')?.value||'').trim().toLowerCase();
  const catalog=rosterLibraryEntries(),scope=document.getElementById('roster-scope')?.value||'all';
  const list=(scope==='mode'?ROSTER_LIST:catalog).filter(e=>!query||(e.name+' '+e.charId+' '+e.appellation).toLowerCase().includes(query));
  const count=document.getElementById('roster-count');if(count)count.textContent=list.length+' / '+(scope==='mode'?ROSTER_LIST.length:catalog.length);
  const groups=document.getElementById('roster-groups');
  groups.innerHTML=[1,2,3,4,5,6,0].map(tier=>{
    const members=list.filter(e=>e.tier===tier).sort((a,b)=>b.rarity-a.rarity||a.name.localeCompare(b.name,'zh-CN'));
    return members.length?'<section class="roster-tier"><h3>'+(tier?TIER_CN[tier]:'其他资料')+' <span>'+members.length+' 位'+(tier?'':' · 未纳入卫戍名册')+'</span></h3><div class="roster-tier-cards">'+members.map(opCardHtml).join('')+'</div></section>':'';
  }).join('')||'<p class="roster-empty">没有找到对应干员，请尝试代号或英文名。</p>';
}

function opCardHtml(e) {
  const acc = getOpAccount(e.charId);
  const evName = ['精0','精一','精二'][acc.evolve] || '';
  const chosen=SKILL_CHOICES[e.charId]?.find(s=>s.index===acc.selectedSkill);
  return '<div class="op-card" onclick="openDetail(\''+e.charId+'\')">'
    +'<img loading="lazy" decoding="async" alt="" src="portraits/'+e.charId+'.png" onerror="this.onerror=null;this.src=\'avatars/'+e.charId+'.png\'">'
    +'<span class="roster-tier-badge">'+(TIER_CN[e.tier]||'资料')+'</span><div class="info"><strong title="'+escapeHtml(e.name)+'">'+escapeHtml(e.name)+'</strong><span class="roster-stars" aria-label="'+e.rarity+'星">'+'★'.repeat(e.rarity)+'</span><span>'+evName+' LV '+acc.level+'</span><span class="roster-chosen-skill" title="'+(chosen?escapeHtml(chosen.name):'无主动技能')+'">'+(chosen?'技能 '+(chosen.index+1)+' · '+escapeHtml(chosen.name):'无主动技能')+'</span>'
    +(typeof gameDebugActive==='function'&&gameDebugActive()?'<button class="debug-add-op" '+(G.phase==='rest'&&(ROSTER[e.charId]||debugTacticalEntry(e.charId))?'':'disabled')+' onclick="event.stopPropagation();debugAddOperator(\''+e.charId+'\')">'+(ROSTER[e.charId]?'+ 加入候选区':debugTacticalEntry(e.charId)?'+ 加入测试':'未纳入卫戍名册')+'</button>':'')+'</div></div>';
}

let detailCharId = null;
function openDetail(charId) {
  detailCharId = charId;
  document.getElementById('roster-detail').style.display = 'flex';
  renderDetail();
}
function closeDetail() {
  document.getElementById('roster-detail').style.display = 'none';
  detailCharId = null;
  renderRoster();
  if (G) renderAll();
}

function renderDetail() {
  rosterLibraryEntries();
  const e = rosterCatalogCache.byId[detailCharId];
  if (!e) return;
  const acc = getOpAccount(detailCharId);
  const stats = statAt(detailCharId, acc.level, acc.evolve);
  const phase = (LEVEL_DATA[detailCharId] || [])[acc.evolve];
  const maxLevel = phase ? phase.maxLevel : 1;
  const img = document.getElementById('detail-img');
  img.src = 'portraits/'+detailCharId+'.png';
  img.onerror = function(){ this.onerror=null; this.src='avatars/'+detailCharId+'.png'; };
  const star = '★'.repeat(e.rarity) + '☆'.repeat(Math.max(0, 6 - e.rarity));
  const subCn = SUBPROF_CN[e.subProfession] || e.subProfession;
  document.getElementById('detail-basic').innerHTML =
    '<div style="font-size:20px;font-weight:bold;color:'+(RARITY_COLOR[e.rarity]||'#fff')+'">'+e.name
    +' <span style="font-size:13px;color:#9aa0b0;font-weight:normal">'+e.appellation+'</span></div>'
    +'<div style="color:#ffd54f;letter-spacing:2px">'+star+'</div>'
    +'<div class="tip" style="margin:4px 0">'+PROF_CN[e.profession]+' ｜ '+subCn+' ｜ '+(e.position==='RANGED'?'远程':'近战')+' ｜ '+(e.tier?TIER_CN[e.tier]+'阶':'资料库 · 未纳入卫戍名册')+'</div>';
  const evolveBtns = (LEVEL_DATA[detailCharId]||[{}]).map((_,ev) =>
    '<button class="mini'+(acc.evolve===ev?' on':'')+'" onclick="setDetailEvolve('+ev+')">精'+ev+'</button>').join('');
  document.getElementById('detail-fields').innerHTML =
    '<div class="detail-row"><span class="lab">精英化</span>'+evolveBtns+'</div>'
    +'<div class="detail-row"><span class="lab">等级</span><input type="range" min="1" max="'+maxLevel+'" value="'+acc.level+'" oninput="setDetailField(\'level\',this.value,this)"> <span>'+acc.level+'/'+maxLevel+'</span></div>'
    +'<div class="detail-row"><span class="lab">技能等级</span><input type="range" min="1" max="'+maxSkillLevel(acc.evolve)+'" value="'+acc.skillLevel+'" oninput="setDetailField(\'skillLevel\',this.value,this)"> <span>'+skillLevelLabel(acc.skillLevel)+'</span></div>'
    +'<div class="detail-row"><span class="lab">信赖</span><input type="range" min="0" max="100" value="'+acc.trust+'" oninput="setDetailField(\'trust\',this.value,this)"> <span>'+acc.trust+'</span></div>'
    +'<div class="detail-row"><span class="lab">潜能</span><input type="range" min="1" max="6" value="'+acc.potential+'" oninput="setDetailField(\'potential\',this.value,this)"> <span>'+acc.potential+'</span></div>'
    +'<div class="tip" style="margin-top:8px">攻击 '+stats.atk+' ｜ 生命 '+stats.maxHp+' ｜ 防御 '+stats.def+'</div>';
  document.getElementById('detail-skills').innerHTML='<h3>携带技能 <small>仅可选择一个，本局开始后锁定</small></h3><div class="roster-skill-choices">'+(SKILL_CHOICES[e.charId]||[]).map(sk=>'<button type="button" class="roster-skill'+(acc.selectedSkill===sk.index?' selected':'')+'" aria-pressed="'+(acc.selectedSkill===sk.index)+'" onclick="selectRosterSkill('+sk.index+')"><img src="ui/skillicons/skill_icon_'+(sk.iconId||sk.elite?.prefabId||sk.normal?.prefabId)+'.png" alt="" onerror="this.hidden=true"><b>技能 '+(sk.index+1)+' · '+escapeHtml(sk.name)+'</b><span>'+richText(rosterSkillDescription(e.charId,sk,acc.skillLevel))+'</span><em>'+(acc.selectedSkill===sk.index?'已携带':'选择此技能')+'</em></button>').join('')+'</div>';

  document.getElementById('detail-skills').innerHTML+=(SKILL_CHOICES[e.charId]||[]).map(sk=>communitySkillNotesHtml(sk.skillId,sk.name)).join('');
}

function selectRosterSkill(index) {
  if(!detailCharId || !SKILL_CHOICES[detailCharId]?.some(s=>s.index===index))return;
  setOpField(detailCharId,'selectedSkill',index);saveAccount();renderDetail();renderRoster();
}
function setOpField(charId, field, val) {
  if (!ACCOUNT.ops[charId]) ACCOUNT.ops[charId] = { ...getOpAccount(charId) };
  ACCOUNT.ops[charId][field] = val;
  ACCOUNT.ops[charId]=normalizeOpAccount(charId,ACCOUNT.ops[charId]);
}
function setDetailEvolve(ev) {
  setOpField(detailCharId, 'evolve', ev);
  const acc = ACCOUNT.ops[detailCharId];
  if (acc.skillLevel > maxSkillLevel(acc.evolve)) acc.skillLevel = maxSkillLevel(acc.evolve);
  const phase = (LEVEL_DATA[detailCharId] || [])[acc.evolve];
  const maxLevel = phase ? phase.maxLevel : 1;
  if (acc.level > maxLevel) acc.level = maxLevel;                                // 等级 clamp
  saveAccount(); renderDetail(); if (G) { refreshBoard(); renderAll(); }
}
function setDetailField(field, val, rng) {
  if (!detailCharId) return;
  const v = parseInt(val);if(!Number.isFinite(v))return;
  setOpField(detailCharId, field, v);
  const span = rng?.parentElement.querySelector('span:last-child'),stored=getOpAccount(detailCharId)[field];
  if (span) span.textContent = field==='skillLevel'?skillLevelLabel(stored):field==='level'?stored+'/'+(LEVEL_DATA[detailCharId]?.[getOpAccount(detailCharId).evolve]?.maxLevel||1):stored;
  if(rng)rng.value=stored;
  saveAccount();
  if (G) { refreshBoard(); renderAll(); }
  if(field==='skillLevel')renderDetail();
}

// 盟约条：横向拖动换页（不用鼠标滚轮/纵向滚动；边缘渐隐由 CSS mask 实现）。拖动后抑制随后的 click，避免误开盟约详情。
function setupBondsDrag() {
  const el = document.getElementById('bonds');
  const track = document.getElementById('bonds-track');
  if (!el || !track || typeof el.addEventListener !== 'function' || el.resetBounds) return;
  let pointer = null, sx = 0, origin = 0, offset = 0, moved = false;
  const max = () => Math.max(0, track.scrollWidth - el.clientWidth);
  const clamp = v => Math.max(0, Math.min(max(), v));
  function paint(animate) {
    track.style.transition = animate ? 'transform 320ms cubic-bezier(.2,.8,.2,1)' : 'none';
    track.style.transform = 'translateX('+(-offset)+'px)';
  }
  function finish() {
    pointer = null; offset = clamp(offset); el.classList.remove('dragging'); paint(true);
  }
  el.resetBounds = () => { offset = clamp(offset); paint(false); };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId; sx = e.clientX; origin = offset; moved = false;
    track.style.transition = 'none';
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) <= 4 && !moved) return;
    moved = true; el.classList.add('dragging');
    const target = origin - dx, bounded = clamp(target), extra = target - bounded;
    offset = bounded + Math.sign(extra) * 56 * (1 - Math.exp(-Math.abs(extra) / 140));
    paint(false);
  });
  window.addEventListener('pointerup', e => { if (e.pointerId === pointer) finish(); });
  window.addEventListener('pointercancel', e => { if (e.pointerId === pointer) finish(); });
  window.addEventListener('blur', finish);
  window.addEventListener('resize', el.resetBounds);
  el.addEventListener('click', function(e){ if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}



// 左右半区切换：0=左半 1=右半（镜头按半区镜像平移，配合 computeFit 的 window.gameHalf）
window.viewMode = 0;
function setView(m){
  window.viewMode = (m === 1 || m === 2) ? m : 0;
  window.__preview = false; window.__viewRect = null;   // 切半区/总览时退出预览与绝对定位，回到战场窗口
  if (typeof renderAll === 'function') renderAll();
  syncHalfLabel();
}
function syncHalfLabel(){
  const lb = document.getElementById('half-label');
  if (lb) lb.textContent = window.__preview ? '预览' : (window.viewMode === 2 ? '总览' : (window.viewMode ? '右半' : '左半'));
}
// 左右箭头步进：左半区 → 总览 → 右半区（循环）。仅左右箭头控制，中间 label 只作显示、不可点击。
const VIEW_SEQ = [0, 2, 1];
function stepView(dir){
  if(G?.phase==='battle'&&!G.sourceBossId)return;
  // 禁止左右半区之间对角跳转：左半区不能再左、右半区不能再右（I-20260902-029）
  if ((dir < 0 && window.viewMode === 0) || (dir > 0 && window.viewMode === 1)) return;
  const i = VIEW_SEQ.indexOf(window.viewMode);
  const ni = ((i < 0 ? 0 : i) + dir + VIEW_SEQ.length) % VIEW_SEQ.length;
  window.viewMode = VIEW_SEQ[ni];
  window.__preview = false; window.__viewRect = null;   // 切换区域时退出预览/绝对定位
  if (typeof renderAll === 'function') renderAll();
  syncHalfLabel();
}
// 怪物预览：点击放大镜 → 镜头绝对定位到怪物预览块（上段）；再点或切半区退出。
function togglePreview(){
  if(G?.phase==='battle')return;
  window.__preview = !window.__preview;
  window.__viewRect = null;
  window.viewMode = 0;                                    // 预览块独立视图，fitGoal 的 __preview 分支优先
  if (window.__preview) {
    // 缓存此轮敌人预览波次并预热头像（避免每帧随机闪现 / 首帧无头像）
    try { window.__previewWave = previewCurrentWave(); }
    catch(e) { window.__previewWave = []; }
    if (window.__previewWave && window.__previewWave.forEach) window.__previewWave.forEach(s => { if (s && s.enemyId && typeof getEnemyAvatar === 'function') getEnemyAvatar(s.enemyId); });
  } else { window.__previewWave = null; }
  if (typeof renderAll === 'function') renderAll();
  syncHalfLabel();
}
// 镜头绝对定位：直接给定窗口矩形（格级 {colLeft,colRight,rowTop,rowBot}），镜头只平移/缩放到该区域。
// rect 为空则清除，回到普通单人作战窗口。适合把镜头精准对准 A/B/C 任意指定的区域。
window.focusRegion = function(rect){
  window.__viewRect = (rect && rect.colLeft != null) ? rect : null;
  window.__preview = false;
  if (typeof renderAll === 'function') renderAll();
  syncHalfLabel();
};
window.clearFocus = function(){ window.focusRegion(null); };
// 界面文字禁止选中、禁用右键菜单（I-20260902-030）
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
  document.addEventListener('contextmenu', e => { if (e && e.preventDefault) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (e && e.preventDefault) e.preventDefault(); });
}
// 全局点击：情报面板点外部即关；商店预览中点卡片以外即取消（恢复原样）
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
  document.addEventListener('click', function(ev){
    // 情报面板：点到面板或入口按钮以外任意处 → 立即关闭
    const ipanel = document.getElementById('intel-panel');
    if (ipanel && ipanel.style.display === 'block') {
      const t0 = ev.target;
      if (t0 && t0.closest && !t0.closest('#intel-panel') && !t0.closest('.intel-btn')) closeIntel();
    }
    // 盟约详情：点外部即关（浮窗化，同情报/策略面板）；点盟约图标切换由 onBondClick 接管
    const bdd = document.getElementById('bond-detail');
    if (bdd && bdd.style.display === 'block') {
      const tb = ev.target;
      if (tb && tb.closest && !tb.closest('#bond-detail') && !tb.closest('.bond')) { selectedBond = null; hideBondDetail(); renderBonds(); }
    }
    // 侧边立绘面板（干员/装备选中）：点面板与棋盘以外任意处 → 关闭（浮窗化，同情报/盟约）
    if (shopPreview < 0) {
      const hd = document.getElementById('hand-detail');
      if (hd && hd.style.display === 'block') {
        const th = ev.target;
        if (th && th.closest && !th.closest('#hand-detail') && th !== document.getElementById('cv')) {
          selectedEquip = null; selectedHand = null; selBoardOp = null;
          setSelected(null);
          renderAll();
        }
      }
    }
    if (shopPreview < 0) return;
    const t = ev.target;
    if (t && t.closest && (t.closest('.shop-card') || t.closest('#hand-detail'))) return;   // 仍在商店上下文，不取消
    cancelShopPreview();
  });
  // 手牌手势：mousemove/mouseup 判定「点击查看」还是「拖拽部署」
  document.addEventListener('mousemove', onHandMove);
  document.addEventListener('mouseup', onHandUp);
  // 视口变化时重算候选区位置（棋盘屏幕包围盒随之改变）
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', layoutBench);
  if (typeof window !== 'undefined') window.__shopCollapsed = false;   // 默认商店展开
  setupBondsDrag();   // 盟约条横向拖动换页
}

