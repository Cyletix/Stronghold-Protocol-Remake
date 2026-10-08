'use strict';
// Fetch the real HTML and execute its early script while the large scripts are
// deliberately not delivered. A fake clock crosses the old 72-second cutoff;
// every heartbeat still uses the real HTTP server and authentication path.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const runtime=require('./lib/room-game-runtime'),sources=require('../web/source_battles.json');
let clock=1000;const server=createRoomServer({now:()=>clock});const clients=[];
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  async function post(url,fields,status=200){const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,...fields})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;}
  const created=await post('/api/rooms',{name:'慢加载房主'},201),peer=await post('/api/rooms/'+created.session.roomCode+'/join',{name:'慢加载朋友'},201),code=created.session.roomCode;
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:1,command:{type:'room/set-config',config:{seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:sources.seasons.act1autochess.modes.mode_multi_normal.stageChoices[0].levelKey}}});
  for(const s of [created.session,peer.session])await post('/api/rooms/'+code+'/command',{...s,sequence:s===created.session?2:1,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:3,command:{type:'room/start'}});
  const html=await (await fetch(base+'/index.html?room='+code)).text(),scripts=[...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)];
  const presence=scripts.find(script=>script[1]==='room-presence.js');assert.ok(presence);
  assert.ok(scripts.filter(script=>script.index<presence.index).every(script=>script[1]==='launcher-window.js'),'only the lightweight launcher lifetime bridge may precede presence');
  assert.ok(presence.index<html.indexOf('<link rel="stylesheet"'),'slow CSS cannot postpone the first heartbeat');
  const earlySource=await (await fetch(base+'/'+presence[1])).text();
  function client(session,{versionOverride}={}){
    const elements=new Map(),events=new Map(),timers=new Map();let timerId=0,requests=0;
    function node(tag){let id='';const n={tagName:tag.toUpperCase(),children:[],style:{},hidden:false,textContent:'',setAttribute(){},append(...children){this.children.push(...children);}};Object.defineProperty(n,'id',{get:()=>id,set:value=>{id=value;elements.set(value,n);}});return n;}
    const context={URL,URLSearchParams,AbortController,console,Date:class extends Date{static now(){return clock;}},location:{href:base+'/index.html?room='+code,reload(){}},
      sessionStorage:{getItem:()=>JSON.stringify({session})},document:{documentElement:node('html'),createElement:node},
      addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
      setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id),
      fetch:(url,options)=>{requests++;if(versionOverride){const payload=JSON.parse(options.body);payload.gameVersion=versionOverride;options={...options,body:JSON.stringify(payload)};}return fetch(new URL(url,base),options);}};
    context.window=context;vm.createContext(context);vm.runInContext(earlySource,context,{filename:scripts[0][1]});
    const run=text=>vm.runInContext(text,context),get=text=>JSON.parse(run('JSON.stringify('+text+')'));
    const c={run,get,elements,requests:()=>requests,idle:()=>run('ArkRoomPresence.whenIdle()'),tick:async()=>{for(const [id,timer] of [...timers])if(timer.at<=clock&&timers.has(id)){timers.delete(id);await timer.fn();}},stop:()=>{for(const fn of events.get('pagehide')||[])fn();},fire:(event,fields)=>{for(const fn of events.get(event)||[])fn(fields);}};clients.push(c);return c;
  }
  const host=client(created.session),friend=client(peer.session);await Promise.all([host.idle(),friend.idle()]);
  for(let step=0;step<45;step++){clock+=2000;await Promise.all([host.tick(),friend.tick()]);}
  const stillLoading=await post('/api/rooms/'+code+'/sync',created.session);
  assert.ok(clock>72000);assert.ok(friend.requests()>=45,'the real early script independently sends heartbeat throughout slow parser loading');
  assert.ok(stillLoading.room.players.every(p=>p.connected&&!p.forfeited),'90 seconds of undelivered game scripts must not expel either participant');
  assert.equal(stillLoading.room.startup.phase,'loading');assert.match(friend.elements.get('room-loading-title').textContent,/正在加载战场资源/);

  // Metadata and game-enter can both wait in their own async work. A cheap
  // presence request must still complete while those full operations wait.
  const originalInfo=runtime.catalogInfo;let unlockInfo,infoStarted;
  const infoEntered=new Promise(resolve=>{infoStarted=resolve;}),infoGate=new Promise(resolve=>{unlockInfo=resolve;});
  runtime.catalogInfo=async()=>{infoStarted();await infoGate;return originalInfo();};
  const delayedInfo=fetch(base+'/api/game-info');await infoEntered;
  clock+=2000;await Promise.all([host.tick(),friend.tick()]);assert.equal(friend.get('ArkRoomPresence.status().online'),true,'catalog loading cannot serialize cheap presence');
  unlockInfo();const info=await (await delayedInfo).json();runtime.catalogInfo=originalInfo;
  const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:sources.seasons.act1autochess.modes.mode_multi_normal.stageChoices[0].levelKey,bandId:'band_amiya'};
  for(const c of [host,friend])c.run('ArkRoomPresence.update({runId:1,rendererReady:true,snapshotReady:false})');
  clock+=2000;await Promise.all([host.tick(),friend.tick()]);
  const originalCreate=runtime.createPlayerRuntime;let unlockRuntime,runtimeStarted;
  const runtimeEntered=new Promise(resolve=>{runtimeStarted=resolve;}),runtimeGate=new Promise(resolve=>{unlockRuntime=resolve;});
  runtime.createPlayerRuntime=async(...args)=>{runtimeStarted();await runtimeGate;return originalCreate(...args);};
  const delayedEnter=post('/api/rooms/'+code+'/game-enter',{...created.session,runId:1,catalog:info.catalog,config});await runtimeEntered;
  for(let step=0;step<40;step++){clock+=2000;await Promise.all([host.tick(),friend.tick()]);}
  assert.ok(friend.requests()>=85);assert.equal(friend.get('ArkRoomPresence.status().online'),true,'a queued runtime creation cannot interrupt presence');
  unlockRuntime();const enteredHost=await delayedEnter;runtime.createPlayerRuntime=originalCreate;
  assert.equal(enteredHost.player.state.session.money,4);host.run('ArkRoomPresence.update({runId:1,rendererReady:true,snapshotReady:true})');
  const enteredFriend=await post('/api/rooms/'+code+'/game-enter',{...peer.session,runId:1,catalog:info.catalog,config});
  assert.equal(enteredFriend.player.state.session.phase,'rest');friend.run('ArkRoomPresence.update({runId:1,rendererReady:true,snapshotReady:true})');
  clock+=2000;await Promise.all([host.tick(),friend.tick()]);
  const ready=await post('/api/rooms/'+code+'/game-sync',{...created.session,catalog:info.catalog});assert.equal(ready.room.connection.paused,false,'ready renderer and full snapshot release the loading barrier');
  assert.ok(ready.game.players.every(p=>p.entered&&!p.forfeited));

  friend.fire('error',{target:{tagName:'SCRIPT'}});assert.equal(friend.elements.get('room-loading-presence').hidden,true,'unrelated later resource errors do not claim renderer initialization failed');
  friend.run("ArkRoomPresence.loadingFailed(new Error('测试资源未加载完整'))");assert.match(friend.elements.get('room-loading-title').textContent,/资源加载失败/);assert.equal(friend.elements.get('room-loading-presence').children[3].hidden,false,'resource failure has a visible reload exit');
  const wrong=client(peer.session,{versionOverride:'old-game-build'});await wrong.idle();assert.equal(wrong.get('ArkRoomPresence.status().fatal'),true);assert.match(wrong.elements.get('room-loading-title').textContent,/版本不一致/,'version incompatibility must not be presented as random network loss');
  const beforeStop=friend.requests();friend.stop();clock+=90000;await friend.tick();assert.equal(friend.requests(),beforeStop,'closing or navigating away stops presence; there is no invisible perpetual keeper');
  host.stop();wrong.stop();
  console.log('ROOM PRESENCE OK real HTML-before-CSS bootstrap, 90-second blocked script loading, 80-second serialized runtime loading, independent authenticated HTTP heartbeats, complete-snapshot handoff, visible resource/version errors and pagehide shutdown');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{for(const c of clients)c.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
