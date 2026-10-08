(function roomGameClient(){
  'use strict';
  if(typeof location==='undefined'||!new URL(location.href).searchParams.has('room'))return;
  const roomCode=new URL(location.href).searchParams.get('room').trim().toUpperCase();
  const STORAGE_KEY='ark-room-lab-session-v1',PROTOCOL_VERSION=1,CLIENT_VERSION='room-lab-20260911.1',GAME_VERSION='room-game-20261003.1';
  const original={},el=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value));
  let session=null,catalog=null,room=null,game=null,revision=-1,sequence=0,runId=0,pending=null,online=false,busy=false,initialized=false,stopped=false,fatal=false,timer=null;
  let message='正在连接房间服务…',lastTask=Promise.resolve(),snapshotState=null,setupShown=false,setupStep='info',deploymentCells=new Set();
  let viewPlayerId=null,requestedViewPlayerId=null,frame=-1,levelSignature='',cameraSignature='',presentationSignature='',playersSignature='',eventsSignature='';
  let polling=false,pollTask=null,recovering=false,offlineSince=0,connectionAt=0,recoveryNotice='',recoveryNoticeUntil=0,launcherUrl=null,connectionTimer=null,fatalCode='';
  // The host advances both simulation and clocks. This browser only paints
  // authoritative snapshots; a hidden tab or slower machine cannot change play.
  window.__roomRemoteSimulation=true;
  let armedPlayerId=null,armTimer=null,eventTimer=null;
  const phaseNotices=window.ArkPhaseNotice.create();
  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.session?.roomCode===roomCode&&typeof saved.session.playerId==='string'&&typeof saved.session.token==='string'){
      session=saved.session;sequence=Number.isSafeInteger(saved.gameSequence)?saved.gameSequence:0;
      runId=Number.isSafeInteger(saved.gameRunId)?saved.gameRunId:0;
      if(saved.diySelections)window.__roomDiySelections=saved.diySelections;
      if(saved.pendingGameCommand&&Number.isSafeInteger(saved.pendingGameCommand.sequence))pending=saved.pendingGameCommand;
      if(/^http:\/\/127\.0\.0\.1:\d+$/.test(saved.launcherUrl||''))launcherUrl=saved.launcherUrl;
    }
  }catch{}
  function persist(){
    if(!session)return;
    try{const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'{}');
      if(saved.session?.playerId!==session.playerId)return;
      sessionStorage.setItem(STORAGE_KEY,JSON.stringify({...saved,gameSequence:sequence,gameRunId:runId,pendingGameCommand:pending,diySelections:window.__roomDiySelections}));
    }catch{}
  }
  function self(){return game?.players?.find(p=>p.playerId===session?.playerId);}
  function spectating(){return !!viewPlayerId&&viewPlayerId!==session?.playerId;}
  function preparing(){return game?.phase==='preparing'&&snapshotState?.session?.phase==='rest';}
  function paused(){return !!room?.connection?.paused;}
  function readOnly(){return !!(self()?.eliminated||self()?.readOnly||self()?.forfeited);}
  function writable(){return initialized&&online&&!recovering&&!paused()&&!busy&&!pending&&!fatal&&!stopped&&!!snapshotState&&!spectating()&&preparing()&&!self()?.ready&&!readOnly();}
  function tacticalWritable(){return initialized&&online&&!recovering&&!paused()&&!busy&&!pending&&!fatal&&!stopped&&!!snapshotState&&!spectating()&&!readOnly()&&(preparing()&&!self()?.ready||game?.phase==='battle'&&!snapshotState.session.battleDone);}
  window.onCanTacticalInteract=tacticalWritable;
  function note(text){message=text;renderStatus();return false;}
  function unavailable(){return note(spectating()?'正在观看队友，返回自己的战场后才能调整。':!online||recovering?'连接尚未恢复，运营操作已锁定。':paused()?'正在等待队友恢复连接，运营与作战已暂停。':readOnly()?'你已结束本局，可以继续观看同盟。':pending?'上一条操作尚待服务器确认。':!preparing()?'战斗由主机自动推进，当前不能调整阵容。':self()?.ready?'请先取消准备，再调整运营。':'正在等待服务器确认，请稍候。');}
  function renderConnection(){
    const box=el('room-game-connection'),heading=el('room-game-connection-title'),detail=el('room-game-connection-detail');if(!box)return;
    let title='',copy='',severity='waiting';
    if(fatal){severity='error';title=['CATALOG_MISMATCH','GAME_VERSION_MISMATCH','VERSION_MISMATCH'].includes(fatalCode)?'联机版本不一致':'本次连接已结束';copy=message+' 可以返回联机首页重新创建或加入。';}
    else if(!online||recovering){
      const seconds=offlineSince?Math.max(1,Math.floor((Date.now()-offlineSince)/1000)):0;
      title=seconds?'与主机断开 · 已等待 '+seconds+' 秒':'正在同步同盟状态…';
      copy='正在自动重连，运营操作已暂停。连接恢复后先同步完整战场；主机关闭时请返回联机首页。';
    }else if(paused()){
      const connection=room.connection,names=(connection.waitingPlayers||[]).map(p=>p.name).join('、')||'队友',syncing=(connection.waitingPlayers||[]).some(p=>p.reason==='syncing'||p.reason==='loading');
      const seconds=Math.ceil(Math.max(0,(connection.remainingMs||0)-(Date.now()-connectionAt))/1000);
      title='等待 '+names+(syncing?' 同步战场':' 重新连接')+' · '+seconds+' 秒';
      copy=syncing?'全员的准备计时与作战已暂停，完整战场同步后继续。若长时间停留，可返回大厅，由房主中止并重新开局。':'全员的准备计时与作战已暂停。恢复后同步继续；首次开战前不会因暂时离线而弃权。';
    }else if(game?.phase==='error'){severity='error';title='本局运行已停止';copy=(game.error||'主机运行异常')+'。请返回同盟大厅，由房主重新开局。';}
    else if(Date.now()<recoveryNoticeUntil){severity='restored';title='连接已恢复，战场同步完成';copy=readOnly()?'你的本局已经结束，可以查看最终战场，或返回同盟大厅。':recoveryNotice||'已恢复主机保存的阵容、进度与计时，可以继续。';}
    else if(room?.startup?.active&&room.startup.waitingPlayers?.length){
      const loading=room.startup.waitingPlayers.map(p=>p.name).join('、');
      title='等待 '+loading+' 完成加载或选择策略';copy=room.startup.overdue?'等待时间较长，可返回同盟大厅，由房主取消本次启动后重新开始。':'开局准备尚未完成，加载期间保留席位，完成策略选择后继续。';
    }
    box.hidden=!title;box.className='room-connection '+severity;if(heading.textContent!==title)heading.textContent=title;if(detail.textContent!==copy)detail.textContent=copy;
    if(!snapshotState){box.hidden=true;el(setupStep==='info'?'room-info-status-message':'room-strategy-status-message').textContent=title?title+' · '+copy:message;}
  }
  function renderStatus(){
    const panel=el('room-game-panel');if(!panel)return;
    const strategy=!snapshotState&&!fatal;
    panel.hidden=!snapshotState||fatal||room?.players?.length===1;document.body.classList.add('room-game-active');document.body.classList.toggle('room-strategy',strategy);document.body.classList.toggle('room-session-invalid',fatal);
    el('room-entry-status').hidden=(!fatal&&(!initialized||setupShown||!!snapshotState));el('room-entry-title').textContent=fatal?'无法进入这间房间':'正在读取本局信息';el('room-entry-message').textContent=message;
    el('room-entry-lobby').href='room-lab.html';el('room-entry-home').hidden=!launcherUrl;el('room-entry-home').href=(launcherUrl||'')+'/?return=1';
    const showSetupStatus=strategy&&!(room?.players?.length===1&&online&&!recovering&&!paused()&&!pending);
    el('room-info-status').hidden=!showSetupStatus||setupStep!=='info';el('room-strategy-status').hidden=!showSetupStatus||setupStep!=='pick';
    document.body.classList.toggle('room-game-locked',!writable());
    document.body.classList.toggle('room-game-spectating',spectating());
    el('room-game-status').textContent=message;
    renderPlayers();renderEvents();renderConnection();
    const ready=el('start-btn');if(ready&&snapshotState){ready.style.display=preparing()&&!spectating()&&!readOnly()?'flex':'none';ready.disabled=!online||recovering||paused()||busy||!!pending||fatal;const text=ready.querySelector?.('.btn-text');if(text)text.textContent=self()?.ready?'取消准备':'准备就绪';}
    for(const id of ['refresh-btn','freeze-btn']){const button=el(id);if(button)button.disabled=!writable()||!!G?._mergeReward;}
    el('shop-left')?.setAttribute?.('aria-disabled',String(!writable()||!!G?._mergeReward));
    if(snapshotState)el('next-btn').style.display='none';
    const pick=el('setup-ready-btn');if(pick)pick.disabled=!online||recovering||readOnly()||busy||fatal;
    const confirm=el('pick-confirm-btn');if(confirm)confirm.disabled=!online||recovering||readOnly()||busy||!!pending||fatal;
    if(strategy)el('room-game-connection').hidden=true;
  }
  function activateSeat(playerId){
    if(playerId===session?.playerId||playerId===viewPlayerId){armedPlayerId=null;clearTimeout(armTimer);return viewPlayer(session?.playerId);}
    if(armedPlayerId===playerId){armedPlayerId=null;clearTimeout(armTimer);return viewPlayer(playerId);}
    armedPlayerId=playerId;clearTimeout(armTimer);renderPlayers();
    armTimer=setTimeout(()=>{armedPlayerId=null;renderPlayers();},4500);
  }
  function renderPlayers(){
    const rows=(room?.players||[]).map(p=>{const gp=game?.players?.find(x=>x.playerId===p.id);return {...p,game:gp,selected:p.id===(viewPlayerId||session?.playerId)};});
    const isPick=!snapshotState&&setupStep==='pick',players=el(snapshotState?'room-game-players':isPick?'pick-players':'room-info-players');
    const key=JSON.stringify([!!snapshotState,setupStep,pickedBandIdx,armedPlayerId,...rows.map(p=>[p.id,p.slot,p.name,p.portrait,p.connected,p.selected,p.game?.entered,p.game?.ready,p.game?.level,p.game?.life,p.game?.phase,p.game?.eliminated,p.game?.forfeited])]);
    if(key!==playersSignature){playersSignature=key;players.replaceChildren();
      const displayRows=snapshotState?Array.from({length:4},(_,slot)=>rows.find((p,index)=>(p.slot??index)===slot)||null):rows;
      for(const p of displayRows){
        if(!p){const empty=document.createElement('div');empty.className='room-slot empty';empty.setAttribute('aria-label','空席');empty.textContent='—';players.append(empty);continue;}
        const gp=p.game,button=document.createElement(isPick?'div':'button');button.type='button';button.dataset.playerId=p.id;
        button.className=isPick?'player'+(p.id===session?.playerId?' me':''):'room-player'+(!p.connected?' offline':gp?.ready?' ready':'')+(p.selected?' selected':'');
        button.setAttribute('aria-pressed',String(p.selected));button.title=p.name+' · '+(p.id===session?.playerId?'自己的战场':p.selected?'点击返回自己的战场':armedPlayerId===p.id?'再次点击观战':'点击确认观战');
        const portrait=document.createElement('img');portrait.src='avatars/'+(p.portrait||'char_102_texas')+'.png';portrait.alt='';portrait.onerror=()=>{portrait.onerror=null;portrait.src='avatars/char_102_texas.png';};
        const copy=document.createElement(isPick?'div':'span'),name=document.createElement(isPick?'div':'b'),detail=document.createElement(isPick?'div':'small');
        name.textContent=p.name+(p.id===session?.playerId?'（你）':'');
        detail.textContent=(gp?.level?'基地 '+gp.level+'级 · ':'')+(gp?.forfeited?'已退出本局':!p.connected?'等待重连':gp?.eliminated?'已淘汰':gp?.ready?'已准备':gp?.phase==='battle'?'作战中':gp?.entered?'运营中':'选策略');
        if(isPick){portrait.className='pav';name.className='pname';detail.className='pband';copy.style.flex='1';copy.style.minWidth='0';button.title='';detail.textContent=!p.connected?'等待重连':p.id===session?.playerId?(setupBands().find(band=>band.bandId===pickedBandIdx)?.name||'请选择策略…'):gp?.entered?'已确认策略':'请选择策略…';}
        copy.append(name,detail);button.append(portrait,copy);
        if(snapshotState){
          button.className+=' room-slot'+(armedPlayerId===p.id?' armed':'')+(p.selected&&p.id!==session?.playerId?' watching':'');
          const life=document.createElement('span');life.className='slot-life';life.textContent='♥ '+(gp?.life??'—');button.append(life);
          const action=document.createElement('span');action.className='slot-action';
          action.textContent=p.selected&&p.id!==session?.playerId?'正在观看\n点击返回':armedPlayerId===p.id?'再次点击\n进入观战':'';button.append(action);
          button.setAttribute('aria-label',p.name+' · '+detail.textContent+(action.textContent?' · '+action.textContent.replace('\n','，'):''));
          button.onclick=()=>activateSeat(p.id);
        }
        players.append(button);
      }
    }
    if(!isPick)for(const button of players.children){const gp=game?.players?.find(p=>p.playerId===button.dataset?.playerId);button.disabled=busy||!online||recovering||(!self()?.entered&&!self()?.forfeited)||!gp?.entered||!!pending;}
  }
  function renderEvents(){
    const events=(game?.events||[]).filter(e=>e.type==='base-upgrade'||e.type==='boss-damage').slice(-3),key=JSON.stringify(events);
    if(key===eventsSignature)return;const initial=!eventsSignature;eventsSignature=key;const list=el('room-game-events');list.replaceChildren();clearTimeout(eventTimer);
    for(const event of events){const line=document.createElement('li'),name=event.playerName||room?.players?.find(p=>p.id===event.playerId)?.name||'队友';
      line.textContent=name+(event.type==='base-upgrade'?' 的基地升至 '+event.level+' 级':' 所在战场已对首领造成 '+event.percent+'% 伤害');list.append(line);
    }
    list.hidden=initial||!events.length||!snapshotState;
    if(!list.hidden)eventTimer=setTimeout(()=>{list.hidden=true;},4500);
  }
  function stopPolling(){stopped=true;clearTimeout(timer);clearTimeout(connectionTimer);clearTimeout(armTimer);clearTimeout(eventTimer);hideCenterBanner();window.ArkRoomPresence?.stop();}
  function backToRoom(){stopPolling();location.href='room-lab.html?room='+encodeURIComponent(roomCode);return false;}
  async function request(operation,fields){
    // Loading the shared catalog or a new player's runtime can take longer
    // than a small operation, especially while several players join together.
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),operation==='info'||operation==='game-enter'||operation==='game-sync'?30000:7000);
    try{
      const url=operation==='info'?'/api/game-info':'/api/rooms/'+roomCode+'/'+operation;
      const response=await fetch(url,{method:operation==='info'?'GET':'POST',headers:operation==='info'?undefined:{'Content-Type':'application/json'},
        body:operation==='info'?undefined:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,catalog,runId,...session,...fields}),signal:controller.signal,cache:'no-store'});
      let value;try{value=await response.json();}catch{throw Error('请从房间服务的地址打开联机页面。');}
      if(!response.ok)throw Object.assign(Error(value.message||'服务器拒绝操作'),{code:value.error,status:response.status});
      return value;
    }finally{clearTimeout(timeout);}
  }
  function forceCommonConfig(){
    const config=game?.config||room?.config;if(!config||snapshotState)return;
    if(window.__roomDiySelections===undefined){window.__roomDiySelections=config.modeId==='mode_training_1'?{}:currentDiySetup(config.seasonId);persist();}
    const seasonChanged=setupSeasonId!==config.seasonId;
    setupSeasonId=config.seasonId;buildRoster();setupStageKey=config.mapKey;
    curMatch=config.modeId.includes('_multi_')?'team':'solo';
    curDiff=config.modeId==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(key=>DIFF_GAMEDATA[key].toLowerCase()===config.modeId.split('_').at(-1))||'difficult';
    const map=SOURCE_BATTLES.seasons[config.seasonId]?.modes[config.modeId]?.stageChoices.find(x=>x.levelKey===config.mapKey);
    const index=playableLevels().findIndex(x=>x.id===map?.stageId);if(index>=0)CUR=index;
    original.refreshSourceSetupInfo();
    renderRoomStrategyIntel(config,room?.setupInfo||{});
    if(seasonChanged){renderBandMatrix();if(pickedBandIdx!==-1){if(setupBands().some(b=>b.bandId===pickedBandIdx))pickBand(pickedBandIdx);else closePickCard();}}
  }
  function showRoomSetup(step='info'){
    if(snapshotState||(!game?.config&&!room?.config))return;
    if(!setupShown){pickedBandIdx=-1;TEAM_AI=[];el('pick-left').classList.remove('open');el('pick-card').classList.remove('open');el('pick-card-body').innerHTML='';}
    forceCommonConfig();setupStep=step;
    el('menu').style.display='none';el('setup').style.display='flex';el('setup-info').style.display=step==='info'?'flex':'none';el('setup-pick').style.display=step==='pick'?'flex':'none';el('main').style.display='none';
    el('pick-players').style.display='';original.setUiMode('mode-setup');renderBandMatrix();setupShown=true;renderStatus();
  }
  function paintBoard(){
    if(!G||!snapshotState)return;
    window.__tacticalPlayerId=session?.playerId;
    if(snapshotState.battle){B=replaceEngineState('battle',clone(snapshotState.battle),'room.authoritative-board');window.ArkBattlePresentation?.ingest(B,[runId,viewPlayerId,G.round,snapshotState.battleView?.battleId].join(':'));if(B.phase==='battle'&&!spectating())syncTacticalBench(true);return;}
    const board=G.ops.filter(o=>o.row!=null).map(boardView),bench=G.ops.filter(o=>o.row==null).map(benchView).concat(G.equipInv.map(equipBenchView)).filter(Boolean);
    original.showBoard(board,bench);if(B)B.traps=clone(snapshotState.traps||[]);
  }
  function applyPlayer(state){
    if(!state?.session||!['rest','battle','over'].includes(state.session.phase)||!Array.isArray(state.session.ops)||!Array.isArray(state.session.shop))throw Error('服务器返回了不支持的游戏快照。');
    const previous=snapshotState,changedView=state.context?.PLAYER_NAME!==previous?.context?.PLAYER_NAME;
    snapshotState=clone(state);const c=state.context,s=clone(state.session);
    deploymentCells=new Set((state.ui?.deploymentCells||[]).map(cell=>cell.row+':'+cell.col));
    CUR=c.CUR;curDiff=c.curDiff;curMatch=c.curMatch;curEnemyType=c.curEnemyType;curBoss=c.curBoss;curEnemyTypes=c.curEnemyTypes;TEAM_AI=[];PLAYER_NAME=c.PLAYER_NAME;
    buildRoster(BATTLE.operators,s.seasonId,s.diySelections||{});ACCOUNT=clone(state.account);GMODE='auto';original.replaceGameSession(s,'room.authoritative-snapshot');
    if(state.rng)window.ArkSim.restore(state.rng);
    setupSeasonId=s.seasonId;setupStageKey=s.mapKey;window.__bossBattle=!!s.sourceBossId;
    const source=battleSourceForRun(),map=SOURCE_BATTLES.levels[s.mapKey];
    if(!source||!map)throw Error('房间关卡与本机目录不一致。');
    const nextLevelSignature=JSON.stringify([viewPlayerId,s.round,s.sourceLevelKey,s.mapKey,s.enemySeed,s.enemyPlan?.rounds[s.round],s.bounties,state.battleLevel||null]);
    if(nextLevelSignature!==levelSignature){levelSignature=nextLevelSignature;
      const level=state.battleLevel?clone(state.battleLevel):window.ArkSourceMap.convertBattle(map.level,source,[...(s.sourceWarnings||[])]);
      original.setLevel({level,enemies:{...BATTLE.enemies,...source.enemies}});
    }
    const nextCameraSignature=JSON.stringify([viewPlayerId,s.round,s.sourceLevelKey,state.battleView?.battleId,state.battleView?.side]);
    if(nextCameraSignature!==cameraSignature){cameraSignature=nextCameraSignature;
      window.__preview=false;window.__previewWave=null;window.__viewRect=null;
      window.viewMode=state.battleView?.side==='right'?1:state.battleView?.side==='overview'?2:0;
      if(window.syncHalfLabel)window.syncHalfLabel();
    }
    // Preparation clock packets must not discard a drag or close an open intel
    // panel. Battle packets replace only the board and HUD while it is running.
    const renderSession=clone(s);delete renderSession.runElapsed;delete renderSession.prepareRemaining;delete renderSession._decisionRemaining;
    const nextPresentation=s.phase==='battle'?JSON.stringify([viewPlayerId,s.phase,s.round,!!s.battleDone,s.activeBonds,s.life,s.level]):JSON.stringify([viewPlayerId,renderSession,state.ui]);
    const needsPresentation=nextPresentation!==presentationSignature;presentationSignature=nextPresentation;
    if(needsPresentation){selectedHand=null;selectedEquip=null;selBoardOp=null;shopPreview=-1;selectedBond=null;drag=null;}
    window.ArkBattlePresentation?.observeSession(s,[runId,viewPlayerId].join(':'));paintBoard();
    window.consumeBattleAudio?.(B,[runId,viewPlayerId,s.round,state.battleView?.battleId||'local'].join(':'));
    if(!changedView&&previous?.session.phase==='rest'&&s.phase==='rest'&&previous.session.round===s.round&&s.ops.some(op=>op.row!=null&&previous.session.ops.some(old=>old.id===op.id&&(old.row!==op.row||old.col!==op.col))))playSfx('b_char_set');
    if(changedView||previous?.session.phase!==s.phase||previous?.session.round!==s.round){original.closeSettlement();original.closeIntel();original.hideBondDetail();}
    el('menu').style.display='none';el('setup').style.display='none';el('main').style.display='flex';
    el('menu-btn').style.display='inline-block';el('roster-btn-top').style.display='none';
    el('result').textContent=s.phase==='battle'&&s.battleDone?(s.lastBattleWin?'本战场作战胜利，等待同盟…':'本战场作战结束，等待同盟…'):'';
    original.setUiMode('mode-battle');
    if(needsPresentation){const decision=el('decision-modal');decision.style.display='none';if(state.ui?.decisionPending&&!spectating())original.showDecision();original.renderAll();}
    else {
      original.updateHud();
      if(selBoardOp&&String(selBoardOp).startsWith('tactic:'))refreshTacticalDetail();
      if(JSON.stringify([s.activeBonds,s.addLayers])!==JSON.stringify([previous?.session.activeBonds,previous?.session.addLayers]))original.renderBonds();
    }
    if(s.phase==='battle'&&B)original.updateCountdown(Math.max(0,(B.roundLimit||ROUND_LIMIT)-(B.roundTime||0)));
    else if(s.phase==='rest'){original.updateCountdown(s.prepareRemaining??60);if(state.ui?.decisionPending&&!spectating())renderDecisionCountdown();}
    if(s.phase==='over'&&s.settlement&&!spectating()&&(previous?.session.phase!=='over'||changedView))original.renderSettlement(1);
  }
  function resetRun(nextRunId){
    phaseNotices.reset();armedPlayerId=null;clearTimeout(armTimer);hideCenterBanner();
    runId=nextRunId;sequence=0;pending=null;revision=-1;frame=-1;snapshotState=null;viewPlayerId=null;requestedViewPlayerId=null;
    delete window.__roomDiySelections;
    setupShown=false;setupStep='info';deploymentCells.clear();levelSignature='';cameraSignature='';presentationSignature='';playersSignature='';eventsSignature='';
    original.closeSettlement();original.closeIntel();original.hideBondDetail();original.replaceGameSession(null,'room.reset-run');persist();
    window.ArkRoomPresence?.update({runId,rendererReady:initialized,snapshotReady:false});
  }
  function apply(value,{syncRead=false,recoveryIntent=null}={}){
    if(stopped)return;
    if(value.room?.lobbyPhase==='waiting'){resetRun(Number.isSafeInteger(value.room.runId)?value.room.runId:runId);backToRoom();return;}
    if(!['preparing','battle','intermission','over','error'].includes(value.game?.phase))throw Error('房间返回了不支持的游戏阶段，请刷新页面。');
    const wasRecovering=recovering||offlineSince>0,wasPaused=paused(),newRun=Number.isSafeInteger(value.room?.runId)&&value.room.runId!==runId;
    if(newRun){resetRun(value.room.runId);recoveryIntent=null;}
    if(syncRead&&(wasRecovering||recoveryIntent)&&value.game.players?.find(p=>p.playerId===session?.playerId)?.entered&&!value.player?.state)throw Error('主机完整战场尚未同步，请稍候。');
    if(!room||value.room?.revision>=room.revision){room=value.room;game=value.game;}
    connectionAt=Date.now();
    const identity=room?.players?.find(p=>p.id===session?.playerId);if(identity)PLAYER_NAME=identity.name;
    const ack=value.ack;if(Number.isSafeInteger(ack)){sequence=Math.max(sequence,ack);if(pending&&ack>=pending.sequence)pending=null;persist();}
    if(syncRead&&recoveryIntent){
      const accepted=Number.isSafeInteger(ack)&&ack>=recoveryIntent.sequence;
      if(pending===recoveryIntent)pending=null;
      recoveryNotice=accepted?'上次操作已由主机确认，没有重复执行。':'上次未确认的操作已取消，请确认当前状态后重新操作。';
      recoveryNoticeUntil=Date.now()+6500;persist();
    }
    const nextView=value.viewPlayerId||session?.playerId,viewChanged=nextView!==viewPlayerId;
    if(value.player&&(wasRecovering||viewChanged||value.player.revision>revision||(value.player.frame??-1)>frame)){
      viewPlayerId=nextView;requestedViewPlayerId=nextView;applyPlayer(value.player.state);revision=value.player.revision;frame=value.player.frame??-1;
    }
    if(!value.player&&!snapshotState)forceCommonConfig();
    if(syncRead){recovering=false;offlineSince=0;if((wasRecovering||wasPaused&&!paused())&&!recoveryIntent){recoveryNotice='已恢复主机保存的阵容、进度与计时，可以继续。';recoveryNoticeUntil=Date.now()+5000;}}
    online=true;message=pending?'上一条操作尚待服务器确认，正在恢复连接。':game?.phase==='error'?'本局运行异常：'+(game.error||'主机运行异常')+'。请返回大厅，由房主重新开局。':game?.phase==='over'?'本局已结束。返回同盟大厅后，由房主重新开局，所有人再次准备。':paused()?'正在等待断线队友，运营与作战已暂停。':game?.phase==='intermission'?'本轮作战结束，主机正在进入下一轮。':game?.phase==='battle'?'全员已准备 · 自动战斗由主机同步推进。':spectating()?'正在查看队友的实时阵容；再点该头像或自己的头像返回。':self()?.forfeited?'你因离线超时退出本局，可以继续观看同盟，结束后在大厅重新准备。':readOnly()?'你的模拟已结束，可继续观看同盟。':self()?.ready?'已准备，等待队友；取消准备后可继续运营。':snapshotState?'购买、部署与装备由主机确认；全员准备后自动作战。':'请选择策略进入联机运营；赛季、模式和地图与房间保持一致。';
    window.ArkRoomPresence?.update({runId,rendererReady:initialized,snapshotReady:!!value.player?.state||!self()?.entered});
    if(!snapshotState&&!setupShown)showRoomSetup();
    if(snapshotState){const notice=phaseNotices.next(game,runId);if(notice&&!document.hidden)showCenterBanner(notice.title,notice.sub,2.8,notice.kind);}
  }
  function fail(error){
    online=false;recovering=true;offlineSince=offlineSince||Date.now();message=(error.name==='AbortError'?'连接超时。':error.message||'连接中断。')+' 已锁定运营操作。';
    if(['ROOM_NOT_FOUND','INVALID_SESSION','CATALOG_MISMATCH','GAME_VERSION_MISMATCH','VERSION_MISMATCH'].includes(error.code)){fatal=true;fatalCode=error.code;if(!window.ArkRoomPresence?.status().fatal)window.ArkRoomPresence?.reject(error);}
    else if(!error.status||error.status>=500)window.ArkRoomPresence?.update({snapshotReady:false,runId});
    renderStatus();
    if(fatal)window.ArkRoomPresence?.update({uiAttached:true});
  }
  async function recover(error){
    if(stopped)return;
    // Preserve uncertain intent only until a fresh snapshot resolves its ack.
    // Never replay it: a delayed purchase must not target a changed shop.
    if(error.status&&error.status<500){pending=null;persist();}
    if(['INVALID_VIEW','VIEW_NOT_READY'].includes(error.code))requestedViewPlayerId=session.playerId;
    fail(error);
    if(!fatal&&catalog){try{const recoveryIntent=pending;apply(await request('game-sync',{viewPlayerId:requestedViewPlayerId||session.playerId}),{syncRead:true,recoveryIntent});}catch(syncError){fail(syncError);}}
  }
  async function retryPending(){
    if(!pending)return;
    try{apply(await request('game-command',pending));}catch(error){await recover(error);}
  }
  function task(action){
    if(busy||stopped)return Promise.resolve(false);
    // A background read must not swallow a user's click. Capture its command
    // now, then send after that read; keep the revision from the actual click.
    const read=pollTask;
    busy=true;renderStatus();lastTask=(async()=>{try{
      if(read)await read;
      if(stopped||fatal||!online)return false;
      await action();return true;
    }catch(error){await recover(error);return false;}finally{busy=false;renderStatus();}})();return lastTask;
  }
  function sync(){
    if(!initialized||!session||fatal||stopped||busy)return Promise.resolve(false);
    if(pollTask)return pollTask;
    // Only resolve an intent that existed before this read. A new click may
    // queue behind it while it is in flight and owns its own command task.
    const recoveryIntent=pending;polling=true;
    pollTask=(async()=>{try{
      if(!catalog){
        const info=await request('info'),localCatalog=catalogFingerprint();
        if(info.gameVersion!==GAME_VERSION)throw Object.assign(Error('双方联机程序版本不一致，请使用与房主相同版本的通用包。'),{code:'GAME_VERSION_MISMATCH'});
        if(info.catalog!==localCatalog)throw Object.assign(Error('双方游戏数据版本不一致，请使用与房主相同版本的通用包。'),{code:'CATALOG_MISMATCH'});
        catalog=localCatalog;
      }
      apply(await request('game-sync',{viewPlayerId:requestedViewPlayerId||session.playerId}),{syncRead:true,recoveryIntent});
      return true;
    }catch(error){await recover(error);return false;}finally{polling=false;pollTask=null;renderStatus();}})();
    lastTask=pollTask;return pollTask;
  }
  function viewPlayer(playerId){
    if(playerId===viewPlayerId)return Promise.resolve(true);
    if(!online||busy||pending||fatal||stopped||(!self()?.entered&&!self()?.forfeited)||!game?.players?.some(p=>p.playerId===playerId&&p.entered))return Promise.resolve(false);
    return task(async()=>{const value=await request('game-sync',{viewPlayerId:playerId});apply(value);});
  }
  function send(command){
    const isReady=command.type==='game/ready';
    if(!(command.type==='game/tactical'?tacticalWritable():writable())&&!(isReady&&initialized&&online&&!recovering&&!paused()&&!busy&&!pending&&!fatal&&!stopped&&snapshotState&&preparing()&&!spectating()&&!readOnly()))return unavailable();
    pending={sequence:sequence+1,expectedRevision:revision,command:clone(command)};persist();
    return task(retryPending);
  }
  function route(name,type,payload){original[name]=window[name];window[name]=(...args)=>send({type,...payload(...args)});}
  function block(name,text='联机运营中不支持这项本地操作。'){original[name]=window[name];window[name]=()=>note(text);}
  // Capture presentation/hydration functions before any wrappers are installed.
  for(const name of ['initMode','replaceGameSession','setLevel','showBoard','renderAll','renderBonds','renderShop','showDecision','closeSettlement','closeIntel','hideBondDetail','setUiMode','refreshSourceSetupInfo','updateHud','updateCountdown','renderSettlement'])original[name]=window[name];
  for(const name of ['buyShop','confirmBuy'])route(name,'game/buy',index=>({index}));
  route('refreshShop','game/refresh',()=>({}));route('toggleFreeze','game/freeze',()=>({}));route('upgradeShop','game/upgrade',()=>({}));
  for(const name of ['sellHand','onOpSell'])route(name,'game/sell',unitId=>({unitId}));
  route('sellEquip','game/sell-equip',equipId=>({equipId}));
  route('tacticalAction','game/tactical',(action,unitId,row=0,col=0,dir='up',targetId=0,tokenId='')=>({action,unitId,row,col,dir,targetId,tokenId}));
  route('onEquipDeploy','game/equip',(equipId,unitId,slot)=>({equipId,unitId,slot}));
  route('attachEquip','game/equip',(op,equip,slot)=>({unitId:op.id,equipId:equip.uid,slot}));
  route('useSpecialEquip','game/equip',(equip,unitId)=>({equipId:equip.uid,unitId,slot:0}));
  route('selectMergeReward','game/merge-reward',index=>({index}));
  route('previewDecision','game/decision-preview',id=>({id}));route('applyDecision','game/decision-confirm',id=>({id}));
  window.onTileClick=()=>{
    if(shopPreview>=0)cancelShopPreview();
    selBoardOp=null;selectedHand=null;selectedEquip=null;setSelected(null);renderAll();
    if(G?._upgradeConfirm)return send({type:'game/cancel-upgrade'});
  };
  route('onMoveOp','game/move',(unitId,row,col,dir)=>({unitId,row,col,dir}));
  route('onBenchMove','game/bench-move',(unitId,row,col)=>({unitId,row,col}));
  route('onBenchRecall','game/recall',(unitId,row,col)=>({unitId,row,col}));
  for(const name of ['recallBoard','onOpRightClick'])route(name,'game/recall',unitId=>({unitId}));
  route('deployTrap','game/deploy-trap',(equip,row,col,dir)=>({equipId:equip.uid??equip.id,row,col,dir}));
  window.onDeploy=(op,row,col,dir)=>send(op?.isTrap?{type:'game/deploy-trap',equipId:op.id,row,col,dir}:{type:'game/deploy',unitId:op?.id,row,col,dir});
  window.onBenchSell=id=>G?.equipInv.some(e=>e.uid===id)?window.sellEquip(id):window.sellHand(id);
  window.onEquipClick=id=>{const op=G?.ops.find(o=>o.id===id),eq=G?.equipInv[0];return op&&eq?window.onEquipDeploy(eq.uid,id,equipNextSlot(op)):false;};
  window.startBattleRound=()=>send({type:'game/ready',ready:!self()?.ready});
  original.chooseBand=window.chooseBand;
  window.chooseBand=bandId=>{
    if(snapshotState)return note('已进入本局，不能重新选择策略覆盖运营进度。');
    if(setupStep!=='pick')return note('请先查看本局情报，再进入策略选择。');
    if(!initialized||!online||recovering||readOnly()||busy||pending||fatal)return unavailable();
    forceCommonConfig();const context=game?.config||room?.config;if(!context)return note('本局设置尚未同步，请返回大厅确认。');
    const config={seasonId:context.seasonId,modeId:context.modeId,mapKey:context.mapKey,bandId,skillChoices:accountSkillChoices(),diySelections:context.modeId==='mode_training_1'?{}:currentDiySetup(context.seasonId)},chosenRunId=runId;
    return task(async()=>apply(await request('game-enter',{config,runId:chosenRunId})));
  };
  // Visual selection can stay local; no local purchase/effect is performed.
  original.renderPickPlayers=window.renderPickPlayers;window.renderPickPlayers=renderPlayers;
  original.pickBand=window.pickBand;window.pickBand=(...args)=>{original.pickBand(...args);renderStatus();};
  for(const name of ['onShopCardClick','onEquipBenchClick','startBenchDrag','startEquipDrag','startMoveDrag','startHandDrag']){
    original[name]=window[name];window[name]=(...args)=>(writable()||name==='startBenchDrag'&&tacticalWritable()&&(args[0]?.isTactical||(B.summoneds||[]).some(s=>tacticalOwned(s)&&ArkFlowShape.copying(s))))?original[name](...args):unavailable();
  }
  for(const name of ['setSetupSeason','setDifficulty','setMatch','selectSetupMap','selectLevel']){
    original[name]=window[name];window[name]=(...args)=>{
      if(game?.config||snapshotState)return note('本房间的赛季、模式和地图已经固定。');
      return original[name](...args);
    };
  }
  original.showSetup=window.showSetup;
  window.showSetup=(...args)=>{
    if(snapshotState)return note('本局已经进入运营，请通过房间页面查看队友。');
    showRoomSetup();
  };
  window.infoReady=()=>{if(snapshotState||!online||recovering||busy||fatal)return false;showRoomSetup('pick');return true;};
  window.backToSetupInfo=()=>showRoomSetup('info');
  window.buildTeamAI=()=>{TEAM_AI=[];};
  for(const name of ['startRound','nextRound','endRun','startNormalBattle','startBattle','enterNormalMode','onBattleEnd','onLeak','onKillCoin','onSkillDp','onRespawn','onBondGarrison',
    'genShop','addOperator','removeOp','grantBandOperator','rewardEquip','rewardSpecialEquip','rewardTrap','showMergeReward','applyBandStrategy','applyBandOnRound','applyServerGain','applyTrapEffect','applySpecialEquipEvent',
    'applyPreset','setOpField','setDetailEvolve','setDetailField','saveAccount','saveRestRun','loadRestRun','encodeRestSave','dispatchSessionCommand'])block(name);
  window.replaceGameSession=()=>note('联机状态只能由房间服务同步。');
  window.updatePreparationClock=window.updateRunClock=()=>{};
  window.update=()=>{};
  window.refreshBoard=paintBoard;
  window.backToMenu=backToRoom;
  original.confirmExit=window.confirmExit;
  window.confirmExit=()=>{
    const dialog=el('exit-confirm'),single=room?.players?.length===1;dialog.querySelector('.ec-title').textContent='返回房间';
    dialog.querySelector('.ec-sub').textContent=single?'本局进度保留在本机，返回房间后可以继续。若要结束本局，请在房间中退出。':'本局进度由房主保留，返回房间不会退出席位。若要离开同盟，请在房间中退出。';
    dialog.querySelector('.ec-ok').textContent='返回房间';original.confirmExit();
  };
  window.renderAll=(...args)=>{original.renderAll(...args);renderStatus();};
  window.renderShop=(...args)=>{original.renderShop(...args);renderStatus();};
  // onCanDeploy is a query, kept separately because engine uses it during drag.
  original.isDeployable=window.isDeployable;
  window.isDeployable=(row,col,op)=>{
    const moving=op||drag?.op;
    const owned=moving?.id!=null?G?.ops.find(unit=>unit.id===moving.id):null;
    const trap=!!moving?.isTrap;
    if(game?.phase==='battle')return tacticalWritable()&&original.isDeployable(row,col,op);
    return writable()&&deploymentCells.has(row+':'+col)&&original.isDeployable(row,col,trap?null:owned||moving)
      &&(!trap||!G.ops.some(unit=>unit.row===row&&unit.col===col)&&!B?.traps?.some(unit=>unit.row===row&&unit.col===col));
  };
  original.onCanDeploy=window.onCanDeploy;
  window.onCanDeploy=(...args)=>(args[2]?.isTactical||game?.phase==='battle'?tacticalWritable():writable())&&(drag?.op?.isTrap?window.isDeployable(...args,drag.op):!!original.onCanDeploy?.(...args));
  function poll(){clearTimeout(timer);if(!stopped)timer=setTimeout(async()=>{await sync();poll();},document.hidden?2000:game?.phase==='battle'?100:500);}
  window.initMode=async function(){
    try{await original.initMode();}catch(error){window.ArkRoomPresence?.loadingFailed(error);note('战场资源加载失败，请重新加载页面，或返回同盟大厅取消本次启动。');return;}
    initialized=true;window.ArkRoomPresence?.update({rendererReady:true,snapshotReady:false,uiAttached:true});renderStatus();
    if(!/^[A-Z2-9]{6}$/.test(roomCode)||!session){fatal=true;note('未找到本房间身份，请先返回房间加入。');return;}
    await sync();poll();
  };
  window.addEventListener('online',()=>sync());window.addEventListener('offline',()=>{fail(Error('本机网络已断开。'));});window.addEventListener('pagehide',stopPolling);
  window.addEventListener('pageshow',async event=>{
    if(!event.persisted||!initialized||!session)return;
    // Back/forward can restore the old JS heap. Keep it locked until all old
    // requests have settled, then read a fresh snapshot of the current run.
    online=false;recovering=true;renderStatus();await lastTask;
    stopped=false;await sync();poll();connectionClock();
  });
  document.addEventListener('visibilitychange',()=>{armedPlayerId=null;clearTimeout(armTimer);if(document.hidden)hideCenterBanner();else sync();});
  window.ArkRoomGame=Object.freeze({sync,viewPlayer,whenIdle:()=>lastTask,status:()=>({roomCode,runId,online,recovering,paused:paused(),readOnly:readOnly(),busy,polling,ready:!!self()?.ready,revision,sequence,pending:!!pending,entered:!!snapshotState,fatal,viewPlayerId,spectating:spectating(),phase:game?.phase}),backToRoom});
  window.ArkRoomPresence?.subscribe(state=>{
    if(state.fatal&&!fatal)fail(Object.assign(Error(state.error?.message||'同盟连接服务不可用。'),{code:state.error?.code}));
    else if(!state.online&&state.error&&initialized&&online&&!stopped&&Date.now()-connectionAt>=5000)fail(Error('与主机的连接中断，正在恢复完整战场。'));
  });
  function connectionClock(){if(stopped)return;renderConnection();connectionTimer=setTimeout(connectionClock,1000);}connectionClock();
  renderStatus();
})();
