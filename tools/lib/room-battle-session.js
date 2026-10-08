'use strict';
// A room owns the clock and the stage barrier. Browsers only submit preparation
// commands; no client can submit battle state, damage, elapsed time or a result.
const {pairAlivePlayers,buildBattleInput,toWorldUnit,jointDefenseGroup}=require('../../web/src/simulation/paired-battle');
const clone=value=>JSON.parse(JSON.stringify(value));
function roundChoices(config,seed){return require('../../web/src/rules/run-setup').roundChoices(require('../../web/source_battles.json'),config,seed);}
function createBattleSession(room,{now=Date.now,release=()=>{},isPaused=()=>false}={}){
  let phase='preparing',frame=0,lastTime=now(),until=0,groups=[],normalPairing=null,error=null,eventId=0,pausedAt=null,hasStarted=false;
  const events=[],retained=new Set();
  const participants=()=>[...room.players.values()].filter(p=>p.runtime);
  const singleRun=()=>!!room.gameConfig&&!room.gameConfig.modeId.startsWith('mode_multi_');
  const eligible=()=>[...room.players.values()].filter(p=>!p.forfeited);
  const active=()=>participants().filter(p=>{const s=p.runtime.status();return !p.forfeited&&s.phase!=='over'&&s.life>0;});
  const changed=p=>{p.gameRevision=(p.gameRevision||0)+1;room.revision++;};
  function event(type,fields){events.push({id:++eventId,type,at:now(),...fields});if(events.length>64)events.shift();room.revision++;}
  function releaseRetained(){for(const p of retained)release(p);retained.clear();}
  function matchingGroup(playerId){return groups.find(g=>g.seats.some(s=>s.playerId===playerId)||g.originalSeats?.some(s=>s.playerId===playerId));}
  function allReady(){const alive=active();return !isPaused()&&eligible().every(p=>p.runtime)&&alive.length>0&&alive.every(p=>p.connected&&p.gameReady);}
  function composite(group,inputs){
    const layout={...inputs[0].layout,kind:group.kind};
    const units=buildBattleInput(group,inputs,layout).units;
    const traps=group.seats.flatMap(seat=>{const p=inputs.find(x=>x.id===seat.playerId);return (p.traps||[]).map(t=>toWorldUnit({...t,id:t.id??t.uid,dir:t.dir||'up'},seat,layout));});
    return {units,traps};
  }
  function prepareShared(group,members,{leakedEnemies}={}){
    const inputs=members.map(p=>p.runtime.battleInput(p.id));
    const primary=members.find(p=>p.id===group.seats[0].playerId),merged=composite(group,inputs);
    primary.runtime.useSharedBattle({kind:group.kind,...merged,owners:inputs,...(leakedEnemies?{leakedEnemies,seatCount:group.seats.length}:{})});
    return {...clone(group),driver:primary,done:false,reported:new Set(),originalSeats:clone(group.originalSeats||group.seats)};
  }
  function start(){
    if(phase!=='preparing'||!allReady())return false;
    const alive=active(),before=alive.map(p=>[p,p.runtime.snapshot()]);
    try{
      for(const p of alive)p.runtime.startBattle();
      const first=alive[0].runtime.status(),roster=alive.map(p=>({id:p.id,life:p.runtime.status().life}));
      normalPairing=pairAlivePlayers(roster,{seed:room.pairSeed,round:first.round,kind:'joint-defense'});
      if(first.sourceBossId&&!singleRun()){
        const pairing=pairAlivePlayers(roster,{seed:room.pairSeed,round:first.round,kind:'boss'});
        groups=pairing.groups.map(group=>prepareShared(group,alive.filter(p=>group.seats.some(s=>s.playerId===p.id))));
      }else groups=alive.map(p=>({id:'normal:'+first.round+':'+p.id,kind:first.sourceBossId?'boss':'normal',shared:false,seats:[{playerId:p.id,side:'left'}],driver:p,done:false,reported:new Set()}));
      phase='battle';hasStarted=true;lastTime=now();for(const p of alive){p.gameReady=false;changed(p);}frame++;
      event('battle-start',{round:first.round,kind:first.sourceBossId?'boss':'normal'});return true;
    }catch(e){for(const [p,s]of before)p.runtime.restore(s);groups=[];throw e;}
  }
  function settleGroup(g){
    if(g.settled||g.kind==='normal'||g.shared===false)return;
    const s=g.driver.runtime.status();
    for(const seat of g.seats){const p=room.players.get(seat.playerId);if(p?.runtime&&!p.forfeited){p.runtime.finishShared({kind:g.kind,win:s.win,shield:s.shield,lifeLoss:s.lifeLoss||0,stats:s.stats,realTime:s.realTime,ownerSession:s.ownerSessions?.find(x=>x.id===p.id)?.session});changed(p);}}
    g.settled=true;
  }
  function jointDefense(){
    if(singleRun())return false;
    if(!groups.length||groups.some(g=>g.kind!=='normal'))return false;
    const next=[];
    for(const pair of normalPairing.groups){
      const members=pair.seats.map(s=>room.players.get(s.playerId)).filter(p=>p?.runtime&&!p.forfeited);
      if(!members.length)continue;
      // Departed players do not manufacture new enemy waves or defenders.
      const present={...pair,seats:pair.seats.filter(s=>members.some(p=>p.id===s.playerId))};
      if(!present.seats.some(s=>s.side==='left'))present.seats[0].side='left';
      const statuses=members.map(p=>({id:p.id,...p.runtime.status()}));
      const leakedEnemies=statuses.flatMap(s=>s.leakedEnemies||[]);
      if(!leakedEnemies.length)continue;
      const eligible=jointDefenseGroup(present,statuses.map(s=>({id:s.id,life:s.life,leakCount:s.leaks})));
      if(!eligible)continue;
      eligible.originalSeats=clone(pair.seats);
      next.push(prepareShared(eligible,members.filter(p=>eligible.seats.some(s=>s.playerId===p.id)),{leakedEnemies}));
    }
    if(!next.length)return false;
    groups=next;for(const p of participants())changed(p);event('joint-defense',{round:groups[0].driver.runtime.status().round});return true;
  }
  function completeRound(){
    const people=participants(),team=people.map(p=>({id:p.id,life:p.forfeited?0:p.runtime.status().life,activeBonds:p.runtime.status().activeBonds||{}}));
    // Capture the whole barrier so a failing transition cannot award some
    // players twice while leaving the others on the preceding round.
    const before=people.map(p=>[p,p.runtime.snapshot()]);
    try{for(const p of people){if(!p.forfeited&&p.runtime.status().phase!=='over')p.runtime.nextRound({players:team,roundChoices:room.roundChoices});p.gameReady=false;}}
    catch(e){for(const [p,s]of before)p.runtime.restore(s);throw e;}
    groups=[];releaseRetained();phase=active().length?'preparing':'over';
    for(const p of people)changed(p);event(phase==='over'?'game-over':'round-ready',{round:active()[0]?.runtime.status().round});
  }
  function tick(){
    const t=now();
    if(isPaused()){
      if(pausedAt===null){pausedAt=t;event('connection-wait',{});}lastTime=t;return;
    }
    if(pausedAt!==null){if(phase==='intermission')until+=Math.max(0,t-pausedAt);pausedAt=null;lastTime=t;event('connection-resumed',{});return;}
    const dt=Math.max(0,Math.min(0.25,(t-lastTime)/1000));
    // Bound work per event-loop turn, retaining elapsed debt after a slow
    // catalog request or host scheduling gap instead of deleting real time.
    lastTime=Math.min(t,lastTime+dt*1000);
    if(error||!participants().length){lastTime=t;return;}
    try{
      if(phase==='preparing'){
        // Do not consume anyone's preparation time while teammates are still
        // selecting their opening strategy.
        if(eligible().every(p=>p.runtime)){
          for(const p of active()){
            p.runtime.advance(dt);const s=p.runtime.status();
            if(!p.gameReady&&p.connected&&s.prepareRemaining===0&&!s.choicePending&&!s.mergeReward){p.gameReady=true;changed(p);}
          }
          start();
        }else lastTime=t;
      }else if(phase==='battle'){
        for(const g of groups){
          if(g.done)continue;
          const s=g.driver.runtime.advance(dt);g.done=!!s.done;
          if(g.kind==='boss')for(const milestone of s.milestones||[]){
            const percent=typeof milestone==='number'?milestone:milestone.percent;
            if(![25,50,75].includes(percent)||g.reported.has(percent))continue;g.reported.add(percent);
            event('boss-damage',{battleId:g.id,playerId:g.seats[0].playerId,playerIds:g.seats.map(s=>s.playerId),playerName:g.seats.map(s=>room.players.get(s.playerId)?.name||'已离开玩家').join('、'),percent,round:s.round});
          }
          if(g.done)settleGroup(g);
        }
        if(groups.every(g=>g.done)&&!jointDefense()){
          if(groups.every(g=>g.kind==='boss'&&g.driver.runtime.status().win))completeRound();
          else {phase='intermission';until=t+3000;for(const p of participants())changed(p);}
        }
      }else if(phase==='intermission'&&t>=until)completeRound();
      frame++;
    }catch(e){error={code:e.code||'BATTLE_RUNTIME_ERROR',message:e.message};phase='error';room.revision++;}
  }
  function view(p){
    if(p.finalState)return clone(p.finalState);
    const {auth,checkpoint,...state}=p.runtime.snapshot(),g=matchingGroup(p.id);
    if(g){
      if(g.kind!=='normal'){const shared=g.driver.runtime.snapshot();state.battle=shared.battle;state.battleLevel=shared.battleLevel;}
      state.battleView={battleId:g.id,kind:g.kind,side:g.seats.find(s=>s.playerId===p.id)?.side||'overview',playerId:p.id};
    }
    // A forfeited shared-world driver may finish this automatic Boss fight for
    // its teammate. Its own view is nevertheless read-only and eliminated.
    if(p.forfeited){state.session.phase='over';state.session.life=0;state.ui.decisionPending=false;}
    return state;
  }
  return {
    tacticalCommand(p,payload){
      const group=matchingGroup(p.id);
      if(phase!=='battle'||!group||group.done||p.forfeited||isPaused())return {ok:false,error:{code:'WRONG_PHASE',message:'当前不能操作召唤物'}};
      const result=group.driver.runtime.command('game/tactical',payload,p.id);
      if(result.ok){frame++;for(const seat of group.seats){const member=room.players.get(seat.playerId);if(member&&member!==p)changed(member);}}
      return result;
    },
    tick,start,view,get phase(){return phase;},get frame(){return frame;},get hasStarted(){return hasStarted;},allReady,
    summary(){return {phase,hasStarted,frame,events:clone(events),error:error?.message||null,battles:groups.map(g=>{const s=g.driver.runtime.status();return {id:g.id,kind:g.kind,seats:clone(g.seats),done:!!g.done,damagePercent:s.leader?.damagePercent??0};})};},
    playerSummary(p){const s=p.runtime?.status()||p.finalStatus,g=matchingGroup(p.id);return {playerId:p.id,entered:!!(p.runtime||p.finalState),ready:!!p.gameReady,connected:p.connected,revision:p.gameRevision||0,level:s?.level,life:p.forfeited?0:s?.life,round:s?.round,phase:p.forfeited?'over':s?.phase,forfeited:!!p.forfeited,readOnly:!!p.forfeited||!!p.finalState,forfeitReason:p.forfeitReason||null,eliminated:!!p.forfeited||s?.phase==='over'||s?.life<=0,battleId:g?.id,side:g?.seats.find(s=>s.playerId===p.id)?.side};},
    upgrade(p,oldLevel){const level=p.runtime.status().level;if(level>oldLevel)event('base-upgrade',{playerId:p.id,playerName:p.name,level,round:p.runtime.status().round});},
    forfeit(p){
      p.gameReady=false;changed(p);for(const g of groups)if(g.kind==='normal'&&g.driver===p)g.done=true;
      event('player-forfeited',{playerId:p.id,playerName:p.name,reason:p.forfeitReason});
      if(!eligible().length||(eligible().every(x=>x.runtime)&&!active().length)){phase='over';groups=[];releaseRetained();event('game-over',{reason:'no-active-players'});}
    },
    remove(p){if(groups.some(g=>g.driver===p)){retained.add(p);return true;}return false;},
    dispose(){groups=[];releaseRetained();}
  };
}
module.exports={createBattleSession,roundChoices};
