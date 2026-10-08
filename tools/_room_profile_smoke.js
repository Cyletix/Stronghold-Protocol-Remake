'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),{listPortraits,isValidPortrait,loadProfile,saveProfile}=require('./lib/room-profile');
const {createLauncher}=require('./room-launcher');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
 const profileRoot=fs.mkdtempSync(path.join(runtime,'profile-smoke-')),config=path.join(profileRoot,'user-config.json');
 let launcher,backend;
 try{
  const portraits=listPortraits(root);assert.ok(portraits.length>4);assert.equal(portraits.length,fs.readdirSync(path.join(root,'web/portraits')).filter(n=>/^char_[a-zA-Z0-9_]+\.png$/.test(n)).length);
  assert.equal(portraits[0].id,'char_102_texas');assert.equal(portraits[0].name,'德克萨斯');
  const extra=portraits.find(p=>!['char_102_texas','char_1012_skadi2','char_1028_texas2','char_1019_siege2'].includes(p.id));
  assert.ok(isValidPortrait(root,extra.id));assert.equal(isValidPortrait(root,'../room-start'),false);
  assert.equal(loadProfile(root,profileRoot).name,'');
  const saved=saveProfile(root,{name:'  本机名片  ',portrait:extra.id,token:'must-not-persist',shareCode:'must-not-persist'},profileRoot);
  assert.deepEqual(saved,{version:1,name:'本机名片',portrait:extra.id});assert.deepEqual(loadProfile(root,profileRoot),saved);
  assert.deepEqual(JSON.parse(fs.readFileSync(config,'utf8')),saved);assert.deepEqual(fs.readdirSync(profileRoot),['user-config.json']);
  assert.throws(()=>saveProfile(root,{name:'x',portrait:'../../secret'},profileRoot));assert.deepEqual(loadProfile(root,profileRoot),saved);
  fs.writeFileSync(config,'{broken');assert.equal(loadProfile(root,profileRoot).name,'','damaged settings fall back safely');
  fs.writeFileSync(config,JSON.stringify({name:'保留昵称',portrait:'missing'}));assert.equal(loadProfile(root,profileRoot).name,'保留昵称');assert.equal(loadProfile(root,profileRoot).portrait,'char_102_texas');
  let player=null,ack=0,commands=[],syncCount=0,syncError=null,stops=0;
  const session={roomCode:'ABC234',playerId:'local-profile-player',token:'local-profile-token'};
  backend=http.createServer(async(req,res)=>{
   let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body||'{}');res.setHeader('Content-Type','application/json');
   if(req.url==='/api/rooms'){player={id:session.playerId,name:input.name,portrait:input.portrait};res.statusCode=201;return res.end(JSON.stringify({session}));}
   if(req.url.endsWith('/sync')){syncCount++;if(syncError){res.statusCode=syncError==='TEMPORARY'?503:404;return res.end(JSON.stringify({error:syncError,message:'temporary test response'}));}}
   if(req.url.endsWith('/command')){assert.equal(input.sequence,ack+1);ack++;commands.push(input.command);player={id:session.playerId,name:input.command.name,portrait:input.command.portrait};}
   res.end(JSON.stringify({ack,room:{players:player?[player]:[]}}));
  });
  await new Promise(r=>backend.listen(0,'127.0.0.1',r));const endpoint='http://127.0.0.1:'+backend.address().port+'/room-lab.html';
  launcher=await createLauncher({root,profileRoot,statusHeartbeatMs:30,connect:async()=>({connection:{url:endpoint},stop:async()=>{stops++;}})});
  async function api(route,method='GET',body){const r=await fetch(launcher.url+route,{method,headers:{'x-launcher-key':launcher.key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,value:await r.json()};}
  assert.equal((await fetch(launcher.url+'/api/profile')).status,403);
  const initial=await api('/api/profile');assert.equal(initial.value.portraits.length,portraits.length);assert.equal(initial.value.profile.name,'保留昵称');
  const img=await fetch(launcher.url+'/'+extra.path);assert.equal(img.status,200);assert.equal(img.headers.get('Content-Type'),'image/png');assert.ok((await img.arrayBuffer()).byteLength>0);
  const invalid=await api('/api/profile','POST',{name:'测试',portrait:'../secret'});assert.equal(invalid.status,400);
  assert.equal((await api('/api/profile','POST',{name:'房主',portrait:extra.id,token:'ignored'})).status,200);
  assert.equal((await api('/api/session','POST',{action:'create',name:'房主',portrait:extra.id})).status,202);
  for(let n=0;n<50;n++){if((await api('/api/status')).value.phase==='ready')break;await pause(20);}
  assert.equal((await api('/api/status')).value.phase,'ready');assert.deepEqual(player,{id:session.playerId,name:'房主',portrait:extra.id},'chosen portrait reaches room create');
  const edited=await api('/api/profile','POST',{name:'新昵称',portrait:portraits[0].id});assert.equal(edited.value.synced,true);assert.deepEqual(commands[0],{type:'room/set-profile',name:'新昵称',portrait:portraits[0].id});
  await api('/api/profile','POST',{name:'新昵称',portrait:portraits[0].id});assert.equal(commands.length,1,'returning with unchanged profile does not cancel readiness');
  await api('/api/resume','POST');const quietCount=syncCount;await pause(70);assert.equal(syncCount,quietCount,'no page requests means no background presence heartbeat');
  await api('/api/status');await pause(10);assert.equal(syncCount,quietCount+1,'a launcher page status request keeps its seat alive');
  await api('/api/status');await pause(5);assert.equal(syncCount,quietCount+1,'presence requests are throttled');
  syncError='TEMPORARY';const retrying=await api('/api/resume','POST');assert.equal(retrying.value.phase,'ready');assert.equal(retrying.value.connectionState,'reconnecting');assert.equal(stops,0,'temporary network failure retains the running connection and credentials');
  syncError=null;const recovered=await api('/api/resume','POST');assert.equal(recovered.value.connectionState,'connected');assert.equal(recovered.value.phase,'ready');
  syncError='ROOM_NOT_FOUND';const expired=await api('/api/resume','POST');assert.equal(expired.value.phase,'idle');assert.match(expired.value.message,/当前房间已结束/);assert.equal(stops,1,'only terminal room/seat loss closes the network');
  await launcher.stop();launcher=null;
  launcher=await createLauncher({root,profileRoot,connect:async()=>{throw Error('unused');}});
  assert.equal((await api('/api/profile')).value.profile.name,'新昵称','new launcher/port restores the same package file');
  assert.deepEqual(JSON.parse(fs.readFileSync(config,'utf8')),{version:1,name:'新昵称',portrait:portraits[0].id});
  console.log('ROOM PROFILE OK: '+portraits.length+' local portraits; atomic config; corrupt fallback; authenticated APIs; profile propagation/no-op; restart across ports; request-driven/throttled presence; network retry/recovery and expired seat cleanup');
 }finally{
  await launcher?.stop();if(backend){backend.closeAllConnections();await new Promise(r=>backend.close(r));}
  const resolved=path.resolve(profileRoot);assert.ok(resolved.startsWith(path.resolve(runtime)+path.sep)&&path.basename(resolved).startsWith('profile-smoke-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
