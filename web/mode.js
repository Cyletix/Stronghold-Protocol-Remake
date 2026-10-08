'use strict';
// ============================================================
// 卫戍协议 · 模式层（回合循环 + 调度中心 + 盟约 + 装备）
// 套在 engine.js 塔防引擎之上。简化说明见文件尾注释。
// ============================================================

// ---- 常量（可调平衡）----
const TIER_CN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];
// 固定养成来自 mode_rules.json；战斗与详情共用，不另乘等阶近似倍率。
function selfHoldMult(charId) {
  const acc = getOpAccount(charId);
  const score = (acc.evolve || 0)*1000 + (acc.level || 1);
  const bonus = MODE_RULES.cultivateEffects.filter(x=>x.cultivateNum<=score).sort((a,b)=>b.cultivateNum-a.cultivateNum)[0];
  return { atk:1+(bonus?.atkPer||0)/100, def:1+(bonus?.defPer||0)/100, hp:1+(bonus?.hpPer||0)/100 };
}
let NORMAL_ROUNDS = 13;                              // 普通回合数：1-13 关无 boss，其后(14/15)为领袖 boss 战（DB 覆盖）
let BUY_COST = 3;                                    // 招募干员资金（DB 覆盖；实际已按阶 TIER_PRICE 覆盖）
const TIER_PRICE = { 1:2, 2:3, 3:3, 4:3, 5:4, 6:4 };  // 干员招募价（gamedata shopCharChessInfoData.purchasePrice，按阶 Ⅰ~Ⅵ）
let SELL_REFUND = 1;                                 // 出售返还（DB 覆盖）
let REFRESH_COST = 1;                                // 刷新商店（DB 覆盖）
let MAX_LEVEL = 6;                                   // 调度中心最高等级（DB 覆盖）
let SHOP_SLOTS = 6;                                  // 商店卡槽位（最多 6，原版商店位）（DB 覆盖）
const NON_SHOP = ['char_616_pithst', 'char_606_csuppo'];   // 不进普通商店卡池的「特殊干员」（由特定策略/机制开局自带）
let ENEMY_HP0 = 140;                                 // 敌方势力总生命（DB 覆盖）
let LIFE0 = 20;                                      // 我方全局生命（DB 覆盖）
let UPGRADE_COST_INIT = 5;                           // 调度中心初始升本费用（DB 覆盖）

// ---- 方舟富文本词条（天赋/技能描述里的 <$ba.*>/<@ba.*>/<中文关键词> → 高亮词条 + 悬浮说明）----
// 释义优先取官方 battle_richterm.json（RICHTERM，键=ba.* 去掉前缀），BA_GLOSS 作兜底近似值。
const BA_GLOSS = {
  stun:'晕眩：无法行动', root:'束缚：无法移动', sleep:'沉睡：无敌且无法行动', frozen:'冻结：无法行动',
  slow:'减速：移动速度降低', fragile:'脆弱：受到的伤害提升', magicfragile:'法术脆弱', elementfragile:'元素脆弱',
  cold:'寒冷：蓄积至冻结', sluggish:'停顿：移动速度降低', levitate:'浮空：无法行动', weightless:'失重',
  fear:'恐惧：无法阻挡并逃跑', tremble:'战栗', shield:'护盾：抵挡一次伤害', barrier:'屏障',
  invisible:'隐匿：不被敌方攻击', inspire:'鼓舞：属性加成', berserk:'坚忍', protect:'庇护：伤害降低',
  dmgresistance:'伤害减免', buffres:'抵抗', palsy:'麻痹', permanentatk:'持续攻击',
  magicpoint:'魔力', costlowerbound:'部署费用下限', charged:'蓄力', steal:'偷取',
};
// 词条风格（<@ba.kw>/<@ba.vup|vdown>/...）：前缀色高亮
const BA_TAG_CLS = { 'ba.kw':'ba-kw', 'ba.vup':'ba-vup', 'ba.vdown':'ba-vdown', 'ba.enemy':'ba-enemy', 'ba.drop':'ba-drop' };
// 把方舟标记（<$ba.x>中文</>、<@ba.x>中文</>、<中文>）降级为纯文本（用于 tooltip，避免嵌套 HTML）
function stripRich(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<\$ba\.[\w.]+>([^<]*)<\/>/g, '$1')
    .replace(/<@ba\.[\w.]+>([^<]*)<\/>/g, '$1')
    .replace(/<([\u4e00-\u9fff]{2,6})>/g, '$1')
    .replace(/<\/?\$ba\.[^>]*>/g, '').replace(/<\/?@ba\.[^>]*>/g, '').replace(/<\/>/g, '');
}
// 取某 key 的词条说明（优先官方 RICHTERM，其次 BA_GLOSS 兜底；文本用纯文本，避免 title 内嵌套 HTML）
function baTerm(key) {
  if (RICHTERM && RICHTERM[key]) { const v = RICHTERM[key]; return v.name + (v.desc ? '：' + stripRich(v.desc) : ''); }
  return BA_GLOSS[key] || '';
}
// 通用富文本解析：把方舟原生标记替换为带 tooltip 的高亮词条；其余 HTML 原样保留
function richText(s) {
  if (s == null) return '';
  let t = String(s);
  // 1) <$ba.subkey>中文</>（状态；key 可能含子级如 dt.neural2）→ 高亮词条
  t = t.replace(/<\$ba\.([\w.]+)>([^<]*)<\/>/g, function(m, key, zh) {
    return '<span class="ba-tag" title="'+escapeHtml(baTerm(key))+'">'+escapeHtml(zh||key)+'</span>';
  });
  // 2) <@ba.kw>中文</> 等关键词 → 专用高亮类 + tooltip
  t = t.replace(/<@ba\.([\w.]+)>([^<]*)<\/>/g, function(m, key, zh) {
    const cls = BA_TAG_CLS['ba.'+key] || 'ba-kw';
    return '<span class="ba-tag '+cls+'" title="'+escapeHtml(baTerm(key))+'">'+escapeHtml(zh||key)+'</span>';
  });
  // 3) <中文关键词>（地形/装置关键字，无闭合）→ 高亮为「方舟关键字」样式
  t = t.replace(/<([\u4e00-\u9fff]{2,6})>/g, function(m, zh) {
    return '<span class="ba-tag ba-kw">'+escapeHtml(zh)+'</span>';
  });
  // 4) 孤立方舟标记兜底：仅清掉无闭合/残留的 <$ba.*>/<@ba.*>/</>，不改动已生成的合法 <span> 等 HTML
  t = t.replace(/<\/?\$ba\.[^>]*>/g, '').replace(/<\/?@ba\.[^>]*>/g, '').replace(/<\/>/g, '');
  // 5) 方舟富文本数值占位 {key:默认值}：显示默认值（如 {atk:0%}→0%）；无默认值/带@的残留占位清空
  t = t.replace(/\{([^}:{}]+)(?::([^}]*))?\}/g, function(m, k, dv){ return (dv != null && dv !== "") ? dv : ""; });
  // 6) 方舟状态名 [NAME]：已知词条→中文；未知状态（如 HP_RECOVERY_PER_SEC / ABILITY_RANGE_FORWARD_EXTEND）清空
  t = t.replace(/\[([^\]]+)\]/g, function(m, k){ const key = String(k).trim(); const z = baTerm(key); return (z && z !== key) ? z : ""; });
  // 7) 字面换行 \n → <br>
  t = t.replace(/\\n/g, "<br>").replace(/\n/g, "<br>");
  return t;
}

// ---- 盟约定义 ----
const BOND_DEFS = {
  yanShip:{name:'炎',need:3,type:'SEASON'}, sargonShip:{name:'萨尔贡',need:3,type:'SEASON'},
  victoriaShip:{name:'维多利亚',need:3,type:'SEASON'}, kjeragShip:{name:'谢拉格',need:3,type:'SEASON'},
  lateranoShip:{name:'拉特兰',need:3,type:'SEASON'}, egirShip:{name:'阿戈尔',need:3,type:'SEASON'},
  siracusaShip:{name:'叙拉古',need:3,type:'SEASON'}, kazimierzShip:{name:'卡西米尔',need:3,type:'SEASON'},
  investShip:{name:'投资人',need:3,type:'REG'}, visiShip:{name:'远见',need:2,type:'REG'},
  maniShip:{name:'调和',need:1,type:'REG'}, preciShip:{name:'精准',need:2,type:'REG'},
  steadShip:{name:'坚守',need:2,type:'REG'}, raidShip:{name:'突袭',need:2,type:'REG'},
  miraShip:{name:'奇迹',need:2,type:'REG'}, indomShip:{name:'不屈',need:2,type:'REG'},
  swiftShip:{name:'迅捷',need:2,type:'REG'}, deputShip:{name:'助力',need:2,type:'REG'},
  skillfulShip:{name:'灵巧',need:2,type:'REG'}, emptyShip:{name:'协防干员',need:2,type:'REG'},
  soloShip:{name:'独行',need:1,type:'REG'}, suntShip:{name:'绝技',need:2,type:'REG'},
  arcaneShip:{name:'奥术',need:2,type:'REG'},
};
// 盟约代表色（势力/职业盟约视觉区分；真实盟约图标 icon_xxxShip 素材缺失，见 findings）
const BOND_COLOR = {
  yanShip:'#e53935', sargonShip:'#f9a825', victoriaShip:'#1565c0', kjeragShip:'#00838f',
  lateranoShip:'#eceff1', egirShip:'#3949ab', siracusaShip:'#6d4c41', kazimierzShip:'#8d6e63',
  preciShip:'#4db6ac', swiftShip:'#26a69a', skillfulShip:'#7e57c2', arcaneShip:'#5c6bc0',
  steadShip:'#78909c', deputShip:'#80cbc4', visiShip:'#9ccc65', miraShip:'#ffb74d',
  investShip:'#a1887f', raidShip:'#ef5350', indomShip:'#8d6e63', maniShip:'#66bb6a',
  emptyShip:'#90a4ae', soloShip:'#b0bec5', suntShip:'#ff8a65',
};

// 势力盟约：powerIdList（nationId/groupId/teamId 之一命中即可）
const SEASON_POWER = {
  yanShip:['yan','sui','lungmen','lee','lgd'], sargonShip:['sargon'],
  victoriaShip:['victoria','glasgow'], kjeragShip:['kjerag','karlan'],
  lateranoShip:['laterano'], egirShip:['egir','abyssal'],
  siracusaShip:['siracusa','chiave'], kazimierzShip:['kazimierz','pinus'],
};

// 职业 → 通用盟约（近似官方逐干员盟约归属）
const REG_BY_PROF = {
  PIONEER:['swiftShip'],
  WARRIOR:['raidShip','indomShip','investShip'],
  TANK:['steadShip','indomShip'],
  SNIPER:['preciShip','visiShip'],
  CASTER:['arcaneShip','preciShip','visiShip'],
  MEDIC:['deputShip','miraShip','emptyShip'],
  SUPPORT:['skillfulShip','miraShip','maniShip','emptyShip'],
  SPECIAL:['raidShip','swiftShip','soloShip'],
};

// 干员技能（简化：按职业模板，战斗中自动充能自动释放；精锐 power×1.5、技力消耗×0.85）
const SKILL_BY_PROF = {
  PIONEER: { name:'迅捷冲锋', type:'buff_atkspd', spCost:16, power:0.5, duration:6 },
  WARRIOR: { name:'强袭', type:'burst_damage', spCost:20, power:2.0, count:3 },
  TANK:    { name:'坚守壁垒', type:'shield', spCost:22, power:0.4 },
  SNIPER:  { name:'精准狙杀', type:'snipe', spCost:18, power:3.0 },
  CASTER:  { name:'术式轰击', type:'aoe_damage', spCost:20, power:1.5 },
  MEDIC:   { name:'急救', type:'heal', spCost:16, power:2.2 },
  SUPPORT: { name:'支援强化', type:'buff_atk', spCost:18, power:0.4, duration:6 },
  SPECIAL: { name:'疾速', type:'buff_atkspd', spCost:16, power:0.8, duration:5 },
};

// 子职业中文名（硬编码常见子职业映射）
const SUBPROF_CN = {
  corecaster:'中坚术师', splashcaster:'扩散术师', funnel:'秘术师', chain:'链术师', phalanx:'阵法术师',
  marksman:'速射手', artillerist:'炮手', deadeye:'神射手', besieger:'投掷手', heavyshooter:'重射手', spreadshooter:'散射手',
  physician:'医师', ringhealer:'疗养师', therapist:'医师',
  defender:'重装', guardian:'守护者', fortress:'要塞', duelist:'决战者', unyield:'不屈者',
  dreadnought:'强攻手', lord:'领主', centurion:'强攻手', artsfghter:'术战者', sword:'剑豪', fighter:'斗士', reaper:'收割者', crusher:'撼地者', liberator:'解放者', instructor:'教官',
  charger:'冲锋手', tactician:'战术家', standardbearer:'执旗手', pioneer:'尖兵',
  bard:'吟游者', decelbinder:'减速者', ritualist:'巫役', abjurer:'护佑者', artificer:'工匠',
  executor:'处决者', stalker:'伏击客', merchant:'行商', traper:'陷阱师', pusher:'推击手', hookmaster:'钩索师', dollkeeper:'替身', geomancer:'召唤师',
};

// 盟约效果描述（展示用）
const BOND_EFFECT_TXT = {
  yanShip:'【炎】干员攻击力 +(23+0.9×层数)%',
  sargonShip:'【萨尔贡】干员攻速 +12×层数（至多+300）',
  victoriaShip:'【维多利亚】干员伤害 +(25+0.8×层数)%',
  kjeragShip:'【谢拉格】干员伤害 +25%',
  lateranoShip:'【拉特兰】干员攻速 +(5+1.5×层数)%',
  egirShip:'【阿戈尔】干员生命值 +(35+1×层数)%',
  siracusaShip:'【叙拉古】干员部署后攻速 +(25+0.8×层数)',
  kazimierzShip:'【卡西米尔】干员攻击力 +(30+0.5×层数)%',
  preciShip:'【精准】远程干员攻击力 +(10+1.2×层数)%',
  arcaneShip:'【奥术】术师干员攻击力 +(20+1×层数)%',
  steadShip:'所有干员生命值 +(25+1.2×层数)%',
  raidShip:'【突袭】干员攻击力/生命值 +(25+1×层数)%',
  indomShip:'【不屈】地面干员被击倒时概率复活（18+0.4×层数)%',
  swiftShip:'【迅捷】先锋干员攻速 +(10+1×层数)%',
  deputShip:'所有干员防御力 +(15+1.2×层数)%',
  skillfulShip:'【灵巧】辅助/术师攻速 +(10+1×层数)%',
  emptyShip:'所有干员受伤害 -20%；协防干员伤害 +20%（精锐+40%）',
  soloShip:'仅1名【独行】在场时，其攻击力/生命值 +60%',
  suntShip:'精锐干员攻击力 +30%（5名精锐时技力消耗-30%，简化为不叠加）',
  miraShip:'刷新商店有 (25+0.3×层数)% 概率不消耗资金',
  visiShip:'每回合额外获得 +2×层数 资金（封顶+20）',
  investShip:'出售干员额外返还 +1 资金',
  maniShip:'使核心盟约激活人数 +1（调和干员享受核心盟约效果）',
};

// 用官方解包 bond_data.json 覆盖近似值：need=activeCount、效果=desc、势力power=powerIdList。
// 仅在字段存在时覆盖（smoke 测试里 fetch('bond_data.json') 落到 mode_data，无这些字段，安全跳过）。
function applyAuthoritativeBondData() {
  if (!BOND_DATA || !Array.isArray(BOND_DATA.bonds)) return;
  for (const b of BOND_DATA.bonds) {
    const d = BOND_DEFS[b.bondId]; if (!d) continue;
    if (typeof b.activeCount === 'number') d.need = b.activeCount;
    if (b.desc) BOND_EFFECT_TXT[b.bondId] = String(b.desc);
    if (Array.isArray(b.powerIdList) && b.powerIdList.length) SEASON_POWER[b.bondId] = b.powerIdList;
  }
}

// 用 data.db 投影 constants.json 覆盖硬编码默认值（唯一数据源）。字段缺失则保持默认，安全跳过。
function applyConstants() {
  if (!CONST || typeof CONST !== 'object') return;
  const num = k => (typeof CONST[k] === 'number' ? CONST[k] : undefined);
  if (num('NORMAL_ROUNDS') != null) NORMAL_ROUNDS = CONST.NORMAL_ROUNDS;
  if (num('BUY_COST') != null) BUY_COST = CONST.BUY_COST;
  if (num('SELL_REFUND') != null) SELL_REFUND = CONST.SELL_REFUND;
  if (num('REFRESH_COST') != null) REFRESH_COST = CONST.REFRESH_COST;
  if (num('MAX_LEVEL') != null) MAX_LEVEL = CONST.MAX_LEVEL;
  if (num('SHOP_SLOTS') != null) SHOP_SLOTS = CONST.SHOP_SLOTS;
  if (num('ENEMY_HP0') != null) ENEMY_HP0 = CONST.ENEMY_HP0;
  if (num('LIFE0') != null) LIFE0 = CONST.LIFE0;
  if (num('UPGRADE_COST_INIT') != null) UPGRADE_COST_INIT = CONST.UPGRADE_COST_INIT;
  if ('ROUND_LIMIT' in CONST && typeof CONST.ROUND_LIMIT === 'number') ROUND_LIMIT = CONST.ROUND_LIMIT;
  if ('PROJECTILE_SPEED' in CONST && typeof CONST.PROJECTILE_SPEED === 'number') PROJECTILE_SPEED = CONST.PROJECTILE_SPEED;
}

