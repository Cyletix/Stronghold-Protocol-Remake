'use strict';
// ============================================================
// 卫戍协议 · 战斗引擎（纯塔防战斗模拟，由 mode.js 驱动）
// ============================================================
const PROF_CN = { PIONEER:'先锋', GUARD:'近卫', WARRIOR:'近卫', SNIPER:'狙击', CASTER:'术师', MEDIC:'医疗', DEFENDER:'重装', TANK:'重装', SUPPORT:'辅助', SPECIAL:'特种' };
// 职业单字徽章（备战席卡左上角）与代表色
const PROF_SHORT = { PIONEER:'先', GUARD:'近', WARRIOR:'近', SNIPER:'狙', CASTER:'术', MEDIC:'医', DEFENDER:'重', TANK:'重', SUPPORT:'辅', SPECIAL:'特' };
const PROF_COLOR = { PIONEER:'#8fb7ff', GUARD:'#ef9a9a', WARRIOR:'#ef9a9a', SNIPER:'#a5d6a7', CASTER:'#ce93d8', MEDIC:'#fff176', DEFENDER:'#90a4ae', TANK:'#90a4ae', SUPPORT:'#81d4fa', SPECIAL:'#ffb74d' };
// 职业图标文件名（官方 OBB 高清 256×256，web/assets/profession_icons/）
const PROF_ICON = { PIONEER:'vanguard', GUARD:'guard', WARRIOR:'guard', SNIPER:'sniper', CASTER:'caster', MEDIC:'medic', DEFENDER:'defender', TANK:'defender', SUPPORT:'supporter', SPECIAL:'specialist' };
const RARITY_COLOR = ['','#9e9e9e','#8bc34a','#2196f3','#9c27b0','#ff9800','#f44336'];
const TILE_COLOR = { tile_forbidden:'#232936', tile_road:'#3d4559', tile_floor:'#333b4f', tile_start:'#c62828', tile_end:'#1565c0', tile_telin:'#6a1b9a', tile_telout:'#6a1b9a' };
let ROUND_LIMIT = 60;   // 每回合自动作战时限（秒）：超时则剩余存活怪物按数量直接扣血（DB 覆盖）
let PROJECTILE_SPEED = 10;   // 我方弹道速度（格/秒）。方舟原版弹速/弹道类型在 binary prefab 中，官方数据表无统一字段。
                              // 此处用「合理默认」作为可玩性修复：物理=箭矢/弹丸、法术=光球；精确原版参数未验证（见 findings：projectile 研究事项）。
const ENEMY_PROJECTILE_SPEED = 6;   // 敌方弹道速度（格/秒），同理为合理默认、精确值未验证。

// ---- 音效（SFX）：预加载 + 播放（支持重叠）。文件在 web/sfx/，由 tools/export_sfx.py 从 main.obb 提取 ----
const SFX_LIST = ['b_enemy_dead_n', 'b_enemy_dead_h', 'b_ui_win', 'b_ui_lose', 'b_ui_whoosh', 'b_ui_dooralarm', 'b_char_set', 'b_char_atkboost', 'b_char_defboost', 'b_char_healboost'];
const SFX = {};
const SFX_ACTIVE = new Set(), SFX_LAST = new Map(), SFX_RECEIVED = new Map();
window.gameSfxPreference = {muted:false,volume:0.5};
function loadSfx() {
  if (typeof Audio === 'undefined') return;
  for (const n of SFX_LIST) {
    try { const a = new Audio('sfx/' + n + '.mp3'); a.preload = 'auto'; SFX[n] = a; } catch (e) {}
  }
}
function playSfx(name) {
  const a = SFX[name];
  const pref=window.gameSfxPreference;
  if (!a || pref.muted || pref.volume<=0) return;
  const now=Date.now();
  if(now-(SFX_LAST.get(name)||0)<100)return;
  SFX_LAST.set(name,now);
  try {
    for(const active of SFX_ACTIVE)if(active.paused||active.ended)SFX_ACTIVE.delete(active);
    if(SFX_ACTIVE.size>=6)return;
    const voice=(a.paused||a.ended)?a:a.cloneNode(true);
    voice.currentTime=0;voice.volume=pref.volume;voice.muted=false;SFX_ACTIVE.add(voice);
    voice.onended=()=>SFX_ACTIVE.delete(voice);
    const pending=voice.play();if(pending?.catch)pending.catch(()=>SFX_ACTIVE.delete(voice));
  } catch (e) { /* 忽略音频播放失败（自动播放限制/缺失） */ }
}
function syncSfxPreference(){
  for(const voice of SFX_ACTIVE){voice.volume=window.gameSfxPreference.volume;voice.muted=window.gameSfxPreference.muted;if(voice.muted)voice.pause();}
}
// Recorded with the authoritative simulation, so remote clients hear accepted
// events once. Browser playback throttling never changes the simulation state.
function emitBattleSfx(name){
  if(B){B.audioSequence=(B.audioSequence||0)+1;const events=B.audioEvents||(B.audioEvents=[]);events.push({id:B.audioSequence,at:B.time||0,name});if(events.length>64)events.splice(0,events.length-64);}
  if(!window.__roomRemoteSimulation)playSfx(name);
}
function consumeBattleAudio(board,key){
  if(!board)return;
  const last=SFX_RECEIVED.get(key),seq=board.audioSequence||0;
  SFX_RECEIVED.set(key,seq);
  if(SFX_RECEIVED.size>16)SFX_RECEIVED.delete(SFX_RECEIVED.keys().next().value);
  // Initial/reconnected views establish a cursor; never replay their history.
  if(last==null||seq<last)return;
  for(const event of board.audioEvents||[])if(event.id>last&&(board.time||0)-event.at<=0.8)playSfx(event.name);
}
window.consumeBattleAudio=consumeBattleAudio;

// 攻击摇摆角（弧度）：攻击后 0.28s 内左右摇摆、随衰减归零（「抬手」近似：以图标左右摇晃表示）
function atkRockAngle(atkAnimAt, t) {
  if (atkAnimAt == null) return 0;
  const el = t - atkAnimAt;
  if (el < 0 || el > 0.28) return 0;
  const p = el / 0.28;
  return Math.sin(p * Math.PI * 2.5) * 0.14 * (1 - p);
}
const CAM_LERP = 14;           // 镜头运镜速率（干员聚焦 与 商店收起/展开 共用），≈0.1-0.2s 收敛，快速精炼不拖沓
const BATTLE_DEPLOY_INTERVAL = 0.1; // 开战时按地图顺序逐个下落，每名干员占用 0.1s
const BATTLE_DEPLOY_FALL = 0.1;
const HIT_PARTICLE = 8;        // 弹道命中生成的黑灰粒子数量
const RESPAWN_TIME = 6;         // 干员阵亡后原地等待复活的 CD（秒）
const RESPAWN_COST = 3;         // 复活默认费用（资金，与招募干员 BUY_COST 一致）
const PARTICLE_MAX = 400;      // 未加载 render-policy.js 时的兼容粒子上限

let canvas, ctx, TILE = 52;
let BDATA = null;
const avCache = {};
const enemyAvCache = {};
const tileCache = {};
const equipIconCache = {};
const skillIconCache = {};   // 技能图标缓存（ui/skillicons/skill_icon_{prefabId}.png）
function getTile(name) {
  if (!tileCache[name]) {
    const im = new Image();
    im.onload = invalidateTerrainCache;
    im.src = 'ui/tiles/' + name + '.png';
    tileCache[name] = im;
  }
  return tileCache[name];
}
function getEnemyAvatar(enemyId) {
  if (!enemyAvCache[enemyId]) {
    const im = new Image();
    im.src = 'enemy_avatars/' + enemyId + '.png';   // 图鉴图片；固定大型 Boss 使用完整图片显示
    enemyAvCache[enemyId] = im;
  }
  return enemyAvCache[enemyId];
}

// ---- UI 图集（SpriteSheet 方式：整图 + UI_ATLAS 坐标表）----
let UIAtlas = null;
function loadUIAtlas() { UIAtlas = new Image(); UIAtlas.src = 'ui/BattleUI_atlas0.png'; }
// 从 BattleUI_atlas0.png 绘制第 idx 个图标（UI_ATLAS[idx] = [sx,sy,sw,sh]）
function drawUIIcon(idx, dx, dy, dw, dh) {
  if (!UIAtlas || !UI_ATLAS || !UIAtlas.complete || UIAtlas.naturalWidth === 0) return;
  const c = UI_ATLAS[idx];
  if (!c) return;
  ctx.drawImage(UIAtlas, c[0], c[1], c[2], c[3], dx, dy, dw || c[2], dh || c[3]);
}

let B = null;                 // 当前战斗状态（phase='rest' 时承载棋盘干员）
let hover = null;
let selected = null;
let drag = null;              // 拖拽状态：{phase:'drag'|'facing', op, row, col, dir, x, y, dragging}
let suppressClick = false;    // 拖拽完成（部署/移动/重排）后抑制紧随的 click，避免误选中松手处的干员
let cam = { f: 0 };           // 相机运镜焦点：0=常态, 1=选中/拖动(上移+微倾斜缩放) 0.1s 完成
let shopReserve = -1;         // 当前商店保留区高度（动画插值中）；-1=未初始化
let shopReserveGoal = -1;     // 目标保留区高度（收起=0 / 展开=视口1/4）
let hudReserveTop=0;
window.__syncHudReserve=function(){
  let bottom=0;
  for(const id of ['hud-cluster','bondbar']){const el=document.getElementById(id),rect=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;if(rect?.height>0)bottom=Math.max(bottom,rect.bottom+8);}
  hudReserveTop=bottom;
};
let benchHide = 0;            // 战斗中隐藏候选区（地图底行）：0=显示 1=隐藏，随 phase 缓动
// 回调由 mode.js 以全局函数提供：window.onBattleEnd / onOpClick / onOpRightClick / onDeploy

function replaceEngineState(scope, value, reason) {
  if (typeof window !== 'undefined' && window.ArkState) window.ArkState.bindLegacy(scope, value, reason);
  return value;
}

const particlePool = (typeof window !== 'undefined' && window.ArkRender)
  ? window.ArkRender.createObjectPool(() => ({ x:0, y:0, vx:0, vy:0, life:0, size:0 }), 4000)
  : null;
const projectilePool = (typeof window !== 'undefined' && window.ArkRender)
  ? window.ArkRender.createObjectPool(() => ({}), 1500)
  : null;
function renderProfile() {
  return (typeof window !== 'undefined' && window.ArkRender)
    ? window.ArkRender.getProfile()
    : { id:'legacy', sceneScaleMax:3, warpGrid:24, projectileBudget:1500, particleBudget:PARTICLE_MAX, particleStride:1 };
}
function releaseParticles(particles) {
  if (!particlePool || !particles) return;
  for (const particle of particles) particlePool.release(particle);
}
function releaseProjectiles(projectiles) {
  if (!projectiles) return;
  for (const projectile of projectiles) recycleProjectile(projectile);
}
function recycleProjectile(projectile) {
  // 空闲池不持有上一场敌人、干员及其装备/目标引用。
  projectile.owner=null;projectile.target=null;
  projectile.plan=null;projectile.enemyChain=null;projectile.attackPacket=null;
  projectile.sourceSkillPacket=null;
  projectile.directSkillPacket=null;
  projectile.enemyActionPacket=null;
  if(projectilePool)projectilePool.release(projectile);
}
function spawnProjectile(data) {
  const projectile = projectilePool ? projectilePool.acquire() : {};
  // 所有弹道走同一字段契约；覆盖强引用后再入队，避免池对象保留上一发 owner/target。
  projectile.owner = null; projectile.target = null;
  Object.assign(projectile, data);
  projectile.visualId=(B.visualSequence=(B.visualSequence||0)+1);
  projectile.enemy=!!data.enemy;
  projectile.bombSource=data.bombSource||null;
  projectile.halfWidth=data.halfWidth??null;projectile.halfHeight=data.halfHeight??null;
  projectile.coldSource=data.coldSource||null;
  projectile.critical=!!data.critical;projectile.criticalStun=data.criticalStun||0;
  projectile.damageType=data.damageType??null;
  projectile.basicAttack=!!data.basicAttack;
  projectile.plan=data.plan||null;projectile.resolveAt=data.resolveAt??null;
  projectile.enemyChain=data.enemyChain||null;projectile.attackPacket=data.attackPacket||null;
  projectile.sourceSkillPacket=data.sourceSkillPacket||null;
  projectile.directSkillPacket=data.directSkillPacket||null;
  projectile.enemyActionPacket=data.enemyActionPacket||null;
  projectile.castToken=data.castToken??null;projectile.enemyCompleted=false;
  if (!data.enemy&&data.kind!=='operator-pulse') playSfx('b_ui_whoosh');

  B.projectiles.push(projectile);
  return projectile;
}
function compactProjectiles(projectiles) {
  if (!projectiles) return [];
  let write = 0;
  for (let read = 0; read < projectiles.length; read++) {
    const projectile = projectiles[read];
    if (projectile.life > 0) projectiles[write++] = projectile;
    else recycleProjectile(projectile);
  }
  projectiles.length = write;
  return projectiles;
}
function compactParticles(particles) {
  if (!particles) return [];
  let write = 0;
  for (let read = 0; read < particles.length; read++) {
    const particle = particles[read];
    if (particle.life > 0) particles[write++] = particle;
    else if (particlePool) particlePool.release(particle);
  }
  particles.length = write;
  return particles;
}

function getAvatar(charId) {
  if (!avCache[charId]) { const im = new Image(); im.src = 'avatars/' + charId + '.png'; avCache[charId] = im; }
  return avCache[charId];
}
function equipIconPath(name) {
  // PRTS redirects the renamed item to this existing original icon asset.
  const iconName=name==='骑士储蓄罐'?'竞技投币机':name;
  return 'equip_icons/' + encodeURIComponent(iconName) + (name === '盟约之币' ? '.svg' : '.png');
}
function getEquipIcon(name) {
  if (!name) return null;
  if (!equipIconCache[name]) { const im = new Image(); im.src = equipIconPath(name); equipIconCache[name] = im; }
  return equipIconCache[name];
}
// 技能图标（ui/skillicons/skill_icon_{prefabId}.png），缓存加载；无 prefabId 返回 null
function getSkillIcon(prefabId) {
  if (!prefabId) return null;
  if (!skillIconCache[prefabId]) { const im = new Image(); im.src = 'ui/skillicons/skill_icon_' + prefabId + '.png'; skillIconCache[prefabId] = im; }
  return skillIconCache[prefabId];
}
// 装备拖拽悬停干员：屏幕空间绘制「装备置入/替换」操作面板（不随棋盘倾斜）
function drawEquipDropPanel(ctx, o, cx, cy, mouseSX) {
  const rrp = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); };
  const equipArr = (o.equip || []).filter(Boolean);
  const equipCnt = equipArr.length;
  const full = equipCnt >= 2;
  // 干员脚底网格高亮（屏幕空间映射格子）：已满两槽再拖入 → 红色警示，否则绿色
  const g00 = mapPoint(o.col*TILE, o.row*TILE, cam.f);
  const g11 = mapPoint((o.col+1)*TILE, (o.row+1)*TILE, cam.f);
  const gw = g11[0]-g00[0], gh = g11[1]-g00[1];
  ctx.fillStyle = full ? 'rgba(244,67,54,0.30)' : 'rgba(139,195,74,0.30)'; ctx.fillRect(g00[0], g00[1], gw, gh);
  ctx.save(); ctx.shadowColor = full ? '#f44336' : '#8bc34a'; ctx.shadowBlur = 8; ctx.strokeStyle = full ? '#f44336' : '#8bc34a'; ctx.lineWidth = 2; ctx.strokeRect(g00[0], g00[1], gw, gh); ctx.restore();

  // —— 面板几何（屏幕空间，放大一倍 + 均衡留白 + 居中对齐）——
  const pw = TILE*3.8, ph = TILE*1.72;              // 外胶囊（放大一倍）
  const topY = cy - TILE*0.5;
  const px = cx - pw/2, py = topY - ph - 4;
  // 外胶囊底板（半透明黑，圆角胶囊形）
  ctx.fillStyle = 'rgba(20,20,20,0.88)'; rrp(px, py, pw, ph, ph/2); ctx.fill();
  // 已满两槽：整组红色透明遮罩（提示「再拖入将替换并销毁对应槽位装备」）
  if (full) { ctx.fillStyle = 'rgba(244,67,54,0.16)'; rrp(px, py, pw, ph, ph/2); ctx.fill(); }
  // 工业风细线侧括线（胶囊左右边缘，垂直居中）
  const bw = TILE*0.26, bh = TILE*0.68, by = py + (ph-bh)/2;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px+bw+6, by); ctx.lineTo(px+bw, by); ctx.lineTo(px+bw, by+bh); ctx.lineTo(px+bw+6, by+bh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px+pw-bw-6, by); ctx.lineTo(px+pw-bw, by); ctx.lineTo(px+pw-bw, by+bh); ctx.lineTo(px+pw-bw-6, by+bh); ctx.stroke();

  // 插槽组外框（双框）+ 中间分割线
  const fw = TILE*2.56, fh = TILE*1.32;
  const fx = cx - fw/2, fy = py + (ph-fh)/2;
  ctx.strokeStyle = 'rgba(136,136,136,0.9)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx, fy+fh); ctx.stroke();

  // 双槽（方形，双框内居中 + 均衡左右/上下留白）
  const slot = TILE*1.0;                    // 方框（放大一倍）
  const gap = TILE*0.32;                    // 左右槽间距（均衡空白）
  const totalW = slot*2 + gap;
  const padX = (fw - totalW) / 2;           // 左右均衡留白
  const sL = fx + padX, sR = sL + slot + gap;
  const slotY = fy + (fh - slot) / 2;       // 垂直居中

  // 高亮槽 = 鼠标离得近的方格（面板中心 cx 为界：左→槽0，右→槽1）
  const hoverSlot = (mouseSX != null) ? ((mouseSX < cx) ? 0 : 1) : null;
  if (drag) drag.hoverSlot = hoverSlot;     // 供 onUp 决定置入左/右槽

  const drawSlot = (sx, slotIdx) => {
    const filled = !!(o.equip && o.equip[slotIdx]);
    const hovered = (hoverSlot === slotIdx);
    if (hovered) {
      // 激活置入槽：白色方框 + 从边缘青绿(76,160,144)向中心渐变透明；已满两槽时改红
      const c = full ? '244,67,54' : '76,160,144';
      const g = ctx.createRadialGradient(sx+slot/2, slotY+slot/2, slot*0.1, sx+slot/2, slotY+slot/2, slot*0.6);
      g.addColorStop(0, 'rgba('+c+',0)');
      g.addColorStop(1, 'rgba('+c+',0.85)');
      ctx.fillStyle = g; ctx.fillRect(sx, slotY, slot, slot);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5; ctx.strokeRect(sx+0.5, slotY+0.5, slot-1, slot-1);
    } else {
      // 常规槽：1px 浅灰直角边框 + 纯黑/暗底
      ctx.fillStyle = filled ? '#2c2c2c' : '#111111'; ctx.fillRect(sx, slotY, slot, slot);
      ctx.strokeStyle = filled ? '#e8e8e8' : 'rgba(136,136,136,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(sx+0.5, slotY+0.5, slot-1, slot-1);
    }
    // 已装装备实体图标（本槽）
    if (filled) {
      const eq = getEquipIcon(o.equip[slotIdx].name || o.equip[slotIdx].id);
      if (eq && eq.complete && eq.naturalWidth > 0) ctx.drawImage(eq, sx+3, slotY+3, slot-6, slot-6);
    }
    // 拖拽装备预览：悬停槽内绘制半透明幽灵图标（本槽已有装备则更淡，表示将被替换）
    if (hovered && drag && drag.equipName) {
      const deq = getEquipIcon(drag.equipName);
      if (deq && deq.complete && deq.naturalWidth > 0) {
        ctx.save(); ctx.globalAlpha = filled ? 0.55 : 0.9; ctx.drawImage(deq, sx+3, slotY+3, slot-6, slot-6); ctx.restore();
      }
    }
  };
  drawSlot(sL, 0);
  drawSlot(sR, 1);
}

function initEngine(data) {
  if (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined' && window.ArkRender) {
    const requestedQuality = new URLSearchParams(location.search).get('quality');
    if (requestedQuality) window.ArkRender.setQuality(requestedQuality);
  }
  BDATA = replaceEngineState('catalog', data, 'engine.init');
  invalidateTerrainCache();
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d');
  observeRenderSurface(canvas);
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onRightClick);
  canvas.addEventListener('mousedown', onDown);
  requestAnimationFrame(loop);
}

function sizeCanvas() {
  if (!BDATA || !BDATA.level) return;
  const lv = BDATA.level;
  // Layer 0：棋盘画布铺满整个视口（100vw×100vh）；网格缩放交给 computeFit 拉满，四周不留黑边
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  TILE = Math.max(20, Math.floor(Math.min(window.innerWidth / lv.cols, window.innerHeight / lv.rows)));
  // 把网格尺寸暴露给 CSS（手牌格与战场格子同高、底部商店1/4 高度等布局共用）
  if (typeof document !== 'undefined' && document && document.documentElement) {
    const root = document.documentElement;
    if (root.style && root.style.setProperty) {
      root.style.setProperty('--tile', TILE + 'px');
    }
  }
  invalidateTerrainCache();
  if(window.__setShopReserve)window.__setShopReserve(!!window.__shopCollapsed);
  window.__syncHudReserve();
}
// 切换关卡地图（不重复绑定事件监听）：仅更新 BDATA、重算画布尺寸并清空旧战场
function setLevel(data) {
  if (B && B.particles) releaseParticles(B.particles);
  if (B && B.projectiles) releaseProjectiles(B.projectiles);
  BDATA = replaceEngineState('catalog', data, 'engine.level-changed');
  invalidateTerrainCache();
  sizeCanvas();
  B = replaceEngineState('battle', null, 'engine.level-changed'); selected = null; drag = null;
}

function flash(m) { const el = document.getElementById('flash'); el.textContent = m; clearTimeout(el._t); el._t = setTimeout(() => el.textContent='', 1800); }

function dist(a, b) {
  if(b.bossMechanics&&window.ArkBossMechanics)return window.ArkBossMechanics.distanceTo(b,a.col??a.x,a.row??a.y);
  if(a.bossMechanics&&window.ArkBossMechanics)return window.ArkBossMechanics.distanceTo(a,b.col??b.x,b.row??b.y);
  const ar = a.row ?? Math.round(a.y ?? 0), ac = a.col ?? Math.round(a.x ?? 0);
  const br = b.row ?? Math.round(b.y ?? 0), bc = b.col ?? Math.round(b.x ?? 0);
  return Math.max(Math.abs(ar-br), Math.abs(ac-bc));
}

// 计算干员攻击范围的实际格子（相对 grids 按朝向变换为绝对坐标）
function rangeCellsFor(o) {
  const grids = o.rangeGrids;
  if (!grids || !grids.length) return null;
  const dir = o.dir || 'right';
  return grids.map(g => {
    if (dir === 'left') return [o.row + g.row, o.col - g.col];
    if (dir === 'up') return [o.row - g.col, o.col + g.row];
    if (dir === 'down') return [o.row + g.col, o.col - g.row];
    return [o.row + g.row, o.col + g.col];
  });
}

// ---- mode.js 对外接口 ----
function showBoard(operators, bench) {
  if (B && B.particles) releaseParticles(B.particles);
  if (B && B.projectiles) releaseProjectiles(B.projectiles);
  B = replaceEngineState('battle', { phase:'rest', operators: operators || [], bench: bench || [], enemies: [], spawn: [], projectiles: [], particles: [], shield: 0, maxShield: 0, time: 0, over: false, win: false }, 'engine.show-board');
  selected = null;
}
function startBattle(operators, spawn, shield, source) {
  const routeProblem=sourceRouteProblem(source);if(routeProblem)throw new Error(routeProblem);
  if(source?.enemies)BDATA={...BDATA,enemies:{...BDATA.enemies,...source.enemies}};
  if (B && B.particles) releaseParticles(B.particles);
  if (B && B.projectiles) releaseProjectiles(B.projectiles);
  // 预热本场将出现的敌人头像（贴图加载进缓存，避免敌人登场首帧未加载完退化成红色圆点）
  for (const s of (spawn || [])) if (s && s.enemyId) getEnemyAvatar(s.enemyId);
  // 从左下到右上（左右优先于上下）依次部署：行自下而上、行内自左向右，每个 0.1s 落一个
  const sorted = (operators||[]).slice().sort((a,b) => (b.row - a.row) || (a.col - b.col));
  B = replaceEngineState('battle', {
    phase:'battle', time:0, roundTime:0, over:false, win:false,
    dp:Math.max(0,source?.options?.initialCost??0), dpFloor:Math.min(0,...sorted.map(o=>o.costFloor||0)), dpProgress:0,
    dpMax:source?.options?.maxCost??Infinity, dpInterval:source?.options?.costIncreaseTime>0?source.options.costIncreaseTime:1,
    roundLimit:source?.options?.maxPlayTime>0?source.options.maxPlayTime:ROUND_LIMIT,
    waveScheduler:source ? window.ArkWaves.create(source.waves) : null,
    sourceBattle:!!source, moveMultiplier:source?.options?.moveMultiplier??1,
    enemyStatMultiplier:source?.enemyStatMultiplier??1,
    enemyModifiers:source?.enemyModifiers||[],
    leaderEnemyId:source?.leaderEnemyId, leader:null,
    stats:{kills:0,leaks:0},
    bossSkillEvents:[],enemyDeathSpawns:[],
    shield: shield, maxShield: shield,
    operators: sorted.map((o,i) => ({ ...o, hp: o.maxHp, cd: 0, blocked: 0, dead: false, sp: (o.skill && o.skill.initSp) || 0, buffs: [], medicSkillUses:{}, medicEffects:[], medicBarrier:null, medicReactions:[], medicLifeEpoch:0, cells: rangeCellsFor(o), deployT: 0, deployAt: i * BATTLE_DEPLOY_INTERVAL })),
    bench: [],
    traps: [],   // 部署的装置单位（effectId/charId/row/col）：部署后施加 env_gbuff 等效果（U-ITEMS）
    summoneds: [],   // 干员召唤物单位（charId/row/col/hp/atk/attackTime/life）：自动攻击，按 life 存续（召唤技能）
    enemies: [], spawn: [...spawn].sort((a,b)=>a.at-b.at), projectiles: [], particles: [],
  }, 'engine.start-battle');
  selected = null;
}
function setSelected(opId) { selected = opId; }

// 鼠标事件 → 棋盘像素坐标（经投影逆变换，倾斜视角下命中正确格子/按钮）
function boardXY(e) { const r = canvas.getBoundingClientRect(); return unpoint(e.clientX - r.left, e.clientY - r.top); }
function onMove(e) {
  const [px, py] = boardXY(e);
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  const lv = BDATA && BDATA.level;
  const visibleCols = lv ? Math.min(13, (lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols)) : 0;   // 单玩家作战窗口 13 列
  // 只在实际可见棋盘内绘制悬停格；越过右/下边界时继续画红格会形成屏幕边缘的“调试红块”。
  hover = (lv && row>=0 && row<lv.rows && col>=0 && col<visibleCols) ? { row, col } : null;
  if (drag) {
    drag.x = px; drag.y = py;
    if (!drag.moved && drag.startX != null) {
      // 用屏幕坐标判定是否拖离（而非棋盘像素）：镜头倾斜时 unpoint 会漂移，避免「点击查看」被误判为拖动。
      // 阈值按**屏幕上实际缩放后的一格**（fitS*TILE）的约半格来定：拖动一格必然触发，轻微的“点击抖动”不触发。
      const mouseTile = (drag.type === 'equip') ? 8 : Math.max(14, TILE * (fitS || 1) * 0.45);
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > mouseTile) drag.moved = true;
    }
    // 装备拖拽：实时记录悬停的干员（松手时即使光标落在干员头顶上方，也能命中穿戴目标）
    if (drag.type === 'equip') {
      const dr = Math.floor(py / TILE), dc = Math.floor(px / TILE);   // py=行、px=列（此前误用 px 当行、py 当列，导致装备到斜对角）
      const hitOp = o => o.row===dr && o.col===dc;
      drag.hoverOp = B.operators.find(o => hitOp(o) && !o.dead)
        || (B.bench || []).find(o => o.type !== 'equip' && hitOp(o)) || null;
    }
    if (drag.phase === 'facing') {
      // 必须拖动离开当前格子（出现黄色箭头）才设置方向；仍在格子内则不响应
      const lx = px - drag.col*TILE;
      const ly = py - drag.row*TILE;
      if (lx >= 0 && lx <= TILE && ly >= 0 && ly <= TILE) {
        // 光标回到目标格：清除已选方向 → 回到二次确认初始态（箭头消失，等待重新拖出）
        if (drag.dirSet) { drag.dirSet = false; drag.dir = 'up'; }
        return;
      }
      const dx = px - (drag.col + 0.5) * TILE;
      const dy = py - (drag.row + 0.5) * TILE;
      drag.dir = (Math.abs(dx) > Math.abs(dy)) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      drag.dirSet = true;
    }
  }
}

function onDown(e) {
  if (drag && drag.phase === 'facing') { drag.dragging = true; return; }
  if (drag) return;
  if (!B || B.over) return;
  suppressClick = false;   // 新的按下开始，清除可能残留的抑制标志
  const [px, py] = boardXY(e);
  const col = Math.floor(px / TILE), row = Math.floor(py / TILE);
  // 候选区装备：点击即开始装备拖拽（优先级最高，不被菱形操作盘按钮拦截）
  const bop = (B.bench || []).find(o => o.row===row && o.col===col);
  const token=(B.summoneds||[]).find(s=>s.row===row&&s.col===col&&!s.removed);
  if(token){
    if(B.phase==='rest'&&token.tacticalToken&&window.tacticalOwned?.(token))startMoveDrag({...token,isTactical:true,ownerUnitId:window.ArkTactician.owner(token)?.unitId??token.ownerId},px,py,e.clientX,e.clientY);
    return;
  }
  if(B.phase!=='rest'){
    if(window.onCanTacticalInteract?.()===false)return;
    if(bop?.isTactical||bop&&bop.type!=='equip'&&(B.summoneds||[]).some(s=>window.tacticalOwned?.(s)&&window.ArkFlowShape?.copying(s)))startBenchDrag(bop,px,py,e.clientX,e.clientY);
    return;
  }
  if (bop && bop.type === 'equip') { startEquipDrag(bop.id, bop.name, px, py, e.clientX, e.clientY); return; }
  // 检测「已选中」干员/候选的菱形操作按钮（按钮在菱形边上，可能落在相邻格）；命中则交 onClick 处理，不触发拖拽
  if (selected != null) {
    const selDep = B.operators.find(o => o.id === selected && !o.dead);
    if (selDep) {
      const btns = opButtons(selDep);
      if (hitBtn(btns.retreat, px, py) || hitBtn(btns.sell, px, py) || hitBtn(btns.skill, px, py)) return;
    } else {
      const selB = (B.bench || []).find(o => o.id === selected);
      if (selB && selB.type !== 'equip') {
        const bb = benchButtons(selB.col*TILE + TILE/2, selB.row*TILE + TILE/2);
        if (hitBtn(bb.sell, px, py)) return;
      }
    }
  }
  const op = B.operators.find(o => o.row===row && o.col===col && !o.dead);
  if (op) {
    startMoveDrag(op, px, py, e.clientX, e.clientY);
    return;
  }
  // 候选区干员/装置：部署拖拽
  if (bop) {
    startBenchDrag(bop, px, py, e.clientX, e.clientY);
  }
}

