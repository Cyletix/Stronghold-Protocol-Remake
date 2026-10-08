'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const root=path.resolve(__dirname,'../web'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const setup=require('../web/src/rules/run-setup'),runtime=require('./lib/room-game-runtime');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function node(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},children:[],classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v),toggle:(v,on)=>{if(on)classes.add(v);else classes.delete(v);}},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){},getContext:()=>new Proxy({},{get:()=>()=>{}}),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900}),focus(){},showModal(){},close(){}};}
function browser(url,storage=memory()){
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);},calls=[];
 const location={href:url,get search(){return new URL(this.href).search;},get hash(){return new URL(this.href).hash;},get origin(){return new URL(this.href).origin;}};
 const ctx={URL,URLSearchParams,console,crypto,Uint32Array,location,history:{replaceState:(_,__,url)=>{location.href=url;}},navigator:{},innerWidth:1400,innerHeight:900,performance:{now:()=>100},AbortController,sessionStorage:storage,localStorage:memory(),setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,addEventListener(){},Image:function(){this.complete=false;},document:{body:node(),getElementById:el,querySelector:()=>null,createElement:node,addEventListener(){}},fetch:async(url)=>{
   const target=new URL(url,location.href);calls.push(target.pathname);
   if(target.pathname.startsWith('/api/'))throw Error('ALL ROOM APIs OFFLINE');
   return {ok:true,json:async()=>JSON.parse(read(target.pathname.slice(1))),text:async()=>read(target.pathname.slice(1))};
 }};el('round-progress').children=Array.from({length:12},node);ctx.window=ctx;vm.createContext(ctx);
 const run=code=>vm.runInContext(code,ctx),load=file=>vm.runInContext(read(file),ctx,{filename:file});
 return {ctx,el,calls,run,load,get:code=>JSON.parse(run('JSON.stringify('+code+')')),storage};
}
async function main(){
 const store=memory();store.setItem('ark-room-lab-session-v1',JSON.stringify({session:{roomCode:'ABCDEF',playerId:'stale',token:'x'.repeat(40)},sequence:99,launcherUrl:'http://127.0.0.1:9999'}));
 const lobby=browser('http://127.0.0.1:8000/room-lab.html?mode=solo',store);lobby.load('solo-session.js');lobby.load('room-lab.js');
 for(let i=0;i<30&&!lobby.get('serviceReady');i++)await sleep(1);
 assert.equal(lobby.get('serviceReady'),true,lobby.el('status').textContent);assert.equal(lobby.get('session.playerId'),'local');assert.equal(lobby.el('players').children.length,4);assert.equal(lobby.get('room.players[0].slot'),0);assert.equal(lobby.el('latency').textContent,'本机单人');
 assert.deepEqual(lobby.get('room.settings'),{seasonId:'act2autochess',modeId:'mode_single_hard',mapKey:'activities/act2autochess/level_act2autochess_m01'});
 lobby.el('room-difficulty').value='mode_single_normal';await lobby.el('room-difficulty').onchange();assert.equal(lobby.get('room.settings.modeId'),'mode_single_normal');
 await lobby.el('enter-game').onclick();assert.match(lobby.ctx.location.href,/index.html\?solo=1$/);assert.equal(lobby.calls.some(p=>p.startsWith('/api/')),false,'local lobby never tries any API, even with stale multiplayer credentials');
 // Seed 391 draws Blaze the Igniting Spark in both Yan and Victoria.
 // Regression: the authority returned her twice while the browser showed one ban.
 const deterministicRun=JSON.parse(store.getItem('ark-solo-setup-v1'));deterministicRun.seed=391;store.setItem('ark-solo-setup-v1',JSON.stringify(deterministicRun));
 const game=browser(lobby.ctx.location.href,store);
 for(const [,file] of read('index.html').matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g))if(!file.startsWith('vendor/'))game.load(file);
 await game.run('initMode()');
 assert.equal(game.el('setup-info').style.display,'flex',game.el('flash').textContent);assert.equal(game.el('setup-pick').style.display,'none');assert.equal(game.run('typeof ArkRoomGame'),'undefined');assert.equal(game.run('typeof ArkRoomPresence'),'undefined');assert.equal(game.ctx.__roomRemoteSimulation,undefined);
 assert.equal(game.el('boss-img').style.display,'block');const bans=game.get('BOND_BANS.flatMap(g=>g.ops.map(o=>o.charId))');assert.ok(bans.length>=2);
 const run=JSON.parse(store.getItem('ark-solo-setup-v1')),choices=setup.roundChoices(JSON.parse(read('source_battles.json')),run.config,run.seed),info=runtime.roomSetupInfo(run.config,choices,run.seed);
 assert.deepEqual(bans.sort(),info.bannedOperators.map(o=>o.charId).sort(),'local/server opening policy remains the same');
 assert.equal(new Set(info.bannedOperators.map(o=>o.charId)).size,info.bannedOperators.length,'one identity cannot be banned twice');assert.ok(bans.includes('char_1040_blaze2'));
 game.run('infoReady();backToSetupInfo()');assert.deepEqual(game.get('BOND_BANS.flatMap(g=>g.ops.map(o=>o.charId))').sort(),bans);assert.equal(game.el('boss-img').style.display,'block');
 game.run("infoReady();chooseBand('band_amiya')");assert.equal(game.get('G.phase'),'rest');assert.deepEqual(game.get('G.roundChoices'),choices);assert.equal(game.get('G.money'),4);assert.deepEqual(game.get('TEAM_AI'),[]);
 const index=game.get('G.shop.findIndex(s=>s.entry)'),cost=game.get('G.shop['+index+'].cost');assert.ok(index>=0);game.run('confirmBuy('+index+')');assert.equal(game.get('G.money'),4-cost);assert.equal(game.get('G.ops.length'),1);
 game.run("{const o=G.ops[0],cells=BDATA.level.grid.flatMap((row,r)=>row.map((_,c)=>({r,c}))),cell=cells.find(c=>isDeployable(c.r,c.c,o));if(!cell)throw Error('no deployment cell');onDeploy(o,cell.r,cell.c,'up');}");assert.notEqual(game.get('G.ops[0].row'),null);
 game.run('startBattleRound()');assert.equal(game.get('G.phase'),'battle');
 game.run('for(let i=0;i<3900;i++){if(!B.over)update(1/30,1/60);updateRunClock(1/30);}');
 assert.ok(game.get('B.time')>1);assert.ok(game.get('G.runElapsed')>=129,'local clock continues beyond the former disconnect grace');assert.equal(game.calls.some(p=>p.startsWith('/api/')),false,'purchase/deployment/battle never attempt room or launcher APIs');
 // Local configuration is also reachable through a plain static home.
 game.run('backToMenu();');await game.run("startCovenantEntry('solo')");assert.equal(game.ctx.location.href,'room-lab.html?mode=solo');
 // A sole host explicitly freezes a local launch; a concurrent extra member
 // makes that command fail instead of silently launching a partial team.
 let now=1000;const server=createRoomServer({now:()=>now,maxGamePlayers:0});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
   const base='http://127.0.0.1:'+server.address().port;
   async function post(route,body,status=200){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,...body})}),value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
   const host=await post('/api/rooms',{name:'本机 100%'},201),s=host.session,path='/api/rooms/'+s.roomCode;
   await post(path+'/command',{...s,sequence:1,command:{type:'room/set-ready',ready:true}});
   const started=await post(path+'/command',{...s,sequence:2,command:{type:'room/start-local'}}),payload=started.room.localLaunch;
   assert.ok(payload);assert.equal(payload.config.modeId,'mode_single_hard');assert.equal(payload.profile.name,'本机 100%');assert.ok(started.room.players.every(p=>!p.entered));
   assert.deepEqual((await post(path+'/command',{...s,sequence:2,command:{type:'room/start-local'}})).room.localLaunch,payload,'lost launch response retries without a new run');
   await post(path+'/join',{name:'too late'},409);
   const catalog=await runtime.catalogInfo();assert.equal((await post(path+'/game-enter',{...s,gameVersion:GAME_VERSION,catalog:catalog.catalog,runId:1,config:{...payload.config,bandId:'band_amiya'}},409)).error,'LOCAL_RUN','local launch cannot allocate a server VM');
   const received=browser(base+'/index.html#'+new URLSearchParams({solo:JSON.stringify(payload)}));received.load('solo-session.js');assert.equal(received.run('ArkSolo.receive()'),true);assert.deepEqual(JSON.parse(received.storage.getItem('ark-solo-setup-v1')),{...payload,diySelections:{}});assert.match(received.ctx.location.href,/\?solo=1$/);
   const next=await post('/api/rooms',{name:'race'},201),n=next.session,p='/api/rooms/'+n.roomCode;await post(p+'/command',{...n,sequence:1,command:{type:'room/set-ready',ready:true}});
   const guest=(await post(p+'/join',{name:'guest'},201)).session;await post(p+'/command',{...guest,sequence:1,command:{type:'room/set-ready',ready:true}});
   assert.equal((await post(p+'/command',{...n,sequence:2,command:{type:'room/start-local'}},409)).error,'PLAYER_COUNT_CHANGED');
   assert.equal((await post(p+'/sync',n)).room.lobbyPhase,'waiting');
   const uiHost=await post('/api/rooms',{name:'界面单人'},201),uiStore=memory();
   uiStore.setItem('ark-room-lab-session-v1',JSON.stringify({session:uiHost.session,sequence:0,launcherUrl:base}));
   const ui=browser(base+'/room-lab.html',uiStore);ui.ctx.fetch=(url,options)=>fetch(new URL(url,base),options);ui.load('solo-session.js');ui.load('room-lab.js');
   for(let i=0;i<200&&!ui.get('room');i++)await sleep(5);
   assert.equal(ui.get('room.players.length'),1);await ui.el('enter-game').onclick();
   const delivered=JSON.parse(new URL(ui.ctx.location.href).hash?new URLSearchParams(new URL(ui.ctx.location.href).hash.slice(1)).get('solo'):'null');
   assert.equal(delivered?.profile.name,'界面单人','actual lobby Start transfers a sole host to the launcher static origin');assert.equal(delivered.config.modeId,'mode_single_hard');assert.equal(uiStore.getItem('ark-room-lab-session-v1'),null,'handoff removes room credentials before entering local gameplay');
   now+=100000;await sleep(1100);await post(path+'/sync',s,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 console.log('LOCAL SOLO OK: offline APIs, stale room isolation, configured two-stage opening, matching Boss/bans, local economy/deployment/battle past timeout, atomic one-player handoff, replay/join guards and no server VM');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
