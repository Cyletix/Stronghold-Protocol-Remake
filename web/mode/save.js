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