function equipTargetAt(row,col){
  return B.operators.find(o=>!o.dead&&o.row===row&&o.col===col)||(B.bench||[]).find(o=>o.type!=='equip'&&o.row===row&&o.col===col)||null;
}
function enemyOccupiesCell(e,row,col){return e.bossMechanics&&window.ArkBossMechanics?window.ArkBossMechanics.intersectsCell(e,row,col):Math.round(e.y)===row&&Math.round(e.x)===col;}
// Logical tile centres are integers. Geometric range has an open outer edge.
// Blocked-target acquisition is a separate basic-attack rule, not a larger cell.
const CONTACT_EPSILON=1e-9;
function touchesOperatorTile(o,x,y){return Math.max(Math.abs(x-o.col),Math.abs(y-o.row))<=.5+CONTACT_EPSILON;}
function enemyInOperatorRange(o,e,cells=o.cells){
  if(!cells){
    if(!Number.isFinite(o.range))return false;
    if(e.bossMechanics&&window.ArkBossMechanics)return dist(o,e)<=o.range;
    return Math.max(Math.abs(e.x-o.col),Math.abs(e.y-o.row))<o.range+.5-CONTACT_EPSILON;
  }
  // Large bosses retain their source hitbox, rather than becoming point targets.
  if(e.bossMechanics&&window.ArkBossMechanics)return cells.some(c=>enemyOccupiesCell(e,c[0],c[1]));
  let edge=false;
  for(const [r,c] of cells){
    const dx=Math.abs(e.x-c),dy=Math.abs(e.y-r);
    if(dx>.5+CONTACT_EPSILON||dy>.5+CONTACT_EPSILON)continue;
    if(dx<.5-CONTACT_EPSILON&&dy<.5-CONTACT_EPSILON)return true;
    edge=true;
  }
  if(!edge)return false;
  // Shared internal seams are inside the union, not gaps between adjacent tiles.
  const neighbours=v=>{const n=Math.round(v+.5);return Math.abs(v+.5-n)<=CONTACT_EPSILON?[n-1,n]:[Math.floor(v+.5)];};
  return neighbours(e.y).every(r=>neighbours(e.x).every(c=>cells.some(cell=>cell[0]===r&&cell[1]===c)));
}
const nativePositionCatalogs=new WeakMap();
function operatorNativePosition(o){
  // Canonical character data wins over a run's temporary placement override.
  const catalog=typeof BATTLE!=='undefined'?BATTLE?.operators:BDATA?.operators;
  if(catalog){
    let positions=nativePositionCatalogs.get(catalog);
    if(!positions){positions=new Map(catalog.map(c=>[c.charId,c.position]));nativePositionCatalogs.set(catalog,positions);}
    if(positions.has(o.charId))return positions.get(o.charId);
  }
  // Tokens must carry their own native type, never inherit their owner's type.
  return o.nativePosition??o.entry?.position??o.position;
}
function operatorUsesIndependentTargeting(o,skill){
  // Explicit exceptions from the reported tests/source token description.
  // An active ATK/multihit buff alone does not change a normal attack selector.
  return o.attackTargeting==='rangeOnly'||o.charId==='token_10052_radian_tower2'
    ||skill?.sourceId==='skchr_svash2_3'
    ||!!(skill?.combatMechanic?.instant||skill?.combatMechanic?.periodic||skill?.combatMechanic?.aura);
}
function enemyInBasicAttackRange(o,e,skill=o.skillState?o.skill:null){
  if(enemyInOperatorRange(o,e))return true;
  if(o.tacticalKind==='flow'&&e.blockerId===o.id&&!e.flying)return true;
  if(operatorUsesIndependentTargeting(o,skill)||!['MELEE','ALL'].includes(operatorNativePosition(o)))return false;
  const hasOwnTile=o.cells?o.cells.some(c=>c[0]===o.row&&c[1]===o.col):Number.isFinite(o.range)&&o.range>=0;
  return hasOwnTile&&o.id!=null&&e.blockerId===o.id&&!e.flying&&touchesOperatorTile(o,e.x,e.y);
}
// First intersection of a movement segment with an operator's closed tile.
function operatorContactTime(o,x,y,nx,ny){
  let enter=0,leave=1;
  for(const [start,delta,center] of [[x,nx-x,o.col],[y,ny-y,o.row]]){
    if(Math.abs(delta)<CONTACT_EPSILON){if(Math.abs(start-center)>.5+CONTACT_EPSILON)return null;continue;}
    const a=(center-.5-start)/delta,b=(center+.5-start)/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave+CONTACT_EPSILON)return null;
  }
  return Math.max(0,Math.min(1,enter));
}
function onUp(e) {
  if (!drag) return;
  const [px, py] = boardXY(e);
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  if (drag.phase === 'drag') {
    if(drag.moved&&drag.type==='deploy'&&!drag.op?.isTactical&&window.tacticalCopyTarget?.(row,col)){
      const d=drag;drag=null;suppressClick=true;window.onTacticalDrop?.(d.op,row,col);return;
    }
    if(drag.moved&&drag.op?.isTactical&&isBenchSlot(row,col)){
      const d=drag;drag=null;suppressClick=true;
      if(d.type==='move')window.tacticalAction?.('retreat',d.op.ownerUnitId);
      return;
    }
    if (drag.type === 'equip') {
      const d = drag; drag = null;
      if (d.moved) {
        // 装备拖动：优先用悬停记录的干员（拖到头顶上方也可），否则按松手格查找（场上已部署或候选区干员均可）
        const op = equipTargetAt(row,col);
        suppressClick = true;
        if (op && window.onEquipDeploy) window.onEquipDeploy(d.equipUid, op.id, (d.hoverOp===op&&d.hoverSlot != null) ? d.hoverSlot : 0);
        else if (isBenchSlot(row, col) && window.onBenchMove) window.onBenchMove(d.equipUid, row, col);
      }
      // 未拖动（点击）：不抑制 click，交给 onClick 弹出装备说明
      return;
    }
    // 候选区（tile_achand 特殊部署位）：拖到候选格=排序；拖到其它可部署格=上场。
    if (drag.type === 'deploy' && drag.moved && isBenchSlot(row, col)) {
      const d = drag; drag = null; suppressClick = true;
      if (window.onBenchMove) window.onBenchMove(d.op.id, row, col);
      return;
    }
    // 场上干员拖回候选区（tile_achand）= 撤回到目标候选格（与撤退按钮一致）
    if (drag.type === 'move' && drag.moved && isBenchSlot(row, col)) {
      const d = drag; drag = null; suppressClick = true;
      if (window.onBenchRecall) window.onBenchRecall(d.op.id, row, col);
      return;
    }
    // 装置部署（isTrap）：拖到可部署空位直接部署（无朝向二次确认，与穿戴类装备一致）
    if (drag.type === 'deploy' && drag.op && drag.op.isTrap && drag.moved) {
      const ok = canDropOperator(drag, row, col);
      if (ok) {
        const d = drag; drag = null; suppressClick = true;
        if (window.onDeploy) window.onDeploy(d.op, row, col, d.dir || 'up');
      } else { drag = null; if (window.onHandDragCancel) window.onHandDragCancel(); }
      return;
    }
    // 部署（手牌）或移动（场上干员）：拖到「可部署且无其它干员且未达上限」的格子 → 进入朝向二次确认。
    // 移动已部署干员到已占用格：视为交换（allowSwap），仍进入朝向确认，松手由 mode.onMoveOp 处理交换。
    const ok = canDropOperator(drag, row, col);
    if (ok && drag.moved) {   // 移动/部署=候选都必须真正拖离（未移动视为点击）才进入朝向确认
      drag.phase = 'facing'; drag.row = row; drag.col = col; drag.dir = drag.dir || 'up'; drag.dragging = false;
    } else {
      drag = null;   // 取消：未移动(移动) / 不可部署 / 已有干员
      if (window.onHandDragCancel) window.onHandDragCancel();
    }
    return;
  }
  if (drag.phase === 'facing' && drag.dragging) {
    // 二次确认：先检测是否点中左上撤退/取消按钮——否则 onUp 会原地完成部署且清空 drag，click 事件里将永远处理不到取消
    const fx2 = drag.col*TILE, fy2 = drag.row*TILE;
    const ccx = fx2 + TILE/2, ccy = fy2 + TILE/2;
    const fb = facingButtons(ccx, ccy);
    if (hitBtn(fb.cancel, px, py)) { drag = null; if (window.onHandDragCancel) window.onHandDragCancel(); return; }   // 点中左上取消 → 放弃本次部署/移动
    // 松手点仍在目标格（未拖出 / 拖出后拖回）：不确认、也不把干员撤回，而是回到二次确认开始状态（箭头清除，可重新拖出）
    if (row === drag.row && col === drag.col) {
      drag.dirSet = false; drag.dir = 'up'; drag.dragging = false;
      return;
    }
    if (!drag.dirSet) { drag = null; if (window.onHandDragCancel) window.onHandDragCancel(); return; }   // 未拖出格子确认方向 → 无响应（不放置，取消本次）
    const d = drag; drag = null; suppressClick = true;   // 部署/移动完成，抑制紧随的 click（不误选松手处的干员）
    if(d.op?.isTactical){window.onTacticalDrop?.(d.op,d.row,d.col,d.dir);return;}
    if (d.type === 'move') { if (window.onMoveOp) window.onMoveOp(d.op.id, d.row, d.col, d.dir); }
    else if (window.onDeploy) window.onDeploy(d.op, d.row, d.col, d.dir);
  }
}

function startDrag(op) { drag = { phase:'drag', op, x:0, y:0, row:0, col:0, dir:'up', dragging:false, moved:true }; }   // DOM 手牌仅在拖离阈值后调用，视为已拖动
// 候选区干员：按下即开始部署拖拽，用 startX/startY 判定是否真正拖离（点击=选中）
function startBenchDrag(bop, sx, sy, scx, scy) {
  drag = { phase:'drag', type:'deploy', op: { id: bop.id, charId: bop.charId, name: bop.name, position:bop.position, rangeGrids: bop.rangeGrids, isTrap: bop.isTrap, effectId: bop.effectId,isTactical:bop.isTactical,ownerUnitId:bop.ownerUnitId },
    x: sx, y: sy, row: bop.row, col: bop.col, dir: 'up', startX: scx, startY: scy, dragging:false, moved:false };
}
function startEquipDrag(uid, name, sx, sy, scx, scy) { drag = { phase:'drag', type:'equip', equipUid: uid, equipName: name, x: sx, y: sy, row:0, col:0, dir:'up', dragging:false, moved:false, startX: scx, startY: scy }; }
// 拖动场上已部署干员：移动到新位置后再确定朝向
// sx/sy 为棋盘像素坐标（已 unpoint）；scx/scy 为屏幕坐标（仅用于判定「是否拖离」，不受镜头倾斜影响）
function startMoveDrag(op, sx, sy, scx, scy) {
  drag = { phase:'drag', type:'move', op: { id: op.id, charId: op.charId, name: op.name, position:op.position, rangeGrids: op.rangeGrids,isTactical:op.isTactical,ownerUnitId:op.ownerUnitId },
    row: op.row, col: op.col, dir: op.dir || 'up', x: sx, y: sy, startX: scx, startY: scy, dragging:false, moved:false };
}

// 选中干员操作按钮：4×4 网格菱形，三条斜边中点放「撤离(左上)/售卖(右上)/技能(右下)」
function opButtons(o) {
  const cx = o.col*TILE + TILE/2, cy = o.row*TILE + TILE/2;
  const s = TILE*0.72;               // 按钮边长（适配图标）
  const k = TILE*0.95;               // 菱形斜边中点偏移（4×4：半对角线 2T 的斜边中点 ≈ 1T）
  const pos = (bx, by) => {
    // 夹紧到画布内，避免按钮落在画布外导致永远点不中
    const x = Math.max(s/2, Math.min(canvas.width - s/2, bx));
    const y = Math.max(s/2, Math.min(canvas.height - s/2, by));
    return { x: x - s/2, y: y - s/2, w: s, h: s, cx: x, cy: y };
  };
  return {
    retreat: pos(cx - k, cy - k),   // 左上：撤离
    sell:    pos(cx + k, cy - k),   // 右上：售卖
    skill:   pos(cx + k, cy + k),   // 右下：技能
  };
}

// 候选区干员/装备（未上场）的菱形操作盘：仅「出售」一个按钮，置于菱形正上方（4×4 扩展）
function benchButtons(cx, cy) {
  const s = TILE*0.62, k = TILE*0.95;
  const x = Math.max(s/2, Math.min(canvas.width - s/2, cx));
  const y = Math.max(s/2, Math.min(canvas.height - s/2, cy - k));
  return { sell: { x: x - s/2, y: y - s/2, w: s, h: s, cx: x, cy: y } };
}

// 文本按钮（如「出售」）：圆角红底 + 居中白字，dim=置灰（保留给通用场景）
function drawTextBtn(b, text, dim) {
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  const r = b.w*0.16;
  ctx.moveTo(b.x+r, b.y);
  ctx.arcTo(b.x+b.w, b.y, b.x+b.w, b.y+b.h, r);
  ctx.arcTo(b.x+b.w, b.y+b.h, b.x, b.y+b.h, r);
  ctx.arcTo(b.x, b.y+b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x+b.w, b.y, r);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold '+Math.round(b.h*0.42)+'px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text, b.cx, b.cy+1);
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.globalAlpha = 1;
}

