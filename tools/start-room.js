'use strict';
// User-facing host entry. Dependency setup belongs to start-room.ps1; the game
// itself uses Node built-ins and does not need npm install.
const os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
const {createRoomServer}=require('./room_server');
const {listenOnAvailablePort}=require('./lib/listen-port');
function parseArgs(args){
  const out={host:'0.0.0.0',port:8003,open:true};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--no-open')out.open=false;
    else if(args[i]==='--host'&&args[i+1])out.host=args[++i];
    else if(args[i]==='--port'&&args[i+1])out.port=Number(args[++i]);
    else if(args[i]==='--browser-ticket'&&args[i+1]){out.browserTicket=args[++i];out.open=false;}
    else throw Error('用法：node tools/start-room.js [--host IP] [--port 8003] [--no-open]');
  }
  if(!net.isIP(out.host))throw Error('监听地址须为 IPv4 或 IPv6 地址。');
  if(!Number.isInteger(out.port)||out.port<0||out.port>65535)throw Error('端口须为 0～65535 的整数。');
  return out;
}
function addressUrl(address,port){return 'http://'+(net.isIPv6(address)?'['+address+']':address)+':'+port+'/room-lab.html';}
function addresses(host,port,interfaces=os.networkInterfaces()){
  if(host!=='0.0.0.0'&&host!=='::')return [{name:host,address:host,url:addressUrl(host,port)}];
  const rows=[],seen=new Set();
  for(const [name,entries]of Object.entries(interfaces))for(const e of entries||[]){
    if(e.internal||!['IPv4',4].includes(e.family)||e.address.startsWith('169.254.')||!net.isIPv4(e.address)||seen.has(e.address))continue;
    seen.add(e.address);rows.push({name,address:e.address,url:addressUrl(e.address,port)});
  }
  return rows.sort((a,b)=>Number(/easytier/i.test(b.name))-Number(/easytier/i.test(a.name))||a.name.localeCompare(b.name));
}
function openBrowser(url){
  // Only a locally generated numeric-IP URL reaches a process argument.
  let command,args;
  if(process.platform==='win32'){command='powershell.exe';args=['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath '"+url+"'"];}
  else if(process.platform==='darwin'){command='open';args=[url];}
  else {command='xdg-open';args=[url];}
  const child=spawn(command,args,{stdio:'ignore',windowsHide:true});
  child.on('error',()=>console.log('请手动打开：'+url));child.unref();
}
async function startRoom({host='0.0.0.0',port=8003,open=false,report=console.log,serverOptions={}}={}){
  parseArgs(['--host',host,'--port',String(port)]);
  const server=createRoomServer(serverOptions);
  try{
    await listenOnAvailablePort(server,{port,host});
  }catch(e){server.close();throw e;}
  const actualPort=server.address().port,urls=addresses(host,actualPort);
  const localAddress=host==='0.0.0.0'?'127.0.0.1':host==='::'?'::1':host;
  const localUrl=addressUrl(localAddress,actualPort),easyTier=urls.find(x=>/easytier/i.test(x.name));
  report('\n卫戍协议 · 房主服务已启动');
  report('本机打开：'+localUrl);
  if(actualPort!==port&&port!==0)report('端口 '+port+' 已占用或不可用，已自动使用 '+actualPort+'。');
  if(host==='127.0.0.1'||host==='::1')report('当前仅供本机测试；朋友连接需监听虚拟网卡或 0.0.0.0。');
  else {
    report('\n朋友加入：双方连上同一 EasyTier 网络，再用房主的虚拟 IP 打开大厅。');
    for(const row of urls)report('  ['+row.name+'] '+row.url);
    report('不要把 127.0.0.1 / localhost 发给朋友；房间码在同一主机内使用。');
    report('如果 Windows 询问网络访问权限，请允许你用于组网的网络；连接失败时检查此端口的入站规则。');
  }
  report('\n保持此窗口运行。停止服务请按 Ctrl+C；停止后本局内存进度会清空。\n');
  server.on('error',e=>report('房间服务错误：'+e.message));
  if(open)openBrowser(easyTier?.url||localUrl);
  return {server,port:actualPort,localUrl,addresses:urls};
}
module.exports={parseArgs,addresses,startRoom};
if(require.main===module){
  (async()=>{
    if(Number(process.versions.node.split('.')[0])<22)throw Error('请双击 开始游戏.cmd 自动准备 Node.js 22 或更新版本。');
    const options=parseArgs(process.argv.slice(2)),running=await startRoom(options);
    if(options.browserTicket)require('./lib/launcher-windows').writeBrowserTicket(options.browserTicket,running.localUrl);
    for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>{running.server.close();running.server.closeAllConnections();});
  })().catch(e=>{console.error('启动失败：'+e.message);process.exitCode=1;});
}
