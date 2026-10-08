'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION}=require('./room_server');
let clock=1000;const server=createRoomServer({now:()=>clock,disconnectAfterMs:12000,reconnectGraceMs:120000});
async function main(){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  async function post(url,fields,status=200,options={}){
    const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...options.headers},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...fields})});
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
  }
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/同盟大厅/);
  const info=await(await fetch(base+'/api/room-info')).json();assert.equal(info.capacity,4);assert.equal(info.clientVersion,CLIENT_VERSION);
  const created=await post('/api/rooms',{name:'玩家一'},201),code=created.session.roomCode;
  const duplicates=await post('/api/rooms',{name:'同名博士'},201),duplicateCode=duplicates.session.roomCode;
  const dup2=await post('/api/rooms/'+duplicateCode+'/join',{name:'同名博士'},201);
  const dup3=await post('/api/rooms/'+duplicateCode+'/join',{name:'同名博士'},201);
  assert.deepEqual(dup3.room.players.map(p=>p.name),['同名博士','同名博士 #2','同名博士 #3']);
  const profileCommand={...dup2.session,sequence:1,command:{type:'room/set-profile',name:'同名博士',portrait:'char_102_texas'}};
  const renamed=await post('/api/rooms/'+duplicateCode+'/command',profileCommand);
  assert.equal(renamed.room.players.find(p=>p.id===dup2.session.playerId).name,'同名博士 #2','repeat name sync does not grow suffixes');
  const retried=await post('/api/rooms/'+duplicateCode+'/command',profileCommand);assert.deepEqual(retried.room.players.map(p=>p.name),renamed.room.players.map(p=>p.name));
  const sessions=[created.session];
  for(const name of ['玩家二','玩家三','玩家四'])sessions.push((await post('/api/rooms/'+code+'/join',{name},201)).session);
  assert.equal(new Set(sessions.map(s=>s.playerId)).size,4,'four separate identities');
  assert.equal(new Set(sessions.map(s=>s.token)).size,4,'four separate credentials');
  const route=(s,operation)=>'/api/rooms/'+s.roomCode+'/'+operation;
  async function sync(s){return post(route(s,'sync'),s);}
  async function ready(s,sequence,value){return post(route(s,'command'),{...s,sequence,command:{type:'room/set-ready',ready:value}});}
  const pairing=(await sync(sessions[0])).room.pairingPreview;
  assert.equal(pairing.groups.length,2);assert.ok(pairing.groups.every(g=>g.seats.length===2));
  assert.deepEqual(pairing.groups.flatMap(g=>g.seats.map(s=>s.playerId)).sort(),sessions.map(s=>s.playerId).sort());
  for(const s of sessions){const v=await sync(s);assert.equal(v.room.players.length,4);assert.ok(v.room.players.every(p=>!('token'in p)&&!('tokenHash'in p)));}
  await post('/api/rooms/'+code+'/join',{name:'第五人'},409);
  for(const s of sessions)await ready(s,1,true);
  for(const s of sessions){const room=(await sync(s)).room;assert.equal(room.allReady,true,'all four receive readiness');assert.deepEqual(room.pairingPreview,pairing,'ready and heartbeat do not change pairings');}
  await ready(sessions[1],2,false);
  for(const s of sessions)assert.equal((await sync(s)).room.allReady,false,'cancel broadcasts to every participant');
  const original=await ready(sessions[1],3,true),duplicate=await ready(sessions[1],3,true);
  assert.equal(duplicate.applied,false);assert.equal(duplicate.room.revision,original.room.revision,'duplicate command does not mutate');
  await post(route(sessions[1],'command'),{...sessions[1],sequence:3,command:{type:'room/set-ready',ready:false}},409);
  await post(route(sessions[1],'command'),{...sessions[1],sequence:5,command:{type:'room/set-ready',ready:false}},409);
  await post(route(sessions[1],'command'),{...sessions[1],sequence:4,command:{type:'session/patch',money:999}},400);
  await post(route(sessions[1],'command'),{...sessions[1],sequence:4,command:{type:'game/eliminate',playerId:sessions[0].playerId,life:0}},400);

  const other=(await post('/api/rooms',{name:'另一个房间'},201)).session;
  await post(route(sessions[0],'sync'),{...other,roomCode:code},401);
  await post(route(sessions[0],'sync'),{...sessions[0],token:sessions[1].token},401);
  assert.equal((await sync(other)).room.players.length,1,'room lists remain isolated');
  const mismatch=await post(route(sessions[0],'sync'),{...sessions[0],clientVersion:'old'},409);assert.equal(mismatch.error,'VERSION_MISMATCH');
  await post(route(sessions[0],'sync'),sessions[0],403,{headers:{Origin:'https://unrelated.example'}});
  await post(route(sessions[0],'sync'),sessions[0],200,{headers:{Origin:base}});
  await post('/api/rooms',{name:'bad'.repeat(2000)},413);
  await post('/api/rooms',{name:''},400);
  for(const file of ['/tools/room_server.js','/data/data.db','/.git/config','/%2e%2e%2ftools/room_server.js','/%2e%2e%5ctools/room_server.js'])assert.equal((await fetch(base+file)).status,404,'no repository access: '+file);
  assert.equal((await fetch(base+'/room-lab.html',{method:'PUT',body:'overwrite'})).status,405);

  // Keep three players active; player four misses the heartbeat deadline.
  clock+=11000;for(const s of sessions.slice(0,3))await sync(s);
  clock+=1500;const dropped=await sync(sessions[0]);
  const fourth=dropped.room.players.find(p=>p.id===sessions[3].playerId);assert.equal(fourth.connected,false);assert.equal(fourth.ready,false);assert.equal(dropped.room.allReady,false);
  assert.deepEqual(dropped.room.pairingPreview,pairing,'temporary disconnection is not elimination');
  await post('/api/rooms/'+code+'/join',{name:'不能抢占离线席位'},409);
  const reconnected=await sync(sessions[3]);assert.equal(reconnected.room.players.length,4);assert.equal(reconnected.room.players.find(p=>p.id===sessions[3].playerId).connected,true);assert.equal(reconnected.ack,1,'reconnect keeps accepted command sequence');
  assert.deepEqual(reconnected.room.pairingPreview,pairing,'reconnect preserves side assignment');
  await ready(sessions[3],2,true);assert.equal((await sync(sessions[0])).room.allReady,true);

  await post(route(sessions[2],'leave'),sessions[2]);
  const afterLeave=(await sync(sessions[0])).room;assert.equal(afterLeave.players.length,3);
  assert.equal(afterLeave.pairingPreview.groups.flatMap(g=>g.seats).length,3);assert.ok(!afterLeave.pairingPreview.groups.flatMap(g=>g.seats).some(s=>s.playerId===sessions[2].playerId));
  await post(route(sessions[2],'sync'),sessions[2],401);
  const replacement=(await post('/api/rooms/'+code+'/join',{name:'替补玩家'},201)).session;
  assert.notEqual(replacement.playerId,sessions[2].playerId);assert.equal((await sync(replacement)).room.players.length,4);
  // Expire the replaced player's old peers but keep the new one connected.
  clock+=131000;await sync(replacement);clock+=2000;const cleaned=await sync(replacement);
  assert.equal(cleaned.room.players.length,1,'expired offline seats are removed');
  assert.equal(cleaned.room.pairingPreview.groups.length,1);assert.deepEqual(cleaned.room.pairingPreview.groups[0].seats,[{playerId:replacement.playerId,side:'left'}]);
  await post(route(sessions[0],'sync'),sessions[0],401);
  await post(route(other,'sync'),other,404);
  await post(route(replacement,'leave'),replacement);
  await post(route(replacement,'sync'),replacement,404);

  // Four isolated DOM/sessionStorage contexts run the actual browser script over HTTP.
  const browserSource=fs.readFileSync(path.join(__dirname,'../web/room-lab.js'),'utf8');
  async function browser(storage=new Map(),inspectRestore=null){
    const elements=new Map();let connected=true,inspectedSync=false;
    const node=()=>({value:'',textContent:'',children:[],append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},select(){}});
    const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
    const context={console,URL,AbortController,performance,location:{href:base+'/room-lab.html'},
      document:{getElementById:el,createElement:node,addEventListener(){},hidden:false},
      sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      fetch:async(url,options)=>{
        if(!connected)throw new TypeError('Network unavailable');
        const target=new URL(url,base),response=await fetch(target,options);
        // Hold the first real sync response before the page can consume it.
        // This exposes the saved-session loading frame, not a synthetic room.
        if(inspectRestore&&!inspectedSync&&target.pathname.endsWith('/sync')){inspectedSync=true;await inspectRestore('sync-pending',el,code=>vm.runInContext(code,context));}
        return response;
      },addEventListener(){},
      setTimeout:(fn,ms)=>ms===2000?0:setTimeout(fn,ms),clearTimeout};
    context.window=context;vm.createContext(context);vm.runInContext(browserSource,context);
    if(inspectRestore)inspectRestore('initial-render',el,code=>vm.runInContext(code,context));
    const deadline=Date.now()+3000;
    while(!vm.runInContext('serviceReady && (!session || online)',context)){
      if(Date.now()>deadline)throw Error('Browser client failed initialization: '+el('status').textContent);
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    return {el,storage,run:code=>vm.runInContext(code,context),location:()=>context.location.href,sync:()=>vm.runInContext('sync()',context),disconnect:()=>{connected=false;},reconnect:()=>{connected=true;}};
  }
  const browsers=[];
  for(let i=0;i<4;i++){
    const b=await browser();b.el('name').value='浏览器 '+(i+1);
    if(i===0)await b.el('create').onclick();
    else{b.el('room-code').value=browsers[0].el('code').textContent;await b.el('join').onclick();}
    assert.equal(b.el('room').hidden,false);browsers.push(b);
    if(i===0){
      assert.equal(b.el('enter-game').textContent,'开始协议');assert.equal(b.el('enter-game').disabled,false,'one member can start from the room');assert.equal(b.el('ready').hidden,true,'solo start does not need a redundant ready click');
      const oldMap=b.el('room-map').value,newMap=b.run('gameCatalog.seasons.find(s=>s.seasonId===room.settings.seasonId).modes.find(m=>m.modeId===roomModeId(room.settings.modeId)).maps.find(m=>m.mapKey!==room.settings.mapKey).mapKey');
      b.disconnect();b.el('room-map').value=newMap;await b.el('room-map').onchange();b.reconnect();await b.sync();
      assert.equal(b.el('room-map').value,oldMap,'failed configuration POST cannot leave a falsely selected map');
    }
  }
  for(const b of browsers)await b.sync();
  assert.equal(browsers[0].el('room-map').disabled,false,'host edits the map in the room');
  for(const b of browsers.slice(1))assert.equal(b.el('room-map').disabled,true,'guest configuration is read-only');
  for(const b of browsers)await b.el('ready').onclick();
  const newMap=browsers[0].run('gameCatalog.seasons.find(s=>s.seasonId===room.settings.seasonId).modes.find(m=>m.modeId===roomModeId(room.settings.modeId)).maps.find(m=>m.mapKey!==room.settings.mapKey).mapKey');
  browsers[0].el('room-map').value=newMap;await browsers[0].el('room-map').onchange();
  for(const b of browsers){await b.sync();assert.equal(b.el('room-map').value,newMap,'room settings propagate to every client');assert.equal(b.el('ready').textContent,'准备就绪','a changed map resets everyone’s readiness');assert.match(b.location(),/room-lab\.html$/,'editing the map never starts the game');}
  for(const b of browsers){await b.sync();assert.equal(b.el('players').children.length,4);await b.el('ready').onclick();}
  for(const b of browsers){await b.sync();assert.match(b.el('readiness').textContent,/全员已就绪/);assert.equal(b.el('ready').textContent,'取消准备');}
  assert.equal(browsers[0].el('enter-game').disabled,false,'ready host can launch');
  for(const b of browsers.slice(1))assert.equal(b.el('enter-game').disabled,true,'guests wait for host');
  await browsers[2].el('ready').onclick();
  for(const b of browsers){await b.sync();assert.match(b.el('readiness').textContent,/等待成员准备/);}
  const oldIdentity=JSON.parse(browsers[2].storage.values().next().value).session.playerId;
  const refreshed=await browser(browsers[2].storage);
  assert.equal(JSON.parse(refreshed.storage.values().next().value).session.playerId,oldIdentity,'page refresh restores identity');
  assert.equal(refreshed.el('players').children.length,4,'refresh does not occupy another seat');
  assert.equal(refreshed.el('ready').textContent,'准备就绪','cancelled readiness survives refresh');
  const invitation=new URL(refreshed.el('share').value);assert.deepEqual([...invitation.searchParams.keys()],['room'],'shared link never includes player credentials');
  await refreshed.el('invite-copy').onclick();assert.equal(refreshed.el('invite-details').open,true,'HTTP clipboard fallback exposes the invitation field');
  await refreshed.el('leave').onclick();assert.equal(refreshed.el('entry').hidden,false);assert.equal(refreshed.storage.size,0);
  await browsers[0].sync();assert.equal(browsers[0].el('players').children.filter(p=>!p.className.includes('empty')).length,3);
  await browsers[0].el('enter-game').onclick();
  for(const i of [0,1,3]){await browsers[i].sync();assert.match(browsers[i].location(),/index.html\?room=/,'host launch transitions every waiting client');}
  const restoreFrames=[];
  const returned=await browser(browsers[0].storage,(stage,el,run)=>{
    restoreFrames.push(stage);assert.equal(run('room'),null,'the inspection runs before an authoritative room arrives');
    assert.equal(el('room').hidden,true,'saved-session restore must not show a fake empty room');assert.equal(el('entry').hidden,true,'restoration must not expose create/join controls');
    assert.equal(el('scope-note').hidden,true);assert.equal(el('room-help').hidden,true,'loading is not evidence of an old server');assert.equal(el('enter-game').disabled,true);
    assert.equal(el('players').children.length,0,'no placeholder 0/4 room is rendered during restore');assert.doesNotMatch(el('status').textContent,/旧版|重启房间服务|已连接/);
    if(stage==='sync-pending')assert.match(el('status').textContent,/正在恢复房间/,'the real response is pending while the UI reports restoration');
  });
  assert.deepEqual(restoreFrames,['initial-render','sync-pending']);assert.equal(returned.el('room').hidden,false);assert.equal(returned.el('players').children.filter(p=>!p.className.includes('empty')).length,3,'restored membership replaces the loading frame');
  assert.match(returned.location(),/room-lab.html$/,'return to started lobby does not redirect in a loop');assert.equal(returned.el('enter-game').textContent,'返回本局');
  for(const i of [0,1,3])await browsers[i].el('leave').onclick();
  const trainingHost=await browser();trainingHost.el('name').value='训练配置';await trainingHost.el('create').onclick();trainingHost.el('room-difficulty').value='mode_training_1';await trainingHost.el('room-difficulty').onchange();
  assert.equal(trainingHost.el('enter-game').disabled,false,'training is available alone');
  const trainingGuest=await browser();trainingGuest.el('name').value='后来加入';trainingGuest.el('room-code').value=trainingHost.el('code').textContent;await trainingGuest.el('join').onclick();await trainingHost.sync();
  assert.equal(trainingHost.el('enter-game').disabled,true,'a second member invalidates the solo-only training selection');assert.match(trainingHost.el('settings-summary').textContent,/不支持当前人数/);
  trainingHost.el('room-difficulty').value='mode_multi_funny';await trainingHost.el('room-difficulty').onchange();for(const b of [trainingHost,trainingGuest]){await b.sync();await b.el('ready').onclick();}await trainingHost.sync();assert.equal(trainingHost.el('enter-game').disabled,false,'host can select a supported multiplayer difficulty');
  for(const b of [trainingGuest,trainingHost])await b.el('leave').onclick();
  const offline=await browser();offline.el('name').value='离线退出';await offline.el('create').onclick();offline.disconnect();
  await offline.el('leave').onclick();assert.equal(offline.storage.size,0);assert.equal(offline.el('entry').hidden,false);assert.match(offline.el('status').textContent,/服务器未确认/);
  // Host permissions, stable four slots, membership locking and launch dedup.
  const host=(await post('/api/rooms',{name:'房主',portrait:'char_1012_skadi2'},201)).session;
  const mate1=(await post(route(host,'join'),{name:'成员一'},201)).session;
  const mate2=(await post(route(host,'join'),{name:'成员二'},201)).session;
  const lobbyCmd=(s,n,command,status=200)=>post(route(s,'command'),{...s,sequence:n,command},status);
  assert.equal((await sync(host)).room.hostId,host.playerId);
  assert.equal((await sync(host)).room.players[0].portrait,'char_1012_skadi2');
  await post('/api/rooms',{name:'错误立绘',portrait:'../secret'},400);
  await lobbyCmd(host,1,{type:'room/start'},409);
  await lobbyCmd(mate1,1,{type:'room/start'},403);
  await lobbyCmd(mate1,1,{type:'room/kick',playerId:host.playerId},403);
  await lobbyCmd(host,1,{type:'room/kick',playerId:host.playerId},400);
  await lobbyCmd(host,1,{type:'room/kick',playerId:mate1.playerId});
  await lobbyCmd(host,1,{type:'room/kick',playerId:mate1.playerId});
  await post(route(mate1,'sync'),mate1,401);
  assert.equal((await sync(host)).room.players.find(p=>p.id===mate2.playerId).slot,2,'middle departure does not shift another card');
  const mate3=(await post(route(host,'join'),{name:'填补空位'},201)).session;
  assert.equal((await sync(host)).room.players.find(p=>p.id===mate3.playerId).slot,1);
  await ready(host,2,true);await ready(mate2,1,true);await ready(mate3,1,true);
  const launched=await lobbyCmd(host,3,{type:'room/start'});assert.equal(launched.room.lobbyPhase,'started');
  const replay=await lobbyCmd(host,3,{type:'room/start'});assert.equal(replay.applied,false);assert.equal(replay.room.revision,launched.room.revision);
  await post(route(host,'join'),{name:'中途加入'},409);
  await lobbyCmd(mate2,2,{type:'room/set-ready',ready:false},409);
  await post(route(host,'leave'),host);assert.equal((await sync(mate2)).room.hostId,mate2.playerId,'host ownership transfers on leave');
  for(const s of [mate2,mate3])await post(route(s,'leave'),s);
  console.log('ROOM LOBBY OK four actual browser-script clients over HTTP; rooms/ready/cancel/reload/leave, isolation/capacity, sequence dedup, version/auth/origin, offline/reconnect/expiry and web-only static serving');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
