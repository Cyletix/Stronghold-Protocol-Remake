'use strict';
// Actual HTTP handlers and VMs with a controllable clock. The metadata gate
// stalls a real game-sync queue; presence must remain independent of that queue.
const assert=require('node:assert/strict');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const runtime=require('./lib/room-game-runtime');
let clock=1000;const server=createRoomServer({now:()=>clock,maxGamePlayers:2});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const info=await(await fetch(base+'/api/game-info')).json();
 async function post(route,value,status=200){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,runId:1,catalog:info.catalog,...value})});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
 const host=(await post('/api/rooms',{name:'快速加载房主'},201)).session;
 const route=(s,op)=>'/api/rooms/'+s.roomCode+'/'+op;
 const guest=(await post(route(host,'join'),{name:'慢加载朋友'},201)).session;
 const seq=new Map([[host.playerId,0],[guest.playerId,0]]);
 async function lobby(s,command){const result=await post(route(s,'command'),{...s,sequence:seq.get(s.playerId)+1,command});seq.set(s.playerId,result.ack);return result;}
 const presence=(s,{runId=1,rendererReady=true,snapshotReady=true,...more}={})=>post(route(s,'presence'),{...s,runId,rendererReady,snapshotReady,catalog:undefined,...more});
 const source=info.seasons[0],mode=source.modes.find(x=>x.modeId==='mode_multi_normal');
 const config={seasonId:source.seasonId,modeId:mode.modeId,mapKey:mode.maps[0].mapKey,bandId:source.bands[0].bandId};
 await lobby(host,{type:'room/set-config',config:{seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey}});
 for(const s of [host,guest])await lobby(s,{type:'room/set-ready',ready:true});await lobby(host,{type:'room/start'});
 const learned=await presence(host,{runId:0,rendererReady:false,snapshotReady:false});assert.equal(learned.room.runId,1);assert.equal(learned.room.startup.active,true);assert.equal(learned.room.canCancelStart,true);
 await presence(host);await post(route(host,'game-enter'),{...host,config});
 // The friend's page has not reached its heavy game script for ninety seconds.
 for(let i=0;i<9;i++){clock+=10000;await presence(host);}
 const late=await presence(host);assert.equal(late.room.players.find(p=>p.id===guest.playerId).forfeited,false);assert.equal(late.room.connection.paused,true);assert.equal(late.room.lobbyPhase,'started');
 const recovered=await presence(guest,{runId:0,rendererReady:false,snapshotReady:false});assert.equal(recovered.room.runId,1);assert.equal(recovered.room.players.find(p=>p.id===guest.playerId).readOnly,false);
 await presence(guest);const entry=await post(route(guest,'game-enter'),{...guest,config});assert.equal(entry.player.state.session.phase,'rest');
 // A presence packet must not await catalogInfo or an older serialized request.
 const catalogInfo=runtime.catalogInfo;let release,blockedCalls=0;
 const gate=new Promise(resolve=>{release=resolve;});runtime.catalogInfo=()=>{blockedCalls++;return gate;};
 const blocked=post(route(host,'game-sync'),host);let settled=false;blocked.finally(()=>{settled=true;});
 try{
  for(let i=0;i<100&&!blockedCalls;i++)await delay(5);assert.ok(blockedCalls>0,'real game-sync has reached its pending metadata call');
  const started=Date.now();const cheap=await presence(guest,{snapshotReady:false});
  assert.ok(Date.now()-started<1000,'presence bypasses metadata and the game queue');assert.equal(settled,false);assert.equal(blockedCalls,1);
  assert.equal(cheap.room.connection.waitingPlayers.find(p=>p.id===guest.playerId).reason,'syncing');assert.ok(!('player'in cheap)&&!('game'in cheap));
  clock+=310000;const overdue=await presence(host);assert.equal(overdue.room.startup.overdue,true);assert.equal(overdue.room.canReturnToLobby,true);assert.equal(overdue.room.players.find(p=>p.id===guest.playerId).forfeited,false);
 }finally{runtime.catalogInfo=catalogInfo;release(info);await blocked;}
 await presence(guest);await presence(host);await delay(70);
 // Unknown/stale-run readiness must not regress a successfully loaded page.
 const stalePresence=await presence(guest,{runId:0,rendererReady:false,snapshotReady:false});assert.equal(stalePresence.room.connection.paused,false);
 for(const s of [host,guest]){const state=await post(route(s,'game-sync'),s);await post(route(s,'game-command'),{...s,sequence:1,expectedRevision:state.player.revision,command:{type:'game/ready',ready:true}});}
 const started=await post(route(host,'game-sync'),host);assert.equal(started.game.hasStarted,true);assert.equal(started.game.phase,'battle');assert.equal(started.room.canCancelStart,false);
 const syncing=await presence(guest,{snapshotReady:false});assert.equal(syncing.room.connection.paused,true);await delay(70);const frozen=(await post(route(host,'game-sync'),host)).player.state.battle.time;
 for(let i=0;i<7;i++){clock+=10000;await presence(host);await presence(guest,{snapshotReady:false});await delay(60);}
 const pending=await presence(host);assert.equal(pending.room.canReturnToLobby,true);assert.equal(pending.room.players.find(p=>p.id===guest.playerId).forfeited,false,'responsive client stuck syncing can recover; it is not a lost connection');
 assert.equal((await post(route(host,'game-sync'),host)).player.state.battle.time,frozen);
 await presence(guest);await delay(70);assert.equal((await presence(host)).room.connection.paused,false);
 // After the first battle has really started, an actual absent client retains
 // the existing 60-second disconnect grace and read-only recovery behavior.
 for(let i=0;i<8;i++){clock+=10000;await presence(host);await delay(10);}
 const disconnected=await presence(host);assert.equal(disconnected.room.players.find(p=>p.id===guest.playerId).forfeited,true);
 const readonly=await post(route(guest,'game-sync'),guest);assert.equal(readonly.player.state.session.phase,'over');
 for(const s of [host,guest])await post(route(s,'leave'),s);
 // Before the first battle, the host can cancel a long loading wait directly.
 const cancelHost=(await post('/api/rooms',{name:'取消加载'},201)).session,peer=(await post(route(cancelHost,'join'),{name:'等待队友'},201)).session;
 for(const s of [cancelHost,peer]){seq.set(s.playerId,0);await lobby(s,{type:'room/set-ready',ready:true});}await lobby(cancelHost,{type:'room/start'});
 const cancelled=await lobby(cancelHost,{type:'room/return-lobby'});assert.equal(cancelled.room.lobbyPhase,'waiting');assert.equal(cancelled.room.players.length,2);assert.ok(cancelled.room.players.every(p=>!p.ready&&!p.forfeited));
 for(const s of [cancelHost,peer])await post(route(s,'leave'),s);
 console.log('ROOM STARTUP OK >72s slow page recovery, >5min selectable startup, independent heartbeat during blocked game-sync, loaded/syncing pause, recovery without forfeiture, real battle timeout and startup cancellation');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
