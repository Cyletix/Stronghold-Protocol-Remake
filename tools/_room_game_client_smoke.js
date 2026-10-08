'use strict';
// Real browser entry scripts + real HTTP room/runtime. No second economy model.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const {createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION}=require('./room_server');
const WEB=path.resolve(__dirname,'../web'),storageKey='ark-room-lab-session-v1',files=new Map();
const sourceSeasons=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON;
function sourceRecruitPrice(seasonId,charId){
  const season=sourceSeasons[seasonId],slot=Object.values(season.charShopChessDatas).find(s=>s.charId===charId&&!s.isHidden&&['PRESET','NORMAL'].includes(s.chessType));
  assert.ok(slot,'fixed source shop identity '+charId);
  const priceRule=season.charChessDataDict[slot.chessId].garrisonIds.map(id=>season.garrisonDataDict[id]).find(g=>g.effectType==='SERVER_CHESS_PRICE');
  return priceRule?priceRule.blackboard.find(b=>b.key==='price').value:season.shopCharChessInfoData[slot.chessLevel].find(p=>!p.isGolden).purchasePrice;
}
const read=relative=>{if(!files.has(relative))files.set(relative,fs.readFileSync(path.join(WEB,relative),'utf8'));return files.get(relative);};
// As in the runtime test, this in-memory copy exposes a trusted test VM only.
// First-round assertions use unmodified rules. Later fixtures supply resources
// needed to exercise otherwise unreachable preparation controls; no browser or
// production HTTP endpoint can patch state or advance a round.
const runtime=require('./lib/room-game-runtime'),runtimePath=require.resolve('./lib/room-game-runtime'),runtimeSource=fs.readFileSync(runtimePath,'utf8'),marker='return Object.freeze({fingerprint,config:',machines=new Map();
assert.equal(runtimeSource.split(marker).length,2);
const testRuntime=new Module(runtimePath,module);testRuntime.filename=runtimePath;testRuntime.paths=Module._nodeModulePaths(path.dirname(runtimePath));
testRuntime._compile(runtimeSource.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),runtimePath);
runtime.createPlayerRuntime=async(config,options)=>{const result=await testRuntime.exports.createPlayerRuntime(config,options);machines.set(options.name,result.__testMachine);return result;};
let clockOffset=0;const server=createRoomServer({now:()=>Date.now()+clockOffset});
async function main(){
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  const roomSequences=new Map();
  async function post(url,fields){const payload={protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,...fields};if(payload.command?.type?.startsWith('room/'))payload.sequence=(roomSequences.get(payload.playerId)||0)+1;const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const value=await response.json();assert.equal(response.status<300,true,value.message);if(payload.command?.type?.startsWith('room/'))roomSequences.set(payload.playerId,value.ack);return value;}
  const created=await post('/api/rooms',{name:'客户端甲'}),code=created.session.roomCode;
  const extraPortrait=fs.readdirSync(path.join(WEB,'portraits')).find(file=>file.endsWith('.png')&&!['char_102_texas.png','char_1012_skadi2.png','char_1028_texas2.png','char_1019_siege2.png'].includes(file)).slice(0,-4);
  const peer=await post('/api/rooms/'+code+'/join',{name:'客户端乙',portrait:extraPortrait});
  const sourceConfig=JSON.parse(read('source_battles.json'));await post('/api/rooms/'+code+'/command',{...created.session,command:{type:'room/set-config',config:{seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:sourceConfig.seasons.act1autochess.modes.mode_multi_normal.stageChoices[0].levelKey}}});
  for(const session of [created.session,peer.session])await post('/api/rooms/'+code+'/command',{...session,sequence:1,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:2,command:{type:'room/start'}});

  const storage=session=>new Map([[storageKey,JSON.stringify({session,sequence:0})]]);
  function browser(saved,roomCode=code,width=1400,query=''){
    const elements=new Map(),listeners={},requests=[],localWrites=[],deadlines=[];let connected=true,loseNext=false,dropNextBefore=false,omitSnapshots=false,timeoutNextInfo=false,heldSync=null;
    const noop=()=>{},node=id=>{const classes=new Set();return {id,value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,style:{setProperty:noop},children:[],dataset:{},
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle:(n,on)=>{const use=on??!classes.has(n);use?classes.add(n):classes.delete(n);return use;}},
      append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute:noop,addEventListener:noop,
      querySelector:selector=>element(id+' '+selector),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900,width:1400,height:900}),getContext:()=>new Proxy({},{get:()=>noop})};};
    function element(id){if(!elements.has(id))elements.set(id,node(id));return elements.get(id);}
    element('round-progress').children=Array.from({length:12},(_,i)=>node('segment-'+i));
    const context={console,URL,URLSearchParams,AbortController,performance,innerWidth:width,innerHeight:width<=700?844:900,
      location:{href:base+'/index.html'+(roomCode?'?room='+roomCode:query),search:roomCode?'?room='+roomCode:query},
      document:{getElementById:id=>['season-select','diff-select','match-select','map-select','diff-note','match-note','map-note'].includes(id)?null:element(id),querySelector:()=>null,createElement:()=>node('dynamic'),body:element('body'),documentElement:element('html'),hidden:false,addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)},
      localStorage:{getItem:()=>null,setItem:(...entry)=>localWrites.push(entry)},sessionStorage:{getItem:k=>saved?.get(k)??null,setItem:(k,v)=>saved?.set(k,v),removeItem:k=>saved?.delete(k)},
      requestAnimationFrame:()=>0,addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn),Image:function(){this.complete=false;},
      setTimeout:(fn,ms)=>{if(ms!==7000&&ms!==30000)return 0;deadlines.push(ms);return setTimeout(fn,timeoutNextInfo&&ms===30000?0:ms);},clearTimeout,setInterval:()=>0,
      fetch:async(url,options)=>{
        const target=new URL(url,context.location.href);
        if(!target.pathname.startsWith('/api/'))return {ok:true,json:async()=>JSON.parse(read(target.pathname.slice(1))),text:async()=>read(target.pathname.slice(1))};
        if(timeoutNextInfo&&target.pathname==='/api/game-info'){
          timeoutNextInfo=false;
          // Deterministically hold this response until its initialization
          // deadline fires; no dependence on host load or a real 30s sleep.
          return new Promise((resolve,reject)=>{const abort=()=>reject(Object.assign(Error('Injected handshake timeout'),{name:'AbortError'}));if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});
        }
        if(!connected)throw new TypeError('Network unavailable');
        if(heldSync&&target.pathname.endsWith('/game-sync')){const hold=heldSync;heldSync=null;hold.start();await hold.wait;}
        if(target.pathname.endsWith('/game-command')){const body=JSON.parse(options.body);requests.push({sequence:body.sequence,expectedRevision:body.expectedRevision,command:body.command});}
        if(dropNextBefore&&target.pathname.endsWith('/game-command')){dropNextBefore=false;connected=false;throw new TypeError('Request lost before server receives it');}
        const response=await fetch(target,options);
        if(loseNext&&target.pathname.endsWith('/game-command')){loseNext=false;connected=false;throw new TypeError('Response lost after server commit');}
        if(omitSnapshots&&target.pathname.endsWith('/game-sync')){const value=await response.json();return {ok:response.ok,status:response.status,json:async()=>({...value,player:null})};}
        return response;
      }};
    context.window=context;vm.createContext(context);
    for(const [,src]of read('index.html').matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)){if(src.includes('://')||src.startsWith('vendor/'))continue;vm.runInContext(read(src),context,{filename:src});}
    const run=code=>vm.runInContext(code,context),get=code=>JSON.parse(run('JSON.stringify('+code+')'));
    // CSS starts these modals hidden. Wire the real inline HUD click handlers so
    // a key must cross the same room transport boundary as a pointer click.
    for(const id of ['menu','setup','decision-modal','roster-modal','roster-detail','exit-confirm','settlement'])element(id).style.display='none';
    for(const tag of read('index.html').matchAll(/<(?:button|div)\b[^>]+>/g)){
      const id=/\bid="([^"]+)"/.exec(tag[0])?.[1],click=/\bonclick="([^"]+)"/.exec(tag[0])?.[1];
      if(id&&click)element(id).click=()=>{context.event={stopPropagation(){}};return run(click);};
    }
    const pressKey=(code,fields={})=>{for(const fn of listeners.keydown||[])fn({code,key:code.slice(-1).toLowerCase(),preventDefault(){},...fields});};
    return {run,get,pressKey,element,requests,localWrites,deadlines,saved,init:()=>run('initMode()'),idle:()=>run('ArkRoomGame.whenIdle()'),sync:()=>run('ArkRoomGame.sync()'),holdNextSync:()=>{let start,release;const started=new Promise(resolve=>{start=resolve;}),wait=new Promise(resolve=>{release=resolve;});heldSync={start,wait};return {started,release};},connect:()=>{connected=true;},disconnect:()=>{connected=false;},timeoutInfo:()=>{timeoutNextInfo=true;},loseResponse:()=>{loseNext=true;},dropBeforeCommit:()=>{dropNextBefore=true;},omitSnapshots:value=>{omitSnapshots=value;},restoreFromCache:()=>Promise.all((listeners.pageshow||[]).map(fn=>fn({persisted:true}))),stop:()=>{for(const fn of listeners.pagehide||[])fn();}};
  }
  const waiting=await post('/api/rooms',{name:'尚未启动'});const waitingPage=browser(storage(waiting.session),waiting.session.roomCode);await waitingPage.init();assert.match(waitingPage.get('location.href'),/room-lab.html[?]room=/,'direct game URL must return to lobby before host launch');waitingPage.stop();await post('/api/rooms/'+waiting.session.roomCode+'/leave',waiting.session);
  const standalone=browser(null,null);assert.equal(standalone.run('typeof ArkRoomGame'),'undefined','standalone entry has no room transport');assert.equal(standalone.requests.length,0);
  const a=browser(storage(created.session));a.timeoutInfo();await a.init();assert.equal(a.get('ArkRoomGame.status().fatal'),false,'initial handshake timeout must remain recoverable');assert.equal(a.get('ArkRoomGame.status().online'),false);assert.equal(a.deadlines.at(-1),30000,'initialization gets a longer deadline than normal commands');
  a.disconnect();await a.sync();assert.equal(a.get('ArkRoomGame.status().fatal'),false,'an initial offline retry does not cause a false catalog mismatch');
  a.connect();await a.sync();assert.equal(a.get('ArkRoomGame.status().online'),true,a.element('room-game-status').textContent);assert.equal(a.element('setup').style.display,'flex','reconnect opens setup after initial handshake failed: '+a.element('room-game-status').textContent);
  assert.equal(a.element('setup-info').style.display,'flex','a started room first presents the original 1/2 information screen');assert.equal(a.element('setup-pick').style.display,'none');assert.equal(a.element('room-game-panel').hidden,true,'members are inline instead of floating over setup');assert.equal(a.element('room-game-connection').hidden,true,'setup has one inline connection status');assert.match(a.element('boss-name').textContent,/本局首领日程/);assert.ok(a.element('roster-list').innerHTML.includes('参战干员名单'));assert.ok(a.element('bond-meta').innerHTML.includes('setup-bond-icon'));assert.ok(a.get('BOND_BANS.flatMap(g=>g.ops).length')>=2,'shared setup restores a fixed executable ban list');assert.equal(a.element('boss-img').style.display,'block');
  assert.doesNotMatch(read('index.html').split('<div id="setup">')[1].split('<div id="roster-modal">')[0],/<select\b/,'season, difficulty and map controls exist only in the previous room page');
  a.run("chooseBand('band_amiya')");await a.idle();assert.equal(a.get('ArkRoomGame.status().entered'),false,'strategy cannot be confirmed before the information step');a.run('infoReady()');assert.equal(a.element('setup-info').style.display,'none');assert.equal(a.element('setup-pick').style.display,'flex');
  assert.match(a.element('band-matrix').innerHTML,/<button[^>]+aria-label="选择策略：/,'strategy choices have a keyboard control and accessible name');
  assert.deepEqual([...a.element('band-matrix').innerHTML.matchAll(/onclick="pickBand\('([^']+)'\)"/g)].map(match=>match[1]),a.get('setupBands().map(b=>b.bandId)'),'fixed matrix preserves the original source order');
  const strategyCss=read('styles/strategy.css');assert.match(strategyCss,/\.band-matrix\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.doesNotMatch(strategyCss,/auto-fit|transition:none|grid-template-columns:minmax/,'the restored layout cannot reintroduce the replacement adaptive grid');for(const selector of ['pick-left','pick-mid','pick-card'])assert.match(strategyCss,new RegExp('\\.'+selector+'\\{[^}]*transition:flex-basis \\.28s ease'),'original width transition is retained');
  a.run("pickBand('band_amiya')");const chosenBody=a.element('pick-card-body').innerHTML;a.run('backToSetupInfo()');assert.equal(a.element('setup-info').style.display,'flex');assert.match(a.get('location.href'),/index.html\?room=/,'2/2 back returns to information, not to the room');assert.equal(a.get('pickedBandIdx'),'band_amiya');a.run('infoReady()');assert.equal(a.element('pick-card').classList.contains('open'),true);assert.equal(a.element('pick-card-body').innerHTML,chosenBody,'back/next preserves the chosen strategy and card');await a.sync();assert.equal(a.element('pick-card-body').innerHTML,chosenBody);
  assert.equal(a.get('curMatch'),'team','first empty room setup forces multiplayer');a.run("setMatch('solo')");assert.equal(a.get('curMatch'),'team','solo cannot override a network setup');
  assert.equal(a.localWrites.some(([key])=>key==='arknightsRoster'),false,'connecting does not rewrite local operator account');
  await a.run("setDifficulty('difficult');chooseBand('band_amiya')");await a.idle();assert.equal(a.get('ArkRoomGame.status().online'),true,a.element('room-game-status').textContent);assert.equal(a.get('G.phase'),'rest');assert.equal(a.get('G.modeId'),'mode_multi_normal');
  const b=browser(storage(peer.session));await b.init();assert.equal(b.get('setupModeId()'),a.get('G.modeId'),'room configuration is restored before choosing a band');
  assert.equal(b.get('curDiff'),'difficult','room difficulty is authoritative without a repeated selector');
  assert.equal(b.get('curMatch'),'team');assert.equal(b.get('setupStageKey'),a.get('G.mapKey'));assert.equal(b.get('PLAYER_NAME'),'客户端乙');
  await b.run("infoReady();chooseBand('band_amiya')");await b.idle();assert.equal(b.get('G.money'),4);
  const originalB=b.get('G');await a.sync(); // Observe the peer's completed entry before holding the next read.

  // A preparation deadline can change the authoritative revision while a
  // background read is pending. Never retarget the click to that newer shop.
  const staleHold=a.holdNextSync(),staleRead=a.sync();await staleHold.started;
  const staleRevision=a.get('ArkRoomGame.status().revision'),staleMoney=a.get('G.money');
  a.run('onShopCardClick(0);confirmBuy(0)');
  machines.get('客户端甲').run('G.prepareRemaining=0');
  let expired;
  for(let attempt=0;attempt<20;attempt++){
    await new Promise(resolve=>setTimeout(resolve,50));
    expired=await post('/api/rooms/'+code+'/game-sync',{...created.session,catalog:a.get('catalogFingerprint()')});
    if(expired.game.players.find(p=>p.playerId===created.session.playerId).ready)break;
  }
  assert.equal(expired.game.players.find(p=>p.playerId===created.session.playerId).ready,true);
  staleHold.release();await staleRead;await a.idle();
  assert.ok(a.requests.length,'no buy command: '+a.element('flash').textContent+' / '+JSON.stringify(a.get('ArkRoomGame.status()')));assert.equal(a.requests.at(-1).expectedRevision,staleRevision);assert.equal(a.get('G.money'),staleMoney);assert.equal(a.get('G.ops.length'),0,'a stale queued confirmation is rejected instead of applied to the newer revision');
  assert.equal(a.get('ArkRoomGame.status().pending'),false,'a definite rejection clears the queued intent');
  machines.get('客户端甲').run('G.prepareRemaining=60');a.pressKey('KeyC');await a.idle();assert.equal(a.get('ArkRoomGame.status().ready'),false,'C cancels room readiness through the same button');

  await a.sync();const teammateButton=()=>a.element('room-game-players').children.find(button=>button.dataset.playerId===peer.session.playerId);
  assert.equal(a.element('room-game-players').children.length,4,'two players keep four fixed slots, including two empty seats');
  const prepareBanner=a.get('bannerGen');assert.equal(a.element('cb-title').textContent,'准备阶段');await a.sync();assert.equal(a.get('bannerGen'),prepareBanner,'repeated preparation packets do not replay the intro');
  assert.equal(teammateButton().children[0].src,'avatars/'+extraPortrait+'.png','any selected character uses the matching readable avatar in the in-game ally list');
  teammateButton().onclick({detail:1});await a.idle();assert.equal(a.get('ArkRoomGame.status().spectating'),false,'a single teammate click cannot unexpectedly leave your own board');
  assert.match(teammateButton().children.at(-1).textContent,/再次点击/);await a.sync();assert.match(teammateButton().children.at(-1).textContent,/再次点击/,'polling preserves the visible confirmation');
  teammateButton().onclick({detail:1});await a.idle();
  assert.equal(a.get('ArkRoomGame.status().spectating'),true,'avatar selection loads the actual teammate runtime');
  assert.equal(a.get('PLAYER_NAME'),'客户端乙');assert.match(teammateButton().children.at(-1).textContent,/正在观看\n点击返回/);assert.equal(a.get('bannerGen'),prepareBanner,'viewing another board is not a new phase');
  const viewed=a.get('G'),viewRequests=a.requests.length;
  a.run('GameActions.refreshShop();buyShop(0);startBattleRound();onDeploy({id:1},6,1,"right");');await a.idle();
  for(const code of ['KeyS','KeyD','KeyG','KeyC'])a.pressKey(code);await a.idle();
  assert.equal(a.requests.length,viewRequests,'every mutation including ready is blocked while spectating');assert.deepEqual(a.get('G'),viewed);
  await b.sync();await b.run('GameActions.toggleFreeze()');await b.idle();await a.sync();assert.equal(a.get('G.frozen'),true,'teammate preparation changes continue to arrive');
  await b.run('GameActions.toggleFreeze()');await b.idle();
  teammateButton().onclick({detail:1});await a.idle();
  assert.equal(a.get('ArkRoomGame.status().spectating'),false);assert.equal(a.get('PLAYER_NAME'),'客户端甲');assert.equal(a.get('G.frozen'),false,'return self restores independent economy');

  const beforeShortcut=a.requests.length;a.pressKey('KeyS');a.pressKey('KeyS',{repeat:true});await a.idle();assert.equal(a.get('G.frozen'),true,'S routes the button action to server: '+a.element('room-game-status').textContent+' '+JSON.stringify(a.requests));
  assert.equal(a.requests.length,beforeShortcut+1,'holding S must not send a second network command');
  assert.equal(a.requests.at(-1).command.type,'game/freeze');await b.sync();assert.equal(b.get('G.frozen'),false,'another player owns separate economy');
  assert.equal(a.deadlines.at(-1),7000,'ordinary operations keep their short response deadline');
  // Reward previews stay local, including clock polling; only explicit confirmation sends a claim.
  const reloadOwnView=async()=>{await a.run('ArkRoomGame.viewPlayer('+JSON.stringify(peer.session.playerId)+')');await a.run('ArkRoomGame.viewPlayer('+JSON.stringify(created.session.playerId)+')');};
  machines.get('客户端甲').run('globalThis.__beforeMergeTest=JSON.stringify(G);showMergeReward();');await reloadOwnView();
  const mergeRequests=a.requests.length,mergeOps=a.get('G.ops.length'),mergeShop=a.get('G._mergeReward.savedShop');
  a.run('onShopCardClick(0);onShopCardClick(0)');await a.sync();
  assert.equal(a.requests.length,mergeRequests,'preview must not send the old immediate reward command');
  assert.equal(a.get('shopPreview'),0,'snapshot polling preserves the pending reward preview');assert.equal(a.get('G.ops.length'),mergeOps);
  a.run('onShopCardClick(1);confirmMergeReward(0)');await a.idle();assert.equal(a.requests.length,mergeRequests,'stale preview cannot submit a reward');
  const mergeId=a.get('G.shop[1].entry.charId');a.run('confirmMergeReward(1);confirmMergeReward(1)');await a.idle();
  assert.equal(a.requests.length,mergeRequests+1,'double confirmation sends one authoritative claim');
  assert.equal(a.requests.at(-1).command.type,'game/merge-reward');assert.equal(a.get('G._mergeReward'),null);assert.equal(a.get('shopPreview'),-1);
  assert.equal(a.get('G.ops.filter(o=>o.charId==='+JSON.stringify(mergeId)+').length'),1);assert.deepEqual(a.get('G.shop'),mergeShop);
  machines.get('客户端甲').run('replaceGameSession(JSON.parse(globalThis.__beforeMergeTest),"test.merge.restore");delete globalThis.__beforeMergeTest;refreshBoard();');await reloadOwnView();
  // Find two cards deployable on the same kind of cells, then use both real card
  // clicks (preview + confirm). Every purchase index is taken from its revision.
  const pair=a.get(`(()=>{const ops=G.shop.filter(x=>x.type==='op');for(const first of ops){const same=ops.filter(x=>x.entry.position===first.entry.position);if(same.length>1)return same.slice(0,2).map(x=>x.entry.charId);}return [];})()`);
  assert.equal(pair.length,2);
  let sourceSpent=0;assert.equal(a.get('G.money'),4,'first round allowance stays four before actual purchases');
  for(const [pairIndex,charId] of pair.entries()){
    const index=a.get('G.shop.findIndex(x=>x.type===\'op\'&&x.entry.charId==='+JSON.stringify(charId)+')'),money=a.get('G.money');
    const expectedPrice=sourceRecruitPrice(a.get('G.seasonId'),charId);assert.equal(a.get('G.shop['+index+'].cost'),expectedPrice,'shop respects source recruitment-price traits');sourceSpent+=expectedPrice;
    const held=pairIndex===0?a.holdNextSync():null,read=held?a.sync():null;if(held)await held.started;
    const clickRevision=a.get('ArkRoomGame.status().revision'),requestCount=a.requests.length;
    a.run('onShopCardClick('+index+')');assert.equal(a.get('G.money'),money,'preview does not buy locally');
    assert.equal(a.get('shopPreview'),index,'a background snapshot read does not block the shop preview');
    if(held){assert.equal(a.get('ArkRoomGame.status().polling'),true);assert.equal(a.get('ArkRoomGame.status().busy'),false);assert.equal(a.element('body').classList.contains('room-game-locked'),false);}
    a.run('confirmBuy('+index+')');
    if(held){assert.equal(a.get('ArkRoomGame.status().pending'),true,'the real confirmation button records its intent during an in-flight poll');assert.equal(a.requests.length,requestCount,'command waits for the earlier read');held.release();await read;}
    await a.idle();assert.equal(a.get('G.money'),money-expectedPrice,'one server purchase charges the actual source price once');assert.equal(a.requests.at(-1).command.type,'game/buy');assert.equal(a.requests.at(-1).expectedRevision,clickRevision,'queued confirmation preserves the revision at click time');
  }
  assert.equal(a.get('G.ops.length'),2);const ids=a.get('G.ops.map(x=>x.id)');
  assert.equal(a.get('G.money'),4-sourceSpent,'random shops can include one-cost recruitment traits; no deployment income is applied yet');
  assert.equal(a.get('isDeployable(6,11)'),false,'native move/trap preview rejects the neighboring player area');
  assert.equal(a.get('onCanDeploy(6,11)'),false,'operator deploy preview consumes the same server-owned cells');
  const cells=a.get(`(()=>{const z=modeBattleZoneRows(BDATA.level),out=[];for(let row=z.lb;row<z.rb;row++)for(let col=0;col<BDATA.level.cols;col++)if(G.ops.every(o=>isDeployable(row,col,o)))out.push({row,col});return out;})()`);
  assert.ok(cells.length>=2);
  for(let i=0;i<2;i++){await a.run('onDeploy(G.ops.find(x=>x.id==='+ids[i]+'),'+cells[i].row+','+cells[i].col+',"right")');await a.idle();}
  assert.equal(a.get('G.ops[0].dir'),'right');assert.equal(a.get('B.phase'),'rest','operations never start a local battle');
  machines.get('客户端甲').run('G._deployBonus=2-deployLimit()');await a.sync();
  a.run('startMoveDrag(B.operators.find(o=>o.id==='+ids[0]+'),0,0,0,0)');
  assert.equal(a.get('canDropOperator(drag,'+cells[1].row+','+cells[1].col+')'),true,'authoritative full-capacity valid swap preview is green');
  assert.equal(a.get('canDropOperator(drag,6,11)'),false,'shared query retains neighboring-seat restrictions');a.run('drag=null');
  a.run('window.__beforeMoveSfx=playSfx;window.__moveCues=[];playSfx=name=>__moveCues.push(name);');
  await a.run('onMoveOp('+ids[0]+','+cells[1].row+','+cells[1].col+',"down")');await a.idle();
  assert.deepEqual(a.get('__moveCues'),['b_char_set'],'authoritative swap plays deployment sound once');await a.sync();assert.equal(a.get('__moveCues.length'),1,'repeated snapshots do not replay movement sound');a.run('playSfx=__beforeMoveSfx;');
  assert.equal(a.get('G.ops[0].row'),cells[1].row);assert.equal(a.get('G.ops[1].row'),cells[0].row);assert.equal(a.get('G.ops[0].dir'),'down');
  assert.equal(a.get('G.ops[1].col'),cells[0].col,'swap preserves both owned units');
  machines.get('客户端甲').run('G._deployBonus=0');await a.sync();
  machines.get('客户端甲').run('G.money=20;rewardEquip();refreshBoard();');
  await a.run('GameActions.toggleFreeze()');await a.idle();const equipId=a.get('G.equipInv[0].uid');
  const beforeUpgrade=a.get('G.level');a.pressKey('KeyG');await a.idle();assert.equal(a.get('G._upgradeConfirm'),true);
  await a.run('onTileClick(6,2)');await a.idle();assert.equal(a.requests.at(-1).command.type,'game/cancel-upgrade');assert.equal(a.get('G._upgradeConfirm'),false);
  a.pressKey('KeyG');await a.idle();assert.equal(a.get('G.level'),beforeUpgrade,'key after authoritative cancellation only previews upgrade');
  a.pressKey('KeyG');await a.idle();assert.equal(a.get('G.level'),beforeUpgrade+1,'second key confirms server upgrade');
  await b.sync();assert.ok(b.element('room-game-events').children.some(line=>line.textContent.includes('基地升至 '+(beforeUpgrade+1)+' 级')),'teammates receive confirmed base upgrade events');
  await a.run('onEquipDeploy('+equipId+','+ids[0]+',1)');await a.idle();assert.equal(a.get('G.equipInv.length'),0);assert.equal(a.get('G.ops[0].equip[1].uid'),equipId);
  const bench=a.get('candidateCells(BDATA.level)[0]');await a.run('onBenchRecall('+ids[1]+','+bench.row+','+bench.col+')');await a.idle();assert.equal(a.get('G.ops[1].row'),null);
  const bench2=a.get('candidateCells(BDATA.level)[1]');await a.run('onBenchMove('+ids[1]+','+bench2.row+','+bench2.col+')');await a.idle();assert.deepEqual(a.get('G.ops[1].bench'),bench2);
  await a.run('onBenchSell('+ids[1]+')');await a.idle();assert.equal(a.get('G.ops.length'),1);

  const before=a.get('G');a.run('saveRestRun();loadRestRun();nextRound();startRound(2);enterNormalMode();applyPreset(3);updatePreparationClock(999);updateRunClock(999);');
  assert.deepEqual(a.get('G'),before,'old helpers/storage/timers cannot mutate a network run');
  await a.run('startBattleRound()');await a.idle();assert.equal(a.get('ArkRoomGame.status().ready'),true);assert.equal(a.get('G.phase'),'rest');
  const locked=a.get('G'),requests=a.requests.length;a.run('GameActions.refreshShop();buyShop(0);onOpSell('+ids[0]+');');await a.idle();assert.equal(a.requests.length,requests);assert.deepEqual(a.get('G'),locked,'ready locks every operating route');
  await a.run('startBattleRound()');await a.idle();assert.equal(a.get('ArkRoomGame.status().ready'),false);

  // A command that never reached the host must be cancelled after recovery,
  // not replayed later against a different shop. An incomplete response cannot
  // unlock writes or clear the unresolved command before a full snapshot.
  const notSentFrozen=a.get('G.frozen');a.dropBeforeCommit();await a.run('GameActions.toggleFreeze()');await a.idle();
  const notSentRequests=a.requests.length;assert.equal(a.get('ArkRoomGame.status().pending'),true);
  assert.equal(a.element('room-game-connection').hidden,false,'network loss remains visible independently of the collapsible panel');
  a.connect();a.omitSnapshots(true);await a.sync();
  assert.equal(a.get('ArkRoomGame.status().online'),false,'missing full player snapshot keeps the recovered transport locked');
  assert.equal(a.get('ArkRoomGame.status().pending'),true);assert.equal(a.element('body').classList.contains('room-game-locked'),true);
  a.omitSnapshots(false);await a.sync();assert.equal(a.get('ArkRoomGame.status().pending'),false);
  assert.equal(a.get('G.frozen'),notSentFrozen);assert.equal(a.requests.length,notSentRequests,'unaccepted old intent is not automatically sent on reconnect');
  assert.match(a.element('room-game-connection-detail').textContent,/未确认的操作已取消/);

  // Server commits a command but its reply and recovery sync are lost. Reload
  // must acknowledge that exact intent, not spend again on a fresh shop index.
  const frozen=a.get('G.frozen');a.loseResponse();await a.run('GameActions.toggleFreeze()');await a.idle();
  assert.equal(a.get('G.frozen'),frozen,'no optimistic state mutation');assert.equal(a.get('ArkRoomGame.status().pending'),true);
  const pending=JSON.parse(a.saved.get(storageKey)).pendingGameCommand;assert.equal(pending.command.type,'game/freeze');
  const blockedCalls=a.requests.length;a.run('GameActions.refreshShop();confirmBuy(0);');await a.idle();assert.equal(a.requests.length,blockedCalls,'disconnected operations cannot queue another purchase');
  a.stop();const restored=browser(a.saved,code,390);await restored.init();assert.equal(restored.get('G.frozen'),!frozen);assert.equal(restored.get('ArkRoomGame.status().pending'),false);assert.equal(restored.get('ArkRoomGame.status().sequence'),pending.sequence);
  assert.equal(restored.element('room-game-players').children.length,4,'narrow viewport retains the same four stable slots');
  assert.doesNotMatch(read('index.html'),/id="room-game-(?:toggle|view-self|reconnect|home|return)"/,'no standalone reconnect, return-view, collapse, or duplicate home controls');
  assert.equal(restored.requests.length,0,'accepted pending command is not resent after reload');
  assert.equal(restored.get('G.ops[0].equip[1].uid'),equipId,'equipment snapshot survives reload');
  await b.sync();assert.deepEqual(b.get('G.ops'),originalB.ops,'peer inventory remains isolated');
  assert.equal(JSON.parse(restored.saved.get(storageKey)).sequence,0,'game commands do not overwrite room-ready sequence');

  // Timer callbacks are deliberately manual in this harness. Complete the
  // independent ready heartbeat and following normal read before clicking.
  await restored.run('ArkRoomPresence.whenIdle()');await b.run('ArkRoomPresence.whenIdle()');await restored.sync();await b.sync();
  assert.equal(restored.element('start-btn').disabled,false,'full snapshot handoff enables the real preparation control');assert.equal(b.element('start-btn').disabled,false);

  await restored.run('startBattleRound()');await restored.idle();await b.run('startBattleRound()');await b.idle();await restored.sync();
  assert.equal(restored.get('ArkRoomGame.status().phase'),'battle',restored.element('room-game-status').textContent);assert.equal(restored.get('B.phase'),'battle');
  assert.equal(restored.element('start-btn').style.display,'none','battle has no manual advance or ready control');
  const battle=restored.get('B'),battleRequests=restored.requests.length;
  restored.run('GameActions.refreshShop();startBattleRound();update(10,10);updateRunClock(10);updatePreparationClock(10);render=()=>{};window.__stepCamera=()=>{};loop(0);loop(1000);');
  assert.deepEqual(restored.get('B'),battle,'local frame loop and callbacks never advance authoritative combat or its real-time clock');assert.equal(restored.requests.length,battleRequests);
  await new Promise(resolve=>setTimeout(resolve,250));await restored.sync();assert.ok(restored.get('B.time')>battle.time,'live server ticks reach the rendering client');
  let continuousTime=restored.get('B.time');
  for(let i=0;i<3;i++){
    await restored.run('ArkRoomPresence.beat()');await b.run('ArkRoomPresence.beat()');await new Promise(resolve=>setTimeout(resolve,100));await restored.sync();
    assert.equal(restored.get('ArkRoomPresence.status().snapshotReady'),true,'normal full snapshot polling never toggles renderer readiness off');
    assert.equal(restored.get('ArkRoomGame.status().paused'),false,'healthy independent heartbeats do not intermittently pause combat');
    assert.ok(restored.get('B.time')>continuousTime,'normal battle simulation continues through repeated polls and heartbeats');continuousTime=restored.get('B.time');
  }
  const activeTime=restored.get('B.time');restored.stop();const battleReload=browser(restored.saved);await battleReload.init();
  assert.equal(battleReload.get('B.phase'),'battle');assert.ok(battleReload.get('B.time')>=activeTime,'reload hydrates the ongoing battle instead of restarting it');
  const beforeCache=battleReload.get('B.time');battleReload.stop();await new Promise(resolve=>setTimeout(resolve,150));await battleReload.restoreFromCache();
  await battleReload.run('ArkRoomPresence.whenIdle()');await new Promise(resolve=>setTimeout(resolve,100));await battleReload.sync();
  // Heartbeat reattachment, the 50ms host tick and a snapshot read are separate
  // tasks. Wait for observed advancement, not a single 100ms scheduling window.
  for(let i=0;i<20&&battleReload.get('B.time')<=beforeCache;i++){await new Promise(resolve=>setTimeout(resolve,100));await battleReload.sync();}
  assert.equal(battleReload.get('ArkRoomGame.status().online'),true);assert.ok(battleReload.get('B.time')>beforeCache,'browser back/forward cache restores fresh authority instead of a permanently frozen old page: '+JSON.stringify({beforeCache,now:battleReload.get('B.time'),status:battleReload.get('ArkRoomGame.status()')}));
  await battleReload.run('ArkRoomGame.viewPlayer('+JSON.stringify(peer.session.playerId)+')');await battleReload.idle();
  assert.equal(battleReload.get('ArkRoomGame.status().spectating'),true);assert.equal(battleReload.get('B.phase'),'battle');assert.equal(battleReload.get('B.operators.length'),0,'spectated battle is the peer formation, not a local copy');
  clockOffset+=13000;await battleReload.sync();assert.equal(battleReload.get('ArkRoomGame.status().paused'),true,'missing teammate pauses the authoritative session');
  assert.match(battleReload.element('room-game-connection-title').textContent,/等待 客户端乙.*秒/);
  const pausedTime=battleReload.get('B.time');await new Promise(resolve=>setTimeout(resolve,150));await battleReload.sync();assert.equal(battleReload.get('B.time'),pausedTime,'wait snapshots retain the same combat time');
  await b.sync();await battleReload.sync();assert.equal(battleReload.get('ArkRoomGame.status().paused'),false);
  assert.match(battleReload.element('room-game-connection-title').textContent,/连接已恢复/,'all participants are told when the shared wait is over');
  clockOffset+=75000;await battleReload.sync();await b.sync();assert.equal(battleReload.get('ArkRoomGame.status().readOnly'),true);
  assert.equal(battleReload.get('ArkRoomGame.status().phase'),'over');assert.match(battleReload.element('room-game-status').textContent,/返回同盟大厅/);
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:3,command:{type:'room/return-lobby'}});
  await battleReload.sync();assert.match(battleReload.get('location.href'),/room-lab.html[?]room=/);
  assert.equal(battleReload.get('ArkRoomGame.status().entered'),false);assert.equal(JSON.parse(battleReload.saved.get(storageKey)).gameSequence,0,'return to lobby clears the previous run command sequence');
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:4,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...peer.session,sequence:2,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:5,command:{type:'room/start'}});
  const staleSaved=JSON.parse(battleReload.saved.get(storageKey));staleSaved.gameSequence=900;staleSaved.pendingGameCommand={sequence:901,expectedRevision:1,command:{type:'game/freeze'}};battleReload.saved.set(storageKey,JSON.stringify(staleSaved));
  const secondRun=browser(battleReload.saved);await secondRun.init();assert.equal(secondRun.get('ArkRoomGame.status().runId'),2);assert.equal(secondRun.get('ArkRoomGame.status().sequence'),0);assert.equal(secondRun.get('ArkRoomGame.status().pending'),false);assert.equal(secondRun.requests.length,0,'new run discards a previous run intent before any mutation');
  secondRun.run('infoReady()');const enterHold=secondRun.holdNextSync(),enterRead=secondRun.sync();await enterHold.started;secondRun.run("chooseBand('band_amiya')");
  clockOffset+=75000;await post('/api/rooms/'+code+'/sync',created.session);await post('/api/rooms/'+code+'/sync',peer.session);
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:6,command:{type:'room/return-lobby'}});
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:7,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...peer.session,sequence:3,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+code+'/command',{...created.session,sequence:8,command:{type:'room/start'}});
  enterHold.release();await enterRead;await secondRun.idle();assert.equal(secondRun.get('ArkRoomGame.status().runId'),3);
  assert.equal(secondRun.get('ArkRoomGame.status().entered'),false,'a strategy click queued behind a read cannot be retargeted into a later run');
  await secondRun.run("infoReady();chooseBand('band_amiya')");await secondRun.idle();assert.equal(secondRun.get('G.round'),1);assert.equal(secondRun.get('G.money'),4,'the same room starts a fresh playable run');secondRun.stop();battleReload.stop();
  a.stop();b.stop();restored.stop();
  for(const s of [created.session,peer.session])await post('/api/rooms/'+code+'/leave',s);

  // Manual summons must cross the actual browser -> HTTP -> battle-session
  // boundary too. Runtime-only assertions cannot detect a client phase lock.
  const tacticalRoom=await post('/api/rooms',{name:'战术甲'}),tc=tacticalRoom.session.roomCode;
  const tacticalPeer=await post('/api/rooms/'+tc+'/join',{name:'战术乙'}),ts=[tacticalRoom.session,tacticalPeer.session];
  await post('/api/rooms/'+tc+'/command',{...ts[0],command:{type:'room/set-config',config:{seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01'}}});
  for(const s of ts)await post('/api/rooms/'+tc+'/command',{...s,command:{type:'room/set-ready',ready:true}});
  await post('/api/rooms/'+tc+'/command',{...ts[0],command:{type:'room/start'}});
  const tacticalPages=ts.map(s=>browser(storage(s),tc));
  for(let i=0;i<2;i++){
    const page=tacticalPages[i];await page.init();page.run("infoReady();chooseBand('band_amiya')");await page.idle();
    machines.get(i?'战术乙':'战术甲').run(`{G.bannedOperators=[];G.ops=[];G.equipInv=[];G.prepareRemaining=9999;const o=addOperator('char_249_mlyss',true);o.row=6;o.col=4;o.dir='right';addOperator('char_469_indigo',false);refreshBoard();}`);
    await page.sync();const owner=page.get('G.ops[0].id');
    page.run(`tacticalAction('place',${owner},6,5,'right')`);await page.idle();
    assert.equal(page.get('B.summoneds[0].col'),5,'manual preparation point is acknowledged by the server');
  }
  for(const page of tacticalPages){page.run('startBattleRound()');await page.idle();}
  for(const name of ['战术甲','战术乙'])machines.get(name).run(`{B.enemies=[];B.spawn=[{at:99999,enemyId:'none'}];B.roundLimit=99999;for(const o of B.operators){o.deployed=true;o.hp=o.maxHp;o.sp=0;o.skill.isPassive=true;}ArkTactician.advance(0);for(const s of B.summoneds)if(s.flow)s.flow.sp=100;}`);
  const tp=tacticalPages[0];await tp.sync();assert.equal(tp.get('B.phase'),'battle');
  tp.run("onTacticalSelect(B.summoneds.find(s=>s.flow));tacticalTokenAction('copy-open')");await tp.idle();
  assert.equal(tp.requests.at(-1).command.type,'game/tactical');assert.equal(tp.get('ArkFlowShape.copying(B.summoneds.find(s=>s.flow))'),true);
  tp.run(`{const donor=B.bench.find(o=>!o.isTactical),s=B.summoneds.find(s=>s.flow);startBenchDrag(donor,0,0,0,0);if(!drag)throw Error('network copy drag is blocked');drag.moved=true;boardXY=()=>[(s.col+.5)*TILE,(s.row+.5)*TILE];onUp({});}`);await tp.idle();
  assert.equal(tp.get('B.summoneds.find(s=>s.flow).flow.sourceId'),'char_469_indigo');assert.equal(tp.get('G.ops.filter(o=>o.row==null).length'),1);
  tp.run("onTacticalSelect(B.summoneds.find(s=>s.flow));tacticalTokenAction('retreat')");await tp.idle();assert.equal(tp.get('B.summoneds.find(s=>s.flow).tacticalDormant'),true);
  await tp.run('ArkRoomGame.viewPlayer('+JSON.stringify(ts[1].playerId)+')');await tp.idle();
  const beforeTacticalView=tp.requests.length;tp.run("tacticalAction('copy-open',G.ops[0].id)");await tp.idle();assert.equal(tp.requests.length,beforeTacticalView,'spectating cannot issue a teammate summon command');
  for(const page of tacticalPages)page.stop();for(const s of ts)await post('/api/rooms/'+tc+'/leave',s);

  // A one-person room uses the same strategy screen and its frozen single
  // rules. It cannot silently rebuild the old multiplayer/local setup.
  const soloRoom=await post('/api/rooms',{name:'独立客户端',playMode:'solo'}),soloCode=soloRoom.session.roomCode;
  await post('/api/rooms/'+soloCode+'/command',{...soloRoom.session,command:{type:'room/set-ready',ready:true}});
  const soloStarted=await post('/api/rooms/'+soloCode+'/command',{...soloRoom.session,command:{type:'room/start'}});
  const soloPage=browser(storage(soloRoom.session),soloCode,390);await soloPage.init();
  assert.equal(soloPage.get('curMatch'),'solo');assert.equal(soloPage.get('setupModeId()'),soloStarted.room.config.modeId);assert.equal(soloPage.element('setup-info').style.display,'flex');assert.equal(soloPage.element('setup-pick').style.display,'none');assert.equal(soloPage.element('room-game-panel').hidden,true);soloPage.run('infoReady()');
  assert.equal(soloPage.element('room-strategy-status').hidden,true,'a healthy solo picker does not display a redundant waiting-for-yourself panel');
  soloPage.run("pickBand('band_amiya')");await soloPage.sync();assert.equal(soloPage.get('pickedBandIdx'),'band_amiya');assert.equal(soloPage.element('pick-card').classList.contains('open'),true);
  soloPage.disconnect();await soloPage.sync();assert.equal(soloPage.element('room-strategy-status').hidden,false,'solo connection errors remain visible');assert.equal(soloPage.element('pick-confirm-btn').disabled,true);soloPage.connect();await soloPage.sync();assert.equal(soloPage.element('room-strategy-status').hidden,true);assert.equal(soloPage.element('pick-confirm-btn').disabled,false);
  for(const boss of soloStarted.room.setupInfo.bosses)assert.ok(soloPage.element('boss-desc').textContent.includes(boss.name),'information displays the host-frozen Boss schedule');
  if(soloStarted.room.setupInfo.bosses.some(boss=>boss.hidden))assert.match(soloPage.element('boss-desc').textContent,/满足解锁条件后/,'hidden rounds are conditional instead of promised encounters');
  await soloPage.run("chooseBand('band_amiya')");await soloPage.idle();assert.equal(soloPage.get('G.modeId'),soloStarted.room.config.modeId);assert.equal(soloPage.get('G.mapKey'),soloStarted.room.config.mapKey);assert.deepEqual(soloPage.get('TEAM_AI'),[]);assert.equal(soloPage.element('room-game-panel').hidden,true,'a single player has no redundant alliance HUD in battle');soloPage.stop();
  await post('/api/rooms/'+soloCode+'/leave',soloRoom.session);

  const invalid=browser(storage({...created.session,token:'expired-test-token'}));await invalid.init();assert.equal(invalid.get('ArkRoomGame.status().fatal'),true);assert.equal(invalid.element('room-entry-status').hidden,false);assert.equal(invalid.element('body').classList.contains('room-session-invalid'),true);assert.equal(invalid.element('room-game-panel').hidden,true);assert.equal(invalid.element('room-entry-lobby').href,'room-lab.html');invalid.stop();
  const missing=browser(null);await missing.init();assert.equal(missing.get('ArkRoomGame.status().fatal'),true);assert.equal(missing.element('room-entry-status').hidden,false);assert.match(missing.element('room-entry-message').textContent,/未找到本房间身份/);missing.stop();

  const defaultsPage=browser(null,null);await defaultsPage.init();defaultsPage.run('showSetup()');assert.equal(defaultsPage.get('setupSeason()'),'act2autochess');assert.equal(defaultsPage.get('setupModeId()'),'mode_single_hard');assert.equal(defaultsPage.get('setupStageKey'),'activities/act2autochess/level_act2autochess_m01','an unset local entry chooses the first actual season II map, not the first cross-season catalog item');
  defaultsPage.run("infoReady();pickBand(setupBands()[0].bandId)");const localPicked=defaultsPage.get('pickedBandIdx'),localCard=defaultsPage.element('pick-card-body').innerHTML;defaultsPage.run('backToSetupInfo();infoReady()');assert.equal(defaultsPage.get('pickedBandIdx'),localPicked);assert.equal(defaultsPage.element('pick-card-body').innerHTML,localCard);assert.equal(defaultsPage.element('pick-card').classList.contains('open'),true,'static fallback keeps the same selection across both steps');
  defaultsPage.run("setSetupSeason('act1autochess');setDifficulty('difficult');showSetup()");assert.equal(defaultsPage.get('setupSeason()'),'act1autochess');assert.equal(defaultsPage.get('setupModeId()'),'mode_single_normal','reopening information preserves an explicit choice');assert.deepEqual(defaultsPage.get('BOND_BANS'),[]);defaultsPage.stop();

  // Compatibility feature links still use the original index document. Closing
  // each feature restores its menu; covenant opens only the mode subpage.
  const launcherHome='http://127.0.0.1:43129';
  for(const screen of ['roster','formation','practice','settings']){
    const feature=browser(null,null,1400,'?screen='+screen+'&home='+encodeURIComponent(launcherHome));if(screen==='formation')feature.run("window.ArkDiySelection={open:(sid,options)=>{window.formationRequest={sid,options}}}");await feature.init();
    const sameDocument=feature.get('location.href');
    if(screen==='roster'){assert.equal(feature.element('roster-modal').style.display,'flex');feature.run('closeRoster()');assert.equal(feature.element('roster-modal').style.display,'none');}
    if(screen==='formation'){assert.deepEqual(feature.get('formationRequest'),{sid:'act2autochess',options:{chooseSeason:true}});feature.run('showMenu()');}
    if(screen==='practice'){assert.equal(feature.get('GMODE'),'normal');assert.equal(feature.element('main').style.display,'flex');feature.run('backToMenu()');}
    if(screen==='settings'){assert.equal(feature.element('game-settings').hidden,false);feature.run('setGameBgmVolume(0.2)');assert.equal(feature.run("document.getElementById('bgm').volume"),0.2);assert.ok(feature.localWrites.some(([key])=>key==='arknightsAudioV1'),'settings keep the existing audio preference persistence');feature.run('showMenu()');assert.equal(feature.element('game-settings').hidden,true);}
    assert.equal(feature.get('location.href'),sameDocument,'feature close keeps the original index document');assert.equal(feature.element('menu').style.display,'flex');feature.run('enterMode()');assert.equal(feature.get('location.href'),launcherHome+'/room-lab.html?mode=solo');feature.stop();
  }
  const localPage=browser(null,null);await localPage.init();assert.equal(localPage.element('body').classList.contains('mode-menu'),true);localPage.run('enterMode()');assert.equal(localPage.get('location.href'),'room-lab.html?mode=solo','bare index opens the shared configuration page');await localPage.run("startCovenantEntry('solo')");assert.equal(localPage.get('location.href'),'room-lab.html?mode=solo');localPage.stop();
  const staticPage=browser(null,null,390,'?home='+encodeURIComponent('https://untrusted.example'));await staticPage.init();const staticDocument=staticPage.get('location.href');staticPage.run("fetch=async()=>({ok:false,json:async()=>({})})");await staticPage.run("startCovenantEntry('team')");assert.equal(staticPage.get('location.href'),'room-lab.html?mode=solo&view=team');assert.equal(staticPage.get('G'),null,'static multiplayer cannot create fake local teammates');await staticPage.run("startCovenantEntry('solo')");assert.equal(staticPage.get('location.href'),'room-lab.html?mode=solo','plain static service uses the unified settings without probing a room API');staticPage.stop();
  console.log('ROOM GAME CLIENT OK real UI/HTTP authority, frozen solo/team strategy and Boss schedule, accessible strategy controls, invalid-session exits, launcher feature/home routes, static solo fallback; portraits, teammate viewing, full-snapshot/ack recovery without replay, continuous combat, timeout read-only and fresh runs remain verified');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
