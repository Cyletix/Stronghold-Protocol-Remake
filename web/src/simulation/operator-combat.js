// Operator actions use source blackboards. Geometry/timing approximations are
// recorded in docs/mechanics/operator-mechanics.md; this is shared by local and room VMs.
(function(root){
 'use strict';
 const marksmanSkills=['skchr_kroos_1','skchr_jesica_1','skchr_shotst_1','skchr_shotst_2','skchr_mm_1','skchr_mm_2','skchr_totter_1','skchr_totter_2'];
 const vanguardSkills=['skchr_scave_2','skchr_blackd_2','skchr_texas_2'];
 const replacementProfiles=root.ArkNextAttackSkillData?.profiles||{};
 const requestedHealing=new WeakSet();
 const replacementSkills=Object.keys(replacementProfiles);
 const supported=new Set([
  ...marksmanSkills,...vanguardSkills,...replacementSkills,
  'skchr_rosmon_1','skchr_rosmon_2','skchr_rosmon_3',
  'skchr_angel_1','skchr_angel_2','skchr_angel_3','skchr_huang_1','skchr_huang_2',
  'skchr_svrash_1','skchr_svrash_3','skchr_thorns_3',
  'skchr_dusk_1','skchr_dusk_2','skchr_dusk_3','skchr_cammou_2','skchr_gdglow_1','skchr_gdglow_2','skchr_gdglow_3','skchr_rockr_2','skchr_amgoat_2','skchr_amgoat_3',
  'skchr_meteo_1','skchr_meteo_2','skchr_cqbw_1',
  'skchr_pudd_2','skchr_leizi_2','skchr_pasngr_1','skchr_pasngr_2',
  'skchr_chen2_1','skchr_chen2_2','skchr_chen2_3',
  'skchr_chen_1','skchr_chen_2','skchr_mostma_2','skchr_qiubai_3',
  'skchr_whitew_2','skchr_ghost_2','skchr_bpipe_2','skchr_bpipe_3',
  'skchr_lisa_2','skchr_lisa_3','skchr_aglina_2','skchr_aglina_3',
  'skchr_demkni_1','skchr_demkni_2','skchr_demkni_3','skchr_sunbr_1',
  'skchr_mlynar_1','skchr_mlynar_2','skchr_snhunt_1','skchr_snhunt_2','skchr_beewax_1','skchr_beewax_2'
 ]);
 const nextSkills=new Set(['skchr_rosmon_1','skchr_angel_1','skchr_huang_1','skchr_svrash_1','skchr_dusk_1','skchr_amgoat_2','skchr_meteo_1','skchr_pasngr_1','skchr_chen_1','skchr_bpipe_2','skchr_snhunt_1']);
 const instantSkills=new Set(['skchr_meteo_2','skchr_cqbw_1','skchr_chen_2','skchr_snhunt_2']);
 for(const id of ['skchr_kroos_1','skchr_jesica_1','skchr_shotst_1','skchr_mm_1','skchr_totter_1'])nextSkills.add(id);
 for(const id of replacementSkills)nextSkills.add(id);
 instantSkills.add('skchr_shotst_2');
 const bbOf=t=>Object.fromEntries((t.blackboard||[]).map(b=>[b.key,b.value]));
 function handledTalent(t,cid){
  const b=bbOf(t);
  return cid==='char_391_rosmon'&&(b.def_penetrate_fixed!=null||t.name==='感知稳定')
   ||cid==='char_181_flower'&&b.atk_to_hp_recovery_ratio!=null
   ||cid==='char_344_beewax'&&t.name==='沙原的庇护'
   ||cid==='char_2015_dusk'&&['化境','点睛'].includes(t.name)
   ||cid==='char_377_gdglow'&&['信标的愤怒','精准导流'].includes(t.name)
   ||cid==='char_4040_rockr'&&t.name==='立于磐石';
 }
 function configure(s){
  if(!s||!supported.has(s.sourceId))return;
  s.combatMechanic={version:2,next:nextSkills.has(s.sourceId),instant:instantSkills.has(s.sourceId),immediate:nextSkills.has(s.sourceId)||instantSkills.has(s.sourceId),periodic:s.sourceId==='skchr_mostma_2'};
  const b=s.blackboard||{},id=s.sourceId;
  if(replacementProfiles[id]){
   const p=replacementProfiles[id];
   if(Object.keys(b).sort().join(',')!==p.blackboardKeys.join(',')||Object.values(b).some(v=>!Number.isFinite(v))||!(b[p.scaleKey]>0)||
     p.targetKey&&!(Number.isInteger(b[p.targetKey])&&b[p.targetKey]>0)||
     p.hitBuffs?.some(effect=>effect.scaleKey&&!(b[effect.scaleKey]>0)||effect.durationKey&&!(b[effect.durationKey]>0)||effect.valueKey&&!(b[effect.valueKey]>-1&&b[effect.valueKey]<=0))||
     p.chargeKey&&b[p.chargeKey]!==s.maxCharge||s.isPassive||!(s.spCost>0))throw Error('Invalid replacement attack skill: '+id);
   if(p.spellExtras?.some(x=>x.kind!=='heal'||x.event!=='ON_ABILITY_SPELL_ON'||x.once!==true||
     x.targetCount!==1||x.range!=='skill'||x.selector!=='lowest-hp-ratio'||x.includeOwner!==true||
     !(b[x.scaleKey]>0)||!s.rangeGrids?.length))throw Error('Invalid replacement spell extra: '+id);
   if(p.kind==='next-heal'){s.combatMechanic.replacementHeal=true;delete s.medicMechanic;}
   s.effects=[];return;
  }
  if(id==='skchr_dusk_3'&&(Object.keys(b).sort().join(',')!=='atk,base_attack_time'||!Number.isFinite(b.atk)||b.base_attack_time!==.4||s.duration!==60||!s.rangeGrids?.length))throw Error('Invalid Dusk S3 source');
  if(id==='skchr_cammou_2'&&(Object.keys(b).sort().join(',')!=='atk,attack@prob,attack@stun'||Object.values(b).some(v=>!Number.isFinite(v))||!(s.duration>0)||!s.rangeGrids?.length))throw Error('Invalid Click S2 source');
  if(id==='skchr_rockr_2'&&(Object.keys(b).sort().join(',')!=='atk,attack@cnt,attack_speed,scale'||Object.values(b).some(v=>!Number.isFinite(v))||b['attack@cnt']!==0||s.duration!==40))throw Error('Invalid Rockrock S2 source');
  if(id.startsWith('skchr_gdglow_')){
   const keys=id.endsWith('_1')?['atk','attack_speed','attack@cnt']:id.endsWith('_2')?['atk','attack@cnt']:['atk','attack@cnt','attack@sluggish'];
   if(Object.keys(b).sort().join(',')!==keys.sort().join(',')||Object.values(b).some(v=>!Number.isFinite(v))||b['attack@cnt']!==(id.endsWith('_3')?2:1)
    ||(id.endsWith('_2')?(s.duration!==-1||!s.rangeGrids?.length):!(s.duration>0)))throw Error('Invalid Goldenglow skill source: '+id);
  }
  if(id==='skchr_beewax_1'||id==='skchr_beewax_2'){
   const keys=id==='skchr_beewax_1'?['atk']:['atk_scale','stun'];
   if(Object.keys(b).sort().join(',')!==keys.join(',')||keys.some(k=>!Number.isFinite(b[k]))||!(s.duration>0))throw Error('Invalid Beeswax skill: '+id);
  }
  if(vanguardSkills.includes(id)){
   const courier=id==='skchr_blackd_2',texas=id==='skchr_texas_2';
   const keys=courier?['blackd_s_2[period].def','blackd_s_2[period].cost','blackd_s_2[period].interval','blackd_s_2[period].trig_cnt','blackd_s_2[once].cost']:texas?['cost','atk_scale','stun']:['atk','cost'];
   if(Object.keys(b).sort().join(',')!==keys.sort().join(',')||keys.some(k=>!Number.isFinite(b[k])))throw Error('Invalid vanguard skill blackboard: '+id);
   s.effects=[{type:'dp_gain',power:courier?b['blackd_s_2[once].cost']:b.cost}];
   if(texas){
    if(s.duration!==0||!s.rangeGrids?.length)throw Error('Invalid Sword Rain range/duration');
    // A DP skill can activate without enemies; its damage is independent of basic attacks.
    s.combatMechanic.immediate=true;
   }else{
    if(!(s.duration>0))throw Error('Invalid sustained vanguard duration: '+id);
    s.effects.push({type:courier?'buff_def':'buff_atk',power:courier?b['blackd_s_2[period].def']:b.atk});
    if(courier){
     const interval=b['blackd_s_2[period].interval'],perTick=b['blackd_s_2[period].cost'],count=b['blackd_s_2[period].trig_cnt'];
     if(!(interval>0&&perTick>0&&Number.isInteger(count)&&count>0))throw Error('Invalid Courier DP stream');
     s.combatMechanic.costStream={interval,perTick,total:perTick*count};
    }
   }
   return;
  }
  if(['skchr_demkni_1','skchr_demkni_2','skchr_sunbr_1'].includes(id))s.combatMechanic.heal=true;
  if(id==='skchr_lisa_3'||id==='skchr_demkni_3')s.combatMechanic.aura=true;
  if(id==='skchr_aglina_2'||id==='skchr_aglina_3')s.combatMechanic.idleDisarmed=true;
  s.effects=[];
  // These keys belong to the caster in the listed skills. Rosmontis S3's DEF
  // belongs to the equipment, so it must never become a caster DEF buff.
  if(!s.combatMechanic.next&&!s.combatMechanic.instant){
   if(b.atk!=null&&id!=='skchr_rockr_2')s.effects.push({type:'buff_atk',power:b.atk});
   if(b.def!=null&&id!=='skchr_rosmon_3')s.effects.push({type:'buff_def',power:b.def});
   if(b.attack_speed!=null&&id!=='skchr_qiubai_3')s.effects.push({type:'buff_atkspd',power:b.attack_speed/100});
  }
 }
 const units=()=>[...B.operators,...(B.summoneds||[])];
 // FROZEN disables actions, not blocking. STUN/SLEEP also release blocked enemies.
 // See PRTS abnormal flags and docs/mechanics/enemy-cold.md; do not reuse attack eligibility here.
 function blockerAvailable(o){return operatorPresent(o)&&!(o.stunUntil>B.time)&&!(o.sleepUntil>B.time)&&!root.ArkSkillEndEffects?.stunned(o,B.time);}
 function blockerOf(e){return e.blockerId==null?null:units().find(o=>o.id===e.blockerId&&blockerAvailable(o));}
 function canBlock(o){return blockerAvailable(o)&&BDATA.level.buildable[o.row]?.[o.col]!=='RANGED'&&operatorBlockCount(o)>o.blocked;}
 function canBeBlocked(e,o){return !e.dead&&!e.flying&&!e.unblockable&&(!(e.sleepUntil>B.time)||root.ArkBlacknight?.canHitSleeping(o));}
 function assignBlocks(){
  const all=units();for(const o of all)o.blocked=0;
  for(const e of B.enemies){
   const old=e.blockerId;e.blockerId=null;
   if(e.dead||e.flying||e.unblockable)continue;
   const candidates=all.filter(o=>canBeBlocked(e,o)&&canBlock(o)&&touchesOperatorTile(o,e.x,e.y));
   const o=candidates.find(o=>o.id===old)||candidates[0];
   if(o){e.blockerId=o.id;o.blocked++;}
  }
 }
 function moveToContact(e,x,y){
  if(e.dead||e.flying||e.unblockable)return false;
  let blocker=null,at=Infinity;
  for(const o of units())if(canBeBlocked(e,o)&&canBlock(o)){
   const t=operatorContactTime(o,e.x,e.y,x,y);
   if(t!=null&&t<at){blocker=o;at=t;}
  }
  if(!blocker)return false;
  e.x+=(x-e.x)*at;e.y+=(y-e.y)*at;
  // Snap numerical error only, keeping exact border points stable across ticks.
  for(const [axis,center] of [['x',blocker.col],['y',blocker.row]]){
   const offset=e[axis]-center;
   if(Math.abs(Math.abs(offset)-.5)<=CONTACT_EPSILON)e[axis]=center+Math.sign(offset)*.5;
  }
  e.blockerId=blocker.id;blocker.blocked++;return true;
 }
 function validEnemy(e,groundOnly=false,o=null){return !e.dead&&e.hp>0&&(!(e.sleepUntil>B.time)||root.ArkBlacknight?.canHitSleeping(o))&&(!groundOnly||!e.flying);}
 function inAttackRange(o,e){return enemyInOperatorRange(o,e);}
 function rangedApplyWay(e){
  const way=e.applyWay??root.ArkExternalCombatData?.attackCapabilities?.[e.enemyId]?.applyWay;
  return way==='RANGED'||way==='ALL'||Number.isInteger(way)&&way>=0&&way<=3&&(way&2)!==0;
 }
 function targets(o,plan){
  let pool=B.enemies.filter(e=>validEnemy(e,plan.groundOnly,o)&&!(e.invisibleUntil>B.time)&&(root.ArkTacticalSpecials?.additionalRange(o,e,plan)||(plan.targeting==='rangeOnly'?inAttackRange(o,e):enemyInBasicAttackRange(o,e)))
   &&(!e.flying||o.position==='RANGED'||plan.airTarget)&&(root.ArkMystic?.canTarget(o,e)??true));
  pool=pool.filter(e=>root.ArkSkillModes?.allows(plan,e)??true);
  if(plan.airFirst||plan.priorityApplyWay)pool=pool.filter(e=>!e.removed&&!e.untargetable&&!e.targetFree&&!(e.camouflageUntil>B.time));
  if(plan.priorityApplyWay){
   if(plan.priorityApplyWay!=='ranged'||plan.targets!==1||plan.all)throw Error('Secondary applyWay contract requires one target');
   const preferred=pool.filter(rangedApplyWay);if(preferred.length)pool=preferred;
  }
  if(plan.kind==='chain'&&plan.replacementDelivery)pool=pool.filter(e=>!e.removed&&!e.untargetable);
  if(plan.ownBlocked)pool=pool.filter(e=>e.blockerId===o.id);
  if(plan.blockedOnly)pool=pool.filter(e=>!!blockerOf(e));
  if(plan.unbrokenOnly)pool=pool.filter(e=>!root.ArkElements?.active(e));
  pool.sort((a,b)=>{
   const own=e=>plan.blockedFirst===false?0:Number(!!(e.blockerId===o.id||plan.blockedOnly&&blockerOf(e)?.ownerId===o.id));
   const tacticalPriority=e=>blockerOf(e)?.blockedTargetPriority||0;
   const sourceHatred=e=>root.ArkClientPrograms?.targetPriority?.(e,B.time)??e.tauntLevel??e.sourceAttributes?.tauntLevel??0;
   // The single-target secondary selector already removed nonmatching
   // applyWays above. Keep the base flying/hatred order inside that set.
   return (plan.airFirst?Number(!!b.flying)-Number(!!a.flying):0)||
    (plan.airFirst||plan.priorityApplyWay?sourceHatred(b)-sourceHatred(a):0)||
    (plan.preferUnbroken?Number(!!root.ArkElements?.active(a))-Number(!!root.ArkElements?.active(b)):0)||
    (plan.preferUnblocked?Number(!!blockerOf(a))-Number(!!blockerOf(b)):0)||
    (root.ArkBlacknight?.priority(o,b)||0)-(root.ArkBlacknight?.priority(o,a)||0)||own(b)-own(a)||
    (root.ArkSkillModes?.priority(plan,b)||0)-(root.ArkSkillModes?.priority(plan,a)||0)||tacticalPriority(b)-tacticalPriority(a)||dist(o,a)-dist(o,b);
  });
  if(plan.random)for(let i=pool.length-1;i>0;i--){const j=Math.floor(gameRandom()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,plan.all?pool.length:plan.targets||1);
 }
 function planFor(o,skill){
  const p=operatorAttackProfile(o),b=skill?.blackboard||{},id=skill?.sourceId;
  const plan={kind:p.kind||'single',radius:p.radius||0,groundOnly:!!p.groundOnly,airTarget:!!p.airTarget,
   targeting:operatorUsesIndependentTargeting(o,skill)?'rangeOnly':'basic',
   scale:1,hits:p.hits||1,all:p.kind==='rangeAll',targets:p.kind==='blockCount'?operatorBlockCount(o):1,
   aftershocks:p.aftershocks?Math.max(1,(p.bb?.['attack@times']||2)-1):0,aftershockScale:p.bb?.['attack@append_atk_scale']??p.aftershockScale??.5,
   chainCount:p.bb?.['attack@max_target']||3,chainDecay:p.bb?.['attack@chain.atk_scale']??p.chainDecay??.85,chainRadius:p.chainRadius||1.7,
   slow:p.kind==='chain'?p.bb?.['attack@sluggish']||.5:0,damageType:o.atkType||p.damageType||'phys',rangedScale:p.rangedScale||1,
   frontScale:p.frontScale||1,drone:!!p.drone,skillId:id,hunterScale:p.subProfession==='hunter'?(p.bb?.atk_scale||1):1};
  if(p.secondaryScale){plan.scale=p.bb?.['attack@atk_scale_2']??p.secondaryScale;plan.primaryExtra=1-plan.scale;}
  if(p.subProfession==='fortress'&&(o.blocked||0)>0){plan.kind='single';plan.radius=0;}
  root.ArkMystic?.plan(o,plan,skill);
  root.ArkDollkeeper?.plan(o,plan,skill);
  root.ArkTactician?.plan(o,plan,skill);
  root.ArkFlowShape?.plan(o,plan,skill);
  if(!skill?.combatMechanic)return root.ArkSkillModes?.plan(o,root.ArkElementOperators?.plan(o,plan,skill)||plan)||plan;
  if(nextSkills.has(id)){plan.scale=b.atk_scale??b['pasngr_s_1.atk_scale']??1;}
  if(replacementProfiles[id]){
   const p=replacementProfiles[id];
   Object.assign(plan,{kind:p.targets==='all'?'rangeAll':'single',radius:0,all:p.targets==='all',aftershocks:0,
    scale:b[p.scaleKey],hits:p.hits,groundOnly:p.groundOnly??plan.groundOnly,airTarget:p.groundOnly==null?plan.airTarget:!p.groundOnly,
    damageType:p.damageType,targets:p.targets==='block-count'?operatorBlockCount(o):p.targetKey?b[p.targetKey]:p.targetCount,
    replacementDelivery:p.delivery,replacementProjectile:p.projectile,replacementWaitProjectile:p.waitForProjectile,
    replacementHitBuffs:p.hitBuffs?.map(effect=>({...effect,scale:b[effect.scaleKey],duration:b[effect.durationKey],
     value:effect.valueKey?1+b[effect.valueKey]:effect.value})),drone:false,primaryExtra:0,slow:0,rangedScale:1});
  }
  if(id==='skchr_kroos_1')plan.hits=b.times;
  if(id==='skchr_mm_1'&&!replacementProfiles[id])plan.slow=b.sluggish;
  if(id==='skchr_mm_2'){plan.slow=b['attack@sluggish'];plan.stun=b['attack@stun'];plan.stunProb=b['attack@prob'];}
  if(id==='skchr_shotst_1'&&!replacementProfiles[id]||id==='skchr_shotst_2'){
   plan.scale=b.atk_scale;plan.defMultiplier=1+b.def;plan.debuffDuration=b.duration;
   if(id==='skchr_shotst_2')plan.targets=5; // Exact target count in source description.
  }
  if(id==='skchr_totter_1')plan.targets=b.max_target;
  if(id==='skchr_totter_2'){plan.targets=b['attack@s2n.max_target'];plan.singleTargetScale=b['attack@s2c.atk_scale'];}
  if(id==='skchr_rosmon_1')plan.extraArts=b.extra_atk_scale;
  if(id==='skchr_rosmon_2'){plan.radius=1.5;plan.aftershocks+=b.add_times;plan.stun=b['attack@stun'];plan.stunProb=b['attack@prob'];}
  if(id==='skchr_rosmon_3'){plan.blockedOnly=true;plan.targets=b['attack@max_target'];}
  if(id==='skchr_angel_1'){plan.hits=b.times;}
  if(['skchr_angel_2','skchr_angel_3'].includes(id)){plan.hits=b['attack@times'];plan.scale=b['attack@atk_scale'];}
  if(id==='skchr_svrash_3'){plan.targets=b['attack@max_target'];plan.rangedScale=1;}
  if(id==='skchr_thorns_3')plan.rangedScale=1;
  if(id==='skchr_dusk_1')plan.radius=1.7;
  if(id==='skchr_dusk_2'){plan.all=true;plan.kind='rangeAll';plan.radius=0;plan.lowHpScale=b.damage_scale;plan.lowHpRatio=b.hp_ratio;}
  if(id==='skchr_dusk_3'){plan.kind='splash';plan.radius=1.7;plan.preferUnblocked=true;}
  if(id==='skchr_cammou_2'){plan.drone=false;plan.stun=b['attack@stun'];plan.stunProb=b['attack@prob'];}
  if(id?.startsWith('skchr_gdglow_')){plan.drone=false;if(id==='skchr_gdglow_3')plan.slow=b['attack@sluggish'];}
  if(id==='skchr_rockr_2')plan.drone=false;
  if(id==='skchr_amgoat_2'){plan.kind='splash';plan.radius=1.5;plan.scale=b.atk_scale;plan.primaryExtra=b.atk_scale_2;plan.resReduction=b.magic_resistance;plan.debuffDuration=b.duration;}
  if(id==='skchr_amgoat_3'){plan.targets=b['attack@max_target'];plan.random=true;}
  if(id==='skchr_meteo_1')plan.radius=2;
  if(id==='skchr_meteo_2'){plan.scale=b.atk_scale;plan.defReduction=b.def;plan.debuffDuration=b.duration;}
  if(id==='skchr_cqbw_1'){plan.scale=b.atk_scale;plan.radius=1.2;plan.stun=b.stun;}
  if(id==='skchr_pudd_2'){plan.repeatChain=true;plan.chainCount=b['attack@max_target'];}
  if(id==='skchr_leizi_2')plan.chainDecay=1;
  if(id==='skchr_pasngr_1'){plan.chainCount=b['pasngr_s_1.max_target'];plan.slow=b['pasngr_s_1.sluggish'];}
  if(id==='skchr_pasngr_2')plan.chainCount=b['attack@max_target'];
  if(id==='skchr_chen2_1'||id==='skchr_chen2_3')plan.frontAll=true;
  if(id==='skchr_chen2_2'||id==='skchr_chen2_3'){plan.slime={duration:b['attack@projectile_life_time'],move:b['attack@move_speed'],def:b['attack@def']};}
  if(id==='skchr_chen2_3'){plan.hits=2;plan.ammo=2;}
  if(id==='skchr_chen_1'){plan.hits=1;plan.stun=b.stun;}
  if(id==='skchr_chen_2'){plan.targets=b.max_target;plan.hits=1;plan.scale=b.atk_scale;plan.extraArts=b.atk_scale;}
  if(id==='skchr_qiubai_3'){plan.targets=3;plan.damageType='arts';plan.rangedScale=1;}
  if(id==='skchr_whitew_2'){plan.targets=2;plan.damageType='arts';plan.rangedScale=1;}
  if(id==='skchr_snhunt_2'){plan.hunterSpecial={moving:b.atk_scale_1,stationary:b.atk_scale_2};plan.hunterScale=1;plan.targeting='rangeOnly';}
  if(id==='skchr_bpipe_2')plan.hits=2;
  if(id==='skchr_bpipe_3')plan.hits=3;
  if(id==='skchr_lisa_2'||id==='skchr_aglina_3')plan.targets=b['attack@max_target'];
  if(id==='skchr_aglina_2')plan.scale=b.damage_scale;
  if(id==='skchr_mlynar_1'||id==='skchr_mlynar_2'){plan.scale=b['attack@atk_scale'];if(id==='skchr_mlynar_2')plan.hits=2;}
  return root.ArkElementOperators?.plan(o,plan,skill)||plan;
 }
 function attackInterval(o,skill){
  const b=skill?.blackboard||{},id=skill?.sourceId;
  let interval=o.skill?.clientProgram?root.ArkClientPrograms.interval(o,o.attackTime,B.time):(root.ArkClientStatBuffSkills?.interval(o,o.attackTime)??o.attackTime);
  if(id==='skchr_aglina_2')return b.base_attack_time/Math.max(.1,buffMul(o).aspd);
  if(skill?.combatMechanic&&b.base_attack_time!=null){
   const ratio=['skchr_rosmon_2','skchr_rosmon_3','skchr_pasngr_2','skchr_mm_2','skchr_dusk_3'].includes(id);
   interval=ratio?interval*(1+b.base_attack_time):interval+b.base_attack_time;
  }
  const extra=id==='skchr_qiubai_3'?(o.skillState.attackStacks||0)*b.attack_speed/100:0;
  interval=root.ArkMystic?.interval(o,skill,interval)??interval;
  return Math.max(.05,interval)/buffMul(o,extra).aspd;
 }
 function visual(fx){const list=B.combatEffects||=[];list.push({at:B.time,duration:.5,...fx});if(list.length>128)list.splice(0,list.length-128);}
 function attack(o){
  if(root.ArkDollkeeper?.noAttack(o)||root.ArkTacticalSpecials?.noAttack(o))return false;
  if(healingActionType(o)==='heal')return replacementHealingAction(o);
  if(B.projectiles.some(p=>p.owner===o&&p.life>0&&p.plan?.replacementWaitProjectile))return false;
  if(o.skillState&&o.skill?.combatMechanic?.periodic)return false;
  if(o.skillState&&o.skill?.combatMechanic?.aura)return false;
  if(o.skill?.combatMechanic?.idleDisarmed&&!o.skillState)return false;
  if(o.skillState&&operatorAttackProfile(o).releasedDrone?.modes?.[o.skill?.sourceId]?.disarm)return false;
  const skill=o.skillState?o.skill:null,plan=planFor(o,skill);
  let tg=targets(o,plan);
  if(root.ArkHunter&&!root.ArkHunter.ready(o,!!tg.length))return false;
  if(!tg.length)return root.ArkMystic?.store(o,attackInterval(o,skill))||false;
  let active=skill;
  if(!skill&&!root.ArkDollkeeper?.active(o)&&o.skill?.combatMechanic?.next&&!o.skill.combatMechanic.replacementHeal&&o.sp>=o.skill.spCost){
   // A normal target need not qualify for a replacement's motion/range policy.
   // Keep the charge until the replacement can actually acquire a target.
   const nextPlan=planFor(o,o.skill),nextTargets=targets(o,nextPlan);
   if(nextTargets.length&&castSkill(o)){active=o.skill;Object.assign(plan,nextPlan);tg=nextTargets;}
  }
  // Freeze the target count at launch; a later death cannot turn a multi-target volley into a solo bonus.
  if(plan.singleTargetScale&&tg.length===1)plan.scale*=plan.singleTargetScale;
  const t=tg[0],front={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[o.dir||'up'];
  const chance=o.attackCrit?.frontProbability!=null&&enemyOccupiesCell(t,o.row+front[0],o.col+front[1])?o.attackCrit.frontProbability:(skill?o.attackCrit?.skillProbability:o.attackCrit?.probability);
  const crit=!!(o.attackCrit&&gameRandom()<chance),bm=buffMul(o);
  plan.power=operatorAttackPower(o,crit?buffMul(o,0,o.attackCrit.attackBonus||0).atk:bm.atk)*(crit?(o.attackCrit.scale||1):1);
  plan.critical=crit;if(crit&&o.attackCrit.stun)plan.stun=o.attackCrit.stun;
  if(crit&&o.attackCrit.extraTarget&&!plan.all&&tg.length===1)tg=targets(o,{...plan,targets:2});
  o.cd=attackInterval(o,active);o.atkAnimAt=B.time;
  root.ArkElements?.onAction(o);
  applyEvents(o,'attack',[t],B.operators.filter(a=>!a.dead));
  replacementSpellExtras(o,active);
  root.ArkHunter?.consume(o);
  const stored=root.ArkMystic?.take(o)||0;
  if(plan.randomShots){
   for(let i=0;i<plan.randomShots;i++){const pool=targets(o,{...plan,all:true});if(pool.length)launch(o,pool[Math.floor(gameRandom()*pool.length)],plan);}
  }else for(const [index,target]of tg.entries()){
   let duskSummon=null;
   if(o.charId==='char_2015_dusk'&&index===0){
    const first=!o._duskFirstAttack;
    o._duskFirstAttack=true;
    const talent=(o.combatTalents||[]).find(t=>t.name==='点睛');
    if(active?.sourceId==='skchr_dusk_3'||first&&talent)duskSummon={epoch:o._duskEpoch||0,refresh:active?.sourceId==='skchr_dusk_3'};
   }
   launch(o,target,{...plan,...(duskSummon?{duskSummon}:{})});
  }
  for(let i=0;i<stored;i++)launch(o,t,{...plan,mysticEnergy:true,scale:1,visualOffset:(i-(stored-1)/2)*.10});
  if(plan.slime){(B.operatorZones||=[]).push({ownerId:o.id,cells:(o.cells||[]).map(c=>c.slice()),until:B.time+plan.slime.duration,...plan.slime});}
  if(active?.sourceId==='skchr_qiubai_3')o.skillState.attackStacks=Math.min(active.blackboard.max_stack_cnt,(o.skillState.attackStacks||0)+1);
  // An attack that consumes a next-attack skill is locked for that attack;
  // it must not immediately refill one point of its own recovery cost.
  if(!active?.combatMechanic?.next)gainOperatorSp(o,'INCREASE_WHEN_ATTACK',1);
  for(let i=0;i<(plan.ammo||1);i++)consumeOperatorAmmo(o);
  root.ArkDollkeeper?.afterAttack(o,active,plan.dollEpoch);
  root.ArkTactician?.afterAttack(o,plan);
  root.ArkFlowShape?.afterAttack(o,plan);
  return true;
 }
 function launch(o,target,plan){
  plan={...plan,...root.ArkTacticalSpecials?.launch(o,target)};
  const useProjectile=plan.replacementDelivery?plan.replacementDelivery==='projectile':o.position==='RANGED'&&plan.kind!=='rangeAll'||plan.kind==='splash'||plan.airTarget&&target.blockerId!==o.id;
  const shot={owner:o,target,plan:{...plan},sx:o.col,sy:o.row,x:o.col+(plan.visualOffset||0),y:o.row,tx:target.x,ty:target.y,enemy:false,basicAttack:true,life:plan.replacementProjectile?.life??6,speed:plan.replacementProjectile?.speed??PROJECTILE_SPEED,kind:plan.kind==='splash'?'shell':plan.damageType==='arts'?'orb':'arrow'};
  if(Number.isFinite(plan.attackPreDelay)&&plan.attackPreDelay>0){
   if(useProjectile)throw Error('Delayed attack body requires explicit direct delivery');
   spawnProjectile({...shot,kind:'operator-pulse',resolveAt:B.time+plan.attackPreDelay,life:plan.attackPreDelay+1,
    plan:{...shot.plan,replacementWaitProjectile:true,delayedAttackBody:true}});
  }else if(useProjectile)spawnProjectile(shot);else impact(shot);
 }
 function damage(o,e,plan,scale=1,type=plan.damageType){
  if(plan.buddyBomb){root.ArkTacticalSpecials.mount(o,e,plan);return;}
  const burstType=root.ArkElements?.active(e)?e.epBurst.type:null,wasBurst=burstType==='apoptosis';
  if(plan.elementalOnBurst&&root.ArkElements?.active(e,plan.elementalOnBurst))type='elemental';
  let power=plan.power*scale*(plan.hunterScale||1)*(plan.mysticEnergy?(root.ArkMystic?.energyScale(o)??1):1);
  if(plan.hunterSpecial)power*=root.ArkHunter.nonMoving(e)?plan.hunterSpecial.stationary:plan.hunterSpecial.moving;
  if(plan.lowHpScale&&e.hp/e.maxHp<plan.lowHpRatio)power*=plan.lowHpScale;
  if(plan.frontScale>1){const [dr,dc]=({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]})[o.dir||'up'];
   if(plan.frontAll||[-1,0,1].some(side=>enemyOccupiesCell(e,o.row+dr+dc*side,o.col+dc-dr*side)))power*=plan.frontScale;}
  if(plan.rangedScale<1&&e.blockerId!==o.id)power*=plan.rangedScale;
  const dollHit=root.ArkDollkeeper?.beforeHit(o,e,plan);
  const tacticalHit=root.ArkTactician?.modifyHit(o,e,power),wasRevived=!!e.revived;
  const result=calcDamageResult(o,e,1,{raw:tacticalHit?.power??power,type,defScale:plan.defScale,defPenetrate:tacticalHit?.defPenetrate});
  const amount=result.amount;type=result.type;
  const lethal=-(root.ArkEnemyDeathSpawn?.hpDelta(e,-amount,type)??-amount)>=e.hp;
  const actual=hitEnemy(o,e,amount,plan.critical,type);
  root.ArkMystic?.onHit(o,e,plan,lethal);
  root.ArkDollkeeper?.afterHit(o,e,plan,dollHit);
  root.ArkTactician?.afterHit(o,e,plan,tacticalHit,actual,wasRevived);
  root.ArkFlowShape?.afterHit(o,e,actual,wasRevived);
  if(!plan.independentSkill&&!plan.hunterTalent&&!plan.hunterSpecial)onBasicAttackHit(o,e,actual);
  root.ArkElementOperators?.onHit(o,e,actual,plan,type,wasBurst,burstType);
  if(plan.cold&&!lethal)root.ArkHunter?.cold(e,plan.cold,B.time);
  if(plan.stun&&gameRandom()<(plan.stunProb??1)&&!e.stunImmune)e.stunUntil=Math.max(e.stunUntil||0,B.time+plan.stun);
  if(plan.slow){e.slowUntil=Math.max(e.slowUntil||0,B.time+plan.slow);e.slowFactor=.2;}
  if(plan.defReduction){e.operatorDefDebuffs||={};e.operatorDefDebuffs[plan.skillId]={value:plan.defReduction,until:B.time+plan.debuffDuration};}
  if(plan.defMultiplier){
   e.operatorDefMultipliers||={};e.operatorDefMultipliers[plan.skillId+':'+o.id]={skillId:plan.skillId,value:plan.defMultiplier,until:B.time+plan.debuffDuration};
  }
  if(plan.resReduction){e.operatorResDebuffs||={};e.operatorResDebuffs[plan.skillId]={value:plan.resReduction,until:B.time+plan.debuffDuration};}
 }
 function impact(p){
  if(p.directSkillPacket)return root.ArkDirectSkills?.impact(p);
  const plan=p.plan,o=p.owner,t=p.target;
  if(!o||!plan)return;
  if(plan.delayedAttackBody&&(B.time+1e-9<p.resolveAt||!operatorCanAct(o)||o.removed||o.untargetable||o.deployed===false||!units().includes(o)))return;
  if(plan.replacementHeal){
   if(t&&(t.medicLifeEpoch||0)===plan.targetHealEpoch&&units().includes(t)&&directHealAllowed(o,t)){
    healOperator(o,t,plan.power*plan.scale);
    root.ArkMedicSkills?.afterHeal(o,t,{next:true,scale:plan.scale});
   }
   return;
  }
  if(plan.replacementBuffTick){
   const effect=plan.replacementBuffTick;
   if(!t||t.replacementBuffTokens?.[effect.key]!==effect.token)return;
   delete t.replacementBuffTokens[effect.key];
   // The source IfTarget runs at the trigger, not at the original hit. Its
   // AdvancedApplyDamage reads live source ATK rather than cached shot ATK.
   if(!t.dead&&t.hp>0&&effect.condition==='flying'&&t.flying){
    damage(o,t,{...plan,power:operatorAttackPower(o,buffMul(o).atk)},plan.scale);
    spawnHitParticles(t.x,t.y);
   }
   return;
  }
  const live=t&&validEnemy(t,plan.groundOnly,o),x=live?t.x:p.tx,y=live?t.y:p.ty;
  // PRTS: summon/refresh resolves at the main impact, before damage. Store the
  // attack's deployment epoch so old projectiles cannot summon after redeployment.
  if(plan.duskSummon)summonFreeling(o,x,y,plan.duskSummon);
  if(plan.kind==='chain'){
   const eligible=e=>e&&validEnemy(e,plan.groundOnly,o)&&!e.removed&&!e.untargetable&&!(e.invisibleUntil>B.time)&&B.enemies.includes(e);
   if(!live||!eligible(t))return;
   let current=t,previous=null;const used=new Set();
   for(let i=0;i<plan.chainCount&&current;i++){
    const prev=previous;visual({kind:'chain',sx:prev?.x??o.col,sy:prev?.y??o.row,x:current.x,y:current.y});
    applyReplacementHitBuffs(o,current,plan,'before-body');
    damage(o,current,plan,plan.scale*Math.pow(plan.chainDecay,i));
    applyReplacementHitBuffs(o,current,plan,'after-body');used.add(current);
    previous=current;
    current=B.enemies.filter(e=>eligible(e)&&e!==previous&&(plan.repeatChain||!used.has(e))&&Math.hypot(e.x-previous.x,e.y-previous.y)<=plan.chainRadius)
     .sort((a,b)=>Math.hypot(a.x-previous.x,a.y-previous.y)-Math.hypot(b.x-previous.x,b.y-previous.y)||String(a.id).localeCompare(String(b.id)))[0];
   }
   return;
  }
  const pool=plan.kind==='splash'?B.enemies.filter(e=>validEnemy(e,plan.groundOnly,o)&&Math.hypot(e.x-x,e.y-y)<=plan.radius):live?[t]:[];
  for(const e of pool)for(let hit=0;hit<plan.hits&&!e.dead;hit++){
   applyReplacementHitBuffs(o,e,plan,'before-body');
   if(e===t&&plan.primaryExtra&&plan.separatePrimary)damage(o,e,plan,plan.primaryExtra);
   if(!e.dead)damage(o,e,plan,plan.scale+(e===t&&!plan.separatePrimary?(plan.primaryExtra||0):0));
   if(plan.extraArts&&!e.dead)damage(o,e,plan,plan.extraArts,'arts');
   applyReplacementHitBuffs(o,e,plan,'after-body');
  }
  if(plan.drone&&live){
   const b=operatorAttackProfile(o).bb||{},key=t.visualId??t.id;
   o._droneHits=o._droneTarget===key?(o._droneHits||0)+1:0;o._droneTarget=key;
   if(!t.dead)damage(o,t,{...plan,drone:false},Math.min(b.max_atk_scale??1.1,(b.init_atk_scale??.2)+(b.delta_atk_scale??.15)*o._droneHits));
   visual({kind:'chain',sx:o.col+.2,sy:o.row-.2,x,y,color:'#80d6ff'});
  }
  if(plan.kind==='splash')visual({kind:'operator-blast',x,y,radius:plan.radius,aftershock:!!plan.pulse});
  else if(pool.length)spawnHitParticles(x,y);
  // Delayed pulses stay at the impact location, even if the main target dies.
  for(let i=0;i<plan.aftershocks;i++)spawnProjectile({owner:o,target:null,kind:'operator-pulse',enemy:false,basicAttack:true,
   plan:{...plan,hits:1,scale:plan.aftershockScale,aftershocks:0,extraArts:0,primaryExtra:0,pulse:true},
   x,y,tx:x,ty:y,resolveAt:B.time+(i+1)*.2,life:(i+1)*.2+1});
 }
 function applyReplacementHitBuffs(o,e,plan,phase){
  if(e.dead||e.hp<=0)return;
  for(const effect of plan.replacementHitBuffs||[])if(effect.phase===phase){
   if(effect.chance!=null){
    if(!Number.isFinite(effect.chance)||effect.chance<0||effect.chance>1)throw Error('Invalid hit Buff probability');
    if(effect.chance===0||effect.chance<1&&gameRandom()>=effect.chance)continue;
   }
   if(['movement-multiplier','slow','stun','attack-multiplier'].includes(effect.kind)){
    applySourceBuff(o,e,effect);
   }else if(effect.kind==='defense-multiplier'){
    const states=e.operatorDefMultipliers||={},key=effect.key+':'+o.id;
    states[key]={skillId:effect.key,value:effect.value,until:B.time+effect.duration};
   }else if(effect.kind==='delayed-conditional-hit'){
    e.replacementBuffTokens||={};
    const token=e.replacementBuffSerial=(e.replacementBuffSerial||0)+1;
    e.replacementBuffTokens[effect.key]=token;
    spawnProjectile({owner:o,target:e,kind:'operator-pulse',enemy:false,basicAttack:true,
     plan:{kind:'single',scale:effect.scale,hits:1,damageType:effect.damageType,independentSkill:true,
      skillId:plan.skillId,replacementBuffTick:{key:effect.key,condition:effect.condition,token}},
     x:e.x,y:e.y,tx:e.x,ty:e.y,resolveAt:B.time+effect.delay,life:effect.delay+1});
   }
  }
 }
 // Loaded, finite source statuses share exact Buff keys across action providers.
 // The max-expiry refresh model is an explicit approximation: the native
 // DEFAULT dispatch table is protected, not evidence for STACK refresh flags.
 function sourceBuffActive(e,key){
  return !!e&&!e.dead&&e.hp>0&&typeof key==='string'&&!root.ArkEnemyAuras?.suppressesBuff(e,key,B.time)&&(
   (e.operatorMoveSpeedDebuffs?.[key]?.until||0)>B.time||
   (e.operatorAttackMultipliers?.[key]?.until||0)>B.time||
   (e.operatorStatusBuffs?.[key]?.until||0)>B.time||!!root.ArkSkillEndEffects?.hasBuff(e,key,B.time));
 }
 function applySourceBuff(o,e,effect,blackboard={}){
  if(!e||e.dead||e.hp<=0||typeof effect?.key!=='string'||!effect.key)return false;
  if(root.ArkEnemyAuras?.suppressesBuff(e,effect.key,B.time))return false;
  const slow=effect.kind==='slow'||effect.kind==='movement-multiplier',stun=effect.kind==='stun',attack=effect.kind==='attack-multiplier';
  if(!slow&&!stun&&!attack||stun&&e.stunImmune)return false;
  let duration=effect.duration??blackboard[effect.durationKey];
  if(!Number.isFinite(duration)||duration<=0||(slow||attack)&&(!Number.isFinite(effect.value)||effect.value<0||effect.value>=1))return false;
  if(stun){const resistance=root.ArkSkillAuras?.statusResistance?.(e,B.time)??e.statusResistance;
   duration*=1-Math.max(0,Math.min(1,Number.isFinite(resistance)?resistance:0));}
  if(duration<=0)return false;
  const states=slow?(e.operatorMoveSpeedDebuffs||={}):attack?(e.operatorAttackMultipliers||={}):(e.operatorStatusBuffs||={}),previous=states[effect.key];
  const until=Math.max(previous?.until||0,B.time+duration);
  states[effect.key]={kind:slow?'slow':attack?'attack-multiplier':'stun',key:effect.key,value:stun?null:effect.value,until,ownerId:o?.id??null};
  if(stun)e.stunUntil=Math.max(e.stunUntil||0,until);
  return true;
 }
 function movementMultiplier(e){return Math.min(1,...Object.entries(e.operatorMoveSpeedDebuffs||{}).filter(([key,d])=>d.until>B.time&&!root.ArkEnemyAuras?.suppressesBuff(e,key,B.time)).map(([,d])=>d.value));}
 function attackMultiplier(e){return Object.values(e.operatorAttackMultipliers||{}).filter(d=>d.until>B.time).reduce((n,d)=>n*d.value,1);}
 function isSlowed(e){return movementMultiplier(e)<1;}
 function expire(o){
  if(o.skill?.sourceId==='skchr_cammou_2')o.releasedDrone=null;
  if(operatorAttackProfile(o).releasedDrone?.modes?.[o.skill?.sourceId])o.releasedDrones=null;
  if(o.skill?.sourceId==='skchr_rockr_2'&&o.skillState&&!o.dead){
   const elapsed=Math.max(0,Math.min(B.time,o.skillState.until)-o.skillState.overloadAt);
   if(elapsed>0)o.stunUntil=Math.max(o.stunUntil||0,B.time+elapsed);
  }
  if(o.skill?.sourceId==='skchr_ghost_2'&&!o.dead)o.stunUntil=Math.max(o.stunUntil||0,B.time+o.skill.blackboard.stun);
  if(o.skill?.sourceId==='skchr_mlynar_2'&&(o._kills||0)>(o.skillState?.killsAtStart||0)&&!o.dead)o._retainLiberatorCharge=o._liberatorCharge;
  for(const s of B.summoneds||[])if(s.combatToken&&!s.tacticalToken&&!s.medicDrone&&!s.freeling&&s.ownerId===o.id){s.dead=true;root.ArkEnemyCold?.clear(s);}
 }
 function summonFreeling(o,x,y,request){
  const profile=operatorAttackProfile(o),d=profile.freeling;
  if(!d||!operatorPresent(o)||(o._duskEpoch||0)!==request.epoch)return;
  const row=Math.floor(y+.5),col=Math.floor(x+.5);
  if(!isDeployable(row,col,{position:d.position})||isBenchSlot(row,col))return;
  const at=units().concat(B.traps||[]).filter(a=>!a.removed&&(!a.dead||a.tacticalDormant)&&a.row===row&&a.col===col);
  const existing=at.find(a=>a.freeling&&a.ownerId===o.id&&a.ownerEpoch===request.epoch);
  if(existing&&request.refresh){
   // This specific refresh bypasses the token's direct-healing prohibition.
   existing.hp=existing.maxHp;existing.expiresAt=B.time+d.lifetime;existing.life=d.lifetime;
   visual({kind:'ink-rise',x:col,y:row,duration:.45});return;
  }
  if(at.length)return;
  const phase=d.phases[Math.min(profile.training?.evolve??2,d.phases.length-1)],a=phase.frames[0],z=phase.frames.at(-1),
   f=Math.max(0,Math.min(1,((profile.training?.level??1)-a.level)/Math.max(1,z.level-a.level))),stat=k=>Math.round(a.data[k]+(z.data[k]-a.data[k])*f);
  const maxHp=stat('maxHp'),atk=stat('atk'),def=stat('def');
  const s={id:'freeling:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,ownerEpoch:request.epoch,playerId:o.playerId,side:o.side,
   name:d.name,charId:d.charId,combatToken:true,freeling:true,canAttack:true,position:d.position,nativePosition:d.position,profession:'TOKEN',
   row,col,dir:o.dir||'up',maxHp,hp:maxHp,atk,def,magicRes:stat('magicResistance'),blockCnt:stat('blockCnt'),atkType:'arts',attackTime:a.data.baseAttackTime,
   rangeGrids:phase.rangeGrids,dead:false,deployed:true,deployT:1,deployAt:B.time,bornAt:B.time,expiresAt:B.time+d.lifetime,life:d.lifetime,cd:0,
   buffs:[],events:[],basicAttack:{action:'attack',kind:'single',damageType:'arts',groundOnly:true,noDirectHeal:true},
   attributeBase:{version:root.ArkAttributes.version,atk,def,aspd:1}};
  s.cells=rangeCellsFor(s);(B.summoneds||=[]).push(s);assignBlocks();visual({kind:'ink-rise',x:col,y:row,duration:.45});
 }
 function onEnemyDefeated(e,owner){
  if(!owner)return;
  const o=owner.freeling?B.operators.find(a=>a.id===owner.ownerId&&(a._duskEpoch||0)===owner.ownerEpoch):owner;
  if(o?.charId!=='char_2015_dusk'||!operatorPresent(o)||owner.freeling&&(operatorAttackProfile(o).training?.evolve??0)<2)return;
  const talent=(o.combatTalents||[]).find(t=>t.name==='化境');if(!talent)return;
  o._duskStacks=Math.min(bbOf(talent).max_stack_cnt,(o._duskStacks||0)+1);
 }
 function tokenStats(o){
  const profile=operatorAttackProfile(o),data=profile.token;
  if(!data)return null;
  const phase=data.phases[Math.min(profile.training?.evolve??2,data.phases.length-1)],frames=phase.frames;
  const a=frames[0],b=frames.at(-1),level=Math.min(phase.maxLevel,profile.training?.level??1),t=Math.max(0,(level-a.level)/Math.max(1,b.level-a.level));
  const stat=k=>Math.round(a.data[k]+(b.data[k]-a.data[k])*t);
  return {maxHp:stat('maxHp'),def:stat('def'),blockCnt:stat('blockCnt'),magicRes:stat('magicResistance')};
 }
 function summonRosmontis(o){
  const p=operatorAttackProfile(o),data=p.token,stats=tokenStats(o);if(!stats)return;
  const available=[];
  for(let r=0;r<BDATA.level.rows;r++)for(let c=0;c<BDATA.level.cols;c++){
   if(!['MELEE','ALL'].includes(BDATA.level.buildable[r]?.[c])||!operatorInRange(o,{row:r,col:c})
    ||units().some(a=>operatorPresent(a)&&a.row===r&&a.col===c))continue;
   available.push({r,c,d:Math.min(...B.enemies.filter(e=>validEnemy(e,true)).map(e=>Math.hypot(e.x-c,e.y-r)),1000),tie:gameRandom()});
  }
  available.sort((a,b)=>a.d-b.d||a.tie-b.tie);
  for(const pos of available.slice(0,2)){
   const s={...stats,id:'rosmon:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,playerId:o.playerId,
    name:data.name,charId:data.charId,combatToken:true,canAttack:false,position:'MELEE',profession:'TOKEN',
    row:pos.r,col:pos.c,hp:stats.maxHp,atk:0,dead:false,deployed:true,deployT:1,deployAt:B.time,
    life:o.skillState.until-B.time,blockDefReduction:data.defReduction,buffs:[],events:[]};
   (B.summoneds||=[]).push(s);visual({kind:'operator-blast',x:s.col,y:s.row,radius:1.5});
   for(const e of B.enemies)if(validEnemy(e,true)&&Math.hypot(e.x-s.col,e.y-s.row)<=1.5&&!e.stunImmune)e.stunUntil=Math.max(e.stunUntil||0,B.time+o.skill.blackboard.stun);
  }
  assignBlocks();
 }
 function summonObelisk(o){
  const p=operatorAttackProfile(o),d=p.obelisk;if(!d||!o.skillState)return;
  const pool=(o.cells||[]).filter(([r,c])=>isDeployable(r,c,{position:d.position})&&!isBenchSlot(r,c)
   &&!units().concat(B.traps||[]).some(a=>!a.removed&&(!a.dead||a.tacticalDormant)&&a.row===r&&a.col===c));
  if(!pool.length)return; // Lack of an empty melee tile does not prevent the caster attacking.
  // Uniform legal-cell selection is a local rule pending client selection evidence.
  const [row,col]=pool[Math.floor(gameRandom()*pool.length)],phase=d.phases[Math.min(p.training.evolve,d.phases.length-1)],a=phase.frames[0],z=phase.frames.at(-1),
   f=Math.max(0,Math.min(1,(Math.min(p.training.level,phase.maxLevel)-a.level)/Math.max(1,z.level-a.level))),stat=k=>Math.round(a.data[k]+(z.data[k]-a.data[k])*f);
  const maxHp=stat('maxHp'),def=stat('def'),atk=stat('atk');
  const s={id:'obelisk:'+o.id+':'+(B.tokenSequence=(B.tokenSequence||0)+1),ownerId:o.id,playerId:o.playerId,side:o.side,
   name:d.name,charId:d.charId,combatToken:true,obelisk:true,canAttack:false,position:d.position,profession:'TOKEN',
   row,col,dir:'up',maxHp,hp:maxHp,def,atk,blockCnt:stat('blockCnt'),magicRes:stat('magicResistance'),attackTime:a.data.baseAttackTime,
   dead:false,deployed:true,deployT:1,deployAt:B.time,bornAt:B.time,expiresAt:Math.min(o.skillState.until,B.time+d.lifetime),
   life:Math.min(o.skillState.until-B.time,d.lifetime),buffs:[],events:[],basicAttack:{action:'none',noDirectHeal:true,noRegeneration:true},
   attributeBase:{version:root.ArkAttributes.version,atk,def,aspd:1},cells:[]};
  (B.summoneds||=[]).push(s);
  const cells=rangeCellsFor({...s,rangeGrids:d.rangeGrids}),plan={kind:'single',damageType:'arts',independentSkill:true,skillId:o.skill.sourceId,
   power:operatorAttackPower(o,buffMul(o).atk),scale:o.skill.blackboard.atk_scale,hits:1,stun:o.skill.blackboard.stun};
  for(const e of B.enemies.filter(e=>validEnemy(e,false,o)&&enemyInOperatorRange(s,e,cells)))impact({owner:o,target:e,plan});
  visual({kind:'obelisk-rise',x:col,y:row,cells,duration:.55});assignBlocks();
 }
 function cast(o){
  const s=o.skill,m=s.combatMechanic;if(!m)return;
  if(s.sourceId==='skchr_cammou_2')o.releasedDrone={targetId:null,nextAt:B.time,x:o.col,y:o.row};
  const funnelMode=operatorAttackProfile(o).releasedDrone?.modes?.[s.sourceId];
  if(funnelMode)o.releasedDrones=Array.from({length:funnelMode.count},(_,index)=>({index,targetId:null,nextAt:B.time,x:o.col,y:o.row,
   lastTargetId:index===0?o._droneTarget:null,hits:index===0?o._droneHits||0:0}));
  if(funnelMode?.overloadRatio)o.skillState.overloadAt=B.time+s.duration*(1-funnelMode.overloadRatio);
  if(m.costStream&&o.skillState)o.skillState.commonDp={startedAt:B.time,emitted:0,...m.costStream};
  if(s.sourceId==='skchr_texas_2'){
   const cells=rangeCellsFor({...o,rangeGrids:s.rangeGrids});
   const plan={kind:'single',damageType:'arts',independentSkill:true,skillId:s.sourceId,power:operatorAttackPower(o,buffMul(o).atk),scale:s.blackboard.atk_scale,hits:2,stun:s.blackboard.stun};
   // Source specifies two hits, but not their frame spacing. Resolve separately
   // at activation; do not invent a delay or expand the exact source cells.
   for(const e of B.enemies.filter(e=>validEnemy(e,false,o)&&enemyInOperatorRange(o,e,cells)))impact({owner:o,target:e,plan});
   visual({kind:'sword-rain',x:o.col,y:o.row,cells,duration:.45});
  }
  if(s.sourceId==='skchr_rosmon_3')summonRosmontis(o);
  if(s.sourceId==='skchr_beewax_2')summonObelisk(o);
  if(s.sourceId==='skchr_bpipe_3'){
   const n=s.blackboard.block_cnt;o.blockCnt+=n;o.skillState.deltas.blockCnt=n;
  }
  if(s.sourceId==='skchr_mlynar_2')o.skillState.killsAtStart=o._kills||0;
  if(m.heal){
   const pool=healingTargets(o);for(const t of pool)healOperator(o,t,operatorAttackPower(o,buffMul(o).atk)*s.blackboard.heal_scale);
   o.cd=attackInterval(o,null);
  }
  if(s.sourceId==='skchr_thorns_3'){
   o._thornsCasts=(o._thornsCasts||0)+1;
   if(o._thornsCasts>=2){o.skillState.until=Number.MAX_SAFE_INTEGER;for(const buff of o.buffs||[])if(buff.skillState===o.skillState){
    if(buff.atk>1)buff.atk=1+s.blackboard['thorns_s_3[b].atk'];
    if(buff.aspd>1)buff.aspd=1+s.blackboard['thorns_s_3[b].attack_speed']/100;
    buff.until=Number.MAX_SAFE_INTEGER;
   }}
  }
  if(m.instant){const plan=planFor(o,s);plan.power=operatorAttackPower(o,buffMul(o).atk);for(const t of targets(o,plan)){
   launch(o,t,s.sourceId==='skchr_snhunt_2'?{...plan,visualOffset:-.07}:plan);
   if(s.sourceId==='skchr_snhunt_2')launch(o,t,{...plan,visualOffset:.07});
  }}
 }
 function healingTargets(o){
  const id=o.skill.sourceId,all=id==='skchr_demkni_2';
  const caster={...o,cells:o.skill.rangeGrids?rangeCellsFor({...o,rangeGrids:o.skill.rangeGrids}):o.cells};
  return healingAllies(caster).filter(a=>a.hp<a.maxHp&&(id!=='skchr_demkni_1'||a.hp<a.maxHp*.5)).sort(healingOrder).slice(0,all?9999:1);
 }
 // A consumed replacement emits its skill-owned listener once per main action,
 // not once per damage target/hit. Extra healing does not recurse through cast.
 function replacementSpellExtras(o,skill){
  const extras=replacementProfiles[skill?.sourceId]?.spellExtras;if(!extras?.length)return;
  const power=operatorAttackPower(o,buffMul(o).atk);
  for(const extra of extras){
   const targets=replacementHealingTargets(o,extra);
   for(const t of targets){const scale=skill.blackboard[extra.scaleKey];
    healOperator(o,t,power*scale);root.ArkMedicSkills?.afterHeal(o,t,{next:true,scale});
    root.ArkElementOperators?.healed(o,t,power*scale,0);
   }
  }
 }
 function replacementHealingTargets(o,p){
  const cells=o.skill.rangeGrids?rangeCellsFor({...o,rangeGrids:o.skill.rangeGrids}):o.cells;
  const caster={...o,cells};
  return units().filter(t=>directHealAllowed(o,t)&&operatorInRange(caster,t)&&t.hp<t.maxHp&&
   (p.hpThreshold==null||(p.hpThresholdExcludeEqual?t.hp<t.maxHp*p.hpThreshold:t.hp<=t.maxHp*p.hpThreshold)))
   .sort(healingOrder).slice(0,p.targetKey?o.skill.blackboard[p.targetKey]:p.targetCount);
 }
 function healingActionType(o){
  const p=replacementProfiles[o.skill?.sourceId];
  if(p?.kind!=='next-heal'||!o.skill.combatMechanic?.replacementHeal||!operatorCanAct(o)||o.cd>0||o.skillState||
   root.ArkDollkeeper?.active(o)||root.ArkElements?.skillLocked(o)||o.sp<o.skill.spCost)return null;
  return replacementHealingTargets(o,p).length?'heal':null;
 }
 function replacementHealingAction(o){
  if(healingActionType(o)!=='heal')return null;
  const p=replacementProfiles[o.skill.sourceId],targets=replacementHealingTargets(o,p),s=o.skill;
  if(!targets.length)return false;
  let activated=false;requestedHealing.add(o);
  try{activated=castSkill(o)===true;}finally{requestedHealing.delete(o);}
  if(!activated)return false;
  const plan={replacementHeal:true,power:operatorAttackPower(o,buffMul(o).atk),scale:s.blackboard[p.scaleKey],skillId:s.sourceId};
  o.cd=attackInterval(o,s);o.atkAnimAt=B.time;
  for(const t of targets){
   const shot={owner:o,target:t,plan:{...plan,targetHealEpoch:t.medicLifeEpoch||0},sx:o.col,sy:o.row,x:o.col,y:o.row,
    tx:t.col,ty:t.row,enemy:false,basicAttack:true,life:p.projectile?.life??6,speed:p.projectile?.speed??PROJECTILE_SPEED,kind:'orb'};
   if(p.delivery==='projectile')spawnProjectile(shot);else impact(shot);
  }
  root.ArkElements?.onAction(o);
  // Consuming a replacement never returns attack-recovery SP for that heal.
  return true;
 }
 function canCast(o){const m=o.skill?.combatMechanic;if(!m)return true;
  if(m.replacementHeal)return requestedHealing.has(o)&&healingActionType(o)==='heal';
  if(m.next)return false;
  if(m.heal)return o.cd<=0&&healingTargets(o).length>0;
  return !m.instant||targets(o,planFor(o,o.skill)).length>0;}
 function update(dt){
  B.operatorZones=(B.operatorZones||[]).filter(z=>z.until>B.time);
  for(const e of B.enemies){e.zoneDefReduction=0;for(const z of B.operatorZones)if(!e.flying&&z.cells.some(c=>enemyOccupiesCell(e,c[0],c[1]))){
   e.zoneDefReduction=Math.min(e.zoneDefReduction,z.def);e.slowUntil=Math.max(e.slowUntil||0,B.time+dt+.001);e.slowFactor=Math.min(e.slowFactor??1,1+z.move);
  }}
  for(const o of B.operators){
   if(!operatorPresent(o))continue;
   updateReleasedDrone(o);
   root.ArkHunter?.update(o,dt);
   for(const t of o.combatTalents||[]){const b=bbOf(t);
    if(o.charId==='char_344_beewax'&&t.name==='沙原的庇护'&&!o.skillState)healOperator(o,o,o.maxHp*(b.hp_recovery_per_sec_by_max_hp_ratio||0)*dt,{regen:true,visual:false});
    if(o.charId==='char_181_flower'&&b.atk_to_hp_recovery_ratio){
     const amount=operatorAttackPower(o,buffMul(o).atk)*b.atk_to_hp_recovery_ratio*dt;
     for(const a of units())if(operatorPresent(a))healOperator(o,a,amount,{regen:true,visual:false});
    }
   }
   if(o.charId==='char_391_rosmon'&&!o._rosmonLinked){
    o._rosmonLinked=true;const talent=(o.combatTalents||[]).find(t=>t.name==='感知稳定');
    const casters=B.operators.filter(a=>a!==o&&operatorPresent(a)&&a.profession==='CASTER');
    if(talent&&casters.length){o._rosmonAlly=casters[Math.floor(gameRandom()*casters.length)].id;o._rosmonBonus=bbOf(talent).atk;}
   }
   if(o.skillState&&['skchr_lisa_3','skchr_demkni_3'].includes(o.skill?.sourceId)){
    const b=o.skill.blackboard,ratio=b['attack@heal_scale']??b['attack@atk_to_hp_recovery_ratio']??0;
    for(const a of units())if(operatorPresent(a)&&operatorInRange(o,a))healOperator(o,a,operatorAttackPower(o,buffMul(o).atk)*ratio*dt,{regen:true,visual:false});
    for(const e of B.enemies)if(validEnemy(e)&&inAttackRange(o,e)){
     e.slowUntil=Math.max(e.slowUntil||0,B.time+Math.max(dt,.04));e.slowFactor=Math.min(e.slowFactor??1,o.skill.sourceId==='skchr_lisa_3'?.2:1+b['demkni_s_3.move_speed']);
    }
   }
   if(o.skillState&&o.skill?.combatMechanic?.periodic){
    const pool=B.enemies.filter(e=>validEnemy(e)&&inAttackRange(o,e));
    for(const e of pool)if(!e.stunImmune)e.stunUntil=Math.max(e.stunUntil||0,Math.min(o.skillState.until,B.time+Math.max(dt,.04)));
    o.skillState.periodicTime=(o.skillState.periodicTime||0)+dt;
    while(o.skillState.periodicTime+1e-9>=1){o.skillState.periodicTime=Math.max(0,o.skillState.periodicTime-1);const plan={power:operatorAttackPower(o,buffMul(o).atk),damageType:'arts'};
     for(const e of pool)if(!e.dead){damage(o,e,plan,o.skill.blackboard.atk_scale);visual({kind:'operator-blast',x:e.x,y:e.y,radius:.45});}
    }
   }
  }
 }
 function updateReleasedDrone(o){
  const data=operatorAttackProfile(o).releasedDrone;
  if(!o.skillState||!data?.skills.includes(o.skill?.sourceId))return;
  const mode=data.modes?.[o.skill.sourceId];
  for(const state of mode?o.releasedDrones||[]:o.releasedDrone?[o.releasedDrone]:[])updateFunnel(o,state,data,mode);
 }
 function updateFunnel(o,state,data,mode){
  // Released projectiles have their own clocks. Caster action inhibition stops
  // new launches but leaves a valid existing lock running.
  const key=e=>e.visualId??e.id;
  let target=B.enemies.find(e=>key(e)===state.targetId&&!e.dead&&e.hp>0);
  if(!target){
   if(!operatorCanAct(o)){state.targetId=null;return;}
   // Global S3 uses the same eligibility/order, with an explicit global range.
   target=mode?.global?B.enemies.filter(e=>validEnemy(e,false,o)&&!(e.invisibleUntil>B.time)).sort((a,b)=>dist(o,a)-dist(o,b))[0]
    :targets(o,{...planFor(o,o.skill),drone:false})[0];
   if(!target){state.targetId=null;return;}
   const nextKey=key(target);if(state.lastTargetId!==nextKey)state.hits=0;
   state.targetId=nextKey;state.nextAt=Math.max(B.time,state.nextAt);
  }
  state.x=target.x;state.y=target.y;
  if(B.time+1e-9<state.nextAt||!validEnemy(target,false,o))return;
  const b=operatorAttackProfile(o).bb||{};
  const plan={...planFor(o,o.skill),drone:false,independentSkill:true,power:operatorAttackPower(o,buffMul(o).atk),scale:1,hits:1};
  const talent=data.explosion&&(o.combatTalents||[]).find(t=>t.name==='信标的愤怒'),tb=talent&&bbOf(talent);
  // Native DealHitTarget tests PRD BEFORE applying the ordinary ramped hit.
  // DicePRD increments per-ability failures, multiplies the coefficient, forces
  // success at max_stack_cnt, and consumes no random draw for that forced hit.
  if(tb?.['attack@prob']>0){
   o.funnelPrd||={};const id=o.skill.sourceId+':'+state.index,count=(o.funnelPrd[id]||0)+1,cap=tb['attack@max_stack_cnt'];
   if(cap>0&&count>=cap||gameRandom()<Math.min(1,count*tb['attack@prob'])){
    o.funnelPrd[id]=0;const {radius,delay}=data.explosion;
    spawnProjectile({owner:o,target:null,kind:'operator-pulse',enemy:false,basicAttack:true,
     plan:{...plan,kind:'splash',radius,scale:tb['attack@atk_scale_2'],aftershocks:0,slow:0,pulse:true},
     x:target.x,y:target.y,tx:target.x,ty:target.y,resolveAt:B.time+delay,life:delay+1});
    // MultiFunnelTrait.OnProjectileStop keeps the ability's last target/scale.
    // Releasing again on the same target therefore does not reset its ramp.
    state.targetId=null;state.nextAt=B.time+attackInterval(o,o.skill);
    visual({kind:'operator-blast',x:target.x,y:target.y,radius,duration:delay});return;
   }
   o.funnelPrd[id]=count;
  }
  const maxScale=(b.max_atk_scale??1.1)*(mode?.overloadRatio&&B.time>=o.skillState.overloadAt?o.skill.blackboard.scale:1),
   maxStacks=mode?.overloadRatio?Math.ceil((maxScale-(b.init_atk_scale??.2))/(b.delta_atk_scale??.15)):(b.max_stack_cnt??6);
  if(!mode){
   o._droneHits=o._droneTarget===state.targetId?(o._droneHits||0)+1:0;o._droneTarget=state.targetId;state.hits=o._droneHits;
  }else if(state.lastTargetId===state.targetId)state.hits=Math.min(maxStacks,state.hits+1);
  state.lastTargetId=state.targetId;
  const scale=Math.min(maxScale,(b.init_atk_scale??.2)+(b.delta_atk_scale??.15)*state.hits);
  damage(o,target,plan,scale);state.nextAt=B.time+attackInterval(o,o.skill);
  visual({kind:'released-drone-hit',x:target.x,y:target.y,sx:target.x+.25,sy:target.y-.3,duration:.2});
 }
 function attackBonus(o){let amount=0;for(const a of B?.operators||[])if(operatorPresent(a)&&a._rosmonAlly!=null&&(a===o||a._rosmonAlly===o.id))amount=Math.max(amount,a._rosmonBonus||0);
  if(o.charId==='char_2015_dusk'){const t=(o.combatTalents||[]).find(t=>t.name==='化境');if(t)amount+=(bbOf(t).atk||0)*Math.min(bbOf(t).max_stack_cnt,o._duskStacks||0);}
  if(o.charId==='char_4040_rockr'){
   const t=(o.combatTalents||[]).find(t=>t.name==='立于磐石'),b=t&&bbOf(t);
   if(b?.interval>0)amount+=b.atk*Math.min(b.max_stack_cnt,Math.floor(Math.max(0,B.time-(o.deployAt||0))/b.interval));
   if(o.skill?.sourceId==='skchr_rockr_2'&&o.skillState&&B.time>=o.skillState.overloadAt)amount+=o.skill.blackboard.atk;
  }
  return amount;}
 function penetration(o){return Math.max(0,...(o.combatTalents||[]).filter(t=>!(o.charId==='char_427_vigil'&&t.name==='狼群天性')).map(t=>bbOf(t).def_penetrate_fixed||0));}
 function resistancePenetration(o){return o.charId==='char_377_gdglow'?Math.max(0,...(o.combatTalents||[]).filter(t=>t.name==='精准导流').map(t=>bbOf(t).magic_resist_penetrate_fixed||0)):0;}
 function defense(e){return (blockerOf(e)?.blockDefReduction||0)+(e.zoneDefReduction||0)+Object.values(e.operatorDefDebuffs||{}).filter(d=>d.until>B.time).reduce((n,d)=>n+d.value,0);}
 function resistance(e){return Object.values(e.operatorResDebuffs||{}).filter(d=>d.until>B.time).reduce((n,d)=>n*(1+d.value),1);}
 function defenseMultiplier(e){
  const groups={};for(const d of Object.values(e.operatorDefMultipliers||{}))if(d.until>B.time)groups[d.skillId]=Math.min(groups[d.skillId]??1,d.value);
  return Object.values(groups).reduce((n,v)=>n*v,1);
 }
 function artsTaken(e){let scale=1;for(const o of B.operators)if(operatorPresent(o)&&o.skillState&&o.skill?.sourceId==='skchr_demkni_3'&&inAttackRange(o,e))scale=Math.max(scale,o.skill.blackboard['demkni_s_3.damage_scale']);return scale;}
 function immortal(o){return o.skillState&&o.skill?.sourceId==='skchr_ghost_2';}
 function death(o){expire(o);o.funnelPrd=null;o.hunter=null;o.mystic=null;o._rosmonLinked=false;o._rosmonAlly=null;o._rosmonBonus=0;o._thornsCasts=0;o._droneHits=0;o._droneTarget=null;
  if(o.charId==='char_2015_dusk'){
   o._duskEpoch=(o._duskEpoch||0)+1;o._duskFirstAttack=false;o._duskStacks=0;
   for(const s of B.summoneds||[])if(s.freeling&&s.ownerId===o.id){s.dead=true;root.ArkEnemyCold?.clear(s);root.ArkElements?.clear(s);root.ArkMedicSkills?.clear(s);}
  }
 }
 root.ArkOperatorCombat={supported:[...supported],marksmanSkills,vanguardSkills,configure,handledTalent,attack,impact,cast,canCast,update,expire,death,onEnemyDefeated,assignBlocks,moveToContact,blockerOf,attackBonus,penetration,resistancePenetration,defense,defenseMultiplier,movementMultiplier,attackMultiplier,isSlowed,sourceBuffActive,applySourceBuff,resistance,artsTaken,immortal,planFor,attackInterval,healingActionType,replacementHealingAction};
})(typeof window!=='undefined'?window:globalThis);