// ---- 装备定义 ----
// mods: atk/hp/def/aspd 为乘算系数（aspd>1 攻速更快）
const EQUIPS = [
  { id:'whammer', effectId:'eff_acarm041', name:'维式重锤', cost:1, mods:{atk:1.15}, desc:'攻击力+15%' },
  { id:'egir_blade', effectId:'eff_acarm046', name:'阿戈尔重刃', cost:1, mods:{atk:1.35, aspd:0.9}, desc:'攻击力+35%，攻速-10%' },
  { id:'shield', effectId:'eff_acarm047', name:'坚守盾牌', cost:1, mods:{def:1.35}, desc:'防御力+35%' },
  { id:'riot_shield', effectId:'eff_acarm060', name:'防暴盾', cost:2, mods:{}, kind:'reactive', desc:'阻挡敌人时，受到非自身阻挡目标的伤害降低40%' },
  { id:'yan_dagger', effectId:'eff_acarm040', name:'炎国短刀', cost:2, mods:{}, kind:'reactive', desc:'每次开启技能获得1层攻击力加成，每层+5%，最多10层' },
  { id:'goliath', effectId:'eff_acarm049', name:'歌利亚头盔', cost:2, mods:{hp:1.35}, desc:'生命值+35%' },
  { id:'scope', effectId:'eff_acarm063', name:'精准狙击镜', cost:2, mods:{atk:1.25}, desc:'攻击力+25%' },
  { id:'grenade', effectId:'eff_acarm064', name:'突袭手雷', cost:2, mods:{atk:1.20, hp:1.15}, desc:'攻击力+20%，生命+15%' },
  { id:'tea', effectId:'eff_acarm050', name:'萨尔贡浓茶', cost:2, mods:{aspd:1.15}, desc:'攻速+15%' },
  { id:'ice', effectId:'eff_acarm062', name:'谢拉格不融冰', cost:2, mods:{hp:1.20, aspd:1.08}, desc:'生命+20%，攻速+8%' },
  { id:'abyssal', effectId:'eff_acarm078', name:'海沟实验体', cost:3, mods:{hp:1.30}, desc:'生命值+30%' },
  { id:'sant', effectId:'eff_acarm076', name:'铳骑之威', cost:4, mods:{atk:1.40}, desc:'攻击力+40%' },
  { id:'ding', effectId:'eff_acarm077', name:'天师古鼎', cost:4, mods:{hp:1.45}, desc:'生命值+45%' },
  { id:'steam', effectId:'eff_acarm079', name:'蒸汽之心', cost:4, mods:{aspd:1.35}, desc:'攻速+35%' },
];
let SHOP_ITEMS = null; // Per-season market rows; eligibility is separate from effect support.
let TRAINING_CONFIG = null; // Identified JP local training object; never a formal-mode fallback.
let EQUIP_MODS = {};   // 官方装备名称 → 权威属性乘区（web/equips.json，stat 类，优先 normal 档）
let EQUIP_ASPD_POINTS = {}; // equips.json retains source attack_speed points, not multipliers.
let EQUIP_DESC = {};   // 官方装备名称 → {desc,tier}（描述/档位，供干员详情「特质」页装备卡片渲染）

// 敌人池：真实卫戍协议敌人（均有头像 + battle_data 数值），按定位分档；genWaves 按回合取用并等比缩放真实数值
const ENEMY_POOL = {
  fodder: ['enemy_1007_slime', 'enemy_1000_gopro_2', 'enemy_1065_snwolf', 'enemy_1008_ghost'],
  melee:  ['enemy_1099_nbkght', 'enemy_1071_dftman', 'enemy_1116_liprr', 'enemy_1072_dlancer'],
  tank:   ['enemy_1102_sdkght', 'enemy_1103_wdkght', 'enemy_1006_shield_2', 'enemy_1081_sotisd'],
  ranged: ['enemy_1003_ncbow', 'enemy_1047_sagent', 'enemy_1184_cadkgt', 'enemy_1067_snslime'],
  flying: ['enemy_1005_yokai', 'enemy_1040_bombd', 'enemy_1041_lazerd', 'enemy_1042_frostd'],
  elite:  ['enemy_1010_demon', 'enemy_1025_reveng', 'enemy_1026_aghost', 'enemy_1069_icebrk'],
};

let MDATA = null;      // mode_data.json
let ENEMY_TYPE_POOL = null; // enemy_type_pool.json：特训敌人类型 → 敌人列表
let curEnemyType = null;    // 本局特训敌人类型（genWaves 按此出怪）
let TIER_DATA = null;  // operator_tiers.json：干员名 → 阶（Ⅰ~Ⅵ）
let BAND_DATA = null;  // band_data.json：发起人(bandName) → {策略,血量,效果}
let RANGE_DATA = null; // range_data.json：charId → [{rangeId,grids}]（数组，索引=精英化 0/1/2）
let LEVEL_DATA = null; // level_data.json：charId → [{maxLevel, keyFrames:[{level,atk,maxHp,def}]}]（各精英化阶段）
let APP_DATA = null;   // appellation.json：charId → 英文名
let TALENT_DATA = null; // talent_data.json：charId → [[{phase,potential,name,description,blackboard}],...]（按精英化解锁）
let MODULE_DATA = null; // module_data.json：charId → {uniEquipId, name, normal:{hp,atk,def,aspd,magicRes}, elite:{...}}
let ACCOUNT = { ops: {} };  // 账号干员练度：charId → {level, evolve(0/1/2), skillLevel, trust, potential}
let DIY_ROSTER = null;
let ROSTER = null;     // 按 charId 索引的干员字典
let ROSTER_LIST = null; // 干员数组
let BOSS_LIST = null;  // 首领列表
let curBoss = null;      // 本局最终领袖（开局情报选定，供棋盘放大镜回看）
let curEnemyTypes = [];  // 本局特训敌人类型（开局情报选定，供棋盘放大镜回看）

// 全局游戏状态 G
let G = null;
function replaceGameSession(value, reason) {
  G = value;
  if (typeof window !== 'undefined' && window.ArkState) window.ArkState.bindLegacy('session', value, reason);
  return G;
}
function dispatchSessionCommand(type, payload) {
  if (typeof window === 'undefined' || !window.ArkState) return false;
  window.ArkState.dispatch({ type, payload:payload || {} });
  G = window.ArkState.getSnapshot().session;
  return true;
}
// HTML 按钮的统一入口；规则仍由现有函数与 ArkState 命令处理。
window.GameActions = Object.freeze({
  upgradeShop:(...args)=>window.upgradeShop(...args), toggleFreeze:(...args)=>window.toggleFreeze(...args),
  refreshShop:(...args)=>window.refreshShop(...args), toggleDrawer:(...args)=>window.toggleDrawer(...args),
});
let selectedHand = null;  // 手牌中选中待部署的干员索引
let selectedEquip = null; // 装备栏中选中的装备
let selBoardOp = null;    // 棋盘上选中的干员 id
let shopPreview = -1;     // 商店卡当前“预览待确认购买”的索引（-1=无）；首次点击=预览，再次点击/确认=购买
let selectedBond = null;  // 当前点开查看详情的盟约 id（null=关闭）
let GMODE = 'auto';       // 模式：auto=卫戍协议(自走棋)，normal=普通塔防
let BATTLE = null;        // battle_levels.json：{operators, enemies, levels}
let LEVELS = null;        // 关卡数组 [{name,id,level}]
let CUR = 0;              // 当前关卡索引（指向 playableLevels 数组）
// 玩法归属过滤：盟约玩法(auto)只应用于 covenant/covenant2；v1(第一版 AC-*) 从盟约关列表隐藏。
const COVENANT_KINDS = ['covenant', 'covenant2'];
function isCovenantLevel(L) { return !!(L && Array.isArray(COVENANT_KINDS) && COVENANT_KINDS.indexOf(L.kind) >= 0); }
function playableLevels() { return (LEVELS || []).filter(isCovenantLevel); }
let RICHTERM = null;      // battle_richterm.json：方舟富文本词条（ba.* → {name,desc}）
let SKILL_CHOICES = {}, EQUIPMENT_DETAILS = {};
// Display-only community notes; do not put them in simulation/save fingerprints.
let COMMUNITY_REFERENCES = {schemaVersion:1,skills:{},enemies:{}};
let SKILL_DATA = null;    // skill_data.json：干员真实技能（charId → {name,desc,type,spCost,...}）
let BOND_DATA = null;     // bond_data.json：官方解包盟约（activeCount/desc/powerIdList）
let OP_BONDS = null;      // op_bonds.json：官方逐干员盟约归属 + 特质（charId → {seasonBond,regBonds,garrison}）
let CONST = {};           // constants.json：data.db 投影的零碎常数（唯一数据源）
let SHOP_LEVEL = null;    // shop_level.json：调度中心等级 → {charChessCount,itemCount,upgrade}（gamedata shopLevelDataDict）
let KILL_COIN = null;     // kill_coin.json：add_enemy_kill_gain_coin 指定敌人按 round 掉金币
let BAND_EFFECTS = null;  // band_effects.json：策略(band)机制（effectId/keys/blackboard），供 U-STRATEGY 逐条复现
let SPECIAL_EQUIP_EVENTS = null;  // special_equip_events.json：特殊装备(use) 的 use_equip_*/equip_destory_* 事件
let TRAP_EFFECTS = null;       // trap_effects.json：装置(effectId) → 效果（env_gbuff 等）
let TRAP_DATA = null;          // trap_data.json：装置定义（chessId/charId/purchasePrice/effectId）
let CHESS_MAP = null;          // chess_map.json：chessId → charId（charShopChessDatas），供 gainchess 特指干员
let MODE_RULES = null;
let SOURCE_BATTLES = null;
let ENEMY_ENCOUNTERS = null;
let TRAINING_PROFILES = new Map();
function trainingProfile(entry, elite) {
  if (GMODE === 'normal'||entry.debugLibrary) {const account=getOpAccount(entry.charId);return { ...account, potential:entry.debugLibrary?Math.max(0,account.potential-1):account.potential, equipLevel:0 };}
  const profile = entry.profile || TRAINING_PROFILES.get(entry.charId+':'+entry.tier);
  if (!profile) throw new Error('缺少固定养成配置：'+entry.charId+' / '+entry.tier);
  const s = elite ? profile.elite : profile.normal;
  // 每个固定身份绑定本赛季原始 chess 配置；不跨赛季回退养成。
  // 潜能使用配置中的备用干员基线，原型/持有者潜能继承仍需独立取证。
  return { evolve:Number(s.evolvePhase.slice(-1)), level:s.charLevel, skillLevel:s.skillLevel,
    equipLevel:s.equipLevel, potential:profile.backupCharPotRank || 0 };
}
// ---- 数据加载与名册 ----
async function initMode() {
  loadBgmPreference();
  BATTLE = await (await fetch('battle_levels.json')).json();
  LEVELS = BATTLE.levels || [];
  MDATA = await (await fetch('mode_data.json')).json();
  try { ENEMY_TYPE_POOL = await (await fetch('enemy_type_pool.json')).json(); } catch (err) { if (window.console) window.console.warn('enemy_type_pool.json', err); }
  TIER_DATA = await (await fetch('operator_tiers.json')).json();
  BAND_DATA = await (await fetch('band_data.json')).json();
  RANGE_DATA = await (await fetch('range_data.json')).json();
  LEVEL_DATA = await (await fetch('level_data.json')).json();
  MODE_RULES = await (await fetch('mode_rules.json')).json();
  DIY_ROSTER = await (await fetch('diy_roster.json')).json();
  SOURCE_BATTLES = await (await fetch('source_battles.json')).json();
  SHOP_ITEMS = await (await fetch('shop_items.json')).json();
  if(SHOP_ITEMS.schemaVersion!==1||!SHOP_ITEMS.seasons)throw Error('shop_items.json 配置格式无效');
  TRAINING_CONFIG = await (await fetch('training_config.json')).json();
  if(TRAINING_CONFIG.schemaVersion!==1||!TRAINING_CONFIG.seasons)throw Error('training_config.json 配置格式无效');
  ENEMY_ENCOUNTERS = await (await fetch('enemy_encounters.json')).json();
  if(window.ArkBossMechanics)window.ArkBossMechanics.configure(await (await fetch('boss_mechanics.json')).json());
  if (MODE_RULES.schemaVersion !== 1 || !MODE_RULES.seasons || !Array.isArray(MODE_RULES.cultivateEffects)) throw new Error('mode_rules.json 配置格式无效');
  seasonRosterCache = new Map();
  APP_DATA = await (await fetch('appellation.json')).json();
  TALENT_DATA = await (await fetch('talent_data.json')).json();
  try { MODULE_DATA = await (await fetch('module_data.json')).json(); } catch (err) { if (window.console) window.console.warn('module_data.json', err); }
  BOND_DATA = await (await fetch('bond_data.json')).json();
  OP_BONDS = await (await fetch('op_bonds.json')).json();
  GARRISON_DATA = await (await fetch('garrison_data.json')).json();
  RICHTERM = await (await fetch('battle_richterm.json')).json();
  SKILL_DATA = await (await fetch('skill_data.json')).json();
  [SKILL_CHOICES,EQUIPMENT_DETAILS] = await Promise.all(['skill_choices.json','equipment_details.json'].map(async p => (await fetch(p)).json()));
  try {
    const references=await (await fetch('community_references.json')).json();
    if(references.schemaVersion===1&&references.skills&&references.enemies)COMMUNITY_REFERENCES=references;
  } catch(err) { if(window.console)window.console.warn('community_references.json',err); }
  EQUIP_MODS = {};   // 装备权威属性乘区：stat 类，同名优先 normal 档
  EQUIP_ASPD_POINTS = {};
  EQUIP_DESC = {};   // 装备权威描述/档位：名称 → {desc, tier}（供干员详情「特质」页卡片渲染）
  try {
    const ED = await (await fetch('equips.json')).json();
    GARRISON_EQUIPS = Array.isArray(ED)?ED:[];
    if (Array.isArray(ED)) for (const e of ED) {
      if (e.kind === 'stat' && e.mods && !window.ArkEquipSkillStacks?.handles(e) && (!EQUIP_MODS[e.name] || e.tier === 'normal')) {
        EQUIP_MODS[e.name]={...e.mods};
        if(Number.isFinite(e.mods.aspd)){EQUIP_ASPD_POINTS[e.name]=e.mods.aspd;EQUIP_MODS[e.name].aspd=Math.max(.1,1+e.mods.aspd/100);}
      }
      if (e.desc && (!EQUIP_DESC[e.name] || e.tier === 'normal')) EQUIP_DESC[e.name] = { desc: e.desc, tier: e.tier || 'normal' };
    }
  } catch (err) { if (window.console) window.console.warn('equips.json', err); }
  applyAuthoritativeBondData();
  CONST = await (await fetch('constants.json')).json();
  applyConstants();
  try { SHOP_LEVEL = await (await fetch('shop_level.json')).json(); } catch (err) { if (window.console) window.console.warn('shop_level.json', err); }
  try { KILL_COIN = await (await fetch('kill_coin.json')).json(); } catch (err) { if (window.console) window.console.warn('kill_coin.json', err); }
  try { BAND_EFFECTS = await (await fetch('band_effects.json')).json(); } catch (err) { if (window.console) window.console.warn('band_effects.json', err); }
  try { SPECIAL_EQUIP_EVENTS = await (await fetch('special_equip_events.json')).json(); } catch (err) { if (window.console) window.console.warn('special_equip_events.json', err); }
  try { TRAP_EFFECTS = await (await fetch('trap_effects.json')).json(); } catch (err) { if (window.console) window.console.warn('trap_effects.json', err); }
  try { TRAP_DATA = await (await fetch('trap_data.json')).json(); } catch (err) { if (window.console) window.console.warn('trap_data.json', err); }
  try { CHESS_MAP = await (await fetch('chess_map.json')).json(); } catch (err) { if (window.console) window.console.warn('chess_map.json', err); }
  loadAccount();
  initEngine({ enemies: BATTLE.enemies, level: (playableLevels()[0] || {}).level });
  loadUIAtlas();
  loadSfx();   // 预加载音效（web/sfx/*.mp3）
  buildRoster(BATTLE.operators);
  BOSS_LIST = (MDATA.bosses || []).map(b => ({ id: b.enemyId, name: (BATTLE.enemies[b.enemyId]||{}).name || b.enemyId }));
  measureLatency();   // 显示真实延迟（本地≈0ms，不再固定 256ms）
  if (typeof setInterval === 'function') setInterval(measureLatency, 5000);
  // 调试截图入口：?debugshot&view=0|1|2&boss=1&battle —— 自动进入棋盘，供无头浏览器截图判定
  if (typeof URLSearchParams !== 'undefined' && new URLSearchParams(location.search).has('debugshot')) {
    const _q = new URLSearchParams(location.search);
    if (_q.get('level') != null) { const _n = parseInt(_q.get('level'), 10); if (LEVELS[_n]) { CUR = _n; setLevel({ enemies: BATTLE.enemies, level: LEVELS[_n].level }); } }
    if (_q.get('view') != null) { const _v = parseInt(_q.get('view'), 10); window.viewMode = (_v === 1 || _v === 2) ? _v : 0; }
    enterNormalMode();
    if (_q.get('boss') === '1') window.__bossBattle = true;   // 提前置位：让候选区(candidateCells)与镜头都按 boss 区计算
    if (_q.has('battle')) {
      try {
        const _cand = candidateCells(BDATA.level);
        const _ops = (G && G.ops) || []; const _free = _ops.filter(o => o.row == null);
        for (let _k = 0; _k < Math.min(4, _free.length, _cand.length); _k++) { if (_cand[_k]) { const _o = _free[_k]; _o.row = _cand[_k].row; _o.col = _cand[_k].col; _o.dir = 'up'; } }
      } catch (e) { if (window.console) window.console.warn('debugshot', e); }
      startNormalBattle();
    }
    if (_q.get('boss') === '1') window.__bossBattle = true;   // 覆盖 startNormalBattle 的 false，供截图验证 boss 区
    if (_q.get('preview') === '1') window.__preview = true;    // 截图验证怪物预览块（上段镜头）
    return;   // debugshot：跳过 showMenu
  }
  showMenu();
  applyHomeRoute();
}
// 选择关卡：切到对应地图并进入开局情报（策略）界面
function selectLevel(i) {
  const pl = playableLevels();
  if (!BATTLE || !LEVELS || !pl[i]) return;
  const mode=SOURCE_BATTLES.seasons[setupSeason()]?.modes[setupModeId()];
  const choice=mode?.stageChoices.find(x=>x.stageId===pl[i].id);
  if(!choice){flash('当前模式不支持这张地图');return;}
  selectSetupMap(choice.levelKey);
}

