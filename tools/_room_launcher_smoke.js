'use strict';
const assert=require('node:assert/strict'),net=require('node:net');
const {parseArgs,addresses,startRoom}=require('./start-room');
async function main(){
  assert.deepEqual(parseArgs([]),{host:'0.0.0.0',port:8003,open:true});
  for(const args of [['--port','bad'],['--host','localhost;bad'],['--port','65536'],['--unknown']])assert.throws(()=>parseArgs(args));
  const links=addresses('0.0.0.0',9000,{WiFi:[{family:'IPv4',internal:false,address:'192.168.1.3'}],EasyTier:[{family:'IPv4',internal:false,address:'10.126.126.1'}],loopback:[{family:'IPv4',internal:true,address:'127.0.0.1'}],unconfigured:[{family:'IPv4',internal:false,address:'169.254.2.3'}]});
  assert.equal(links.length,2);assert.match(links[0].url,/10\.126\.126\.1:9000/);assert.ok(links.every(x=>!x.url.includes('localhost')));
  const occupied=net.createServer();await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
  let room;
  try{
    const port=occupied.address().port;room=await startRoom({host:'127.0.0.1',port,open:false,report:()=>{}});
    assert.ok(room.port>port&&room.port<port+20,'port collision selects a free port without stopping existing server');assert.equal(occupied.listening,true);
    const r=await fetch(room.localUrl);assert.equal(r.status,200);assert.match(await r.text(),/同盟大厅/);
    assert.equal((await (await fetch(new URL('/api/room-info',room.localUrl))).json()).capacity,4);
    console.log('ROOM LAUNCHER OK address validation, EasyTier/LAN links, occupied-port fallback, actual HTTP lobby, no browser side effects');
  }finally{room?.server.closeAllConnections();await Promise.all([new Promise(resolve=>occupied.close(resolve)),room?new Promise(resolve=>room.server.close(resolve)):Promise.resolve()]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