// 六边形费用角标（参考商店资金 money-hex / 商店卡 cost-hex）：金色六边形边框 + 深色内衬 + 菱形金币 + 数字
function drawHexCoin(cx, cy, h, num) {
  const w = h * 1.7;
  const x = cx - w/2, y = cy - h/2;
  const hex = (px, py, pw, ph) => {
    ctx.beginPath();
    ctx.moveTo(px + pw*0.13, py);
    ctx.lineTo(px + pw*0.87, py);
    ctx.lineTo(px + pw, py + ph/2);
    ctx.lineTo(px + pw*0.87, py + ph);
    ctx.lineTo(px + pw*0.13, py + ph);
    ctx.lineTo(px, py + ph/2);
    ctx.closePath();
  };
  hex(x, y, w, h); ctx.fillStyle = '#ffd54f'; ctx.fill();                 // 金色外框
  hex(x+1.5, y+1.5, w-3, h-3); ctx.fillStyle = '#0d0f16'; ctx.fill();      // 深色内衬
  // 菱形金币
  const cr = h*0.27, ccx = x + w*0.32, ccy = cy;
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath(); ctx.moveTo(ccx, ccy-cr); ctx.lineTo(ccx+cr*0.8, ccy); ctx.lineTo(ccx, ccy+cr); ctx.lineTo(ccx-cr*0.8, ccy); ctx.closePath(); ctx.fill();
  // 数字
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(h*0.44) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(num, x + w*0.66, cy + 0.5);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// 售卖按钮：黄色方形出售图标 + 右上角六边形金币角标（+1 出售返还，参考商店资金样式）
function drawSellBtn(b, dim) {
  ctx.globalAlpha = dim ? 0.45 : 1;
  const cx = b.cx, cy = b.cy, s = Math.min(b.w, b.h);
  const x = cx - s/2, y = cy - s/2, r = s*0.16;
  const rr = (X,Y,W,H,R) => { ctx.beginPath(); ctx.moveTo(X+R,Y); ctx.arcTo(X+W,Y,X+W,Y+H,R); ctx.arcTo(X+W,Y+H,X,Y+H,R); ctx.arcTo(X,Y+H,X,Y,R); ctx.arcTo(X,Y,X+W,Y,R); ctx.closePath(); };
  // 黄色方形底
  const g = ctx.createLinearGradient(x, y, x, y+s);
  g.addColorStop(0, '#ffe082'); g.addColorStop(0.5, '#ffd54f'); g.addColorStop(1, '#f0a818');
  ctx.fillStyle = g; rr(x, y, s, s, r); ctx.fill();
  ctx.strokeStyle = '#b97e08'; ctx.lineWidth = 1.5; rr(x, y, s, s, r); ctx.stroke();
  // 中央 ¥ 符号
  ctx.fillStyle = '#5b3a00'; ctx.font = 'bold ' + Math.round(s*0.46) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('¥', cx - s*0.08, cy + s*0.03);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // 右上角六边形费用角标 +1
  drawHexCoin(cx + s*0.40, cy - s*0.40, s*0.44, '1');
  ctx.globalAlpha = 1;
}

// 技能按钮：真实技能图标（ui/skillicons/skill_icon_{prefabId}.png，未加载则回退图集 idx 27）+ 下方技力充能进度 sp/spCost
function drawSkillBtn(b, o, dim) {
  const usesLeft=window.ArkMedicSkills?.remaining(o);dim=dim||usesLeft===0;
  const sim = getSkillIcon(o.skill && o.skill.realIcon);
  if (sim && sim.complete && sim.naturalWidth > 0) {
    const scale = Math.min(b.w / sim.naturalWidth, b.h / sim.naturalHeight);
    const dw = sim.naturalWidth * scale, dh = sim.naturalHeight * scale;
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.drawImage(sim, b.cx - dw/2, b.cy - dh/2, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    drawBtnIcon(b, 27, null, dim);   // 图标未加载完成/无真实图标：回退通用图集图标
  }
  const spCost = (o.skill && o.skill.spCost) || 0;
  const sp = (o.sp != null) ? Math.floor(o.sp) : ((o.skill && o.skill.initSp) || 0);
  if (!spCost) return;
  ctx.globalAlpha = dim ? 0.45 : 1;
  const cx = b.cx, cy = b.cy;
  const ph = Math.max(12, b.h*0.34), pw = Math.max(ph, b.w*1.1);
  const py = cy + b.h*0.5 + 2;
  ctx.fillStyle = 'rgba(20,24,32,0.92)';
  const rr = (X,Y,W,H,R) => { ctx.beginPath(); ctx.moveTo(X+R,Y); ctx.arcTo(X+W,Y,X+W,Y+H,R); ctx.arcTo(X+W,Y+H,X,Y+H,R); ctx.arcTo(X,Y+H,X,Y,R); ctx.arcTo(X,Y,X+W,Y,R); ctx.closePath(); };
  rr(cx - pw/2, py, pw, ph, ph/2); ctx.fill();
  ctx.fillStyle = '#7fd8ff'; ctx.font = 'bold ' + Math.round(ph*0.58) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(usesLeft===0?'次数用尽':sp + '/' + spCost, cx, py + ph/2 + 0.5);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

function hitBtn(b, px, py) { return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; }

// 在按钮矩形 b 内绘制第 idx 个图集图标（保持纵横比缩放并居中）；label 为右下角徽章文字，dim 为置灰
function drawBtnIcon(b, idx, label, dim) {
  if (!UIAtlas || !UI_ATLAS || !UIAtlas.complete || UIAtlas.naturalWidth === 0) return;
  const c = UI_ATLAS[idx];
  if (!c) return;
  const scale = Math.min(b.w / c[2], b.h / c[3]);
  const dw = c[2] * scale, dh = c[3] * scale;
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.drawImage(UIAtlas, c[0], c[1], c[2], c[3], b.cx - dw/2, b.cy - dh/2, dw, dh);
  ctx.globalAlpha = 1;
  if (label != null) {
    const bx = b.x + b.w*0.76, by = b.y + b.h*0.76, r = b.h*0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(r*1.15) + 'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, bx, by + 0.5);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
}

// 朝向二次确认：撤退/取消按钮**左上**（西北边中点，与已部署干员的撤退按钮同位）
function facingButtons(cx, cy) {
  const s = TILE*0.8;
  const k = TILE*0.72;
  const x = Math.max(s/2, Math.min(canvas.width - s/2, cx - k));
  const y = Math.max(s/2, Math.min(canvas.height - s/2, cy - k));
  return {
    cancel: { x: x - s/2, y: y - s/2, w: s, h: s, cx: x, cy: y },   // 左上：撤退/取消
  };
}

function onClick(e) {
  if (!B) return;
  if (suppressClick) { suppressClick = false; return; }   // 拖拽刚完成，忽略紧随的 click（避免切到松手处干员的菱形面板）
  const [px, py] = boardXY(e);
  if (drag) {
    if (drag.phase === 'facing') {
      const fx = drag.col*TILE, fy = drag.row*TILE;
      const cx = fx + TILE/2, cy = fy + TILE/2, bd = TILE*2;
      const fb = facingButtons(cx, cy, bd);
      if (hitBtn(fb.cancel, px, py)) { drag = null; return; }   // 点击取消 → 放弃本次部署/移动
    }
    return;   // 拖拽期间的其它点击忽略
  }
  // 先检测「已选中干员」的操作按钮（按钮在菱形边上，可能位于干员格子外）；战斗中也显示菱形操作盘，但撤退/装备动作禁用
  if (selected != null) {
    const selDep = B.operators.find(o => o.id === selected && !o.dead);
    const selBench = selDep ? null : (B.bench || []).find(o => o.id === selected);
    const selOp = selDep || selBench;
    if (selOp&&!selOp.isTactical) {
      if (selDep) {
        const btns = opButtons(selDep);
        if (hitBtn(btns.retreat, px, py)) { if (B.phase === 'rest' && window.onOpRightClick) window.onOpRightClick(selDep.id); return; }   // 撤离（仅休整期）
        if (hitBtn(btns.sell, px, py)) { if (B.phase === 'rest' && window.onOpSell) window.onOpSell(selDep.id); return; }   // 售卖（仅休整期）
        if (hitBtn(btns.skill, px, py)) return;  // 技能禁用（自走棋自动释放）
      } else if (selBench) {
        const bb = benchButtons(selBench.col*TILE + TILE/2, selBench.row*TILE + TILE/2);
        if (hitBtn(bb.sell, px, py)) { if (B.phase === 'rest' && window.onBenchSell) window.onBenchSell(selBench.id); return; }   // 出售（仅休整期）
      }
    }
  }
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  const lv = BDATA.level;
  // 预览视图（A 区怪物预览块）下：点击任意位置都退出预览，回到玩家半区（I-20260902-016）
  if (typeof window !== 'undefined' && window.__preview) {
    window.__preview = false; window.__viewRect = null;
    window.viewMode = 0;   // 回到玩家左半区
    return;   // 预览模式点击即退出，不继续处理其它点击
  }
  if (row < 0 || col < 0 || row >= lv.rows || col >= lv.cols) {
    if (selected != null && window.onTileClick) window.onTileClick(row, col);   // 点出棋盘：关闭选中干员界面
    return;
  }
  const op = B.operators.find(o => o.row===row && o.col===col && !o.dead);
  const token=(B.summoneds||[]).find(s=>s.row===row&&s.col===col&&!s.removed&&(!s.dead||s.tacticalDormant));
  if(token){window.onTacticalSelect?.(token);return;}
  if (op) {
    // 点击干员（休整/战斗）都要弹出左侧立绘详情面板
    if (window.onOpClick) window.onOpClick(op.id);
    else setSelected(op.id);
  } else {
    const bop = (B.bench || []).find(o => o.row===row && o.col===col);
    if (bop) {
      if (bop.type === 'equip') { if (window.onEquipBenchClick) window.onEquipBenchClick(bop.id); }
      else if (window.onBenchClick) window.onBenchClick(bop.id);
      else setSelected(bop.id);
    } else {
      // 点空格：关闭选中与详情面板（休整/战斗一致）
      if (window.onTileClick) window.onTileClick(row, col);
      else if (selected != null) setSelected(null);
    }
  }
}

function onRightClick(e) {
  e.preventDefault();
  if (!B) return;
  const [px, py] = boardXY(e);
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  if (row < 0 || col < 0) return;
  const token=(B.summoneds||[]).find(s=>s.row===row&&s.col===col&&!s.removed);
  if(token){window.onTacticalSelect?.(token);window.tacticalTokenAction?.('retreat');return;}
  if(B.phase!=='rest')return;
  const op = B.operators.find(o => o.row===row && o.col===col && !o.dead);
  if (op && window.onOpRightClick) window.onOpRightClick(op.id);
}

function drawEliteFrame(x,y){
  ctx.save();ctx.strokeStyle='#ffd34f';ctx.lineWidth=2.5;ctx.shadowColor='#ffba24';ctx.shadowBlur=9;
  ctx.strokeRect(x+2,y+2,TILE-4,TILE-4);ctx.restore();
}
function isDeployable(row, col, op=null) {
  const lv = BDATA.level;
  if (!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=lv.rows||col<0||col>=lv.cols) return false;
  const b = lv.buildable[row][col];   // build_levels 已把功能格(tile_achand/tile_acshop)的 buildable 置为 NONE，数据层干净
  const position=op?.entry?.position||op?.position;
  return b==='ALL' || (['MELEE','RANGED'].includes(b) && (!op || position===b || position==='ALL'));
}
// 落点颜色与松手使用同一个查询；移动/交换不占新增部署名额。
function canDropOperator(d, row, col) {
  if(!d?.op)return false;
  if(window.onCanDeploy)return !!window.onCanDeploy(row,col,d.op,d.type==='move');
  if(!isDeployable(row,col,d.op.isTrap?null:d.op))return false;
  const other=B.operators.find(o=>o.id!==d.op.id&&o.row===row&&o.col===col&&!o.dead);
  if(!other)return true;
  const from=B.operators.find(o=>o.id===d.op.id);
  return d.type==='move'&&!!from&&isDeployable(from.row,from.col,other);
}
// 候选区是关卡数据明确标记的 tile_achand 特殊部署位；禁止把任意底行格猜作候选位。
function isBenchSlot(row, col) {
  const lv = BDATA.level;
  return !!(lv && row>=0 && row<lv.rows && col>=0 && col<lv.cols && lv.grid[row] && lv.grid[row][col] === 'tile_achand');
}
// 敌人出生必须落在地图红门(tile_start)上：把出生点吸附到最近的 tane_start 格（否则会在黑格凭空出现）
function nearestSpawnCell(r, c) {
  const lv = BDATA.level;
  let best = null, bd = Infinity;
  for (let rr=0; rr<lv.rows; rr++) for (let cc=0; cc<lv.cols; cc++) {
    if (lv.grid[rr][cc] !== 'tile_start') continue;
    const d = (rr-r)*(rr-r) + (cc-c)*(cc-c);
    if (d < bd) { bd = d; best = { r: rr, c: cc }; }
  }
  return best || { r, c };
}

// boss 战（__bossBattle）出怪兜底：当前三段式关卡的 C 区无 tile_start(红门)、也无现成 routes（routes 全部起点在 B 区 6/9 行）。
// 为使敌人确实出现在 C 区并冲向 C 区蓝门，这里生成一条「C 区内的临时路线」。属地图驱动兜底，非原版精确数值，待真实 boss 关数据后替换。
function bossRouteFor(routeIdx) {
  if (!BDATA || !BDATA.level) return null;
  const lv = BDATA.level;
  if (!BDATA._bossRoutes) BDATA._bossRoutes = {};
  if (BDATA._bossRoutes[routeIdx]) return BDATA._bossRoutes[routeIdx];
  const zr = (window.modeBattleZoneRows && window.modeBattleZoneRows(lv)) || null;
  const lb = zr ? zr.lb : 0, rb = zr ? zr.rb : lv.rows;
  const colsW = lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols;
  // 块内蓝门作为终点；无蓝门则回退到块底中部
  let end = null;
  for (let r = lb; r < rb; r++) for (let c = 0; c < lv.cols; c++) { if (lv.grid[r][c] === 'tile_end') { end = { r, c }; break; } if (end) break; }
  if (!end) end = { r: rb - 1, c: Math.min(lv.cols - 1, Math.floor(colsW / 2)) };
  const midC = Math.max(0, Math.min(lv.cols - 1, Math.floor(colsW / 2)));
  const via = { r: Math.floor((lb + end.r) / 2), c: Math.floor((midC + end.c) / 2) };
  const start = { r: lb, c: midC };
  BDATA._bossRoutes[routeIdx] = { segs: [ [start, via, end] ] };
  return BDATA._bossRoutes[routeIdx];
}

// 用户约定：本轮领袖被击败即胜利，不再等待小怪、后续波次或残留弹道。
// 在 update 的伤害阶段之间收尾，避免结算切换 B 后仍继续推进旧战场。
function finishDefeatedLeader() {
  const leader=B?.leader;
  if (!B || B.over || !B.leaderEnemyId || !leader || !(leader.hp<=0)) return false;
  if (!leader.dead) killEnemy(leader);
  if (!leader.dead || leader.hp>0) return false;   // 既有复活阶段仍须打完
  B.enemies=B.enemies.filter(e=>!e.dead);   // 保留 B.leader 的零血记录，移除已死亡实体
  B.over=true;B.win=true;B.endReason='leader-defeated';
  if(window.onBattleEnd)window.onBattleEnd(true,B.shield);
  return true;
}
function update(dt, realDt) {
  if (!B || B.over || B.phase !== 'battle') return;
  window.ArkEnemyPassives?.sync(B);
  if (finishDefeatedLeader()) return;
  B.time += dt; B.roundTime = (B.roundTime || 0) + (realDt != null ? realDt : dt);
  window.ArkTacticalSpecials?.advanceStatusClocks(dt);
  if ((B.dp||0) >= (B.dpMax??Infinity)) { B.dp=B.dpMax; B.dpProgress=0; }
  else {
    let remaining=dt;
    while(remaining>1e-9&&B.dp<(B.dpMax??Infinity)){
      const interval=(B.dpInterval||1)*(B.dp<0?2:1),need=(1-(B.dpProgress||0))*interval;
      if(remaining+1e-9<need){B.dpProgress=(B.dpProgress||0)+remaining/interval;break;}
      remaining=Math.max(0,remaining-need);B.dp=Math.min(B.dpMax??Infinity,B.dp+1);B.dpProgress=0;
    }
  }
  if(window.ArkEnemyDeathSpawn){
    const {due,waiting}=window.ArkEnemyDeathSpawn.takeDue(B.enemyDeathSpawns,B.time);B.enemyDeathSpawns=waiting;
    for(const event of due)spawnEnemyAt(event.enemyId,event.parent,window.ArkEnemyDeathSpawn.fallback(event.enemyId));
  }
  if(B.waveScheduler) B.spawn.push(...window.ArkWaves.advance(B.waveScheduler,B.time,(wave,fragment,blocking)=>
    B.enemies.some(e=>!e.dead&&e.sourceWave===wave&&(fragment==null?!e.dontBlockWave:e.sourceFragment===fragment&&(!blocking||e.blockFragment)))||
    window.ArkEnemyDeathSpawn?.waitingIn(B.enemyDeathSpawns,wave,fragment,blocking)));
  while (B.spawn.length && B.spawn[0].at <= B.time) {
    const s = B.spawn.shift();
    const base = BDATA.enemies[s.enemyId];
    if (base) {
      const bos = (window.__bossBattle && window.modeBattleZoneRows && !BDATA.level.sourceRoutes) ? bossRouteFor(s.route) : null;
      const rt0 = bos || BDATA.level.routes[s.route];
      const seg0 = (rt0 && rt0.segs && rt0.segs[0]) ? rt0.segs[0] : [{ r: 0, c: 0 }];
      const raw = seg0[0] || { r: 0, c: 0 };
      const start = (bos || BDATA.level.sourceRoutes) ? { r: raw.r, c: raw.c } : nearestSpawnCell(raw.r, raw.c);
      const en = { ...base, route: s.route, seg: 0, cp: 0, x: start.c, y: start.r, hp: base.maxHp, cd: 0, wait: 0, dead: false, flying: !!(base.flying || s.flying), atkPhase: null, atkTimer: 0, atkTotal: 0, atkTarget: null };
      if(s.enemyId===B.leaderEnemyId)B.leader=en;
      if (s.hpOverride!=null) { en.maxHp = s.hpOverride; en.hp = s.hpOverride; }
      if (s.atkOverride!=null) en.atk = s.atkOverride;
      if (s.defOverride!=null) en.def = s.defOverride;
      if (s.moveSpeed!=null) en.moveSpeed = s.moveSpeed;
      en.visualId=(B.visualSequence=(B.visualSequence||0)+1);
      en.sourceWave=s.wave;en.sourceFragment=s.fragment;en.blockFragment=s.blockFragment;en.dontBlockWave=s.dontBlockWave;
      en.bountyCoin=s.bountyCoin;
      applySourceEnemyModifiers(en);
      // 敌人天赋/技能（被动 + 主动）
      setupEnemy(en, base);
      B.enemies.push(en);
    }
  }
  window.ArkElements?.update(dt);
  window.ArkMedicSkills?.update();
  if (finishDefeatedLeader()) return;
  for (const o of B.operators) {
    o.blocked = 0;
    if (o.deployAt != null && o.deployAt > B.time) continue;
    if(!o.dead&&!o._garrisonStarted){o._garrisonStarted=true;window.onBondGarrison?.('deploy',o);window.ArkSkillModes?.deployed?.(o,false);}
    o.cd -= dt; o.deployT = (o.deployT||0) + dt;
    if (!o.dead && o.burnUntil && o.burnUntil > B.time) {
      inflictDamage(o,Math.max(1, Math.round(o.maxHp * (o.burnRate || 0.05) * dt)));
      if (o.hp <= 0) tryKill(o);
    }
  }
  // 部署完成触发（onDeploy）：deployT 达 1 时施放 deploy 事件
  for (const o of B.operators) {
    if (o.dead || o.deployed || (o.deployT||0) < 1) continue;
    o.deployed = true;
    window.ArkSkillModes?.deployed?.(o,true);
    window.ArkCommonSkills?.deployed(o);
    window.ArkTacticalSpecials?.operatorDeployed(o);
    emitBattleSfx('b_char_set');
    const r = (o.range||1) + 1;
    applyEvents(o, 'deploy', B.enemies.filter(e => !e.dead && dist(o,e) <= r), B.operators.filter(a => !a.dead && dist(o,a) <= r));
  }
  window.ArkTactician?.advance(dt);
  // 技能充能与自动释放
  for (const o of B.operators) {
    if (finishDefeatedLeader()) return;
    if (o.buffs) o.buffs = o.buffs.filter(b => b.until > B.time);   // 所有干员的 buff 都随时间过期
    if(o.garrisonStats?.expires!=null&&B.time>=o.garrisonStats.expires)window.onBondGarrison?.('expire',o);
    if(!o.dead&&o.deployed&&o.garrisonStats?.hpRegen)o.hp=Math.min(o.maxHp,o.hp+o.garrisonStats.hpRegen*dt);
    window.ArkDollkeeper?.advance(o,dt);
    const lockedTime = Math.max(o.skillState&&!window.ArkSkillToggle?.active(o) ? Math.max(0, Math.min(dt, o.skillState.until - (B.time - dt))) : 0,
      window.ArkDirectSkills?.spLockTime?.(o,B.time-dt,B.time)||0);
    window.ArkCommonSkills?.advance(o,B.time);
    window.ArkMystic?.advance(o,B.time);
    window.ArkClientPrograms?.advance(o,B.time,dt,healOperator);
    if (o.skillState && o.skillState.until <= B.time + 1e-9) endOperatorSkill(o,'expire');
    window.ArkClientPrograms?.tick(o,B.time);
    if (o.dead || !o.skill || o.skill.isPassive || o.deployAt > B.time) continue;
    gainOperatorSp(o, 'INCREASE_WITH_TIME', Math.max(0,dt-Math.max(lockedTime,o.elementSpLockTime||0,o._dollSpLockTime||0)) * ((o.skill.spIncrement == null ? 1 : o.skill.spIncrement)+(o.garrisonStats?.spRegen||0)+(window.ArkMedicSkills?.naturalSpBonus(o)||0)));
    if (operatorCanAct(o)&&!o.skillState && o.skill.spCost > 0 && o.sp >= o.skill.spCost && (!window.ArkOperatorCombat||window.ArkOperatorCombat.canCast(o))) castSkill(o);
  }

  if (finishDefeatedLeader()) return;
  window.ArkSkillAuras?.update();
  window.ArkEnemyAuras?.update(dt,{time:B.time,enemies:B.enemies,targets:[...B.operators,...(B.summoneds||[])],damage:performEnemyAuraDamage});
  updateSupportRecovery(dt);
  window.ArkOperatorCombat?.update(dt);
  window.ArkDirectSkills?.update(dt);
  for(const enemy of B.enemies)window.ArkEnemyHover?.refresh(enemy,B.time);
  window.ArkOperatorCombat?.assignBlocks();
  window.ArkSkillBlockees?.update();
  for(const enemy of B.enemies)refreshEnemyModeProviders(enemy);
  window.ArkElementOperators?.update(dt);
  for (const o of B.operators) {
    if (finishDefeatedLeader()) return;
    if (!operatorCanAct(o) || o.cd > 0) continue;
    const profile=operatorAttackProfile(o),action=operatorAction(o);
    if(action==='none')continue;
    if(action==='heal'){performHealingAction(o);continue;}
    if(window.ArkOperatorCombat){window.ArkOperatorCombat.attack(o);continue;}
    // 普攻起手仅按实际范围格判定；已发射弹道可继续追踪原目标。
    const inRange = B.enemies.filter(e => !e.dead && !(e.invisibleUntil && e.invisibleUntil > B.time) && (
      ((o.position === 'RANGED' || !e.flying) && enemyInBasicAttackRange(o,e))
    ));
    if (!inRange.length) continue;
    const t = inRange.sort((a,b) => dist(o,a)-dist(o,b))[0];
    const bm = buffMul(o);
    const front={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[o.dir||'up'];
    const critChance=o.attackCrit?.frontProbability!=null&&enemyOccupiesCell(t,o.row+front[0],o.col+front[1])?o.attackCrit.frontProbability:(o.skillState?o.attackCrit?.skillProbability:o.attackCrit?.probability);
    const critical=!!(o.attackCrit&&gameRandom()<critChance);
    const targets=profile?.kind==='rangeAll'?inRange:critical&&o.attackCrit.extraTarget?inRange.slice(0,2):[t];
    o.cd = o.attackTime / bm.aspd;
    // 攻击触发事件（onAttack）：每次攻击按概率施放
    applyEvents(o, 'attack', [t], B.operators.filter(a => !a.dead));
    // 攻击：远程发射弹道（命中时结算伤害）；近战瞬时结算并给出命中点的短促粒子反馈。
    o.atkAnimAt = B.time;   // 记录攻击时刻，供渲染「抬手」左右摇摆
    for(const target of targets)for(let hit=0;hit<(profile?.hits||1);hit++){
    if(target.dead)break;
    const raw=operatorAttackPower(o,critical?buffMul(o,0,o.attackCrit.attackBonus||0).atk:bm.atk)*(critical?(o.attackCrit.scale||1):1);
    const {amount:dmg,type:damageType}=calcDamageResult(o,target,1,{raw});
    if (o.position === 'RANGED' && profile?.kind!=='rangeAll') {
      const kind = (o.atkType === 'arts') ? 'orb' : 'arrow';   // 法术=光球，物理=箭矢（音频数据存在 projectile_magic_ball / projectile_arrow）
      spawnProjectile({ sx: o.col, sy: o.row, x: o.col, y: o.row, tx: target.x, ty: target.y, target, owner: o, enemy: false, basicAttack:true, dmg, damageType, critical, criticalStun:critical?o.attackCrit.stun:0, speed: PROJECTILE_SPEED, life: 6, kind });
    } else {
      const actual=hitEnemy(o, target, dmg,critical,damageType);
      onBasicAttackHit(o,target,actual);
      if(critical&&o.attackCrit.stun&&!target.dead)target.stunUntil=Math.max(target.stunUntil||0,B.time+o.attackCrit.stun);
    }
    }
    gainOperatorSp(o, 'INCREASE_WHEN_ATTACK', 1);
    consumeOperatorAmmo(o);
  }

  // —— 召唤物（B.summoneds）：自动攻击最近敌人，按 life 存续，死亡移除 ——
  if (finishDefeatedLeader()) return;
  for (const s of B.summoneds || []) {
    if (finishDefeatedLeader()) return;
    if (s.dead) continue;
    if(s.medicDrone){window.ArkMedicDrone.advance(s);continue;}
    if(s.obelisk){s.life=Math.max(0,s.expiresAt-B.time);if(s.life<=0){s.dead=true;window.ArkEnemyCold?.clear(s);}continue;}
    if(!s.tacticalToken)s.life = s.freeling?Math.max(0,s.expiresAt-B.time):(s.life == null ? 0 : s.life - dt);
    if (!s.tacticalToken && s.life <= 0) { s.dead = true; window.ArkEnemyCold?.clear(s); continue; }
    if(s.canAttack===false||!operatorCanAct(s))continue;
    s.cd = (s.cd || 0) - dt;
    if (s.cd > 0) continue;
    if(s.paperToken||s.tacticalToken||s.freeling){window.ArkOperatorCombat.attack(s);continue;}
    const inRange = B.enemies.filter(e => !e.dead && !(e.invisibleUntil && e.invisibleUntil > B.time) && enemyInBasicAttackRange(s,e));
    if (!inRange.length) continue;
    const t = inRange.sort((a, b) => dist(s, a) - dist(s, b))[0];
    const {amount:dmg,type:damageType}=calcDamageResult(s,t,1);
    s.cd = (s.attackTime || 1)/buffMul(s).aspd;
    if (s.position === 'RANGED') {
      const kind = (s.atkType === 'arts') ? 'orb' : 'arrow';
      spawnProjectile({ sx: s.col, sy: s.row, x: s.col, y: s.row, tx: t.x, ty: t.y, target: t, owner: s, enemy: false, dmg, damageType, speed: PROJECTILE_SPEED, life: 6, kind });
    } else { hitEnemy(s, t, dmg,false,damageType); }
  }

  if (finishDefeatedLeader()) return;
  for (const e of B.enemies) {
    if (finishDefeatedLeader()) return;
    if (e.dead) continue;
    window.ArkEnemyPreAttack?.observe(e,{blocked:!!window.ArkOperatorCombat?.blockerOf(e),
      interrupted:enemyActionInterrupted(e)});
    // Passive source-mode conditions continue through stun/freeze. Their Buff
    // flags are checked by the importer; they are not enemy action timers.
    refreshEnemyModeProviders(e);
    window.ArkEnemySkills?.tick(e,dt,{spRecoveryStopped:!!e.spRecoveryStopped});
    window.ArkEnemySkillLifecycle?.tick(e,dt,{time:B.time,
      unbalanced:e.unbalanced===true||e.sourceEnemyState===9||e.sourceEnemyState==='UNBALANCE'});
    advanceEnemyPeriodic(e,dt);
    if(e.dead){if(finishDefeatedLeader())return;continue;}
    // 灼燃元素异常：持续真实伤害（不受麻痹影响）
    if (e.burnUntil && e.burnUntil > B.time) {
      inflictDamage(e,Math.max(1, Math.round(e.maxHp * (e.burnRate || 0.06) * dt)),false,'true');
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    if (enemyActionInterrupted(e)) {
      if(e.atkSchedule?.selectiveAttack||e.atkSchedule?.attachedProjectile||window.ArkSkillBlockees?.stunned(e,B.time))finishEnemyAttack(e);
      continue;
    }
    const unitDt=dt*(window.ArkTacticalSpecials?.tempo(e)??1),attackDt=unitDt*(window.ArkHunter?.enemyTempo(e,B.time)??1);
    if (advanceEnemyBomb(e,dt,attackDt)) continue;
    const bossCasts=window.ArkBossMechanics?.advanceSkills(e,dt,{candidates:B.operators.filter(o=>!o.dead&&o.deployAt<=B.time&&(o.deployT||0)>=1),
      defenseOf:operatorDefense,random:gameRandom,canCast:!e.atkPhase&&e.cd<=0})||[];
    if(bossCasts.length){
      for(const cast of bossCasts)(B.bossSkillEvents||=[]).push({...cast,owner:e,baseAtk:e.atk,at:B.time+cast.damageDelay});
      e.cd=e.attackTime||1.6;e.atkAnimAt=B.time;
      continue;
    }
    // 敌人技能冷却 + 施放（主动技能）
    if (e.skill && e.skillCd != null&&!window.ArkEnemySkills?.ownsLegacy(e,e.skill)) {
      e.skillCd -= dt; // Per-skill use of the slow-down clock needs source evidence.
      if (e.skillCd <= 0) { castEnemySkill(e); e.skillCd = e.skill.cooldown || 5; }
    }
    // Attack animation occupies the unit; its source duration is independent of
    // the attack interval. After it finishes, unblocked units walk during the
    // remaining cooldown. Long attack intervals must not stretch this lock.
    // A melee enemy can carry a radius for a talent/explosion; it is not a ranged basic attack.
    const rangeR = e.applyWay==='MELEE'?0:Math.max(0,e.rangeRadius??0);
    const reachR = rangeR > 0 ? rangeR + 0.5 : 0.5;
    // 计算本轮「目标/阻挡者」：远程取射程内、近战取接触范围内；供停下与攻击判定使用
    const physicalBlocker=window.ArkOperatorCombat?.blockerOf(e)||null;
    let blocker = physicalBlocker;
    const attackCandidates=[...B.operators,...(B.summoneds||[])];
    // The physical blocker stays first. Unblocked ranged attacks consume the
    // same live hatred attribute as source-selected enemy abilities. Equal
    // priorities retain the existing stable board order in this model.
    if(rangeR>0&&!physicalBlocker)attackCandidates.sort((a,b)=>
      (window.ArkClientPrograms?.targetPriority(b,B.time)??b.tauntLevel??b.sourceAttributes?.tauntLevel??0)-
      (window.ArkClientPrograms?.targetPriority(a,B.time)??a.tauntLevel??a.sourceAttributes?.tauntLevel??0));
    for (const o of attackCandidates) {
      if(blocker)break;
      if(window.ArkOperatorCombat&&rangeR<=0)continue;
      if(window.ArkEnemySkills?.validTarget){if(!window.ArkEnemySkills.validTarget(o,B.time))continue;}
      else if(o.dead||o.untargetable||o.deployAt>B.time)continue;
      const bc = operatorBlockCount(o);
      if (rangeR <= 0 && (e.unblockable || e.flying || bc <= 0 || o.blocked >= bc)) continue;   // 飞行/不可阻挡单位不占用阻挡位
      if (rangeR>0?Math.hypot(e.x-o.col,e.y-o.row)<=reachR:touchesOperatorTile(o,e.x,e.y)) { blocker = o; break; }
    }
    if (!window.ArkOperatorCombat&&blocker && !e.flying && rangeR <= 0) blocker.blocked++;
    // This source group has only an attack root and global selectors. Its
    // negative radius and a physical blocker must not invent a combat root.
    const attackChannel=window.ArkEnemySelectiveAttacks?.enabled(e,'attack')?'attack':physicalBlocker||rangeR<=0?'combat':'attack';
    // A new blocker changes the next cast's channel, not the locked cast.
    const activeChannel=e.atkPhase&&e.atkSchedule?.channel||attackChannel;
    const canBasicAttack=window.ArkExternalCombat?.canAttack(e,{channel:activeChannel})??e.canAttack!==false;
    if(!canBasicAttack&&!e.atkSchedule?.skillId)finishEnemyAttack(e);
    if (e.atkPhase) {
      if(e.atkSchedule?.kind==='self-animation'){
        const previousMode=e.externalCombatMode;
        window.ArkEnemySkills?.advanceSelf(e,e.atkSchedule.affectedBySlowDown?attackDt:dt);
        if(e.externalCombatMode!==previousMode)advanceEnemyPeriodic(e,0);
        continue;
      }
      // —— 攻击动作进行中（前摇→命中→后摇）：锁定，不移动，仅推进动画 ——
      const targets = e.atkTargets||[e.atkTarget];
      const castDt=['selector-cooldown-area-melee','selector-sp-tagged-ranged','selector-sp-multi-melee'].includes(e.atkSchedule?.skillKind)?
        (e.atkSchedule.affectedBySlowDown?unitDt:dt):attackDt;
      e.atkTimer -= castDt;
      if(!e.atkSchedule?.skillId)e.cd=(e.cd||0)-attackDt; // 技能占用动作期间保留普通攻击冷却。
      if(e.atkPhase==='projectile')continue; // Released projectile owns its clock and completion edge.
      if(window.ArkElements?.interruptAttack(e)){finishEnemyAttack(e);continue;}
      if(e.atkSchedule?.hitOffsets){
        const schedule=e.atkSchedule;
        schedule.elapsed+=castDt;
        // A large frame may cross several source events. The cursor is saved
        // with the cast so restoring mid-combo neither skips nor repeats hits.
        while(!e.dead&&e.hp>0&&e.atkSchedule===schedule&&!schedule.skillFinished&&
              schedule.nextHit<schedule.hitOffsets.length&&schedule.hitOffsets[schedule.nextHit]<=schedule.elapsed+1e-9){
          schedule.nextHit++;
          performEnemyBasicHit(e,targets,rangeR);
        }
        if(e.dead||e.atkSchedule!==schedule)continue;
        if(schedule.skillFinished){finishEnemyAttack(e);continue;}
        const pending=schedule.nextHit<schedule.hitOffsets.length;
        e.atkPhase=pending?'windup':'recover';
        e.atkTimer=Math.max(0,(pending?schedule.hitOffsets[schedule.nextHit]:schedule.total)-schedule.elapsed);
        if(schedule.elapsed>=schedule.total){
          finishEnemyAttack(e);
        }
        continue;
      }
      if (e.atkPhase === 'windup' && e.atkTimer <= 0) {
        const validTargets=performEnemyBasicHit(e,targets,rangeR);
        if(e.atkSchedule?.pendingProjectiles>0){e.atkPhase='projectile';e.atkTimer=0;continue;}
        e.atkPhase=validTargets.length?'strike':'recover';
        e.atkTimer=e.atkTotal*(validTargets.length ? .10 : .35);
        if(e.atkSchedule){
          e.atkPhase=e.atkSchedule.strike>0&&validTargets.length?'strike':'recover';
          e.atkTimer=e.atkPhase==='strike'?e.atkSchedule.strike:e.atkSchedule.recovery;
        }
      } else if (e.atkPhase === 'strike' && e.atkTimer <= 0) {
        e.atkPhase = 'recover'; e.atkTimer = e.atkSchedule?.recovery??e.atkTotal * 0.35;
      } else if (e.atkPhase === 'recover' && e.atkTimer <= 0) {
        finishEnemyAttack(e);   // 动作结束：恢复移动；cd 已在攻击期间倒计时。
      }
      continue;   // 攻击动作期间不移动
    }
    // —— 未攻击：范围内有目标且攻击间隔转好 → 进入前摇(抬手)，本帧即锁定 ——
    let bossTargets=null;
    if(e.bossMechanics&&e.cd<=0){
      bossTargets=window.ArkBossMechanics.selectAttackTargets(e,B.operators.filter(o=>!o.dead&&o.deployAt<=B.time&&(o.deployT||0)>=1&&Math.hypot(e.x-o.col,e.y-o.row)<=reachR),{random:gameRandom,defenseOf:operatorDefense});
      if(bossTargets)blocker=bossTargets[0]||null;
    }
    const sourceSkill=window.ArkEnemySkills?.start(e,{time:B.time,interval:e.attackTime||1.6,
      skillAttackInterval:(e.attackTime||1.6)/(window.ArkHunter?.enemyTempo(e,B.time)??1),
      channel:attackChannel,blocker:physicalBlocker,candidates:[...B.operators,...(B.summoneds||[])],
      silenced:e.silenced===true||e.silenceUntil>B.time,normalAttackReady:e.cd!=null&&e.cd<=0});
    if(sourceSkill){
      e.atkSchedule=sourceSkill.schedule;e.atkTargets=sourceSkill.targets;e.atkTarget=sourceSkill.targets[0];
      e.atkPhase='windup';e.atkTotal=sourceSkill.schedule.total??(e.attackTime||1.6);e.atkTimer=sourceSkill.schedule.windup;e.atkAnimAt=B.time;
      continue;
    }
    const ordinaryProvider=window.ArkEnemyAttachedProjectiles?.enabled(e,attackChannel)?window.ArkEnemyAttachedProjectiles:window.ArkEnemySelectiveAttacks;
    const selective=ordinaryProvider?.enabled(e,attackChannel);
    if(selective&&canBasicAttack&&e.cd!=null&&e.cd<=0){
      const at=e.attackTime||1.6;
      const cast=ordinaryProvider.start(e,{...enemySelectiveContext(),interval:at,channel:attackChannel});
      if(cast){
        e.atkSchedule=cast.schedule;e.atkTargets=cast.targets;e.atkTarget=cast.targets[0];
        e.atkPhase='windup';e.atkTotal=cast.schedule.total;e.atkTimer=cast.schedule.windup;e.atkAnimAt=B.time;e.cd=at;
        continue;
      }
    }
    if (!selective && canBasicAttack && blocker && e.cd != null && e.cd <= 0 && (blocker.deployT || 0) >= 1) {
      const at = e.attackTime || 1.6;
      e.atkSchedule=window.ArkExternalCombat?.attackTiming(e,at,{channel:attackChannel})||null;
      e.atkPhase = 'windup'; e.atkTarget = blocker; e.atkTotal = at; e.atkTimer = e.atkSchedule?.windup??at * 0.30;
      e.atkTargets=bossTargets;
      e.atkAnimAt = B.time;   // 记录前摇(抬手)时刻，供渲染左右摇摆
      e.cd = at;   // 攻击间隔从本次攻击起始计，动作期间继续倒计时
      continue;
    }
    e.cd = (e.cd || 0) - attackDt;   // 移动期间慢慢积蓄攻击间隔
    if(window.ArkBossMechanics?.stationary(e))continue;
    // —— 地面阻挡：被挡在接触距离时无法再前进，站桩等待下一次攻击（cd 已在上面累积）——
    if (window.ArkOperatorCombat?.blockerOf(e)||blocker && !e.flying && rangeR <= 0) continue;
    const bos = (window.__bossBattle && window.modeBattleZoneRows && !BDATA.level.sourceRoutes) ? bossRouteFor(e.route) : null;
    const rt = bos || BDATA.level.routes[e.route]; if (!rt || !rt.segs) continue;
    if (e.wait > 0) { e.wait -= dt; continue; }                 // 停留（WAIT_FOR_SECONDS）
    if(window.ArkMystic?.rooted(e)||e.flowRootUntil>B.time)continue; // Root stops walking, not route wait/attack/skill clocks or blocking.
    if(window.ArkEnemySkillLifecycle?.canMove(e)===false)continue;
    const seg = rt.segs[e.seg]; if (!seg) { e.dead = true; leak(e); continue; }
    const target = seg[e.cp];
    if (!target) {                                              // 本段走完
      if (e.seg + 1 < rt.segs.length) {                         // 传送/进入下一段（瞬间位移，不连线）
        e.seg++; e.cp = 0; const ns = rt.segs[e.seg];
        if (ns && ns[0]) { e.x = ns[0].c; e.y = ns[0].r; }
        continue;
      }
      e.dead = true; leak(e); continue;                         // 到达终点漏怪
    }
    const tx = target.c, ty = target.r;
    const cx = e.x ?? tx, cy = e.y ?? ty;
    const modeSpeed=window.ArkExternalCombat?.attribute(e,'moveSpeed',e.moveSpeed)??e.moveSpeed;
    const slowMultiplier=(e.slowUntil && e.slowUntil > B.time)?(e.slowFactor||1):1;
    let spd=modeSpeed*Math.min(slowMultiplier,window.ArkOperatorCombat?.movementMultiplier?.(e)??1);
    spd*=window.ArkTacticalSpecials?.tempo(e)??1;
    if(e.bombDropped)spd*=enemyBombParameters(e)?.moveMultiplier??1;
    if (e.moveBoostUntil && e.moveBoostUntil > B.time) spd *= (e.moveBoost || 1);
    const dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy), step = spd * dt;
    const travel=d>0?Math.min(1,step/d):0;
    if(window.ArkOperatorCombat?.moveToContact(e,cx+dx*travel,cy+dy*travel))continue;
    if (d <= step) {
      e.x = tx; e.y = ty;
      if (target.wait && target.wait > 0) e.wait = target.wait;
      e.cp++;
      // 兜底：踩到蓝门(tile_end)即视为漏怪（保护目标被突破），即使路线数据里蓝门出现在中段/末尾分段错误，也按蓝门判定而非紫门消失
      if (!BDATA.level.sourceRoutes && BDATA.level.grid[ty] && BDATA.level.grid[ty][tx] === 'tile_end') { e.dead = true; leak(e); continue; }
    } else { e.x = cx + dx / d * step; e.y = cy + dy / d * step; }
  }

  if (finishDefeatedLeader()) return;
  resolveBossSkillEvents();
  // 弹道飞行：追踪目标，命中的那一帧才结算伤害并生成黑灰粒子
  window.ArkSkillAuras?.update();
  for (const p of B.projectiles) {
    if(p.life<=0)continue;
    if(p.kind==='death-cold'){
      if(B.time+1e-9>=p.resolveAt){resolveDeathCold(p);p.life=0;}
      continue;
    }
    if(p.kind==='operator-pulse'){
      if(p.plan?.sourceModeHeal){
        if(!sourceHealingSourceValid(p)){
          if(p.owner?.sourceHealAction?.epoch===p.plan.sourceModeHeal.ownerEpoch)delete p.owner.sourceHealAction;
          p.life=0;continue;
        }
        if(B.time+1e-9>=p.resolveAt){finishSourceHealing(p);p.life=0;}
        continue;
      }
      if(B.time+1e-9>=p.resolveAt){window.ArkOperatorCombat?.impact(p);p.life=0;}
      continue;
    }
    if(p.kind==='bomb'){
      const progress=Math.min(1,Math.max(0,(B.time-p.launchedAt)/p.flightTime));
      p.x=p.sx+(p.tx-p.sx)*progress;p.y=p.sy+(p.ty-p.sy)*progress;
      if(progress>=1){resolveEnemyBomb(p);p.life=0;}
      continue;
    }
    if(p.enemyActionPacket){
      if(p.enemyActionPacket.provider==='enemy-attached-projectiles')advanceEnemyAttachedProjectile(p,dt);
      else advanceEnemySelectiveProjectile(p,dt);
      if(finishDefeatedLeader())return;
      continue;
    }
    // 本地单目标追踪约定：失去原目标后飞向最后位置并消散，不转而伤害邻近单位。
    const friendlyTarget=p.enemy||p.plan?.replacementHeal;
    if(p.target && (p.target.dead || (friendlyTarget ? p.target.col==null : p.target.col!=null)))p.target=null;
    if((p.sourceSkillPacket||p.plan?.replacementHeal)&&p.target&&(p.target.removed||p.target.untargetable||
      ![...B.operators,...(B.summoneds||[])].includes(p.target)))p.target=null;
    const tg = p.target;
    // 干员目标用 col/row，敌人目标用 x/y（区分我方弹道与敌方弹道的追踪）
    if (tg && !tg.dead) { if (tg.col != null) { p.tx = tg.col; p.ty = tg.row; } else { p.tx = tg.x; p.ty = tg.y; } }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * (p.enemyChain||p.sourceSkillPacket?Math.min(dt,p.life):dt);
    const forcedArrival=p.sourceSkillPacket?.projectile?.forceReachedWhenTimeup===true&&
      p.sourceSkillPacket.projectile.alwaysHitTraceTargetInTheEnd===true&&p.life<=dt&&!!tg;
    if (d <= step || d < 0.02 || forcedArrival) {
      if(forcedArrival){p.x=p.tx;p.y=p.ty;}
      if(p.enemyChain){resolveEnemyChain(p);finishEnemyProjectile(p);p.life=0;if(finishDefeatedLeader())return;continue;}
      if(p.plan&&window.ArkOperatorCombat){window.ArkOperatorCombat.impact(p);p.life=0;if(finishDefeatedLeader())return;continue;}
      const hit = (tg && !tg.dead) ? tg : null;
      if (hit) {
        const missed=hit.col!=null&&gameRandom()<operatorDodge(hit);
        if (missed) {
          // 干员闪避：弹道未造成伤害
          if(p.sourceSkillPacket)window.ArkEnemySkills?.applyProjectileBuffs(p.sourceSkillPacket,hit,B.time,true);
        } else {
          if(!p.enemy)onOperatorDamage(p.owner,hit,-(window.ArkEnemyDeathSpawn?.hpDelta(hit,-p.dmg,p.damageType)??-p.dmg));
          const actual=inflictDamage(hit,p.dmg,p.critical,p.damageType,false,p.enemy?{source:p.owner}:null);
          if(p.basicAttack)onBasicAttackHit(p.owner,hit,actual);
          if(!p.enemy&&p.criticalStun)hit.stunUntil=Math.max(hit.stunUntil||0,B.time+p.criticalStun);
          if (p.enemy && hit.col != null) { gainOperatorSp(hit, 'INCREASE_WHEN_TAKEN_DAMAGE', 1); applyEnemyEpDamage(p.owner, hit,p.owner,p.sourceSkillPacket); }
          if(p.sourceSkillPacket)window.ArkEnemySkills?.applyProjectileBuffs(p.sourceSkillPacket,hit,B.time,false);
          if (hit.hp <= 0) {
            if (hit.col != null) tryKill(hit);                           // 干员目标：走不屈/复活逻辑
            else killEnemy(hit, p.owner);                                // 敌人：走复活逻辑
          }
        }
      }
      spawnHitParticles(p.x, p.y);
      p.life = 0;   // 命中后由下方 filter 移除
      if (finishDefeatedLeader()) return;
    } else { p.x += dx / d * step; p.y += dy / d * step; }
  }
  // 粒子推进
  for (const p of B.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }

  // 敌人死亡判定（含复活）：技能直接伤害等在此统一结算
  for (const e of B.enemies) if (!e.dead && e.hp <= 0) killEnemy(e);
  if (finishDefeatedLeader()) return;
  respawnOperators();
  notifyGarrisonStatuses();
  B.operators = B.operators.filter(o => !o.dead || o.respawnAt != null);   // 阵亡干员保留原地等待复活
  B.enemies = B.enemies.filter(e => !e.dead);
  if (B.summoneds) B.summoneds = B.summoneds.filter(s => !s.removed && (!s.dead || s.tacticalDormant));
  if (B.projectiles) { for (const p of B.projectiles){p.life-=dt;if(p.life<=0)finishEnemyProjectile(p);} compactProjectiles(B.projectiles); }
  if (B.particles) compactParticles(B.particles);
  if(B.combatEffects)B.combatEffects=B.combatEffects.filter(e=>B.time-e.at<e.duration);

  const pendingEnemies=B.spawn.length+(B.enemyDeathSpawns?.length||0)+(B.waveScheduler?window.ArkWaves.pending(B.waveScheduler):0);
  // 收尾等待不是敌人；清场即成功，不能因最后一个postDelay在超时点误判失败。
  const pendingBombs=B.projectiles.some(p=>['bomb','death-cold','enemy-static-area'].includes(p.kind)&&p.life>0);
  if(B.shield>0&&!B.enemies.length&&!pendingEnemies&&!pendingBombs){B.over=true;B.win=true;if(window.onBattleEnd)window.onBattleEnd(true,B.shield);return;}
  if (!B.over && B.roundTime >= (B.roundLimit||ROUND_LIMIT) && (B.enemies.length || pendingEnemies)) {
    B.endReason='timeout';B.endCounts={alive:B.enemies.length,pending:pendingEnemies};
    B.resolvingLeaks=true;
    try{for (const e of B.enemies) if (!e.dead) { e.dead = true; leak(e); }}finally{B.resolvingLeaks=false;}
    B.enemies = B.enemies.filter(e => !e.dead);
    B.over = true; B.win = false;
    if (window.onBattleEnd) window.onBattleEnd(false, B.shield);
    return;
  }

  if (B.shield <= 0) { B.endReason='shield';B.over = true; B.win = false; if (window.onBattleEnd) window.onBattleEnd(false, 0); }
  else if (!pendingEnemies && !B.enemies.length && !pendingBombs && (!B.waveScheduler||B.waveScheduler.done)) { B.over = true; B.win = true; if (window.onBattleEnd) window.onBattleEnd(true, B.shield); }
}

// 弹道命中时生成灰黑色粒子（从命中点向四周散开，短时间消散）
function spawnHitParticles(x, y) {
  if (!B) return;
  if (!B.particles) B.particles = [];
  for (let i = 0; i < HIT_PARTICLE; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
    const particle = particlePool ? particlePool.acquire() : {};
    particle.x = x; particle.y = y;
    particle.vx = Math.cos(a) * sp; particle.vy = Math.sin(a) * sp;
    particle.life = 0.3 + Math.random() * 0.3; particle.size = 2 + Math.random() * 3;
    B.particles.push(particle);
  }
  const budget = renderProfile().particleBudget;
  if (B.particles.length > budget) {
    const overflow = B.particles.length - budget;
    if (particlePool) for (let i = 0; i < overflow; i++) particlePool.release(B.particles[i]);
    B.particles.splice(0, overflow);
  }
}
// 近战命中：瞬时结算伤害并给出命中点短促粒子反馈（远程攻击走弹道命中结算）
function inflictDamage(target,amount,critical=false,damageType=null,allowSleepingDamage=false,modifierOptions=null){
  if(!target||target.dead||target.untargetable||!(amount>0)||!Number.isFinite(amount)||target.enemyId&&target.sleepUntil>B.time&&!allowSleepingDamage)return 0;
  if(target.enemyId)amount=-(window.ArkEnemyDeathSpawn?.hpDelta(target,-amount,damageType)??-amount);
  if(!target.enemyId&&target.commandShield>0){target.commandShield--;return 0;}
  if(!target.enemyId&&!modifierOptions?.skipModifierEvents)amount*=window.ArkEquipProtection?.scale(target,modifierOptions?.source,B,{...modifierOptions,seasonId:typeof G!=='undefined'?G?.seasonId:null})??1;
  if(!target.enemyId&&!modifierOptions?.skipModifierEvents)amount=window.ArkClientPrograms?.absorb?.(target,amount,B.time)??amount;
  if(!target.enemyId)amount=window.ArkMedicSkills?.absorb(target,amount)??amount;
  if(!(amount>0))return 0;
  if(target.enemyId&&!modifierOptions?.skipModifierEvents)window.ArkEnemyPassives?.onTakingDamage(target,amount,B,(boss,value,flags)=>{
    inflictDamage(boss,value,false,'true',true,flags);if(boss.hp<=0)killEnemy(boss);
  },{kind:'damage'});
  const before=Math.max(0,target.hp);target.hp-=amount;const actual=before-Math.max(0,target.hp);
  if(target.enemyId&&target.hp>0)refreshEnemyModeProviders(target);
  if(actual>0&&B){const id=B.damageSequence=(B.damageSequence||0)+1;
    B.damageFeedback=(B.damageFeedback||[]).filter(hit=>B.time-hit.at<2.4).slice(-255);
    B.damageFeedback.push({id,at:B.time,x:target.x??target.col,y:target.y??target.row,amount:actual<1?Number(actual.toFixed(2)):Math.round(actual),critical:!!critical,...(damageType?{damageType}:{})});
  }if(!modifierOptions?.skipModifierEvents){
    window.ArkBlacknight?.onDamaged(target,actual);if(!target.enemyId)window.ArkMedicSkills?.onDamage(target,actual);
    window.ArkEnemyAuras?.onDamage(modifierOptions?.source,target,{amount:actual},
      {time:B.time,attackPower:enemyAttackPower,element:(unit,value,kind,source)=>window.ArkElements?.add(unit,kind==='nerve'?'nervous':kind,value,source)});
  }return actual;
}
function hitEnemy(owner, tgt, dmg,critical=false,damageType=null) {
  if (!tgt || tgt.dead || tgt.sleepUntil>B.time&&!window.ArkBlacknight?.canHitSleeping(owner)) return 0;
  dmg*=owner?.cooperationDamage||1;
  dmg=-(window.ArkEnemyDeathSpawn?.hpDelta(tgt,-dmg,damageType)??-dmg);
  onOperatorDamage(owner,tgt,dmg);
  window.ArkElementOperators?.onDamage(owner,tgt,dmg,damageType);
  const actual=inflictDamage(tgt,dmg,critical,damageType,window.ArkBlacknight?.canHitSleeping(owner));
  spawnHitParticles(tgt.x, tgt.y);
  if (tgt.hp <= 0) killEnemy(tgt, owner);
  window.ArkTacticalSpecials?.damaged(owner,tgt,actual);
  return actual;
}

// Basic actions are determined by extracted character traits, never by deployment tile.
function operatorAttackProfile(o){
  if(o.basicAttack)return o.basicAttack;
  const p=window.ArkAttackProfiles?.[o.charId];
  return p?{...p,bb:p.traits?.[0]?.bb||{}}:{action:o.profession==='MEDIC'?'heal':'attack'};
}
function operatorAction(o){
  const p=operatorAttackProfile(o);
  if(sourceHealingBusy(o))return 'none';
  if(window.ArkDollkeeper?.noAttack(o))return 'none';
  if(window.ArkBlacknight?.resting(o)||window.ArkTacticalSpecials?.noAttack(o))return 'none';
  if(window.ArkCommonSkills?.stopsAttack(o))return 'none';
  if(window.ArkDirectSkills?.actionLocked?.(o))return 'none';
  const sourceAction=window.ArkSkillModes?.action(o);if(sourceAction)return sourceAction;
  const replacementAction=window.ArkOperatorCombat?.healingActionType?.(o);if(replacementAction)return replacementAction;
  if(p.action==='bard'||['phalanx','librator'].includes(p.action)&&!o.skillState)return 'none';
  if(p.action==='heal'||p.action==='blessing'&&o.skillState)return 'heal';
  return 'attack';
}
function operatorPresent(o){return !o.dead&&o.hp>0&&o.row!=null&&o.col!=null&&!(o.deployAt>B.time);}
function enemyActionInterrupted(e){return !!window.ArkSkillBlockees?.stunned(e,B.time)||
  ['stunUntil','sleepUntil','freezeUntil','frozenUntil','allyFrozenUntil','palsyUntil'].some(k=>e[k]>B.time);}
function operatorCanAct(o){return operatorPresent(o)&&!['stunUntil','sleepUntil','freezeUntil','frozenUntil'].some(k=>o[k]>B.time)&&!window.ArkSkillEndEffects?.stunned(o,B.time);}
function operatorBlockCount(o){
  if(window.ArkDollkeeper?.active(o))return 0;
  const p=operatorAttackProfile(o);
  if(p.action==='librator'&&!o.skillState||p.subProfession==='bearer'&&o.skillState)return 0;
  const count=(o.blockCnt??1)+(window.ArkTacticalSpecials?.blockBonus(o)||0);
  return window.ArkClientPrograms?.blockCount(o,count,B.time)??count;
}
function operatorInRange(o,target){return o.cells?o.cells.some(c=>target.row===c[0]&&target.col===c[1]):dist(o,target)<=(o.range||0);}
function directHealAllowed(o,target){return operatorPresent(target)&&!target.untargetable&&!target.obelisk&&!target.freeling&&
  !window.ArkClientPrograms?.noDirectHeal?.(target,B.time)&&(o===target||!operatorAttackProfile(target).noDirectHeal);}
function healingAllies(o,global=false){return [...B.operators,...(B.summoneds||[])].filter(t=>directHealAllowed(o,t)&&(global||operatorInRange(o,t)));}
function healingOrder(a,b){return a.hp/a.maxHp-b.hp/b.maxHp||String(a.id).localeCompare(String(b.id));}
function healOperator(o,target,amount,{regen=false,visual=true}={}){
  if(!operatorPresent(target)||target.untargetable||!regen&&!directHealAllowed(o,target)||!(amount>0)||!Number.isFinite(amount))return 0;
  if(regen&&operatorAttackProfile(target).noRegeneration)return 0;
  if(!regen)amount*=window.ArkMedicSkills?.healingScale(o,target)??1;
  const actual=Math.min(amount,Math.max(0,target.maxHp-target.hp));target.hp+=actual;
  if(actual>0&&visual){
    const fx=B.combatEffects||(B.combatEffects=[]);
    fx.push({kind:'heal',at:B.time,duration:.55,x:target.col,y:target.row,sx:o.col,sy:o.row});
    if(fx.length>96)fx.splice(0,fx.length-96);
  }
  return actual;
}
function operatorAttackPower(o,mult=1){
  let inspire=0;
  if(operatorAttackProfile(o).action!=='bard')for(const bard of B.operators){
    if(operatorPresent(bard)&&bard.skillState&&bard.skill?.sourceId==='skchr_skadi2_3'&&operatorInRange(bard,o))inspire=Math.max(inspire,bard.atk*buffMul(bard).atk*(bard.skill.blackboard.atk||0));
  }
  const programScale=window.ArkClientPrograms?.layers(o,'atk',B.time).final_scaler??1;
  return (o.atk*mult+(inspire+(o.flow?.atk||0))*programScale)*((o.apopUntil>B.time)?(o.apopFactor||.5):1);
}
function consumeOperatorAmmo(o){if(o.skillState?.ammo>0){o.skillState.ammo--;notifyGarrisonAmmo(o);if(!o.skillState.ammo)endOperatorSkill(o);}}
function abnormalHealingState(o){return ['stunUntil','sleepUntil','freezeUntil','frozenUntil'].some(k=>o[k]>B.time)||!!window.ArkSkillEndEffects?.stunned(o,B.time);}
function elementalDamage(o){return window.ArkElements?.active(o)?0:Math.max(0,...Object.values(o.ep||{}));}
function sourceHealingBusy(o){return !!o.sourceHealAction&&o.sourceHealAction.epoch===(o.medicLifeEpoch||0)&&o.sourceHealAction.until>B.time;}
function sourceHealingSourceValid(p){
  const o=p.owner,h=p.plan.sourceModeHeal;
  return !!o&&operatorCanAct(o)&&!o.removed&&!o.untargetable&&o.deployed!==false&&
    [...B.operators,...(B.summoneds||[])].includes(o)&&(o.medicLifeEpoch||0)===h.ownerEpoch;
}
function finishSourceHealing(p){
  const o=p.owner,t=p.target,h=p.plan.sourceModeHeal;
  if(!sourceHealingSourceValid(p)||!t||(t.medicLifeEpoch||0)!==h.targetEpoch||
    ![...B.operators,...(B.summoneds||[])].includes(t)||!directHealAllowed(o,t))return;
  if(h.extraHp)healOperator(o,t,t.maxHp*h.extraHp);
  healOperator(o,t,h.amount);window.ArkMedicSkills?.afterHeal(o,t,h.medic);
  window.ArkElements?.heal(t,h.elementalHeal);
  window.ArkElementOperators?.healed(o,t,h.rawAmount,h.elementalHeal);
}
function performHealingAction(o){
  if(sourceHealingBusy(o))return false;
  const replacement=window.ArkOperatorCombat?.replacementHealingAction?.(o);if(replacement!=null)return replacement;
  const p=operatorAttackProfile(o),bb=p.bb||{},s=o.skillState?o.skill:null,sb=s?.blackboard||{};
  const eruption=s?.sourceId==='skchr_agoat2_3',cleanse=s?.sourceId==='skchr_lumen_3';
  const primary=window.ArkMedicSkills?.primary(o);
  let pool=primary!==undefined?(primary?[primary]:[]):healingAllies(o,eruption).filter(t=>t.hp<t.maxHp||bb.ep_heal_ratio&&elementalDamage(t)>0);
  if(!pool.length)return false;
  const elementalPriority=s?.sourceId==='skchr_harold_2';
  pool.sort((a,b)=>(cleanse?Number(abnormalHealingState(b))-Number(abnormalHealingState(a)):0)
    ||(elementalPriority?elementalDamage(b)-elementalDamage(a):0)
    ||a.hp/a.maxHp-b.hp/b.maxHp||(bb.ep_heal_ratio?elementalDamage(b)-elementalDamage(a):0)||String(a.id).localeCompare(String(b.id)));
  const sourceMode=window.ArkSkillModes?.healing(o);
  const medic=sourceMode??window.ArkMedicSkills?.action(o,pool);
  if(medic?.random)pool=[pool[Math.floor(gameRandom()*pool.length)]];
  const bm=buffMul(o),atk=operatorAttackPower(o,bm.atk);
  const count=medic?.count??(eruption?5:s?.sourceId==='skchr_agoat2_1'?2:p.healTargets||bb['attack@chain.max_target']||1);
  let targets=pool.slice(0,p.subProfession==='chainhealer'?1:count);
  // Local chain spacing: adjacent/diagonal tiles (radius 1.7); source table gives count/decay, not hop distance.
  if(p.subProfession==='chainhealer')while(targets.length<count){
    const last=targets.at(-1),next=healingAllies(o,true).filter(t=>!targets.includes(t)&&dist(last,t)<=1.7).sort(healingOrder)[0];
    if(!next)break;targets.push(next);
  }
  let sourceTiming=null;
  if(sourceMode?.timing){
    const t=sourceMode.timing,interval=window.ArkOperatorCombat.attackInterval(o,s);
    if(t.rule!=='native-attack-time-capped-animation'||t.waitForAttackEvent!==true||
      !(t.eventTime>=0&&t.eventTime<=t.animationDuration)||!(t.animationDuration>0)||
      !(t.minScale>0&&(t.maxScale===-1||t.maxScale>=t.minScale))||cleanse||eruption)throw Error('Invalid source healing timing');
    const scale=Math.max(t.minScale,Math.min(t.maxScale===-1?Infinity:t.maxScale,interval/t.animationDuration));
    sourceTiming={delay:t.eventTime*scale,duration:t.animationDuration*scale,interval};
    o.sourceHealAction={until:B.time+sourceTiming.duration,epoch:o.medicLifeEpoch||0};
  }
  let usedAmmo=false;
  for(let i=0;i<(eruption?5:targets.length);i++){
    const t=targets[i%targets.length],bad=cleanse&&abnormalHealingState(t);
    const scale=medic?.scale??(eruption?sb['attack@heal_scale']||1:p.action==='blessing'?bb.heal_scale||.75:1);
    const chain=p.subProfession==='chainhealer'?Math.pow(bb['attack@chain.atk_scale']??.75,i):1;
    // Therapist's outer row has reduced healing. Distance rule is an explicit local approximation.
    const far=p.subProfession==='healer'&&dist(o,t)>2?bb.heal_scale??1:1;
    const epScale=elementalPriority&&elementalDamage(t)>(t.epThreshold||1000)/2?(sb.trait_scale||1):1;
    const elementalHeal=atk*(bb.ep_heal_ratio||0)*scale*chain*epScale;
    if(sourceTiming){
      const packet={amount:atk*scale*chain*far,rawAmount:atk*scale*chain*far,elementalHeal,
        extraHp:medic?.extraHp||0,medic:{count:medic.count,scale:medic.scale},
        ownerEpoch:o.medicLifeEpoch||0,targetEpoch:t.medicLifeEpoch||0};
      spawnProjectile({owner:o,target:t,kind:'operator-pulse',enemy:false,basicAttack:false,
        plan:{sourceModeHeal:packet},sx:o.col,sy:o.row,x:o.col,y:o.row,tx:t.col,ty:t.row,
        resolveAt:B.time+sourceTiming.delay,life:sourceTiming.duration+1});
      continue;
    }
    if(medic?.extraHp)healOperator(o,t,t.maxHp*medic.extraHp); // Warfarin's added heal precedes the normal heal.
    healOperator(o,t,atk*scale*chain*far*(bad?sb.heal_scale||1:1));
    window.ArkMedicSkills?.afterHeal(o,t,medic);
    if(window.ArkElements)window.ArkElements.heal(t,elementalHeal);
    else if(bb.ep_heal_ratio)for(const key of Object.keys(t.ep||{}))t.ep[key]=Math.max(0,t.ep[key]-elementalHeal);
    window.ArkElementOperators?.healed(o,t,atk*scale*chain*far,elementalHeal);
    if(bad){for(const key of ['stunUntil','sleepUntil','freezeUntil','frozenUntil'])t[key]=0;window.ArkSkillEndEffects?.clear(t);usedAmmo=true;}
  }
  o.cd=sourceMode?window.ArkOperatorCombat.attackInterval(o,s):(window.ArkMedicSkills?.interval(o,s)??Math.max(.05,o.attackTime)/bm.aspd);o.atkAnimAt=B.time;
  window.ArkElements?.onAction(o);
  // A healing action charges attack-recovery skills, but never triggers enemy on-hit effects.
  if(!medic?.next)gainOperatorSp(o,'INCREASE_WHEN_ATTACK',1);
  if(!cleanse||usedAmmo)consumeOperatorAmmo(o);
  return true;
}
function updateSupportRecovery(dt){
  for(const o of B.operators){
    if(!operatorPresent(o))continue;
    const profile=operatorAttackProfile(o);
    if(profile.action==='librator'){
      if(!o.skillState)o._liberatorCharge=Math.min(profile.bb?.max_stack_cnt||40,(o._liberatorCharge||0)+dt);
      continue;
    }
    if(profile.action!=='bard')continue;
    const p=operatorAttackProfile(o),s=o.skillState?o.skill:null,bb=s?.blackboard||{},atk=operatorAttackPower(o,buffMul(o).atk);
    if(s?.sourceId==='skchr_skadi2_3'){
      // This skill replaces the recovery trait; its damage is periodic true damage, not a normal attack.
      o._bardTick=(o._bardTick||0)+dt;
      while(o._bardTick>=1&&!o.dead){o._bardTick-=1;
        for(const e of B.enemies)if(!e.dead&&enemyInOperatorRange(o,e)){
          inflictDamage(e,atk*(bb.atk_scale||0),false,'true');if(e.hp<=0)killEnemy(e,o);
        }
        inflictDamage(o,o.maxHp*(bb.hp_ratio||0));if(o.hp<=0)tryKill(o);
      }
      continue;
    }
    o._bardTick=0;
    const ratio=bb['attack@atk_to_hp_recovery_ratio']??p.bb?.['attack@atk_to_hp_recovery_ratio']??p.bb?.atk_to_hp_recovery_ratio??.1;
    const visual=B.time>=(o._recoveryFxAt||0);
    for(const t of [...B.operators,...(B.summoneds||[])])if(operatorPresent(t)&&operatorInRange(o,t))healOperator(o,t,atk*ratio*dt,{regen:true,visual});
    if(visual)o._recoveryFxAt=B.time+.5;
  }
}
function onBasicAttackHit(o,target,damage){
  if(!o||!operatorPresent(o)||!(damage>0))return;
  const p=operatorAttackProfile(o),bb=p.bb||{};
  if(p.subProfession==='slower'){target.slowUntil=Math.max(target.slowUntil||0,B.time+(bb.sluggish??.8));target.slowFactor=.2;}
}
function onOperatorDamage(o,target,damage){
  if(!o||!operatorPresent(o)||!(damage>0))return;
  const p=operatorAttackProfile(o),bb=p.bb||{};
  // Incantation healing uses mitigated damage before subtracting enemy HP,
  // including the lethal hit, rather than the target's remaining HP (PRTS branch notes).
  if(p.subProfession==='incantationmedic'){
    const t=healingAllies(o).filter(t=>t.hp<t.maxHp).sort(healingOrder)[0];
    if(t)healOperator(o,t,damage*(bb.scale??.5));
  }
  if(p.subProfession==='musha')healOperator(o,o,bb.value||0);
  if(p.subProfession==='reaper'){
    if(o._reaperWindow==null||B.time-o._reaperWindow>=.05){o._reaperWindow=B.time;o._reaperHits=0;}
    if((o._reaperHits||0)<(o.blockCnt||0)){o._reaperHits=(o._reaperHits||0)+1;healOperator(o,o,bb.value||0);}
  }
}

// 技能期间围绕干员格子的三道错开的橙红线条：非线性速度椭圆轨道快速转圈
function drawSkillFlame(cx, cy, t) {
  ctx.save();
  ctx.lineCap = 'round';
  const a0 = TILE * 0.62, b0 = TILE * 0.46;   // 椭圆主轴/副轴（板面坐标系；随透视投影自然呈椭圆）
  const OMEGA = 4.2;                          // 基础角速度（快）
  const N = 3;
  for (let i = 0; i < N; i++) {
    const phase = i * (Math.PI * 2 / N);      // 三道错开
    const k = N === 1 ? 0.5 : i / (N - 1);
    const a = a0 * (0.86 + 0.14 * k);
    const b = b0 * (0.86 + 0.14 * k);
    const swing = 1.9;                        // 非线性摆幅（rad）
    const nu = 2.4 + 0.6 * i;                 // 各道非线性频率不同 → 速度不均
    const th = t * OMEGA + swing * Math.sin(t * nu + phase) + phase;   // 非线性角速度
    const lag = 0.9;                          // 尾迹滞后角（弧长）
    const hx = cx + a * Math.cos(th),       hy = cy + b * Math.sin(th);                    // 头部
    const tx = cx + a * Math.cos(th - lag), ty = cy + b * Math.sin(th - lag);              // 尾部
    // 弧形控制点：沿椭圆中点、稍向外扩，形成弯曲弧（而非直线段）
    const midTh = th - lag / 2;
    const mx = cx + a * 1.08 * Math.cos(midTh), my = cy + b * 1.08 * Math.sin(midTh);
    // 头部亮、尾部渐隐：走过有渐变消失
    const grad = ctx.createLinearGradient(hx, hy, tx, ty);
    grad.addColorStop(0, 'rgba(255,' + (170 + 40 * i) + ',90,0.95)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(3, TILE * 0.08);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my, hx, hy);
    ctx.stroke();
  }
  ctx.restore();
}

function buffMul(o,extraAspd=0,extraAtk=0) {
  let atk = extraAtk, aspd = extraAspd, def = 0;
  const profile=operatorAttackProfile(o);
  atk+=window.ArkOperatorCombat?.attackBonus(o)||0;
  atk+=window.ArkElementOperators?.attackBonus(o)||0;
  atk+=window.ArkEquipSkillStacks?.attackBonus(o)||0;
  atk+=window.ArkDollkeeper?.formAtk(o)||0;
  atk+=window.ArkBlacknight?.aura(o)||0;
  atk+=window.ArkTacticalSpecials?.attackBonus(o)||0;def+=window.ArkTacticalSpecials?.defenseBonus(o)||0;
  if(o.tacticalToken&&o.blocked>0)def+=o.blockDefense||0;
  aspd+=window.ArkElements?.aspdBonus(o)||0;
  aspd+=window.ArkMedicSkills?.attackSpeedBonus(o)||0;
  if(profile.action==='phalanx'&&!o.skillState)def+=profile.bb?.def||0;
  if(profile.action==='librator')atk+=(profile.bb?.atk||0)*Math.floor(o._liberatorCharge||0)/(profile.bb?.max_stack_cnt||40);
  // Frost's passive persists while flying; identical auras do not stack.
  let aura=0;
  for(const e of B?.enemies||[])if(!e.dead&&e.attackSpeedAura&&Math.hypot(e.x-o.col,e.y-o.row)<=e.attackSpeedAura.radius)aura=Math.min(aura,e.attackSpeedAura.amount);
  aspd+=aura+(window.ArkEnemyCold?.aspd(o,B.time)||0);
  return window.ArkAttributes.ratios(o,{atk,aspd,def},B.time);
}
function operatorDefense(o) {
  const flat=(o.flow?.def||0)+(window.ArkElements?.defDelta(o)||0);
  let value=window.ArkAttributes.defense(o,buffMul(o).def,flat,B.time);
  if(o.erosionUntil&&o.erosionUntil>B.time)value*=o.erosionFactor??.5;
  return window.ArkClientStatBuffSkills?.defense(o,value)??value;
}
function operatorResistance(o){
  const profile=operatorAttackProfile(o),flat=(profile.action==='phalanx'&&!o.skillState?(profile.bb?.magic_resistance||0):0)+(window.ArkElements?.resDelta(o)||0);
  const p=window.ArkClientPrograms?.layers(o,'magic_resistance',B.time);
  return Math.max(0,p?window.ArkClientPrograms.calculate(o.magicRes||0,o.magicRes||0,0,{...p,final_addition:p.final_addition+flat}):(o.magicRes||0)+flat);
}
// 敌方防御（含破甲 debuff）
function enemyDef(e) {
  let def = (window.ArkExternalCombat?.attribute(e,'def',e.def)??e.def) * ((e.defDebuffUntil && e.defDebuffUntil > B.time) ? (e.defDebuff || 1) : 1);
  def *= window.ArkOperatorCombat?.defenseMultiplier(e)??1;
  if (e.erosionUntil && e.erosionUntil > B.time) def *= (e.erosionFactor || 0.5);   // 侵蚀：防御降低
  if (e.rampageUntil && e.rampageUntil > B.time) def *= 0.7;                        // 狂躁：防御降低
  const value=def*(window.ArkBossMechanics?.defenseMultiplier(e)??1)+(window.ArkOperatorCombat?.defense(e)||0)+(window.ArkElements?.defDelta(e)||0)-(window.ArkFlowShape?.stolen(e,'def')||0);
  return Math.max(0,window.ArkSkillAuras?.attribute(e,'def',e.def||0,value,B.time)??value);
}
// 干员对敌伤害：物理 = atk×mult - def；法术 = atk×mult×(1-res%)；护盾再减免
function notifyGarrisonAmmo(source){
  for(const observer of B.operators){
    if(observer.dead||!(observer._garrisonStarted||observer.deployed)||observer.playerId!==source.playerId)continue;
    const rules=(observer.garrisonAdd||[]).filter(g=>g.bb?.key?.endsWith('_consume_ammo'));
    if(!rules.length)continue;
    const [dr,dc]=({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]})[observer.dir||'up'];
    const matching=rules.filter(g=>g.bb.range_id==='x-5'?Math.abs(source.row-observer.row)+Math.abs(source.col-observer.col)<=1:source.row===observer.row+dr&&source.col===observer.col+dc);
    if(matching.length){const all=observer.garrisonAdd;observer.garrisonAdd=matching;try{window.onBondGarrison?.('ammo',observer);}finally{observer.garrisonAdd=all;}}
  }
}
function notifyGarrisonStatuses(){
  const observers=B.operators.filter(o=>!o.dead&&(o._garrisonStarted||o.deployed)&&(o.garrisonAdd||[]).some(g=>/abflag_inrange|sleepstun_inrange/.test(g.bb?.key||'')));
  if(!observers.length)return;
  for(const entity of [...B.enemies,...B.operators]){
    const enemy=entity.enemyId!=null,now={freeze:enemy&&(entity.freezeUntil>B.time||entity.frozenUntil>B.time||entity.allyFrozenUntil>B.time),stun:entity.stunUntil>B.time||(enemy?!!window.ArkSkillBlockees?.stunned(entity,B.time):!!window.ArkSkillEndEffects?.stunned(entity,B.time)),sleep:entity.sleepUntil>B.time};
    const prev=entity._garrisonStatus||{};entity._garrisonStatus=now;
    if(entity.dead)continue;
    const events=[];if(now.freeze&&!prev.freeze)events.push('freeze');if(now.stun&&!prev.stun)events.push('sleepstun');if(now.sleep&&!prev.sleep)events.push('sleepstun');
    for(const observer of observers){
      if(!enemy&&entity.playerId!==observer.playerId)continue;
      const inside=enemy?enemyInOperatorRange(observer,entity):operatorInRange(observer,entity);
      if(inside)for(const event of events)window.onBondGarrison?.(event,observer);
    }
  }
}
function calcDamage(o, e, mult, options={}) {
  return calcDamageResult(o,e,mult,options).amount;
}
function calcDamageResult(o, e, mult, options={}) {
  let raw = options.raw??operatorAttackPower(o,mult);
  const gs=o.garrisonStats;
  const tags=(typeof GARRISON_DATA!=='undefined'?GARRISON_DATA.enemyTags?.[e.enemyId]:null)||e.enemyTags||[];
  for(const bonus of gs?.targetBonuses||[])if(tags.includes(bonus.tag))raw*=bonus.atk;
  let dmg;
  const baseRes=((window.ArkExternalCombat?.attribute(e,'magic_resistance',e.magicRes||0)??(e.magicRes||0))+(e.allyFrozenUntil>B.time?window.ArkHunterRules.freezeResist:0)+(window.ArkBossMechanics?.resistanceBonus(e)??0)+(window.ArkElements?.resDelta(e)||0))*(window.ArkOperatorCombat?.resistance(e)??1);
  const res=Math.max(0,(window.ArkSkillAuras?.attribute(e,'magic_resistance',e.magicRes||0,baseRes,B.time)??baseRes)-(window.ArkOperatorCombat?.resistancePenetration(o)||0));
  const arts=Math.max(1,Math.round(raw*(1-Math.min(95,res)/100)));
  const penetration=window.ArkClientPrograms?.defensePenetration(o,B.time)??{fixed:0,ratio:0};
  // Source penetration affects this attack's effective DEF, never the target's
  // stored DEF. The simulation applies percentage penetration before flat.
  const physical=Math.max(1,Math.round(Math.max(raw*.05,raw-Math.max(0,enemyDef(e)*(options.defScale??1)*(1-penetration.ratio)-
    (window.ArkOperatorCombat?.penetration(o)||0)-penetration.fixed-(options.defPenetrate||0)))));
  const type=options.type==='elemental'?'elemental':gs?.weakness?(arts>physical?'arts':'phys'):(options.type||o.atkType||operatorAttackProfile(o).damageType||'phys');
  dmg=type==='elemental'?Math.round(window.ArkElements?.reduced(raw,window.ArkElements.resistance(e,true))??raw):type==='true'?Math.round(raw):type==='arts'?arts:physical;
  if(type==='arts')dmg*=window.ArkOperatorCombat?.artsTaken(e)??1;
  if(gs?.abDamage>1&&(e.bindUntil>B.time||e.rootUntil>B.time||e.slowUntil>B.time||window.ArkOperatorCombat?.isSlowed?.(e)))dmg*=gs.abDamage;
  if (e.shield) dmg = Math.max(1, Math.round(dmg * (1 - e.shield)));
  dmg=Math.max(1,Math.round(dmg*(window.ArkBossMechanics?.incomingMultiplier(e,type)??1)));
  return {amount:dmg,type};
}
// Final death is distinct from revive, exit and a FALLDOWN finish reason.
function killEnemy(e, owner, reason='DEATH') {
  if(e.dead)return;
  if(e.atkSchedule?.castBuff)window.ArkEnemySkills?.finish(e,e.atkSchedule,'death');
  window.ArkHunter?.clearCold(e);
  window.ArkMystic?.clearRoot(e);
  e.flowRootUntil=0;
  if (e.revive && !e.revived) {
    e.revived = true;
    e.hp = Math.max(1, Math.round(e.maxHp * 0.5));
    return;
  }
  e.dead = true;
  window.ArkMedicSkills?.onEnemyDefeated(e);
  window.ArkOperatorCombat?.onEnemyDefeated(e,owner);
  if(e.deathCold?.scale>0&&!window.ArkEnemyCold?.silenced(e,B.time)){
    const blast=e.deathCold;
    // Snapshot damage at death: no live owner survives the one-second delay.
    let atk=e.atk*(window.ArkElements?.atkScale(e)??1);
    if(e.apopUntil>B.time)atk*=e.apopFactor||.5;
    if(e.rampageUntil>B.time)atk*=1.5;
    spawnProjectile({kind:'death-cold',enemy:true,x:e.x,y:e.y,tx:e.x,ty:e.y,
      radius:blast.radius,resolveAt:B.time+blast.delay,life:blast.delay+1,
      coldSource:{atk:atk*blast.scale,atkType:'phys',duration:blast.duration}});
  }
  if(B?.stats)B.stats.kills++;
  playSfx('b_enemy_dead_n');   // 敌人死亡音效（重型/boss 可用 b_enemy_dead_h，暂统一用普通）
  const deathSpawns=window.ArkEnemyDeathSpawn?.plan(e,{time:B.time,reason,random:gameRandom});
  if(deathSpawns)(B.enemyDeathSpawns||=[]).push(...deathSpawns);
  if (deathSpawns==null && e.extraEnemyKeyList && e.extraEnemyKeyList.length) {
    for (const mid of e.extraEnemyKeyList) spawnEnemyAt(mid, e);
  }
  if (deathSpawns==null && e.deathrattleKey) {
    for (let i = 0; i < (e.deathrattleCnt || 1); i++) spawnEnemyAt(e.deathrattleKey, e);
  }
  window.ArkEnemyPassives?.onKilled(e,B,(target,options)=>{
    target.hp=0;killEnemy(target,undefined,options?.reason||'DEATH');
  },{reason});
  if (owner) owner._kills = (owner._kills || 0) + 1;
  if (owner && owner.garrisonAdd && window.onBondGarrison) window.onBondGarrison('kill', owner);
  // 击杀奖励金币：仅 kill_coin.json 指定的敌人(按 enemy_id+round)掉落，普通击杀不掉钱（I-20260901-020）
  if (window.onKillCoin) window.onKillCoin(e.enemyId,e);
}
// 应用敌人天赋（被动）+ 技能（主动）到敌人对象
function setupEnemy(en, base) {
  window.ArkEnemyPassives?.configure(en,B);
  window.ArkEnemyCold?.configure(en,base);
  if(B?.sourceBattle)window.ArkBossMechanics?.attach(en);
  en.atkType=window.ArkBossMechanics?.attackType(en,en.atkType)||en.atkType;
  window.ArkExternalCombat?.configure(en);
  window.ArkEnemySkills?.configure(en);
  let shield = 0, revive = false;
  for (const t of (base.talents || [])) {
    if (t.type === 'buff_atk'&&!window.ArkEnemyCold?.ownsAttackTalent(en)) en.atk = Math.round(en.atk * (1 + t.power));
    else if (t.type === 'buff_def') en.def = Math.round(en.def * (1 + t.power));
    else if (t.type === 'speed_up') en.moveSpeed = (en.moveSpeed || 1) * t.power;
    else if (t.type === 'shield') shield = Math.max(shield, t.power);
    else if (t.type === 'revive') revive = true;
    else if (t.type === 'ep_attack') en.epAttack = Math.max(en.epAttack || 0, t.power);
    else if (t.type === 'deathrattle') { en.deathrattleKey = t.enemyKey; en.deathrattleCnt = t.cnt || 1; }
  }
  en.shield = shield; en.revive = revive;
  window.ArkElements?.configureEnemy(en);
  const sk = (base.skills || []).find(x => x.skillType);
  if (sk) { en.skill = sk; en.skillCd = sk.cooldown || 5; }
  if(en.bombAttack){en.canAttack=false;en.skill=null;en.bombCooldown=enemyBombParameters(en)?.initialCooldown??en.bombAttack.initialCooldown;en.bombDropped=false;en.bombAim=null;}
}
// Source animation/geometry and MULTIPLIER inputs override the old description
// adapter. The unresolved BombdMovement trajectory retains the legacy flight.
function enemyBombParameters(e){
  const fallback=e.bombAttack;if(!fallback)return null;
  const source=window.ArkExternalCombat?.profile(e)?.bombParameters;
  if(!source)return {...fallback,windup:.45,halfWidth:fallback.tileRadius+.5,halfHeight:fallback.tileRadius+.5};
  let initialCooldown=source.initialCooldown,value=source.moveSpeed.default;
  if(Object.hasOwn(e,'sourceSkills')){
    if(!Array.isArray(e.sourceSkills))return null;
    const skills=e.sourceSkills.filter(s=>s.prefabKey===source.skillKey);if(skills.length!==1)return null;
    const skill=skills[0],board=skill.blackboard||[];
    if(skill.spCost!==0||!Array.isArray(board)||board.length!==1||board[0].key!==source.moveSpeed.key||board[0].valueStr)return null;
    initialCooldown=skill.initCooldown;value=board[0].value;
  }
  const a=source.animation;
  if(!Number.isFinite(value)||value<0||!Number.isFinite(initialCooldown)||initialCooldown<0||
    !Number.isFinite(e.attackTime)||e.attackTime<=0||source.moveSpeed.formula!=='MULTIPLIER')return null;
  const scale=Math.min(a.maxScale,Math.max(a.minScale,e.attackTime/a.duration));
  return {...fallback,initialCooldown,moveMultiplier:1+value,windup:a.hitTime*scale,
    halfWidth:source.area.halfWidth,halfHeight:source.area.halfHeight,sourceRule:source.rule};
}
// Aim is a value object so checkpoints do not depend on a live target reference.
function advanceEnemyBomb(e,dt,attackDt=dt){
  if(!e.bombAttack||e.bombDropped)return false;
  const params=enemyBombParameters(e);if(!params)return false;
  e.bombCooldown=Math.max(0,(e.bombCooldown??params.initialCooldown)-dt);
  if(e.bombAim){
    e.bombWindup-=attackDt;
    if(e.bombWindup<=0){
      const aim=e.bombAim;
      spawnProjectile({kind:'bomb',enemy:true,owner:e,sx:e.x,sy:e.y,x:e.x,y:e.y,tx:aim.x,ty:aim.y,
        tileRadius:e.bombAttack.tileRadius,halfWidth:params.halfWidth,halfHeight:params.halfHeight,launchedAt:B.time,flightTime:.7,life:2,
        bombSource:{atk:e.atk,atkType:'phys',apopUntil:e.apopUntil,apopFactor:e.apopFactor,rampageUntil:e.rampageUntil}});
      e.bombAim=null;e.bombDropped=true;
    }
    return true;
  }
  if(e.bombCooldown>0)return false;
  const target=B.operators.filter(o=>!o.dead&&!o.removed&&!o.untargetable&&!o.targetFree&&o.hp>0&&o.col!=null&&
      !(o.invisibleUntil>B.time)&&!(o.camouflageUntil>B.time)&&(o.deployAt??0)<=B.time&&(o.deployT||0)>=1&&Math.hypot(e.x-o.col,e.y-o.row)<=e.rangeRadius)
    .sort((a,b)=>(b.deployAt||0)-(a.deployAt||0)||(b.id||0)-(a.id||0))[0];
  if(!target)return false;
  e.bombAim={x:target.col,y:target.row};e.bombWindup=params.windup;e.atkAnimAt=B.time;return true;
}
function resolveEnemyBomb(p){
  // Source BoxCollider2D is 3x3. At a tile center this includes nine tile centers.
  for(const op of B.operators){
    if(op.dead||op.removed||op.untargetable||op.targetFree||op.col==null||(op.deployAt??0)>B.time||(op.deployT||0)<1||
      Math.abs(op.col-p.tx)>(p.halfWidth??p.tileRadius+.5)||Math.abs(op.row-p.ty)>(p.halfHeight??p.tileRadius+.5))continue;
    if(gameRandom()<operatorDodge(op))continue;
    inflictDamage(op,enemyDamageToOperator(p.bombSource,op));gainOperatorSp(op,'INCREASE_WHEN_TAKEN_DAMAGE',1);
    if(op.hp<=0)tryKill(op);
  }
  (B.combatEffects||=[]).push({kind:'bomb-blast',at:B.time,duration:.85,x:p.tx,y:p.ty,tileRadius:p.tileRadius});
  spawnHitParticles(p.tx,p.ty);
}
// 在敌人位置召唤小怪（死亡分裂 / 召唤技能）
function spawnEnemyAt(mid, e, fallback) {
  const base = BDATA.enemies[mid] || fallback; if (!base) return;
  const en = { ...base, route: e.route, seg: e.seg, cp: e.cp, x: e.x, y: e.y, hp: base.maxHp, cd: 0, wait: 0, dead: false, flying: !!base.flying };
  en.visualId=(B.visualSequence=(B.visualSequence||0)+1);
  for(const key of ['sourceWave','sourceFragment','blockFragment','dontBlockWave'])en[key]=e[key];
  applySourceEnemyModifiers(en);
  setupEnemy(en, base);
  B.enemies.push(en);
  return en;
}
function sourceRouteProblem(source){
  if(!source)return '';
  for(const wave of source.waves||[])for(const fragment of wave.fragments||[])for(const action of fragment.actions||[]){
    if(action.actionType!=='SPAWN'||action.count===0)continue;
    const route=BDATA.level.routes[action.routeIndex];
    if(!route?.segs?.[0]?.length||route.error)return '本轮路线 '+action.routeIndex+' 无效，无法开始战斗';
  }
  return '';
}
function applySourceEnemyModifiers(en){
  if(!B.sourceBattle)return;
  en.moveSpeed*=B.moveMultiplier;const mul=B.enemyStatMultiplier??1;
  en.maxHp=Math.round(en.maxHp*mul);en.hp=en.maxHp;en.atk=Math.round(en.atk*mul);
  for(const m of B.enemyModifiers||[])for(const [key,value]of Object.entries(m.bb||{})){
    const field={atk:'atk',def:'def',magic_resistance:'magicRes'}[key];if(!field||!Number.isFinite(value))continue;
    en[field]=m.key==='enemy_attribute_mul'?(en[field]||0)*value:(en[field]||0)+value;
  }
}
// 敌人对干员伤害：物理 = atk - def；法术 = atk×(1-res%)
function resolveDeathCold(p){
  for(const op of [...B.operators,...(B.summoneds||[])]){
    if(!operatorPresent(op)||op.flying||Math.hypot(op.col-p.tx,op.row-p.ty)>p.radius+1e-9)continue;
    if(gameRandom()<operatorDodge(op))continue;
    inflictDamage(op,enemyDamageToOperator(p.coldSource,op));
    gainOperatorSp(op,'INCREASE_WHEN_TAKEN_DAMAGE',1);
    window.ArkEnemyCold?.apply(op,p.coldSource.duration,B.time);
    if(op.hp<=0)tryKill(op);
  }
  (B.combatEffects||(B.combatEffects=[])).push({kind:'cold-blast',x:p.tx,y:p.ty,radius:p.radius,at:B.time,duration:.6});
}
function performEnemyBasicHit(e,targets,rangeR){
  if(e.atkSchedule?.attachedProjectile){
    const shots=window.ArkEnemyAttachedProjectiles.delivery(e,e.atkSchedule,targets,{...enemySelectiveContext(),
      attackPower:enemyAttackPower(e,e.atkSchedule.atkScale??1),outputScale:window.ArkExternalCombat?.outputDamageScale(e)??1,rangeScale:1});
    for(const shot of shots)spawnProjectile({...shot,sx:e.x,sy:e.y,owner:e,enemy:true,damageType:shot.enemyActionPacket.damageType});
    return shots.map(shot=>shot.target);
  }
  if(e.atkSchedule?.selectiveAttack){
    const shots=window.ArkEnemySelectiveAttacks?.delivery(e,e.atkSchedule,targets,{...enemySelectiveContext(),
      attackPower:enemyAttackPower(e,e.atkSchedule.atkScale??1),
      outputScale:window.ArkExternalCombat?.outputDamageScale(e)??1,rangeScale:1})||[];
    for(const shot of shots){
      const target=shot.target,damageType=shot.enemyActionPacket.damageType;
      spawnProjectile({...shot,sx:e.x,sy:e.y,x:e.x,y:e.y,tx:target.col??target.x,ty:target.row??target.y,
        owner:e,enemy:true,damageType,kind:damageType==='arts'?'orb':'arrow'});
    }
    return shots.map(shot=>shot.target);
  }
  targets=window.ArkEnemySkills?.hitTargets(e,{time:B.time,candidates:[...B.operators,...(B.summoneds||[])]})??targets;
  const validTargets=targets.filter(tgt=>tgt&&!tgt.dead&&(tgt.deployT||0)>=1&&
    (!['selector-sp-tagged-ranged','selector-sp-multi-melee'].includes(e.atkSchedule?.skillKind)||!tgt.removed&&!tgt.untargetable&&
      [...B.operators,...(B.summoneds||[])].includes(tgt)));
  if(validTargets.length)window.ArkEnemySkills?.onSpellOn(e,e.atkSchedule);
  for(const tgt of validTargets){
    const damageType=e.atkSchedule?.damageType||e.atkType;
    const dmg=enemyDamageToOperator(e,tgt,e.atkSchedule?.atkScale??1,damageType);
    if(e.bossMechanics?.attack?.damageDelay!=null){
      (B.bossSkillEvents||=[]).push({owner:e,targets:[tgt],baseAtk:e.atk,atkScale:1,damageType:e.atkType,
        epDamageRatio:e.epAttack||0,elementType:e.epType,at:B.time+e.bossMechanics.attack.damageDelay});
    }else if(e.atkSchedule?.projectileContract?.kind==='chain'){
      const schedule=e.atkSchedule,contract=schedule.projectileContract;
      if(schedule.projectileToken==null)schedule.projectileToken=e.externalAttackSequence=(e.externalAttackSequence||0)+1;
      schedule.pendingProjectiles=(schedule.pendingProjectiles||0)+1;
      spawnProjectile({sx:e.x,sy:e.y,x:e.x,y:e.y,tx:tgt.col,ty:tgt.row,target:tgt,owner:e,enemy:true,
        enemyChain:contract,attackPacket:{atk:enemyAttackPower(e,schedule.atkScale??1),
          outputScale:window.ArkExternalCombat?.outputDamageScale(e)??1,damageType,
          frozenAttackScale:e.frozenAttackScale??1},castToken:schedule.projectileToken,
        speed:contract.speed,life:contract.lifeTime,kind:damageType==='arts'?'orb':'arrow',damageType});
    }else if(e.atkSchedule?.delivery?e.atkSchedule.delivery==='projectile':rangeR>0){
      spawnProjectile({sx:e.x,sy:e.y,x:e.x,y:e.y,tx:tgt.col,ty:tgt.row,target:tgt,owner:e,enemy:true,dmg,damageType,
        speed:window.ArkExternalCombat?.projectileSpeed(e,ENEMY_PROJECTILE_SPEED)??ENEMY_PROJECTILE_SPEED,
        life:e.atkSchedule?.projectileLifeTime??6,kind:damageType==='arts'?'orb':'arrow',
        sourceSkillPacket:window.ArkEnemySkills?.projectilePacket(e.atkSchedule)});
    }else if(gameRandom()>=operatorDodge(tgt)){
      inflictDamage(tgt,dmg,false,damageType,false,{source:e});gainOperatorSp(tgt,'INCREASE_WHEN_TAKEN_DAMAGE',1);
      applyEnemyEpDamage(e,tgt);if(tgt.hp<=0)tryKill(tgt);
    }
    const hitEffect=window.ArkEnemySkills?.finalHitEffect(e.atkSchedule);
    if(hitEffect)(B.combatEffects||=[]).push({kind:'enemy-melee-finish',effectKey:hitEffect.effectKey,
      x:tgt.col,y:tgt.row,at:B.time,duration:.25});
  }
  if(validTargets.length)window.ArkEnemySkills?.onOutputAttackOrHeal(e,e.atkSchedule);
  return validTargets;
}
function finishEnemyAttack(e){
  window.ArkEnemySkills?.finish(e,e.atkSchedule);
  e.atkPhase=null;e.atkTimer=0;e.atkTarget=null;e.atkTargets=null;e.atkSchedule=null;
}
function enemySelectiveContext(){
  const candidates=[...B.operators,...(B.summoneds||[])];
  return {time:B.time,candidates,allEntities:[...candidates,...B.enemies]};
}
function advanceEnemyAttachedProjectile(p,dt){
  if(B.time+1e-9<p.resolveAt&&p.life>dt)return;
  const packet=p.enemyActionPacket;
  for(const target of window.ArkEnemyAttachedProjectiles.areaVictims(p,enemySelectiveContext())){
    if(gameRandom()<operatorDodge(target))continue;
    const amount=enemyDamagePacketToOperator(packet.atk,packet.outputScale,target,packet.damageType,p.owner);
    inflictDamage(target,amount,false,packet.damageType,false,{source:p.owner});
    gainOperatorSp(target,'INCREASE_WHEN_TAKEN_DAMAGE',1);if(target.hp<=0)tryKill(target);
  }
  spawnHitParticles(p.tx,p.ty);p.life=0;
}
function advanceEnemySelectiveProjectile(p,dt){
  const context=enemySelectiveContext(),packet=p.enemyActionPacket;
  p.target=window.ArkEnemySelectiveAttacks?.projectileTarget(p,context)||null;
  if(p.target){p.tx=p.target.col??p.target.x;p.ty=p.target.row??p.target.y;}
  const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),step=p.speed*Math.min(dt,p.life);
  const forced=packet.projectile.movement.forceReachedWhenTimeup&&p.life<=dt;
  if(d>step&&d>=.02&&!forced){p.x+=dx/d*step;p.y+=dy/d*step;return;}
  p.x=p.tx;p.y=p.ty;
  for(const target of window.ArkEnemySelectiveAttacks?.areaVictims(p,context)||[]){
    if(target.col!=null){
      if(gameRandom()<operatorDodge(target))continue;
      const amount=enemyDamagePacketToOperator(packet.atk,packet.outputScale,target,packet.damageType,p.owner);
      inflictDamage(target,amount,false,packet.damageType,false,{source:p.owner});
      gainOperatorSp(target,'INCREASE_WHEN_TAKEN_DAMAGE',1);
      if(target.hp<=0)tryKill(target);
    }else{
      // A forced same-side trace is enemy-origin damage: no operator hit,
      // talent, attack-SP or operator kill attribution may be manufactured.
      const neutral={atkType:packet.damageType,combatTalents:[],buffs:[]};
      const amount=packet.outputScale===0?0:calcDamageResult(neutral,target,1,{raw:packet.atk,type:packet.damageType}).amount*packet.outputScale;
      inflictDamage(target,amount,false,packet.damageType,false,{source:p.owner});
      if(target.hp<=0)killEnemy(target);
    }
  }
  spawnHitParticles(p.x,p.y);p.life=0;
}
function finishEnemyProjectile(p){
  if(!p.enemyChain||p.enemyCompleted)return;
  p.enemyCompleted=true;
  const e=p.owner,schedule=e?.atkSchedule;
  // A former cast cannot finish a newly started cast after a mode change.
  if(!schedule||schedule.projectileToken!==p.castToken)return;
  schedule.pendingProjectiles=Math.max(0,(schedule.pendingProjectiles||0)-1);
  if(schedule.pendingProjectiles===0&&p.enemyChain.lifecycle?.waitForProjectileInvalid){
    finishEnemyAttack(e);
  }
}
function resolveEnemyChain(p){
  if(p.enemyCompleted)return;
  const contract=p.enemyChain,packet=p.attackPacket,chain=contract.chain;
  const pool=[...B.operators,...(B.summoneds||[])];
  const valid=o=>o&&!o.dead&&!o.untargetable&&!o.targetFree&&!o.removed&&o.col!=null&&
    o.deployAt<=B.time&&(o.deployT||0)>=1&&pool.includes(o);
  // Losing the trace target does not turn this attack into an area hit.
  if(!valid(p.target))return;
  const used=new Set();let target=p.target,previous={col:p.sx,row:p.sy};
  for(let index=0;target&&index<chain.maxTargets;index++){
    used.add(target);
    const scale=Math.pow(chain.decay,index);
    (B.combatEffects||=[]).push({kind:'chain',sx:previous.col,sy:previous.row,x:target.col,y:target.row,at:B.time,duration:.25});
    if(gameRandom()>=operatorDodge(target)){
      const atk=packet.atk*scale*(window.ArkEnemyCold?.frozen(target,B.time)?packet.frozenAttackScale:1);
      const dmg=scale===0?0:enemyDamagePacketToOperator(atk,packet.outputScale,target,packet.damageType,p.owner);
      inflictDamage(target,dmg,false,packet.damageType,false,{source:p.owner});
      gainOperatorSp(target,'INCREASE_WHEN_TAKEN_DAMAGE',1);
      if(contract.element)window.ArkElements?.add(target,contract.element.type,packet.atk*scale*contract.element.ratio);
      if(target.hp<=0)tryKill(target);
    }
    previous=target;
    // Source selector is chained and forbids repeats. Nearest selection and
    // stable board order for equal distance remain an explicit model inference.
    target=pool.filter(o=>valid(o)&&!used.has(o)&&Math.hypot(o.col-previous.col,o.row-previous.row)<=chain.radius)
      .map((o,index)=>({o,index,d:Math.hypot(o.col-previous.col,o.row-previous.row)}))
      .sort((a,b)=>a.d-b.d||a.index-b.index)[0]?.o||null;
  }
}
function refreshEnemyModeProviders(e){
  if(!B)return;
  if(window.ArkEnemyHover?.refresh(e,B.time))window.ArkOperatorCombat?.assignBlocks();
  window.ArkExternalCombat?.updateModeProviders(e,{blocked:!!window.ArkOperatorCombat?.blockerOf(e),
    silenced:e.silenced===true||e.silenceUntil>B.time});
}
function advanceEnemyPeriodic(e,dt){
  if(!B)return;
  window.ArkEnemyPeriodic?.tick(e,dt,{time:B.time,candidates:[...B.operators,...(B.summoneds||[])],
    attackPower:enemyAttackPower,
    selfDamage:(owner,amount)=>{
      inflictDamage(owner,amount,false,'true',true,{skipModifierEvents:true,source:owner});
      if(owner.hp<=0)killEnemy(owner);
    },
    element:(target,type,amount,owner)=>window.ArkElements?.add(target,type,amount,owner)});
}
function enemyAttackPower(e,attackScale=1){
  let atk = Math.max(0,(window.ArkExternalCombat?.attribute(e,'atk',e.atk)??e.atk)*(window.ArkElements?.atkScale(e)??1)-(window.ArkFlowShape?.stolen(e,'atk')||0));
  if (e.apopUntil && e.apopUntil > B.time) atk *= (e.apopFactor || 0.5);        // 凋亡：攻击降低
  if (e.rampageUntil && e.rampageUntil > B.time) atk *= 1.5;                     // 狂躁：攻击提升
  atk *= window.ArkOperatorCombat?.attackMultiplier?.(e)??1;
  return atk*attackScale;
}
function performEnemyAuraDamage(source,target,packet){
  if(gameRandom()<operatorDodge(target))return;
  const amount=enemyDamagePacketToOperator(enemyAttackPower(source,packet.atkScale),
    window.ArkExternalCombat?.outputDamageScale(source)??1,target,packet.kind,source);
  inflictDamage(target,amount,false,packet.kind,false,{source});
  if(target.hp<=0)tryKill(target);
}
function enemyDamageToOperator(e, op, attackScale=1, damageType=e.atkType) {
  const atk=enemyAttackPower(e,attackScale)*(window.ArkEnemyCold?.attackScale(e,op,B.time)??1);
  return enemyDamagePacketToOperator(atk,window.ArkExternalCombat?.outputDamageScale(e)??1,op,damageType,e,
    window.ArkEnemySkills?.defensePenetration(e,e.atkSchedule)??0);
}
function enemyDamagePacketToOperator(atk,outputScale,op,damageType,source,defPenetrate=0){
  const def=operatorDefense(op)*(1-Math.max(0,Math.min(1,defPenetrate)));
  const res=operatorResistance(op);
  const taken=(op.dmgTaken||1)*(['true','elemental'].includes(damageType)?1:(op.cooperationResistance||1))*(window.ArkElementOperators?.protection(op)??1)*(window.ArkDollkeeper?.protection(op,damageType||'phys')??1)*(window.ArkTactician?.protection(op,source)??1);
  if(outputScale===0)return 0;
  if (damageType === 'true') return Math.max(1,Math.round(atk*taken*outputScale));
  if (damageType === 'arts') return Math.max(1, Math.round(Math.max(atk*.05,atk*(1-res/100))*taken*outputScale));
  return Math.max(1, Math.round(Math.max(atk*.05,atk-def)*taken*outputScale));
}
// 敌人施放技能（主动）：强化攻击 / 晕眩 / 加速
function castEnemySkill(e) {
  const s = e.skill;
  const tgt = B.operators.find(o => !o.dead && Math.hypot(e.x - o.col, e.y - o.row) <= 0.6)
    || B.operators.filter(o => !o.dead).sort((a, b) => Math.hypot(e.x - a.col, e.y - a.row) - Math.hypot(e.x - b.col, e.y - b.row))[0];
  switch (s.skillType) {
    case 'strong_attack':
      if (tgt) { const dmg = enemyDamageToOperator({ ...e, atk: e.atk * (s.blackboard.atk_scale || 2) }, tgt); inflictDamage(tgt,dmg,false,null,false,{source:e}); gainOperatorSp(tgt, 'INCREASE_WHEN_TAKEN_DAMAGE', 1); if (tgt.hp <= 0) tryKill(tgt); }
      break;
    case 'stun':
      if (tgt) tgt.stunUntil = B.time + (s.blackboard.stun || s.blackboard.duration || 3);
      break;
    case 'speed_up':
      e.moveBoost = s.blackboard.move_speed || 1.5;
      e.moveBoostUntil = B.time + (s.blackboard.duration || 3);
      break;
    case 'invisible':
      e.invisibleUntil = B.time + (s.blackboard.duration || 5);
      break;
    case 'summon':
      if (e.extraEnemyKeyList && e.extraEnemyKeyList.length) {
        for (const mid of e.extraEnemyKeyList) spawnEnemyAt(mid, e);
      }
      break;
    case 'teleport':
      e.cp += 3;   // 沿路线瞬移前进
      break;
  }
}

function gainOperatorSp(o, type, amount) {
  const s = o.skill;
  if (!s || s.isPassive || o.dead || o.skillState&&!window.ArkSkillToggle?.active(o) || window.ArkDollkeeper?.active(o) || o.deployAt > B.time || amount <= 0 || window.ArkElements?.skillLocked(o) || window.ArkMedicDrone?.full(o)) return;
  if(type!=='INCREASE_WITH_TIME'&&window.ArkDirectSkills?.actionLocked?.(o))return;
  const recovery = s.timingApproximate ? 'INCREASE_WITH_TIME' : (s.spType || 'INCREASE_WITH_TIME');
  if (recovery !== type) return;
  o.sp = Math.min(s.spCost * (s.maxCharge || 1), (o.sp || 0) + amount);
}
// 原始 Boss 技能明确的目标、延迟与伤害类型；不借用普通攻击弹道或猜测阶段切换。
function resolveBossSkillEvents(){
  const waiting=[];
  for(const event of B.bossSkillEvents||[]){
    if(event.owner.dead)continue; // 本地生命周期约定；原始附着Buff是否在施法者死亡后存续尚待取证。
    if(event.at>B.time){waiting.push(event);continue;}
    const source={...event.owner,atk:event.baseAtk*event.atkScale,atkType:event.damageType};
    for(const op of event.targets){
      if(op.dead||!B.operators.includes(op)||op.deployAt>B.time||(op.deployT||0)<1)continue;
      if(gameRandom()<operatorDodge(op))continue;
      inflictDamage(op,enemyDamageToOperator(source,op),false,null,false,{source:event.owner});gainOperatorSp(op,'INCREASE_WHEN_TAKEN_DAMAGE',1);
      applyEnemyEpDamage({atk:event.baseAtk,epAttack:event.epDamageRatio,epType:event.elementType},op,event.owner);
      spawnHitParticles(op.col,op.row);if(op.hp<=0)tryKill(op);
    }
  }
  B.bossSkillEvents=waiting;
}

function operatorDodge(o) {
  return Math.max(o.dodge || 0,operatorAttackProfile(o).traitDodge||0, ...(o.buffs || []).filter(b => b.until > B.time).map(b => b.dodge || 0));
}

function endOperatorSkill(o, reason='end') {
  const state = o.skillState;
  if (!state) return;
  window.ArkOperatorCombat?.expire(o);
  window.ArkDirectSkills?.expire?.(o,reason);
  window.ArkElementOperators?.expire(o);
  window.ArkClientPrograms?.stop(o);
  o.range = state.range; o.rangeGrids = state.rangeGrids; o.cells = state.cells;
  for (const [key, delta] of Object.entries(state.deltas)) o[key] -= delta;
  o.hp = Math.min(o.hp, o.maxHp);
  o.buffs = (o.buffs || []).filter(b => b.skillState !== state);
  o.skillState = null; o.skillFx = 0;
  window.ArkSkillEndEffects?.finish(o,B.time,reason);
  window.ArkTactician?.skillEnd(o);
  window.ArkDollkeeper?.skillEnd(o,state,reason);
  o._liberatorCharge=o._retainLiberatorCharge||0;o._retainLiberatorCharge=0;o._bardTick=0;
}

// 盟约事件重新计算基础属性时，保留正在生效的技能增量；结束技能后回到新的基础值。
function updateOperatorBaseStats(o, src) {
  o.garrisonStats=src.garrisonStats;
  o.attributeBase=src.attributeBase;
  const state = o.skillState, delta = state ? state.deltas : {};
  const hpBefore = o.maxHp, hpCurrentBefore = o.hp;
  for (const key of ['atk','maxHp','def']) o[key] = src[key] + (delta[key] || 0)+(key==='maxHp'?(window.ArkElementOperators?.hpBonus(o)||0):0);
  o.attackTime = src.attackTime+(delta.attackTime||0);
  if(src.basicAttack)o.basicAttack=src.basicAttack;
  if(src.combatTalents)o.combatTalents=src.combatTalents;
  const rangeBonus = state ? o.range - state.range : 0;
  o.range = src.range + rangeBonus;
  if (state) state.range = src.range;
  for (const key of ['blockCnt','respawnTime','reviveChance','dmgTaken','cooperationDamage','cooperationResistance']) o[key] = delta[key] ? (src[key]||0)+delta[key] : src[key];
  const dh = o.maxHp - hpBefore;
  o.hp = dh > 0 ? o.hp + dh : Math.min(o.hp, o.maxHp);
  window.ArkDollkeeper?.rebind(o,hpBefore,hpCurrentBefore);
  window.ArkClientPrograms?.rebind(o,hpBefore,hpCurrentBefore,src.maxHp+(window.ArkElementOperators?.hpBonus(o)||0),B.time);
  window.ArkClientPrograms?.rebindRange(o,src.rangeGrids,B.time);
}

function skillTargets(o, s, entities) {
  const cells = rangeCellsFor({ ...o, rangeGrids:s.rangeGrids || o.rangeGrids });
  return entities.filter(e => !e.dead && !(e.deployAt > B.time) && !(e.invisibleUntil > B.time)
    && (e.col!=null?(cells?cells.some(c=>e.row===c[0]&&e.col===c[1]):dist(o,e)<=o.range):enemyInOperatorRange(o,e,cells)));
}

function castSkill(o) {
  const s = o.skill;
  const toggle=window.ArkSkillToggle?.deactivate(o);
  if(toggle!=null)return toggle;
  if (!s || s.isPassive || window.ArkDollkeeper?.active(o) || !operatorCanAct(o) || sourceHealingBusy(o) || o.skillState || o.deployAt > B.time || !(s.spCost > 0) || o.sp < s.spCost || window.ArkElements?.skillLocked(o)) return false;
  if(window.ArkHunter?.canCast(o)===false||window.ArkTactician?.canCast(o)===false||window.ArkCommonSkills?.canCast(o)===false)return false;
  if(window.ArkMedicSkills?.canCast(o)===false)return false;
  if(window.ArkDirectSkills?.canCast(o)===false)return false;
  if((s.combatMechanic?.instant||s.combatMechanic?.replacementHeal)&&window.ArkOperatorCombat?.canCast(o)===false)return false;
  const effects = s.effects || [];
  const tgt = skillTargets(o, s, B.enemies);
  const allies = skillTargets(o, s, B.operators);
  const need = type => effects.some(e => e.type === type);
  if ((need('burst_damage') || need('aoe_damage') || need('snipe')) && !tgt.length) return;
  if (need('heal') && !allies.some(a => directHealAllowed(o,a)&&a.hp < a.maxHp)) return;
  o.sp -= s.spCost;
  emitBattleSfx(need('heal')||s.medicMechanic||s.commonMechanic?.kind==='self-recovery'?'b_char_healboost':need('buff_def')?'b_char_defboost':'b_char_atkboost');
  const duration = s.directSkill?0:window.ArkClientPrograms?.duration(o)??(s.tacticalInstant||s.combatMechanic?.immediate||s.medicMechanic&&s.medicMechanic.kind!=='sustain'?0:s.ammoCount>0?Number.MAX_SAFE_INTEGER-B.time:s.duration < 0 ? (s.timingApproximate ? 0 : Number.MAX_SAFE_INTEGER-B.time) : (s.duration || 0));
  const state = { until:s.ammoCount>0?Number.MAX_SAFE_INTEGER:B.time + duration, ammo:s.ammoCount||0, range:o.range, rangeGrids:o.rangeGrids, cells:o.cells, deltas:{} };
  if (duration > 0) o.skillState = state;
  if (duration > 0 && s.rangeGrids) { o.rangeGrids = s.rangeGrids; o.cells = rangeCellsFor(o); }
  flash(o.name + ' 释放「'+s.name+'」');
  o.skillFx = B.time + (duration || 1.6);
  for (const eff of effects) {
    if (eff.type === 'buff_range' && s.rangeGrids) continue; // 精确格范围优先于分类器的半径近似
    applyEffect(o, eff, tgt, allies, o.skillState);
  }
  window.ArkClientPrograms?.start(o,B.time);
  window.ArkSkillModes?.start(o);
  window.ArkDirectSkills?.cast(o);
  window.ArkOperatorCombat?.cast(o);
  window.ArkElementOperators?.cast(o);
  window.ArkCommonSkills?.cast(o);
  window.ArkMedicSkills?.cast(o);
  window.ArkHunter?.cast(o);
  window.ArkMystic?.cast(o);
  window.ArkDollkeeper?.cast(o);
  window.ArkTactician?.cast(o);
  window.ArkFlowShape?.cast(o);
  notifyOperatorSkillStarted(o);
  return true;
}

function notifyOperatorSkillStarted(o) {
  window.ArkElements?.onAction(o);
  if (o.garrisonAdd && window.onBondGarrison) window.onBondGarrison('skill', o);
  window.ArkMedicSkills?.onSkillStarted(o);
  window.ArkEquipSkillStacks?.onSkillStarted(o,{seasonId:typeof G==='undefined'?null:G?.seasonId,random:gameRandom});
}

// 按触发时机施放事件效果（onDeploy/onAttack），带概率判定
function applyEvents(o, trigger, tgt, allies) {
  for (const eff of (o.events || [])) {
    if (eff.trigger !== trigger) continue;
    if (eff.prob != null && gameRandom() >= eff.prob) continue;
    applyEffect(o, eff, tgt, allies);
  }
}

// 单个效果算子：原子效果，依次执行综合成最终技能效果
function applyEffect(o, eff, tgt, allies, skillState) {
  const p = eff.power, flat = !!eff.flat;
  const rawDuration = (eff.duration != null) ? eff.duration : ((o.skill && o.skill.duration) || 0);
  const dur = skillState?.ammo>0?Number.MAX_SAFE_INTEGER-B.time:rawDuration < 0 ? Number.MAX_SAFE_INTEGER-B.time : rawDuration;
  const temporary = (key, delta) => { o[key] += delta; if (skillState) skillState.deltas[key] = (skillState.deltas[key] || 0) + delta; };
  const buff = values => o.buffs.push({ ...values, ...(skillState ? { skillState } : {}) });
  switch (eff.type) {
    case 'burst_damage': {
      const t = tgt.slice().sort((a,b)=>dist(o,a)-dist(o,b)).slice(0, 3);
      for (const e of t){const d=calcDamageResult(o,e,p);hitEnemy(o,e,d.amount,false,d.type);}
      break;
    }
    case 'aoe_damage':
      for (const e of tgt){const d=calcDamageResult(o,e,p);hitEnemy(o,e,d.amount,false,d.type);}
      break;
    case 'snipe': {
      const t = tgt.slice().sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
      if (t){const d=calcDamageResult(o,t,p);hitEnemy(o,t,d.amount,false,d.type);}
      break;
    }
    case 'heal': {
      const t = allies.filter(a => directHealAllowed(o,a)&&a.hp < a.maxHp).sort(healingOrder)[0];
      if (t) healOperator(o,t,flat?p:operatorAttackPower(o,buffMul(o).atk)*p);
      break;
    }
    case 'buff_atk': if (flat) temporary('atk', p); else buff({ atk: 1 + p, aspd: 1, until: B.time + (dur||6) }); break;
    case 'buff_atkspd': buff({ atk: 1, aspd: 1 + p, until: B.time + (dur||5) }); break;
    case 'buff_attack_interval': temporary('attackTime',Math.max(.05,o.attackTime+p)-o.attackTime); break;
    case 'buff_def': if (flat) temporary('def', p); else buff({ atk: 1, aspd: 1, def: 1 + p, until: B.time + (dur||8) }); break;
    case 'buff_quick': buff({ atk: 1 + (p.atk||0), aspd: 1 + (p.aspd||0), until: B.time + (dur||6) }); break;
    case 'heal_self': o.hp = Math.min(o.maxHp, o.hp + Math.round(flat ? p : o.maxHp * p)); break;
    case 'dp_gain': if (window.onSkillDp) window.onSkillDp(p,o); break;
    case 'buff_maxhp': { const inc = flat ? p : Math.round(o.maxHp * p); temporary('maxHp', inc); o.hp += inc; break; }
    case 'slow': for (const e of tgt) { e.slowUntil = B.time + 3; e.slowFactor = 1 - p; } break;
    case 'dodge': if (skillState) buff({ dodge:p, until:skillState.until }); else o.dodge = Math.max(o.dodge || 0, p); break;
    case 'buff_range': o.range = (o.range || 1) + p; o.cells = null; break;
    case 'debuff_def': for (const e of tgt) { e.defDebuffUntil = B.time + 4; e.defDebuff = 1 + p; } break;
    case 'shield': o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp * p)); break;
    case 'ep_damage': {
      for (const e of tgt) window.ArkElements?.add(e,eff.epType,operatorAttackPower(o,buffMul(o).atk)*(eff.power||0),o);
      break;
    }
  }
}

function triggerEpBurst(e,type){return window.ArkElements?.burst(e,type);}
function applyEnemyEpDamage(e,op,owner=e,sourceSkillPacket){
  window.ArkElementOperators?.onAttacked(owner,op);
  // Imported skills carry their complete damage payload. Ordinary attack EP
  // is not an additional skill effect; the real on-attacked event still fires.
  if(sourceSkillPacket?.skillId||['selector-cooldown-area-melee','selector-sp-multi-melee'].includes(owner.atkSchedule?.skillKind))return;
  const sourcePacket=window.ArkEnemyPeriodic?.normalElement(owner,owner.atkSchedule,enemyAttackPower(owner));
  if(sourcePacket!==undefined){
    if(sourcePacket)window.ArkElements?.add(op,sourcePacket.type,sourcePacket.amount,owner);
    return;
  }
  if(e.epAttack)window.ArkElements?.add(op,e.epType,e.atk*(window.ArkElements?.atkScale(owner)??1)*e.epAttack);
}
function triggerOpEpBurst(op,type){return window.ArkElements?.burst(op,type);}

function leak(e) { emitBattleSfx('b_ui_dooralarm');if(B.stats)B.stats.leaks++;B.shield -= (e.lifePointReduce || 1); if (window.onLeak) window.onLeak(e); }
window.haltBattle = function(win) { if (B && !B.over) { B.over = true; B.win = !!win; if (window.onBattleEnd) window.onBattleEnd(!!win, B.shield); } };
// ADD_BOND 层数变化后，由 mode.js 回写每个在场干员的属性（按 id 对齐 G.ops）
window.__setAllOpStats = function(fn) {
  if (!B || !B.operators) return;
  for (const o of B.operators) fn(o);
};

function tryKill(o) {
  if(o.dead)return;
  if(window.ArkOperatorCombat?.immortal(o)||window.ArkDollkeeper?.immortal(o)){o.hp=1;return;}
  if(window.ArkTactician?.lethal(o))return;
  if(o.combatToken){o.dead=true;window.ArkMedicSkills?.clear(o);window.ArkElements?.clear(o);window.ArkEnemyCold?.clear(o);window.ArkSkillEndEffects?.clear(o,{cancelPending:true});return;}
  if(window.ArkDollkeeper?.lethal(o))return;
  if (o.reviveChance && gameRandom() < o.reviveChance) {
    o.hp = Math.max(1, Math.round(o.maxHp * 0.5));
    o.reviveChance = 0;
    flash(o.name + ' 触发不屈复活');
    return;
  }
  o.dead = true;
  delete o.sourceHealAction;
  window.ArkMedicSkills?.clear(o);
  window.ArkEquipSkillStacks?.clear(o);
  window.ArkCommonSkills?.clearDeployment(o);
  window.ArkEnemyCold?.clear(o);
  window.ArkOperatorCombat?.death(o);
  window.ArkDirectSkills?.death(o);
  window.ArkTactician?.death(o);
  window.ArkElementOperators?.death(o);
  window.ArkElements?.clear(o);
  endOperatorSkill(o,'death');
  window.ArkSkillEndEffects?.clear(o,{cancelPending:true});
  o._liberatorCharge=0;o._bardTick=0;
  o.respawnTotal = window.ArkClientPrograms?.respawnTime?.(o,o.respawnTime??RESPAWN_TIME)??(o.respawnTime??RESPAWN_TIME);
  o.respawnAt = B.time + o.respawnTotal;   // 原地等待复活（不撤离）
  o.respawnCost = (o.cost != null) ? o.cost : RESPAWN_COST;
  flash(o.name + ' 阵亡，原地等待复活');
  if (o.garrisonAdd && window.onBondGarrison) window.onBondGarrison('dead', o);
}
// 干员阵亡后原地等待复活：CD 转好且资金足够→立即自动复活；资金不足→继续等资金自然回复
function respawnOperators() {
  for (const o of B.operators) {
    if (!o.dead || o.respawnAt == null || B.time < o.respawnAt) continue;
    if (window.onRespawn && !window.onRespawn(o.respawnCost,o)) continue;
    o.dead = false; o.hp = o.maxHp; o.sp = (o.skill && o.skill.initSp) || 0;
    delete o.sourceHealAction;
    window.ArkSkillEndEffects?.clear(o,{cancelPending:true});
    window.ArkEnemyCold?.clear(o);
    o._garrisonStarted=false;o.deployed=false;o.deployT=0;delete o.sourceDeploymentStarted;
    o.cd = 0; o.stunUntil = 0; o.respawnAt = null; o.respawnCost = null;
    flash(o.name + ' 复活');
  }
}

// ---- 相机运镜：基于泰特-布莱恩角(Pitch/Roll/Yaw)的 3D 透视投影，自动缩放保证全格入屏 ----
let sceneCanvas = null, sceneCtx = null, sceneScale = 1, sceneLogicalW = 0, sceneLogicalH = 0;
let sceneOriginX = 0, sceneOriginY = 0;
let terrainCanvas = null, terrainCtx = null, terrainCacheKey = '', terrainVersion = 0;
let terrainScreenCanvas = null, terrainScreenCtx = null, terrainScreenKey = '';
let frameRenderCounts = null;
let fitS = 1, fitOx = 0, fitOy = 0;
// 离屏表面仅包含当前战区；坐标仍是原地图坐标，不改变部署、寻路或命中判定。
const MAX_SCENE_SIDE = 4096;
const MAX_SCENE_PIXELS = 2 * 1024 * 1024;
function sceneRenderScale(mapW, mapH) {
  // Use the target magnification: camera interpolation must not resize both
  // textures repeatedly while crossing integer scale boundaries.
  const need = Math.max(1, Math.ceil(window.__fitGoal?.s || fitS));
  const cap = Math.min(MAX_SCENE_SIDE / Math.max(1, mapW), MAX_SCENE_SIDE / Math.max(1, mapH),
    Math.sqrt(MAX_SCENE_PIXELS / Math.max(1, mapW * mapH)));
  return Math.min(need, cap, renderProfile().sceneScaleMax);
}
function sceneRenderBounds() {
  const lv=BDATA.level,cols=lv.halfBoard?Math.ceil(lv.cols/2):lv.cols,wr=battleClipRect();
  const left=Math.max(0,Math.floor(wr?.colLeft??0)),right=Math.min(cols,Math.ceil(wr?.colRight??cols));
  const top=Math.max(0,Math.floor(wr?.rowTop??0)),bottom=Math.min(lv.rows,Math.ceil(wr?.rowBot??lv.rows));
  return {x:left*TILE,y:top*TILE,width:Math.max(1,(right-left)*TILE),height:Math.max(1,(bottom-top)*TILE)};
}
function observeRenderSurface(surface) {
  surface.addEventListener?.('contextlost',()=>{
    invalidateTerrainCache();
    window.ArkRender?.setQuality('low');
    if(canvas)canvas.dataset.contextLosses=String(Number(canvas.dataset.contextLosses||0)+1);
  });
  surface.addEventListener?.('contextrestored',()=>invalidateTerrainCache());
}
function invalidateTerrainCache() {
  terrainVersion++;
  terrainCacheKey = '';
  terrainScreenKey = '';
}
if (typeof window !== 'undefined' && window.ArkRender) {
  window.ArkRender.onQualityChange(() => invalidateTerrainCache());
  window.setRenderQuality = value => window.ArkRender.setQuality(value);
  window.getRenderQuality = () => ({ requested:window.ArkRender.getRequestedQuality(), profile:window.ArkRender.getProfile() });
}
function isVisibleMapPoint(x, y, padding) {
  return !(typeof window !== 'undefined' && window.ArkRender)
    || window.ArkRender.isMapPointVisible(x, y, battleClipRect(), padding);
}
// 镜头取景与地图边界分开：共享战场只裁上下区段，不在左右镜头交界处切断地形/单位/弹道。
function battleClipRect() {
  const wr=window.__winRect;
  if(!wr || window.__preview || !(window.__bossBattle || B?._garrisonJointDefense))return wr;
  return {...wr,colLeft:0,colRight:BDATA.level.cols};
}
function largeBossArtBox(enemy) {
  if(enemy.dead || !window.ArkBossMechanics?.stationary(enemy))return null;
  const rect=window.ArkBossMechanics.rect(enemy);
  if(!rect || rect.xMax-rect.xMin<=1 || rect.yMax-rect.yMin<=1)return null;
  return {x:rect.xMin+.5,y:rect.yMin+.5,width:rect.xMax-rect.xMin,height:rect.yMax-rect.yMin};
}
function largeBossArtVisible(box) {
  const clip=battleClipRect();
  return !clip || box.x+box.width>=clip.colLeft&&box.x<=clip.colRight&&box.y+box.height>=clip.rowTop&&box.y<=clip.rowBot;
}
function drawLargeBossArt(enemy,box) {
  const im=getEnemyAvatar(enemy.enemyId),x=box.x*TILE,y=box.y*TILE,w=box.width*TILE,h=box.height*TILE;
  ctx.save();
  if(im.complete&&im.naturalWidth>0&&im.naturalHeight>0){
    // 完整图鉴图按原比例放进受击区域；不能把 enemy_portraits 中的 Spine 图集直接当整图。
    const scale=Math.min(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*scale,ih=im.naturalHeight*scale;
    ctx.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
  }else{
    ctx.fillStyle='rgba(45,57,70,.55)';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#ded8ca';ctx.font='bold '+Math.round(TILE*.25)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(enemy.name||'领袖',x+w/2,y+h/2,w-8);
  }
  ctx.restore();
}
const CAM = { pitch: -25 * Math.PI/180, roll: -5 * Math.PI/180, yaw: 5 * Math.PI/180 };  // 聚焦视角（选中/拖动）：相对初始约 pitch-5° roll-5° yaw+5°（小角度；roll 方向已按反馈反转）
const CAM_BASE = { pitch: -20 * Math.PI/180, roll: 0, yaw: 0 };  // 初始/默认：仅俯角、俯视桌面（近下远上）；原版 scene/pcConfig 俯角≈20°，滚转/偏航为0
function project(u, v, f) {
  // 默认俯视视角（保留原 3D 俯视角度）；状态间只做平移/缩放，不改变朝向角度（无朝向旋转）
  const cx = canvas.width/2, cy = canvas.height/2;
  const x = u - cx, y = v - cy;
  const p = CAM_BASE.pitch + (CAM.pitch - CAM_BASE.pitch) * f;
  const r = CAM_BASE.roll + (CAM.roll - CAM_BASE.roll) * f;
  const yw = CAM_BASE.yaw + (CAM.yaw - CAM_BASE.yaw) * f;
  const sp=Math.sin(p), cp=Math.cos(p), sr=Math.sin(r), cr=Math.cos(r), sw=Math.sin(yw), cw=Math.cos(yw);
  // z=0 平面依次做 roll(Rz)→pitch(Rx)→yaw(Ry)，再做透视投影
  const x1 = x*cr - y*sr, y1 = x*sr + y*cr;
  const x2 = x1, y2 = y1*cp, z2 = y1*sp;
  const X = x2*cw + z2*sw, Y = y2, Z = -x2*sw + z2*cw;
  const sz = Math.max(canvas.width, canvas.height);   // 缩放基准
  const w = sz + Z;                                    // 深度（透视前缩）
  return [ cx + sz*X/w, cy + sz*Y/w ];
}
// 商店保留区（底部抽屉占位）动画：收起/展开时镜头平滑拉近/拉远，而非突变
function shopPanelHeight(){
  const panel=document.getElementById('shopdrawer');
  const height=panel&&panel.getBoundingClientRect?panel.getBoundingClientRect().height:0;
  return height>0?height:Math.floor(window.innerHeight/4);
}
function shopReserveNow() {
  if (shopReserve < 0) { shopReserveGoal = window.__shopCollapsed ? 0 : shopPanelHeight(); shopReserve = shopReserveGoal; }
  return shopReserve;
}
window.__setShopReserve = function(collapsed) {
  shopReserveGoal = collapsed ? 0 : shopPanelHeight();
  // 当前值仅在首次 computeFit 时按当时的 __shopCollapsed 初始化，避免首帧突变
};
// 镜头运镜目标：任何时刻选中干员/拖拽(朝向确认/已拖离移动）时为聚焦态，否则回到常态
function camFocusGoal() {
  const focusDrag = drag && (drag.phase === 'facing' || (drag.moved && (drag.type === 'equip' || drag.type === 'move' || drag.type === 'deploy')));
  return ((selected != null) || focusDrag) ? 1 : 0;
}
// 候选区是关卡底部「连续」的 tile_achand 行；开战时只把这段底部候选带移出镜头。
// 只统计从底向上连续的候选行，避免把散布在中部的手牌行误算（否则 19×21 老图会开战即藏掉半张图）。
function battleBenchRowCount() {
  if((B?.bench||[]).some(o=>o.isTactical)||(B?.summoneds||[]).some(s=>window.ArkFlowShape?.copying(s)))return 0;
  const lv = BDATA && BDATA.level;
  if (!lv || !lv.grid || !lv.rows) return 0;
  const visibleCols = lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols;
  let cnt = 0;
  for (let r = lv.rows - 1; r >= 0; r--) {
    const row = lv.grid[r] || [];
    let has = false;
    for (let c = 0; c < visibleCols; c++) if (row[c] === 'tile_achand') { has = true; break; }
    if (!has) break;   // 连续候选带在此断裂：停止
    cnt++;
  }
  return cnt;
}
window.__stepCamera = function(dt) {
  const step = Math.min(1, (dt || 0.05) * CAM_LERP);   // 镜头速率统一：商店保留区 与 干员聚焦 共用 CAM_LERP → 速度一致
  if (shopReserve < 0) shopReserveNow();
  shopReserve += (shopReserveGoal - shopReserve) * step;
  if (Math.abs(shopReserveGoal - shopReserve) < 0.5) shopReserve = shopReserveGoal;   // 收敛吸附到目标
  const bhGoal = (B && B.phase === 'battle') ? battleBenchRowCount() : 0;
  benchHide += (bhGoal - benchHide) * step;
  if (Math.abs(bhGoal - benchHide) < 1e-3) benchHide = bhGoal;
  const goal = camFocusGoal();
  cam.f += (goal - cam.f) * step;
  if (Math.abs(goal - cam.f) < 1e-3) cam.f = goal;      // 收敛吸附，避免长尾抖动
  // 整屏 fit 平滑：viewMode 左/右/总览 + 商店收起/展开 共用 CAM_LERP，避免切半区/总览瞬跳
  const fg = fitGoal(); window.__fitGoal = fg;
  if (!isFinite(fitS)) { fitS = fg.s; fitOx = fg.ox; fitOy = fg.oy; }
  fitS += (fg.s - fitS) * step;
  fitOx += (fg.ox - fitOx) * step;
  fitOy += (fg.oy - fitOy) * step;
};
// 计算当前玩家作战段（中段/2区）的行范围：整行不可部署作为分隔切块，取首个含战场+候选的块；无候选取中间块。
// 供 computeFit（镜头窗口）与模式层候选区定位（candidateCells）共用，保证"干员候选与镜头窗口同区"。
// 关卡纵向分段：上=A 怪物预览 中=B 联防/1-13 战场 下=C 14-15 boss。由「整行不可部署格」天然切分。
// 返回 [[top,bot],...]（格单位，含头不含尾），供 fitGoal 的预览/boss 视图与镜头绝对定位使用。
window.modeBattleSections = function(lv) {
  if (!lv || !lv.grid || !lv.rows) return [];
  const colsW = lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols;
  const blocks = []; let s = 0;
  for (let row = 0; row < lv.rows; row++) {
    let blocked = true;
    for (let c = 0; c < colsW; c++) { const k = lv.grid[row][c]; if (k !== 'tile_forbidden' && k !== 'tile_wall') { blocked = false; break; } }
    if (blocked) { if (row > s) blocks.push([s, row]); s = row + 1; }
  }
  if (s < lv.rows) blocks.push([s, lv.rows]);
  return blocks;
};

window.modeBattleZoneRows = function(lv) {
  if (!lv || !lv.grid || !lv.rows) return null;
  const colsW = lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols;
  const blocks = []; let s = 0;
  for (let row = 0; row < lv.rows; row++) {
    let blocked = true;
    for (let c = 0; c < colsW; c++) { const k = lv.grid[row][c]; if (k !== 'tile_forbidden' && k !== 'tile_wall') { blocked = false; break; } }
    if (blocked) { if (row > s) blocks.push([s, row]); s = row + 1; }
  }
  if (s < lv.rows) blocks.push([s, lv.rows]);
  if (!blocks.length) return null;
  const hasZone = ([a, b]) => { let f = false, ca = false; for (let r = a; r < b; r++) for (let c = 0; c < colsW; c++) { const k = lv.grid[r][c]; if (k === 'tile_start' || k === 'tile_end' || k === 'tile_road') f = true; if (k === 'tile_achand') ca = true; } return f && ca; };
  let pick = null;
  if (window.__bossBattle) {
    // boss：作战区/候选/出怪都取最底部（C）块 —— 运行时置位（由 stage 节点序号决定），默认关闭不影响普通关
    for (let i = blocks.length - 1; i >= 0; i--) { if (hasZone(blocks[i])) { pick = blocks[i]; break; } }
    if (!pick) pick = blocks[blocks.length - 1];
  } else {
    pick = blocks.find(hasZone);
    if (!pick) pick = blocks[Math.floor(blocks.length / 2)] || blocks[0];
  }
  return { lb: pick[0], rb: pick[1] };
};

// 投影后自动适配：把整块棋盘的投影包围盒等比缩放进画布（按需放大/缩小以尽量占满画面=“拉近镜头”），居中，并轻微上移；再钳制保证全部网格不出屏
let previewLayoutCache=null;
function enemyPreviewLayout(){
  const lv=BDATA.level,section=modeBattleSections(lv)[0]||[0,0],wave=window.__previewWave;
  if(!previewLayoutCache||previewLayoutCache.level!==lv||previewLayoutCache.wave!==wave){
    previewLayoutCache={level:lv,wave,result:window.ArkEnemyPreview?.layout(lv,section,wave,lv.sourceKey||lv.id||'preview')||{positions:[],bounds:null}};
  }
  return previewLayoutCache.result;
}
function fitGoal() {
  const W = canvas.width, H = canvas.height;
  // 棋盘真实绘制范围（cols×TILE × rows×TILE）；画布全屏时以此为包围盒做缩放适配。
  // 单玩家作战窗口：13 宽 × 7 高，居中、高度优先占满；从候选区往上数 7 行（底端对齐）。默认俯视角度投影，状态间只平移/缩放、不改朝向。
  const lv = BDATA.level;
  const colsW = lv.halfBoard ? Math.ceil(lv.cols / 2) : lv.cols;
  const viewMode = (typeof window !== 'undefined' && window.viewMode != null) ? window.viewMode : 0;   // 0=左半 1=右半 2=全图总览
  const viewW = viewMode === 2 ? colsW : Math.min(13, colsW), viewH = 7;
  // 关卡纵向三段（上预览/中战场/下 boss），用于「预览块」「boss 块」镜头定位。
  const secs = (window.modeBattleSections && window.modeBattleSections(lv)) || [];
  // 定位默认作战块（2区/中段）：整行不可部署作为分隔切块，取首个「含战场+候选」的块；无候选则取中间块。
  let lb = 0, rb = lv.rows;
  const zr = (window.modeBattleZoneRows && window.modeBattleZoneRows(lv)) || null;   // 与 modeBattleZoneRows 共用块选择（含 boss → 最底部块）
  if (zr) { lb = zr.lb; rb = zr.rb; }
  let colLeft, colRight, rowTop, rowBot;
  if (window.__viewRect && window.__viewRect.colLeft != null) {
    // 绝对定位：调用方直接给出窗口矩形（格级），镜头只平移/缩放到这个矩形，不套 viewMode。
    colLeft = window.__viewRect.colLeft; colRight = window.__viewRect.colRight;
    rowTop = window.__viewRect.rowTop; rowBot = window.__viewRect.rowBot;
  } else if (window.__preview) {
    // 上=怪物预览块：显示该段自身范围（5×7），上方自然留白，不做额外放大。
    const top = secs[0];
    rowTop = (top ? top[0] : 0);
    rowBot = (top ? top[1] : Math.min(viewH, lv.rows));
    const bounds=enemyPreviewLayout().bounds;
    colLeft = bounds?Math.max(0,bounds.colLeft):0; colRight = bounds?Math.min(colsW,bounds.colRight):colsW;
  } else if (window.__bossBattle) {
    // 下=14-15 boss 块：与 B 区共用同一套 左半/右半/总览 窗口，仅块锚定在底部 C 段。
    const bot = secs[secs.length - 1];
    const lbB = (bot ? bot[0] : 0), rbB = (bot ? bot[1] : lv.rows);
    rowBot = rbB;
    rowTop = Math.max(0, lbB - 1);   // boss 块：显示整段，顶部再含块顶上一空行（能放干员最高排之上），避免“少一格”
    colLeft = (viewMode === 2) ? 0 : (viewMode === 1 ? Math.max(0, colsW - viewW) : 0);
    colRight = colLeft + viewW;
  } else {
    // 普通单人作战：中段（1-13 战场）13×7 窗口，左半/右半/总览。
    rowBot = rb;                             // 作战块底端（候选区在块底）
    rowTop = Math.max(0, lb - 1);            // 从「能放干员最高排之上的空行」到「候选区底行」：顶部含块顶上一空行、底部含候选区并贴商店顶，避免“少一格”——左/右半与全图总览均如此
    colLeft = viewMode === 2 ? 0 : (viewMode === 1 ? Math.max(0, colsW - viewW) : 0);   // 总览=全宽；右半=最右13列；左半=最左13列
    colRight = colLeft + viewW;
  }
  const pts = [
    [colLeft*TILE, rowTop*TILE],[colRight*TILE, rowTop*TILE],[colRight*TILE, rowBot*TILE],[colLeft*TILE, rowBot*TILE],
    [(colLeft+colRight)/2*TILE, rowTop*TILE],[colRight*TILE, (rowTop+rowBot)/2*TILE],[(colLeft+colRight)/2*TILE, rowBot*TILE],[colLeft*TILE, (rowTop+rowBot)/2*TILE],
  ];
  let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
  for (const [u,v] of pts) { const [x,y] = project(u,v,cam.f); if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; }
  const bx = mxx-mnx || 1, by = mxy-mny || 1;
  const reserveB = (shopReserve < 0) ? shopReserveNow() : shopReserve;
  const availH = Math.max(40, H - reserveB - hudReserveTop);
  const s = Math.min(Math.max(40,W-16) / bx, availH / by);
  const ox = W / 2 - s * (mnx + mxx) / 2;
  const oy = hudReserveTop + availH/2 - s * (mny + mxy) / 2;
  window.__winRect = { colLeft, colRight, rowTop, rowBot };   // 目标窗口（格级）：供 drawWarped 裁剪，隐藏总览/boss 窗口之外的行(A/C)
  return { s, ox, oy };
}
function computeFit(snap) {
  const g = fitGoal();
  window.__fitGoal = g;
  // 默认吸附（getBoardBox/measure 断言立即反映目标）；drawWarped 传 false 只更新目标，真实 fitS/fitOx/fitOy 由 __stepCamera 插值驱动 → 切半区/总览/商店平滑过渡
  if (snap !== false || !isFinite(fitS)) { fitS = g.s; fitOx = g.ox; fitOy = g.oy; }
}
function mapPoint(u, v, f) { const p = project(u,v,f); return [ fitOx + fitS*p[0], fitOy + fitS*p[1] ]; }
// 棋盘在屏幕上的包围盒（供 HTML overlay 定位候选区/商店等）：投影后 4 角+底边中点范围 + 底边所在行格高
window.getBoardBox = function() {
  if (!BDATA || !BDATA.level) return null;
  computeFit();
  const f = (cam && typeof cam.f === 'number' && isFinite(cam.f)) ? cam.f : 0;   // 未进入渲染循环时用常态视角
  const wW = (BDATA.level.halfBoard ? Math.ceil(BDATA.level.cols / 2) : BDATA.level.cols) * TILE;
  const W = wW, H = BDATA.level.rows * TILE;
  const p00 = mapPoint(0,0,f), p11 = mapPoint(W,H,f), p10 = mapPoint(W,0,f), p01 = mapPoint(0,H,f);
  const xs = [p00[0],p11[0],p10[0],p01[0]], ys = [p00[1],p11[1],p10[1],p01[1]];
  const left = Math.min.apply(null, xs), right = Math.max.apply(null, xs);
  const top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
  const rowTop = mapPoint(0,(BDATA.level.rows-1)*TILE,f)[1], rowBot = mapPoint(0,BDATA.level.rows*TILE,f)[1];
  return { left, right, top, bottom, cx:(left+right)/2, tileH: Math.abs(rowBot - rowTop) };
};
// 屏幕坐标 → 棋盘像素坐标（mapPoint 的逆，供点击/拖拽命中正确格子；倾斜视角下仍对齐）
function unpoint(sx, sy) {
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2, sz = Math.max(W, H);
  const px = (sx - fitOx) / fitS, py = (sy - fitOy) / fitS;
  const Px = px - cx, Py = py - cy;
  const p = CAM_BASE.pitch + (CAM.pitch - CAM_BASE.pitch) * cam.f;
  const r = CAM_BASE.roll + (CAM.roll - CAM_BASE.roll) * cam.f;
  const yw = CAM_BASE.yaw + (CAM.yaw - CAM_BASE.yaw) * cam.f;
  const sp=Math.sin(p), cp=Math.cos(p), sr=Math.sin(r), cr=Math.cos(r), sw=Math.sin(yw), cw=Math.cos(yw);
  const denom = cp*cw + cp*sw*Px/sz - sp*Py/sz;
  const Z = (sp*Py - cp*sw*Px) / denom;          // 透视深度
  const w = sz + Z, X = Px*w/sz, Y = Py*w/sz;
  const x1 = cw*X - sw*Z, y1 = (cw*Z + sw*X) / sp;
  const x = x1*cr + y1*sr, y = -x1*sr + y1*cr;   // 逆 roll
  return [x + cx, y + cy];
}
function drawWarped(sourceCanvas, sourceScale, targetCtx) {
  sourceCanvas = sourceCanvas || sceneCanvas;
  sourceScale = sourceScale || sceneScale;
  targetCtx = targetCtx || ctx;
  computeFit(false);
  // 投影是透视（非仿射），逐格用仿射近似时相邻格会在接缝处出现黑色缝隙/错位。对策：
  // 1) 提高细分 G，让每格的仿射近似更贴近真实投影；2) 对每格做少量过采样(overscan)重叠绘制，进一步盖掉接缝。
  const G = renderProfile().warpGrid, sw = sceneLogicalW, sh = sceneLogicalH;
  // Keep roughly square mesh cells over this region instead of projecting
  // all three vertically stacked battlefields on every frame.
  const cell=Math.max(sw,sh)/G,nx=Math.max(1,Math.ceil(sw/cell)),ny=Math.max(1,Math.ceil(sh/cell)),cw=sw/nx,ch=sh/ny;
  const OVER = Math.max(0.75, Math.min(1.5, cw*0.012));
  // 裁剪到目标窗口（格级）：总览只显示目标区（如 B 区）、boss 只显示 C 区，隐藏窗口之外的行(A/C)。
  const wr = battleClipRect();
  targetCtx.save();
  try {
  if (wr && wr.colLeft != null) {
    const f = cam.f;
    const c0 = mapPoint(wr.colLeft*TILE, wr.rowTop*TILE, f), c1 = mapPoint(wr.colRight*TILE, wr.rowTop*TILE, f);
    const c2 = mapPoint(wr.colRight*TILE, wr.rowBot*TILE, f), c3 = mapPoint(wr.colLeft*TILE, wr.rowBot*TILE, f);
    targetCtx.beginPath(); targetCtx.moveTo(c0[0],c0[1]); targetCtx.lineTo(c1[0],c1[1]); targetCtx.lineTo(c2[0],c2[1]); targetCtx.lineTo(c3[0],c3[1]); targetCtx.closePath(); targetCtx.clip();
  }
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) {
    const localX = Math.max(0, i*cw - OVER), localY = Math.max(0, j*ch - OVER);
    const sx=sceneOriginX+localX,sy=sceneOriginY+localY;
    const dx = Math.min(sw, (i+1)*cw + OVER) - localX, dy = Math.min(sh, (j+1)*ch + OVER) - localY;
    const p00 = mapPoint(sx, sy, cam.f), p10 = mapPoint(sx+cw, sy, cam.f), p01 = mapPoint(sx, sy+ch, cam.f);
    const a = (p10[0]-p00[0])/cw, b = (p10[1]-p00[1])/cw, c = (p01[0]-p00[0])/ch, d = (p01[1]-p00[1])/ch;
    targetCtx.setTransform(a, b, c, d, p00[0]-a*sx-c*sy, p00[1]-b*sx-d*sy);
    // source 使用过采样后的物理像素，destination/投影仍使用地图逻辑坐标；
    // 因此只提高画质，不改变裁剪窗口、镜头跳转或鼠标命中坐标。
    targetCtx.drawImage(sourceCanvas,
      localX*sourceScale, localY*sourceScale, dx*sourceScale, dy*sourceScale,
      sx, sy, dx, dy);
    if(frameRenderCounts)frameRenderCounts.warpDraws++;
  }
  targetCtx.setTransform(1,0,0,1,0,0);
  } finally { targetCtx.restore(); }
}

// 高度来自地图 heightType；方块厚度是本地示意，不推断客户端的实际米数。
// 收在原格内，台面仍覆盖格中心，因此部署、点击和攻击距离使用原来的逻辑格。
function drawHighlandBlock(cx, cy) {
  const inset=3, depth=TILE*0.19, side=TILE*0.08;
  const left=cx+inset, right=cx+TILE-inset, top=cy+inset, bottom=cy+TILE-inset;
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(left,top+depth,right-left,bottom-top-depth);
  ctx.fillStyle='#66798b';ctx.fillRect(left,top,right-left-side,bottom-top-depth);
  ctx.fillStyle='#303e4d';ctx.fillRect(left,bottom-depth,right-left-side,depth);
  ctx.fillStyle='#202b38';ctx.beginPath();ctx.moveTo(right-side,top);ctx.lineTo(right,top+depth);
  ctx.lineTo(right,bottom);ctx.lineTo(right-side,bottom-depth);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#aec2cf';ctx.lineWidth=1.5;ctx.strokeRect(left,top,right-left-side,bottom-top-depth);
  ctx.strokeStyle='rgba(12,21,30,0.45)';ctx.lineWidth=1;
  for(let i=1;i<=3;i++){const x=left+(right-left-side)*i/4;ctx.beginPath();ctx.moveTo(x,bottom-depth+2);ctx.lineTo(x,bottom-2);ctx.stroke();}
}

let routeView='WALK';
function toggleRouteView(){
  routeView=routeView==='WALK'?'FLY':routeView==='FLY'?'OFF':'WALK';terrainVersion++;
  const button=document.getElementById('route-view-btn');
  if(button)button.textContent='路线：'+({WALK:'地面',FLY:'飞行',OFF:'隐藏'}[routeView]);
}
function visibleRouteEdges(level,motion=routeView){
  if(motion==='OFF')return [];
  const active=new Set(level.activeRouteIndices??level.routes.map((_,i)=>i)),seen=new Set(),edges=[];
  for(let i=0;i<level.routes.length;i++){
    const route=level.routes[i];if(!active.has(i)||route.motion!==motion)continue;
    for(const segment of route.segs||[])for(let j=1;j<segment.length;j++){
      const a=segment[j-1],b=segment[j],key=[a.r,a.c,b.r,b.c].join(',');
      if((a.r===b.r&&a.c===b.c)||seen.has(key))continue;
      seen.add(key);edges.push([a,b]);
    }
  }
  return edges;
}
function drawFenceTile(cx,cy){
  // 地面围栏沿格边绘制，保留平坦地面；和蓝灰色高台的实心台面/立面区分。
  ctx.fillStyle='#354739';ctx.fillRect(cx+4,cy+4,TILE-8,TILE-8);
  ctx.strokeStyle='#c5c9c0';ctx.lineWidth=3;ctx.strokeRect(cx+4,cy+4,TILE-8,TILE-8);
  ctx.strokeStyle='#242e35';ctx.lineWidth=2;ctx.strokeRect(cx+7,cy+7,TILE-14,TILE-14);
  ctx.fillStyle='#8c969b';for(const x of [6,TILE-10])for(const y of [6,TILE-10])ctx.fillRect(cx+x,cy+y,4,4);
}

// 绘制棋盘场景（不含相机变换；透视时先画到离屏再贴回）
function drawBoard(options) {
  if (!BDATA) return;
  if (!B) return;   // 尚未开始（开局情报阶段）
  const drawTerrain = !options || options.terrain !== false;
  const drawDynamic = !options || options.dynamic !== false;
  const lv = BDATA.level;
  const colsW = BDATA.level.halfBoard ? Math.ceil(BDATA.level.cols / 2) : BDATA.level.cols;   // 单人只负责左半区：只画左半区网格，网格对齐
  if (drawTerrain) {
  const stone = getTile('stone_000');
  const tStart = getTile('start_000');
  const iconMap = { tile_battle:'monster', tile_event:'event', tile_heal:'rest', tile_reward:'chest', tile_shop:'shop' };
  // mapData also labels void as HIGHLAND. Do not infer solid platform geometry from that flag alone.
  const crates=new Set((lv.devices||[]).filter(t=>t.id==='trap_1105_accrate').map(t=>t.r+','+t.c));
  for (let r=0;r<lv.rows;r++) for (let c=0;c<colsW;c++) {
    const key = lv.grid[r][c];
    const cx = c*TILE, cy = r*TILE;
    // 1) 整幅地图铺地牢石地板（stone_000 左上 256×256 无缝瓦片），形成连贯环境
    if (key==='tile_forbidden') { ctx.fillStyle='#10151e';ctx.fillRect(cx,cy,TILE,TILE); }
    else if (stone.complete && stone.naturalWidth > 0) ctx.drawImage(stone, 0, 0, 256, 256, cx, cy, TILE, TILE);
    else { ctx.fillStyle = '#2a2e39'; ctx.fillRect(cx, cy, TILE, TILE); }
    if (key === 'tile_start') {
      // 出生塔：真实 start_000 贴图
      if (tStart.complete && tStart.naturalWidth > 0) ctx.drawImage(tStart, 0, 0, 256, 256, cx, cy, TILE, TILE);
    } else if (iconMap[key]) {
      // 特殊格（battle/event/heal/reward/shop）：真实图标贴图
      const ic = getTile(iconMap[key]);
      if (ic.complete && ic.naturalWidth > 0) ctx.drawImage(ic, cx+2, cy+2, TILE-4, TILE-4);
    }
    // 地块类型语义区分（还原正确地块）：forbidden=禁格/虚空、road=道路、floor=地板、
    // achand=候选区、acshop=调度中心、wall=墙体、infection=污染、end=漏怪蓝门、telin/telout=传送紫门
    const TINT = {
      tile_forbidden: 'rgba(8,10,15,0.78)',
      tile_road:      'rgba(122,134,162,0.32)',
      tile_floor:     'rgba(96,104,122,0.22)',
      tile_achand:    'rgba(79,195,247,0.24)',
      tile_acshop:    'rgba(255,193,7,0.20)',
      tile_wall:      'rgba(38,44,62,0.88)',
      tile_infection: 'rgba(150,40,160,0.44)',
      tile_deepsea:   'rgba(21,99,136,0.52)',
      tile_end:       'rgba(21,101,192,0.60)',
      tile_telin:     'rgba(106,27,154,0.55)',
      tile_telout:    'rgba(106,27,154,0.55)',
    }[key];
    if (TINT) { ctx.fillStyle = TINT; ctx.fillRect(cx, cy, TILE, TILE); }
    if (key === 'tile_end') {
      ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx+TILE/2, cy+TILE/2, TILE*0.28, 0, 7); ctx.stroke();
    } else if (key==='tile_telin' || key==='tile_telout') {
      ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx+TILE/2, cy+TILE/2, TILE*0.26, 0, 7); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, TILE - 1, TILE - 1);
    const b = lv.buildable[r][c];
    if (b==='MELEE'||b==='ALL') { ctx.fillStyle='rgba(139,195,74,0.30)'; ctx.fillRect(cx+3, cy+3, TILE-6, TILE-6); }
    // 装置可覆盖原围墙格的高度/部署类型，射击台只画高台，不再叠画地面围栏。
    // 通行、部署、高度是独立源字段；不能由“怪物不可达”猜作高台。
    const highland=key==='tile_wall'||(lv.height?.[r]?.[c]==='HIGHLAND'&&b==='RANGED');
    if(highland)drawHighlandBlock(cx,cy);
    else if(key==='tile_fence_bound')drawFenceTile(cx,cy);
    if(crates.has(r+','+c)){
      ctx.fillStyle='#394653';ctx.fillRect(cx+8,cy+8,TILE-16,TILE-16);
      ctx.strokeStyle='#e3bc74';ctx.lineWidth=4;ctx.strokeRect(cx+8,cy+8,TILE-16,TILE-16);
      ctx.beginPath();ctx.moveTo(cx+12,cy+12);ctx.lineTo(cx+TILE-12,cy+TILE-12);ctx.moveTo(cx+TILE-12,cy+12);ctx.lineTo(cx+12,cy+TILE-12);ctx.stroke();
    }
  }
  ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=3;
  ctx.strokeStyle=routeView==='FLY'?'rgba(255,207,107,0.65)':'rgba(173,225,225,0.65)';
  ctx.setLineDash(routeView==='FLY'?[TILE*0.12,TILE*0.12]:[]);
  for(const [a,b]of visibleRouteEdges(lv)){
    ctx.beginPath();ctx.moveTo((a.c+.5)*TILE,(a.r+.5)*TILE);ctx.lineTo((b.c+.5)*TILE,(b.r+.5)*TILE);ctx.stroke();
  }
  ctx.setLineDash([]);
  }
  if (!drawDynamic) return;
  // 地图底行库存格：装备为青框；干员分支仅兼容旧状态，新的未部署干员由左侧 DOM 备战席承载。
  for (const b of (B.bench || [])) {
    if (!isVisibleMapPoint(b.col, b.row, 1)) continue;
    if (frameRenderCounts) frameRenderCounts.bench++;
    const bx = b.col*TILE, by = b.row*TILE;
    // 拖动中：原位置不残留（干员/装备同理，同一物品同一时刻只出现在一处）
    if (drag && ((drag.type === 'deploy' && drag.op && drag.op.id === b.id) || (drag.type === 'equip' && drag.equipUid === b.id))) continue;
    if(b.isTactical){
      ctx.fillStyle='#123d35';ctx.fillRect(bx+3,by+3,TILE-6,TILE-6);ctx.strokeStyle='#67ffdc';ctx.lineWidth=2;ctx.strokeRect(bx+3,by+3,TILE-6,TILE-6);
      ctx.fillStyle='#c4ffed';ctx.font='bold '+Math.round(TILE*.17)+'px sans-serif';ctx.textAlign='center';ctx.fillText(b.name,bx+TILE/2,by+TILE*.5);ctx.fillText('部署 · '+(b.cost||0)+'费',bx+TILE/2,by+TILE*.8);ctx.textAlign='left';continue;
    }
    if (b.type === 'equip' || b.isTrap) {
      ctx.fillStyle = 'rgba(0,188,212,0.10)'; ctx.fillRect(bx+2, by+2, TILE-4, TILE-4);
      ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(bx+2, by+2, TILE-4, TILE-4);
      const eq = getEquipIcon(b.name);
      if (eq && eq.complete && eq.naturalWidth > 0) ctx.drawImage(eq, bx+8, by+8, TILE-16, TILE-16);
      else {
        ctx.fillStyle = '#0e2430'; ctx.fillRect(bx+4, by+4, TILE-8, TILE-8);
        ctx.strokeStyle = '#4dd0e1'; ctx.lineWidth = 1.5; ctx.strokeRect(bx+TILE*0.26, by+TILE*0.26, TILE*0.48, TILE*0.48);
        ctx.fillStyle = '#00bcd4'; ctx.font = 'bold '+Math.round(TILE*0.3)+'px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('◆', bx+TILE/2, by+TILE/2);
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      }
      ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(bx+3, by+TILE-16, TILE-6, 13);
      ctx.fillStyle='#7ff3ff'; ctx.font='bold '+Math.round(TILE*0.11)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(b.name||''), bx+TILE/2, by+TILE-9);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      continue;
    }
    ctx.fillStyle = 'rgba(255,213,79,0.10)'; ctx.fillRect(bx+2, by+2, TILE-4, TILE-4);
    ctx.strokeStyle = 'rgba(255,213,79,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx+2, by+2, TILE-4, TILE-4);
    const im = getAvatar(b.charId);
    if (im.complete && im.naturalWidth > 0) ctx.drawImage(im, bx+4, by+4, TILE-8, TILE-8);
    else { ctx.fillStyle = b.position==='RANGED' ? '#7e57c2' : '#64b5f6'; ctx.fillRect(bx+4, by+4, TILE-8, TILE-8); }
    if (b.elite) drawEliteFrame(bx,by);
    if (selected !== b.id) {   // 选中后留给菱形盘，不再叠头顶名
      ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(bx+3, by+TILE-16, TILE-6, 13);
      ctx.fillStyle='#ffd54f'; ctx.font='bold '+Math.round(TILE*0.13)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(b.name||'').slice(0,3), bx+TILE/2, by+TILE-9);
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    }
  }
  // 悬停格高亮：拖拽中由拖拽逻辑负责落点高亮，这里跳过避免叠加；仅休整期用 onCanDeploy（含上限），其余阶段仅按格子可部署性
  if (hover && !drag) {
    let ok = isDeployable(hover.row, hover.col);
    if (window.onCanDeploy && B && B.phase === 'rest') ok = window.onCanDeploy(hover.row, hover.col);
    ctx.fillStyle = ok ? 'rgba(139,195,74,0.55)' : 'rgba(244,67,54,0.45)';
    ctx.fillRect(hover.col*TILE, hover.row*TILE, TILE, TILE);
  }
  // 选中干员操作盘已移到 drawBoard 末尾绘制（最优先图层，覆盖场上干员图标）
  // 拖拽 ghost / 朝向确认
  if (drag) {
    const gx = drag.x, gy = drag.y;   // drag.x/y 已是棋盘像素坐标
    if (drag.phase === 'drag') {
      if (drag.type === 'equip') {
        // 装备拖拽 ghost 与悬停面板移到 render 屏幕空间绘制（不随棋盘倾斜）
      } else {
        const dr = Math.floor(gy / TILE), dc = Math.floor(gx / TILE);
        const lv = BDATA.level;
        // 候选移动：拖到底行任意候选位（含空位/占位）→ 青蓝「移动」高亮，不做部署判定/范围预览
        const swap = (drag.type === 'deploy' && dr>=0 && dr<lv.rows && dc>=0 && dc<lv.cols && isBenchSlot(dr, dc));
        if (swap) {
          ctx.fillStyle = 'rgba(0,188,212,0.30)'; ctx.fillRect(dc*TILE, dr*TILE, TILE, TILE);
          ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
          ctx.setLineDash([5,4]); ctx.strokeRect(dc*TILE+2, dr*TILE+2, TILE-4, TILE-4); ctx.setLineDash([]);
          ctx.fillStyle = '#c3f3ff'; ctx.font = 'bold '+Math.round(TILE*0.18)+'px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('⇄ 移动排序', dc*TILE + TILE/2, dr*TILE + TILE*0.22);
          ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        }
        // 落点格：判定「此刻能否放下」（可部署 + 未达部署上限 + 无占位），绿=可放 / 红=不可放（重排时不提示）
        const canPlace = !swap && canDropOperator(drag, dr, dc);
        if (!swap && dr>=0 && dr<lv.rows && dc>=0 && dc<lv.cols) {
          ctx.fillStyle = canPlace ? 'rgba(139,195,74,0.55)' : 'rgba(244,67,54,0.45)';
          ctx.fillRect(dc*TILE, dr*TILE, TILE, TILE);
          ctx.strokeStyle = canPlace ? '#8bc34a' : '#f44336';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(dc*TILE+1, dr*TILE+1, TILE-2, TILE-2);
        }
        const im = getAvatar(drag.op.charId);
        ctx.globalAlpha = 0.7;
        if (im.complete && im.naturalWidth > 0) ctx.drawImage(im, gx-TILE*0.45, gy-TILE*0.45, TILE*0.9, TILE*0.9);
        else { ctx.fillStyle='#90caf9'; ctx.fillRect(gx-TILE*0.45, gy-TILE*0.45, TILE*0.9, TILE*0.9); }
        ctx.globalAlpha = 1;
        // 部署范围预览：仅当落点可放时显示该干员攻击范围（还原方舟）；不可放则外圈红提示
        if (drag.op.rangeGrids && canPlace) {
          if (dr>=0 && dr<lv.rows && dc>=0 && dc<lv.cols) {
            // 拖拽中落点范围跟随鼠标指示方向（未进朝向确认前也能看到实时朝向预览）
            const gdx = gx - (dc + 0.5) * TILE, gdy = gy - (dr + 0.5) * TILE;
            const ghostDir = Math.abs(gdx) > Math.abs(gdy) ? (gdx > 0 ? 'right' : 'left') : (gdy > 0 ? 'down' : 'up');
            const cells = rangeCellsFor({ row: dr, col: dc, dir: ghostDir, rangeGrids: drag.op.rangeGrids });
            if (cells) {
              ctx.fillStyle = 'rgba(255,213,79,0.14)';
              ctx.strokeStyle = 'rgba(255,213,79,0.75)';
              ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
              for (const c of cells) {
                if (c[0]<0||c[0]>=lv.rows||c[1]<0||c[1]>=lv.cols) continue;
                ctx.fillRect(c[1]*TILE, c[0]*TILE, TILE, TILE);
                ctx.strokeRect(c[1]*TILE+1.5, c[0]*TILE+1.5, TILE-3, TILE-3);
              }
              ctx.setLineDash([]);
            }
          }
        } else if (!swap && !canPlace && dr>=0 && dr<lv.rows && dc>=0 && dc<lv.cols) {
          // 不可放置：红叉提示
          const cx2 = dc*TILE + TILE/2, cy2 = dr*TILE + TILE/2;
          ctx.strokeStyle = 'rgba(244,67,54,0.9)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(cx2-TILE*0.22, cy2-TILE*0.22); ctx.lineTo(cx2+TILE*0.22, cy2+TILE*0.22); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx2+TILE*0.22, cy2-TILE*0.22); ctx.lineTo(cx2-TILE*0.22, cy2+TILE*0.22); ctx.stroke();
        }
      }
    } else if (drag.phase === 'facing') {
      const fx = drag.col*TILE, fy = drag.row*TILE;
      const cx = fx + TILE/2, cy = fy + TILE/2;
      const bd = TILE*1.45;   // 二次确认框菱形半对角线（包住干员及周边约一格半）
      // 1) 大空框菱形（图集 index 1）作为二次确认框
      drawUIIcon(1, cx - bd, cy - bd, bd*2, bd*2);
      // 2) 干员预览 + 目标格高亮
      const im = getAvatar(drag.op.charId);
      ctx.globalAlpha = 0.85;
      if (im.complete && im.naturalWidth > 0) ctx.drawImage(im, fx+2, fy+2, TILE-4, TILE-4);
      else { ctx.fillStyle='#90caf9'; ctx.fillRect(fx+3, fy+3, TILE-6, TILE-6); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle='#ffd54f'; ctx.lineWidth=3; ctx.strokeRect(fx, fy, TILE, TILE);
      // 2.5) 攻击范围预览：进入二次确认即显示，并跟随当前朝向（拖出方向后范围随之旋转）
      if (drag.op.rangeGrids) {
        const lv = BDATA.level;
        const cells = rangeCellsFor({ row: drag.row, col: drag.col, dir: drag.dir || 'up', rangeGrids: drag.op.rangeGrids });
        if (cells) {
          ctx.fillStyle = 'rgba(255,213,79,0.14)';
          ctx.strokeStyle = 'rgba(255,213,79,0.75)';
          ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
          for (const c of cells) {
            if (c[0]<0||c[0]>=lv.rows||c[1]<0||c[1]>=lv.cols) continue;
            ctx.fillRect(c[1]*TILE, c[0]*TILE, TILE, TILE);
            ctx.strokeRect(c[1]*TILE+1.5, c[0]*TILE+1.5, TILE-3, TILE-3);
          }
          ctx.setLineDash([]);
        }
      }
      // 3) 方向箭头：必须拖出格子确认方向(dirSet)后才显示（否则进入确认时默认的 up 箭头会误出现）
      if (drag.dirSet) {
        const arrowIdx = { up:11, right:17, down:21, left:16 }[drag.dir] || 11;
        const as = TILE*0.5;                             // 箭头按钮边长
        const lo = bd - as/2;                            // 箭头中心距中心 bd-as/2 → 箭头外缘贴住菱形外边缘
        const ax = (drag.dir==='left' ? cx-lo : drag.dir==='right' ? cx+lo : cx);
        const ay = (drag.dir==='up'   ? cy-lo : drag.dir==='down'   ? cy+lo : cy);
        drawBtnIcon({ x: ax-as/2, y: ay-as/2, w: as, h: as, cx: ax, cy: ay }, arrowIdx);
      }
      // 4) 左上：撤退/取消（index 22 红人）——永远在左上方
      const fb = facingButtons(cx, cy);
      drawBtnIcon(fb.cancel, 22);
    }
  }
  // 攻击弹道：统一、可见的通用弹道（近战不发射弹道）。物理=细长箭矢+拖尾；法术=发光球+光晕拖尾；我方（物理银白/法术紫）、敌方红。
  ctx.save();
  const visibleProjectiles = B.projectiles || [];
  const projectileStride = Math.max(1, Math.ceil(visibleProjectiles.length / renderProfile().projectileBudget));
  for (let projectileIndex = 0; projectileIndex < visibleProjectiles.length; projectileIndex += projectileStride) {
    const p = visibleProjectiles[projectileIndex];
    if(p.kind==='bomb'||p.kind==='operator-pulse'||p.kind==='death-cold'||p.kind==='enemy-static-area')continue; // Delayed impacts have their own blast presentation.
    if (!isVisibleMapPoint(p.x, p.y, 1)) continue;
    if (frameRenderCounts) frameRenderCounts.projectiles++;
    const px = p.x*TILE + TILE/2, py = p.y*TILE + TILE/2;
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1e-4;
    const ux = dx/d, uy = dy/d;
    const isEnemy = !!p.enemy;
    if(p.kind==='shell'){
      ctx.strokeStyle='#ffe4b4';ctx.lineWidth=2;ctx.fillStyle=p.plan?.groundOnly?'#c3dce5':'#ffb85f';
      ctx.beginPath();ctx.arc(px,py,TILE*.1,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-ux*TILE*.35,py-uy*TILE*.35);ctx.stroke();
    } else if (p.kind === 'orb') {
      const core = isEnemy ? 'rgba(255,90,110,0.96)' : 'rgba(185,130,255,0.96)';
      // 拖尾（沿飞行反方向渐隐）
      const tr = ctx.createLinearGradient(px, py, px - ux*TILE*0.75, py - uy*TILE*0.75);
      tr.addColorStop(0, isEnemy ? 'rgba(255,60,90,0.45)' : 'rgba(160,110,255,0.45)');
      tr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = tr; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - ux*TILE*0.75, py - uy*TILE*0.75); ctx.stroke();
      // 光晕 + 亮核
      const rg = ctx.createRadialGradient(px, py, 1, px, py, TILE*0.26);
      rg.addColorStop(0, core); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, TILE*0.26, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI*2); ctx.fill();
    } else {
      const head = isEnemy ? 'rgba(255,150,90,0.96)' : 'rgba(225,230,240,0.96)';
      // 拖尾
      const tr = ctx.createLinearGradient(px, py, px - ux*TILE*0.6, py - uy*TILE*0.6);
      tr.addColorStop(0, isEnemy ? 'rgba(255,120,80,0.5)' : 'rgba(200,208,224,0.5)');
      tr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = tr; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - ux*TILE*0.6, py - uy*TILE*0.6); ctx.stroke();
      // 细长箭矢（指向飞行方向）
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = head;
      const L = TILE*0.16, W = 3;
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L*0.7, -W); ctx.lineTo(-L*0.7, W); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  for (const e of B.enemies) {
    if(e.dead)continue;
    const largeBox=largeBossArtBox(e);
    if (largeBox?!largeBossArtVisible(largeBox):!isVisibleMapPoint(e.x, e.y, 1)) continue;
    if (frameRenderCounts) frameRenderCounts.enemies++;
    const x=(e.x??0)*TILE+TILE/2, y=(e.y??0)*TILE+TILE/2;
    const footprint=window.ArkBossMechanics?.rect(e);
    if(footprint&&!largeBox){ctx.fillStyle='rgba(215,75,55,.12)';ctx.strokeStyle='rgba(245,108,76,.75)';ctx.lineWidth=1;const fx=(footprint.xMin+.5)*TILE,fy=(footprint.yMin+.5)*TILE,fw=(footprint.xMax-footprint.xMin)*TILE,fh=(footprint.yMax-footprint.yMin)*TILE;ctx.fillRect(fx,fy,fw,fh);ctx.strokeRect(fx,fy,fw,fh);}
    const im = getEnemyAvatar(e.enemyId);
    const r = Math.max(10, TILE*0.32);
    if (largeBox) {
      // 整图已在动态底层绘制；领袖生命使用顶部大血条，此处仅保留元素损伤反馈。
    } else if (im.complete && im.naturalWidth > 0) {
      ctx.save();
      const rock = atkRockAngle(e.atkAnimAt, B.time);
      ctx.translate(x, y);
      if (rock) ctx.rotate(rock);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
      ctx.drawImage(im, -r, -r, r*2, r*2);
      ctx.restore();
      ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    } else {
      // 头像缺失：灰蓝占位 + 橙色轮廓 + 「敌」字（避免退化红色圆点）
      ctx.fillStyle='#3a4557'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
      ctx.strokeStyle='#ff7043'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
      ctx.fillStyle='#ff7043'; ctx.font='bold '+Math.round(r*0.9)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('敌', x, y); ctx.textAlign='start'; ctx.textBaseline='alphabetic';
    }
    if(!largeBox){
      ctx.fillStyle='#000'; ctx.fillRect(x-TILE*0.3, y-TILE*0.42, TILE*0.6, 5);
      ctx.fillStyle='#f44336'; ctx.fillRect(x-TILE*0.3, y-TILE*0.42, TILE*0.6*Math.max(0,e.hp/e.maxHp), 5);
    }
    // Typed EP and burst cooldown indicators are drawn with the shared battle overlay.
  }
  // 命中粒子：灰黑色像素点四散消散
  if (B.particles) {
    const particleStride = renderProfile().particleStride;
    for (let particleIndex = 0; particleIndex < B.particles.length; particleIndex += particleStride) {
      const p = B.particles[particleIndex];
      if (!isVisibleMapPoint(p.x, p.y, 1)) continue;
      if (frameRenderCounts) frameRenderCounts.particles++;
      const px = p.x*TILE + TILE/2, py = p.y*TILE + TILE/2;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.35));
      ctx.fillStyle = '#2f2f34';
      ctx.fillRect(px - p.size/2, py - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  // 怪物预览块（A 区）：把下一轮敌人的头像画在预览格内（__preview 时由 togglePreview 缓存 __previewWave）
  if (window.__preview && window.__previewWave && B) {
    const secs = (window.modeBattleSections && window.modeBattleSections(BDATA.level)) || [];
    const top = secs[0];
    if (top && B.phase !== 'battle') {
      const lv = BDATA.level;
      const preview = enemyPreviewLayout();
      preview.positions.forEach(cell => {
        const im = getEnemyAvatar(cell.enemyId);
        const x = cell.c * TILE + TILE/2, y = cell.r * TILE + TILE/2;
        const r = TILE * cell.radius;
        if (im.complete && im.naturalWidth > 0) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); ctx.drawImage(im, x-r, y-r, r*2, r*2); ctx.restore(); }
        else { ctx.fillStyle='#3a4557'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
        ctx.strokeStyle='#ff7043'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.save();ctx.font='bold '+Math.max(6,TILE*.12)+'px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#091017';ctx.fillStyle='#fff';ctx.strokeText('×'+cell.count,x,y+r*.78);ctx.fillText('×'+cell.count,x,y+r*.78);ctx.restore();
      });
    }
  }
  // 圆角矩形路径 helper（战场单位头顶 UI 用）
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  };
  for (const o of B.operators) {
    if (!isVisibleMapPoint(o.col, o.row, 2)) continue;
    if (frameRenderCounts) frameRenderCounts.operators++;
    if (drag && drag.op && drag.op.id === o.id) continue;   // 拖动中：原位置不残留，改由 ghost/朝向确认处绘制
    if (o.dead) {
      // 阵亡待复活：灰暗头像 + 红色倒计时环 + 剩余秒数
      const x = o.col*TILE, y = o.row*TILE;
      ctx.globalAlpha = 0.4;
      const dim = getAvatar(o.charId);
      if (dim.complete && dim.naturalWidth > 0) ctx.drawImage(dim, x+2, y+2, TILE-4, TILE-4);
      else { ctx.fillStyle = '#445566'; ctx.fillRect(x+3, y+3, TILE-6, TILE-6); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(10,10,14,0.62)'; ctx.fillRect(x+3, y+3, TILE-6, TILE-6);
      const remain = Math.max(0, o.respawnAt - B.time);
      const ratio = Math.max(0, Math.min(1, 1 - remain / (o.respawnTotal || RESPAWN_TIME)));
      ctx.strokeStyle = '#f44336'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, TILE*0.26, -Math.PI/2, -Math.PI/2 + Math.PI*2*ratio, false); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(TILE*0.24) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(remain>0?String(Math.ceil(remain)):('费用 '+Math.floor(B.dp||0)+'/'+o.respawnCost), x+TILE/2, y+TILE/2);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      continue;
    }
    const x=o.col*TILE;
    let y=o.row*TILE;
    // 未轮到的干员不提前显示占位；轮到后在 0.1s 内完成一次快速下落。
    const battleDeployElapsed = (o.deployAt != null) ? B.time - o.deployAt : BATTLE_DEPLOY_FALL;
    if (battleDeployElapsed < 0) continue;
    if (battleDeployElapsed < BATTLE_DEPLOY_FALL) {
      const p = Math.max(0, Math.min(1, battleDeployElapsed / BATTLE_DEPLOY_FALL));
      const eased = 1 - Math.pow(1-p, 3);
      y = o.row*TILE - TILE*2.2*(1-eased);
      ctx.globalAlpha = 0.55 + 0.45*p;
    }
    if (o.deployTime) { const dd=(Date.now()-o.deployTime)/1000; if (dd<0.2) { const p=dd/0.2, from=-TILE*2; y=from+(o.row*TILE-from)*(1-Math.pow(1-p,3)); } }
    // 底部椭圆阴影（立体感）
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x+TILE/2, y+TILE*0.93, TILE*0.33, TILE*0.11, 0, 0, Math.PI*2); ctx.fill();
    const im = getAvatar(o.charId);
    if (im.complete && im.naturalWidth > 0) {
      const rock = atkRockAngle(o.atkAnimAt, B.time);
      if (rock) {
        ctx.save();
        ctx.translate(x + TILE/2, y + TILE*0.96);   // 绕底部中心左右摇摆（「抬手」近似）
        ctx.rotate(rock);
        ctx.drawImage(im, -TILE/2 + 2, -TILE*0.96 + 2, TILE-4, TILE-4);
        ctx.restore();
      } else {
        ctx.drawImage(im, x+2, y+2, TILE-4, TILE-4);
      }
    }
    else { ctx.fillStyle = o.position==='RANGED' ? '#7e57c2' : '#64b5f6'; ctx.fillRect(x+3,y+3,TILE-6,TILE-6); ctx.fillStyle='#fff'; ctx.font=(TILE*0.22)+'px sans-serif'; ctx.fillText(PROF_CN[o.profession]||o.profession, x+6, y+TILE*0.35); }
    if (o.elite) drawEliteFrame(x,y);
    // HP 血条（加描边更醒目）
    ctx.fillStyle='#000'; ctx.fillRect(x+3,y+TILE-10,TILE-6,5);
    const hpRatio = (o.hp != null) ? Math.max(0, o.hp/o.maxHp) : 1;
    ctx.fillStyle='#4caf50'; ctx.fillRect(x+3,y+TILE-10,(TILE-6)*hpRatio,5);
    ctx.strokeStyle='rgba(0,0,0,0.75)'; ctx.lineWidth=1; ctx.strokeRect(x+3.5,y+TILE-9.5,TILE-7,4);
    const sourceShield=window.ArkClientPrograms?.shieldInfo?.(o,B.time);
    if(sourceShield?.amount>0){ctx.fillStyle='#bcecff';ctx.fillRect(x+3,y+TILE-13,(TILE-6)*Math.min(1,sourceShield.amount/sourceShield.initial),2);}
    // 技能期间：橙红火焰萦绕特效（非标准圆，多条火舌绕干员快速转动）
    if (o.skillFx != null && o.skillFx > B.time) drawSkillFlame(x+TILE/2, y+TILE/2, B.time);
    if (o.skill) {
      const spRatio = o.skill.spCost > 0 ? Math.min(1, (o.sp||0) / o.skill.spCost) : 0;
      ctx.fillStyle='#000'; ctx.fillRect(x+3,y+TILE-4,TILE-6,4);
      ctx.fillStyle = spRatio >= 1 ? '#ffd54f' : '#42a5f5';
      ctx.fillRect(x+3,y+TILE-4,(TILE-6)*spRatio,4);
    }
    if (selected===o.id) { ctx.strokeStyle='#ffd54f'; ctx.lineWidth=3; ctx.strokeRect(x+1,y+1,TILE-2,TILE-2); }
    // 头顶常态 UI（阶数方块 + 装备胶囊）：装备拖拽悬停该干员时隐藏，被置入面板替换
    const isHoverTarget = !!(drag && drag.type === 'equip' && drag.hoverOp && drag.hoverOp.id === o.id);
    if (!isHoverTarget) {
      const tier = o.tier || 0;
      const equipCnt = (o.equip || []).filter(Boolean).length;
      const b = 14, bx = x + 3, by = y - 6;
      if (tier) {
        const roman = 'ⅠⅡⅢⅣⅤⅥ'[tier-1] || '';
        ctx.fillStyle = 'rgba(20,22,28,0.94)'; rr(bx, by, b, b, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; rr(bx, by, b, b, 3); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (b-4) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(roman, bx + b/2, by + b/2 + 0.5);
      }
      // 头顶装备胶囊：仅在有装备时显示（已装亮白 / 空槽暗黑）
      if (equipCnt > 0) {
        const eqW = 28, eqH = 8, eqX = bx + b + 4, eqY = by + (b - eqH)/2;
        ctx.fillStyle = 'rgba(10,12,16,0.92)'; rr(eqX, eqY, eqW, eqH, 4); ctx.fill();
        const gap = 3, slotW = (eqW - gap*3)/2;
        for (let k = 0; k < 2; k++) {
          const sx = eqX + gap + k*(slotW + gap), sy = eqY + 2;
          if (o.equip && o.equip[k]) { ctx.fillStyle = '#fff'; rr(sx, sy, slotW, eqH-4, 2); ctx.fill(); }
          else { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; rr(sx, sy, slotW, eqH-4, 2); ctx.stroke(); }
        }
      }
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }
  // 选中干员：攻击范围 + 菱形操作盘（最优先图层：画在所有干员/敌人之上，覆盖场上干员图标）
  const selDep = (selected != null) ? B.operators.find(o => o.id===selected && !o.dead) : null;
  const selBench = (selected != null && !selDep) ? (B.bench || []).find(o => o.id===selected) : null;
  const selOp = selDep || selBench;
  if (selOp && !(drag && drag.op && drag.op.id === selOp.id)) {
    const inBattle = B.phase !== 'rest';
    if (selDep) {
      const cells = selDep.cells || rangeCellsFor(selDep);
      if (cells) {   // 攻击范围：黄色虚线填充区域
        ctx.fillStyle = 'rgba(255,213,79,0.14)';
        ctx.strokeStyle = 'rgba(255,213,79,0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        for (const c of cells) {
          ctx.fillRect(c[1]*TILE, c[0]*TILE, TILE, TILE);
          ctx.strokeRect(c[1]*TILE+1.5, c[0]*TILE+1.5, TILE-3, TILE-3);
        }
        ctx.setLineDash([]);
      }
      // 选中干员操作界面：图集大空框菱形(index1) + 三按钮（撤退左上/装备右上/技能右下，沿斜边）
      const cx = selDep.col*TILE + TILE/2, cy = selDep.row*TILE + TILE/2, bd = TILE*2;
      drawUIIcon(1, cx - bd, cy - bd, bd*2, bd*2);
      const btns = opButtons(selDep);
      drawBtnIcon(btns.retreat, 22, null, inBattle);
      drawSellBtn(btns.sell, inBattle);
      drawSkillBtn(btns.skill, selDep, true);
    } else if (selBench&&!selBench.isTactical) {
      // 候选（未上场）：菱形盘仅「出售」一个按钮（正上方，黄色方形 + 六边形费用角标）
      const cx = selBench.col*TILE + TILE/2, cy = selBench.row*TILE + TILE/2, bd = TILE*2;
      drawUIIcon(1, cx - bd, cy - bd, bd*2, bd*2);
      const bb = benchButtons(cx, cy);
      drawSellBtn(bb.sell, inBattle);
    }
  }
}

