// Pure opening draws shared by browser-local runs and multiplayer authority.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../simulation/enemy-replacement'));else root.ArkRunSetup=factory(root.ArkEnemyReplacement);})(typeof window!=='undefined'?window:globalThis,(replacement)=>{
  'use strict';
  function randomFrom(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
  function enemyPlan(encounters,config,seed){
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Invalid encounter seed');
    const options={random:randomFrom((seed^0x656e656d)>>>0)};
    if(config.modeId==='mode_training_1')options.selectedTypes=encounters.seasons[config.seasonId].trainingTypes;
    return replacement.generatePlan(encounters,config.seasonId,config.modeId,options);
  }
  // Fixed identities only. DIY slots require their own selection/template path.
  // Hidden identities remain addressable for explicit rewards, never random shops.
  function rosterProfiles(rules,seasonId,{includeHidden=false}={}){
    const season=rules.seasons[seasonId];if(!season)throw Error('未知赛季：'+seasonId);
    return Object.values(season.operators).filter(p=>p.charId&&!p.tmplId&&['PRESET','NORMAL'].includes(p.chessType)&&(includeHidden||!p.isHidden));
  }
  function roundChoices(data,config,seed){
    const season=data.seasons[config.seasonId],mode=season.modes[config.modeId],draw=randomFrom(seed);
    return Object.fromEntries(mode.rounds.map(round=>{
      const weights=round.alternatives.map(a=>Math.max(0,season.bosses[a.bossId]?.weight??1)),total=weights.reduce((a,b)=>a+b,0);
      let selected=0,point=draw()*(total||weights.length);
      for(let i=0;i<weights.length;i++){point-=total?weights[i]:1;if(point<0){selected=i;break;}}
      return [round.round,selected];
    }));
  }
  function setupInfo({source:data,bonds,tiers,rules,operators,encounters},config,choices,seed=0){
    const season=data.seasons[config.seasonId],mode=season.modes[config.modeId];
    // Project approximation: 1–2 core groups, each missing 2–3 operators.
    // Exact original-server draw weights remain unknown; moving execution
    // into the browser must not silently change this existing run policy.
    const profiles=new Map(rosterProfiles(rules,config.seasonId).map(p=>[p.charId,p]));
    const roster=operators.filter(o=>profiles.has(o.charId)),random=randomFrom(seed);
    const groups=['sargonShip','victoriaShip','lateranoShip','egirShip','yanShip','kjeragShip'].map(bid=>({bid,ops:roster.filter(o=>profiles.get(o.charId).bondIds.includes(bid))})).filter(g=>g.ops.length>3);
    const shuffle=list=>{for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}};
    shuffle(groups);const bannedOperators=[];
    if(config.modeId!=='mode_training_1')for(const group of groups.slice(0,1+Math.floor(random()*2))){
      shuffle(group.ops);bannedOperators.push(...group.ops.slice(0,2+Math.floor(random()*2)).map(o=>({charId:o.charId,name:o.name,bondId:group.bid})));
    }
    // An identity can belong to both drawn groups. Keep the same draws but
    // report each ban once, matching the game's identity-based exclusion.
    const seenBans=new Set(),uniqueBans=bannedOperators.filter(o=>{if(seenBans.has(o.charId))return false;seenBans.add(o.charId);return true;});
    const chosen=mode.rounds.map(round=>({round:round.round,...round.alternatives[choices[round.round]??0]}));
    return {firstLevelKey:chosen[0]?.levelKey||null,totalRounds:mode.rounds.length,bosses:chosen.filter(round=>round.bossId).map(round=>{
      const boss=season.bosses[round.bossId],enemyId=boss?.enemyId;return {round:round.round,bossId:round.bossId,enemyId,name:data.levels[round.levelKey]?.enemies?.[enemyId]?.name||enemyId||round.bossId,levelKey:round.levelKey,hidden:!!boss?.isHidingBoss};
    }),bannedOperators:uniqueBans,banStatus:'run-policy',...(encounters?{enemySeed:seed,enemyPlan:enemyPlan(encounters,config,seed)}:{})};
  }
  return Object.freeze({roundChoices,setupInfo,rosterProfiles,enemyPlan});
});
