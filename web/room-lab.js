'use strict';
// Four-seat alliance lobby. Portraits are cosmetic; gameplay begins after host launch.
const PROTOCOL_VERSION=1,CLIENT_VERSION='room-lab-20260911.1',STORAGE_KEY='ark-room-lab-session-v1';
const el=id=>document.getElementById(id);
let session=null,room=null,sequence=0,online=false,busy=false,timer=null,generation=0,serviceReady=false,lobbyVersion=0;
let onlineShareCode='',launcherUrl='',portraits=[],gameCatalog=null,settingsRenderKey='',settingsValid=false;
const entryMode=new URL(location.href).searchParams.get('mode')==='solo'?'solo':'team';
const launcherKey=document.querySelector?.('meta[name="launcher-key"]')?.content;
const localLauncher=/^[a-f0-9]{48}$/.test(launcherKey||'');
let setupPlayMode=new URL(location.href).searchParams.get('view')==='team'?'team':'solo';
let connectState={phase:'idle'},connectBusy=false,connectTimer=null,connectRequested=false,connectEpoch=0;
function localTeam(){return entryMode==='solo'&&setupPlayMode==='team';}
function multiplayerSetup(){return localTeam()||(room?.players.length||1)>1;}
try{
  const value=entryMode==='solo'?null:JSON.parse(sessionStorage.getItem(STORAGE_KEY)),s=value?.session;
  if(s&&/^[A-Z2-9]{6}$/.test(s.roomCode)&&typeof s.playerId==='string'&&typeof s.token==='string'&&s.token.length>=32){
    session=s;sequence=Number.isSafeInteger(value.sequence)&&value.sequence>=0?value.sequence:0;
    launcherUrl=value.launcherUrl||'';
  }
}catch{}
try{
  const currentUrl=new URL(location.href),payload=new URLSearchParams(currentUrl.hash.slice(1)).get('launch');
  if(payload){
    const boot=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/'))),s=boot.session;
    if(s&&/^[A-Z2-9]{6}$/.test(s.roomCode)&&typeof s.playerId==='string'&&typeof s.token==='string'&&s.token.length>=32&&s.token.length<=128){session=s;sequence=0;launcherUrl=boot.launcherUrl||'';persist();}
    currentUrl.hash='';if(typeof history!=='undefined')history.replaceState(null,'',currentUrl.href);
  }
}catch{}
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(launcherUrl))launcherUrl='';
if(launcherUrl&&el('launcher-back'))el('launcher-back').href=launcherUrl+'/?return=1';
if(launcherUrl&&el('edit-profile'))el('edit-profile').href=launcherUrl+'/index.html?profile=1';
function filterPortraits(){
  const input=el('portrait-search'),select=el('portrait');if(!select)return;
  const previous=select.value||'char_102_texas',query=(input?.value||'').trim().toLowerCase();
  select.replaceChildren();
  for(const p of portraits.filter(p=>!query||p.name.toLowerCase().includes(query)||p.id.includes(query))){const option=part('option','',p.name);option.value=p.id;select.append(option);}
  if(portraits.some(p=>p.id===previous&&(!query||p.name.toLowerCase().includes(query)||p.id.includes(query))))select.value=previous;
}
if(el('portrait-search'))el('portrait-search').oninput=filterPortraits;
function persist(){try{
  if(!session){sessionStorage.removeItem(STORAGE_KEY);return;}
  const previous=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
  const saved=previous?.session?.playerId===session.playerId?previous:{};
  sessionStorage.setItem(STORAGE_KEY,JSON.stringify({...saved,session,sequence,launcherUrl}));
}catch{}}
function status(message){el('status').textContent=message;}
function goToGame(){
  if(!session)return;
  if(room?.localLaunch){
    const value=room.localLaunch;generation++;clearTimeout(timer);session=null;persist();
    if(launcherUrl){const target=new URL('/index.html',launcherUrl);target.hash=new URLSearchParams({solo:JSON.stringify(value)}).toString();location.href=target.href;}
    else window.ArkSolo.launch(value.config,value.profile,value.seed);
    return;
  }
  const target=new URL('index.html',location.href);target.searchParams.set('room',session.roomCode);location.href=target.href;
}
async function invite(){
  if(!session)return;
  try{await navigator.clipboard.writeText(el('share').value);status(onlineShareCode?'分享码已复制，朋友在联机首页粘贴即可加入。':'邀请链接已复制，发给同一服务上的朋友即可加入。');}
  catch{el('invite-details').open=true;el('share').focus?.();el('share').select();status('请复制下方已选中的邀请链接，发给朋友。');}
}
function part(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function renderConnectControls(){
  if(!el('local-mode-controls'))return;
  const local=entryMode==='solo',team=localTeam(),connecting=connectState.phase==='connecting',active=connectState.phase==='ready';
  el('local-mode-controls').hidden=!local;
  el('room').classList?.toggle('local-team',team);
  for(const kind of ['solo','team']){el(kind+'-choice').setAttribute?.('aria-pressed',String(setupPlayMode===kind));el(kind+'-choice').disabled=!serviceReady||busy||connectBusy||connecting||active;}
  el('connect-create').hidden=!team||active||connecting;
  el('connect-create').disabled=connectBusy||!serviceReady||!settingsValid;
  el('connect-join-row').hidden=!team||active||connecting;
  el('connect-join').disabled=connectBusy||!serviceReady;
  el('connect-code').disabled=connectBusy||connecting;
  el('connect-return').hidden=!local||!active;
  el('connect-return').disabled=connectBusy;
  el('connect-stop').hidden=!local||(!connecting&&!active);
  el('connect-stop').textContent=active?'结束当前同盟':'取消连接';el('connect-stop').disabled=connectBusy;
  el('connect-status').hidden=!local||connectState.phase==='idle'||!connectState.message;el('connect-status').textContent=connectState.message||'';
  if(local){
    el('enter-game').hidden=team;el('enter-game').disabled=busy||connectBusy||!serviceReady||!settingsValid||active||connecting;
    el('enter-game').textContent='开始本局';el('leave').hidden=true;
    el('room-stage').textContent=team?'同盟准备':'独立模拟';el('room-count').textContent='1 / 4';
    el('latency').textContent=team?'本机待命':'本机单人';
    el('lobby-limit').textContent=team?'创建同盟后邀请朋友，或粘贴分享码加入。':'单人由本机运行';
    if(team)el('readiness').textContent=active?'当前同盟可继续':connecting?'正在连接同盟…':'已就位，等待组建同盟';
    el('settings-note').textContent=team?'加入朋友时使用房主配置。':'开始后查看本局情报，再选择策略。';
    el('settings-summary').hidden=settingsValid;
  }
}
async function launcherRequest(route,method='GET',body){
  const response=await fetch(route,{method,headers:{'x-launcher-key':launcherKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw Error(value.message||'连接失败');return value;
}
async function pollConnect(){
  clearTimeout(connectTimer);
  const epoch=connectEpoch;
  try{const value=await launcherRequest('/api/status');if(epoch!==connectEpoch)return;connectState=value;render();
    if(connectRequested&&connectState.phase==='ready'&&connectState.url){connectRequested=false;location.href=connectState.url;return;}
  }catch(error){if(epoch!==connectEpoch)return;connectState={phase:'error',message:'本机启动程序不可用，请重新打开游戏。'};connectRequested=false;render();}
  if(connectState.phase==='connecting'||connectState.phase==='ready')connectTimer=setTimeout(pollConnect,1000);
}
async function choosePlayMode(kind){
  if(entryMode!=='solo'||!serviceReady||busy||connectBusy||['connecting','ready'].includes(connectState.phase))return;
  setupPlayMode=kind;settingsRenderKey='';await changeSettings('mode');render();
  if(kind==='team'&&localLauncher){
    connectBusy=true;render();
    try{connectState=await launcherRequest('/api/resume','POST');}
    catch(error){connectState={phase:'error',message:error.message};}
    finally{connectBusy=false;render();}
    if(['connecting','ready'].includes(connectState.phase))void pollConnect();
  }
}
async function connectAlliance(action){
  if(!localTeam()||connectBusy||!serviceReady)return;
  if(!localLauncher){location.href='room-lab.html?mode=team&setup='+encodeURIComponent(JSON.stringify(room.settings));return;}
  connectBusy=true;connectRequested=false;connectEpoch++;render();
  try{connectState=await launcherRequest('/api/session','POST',{action,...window.ArkSolo.profile(),...(action==='join'?{shareCode:el('connect-code').value}:{gameConfig:room.settings})});connectRequested=true;}
  catch(error){connectState={phase:'error',message:error.message};}
  finally{connectBusy=false;render();}
  if(connectRequested)void pollConnect();
}
if(el('solo-choice'))el('solo-choice').onclick=()=>choosePlayMode('solo');
if(el('team-choice'))el('team-choice').onclick=()=>choosePlayMode('team');
if(el('connect-create'))el('connect-create').onclick=()=>connectAlliance('create');
if(el('connect-join'))el('connect-join').onclick=()=>connectAlliance('join');
if(el('connect-return'))el('connect-return').onclick=()=>{if(connectState.url)location.href=connectState.url;};
if(el('connect-stop'))el('connect-stop').onclick=async()=>{
  if(connectBusy)return;connectBusy=true;connectRequested=false;connectEpoch++;clearTimeout(connectTimer);render();
  try{connectState=await launcherRequest('/api/session','DELETE');}catch(error){connectState={phase:'error',message:error.message};}
  finally{connectBusy=false;render();}
};
function modeKind(mode){return mode.kind||(mode.modeId==='mode_training_1'?'training':mode.modeId.includes('_single_')?'single':'multi');}
function roomModeId(modeId){return multiplayerSetup()?modeId.replace('mode_single_','mode_multi_'):modeId.replace('mode_multi_','mode_single_');}
function fillOptions(id,items,value){const select=el(id);if(!select)return;select.replaceChildren();for(const item of items){const option=part('option','',item.name);option.value=item.id;select.append(option);}select.value=value;}
function renderSettings(){
  if(!el('room-settings'))return;
  el('room-settings').hidden=!session;
  const started=room?.lobbyPhase!=='waiting',host=room?.hostId===session?.playerId,settings=started?room?.config:room?.settings;
  const canEdit=host&&!started&&online&&!busy&&!connectBusy&&!['connecting','ready'].includes(connectState.phase)&&!!gameCatalog&&!!settings;
  for(const id of ['room-season','room-difficulty','room-map'])el(id).disabled=!canEdit;
  el('settings-note').textContent=started?'本局配置已确定，返回本局查看情报、选择策略或继续作战。':host?(room?.players.length===1?'开始前可以调整本局配置。':'选择赛季、难度和地图；修改后成员需重新准备。'):'由房主选择赛季、难度和地图。';
  settingsValid=false;
  if(!gameCatalog||!settings){el('settings-summary').textContent='正在读取本局配置…';return;}
  const seasons=gameCatalog.seasons||[],season=seasons.find(s=>s.seasonId===settings.seasonId),modeId=started?settings.modeId:roomModeId(settings.modeId);
  const modes=(season?.modes||[]).filter(m=>started?m.modeId===modeId:multiplayerSetup()?modeKind(m)==='multi':modeKind(m)!=='multi');
  const mode=(season?.modes||[]).find(m=>m.modeId===modeId)||(season?.modes||[]).find(m=>m.modeId===settings.modeId);
  if(mode&&!modes.some(m=>m.modeId===mode.modeId))modes.push(mode);
  const key=JSON.stringify([settings,modeId,room?.players.length,started,gameCatalog.catalog]);
  if(settingsRenderKey!==key){
    settingsRenderKey=key;
    fillOptions('room-season',seasons.map(s=>({id:s.seasonId,name:s.name||(s.seasonId==='act1autochess'?'盟约':s.seasonId==='act2autochess'?'盟约Ⅱ':s.seasonId)})),settings.seasonId);
    fillOptions('room-difficulty',modes.map(m=>({id:m.modeId,name:m.name})),mode?.modeId);
    fillOptions('room-map',(mode?.maps||[]).map(m=>({id:m.mapKey,name:m.name})),settings.mapKey);
  }
  // Keep selected values authoritative even if an attempted edit never reached
  // the host. Reusing the option tree must not keep an unacknowledged selection.
  el('room-season').value=settings.seasonId;el('room-difficulty').value=mode?.modeId||'';el('room-map').value=settings.mapKey;
  const map=mode?.maps.find(m=>m.mapKey===settings.mapKey);
  const wrongMode=!mode||mode.modeId!==modeId||(multiplayerSetup()&&modeKind(mode)!=='multi');
  settingsValid=!!map&&!wrongMode;
  window.ArkDiySelection?.summary(el('room-diy-summary'),settings.seasonId,started||busy||settings.modeId==='mode_training_1');
  el('settings-summary').textContent=wrongMode?'所选难度不支持当前人数，请房主选择同盟难度。':!map?'当前人数下无法使用原地图，请房主重新选择。':(room?.players.length||1)===1?'单人开局 · 开局情报 → 选择策略。':'同盟开局 · '+room.players.length+' 名成员，开局情报 → 各自选择策略。';
}
function changeSettings(field){
  if(!room?.settings||!gameCatalog||room.hostId!==session?.playerId||room.lobbyPhase!=='waiting')return;
  const seasonId=field==='season'?el('room-season').value:room.settings.seasonId;
  const season=gameCatalog.seasons.find(s=>s.seasonId===seasonId),kind=multiplayerSetup()?'multi':'single';
  const candidates=(season?.modes||[]).filter(m=>modeKind(m)===kind||(kind==='single'&&modeKind(m)==='training'));
  const desired=field==='difficulty'?el('room-difficulty').value:roomModeId(room.settings.modeId);
  const mode=candidates.find(m=>m.modeId===desired)||candidates.find(m=>m.modeId.endsWith('_hard'))||candidates[0];
  if(!mode)return;
  const desiredMap=field==='map'?el('room-map').value:room.settings.mapKey;
  const map=mode.maps.find(m=>m.mapKey===desiredMap)||mode.maps[0];if(!map)return;
  const config={seasonId,modeId:mode.modeId,mapKey:map.mapKey};
  return runAction(()=>command({type:'room/set-config',config}));
}
for(const [id,field] of [['room-season','season'],['room-difficulty','difficulty'],['room-map','map']])if(el(id))el(id).onchange=()=>changeSettings(field);
function render(){
  el('entry').hidden=!!session||!!launcherUrl;el('room').hidden=!session||!room;
  if(!session){
    el('create').textContent=entryMode==='solo'?'创建单人房间':'创建同盟';el('join').hidden=entryMode==='solo';
    el('room-code').hidden=entryMode==='solo';
    const label=el('room-code').previousElementSibling;if(label?.tagName==='LABEL')label.hidden=entryMode==='solo';
    if(el('lobby-title'))el('lobby-title').textContent=entryMode==='solo'?'卫戍协议 · 单人房间':'卫戍协议 · 同盟房间';
  }
  el('create').disabled=el('join').disabled=busy||!serviceReady;
  el('ready').disabled=busy||!online||!room||room.lobbyPhase!=='waiting';el('leave').disabled=busy;el('reconnect').disabled=busy;
  el('enter-game').disabled=busy||!online||!room;
  renderSettings();
  if(!session||!room){
    if(el('scope-note'))el('scope-note').hidden=!!session;
    if(el('room-help'))el('room-help').hidden=!!session;
    return;
  }
  el('code').textContent=onlineShareCode||session.roomCode;
  el('code').classList?.toggle('share-code',!!onlineShareCode);
  const share=new URL('room-lab.html',location.href);share.searchParams.set('room',session.roomCode);el('share').value=onlineShareCode||share.href;
  if(el('invite-label'))el('invite-label').textContent=onlineShareCode?'分享码':'同盟密钥';
  if(el('share-label'))el('share-label').textContent=onlineShareCode?'朋友在联机首页输入此分享码':'朋友打开这个地址加入';
  if(el('share-help'))el('share-help').textContent=onlineShareCode?'所有人使用同一个包。分享码同时完成连接和入席，不需要另外填写房间码。':'同网朋友需打开房主局域网地址。';
  el('invite-copy').textContent=onlineShareCode?'复制分享码':'复制邀请';
  const self=room?.players.find(p=>p.id===session.playerId),started=room?.lobbyPhase==='started',finished=room?.lobbyPhase==='finished',legacy=!room?.lobbyPhase,host=room?.hostId===session.playerId,alone=room?.players.length===1,solo=room?.playMode==='solo';
  if(el('lobby-title'))el('lobby-title').textContent='卫戍协议';
  el('room').classList?.toggle('solo-room',solo);
  el('players').classList?.toggle('solo',solo);
  el('players').setAttribute?.('aria-label','四个玩家席位');
  const inviteBar=el('code').parentElement;if(inviteBar)inviteBar.hidden=solo;
  el('invite-details').hidden=solo;
  if(el('scope-note'))el('scope-note').hidden=solo;if(el('room-help'))el('room-help').hidden=solo;
  el('leave').textContent=solo?'退出房间':'退出同盟';
  if(el('cancel-start')){el('cancel-start').hidden=!host||!room?.canReturnToLobby||finished;el('cancel-start').disabled=busy||!online;el('cancel-start').textContent=room?.canCancelStart?'取消启动，返回大厅':'中止本局，返回大厅';}
  if(el('edit-profile'))el('edit-profile').hidden=true;
  el('ready').textContent=self?.ready?'取消准备':'准备就绪';el('ready').hidden=started||finished||legacy||alone;
  el('enter-game').textContent=finished?(host?'返回大厅再开一局':'等待房主返回大厅'):legacy?'返回原有对局':started?'返回本局':host?(alone?'开始协议':'协议启动'):'等待房主启动';
  el('enter-game').disabled=busy||!online||!room||(finished?!host:(!started&&!legacy&&(!host||(!alone&&!room.allReady)||!settingsValid)));
  el('room-count').textContent=(room?.players.length||0)+' / '+(room?.capacity||4);
  el('room-stage').textContent=finished?'本局已结束':started?'协议已启动':legacy?'旧服务房间':solo?'单人准备':'同盟集结';
  el('invite-copy').disabled=started||finished||busy||!online;
  el('lobby-limit').textContent=finished?'返回大厅后保留配置和成员，可以再开一局。':legacy?'请更新并重新启动游戏程序。':started?'成员已锁定，返回本局继续。':alone?(solo?'确认本局配置，即可开始。':'可以邀请朋友，也可以直接按单人规则开始。'):'全部成员准备后，由房主启动。';
  el('players').replaceChildren();
  for(let i=0;i<4;i++){
    const p=room?.players.find((p,index)=>(p.slot??index)===i),node=part('article','player'+(!p?' empty':!p.connected?' offline':p.ready?' ready':''));
    node.append(part('div','seat-number','0'+(i+1)));
    if(!p){const locked=started||finished,button=part('button','invite-seat',locked?'—':'＋');button.disabled=solo||locked||!online;button.onclick=invite;button.setAttribute?.('aria-label',solo?'空席'+(i+1):locked?'席位'+(i+1)+'暂无成员':'邀请好友到席位'+(i+1));node.append(button,part('strong','empty-title',solo?(localTeam()?'待邀请':'空席'):locked?'暂无成员':'邀请好友'),part('p','empty-note',solo?(localTeam()?'创建同盟后邀请好友':'单人模式'):finished?'先返回大厅再邀请':started?'协议进行中':onlineShareCode?'复制分享码':'复制同盟邀请链接'));}
    else{
      const art=part('img','player-art');
      const portrait=/^char_[a-zA-Z0-9_]+$/.test(p.portrait||'')?p.portrait:'char_102_texas';art.src='portraits/'+portrait+'.png';art.alt=portraits.find(x=>x.id===portrait)?.name||'';node.append(art);
      art.onerror=()=>{art.onerror=null;art.src='portraits/char_102_texas.png';};
      if(p.id===(room.hostId||room.players[0]?.id))node.append(part('span','host-badge',room.creatorId===p.id?'创建者':'房主'));
      if(host&&!started&&!finished&&p.id!==session.playerId){const kick=part('button','kick','移出');kick.setAttribute?.('aria-label','移出成员 '+p.name);kick.disabled=busy||!online;kick.onclick=()=>runAction(()=>command({type:'room/kick',playerId:p.id}));node.append(kick);}
      const loading=room?.startup?.waitingPlayers?.find(x=>x.id===p.id)?.stage==='loading';
      node.append(part('div','player-state',p.forfeited?'本局已弃权':!p.connected?'○ 暂时离线':finished?'本局已结束':started?(loading?'正在加载战场资源':p.entered?'✓ 已进入运营':'◇ 开局准备中'):alone?'✓ 已就位':p.ready?'☑ 已就绪':'□ 未就绪'));
      const avatar=part('img','player-avatar');avatar.src='avatars/'+portrait+'.png';avatar.alt='';avatar.onerror=()=>{avatar.onerror=null;avatar.src='avatars/char_102_texas.png';};
      const nameplate=part('div','nameplate');nameplate.append(avatar,part('strong','player-name',p.name||'博士'),part('small','player-role',p.id===session.playerId?'我的席位':'同盟成员'));node.append(nameplate);
    }
    el('players').append(node);
  }
  const wait=room?.connection;
  el('readiness').textContent=wait?.paused?'等待 '+wait.waitingPlayers.map(p=>p.name).join('、')+' 恢复连接 · 剩余 '+Math.ceil(wait.remainingMs/1000)+' 秒':finished?'本局已结束，可以返回大厅再开':legacy?'现有对局可继续':started?'协议已启动':alone?'已就位，可以开始':room?.allReady?'全员已就绪，等待房主启动':'等待成员准备（'+(room?.players.filter(p=>p.ready&&p.connected).length||0)+'/'+room.players.length+'）';
  renderConnectControls();
}
async function request(url,payload){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),url==='/api/game-info'?30000:10000),start=performance.now();
  try{
    const response=await fetch(url,{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...payload}):undefined,signal:controller.signal,cache:'no-store'});
    let value;try{value=await response.json();}catch{throw Error('这个地址没有运行房间服务，请使用下方说明中的 8001 地址。');}
    if(!response.ok)throw Object.assign(new Error(value.message||'请求失败'),{code:value.error});
    el('latency').textContent='最近一次往返 '+Math.round(performance.now()-start)+' 毫秒';return value;
  }finally{clearTimeout(timeout);}
}
function apply(value){
  sequence=Math.max(sequence,value.ack||0);persist();
  const wasWaiting=room?.lobbyPhase==='waiting';
  if(value.room&&(!room||value.room.revision>=room.revision))room=value.room;
  online=true;status('已连接 · 房间状态会自动同步');render();
  if(wasWaiting&&room?.lobbyPhase==='started')goToGame();
}
function failed(error){
  online=false;
  if(error.code==='ROOM_NOT_FOUND'||error.code==='INVALID_SESSION'){
    session=null;room=null;sequence=0;generation++;persist();status(error.message+(launcherUrl?' 点击左上角返回联机首页，重新创建或加入。':''));
  }else status((error.name==='AbortError'?'连接超时。':error.message)+(session?' 将自动重试。':''));
  render();
}
async function sync(){
  if(entryMode==='solo'||!session)return;const current=generation,credentials=session;
  try{const value=await request('/api/rooms/'+credentials.roomCode+'/sync',credentials);if(current===generation)apply(value);}
  catch(error){if(current===generation)failed(error);}
}
function poll(){clearTimeout(timer);if(entryMode==='solo')return;timer=setTimeout(async()=>{if(!busy)await sync();poll();},2000);}
async function runAction(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){failed(error);}finally{busy=false;render();}}
function action(id,fn){el(id).onclick=()=>runAction(fn);}
async function command(command){
  if(!session||!online)return;
  if(entryMode==='solo'){
    if(command.type==='room/set-config'){room.settings=command.config;window.ArkSolo.save({config:room.settings,profile:window.ArkSolo.profile()});render();}
    return;
  }
  apply(await request('/api/rooms/'+session.roomCode+'/command',{...session,sequence:sequence+1,command}));
}
action('create',async()=>{
  const value=await request('/api/rooms',{name:el('name').value.trim(),portrait:el('portrait').value||undefined,playMode:entryMode,...(new URL(location.href).searchParams.has('setup')?{settings:JSON.parse(new URL(location.href).searchParams.get('setup'))}:{})});generation++;session=value.session;sequence=0;room=null;apply(value);
});
action('join',async()=>{
  const code=el('room-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('请填写六位房间码。');
  const value=await request('/api/rooms/'+code+'/join',{name:el('name').value.trim(),portrait:el('portrait').value||undefined});generation++;session=value.session;sequence=0;room=null;apply(value);
});
action('ready',async()=>{
  if(!session||!online)return;
  const ready=!room.players.find(p=>p.id===session.playerId)?.ready;
  await command({type:'room/set-ready',ready});
});
action('leave',async()=>{
  if(entryMode==='solo'){location.href='index.html';return;}
  if(!session)return;let confirmed=false;
  try{await request('/api/rooms/'+session.roomCode+'/leave',session);confirmed=true;}
  catch(error){confirmed=error.code==='ROOM_NOT_FOUND'||error.code==='INVALID_SESSION';}
  generation++;session=null;room=null;sequence=0;online=false;persist();
  status(confirmed?'已退出房间，席位已释放。':'已在本机退出；服务器未确认，原席位将按离线规则释放。');
  if(launcherUrl)location.href=launcherUrl+'/?return=1';
});
action('reconnect',sync);
action('cancel-start',async()=>{
  if(!room?.canReturnToLobby||room.hostId!==session?.playerId)return;
  const message=room.canCancelStart?'取消本次启动并回到大厅？所有成员将重新准备，分享码保持不变。':'中止本局并回到大厅？本局进度将结束，所有成员将重新准备。';
  if(typeof window.confirm==='function'&&!window.confirm(message))return;
  await command({type:'room/return-lobby'});
});
action('enter-game',async()=>{
  if(!session||!online)return;
  if(entryMode==='solo'){if(settingsValid&&!localTeam()&&!connectBusy&&!['connecting','ready'].includes(connectState.phase))window.ArkSolo.launch(room.settings,window.ArkSolo.profile());return;}
  if(room?.lobbyPhase==='waiting'){
    if(!settingsValid)return;
    const alone=room.players.length===1;
    if(alone&&!room.players[0].ready)await command({type:'room/set-ready',ready:true});
    await command({type:alone?'room/start-local':'room/start'});
  }else if(room?.lobbyPhase==='finished')await command({type:'room/return-lobby'});else goToGame();
});
el('invite-copy').onclick=invite;
el('share').onclick=()=>el('share').select();
el('room-code').value=new URL(location.href).searchParams.get('room')||'';
window.addEventListener('online',()=>{if(!busy)sync();});
window.addEventListener('pagehide',()=>{clearTimeout(timer);clearTimeout(connectTimer);connectRequested=false;connectEpoch++;});
window.addEventListener('pageshow',event=>{poll();if(event.persisted&&localLauncher&&localTeam())void pollConnect();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)sync();});
(async()=>{
  if(entryMode==='solo'){
    session={playerId:'local'};const profile=window.ArkSolo.profile();
    room={playMode:'solo',settings:null,hostId:'local',creatorId:'local',lobbyPhase:'waiting',capacity:1,players:[{id:'local',slot:0,...profile,connected:true,ready:true}],allReady:true};
    render();el('latency').textContent='本机单人';status('正在读取本局配置…');
    try{
      gameCatalog=await window.ArkSolo.catalog(true);
      if(localLauncher){const data=await launcherRequest('/api/profile'),profile={name:data.profile.name||'博士',portrait:data.profile.portrait};window.ArkSolo.rememberProfile(profile);portraits=data.portraits||[];Object.assign(room.players[0],profile);}
      const saved=window.ArkSolo.read()?.config,mode=gameCatalog.source.seasons[saved?.seasonId]?.modes[saved?.modeId];
      room.settings=mode&&/^mode_(single_|training_1$)/.test(saved.modeId)&&mode.stageChoices.some(s=>s.levelKey===saved.mapKey)?saved:window.ArkSolo.defaults(gameCatalog);
      online=serviceReady=true;if(localTeam()){await changeSettings('mode');if(localLauncher){connectState=await launcherRequest('/api/resume','POST');if(['connecting','ready'].includes(connectState.phase))void pollConnect();}}render();status('');
    }catch(error){status('本地关卡数据读取失败，请重新打开游戏。'+error.message);}
    return;
  }
  render();
  try{
    const info=await request('/api/room-info');
    gameCatalog=await request('/api/game-info');
    try{const data=await request('/api/portraits');portraits=(data.portraits||[]).filter(p=>typeof p.name==='string'&&/^char_[a-zA-Z0-9_]+$/.test(p.id));filterPortraits();}catch{}
    onlineShareCode=typeof info.onlineShareCode==='string'&&/^WS1-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{2}$/.test(info.onlineShareCode)?info.onlineShareCode:'';
    if(info.protocolVersion!==PROTOCOL_VERSION||info.clientVersion!==CLIENT_VERSION)throw Error('实验页面版本不一致，请刷新。');
    lobbyVersion=info.lobbyVersion||0;serviceReady=true;
    if(session){status('正在恢复房间…');await sync();}
    else status(lobbyVersion?'同盟大厅已连接，可创建或加入。':'此服务是旧版；新大厅的准备与统一启动需重启房间服务，已有对局可继续。');
  }catch(error){failed(error);}
  render();poll();
})();
