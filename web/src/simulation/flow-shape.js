// Flowing Shape is not a dollkeeper form or a wolf stack. Source: docs/mechanics/tactician.md.
(function(root){
 'use strict';
 const ids=['skchr_mlyss_1','skchr_mlyss_2','skchr_mlyss_3'];
 const source=o=>operatorAttackProfile(o).tactician;
 const owner=s=>root.ArkTactician.owner(s);
 const active=o=>o?.skillState&&B.time<o.skillState.until?o.skill:null;
 function configure(s){
  if(!ids.includes(s?.sourceId))return;
  const keys={skchr_mlyss_1:['mlyss_s_1[cost].cost','mlyss_s_1[cost].interval','atk','attack_speed','fake_cost'],skchr_mlyss_2:['cost','atk','damage_resistance','hp_recovery_per_sec_by_max_hp_ratio'],skchr_mlyss_3:['cost','atk','mlyss_s_3[token_melee_trigger].interval','mlyss_s_3[unmoveable].duration']}[s.sourceId];
  if(Object.keys(s.blackboard||{}).sort().join(',')!==keys.sort().join(',')||Object.values(s.blackboard).some(v=>!Number.isFinite(v)))throw Error('Invalid flow skill '+s.sourceId);
  s.flowMechanic=true;s.combatMechanic={version:2};s.effects=[];
 }
 function init(s,o){
  s.flow={kind:'base',hits:0,atk:0,def:0,sp:source(o).copySkills[0].spData.initSp+s.copyInitialSp};
  s.atkType='arts';s.basicAttack.groundOnly=false;s.basicAttack.airTarget=true;
 }
 function copying(s){return !!s?.flow&&!s.dead&&!s.temporary&&s.flow.copyUntil>B.time&&!active(owner(s));}
 function open(s){
  if(!s?.flow||s.dead||s.temporary||s.removed||active(owner(s)))return false;
  if(copying(s)){s.flow.copyUntil=0;return true;}
  const sk=source(owner(s)).copySkills[0];if(s.flow.sp<sk.spData.spCost)return false;
  s.flow.sp=0;s.flow.copyUntil=B.time+sk.duration;return true;
 }
 function copy(s,preset){
  if(!preset||s.temporary||s.tacticalDormant)return false;
  const ratio=s.copyScale;
  s.maxHp=Math.max(1,Math.round(preset.maxHp*ratio));s.hp=s.maxHp;s.atk=Math.round(preset.atk*ratio);s.def=Math.round(preset.def*ratio);s.magicRes=preset.magicRes*ratio;
  s.blockPerStack=preset.blockCnt;s.blockCnt=preset.blockCnt;s.attackTime=preset.attackTime;s.atkType=preset.atkType;
  s.attributeBase={version:root.ArkAttributes.version,atk:s.atk,def:s.def,aspd:1};
  s.rangeGrids=[...source(owner(s)).phases[0].rangeGrids,...preset.rangeGrids].filter((c,i,a)=>a.findIndex(x=>x.row===c.row&&x.col===c.col)===i);
  s.cells=rangeCellsFor(s);s.flow={kind:preset.position==='RANGED'?'ranged':'melee',hits:0,atk:0,def:0,sp:0,name:preset.name,sourceId:preset.charId};
  // The token keeps its own ground deployment identity and can attack its blockers.
  // A ranged copy uses projectiles without inheriting the donor's basic/talent executor.
  s.position=s.flow.kind==='ranged'?'RANGED':'MELEE';s.nativePosition='ALL';s.cd=0;
  return true;
 }
 function around(s){const [dr,dc]=({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]})[s.dir||'up'];return [[dr,dc],[-dr,-dc],[-dc,dr],[dc,-dr]].map(([r,c])=>[s.row+r,s.col+c]);}
 function split(s,all=false){
  if(s.temporary||s.flow.kind!=='ranged'||s.tacticalDormant)return;
  const o=owner(s),api=root.ArkTactician;
  for(const [row,col]of around(s)){
   const existing=B.summoneds.find(t=>t.tacticalKind==='flow'&&t.temporary&&!t.removed&&t.ownerId===o.id&&t.row===row&&t.col===col);
   if(existing){if(all){existing.hp=existing.maxHp;existing.expiresAt=B.time+s.copyRules.interval;}continue;}
   if(!api.legal(o,row,col,{adjacent:true}))continue;
   const child=api.create(o,row,col,true),id=child.id;
   Object.assign(child,JSON.parse(JSON.stringify(s)),{id,row,col,temporary:true,dead:false,tacticalDormant:false,removed:false,expiresAt:B.time+s.copyRules.interval,hp:s.maxHp,cd:0});
   child.flow.hits=0;child.flow.sp=0;child.cells=rangeCellsFor(child);
   if(!all)break;
  }
 }
 function buffs(s,o){const sk=active(o);s.buffs=s.buffs.filter(b=>!b.flowSkill);if(sk?.flowMechanic)s.buffs.push({flowSkill:true,atk:1+sk.blackboard.atk,aspd:1+(sk.blackboard.attack_speed||0)/100,until:o.skillState.until});}
 // PRTS measured pull endpoints. This does not reproduce Unity acceleration/contact timing.
 function pullDistance(distance,force,weight){const delta=force-weight;return delta<=-3?0:delta===-2?Math.min(distance,.03):delta===-1?distance*.35:distance;}
 function advance(s,o,dt){
  if(s.temporary&&B.time>=s.expiresAt){root.ArkTactician.remove(s);return;}
  if(s.tacticalDormant){s.flow.sp=0;s.flow.copyUntil=0;return;}
  const sk=active(o),b=sk?.blackboard||{};buffs(s,o);
  let chargeDt=dt;
  if(s.flow.copyUntil&&(sk||B.time>=s.flow.copyUntil)){chargeDt=Math.min(dt,Math.max(0,B.time-s.flow.copyUntil));s.flow.copyUntil=0;}
  if(!s.temporary&&!sk&&!copying(s)){
   const tokenSkill=source(o).copySkills[0];s.flow.sp=Math.min(tokenSkill.spData.spCost,s.flow.sp+chargeDt);
  }
  if(sk?.sourceId==='skchr_mlyss_2'&&s.flow.kind==='melee')s.hp=Math.min(s.maxHp,s.hp+s.maxHp*b.hp_recovery_per_sec_by_max_hp_ratio*dt);
  if(sk?.sourceId==='skchr_mlyss_3'&&s.flow.kind==='melee'){
   for(const e of B.enemies)if(!e.dead&&e.blockerId===s.id)e.stunUntil=Math.max(e.stunUntil||0,Math.min(o.skillState.until,B.time+.15));
   if(s.nextPullAt<=B.time){
    // Endpoint approximation from community measurements; displacement animation remains unverified.
    s.nextPullAt=B.time+b['mlyss_s_3[token_melee_trigger].interval'];
    for(const e of B.enemies)if(!e.dead&&!e.flying&&!e.shiftImmune&&!e.blockerId&&Math.abs(e.x-s.col)<1.5&&Math.abs(e.y-s.row)<1.5){
     const force=source(o).copySkills[2].blackboard.find(b=>b.key==='force').value;
     const d=Math.hypot(e.x-s.col,e.y-s.row),mass=Math.max(0,e.massLevel||0),step=pullDistance(d,force,mass);
     if(!d||!step)continue;const x=e.x+(s.col-e.x)/d*step,y=e.y+(s.row-e.y)/d*step;
     const lv=BDATA.level,can=(r,c)=>['ALL','WALK_ONLY'].includes(lv.passable?.[r]?.[c]);
     const r=Math.round(y),c=Math.round(x),oldR=Math.round(e.y),oldC=Math.round(e.x);
     if(can(r,c)&&can(oldR,c)&&can(r,oldC)){if(!root.ArkOperatorCombat.moveToContact(e,x,y)){e.x=x;e.y=y;}}
    }
    (B.combatEffects||=[]).push({kind:'flow-pull',x:s.col,y:s.row,radius:1.5,at:B.time,duration:.35});
   }
  }
 }
 function cast(o){
  const sk=o.skill;if(!sk?.flowMechanic)return;
  const b=sk.blackboard,state=o.skillState;
  if(sk.sourceId==='skchr_mlyss_1')state.commonDp={kind:'tactical-dp',startedAt:B.time,emitted:0,total:b.fake_cost,perTick:b['mlyss_s_1[cost].cost'],interval:sk.duration/(b.fake_cost/b['mlyss_s_1[cost].cost'])};
  else root.onSkillDp?.(b.cost,o);
  buffs(o,o);
  for(const s of [...B.summoneds])if(s.tacticalKind==='flow'&&s.ownerId===o.id&&!s.dead){
   s.flow.copyUntil=0;
   buffs(s,o);if(sk.sourceId==='skchr_mlyss_3')s.nextPullAt=B.time+b['mlyss_s_3[token_melee_trigger].interval'];
   if(sk.sourceId==='skchr_mlyss_3')split(s,true);
  }
 }
 function plan(s,p){
  if(s.tacticalKind!=='flow')return p;
  const sk=active(owner(s));p.hits=1;p.scale=1;p.all=false;p.targets=1;p.aftershocks=0;p.kind='single';p.groundOnly=false;p.airTarget=true;
  if(sk?.sourceId==='skchr_mlyss_2'&&s.flow.kind==='ranged')p.randomShots=2;
  return p;
 }
 function afterAttack(s,p){if(s.tacticalKind==='flow'&&!s.temporary&&s.flow.kind==='ranged'){
  s.flow.hits+=p.randomShots||1;if(s.flow.hits>=s.copyRules['mlyss_wtrman_t_2[range].max_stack_cnt']){s.flow.hits=0;split(s);}
 }}
 function afterHit(s,e,actual,wasRevived=!!e.revived){
  if(s.tacticalKind!=='flow'||actual<=0)return;
  if(s.flow.kind==='melee'){
   const b=s.copyRules;s.flow.atk=Math.min(b.steal_atk_max,s.flow.atk+b.steal_atk);s.flow.def=Math.min(b.steal_def_max,s.flow.def+b.steal_def);
   if(!!e.revived===wasRevived){const stolen=(e.flowSteals||={})[s.id]||{atk:0,def:0};stolen.atk=Math.min(b.steal_atk_max,stolen.atk+b.steal_atk);stolen.def=Math.min(b.steal_def_max,stolen.def+b.steal_def);e.flowSteals[s.id]=stolen;}
  }
  const sk=active(owner(s));if(sk?.sourceId==='skchr_mlyss_3'&&s.flow.kind==='ranged'&&!e.dead&&!!e.revived===wasRevived&&!e.rootImmune)e.flowRootUntil=Math.max(e.flowRootUntil||0,B.time+sk.blackboard['mlyss_s_3[unmoveable].duration']);
 }
 function stolen(e,key){return Math.max(0,...Object.values(e.flowSteals||{}).map(x=>x[key]||0));}
 function protection(s){const sk=s.tacticalKind==='flow'?active(owner(s)):null;return sk?.sourceId==='skchr_mlyss_2'&&s.flow.kind==='melee'?1-sk.blackboard.damage_resistance:1;}
 root.ArkFlowShape={ids,configure,init,copy,copying,open,split,advance,cast,plan,afterAttack,afterHit,stolen,protection,pullDistance};
})(typeof window!=='undefined'?window:globalThis);
