'use strict';
// Real HTTP service and game VMs; a controlled wall clock exercises deadlines
// without making this regression wait for a minute per disconnection.
const assert=require('node:assert/strict');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const sources=require('../web/source_battles.json');
let clock=1000;
const server=createRoomServer({now:()=>clock,disconnectAfterMs:12000,reconnectGraceMs:60000,maxGamePlayers:2});
const wait=()=>new Promise(resolve=>setTimeout(resolve,70));
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const info=await(await fetch(base+'/api/game-info')).json();
 const portraits=(await(await fetch(base+'/api/portraits')).json()).portraits;assert.ok(portraits.length>4);
 async function post(url,data,status=200){
  const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,runId:1,catalog:info.catalog,...data})});
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
 }
 const host=(await post('/api/rooms',{name:'生命周期房主',portrait:portraits[5].id},201)).session;
 const route=(s,op)=>'/api/rooms/'+s.roomCode+'/'+op;
 const guest=(await post(route(host,'join'),{name:'生命周期成员',portrait:portraits[6].id},201)).session;
 const sequences=new Map([[host.playerId,0],[guest.playerId,0]]);
 async function lobby(s,command,status=200){const sequence=sequences.get(s.playerId)+1;const result=await post(route(s,'command'),{...s,sequence,command},status);if(status===200)sequences.set(s.playerId,result.ack);return result;}
 const sync=s=>post(route(s,'game-sync'),s);
 const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:sources.seasons.act1autochess.modes.mode_multi_normal.stageChoices[0].levelKey,bandId:'band_amiya'};
 await lobby(host,{type:'room/set-ready',ready:true});
 const edited=await lobby(host,{type:'room/set-profile',name:'新房主名',portrait:portraits[9].id});
 assert.equal(edited.room.players[0].name,'新房主名');assert.equal(edited.room.players[0].portrait,portraits[9].id);assert.equal(edited.room.players[0].ready,false,'changing profile cancels readiness');
 await lobby(guest,{type:'room/set-profile',name:'坏路径',portrait:'../../secret'},400);
 await lobby(host,{type:'room/set-config',config:{seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey}});
 for(const s of [host,guest])await lobby(s,{type:'room/set-ready',ready:true});
 await lobby(host,{type:'room/start'});
 assert.equal((await sync(host)).room.canCancelStart,true);
 await lobby(guest,{type:'room/return-lobby'},403);
 await lobby(host,{type:'room/set-profile',name:'本局改名',portrait:portraits[8].id},409);
 for(const s of [host,guest])await post(route(s,'game-enter'),{...s,config});
 clock+=250;await wait();const preparing=await sync(host),remaining=preparing.player.state.session.prepareRemaining;
 // Keep the host alive, then let only the guest cross the missed-heartbeat line.
 clock+=11000;await sync(host);clock+=1500;
 const waiting=await sync(host);assert.equal(waiting.room.connection.paused,true);assert.equal(waiting.room.connection.waitingPlayers[0].id,guest.playerId);
 await wait();const frozen=(await sync(host)).player.state.session.prepareRemaining;
 const blocked=await post(route(host,'game-command'),{...host,sequence:1,expectedRevision:waiting.player.revision,command:{type:'game/freeze'}},409);assert.equal(blocked.error,'CONNECTION_WAIT');
 for(let i=0;i<3;i++){clock+=10000;await sync(host);await wait();assert.equal((await sync(host)).player.state.session.prepareRemaining,frozen,'preparation remains frozen for all participants');}
 assert.ok(frozen<=remaining);
 const rejoined=await sync(guest);assert.equal(rejoined.room.connection.paused,false);assert.equal(rejoined.ack,0);assert.equal(rejoined.room.players.length,2);
 await wait();const resumed=(await sync(host)).player.state.session.prepareRemaining;clock+=250;await wait();
 assert.ok(Math.abs((await sync(host)).player.state.session.prepareRemaining-(resumed-.25))<1e-7,'reconnection must discard paused wall-clock debt');
 for(const s of [host,guest]){const state=await sync(s);await post(route(s,'game-command'),{...s,sequence:1,expectedRevision:state.player.revision,command:{type:'game/ready',ready:true}});}
 assert.equal((await sync(host)).game.phase,'battle');clock+=250;await wait();
 clock+=11000;await sync(host);clock+=1500;assert.equal((await sync(host)).room.connection.paused,true);await wait();
 const battleTime=(await sync(host)).player.state.battle.time;
 for(let i=0;i<7;i++){clock+=9000;await sync(host);await wait();if(i<6)assert.equal((await sync(host)).player.state.battle.time,battleTime,'automatic combat pauses through the grace period');}
 const timedOut=await sync(host),forfeited=timedOut.game.players.find(p=>p.playerId===guest.playerId);
 assert.equal(forfeited.forfeited,true);assert.equal(forfeited.readOnly,true);assert.equal(forfeited.life,0);assert.equal(timedOut.room.connection.paused,false);assert.equal(timedOut.room.players.length,2,'timeout retains identity instead of silently removing a participant');
 const recovered=await sync(guest);assert.equal(recovered.player.state.session.phase,'over');assert.equal(recovered.ack,1);
 const rejected=await post(route(guest,'game-command'),{...guest,sequence:2,expectedRevision:recovered.player.revision,command:{type:'game/freeze'}},409);assert.equal(rejected.error,'PLAYER_FORFEITED');
 const watched=await post(route(guest,'game-sync'),{...guest,viewPlayerId:host.playerId});assert.equal(watched.viewPlayerId,host.playerId);
 // No clients remain reachable: the run finishes instead of a permanent barrier.
 clock+=73000;const ended=await sync(host);assert.equal(ended.game.phase,'over');assert.equal(ended.room.lobbyPhase,'finished');assert.equal(ended.room.canReturnToLobby,true);assert.equal(ended.player.state.session.phase,'over');
 // The old room keeps its finished snapshots but must release both VMs now,
 // even before anybody presses return-to-lobby (global capacity is only two).
 const otherHost=(await post('/api/rooms',{name:'释放容量验证'},201)).session;
 const otherGuest=(await post(route(otherHost,'join'),{name:'容量队友'},201)).session;
 sequences.set(otherHost.playerId,0);await lobby(otherHost,{type:'room/set-config',config:{seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey}});
 for(const s of [otherHost,otherGuest]){if(!sequences.has(s.playerId))sequences.set(s.playerId,0);await lobby(s,{type:'room/set-ready',ready:true});}
 await lobby(otherHost,{type:'room/start'});
 for(const s of [otherHost,otherGuest])await post(route(s,'game-enter'),{...s,config});
 const finalRecovered=await sync(guest);assert.equal(finalRecovered.player.state.session.phase,'over');assert.equal(finalRecovered.game.players.find(p=>p.playerId===guest.playerId).entered,true);
 assert.deepEqual((await sync(host)).player.state,ended.player.state,'released VMs retain an immutable ended snapshot');
 for(const s of [otherHost,otherGuest])await post(route(s,'leave'),s);
 await sync(guest);await lobby(guest,{type:'room/return-lobby'},403);
 const reset=await lobby(host,{type:'room/return-lobby'});assert.equal(reset.room.lobbyPhase,'waiting');assert.equal(reset.room.runId,1);assert.equal(reset.room.players.length,2);assert.ok(reset.room.players.every(p=>!p.ready&&!p.entered&&!p.forfeited));
 const empty=await sync(guest);assert.equal(empty.player,null);assert.equal(empty.game.config,null);assert.equal(empty.ack,0);
 for(const s of [host,guest])await lobby(s,{type:'room/set-ready',ready:true});
 const restarted=await lobby(host,{type:'room/start'});assert.equal(restarted.room.runId,2);
 const stale=await post(route(host,'game-enter'),{...host,config,runId:1},409);assert.equal(stale.error,'STALE_RUN');
 for(const s of [host,guest]){const entered=await post(route(s,'game-enter'),{...s,config,runId:2});assert.equal(entered.player.state.session.round,1);assert.equal(entered.player.state.session.money,4);}
 const fresh=await sync(host);assert.equal(fresh.ack,0);
 const oldCommand=await post(route(host,'game-command'),{...host,runId:1,sequence:1,expectedRevision:fresh.player.revision,command:{type:'game/freeze'}},409);assert.equal(oldCommand.error,'STALE_RUN');
 await post(route(host,'game-command'),{...host,runId:2,sequence:1,expectedRevision:fresh.player.revision,command:{type:'game/freeze'}});
 // Both VMs could be recreated with maxGamePlayers=2: restart released old capacity.
 for(const s of [host,guest])await post(route(s,'leave'),s);
 // A host whose browser disappears before strategy selection must not retain
 // the launch authority forever or stop the other member entering the run.
 const absentHost=(await post('/api/rooms',{name:'选策略前离线'},201)).session;
 const survivor=(await post(route(absentHost,'join'),{name:'继续主持'},201)).session;
 sequences.set(absentHost.playerId,0);await lobby(absentHost,{type:'room/set-config',config:{seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey}});
 for(const s of [absentHost,survivor]){if(!sequences.has(s.playerId))sequences.set(s.playerId,0);await lobby(s,{type:'room/set-ready',ready:true});}
 await lobby(absentHost,{type:'room/start'});await post(route(survivor,'game-enter'),{...survivor,config});
 for(let i=0;i<9;i++){clock+=9000;await sync(survivor);}
 const transferred=await sync(survivor);assert.equal(transferred.room.hostId,survivor.playerId);assert.equal(transferred.game.players.find(p=>p.playerId===absentHost.playerId).forfeited,false);
 const returning=await post(route(absentHost,'game-enter'),{...absentHost,config});assert.equal(returning.player.state.session.phase,'rest','a slow pre-entry member can recover and continue choosing the opening strategy');
 for(const s of [absentHost,survivor])await post(route(s,'leave'),s);
 console.log('ROOM LIFECYCLE OK real VMs: full portrait catalog/profile, preparation and battle pause, 60-second timeout, read-only recovery, all-offline finish, room restart/runtime cleanup, stale-run rejection');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
