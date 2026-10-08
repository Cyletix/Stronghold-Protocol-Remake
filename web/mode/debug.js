// ============================================================
// 手动整页截图：点击顶栏「📷 截图」按钮，用 html2canvas 截取整个页面 UI
//（棋盘 Layer0 + 全部 HUD/商店/菜单 Layer1），POST /randomsnapshot → 本地 server
// 保存到 assets/picture/randomsnapshot（最多保留 3 张）。
// ============================================================
// Single-player testing tools. The flag follows round state copies, defaults off
// in a new run, and never authorizes writes to an authoritative multiplayer snapshot.
function gameDebugAvailable(){return !!G&&GMODE==='auto'&&!window.__roomRemoteSimulation&&['rest','battle'].includes(G.phase);}
function gameDebugActive(){return gameDebugAvailable()&&G.debugEnabled===true;}
function debugMessage(message){
  for(const id of ['debug-status','roster-debug-status']){const el=document.getElementById(id);if(el)el.textContent=message;}
}
function renderGameDebug(){
  const active=gameDebugActive(),button=document.getElementById('debug-toggle'),panel=document.getElementById('debug-panel');
  if(button){button.disabled=!gameDebugAvailable();button.setAttribute?.('aria-pressed',String(active));button.title=window.__roomRemoteSimulation?'调试仅用于单人本机对局':'调试模式';}
  if(panel)panel.hidden=!active;
  const add=document.getElementById('debug-roster');if(add)add.disabled=!active||G.phase!=='rest';
  const tools=document.getElementById('roster-debug-tools');if(tools)tools.hidden=!active;
}
function toggleGameDebug(){
  if(!gameDebugAvailable())return false;
  G.debugEnabled=!gameDebugActive();renderGameDebug();renderRoster();
  debugMessage(gameDebugActive()?'已开启；选择需要测试的操作。':'调试已关闭。');return true;
}
function openDebugRoster(){if(!gameDebugActive()||G.phase!=='rest')return false;debugMessage('搜索干员，点击卡片下方按钮加入候选区。');openRoster();return true;}
function debugAddGold(){
  if(!gameDebugActive())return false;
  G.money=(Number(G.money)||0)+1;G.debugUsed=true;renderAll();debugMessage('金币 +1，当前 '+G.money+'。');return true;
}
document.addEventListener('pointerdown', event => {
  if (!gameDebugActive() || event.target.closest?.('#debug-panel, #debug-toggle, #roster-modal, #roster-detail')) return;
  G.debugEnabled = false; renderGameDebug(); renderRoster();
});
function debugTacticalEntry(charId){
  if(!['char_452_bstalk','char_476_blkngt','char_4147_mitm','char_4215_buddy','char_4228_closur','char_499_kaitou','char_4081_warmy','char_4102_threye','char_344_beewax'].includes(charId)&&!SKILL_CHOICES[charId]?.some(s=>(window.ArkClientPrograms?.supported.includes(s.skillId)||window.ArkClientStatBuffSkills?.supported.includes(s.skillId)||window.ArkCommonSkills?.supported.includes(s.skillId)||window.ArkOperatorCombat?.marksmanSkills.includes(s.skillId)||window.ArkNextAttackSkillData?.profiles[s.skillId]||window.ArkDirectSkillData?.profiles[s.skillId]||window.ArkAttackProfiles?.[charId]?.releasedDrone?.skills.includes(s.skillId)||window.ArkMedicSkills?.supported.includes(s.skillId))))return null;
  const o=BATTLE.operators.find(o=>o.charId===charId);if(!o)return null;
  return {...o,debugLibrary:true,tier:0,baseMaxHp:o.maxHp,baseAtk:o.atk,baseDef:o.def,baseBlockCnt:o.blockCnt,baseAttackTime:o.attackTime,baseMagicRes:o.magicRes,
    atkType:window.ArkAttackProfiles[charId].damageType,seasonBond:null,regBonds:[],bondGarrison:[],power:[o.nationId,o.groupId,o.teamId].filter(Boolean),
    skill:SKILL_DATA[charId],talents:TALENT_DATA[charId]||[],rangePhases:RANGE_DATA[charId]||[],rangeGrids:RANGE_DATA[charId]?.[0]?.grids,module:null};
}
function debugAddOperator(charId){
  const library=!ROSTER[charId]&&debugTacticalEntry(charId);
  if(!gameDebugActive()||G.phase!=='rest'||(!ROSTER[charId]&&!library))return false;
  if(G._mergeReward){debugMessage('请先关闭干员库，在商店领取晋升调配奖励。');return false;}
  const merges=G.ops.filter(o=>o.charId===charId&&!o.elite).length>=2;
  const occupied=new Set(G.ops.filter(o=>o.row!=null).map(o=>o.row+','+o.col));
  const capacity=candidateCells(BDATA.level).filter(c=>!occupied.has(c.row+','+c.col)).length;
  if(!merges&&candidateItems().length>=capacity){debugMessage('候选区已满，请先部署或出售干员。');return false;}
  G.bannedOperators=(G.bannedOperators||[]).filter(id=>id!==charId);
  if(library){
    G.skillChoices??={};G.skillChoices[charId]=getOpAccount(charId).selectedSkill;
    G.ops.push({id:G.nextId++,charId,entry:library,debugLibrary:true,elite:false,equip:[],row:null,col:null,dir:'up'});
  }else addOperator(charId,false);
  G.debugUsed=true;refreshBoard();renderAll();
  debugMessage((library||ROSTER[charId]).name+(library?'已按资料库练度加入测试，不进入商店。':merges?'已三合一，领取晋升调配后可继续测试。':'已加入候选区。'));return true;
}
function debugSkipRound(){
  if(!gameDebugActive())return false;
  const round=G.round;
  // Finish through the existing progression path; never invent enemy kills or loot.
  G.debugUsed=true;(G.debugSkippedRounds||=[]).push(round);
  G._decisionSelection=null;G._decisionResolvedRound=round;G._decisionRemaining=0;G._upgradeConfirm=false;
  if(G._mergeReward){G.shop=G._mergeReward.savedShop;G._mergeReward=null;}
  for(const id of ['decision-modal','roster-modal','roster-detail','hand-detail']){const el=document.getElementById(id);if(el)el.style.display='none';}
  selectedHand=null;selectedEquip=null;selBoardOp=null;shopPreview=-1;drag=null;selected=null;
  if(B){B.over=true;B.win=true;releaseProjectiles(B.projectiles);B.projectiles=[];B.bossSkillEvents=[];B.combatEffects=[];}
  G.phase='battle';G.battleDone=true;G.lastBattleWin=true;
  nextRound();renderGameDebug();debugMessage(G.phase==='over'?'已跳过最后一关，本局结束。':'已跳过第 '+round+' 关，进入第 '+G.round+' 关。');return true;
}

