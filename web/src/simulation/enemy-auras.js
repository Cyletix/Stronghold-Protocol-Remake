// Complete source-owned enemy Talent chain. No enemy-ID executor branches.
(function(root){
 'use strict';
 const finite=Number.isFinite,clock=()=>typeof B==='undefined'?0:B.time||0;
 const identity=unit=>unit.id??unit.visualId;
 function profile(source){return root.ArkExternalCombat?.profile(source)?.enemyAura||null;}
 function present(unit,time){return !!unit&&!unit.dead&&!unit.removed&&unit.hp>0&&
  (unit.enemyId?!unit.spawnState:unit.col!=null&&(unit.deployAt??0)<=time&&(unit.deployT||0)>=1);}
 function parameter(source,expression){
  let value=expression?.default;const key=expression?.key?.toLowerCase();
  for(const row of source.sourceTalentBlackboard||[])if(row.key?.toLowerCase()===key)value=row.value;
  if(!finite(value))throw Error('Invalid enemy Aura source parameter');return value;
 }
 function validate(p){
  if(p?.version!==1||p.range?.kind!=='circle'||!finite(p.range.radius)||p.range.radius<=0||
   p.range.extendable!==false||p.range.scalable!==false||p.selection?.side!=='opponent'||
   p.selection.motionMask!==3||p.selection.categoryMask!==1||p.selection.respectTargetFree!==true||
   p.membership?.removeOnLeave!==true||p.membership.removeOnDetach!==true||
   p.membership.independentSources!==true||p.membership.firstTick!=='one-period-after-entry'||
   !finite(p.interval)||p.interval<=0||p.damage?.kind!=='arts'||p.damage.ignoreForSp!==true||
   p.damage.skipModifierEvent!==false||p.damage.applyWay!=='none'||p.damage.attackType!=='normal'||
   p.damageEvent?.kind!=='nerve'||p.damageEvent.base!=='source-current-attack'||
   p.damageEvent.trigger!=='accepted-damage-event'||
   p.damageEvent.zeroDamagePolicy!=='no-element-after-zero-or-fully-absorbed-damage'||
   p.selfResistance?.attribute!=='one_minus_status_resistance'||p.selfResistance.formula!=='addition')
   throw Error('Invalid enemy Aura contract');
 }
 function configure(source,time=clock()){
  const p=profile(source);if(!p){delete source.enemyAuraState;return null;}validate(p);
  let state=source.enemyAuraState;
  if(!state||state.version!==1||state.enemyId!==source.enemyId||state.rule!==p.rule)
   state=source.enemyAuraState={version:1,enemyId:source.enemyId,rule:p.rule,attachedAt:time,members:{}};
  return state;
 }
 function selected(source,target,p,time){
  if(!present(target,time)||target.enemyId||target.untargetable||target.targetFree||target.invisibleUntil>time)return false;
  return Math.hypot((target.x??target.col)-(source.x??source.col),(target.y??target.row)-(source.y??source.row))<=p.range.radius+1e-9;
 }
 function stop(source){delete source.enemyAuraState;}
 function update(dt,context={}){
  if(!finite(dt)||dt<0)throw Error('Invalid enemy Aura step');
  const time=context.time??clock(),enemies=context.enemies||(typeof B==='undefined'?[]:B.enemies||[]),
   targets=context.targets||(typeof B==='undefined'?[]:[...(B.operators||[]),...(B.summoneds||[])]);
  let count=0;
  for(const source of enemies){
   const p=profile(source);
   if(!p||!present(source,time)){stop(source);continue;}
   const state=configure(source,time),members=state.members,active=new Set();
   for(const target of targets){
    if(!selected(source,target,p,time))continue;
    const key=identity(target);if(key==null)throw Error('Enemy Aura requires stable target identity');
    const id=String(key);active.add(id);
    let member=members[id];
    if(!member)member=members[id]={joinedAt:time,next:time+p.interval};
    if(!finite(member.next)||member.next<member.joinedAt)throw Error('Invalid restored enemy Aura timer');
    while(member.next<=time+1e-9){
     const at=member.next;member.next+=p.interval;
     if(!present(source,time)||!selected(source,target,p,time))break;
     const scale=parameter(source,p.damage.scale);
     if(typeof context.damage!=='function')throw Error('Enemy Aura requires damage dispatch');
     // The shared damage event consumer, not this loop, dispatches the attached
     // elemental listener. This avoids applying it twice or bypassing shields.
     context.damage(source,target,{kind:'arts',atkScale:scale,attackType:'normal',applyWay:'none',
      ignoreForSp:true,skipModifierEvent:false,source:'enemy-aura',at});count++;
    }
   }
   for(const id of Object.keys(members))if(!active.has(id))delete members[id];
  }
  return count;
 }
 function onDamage(source,target,event,context={}){
  const p=profile(source),time=context.time??clock();
  if(!p||!present(source,time)||!target||target.enemyId||!event||event.cancelled||event.skipModifierEvent||!(event.amount>0))return false;
  validate(p);
  const attack=typeof context.attackPower==='function'?context.attackPower(source):source.atk,
   ratio=parameter(source,p.damageEvent.ratio);
  if(!finite(attack)||attack<0||ratio<0)throw Error('Invalid enemy Aura element amount');
  if(typeof context.element!=='function')throw Error('Enemy Aura requires elemental dispatch');
  if(attack*ratio>0)context.element(target,attack*ratio,p.damageEvent.kind,source);
  return attack*ratio>0;
 }
 function passiveBuffs(source,time=clock()){
  const p=profile(source);if(!p||!present(source,time))return [];validate(p);
  const b=p.selfResistance,state=configure(source,time),value=parameter(source,b.value);
  const sourceId=identity(source);if(sourceId==null)throw Error('Enemy Aura requires stable source identity');
  return [{id:b.id,sourceId,sourceCharId:null,instanceKey:JSON.stringify(['enemy-aura',sourceId,b.id]),
   startedAt:state.attachedAt,until:Infinity,priority:b.stacking.priority,stacking:b.stacking,
   modifiers:[{attribute:b.attribute,formula:b.formula,value}]}];
 }
 function suppressesBuff(source,key,time=clock()){
  const p=profile(source),status=p?.statusOverrides?.[key];
  if(!status||status.disableOverride!==false||!finite(status.priority))return false;
  return passiveBuffs(source,time).some(b=>!b.stacking.disableOverride&&
   b.stacking.overrideKey===status.overrideKey&&b.priority>status.priority);
 }
 root.ArkEnemyAuras={profile,configure,update,stop,selected,passiveBuffs,onDamage,suppressesBuff};
})(typeof window==='undefined'?globalThis:window);
