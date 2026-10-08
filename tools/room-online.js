'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const {assertMatchingClient,startRoomWebClient}=require('./lib/room-web-client');
const {listenOnAvailablePort}=require('./lib/listen-port');
const execFileAsync=promisify(execFile),pause=ms=>new Promise(r=>setTimeout(r,ms));
const VERSION='2.6.4';
// Operator-published endpoints: github.com/orgs/EasyTier/discussions/1909.
const DEFAULT_PEERS=['tcp://sh.vomiku.com:7910','tcp://us01.225284.xyz:11010'];
const preparedRuntimes=new Map();
async function prepareEasyTier({root,signal,report=console.log}){
 root=path.resolve(root);signal?.throwIfAborted();
 if(preparedRuntimes.has(root))return preparedRuntimes.get(root);
 const task=(async()=>{
  const archiveName=process.arch==='arm64'?'easytier-windows-arm64-v2.6.4.zip':'easytier-windows-x86_64-v2.6.4.zip';
  const archiveHash=process.arch==='arm64'?'37023f8a3451c9234b17ee2089a03dc344ce90d803b5b359cb6c46682b0549b4':'27af91e270e554709b048bd32327fefd2dfce5062ae1e8701af7550c6f525f84';
  const download=path.join(root,'.runtime/downloads',archiveName),newDownload=!fs.existsSync(download);
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const command="$ErrorActionPreference='Stop'; Import-Module "+quote(path.join(root,'tools/lib/room-easytier.psm1'))+" -Force; Resolve-RoomEasyTier -ProjectRoot "+quote(root)+" | Out-Null";
  report('正在准备联机……');
  try{
   await execFileAsync(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,signal,timeout:240000,maxBuffer:1024*1024});
  }catch(e){
   // Failed or cancelled first-time downloads must not strand a partial ZIP.
   // Existing archives belong to the user and are never removed here.
   if(newDownload)try{if(fs.lstatSync(download).isFile()&&crypto.createHash('sha256').update(fs.readFileSync(download)).digest('hex')!==archiveHash)fs.unlinkSync(download);}catch{}
   if(signal?.aborted)signal.throwIfAborted();throw Error('联机组件准备失败，请重试或完整解压新版通用包。',{cause:e});
  }
  signal?.throwIfAborted();
 })();
 preparedRuntimes.set(root,task);task.catch(()=>preparedRuntimes.delete(root));return task;
}
function validateConfig(config){
  if(config.version!==1||!/^ark-room-[a-f0-9]{16}$/.test(config.networkName)||! /^[a-f0-9]{64}$/.test(config.networkSecret))throw Error('联机配置不完整，请重新创建同盟或检查分享码。');
  if(config.hostIPv4!=='10.126.126.1')throw Error('不支持的联机虚拟地址。');
  if(!Array.isArray(config.peers)||!config.peers.length||config.peers.some(p=>{try{const u=new URL(p);return !['tcp:','udp:','ws:','wss:'].includes(u.protocol)||u.username||u.password||!u.hostname||!u.port;}catch{return true;}}))throw Error('共享节点配置无效。');
  if(!['ask','host','join'].includes(config.role))throw Error('联机身份配置无效。');
  return config;
}
function loadConfig(file,{create=false}={}){
  if(!fs.existsSync(file)&&create){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({version:1,networkName:'ark-room-'+crypto.randomBytes(8).toString('hex'),networkSecret:crypto.randomBytes(32).toString('hex'),hostIPv4:'10.126.126.1',peers:DEFAULT_PEERS,role:'ask'},null,2),{flag:'wx'});}
  return validateConfig(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
}
async function freePort(preferred=0){
 const server=net.createServer();
 try{return await listenOnAvailablePort(server,{port:preferred});}
 finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
function coreArgs({role,config,rpcPort,port,listener,isolated=false,relayOnly=false}){
 const args=['--no-tun','--use-smoltcp','--bind-device','false','--disable-upnp','--private-mode','true','--rpc-portal',`127.0.0.1:${rpcPort}`,'--rpc-portal-whitelist','127.0.0.1/32','--ipv4',role==='host'?config.hostIPv4:'10.126.126.2','--hostname',role==='host'?'ark-host-'+port:'ark-guest-'+crypto.randomBytes(3).toString('hex'),'--instance-name','ark-room-'+role,'--console-log-level','error','--file-log-level','off','--tcp-whitelist',role==='host'?String(port):'0','--udp-whitelist','0','--listeners',listener||'udp://0.0.0.0:0'];
 if(role==='join')args.push('--dhcp');
 if(relayOnly)args.push('--disable-p2p','--disable-udp-hole-punching','--disable-tcp-hole-punching');
 if(isolated)args.push('--disable-ipv6','--disable-udp-hole-punching','--disable-tcp-hole-punching','--stun-servers','--stun-servers-v6');
 args.push('--peers',...config.peers);
 return args;
}
async function startCore({root,role,config,port,listener,isolated=false,relayOnly=false,report=console.log,signal}){
 await prepareEasyTier({root,signal,report});
 signal?.throwIfAborted();
 const arch=process.arch==='arm64'?'arm64':'x64',runtime=path.join(root,`.runtime/easytier-v${VERSION}-${arch}`),core=path.join(runtime,'easytier-core.exe'),cli=path.join(runtime,'easytier-cli.exe');
 const rpcPort=await freePort();
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('ET_'))delete env[key];
 env.ET_NETWORK_NAME=config.networkName;env.ET_NETWORK_SECRET=config.networkSecret;
 const child=spawn(core,coreArgs({role,config,rpcPort,port,listener,isolated,relayOnly}),{cwd:runtime,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let log='',stopped=false,error;
 for(const s of [child.stdout,child.stderr])s.on('data',v=>{log=(log+v.toString().replaceAll(config.networkSecret,'[redacted]')).slice(-16000);});
 child.on('error',e=>{error=e;});
 const api=async args=>{if(error)throw error;if(child.exitCode!==null)throw Error('EasyTier已退出：'+child.exitCode);const r=await execFileAsync(cli,['-p',`127.0.0.1:${rpcPort}`,'-o','json',...args],{windowsHide:true,timeout:5000,maxBuffer:1024*1024});return r.stdout;};
 const exitCleanup=()=>child.kill();process.once('exit',exitCleanup);
 async function stop(){if(stopped)return;stopped=true;process.off('exit',exitCleanup);if(child.exitCode===null&&!error)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 try{
  for(let n=0;;n++){try{await api(['node','info']);break;}catch(e){if(n>=20||error||child.exitCode!==null)throw e;await pause(300);}}
 }catch(e){await stop();throw Error('EasyTier启动失败，请确认文件完整或未被安全软件拦截。'+e.message);}
 return {child,api,stop,logs:()=>log,rpcPort};
}
function findHost(peers,config){
 const candidates=peers.filter(p=>p.ipv4===config.hostIPv4&&p.cost!=='Local'&&/^ark-host-\d+$/.test(p.hostname||''));
 if(candidates.length>1)throw Error('同一网络检测到多个房主，请只保留一个开房窗口。');
 if(!candidates.length)return null;const port=Number(candidates[0].hostname.slice('ark-host-'.length));
 if(port<1||port>65535)throw Error('房主端口无效');return {...candidates[0],port};
}
async function connectGuest(core,config,{root=path.resolve(__dirname,'..'),preferredPort=8003,timeoutMs=120000,report=console.log,signal}={}){
 const started=Date.now();let lastNotice=0;
 while(Date.now()-started<timeoutMs){
  signal?.throwIfAborted();
  const host=findHost(JSON.parse(await core.api(['peer'])),config);
  if(host){
   const localPort=await freePort(preferredPort),bind=`127.0.0.1:${localPort}`,dst=`${config.hostIPv4}:${host.port}`;
   await core.api(['port-forward','add','tcp',bind,dst]);
   const upstreamUrl=`http://${bind}/room-lab.html`;let gateway;
   try{
    const response=await fetch(`http://${bind}/api/room-info`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    const info=await response.json();if(!response.ok||info.capacity!==4)throw Error('房主大厅未就绪');
    report('已找到房主，正在核对本机游戏文件……');
    await assertMatchingClient({root,upstreamUrl,signal});signal?.throwIfAborted();
    gateway=await startRoomWebClient({root,upstreamUrl});signal?.throwIfAborted();
    return {url:gateway.url,port:gateway.port,upstreamUrl,upstreamPort:localPort,host,stop:gateway.stop};
   }catch(e){
    await gateway?.stop();await core.api(['port-forward','remove','tcp',bind,dst]).catch(()=>{});
    if(signal?.aborted)signal.throwIfAborted();
    if(['CLIENT_VERSION_MISMATCH','LOCAL_PACKAGE_ERROR'].includes(e.code)||Date.now()-started>timeoutMs-1000)throw e;
   }
  }
  if(Date.now()-lastNotice>15000){report('正在寻找房主……请确认房主仍在运行。');lastNotice=Date.now();}
  await pause(1000);
 }
 throw Error('两分钟内未连接到房主。请确认分享码正确、房主仍在运行，或稍后重试。');
}
function openBrowser(url){const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath '"+url+"'"],{stdio:'ignore',windowsHide:true});p.on('error',()=>console.log('请手动打开：'+url));p.unref();}
async function runOnline({root=path.resolve(__dirname,'..'),role='ask',noBrowser=false,configFile,isolated=false,networkConfig,shareCode,signal,report=console.log,coreOptions={}}={}){
 const config=networkConfig||loadConfig(configFile||path.join(root,fs.existsSync(path.join(root,'online-room.json'))?'online-room.json':'.runtime/online-room.json'),{create:true});
 if(role==='ask')role=config.role;
 if(role==='ask'){
  const readline=require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});
  try{const answer=(await readline.question('请选择：1 我来开房　2 加入朋友（输入 1 或 2）: ')).trim();if(!['1','2'].includes(answer))throw Error('请输入 1 或 2 后重新启动。');role=answer==='1'?'host':'join';}finally{readline.close();}
 }
 let room,core,connection,closed=false,interval;
 async function stop(){closed=true;clearInterval(interval);signal?.removeEventListener('abort',abort);const oldCore=core,oldRoom=room,oldConnection=connection;core=null;room=null;connection=null;await oldConnection?.stop?.();await oldCore?.stop();if(oldRoom){oldRoom.server.closeAllConnections();await new Promise(r=>oldRoom.server.close(r));}}
 const abort=()=>{stop().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();report('正在建立连接……');
  if(role==='host')room=await require('./start-room').startRoom({host:'127.0.0.1',port:8003,open:false,report:()=>{},serverOptions:{singleRoomCode:config.roomCode,onlineShareCode:shareCode}});
  signal?.throwIfAborted();
  core=await startCore({root,role,config,port:room?.port,isolated,report,signal,...coreOptions});
  if(signal?.aborted){await core.stop();signal.throwIfAborted();}
  core.child.once('exit',()=>{if(!closed){console.error('组网程序已退出，连接已停止。请重新运行启动器。');stop().then(()=>{process.exitCode=1;});}});
  connection=role==='host'?{url:room.localUrl}:await connectGuest(core,config,{root,signal,report});
  if(signal?.aborted){await connection.stop?.();signal.throwIfAborted();}
  console.log((role==='host'?'房主已就绪：':'已连接房主：')+connection.url);
  report(role==='host'?'同盟已建立。':'已找到房主。');
  if(!noBrowser)openBrowser(connection.url);
  let checking=false,offline=false;
  interval=setInterval(async()=>{if(checking||closed)return;checking=true;try{const peers=JSON.parse(await core.api(['peer']));if(role==='join'){const host=findHost(peers,config);if(!host&&!offline){console.log('房主暂时离线，EasyTier正在重连；主机程序重启后请重新运行此窗口。');offline=true;}else if(host&&offline){console.log('连接已恢复。');offline=false;}if(host&&host.port!==connection.host.port){console.error('房主服务端口已改变，请重新运行此窗口。');await stop();process.exitCode=1;}}}catch(e){if(!closed)console.log('正在检查连接：'+e.message);}finally{checking=false;}},10000);
  return {role,room,core,connection,stop};
 }catch(e){await stop();throw e;}
}
module.exports={DEFAULT_PEERS,validateConfig,loadConfig,freePort,coreArgs,prepareEasyTier,startCore,findHost,connectGuest,runOnline};
if(require.main===module){
 const ticketIndex=process.argv.indexOf('--browser-ticket');
 require('./room-launcher').main({noBrowser:process.argv.includes('--no-open'),browserTicket:ticketIndex>=0?process.argv[ticketIndex+1]:undefined}).catch(e=>{console.error('游戏启动失败：'+e.message);process.exitCode=1;});
}
