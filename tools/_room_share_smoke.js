'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const {createShareCode,normalizeShareCode,configFromShareCode}=require(path.join(root,'tools/lib/room-share-code'));
const {createLauncher}=require(path.join(root,'tools/room-launcher')),{freePort}=require(path.join(root,'tools/room-online'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const code=createShareCode();assert.equal(normalizeShareCode(code.toLowerCase().replaceAll('-',' ')),code);
 assert.notEqual(createShareCode(),code);assert.throws(()=>normalizeShareCode(code.slice(0,-1)+(code.endsWith('A')?'B':'A')));assert.throws(()=>normalizeShareCode('ABCD12'));
 assert.deepEqual(configFromShareCode(code,['tcp://127.0.0.1:1']),configFromShareCode(code,['tcp://127.0.0.1:1']));
 const profileBase=fs.mkdtempSync(path.join(path.resolve(__dirname,'../.runtime'),'share-profile-'));
 const hostProfile=path.join(profileBase,'host'),guestProfile=path.join(profileBase,'guest');fs.mkdirSync(hostProfile);fs.mkdirSync(guestProfile);
 const listen=await freePort(),peers=['tcp://127.0.0.1:'+listen],host=await createLauncher({root,profileRoot:hostProfile,peers,coreOptions:{isolated:true,listener:'tcp://127.0.0.1:'+listen}}),guest=await createLauncher({root,profileRoot:guestProfile,peers,coreOptions:{isolated:true,listener:'tcp://127.0.0.1:0'}});
 const launchers=[host,guest];
 async function api(l,route='/api/status',method='GET',body){const r=await fetch(l.url+route,{method,headers:{'x-launcher-key':l.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,value:await r.json()};}
 async function ready(l){for(let n=0;n<100;n++){const r=await api(l);if(r.value.phase==='ready')return r.value;if(r.value.phase==='error')throw Error(r.value.message);await pause(250);}throw Error('launcher readiness timeout');}
 function boot(state){return JSON.parse(Buffer.from(new URLSearchParams(new URL(state.url).hash.slice(1)).get('launch'),'base64url'));}
 async function roomApi(state,path,body){const url=new URL(path,state.url);const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify({protocolVersion:1,clientVersion:require('./room_server').CLIENT_VERSION,...body}):undefined});assert.equal(r.status,200);return r.json();}
 try{
  const html=await (await fetch(host.url)).text();assert.match(html,/罗德岛 · 作战终端/);assert.ok(html.includes('id="menu"'));assert.ok(!html.includes('home-view'));assert.ok(!html.includes('__LAUNCHER_KEY__'));assert.equal(await(await fetch(host.url+'/index.html')).text(),html,'root and index expose the same original home');
  const panel=await(await fetch(host.url+'/room-lab.html?mode=solo')).text();assert.match(panel,/创建同盟/);assert.match(panel,/分享码/);assert.ok(panel.includes('index.html#menu'));assert.ok(!panel.includes('home-view')&&!panel.includes('open-roster'),'covenant subpage does not introduce a second home');
  const denied=await fetch(host.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"create","name":"evil"}'});assert.equal(denied.status,403);
  const forged=await fetch(host.url+'/api/status',{headers:{'x-launcher-key':host.key,Origin:'https://example.com'}});assert.equal(forged.status,403);
  assert.equal((await api(guest,'/api/session','POST',{action:'join',name:'朋友',shareCode:'wrong'})).status,400);
  assert.equal((await api(guest)).value.phase,'idle','invalid code does not launch a network');
  assert.equal((await api(host,'/api/session','POST',{action:'create',name:'房主',gameConfig:{seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01'}})).status,202);
  assert.equal((await api(host,'/api/session','POST',{action:'create',name:'重复'})).status,400);
  const h=await ready(host);assert.match(h.shareCode,/^WS1-/);const hb=boot(h);assert.ok(hb.session.token);assert.equal(hb.launcherUrl,host.url);
  assert.equal((await api(guest,'/api/session','POST',{action:'join',name:'朋友',shareCode:h.shareCode})).status,202);
  const g=await ready(guest),gb=boot(g);assert.equal(g.shareCode,h.shareCode);assert.equal(gb.session.roomCode,hb.session.roomCode);assert.notEqual(gb.session.playerId,hb.session.playerId);
  const info=await roomApi(g,'/api/room-info');assert.equal(info.onlineShareCode,h.shareCode);
  const sync=await roomApi(h,'/api/rooms/'+hb.session.roomCode+'/sync',hb.session);assert.equal(sync.room.settings.modeId,'mode_multi_normal','launcher forwards entry configuration to the actual room');assert.equal(sync.room.players.length,2);assert.equal(sync.room.hostId,hb.session.playerId);
  for(const [s,b]of [[h,hb],[g,gb]])await roomApi(s,'/api/rooms/'+b.session.roomCode+'/command',{...b.session,sequence:1,command:{type:'room/set-ready',ready:true}});
  const started=await roomApi(h,'/api/rooms/'+hb.session.roomCode+'/command',{...hb.session,sequence:2,command:{type:'room/start'}});assert.equal(started.room.lobbyPhase,'started');
  assert.equal((await api(guest,'/api/session','DELETE')).status,200);
  const after=await roomApi(h,'/api/rooms/'+hb.session.roomCode+'/sync',hb.session);assert.equal(after.room.players.length,1,'ending guest connection releases its seat before stopping tunnel');
  const resumed=await api(host,'/api/resume','POST');assert.equal(resumed.value.phase,'ready','valid seat survives returning to launcher');
  await roomApi(h,'/api/rooms/'+hb.session.roomCode+'/leave',hb.session);
  assert.equal((await api(host,'/api/resume','POST')).value.phase,'idle','a released seat closes the stale connection normally and permits a fresh session');
  await api(host,'/api/session','DELETE');assert.equal((await api(host)).value.phase,'idle');
  await api(guest,'/api/session','POST',{action:'join',name:'取消',shareCode:createShareCode()});await pause(500);await api(guest,'/api/session','DELETE');assert.equal((await api(guest)).value.phase,'idle','pending connection can be canceled');
  console.log('ROOM SHARE OK: one code derives network and lobby; typo rejection; local API guards; real create/join and ready/start; auto seat handoff; cancellation and cleanup');
 }finally{await Promise.all(launchers.map(l=>l.stop()));for(const folder of [hostProfile,guestProfile]){const config=path.join(folder,'user-config.json');if(fs.existsSync(config))fs.unlinkSync(config);fs.rmdirSync(folder);}fs.rmdirSync(profileBase);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