let seasonRosterCache = new Map();
function currentDiySetup(seasonId){
  const value=window.__roomDiySelections ?? (localRunSetup?.config?.seasonId===seasonId?localRunSetup.config.diySelections:undefined) ?? window.ArkDiyRoster.read(localStorage,seasonId);
  return window.ArkDiyRoster.normalize(DIY_ROSTER,seasonId,value);
}
function seasonRoster(seasonId,ops=BATTLE.operators,diySelections={}) {
  const picks=window.ArkDiyRoster.normalize(DIY_ROSTER,seasonId,diySelections),key=seasonId+':'+JSON.stringify(picks);
  if(seasonRosterCache.has(key))return seasonRosterCache.get(key);
  const entries={},byChess={},list=[],profiles=[...window.ArkRunSetup.rosterProfiles(MODE_RULES,seasonId,{includeHidden:true}),...window.ArkDiyRoster.profiles(DIY_ROSTER,MODE_RULES,seasonId,picks)],base=new Map(ops.map(o=>[o.charId,o]));
  for (const profile of profiles) {
    const o=base.get(profile.charId);if(!o)throw Error('固定槽位缺少基础数据：'+profile.chessId);
    const tier=profile.tier,power=profile.chessType==='DIY'?DIY_ROSTER.operators[o.charId].powerIds:[o.nationId,o.groupId,o.teamId].filter(Boolean);
    const season=profile.bondIds.find(id=>CORE_BONDS.includes(id))||null;
    const reg=profile.bondIds.filter(id=>id!==season);
    const sourceTraits=GARRISON_DATA.seasons[seasonId]?.traits||{};
    const bondGarrison=(profile.garrisonIds||[]).map(id=>sourceTraits[id]).filter(Boolean);
    const entry = {
      charId: o.charId, name: o.name, rarity: o.rarity, tier, profession: o.profession,
      subProfession: o.subProfession, position: o.position,
      seasonId, chessId:profile.chessId, isHidden:profile.isHidden, profile,
      baseMaxHp: o.maxHp, baseAtk: o.atk, baseDef: o.def, baseBlockCnt: o.blockCnt, baseAttackTime: o.attackTime,
      baseMagicRes: o.magicRes || 0, atkType: window.ArkAttackProfiles?.[o.charId]?.damageType || ((o.profession === 'CASTER' || o.profession === 'SUPPORT') ? 'arts' : 'phys'),
      seasonBond: season, regBonds: reg, power, bondGarrison,
      // 技能：引擎释放用职业模板 type（B5 暂认 type）；展示用真实技能（A7，skill_data.json）优先，含 name/desc/范围/技力
      skill: (function() {
        const tmpl = SKILL_BY_PROF[o.profession] ? { ...SKILL_BY_PROF[o.profession] } : null;
        const real = SKILL_CHOICES[o.charId]?.find(s=>s.index===profile.defaultSkillIndex)||SKILL_DATA?.[o.charId]||null;
        if (!tmpl) return real;
        if (real) {
          return {
            ...tmpl,                      // 保留引擎识别的 type
            realName: real.name,
            realDesc: real.desc,
            realRangeId: real.rangeId,
            realMaxCharge: ((real.elite && real.elite.maxCharge) || (real.normal && real.normal.maxCharge)) || 1,
            realType: real.type,
            realDurationType: real.durationType,
            realIcon: (real.elite && real.elite.prefabId) || (real.normal && real.normal.prefabId) || null,   // 技能图标 ID（OBB skill_icon_{prefabId}.png）
            normal: real.normal || null,   // 普通=技能4（固定养成）
            elite: real.elite || null,     // 精锐=技能7（固定养成）
          };
        }
        return tmpl;
      })(),
      rangePhases: RANGE_DATA[o.charId] || [],      // 攻击范围三阶段：索引=精英化 0/1/2
      rangeGrids: (RANGE_DATA[o.charId] || [])[0] ? (RANGE_DATA[o.charId][0]).grids : null,   // 后备=精0
      talents: TALENT_DATA[o.charId] || [],         // 天赋按精英化解锁（candidates[].phase）
      module: profile.chessType==='DIY'?window.ArkDiyRoster.moduleFor(DIY_ROSTER,profile):MODULE_DATA?.bySeason?.[seasonId]?.[profile.chessId] || null,
      appellation: (APP_DATA[o.charId] || ''),
    };
    byChess[profile.chessId]=entry;
    if(!entries[o.charId]||!profile.isHidden)entries[o.charId]=entry;
    if(!profile.isHidden)list.push(entry);
  }
  const result={entries,byChess,list};seasonRosterCache.set(key,result);return result;
}
function buildRoster(ops=BATTLE.operators,seasonId=setupSeason(),diySelections=currentDiySetup(seasonId)) {
  const roster=seasonRoster(seasonId,ops,diySelections);ROSTER=roster.entries;ROSTER_LIST=roster.list;
  const fallback=DIY_ROSTER.seasons[seasonId].fallbackRule;BOND_DEFS.emptyShip.need=fallback.activeCount;BOND_EFFECT_TXT.emptyShip=fallback.desc;
  TRAINING_PROFILES=new Map(Object.values(ROSTER).map(e=>[e.charId+':'+e.tier,e.profile]));
}

// 取干员当前精英化阶段对应的攻击范围（攻击范围随精英化变化：精0/1/2 可能不同）
function entryRangeGrids(entry, elite) {
  if(['char_128_plosis','char_2015_dusk'].includes(entry.charId)){
    const train=trainingProfile(entry,elite),p=window.ArkAttackProfiles?.[entry.charId],mod=(p?.modules||p?.medicModules)?.[entry.module?.uniEquipId]?.[(train.equipLevel||0)-1];
    if(mod?.rangeGrids)return mod.rangeGrids;
  }
  const ph = entry.rangePhases || [];
  if (!ph.length) return entry.rangeGrids || null;
  const ev = trainingProfile(entry, elite).evolve;
  const i = Math.min(ev, ph.length - 1);
  return (ph[i] || ph[ph.length - 1]).grids || null;
}

// 以当前玩法养成配置筛选阶段、等级、潜能；战斗效果与详情共用候选。
function activeTalents(entry, elite) {
  const acc = trainingProfile(entry, elite);
  const ev = acc.evolve || 0, pot = acc.potential || 0;
  const res = [];
  for (const cands of (entry.talents || [])) {
    let best = null;
    for (const c of (cands || [])) {
      if (((c.phase || 0) < ev || ((c.phase || 0) === ev && (c.level || 1) <= acc.level)) && (c.potential || 0) <= pot) {
        if (!best || (c.phase || 0) > (best.phase || 0) || (c.phase === best.phase && ((c.level || 1) > (best.level || 1) || (c.level === best.level && (c.potential || 0) > (best.potential || 0))))) best = c;
      }
    }
    if (best) res.push(best);
  }
  return res;
}


// 账号练度持久化
function loadAccount() { try { ACCOUNT = JSON.parse(localStorage.getItem('arknightsRoster') || '{"ops":{}}'); } catch (e) { ACCOUNT = { ops: {} }; } }
function saveAccount() { try { localStorage.setItem('arknightsRoster', JSON.stringify(ACCOUNT)); } catch (e) {} }

// 干员在指定精英化阶段+等级下的完整属性（关键帧线性插值）
function statAt(charId, level, evolve) {
  const phases = LEVEL_DATA[charId];
  if (!phases || !phases[evolve]) return null;
  const p = phases[evolve];
  const kfs = p.keyFrames;
  if (!kfs.length) return null;
  const lo = kfs[0], hi = kfs[kfs.length - 1];
  const lvl = Math.max(1, Math.min(p.maxLevel, level || 1));
  const span = Math.max(1, hi.level - lo.level);
  const t = (lvl - lo.level) / span;
  return {
    atk: Math.round(lo.atk + (hi.atk - lo.atk) * t),
    maxHp: Math.round(lo.maxHp + (hi.maxHp - lo.maxHp) * t),
    def: Math.round(lo.def + (hi.def - lo.def) * t),
  };
}

// 技能等级上限随精英化：精0≤4、精一≤7、精二≤10（7+专精3）
function maxSkillLevel(evolve) { return [4, 7, 10][evolve] || 7; }
function skillLevelLabel(lv) { return lv <= 7 ? '技能'+lv : '专精'+(lv-7); }
function validSkillIndex(charId, index) {
  const choices=SKILL_CHOICES[charId]||[];
  return choices.find(s=>s.index===index)?.index ?? choices.find(s=>s.index===ROSTER?.[charId]?.profile?.defaultSkillIndex)?.index ?? choices.find(s=>s.skillId===SKILL_DATA?.[charId]?.skillId)?.index ?? 0;
}
function accountSkillChoices() {
  // DIY defaults are private per player. Keep them explicit so a shared Boss
  // field never resolves a teammate's same-charId skill through the host roster.
  return Object.fromEntries(ROSTER_LIST.map(e=>[e.charId,e.profile?.chessType==='DIY'?e.profile.defaultSkillIndex:getOpAccount(e.charId).selectedSkill]).filter(([id,index])=>ROSTER[id]?.profile?.chessType==='DIY'||index!==validSkillIndex(id)));
}
function operatorSkillSource(charId) {
  const index=GMODE==='auto'&&G ? validSkillIndex(charId,G.skillChoices?.[charId]) : getOpAccount(charId).selectedSkill;
  return SKILL_CHOICES[charId]?.find(s=>s.index===index) || SKILL_DATA?.[charId];
}
function normalizeOpAccount(charId,account){
  const phases=LEVEL_DATA[charId]||[];
  const clamp=(v,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Math.floor(Number(v)):fallback));
  const evolve=clamp(account.evolve,0,Math.max(0,phases.length-1),0),maxLevel=phases[evolve]?.maxLevel||1;
  const selectedSkill=validSkillIndex(charId,account.selectedSkill),skillId=SKILL_CHOICES[charId]?.find(s=>s.index===selectedSkill)?.skillId;
  const skillMax=Math.min(maxSkillLevel(evolve),window.ArkSkillLevels?.count(skillId)||window.ArkCommonSkillData?.skillLevels?.[skillId]?.length||10);
  return {...account,selectedSkill,evolve,level:clamp(account.level,1,maxLevel,1),skillLevel:clamp(account.skillLevel,1,skillMax,skillMax),trust:clamp(account.trust,0,100,100),potential:clamp(account.potential,0,6,6)};
}

// 账号练度（默认满配：满级、技能取该精英化上限、信赖100、潜能6）
function getOpAccount(charId) {
  if (ACCOUNT.ops[charId]) return normalizeOpAccount(charId,ACCOUNT.ops[charId]);
  const phases = LEVEL_DATA[charId] || [];
  const evolve = Math.max(0, phases.length - 1);
  const maxLevel = (phases[evolve] || {}).maxLevel || 1;
  return normalizeOpAccount(charId,{ selectedSkill:validSkillIndex(charId), level: maxLevel, evolve, skillLevel: maxSkillLevel(evolve), trust: 100, potential: 6 });
}

// 常用一键配置
function applyPreset(presetId) {
  const presets = [
    { evolve: 1, levelMode: 'max', skillLevel: 7, label: '精一满级·技能7' },
    { evolve: 1, levelMode: 'min', skillLevel: 7, label: '精一1级·技能7' },
    { evolve: 0, levelMode: 'min', skillLevel: 4, label: '全员1级·技能4' },
    { evolve: 2, levelMode: 'max', skillLevel: 10, label: '全部满配（精二满级·专精3）' },   // 满配：精二满级·技能10·信赖100·潜能6
    { evolve: 2, levelMode: 'min', skillLevel: 10, label: '精二1级·专精3（不超过可用精英化阶段）' },
  ];
  const p = presets[presetId];
  if (!p) return;
  for (const e of rosterLibraryEntries()) {
    const phases = LEVEL_DATA[e.charId] || [];
    const phase = phases[p.evolve] || phases[phases.length - 1] || { maxLevel: 1 };
    const maxLevel = phase.maxLevel || 1;
    const level = p.levelMode === 'max' ? maxLevel : 1;
    ACCOUNT.ops[e.charId] = normalizeOpAccount(e.charId,{ selectedSkill:getOpAccount(e.charId).selectedSkill, level, evolve: p.evolve, skillLevel: p.skillLevel, trust: 100, potential: 6 });
  }
  saveAccount(); renderRoster();
  if (G) { refreshBoard(); renderAll(); }
  flash('已应用配置：'+p.label);
}

// 取已解锁天赋的效果算子（含触发时机 trigger）。
function activeTalentEffects(entry, elite) {
  return activeTalents(entry, elite).flatMap(t=>(t.effects || []).map(e=>({ ...e })));
}

// 取卫戍协议「固定养成」精英化阶段常量（blockCnt/respawnTime/magicRes）。LEVEL_DATA[charId] 为阶段数组。
// Ⅰ/Ⅱ阶非精锐=精一，其余（精锐或Ⅲ~Ⅵ阶）=精二（mode_rules 固定养成，与账号练度无关）；blockCnt 精一/精二可能变化，respawnTime 各阶段一致。
function phaseDataOf(entry, elite) {
  const phases = LEVEL_DATA[entry.charId] || [];
  if (!phases.length) return null;
  const ev = trainingProfile(entry, elite).evolve;
  return phases[Math.min(ev, phases.length - 1)] || phases[phases.length - 1];
}

