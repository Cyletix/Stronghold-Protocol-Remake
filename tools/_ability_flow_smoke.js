'use strict';
const assert=require('node:assert/strict');
require('../web/src/simulation/ability-flow');
const api=globalThis.ArkAbilityFlow,copy=x=>JSON.parse(JSON.stringify(x));
const plan={id:'root',kind:'sequence',children:[
 {id:'prepare',kind:'leaf',duration:1,eventAt:.4},
 {id:'actions',kind:'parallel-all',children:[
  {id:'shot',kind:'leaf',duration:2,eventAt:.5},
  {id:'healing',kind:'sequence',children:[
   {id:'heal',kind:'leaf',duration:1,eventAt:.25},
   {id:'after-heal',kind:'leaf',duration:3,eventAt:0}]}]},
 {id:'finish',kind:'leaf',duration:0,eventAt:0}]};
function run(times,restore=false){const events=[],hooks=Object.fromEntries(['enter','event','finish','cancel'].map(k=>[k,(id,t)=>events.push([k,id,t])]));
 let s=api.start(plan,10,hooks);
 for(const t of times){api.advance(s,t,hooks);if(restore)s=copy(s);}
 return {state:s,events};
}
const coarse=run([20]),fine=run([10.2,10.4,11,11.25,11.5,12,13,14.99,15,20],true);
assert.deepEqual(fine,coarse,'frame partition and JSON restoration preserve exact event sequence');
assert.equal(api.duration(plan),5);
assert.equal(coarse.state.finishedAt,15);
assert.deepEqual(coarse.events.filter(e=>e[0]==='event'),[
 ['event','prepare',10.4],['event','heal',11.25],['event','shot',11.5],['event','after-heal',12],['event','finish',15]]);
assert.ok(coarse.events.findIndex(e=>e[0]==='finish'&&e[1]==='after-heal')<coarse.events.findIndex(e=>e[1]==='finish'));
for(const at of [10.2,10.6,11,11.3,13]){
 const events=[],hooks={event:(id,t)=>events.push([id,t]),cancel:(id,t)=>events.push(['cancel:'+id,t])};
 const s=api.start(plan,10,hooks);api.advance(s,at,hooks);api.cancel(s,at,hooks);
 const snapshot=copy(s),history=copy(events);api.advance(s,20,hooks);api.cancel(s,20,hooks);
 assert.deepEqual(s,snapshot);assert.deepEqual(events,history,'cancelled siblings cannot emit or start later children');
 assert.equal(s.nodes.finish,undefined);
}
// A shortened preparation cancels its unissued event and starts both children
// at the actual early finish, not the originally forecast deadline.
{
 const events=[],s=api.start(plan,0);api.shorten(s,'prepare',.2);api.advance(s,10,{event:(id,t)=>events.push([id,t])});
 assert.equal(s.finishedAt,4.2);assert.deepEqual(events.map(e=>e[0]),['heal','shot','after-heal','finish']);
 assert.equal(s.nodes.shot.startedAt,.2);
}
// Emission-triggered death cancels the graph before another sibling fires.
{
 let s=api.start({id:'g',kind:'parallel-all',children:[{id:'a',kind:'leaf',duration:1,eventAt:0},{id:'b',kind:'leaf',duration:1,eventAt:0}]},0);
 const events=[];api.advance(s,1,{event(id,t){events.push(id);api.cancel(s,t);}});
 assert.deepEqual(events,['a']);assert.equal(s.phase,'cancelled');
}
// Completion-triggered interruption does not enter the next child.
{
 const s=api.start(plan,0);api.advance(s,10,{finish(id,t){api.cancel(s,t);}});
 assert.equal(s.phase,'cancelled');assert.equal(s.nodes.actions,undefined);
}
for(const bad of [
 {id:'g',kind:'first-success',children:[{id:'a',kind:'leaf',duration:0}]},
 {id:'g',kind:'sequence',children:[{id:'a',kind:'leaf',duration:0},{id:'a',kind:'leaf',duration:1}]},
 {id:'a',kind:'leaf',duration:1,eventAt:2},
 {id:'a',kind:'leaf',duration:-1},
 {id:'a',kind:'leaf',duration:1,unknownAction:true},
 {id:'__proto__',kind:'leaf',duration:1}])assert.throws(()=>api.start(bad,0));
assert.throws(()=>api.advance(api.start(plan,10),9));
console.log('ABILITY FLOW OK nested sequence/parallel clocks, independent emission/completion, early finish, cancellation, frame partition, JSON restore, unknown contracts rejected');
