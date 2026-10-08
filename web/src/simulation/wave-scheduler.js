(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkWaves=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(waves){return {waves,wave:0,fragment:0,base:0,events:null,lastAt:0,done:false};}
  function advance(s,time,alive){
    const emitted=[];
    for(let guard=0;guard<256&&!s.done;guard++){
      if(time<s.base)break;
      const wave=s.waves[s.wave];if(!wave){s.done=true;break;}
      const fragment=(wave.fragments||[])[s.fragment];
      if(fragment){
        if(!s.events){
          const start=s.base+(s.fragment===0?(wave.preDelay||0):0)+(fragment.preDelay||0);
          s.events=[];s.lastAt=start;
          for(const action of fragment.actions||[]){
            if(action.actionType!=='SPAWN')continue;
            for(let i=0;i<(action.count??1);i++)s.events.push({enemyId:action.key,...(action.bountyCoin!=null?{bountyCoin:action.bountyCoin}:{}),route:action.routeIndex,at:start+(action.preDelay||0)+i*(action.interval||0),wave:s.wave,fragment:s.fragment,blockFragment:!!action.blockFragment,dontBlockWave:!!action.dontBlockWave});
          }
          s.events.sort((a,b)=>a.at-b.at);if(s.events.length)s.lastAt=s.events[s.events.length-1].at;
        }
        while(s.events.length&&s.events[0].at<=time)emitted.push(s.events.shift());
        if(s.events.length||time<s.lastAt)break;
        const blocking=(fragment.actions||[]).some(a=>a.blockFragment);
        if(blocking&&(alive(s.wave,s.fragment,true)||emitted.some(e=>e.wave===s.wave&&e.fragment===s.fragment&&e.blockFragment)))break;
        s.base=blocking?time:s.lastAt;s.fragment++;s.events=null;continue;
      }
      const living=alive(s.wave,null,false)||emitted.some(e=>e.wave===s.wave&&!e.dontBlockWave);
      const max=wave.maxTimeWaitingForNextWave;
      if(living&&(max==null||max<0||time<s.base+max))break;
      s.base=(living?s.base+Math.max(0,max):time)+(wave.postDelay||0);
      s.wave++;s.fragment=0;
    }
    return emitted;
  }
  function pending(s){
    if(!s||s.done)return 0;
    let count=(s.events||[]).length;
    for(let w=s.wave;w<s.waves.length;w++)for(let f=w===s.wave?s.fragment:0;f<(s.waves[w].fragments||[]).length;f++){
      if(w===s.wave&&f===s.fragment&&s.events!==null)continue;
      for(const a of s.waves[w].fragments[f].actions||[])if(a.actionType==='SPAWN')count+=a.count??1;
    }
    return count;
  }
  return {create,advance,pending};
});