// 计算单个干员最终属性（含阶/精锐/装备/盟约/天赋修正）
function equipmentModifiers(eq){
  if(window.ArkEquipSkillStacks?.handles(eq))return {};
  const mm=eq.mods||eq,points=EQUIP_ASPD_POINTS[eq.name];
  return Number.isFinite(points)&&mm.aspd===points?{...mm,aspd:Math.max(.1,1+points/100)}:mm;
}
// Carry talent is evaluated from this player's inventory, including their bench.
// Opening placement is free in this mode; its first-Rhine discount is consumed there.
function tacticalCarriedCost(entry){
  if(typeof G==='undefined'||!G||GMODE!=='auto'||!entry.power?.includes('rhine'))return 0;
  let cost=0;
  for(const o of G.ops||[])if(o.charId==='char_249_mlyss'){
    const talent=activeTalents(o.entry,o.elite).find(t=>t.name==='开源节流');
    const value=talent?.blackboard?.find(b=>b.key==='cost')?.value;
    if(Number.isFinite(value))cost=Math.min(cost,value);
  }
  return cost;
}
function commandCarriedBonus(){
  let floor=0,atk=0;
  for(const o of (typeof G==='undefined'?[]:G?.ops)||[])if(o.charId==='char_4228_closur'){
    const train=trainingProfile(o.entry,o.elite),t=activeTalents(o.entry,o.elite).find(t=>t.name==='极限调度');
    const mod=window.ArkAttackProfiles?.[o.charId]?.modules?.[o.entry.module?.uniEquipId]?.[(train.equipLevel||0)-1];
    const mt=mod?.talents.filter(t=>t.name==='极限调度'&&t.potential<=(train.potential||0)).at(-1);
    const b=Object.fromEntries(((mt||t)?.blackboard||[]).map(b=>[b.key,b.value]));floor=Math.min(floor,b.cost||0);atk=Math.max(atk,b.atk||0);
  }return {floor,atk};
}
function finalizeOperator(entry, bondMods, equips, elite) {
  const train = trainingProfile(entry, elite);
  const profile=window.ArkAttackProfiles?.[entry.charId];
  const trait=profile?.traits?.filter(t=>(t.phase<train.evolve||t.phase===train.evolve&&t.level<=train.level)&&t.potential<=(train.potential||0)).at(-1);
  const basicAttack=profile?{...profile,traits:undefined,bb:trait?.bb||{},training:{evolve:train.evolve,level:train.level,potential:train.potential||0}}:undefined;
  const combatModule=(profile?.modules||profile?.medicModules)?.[entry.module?.uniEquipId]?.[(train.equipLevel||0)-1];
  const moduleTrait=combatModule?.traits.filter(t=>t.potential<=(train.potential||0)).at(-1);
  if(moduleTrait)basicAttack.bb={...basicAttack.bb,...moduleTrait.bb};
  if(entry.charId==='char_128_plosis'&&combatModule){
    const nearTalent=combatModule.talents.find(t=>t.name==='技力光环');
    basicAttack.medicNearSp=nearTalent?.blackboard.find(b=>b.key==='sp_recovery_per_sec')?.value||0;
  }
  if(basicAttack?.tactician)basicAttack.tactician={...basicAttack.tactician,activeModuleTokens:[...new Map((basicAttack.tactician.moduleTokenTraits?.[entry.module?.uniEquipId]?.[(train.equipLevel||0)-1]||[]).filter(t=>t.requiredPotentialRank<=(train.potential||0)).map(t=>[t.prefabKey,t])).values()]};
  const base = statAt(entry.charId, train.level, train.evolve);
  if (!base) throw new Error('缺少阶段属性：'+entry.charId+' / '+train.evolve);
  const ev = GMODE === 'auto' ? selfHoldMult(entry.charId) : { atk:1, hp:1, def:1 };
  let atk = (base.atk+(bondMods?.baseAtk||0)) * ev.atk, hp = (base.maxHp+(bondMods?.baseHp||0)) * ev.hp, def = base.def * ev.def;
  // 阻挡数/复活时间/法抗与基础属性使用同一阶段。
  const phaseD = phaseDataOf(entry, !!elite);
  const blockCnt = (phaseD && typeof phaseD.blockCnt === 'number') ? phaseD.blockCnt : (entry.baseBlockCnt != null ? entry.baseBlockCnt : 1);
  const respawnTime = (phaseD && typeof phaseD.respawnTime === 'number') ? phaseD.respawnTime : (entry.baseRespawnTime != null ? entry.baseRespawnTime : undefined);
  let magicRes = (phaseD && typeof phaseD.magicRes === 'number') ? phaseD.magicRes : (entry.baseMagicRes || 0);
  let aspd = 1, reviveChance = 0, dmgTaken = 1;
  // 模组扁平加成（固定养成：精锐带模组 equipLevel 1/2/3；normal.equipLevel=0 无加成）
  const mod = (entry.module && ((elite && entry.module.elite) || entry.module.normal)) || null;
  let modAspd = mod ? (mod.aspd || 0) : 0;
  if (mod) { hp += mod.hp || 0; atk += mod.atk || 0; def += mod.def || 0; magicRes += mod.magicRes || 0; }
  if (bondMods) { atk *= bondMods.atk||1; hp *= bondMods.hp||1; def *= bondMods.def||1; aspd = bondMods.aspd||1; reviveChance = bondMods.reviveChance||0; dmgTaken = bondMods.dmgTaken||1; }
  if (equips) for (const eq of equips) { if (!eq) continue; const mm = equipmentModifiers(eq); atk *= mm.atk||1; hp *= mm.hp||1; def *= mm.def||1; aspd *= mm.aspd||1; }
  // Keep the existing mode rune/equipment result separate from normal attribute
  // modifiers; a later skill must not multiply already-folded talent bonuses.
  const attributeBase={version:window.ArkAttributes.version,atk,def,aspd,maxHp:hp};
  let talentAtk=entry.power?.includes('rhodes')?commandCarriedBonus().atk:0,talentDef=0,talentAspd=0;
  // 天赋：被动常驻 buff 作为永久属性修正；deploy/attack 触发效果进事件列表
  let talentDodge = 0;
  const events = [],talents=activeTalents(entry,elite).map(t=>({...t}));
  for(const mt of combatModule?.talents||[])if(mt.potential<=(train.potential||0)){
    const t=talents.find(t=>t.name===mt.name);if(t&&(['char_391_rosmon','char_2015_dusk','char_4211_snhunt','char_4139_papyrs','char_4196_reckpr','char_171_bldsk','char_108_silent'].includes(entry.charId)||basicAttack?.tactician))t.blackboard=mt.blackboard;
    else if(!t&&basicAttack?.tactician)talents.push({...mt,effects:[]});
  }
  // 源文案明确限定“当次攻击”的概率攻击力加成，不能当成常驻/持续buff。
  const critTalent=talents.find(t=>/当次攻击的攻击力|每次攻击有.*概率攻击力提升/.test(t.description||'')&&t.blackboard?.some(b=>['prob','prob1'].includes(b.key)));
  const critBoard=Object.fromEntries((critTalent?.blackboard||[]).map(b=>[b.key,b.value]));
  const attackCrit=critTalent?{probability:critBoard.prob??critBoard.prob1,skillProbability:critBoard.prob??critBoard.prob2??critBoard.prob1,
    attackBonus:critBoard.atk||0,scale:critBoard.atk_scale||1,stun:critBoard.stun||0,
    frontProbability:entry.charId==='char_145_prove'?critBoard.prob2:null,extraTarget:entry.charId==='char_222_bpipe'}:null;
  for (const eff of talents.filter(t=>t!==critTalent&&!window.ArkOperatorCombat?.handledTalent(t,entry.charId)&&!window.ArkElementOperators?.handledTalent(t,entry.charId)&&!window.ArkHunter?.handledTalent(t,entry.charId)&&!window.ArkMystic?.handledTalent(t,entry.charId)&&!window.ArkDollkeeper?.handledTalent(t,entry.charId)&&!window.ArkTactician?.handledTalent(t,entry.charId)&&!window.ArkMedicSkills?.handledTalent(t,entry.charId)).flatMap(t=>t.effects||[])) {
    if (eff.trigger === 'deploy' || eff.trigger === 'attack') { events.push(eff); continue; }
    if (eff.type === 'buff_atk') talentAtk += eff.power;
    else if (eff.type === 'buff_def') talentDef += eff.power;
    else if (eff.type === 'buff_maxhp') hp *= 1 + eff.power;
    else if (eff.type === 'buff_atkspd') talentAspd += eff.power;
    else if (eff.type === 'dodge') talentDodge = Math.max(talentDodge, eff.power);
  }
  atk*=Math.max(0,1+talentAtk);def*=Math.max(0,1+talentDef);
  aspd+=talentAspd+modAspd;attributeBase.aspd=aspd;
  // 技能（精锐强化）
  let skill = null;
  if (entry.skill) {
    const source=operatorSkillSource(entry.charId);
    skill = { ...entry.skill, ...(source?{normal:source.normal,elite:source.elite,realName:source.name,realDesc:source.desc,realType:source.type,realDurationType:source.durationType,realIcon:source.elite?.prefabId||source.normal?.prefabId}: {}) };
    // 普通/精锐各取自身等级的数值、范围和文案；不为加快节奏截断源数据。
    const legacyLevel=(elite&&skill.elite)?skill.elite:(skill.normal||skill.elite||{});
    // Keep legacy execution fallback until an explicit handler replaces it; exact fields do not imply implemented behavior.
    const lv = {...legacyLevel,...(window.ArkSkillLevels?.get(source?.skillId,train.skillLevel)||basicAttack?.tactician?.skillLevels?.[source?.skillId]?.[train.skillLevel-1]||window.ArkCommonSkillData?.skillLevels?.[source?.skillId]?.[train.skillLevel-1]||window.ArkElementData?.skillLevels?.[source?.skillId]?.[train.skillLevel-1]||{})};
    if (lv.spCost != null) skill.spCost = lv.spCost;
    skill.maxCharge = Math.max(1, lv.maxCharge || 1);
    skill.initSp = (lv.initSp != null) ? lv.initSp : 0;
    if (lv.duration != null) skill.duration = lv.duration;
    skill.spType = lv.spType || 'INCREASE_WITH_TIME';
    skill.spIncrement = lv.spIncrement == null ? 1 : lv.spIncrement;
    skill.durationType = lv.durationType || 'NONE';
    skill.ammoCount=skill.durationType==='AMMO'?lv.blackboard?.['attack@trigger_time']??null:null;
    skill.rangeGrids = lv.rangeGrids || null;
    skill.realRangeId = lv.rangeId || null;
    skill.realType = lv.skillType || skill.realType;
    if (lv.name != null) skill.realName = lv.name;
    skill.sourceId=source?.skillId;
    skill.realIcon=source?.iconId||lv.prefabId||skill.realIcon;
    skill.blackboard=lv.blackboard||{};
    if (lv.desc != null) skill.realDesc = lv.desc;
    skill.realSpCost = skill.spCost; skill.realInitSp = skill.initSp;
    skill.realDuration = skill.duration; skill.realMaxCharge = skill.maxCharge;
    // 弹药/特殊充能保留既有近似并显式标记；不将其作为常规时序已完成的样本。
    skill.timingApproximate = (skill.durationType === 'AMMO'&&!skill.ammoCount) || !['INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE'].includes(skill.spType);
    if (skill.realName) skill.name = skill.realName;
    skill.isPassive = !!(lv.isPassive);
    // 效果算子列表：有真实分类用 effects；否则把职业模板 type/power 包成单算子兜底
    if (Array.isArray(lv.effects)) {
      skill.effects = lv.effects.map(e => ({ ...e }));
    } else if (skill.type && skill.power != null) {
      skill.effects = [{ type: skill.type, power: skill.power }];
    } else {
      skill.effects = [];
    }
    const sb=skill.blackboard;
    if(basicAttack?.action==='heal'){
      // The old text classifier interpreted "allies take damage" as an enemy AoE.
      // Healing branches have no such effect unless the source explicitly damages enemies.
      const desc=(lv.desc||'').replace(/<[^>]*>/g,'');
      if(!/敌[人方].*(?:造成|受到).*伤害|对.*敌.*造成.*伤害/.test(desc))skill.effects=skill.effects.filter(e=>!['burst_damage','aoe_damage','snipe','debuff_def','slow'].includes(e.type));
      if(Number.isFinite(sb.attack_speed)){
        skill.effects=skill.effects.filter(e=>e.type!=='buff_atkspd');
        skill.effects.push({type:'buff_atkspd',power:sb.attack_speed/100});
      }
      if(Number.isFinite(sb.base_attack_time)){
        skill.effects=skill.effects.filter(e=>e.type!=='buff_atkspd');
        skill.effects.push({type:'buff_attack_interval',power:sb.base_attack_time/aspd});
      }
      if(!/范围.*(?:扩大|格)|范围强化/.test(desc))skill.effects=skill.effects.filter(e=>e.type!=='buff_range');
      if(skill.sourceId==='skchr_lumen_3')skill.effects=skill.effects.filter(e=>e.type!=='heal');
    }
    // This bard skill replaces recovery with periodic true damage and grants
    // ATK inspiration to allies. Neither effect is a self buff or an opening nuke.
    if(skill.sourceId==='skchr_skadi2_3')skill.effects=[];
    if(skill.sourceId==='skchr_cetsyr_3')skill.effects=skill.effects.filter(e=>!['heal','buff_maxhp'].includes(e.type));
    window.ArkClientStatBuffSkills?.configure(skill,entry.charId);
    window.ArkOperatorCombat?.configure(skill);
    window.ArkElementOperators?.configure(skill);
    window.ArkCommonSkills?.configure(skill);
    window.ArkMedicSkills?.configure(skill);
    window.ArkMystic?.configure(skill);
    window.ArkDollkeeper?.configure(skill);
    window.ArkTactician?.configure(skill);
    window.ArkFlowShape?.configure(skill);
    window.ArkClientPrograms?.configure(skill,entry.charId);
    window.ArkSkillModes?.configure(skill,entry.charId);
    window.ArkDirectSkills?.configure(skill,entry.charId);
    if (elite) skill.elite = true;   // 精锐技能数值已取 Lv7 变体，不再另乘 1.5 近似
  }
  const dollPassive=window.ArkDollkeeper?.passive(skill);if(dollPassive){hp*=1+dollPassive.max_hp;magicRes+=dollPassive.magic_resistance;}
  // 被动技能：buff/dodge 类效果改为部署时施放（不进充能释放）
  if (skill && skill.isPassive && skill.effects) {
    for (const eff of skill.effects) if (eff.type.startsWith('buff') || eff.type === 'dodge') events.push({ ...eff, trigger: 'deploy' });
    skill.effects = [];
  }
  return {
    maxHp: Math.round(hp), atk: Math.round(atk), def: Math.round(def),
    attackTime: entry.baseAttackTime / window.ArkAttributes.clampSpeed(aspd),attributeBase,
    blockCnt, respawnTime, cost:Math.max(0,(phaseD?.cost??BATTLE.operators.find(x=>x.charId===entry.charId)?.cost??0)+tacticalCarriedCost(entry)), range: entry.position==='RANGED' ? 3 : 1,
    magicRes, atkType: entry.atkType || 'phys',
    reviveChance, dmgTaken, cooperationDamage:bondMods?.cooperationDamage||1,cooperationResistance:bondMods?.cooperationResistance||1,dodge: talentDodge, skill, events,attackCrit,basicAttack,
    combatTalents:talents.filter(t=>window.ArkOperatorCombat?.handledTalent(t,entry.charId)||window.ArkElementOperators?.handledTalent(t,entry.charId)||window.ArkHunter?.handledTalent(t,entry.charId)||window.ArkMystic?.handledTalent(t,entry.charId)||window.ArkDollkeeper?.handledTalent(t,entry.charId)||window.ArkTactician?.handledTalent(t,entry.charId)||window.ArkMedicSkills?.handledTalent(t,entry.charId)).map(t=>({name:t.name,blackboard:t.blackboard})),
  };
}

