'use strict';
// Local setup descriptors carry configuration only. No room credentials,
// presence timers, authoritative snapshots or network commands are involved.
(()=>{
  const KEY='ark-solo-setup-v1',PROFILE='ark-local-profile-v1';
  const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}};
  function profile(){try{return JSON.parse(localStorage.getItem(PROFILE))||{name:localStorage.getItem('ark-online-name')||'博士',portrait:'char_102_texas'};}catch{return {name:'博士',portrait:'char_102_texas'};}}
  function rememberProfile(value){try{localStorage.setItem(PROFILE,JSON.stringify(value));}catch{}}
  function save(value){sessionStorage.setItem(KEY,JSON.stringify(value));return value;}
  function launch(config,player,seed){
    const value={config,diySelections:window.ArkDiyRoster?.read(localStorage,config.seasonId)||{},profile:player||profile(),seed:seed??crypto.getRandomValues(new Uint32Array(1))[0]};
    save(value);const url=new URL('index.html',location.href);url.searchParams.set('solo','1');location.href=url.href;
  }
  function receive(){
    const url=new URL(location.href),payload=new URLSearchParams(url.hash.slice(1)).get('solo');if(!payload)return false;
    const value=JSON.parse(payload);
    if(!value?.config||!Number.isInteger(value.seed))throw Error('单人配置无效，请返回房间重新开始。');
    if(value.diySelections===undefined)value.diySelections=window.ArkDiyRoster?.read(localStorage,value.config.seasonId)||{};
    save(value);rememberProfile(value.profile||profile());
    url.hash='';url.searchParams.set('solo','1');history.replaceState(null,'',url.href);
    // The one-seat team lobby is already locked to a local launch. Once back
    // on the launcher's static origin, release its now-unused EasyTier/room.
    const key=document.querySelector('meta[name="launcher-key"]')?.content;
    if(/^[a-f0-9]{48}$/.test(key||''))void fetch('/api/session',{method:'DELETE',headers:{'x-launcher-key':key}}).catch(()=>{});
    return true;
  }
  async function catalog(includeMulti=false){
    const [source,battle]=await Promise.all(['source_battles.json','battle_levels.json'].map(async url=>(await fetch(url)).json()));
    return {source,seasons:Object.entries(source.seasons).map(([seasonId,s])=>({seasonId,modes:Object.entries(s.modes).filter(([id])=>(includeMulti?/^mode_(single_|multi_|training_1)/:/^mode_(single_|training_1)/).test(id)).map(([modeId,m])=>({modeId,kind:modeId==='mode_training_1'?'training':modeId.startsWith('mode_multi_')?'multi':'single',name:s.modeConfigs[modeId]?.name||modeId,maps:m.stageChoices.map(c=>({mapKey:c.levelKey,stageId:c.stageId,name:battle.levels.find(l=>l.id===c.stageId)?.name||c.stageId}))}))}))};
  }
  function defaults(data){const seasonId='act2autochess',modeId='mode_single_hard',map=data.source.seasons[seasonId].modes[modeId].stageChoices.find(s=>s.stageId.startsWith(seasonId+'_'));return {seasonId,modeId,mapKey:map.levelKey};}
  window.ArkSolo=Object.freeze({read,save,profile,rememberProfile,launch,receive,catalog,defaults});
})();
