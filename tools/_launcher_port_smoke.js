'use strict';
// Exercise the actual home launcher, including Windows-style excluded-port
// failures, without changing the machine's reservations or opening a browser.
const assert=require('node:assert/strict'),net=require('node:net'),http=require('node:http');
const {freePort}=require('./room-online');
const {main:startLauncher,createLauncher}=require('./room-launcher');
const {startRoom}=require('./start-room');
const httpDefaults=http.createServer();
const defaultListeningListeners=httpDefaults.listenerCount('listening'),defaultErrorListeners=httpDefaults.listenerCount('error');

async function withListenFailures(failure,run){
 const listen=net.Server.prototype.listen,calls=[];
 net.Server.prototype.listen=function(...args){
  const port=typeof args[0]==='object'?args[0].port:args[0];
  const host=typeof args[0]==='object'?args[0].host:args[1];
  const call={server:this,port:Number(port),host};calls.push(call);
  const code=failure(call,calls);
  if(code){queueMicrotask(()=>this.emit('error',Object.assign(Error('controlled listen '+code),{code})));return this;}
  return listen.apply(this,args);
 };
 try{return await run(calls);}finally{net.Server.prototype.listen=listen;}
}
async function close(server){
 server.closeAllConnections?.();
 if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
async function canBind(port){
 const server=net.createServer();
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});assert.equal(server.address().port,port);}
 finally{await close(server);}
}
async function launcherHttp(calls,start=()=>startLauncher({noBrowser:true})){
 const before=new Map(['SIGINT','SIGTERM'].map(event=>[event,new Set(process.listeners(event))]));let launcher;
 try{
  launcher=await start();
  const url=new URL(launcher.url);
  assert.equal(url.hostname,'127.0.0.1');assert.ok(Number(url.port)>0);
  assert.equal(launcher.server.address().port,Number(url.port),'published URL uses the actual listening port');
  assert.ok(calls.length>0&&calls.length<=22,'startup uses a bounded number of bind attempts');
  assert.ok(calls.every(call=>call.server===launcher.server),'the real HTTP server owns every startup bind; no probe/release/rebind race');
  assert.equal(launcher.server.listenerCount('listening'),defaultListeningListeners,'failed bind attempts leave no extra listening callbacks');
  assert.equal(launcher.server.listenerCount('error'),defaultErrorListeners,'failed bind attempts leave no startup error callbacks');
  const response=await fetch(launcher.url);assert.equal(response.status,200);
  const page=await response.text();assert.ok(page.includes('罗德岛 · 作战终端'));assert.ok(page.includes(launcher.key));
  const status=await fetch(launcher.url+'/api/status',{headers:{'x-launcher-key':launcher.key}});
  assert.equal(status.status,200);assert.equal((await status.json()).phase,'idle');
 }finally{
  await launcher?.stop();
  for(const [event,listeners]of before)for(const listener of process.listeners(event))if(!listeners.has(listener))process.off(event,listener);
 }
}
async function main(){
 for(const code of ['EACCES','EADDRINUSE']){
  const port=await withListenFailures(call=>call.port?code:null,async calls=>{
   const port=await freePort(8100);
   assert.ok(port>0&&port<=65535);assert.ok(calls.some(call=>call.port===8100));
   assert.equal(calls.at(-1).port,0,'a denied or occupied preferred range falls back to an OS-selected port');
   assert.ok(calls.length<=22,'a reserved range cannot cause an unbounded port scan');
   // The helper is for external processes; unlike the home server it must release
   // the chosen port, which must be available for the next real listener.
   return port;
  });
  await canBind(port);
  await withListenFailures(call=>call.port?code:null,launcherHttp);
 }
 await withListenFailures(()=> 'EADDRNOTAVAIL',async calls=>{
  await assert.rejects(freePort(8100),{code:'EADDRNOTAVAIL'});
  assert.equal(calls.length,1,'unrelated network errors are not hidden by fallback');
 });
 await withListenFailures(()=> 'EACCES',async calls=>{
  await assert.rejects(freePort(0),{code:'EACCES'});
  assert.equal(calls.length,1,'a failure even on the system-selected port propagates without looping');
 });
 await withListenFailures(call=>call.port?'EACCES':null,async calls=>{
  await launcherHttp(calls,()=>createLauncher({port:65535}));
  assert.deepEqual(calls.map(call=>call.port),[65535,0],'fallback stops at the TCP port boundary');
 });
 await withListenFailures(()=>null,launcherHttp);
 await withListenFailures(call=>call.port?'EACCES':null,async calls=>{
  let room;
  try{
   room=await startRoom({host:'127.0.0.1',port:8003,open:false,report:()=>{}});
   assert.equal(calls[0].port,8003);assert.equal(calls.at(-1).port,0);
   assert.ok(calls.every(call=>call.server===room.server),'the host also binds its final HTTP server');
   assert.equal(Number(new URL(room.localUrl).port),room.server.address().port);
   assert.equal(room.port,room.server.address().port);
   const response=await fetch(room.localUrl);assert.equal(response.status,200);assert.match(await response.text(),/同盟大厅/);
   const info=await(await fetch(new URL('/api/room-info',room.localUrl))).json();assert.equal(info.capacity,4);
  }finally{if(room)await close(room.server);}
 });
 console.log('LAUNCHER PORT OK excluded/occupied port fallback, unrelated error propagation, same-server startup, actual home/host HTTP and authenticated status, loopback-only URL, clean shutdown');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
