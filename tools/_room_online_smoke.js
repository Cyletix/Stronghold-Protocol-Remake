'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {startRoom}=require('./start-room');
const {DEFAULT_PEERS,validateConfig,coreArgs,startCore,freePort,connectGuest,findHost}=require('./room-online');
async function main(){
 const argValue=flag=>{const index=process.argv.indexOf(flag);return index<0?null:process.argv[index+1];};
 const root=path.resolve(argValue('--root')||argValue('--host-root')||path.join(__dirname,'..')),joinRoot=path.resolve(argValue('--join-root')||root);
 const hostModule=require(path.join(root,'tools/room-online')),joinModule=require(path.join(joinRoot,'tools/room-online'));
 const listener=await freePort(),config={version:1,networkName:'ark-room-'+crypto.randomBytes(8).toString('hex'),networkSecret:crypto.randomBytes(32).toString('hex'),hostIPv4:'10.126.126.1',peers:['tcp://127.0.0.1:'+listener],role:'ask'};
 const publicRelay=process.argv.includes('--public-relay');if(publicRelay)config.peers=DEFAULT_PEERS;
 validateConfig(config);assert.throws(()=>validateConfig({...config,networkSecret:'shared'}));assert.throws(()=>validateConfig({...config,peers:['file:///test']}));
 const args=coreArgs({role:'host',config,rpcPort:1234,port:8003,isolated:true});assert.ok(args.includes('--no-tun'));assert.ok(args.includes('--disable-upnp'));assert.ok(!args.includes('--proxy-networks'));assert.ok(!args.includes(config.networkSecret));assert.ok(!args.includes('--accept-dns'));
 assert.equal(findHost([{ipv4:config.hostIPv4,hostname:'ark-host-8011',cost:'1'}],config).port,8011);
 const room=await require(path.join(root,'tools/start-room')).startRoom({host:'127.0.0.1',port:0,open:false,report:()=>{}}),cores=[],connections=[];
 try{
  cores.push(await hostModule.startCore({root,role:'host',config,port:room.port,listener:'tcp://127.0.0.1:'+listener,isolated:!publicRelay,relayOnly:publicRelay}));
  for(let n=0;n<2;n++)cores.push(await joinModule.startCore({root:joinRoot,role:'join',config,listener:'tcp://127.0.0.1:0',isolated:!publicRelay,relayOnly:publicRelay}));
  for(const core of cores.slice(1))connections.push(await joinModule.connectGuest(core,config,{root:joinRoot,preferredPort:0,timeoutMs:60000,report:()=>{}}));
  assert.notEqual(connections[0].port,connections[1].port);
  const nodes=await Promise.all(cores.slice(1).map(c=>c.api(['peer']).then(JSON.parse)));
  const ips=nodes.map(list=>list.find(p=>p.cost==='Local').ipv4);assert.notEqual(ips[0],ips[1],'DHCP resolves two guests starting with same requested address');
  for(const c of connections){const r=await fetch(c.url);assert.equal(r.status,200);assert.match(await r.text(),/同盟大厅/);}
  const response=await fetch(new URL('/api/game-info',connections[0].url),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.ok((await response.json()).catalog);
  // Only the actual game port is reachable; another loopback service must not be shared.
  const http=require('node:http'),privateServer=http.createServer((q,s)=>s.end('private-service'));
  await new Promise(r=>privateServer.listen(0,'127.0.0.1',r));const blockPort=await freePort();
  try{await cores[1].api(['port-forward','add','tcp','127.0.0.1:'+blockPort,config.hostIPv4+':'+privateServer.address().port]);let blocked=false;try{await fetch('http://127.0.0.1:'+blockPort,{signal:AbortSignal.timeout(1500)});}catch{blocked=true;}assert.ok(blocked,'unrelated host TCP service is not exposed');}
  finally{privateServer.closeAllConnections();await new Promise(r=>privateServer.close(r));}
  console.log('ROOM ONLINE OK: '+(publicRelay?'PUBLIC RELAY (P2P disabled); ':'loopback; ')+'three real no-TUN cores; two guests; DHCP collision recovery; discovered actual host port; lobby/game HTTP; unrelated port blocked');
 }finally{await Promise.all(connections.map(c=>c.stop()));await Promise.all(cores.map(c=>c.stop()));room.server.closeAllConnections();await new Promise(r=>room.server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