function ensureTerrainScene(sceneW, sceneH, mapW, mapH) {
  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCtx = terrainCanvas.getContext('2d');
    observeRenderSurface(terrainCanvas);
  }
  const key = [terrainVersion, sceneW, sceneH, TILE, mapW, mapH,sceneOriginX,sceneOriginY].join(':');
  if (terrainCacheKey === key) return false;
  if (terrainCanvas.width !== sceneW || terrainCanvas.height !== sceneH) {
    terrainCanvas.width = sceneW;
    terrainCanvas.height = sceneH;
  }
  terrainCtx.setTransform(1,0,0,1,0,0);
  terrainCtx.clearRect(0,0,sceneW,sceneH);
  terrainCtx.imageSmoothingEnabled = true;
  terrainCtx.imageSmoothingQuality = 'high';
  const previousCtx = ctx;
  ctx = terrainCtx;
  ctx.save();
  try {
    ctx.setTransform(sceneScale,0,0,sceneScale,-sceneOriginX*sceneScale,-sceneOriginY*sceneScale);
    drawBoard({ terrain:true, dynamic:false });
  } finally { ctx.restore(); ctx = previousCtx; }
  terrainCacheKey = key;
  terrainScreenKey = '';
  return true;
}

function projectedTerrainKey() {
  const wr = battleClipRect() || {};
  return [terrainCacheKey, canvas.width, canvas.height, renderProfile().warpGrid,
    fitS.toFixed(3), fitOx.toFixed(2), fitOy.toFixed(2), cam.f.toFixed(3),
    wr.colLeft, wr.colRight, wr.rowTop, wr.rowBot].join(':');
}

