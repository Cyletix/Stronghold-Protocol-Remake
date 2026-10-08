(function registerHiddenBoss(global) {
  'use strict';
  // Inferred / community: PRTS explicitly labels these user-supplied trigger
  // conditions as unverified. They are not extracted client/server thresholds.
  // Caller must separately require victory over the regular round-14 leader.
  const rules = Object.freeze({
    act1autochess:Object.freeze({ solo:300, team:1000, source:'https://prts.wiki/w/卫戍协议：盟约' }),
    act2autochess:Object.freeze({ solo:350, team:1200, source:'https://prts.wiki/w/卫戍协议：盟约_下半' }),
  });
  const note='PRTS 社区供稿门槛，尚无客户端或服务端直接验证；统计当前已激活层数，不能跨轮累计。';
  function eligibility({ seasonId, modeId, players } = {}) {
    const rule=Object.prototype.hasOwnProperty.call(rules,seasonId)?rules[seasonId]:null, mode=/^mode_(single|multi)_(normal|hard|abyss)$/.exec(modeId || '');
    const scope=mode?(mode[1]==='multi'?'team':'solo'):null;
    const result={eligible:false,layers:0,life:0,threshold:rule&&scope?rule[scope]:null,scope,playerCount:0,
      evidence:'Inferred',sourceType:'community',source:rule?.source || null,note,reasonCode:'',reason:''};
    const reject=(reasonCode,reason)=>Object.assign(result,{reasonCode,reason});
    if(!rule)return reject('unsupported-season','没有该赛季的隐藏关卡门槛依据。');
    if(!mode||(seasonId==='act1autochess'&&mode[2]==='abyss'))return reject('unsupported-mode','仅该赛季的险境及更高难度适用。');
    if(!Array.isArray(players)||!players.length||(scope==='solo'&&players.length!==1))return reject('invalid-players','需要当前实际参与玩家的数据；独立模式只能有一名玩家。');
    const ids=new Set();
    for(const player of players){
      if(!player||typeof player.id!=='string'||!player.id.trim()||ids.has(player.id)
        ||!Number.isFinite(player.life)||player.life<0||!player.activeBonds||typeof player.activeBonds!=='object'||Array.isArray(player.activeBonds))
        return reject('invalid-players','参与玩家 ID 必须唯一，生命与当前已激活盟约层数必须有效。');
      const layers=Object.values(player.activeBonds);
      if(layers.some(value=>!Number.isFinite(value)||value<0))return reject('invalid-players','已激活盟约层数必须为非负有限数值。');
      ids.add(player.id);result.playerCount++;result.life+=player.life;result.layers+=layers.reduce((sum,value)=>sum+value,0);
    }
    if(!(result.layers>result.threshold))return reject('insufficient-layers','当前已激活盟约'+(scope==='team'?'全队总层数':'总层数')+'须大于 '+result.threshold+'。');
    if(!(result.life>1))return reject('insufficient-life',(scope==='team'?'全队剩余生命总和':'剩余生命')+'须大于 1。');
    result.eligible=true;return reject('eligible','达到本赛季社区记录的隐藏门槛；还须击败第 14 回合最终攻势首领。');
  }
  const api=Object.freeze({eligibility,rules});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.ArkHiddenBoss=api;
})(typeof window!=='undefined'?window:globalThis);
