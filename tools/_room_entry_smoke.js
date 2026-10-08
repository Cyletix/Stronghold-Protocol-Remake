'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const {createBattleSession,roundChoices}=require('./lib/room-battle-session');
let clock=1000;const server=createRoomServer({now:()=>clock,maxGamePlayers:4});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,info=await(await fetch(base+'/api/game-info')).json();
 assert.ok(info.seasons.every(s=>['training','single','multi'].every(kind=>s.modes.some(m=>m.kind===kind))));
 async function post(route,value,status=200){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,catalog:info.catalog,runId:1,...value})});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;}
 const route=(s,op)=>'/api/rooms/'+s.roomCode+'/'+op,seq=new Map();
 async function create(playMode='team'){const result=await post('/api/rooms',{name:playMode+' player',playMode},201);seq.set(result.session.playerId,0);return result;}
 async function command(s,command,status=200){const result=await post(route(s,'command'),{...s,sequence:seq.get(s.playerId)+1,command},status);if(status===200)seq.set(s.playerId,result.ack);return result;}
 const custom={seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01'};
 const configured=await post('/api/rooms',{name:'configured host',settings:custom},201);assert.deepEqual(configured.room.settings,custom);await post(route(configured.session,'leave'),configured.session);
 await post('/api/rooms',{name:'invalid settings',settings:{...custom,mapKey:'missing'}},400);
 const soloCreated=await create('solo'),solo=soloCreated.session;
 assert.equal(soloCreated.room.localOnly,true);assert.equal(soloCreated.room.capacity,1);assert.equal(soloCreated.room.minPlayers,1);assert.deepEqual(soloCreated.room.settings,{seasonId:'act2autochess',modeId:'mode_multi_hard',mapKey:'activities/act2autochess/level_act2autochess_m01'});assert.equal(soloCreated.room.config,null);
 await post(route(solo,'join'),{name:'not allowed'},409);
 await command(solo,{type:'room/set-ready',ready:true});const launched=await command(solo,{type:'room/start'});
 assert.equal(launched.room.config.modeId,'mode_single_hard');assert.equal(launched.room.config.seasonId,'act2autochess');assert.equal(launched.room.settings.modeId,'mode_multi_hard');assert.equal(launched.room.config.mapKey,soloCreated.room.settings.mapKey);assert.ok(launched.room.setupInfo.firstLevelKey);assert.ok(launched.room.setupInfo.bosses.length);assert.ok(launched.room.setupInfo.bannedOperators.length>=2);
 const config={...launched.room.config,bandId:'band_amiya'};
 await post(route(solo,'game-enter'),{...solo,config:{...config,modeId:'mode_multi_hard'}},409);
 await command(solo,{type:'room/set-config',config:soloCreated.room.settings},409);
 const entered=await post(route(solo,'game-enter'),{...solo,config});assert.equal(entered.player.state.context.curMatch,'solo');assert.deepEqual(entered.player.state.context.TEAM_AI,[]);assert.equal(entered.player.state.session.money,4);assert.equal(entered.player.state.session.sourceLevelKey,launched.room.setupInfo.firstLevelKey);assert.equal(entered.game.players.length,1);
 assert.deepEqual(entered.player.state.session.bannedOperators,launched.room.setupInfo.bannedOperators.map(o=>o.charId),'intel and runtime use the same ban list');
 assert.ok(entered.player.state.session.shop.every(o=>!entered.player.state.session.bannedOperators.includes(o.entry?.charId)));
 const bought=await post(route(solo,'game-command'),{...solo,sequence:1,expectedRevision:entered.player.revision,command:{type:'game/buy',index:0}});assert.equal(bought.player.state.session.money,4-entered.player.state.session.shop[0].cost);
 await post(route(solo,'game-command'),{...solo,sequence:2,expectedRevision:bought.player.revision,command:{type:'game/ready',ready:true}});
 clock+=250;await new Promise(resolve=>setTimeout(resolve,70));const battle=await post(route(solo,'game-sync'),solo);assert.equal(battle.game.phase,'battle');assert.equal(battle.game.battles.length,1);assert.ok(battle.player.state.battle.time>0);assert.deepEqual(battle.player.state.context.TEAM_AI,[]);
 await post(route(solo,'leave'),solo);

 const created=await create(),host=created.session,guest=(await post(route(host,'join'),{name:'guest'},201)).session;seq.set(guest.playerId,0);
 assert.deepEqual(created.room.settings,soloCreated.room.settings,'solo and team creation use the same fresh-room defaults');
 const normal={seasonId:'act1autochess',modeId:'mode_single_normal',mapKey:info.seasons.find(s=>s.seasonId==='act1autochess').modes.find(m=>m.modeId==='mode_single_normal').maps[0].mapKey};
 await command(guest,{type:'room/set-config',config:normal},403);
 for(const bad of [{...normal,money:99},{...normal,modeId:'invalid'},{...normal,mapKey:'missing'},null,[]])await command(host,{type:'room/set-config',config:bad},400);
 for(const s of [host,guest])await command(s,{type:'room/set-ready',ready:true});
 const changed=await command(host,{type:'room/set-config',config:{mapKey:normal.mapKey,modeId:normal.modeId,seasonId:normal.seasonId}});assert.ok(changed.room.players.every(p=>!p.ready));assert.deepEqual(changed.room.settings,normal);
 const replay=await post(route(host,'command'),{...host,sequence:seq.get(host.playerId),command:{type:'room/set-config',config:normal}});assert.equal(replay.applied,false);assert.equal(replay.room.revision,changed.room.revision,'duplicate settings with reordered JSON fields remain idempotent');
 for(const s of [host,guest])await command(s,{type:'room/set-ready',ready:true});const team=await command(host,{type:'room/start'});assert.equal(team.room.config.modeId,'mode_multi_normal');assert.equal(team.room.config.mapKey,normal.mapKey);
 const common={...team.room.config,bandId:'band_amiya'};const [hostState,guestState]=await Promise.all([post(route(host,'game-enter'),{...host,config:common}),post(route(guest,'game-enter'),{...guest,config:common})]);
 assert.deepEqual(hostState.game.config,team.room.config);assert.deepEqual(guestState.game.config,team.room.config);assert.equal(hostState.player.state.context.curMatch,'team');assert.equal(guestState.player.state.context.curMatch,'team');
 assert.deepEqual(hostState.room.setupInfo,guestState.room.setupInfo,'every strategy page uses the same frozen Boss choices');
 const reset=await command(host,{type:'room/return-lobby'});assert.deepEqual(reset.room.settings,normal);assert.equal(reset.room.config,null);assert.equal(reset.room.setupInfo,null);
 await command(host,{type:'room/set-config',config:{...normal,modeId:'mode_training_1'}});for(const s of [host,guest])await command(s,{type:'room/set-ready',ready:true});const trainingRejected=await command(host,{type:'room/start'},400);assert.equal(trainingRejected.error,'MULTIPLAYER_UNSUPPORTED');
 const act2=info.seasons.find(s=>s.seasonId==='act2autochess'),soloNormal=act2.modes.find(m=>m.modeId==='mode_single_normal'),multiMaps=new Set(act2.modes.find(m=>m.modeId==='mode_multi_normal').maps.map(m=>m.mapKey)),soloMap=soloNormal.maps.find(m=>!multiMaps.has(m.mapKey));assert.ok(soloMap);
 const unsupported={seasonId:act2.seasonId,modeId:soloNormal.modeId,mapKey:soloMap.mapKey};await command(host,{type:'room/set-config',config:unsupported});for(const s of [host,guest])await command(s,{type:'room/set-ready',ready:true});assert.equal((await command(host,{type:'room/start'},400)).error,'PLAYER_COUNT_MAP_MISMATCH');assert.deepEqual((await post(route(host,'sync'),host)).room.settings,unsupported,'an unsupported player-count map is never silently replaced');
 await post(route(guest,'leave'),guest);await command(host,{type:'room/set-config',config:{...normal,modeId:'mode_training_1'}});await command(host,{type:'room/set-ready',ready:true});const training=await command(host,{type:'room/start'});assert.equal(training.room.config.modeId,'mode_training_1');const train=await post(route(host,'game-enter'),{...host,runId:2,config:{...training.room.config,bandId:'band_amiya'}});assert.equal(train.player.state.context.curMatch,'solo');assert.deepEqual(train.player.state.context.TEAM_AI,[]);await post(route(host,'leave'),host);

 // Reach a solo final Boss using the same test-only VM fixture used by the
 // battle suite. Solo source worlds must never invoke paired-world merging.
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime(config,{seed:123,name:'solo boss'});
 try{
  const choices=roundChoices(config,123);runtime.alignRoundChoices(choices);const bossRound=injected.exports.roomSetupInfo(config,choices).bosses.filter(boss=>!boss.hidden).at(-1).round;runtime.__testMachine.run('startRound('+bossRound+')');
  const player={id:'single',name:'solo boss',connected:true,gameReady:true,runtime:{...runtime,battleInput(){throw Error('solo must not merge paired worlds');}}},room={players:new Map([['single',player]]),gameConfig:launched.room.config,pairSeed:123,roundChoices:choices,revision:0};
  const controller=createBattleSession(room,{now:()=>clock});assert.equal(controller.start(),true);assert.equal(controller.summary().battles[0].kind,'boss');
  for(let i=0;i<1000&&controller.phase!=='over';i++){clock+=250;controller.tick();assert.notEqual(controller.phase,'error',controller.summary().error);}
  assert.equal(controller.phase,'over');assert.ok(runtime.snapshot().session.settlement);assert.deepEqual(runtime.snapshot().context.TEAM_AI,[]);controller.dispose();
 }finally{runtime.dispose();}
 console.log('ROOM ENTRY OK real solo/training and paired VMs, default settings, host-only canonical configuration, readiness invalidation/dedup, frozen shared Boss preview, exact map preservation, solo economy/battle/Boss settlement and no fake teammates');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
