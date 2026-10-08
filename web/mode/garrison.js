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
