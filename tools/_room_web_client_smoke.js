'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION}=require('./room_server');
const {clientManifest,assertMatchingClient,startRoomWebClient}=require('./lib/room-web-client');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function raw(url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const request=http.request(url,{method,headers},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));response.on('error',reject);});request.on('error',reject);request.end(body);});}
async function main(){
 const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});const fixture=fs.mkdtempSync(path.join(runtime,'web-client-smoke-'));
 const host=createRoomServer(),handler=host.listeners('request')[0],seen=[];let interrupted=0;
 host.removeAllListeners('request');host.on('request',(req,res)=>{
  seen.push({url:req.url,host:req.headers.host,origin:req.headers.origin});
  if(req.url==='/api/game-info?never'){res.on('close',()=>interrupted++);return;}
  if(req.url==='/api/game-info?stream'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"waiting":');res.on('close',()=>interrupted++);return;}
  handler(req,res);
 });
 let gateway,local;const slow=[];
 try{
  await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));const upstream='http://127.0.0.1:'+host.address().port;
  const manifest=await clientManifest(root);assert.ok(manifest.fileCount>30);assert.match(manifest.fingerprint,/^[a-f0-9]{64}$/);
  await assertMatchingClient({root,upstreamUrl:upstream});
  gateway=await startRoomWebClient({root,upstreamUrl:upstream});const base=new URL(gateway.url).origin;
  const html=await(await fetch(base+'/index.html')).text();assert.match(html,/卫戍协议/);
  const resources=new Set([...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(x=>'/'+x[1]));
  for(const file of fs.readdirSync(path.join(root,'web')))if(file.endsWith('.json'))resources.add('/'+file);
  resources.add('/portraits/char_102_texas.png');resources.add('/avatars/char_102_texas.png');resources.add('/ui/icon_exit.png');
  for(const resource of resources){const response=await fetch(base+resource);assert.equal(response.status,200,resource);assert.equal(response.headers.get('x-room-asset-source'),'local');await response.arrayBuffer();}
  assert.equal(seen.filter(x=>!x.url.startsWith('/api/')).length,0,'complete page scripts, styles, JSON and portraits never download from the host');
  async function post(route,body,origin=base){const response=await fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...body})});return {status:response.status,value:await response.json()};}
  const h=(await post('/api/rooms',{name:'网关房主'})).value.session;
  const guest=(await post('/api/rooms/'+h.roomCode+'/join',{name:'本地资源玩家'})).value.session;
  assert.ok(guest?.token);const sync=await post('/api/rooms/'+h.roomCode+'/sync',guest);assert.equal(sync.status,200);assert.equal(sync.value.room.players.length,2);
  const forwarded=seen.filter(x=>x.origin);assert.ok(forwarded.length>=3);assert.ok(forwarded.every(x=>x.origin===upstream&&x.host===new URL(upstream).host),'legitimate local Origin and Host are mapped to the EasyTier upstream');
  const beforeRejected=seen.length;assert.equal((await post('/api/rooms',{name:'forged'},'https://example.com')).status,403);
  assert.equal((await raw(base+'/api/room-info',{headers:{Host:'evil.example'}})).status,403);
  assert.equal((await fetch(base+'/api/admin')).status,404);assert.equal(seen.length,beforeRejected,'foreign origin/host and unknown APIs never reach the host');
  const directZip=await raw(upstream+'/api/portraits',{headers:{'Accept-Encoding':'gzip'}}),proxiedZip=await raw(base+'/api/portraits',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(proxiedZip.headers['content-encoding'],'gzip');assert.deepEqual(proxiedZip.body,directZip.body,'gzip API payloads pass through byte-for-byte');assert.ok(JSON.parse(zlib.gunzipSync(proxiedZip.body)).portraits.length>4);
  const web=path.join(fixture,'web');fs.mkdirSync(path.join(web,'测试目录'),{recursive:true});fs.mkdirSync(path.join(fixture,'private'));
  fs.writeFileSync(path.join(web,'room-lab.html'),'<h1>本地资源</h1>');fs.writeFileSync(path.join(web,'测试目录','说明.txt'),'中文文件名');fs.writeFileSync(path.join(fixture,'private','secret.txt'),'never serve');
  fs.symlinkSync(path.join(fixture,'private'),path.join(web,'outside'),'junction');
  const slowFile=path.join(web,'测试目录','慢立绘.png'),fd=fs.openSync(slowFile,'w');fs.ftruncateSync(fd,16*1024*1024);fs.closeSync(fd);
  local=await startRoomWebClient({root:fixture,upstreamUrl:upstream,timeoutMs:150});const localBase=new URL(local.url).origin;
  assert.equal(await(await fetch(localBase+'/测试目录/说明.txt')).text(),'中文文件名');
  const beforeMissing=seen.length;
  for(const bad of ['/missing.png','/outside/secret.txt','/%2e%2e%2fprivate/secret.txt','/%2e%2e%5cprivate/secret.txt','/room-lab.html:secret'])assert.equal((await fetch(localBase+bad)).status,404,bad);
  assert.equal(seen.length,beforeMissing,'missing resources and escaped paths do not fall back to remote files');
  const cache=await raw(localBase+'/room-lab.html');assert.equal((await raw(localBase+'/room-lab.html',{headers:{'If-None-Match':cache.headers.etag}})).status,304);
  await assert.rejects(assertMatchingClient({root:fixture,upstreamUrl:upstream}),error=>error.code==='CLIENT_VERSION_MISMATCH');
  for(let n=0;n<16;n++)await new Promise((resolve,reject)=>{const request=http.get(localBase+'/测试目录/慢立绘.png',response=>{response.pause();slow.push({request,response});resolve();});request.on('error',reject);});
  const started=Date.now(),presence=await fetch(localBase+'/api/rooms/'+h.roomCode+'/presence',{method:'POST',headers:{Origin:localBase,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...guest})});
  assert.equal(presence.status,200);await presence.json();assert.ok(Date.now()-started<1000,'sixteen deliberately stalled local image downloads do not delay an API heartbeat');
  const timedOut=await fetch(localBase+'/api/game-info?never');assert.equal(timedOut.status,504);assert.equal((await timedOut.json()).error,'UPSTREAM_TIMEOUT');
  await new Promise((resolve,reject)=>{const request=http.get(localBase+'/api/game-info?stream',response=>{response.once('data',()=>{response.destroy();request.destroy();resolve();});});request.on('error',reject);});
  for(let n=0;n<20&&interrupted<2;n++)await pause(10);assert.equal(interrupted,2,'timeout and browser cancellation both destroy the upstream response');
  for(const pair of slow){pair.response.destroy();pair.request.destroy();}slow.length=0;
  await local.stop();local=null;await gateway.stop();gateway=null;
  assert.equal((await fetch(upstream+'/api/room-info')).status,200,'stopping a guest gateway leaves the host service running');
  assert.equal(seen.filter(x=>!x.url.startsWith('/api/')).length,0);
  console.log('ROOM WEB CLIENT OK: '+resources.size+' page resources served locally; real room create/join/sync/presence; zero remote static requests; Origin/Host isolation; gzip streaming; Chinese paths/junction escape; version mismatch; slow images; timeout/cancel; owned cleanup');
 }finally{
  for(const pair of slow){pair.response.destroy();pair.request.destroy();}await local?.stop();await gateway?.stop();host.closeAllConnections();await new Promise(resolve=>host.close(resolve));
  assert.ok(path.resolve(fixture).startsWith(path.resolve(runtime)+path.sep)&&path.basename(fixture).startsWith('web-client-smoke-'));fs.rmSync(fixture,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