// 计算场上盟约：返回 { active:{bondId:stack}, mods:{opId:{...}} }
// 与 attrByBond 使用同一份本局值；人数进度和额外叠层分别保存，显示时不能只拿人数。
function bondLayerCount(bid, session=G) {
  return Math.max(0, Number(session?.activeBonds?.[bid]||0) + Number(session?.addLayers?.[bid]||0));
}
// 应用干员级 garrison「按盟约层数加属性」规则（GAIN_BUFF / act1autochess_gar_eff_attrByBond）
function applyGarrisonStatMods(e,active,m){return garrisonStatMods({entry:e,elite:false},active,m);}
// 策略(band)效果分发（U-STRATEGY）：按 band_effects.json 的 effect key 应用。当前已实现「盟约层数加成」（prep_finish_char_bond_add_layer，band_bldsk 华法琳）；
// 其余 effect key（属性 buff/经济/特殊装备/复活等）待对应子系统接入（见 findings.md U-STRATEGY 记录）。
function bandBondsOf(e) {
  const b = [];
  if (e && e.seasonBond) b.push(e.seasonBond);
  for (const x of ((e && e.regBonds) || [])) b.push(x);
  return b;
}
function applyBandStrategy(bandId, board) {
  if (!bandId || !Array.isArray(BAND_EFFECTS) || !G) return;
  const be = runBandEffects().find(x => x.bandId === bandId);
  if (!be || !be.mechs) return;
  for (const m of be.mechs) {
    if (m.key === 'prep_finish_char_bond_add_layer') {
      const layerEl = (m.bb || []).find(x => x.k === 'layer');
      const layer = (layerEl && layerEl.v != null) ? Number(layerEl.v) : 2;
      const byTier = {};
      for (const o of board) { const t = o.entry.tier || 1; (byTier[t] = byTier[t] || []).push(o); }
      for (const t in byTier) {
        const pool = byTier[t]; if (!pool.length) continue;
        const op = pool[Math.floor(gameRandom() * pool.length)];
        for (const bid of bandBondsOf(op.entry)) if (BOND_DEFS[bid]) G.addLayers[bid] = (G.addLayers[bid] || 0) + layer;
      }
    }
    // 其余 effect key 暂留空，待后续接入
  }
}
// 通用「分档属性 buff」应用器（env_gbuff_new_with_verify，U-STRATEGY 可复用模式，覆盖 10 条策略）：
// blackboard 含 value_1..3（达标档位）+ atk_1..3 / max_hp_1..3 / def_1..3 / aspd_1..3（对应档位加成）；
// 变体：bond_id（限指定盟约）、atk_per_cnt/max_hp_per_cnt（按达标数×每层加成）、单值 atk/max_hp。达标数默认=激活盟约数量。
function bbNum(bb, k) { const x = bb.find(v => v.k === k); return x ? Number(x.v) : null; }
function bbStr(bb, k) { const x = bb.find(v => v.k === k); return x ? x.v : null; }   // 字符串/原始值 blackboard（bond/chess/type/pool 等，勿用 bbNum 强转数字）
function tierBuff(bb, stat, cur) {
  let best = null;
  for (let i = 1; i <= 3; i++) {
    const vt = bbNum(bb, 'value_' + i); if (vt == null) continue;
    const sv = bbNum(bb, stat + '_' + i); if (sv == null) continue;
    if (cur >= vt) best = sv;   // 取满足的最大档位
  }
  return best;
}
function applyBandStatBuff(band, boardOps, active, mods) {
  if (!band || !Array.isArray(BAND_EFFECTS) || !mods) return;
  const be = runBandEffects().find(x => x.bandId === band); if (!be || !be.mechs) return;
  for (const m of be.mechs) {
    if (m.key !== 'env_gbuff_new_with_verify') continue;
    const bb = m.bb || [];
    // Source band31 is Amiya's season-I FUNNY-only baseline, named in bandDesc.
    const standardBonus=band==='band_amiya'&&bbStr(bb,'key')==='act1autochess_band31_buff';
    if(standardBonus&&!G?.modeId?.endsWith('_funny'))continue;
    const bondExact = bbStr(bb, 'bond_id');
    let cur = bondExact ? (active[bondExact] || 0) : Object.keys(active || {}).length;   // 达标数：限盟约=该盟约 stack；否则=激活盟约数
    const A = tierBuff(bb, 'atk', cur), H = tierBuff(bb, 'max_hp', cur), D = tierBuff(bb, 'def', cur), AS = tierBuff(bb, 'aspd', cur);
    const apc = bbNum(bb, 'atk_per_cnt'), mpc = bbNum(bb, 'max_hp_per_cnt');
    for (const o of boardOps) {
      const mm = mods[o.id]; if (!mm) continue;
      if(standardBonus){mm.atk*=1+(bbNum(bb,'atk')||0);mm.hp*=1+(bbNum(bb,'max_hp')||0);mm.def*=1+(bbNum(bb,'def')||0);}
      if (A != null) mm.atk *= 1 + A;
      if (H != null) mm.hp *= 1 + H;
      if (D != null) mm.def *= 1 + D;
      if (AS != null) mm.aspd *= 1 + AS;
      if (apc) mm.atk *= 1 + apc * cur;
      if (mpc) mm.hp *= 1 + mpc * cur;
    }
  }
}
// 回合开始策略钩子（U-STRATEGY 可复用）：处理回合开始类机制（首回合经济 give_coin_in_round 等），在 startRound 调用。
// 其余经济/获得干员/刷新/特殊装备等 key 依赖商店/干员池/子系统，见 findings.md U-STRATEGY 记录，待对应钩子接入。
function applyBandOnRound(bandId, round) {
  if (!bandId || !Array.isArray(BAND_EFFECTS) || !G) return;
  const be = runBandEffects().find(x => x.bandId === bandId); if (!be || !be.mechs) return;
  for (const m of be.mechs) {
    if (m.key === 'give_coin_in_round') {
      // This is a replacement allowance (including zero), applied by roundMoney before round-start bonuses.
    } else if (m.key === 'gain_bond_char_per_round') {   // 哈洛德【人才盲盒】：从第 round 回合起每 preround 回合获得 1 名 bond 干员
      const bb = m.bb || [];
      const bond = bbStr(bb, 'bond'), cnt = bbNum(bb, 'count') || 1, start = bbNum(bb, 'round') || 4, every = bbNum(bb, 'preround') || 2;
      if (bond && round >= start && (round - start) % every === 0) { for (let i = 0; i < cnt; i++) grantBandOperator({ bond, tierMax: G.level, intoShop: true }); flash('人才盲盒：获得 ' + (BOND_DEFS[bond] ? BOND_DEFS[bond].name : '') + ' 干员'); }
    } else if (m.key === 'round_start_gain_char_chess_in_shop_every_n_round') {   // 松桐【九流之缘】：每 n 回合（偶数）随机获得调度中心干员
      const every = bbNum(m.bb || [], 'round') || 2;
      if (round % every === 0) { grantBandOperator({ tierMax: G.level, intoShop: true }); flash('九流之缘：随机获得调度中心干员'); }
    } else if (m.key === 'round_start_bond_check_gain_layer') {   // 余【文火慢炖】：第 round 回合，仅激活 1 盟约 → 该盟约 +count1 层，否则所有激活盟约 +count2 层
      const bb = m.bb || [];
      const rt = bbNum(bb, 'round') || 8, c1 = bbNum(bb, 'count1') || 36, c2 = bbNum(bb, 'count2') || 12;
      if (round === rt) {
        const act = Object.keys(G.activeBonds || {});
        if (!G.addLayers) G.addLayers = {};
        if (act.length === 1) G.addLayers[act[0]] = (G.addLayers[act[0]] || 0) + c1;
        else for (const bid of act) G.addLayers[bid] = (G.addLayers[bid] || 0) + c2;
        flash('文火慢炖：盟约层数 ' + (act.length === 1 ? '+' + c1 : '+' + c2 + '（全部）'));
      }
    } else if (m.key === 'preparation_start_gain_chess_from_round') {   // gainchess：指定回合获得棋（char→干员近似；chess_item_*→装置）
      const bb = m.bb || []; const chess = bbStr(bb, 'chess'), rt = bbNum(bb, 'round'), type = bbStr(bb, 'type') || 'equip';
      if (chess && round === rt) { if (type === 'char') { const cid = MODE_RULES.seasons[G.seasonId]?.operators[chess]?.charId || null; if (cid) grantSpecificOperator(cid, true); else grantBandOperator({ tierMax: G.level, intoShop: true }); } else rewardTrap(chess); flash('获得棋'); }
    } else if (m.key === 'preparation_start_gain_chess_every_n_round') {   // 杜宾【练兵】：每 round 回合获得棋（char→干员；chess_item_*→装置）
      const bb = m.bb || []; const every = bbNum(bb, 'round') || 2, cnt = bbNum(bb, 'count') || 1, chess = bbStr(bb, 'chess'), type = bbStr(bb, 'type') || 'equip';
      if (chess && round % every === 0) { for (let i = 0; i < cnt; i++) { if (type === 'char') { const cid = MODE_RULES.seasons[G.seasonId]?.operators[chess]?.charId || null; if (cid) grantSpecificOperator(cid, true); else grantBandOperator({ tierMax: G.level, intoShop: true }); } else rewardTrap(chess); } flash('获得棋'); }
    } else if (m.key === 'preparation_start_add_special_goods_every_n_round') {   // 娜仁图亚：每 n 回合获得特殊装备（specialeq）
      const every = bbNum(m.bb || [], 'round') || 2;
      if (round % every === 0) { rewardSpecialEquip(bbNum(m.bb || [], 'count') || 1); flash('获得特殊装备'); refreshBoard(); renderAll(); }
    } else if (m.key === 'round_start_activate_char_chess_effect_in_board') {   // 铃兰：回合开始重新激活场上干员的 SERVER_GAIN（获得时）特质
      const ops = (G.ops || []).filter(o => o.row != null);
      let n = 0;
      for (const o of ops) { const gars = garrisonTraits(o,false).filter(g => g.eventType === 'SERVER_GAIN');if(gars.length){garrisonEvent('SERVER_GAIN',o);n+=gars.length;} }
      if (n) flash('铃兰：激活场上干员增益 x' + n);
    } else if (m.key === 'round_start_gain_coin_by_bond_char_chess_buy') {   // 玛恩纳【业务指标】：上回合购买 bond 干员数 → 本回合资金 +1/名（至多 max_count）
      const bb = m.bb || [];
      const mx = bbNum(bb, 'max_count') || 3;
      const bonus = Math.min(mx, (G._bondBuyBonus || 0));
      if (bonus > 0) { G.money += bonus; updateHud(); flash('业务指标：上回合购买加成 +' + bonus); }
      G._bondBuyBonus = 0;
    } else if (m.key === 'prep_start_gain_chess_from_pool_in_round') {   // 老鲤【得闲饮茶】：第 round 回合从池获得干员（pool_chess_shop_N_reward → N 阶近似）
      const bb = m.bb || [];
      const rt = bbNum(bb, 'round'), pool = bbStr(bb, 'pool'), cnt = bbNum(bb, 'count') || 1;
      if (round === rt) {
        const mt = /pool_chess_shop_(\d+)_reward/.exec(String(pool || ''));
        const tier = mt ? Number(mt[1]) : null;
        for (let i = 0; i < cnt; i++) { if (tier) grantBandOperator({ tierMin: tier, tierMax: tier, intoShop: true }); else grantBandOperator({ tierMax: G.level, intoShop: true }); }
        flash('得闲饮茶：获得' + (tier ? ' ' + tier + ' 阶干员' : '随机干员'));
      }
    }
    // 其余 key 暂留空，待对应子系统/钩子接入
  }
}
// 购买类策略折扣（U-STRATEGY 可复用）：first_buy_in_round_char_price_change —— 本回合首次购买指定盟约干员降价 price（休露丝【私募基金】）。
function bandFirstBuyDiscount(entry) {
  if (!G || !entry || !Array.isArray(BAND_EFFECTS)) return 0;
  const be = runBandEffects().find(x => x.bandId === G.band); if (!be) return 0;
  const m = be.mechs.find(x => x.key === 'first_buy_in_round_char_price_change'); if (!m) return 0;
  if (G._firstBuyUsed) return 0;
  const bb = m.bb || [];
  const bond = bbStr(bb, 'bond'), price = bbNum(bb, 'price');
  if (bond == null || price == null) return 0;
  if (!bandBondsOf(entry).includes(bond)) return 0;
  G._firstBuyUsed = true;
  return price;
}
// 坎诺特【利滚利】coin_carry_over：剩余资金全额继承；剩余 ≥ capital 时每回合额外 +interest（至多 max）
function bandCoinCarryOver(prevMoney) {
  if (!G || !Array.isArray(BAND_EFFECTS)) return 0;
  const be = runBandEffects().find(x => x.bandId === G.band); if (!be) return 0;
  const m = be.mechs.find(x => x.key === 'coin_carry_over'); if (!m) return 0;
  const bb = m.bb || [];
  const capital = bbNum(bb, 'capital'), interest = bbNum(bb, 'interest') || 0, max = bbNum(bb, 'max') || 0;
  let carry = prevMoney || 0;
  if (capital != null && prevMoney >= capital) carry += Math.min(max, interest);
  return carry;
}
// 巫恋【替身娃娃】first_sell_char_chess_exchange_char_chess_in_shop：每回合首次出售改为与调度中心随机干员交换（不返还资金）
function bandFirstSellExchange() {
  if (!G || !Array.isArray(BAND_EFFECTS) || G._firstSellUsed) return false;
  const be = runBandEffects().find(x => x.bandId === G.band); if (!be) return false;
  const m = be.mechs.find(x => x.key === 'first_sell_char_chess_exchange_char_chess_in_shop'); if (!m) return false;
  G._firstSellUsed = true;
  grantBandOperator({ tierMax: G.level });   // 交换：随机获得调度中心干员（加入手牌）
  flash('替身娃娃：首次出售改为与调度中心干员交换');
  return true;
}
// 梓兰【猎头顾问】band_shop_refresh_copy_max_lv_char：主动刷新时复制当前商店最高阶干员（count 份）
function bandRefreshCopyMaxLv() {
  if (!G || !Array.isArray(BAND_EFFECTS) || !G.shop) return null;
  const be = runBandEffects().find(x => x.bandId === G.band); if (!be) return null;
  const m = be.mechs.find(x => x.key === 'band_shop_refresh_copy_max_lv_char'); if (!m) return null;
  const cnt = bbNum(m.bb || [], 'count') || 1;
  const ops = G.shop.filter(s => s.type === 'op' && s.entry);
  if (!ops.length) return null;
  let top = ops[0];
  for (const s of ops) if ((s.entry.tier || 0) > (top.entry.tier || 0)) top = s;
  return { entry: top.entry, cnt };
}
// 按 chess 对应 charId 特指获得干员（gainchess char 类，如 Pith 开局给 char_616_pithst 盟约·辅助干员）
function grantSpecificOperator(charId, intoShop) {
  if (!charId || !Array.isArray(ROSTER_LIST)) return null;
  const e = ROSTER[charId]; if (!e) return null;
  if (intoShop && G.shop) G.shop.push({ type:'op', entry: e, cost: operatorPurchasePrice(e) }); else addOperator(e.charId, false);
  return e;
}
// 通用「按条件获得干员」应用器（U-STRATEGY 可复用）：按 bond(盟约)/tierMax/tierMin 从 ROSTER_LIST 随机抽 1 名，加入商店或手牌。
// 供获得干员类策略复用（绮良/潘格尼尼/贾维/哈洛德/松桐/玛恩纳）。
function grantBandOperator(opts) {
  if (!G || !Array.isArray(ROSTER_LIST)) return null;
  const pool = ROSTER_LIST.filter(e => {
    if(G?.bannedOperators?.includes(e.charId))return false;
    if (opts.tierMax != null && e.tier > opts.tierMax) return false;
    if (opts.tierMin != null && e.tier < opts.tierMin) return false;
    if (opts.bond && !bandBondsOf(e).includes(opts.bond)) return false;
    return true;
  });
  if (!pool.length) return null;
  const e = pool[Math.floor(gameRandom() * pool.length)];
  if (opts.intoShop && G.shop) { G.shop.push({ type:'op', entry: e, cost: operatorPurchasePrice(e) }); }
  else addOperator(e.charId, false);
  return e;
}
function computeBonds(boardOps) {
  const members = {};
  for (const bid in BOND_DEFS) members[bid] = new Set();
  for (const o of boardOps) {
    const e = o.entry;
    if (e.seasonBond) members[e.seasonBond].add(o.charId);
    for (const bid of e.regBonds) members[bid].add(o.charId);
    if (o.elite) members['suntShip'].add(o.charId);
  }
  const active = {};
  const maniActive = members['maniShip'].size >= BOND_DEFS['maniShip'].need;
  for (const bid in BOND_DEFS) {
    let n = members[bid].size;
    if (BOND_DEFS[bid].type === 'SEASON' && maniActive) n += 1;   // 调和：核心盟约激活人数 +1
    if (n >= BOND_DEFS[bid].need) active[bid] = n;
  }
  // 独行：仅1名独行在场才激活
  if (members['soloShip'].size !== 1) delete active['soloShip'];

  const mods = {};
  for (const o of boardOps) mods[o.id] = { atk:1, hp:1, def:1, aspd:1, reviveChance:0, dmgTaken:1 };
  for (const bid in active) {
    const c = bondLayerCount(bid,{activeBonds:active,addLayers:G?.addLayers});
    for (const o of boardOps) {
      const e = o.entry, m = mods[o.id];
      switch (bid) {
        case 'yanShip': if (bandBondsOf(e).includes('yanShip')) m.atk *= 1.23+0.009*c; break;
        case 'sargonShip': if (bandBondsOf(e).includes('sargonShip')) m.aspd *= 1+Math.min(3,0.12*c); break;
        case 'victoriaShip': if (bandBondsOf(e).includes('victoriaShip')) m.atk *= 1.25+0.008*c; break;
        case 'kjeragShip': if (bandBondsOf(e).includes('kjeragShip')) m.atk *= 1.25; break;
        case 'lateranoShip': if (bandBondsOf(e).includes('lateranoShip')) m.aspd *= 1.05+0.015*c; break;
        case 'egirShip': if (bandBondsOf(e).includes('egirShip')) m.hp *= 1.35+0.01*c; break;
        case 'siracusaShip': if (bandBondsOf(e).includes('siracusaShip')) m.aspd *= 1.25+0.008*c; break;
        case 'kazimierzShip': if (bandBondsOf(e).includes('kazimierzShip')) m.atk *= 1.30+0.005*c; break;
        case 'preciShip': if (e.regBonds.includes('preciShip')) m.atk *= 1.10+0.012*c; break;
        case 'arcaneShip': if (e.regBonds.includes('arcaneShip')) m.atk *= 1.20+0.01*c; break;
        case 'steadShip': m.hp *= 1.25+0.012*c; break;
        case 'raidShip': if (e.regBonds.includes('raidShip')) { m.atk *= 1.25+0.01*c; m.hp *= 1.25+0.01*c; } break;
        case 'indomShip': if (e.regBonds.includes('indomShip')) m.reviveChance = Math.min(0.9, 0.18+0.004*c); break;
        case 'swiftShip': if (e.regBonds.includes('swiftShip')) m.aspd *= 1.10+0.01*c; break;
        case 'deputShip': m.def *= 1.15+0.012*c; break;
        case 'skillfulShip': if (e.regBonds.includes('skillfulShip')) m.aspd *= 1.10+0.01*c; break;
        case 'emptyShip': {
          const rule=DIY_ROSTER.seasons[G?.seasonId||setupSeason()].fallbackRule,bb=Object.fromEntries(rule.blackboard.map(b=>[b.key,b.value]));
          m.cooperationResistance=1-bb.damage_resistance;
          if(G?.seasonId==='act1autochess'||e.regBonds.includes('emptyShip'))m.cooperationDamage=o.elite?bb.damage_scale_extra:bb.damage_scale_normal;
          break;
        }
        case 'soloShip': if (e.regBonds.includes('soloShip')) { m.atk *= 1.6; m.hp *= 1.6; } break;
        case 'suntShip': if (o.elite) m.atk *= 1.30; break;
      }
    }
  }
  if(GMODE!=='normal')for (const o of boardOps) garrisonStatMods(o, active, mods[o.id]);
  return { active, mods };
}

// ADD_BOND（事件叠层）：engine.js 在击杀/开技/阵亡时回调；按触发阈值累加盟约层数，并回写在场干员属性
function onBondGarrison(trig,op){return garrisonCombatEvent(trig,op);}

