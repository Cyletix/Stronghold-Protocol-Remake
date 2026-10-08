'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {DEFAULT_PEERS,runOnline}=require('./room-online');
const {listenOnAvailablePort}=require('./lib/listen-port');
const {createShareCode,normalizeShareCode,configFromShareCode}=require('./lib/room-share-code');
const {listPortraits,loadProfile,saveProfile}=require('./lib/room-profile');
const {PROTOCOL_VERSION,CLIENT_VERSION}=require('./room_server');
const {createWindowLifetime,writeBrowserTicket}=require('./lib/launcher-windows');
async function createLauncher({root=path.resolve(__dirname,'..'),profileRoot=root,port=0,peers=DEFAULT_PEERS,connect=runOnline,coreOptions={},statusHeartbeatMs=2000,browserLifetime=false,windowGraceMs=15000,windowStartupMs=120000,onBrowserExit}={}){
 const key=crypto.randomBytes(24).toString('hex');
 const windowToken=crypto.randomBytes(24).toString('hex');
 let lifetime=null,stopping=null;
 const webRoot=await fs.promises.realpath(path.join(root,'web'));
 const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2'};
 let state={phase:'idle',message:'请选择要进行的行动。'},active=null,pending=null,controller=null,profileQueue=Promise.resolve(),ending=null,pulsePending=null,lastPulse=0;
 let baseUrl;
 async function roomRequest(url,body,timeout=10000){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...body}),signal:AbortSignal.timeout(timeout)});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.message||'加入同盟失败'),{code:result.error});return result;}
 async function inputBody(req){
  if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('请求格式错误。');
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>2048)throw Error('输入内容过长。');chunks.push(c);}
  const value=JSON.parse(Buffer.concat(chunks));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('请求格式错误。');return value;
 }
 async function updateProfile(value){
  const profile=saveProfile(root,value,profileRoot);
  if(active){
   try{
    const currentSession=active,route='/api/rooms/'+currentSession.credentials.roomCode;
    // Resync first because the lobby and launcher share this player's command sequence.
    for(let attempt=0;attempt<2;attempt++){
     const current=await roomRequest(new URL(route+'/sync',currentSession.running.connection.url),currentSession.credentials);
     const self=current.room?.players?.find(p=>p.id===currentSession.credentials.playerId);
     if(self?.name===profile.name&&self?.portrait===profile.portrait)break;
     if(active!==currentSession)throw Error('连接已结束，下次加入会使用新名片。');
     try{await roomRequest(new URL(route+'/command',currentSession.running.connection.url),{...currentSession.credentials,sequence:current.ack+1,command:{type:'room/set-profile',name:profile.name,portrait:profile.portrait}});break;}
     catch(e){if(e.code!=='SEQUENCE_MISMATCH'||attempt)throw e;}
    }
    return {profile,synced:true,message:'名片已保存，当前同盟也已更新。'};
   }catch(e){return {profile,synced:false,message:'本机名片已保存；当前同盟暂未更新：'+e.message};}
  }
  return {profile,synced:true,message:'名片已保存在此文件夹，下次启动会自动使用。'};
 }
 async function endSession(message='已结束连接，可以重新创建或加入。',phase='idle'){
  if(ending)return ending;
  ending=(async()=>{
   if(active){await roomRequest(new URL('/api/rooms/'+active.credentials.roomCode+'/leave',active.running.connection.url),active.credentials,1500).catch(()=>{});await active.running.stop();active=null;}
   controller?.abort();await pending?.catch(()=>{});
   state={phase,message};lastPulse=0;
  })().finally(()=>{ending=null;});
  return ending;
 }
 async function heartbeat(force=false){
  const current=active;if(!current||ending)return;
  if(pulsePending)return pulsePending;
  if(!force&&Date.now()-lastPulse<statusHeartbeatMs)return;
  lastPulse=Date.now();
  pulsePending=(async()=>{
   try{
    await roomRequest(new URL('/api/rooms/'+current.credentials.roomCode+'/sync',current.running.connection.url),current.credentials);
    if(active===current&&!ending){state.connectionState='connected';state.message=state.role==='solo'?'单人房间已就绪，可以继续。':state.role==='host'?'同盟已创建，把分享码发给朋友。':'已加入同盟。';}
   }catch(e){
    if(active!==current||ending)return;
    if(['ROOM_NOT_FOUND','INVALID_SESSION'].includes(e.code))await endSession('当前房间已结束，可以重新创建或加入。');
    else{state.connectionState='reconnecting';state.message='与同盟的连接暂时中断，正在重试。恢复后可以继续进入同盟。';}
   }
  })().finally(()=>{pulsePending=null;});
  return pulsePending;
 }
 async function begin({action,name,portrait,shareCode,gameConfig}){
  if(action==='create'&&gameConfig!==undefined)gameConfig=require('./lib/room-game-runtime').validateRoomSettings(gameConfig);
  if(!['solo','create','join'].includes(action))throw Error('请选择单人、创建或加入。');
  if(typeof name!=='string'||!name.trim()||name.trim().length>20)throw Error('请填写1～20字的昵称。');
  if(state.phase==='connecting'||active||ending)throw Error('当前已有连接，请先返回同盟或结束当前连接。');
  const code=action==='solo'?null:action==='create'?createShareCode():normalizeShareCode(shareCode),config=code?configFromShareCode(code,peers):null,role=action==='solo'?'solo':action==='create'?'host':'join';
  const profile=saveProfile(root,{name,portrait:portrait??loadProfile(root,profileRoot).portrait},profileRoot);
  if(action==='solo'){
   state={phase:'ready',role:'solo',shareCode:null,url:baseUrl+'/room-lab.html?mode=solo',message:'单人配置已就绪，作战由浏览器本机运行。'};
   return;
  }
  controller=new AbortController();const signal=controller.signal;
  state={phase:'connecting',message:role==='solo'?'正在准备单人房间……':role==='host'?'正在创建同盟……':'正在寻找同盟……',role};
  pending=(async()=>{
   let running;
   try{
    running=await connect({root,role,noBrowser:true,networkConfig:config,shareCode:code,signal,coreOptions,report:message=>{if(!signal.aborted)state.message=message;}});
    signal.throwIfAborted();
    const endpoint=role==='join'?'/api/rooms/'+config.roomCode+'/join':'/api/rooms';
    const result=await roomRequest(new URL(endpoint,running.connection.url),{name:profile.name,portrait:profile.portrait,...(role==='solo'?{playMode:'solo'}:{}),...(role==='host'&&gameConfig?{settings:gameConfig}:{})});
    signal.throwIfAborted();
    const credentials=result.session;
    const target=new URL(running.connection.url);
    target.hash='launch='+Buffer.from(JSON.stringify({session:credentials,launcherUrl:baseUrl,windowToken:browserLifetime?windowToken:undefined})).toString('base64url');
    active={running,credentials};state={phase:'ready',role,shareCode:code,url:target.href,message:role==='solo'?'单人房间已就绪，可以继续。':role==='host'?'同盟已创建，分享码可以发给朋友。':'已加入同盟。'};
   }catch(e){await running?.stop();if(!signal.aborted)state={phase:'error',message:e.message};}
  })();
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.host!==new URL(baseUrl).host)return send(403,{message:'请使用启动器打开的本机地址。'});
   const url=new URL(req.url,baseUrl);if(url.origin!==baseUrl)return send(403,{message:'请求地址不属于本机主页。'});
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(400,{message:'资源地址格式不正确。'});}
   if(pathname==='/api/window'&&req.method==='GET'){
    const origin=req.headers.origin,gameOrigin=active?new URL(active.running.connection.url).origin:null;
    if(!lifetime||url.searchParams.get('token')!==windowToken||(origin&&origin!==baseUrl&&origin!==gameOrigin))return send(403,{message:'页面连接无效。'});
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    if(!lifetime.attach(res))return send(410,{message:'游戏已退出，请重新启动。'});
    return;
   }
   if(!pathname.startsWith('/api/')&&['GET','HEAD'].includes(req.method)){
    if(/[\\\0:]/.test(pathname))return send(404,{message:'本地资源不存在。'});
    const target=path.resolve(webRoot,'.'+(pathname==='/'?'/index.html':pathname));
    if(!target.startsWith(webRoot+path.sep))return send(404,{message:'本地资源不存在。'});
    let file,stat;try{file=await fs.promises.realpath(target);stat=await fs.promises.stat(file);}catch{return send(404,{message:'本地资源不存在。'});}
    if(!file.startsWith(webRoot+path.sep)||!stat.isFile())return send(404,{message:'本地资源不存在。'});
    const extension=path.extname(file).toLowerCase();
    // Existing game screens use inline event handlers and style attributes.
    // Only the game document receives this policy; the launcher keeps strict CSP.
    if(pathname==='/'||pathname==='/index.html')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
    if(pathname==='/'||pathname==='/index.html'||pathname==='/room-start.html'||pathname==='/room-lab.html'){
     const data=Buffer.from((await fs.promises.readFile(file,'utf8')).replace('__LAUNCHER_KEY__',key).replace('__LAUNCHER_WINDOW__',browserLifetime?windowToken:''));res.writeHead(200,{'Content-Type':mime[extension],'Content-Length':data.length});return req.method==='HEAD'?res.end():res.end(data);
    }
    const etag='W/"'+stat.size.toString(16)+'-'+Math.trunc(stat.mtimeMs).toString(16)+'"';res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',etag);res.setHeader('Vary','Accept-Encoding');
    if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
    const compressed=stat.size>=1024&&['.html','.css','.js','.json','.svg'].includes(extension)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
    res.writeHead(200,{'Content-Type':mime[extension]||'application/octet-stream',...(compressed?{'Content-Encoding':'gzip'}:{'Content-Length':stat.size})});
    if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(file),gzip=compressed?zlib.createGzip({level:1}):null;res.once('close',()=>{stream.destroy();gzip?.destroy();});stream.once('error',()=>res.destroy());
    if(gzip){gzip.once('error',()=>res.destroy());stream.pipe(gzip).pipe(res);}else stream.pipe(res);return;
   }
   if(req.headers['x-launcher-key']!==key||req.headers.origin&&req.headers.origin!==baseUrl)return send(403,{message:'请从本机联机首页操作。'});
   if(pathname==='/api/profile'&&req.method==='GET')return send(200,{profile:loadProfile(root,profileRoot),portraits:listPortraits(root)});
   if(pathname==='/api/profile'&&req.method==='POST'){
    const value=await inputBody(req),operation=profileQueue.then(()=>updateProfile(value));profileQueue=operation.catch(()=>{});
    return send(200,await operation);
   }
   // A visible launcher page is a live member while editing its name card. No timer
   // runs without page requests: closing all game/launcher pages still goes offline.
   if(pathname==='/api/status'&&req.method==='GET'){void heartbeat();return send(200,state);}
   if(pathname==='/api/resume'&&req.method==='POST'){
    await heartbeat(true);
    return send(200,state);
   }
   if(pathname==='/api/session'&&req.method==='POST'){
    const input=await inputBody(req);await begin(input);return send(202,state);
   }
   if(pathname==='/api/session'&&req.method==='DELETE'){await endSession();return send(200,state);}
   return send(404,{message:'不存在的操作。'});
  }catch(e){send(400,{message:e.message});}
 });
 await listenOnAvailablePort(server,{port});
 baseUrl='http://127.0.0.1:'+server.address().port;
 async function stop(){if(stopping)return stopping;lifetime?.close();stopping=(async()=>{try{await endSession();}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}})();return stopping;}
 if(browserLifetime)lifetime=createWindowLifetime({graceMs:windowGraceMs,startupMs:windowStartupMs,onEmpty:async()=>{await stop();onBrowserExit?.();}});
 return {server,url:baseUrl,key,stop};
}
async function main({noBrowser=false,browserTicket}={}){
 const launcher=await createLauncher({port:8100,browserLifetime:!noBrowser,onBrowserExit:()=>{console.log('所有游戏页面已关闭，连接与游戏服务已退出。');process.exit(0);}});
 console.log('游戏主页：'+launcher.url+'\n'+(noBrowser?'后台启动模式，退出请按 Ctrl+C。':'关闭全部游戏页面后15秒自动退出；刷新或页面跳转不会断开连接。退出也可按 Ctrl+C。'));
 if(!noBrowser){
  if(browserTicket)writeBrowserTicket(browserTicket,launcher.url);
  else{const {spawn}=require('node:child_process');const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath '"+launcher.url+"'"],{stdio:'ignore',windowsHide:true});child.on('error',()=>console.log('请手动打开上述地址。'));child.unref();}
 }
 let closing=false;const close=()=>{if(!closing){closing=true;launcher.stop().then(()=>process.exit(0));}};process.once('SIGINT',close);process.once('SIGTERM',close);
 return launcher;
}
module.exports={createLauncher,main};
