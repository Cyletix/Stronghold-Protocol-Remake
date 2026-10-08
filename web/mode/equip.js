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