// 结算棋盘：为每个部署干员计算最终属性（在部署/改装备/合成后调用）
function resolveBoard() {
  const ops = G.ops.filter(o => o.row != null);
  const { active, mods } = computeBonds(ops);
  G.activeBonds = active;
  applyBandStatBuff(G.band, ops, active, mods);   // 策略属性 buff（U-STRATEGY 复用模式：env_gbuff 分档/层数）在结算属性前应用
  if (G._trapAtk) for (const o of ops) if (mods[o.id]) mods[o.id].atk *= 1 + G._trapAtk;   // 部署装置的全局攻击 buff（U-ITEMS）
  for (const o of ops) {
    const fm = finalizeOperator(o.entry, mods[o.id], o.equip, o.elite);
    if(GMODE!=='normal')garrisonFinalize(o,active,fm);
    o.garrisonStats=fm.garrisonStats;
    o.attributeBase=fm.attributeBase;o.basicAttack=fm.basicAttack;o.combatTalents=fm.combatTalents;
    o.maxHp = fm.maxHp; o.atk = fm.atk; o.def = fm.def; o.attackTime = fm.attackTime;
    o.blockCnt = fm.blockCnt; o.respawnTime = fm.respawnTime; o.range = fm.range; o.reviveChance = fm.reviveChance; o.dmgTaken = fm.dmgTaken;
    o.cooperationDamage=fm.cooperationDamage;o.cooperationResistance=fm.cooperationResistance;
    o.dodge = fm.dodge || 0;
    o.magicRes = fm.magicRes || 0; o.atkType = fm.atkType || 'phys';
    o.events = fm.events || [];
    o.attackCrit=fm.attackCrit;
    o.skill = fm.skill;
    o.cost = fm.cost;
  }
  return { active, mods };
}
// ---- 卫戍协议特质：源表普通/精锐变体，共用本机与房主模拟 ----
let GARRISON_DATA={seasons:{},enemyTags:{}}, GARRISON_EQUIPS=[];
function garrisonSeason(){return GARRISON_DATA.seasons[G?.seasonId||setupSeason()]||null;}
function garrisonProfile(o){const e=o.entry||o;return garrisonSeason()?.operators[e.charId]?.find(p=>e.chessId?p.chessId===e.chessId:p.tier===e.tier)||null;}
function garrisonTraits(o,borrowed=true){
 const p=garrisonProfile(o),s=garrisonSeason();
 const native=p?(o.elite?p.golden:p.normal).map(id=>s.traits[id]):(o.entry||o).bondGarrison||[];
 return [...native,...(borrowed?(o._garrisonBorrowed||[]):[])].filter(Boolean).map(g=>g.bb?g:{...g,bb:Object.fromEntries((g.blackboard||[]).map(b=>[b.key,b.valueStr??b.value]))});
}
function garrisonIds(value){return String(value??'').split(',').map(x=>x.trim()).filter(Boolean);}
function garrisonBonds(o){return garrisonProfile(o)?.bonds||bandBondsOf(o.entry||o);}
function garrisonFront(o,distance=1){const [r,c]=({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]})[o.dir||'up'];return {row:o.row+r*distance,col:o.col+c*distance};}
function garrisonAt(o,distance=1,ops=G.ops){if(o.row==null)return null;const p=garrisonFront(o,distance);return ops.find(x=>x.row===p.row&&x.col===p.col&&x.id!==o.id);}
function garrisonOnboard(){return G.ops.filter(o=>o.row!=null&&!G.bannedOperators?.includes(o.charId));}
function garrisonActive(){return Object.keys(G.activeBonds||{}).filter(id=>G.activeBonds[id]>0);}
function garrisonMost(){return garrisonActive().sort((a,b)=>bondLayerCount(b)-bondLayerCount(a)||a.localeCompare(b))[0];}
function garrisonTiers(bid){return new Set(garrisonOnboard().filter(o=>garrisonBonds(o).includes(bid)).map(o=>o.entry.tier)).size;}
function garrisonAdd(ids,count,inactive=false){
 let changed=false;G.addLayers??={};
 for(const id of new Set(ids))if((inactive||G.activeBonds?.[id]>0)&&Number.isFinite(count)&&count>0){G.addLayers[id]=(G.addLayers[id]||0)+count;changed=true;}
 return changed;
}
function garrisonCondition(o,b){
 if(b.conditionkey==='character_target_inboard')return o.row!=null;
 if(b.conditionkey==='character_same_row')return o.row!=null&&garrisonOnboard().filter(x=>x.row===o.row).length>=(b.check_count??3);
 return true;
}
function garrisonPick(pool){return pool.length?pool[Math.floor(gameRandom()*pool.length)]:null;}
function garrisonRarePick(pool,rare){
 // Qualitative "small chance" only. The 10:1 local weight is NOT a recovered server probability.
 const weights=pool.map(e=>e.name===rare?1:10);let roll=gameRandom()*weights.reduce((a,b)=>a+b,0);
 return pool.find((e,i)=>(roll-=weights[i])<0)||null;
}
function garrisonEligible(){return ROSTER_LIST.filter(e=>garrisonProfile(e)&&!G.bannedOperators?.includes(e.charId)&&!NON_SHOP.includes(e.charId));}
function garrisonGiveItem(id){
 const item=garrisonSeason()?.items[id],eq=GARRISON_EQUIPS.find(e=>e.id===(item?.effectId||id));
 if(!eq){if(item?.itemType==='TRAP')rewardTrap(id);return false;}
 G.equipInv.push({uid:G.nextId++,id:eq.id,name:eq.name,mods:{...(eq.mods||EQUIP_MODS[eq.name])},tier:eq.tier==='golden'?2:1,kind:eq.kind});return true;
}
function garrisonPoolItems(pool){
 const sourceIds=new Set(Object.values(garrisonSeason()?.items||{}).filter(i=>!i.isGolden).map(i=>i.effectId));
 const all=GARRISON_EQUIPS.filter(e=>sourceIds.has(e.id)&&e.tier!=='golden');
 // Server pool weights are absent; only known item identities are admitted here.
 if(pool==='pool_equip_pepe')return all.filter(e=>['盟约之币','萨尔贡浓茶','黄沙罗盘'].includes(e.name));
 if(pool==='pool_equip_rockr')return all.filter(e=>/洛洛/.test(e.name+' '+e.desc));
 return all.filter(e=>e.kind==='stat');
}
function garrisonEvent(event,owner=null,chain=new Set(),override=null){
 if(!G||GMODE==='normal')return;
 const list=owner?[owner]:G.ops.slice(); // New rewards cannot retroactively join this phase's iteration.
 for(const o of list)for(const g of (override||garrisonTraits(o,false))){
  if(g.eventType!==event)continue;
  const token=(event==='SERVER_GAIN'?o.charId:o.id)+':'+g.id+':'+event;if(chain.has(token))continue;
  const next=new Set(chain);next.add(token);
  if(next.size>64)throw Error('特质触发链异常');
  garrisonExecute(g,o,next);
 }
}
function garrisonExecute(g,o,chain=new Set()){
 const b=g.bb||Object.fromEntries((g.blackboard||[]).map(v=>[v.key,v.valueStr??v.value]));
 if(!garrisonCondition(o,b))return;
 const ids=garrisonIds(b.bond),count=Number(b.count??1),board=garrisonOnboard();
 const add=(bids,n)=>garrisonAdd(bids,n,/无需激活/.test(g.desc));
 const addOwn=(x,n)=>{if(x)add(garrisonBonds(x),n);};
 switch(g.kind){
 case 'SERVER_ADD_BOND':add(ids,count);break;
 case 'SERVER_ADD_MULTIPLE_BOND':{const counts=garrisonIds(b.count).map(Number);ids.forEach((id,i)=>add([id],counts[i]));break;}
 case 'SERVER_ADD_BOND_CHESS_ALL':addOwn(o,count);break;
 case 'SERVER_ADD_BOND_METHOD':
  for(const id of ids){const values={shoplv:G.level,round_gain_char:G._garrisonRoundGained||0,hand_count:G.ops.filter(x=>x.row==null).length,same_row:board.filter(x=>x.row===o.row).length,same_bond_diff_lv:garrisonTiers(id)};add([id],(values[b.add_method]||0)*(b.multi??1));}break;
 case 'SERVER_ADD_BOND_ACTIVATED_MOST_LAYER':{const id=garrisonMost();if(id)add([id],count);break;}
 case 'SERVER_ADD_ACT_BOND_DIFF_LV_MOST_LAYER':{const id=garrisonMost();if(id)add([id],garrisonTiers(id)*(b.multi??1));break;}
 case 'SERVER_ADD_BOND_ACTIVATED_RANDOM':for(let i=0;i<(b.rand_count??1);i++){const id=garrisonPick(garrisonActive());if(id)add([id],count);}break;
 case 'SERVER_ADD_BOND_POSITION':addOwn(o,count);addOwn(garrisonAt(o,b.dir==='behind'?-1:1),count);break;
 case 'SERVER_ADD_BOND_FRONT_ALL_LAYER':for(let i=1;i<=Math.max(BDATA?.level?.rows||0,BDATA?.level?.cols||0);i++)addOwn(garrisonAt(o,i),count);break;
 case 'SERVER_ADD_BOND_IN_HAND':for(const x of G.ops.filter(x=>x.row==null))addOwn(x,count);break;
 case 'SERVER_ADD_BOND_ROUND_COIN_COST':add(ids,Math.floor((G._garrisonRoundSpent||0)/Math.max(1,count))*(b.layer??1));break;
 case 'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER':add(ids,Math.min(b.max_layer??Infinity,(G._garrisonRoundRefresh||0)*(b.multiplier??1)));break;
 case 'SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT':if(G._garrisonRoundRefresh===b.refresh_cnt)add(ids,b.layer);break;
 case 'SERVER_ONCE_GOLD_WITH_BOND_CONDITION':if(o.row==null&&!ids.some(id=>G.activeBonds?.[id]>0))break;
 // Falls through: this is next preparation's allowance, never immediate spending money.
 case 'SERVER_ONCE_GOLD':G._nextRoundCoin=(G._nextRoundCoin||0)+count;break;
 case 'SERVER_GAIN_FREE_REFRESH_COUNT':G._garrisonFreeRefresh=(G._garrisonFreeRefresh||0)+count;break;
 case 'SERVER_GAIN_CHAR':{const p=garrisonSeason()?.chess[b.chess];if(p)for(let i=0;i<count;i++)addOperator(p.charId,p.elite,chain);break;}
 case 'SERVER_GAIN_EQUIP':for(let i=0;i<count;i++)garrisonGiveItem(b.chess);break;
 case 'SERVER_GAIN_RANDOM_EQUIP_CHESS_IN_POOL':if(!garrisonIds(b.round_list).includes(String(G.round)))break;
 case 'SERVER_POOL_EQUIP':for(let i=0;i<count;i++){const pool=garrisonPoolItems(b.pool),eq=b.pool==='pool_equip_pepe'?garrisonRarePick(pool,'黄沙罗盘'):garrisonPick(pool);if(eq)garrisonGiveItem(eq.id);else(G._garrisonMissing??={})[g.id]='缺少定制品池';}break;
 case 'SERVER_POOL_CHAR':{
  const names=b.pool==='pool_char_pinus'?['野鬃','灰毫','远牙']:['斯卡蒂','幽灵鲨',G.seasonId==='act1autochess'?'安哲拉':'深巡'];
  const pool=garrisonEligible().filter(e=>names.includes(e.name));for(let i=0;i<count;i++){const e=b.pool==='pool_char_pinus'?garrisonRarePick(pool,'远牙'):garrisonPick(pool);if(e)addOperator(e.charId,false,chain);}break;
 }
 case 'SERVER_MOST_BOND':{
  const n={};for(const x of board)for(const id of garrisonBonds(x))(n[id]??=new Set()).add(x.charId);
  const id=Object.keys(n).sort((a,b)=>n[b].size-n[a].size||a.localeCompare(b))[0];
  const e=garrisonPick(garrisonEligible().filter(e=>e.charId!==o.charId&&garrisonBonds(e).includes(id)));if(e)addOperator(e.charId,false,chain);break;
 }
 case 'SERVER_SELL_CHESS_GAIN_SPECIAL_GOODS':{const pool=b['pool'+G.level]||b.max_pool;const tier=Number(/shop_(\d+)_/.exec(pool)?.[1]);if(tier)showMergeReward(tier);break;}
 case 'SERVER_TRIGGER_ANOTHER':{
  const target=b.scope==='farright'?board.filter(x=>x.id!==o.id&&garrisonTraits(x,false).some(t=>t.eventType===b.event)).sort((a,b)=>a.row-b.row||b.col-a.col)[0]:garrisonAt(o);
  if(target)garrisonEvent(b.event,target,chain);break;
 }
 case 'SERVER_TRIGGER_FRONT_COUNT':for(let i=1;i<=count;i++){const t=garrisonAt(o,i);if(t)garrisonEvent(b.event,t,chain);}break;
 case 'SERVER_FRONT_SAME_EFFECT_PREP_START':case 'SERVER_FRONT_SAME_EFFECT_PREP_FIN':{
  const target=garrisonAt(o);if(target)garrisonEvent(g.eventType,o,chain,garrisonTraits(target,false));break;
 }
 }
}
function garrisonPrepareStart(){
 G._garrisonRoundGained=0;G._garrisonRoundSpent=0;G._garrisonRoundRefresh=0;
 for(const o of G.ops){delete o._garrisonBorrowed;delete o._garrisonDeployAt;}
 resolveBoard();garrisonEvent('SERVER_PREP_START');
}
function garrisonPrepareBattle(){
 G._gar={};for(const o of G.ops){o._garrisonBorrowed=[];delete o._garrisonDeployAt;}
 resolveBoard();garrisonEvent('SERVER_PREP_FIN');
 const board=garrisonOnboard();
 for(const o of board)for(const g of garrisonTraits(o,false))if(/^give_garri(?:s|)on_to_/.test(g.rune)){
  const b=g.bb,trait=garrisonSeason()?.traits[b.give_garrison_id||b.give_garrion_id];if(!trait)continue;
  const targets=g.rune.endsWith('_all')?board.filter(x=>garrisonBonds(x).includes(b.check_bond_id)):g.rune.endsWith('_most_right')?[board.filter(x=>x.row===o.row).sort((a,b)=>b.col-a.col)[0]]:[garrisonAt(o)];
  for(const t of targets.filter(Boolean))t._garrisonBorrowed.push({...trait,id:trait.id+'@'+o.id});
 }
}
function garrisonSteps(g,active){return garrisonIds(g.bb.bond_id).reduce((n,id)=>n+(active[id]>0?Math.floor(bondLayerCount(id,{activeBonds:active,addLayers:G.addLayers})/Math.max(1,g.bb.divide_num??1)):0),0);}
function garrisonStatMods(o,active,m){
 for(const g of garrisonTraits(o)){
  const b=g.bb,key=b.key||g.rune||'';if(g.kind!=='GAIN_BUFF')continue;
  const steps=garrisonSteps(g,active);
  if(g.rune==='char_attribute_mul'){m.atk*=b.atk??1;m.hp*=b.max_hp??1;m.def*=b.def??1;}
  if(key.endsWith('_attrByBond_add_onstart')&&(G?.phase!=='battle'||o._garrisonDeployAt!=null&&(B?.time||0)<o._garrisonDeployAt+b.duration)){
   m.baseAtk=(m.baseAtk||0)+steps*(b.atk??0);m.baseHp=(m.baseHp||0)+steps*(b.max_hp??0);
  }
  if(key==='act1autochess_gar_eff_attrByBond'){
   m.atk*=1+steps*(b.atk??0);m.hp*=1+steps*(b.max_hp??0);m.def*=1+steps*(b.def??0);
   m.aspd*=1+steps*(b.attack_speed??0)/100;
  }
 }
}
function garrisonFinalize(o,active,fm){
 const values={hpRegen:0,spRegen:0,weakness:false,targetBonuses:[],abDamage:1};
 for(const g of garrisonTraits(o)){
  const b=g.bb,key=b.key||g.rune||'',steps=garrisonSteps(g,active);if(g.kind!=='GAIN_BUFF')continue;
  if(key==='act1autochess_gar_eff_attrByBond'||key==='attr_common_global_buff'){
   const n=key==='attr_common_global_buff'?1:steps;values.hpRegen+=n*(b.hp_recovery_per_sec??0);values.spRegen+=n*(b.sp_recovery_per_sec??0);
  }
  if(key.endsWith('_respawnTimeByBond'))fm.respawnTime*=Math.max(0,1+steps*(b.respawn_time??0));
  if(key.endsWith('_chaos'))values.weakness=true;
  if(key.endsWith('_attack_enemy'))values.targetBonuses.push({tag:b.check_tag,atk:b.atk});
  if(key.endsWith('_ab_damageScaleByBond'))values.abDamage+=steps*(b.damage_scale_per_stack??0);
  if(key.endsWith('_attrByBond_add_onstart')&&(G?.phase!=='battle'||o._garrisonDeployAt!=null&&(B?.time||0)<o._garrisonDeployAt+b.duration)){
   values.expires=(o._garrisonDeployAt??0)+b.duration;
  }
 }
 fm.garrisonStats=values;return fm;
}
function garrisonSync(){
 resolveBoard();if(!window.__roomRemoteSimulation)renderBonds();
 if(window.__setAllOpStats)window.__setAllOpStats(o=>{const src=G.ops.find(x=>x.id===o.id);if(src)updateOperatorBaseStats(o,src);});
}
function garrisonCombatEvent(trigger,op){
 if(!G||GMODE==='normal'||B?._garrisonJointDefense)return;
 const src=G.ops.find(x=>x.id===op.id);if(!src)return;
 if(trigger==='deploy')src._garrisonDeployAt=B.time;
 let dirty=trigger==='expire'||trigger==='deploy'&&(op.garrisonAdd||[]).some(g=>g.bb?.key?.endsWith('_attrByBond_add_onstart'));
 for(const g of op.garrisonAdd||[]){
  const b=g.bb||Object.fromEntries((g.blackboard||[]).map(v=>[v.key,v.valueStr??v.value])),key=b.key||'';
  const event=key.endsWith('_selfkillenemy')?'kill':key.endsWith('_useskill')?'skill':key.endsWith('_selfdead')?'dead':key.endsWith('_onstart')?'deploy':key.endsWith('_consume_ammo')?'ammo':key.endsWith('_allyenemy_sleepstun_inrange')?'sleepstun':key.endsWith('_enemy_abflag_inrange')?'freeze':null;
  if(event!==trigger)continue;
  if(key.includes('recoverhp_')){op.hp=Math.min(op.maxHp,op.hp+op.maxHp*(b.hp_ratio??0));continue;}
  G._gar??={};const token=op.id+':'+g.id,n=G._gar[token]=(G._gar[token]||0)+1;
  if(n%Math.max(1,b.consume_count??b.check_cnt??b.check_count??1)!==0||gameRandom()>=(b.prob??1))continue;
  let bonus=0;for(const other of garrisonOnboard())if(garrisonAt(other)?.id===src.id&&B.operators.some(unit=>(unit.unitId??unit.id)===other.id&&unit.playerId===op.playerId&&!unit.dead))for(const extra of garrisonTraits(other))if(extra.bb.key?.endsWith('_addition_cnt'))bonus+=extra.bb.extra_cnt??0;
  const total=G._gar[token+':total']||0,amount=Math.min((b.bond_add_count??1)+bonus,Math.max(0,(b.max_add_count_per_battle??Infinity)-total));
  const ids=b.bond_type==='bond_self'?garrisonBonds(src):garrisonIds(b.bond_id);
  if(garrisonAdd(ids,amount)){G._gar[token+':total']=total+amount;dirty=true;}
 }
 if(dirty)garrisonSync();
}
function garrisonTraitHtml(o){
 const traits=garrisonTraits(o,false).filter(g=>g.desc&&!/^【\d+】/.test(g.desc)),seen=new Set();
 const body=traits.filter(g=>!seen.has(g.desc)&&seen.add(g.desc)).map(g=>'<div class="od-feat"><b>'+escapeHtml(g.label||'卫戍协议特质')+'</b><div>'+richText(g.desc)+'</div>'+(g.bb.pool==='pool_equip_rockr'?'<small>定制品池尚缺数据，此项暂未生效。</small>':'')+'</div>').join('');
 return '<div class="od-sec od-hl">'+(o.elite?'精锐':'普通')+' · 卫戍协议特质</div>'+(body||'<div class="od-empty">本赛季未配置特质</div>');
}
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
// Deployable tactical points use the existing candidate tiles and facing gesture.
// They are owned attachments, never shop cards, bond members or deployment slots.
function tacticalOwner(id) {
  return (B?.operators||[]).find(o=>(o.unitId??o.id)===id&&(!o.playerId||o.playerId===window.__tacticalPlayerId));
}
function tacticalOwned(s) { return !!s&&(!s.playerId||s.playerId===window.__tacticalPlayerId); }
function tacticalCandidates() {
  if(!G||!B)return [];
  const battle=B.phase==='battle',out=[];
  for(const o of G.ops){
    const drone=battle?tacticalOwner(o.id):null;
    if(window.ArkMedicDrone?.available(drone)){
      const d=drone.basicAttack.medicDrone,item=drone.medicDroneReserve??={};
      Object.assign(item,{id:'medic-drone-stock:'+o.id,ownerUnitId:o.id,charId:d.charId,name:d.name,position:d.position,isTactical:true,isMedicDrone:true,cost:ArkMedicDrone.stats(drone).cost,rangeGrids:ArkMedicDrone.stats(drone).rangeGrids});out.push(item);
    }
    const d=o.basicAttack?.tactician;
    if(!d||o.row==null)continue;
    const live=battle?tacticalOwner(o.id):null;
    if(battle?(!live?.deployed||live.dead||ArkTactician.point(live)):!!o.tacticalPlacement)continue;
    const item=o.tacticalReserve??={};
    Object.assign(item,{id:'tactical:'+o.id,ownerUnitId:o.id,charId:d.charId,name:d.name,position:d.position||'MELEE',isTactical:true,rangeGrids:d.phases[0].rangeGrids});
    out.push(item);
  }
  return out;
}
function tacticalBenchView(s) {return s.bench?{...s,...s.bench,bench:true}:null;}
function prepareTacticalPoints() {
  if(!B||B.phase!=='rest')return;
  B.summoneds=[];
  for(const o of B.operators){
    o.cells=rangeCellsFor(o);
    const saved=G.ops.find(x=>x.id===o.id),p=saved?.tacticalPlacement;
    if(!p||!o.basicAttack?.tactician)continue;
    if(!ArkTactician.legal(o,p.row,p.col)) {delete saved.tacticalPlacement;delete o.tacticalPlacement;continue;}
    const s=ArkTactician.create(o,p.row,p.col);s.dir=p.dir;s.cells=rangeCellsFor(s);s.preparation=true;
  }
}
function syncTacticalBench(force=false) {
  if(!G||!B||B.phase!=='battle'||window.__roomRemoteSimulation&&!force)return;
  const candidates=tacticalCandidates(),key=JSON.stringify([candidates.map(x=>x.id),G.ops.filter(o=>o.row==null).map(o=>o.id)]);
  if(B.tacticalBenchKey===key&&!force)return;
  B.tacticalBenchKey=key;assignBenchCells();
  B.bench=G.ops.filter(o=>o.row==null).map(benchView).concat(candidates.map(tacticalBenchView)).filter(Boolean);
  // Shared right-side view: allocate display cells on that side, preserving local IDs.
  if((B.operators||[]).some(o=>o.playerId===window.__tacticalPlayerId&&o.side==='right')){
    const cells=candidateCells(BDATA.level).filter(c=>c.col>=Math.floor(BDATA.level.cols/2));
    B.bench=B.bench.slice(0,cells.length).map((o,i)=>({...o,...cells[i]}));
  }
}
window.onTacticalBenchChanged=syncTacticalBench;
function tacticalCanPlace(id,row,col) {
  const owner=tacticalOwner(id);if(window.ArkMedicDrone?.supported(owner))return ArkMedicDrone.legal(owner,row,col);
  if(!owner?.basicAttack?.tactician||B.over)return false;
  const s=ArkTactician.point(owner);
  return (B.phase==='rest'||owner.deployed&&!owner.dead&&!s)&&ArkTactician.legal(owner,row,col,{ignoreId:B.phase==='rest'?s?.id:null});
}
// The same operation is executed locally and by the authenticated room runtime.
function tacticalAction(action,unitId,row=0,col=0,dir='up',targetId=0,tokenId='') {
  if(!G||!B||B.over||G.over||!['rest','battle'].includes(B.phase))return false;
  const live=tacticalOwner(unitId),run=G.ops.find(o=>o.id===unitId);
  if(!live||!run)return false;
  let s=tokenId?(B.summoneds||[]).find(x=>x.id===tokenId&&x.ownerId===live.id&&!x.removed):ArkTactician.point(live),ok=false;
  if(B.phase==='battle'&&window.ArkMedicDrone?.supported(live)){
    if(action==='place')ok=!!ArkMedicDrone.deploy(live,row,col,dir);
    else if(action==='retreat')ok=ArkMedicDrone.retreat(s);
  }else if(action==='place'&&tacticalCanPlace(unitId,row,col)){
    if(B.phase==='rest'){run.tacticalPlacement={row,col,dir};refreshBoard();ok=true;}
    else {ok=!!ArkTactician.deploy(live,row,col,dir);if(ok&&!live.playerId)run.tacticalPlacement={row,col,dir};}
  }else if(action==='retreat'&&s){
    // Preparation edits a blueprint; in combat the point stays put and recovers.
    if(B.phase==='rest'){delete run.tacticalPlacement;refreshBoard();ok=true;}
    else ok=ArkTactician.retreat(s);
  }else if(action==='copy-open'&&B.phase==='battle')ok=ArkFlowShape.open(s);
  else if(action==='copy-target'&&B.phase==='battle'&&ArkFlowShape.copying(s)){
    const preset=flowCopyPreset(run,targetId);if(preset)ok=ArkFlowShape.copy(s,preset);
  }
  if(ok){if(action==='place')playSfx('b_char_set');selectedHand=null;selBoardOp=action.startsWith('copy-')?s.id:null;setSelected(selBoardOp);B.tacticalBenchKey=null;syncTacticalBench();if(action.startsWith('copy-'))refreshTacticalDetail();else renderAll();}
  return ok;
}
function tacticalTokenAction(action) {
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed),o=s?ArkTactician.owner(s):null;
  return o&&tacticalOwned(s)?window.tacticalAction(action,o.unitId??o.id,0,0,'up',0,s.id):false;
}
function tacticalCopyTarget(row,col) {
  return (B?.summoneds||[]).find(s=>s.row===row&&s.col===col&&tacticalOwned(s)&&ArkFlowShape.copying(s));
}
function onTacticalDrop(op,row,col,dir='up') {
  if(op?.isTactical){window.tacticalAction('place',op.ownerUnitId,row,col,dir);return true;}
  const s=tacticalCopyTarget(row,col),donor=G?.ops.find(x=>x.id===op?.id&&x.row==null);
  if(!s||!donor)return false;
  const owner=ArkTactician.owner(s);window.tacticalAction('copy-target',owner.unitId??owner.id,0,0,'up',donor.id,s.id);return true;
}
function onTacticalSelect(s) {
  selBoardOp=s.id;selectedHand=null;selectedEquip=null;shopPreview=-1;setSelected(s.id);renderSelected();
}
function tacticalDetail() {
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed)||tacticalCandidates().find(x=>x.id===selectedHand);
  if(!s)return false;
  const hd=document.getElementById('hand-detail');if(!hd)return true;
  const live=s.isTactical?tacticalOwner(s.ownerUnitId):ArkTactician.owner(s),rest=B.phase==='rest',owned=tacticalOwned(s);
  const desc=s.isMedicDrone?'拖到己方空置地面或高台，拖出格子确认部署；消耗5部署费用，不占干员名额。治疗周围九格，10秒后消失。':
    s.medicDrone?'医疗无人机：治疗周围九格，剩余 '+Math.ceil(Math.max(0,s.expiresAt-B.time))+'秒。撤退后消失，不回候选区；赫默离场不影响已部署的无人机。':
    s.isTactical?'从候选区拖到主人攻击范围内，再拖出格子确认朝向。部署费用 0，不占干员名额。':
    s.tacticalDormant?'战术点恢复中：'+Math.ceil(Math.max(0,s.nextStackAt-B.time))+'秒后原位恢复；期间不能撤退。':
    s.tacticalToken&&!s.temporary?(rest?'已指定战术点；可拖动调整位置。':'撤退清空当前援军，按自身周期在原位恢复，不回候选区。'):'临时召唤物，撤退或被击倒后消失，不回候选区。';
  const flow=s.flow&&!s.temporary&&!rest,copying=flow&&ArkFlowShape.copying(s);
  hd.classList.add('equip','tactical-detail');hd.style.display='block';
  hd.innerHTML='<div class="bgfx"><div class="fade"></div></div><div class="txt"><h2>'+escapeHtml(s.name)+'</h2><p>所属：'+escapeHtml(live?.name||'')+'</p><p data-tactical-state>'+desc+'</p>'+
    (s.hp!=null?'<p data-tactical-life>生命 '+Math.ceil(s.hp)+' / '+s.maxHp+'</p>':'')+
    (flow?'<p data-tactical-copy>'+(copying?'复制窗口 '+Math.ceil(s.flow.copyUntil-B.time)+'秒 · 将候选干员拖到此流形，原干员保留。':'复制技力 '+Math.floor(s.flow.sp)+' / 100')+'</p><button data-tactical-open class="tactical-control" onclick="tacticalTokenAction(\'copy-open\')" '+(!owned||s.dead||(!copying&&(s.flow.sp<100||live?.skillState))?'disabled':'')+'>'+(copying?'取消复制':'开启复制窗口')+'</button>':'')+
    (!s.isTactical?'<button data-tactical-retreat class="tactical-control" onclick="tacticalTokenAction(\'retreat\')" '+(!owned||s.dead?'disabled':'')+'>'+(rest?'撤回战术点':'撤退召唤物')+'</button>':'')+'</div>';
  return true;
}
function refreshTacticalDetail(){
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed);if(!s)return;
  const hd=document.getElementById('hand-detail');if(!hd?.querySelector)return;
  const owned=tacticalOwned(s),live=ArkTactician.owner(s),copying=ArkFlowShape.copying(s);
  const put=(key,value)=>{const el=hd.querySelector('[data-tactical-'+key+']');if(el&&el.textContent!==value)el.textContent=value;return el;};
  put('life','生命 '+Math.ceil(s.hp)+' / '+s.maxHp);
  if(s.medicDrone)put('state','医疗无人机：治疗周围九格，剩余 '+Math.ceil(Math.max(0,s.expiresAt-B.time))+'秒。撤退后消失，不回候选区。');
  else if(s.tacticalDormant)put('state','战术点恢复中：'+Math.ceil(Math.max(0,s.nextStackAt-B.time))+'秒后原位恢复；期间不能撤退。');
  else if(!s.preparation)put('state',s.tacticalToken&&!s.temporary?'撤退清空当前援军，按自身周期在原位恢复，不回候选区。':'临时召唤物，撤退或被击倒后消失，不回候选区。');
  const retreat=hd.querySelector('[data-tactical-retreat]');if(retreat)retreat.disabled=!owned||s.dead;
  if(s.flow){
    put('copy',copying?'复制窗口 '+Math.ceil(s.flow.copyUntil-B.time)+'秒 · 将候选干员拖到此流形，原干员保留。':'复制技力 '+Math.floor(s.flow.sp)+' / 100');
    const button=put('open',copying?'取消复制':'开启复制窗口');if(button)button.disabled=!owned||s.dead||(!copying&&(s.flow.sp<100||!!live?.skillState));
  }
}
// ---- 装备 ----
// Strategy rewards use a chess ID; equipment events and details use its effect ID.
// Also repair this exact legacy inventory shape on rest-save load. Preserve UID/bench.
function normalizeRewardEquipment(eq) {
  const stackIdentity=window.ArkEquipSkillStacks?.sourceIdentity(eq);
  if(stackIdentity){
    const source=GARRISON_EQUIPS.find(e=>e.id===stackIdentity.effectId);
    Object.assign(eq,{id:eq.id==='yan_dagger'?eq.id:stackIdentity.effectId,name:source?.name||eq.name,effectId:stackIdentity.effectId,tier:stackIdentity.tier,kind:'reactive',mods:{}});
    delete eq.charId;return true;
  }
  const trap=TRAP_DATA?.traps?.[eq?.id];
  if(!trap)return false;
  const source=GARRISON_EQUIPS.find(e=>e.id===trap.effectId);
  if(!source){eq.name=trap.name||eq.name;return false;}
  Object.assign(eq,{id:source.id,name:source.name,kind:source.kind,tier:source.tier==='golden'?2:1,
    mods:equipmentModifiers({id:source.id,name:source.name,mods:{...(source.mods||EQUIP_MODS[source.name]||{})}})});
  delete eq.charId;
  if(window.ArkEquipSkillStacks?.handles(source))eq.effectId=source.id;else delete eq.effectId;
  return true;
}
// 给干员绑装备：每名干员最多携带两件（[左槽, 右槽]，空槽为 null）。
// 未满两件时：目标槽被占用则自动落到另一个空槽位（不覆盖摧毁）；仅两槽都满时才替换目标槽原装备（销毁不返还）。
function attachEquip(o, eq, slot) {
  const idx = (slot === 1) ? 1 : 0;
  const cur = (o.equip && o.equip.length === 2) ? o.equip.slice() : [null, null];
  // 目标槽已有装备且另一槽为空 → 自动落到空槽，避免覆盖
  let target = idx;
  if (cur[idx] && !cur[1 - idx]) target = 1 - idx;
  const replaced = cur[target] || null;
  cur[target] = { uid: eq.uid, id: eq.id, name: eq.name, mods: { ...eq.mods }, tier: eq.tier || 1 };
  o.equip = cur;   // 恒定 2 槽数组
  G.equipInv = G.equipInv.filter(x => x.uid !== eq.uid);   // 从装备栏（候选区）移除该件
  selectedEquip = null;
  setSelected(null);   // 关闭菱形操作盘
  refreshBoard(); renderAll();
  flash(replaced ? ('装备 '+eq.name+' → '+o.entry.name+'（替换原「'+replaced.name+'」，原装备销毁）') : ('装备 '+eq.name+' → '+o.entry.name));
}
// 菱形盘「一键穿戴」时选择置入槽：左槽空→左，右槽空→右，两槽满→替换左槽
function equipNextSlot(o) {
  const eq = o.equip || [];
  if (!eq[0]) return 0;
  if (!eq[1]) return 1;
  return 0;
}
function advMods(m) { const r = {}; for (const k in m) r[k] = 1 + (m[k]-1)*1.7; return r; }

