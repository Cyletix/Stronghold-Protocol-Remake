(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkSim=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  let initial=1,state=1;
  function seed(value){initial=state=value>>>0;return snapshot();}
  function random(){state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  function snapshot(){return {seed:initial,state};}
  function valid(s){return s&&Number.isInteger(s.seed)&&s.seed>=0&&s.seed<=0xffffffff&&Number.isInteger(s.state)&&s.state>=0&&s.state<=0xffffffff;}
  function restore(s){if(!valid(s))throw new Error('随机状态损坏');initial=s.seed;state=s.state;}
  const STEP=1/30,MAX_STEPS=8;
  function clock(){return {accumulator:0,ticks:0,dropped:0};}
  function advance(c,elapsed,speed,paused,step){
    if(paused){c.accumulator=0;return 0;}
    const scaled=Math.max(0,Number.isFinite(elapsed)?elapsed:0)*speed;
    const accepted=Math.min(scaled,STEP*MAX_STEPS);c.dropped+=scaled-accepted;c.accumulator+=accepted;
    let n=0;while(c.accumulator+1e-10>=STEP&&n<MAX_STEPS){c.accumulator-=STEP;c.ticks++;n++;step(STEP);}
    c.accumulator=Math.max(0,c.accumulator);return n;
  }
  return {seed,random,snapshot,restore,valid,clock,advance,STEP,MAX_STEPS};
});
