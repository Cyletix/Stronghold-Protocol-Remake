(function roomPresence(){
  'use strict';
  if(typeof location==='undefined'||!new URL(location.href).searchParams.has('room'))return;
  const code=new URL(location.href).searchParams.get('room').trim().toUpperCase(),KEY='ark-room-lab-session-v1';
  const PROTOCOL_VERSION=1,CLIENT_VERSION='room-lab-20260911.1',GAME_VERSION='room-game-20261003.1';
  let session=null,launcherUrl='',savedRunId=0;
  try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.session?.roomCode===code){session=saved.session;savedRunId=Number.isSafeInteger(saved.gameRunId)?saved.gameRunId:0;launcherUrl=/^http:\/\/127\.0\.0\.1:\d+$/.test(saved.launcherUrl||'')?saved.launcherUrl:'';}}catch{}
  if(!/^[A-Z2-9]{6}$/.test(code)||typeof session?.playerId!=='string'||typeof session?.token!=='string')return;
  const listeners=new Set();let timer=null,controller=null,task=null,stopped=false,box=null,urgent=false;
  const state={online:false,fatal:false,error:null,loadingError:null,loadingSince:Date.now(),runId:savedRunId,rendererReady:false,snapshotReady:false,room:null,lastSuccess:0};
  function status(){return {...state,error:state.error?{message:state.error.message,code:state.error.code}:null};}
  function paint(){
    if(!box){
      box=document.createElement('div');box.id='room-loading-presence';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
      box.style.cssText='position:fixed;z-index:120;left:50%;top:20px;transform:translateX(-50%);box-sizing:border-box;width:460px;max-width:calc(100vw - 24px);padding:16px 18px;border:1px solid #78968a;border-radius:8px;background:#10221ff5;color:#e0f4eb;font:14px/1.6 system-ui,sans-serif;box-shadow:0 4px 24px #0008';
      const title=document.createElement('b'),copy=document.createElement('p'),back=document.createElement('a'),retry=document.createElement('button');
      title.id='room-loading-title';copy.id='room-loading-detail';copy.style.cssText='margin:6px 0 10px;font-size:12px';
      back.textContent=launcherUrl?'返回联机首页':'返回同盟大厅';back.href=launcherUrl?launcherUrl+'/?return=1':'room-lab.html?room='+encodeURIComponent(code);back.style.cssText='color:#b2e5cd;font-size:12px';
      retry.type='button';retry.textContent='重新加载页面';retry.style.cssText='margin-left:16px;padding:4px 8px;background:#204539;color:#dcf5e9;border:1px solid #6d9b88;border-radius:4px;cursor:pointer';retry.onclick=()=>location.reload();
      box.append(title,copy,back,retry);document.documentElement.append(box);
    }
    box.hidden=!!state.uiAttached||(state.rendererReady&&!state.fatal);
    const title=box.children[0],copy=box.children[1];
    const versionError=['VERSION_MISMATCH','GAME_VERSION_MISMATCH','CATALOG_MISMATCH'].includes(state.error?.code),slowLoading=Date.now()-state.loadingSince>=60000;
    const heading=state.fatal?(versionError?'联机版本不一致':'无法继续本次连接'):state.loadingError?'战场资源加载失败':state.online?'正在加载战场资源 · 已连接同盟':'正在加载战场资源 · 正在连接同盟';
    const detail=state.fatal?(state.error.message+(versionError?' 请使用与房主相同版本的通用包。':' 请返回联机首页重新加入。')):state.loadingError?state.loadingError+' 连接仍会保留，请重新加载页面；也可以返回大厅，让房主取消本次启动。':state.online?(slowLoading?'加载较慢，席位仍保留。可以重新加载页面，或返回同盟大厅，让房主取消本次启动后再开。':'加载期间会独立保持连接，不会因为图片或战场加载较慢而退出席位。页面加载完成后继续选择策略。'):state.error?'暂时无法连接主机，正在自动重试；资源加载完成前不会将你判为战斗弃权。':'首次加载可能需要一些时间。程序正在连接同盟，完成后会自动进入策略选择。';
    box.children[3].hidden=!state.loadingError&&!state.fatal&&!slowLoading;
    if(title.textContent!==heading)title.textContent=heading;if(copy.textContent!==detail)copy.textContent=detail;
  }
  function notify(){paint();for(const fn of listeners){try{fn(status());}catch{}}}
  function schedule(){clearTimeout(timer);if(!stopped&&!state.fatal)timer=setTimeout(beat,2000);}
  function beat(){
    if(stopped||state.fatal)return Promise.resolve(false);if(task)return task;
    controller=new AbortController();const active=controller,deadline=setTimeout(()=>active.abort(),5000);
    task=(async()=>{
      try{
        const response=await fetch('/api/rooms/'+code+'/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:PROTOCOL_VERSION,clientVersion:CLIENT_VERSION,gameVersion:GAME_VERSION,...session,runId:state.runId,rendererReady:state.rendererReady,snapshotReady:state.snapshotReady}),signal:active.signal,cache:'no-store'});
        let value;try{value=await response.json();}catch{throw Error('当前地址没有提供同盟连接服务。');}
        if(!response.ok)throw Object.assign(Error(value.error==='NOT_FOUND'?'房主服务尚未支持新版加载连接，请房主更新并重新启动通用包。':value.message||'连接暂时中断。'),{code:value.error==='NOT_FOUND'?'GAME_VERSION_MISMATCH':value.error});
        if(stopped)return false;
        if(Number.isSafeInteger(value.room?.runId)&&state.runId!==value.room.runId){state.runId=value.room.runId;state.snapshotReady=false;}
        state.online=true;state.error=null;state.lastSuccess=Date.now();state.room=value.room||null;notify();return true;
      }catch(error){
        if(stopped)return false;
        state.online=false;state.error=error.name==='AbortError'?Error('连接超时。'):error;
        state.fatal=['ROOM_NOT_FOUND','INVALID_SESSION','VERSION_MISMATCH','GAME_VERSION_MISMATCH','CATALOG_MISMATCH','NOT_FOUND'].includes(error.code);
        notify();return false;
      }finally{clearTimeout(deadline);controller=null;task=null;if(urgent&&!stopped&&!state.fatal){urgent=false;beat();}else schedule();}
    })();return task;
  }
  function update(fields){
    if(typeof fields.uiAttached==='boolean')state.uiAttached=fields.uiAttached;
    const before=state.runId+':'+state.rendererReady+':'+state.snapshotReady;
    const sameRun=!Number.isSafeInteger(fields.runId)||fields.runId===state.runId;
    if(Number.isSafeInteger(fields.runId)&&fields.runId>state.runId){state.runId=fields.runId;state.snapshotReady=false;}
    if(typeof fields.rendererReady==='boolean'){state.rendererReady=fields.rendererReady;if(fields.rendererReady)state.loadingError=null;}
    if(typeof fields.snapshotReady==='boolean'&&(sameRun||fields.runId===state.runId))state.snapshotReady=fields.snapshotReady;
    notify();
    if(before!==state.runId+':'+state.rendererReady+':'+state.snapshotReady&&!stopped&&!state.fatal){if(task)urgent=true;else beat();}
  }
  function stop(){stopped=true;clearTimeout(timer);controller?.abort();}
  function reject(error){state.fatal=true;state.error=error;state.online=false;stop();notify();}
  function loadingFailed(error){state.rendererReady=false;state.snapshotReady=false;state.loadingError=error?.message||'部分战场资源未能加载。';notify();}
  async function whenIdle(){while(task){const current=task;await current;if(task===current)return;}}
  window.ArkRoomPresence=Object.freeze({status,beat,update,reject,stop,loadingFailed,whenIdle,subscribe:fn=>{listeners.add(fn);fn(status());return()=>listeners.delete(fn);}});
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',async event=>{if(event.persisted&&!state.fatal){await task;stopped=false;state.snapshotReady=false;beat();}});
  window.addEventListener('online',()=>{if(!stopped)beat();});
  window.addEventListener('error',event=>{if(!state.rendererReady&&(event.target?.tagName==='SCRIPT'||event.error))loadingFailed(Error('战场程序未加载完整。'));},true);
  paint();beat();
})();