function drawProjectedTerrain() {
  if (!terrainScreenCanvas) {
    terrainScreenCanvas = document.createElement('canvas');
    terrainScreenCtx = terrainScreenCanvas.getContext('2d');
    observeRenderSurface(terrainScreenCanvas);
  }
  if (terrainScreenCanvas.width !== canvas.width || terrainScreenCanvas.height !== canvas.height) {
    terrainScreenCanvas.width = canvas.width;
    terrainScreenCanvas.height = canvas.height;
    terrainScreenKey = '';
  }
  computeFit(false);
  const key = projectedTerrainKey();
  let rebuilt = false;
  if (terrainScreenKey !== key) {
    terrainScreenCtx.setTransform(1,0,0,1,0,0);
    terrainScreenCtx.clearRect(0,0,terrainScreenCanvas.width,terrainScreenCanvas.height);
    drawWarped(terrainCanvas, sceneScale, terrainScreenCtx);
    terrainScreenKey = key;
    rebuilt = true;
  }
  return rebuilt;
}

// 主渲染：始终「离屏绘制→按 3D 姿态透视贴回」（默认即带 35° 俯角）；cam.f 决定 默认→聚焦 的角度插值
function render() {
  if (!BDATA) return;
  if (!B) return;
  // 镜头倾斜规则：手牌部署(startDrag 无 type)始终倾斜；移动已部署干员/装备拖拽在确认拖离后倾斜（与干员拖动一致）；
  // cam.f 已由 __stepCamera(dt) 统一驱动（与商店收起/展开镜头同速率），此处不再重复渐变。
  const renderStarted=typeof performance!=='undefined'?performance.now():0;
  computeFit(false);
  if (!sceneCanvas) { sceneCanvas = document.createElement('canvas'); sceneCtx = sceneCanvas.getContext('2d'); observeRenderSurface(sceneCanvas); }
  const bounds=sceneRenderBounds(),mapW=bounds.width,mapH=bounds.height;
  sceneOriginX=bounds.x;sceneOriginY=bounds.y;
  const nextSceneScale = sceneRenderScale(mapW, mapH);
  const sceneW = Math.max(1,Math.floor(mapW * nextSceneScale)), sceneH = Math.max(1,Math.floor(mapH * nextSceneScale));
  if (sceneCanvas.width !== sceneW || sceneCanvas.height !== sceneH) { sceneCanvas.width = sceneW; sceneCanvas.height = sceneH; }
  sceneScale = nextSceneScale; sceneLogicalW = mapW; sceneLogicalH = mapH;
  const terrainSceneRebuilt = ensureTerrainScene(sceneW, sceneH, mapW, mapH);
  canvas.dataset.sceneScale = sceneScale.toFixed(3);
  canvas.dataset.sceneSize = sceneW + 'x' + sceneH;
  frameRenderCounts = { bench:0, operators:0, enemies:0, projectiles:0, particles:0,warpDraws:0 };
  // 动态层保持透明；静态地形来自独立缓存，不再随单位每帧重画。
  sceneCtx.imageSmoothingEnabled = true; sceneCtx.imageSmoothingQuality = 'high';
  const old = ctx; ctx = sceneCtx;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,sceneW,sceneH);
  ctx.save();
  try {
  ctx.setTransform(sceneScale,0,0,sceneScale,-sceneOriginX*sceneScale,-sceneOriginY*sceneScale);
  // 固定大型 Boss 整图先绘制，范围效果、弹道、小怪、干员及伤害数字随后叠在上方。
  for(const enemy of B.enemies){const box=largeBossArtBox(enemy);if(box&&largeBossArtVisible(box))drawLargeBossArt(enemy,box);}
  window.ArkBattlePresentation?.drawAreas(ctx,B,TILE);
  drawBoard({ terrain:false, dynamic:true });
  window.ArkBattlePresentation?.draw(ctx,B,TILE);
  } finally { ctx.restore(); ctx = old; }
  const terrainProjectionRebuilt = drawProjectedTerrain();
  // Keep the previous visible frame until the offscreen work succeeds.
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#12141a'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(terrainScreenCanvas, 0, 0);
  const hasDynamic=window.__preview||hover||drag||selected!=null||
    ['bench','operators','enemies','projectiles','particles','summoneds','operatorZones'].some(key=>B[key]?.length);
  if(hasDynamic)drawWarped(sceneCanvas, sceneScale, ctx);
  const profile = renderProfile();
  window.__mapRenderMetrics = {
    scale:sceneScale, width:sceneW, height:sceneH, logicalWidth:mapW, logicalHeight:mapH, fit:fitS,
    quality:profile.id, warpGrid:profile.warpGrid,
    terrainSceneRebuilt, terrainProjectionRebuilt,
    visible:{ ...frameRenderCounts },
    total:{ bench:(B.bench||[]).length, operators:B.operators.length, enemies:B.enemies.length, projectiles:(B.projectiles||[]).length, particles:(B.particles||[]).length },
    projectilePool:projectilePool ? projectilePool.stats() : null,
    particlePool:particlePool ? particlePool.stats() : null,
  };
  canvas.dataset.renderQuality = profile.id;
  canvas.dataset.warpGrid = String(profile.warpGrid);
  canvas.dataset.terrainSceneRebuilt = String(terrainSceneRebuilt);
  canvas.dataset.terrainProjectionRebuilt = String(terrainProjectionRebuilt);
  canvas.dataset.visibleCounts = [frameRenderCounts.operators, frameRenderCounts.enemies, frameRenderCounts.projectiles, frameRenderCounts.particles].join(',');
  canvas.dataset.warpDraws=String(frameRenderCounts.warpDraws);
  canvas.dataset.renderMs=String(typeof performance!=='undefined'?+(performance.now()-renderStarted).toFixed(2):0);
  canvas.dataset.renderError='';
  frameRenderCounts = null;
  // 装备拖拽 ghost + 悬停面板：屏幕空间绘制（不随棋盘倾斜）
  if (drag && drag.type === 'equip' && drag.phase === 'drag') {
    const sp = mapPoint(drag.x, drag.y, cam.f);
    const dr = Math.floor(drag.y / TILE), dc = Math.floor(drag.x / TILE);
    const hitOp = o => o.row===dr && o.col===dc;
    const target = B.operators.find(o => hitOp(o) && !o.dead)
      || (B.bench || []).find(o => o.type !== 'equip' && hitOp(o));
    if (target) {
      const p = mapPoint(target.col*TILE + TILE/2, target.row*TILE + TILE/2, cam.f);
      drawEquipDropPanel(ctx, target, p[0], p[1], sp[0]);
    } else {
      const eq = getEquipIcon(drag.equipName);
      if (eq && eq.complete && eq.naturalWidth > 0) ctx.drawImage(eq, sp[0]-TILE*0.4, sp[1]-TILE*0.4, TILE*0.8, TILE*0.8);
      else {
        ctx.globalAlpha = 0.7; ctx.fillStyle = '#00bcd4';
        ctx.fillRect(sp[0]-TILE*0.35, sp[1]-TILE*0.35, TILE*0.7, TILE*0.7);
        ctx.globalAlpha = 1;
      }
    }
  }
  if (B && B.phase === 'battle') {
    const remain = Math.max(0, (B.roundLimit||ROUND_LIMIT) - (B.roundTime||0));
    // 倒计时只保留顶部状态栏右侧大号数字（HTML 层，≤10s 变红），删除画布左上角重复的「回合剩余」，避免与左上角重叠
    if (window.updateCountdown) window.updateCountdown(remain);
  }
}