const RS_POST = 'randomsnapshot';
function rsLog(m) { if (typeof console !== 'undefined' && console && console.log) console.log('[snapshot] ' + m); }
window.manualSnapshot = function () {
  try {
    if (typeof html2canvas !== 'function') { rsLog('html2canvas 未加载，请确认 vendor/html2canvas.min.js 已引入'); return; }
    if (typeof document === 'undefined' || !document) return;
    // 截取整个文档（页面 overflow:hidden，即完整可见 UI），保留棋盘与所有悬浮层
    html2canvas(document.documentElement, { backgroundColor: null, useCORS: true, scale: 1, logging: false })
      .then(function (canvas) {
        const data = canvas.toDataURL('image/png');
        if (!data || data.length < 20) { rsLog('空截图'); return; }
        if (typeof fetch === 'function') {
          fetch(RS_POST, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: data })
            .then(function (r) { return r.json(); })
            .then(function (j) { if (j && j.ok) rsLog('已保存 ' + data.length + ' 字节'); })
            .catch(function (e) { rsLog('保存失败 ' + e); });
        }
      })
      .catch(function (e) { rsLog('截图失败 ' + e); });
  } catch (e) { rsLog('截图异常 ' + e); }
};

// ============================================================
// HUD VISUAL LAYOUT EDITOR
// F2 = toggle editor / F3 = export current positions as CSS
// 浏览器里拖拽 HUD 元素，导出坐标到 console + 剪贴板
// ============================================================
(function setupHudLayoutEditor() {
  if (typeof document === 'undefined' || !document.querySelectorAll || !document.body) return;

  const SELECTORS = [
    '.od-skill-icon',
    '.od-namerow',
    '.od-tierrow',
    '.od-stat-list',
    '.od-rangebox',
    '.od-bond',
    '.od-hpbar'
  ];
  const SNAP = 6; // 吸附阈值 px

  let enabled = false;
  let action = null; // { el, mode:'move'|'resize', startX, startY, startLeft, startTop, startW, startH }

  function getHeader() {
    return document.querySelector('#hand-detail .od-header');
  }

  function px(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function ensureHandle(el) {
    if (!el.querySelector('.hud-rs')) {
      const rs = document.createElement('div');
      rs.className = 'hud-rs';
      rs.title = '拖拽调整大小';
      el.appendChild(rs);
    }
  }

  function editableEls() {
    return SELECTORS.map(function (s) { return document.querySelector('#hand-detail ' + s); }).filter(Boolean);
  }

  function absPos(el, header) {
    const r = el.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = (r.left - hr.left) + 'px';
    el.style.top = (r.top - hr.top) + 'px';
  }

  // 吸附：返回需要附加的 dx/dy（边缘 + 中心对齐）
  function snapDelta(rect, hr, others) {
    let dx = 0, dy = 0, snapX = false, snapY = false;
    const tx = [0, hr.width];
    const ty = [0, hr.height];
    for (const o of others) {
      tx.push(o.left, o.left + o.width / 2, o.left + o.width);
      ty.push(o.top, o.top + o.height / 2, o.top + o.height);
    }
    const sx = [rect.left, rect.left + rect.width / 2, rect.left + rect.width];
    const sy = [rect.top, rect.top + rect.height / 2, rect.top + rect.height];
    outerX:
    for (const s of sx) {
      for (const t of tx) {
        if (Math.abs(s - t) <= SNAP) { dx = t - s; snapX = true; break outerX; }
      }
    }
    outerY:
    for (const s of sy) {
      for (const t of ty) {
        if (Math.abs(s - t) <= SNAP) { dy = t - s; snapY = true; break outerY; }
      }
    }
    return { dx: dx, dy: dy, snapX: snapX, snapY: snapY };
  }

  function onDown(el, mode, ev) {
    if (!enabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    const header = getHeader();
    if (!header) return;
    const er = el.getBoundingClientRect();
    absPos(el, header);
    action = {
      el: el,
      mode: mode,
      startX: ev.clientX,
      startY: ev.clientY,
      startLeft: px(el.style.left),
      startTop: px(el.style.top),
      startW: er.width,
      startH: er.height
    };
    el.style.zIndex = '9999';
  }

  function enableElement(el) {
    if (!el || el.dataset.hudEditorBound) return;
    el.dataset.hudEditorBound = '1';
    ensureHandle(el);
    el.addEventListener('mousedown', function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('hud-rs')) return;
      onDown(el, 'move', ev);
    });
    const rs = el.querySelector('.hud-rs');
    if (rs) rs.addEventListener('mousedown', function (ev) { onDown(el, 'resize', ev); });
  }

  function bindAll() {
    for (const sel of SELECTORS) {
      document.querySelectorAll('#hand-detail ' + sel).forEach(enableElement);
    }
  }

  document.addEventListener('mousemove', function (ev) {
    if (!enabled || !action) return;
    const dx = ev.clientX - action.startX;
    const dy = ev.clientY - action.startY;
    const header = getHeader();
    if (!header) return;

    if (action.mode === 'resize') {
      action.el.style.width = Math.max(20, Math.round(action.startW + dx)) + 'px';
      action.el.style.height = Math.max(12, Math.round(action.startH + dy)) + 'px';
      return;
    }

    let left = action.startLeft + dx;
    let top = action.startTop + dy;

    const hr = header.getBoundingClientRect();
    const others = editableEls().filter(function (o) { return o !== action.el; })
      .map(function (o) {
        const r = o.getBoundingClientRect();
        return { left: r.left - hr.left, top: r.top - hr.top, width: r.width, height: r.height };
      });
    const snap = snapDelta(
      { left: left, top: top, width: action.startW, height: action.startH },
      { width: hr.width, height: hr.height },
      others
    );
    left += snap.dx;
    top += snap.dy;

    action.el.style.left = Math.round(left) + 'px';
    action.el.style.top = Math.round(top) + 'px';
    action.el.style.outlineColor = (snap.snapX || snap.snapY) ? '#ffd54f' : '#4fd0e8';
  });

  document.addEventListener('mouseup', function () {
    if (!action) return;
    action.el.style.zIndex = '';
    action = null;
  });

  function setEnabled(v) {
    enabled = v;
    bindAll();
    document.body.classList.toggle('hud-layout-editing', enabled);
    console.log('[HUD editor]', enabled ? 'ON' : 'OFF');
  }

  function exportLayout() {
    const header = getHeader();
    if (!header) { console.warn('No #hand-detail .od-header found'); return; }
    const hr = header.getBoundingClientRect();
    const css = ['/* ===== HUD layout generated by visual editor ===== */'];
    for (const sel of SELECTORS) {
      const el = document.querySelector('#hand-detail ' + sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      css.push(sel + ' {');
      css.push('  position: absolute;');
      css.push('  left: ' + Math.round(r.left - hr.left) + 'px;');
      css.push('  top: ' + Math.round(r.top - hr.top) + 'px;');
      css.push('  width: ' + Math.round(r.width) + 'px;');
      css.push('  height: ' + Math.round(r.height) + 'px;');
      css.push('}');
    }
    const result = css.join('\n');
    console.log(result);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(result)
        .then(function () { console.log('[HUD editor] CSS copied to clipboard'); })
        .catch(function () {});
    }
    return result;
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'F2') { ev.preventDefault(); setEnabled(!enabled); }
    if (ev.key === 'F3') { ev.preventDefault(); exportLayout(); }
  });

  const observer = new MutationObserver(function () {
    if (enabled) bindAll();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.hudLayoutEditor = {
    enable: function () { setEnabled(true); },
    disable: function () { setEnabled(false); },
    toggle: function () { setEnabled(!enabled); },
    export: exportLayout
  };
})();

