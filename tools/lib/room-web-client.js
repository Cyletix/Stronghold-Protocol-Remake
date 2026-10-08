'use strict';
// Joining players already own the portable game's assets. Only authoritative
// room API messages travel over EasyTier; this server never creates a game VM.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2'};
const VERSIONED_EXTENSIONS=new Set(['.html','.js','.css','.json','.wasm']);
const manifests=new Map();
function inside(folder,file){return file.startsWith(folder+path.sep);}
async function clientManifest(root){
 const webRoot=await fs.promises.realpath(path.join(root,'web'));
 if(manifests.has(webRoot))return manifests.get(webRoot);
 const pending=(async()=>{
  const files=[];
  async function scan(folder){
   for(const entry of await fs.promises.readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())await scan(file);
    else if(entry.isFile()&&VERSIONED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))files.push(file);
   }
  }
  await scan(webRoot);files.sort((a,b)=>a.localeCompare(b,'en'));
  const hash=crypto.createHash('sha256');
  for(const file of files){
   const relative=path.relative(webRoot,file).split(path.sep).join('/');
   hash.update(relative).update('\0');
   const fileHash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))fileHash.update(chunk);
   hash.update(fileHash.digest('hex')).update('\n');
  }
  return {version:1,fingerprint:hash.digest('hex'),fileCount:files.length};
 })();
 manifests.set(webRoot,pending);pending.catch(()=>manifests.delete(webRoot));return pending;
}
async function assertMatchingClient({root,upstreamUrl,signal,timeoutMs=15000}){
 let local;
 try{local=await clientManifest(root);}catch(e){throw Object.assign(Error('本地游戏文件不完整，请完整解压新版通用包后重试。'),{code:'LOCAL_PACKAGE_ERROR',cause:e});}
 let response,remote;
 try{
  const deadline=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,deadline]):deadline;
  response=await fetch(new URL('/api/client-manifest',upstreamUrl),{signal:combined});
  if(response.status===404||response.status===405)throw Object.assign(Error('房主使用的是旧版联机程序，请双方使用同一个新版通用包。'),{code:'CLIENT_VERSION_MISMATCH'});
  if(!response.ok)throw Error('HTTP '+response.status);
  remote=await response.json();
 }catch(e){
  if(signal?.aborted)signal.throwIfAborted();
  if(e.code==='CLIENT_VERSION_MISMATCH')throw e;
  throw Object.assign(Error('暂时无法核对房主的游戏版本，请确认房主在线后重试。'),{code:'UPSTREAM_UNAVAILABLE',cause:e});
 }
 if(remote?.version!==1||remote.fingerprint!==local.fingerprint||remote.fileCount!==local.fileCount)throw Object.assign(Error('本机与房主的游戏文件版本不同，请双方使用同一个新版通用包后重新连接。'),{code:'CLIENT_VERSION_MISMATCH'});
 return local;
}
function proxyRoute(method,pathname){
 if(method==='GET')return /^\/api\/(room-info|game-info|portraits|client-manifest)$/.test(pathname);
 if(method!=='POST')return false;
 return pathname==='/api/rooms'||/^\/api\/rooms\/[A-Z2-9]{6}\/(join|sync|command|leave|game-enter|game-sync|game-command|presence)$/.test(pathname);
}
function cleanHeaders(headers){
 const connection=String(headers.connection||'').toLowerCase().split(',').map(x=>x.trim());
 const blocked=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade',...connection]);
 return Object.fromEntries(Object.entries(headers).filter(([name])=>!blocked.has(name.toLowerCase())));
}
async function startRoomWebClient({root,upstreamUrl,port=0,timeoutMs=30000}={}){
 const webRoot=await fs.promises.realpath(path.join(root,'web')),upstream=new URL(upstreamUrl);
 if(upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||upstream.username||upstream.password||!upstream.port)throw Error('联机上游必须是本机 EasyTier 转发地址。');
 let baseUrl,closing=false,stopping;
 const pending=new Set(),agent=new http.Agent({keepAlive:true,maxSockets:32,maxFreeSockets:8});
 const send=(res,status,code,message)=>{if(res.headersSent)return res.destroy();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:code,message}));};
 function proxy(req,res,url){
  const headers=cleanHeaders(req.headers);headers.host=upstream.host;
  if(headers.origin)headers.origin=upstream.origin;
  // Referer may contain only this player's local URL; the host does not need it.
  delete headers.referer;delete headers['x-forwarded-host'];delete headers['x-forwarded-for'];delete headers.forwarded;
  const outgoing=http.request({hostname:upstream.hostname,port:upstream.port,method:req.method,path:url.pathname+url.search,headers,agent});
  pending.add(outgoing);let incoming,finished=false;
  const deadline=setTimeout(()=>{outgoing.destroy(Object.assign(Error('upstream timeout'),{code:'UPSTREAM_TIMEOUT'}));},timeoutMs);deadline.unref?.();
  const cleanup=()=>{if(finished)return;finished=true;clearTimeout(deadline);pending.delete(outgoing);req.off('aborted',cancel);};
  const cancel=()=>{outgoing.destroy();incoming?.destroy();cleanup();};
  req.once('aborted',cancel);
  res.once('close',()=>{if(!res.writableEnded)cancel();else cleanup();});
  outgoing.once('response',response=>{
   incoming=response;const responseHeaders=cleanHeaders(response.headers);responseHeaders['x-room-proxy']='host';
   res.writeHead(response.statusCode,responseHeaders);
   response.once('error',()=>{if(!res.destroyed)res.destroy();cleanup();});
   response.once('end',cleanup);response.pipe(res);
  });
  outgoing.once('error',error=>{
   cleanup();incoming?.destroy();
   if(!res.destroyed)send(res,error.code==='UPSTREAM_TIMEOUT'?504:502,error.code==='UPSTREAM_TIMEOUT'?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE','与房主的连接暂时中断，正在等待网络恢复。');
  });
  req.pipe(outgoing);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(closing)return send(res,503,'CLIENT_CLOSING','本机联机连接正在关闭。');
   if(req.headers.host!==new URL(baseUrl).host)return send(res,403,'HOST_REJECTED','请使用本机启动器提供的联机地址。');
   if(req.headers.origin&&req.headers.origin!==baseUrl)return send(res,403,'ORIGIN_REJECTED','只接受当前联机页面的请求。');
   const url=new URL(req.url,baseUrl);if(url.origin!==baseUrl)return send(res,403,'ORIGIN_REJECTED','请求地址不属于当前联机页面。');
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return send(res,400,'INVALID_PATH','资源地址格式不正确。');}
   if(pathname.startsWith('/api/')){
    if(!proxyRoute(req.method,pathname)||pathname!==url.pathname)return send(res,404,'API_NOT_ALLOWED','不支持的联机操作。');
    return proxy(req,res,url);
   }
   if(!['GET','HEAD'].includes(req.method))return send(res,405,'METHOD_NOT_ALLOWED','本地游戏资源只支持读取。');
   if(/[\\\0:]/.test(pathname))return send(res,404,'LOCAL_ASSET_NOT_FOUND','本地游戏资源不存在，请确认压缩包已完整解压。');
   const target=path.resolve(webRoot,'.'+(pathname==='/'?'/room-lab.html':pathname));
   if(!inside(webRoot,target))return send(res,404,'LOCAL_ASSET_NOT_FOUND','本地游戏资源不存在，请确认压缩包已完整解压。');
   let file,stat;try{file=await fs.promises.realpath(target);stat=await fs.promises.stat(file);}catch{return send(res,404,'LOCAL_ASSET_NOT_FOUND','本地游戏资源不存在，请确认压缩包已完整解压。');}
   if(!inside(webRoot,file)||!stat.isFile())return send(res,404,'LOCAL_ASSET_NOT_FOUND','本地游戏资源不存在，请确认压缩包已完整解压。');
   const extension=path.extname(file).toLowerCase(),etag='W/"'+stat.size.toString(16)+'-'+Math.trunc(stat.mtimeMs).toString(16)+'"';
   res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',etag);res.setHeader('Vary','Accept-Encoding');res.setHeader('X-Room-Asset-Source','local');
   if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
   const compress=stat.size>=1024&&['.html','.js','.css','.json','.svg'].includes(extension)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
   res.writeHead(200,{'Content-Type':MIME[extension]||'application/octet-stream',...(compress?{'Content-Encoding':'gzip'}:{'Content-Length':stat.size})});
   if(req.method==='HEAD')return res.end();
   const stream=fs.createReadStream(file),gzip=compress?zlib.createGzip({level:1}):null;
   const close=()=>{stream.destroy();gzip?.destroy();};res.once('close',close);stream.once('error',()=>res.destroy());
   if(gzip){gzip.once('error',()=>res.destroy());stream.pipe(gzip).pipe(res);}else stream.pipe(res);
  }catch(error){send(res,500,'LOCAL_CLIENT_ERROR','本机游戏页面暂时不可用，请重新运行启动器。');}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
 catch(e){agent.destroy();throw e;}
 baseUrl='http://127.0.0.1:'+server.address().port;
 async function stop(){
  if(stopping)return stopping;closing=true;
  stopping=(async()=>{for(const request of pending)request.destroy();agent.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));})();
  return stopping;
 }
 return {server,url:baseUrl+'/room-lab.html',port:server.address().port,upstreamUrl,stop};
}
module.exports={clientManifest,assertMatchingClient,startRoomWebClient,proxyRoute};
