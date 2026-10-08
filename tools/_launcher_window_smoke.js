'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createLauncher}=require('./room-launcher'),{runOnline,freePort}=require('./room-online');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let n=0;n<160;n++){if(await check())return;await pause(50);}throw Error('Timeout: '+label);}
async function page(l,token,origin=l.url){return new Promise((resolve,reject)=>{const req=http.get(l.url+'/api/window?token='+token,{headers:{Origin:origin},agent:false},res=>{if(res.statusCode!==200){res.resume();return reject(Error('Window rejected '+res.statusCode));}res.once('data',()=>resolve(()=>{res.destroy();req.destroy();}));});req.once('error',reject);});}
async function token(l){const html=await(await fetch(l.url)).text();return html.match(/name="launcher-window" content="([a-f0-9]{48})"/)[1];}
async function api(l,route='/api/status',method='GET',body){const res=await fetch(l.url+route,{method,headers:{'x-launcher-key':l.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(res.status,method==='POST'&&route==='/api/session'?202:200);return res.json();}
async function main(){
 const profiles=fs.mkdtempSync(path.resolve('.runtime/window-smoke-')),launchers=[],pages=[];let core;
 try{
  const port=await freePort();let exits=0;
  const host=await createLauncher({profileRoot:profiles,browserLifetime:true,windowGraceMs:250,windowStartupMs:10000,onBrowserExit:()=>exits++,peers:['tcp://127.0.0.1:'+port],coreOptions:{isolated:true,listener:'tcp://127.0.0.1:'+port},connect:async options=>{const running=await runOnline(options);core=running.core.child;return running;}});launchers.push(host);
  const t=await token(host);
  assert.equal((await fetch(host.url+'/api/window?token=wrong')).status,403);
  assert.equal((await fetch(host.url+'/api/window?token='+t,{headers:{Origin:'https://example.com'}})).status,403);
  const first=await page(host,t),second=await page(host,t);pages.push(first,second);
  await api(host,'/api/session','POST',{action:'create',name:'页面退出验收'});
  let state;await until(async()=>{state=await api(host);if(state.phase==='error')throw Error(state.message);return state.phase==='ready';},'real EasyTier ready');
  const childPid=core.pid;
  const payload=JSON.parse(Buffer.from(new URLSearchParams(new URL(state.url).hash.slice(1)).get('launch'),'base64url'));
  assert.equal(payload.windowToken,t);
  first();await pause(350);assert.equal(core.exitCode,null,'another page keeps the tunnel alive');
  second();await pause(80);
  const gamePage=await page(host,t,new URL(state.url).origin);pages.push(gamePage);
  await pause(550);assert.equal(core.pid,childPid);assert.equal(core.exitCode,null,'navigation reconnects without respawning EasyTier');
  assert.equal(exits,0,'an open stream works without browser heartbeat timers');
  gamePage();await until(()=>exits===1,'last page cleanup');assert.equal(host.server.listening,false);assert.ok(core.exitCode!==null||core.signalCode!==null,'actual owned EasyTier exited');assert.throws(()=>process.kill(childPid,0),'owned EasyTier PID no longer exists');
  await host.stop();assert.equal(exits,1,'cleanup is idempotent');
  const never=await createLauncher({browserLifetime:true,windowStartupMs:150,windowGraceMs:100});launchers.push(never);await until(()=>!never.server.listening,'no browser startup timeout');
  let aborted=false;
  const pending=await createLauncher({profileRoot:profiles,browserLifetime:true,windowGraceMs:150,connect:({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true});})});launchers.push(pending);
  const endPending=await page(pending,await token(pending));pages.push(endPending);await api(pending,'/api/session','POST',{action:'create',name:'等待时退出'});endPending();await until(()=>!pending.server.listening,'pending creation cleanup');assert.ok(aborted);
  // Early browser bridge preserves its own handoff across lobby/game storage writes.
  const source=fs.readFileSync(path.resolve('web/launcher-window.js'),'utf8'),listeners={},saved=new Map();let opened=0,closed=0;
  const context={EventSource:class{constructor(url){assert.match(url,/127\.0\.0\.1/);opened++;}close(){closed++;}},URLSearchParams,atob,location:{origin:host.url,hash:''},document:{querySelector:()=>({content:t})},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},window:{addEventListener:(name,fn)=>listeners[name]=fn}};
  vm.runInNewContext(source,context);assert.equal(opened,1);assert.ok(!listeners.visibilitychange);listeners.pagehide();assert.equal(closed,1);listeners.pageshow();assert.equal(opened,2);listeners.pageshow();assert.equal(opened,2);
  context.document.querySelector=()=>null;context.location={origin:new URL(state.url).origin,hash:new URL(state.url).hash};vm.runInNewContext(source,context);assert.equal(opened,3);
  context.location.hash='';vm.runInNewContext(source,context);assert.equal(opened,4,'refresh recovers lifecycle independently of room session');
  console.log('LAUNCHER WINDOW OK: actual EasyTier stopped after last page, two tabs, navigation grace, background stream, startup timeout, cancel during connect, origin/token guards, browser lifecycle restore');
 }finally{for(const close of pages)close();await Promise.all(launchers.map(l=>l.stop()));const config=path.join(profiles,'user-config.json');if(fs.existsSync(config))fs.unlinkSync(config);fs.rmdirSync(profiles);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
