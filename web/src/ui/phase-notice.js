(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkPhaseNotice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A room-wide phase, never the currently watched player's older round.
  function describe(game){
    const round=Math.max(0,...(game?.players||[]).map(p=>Number(p.round)||0));
    if(!round)return null;
    if(game.phase==='preparing')return {kind:'prepare',round,title:'准备阶段',sub:'回合 '+String(round).padStart(2,'0')+' · 整备阵容'};
    if(game.phase==='intermission')return {kind:'end',round,title:'作战结束',sub:'回合 '+String(round).padStart(2,'0')+' · 即将进入下一轮'};
    if(game.phase!=='battle')return null;
    const joint=game.battles?.some(b=>b.kind==='joint-defense'),boss=game.battles?.some(b=>b.kind==='boss');
    return {kind:joint?'joint':boss?'boss':'battle',round,title:joint?'联防阶段':boss?'领袖作战':'作战开始',sub:'回合 '+String(round).padStart(2,'0')+' · '+(joint?'协同防守漏网敌人':boss?'共同迎战领袖':'守住防线')};
  }
  function create(){
    let previous=null;
    return {reset(){previous=null;},next(game,runId){
      const notice=describe(game),key=notice?runId+':'+notice.round+':'+notice.kind:runId+':'+game?.phase;
      if(previous===key)return null;
      const first=previous===null;previous=key;
      // Refreshing an ongoing battle is not its start. Initial preparation is
      // the actual first entry after strategy confirmation and has an intro.
      return first&&notice?.kind!=='prepare'?null:notice;
    }};
  }
  return {create,describe};
});
