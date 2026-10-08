// Serializable execution clocks for closed ability graphs. Payloads remain in
// their capability consumers; accepting a graph never accepts unknown actions.
(function(root){
 'use strict';
 const EPS=1e-9;
 function validate(plan){
  const ids=new Set();let count=0;
  function visit(n,depth){
   if(!n||typeof n.id!=='string'||!n.id||Object.hasOwn(Object.prototype,n.id)||ids.has(n.id)||++count>128||depth>8)throw Error('Invalid ability graph identity');
   ids.add(n.id);
   if(n.kind==='leaf'){
    if(!Number.isFinite(n.duration)||n.duration<0||n.eventAt!==undefined&&
     (!Number.isFinite(n.eventAt)||n.eventAt<0||n.eventAt>n.duration))throw Error('Invalid ability leaf clock');
    if(Object.keys(n).some(k=>!['id','kind','duration','eventAt'].includes(k)))throw Error('Unknown ability leaf field');
   }else{
    if(!['sequence','parallel-all'].includes(n.kind)||!Array.isArray(n.children)||!n.children.length||n.children.length>16||
     Object.keys(n).some(k=>!['id','kind','children'].includes(k)))throw Error('Unsupported ability group');
    n.children.forEach(c=>visit(c,depth+1));
   }
  }
  visit(plan,0);return true;
 }
 function duration(n){return n.kind==='leaf'?n.duration:n.kind==='sequence'?
  n.children.reduce((a,c)=>a+duration(c),0):Math.max(...n.children.map(duration));}
 function enter(s,n,at,h){
  if(s.nodes[n.id])throw Error('Ability node cannot be entered twice');
  const v=s.nodes[n.id]={phase:'active',startedAt:at};
  if(n.kind==='leaf'){
   v.until=at+n.duration;v.emitted=false;
   if(n.eventAt!==undefined)v.eventAt=at+n.eventAt;
   h.enter?.(n.id,at);
  }else if(n.kind==='sequence')enter(s,n.children[0],at,h);
  else for(const c of n.children){if(s.phase!=='active')break;enter(s,c,at,h);}
 }
 function start(plan,at,h={}){
  validate(plan);if(!Number.isFinite(at))throw Error('Invalid ability start time');
  const s={version:1,plan:JSON.parse(JSON.stringify(plan)),startedAt:at,time:at,nodes:{},phase:'active'};
  enter(s,s.plan,at,h);return s;
 }
 function flatten(n,parent=null,out=[]){out.push({node:n,parent});for(const c of n.children||[])flatten(c,n,out);return out;}
 function finish(s,n,at,h,index){
  const v=s.nodes[n.id];v.phase='done';v.finishedAt=at;
  if(n.kind==='leaf')h.finish?.(n.id,at);
  if(s.phase!=='active')return;
  const parent=index.get(n.id).parent;
  if(!parent){s.phase='done';s.finishedAt=at;return;}
  if(parent.kind==='sequence'){
   const i=parent.children.findIndex(c=>c.id===n.id);
   if(i+1<parent.children.length){enter(s,parent.children[i+1],at,h);return;}
  }else if(parent.children.some(c=>s.nodes[c.id]?.phase!=='done'))return;
  finish(s,parent,at,h,index);
 }
 function advance(s,to,h={}){
  if(s?.version!==1||!Number.isFinite(to)||to<s.time-EPS)throw Error('Invalid ability cursor time');
  if(s.phase!=='active')return s;
  const list=flatten(s.plan),index=new Map(list.map(x=>[x.node.id,x]));
  // At most one emission and one completion per leaf. Children entered by a
  // completion are included on the next pass, even at the same timestamp.
  for(let guard=0;guard<=list.length*2;guard++){
   let next=null;
   for(const {node:n} of list){const v=s.nodes[n.id];if(n.kind!=='leaf'||v?.phase!=='active')continue;
    const emit=!v.emitted&&v.eventAt!==undefined&&v.eventAt<=v.until;
    const at=emit?v.eventAt:v.until;
    if(at<=to+EPS&&(!next||at<next.at-EPS))next={n,v,at,emit};
   }
   if(!next){s.time=to;return s;}
   const {n,v,at,emit}=next;s.time=at;
   if(emit){v.emitted=true;h.event?.(n.id,at);}else finish(s,n,at,h,index);
   if(s.phase!=='active'){s.time=s.finishedAt;return s;}
  }
  throw Error('Ability graph did not converge');
 }
 function shorten(s,id,until){
  const v=s?.nodes[id];if(v?.phase!=='active'||!Number.isFinite(v.until)||!Number.isFinite(until)||until<Math.max(v.startedAt,s.time)-EPS)
   throw Error('Invalid ability early finish');
  v.until=Math.min(v.until,until);
 }
 function cancel(s,at,h={}){
  if(s?.version!==1||!Number.isFinite(at)||at<s.time-EPS)throw Error('Invalid ability cancellation');
  if(s.phase!=='active')return s;
  for(const {node:n} of flatten(s.plan)){const v=s.nodes[n.id];if(v?.phase!=='active')continue;
   v.phase='cancelled';v.finishedAt=at;if(n.kind==='leaf')h.cancel?.(n.id,at);
  }
  s.phase='cancelled';s.finishedAt=at;s.time=at;return s;
 }
 root.ArkAbilityFlow={validate,duration,start,advance,shorten,cancel};
})(typeof window!=='undefined'?window:globalThis);
