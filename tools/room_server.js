'use strict';
// Room transport and isolated authoritative preparation; no persistent writes or repository APIs.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {pairAlivePlayers}=require('../web/src/simulation/paired-battle');
const {createBattleSession,roundChoices}=require('./lib/room-battle-session');
const PROTOCOL_VERSION=1,CLIENT_VERSION='room-lab-20260911.1';
const GAME_VERSION='room-game-20261003.1';
const LOBBY_PORTRAITS=['char_102_texas','char_1012_skadi2','char_1028_texas2','char_1019_siege2'];
const {listPortraits,isValidPortrait}=require('./lib/room-profile');
const PROJECT_ROOT=path.resolve(__dirname,'..');
// Lazy loading keeps plain lobby use independent of game resource initialization.
const gameRuntime=()=>require('./lib/room-game-runtime');
const WEB_ROOT=fs.realpathSync(path.join(__dirname,'../web'));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wasm':'application/wasm'};
function failure(status,code,message){return Object.assign(new Error(message),{status,code});}
function checkedConfig(fn){try{return fn();}catch(e){throw failure(400,e.code||'INVALID_CONFIG',e.message);}}
function createRoomServer(options={}){
  if(options.singleRoomCode&&!/^[A-Z2-9]{6}$/.test(options.singleRoomCode))throw Error('Invalid launcher room code');
  const now=options.now||Date.now,disconnectAfterMs=options.disconnectAfterMs??12000,reconnectGraceMs=options.reconnectGraceMs??60000;
  const startupWaitMs=options.startupWaitMs??300000;
  const rooms=new Map(),maxRooms=options.maxRooms??64;
  let gamePlayers=0;
  const maxGamePlayers=options.maxGamePlayers??8;
  const hash=token=>crypto.createHash('sha256').update(token).digest();
  function updatePairing(room){
    // Lobby preview only: no authoritative game life exists yet. A disconnected
    // room occupant is not eliminated, and clients cannot submit life patches.
    room.pairingPreview=pairAlivePlayers([...room.players.values()].map(p=>({id:p.id})),{seed:room.pairSeed,round:1,kind:'boss'});
  }
  function releaseRuntime(p){if(p?.runtime){p.runtime.dispose?.();p.runtime=null;gamePlayers--;}}
  const hasGame=p=>!!(p?.runtime||p?.finalState);
  function archiveFinishedRoom(room){
    if(room.battle?.phase!=='over'||![...room.players.values()].every(p=>!p.connected||p.forfeited))return;
    // Keep only public final snapshots when nobody can still play. Reconnecting
    // seats can view the ended run without retaining its expensive isolated VMs.
    for(const p of room.players.values())if(p.runtime){p.finalState=room.battle.view(p);p.finalStatus=p.runtime.status();releaseRuntime(p);}
  }
  function forfeitPlayer(room,p,reason){
    if(p.forfeited)return;p.forfeited=true;p.forfeitReason=reason;p.ready=false;room.battle?.forfeit(p);room.revision++;
    if(room.hostId===p.id){const replacement=[...room.players.values()].find(x=>x.id!==p.id&&!x.forfeited&&x.connected&&now()-x.lastSeen<disconnectAfterMs);if(replacement)room.hostId=replacement.id;}
  }
  function dropPlayer(room,id){const p=room.players.get(id);if(p&&room.started)forfeitPlayer(room,p,'left');if(p?.runtime&&!room.battle?.remove(p))releaseRuntime(p);room.players.delete(id);if(room.hostId===id)room.hostId=([...room.players.values()].find(x=>x.connected)||room.players.values().next().value)?.id||null;}
  function serialize(room,fn){const task=(room.gameQueue||Promise.resolve()).then(fn);room.gameQueue=task.catch(()=>{});return task;}
  function connectionStatus(room){
    const startup=room.started&&!room.battle?.hasStarted;
    const waitingPlayers=[...room.players.values()].flatMap(p=>{
      const s=p.runtime?.status()||p.finalStatus;if(p.forfeited||(s&&(s.phase==='over'||s.life<=0)))return [];
      const syncing=p.presenceRunId===room.runId&&(!p.rendererReady||!p.snapshotReady)&&(hasGame(p)||room.battle?.hasStarted);
      if(p.connected&&!syncing)return [];
      const reason=!p.connected?'disconnected':p.rendererReady?'syncing':'loading';
      const deadline=startup?(room.startedAt+startupWaitMs):!p.connected?p.lastSeen+disconnectAfterMs+reconnectGraceMs:(p.syncPendingSince??now())+reconnectGraceMs;
      return [{id:p.id,name:p.name,reason,deadlineAt:deadline,remainingMs:Math.max(0,deadline-now())}];
    });
    const finished=['over','error'].includes(room.battle?.phase);
    return {state:waitingPlayers.length?'waiting':'connected',paused:!!room.started&&!finished&&waitingPlayers.length>0,graceMs:startup?startupWaitMs:reconnectGraceMs,remainingMs:waitingPlayers.length?Math.min(...waitingPlayers.map(p=>p.remainingMs)):0,waitingPlayers,forfeitedPlayers:[...room.players.values()].filter(p=>p.forfeited).map(p=>({id:p.id,name:p.name,reason:p.forfeitReason}))};
  }
  function startupStatus(room){
    const active=!!room.started&&!room.battle?.hasStarted&&!['over','error'].includes(room.battle?.phase);
    const waitingPlayers=active?[...room.players.values()].filter(p=>!hasGame(p)&&!p.forfeited).map(p=>({id:p.id,name:p.name,connected:p.connected,stage:p.presenceRunId===room.runId&&p.rendererReady?'selecting':'loading'})):[];
    const remainingMs=active?Math.max(0,(room.startedAt??now())+startupWaitMs-now()):0;
    return {active,phase:waitingPlayers.some(p=>p.stage==='loading')?'loading':waitingPlayers.length?'selecting':'preparing',deadlineAt:active?room.startedAt+startupWaitMs:null,remainingMs,overdue:active&&remainingMs===0,waitingPlayers};
  }
  function sweep(){
    const t=now();
    for(const [code,room]of rooms){
      let membersChanged=false;
      if(room.localLaunch){if([...room.players.values()].every(p=>t-p.lastSeen>=disconnectAfterMs+reconnectGraceMs))rooms.delete(code);continue;}
      for(const [id,p]of room.players){
        if(p.connected&&t-p.lastSeen>=disconnectAfterMs){p.connected=false;p.ready=false;if(p.gameReady)p.gameRevision++;p.gameReady=false;room.revision++;}
        if(t-p.lastSeen>=disconnectAfterMs+reconnectGraceMs){
          if(room.started){if(room.battle?.hasStarted&&!p.forfeited&&!['over','error'].includes(room.battle?.phase))forfeitPlayer(room,p,'connection-timeout');}
          else {dropPlayer(room,id);room.revision++;membersChanged=true;}
        }
      }
      if(room.started&&!room.battle?.hasStarted){
        const host=room.players.get(room.hostId);
        if(host&&!host.connected&&t-host.lastSeen>=disconnectAfterMs+reconnectGraceMs){const replacement=[...room.players.values()].find(x=>x.connected&&!x.forfeited&&t-x.lastSeen<disconnectAfterMs);if(replacement){room.hostId=replacement.id;room.revision++;}}
      }
      archiveFinishedRoom(room);
      if(membersChanged)updatePairing(room);
      if(!room.players.size){room.battle?.dispose();rooms.delete(code);}
    }
  }
  function snapshot(room){
    const players=[...room.players.values()].map(p=>({id:p.id,name:p.name,slot:p.slot,portrait:p.portrait,ready:p.ready,connected:p.connected,entered:hasGame(p),forfeited:!!p.forfeited,readOnly:!!p.forfeited}));
    const finished=room.started&&['over','error'].includes(room.battle?.phase);
    const connection=connectionStatus(room),startup=startupStatus(room),canCancelStart=startup.active;
    return {code:room.code,revision:room.revision,runId:room.runId||0,playMode:room.playMode,localOnly:room.playMode==='solo',localLaunch:room.localLaunch||null,settings:{...room.settings},config:room.gameConfig||null,setupInfo:room.setupInfo||null,capacity:room.playMode==='solo'?1:4,hostId:room.hostId,creatorId:room.creatorId,lobbyPhase:finished?'finished':room.started?'started':'waiting',canCancelStart,canReturnToLobby:!!finished||canCancelStart||(connection.paused&&connection.remainingMs===0),startup,connection,minPlayers:1,players,pairingPreview:room.pairingPreview,allReady:players.length>=1&&players.every(p=>p.connected&&p.ready)};
  }
  function gameSnapshot(room,p,applied,viewPlayerId=p.id){
    // A spectator's saved target belongs to the previous run. Always deliver
    // the lobby transition even after all of those runtimes have been reset.
    if(!room.started)viewPlayerId=p.id;
    if(typeof viewPlayerId!=='string'||!room.players.has(viewPlayerId))throw failure(400,'INVALID_VIEW','只能查看本房间的玩家。');
    const target=room.players.get(viewPlayerId);
    if(target!==p&&((!hasGame(p)&&!p.forfeited)||!hasGame(target)))throw failure(409,'VIEW_NOT_READY','双方进入本局后才能查看队友。');
    const players=[...room.players.values()].map(x=>room.battle?.playerSummary(x)||{playerId:x.id,entered:!!x.runtime,ready:!!x.gameReady,connected:x.connected,revision:x.gameRevision||0});
    let state=null;if(hasGame(target)){state=room.battle.view(target);}
    return {room:snapshot(room),viewPlayerId,ack:p.gameSequence||0,...(applied==null?{}:{applied}),game:{config:room.gameConfig||null,...(room.battle?.summary()||{phase:'preparing',events:[],battles:[]}),players,
      allReady:room.battle?.allReady()||false},player:hasGame(target)?{revision:target.gameRevision,frame:room.battle?.frame||0,state}:null};
  }
  function newPlayer(room,name,portrait){
    if(room.started)throw failure(409,'ROOM_STARTED','协议已启动，不能中途加入；已有成员可用原标签重连。');
    if(room.playMode==='solo'&&room.players.size)throw failure(409,'SOLO_ROOM','这是本机单人房间，请使用同盟入口与朋友连接。');
    if(room.players.size>=4)throw failure(409,'ROOM_FULL','房间已满；离线席位会暂时保留，请等待或让该玩家退出。');
    validateProfile(name,portrait);
    const slot=[0,1,2,3].find(n=>![...room.players.values()].some(p=>p.slot===n));
    const token=crypto.randomBytes(32).toString('base64url');
    const p={id:crypto.randomUUID(),name:uniqueName(room,name),slot,portrait:portrait||LOBBY_PORTRAITS[slot],tokenHash:hash(token),lastSeen:now(),connected:true,ready:false,lastSequence:0,lastCommand:null};
    if(!room.hostId){room.hostId=p.id;if(!room.creatorId)room.creatorId=p.id;}
    room.players.set(p.id,p);room.revision++;updatePairing(room);
    return {session:{roomCode:room.code,playerId:p.id,token},ack:0,room:snapshot(room)};
  }
  function uniqueName(room,name,exceptId){
    const base=name.trim(),used=new Set([...room.players.values()].filter(p=>p.id!==exceptId).map(p=>p.name.toLocaleLowerCase()));
    let candidate=base,n=2;while(used.has(candidate.toLocaleLowerCase())){const suffix=' #'+n++;candidate=base.slice(0,20-suffix.length)+suffix;}return candidate;
  }
  function validateProfile(name,portrait){
    if(typeof name!=='string'||!name.trim()||name.trim().length>20||/[\u0000-\u001f\u007f]/.test(name))throw failure(400,'INVALID_NAME','昵称须为 1～20 个字符。');
    if(portrait!==undefined&&!isValidPortrait(PROJECT_ROOT,portrait))throw failure(400,'INVALID_PORTRAIT','请选择列表中的展示干员。');
  }
  function authenticate(room,b){
    const p=room.players.get(b.playerId);
    if(!p||typeof b.token!=='string'||b.token.length>128||!crypto.timingSafeEqual(hash(b.token),p.tokenHash))throw failure(401,'INVALID_SESSION','席位已失效或重连凭据不正确，请重新加入。');
    if(!p.connected){p.connected=true;p.ready=false;p.gameReady=false;room.revision++;}
    const host=room.players.get(room.hostId);if(host&&!host.connected&&room.hostId!==p.id&&(host.forfeited||(room.started&&!room.battle?.hasStarted&&now()-host.lastSeen>=disconnectAfterMs+reconnectGraceMs))){room.hostId=p.id;room.revision++;}
    p.lastSeen=now();return p;
  }
  function json(res,status,value){
    let payload=Buffer.from(JSON.stringify(value));
    res.setHeader('Vary','Accept-Encoding');
    if(payload.length>=1024&&/\bgzip\b/.test(res.req.headers['accept-encoding']||'')){payload=zlib.gzipSync(payload,{level:1});res.setHeader('Content-Encoding','gzip');}
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':payload.length});res.end(payload);
  }
  async function body(req){
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw failure(415,'JSON_REQUIRED','请使用 JSON 消息。');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>4096)throw failure(413,'MESSAGE_TOO_LARGE','消息超过 4 KiB 限制。');chunks.push(chunk);}
    let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure(400,'INVALID_JSON','消息格式不正确。');}
    if(!b||typeof b!=='object'||Array.isArray(b))throw failure(400,'INVALID_JSON','消息必须是对象。');
    if(b.protocolVersion!==PROTOCOL_VERSION||b.clientVersion!==CLIENT_VERSION)throw failure(409,'VERSION_MISMATCH','房间协议版本不一致，请刷新双方实验页面。');
    return b;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      const origin=req.headers.origin;
      if(origin){let valid=false;try{const u=new URL(origin);valid=u.protocol==='http:'&&u.host===req.headers.host;}catch{}if(!valid)throw failure(403,'ORIGIN_REJECTED','仅接受当前服务页面发起的请求。');}
      let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://room.local').pathname);}catch{throw failure(400,'INVALID_PATH','地址格式不正确。');}
      if(pathname.startsWith('/api/')){
        sweep();
        if(pathname==='/api/room-info'&&req.method==='GET')return json(res,200,{protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,lobbyVersion:1,heartbeatIntervalMs:2000,disconnectAfterMs,reconnectGraceMs,capacity:4,...(options.onlineShareCode?{onlineShareCode:options.onlineShareCode}: {})});
        if(pathname==='/api/portraits'&&req.method==='GET')return json(res,200,{portraits:listPortraits(PROJECT_ROOT)});
        if(pathname==='/api/client-manifest'&&req.method==='GET')return json(res,200,await require('./lib/room-web-client').clientManifest(PROJECT_ROOT));
        if(pathname==='/api/game-info'&&req.method==='GET')return json(res,200,{protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,...await gameRuntime().catalogInfo()});
        if(req.method!=='POST')throw failure(405,'METHOD_NOT_ALLOWED','此接口只接受 POST。');
        const b=await body(req);
        if(pathname==='/api/rooms'){
          if(b.playMode!==undefined&&!['solo','team'].includes(b.playMode))throw failure(400,'INVALID_PLAY_MODE','请选择单人或同盟模式。');
          if(rooms.size>=maxRooms)throw failure(503,'ROOM_LIMIT','当前房间过多，请稍后重试。');
          const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
          if(options.singleRoomCode){code=options.singleRoomCode;if(rooms.has(code))throw failure(409,'ROOM_EXISTS','同盟已创建，请使用分享码加入。');}
          else do{code=Array.from({length:6},()=>alphabet[crypto.randomInt(alphabet.length)]).join('');}while(rooms.has(code));
          const room={code,playMode:b.playMode||'team',settings:b.settings===undefined?gameRuntime().defaultRoomSettings():checkedConfig(()=>gameRuntime().validateRoomSettings(b.settings)),players:new Map(),revision:0,started:false,pairSeed:crypto.randomBytes(4).readUInt32BE(0)};const result=newPlayer(room,b.name,b.portrait);rooms.set(code,room);return json(res,201,result);
        }
        const match=pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|sync|presence|command|leave|game-enter|game-sync|game-command)$/);
        if(!match)throw failure(404,'NOT_FOUND','接口不存在。');
        const room=rooms.get(match[1]);if(!room)throw failure(404,'ROOM_NOT_FOUND','房间不存在或已过期，请重新创建或加入。');
        if(match[2]==='join')return json(res,201,newPlayer(room,b.name,b.portrait));
        const p=authenticate(room,b);
        if(match[2]==='presence'){
          if(b.gameVersion!==undefined&&b.gameVersion!==GAME_VERSION)throw failure(409,'GAME_VERSION_MISMATCH','联机页面已更新，请刷新后重连。');
          if((b.rendererReady!==undefined&&typeof b.rendererReady!=='boolean')||(b.snapshotReady!==undefined&&typeof b.snapshotReady!=='boolean'))throw failure(400,'INVALID_PRESENCE','加载状态格式不正确。');
          // A stale tab may refresh its identity, but must not overwrite the
          // new run's renderer readiness before learning the current run id.
          if(room.started&&b.runId===room.runId&&typeof b.rendererReady==='boolean'&&typeof b.snapshotReady==='boolean'){
            if(p.presenceRunId!==room.runId||p.rendererReady!==b.rendererReady||p.snapshotReady!==b.snapshotReady)room.revision++;
            p.presenceRunId=room.runId;p.rendererReady=b.rendererReady;p.snapshotReady=b.snapshotReady;
            if(!p.rendererReady||!p.snapshotReady)p.syncPendingSince??=now();else p.syncPendingSince=null;
          }
          return json(res,200,{ack:p.lastSequence,gameAck:p.gameSequence||0,room:snapshot(room)});
        }
        if(match[2]==='leave'){dropPlayer(room,p.id);room.revision++;updatePairing(room);if(!room.players.size){room.battle?.dispose();rooms.delete(room.code);}return json(res,200,{left:true});}
        if(match[2]==='sync')return json(res,200,{ack:p.lastSequence,room:snapshot(room)});
        if(match[2].startsWith('game-'))return await serialize(room,async()=>{
          if(!room.players.has(p.id))throw failure(401,'INVALID_SESSION','席位已失效，请重新加入。');
          if(b.gameVersion!==GAME_VERSION)throw failure(409,'GAME_VERSION_MISMATCH','联机页面已更新，请刷新后重连。');
          const info=await gameRuntime().catalogInfo();
          if(b.catalog!==info.catalog)throw failure(409,'CATALOG_MISMATCH','双方游戏数据不一致，请使用同一房间服务提供的页面。');
          if(match[2]==='game-sync')return json(res,200,gameSnapshot(room,p,undefined,b.viewPlayerId??p.id));
          if(!room.started)throw failure(409,'LOBBY_NOT_STARTED','请先在同盟大厅准备，等待房主启动协议。');
          if(b.runId!==room.runId)throw failure(409,'STALE_RUN','这是上一局的操作，请同步当前对局后重试。');
          if(p.forfeited)throw failure(409,'PLAYER_FORFEITED','重连等待已超时，本局已退出；可以继续观看同盟，或等本局结束后再加入下一局。');
          if(['over','error'].includes(room.battle?.phase))throw failure(409,'GAME_FINISHED','本局已结束，请返回同盟大厅，等待房主开始下一局。');
          if(room.localLaunch)throw failure(409,'LOCAL_RUN','本局已转为本机单人，不再接受联机操作。');
          if(match[2]==='game-enter'){
            const supplied=b.config;
            if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)||!['bandId','mapKey','modeId','seasonId'].every(k=>Object.hasOwn(supplied,k))||Object.keys(supplied).some(k=>!['bandId','mapKey','modeId','seasonId','skillChoices','diySelections'].includes(k)))throw failure(400,'INVALID_CONFIG','请完整选择赛季、模式、地图和策略。');
            const config={seasonId:supplied.seasonId,modeId:supplied.modeId,mapKey:supplied.mapKey,bandId:supplied.bandId,...(supplied.skillChoices!==undefined?{skillChoices:supplied.skillChoices}:{}),...(supplied.diySelections!==undefined?{diySelections:supplied.diySelections}:{})};
            if(p.runtime){
              if(JSON.stringify(p.gameConfig)!==JSON.stringify(config))throw failure(409,'GAME_ALREADY_STARTED','已经进入本局，不能重复选择策略覆盖进度。');
              return json(res,200,gameSnapshot(room,p,false));
            }
            const common={seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey};
            if(!room.gameConfig||JSON.stringify(common)!==JSON.stringify(room.gameConfig))throw failure(409,'CONFIG_MISMATCH','本局赛季、难度和地图已经由房间设置确定，请同步后选择策略。');
            if(gamePlayers>=maxGamePlayers)throw failure(503,'GAME_LIMIT','当前运营对局已满，请稍后重试。');
            gamePlayers++;
            let runtime;
            try{
              const seed=crypto.createHash('sha256').update(room.code+':'+room.pairSeed+':'+p.id).digest().readUInt32BE(0);
              runtime=await gameRuntime().createPlayerRuntime(config,{seed,enemySeed:room.pairSeed,name:p.name,bannedOperators:room.setupInfo?.bannedOperators||[]});
              if(!room.players.has(p.id)||p.forfeited)throw failure(401,'INVALID_SESSION','席位已失效，请重新加入。');
            }catch(error){gamePlayers--;runtime?.dispose?.();if(['INVALID_CONFIG','INVALID_PAYLOAD'].includes(error.code))throw failure(400,error.code,error.message);throw error;}
            try{runtime.alignRoundChoices(room.roundChoices);}catch(e){runtime.dispose();gamePlayers--;throw e;}
            p.runtime=runtime;p.gameConfig={...config};p.gameSequence=0;p.gameRevision=1;p.gameReady=false;p.lastGameCommand=null;
            room.battle ||= createBattleSession(room,{now,release:releaseRuntime,isPaused:()=>connectionStatus(room).paused});
            room.revision++;
            return json(res,200,gameSnapshot(room,p,true));
          }
          if(connectionStatus(room).paused)throw failure(409,'CONNECTION_WAIT','同盟成员正在加载或同步，已暂停本局；恢复连接后继续。');
          if(!p.runtime)throw failure(409,'GAME_NOT_STARTED','请先选择本局策略。');
          const c=b.command;
          if(!Number.isSafeInteger(b.sequence)||b.sequence<1||!c||typeof c!=='object'||Array.isArray(c)||typeof c.type!=='string')throw failure(400,'INVALID_COMMAND','命令格式错误。');
          const key=JSON.stringify(c);
          if(b.sequence===p.gameSequence&&key===p.lastGameCommand)return json(res,200,gameSnapshot(room,p,false));
          if(b.sequence!==p.gameSequence+1)throw failure(409,'SEQUENCE_MISMATCH','命令序号不一致，请同步进度后重试。');
          if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision!==p.gameRevision)throw failure(409,'STALE_GAME_STATE','画面已过期，请同步后重新选择。');
          const tacticalBattle=c.type==='game/tactical'&&room.battle.phase==='battle';
          if(!tacticalBattle&&(room.battle.phase!=='preparing'||p.runtime.status().phase!=='rest'))throw failure(409,'WRONG_PHASE','当前正在自动作战或已结束，不能调整运营。');
          const oldLevel=p.runtime.status().level;
          if(c.type==='game/ready'){
            if(Object.keys(c).sort().join(',')!=='ready,type'||typeof c.ready!=='boolean')throw failure(400,'INVALID_COMMAND','准备命令格式错误。');
            const state=p.runtime.snapshot();
            if(c.ready&&(state.session?._mergeReward||state.ui?.decisionPending))throw failure(409,'PENDING_CHOICE','请先完成当前选择。');
            p.gameReady=c.ready;
          }else{
            if(p.gameReady)throw failure(409,'PLAYER_READY','请先取消准备再调整运营。');
            const {type,...payload}=c,result=tacticalBattle?room.battle.tacticalCommand(p,payload):await p.runtime.command(type,payload,p.id);
            if(!result.ok)throw failure(400,result.error?.code||'GAME_COMMAND_REJECTED',result.error?.message||'当前状态无法执行此操作。');
          }
          p.gameSequence=b.sequence;p.lastGameCommand=key;p.gameRevision++;room.revision++;
          room.battle.upgrade(p,oldLevel);
          // Rollback of a failed start is owned by the barrier; expose the
          // concrete failure via its error state instead of losing an ack.
          room.battle.tick();
          return json(res,200,gameSnapshot(room,p,true));
        });
        // Lobby launch is authoritative and distinct from each battle's ready state.
        return await serialize(room,async()=>{
        if(!room.players.has(p.id))throw failure(401,'INVALID_SESSION','席位已失效，请重新加入。');
        const c=b.command;
        if(!Number.isSafeInteger(b.sequence)||b.sequence<1||!c||typeof c!=='object'||Array.isArray(c))throw failure(400,'INVALID_COMMAND','同盟命令格式不正确。');
        const fields=Object.keys(c).sort().join(',');
        if(!((c.type==='room/set-ready'&&fields==='ready,type'&&typeof c.ready==='boolean')||(['room/start','room/start-local','room/return-lobby'].includes(c.type)&&fields==='type')||(c.type==='room/set-config'&&fields==='config,type')||(c.type==='room/set-profile'&&fields==='name,portrait,type')||(c.type==='room/kick'&&fields==='playerId,type'&&typeof c.playerId==='string')))throw failure(400,'INVALID_COMMAND','不支持的同盟操作。');
        let selectedConfig;if(c.type==='room/set-config'){if(room.hostId!==p.id)throw failure(403,'HOST_ONLY','只有房主可以修改本局难度和地图。');selectedConfig=checkedConfig(()=>gameRuntime().validateRoomSettings(c.config));}
        const key=JSON.stringify(c.type==='room/set-ready'?{type:c.type,ready:c.ready}:c.type==='room/kick'?{type:c.type,playerId:c.playerId}:c.type==='room/set-profile'?{type:c.type,name:c.name,portrait:c.portrait}:c.type==='room/set-config'?{type:c.type,config:selectedConfig}:{type:c.type});
        if(b.sequence===p.lastSequence&&key===p.lastCommand)return json(res,200,{applied:false,ack:p.lastSequence,room:snapshot(room)});
        if(b.sequence!==p.lastSequence+1)throw failure(409,'SEQUENCE_MISMATCH','命令序号不一致，请同步房间后重试。');
        if(c.type==='room/return-lobby'){
          if(room.hostId!==p.id)throw failure(403,'HOST_ONLY','仅房主可以返回大厅并开始下一局。');
          if(!snapshot(room).canReturnToLobby)throw failure(409,'GAME_NOT_FINISHED','作战尚未结束；可以在首次开战前取消启动，或在同步等待超时后结束本局。');
          room.battle?.dispose();room.battle=null;room.started=false;room.localLaunch=null;room.gameConfig=null;room.setupInfo=null;room.roundChoices=null;room.pairSeed=crypto.randomBytes(4).readUInt32BE(0);
          for(const member of room.players.values()){
            releaseRuntime(member);member.finalState=null;member.finalStatus=null;member.ready=false;member.gameReady=false;member.gameConfig=null;member.gameSequence=0;member.gameRevision=0;member.lastGameCommand=null;member.forfeited=false;member.forfeitReason=null;member.presenceRunId=null;member.syncPendingSince=null;if(!member.connected)member.lastSeen=now()-disconnectAfterMs;
          }
          room.revision++;updatePairing(room);
        }else if(room.started)throw failure(409,'ROOM_STARTED','协议已启动，请返回本局；大厅准备已结束。');
        else if(c.type==='room/start'||c.type==='room/start-local'){
          if(room.hostId!==p.id)throw failure(403,'HOST_ONLY','仅房主可以启动协议。');
          if(!snapshot(room).allReady)throw failure(409,'PLAYERS_NOT_READY','至少一名玩家在线，且所有成员准备后才能启动。');
          if(c.type==='room/start-local'&&room.players.size!==1)throw failure(409,'PLAYER_COUNT_CHANGED','已有其他成员加入，请全员准备后按多人模式开始。');
          const config=checkedConfig(()=>gameRuntime().roomConfigForPlayers(room.settings,room.players.size));
          const choices=roundChoices(config,room.pairSeed),setupInfo=gameRuntime().roomSetupInfo(config,choices,room.pairSeed);
          room.gameConfig=config;room.roundChoices=choices;room.setupInfo=setupInfo;
          room.started=true;room.startedAt=now();room.runId=(room.runId||0)+1;if(c.type==='room/start-local')room.localLaunch={config,seed:room.pairSeed,profile:{name:p.name,portrait:p.portrait}};
          else room.battle=createBattleSession(room,{now,release:releaseRuntime,isPaused:()=>connectionStatus(room).paused});room.revision++;
        }else if(c.type==='room/set-config'){
          const config=selectedConfig;
          if(JSON.stringify(config)!==JSON.stringify(room.settings)){room.settings=config;for(const member of room.players.values())member.ready=false;room.revision++;}
        }else if(c.type==='room/set-profile'){
          validateProfile(c.name,c.portrait);p.name=uniqueName(room,c.name,p.id);p.portrait=c.portrait;p.ready=false;room.revision++;
        }else if(c.type==='room/kick'){
          if(room.hostId!==p.id)throw failure(403,'HOST_ONLY','仅房主可以移出成员。');
          if(c.playerId===p.id||!room.players.has(c.playerId))throw failure(400,'INVALID_PLAYER','不能移出自己或不存在的成员。');
          dropPlayer(room,c.playerId);room.revision++;updatePairing(room);
        }else if(p.ready!==c.ready){p.ready=c.ready;room.revision++;}
        p.lastSequence=b.sequence;p.lastCommand=key;
        return json(res,200,{applied:true,ack:p.lastSequence,room:snapshot(room)});
        });
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw failure(405,'METHOD_NOT_ALLOWED','静态页面仅支持读取。');
      if(pathname.includes('\\')||pathname.includes('\0'))throw failure(404,'NOT_FOUND','文件不存在。');
      const target=path.resolve(WEB_ROOT,'.'+(pathname==='/'?'/room-lab.html':pathname));
      if(!target.startsWith(WEB_ROOT+path.sep))throw failure(404,'NOT_FOUND','文件不存在。');
      let file,stat;try{file=await fs.promises.realpath(target);stat=await fs.promises.stat(file);}catch{throw failure(404,'NOT_FOUND','文件不存在。');}
      if(!file.startsWith(WEB_ROOT+path.sep)||!stat.isFile())throw failure(404,'NOT_FOUND','文件不存在。');
      const etag='W/"'+stat.size.toString(16)+'-'+Math.trunc(stat.mtimeMs).toString(16)+'"';
      // Store static resources, but revalidate before reuse so source updates
      // cannot strand a browser on a stale catalog or protocol bundle.
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',etag);
      res.setHeader('Vary','Accept-Encoding');
      if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
      const compress=stat.size>=1024&&['.html','.js','.css','.json','.svg'].includes(path.extname(file).toLowerCase())&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
      if(compress)res.setHeader('Content-Encoding','gzip');
      res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',...(!compress?{'Content-Length':stat.size}:{})});
      if(req.method==='HEAD')return res.end();
      const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());
      if(compress){const gzip=zlib.createGzip({level:1});gzip.on('error',()=>res.destroy());stream.pipe(gzip).pipe(res);}else stream.pipe(res);
    }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.code||'SERVER_ERROR',message:error.status?error.message:'房间服务暂时不可用。'});else res.destroy();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  const timer=setInterval(sweep,1000);timer.unref();
  const battleTimer=setInterval(()=>{for(const room of rooms.values())if(room.battle&&!room.tickQueued){const battle=room.battle;room.tickQueued=true;serialize(room,()=>{if(room.battle===battle)battle.tick();}).finally(()=>{room.tickQueued=false;}).catch(()=>{});}},50);battleTimer.unref();
  server.on('close',()=>{clearInterval(timer);clearInterval(battleTimer);for(const room of rooms.values()){room.battle?.dispose();for(const id of room.players.keys())dropPlayer(room,id);}rooms.clear();});
  return server;
}
module.exports={createRoomServer,PROTOCOL_VERSION,CLIENT_VERSION,GAME_VERSION};
if(require.main===module){
  const args=process.argv.slice(2);let host='127.0.0.1',port=8001;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--host'&&args[i+1])host=args[++i];
    else if(args[i]==='--port'&&args[i+1])port=Number(args[++i]);
    else{console.error('Usage: node tools/room_server.js [--host 127.0.0.1] [--port 8001]');process.exit(1);}
  }
  if(!Number.isInteger(port)||port<1||port>65535){console.error('Invalid port');process.exit(1);}
  const server=createRoomServer();server.on('error',e=>{console.error('Room server:',e.message);process.exitCode=1;});
  server.listen(port,host,()=>console.log('Room: http://'+(host.includes(':')?'['+host+']':host)+':'+port+'/room-lab.html (server-authoritative preparation and automatic battles)'));
  for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>{server.close();server.closeAllConnections();});
}