// standalone engine harnesses can omit the optional session clock; the page always loads ArkSim.
function gameRandom() { return window.ArkSim ? window.ArkSim.random() : Math.random(); }
let last = null, lastRender = 0;
let simulationClock = null;
// 卫戍协议默认二倍速：战斗模拟（敌我移动/攻击/冷却/复活/回合限时）整体加速。
// 仅在主循环 loop 里乘系数；直接调 update(dt) 的单测不受影响（仍为 1x）。
let GAME_SPEED = 2;
window.setGameSpeed = function(v) { GAME_SPEED = (v === 1 || v === 2) ? v : 2; if (typeof window.onSpeedChange === 'function') window.onSpeedChange(GAME_SPEED); };
window.getGameSpeed = function() { return GAME_SPEED; };
// 原版暂停机制：暂停时不推进战斗模拟（仅持续渲染），供原版/普通模式右上角暂停按钮使用；卫戍协议布局不变。
let PAUSED = false;
window.setPaused = function(v) { PAUSED = !!v; if (typeof window.onPauseChange === 'function') window.onPauseChange(PAUSED); };
window.getPaused = function() { return PAUSED; };
window.togglePause = function() { window.setPaused(!PAUSED); };
const FPS = 60, FRAME_MS = 1000 / FPS;   // 画面60fps；ArkSim判定仍为1/30秒，彼此独立。
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = last == null ? 0 : Math.max(0,(ts-last)/1000);last=ts;
  if(!window.__roomRemoteSimulation&&window.updateRunClock)window.updateRunClock(dt);
  if (!simulationClock) simulationClock=window.ArkSim.clock();
  if (!window.__roomRemoteSimulation&&window.updatePreparationClock) window.updatePreparationClock(dt);
  const speed = typeof GMODE !== 'undefined' && GMODE !== 'normal' ? 2 : GAME_SPEED;
  const paused=window.__roomRemoteSimulation||PAUSED||!B||B.phase!=='battle'||B.over;
  if(!paused)B.roundTime=(B.roundTime||0)+dt;
  if(!window.__roomRemoteSimulation)window.ArkSim.advance(simulationClock,dt,speed,paused,step=>update(step,0));
  // A hidden tab still advances its existing clocks, but submits no GPU work.
  if(document.hidden){lastRender=ts;return;}
  if (ts-lastRender+0.1 < FRAME_MS) return;
  const cameraDt=Math.min(0.05,(ts-lastRender)/1000);lastRender=ts-((ts-lastRender+0.1)%FRAME_MS);
  if (window.__stepCamera) window.__stepCamera(cameraDt);
  const authoritative=B;
  if(window.__roomRemoteSimulation&&B)B=window.ArkBattlePresentation?.sample(B,ts)||B;
  try{render();}catch(error){
    const message=String(error?.message||error);
    if(canvas.dataset.renderError!==message)console.error('Battle rendering failed:',error);
    canvas.dataset.renderError=message;
    invalidateTerrainCache();window.ArkRender?.setQuality('low');
  }finally{B=authoritative;}
}

window.onload = () => { if (window.initMode) window.initMode(); };
