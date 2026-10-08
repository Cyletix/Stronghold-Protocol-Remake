'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const {createLauncher}=require('./room-launcher'),{PROTOCOL_VERSION,CLIENT_VERSION}=require('./room_server');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});const fixture=fs.mkdtempSync(path.join(runtime,'room-home-smoke-'));
 const profileRoot=path.join(fixture,'profile');fs.mkdirSync(profileRoot);let launcher,connectCalls=0;
 try{
  launcher=await createLauncher({root,profileRoot,connect:async()=>{connectCalls++;throw Error('controlled team connector');}});
  const page=await fetch(launcher.url),html=await page.text();for(const name of ['罗德岛 · 作战终端','作战','干员','编队','卫戍协议','设置','继续休整存档'])assert.ok(html.includes(name),name);assert.ok(html.includes('id="menu"'));assert.ok(!html.includes('home-view'));assert.ok(html.includes(launcher.key),'original home receives the local profile bridge key');
  assert.ok(page.headers.get('Content-Security-Policy').includes('unsafe-inline'),'the original game menu retains its working inline handlers');
  const screen=await fetch(launcher.url+'/index.html?screen=roster');assert.equal(screen.status,200);assert.ok(screen.headers.get('Content-Security-Policy').includes("'unsafe-inline'"),'existing game screen click handlers remain available');
  assert.equal(await screen.text(),html,'root and explicit index are the exact same home document');
  const panel=await fetch(launcher.url+'/room-lab.html?mode=solo'),panelHtml=await panel.text();assert.ok(panelHtml.includes('单人模式')&&panelHtml.includes('多人模式'));assert.ok(!panelHtml.includes('home-view')&&!panelHtml.includes('open-roster')&&!panelHtml.includes('欢迎回来'));assert.ok(!panel.headers.get('Content-Security-Policy').includes('unsafe-inline'),'the covenant subpage retains strict script policy');
  assert.equal((await fetch(launcher.url+'/mode.js')).status,200);assert.equal((await fetch(launcher.url+'/styles/base.css')).status,200);
  for(const route of ['/tools/room-launcher.js','/user-config.json','/%2e%2e%2ftools/room-launcher.js'])assert.equal((await fetch(launcher.url+route)).status,404,route);
  assert.equal((await fetch(launcher.url+'/api/status')).status,403);
  async function api(route,method='GET',body){const response=await fetch(launcher.url+route,{method,headers:{'x-launcher-key':launcher.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,value:await response.json()};}
  assert.equal((await api('/api/session','POST',{action:'solo',name:'单人博士',portrait:'char_102_texas'})).status,202);
  let state;for(let n=0;n<80;n++){state=(await api('/api/status')).value;if(state.phase==='ready')break;if(state.phase==='error')throw Error(state.message);await pause(20);}
  assert.equal(state.phase,'ready');assert.equal(state.role,'solo');assert.equal(state.shareCode,null);assert.equal(connectCalls,0,'solo never enters EasyTier/public multiplayer connector');
  assert.equal(state.url,launcher.url+'/room-lab.html?mode=solo','solo API opens local configuration on the existing static origin');
  assert.equal(new URL(state.url).hash,'','no room credentials are created');
  assert.equal((await fetch(state.url)).status,200);
  assert.equal((await api('/api/rooms','POST',{name:'no room'})).status,404,'launcher has no room API');
  assert.equal((await api('/api/resume','POST')).value.phase,'ready');assert.equal(connectCalls,0);
  assert.equal((await api('/api/session','DELETE')).value.phase,'idle');assert.equal((await fetch(launcher.url)).status,200);
  await api('/api/session','POST',{action:'create',name:'多人博士',portrait:'char_102_texas'});for(let n=0;n<20&&(await api('/api/status')).value.phase==='connecting';n++)await pause(10);assert.equal(connectCalls,1,'only explicit multiplayer creation enters the connector');
  // The original lobby renders both the local first seat and real network rooms.
  const source=fs.readFileSync(path.join(root,'web/room-lab.js'),'utf8');
  async function front(existing,view='',profileName='测试博士'){
   const elements=new Map(),timers=new Map(),events=new Map(),storage=new Map();let sequence=0,serverState=existing||{phase:'idle'},requests=[];
   function node(){return {value:'',hidden:false,disabled:false,textContent:'',children:[],classList:{toggle(){}},setAttribute(){},append(...rows){this.children.push(...rows);},replaceChildren(){this.children=[];},addEventListener(){},focus(){}};}
   const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
   const initialUrl='http://127.0.0.1:8100/room-lab.html?mode=solo'+(view?'&view='+view:''),context={URL,URLSearchParams,console,performance,AbortController,location:{href:initialUrl},navigator:{clipboard:{writeText:async()=>{}}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:el,querySelector:()=>({content:'a'.repeat(48)}),createElement:node,addEventListener(){}},setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),addEventListener:(type,fn)=>events.set(type,fn),fetch:async(endpoint,options={})=>{
    let data;requests.push({endpoint,options});
    if(!endpoint.startsWith('/api/'))data=JSON.parse(fs.readFileSync(path.join(root,'web',endpoint),'utf8'));
    else if(endpoint==='/api/profile')data={profile:{name:profileName,portrait:'char_1012_skadi2'},portraits:[{id:'char_1012_skadi2',name:'浊心斯卡蒂'}]};
    else if(endpoint==='/api/session'&&options.method==='POST'){const body=JSON.parse(options.body);serverState={phase:'ready',role:body.action==='create'?'host':'join',url:'http://127.0.0.1:9000/room-lab.html#launch=test',shareCode:'WS1-TEST'};data={phase:'connecting',message:'正在准备'};}
    else if(endpoint==='/api/session'&&options.method==='DELETE')data=serverState={phase:'idle'};
    else data=serverState;return {ok:true,json:async()=>data};
   }};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'web/solo-session.js'),'utf8'),context);context.ArkSolo={...context.ArkSolo,launch:(config,profile)=>{context.launched={config,profile};context.location.href='http://127.0.0.1:8100/index.html?solo=1';}};vm.runInContext(source,context);
   for(let n=0;n<80&&!vm.runInContext('serviceReady',context);n++)await pause(1);
   assert.equal(vm.runInContext('serviceReady',context),true,el('status').textContent);
   return {el,requests,context,initialUrl,events,poll:()=>vm.runInContext('pollConnect()',context)};
  }
  const fresh=await front();assert.equal(fresh.el('entry').hidden,true);assert.equal(fresh.el('room').hidden,false);assert.equal(fresh.el('players').children.length,4);
  const self=fresh.el('players').children[0],nameplate=self.children.find(n=>n.className==='nameplate');
  assert.equal(self.children.find(n=>n.className==='player-art').src,'portraits/char_1012_skadi2.png');
  assert.equal(nameplate.children.find(n=>n.className==='player-avatar').src,'avatars/char_1012_skadi2.png');assert.equal(nameplate.children.find(n=>n.className==='player-name').textContent,'测试博士');
  assert.equal(fresh.el('edit-profile').hidden,true);assert.equal(fresh.el('room-difficulty').value,'mode_single_hard');assert.equal(fresh.el('room-map').value,'activities/act2autochess/level_act2autochess_m01');
  assert.deepEqual(fresh.requests.filter(r=>r.endpoint.startsWith('/api/')).map(r=>r.endpoint),['/api/profile'],'local setup reads its name card only; no room/connector heartbeat');
  await fresh.el('team-choice').onclick();assert.equal(fresh.el('connect-create').hidden,false);assert.equal(fresh.el('room-difficulty').value,'mode_multi_hard');assert.equal(fresh.context.location.href,fresh.initialUrl,'mode selection stays in the same lobby');
  await fresh.el('solo-choice').onclick();fresh.el('room-difficulty').value='mode_single_normal';await fresh.el('room-difficulty').onchange();
  await fresh.el('enter-game').onclick();assert.equal(fresh.context.location.href,'http://127.0.0.1:8100/index.html?solo=1');assert.equal(fresh.context.launched.profile.name,'测试博士');assert.equal(fresh.context.launched.config.modeId,'mode_single_normal');
  assert.equal(fresh.requests.some(r=>r.endpoint==='/api/session'),false,'solo begins without a server session');
  const team=await front(null,'team');team.el('room-difficulty').value='mode_multi_normal';await team.el('room-difficulty').onchange();
  await team.el('connect-create').onclick();const request=team.requests.find(r=>r.endpoint==='/api/session');assert.equal(JSON.parse(request.options.body).gameConfig.modeId,'mode_multi_normal');assert.equal(JSON.parse(request.options.body).portrait,'char_1012_skadi2');
  const joined=await front(null,'team');joined.el('connect-code').value='WS1-TEST';await joined.el('connect-join').onclick();assert.equal(JSON.parse(joined.requests.find(r=>r.endpoint==='/api/session').options.body).shareCode,'WS1-TEST');
  const recipient=await front(null,'team','');await recipient.el('connect-create').onclick();assert.equal(JSON.parse(recipient.requests.find(r=>r.endpoint==='/api/session').options.body).name,'博士','a fresh package may create its first room without editing a name');
  const restored=await front({phase:'ready',role:'host',url:'http://127.0.0.1:9000/room-lab.html#launch=existing',shareCode:'WS1-TEST'});
  await restored.el('team-choice').onclick();assert.equal(restored.context.location.href,restored.initialUrl);assert.equal(restored.el('connect-return').hidden,false);
  await restored.poll();assert.equal(restored.context.location.href,restored.initialUrl,'polling never reenters an old room by itself');
  await restored.el('connect-return').onclick();assert.match(restored.context.location.href,/launch=existing/);
  restored.context.location.href=restored.initialUrl;restored.events.get('pagehide')();const before=restored.requests.length;restored.events.get('pageshow')({persisted:true});await pause(1);assert.ok(restored.requests.length>before);assert.equal(restored.context.location.href,restored.initialUrl,'browser Back stays in setup');
  await restored.el('connect-stop').onclick();await restored.el('solo-choice').onclick();assert.equal(restored.el('enter-game').disabled,false,'ending an old room restores local start');
  let redirected;const legacy={URL,location:{href:'http://127.0.0.1:8100/room-start.html?view=team',replace:url=>{redirected=url;}}};vm.runInNewContext(fs.readFileSync(path.join(root,'web/room-start.js'),'utf8'),legacy);assert.equal(redirected,'http://127.0.0.1:8100/room-lab.html?mode=solo&view=team','legacy URLs replace history with the unified lobby');
  // Exercise the real index menu functions and package bridge in one document.
  // Only rendering/engine infrastructure is stubbed; navigation, profile IO,
  // feature entry/exit and the source menu code execute unchanged.
  async function home(existing=null,withLauncher=true){
   const elements=new Map(),timers=new Map(),events=new Map(),writes=[];let timerId=0;
   let saved={version:1,name:'主页名片',portrait:'char_102_texas'},session=existing||{phase:'idle'};
   function node(){const classes=new Set();return {style:{},dataset:{},value:'',hidden:false,textContent:'',innerHTML:'',listeners:new Map(),classList:{add(...names){names.forEach(x=>classes.add(x));},remove(...names){names.forEach(x=>classes.delete(x));},contains:name=>classes.has(name),toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}},addEventListener(type,fn){this.listeners.set(type,fn);},setAttribute(){},replaceChildren(){},append(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},pause(){},play:async()=>{},muted:true,volume:.5};}
   const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);},storage=new Map();
   const context={console,URL,URLSearchParams,AbortController,location:{href:'http://127.0.0.1:8100/index.html#menu'},document:{getElementById:el,createElement:node,querySelector:selector=>selector==='meta[name="launcher-key"]'?({content:withLauncher?'a'.repeat(48):'__LAUNCHER_KEY__'}):null,querySelectorAll:()=>[],body:el('body')},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener:(type,fn)=>events.set(type,fn),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),gameSfxPreference:{muted:true,volume:0},G:null,B:null,CUR:0,ACCOUNT:{ops:{a:{}}},ROSTER:{},ROSTER_LIST:[],BATTLE:{operators:[],enemies:{}},ArkDiySelection:{open(season,options){context.formationRequest={season,options};}},LIFE0:20,ENEMY_HP0:100,UPGRADE_COST_INIT:4,cam:{f:0},playableLevels:()=>[{name:'测试地图',level:{}}],setLevel(){},replaceGameSession(value){context.G=value;},refreshBoard(){},renderAll(){},flash(){},syncHalfLabel(){},closeSettlement(){},hideBondDetail(){},fetch:async(route,options={})=>{
    let data;if(route==='/api/profile'&&options.method==='POST'){saved={version:1,...JSON.parse(options.body)};writes.push(saved);data={profile:saved};}
    else if(route==='/api/profile')data={profile:saved};else data=session;return {ok:true,json:async()=>data};
   }};context.window=context;vm.createContext(context);
   for(const sourceFile of ['web/mode/strategy.js','web/mode/roster.js','web/home-session.js'])vm.runInContext(fs.readFileSync(path.join(root,sourceFile),'utf8'),context,{filename:sourceFile});
   for(let n=0;n<30&&withLauncher&&!timers.size;n++)await pause(1);
   return {el,context,events,writes,run:code=>vm.runInContext(code,context),setSession:value=>{session=value;},saved:()=>saved};
  }
  const menu=await home({phase:'ready',role:'solo',url:'http://127.0.0.1:9000/room-lab.html#launch=saved'}),menuUrl=menu.context.location.href;
  menu.run('showMenu()');assert.equal(menu.el('menu').style.display,'flex');assert.equal(menu.el('player-name').value,'主页名片');assert.equal(menu.el('home-continue').hidden,false);assert.equal(menu.context.location.href,menuUrl,'restoring the active room does not leave the original home');
  menu.run('openRoster()');assert.equal(menu.el('roster-modal').style.display,'flex');menu.run('closeRoster()');assert.equal(menu.el('roster-modal').style.display,'none');
  menu.run('showFormation()');assert.equal(menu.context.formationRequest.season,'act2autochess');assert.equal(menu.context.formationRequest.options.chooseSeason,true,'home opens the shared formation editor with season selection');menu.run('showMenu()');assert.equal(menu.el('menu').style.display,'flex');
  menu.run('showGameSettings()');assert.equal(menu.el('game-settings').hidden,false);menu.run('setGameBgmVolume(.25)');assert.equal(menu.el('bgm').volume,.25);assert.equal(menu.el('bgm').muted,true,'menu navigation does not unmute BGM');menu.run('showMenu()');assert.equal(menu.el('game-settings').hidden,true);
  menu.run('enterNormalMode()');assert.equal(menu.context.G.bandName,'普通模式');assert.equal(menu.el('main').style.display,'flex');menu.run('confirmExit()');assert.equal(menu.el('exit-confirm').style.display,'flex');menu.run('cancelExit()');assert.equal(menu.el('exit-confirm').style.display,'none');menu.run('confirmBackToMenu()');assert.equal(menu.context.G,null);assert.equal(menu.el('menu').style.display,'flex');assert.equal(menu.context.location.href,menuUrl,'all four feature closes retain the same original menu document');
  menu.el('player-name').value='修改后的博士';await menu.context.RoomHome.open('mode');assert.equal(menu.context.location.href,'room-lab.html?mode=solo');assert.equal(menu.saved().name,'修改后的博士','nickname is saved before leaving for covenant');assert.equal(menu.saved().portrait,'char_102_texas');
  const resumed=await home({phase:'ready',role:'solo',url:'http://127.0.0.1:9000/room-lab.html#launch=saved'});await resumed.el('home-continue').onclick();assert.match(resumed.context.location.href,/launch=saved/,'explicit menu continue opens the existing room');
  const releasedHome=await home({phase:'ready',role:'solo',url:'http://127.0.0.1:9000/room-lab.html#launch=old'});releasedHome.setSession({phase:'idle'});await releasedHome.el('home-continue').onclick();assert.equal(releasedHome.el('home-continue').hidden,true);assert.equal(releasedHome.context.location.href,menuUrl,'released rooms remain on the original home');
  menu.context.location.href=menuUrl;await menu.el('home-profile').onclick();assert.equal(menu.context.location.href,menuUrl);assert.equal(menu.el('home-profile-dialog').open,true);menu.el('home-profile-close').onclick();assert.equal(menu.el('home-profile-dialog').open,false);
  const naked=await home(null,false);assert.equal(naked.context.RoomHome,undefined);naked.run('showMenu();enterMode()');assert.equal(naked.context.location.href,'room-lab.html?mode=solo','plain static mode uses the shared settings page');
  const cached=await home();cached.events.get('pagehide')();cached.saved().name='浏览器返回后的名片';cached.events.get('pageshow')({persisted:true});await pause(1);assert.equal(cached.el('player-name').value,'浏览器返回后的名片');assert.equal(cached.context.location.href,menuUrl,'browser Back restores the original menu and refreshes package-backed profile without navigation');
  // The normal Windows entry must reach the home without touching EasyTier.
  const fakeRoot=path.join(fixture,'启动器'),tools=path.join(fakeRoot,'tools');fs.mkdirSync(path.join(tools,'lib'),{recursive:true});fs.copyFileSync(path.join(root,'tools/start-room.ps1'),path.join(tools,'start-room.ps1'));
  fs.copyFileSync(path.join(root,'tools/lib/game-process.psm1'),path.join(tools,'lib/game-process.psm1'));
  const psQuote=value=>"'"+value.replaceAll("'","''")+"'",bom=Buffer.from([239,187,191]);
  const putModule=(name,text)=>fs.writeFileSync(path.join(tools,'lib',name),Buffer.concat([bom,Buffer.from(text)]));
  putModule('room-node-runtime.psm1',`function Resolve-RoomNode { param($ProjectRoot,[switch]$PortableOnly) return @{Version='22';Path=${psQuote(process.execPath)}} }\nExport-ModuleMember -Function Resolve-RoomNode`);
  putModule('room-easytier.psm1',"function Resolve-RoomEasyTier { throw 'MUST_NOT_PREPARE_EASYTIER' }\nExport-ModuleMember -Function Resolve-RoomEasyTier");
  fs.writeFileSync(path.join(tools,'room-online.js'),"console.log('GAME_HOME_WITHOUT_EASYTIER');");
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const run=args=>spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(tools,'start-room.ps1'),...args],{encoding:'utf8',windowsHide:true,timeout:10000});
  const normal=run(['-NoBrowser']);assert.equal(normal.status,0,normal.stderr||normal.stdout);assert.match(normal.stdout,/GAME_HOME_WITHOUT_EASYTIER/);const check=run(['-CheckOnly']);assert.notEqual(check.status,0);assert.match(check.stdout,/MUST_NOT_PREPARE_EASYTIER/,'explicit package checks still verify multiplayer dependencies');
  // Multiplayer preparation retries failed first downloads and caches successful
  // preparation only. The isolated module performs no networking or installation.
  const {prepareEasyTier}=require('./room-online'),archiveName=process.arch==='arm64'?'easytier-windows-arm64-v2.6.4.zip':'easytier-windows-x86_64-v2.6.4.zip',download=path.join(fakeRoot,'.runtime/downloads',archiveName),marker=path.join(fakeRoot,'prepared.txt');
  putModule('room-easytier.psm1',`function Resolve-RoomEasyTier { param($ProjectRoot) [IO.Directory]::CreateDirectory(${psQuote(path.dirname(download))}) | Out-Null; [IO.File]::WriteAllText(${psQuote(download)},'partial zip'); throw 'controlled download failure' }\nExport-ModuleMember -Function Resolve-RoomEasyTier`);
  await assert.rejects(prepareEasyTier({root:fakeRoot,report:()=>{}}),/联机组件准备失败/);assert.equal(fs.existsSync(download),false,'only the newly failed download is removed so retry can succeed');
  putModule('room-easytier.psm1',`function Resolve-RoomEasyTier { param($ProjectRoot) [IO.File]::AppendAllText(${psQuote(marker)},'ready;') }\nExport-ModuleMember -Function Resolve-RoomEasyTier`);
  await Promise.all([prepareEasyTier({root:fakeRoot,report:()=>{}}),prepareEasyTier({root:fakeRoot,report:()=>{}})]);await prepareEasyTier({root:fakeRoot,report:()=>{}});assert.equal(fs.readFileSync(marker,'utf8'),'ready;','concurrent starts share preparation and later starts use the verified cache');
  console.log('ROOM HOME OK: direct four-seat setup; first-seat profile/avatar; in-place solo/team settings; fresh recipient defaults; local solo without room calls; explicit connect/continue/cancel; legacy redirect and Back; owned cleanup; PS5.1 home skips EasyTier; preparation retries/cache');
 }finally{await launcher?.stop();const resolved=path.resolve(fixture);assert.ok(resolved.startsWith(path.resolve(runtime)+path.sep)&&path.basename(resolved).startsWith('room-home-smoke-'));fs.rmSync(resolved,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

