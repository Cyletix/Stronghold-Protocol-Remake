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
