'use strict';
const assert=require('node:assert/strict');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const sources=require('../web/source_battles.json');
const server=createRoomServer();
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const resource=await fetch(base+'/source_battles.json',{headers:{'Accept-Encoding':'gzip'}}),etag=resource.headers.get('etag');
 assert.equal(resource.headers.get('content-encoding'),'gzip');assert.match(resource.headers.get('cache-control'),/must-revalidate/);assert.ok((await resource.json()).seasons);
 const cached=await fetch(base+'/source_battles.json',{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);assert.equal((await cached.text()).length,0);
 const info=await (await fetch(base+'/api/game-info')).json();
 async function post(url,fields,status=200){const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','Accept-Encoding':'gzip'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,runId:1,catalog:info.catalog,...fields})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return {value,bytes:Number(response.headers.get('content-length')),encoding:response.headers.get('content-encoding'),cache:response.headers.get('cache-control')};}
 const a=(await post('/api/rooms',{name:'同步甲'},201)).value.session,route=(s,operation)=>'/api/rooms/'+s.roomCode+'/'+operation;
 const b=(await post(route(a,'join'),{name:'同步乙'},201)).value.session;
 const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:sources.seasons.act1autochess.modes.mode_multi_normal.stageChoices[0].levelKey,bandId:'band_amiya'};
 await post(route(a,'command'),{...a,sequence:1,command:{type:'room/set-config',config:{seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey}}});
 for(const s of [a,b])await post(route(s,'command'),{...s,sequence:s===a?2:1,command:{type:'room/set-ready',ready:true}});
 await post(route(a,'command'),{...a,sequence:3,command:{type:'room/start'}});
 for(const s of [a,b])await post(route(s,'game-enter'),{...s,config});
 const sync=(s,fields={})=>post(route(s,'game-sync'),{...s,...fields});
 for(const s of [a,b]){const state=(await sync(s)).value;await post(route(s,'game-command'),{...s,sequence:1,expectedRevision:state.player.revision,command:{type:'game/ready',ready:true}});}
 const start=await sync(a);assert.equal(start.value.game.phase,'battle');assert.equal(start.value.game.battles.length,2);assert.equal(start.value.player.state.battle.phase,'battle');
 assert.equal(start.encoding,'gzip');assert.equal(start.cache,'no-store');
 const t=start.value.player.state.battle.time;await new Promise(resolve=>setTimeout(resolve,220));
 const restored=(await sync(a)).value;assert.ok(restored.player.state.battle.time>t);assert.equal(restored.player.state.session.round,1);
 assert.equal(restored.player.state.context.TEAM_AI.length,0);assert.ok(!('auth' in restored.player.state)&&!('checkpoint' in restored.player.state));
 const watched=(await sync(b,{viewPlayerId:a.playerId})).value;assert.equal(watched.viewPlayerId,a.playerId);assert.equal(watched.player.state.context.PLAYER_NAME,'同步甲');assert.equal(watched.ack,1,'watching keeps viewer command identity');
 await post(route(b,'game-sync'),{...b,viewPlayerId:'external-player'},400);
 const blocked=await post(route(a,'game-command'),{...a,sequence:2,expectedRevision:restored.player.revision,command:{type:'game/freeze'}},409);assert.equal(blocked.value.error,'WRONG_PHASE');
 const duplicate=(await post(route(b,'game-command'),{...b,sequence:1,expectedRevision:1,command:{type:'game/ready',ready:true}})).value;assert.equal(duplicate.applied,false);assert.equal(duplicate.game.phase,'battle','lost ready response cannot start a second battle');
 assert.equal((await sync(a)).value.player.state.session.round,1);
 for(const s of [a,b])await post(route(s,'leave'),s);
 console.log('ROOM BATTLE SERVER OK: two automatic ordinary fields, ongoing authenticated refresh/watch, battle operation lock, ready retry, gzip API '+start.bytes+' bytes/frame, static gzip and 304 cache');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