// ============================================================
// 盟约条弹性拖拽回弹：拉到边缘超出一部分后回弹（超容器部分由 #bonds mask 渐隐）
// ============================================================
(function setupBondBarDrag() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('bonds');
  if (!el || !el.addEventListener) return;

  let dragging = false, startX = 0, startTx = 0;

  function tx() {
    const m = /translateX\(([-\d.]+)px\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : 0;
  }

  el.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;
    dragging = true;
    startX = ev.clientX;
    startTx = tx();
    el.style.transition = 'none';
    el.style.cursor = 'grabbing';
    ev.preventDefault();
  });

  window.addEventListener('mousemove', function (ev) {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const maxTx = 0;                                   // 左边界（不往右超）
    const minTx = -(el.scrollWidth - el.clientWidth);  // 右边界
    let t = startTx + dx;
    if (t > maxTx) t = maxTx + (t - maxTx) * 0.28;        // 左超：弹性衰减
    else if (t < minTx) t = minTx + (t - minTx) * 0.28;   // 右超：弹性衰减
    el.style.transform = 'translateX(' + t + 'px)';
  });

  function end() {
    if (!dragging) return;
    dragging = false;
    el.style.transition = 'transform .38s cubic-bezier(.18,.89,.32,1.28)';
    el.style.transform = 'translateX(0)';
    el.style.cursor = '';
    setTimeout(function () { el.style.transition = ''; }, 400);
  }
  window.addEventListener('mouseup', end);
  window.addEventListener('mouseleave', end);
})();