// 拖动装备到干员（onEquipDeploy 由 engine 拖拽回调；slot=置入的左/右槽）
function onEquipDeploy(eqUid, opId, slot) {
  if (G.phase !== 'rest') return;
  const o = G.ops.find(x => x.id===opId); if (!o) return;
  const eq = G.equipInv.find(x => x.uid === eqUid); if (!eq) return;
  if (eq.kind === 'use') return useSpecialEquip(eq, opId);
  if (eq.kind === 'trap') return;
  attachEquip(o, eq, slot);
}
// 获得特殊装备：从 EQUIPS 的 use 类随机 count 件加入装备库存（kind='use'），供 specialeq 策略（凯瑟琳/娜仁图亚）。
function rewardSpecialEquip(count) {
  const uses = (EQUIPS || []).filter(e => e.kind === 'use');
  if (!uses.length) return;
  for (let i = 0; i < (count || 1); i++) { const eq = uses[Math.floor(gameRandom() * uses.length)]; if (eq) G.equipInv.push({ uid: G.nextId++, id: eq.id, name: eq.name, mods: { ...eq.mods }, tier: 1, kind: 'use' }); }
}
// 特殊装备 使用/销毁 事件分发（U-ITEMS）：按 special_equip_events.json 的 e.key 触发。已实现：equip_destory_gain_random_coin、use_equip_reward_char_chess；其余标注待接入。
function applySpecialEquipEvent(eq) {
  if (!eq || !Array.isArray(SPECIAL_EQUIP_EVENTS)) return false;
  const ev = SPECIAL_EQUIP_EVENTS.find(x => x.id === eq.id); if (!ev) return false;
  let handled = false;
  for (const e of (ev.events || [])) {
    const bb = e.bb || []; const gp = k => { const x = bb.find(v => v.k === k); return x ? Number(x.v) : null; };
    if (e.key === 'equip_destory_gain_random_coin') {
      const mn = gp('min') || 1, mx = gp('max') || 1; const c = mn + Math.floor(gameRandom() * Math.max(1, mx - mn + 1));
      G.money += c; updateHud(); flash('「' + eq.name + '」销毁得金币 +' + c); handled = true;
    } else if (e.key === 'use_equip_reward_char_chess') {
      grantBandOperator({ tierMax: G.level, intoShop: true }); flash('「' + eq.name + '」效果：获得干员'); handled = true;
    } else if (e.key === 'use_equip_reward_char_chess_with_same_bond' || e.key === 'use_equip_reward_random_char_chess_in_shop') {
      const c = gp('count') || 1; for (let i = 0; i < c; i++) grantBandOperator({ tierMax: G.level, intoShop: true }); flash('「' + eq.name + '」获得干员 x' + c); handled = true;
    } else if (e.key === 'use_equip_gain_coin_when_next_round_start') {
      const c = gp('count') || 2; G._nextRoundCoin = (G._nextRoundCoin || 0) + c; flash('「' + eq.name + '」下回合资金 +' + c); handled = true;
    } else if (e.key === 'use_equip_reward_char_chess_bond_layer') {
      const l = gp('layer') || 3; grantBandOperator({ tierMax: G.level, intoShop: true });
      const act = Object.keys(G.activeBonds || {}); if (!G.addLayers) G.addLayers = {}; for (const bid of act) G.addLayers[bid] = (G.addLayers[bid] || 0) + l;
      flash('「' + eq.name + '」获得干员+盟约层数'); handled = true;
    } else if (e.key === 'use_equip_reward_special_goods_char_chess') {   // 寻呼模块：刷新 → 获得干员（近似：refresh_cnt 名到商店 + 免1）
      const rc = gp('refresh_cnt') || 3; for (let i = 0; i < rc; i++) grantBandOperator({ tierMax: G.level, intoShop: true });
      G.money += BUY_COST; flash('「' + eq.name + '」刷新获得干员 + 免1'); handled = true;
    } else if (e.key === 'use_equip_recruit_new_char_and_give_char_to_player_most_bond') {   // 信标：招募（近似：refresh_cnt 名干员到商店）
      const rc = gp('refresh_cnt') || 2; for (let i = 0; i < rc; i++) grantBandOperator({ tierMax: G.level, intoShop: true }); flash('「' + eq.name + '」招募干员'); handled = true;
    } else if (e.key === 'use_equip_upgrade_char') {   // 博士投影：手牌随机一名干员升阶（tier+1，≤6）
      const pool = G.ops.filter(o => o.row == null); const o = pool[Math.floor(gameRandom() * pool.length)];
      if (o && o.entry && o.entry.tier < 6) { o.entry = { ...o.entry, tier: o.entry.tier + 1 }; flash('「' + eq.name + '」干员升阶'); handled = true; } else flash('「' + eq.name + '」无可用升阶干员');
    } else if (e.key === 'equip_destory_deployment_cnt_change') {   // 人事部文档：销毁 → 部署次数 +count
      const c = gp('count') || 9; G._deployBonus = (G._deployBonus || 0) + c; flash('「' + eq.name + '」部署次数 +' + c); handled = true;
    } else {
      flash('「' + eq.name + '」事件待接入：' + e.key);
    }
  }
  return handled;
}
function useSpecialEquip(eq, opId) {
  if (!G || G.phase !== 'rest' || !eq || !G.ops.some(o => o.id === opId)) return false;
  eq = G.equipInv.find(x => x.uid === eq.uid);
  if (!eq || eq.kind !== 'use' || !applySpecialEquipEvent(eq)) return false;
  G.equipInv = G.equipInv.filter(x => x.uid !== eq.uid);   // 使用即销毁
  selectedEquip = null; setSelected(null);
  refreshBoard(); renderAll();
  return true;
}
// 点击查看详情；消耗品必须拖到本人的场上或候选干员后使用。
function onEquipBenchClick(uid) {
  const eq = G.equipInv.find(x => x.uid === uid); if (!eq) return;
  if (shopPreview >= 0) shopPreview = -1;
  selBoardOp = null; selectedHand = null;
  selectedEquip = (selectedEquip === uid) ? null : uid;
  setSelected(selectedEquip);
  renderAll();
}
// 出售候选区装备：移除并返还 SELL_REFUND 金币，关闭菱形操作盘
function sellEquip(uid) {
  const eq = G.equipInv.find(x => x.uid === uid); if (!eq) return;
  G.equipInv = G.equipInv.filter(x => x.uid !== uid);
  G.money += SELL_REFUND;
  selectedEquip = null;
  setSelected(null);
  flash('出售装备「'+eq.name+'」 +'+SELL_REFUND+' 金币');
  refreshBoard(); renderAll();
}
// 技能回复战斗部署费用，与商店资金分离。
window.onSkillDp = function(cost,source) {
  if (!B||B.phase!=='battle'||B.over) return;
  const before=B.dp||0,amount=Number(cost);if(Number.isFinite(amount)&&amount>0)B.dp=Math.min(B.dpMax??Infinity,before+amount);
  if(B.dp>=(B.dpMax??Infinity))B.dpProgress=0;
  if(B.dp>before&&source?.col!=null)(B.combatEffects||(B.combatEffects=[])).push({kind:'dp-gain',x:source.col,y:source.row,amount:B.dp-before,at:B.time,duration:.45});
};
// 冷却结束后消耗战斗部署费用，费用不足继续等待自然回费。
window.onRespawn = function(cost) {
  if (!B||B.phase!=='battle'||B.over||!Number.isFinite(cost)||cost<0) return false;
  if ((B.dp||0)-cost < (B.dpFloor||0)) return false;
  if(B.dp>=(B.dpMax??Infinity))B.dpProgress=0;
  B.dp -= cost;
  return true;
};
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
// 休整态存档：不保存半完成的选择或战斗对象；派生目录在恢复时重新绑定。
const RUN_SAVE_KEY='arknightsAutoRestV1';
const RUN_SAVE_VERSION=1;
// 2026-09-08仅派生路线行坐标/警告变化，源数值、库存、地图格与存档结构不变。
// 精确限定旧/新目录对，后续真实数据变更仍拒绝不兼容存档。
// 2026-09-10: this exact catalog pair only adds Boss identity/weights, raw enemy
// ability records and phase timings. Rest inventory, map cells and snapshot schema
// are unchanged. Unknown catalogs and later data changes remain incompatible.
// 2026-09-12 adds executable enemy flags/decision metadata only. These exact
// rest catalogs keep their existing inventory and absent ban list; no reroll on load.
// Exact previous release: only derived basic-action rules were added. Rest
// inventories remain valid and re-resolve profiles; in-flight room snapshots do not migrate.
// This exact previous catalog gains optional skill choices; old runs keep their original default skill.
// Elemental rules re-resolve only on rest loads; no cross-version battle snapshots.
// Season isolation: exact legacy rest catalogs rebind to this season only.
// Inventories containing identities absent from that season are rejected by the decoder.
// Hunter profiles and friendly cold add derived combat data only. Existing exact
// compatible rest inventories rebind; old live battle snapshots never migrate.
// Attribute-layer version changes only derived rest stats; rebuild them on load.
// Standard mystic storage and Indigo's module trait only change derived combat data.
// Standard doll forms and paper token add derived profiles; rest inventory identities stay unchanged.
// Hypnos and exact tactical skill levels only re-resolve derived rest profiles.
// Exact derived tactical-profile migration; active battles require the new game version.
// Common skill level data changes derived combat profiles only; rebind exact rest inventories.
// Medical talent/module data only; exact prior rest inventories rebind, live snapshots do not migrate.
// Released funnels rebind on rest; legacy runs retain original enemy waves.
// Source item eligibility/prices and inspected death-spawn data: existing rest cards
// keep their quoted prices/identities; future draws use the current season pool.
// Prop-like child HP changes derived combat behavior only; rest inventory stays valid.
// Timed client stat graphs, permanent enemy flags and act1 training data rebind derived rest state.
// Source attack-mode/DEF-zero, enemy transfer and riot-shield data rebind on rest.
// Existing life, quoted stock and RNG are retained; training HP=45 applies only to a new run.
// Final DEF, marked-death cleanup and source knife event data rebind only on rest.
// Known legacy knife mods become zero-stack reactive items; quoted prices/life/RNG are preserved.
const REST_CATALOG_MIGRATIONS={'7b3f9ff84c113bb4':'c045911d8ab9e511','b9dec792b22c7f46':'923a32c4b22ef100','d1480e625b962d1a':'923a32c4b22ef100','8e3af03c5c2f0554':'923a32c4b22ef100','1023c11cf435e1a4':'923a32c4b22ef100','9bf896ee0fd666e6':'923a32c4b22ef100','4ba548e2982bbd66':'923a32c4b22ef100','78ec2ed19654ae81':'923a32c4b22ef100','200c25032370cd8f':'923a32c4b22ef100','1a849caf32b59403':'923a32c4b22ef100','88b40d42c1f4a312':'923a32c4b22ef100','7cad5490e6921980':'923a32c4b22ef100','0b2dcabc7d47da08':'923a32c4b22ef100','7ef2028a44711bba':'923a32c4b22ef100','f1abed487cafdaac':'923a32c4b22ef100','228fd7699b1d5919':'923a32c4b22ef100','c7edd1b4fede0a08':'923a32c4b22ef100','3b18df6778af3bf7':'923a32c4b22ef100','6dd82f98b9ba7ac8':'923a32c4b22ef100','85c755cf5237879f':'923a32c4b22ef100','cefbd9a84feece9c':'923a32c4b22ef100','0926c0d33f3cd9bb':'923a32c4b22ef100','797e6a34c8838c34':'923a32c4b22ef100','723fd295ad440e59':'923a32c4b22ef100','57411b0ce863d828':'923a32c4b22ef100','09a7348d051c2d65':'923a32c4b22ef100','af075e5af4589f22':'923a32c4b22ef100','1e63305c613a9238':'923a32c4b22ef100','204770eab6b6cec2':'923a32c4b22ef100','aeb18bceec5c92e2':'ea38de752f3a7f69','41cc89e761634b1b':'7da3deeb059786ff','961c6fc523e56a79':'7da3deeb059786ff','f7195cac283394c0':'7da3deeb059786ff'};
// 2026-09-18: source skill providers change combat execution, not rest inventory.
// These exact compatible releases keep stock, equipment and RNG. Only rest
// identities are rebound; in-progress battle snapshots never migrate.
Object.assign(REST_CATALOG_MIGRATIONS,{
  'c045911d8ab9e511':'83762a7bd51b5f6b',
  '7b3f9ff84c113bb4':'83762a7bd51b5f6b',
  'd43760160e588f3a':'83762a7bd51b5f6b',
  'a30243b331f3c2d3':'83762a7bd51b5f6b',
  '769587e423af9b2c':'83762a7bd51b5f6b',
  '7c51b3928c330f86':'83762a7bd51b5f6b',
  'c87b924783c4e71f':'83762a7bd51b5f6b',
  '1050df2a3b5b11e6':'83762a7bd51b5f6b',
  'edcbad4282d368b6':'83762a7bd51b5f6b',
  '5cd474da1a0f0a56':'83762a7bd51b5f6b',
  '646ad180dcd73a2c':'83762a7bd51b5f6b',
  'a0b78af446a83b4c':'83762a7bd51b5f6b',
  '97ded756a914c5fe':'83762a7bd51b5f6b',
  'cd9c662548d7cfbd':'83762a7bd51b5f6b',
  'a0caa86347f73b83':'83762a7bd51b5f6b',
  '074e43fb3c2c55ab':'83762a7bd51b5f6b'
});
let saveCatalogFingerprint=null;
function saveHash(text){const imul=Math.imul;let a=2166136261,b=0x9e3779b9;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=imul(a^c,16777619);b=imul(b^c,2246822519);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function catalogFingerprint(){
  if(!saveCatalogFingerprint)saveCatalogFingerprint=saveHash(JSON.stringify([BATTLE,MDATA,MODE_RULES,SOURCE_BATTLES,TIER_DATA,BAND_DATA,RANGE_DATA,LEVEL_DATA,TALENT_DATA,MODULE_DATA,BOND_DATA,OP_BONDS,GARRISON_DATA,SKILL_DATA,SKILL_CHOICES,EQUIPS,EQUIP_MODS,CONST,SHOP_LEVEL,KILL_COIN,BAND_EFFECTS,SPECIAL_EQUIP_EVENTS,TRAP_EFFECTS,TRAP_DATA,CHESS_MAP,window.ArkAttackProfiles,window.ArkElementData,window.ArkCommonSkillData,window.ArkOperatorSkillData,window.ArkHunterRules,window.ArkAttributes.version,DIY_ROSTER,ENEMY_ENCOUNTERS,SHOP_ITEMS,window.ArkEnemyDeathSpawnData,window.ArkClientStatBuffData,window.ArkEnemyPassiveData,TRAINING_CONFIG,window.ArkEquipProtectionData,window.ArkEquipSkillStacksData,window.ArkClientProgramData,window.ArkExternalCombatData,window.ArkSkillModeData,window.ArkNextAttackSkillData,window.ArkDirectSkillData]));
  return saveCatalogFingerprint;
}
function restSaveProblem(){
  if(!G||GMODE!=='auto'||G.phase!=='rest')return '只能保存卫戍协议休整进度';
  if(G._mergeReward||G._upgradeConfirm||drag)return '请先完成当前选择或拖拽';
  const modal=document.getElementById('decision-modal');if(modal&&modal.style.display==='flex')return '请先完成本轮决策';
  return '';
}
function encodeRestSave(){
  const problem=restSaveProblem();if(problem)throw new Error(problem);
  const session=JSON.parse(JSON.stringify(G,(key,value)=>key==='entry'?undefined:value));
  for(let i=0;i<session.shop.length;i++)if(G.shop[i]?.type==='op')session.shop[i].charId=G.shop[i].entry.charId;
  const payload={session,account:ACCOUNT,rng:window.ArkSim.snapshot(),traps:B?.traps||[],context:{CUR,curDiff,curMatch,curEnemyType,curBoss,curEnemyTypes,TEAM_AI,PLAYER_NAME},savedAt:new Date().toISOString()};
  const body=JSON.stringify(payload);return JSON.stringify({version:RUN_SAVE_VERSION,catalog:catalogFingerprint(),checksum:saveHash(body),body});
}
function decodeRestSave(text){
  const fail=message=>{throw new Error('存档不可用：'+message);};
  if(typeof text!=='string'||text.length>8*1024*1024)fail('大小或格式错误');
  const envelope=JSON.parse(text);
  if(envelope.version!==RUN_SAVE_VERSION)fail('版本不兼容');
  const currentCatalog=catalogFingerprint();
  if(envelope.catalog!==currentCatalog && REST_CATALOG_MIGRATIONS[envelope.catalog]!==currentCatalog)fail('游戏数据已更新，请开始新局');
  if(typeof envelope.body!=='string'||saveHash(envelope.body)!==envelope.checksum)fail('校验失败');
  const p=JSON.parse(envelope.body),s=p.session,c=p.context;
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x),finite=x=>typeof x==='number'&&Number.isFinite(x),uint=x=>Number.isSafeInteger(x)&&x>=0;
  if(!object(s)||!object(c)||s.phase!=='rest'||s.battleDone||s._mergeReward||s._upgradeConfirm)fail('不是完整休整状态');
  if(!window.ArkSim.valid(p.rng)||!object(p.account)||!object(p.account.ops))fail('账号或随机状态损坏');
  if(!DIFFICULTY[c.curDiff]||!['solo','team'].includes(c.curMatch)||!uint(c.CUR)||!playableLevels()[c.CUR]||!Array.isArray(c.TEAM_AI)||!Array.isArray(c.curEnemyTypes)||typeof c.PLAYER_NAME!=='string')fail('模式上下文损坏');
  const mode=SOURCE_BATTLES.seasons[s.seasonId]?.modes[s.modeId];
  const expected=c.curDiff==='training'?'mode_training_1':'mode_'+(c.curMatch==='team'?'multi':'single')+'_'+DIFF_GAMEDATA[c.curDiff].toLowerCase();
  if(!mode||s.modeId!==expected||!mode.stageChoices.some(x=>x.levelKey===s.mapKey)||!object(s.roundChoices))fail('模式或地图不存在');
  if(s.enemyPlan){
    if(!uint(s.enemySeed)||s.enemySeed>0xffffffff)fail('敌潮种子损坏');
    const plan=window.ArkRunSetup.enemyPlan(ENEMY_ENCOUNTERS,s,s.enemySeed);
    if(JSON.stringify(plan)!==JSON.stringify(s.enemyPlan))fail('敌潮计划损坏');
    if(s.enemySchedule!=null)fail('敌潮计划冲突');
  }else{
    // Exact migrated rest runs keep their original template waves. Loading must
    // never silently reroll an existing run or consume its shop/combat RNG.
    if(envelope.catalog!==currentCatalog)s.enemySchedule='legacy-source';
    if(s.enemySchedule!=='legacy-source'||s.enemySeed!=null)fail('敌潮计划缺失');
  }
  s.diySelections=window.ArkDiyRoster.normalize(DIY_ROSTER,s.seasonId,s.diySelections||{});
  if(s.modeId==='mode_training_1'&&Object.keys(s.diySelections).length)fail('入门协议不能甄选干员');
  const savedRoster=seasonRoster(s.seasonId,BATTLE.operators,s.diySelections).entries;
  const round=mode.rounds.find(x=>x.round===s.round),choice=round?.alternatives[s.roundChoices[s.round]];
  if(!choice||choice.levelKey!==s.sourceLevelKey||choice.bossId!==s.sourceBossId)fail('关卡候选损坏');
  for(const [n,i]of Object.entries(s.roundChoices))if(!uint(i)||!mode.rounds.find(r=>r.round===Number(n))?.alternatives[i])fail('候选索引无效');
  for(const key of ['money','life','enemyHp','upgradeCost','shield','shieldMax'])if(!finite(s[key]))fail(key+'数值损坏');
  if(s.runElapsed!=null&&(!finite(s.runElapsed)||s.runElapsed<0))fail('对局计时损坏');
  if(s.runElapsedPartial!=null&&typeof s.runElapsedPartial!=='boolean')fail('对局计时范围损坏');
  if(s.runElapsed==null)s.runElapsedPartial=true;
  if(s.roundResults!=null){
    if(!Array.isArray(s.roundResults)||s.roundResults.length>30)fail('回合记录损坏');
    const seenRounds=new Set();
    for(const r of s.roundResults){
      if(!object(r)||!uint(r.round)||r.round<1||r.round>=s.round||seenRounds.has(r.round)||typeof r.win!=='boolean'||typeof r.hidden!=='boolean'||(r.bossId!=null&&!SOURCE_BATTLES.seasons[s.seasonId].bosses?.[r.bossId]))fail('回合记录损坏');
      for(const key of ['life','lifeLost','kills','leaks','battleSeconds'])if(!finite(r[key])||r[key]<0)fail('回合统计损坏');
      seenRounds.add(r.round);
    }
  }
  delete s.settlement;
  for(const key of ['_garrisonRoundGained','_garrisonRoundSpent','_garrisonRoundRefresh','_garrisonFreeRefresh'])if(s[key]!=null&&(!uint(s[key])||s[key]>10000000))fail('特质计数损坏');
  if(s._garrisonRewardQueue!=null&&(!Array.isArray(s._garrisonRewardQueue)||s._garrisonRewardQueue.some(t=>!uint(t)||t<1||t>6)))fail('特质奖励损坏');
  if(s.money<0||s.life<=0||!uint(s.level)||s.level<1||s.level>MAX_LEVEL||!uint(s.nextId)||s.nextId<1||typeof s.frozen!=='boolean')fail('运营数值损坏');
  if(!Array.isArray(s.ops)||!Array.isArray(s.shop)||!Array.isArray(s.equipInv)||!Array.isArray(p.traps)||s.ops.length>2000||s.shop.length>2000)fail('库存损坏');
  const ids=new Set(),positions=new Set(),map=SOURCE_BATTLES.levels[s.mapKey].level;
  const id=value=>{if(!uint(value)||value<1||value>=s.nextId||ids.has(value))fail('实体编号损坏');ids.add(value);};
  const tile=(o,bench=false)=>{if(!Number.isInteger(o.row)||!Number.isInteger(o.col)||o.row<0||o.col<0||o.row>=map.rows||o.col>=map.cols)fail('位置越界');if(bench&&map.grid[o.row][o.col]!=='tile_achand')fail('候选位置无效');};
  const equip=e=>{if(!object(e)||typeof e.id!=='string'||!object(e.mods))fail('装备损坏');id(e.uid);for(const v of Object.values(e.mods))if(!finite(v))fail('装备属性损坏');normalizeRewardEquipment(e);e.mods=equipmentModifiers(e);};
  for(const o of s.ops){
    const library=object(o)&&s.debugUsed===true&&c.curMatch==='solo'&&o.debugLibrary===true?debugTacticalEntry(o.charId):null;
    if(!object(o)||(!savedRoster[o.charId]&&!library)||!Array.isArray(o.equip)||!['up','down','left','right'].includes(o.dir))fail('干员损坏');id(o.id);o.entry=library||savedRoster[o.charId];
    if(o.row!=null){tile(o);const pos=o.row+','+o.col;if(positions.has(pos)||!['MELEE','RANGED','ALL'].includes(map.buildable[o.row][o.col]))fail('部署位置冲突');positions.add(pos);}else if(o.col!=null)fail('部署位置不完整');
    if(o.flowCopyTargetId!=null&&(!uint(o.flowCopyTargetId)||o.flowCopyTargetId>=s.nextId||o.charId!=='char_249_mlyss'||o.flowCopyTargetId===o.id))fail('流形复制选择损坏');
    delete o.flowCopyTargetId; // Old automatic-copy preferences never cast a new manual skill.
    if(o.tacticalPlacement!=null){
      const p=o.tacticalPlacement,profile=window.ArkAttackProfiles[o.charId]?.tactician;
      if(!object(p)||!profile||o.row==null||!['up','down','left','right'].includes(p.dir))fail('战术点数据损坏');tile(p);
      const pos=p.row+','+p.col,kind=profile.kind==='flow'?'ALL':'MELEE',terrain=map.buildable[p.row][p.col];
      if(positions.has(pos)||!['MELEE','RANGED','ALL'].includes(terrain)||terrain!=='ALL'&&kind!=='ALL'&&terrain!==kind)fail('战术点部署位置冲突');positions.add(pos);
    }
    if(o.tacticalReserve!=null){if(!object(o.tacticalReserve)||!window.ArkAttackProfiles[o.charId]?.tactician)fail('战术候选损坏');if(o.tacticalReserve.bench)tile(o.tacticalReserve.bench,true);o.tacticalReserve={bench:o.tacticalReserve.bench||null};}
    if(o.bench)tile(o.bench,true);o.equip.forEach(e=>{if(e!==null)equip(e);});
  }
  s.equipInv.forEach(equip);
  for(const t of p.traps){id(t.uid);tile(t);if(typeof t.effectId!=='string')fail('装置损坏');}
  for(const x of s.shop){if(x==null)continue;if(!finite(x.cost)||x.cost<0)fail('商品价格损坏');if(x.type==='op'){if(!savedRoster[x.charId])fail('商品干员不存在');x.entry=savedRoster[x.charId];delete x.charId;}else if(x.type!=='equip'||!object(x.equip)||typeof x.equip.id!=='string'||!object(x.equip.mods))fail('商品损坏');}
  for(const item of s.shop)if(item?.type==='equip')item.equip.mods=equipmentModifiers(item.equip);
  for(const [cid,a]of Object.entries(p.account.ops)){if(!object(a)||!finite(a.level)||!finite(a.evolve)||!finite(a.skillLevel)||!finite(a.trust)||!finite(a.potential))fail('账号练度损坏：'+cid);}
  return p;
}
function saveRestRun(){try{const text=encodeRestSave();decodeRestSave(text);localStorage.setItem(RUN_SAVE_KEY,text);flash('休整进度已保存 · 第 '+G.round+' 回合');return true;}catch(e){flash(e.message||'保存失败');return false;}}
function loadRestRun(){
  if(G?.phase==='battle'&&!G.battleDone){flash('请先结束当前战斗');return false;}
  let p;try{const text=localStorage.getItem(RUN_SAVE_KEY);if(!text)throw new Error('还没有休整存档');p=decodeRestSave(text);}catch(e){const message=e.message||'读取失败';document.getElementById('save-status').textContent=message;flash(message);return false;}
  // 所有数据验证完成后再提交；不调用startRound，避免重复发钱、刷新商店和奖励。
  const c=p.context;CUR=c.CUR;curDiff=c.curDiff;curMatch=c.curMatch;curEnemyType=c.curEnemyType;curBoss=c.curBoss;curEnemyTypes=c.curEnemyTypes;TEAM_AI=c.TEAM_AI;PLAYER_NAME=c.PLAYER_NAME;
  buildRoster(BATTLE.operators,p.session.seasonId,p.session.diySelections||{});
  ACCOUNT=p.account;GMODE='auto';replaceGameSession(p.session,'mode.rest-loaded');window.ArkSim.restore(p.rng);
  closeSettlement();
  resetBattleView();setupSeasonId=G.seasonId;setupStageKey=G.mapKey;
  prepareSourceRound(G.round);selectedHand=null;selBoardOp=null;selectedEquip=null;shopPreview=-1;selectedBond=null;window.__shopCollapsed=false;
  refreshBoard();B.traps=p.traps;window.setPaused(false);simulationClock=null;last=null;
  for(const name of ['menu','setup','decision-modal','exit-confirm'])document.getElementById(name).style.display='none';
  document.getElementById('main').style.display='flex';document.getElementById('menu-btn').style.display='inline-block';document.getElementById('roster-btn-top').style.display='none';document.getElementById('result').textContent='';
  document.getElementById('save-status').textContent='';setUiMode('mode-battle');closeIntel();hideBondDetail();renderAll();flash('已继续第 '+G.round+' 回合休整'+(G.frozen?' · 恢复已冻结商店':''));return true;
}
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
