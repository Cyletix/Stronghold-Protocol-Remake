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
