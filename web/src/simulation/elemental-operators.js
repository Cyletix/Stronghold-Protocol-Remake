(function(root){
 'use strict';
 const ids=new Set(['char_245_cello','char_4146_nymph','char_616_pithst','char_2026_yu','char_1016_agoat2']);
 // Explicit source IDs only. "Can deal elemental damage" is not an on-hit trigger.
 const hitSkills={
  skchr_kaitou_1:{type:'apoptosis',basis:'arts',ratio:'attack@ep_damage_ratio',extra:'attack@extra_ep_damage_scale'},
  skchr_kaitou_2:{type:'apoptosis',extra:'attack@extra_ep_damage_scale',targets:2},
  skchr_warmy_1:{type:'burn',basis:'arts',ratio:'attack@ep_damage_ratio'},
  skchr_threye_1:{type:'apoptosis',basis:'atk',ratio:'ep_damage_ratio',scale:'atk_scale',next:true},
  skchr_threye_2:{type:'apoptosis',basis:'atk',ratio:'attack@ep_damage_ratio',targets:2}
 };
 const skills=new Set(['skchr_cello_1','skchr_cello_2','skchr_cello_3','skchr_nymph_1','skchr_nymph_2','skchr_nymph_3','skchr_pithst_1','skchr_yu_1','skchr_agoat2_1','skchr_agoat2_2','skchr_agoat2_3',...Object.keys(hitSkills)]);
 const E=()=>root.ArkElements,units=()=>[...B.operators,...(B.summoneds||[])];
 const bb=t=>Object.fromEntries((t?.blackboard||[]).map(v=>[v.key,v.value]));
 const talent=(o,key)=>(o.combatTalents||[]).map(bb).find(b=>b[key]!=null)||{};
 const power=o=>operatorAttackPower(o,buffMul(o).atk);
 const range=(o,e)=>enemyInOperatorRange(o,e);
 const active=(o,id)=>operatorPresent(o)&&o.skillState&&o.skill?.sourceId===id;
 function configure(s){
  if(!skills.has(s.sourceId))return;
  const id=s.sourceId,b=s.blackboard;
  s.combatMechanic={version:3,instant:['skchr_cello_1','skchr_nymph_2'].includes(id),idleDisarmed:id==='skchr_cello_1',elemental:true};
  if(hitSkills[id]?.next){s.combatMechanic.next=true;s.duration=0;}
  if(id==='skchr_cello_3')s.combatMechanic.aura=true;
  if(s.combatMechanic.instant||id==='skchr_agoat2_2')s.duration=0;
  s.effects=[];
  if(b.atk)s.effects.push({type:'buff_atk',power:b.atk});
  if(b.def)s.effects.push({type:'buff_def',power:b.def});
  if(b.max_hp)s.effects.push({type:'buff_maxhp',power:b.max_hp});
  if(b.attack_speed)s.effects.push({type:'buff_atkspd',power:b.attack_speed/100});
 }
 function plan(o,p,s){
  const id=s?.sourceId,b=s?.blackboard||{};
  if(o.charId==='char_616_pithst')p.preferUnbroken=true;
  if(id==='skchr_cello_1'){p.unbrokenOnly=true;p.scale=b.atk_scale;p.ep={type:'apoptosis',ratio:b.ep_damage_ratio,basis:'atk'};}
  if(id==='skchr_cello_2')p.targets=2;
  if(id==='skchr_nymph_1')p.ep={type:'apoptosis',ratio:b['attack@ep_damage_ratio'],basis:'arts',extra:b['attack@extra_ep_damage_scale']};
  if(id==='skchr_nymph_2'){p.kind='splash';p.radius=b.projectile_range;p.scale=b.atk_scale;p.primaryExtra=b.atk_scale;p.separatePrimary=true;p.ep={type:'apoptosis',ratio:b.ep_damage_ratio,basis:'arts'};}
  if(id==='skchr_nymph_3'){p.targets=b['attack@max_target'];p.elementalOnBurst='apoptosis';}
  if(id==='skchr_pithst_1')p.targets=b['attack@max_target'];
  const rule=hitSkills[id];if(rule){
   if(rule.ratio)p.ep={type:rule.type,ratio:b[rule.ratio],basis:rule.basis};
   if(rule.extra)p.epExtra={type:rule.type,scale:b[rule.extra]};
   if(rule.targets)p.targets=rule.targets;
   if(rule.scale)p.scale=b[rule.scale];
  }
  return p;
 }
 function onHit(o,e,actual,plan,type,wasBurst,burstType=null){
  if(e.dead)return;
  if(plan.ep){
   const value=plan.ep.basis==='arts'?(type==='arts'?actual:0):plan.power;
   E().add(e,plan.ep.type,value*plan.ep.ratio,o);
   if(wasBurst&&plan.ep.extra)E().deal(e,plan.power*plan.ep.extra,'elemental',o);
  }
  // Inspect the state before this hit: triggering a burst is not already being in it.
  if(plan.epExtra&&burstType===plan.epExtra.type)E().deal(e,plan.power*plan.epExtra.scale,'elemental',o);
  if(o.charId==='char_616_pithst'){
   const ratio=talent(o,'ep_damage_ratio').ep_damage_ratio||0;
   for(const k of ['nervous','burn','apoptosis'])E().add(e,k,plan.power*ratio,o);
  }
  if(o.charId==='char_4146_nymph'&&wasBurst&&E().active(e,'apoptosis')){
   const ratio=plan.skillId==='skchr_nymph_2'?o.skill.blackboard.element_atk_scale:talent(o,'element_atk_scale').element_atk_scale;
   if(ratio){e.elementDots||=[];const key=String(o.id),old=e.elementDots.find(d=>d.key===key),amount=plan.power*ratio;
    if(old)old.amount=Math.max(old.amount,amount);
    else e.elementDots.push({key,ownerId:o.id,amount,nextTick:B.time+1});
   }
  }
 }
 function onDamage(o,e,actual,type){
  if(!o||e.dead||!(actual>0))return;
  for(const caster of B.operators)if(active(caster,'skchr_cello_2')&&(caster===o||caster.skillState.elementAlly===o.id))E().add(e,'apoptosis',power(caster)*caster.skill.blackboard.ep_damage_ratio,caster);
 }
 function incoming(t,type){
  let scale=1;
  if(t.col==null&&type==='apoptosis'){
   let bonus=0;for(const o of B.operators)if(operatorPresent(o)&&o.charId==='char_245_cello'&&range(o,t)){
    const b=talent(o,'ep_damage_scale');bonus=Math.max(bonus,(b.ep_damage_scale-1||0)*(active(o,'skchr_cello_3')?o.skill.blackboard.scale_delta_to_one:1));
   }scale*=1+bonus;
  }else if(t.col!=null){
   let reduction=0;for(const o of B.operators)if(operatorPresent(o)&&o.charId==='char_1016_agoat2'&&(active(o,'skchr_agoat2_3')||operatorInRange(o,t))){const b=talent(o,'ep_damage_resistance');reduction=Math.max(reduction,(b.ep_damage_resistance||0)*(active(o,'skchr_agoat2_3')?o.skill.blackboard.talent_scale:1));}
   scale*=Math.max(0,1-reduction);
  }return scale;
 }
 function absorb(t,amount){
  if(t.col==null)return amount;
  for(const shield of B.elementShields||[])if(shield.until>B.time&&shield.amount>0&&shield.cells.some(c=>t.row===c[0]&&t.col===c[1])){const used=Math.min(amount,shield.amount);shield.amount-=used;amount-=used;if(amount<=0)break;}
  return amount;
 }
 function onBurst(e,type){
  if(type==='burn')for(const o of B.operators)if(operatorPresent(o)&&o.charId==='char_4081_warmy'&&range(o,e)){
   E().deal(e,power(o)*(talent(o,'ep_damage_scale').ep_damage_scale||0),'elemental',o);
  }
  if(type!=='apoptosis')return;
  for(const o of B.operators)if(operatorPresent(o)&&o.charId==='char_4146_nymph'&&range(o,e)){
   const b=talent(o,'max_stack_cnt');o.elementBurstStacks=Math.min(b.max_stack_cnt||0,(o.elementBurstStacks||0)+1);
  }
 }
 function attackBonus(o){
  if(o.charId==='char_499_kaitou'&&B.enemies.some(e=>!e.dead&&E().active(e,'apoptosis')&&range(o,e)))return talent(o,'atk').atk||0;
  return o.charId==='char_4146_nymph'?(o.elementBurstStacks||0)*(talent(o,'max_stack_cnt').atk||0):0;
 }
 function refreshLink(o,force=false){
  const state=o.skillState;if(!state)return;
  const pool=B.operators.filter(a=>a!==o&&operatorPresent(a)&&operatorInRange(o,a));
  const signature=pool.map(a=>a.id+':'+a.row+':'+a.col).join('|');
  if(!force&&state.elementNext>B.time&&signature===state.elementRoster)return;
  state.elementNext=B.time+.3;state.elementRoster=signature;
  const old=new Map((state.elementGrants||[]).map(g=>[g.id,g.hp]));
  const stat=(a,key)=>{
   if(key==='maxHp')return a.maxHp-(old.get(a.id)||0);
   const clean={...a,buffs:(a.buffs||[]).filter(b=>b.elementOwner!==o.id)};
   if(key==='atk')return power(clean);
   return operatorDefense(clean);
  };
  const best=key=>pool.slice().sort((a,b)=>stat(b,key)-stat(a,key)||(b.deployAt||0)-(a.deployAt||0)||String(a.id).localeCompare(String(b.id)))[0];
  if(o.skill.sourceId==='skchr_cello_2'){state.elementAlly=best('atk')?.id??null;return;}
  const b=o.skill.blackboard,hpTarget=best('maxHp'),newHp=hpTarget?stat(hpTarget,'maxHp')*b['cello_s_3[max_hp].max_hp']:0;
  const atkTarget=best('atk'),defTarget=best('def');
  // Replace only the changed HP delta; removing/readding every refresh would heal for free.
  for(const a of units()){
   const delta=(a===hpTarget?newHp:0)-(old.get(a.id)||0);a.maxHp+=delta;a.hp=delta>0?a.hp+delta:Math.min(a.hp,a.maxHp);
   a.buffs=(a.buffs||[]).filter(v=>v.elementOwner!==o.id);
  }
  state.elementGrants=hpTarget?[{id:hpTarget.id,hp:newHp}]:[];
  for(const [a,key]of [[atkTarget,'atk'],[defTarget,'def']])if(a)a.buffs.push({[key]:1+b['cello_s_3['+key+'].'+key],until:state.until,elementOwner:o.id});
 }
 function cast(o){
  const id=o.skill.sourceId,b=o.skill.blackboard;
  if(id==='skchr_cello_2'||id==='skchr_cello_3')refreshLink(o,true);
  if(id==='skchr_agoat2_2'){
   const amount=power(o);for(const a of healingAllies(o)){healOperator(o,a,amount);E().heal(a,amount*(operatorAttackProfile(o).bb?.ep_heal_ratio||.5));}
   const capacity=amount*b['agoat2_s_2[shield].atk_scale'];
   (B.elementShields||=[]).push({ownerId:o.id,cells:(o.cells||[]).map(c=>c.slice()),until:B.time+b.duration,amount:capacity,capacity});
  }
 }
 function expire(o){
  for(const a of units())a.buffs=(a.buffs||[]).filter(b=>b.elementOwner!==o.id);
  for(const g of o.skillState?.elementGrants||[]){const a=units().find(a=>a.id===g.id);if(a){a.maxHp-=g.hp;a.hp=Math.min(a.hp,a.maxHp);}}
 }
 function hpBonus(o){return (o.elementAuraHp||0)+B.operators.reduce((n,a)=>n+(a.skillState?.elementGrants||[]).filter(g=>g.id===o.id).reduce((n,g)=>n+g.hp,0),0);}
 function update(dt){
  B.elementShields=(B.elementShields||[]).filter(s=>s.until>B.time&&s.amount>0);
  for(const o of B.operators){
   if(!operatorPresent(o))continue;
   // Eyja's HP aura uses one strongest source; refresh removes its old delta first.
   let ratio=0;for(const a of B.operators)if(operatorPresent(a)&&a.charId==='char_1016_agoat2'&&(active(a,'skchr_agoat2_3')||operatorInRange(a,o)))ratio=Math.max(ratio,(talent(a,'ep_damage_resistance').max_hp||0)*(active(a,'skchr_agoat2_3')?a.skill.blackboard.talent_scale:1));
   const base=o.maxHp-hpBonus(o),delta=base*ratio-(o.elementAuraHp||0);o.elementAuraHp=base*ratio;o.maxHp+=delta;o.hp=delta>0?o.hp+delta:Math.min(o.hp,o.maxHp);
   for(const hot of o.elementHealing||[])while(hot.next<=Math.min(B.time,hot.until)+1e-7){const healer=B.operators.find(a=>a.id===hot.ownerId)||o;healOperator(healer,o,hot.hp,{regen:true,visual:false});E().heal(o,hot.ep);hot.next+=1;}
   o.elementHealing=(o.elementHealing||[]).filter(h=>h.until>B.time);
   if(!ids.has(o.charId))continue;
   if(o.elementTick==null)o.elementTick=B.time-dt+1;
   while(o.elementTick<=B.time+1e-7){
    o.elementTick+=1;
    if(o.charId==='char_245_cello'){
     const t=talent(o,'ep_damage_ratio');for(const e of B.enemies)if(!e.dead&&range(o,e)){
      E().add(e,'apoptosis',power(o)*(t.ep_damage_ratio||0),o);
      if(t.sluggish){e.slowUntil=Math.max(e.slowUntil||0,B.time+t.sluggish);e.slowFactor=.2;}
     }
    }
    if(o.charId==='char_2026_yu'){
     const t=talent(o,'yu_t_1[enemy].ep_damage_ratio');
     for(const e of B.enemies)if(!e.dead&&e.blockerId===o.id){const d=calcDamageResult(o,e,1,{raw:power(o)*t['yu_t_1[enemy].atk_scale'],type:'arts'});hitEnemy(o,e,d.amount,false,d.type);E().add(e,'burn',power(o)*t['yu_t_1[enemy].ep_damage_ratio'],o);}
     const r=talent(o,'hp_recovery_per_sec_by_max_hp_ratio');
     if(B.operators.filter(operatorPresent).length>=r.cnt)for(const a of active(o,'skchr_yu_3')?B.operators:[o])if(operatorPresent(a)){healOperator(o,a,a.maxHp*r.hp_recovery_per_sec_by_max_hp_ratio,{regen:true,visual:false});E().heal(a,a.maxHp*r.ep_heal_ratio);}
    }
    if(active(o,'skchr_agoat2_1'))for(const a of B.operators)if(operatorPresent(a)&&operatorInRange(o,a))E().heal(a,power(o)*o.skill.blackboard['agoat2_s_1[aura].ep_heal_ratio']);
   }
  }
  for(const o of B.operators)if(active(o,'skchr_cello_2')||active(o,'skchr_cello_3'))refreshLink(o);
 }
 function healed(o,t,hp,ep){
  if(o.charId!=='char_1016_agoat2')return;
  const b=talent(o,'heal_scale');if(!b.duration)return;
  t.elementHealing||=[];const ours=t.elementHealing.filter(h=>h.ownerId===o.id);
  if(ours.length>=b.max_stack_cnt)t.elementHealing.splice(t.elementHealing.indexOf(ours[0]),1);
  t.elementHealing.push({ownerId:o.id,hp:hp*b.heal_scale,ep:ep*b.heal_scale,until:B.time+b.duration,next:B.time+1});
 }
 function onAttacked(e,o){if(active(o,'skchr_yu_1')&&B.enemies.includes(e))E().add(e,'burn',power(o)*o.skill.blackboard.ep_damage_ratio,o);}
 function protection(o){return o.charId==='char_2026_yu'&&(o.blocked||0)>0?1-(talent(o,'damage_resistance').damage_resistance||0):1;}
 function death(o){delete o.elementBurstStacks;delete o.elementTick;delete o.elementHealing;}
 function handledTalent(t,id){
  const b=bb(t);
  return ids.has(id)||(id==='char_499_kaitou'&&b.atk!=null)||(id==='char_4081_warmy'&&b.ep_damage_scale!=null)
   // Valarqvin's Revelator talent is explicitly IS4-only. Do not let the old
   // classifier turn it into unconditional elemental attacks in this mode.
   ||(id==='char_4102_threye'&&b.ep_damage_ratio!=null);
 }
 root.ArkElementOperators={supported:[...skills],handledTalent,configure,plan,onHit,onDamage,incoming,absorb,onBurst,attackBonus,cast,expire,hpBonus,update,healed,onAttacked,protection,death};
})(typeof window!=='undefined'?window:globalThis);
