'use strict';
// Server-owned game runtime. Trusted browser rules run in a separate VM
// per player; no client script, timer, renderer, filesystem or network is exposed.
// Only the room controller can start/tick/settle a battle or advance rounds.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const WEB=path.resolve(__dirname,'../../web'),SCHEMA_VERSION=1;
const jsonCache=new Map();
let scriptsCache=null,infoPromise=null,fingerprintCache=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
function exact(value,required,optional=[]){
  if(!object(value)||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k))||required.some(k=>!Object.hasOwn(value,k)))fail('INVALID_PAYLOAD','命令字段不完整或含未知字段');
}
function uint(value,min=0,max=0xffffffff){if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_PAYLOAD','整数参数越界');}
function textId(value){if(typeof value!=='string'||!value.length||value.length>160)fail('INVALID_PAYLOAD','标识符无效');}
function localFile(relative,extension){
  if(typeof relative!=='string'||!relative.endsWith(extension)||!/^[-a-zA-Z0-9_./]+$/.test(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'))fail('LOCAL_ASSET_ONLY','运行时只允许 web 目录中的本地资源');
  const resolved=path.resolve(WEB,relative);
  if(!resolved.startsWith(WEB+path.sep))fail('LOCAL_ASSET_ONLY','资源路径越界');
  return resolved;
}
function jsonText(relative){
  const file=localFile(relative,'.json');
  if(!jsonCache.has(file))jsonCache.set(file,fs.readFileSync(file,'utf8'));
  return jsonCache.get(file);
}
function scripts(){
  if(scriptsCache)return scriptsCache;
  const html=fs.readFileSync(path.join(WEB,'index.html'),'utf8'),result=[];
  // index.html is the dependency order. Stop at the actual game bundle: scripts
  // after it are browser transport/presentation, not the authoritative rules.
  for(const [,src]of html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)){
    if(src.includes('://')||src.startsWith('vendor/'))continue;
    result.push(new vm.Script(fs.readFileSync(localFile(src,'.js'),'utf8'),{filename:src}));
    if(src==='mode.js')return scriptsCache=result;
  }
  fail('RUNTIME_UNAVAILABLE','index.html 缺少游戏规则入口');
}
async function boot(){
  const elements=new Map(),storage=new Map(),noop=()=>{};
  const canvasContext=new Proxy({},{get:()=>noop});
  function element(id){
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{id,innerHTML:'',textContent:'',style:{},value:'',
        classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>{const use=on??!classes.has(x);if(use)classes.add(x);else classes.delete(x);return use;}},
        addEventListener:noop,getContext:()=>canvasContext,getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900,width:1400,height:900})});
    }
    return elements.get(id);
  }
  const context=vm.createContext({console:{log:noop,warn:noop,error:noop},innerWidth:1400,innerHeight:900,
    requestAnimationFrame:()=>0,cancelAnimationFrame:noop,addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,
    document:{getElementById:element,addEventListener:noop},Image:function(){this.complete=false;},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},
    fetch:async url=>{const text=jsonText(url);return {json:async()=>JSON.parse(text)};},__roomClock:0
  },{codeGeneration:{strings:false,wasm:false}});
  context.window=context;
  const run=(code,timeout=5000)=>vm.runInContext(code,context,{timeout,filename:'room-game-runtime-adapter'});
  for(const script of scripts())script.runInContext(context,{timeout:5000});
  run(`Date.now=()=>__roomClock;
    // These functions only display UI or request presentation assets. Keep
    // refreshBoard/resolveBoard and all business rules active.
    renderAll=()=>{};renderShop=()=>{};measureLatency=()=>{};loadSfx=()=>{};loadUIAtlas=()=>{};
    if(typeof applyHomeRoute==='function')applyHomeRoute=()=>{};
    const roomRefreshBoard=refreshBoard;
    refreshBoard=function(){const traps=B?.traps;roomRefreshBoard();if(B&&traps)B.traps=traps;};
  `);
  await run('initMode()');
  run(ADAPTER);
  return {context,run,element,dispose(){elements.clear();storage.clear();}};
}
function fingerprintOf(machine){
  // All VMs use this process's immutable script/JSON cache. Hash those exact
  // catalogs once with the real browser function, not once per player.
  if(fingerprintCache===null)fingerprintCache=machine.run('catalogFingerprint()',30000);
  else {machine.context.__roomCatalog=fingerprintCache;machine.run('saveCatalogFingerprint=__roomCatalog');}
  return fingerprintCache;
}

// Only fixed, audited statements enter the VM. Client values cross as JSON,
// never as JavaScript source or as mutable objects shared with another player.
const ADAPTER=`
function roomAssert(ok,code,message){if(!ok){const e=new Error(message);e.code=code;throw e;}}
function roomOwnUnit(id){const o=G.ops.find(x=>x.id===id);roomAssert(o,'NOT_OWNED','本席位没有该干员');return o;}
function roomOwnEquip(id){const e=G.equipInv.find(x=>x.uid===id);roomAssert(e,'NOT_OWNED','本席位没有该候选装备');return e;}
function roomDeploymentCells(){
  const lv=BDATA?.level,z=lv&&window.modeBattleZoneRows(lv);
  if(!z||!G)return [];
  // The 13-column camera includes part of the adjoining battlefield. In the
  // currently supported normal preparation maps, the first source red gate
  // separates the player's left field from the adjoining right field.
  let end=Math.min(13,lv.halfBoard?Math.ceil(lv.cols/2):lv.cols);
  const gates=[];for(let r=z.lb;r<z.rb;r++)for(let c=0;c<lv.cols;c++)if(lv.grid[r][c]==='tile_start')gates.push(c);
  if(G.sourceBossId)end=Math.floor(lv.cols/2);
  else {if(!gates.length)return [];end=Math.min(end,...gates);}
  // Static ownership/terrain only. Do not remove occupied cells: moving and
  // swapping need them too. Each command retains its own unit-type/collision
  // checks, and the browser layers the native checks over this same cell set.
  const cells=[];for(let row=z.lb;row<z.rb;row++)for(let col=0;col<end;col++)if(isDeployable(row,col))cells.push({row,col});
  return cells;
}
function roomCell(row,col,op){
  const cells=roomDeploymentCells();
  roomAssert(cells.length,'UNSUPPORTED_FIELD','当前源战场没有已确认的部署格');
  roomAssert(cells.some(c=>c.row===row&&c.col===col)&&isDeployable(row,col,op),'INVALID_CELL','目标不是当前席位的合法部署格');
}
function roomBench(row,col){roomAssert(candidateCells(BDATA.level).some(c=>c.row===row&&c.col===col),'INVALID_CELL','目标不是当前候选区格');}
function roomNewNetwork(){return {accumulator:0,leakedEnemies:[],milestones:[],kind:'ordinary',shared:false,settled:false,lifeLoss:0,priorResult:null,startedElapsed:G?.runElapsed||0};}
let roomNetwork=roomNewNetwork();
const roomNativeLeak=onLeak,roomNativeGarrison=onBondGarrison;
window.onLeak=function(enemy){
  roomNetwork.leakedEnemies.push({enemyId:enemy.enemyId,route:enemy.route,lifePointReduce:enemy.lifePointReduce||1,flying:!!enemy.flying});
  roomNetwork.lifeLoss+=enemy.lifePointReduce||1;
  if(!roomNetwork.shared)roomNativeLeak(enemy);
};
window.onBattleEnd=function(win,shield){
  if(!G||G.phase!=='battle'||G.battleDone)return;
  G.battleDone=true;G.lastBattleWin=!!win;G.shield=Math.max(0,shield);
  if(!roomNetwork.shared){recordRoundResult(win);roomNetwork.settled=true;}
};
function roomLayout(kind=G.sourceBossId?'boss':'joint-defense'){
  const lv=BDATA.level,center=Math.floor(lv.cols/2),zone=window.modeBattleZoneRows(lv);
  roomAssert(lv.sourceRoutes&&lv.cols===21&&lv.rows===19,'UNSUPPORTED_FIELD','未确认此地图的多人列区间');
  return {kind,rows:lv.rows,cols:lv.cols,sourceGeometry:true,
    left:{start:2,end:10},...(kind==='boss'?{center:{start:center,end:center+1},right:{start:11,end:19}}:{right:{start:10,end:18}}),
    zone:{start:zone.lb,end:zone.rb}};
}
function roomMilestones(){
  const boss=B?.leader;
  if(!boss||!(boss.maxHp>0))return;
  const damage=Math.min(1,Math.max(0,1-boss.hp/boss.maxHp));
  for(const percent of [25,50,75])if(damage+1e-9>=percent/100&&!roomNetwork.milestones.some(x=>x.percent===percent))roomNetwork.milestones.push({percent,realTime:B.roundTime||0,simTime:B.time||0});
}
function roomStatus(){
  return JSON.stringify({round:G.round,phase:G.phase,level:G.level,life:G.life,over:G.phase==='over'||!!G.over,done:!!G.battleDone,
    win:!!G.lastBattleWin,shield:B?.shield??G.shield,sourceBossId:G.sourceBossId||null,sourceLevelKey:G.sourceLevelKey,
    realTime:B?.roundTime||0,simTime:B?.time||0,leaks:B?.stats?.leaks||0,stats:B?.stats||{kills:0,leaks:0},lifeLoss:roomNetwork.lifeLoss,
    prepareRemaining:G.prepareRemaining??0,choicePending:document.getElementById('decision-modal').style.display==='flex',mergeReward:!!G._mergeReward,
    leakedEnemies:roomNetwork.leakedEnemies,milestones:roomNetwork.milestones,activeBonds:G.activeBonds||{},kind:roomNetwork.kind,
    leader:B?.leader?{enemyId:B.leader.enemyId,hp:Math.max(0,B.leader.hp),maxHp:B.leader.maxHp,dead:!!B.leader.dead,damagePercent:Math.max(0,Math.min(100,(1-B.leader.hp/B.leader.maxHp)*100))}:null,
    ownerSessions:(roomNetwork.owners||[]).map(o=>({id:o.id,session:{activeBonds:o.session.activeBonds,addLayers:o.session.addLayers,_gar:o.session._gar,tacticalPlacements:o.session.ops.filter(x=>x.tacticalPlacement).map(x=>({id:x.id,placement:x.tacticalPlacement}))}}))});
}
function roomStartBattle(){
  roomAssert(G.phase==='rest'&&!G.over,'WRONG_PHASE','当前不能开战');
  roomAssert(!G._mergeReward&&document.getElementById('decision-modal').style.display!=='flex','CHOICE_REQUIRED','请先完成当前选择');
  const traps=JSON.parse(JSON.stringify(B?.traps||[]));
  roomNetwork=roomNewNetwork();
  startBattleRound();
  roomAssert(G.phase==='battle'&&B?.phase==='battle','BATTLE_REJECTED',document.getElementById('flash').textContent||'战斗初始化失败');
  B.traps=traps;
  // Save the opening resolved formation, after strategy and bond calculation.
  // Joint defense starts those units afresh: dead/removed units, active-skill
  // modifiers, stun timers and summoning state from the ordinary fight must
  // not become the next stage's base stats or permanently remove a defender.
  roomNetwork.initialUnits=JSON.parse(JSON.stringify(G.ops.filter(o=>o.row!=null).map(boardView)));
  roomNetwork.initialSession=JSON.parse(JSON.stringify(G));
  roomNetwork.initialTraps=traps;
}
function roomAdvance(seconds){
  roomAssert(Number.isFinite(seconds)&&seconds>=0&&seconds<=30,'INVALID_ELAPSED','每次推进必须在 0 至 30 秒内');
  if(G.phase==='rest'){
    __roomClock+=seconds*1000;G.runElapsed=(G.runElapsed||0)+seconds;
    const remaining=advanceDecisionClock(seconds);
    if(document.getElementById('decision-modal').style.display!=='flex')G.prepareRemaining=Math.max(0,(G.prepareRemaining??preparationLimit())-remaining);
    return roomStatus();
  }
  if(G.phase!=='battle'||G.battleDone||!B||B.over)return roomStatus();
  // A logical frame is 1/30 second, at the mode's fixed 2x speed. Allocate
  // 1/60 real second to each frame, so batching never accelerates the HUD timer
  // and large host scheduling gaps do not silently discard simulation frames.
  roomNetwork.accumulator+=seconds*2;
  while(roomNetwork.accumulator+1e-10>=1/30&&!B.over){
    roomNetwork.accumulator=Math.max(0,roomNetwork.accumulator-1/30);
    __roomClock+=1000/60;G.runElapsed=(G.runElapsed||0)+1/60;
    update(1/30,1/60);roomMilestones();
  }
  return roomStatus();
}
function roomBattleInput(playerId){
  roomAssert(G.phase==='battle'&&B,'WRONG_PHASE','开战后才能读取已结算阵型');
  roomAssert(roomNetwork.initialUnits,'INVALID_BATTLE','当前没有开战阵型记录');
  return JSON.stringify({id:playerId,life:G.life,units:roomNetwork.initialUnits,traps:roomNetwork.initialTraps||[],layout:roomLayout(),session:roomNetwork.initialSession,account:ACCOUNT});
}
function roomUseSharedBattle(){
  const input=JSON.parse(__roomInput),kind=input.kind;
  roomAssert(['boss','joint-defense'].includes(kind)&&G.phase==='battle','WRONG_PHASE','当前不能进入共享战场');
  roomAssert(Array.isArray(input.units)&&input.units.length<=128,'INVALID_BATTLE','共享阵型无效');
  const prior=kind==='joint-defense'?(G.roundResults||[]).find(x=>x.round===G.round):null;
  roomNetwork={...roomNewNetwork(),kind,shared:true,priorResult:prior?JSON.parse(JSON.stringify(prior)):null,owners:input.owners||[]};
  G.battleDone=false;G.lastBattleWin=false;
  const source=battleSourceForRun(),shield=roundShield(G.round);
  if(source&&input.owners?.length)source.enemyModifiers=input.owners.flatMap(owner=>owner.session?.decisionEnemyMods||[]);
  if(kind==='joint-defense'){
    if(input.leakedEnemies){
      roomAssert(Array.isArray(input.leakedEnemies)&&input.leakedEnemies.length<=1024&&[1,2].includes(input.seatCount),'INVALID_BATTLE','联防漏怪或席位无效');
      const rawRoutes=[],spawn=[],lv=BDATA.level,warnings=[];
      for(const [index,enemy]of input.leakedEnemies.entries()){
        roomAssert(BDATA.enemies[enemy.enemyId],'INVALID_BATTLE','联防敌人未在本轮源目录中');
        const route=source.rawRoutes[enemy.route]||source.rawRoutes[0];
        const start={...route.startPosition,col:route.startPosition.col+(input.seatCount===2?8:0)};
        // Rebuild walk paths on the actual terrain: an enemy begins again at
        // a red gate and crosses the joined lane, never crosses a wall/bench.
        rawRoutes.push({startPosition:start,endPosition:route.endPosition,checkpoints:[],motionMode:enemy.flying?'FLY':'WALK',allowDiagonalMove:!!route.allowDiagonalMove});
        spawn.push({enemyId:enemy.enemyId,route:index,at:index*0.5});
      }
      const converted=window.ArkSourceMap.convertLevel({layout:lv,routes:rawRoutes},warnings);
      roomAssert(converted.routes.every(r=>r.segs?.length),'INVALID_ROUTE','联防路线无法通过源地形');
      input.routes=converted.routes;input.spawn=spawn;
    }
    roomAssert(Array.isArray(input.spawn),'INVALID_BATTLE','联防缺少真实漏怪输入');
    if(input.routes)BDATA.level.routes=input.routes;
    startBattle(input.units,input.spawn,shield,null);
    B.sourceBattle=true;B.moveMultiplier=source?.options?.moveMultiplier??1;B.enemyStatMultiplier=source?.enemyStatMultiplier??1;
    B.dp=Math.max(0,source?.options?.initialCost??0);B.dpMax=source?.options?.maxCost??99;
    B.dpInterval=source?.options?.costIncreaseTime>0?source.options.costIncreaseTime:1;B.roundLimit=source?.options?.maxPlayTime>0?source.options.maxPlayTime:120;
  }else startBattle(input.units,[],shield,source);
  B.traps=input.traps||[];
  B._garrisonJointDefense=kind==='joint-defense';
  // The owning session remains separate. Event-granted bond layers must update
  // that owner's resolved stats, never the other player's equal numeric ID.
  window.onBondGarrison=function(trigger,op){
    const owner=roomNetwork.owners.find(x=>x.id===op?.playerId);
    if(!owner)return;
    const previous=G,id=op.id;
    try{
      G=owner.session;op.id=op.unitId;
      const nativeSet=window.__setAllOpStats;
      window.__setAllOpStats=callback=>{for(const unit of B.operators)if(unit.playerId===owner.id){const worldId=unit.id;unit.id=unit.unitId;try{callback(unit);}finally{unit.id=worldId;}}};
      try{roomNativeGarrison(trigger,op);}finally{window.__setAllOpStats=nativeSet;}
    }finally{op.id=id;G=previous;}
  };
}
function roomFinishShared(){
  const result=JSON.parse(__roomInput);
  roomAssert(G.phase==='battle','WRONG_PHASE','当前没有可结算的共享战斗');
  // Primary and peer both pass through this once; simulation leaks in the
  // primary only reduced the shared shield, never its persistent life.
  if(roomNetwork.shared&&roomNetwork.settled)return;
  const prior=roomNetwork.priorResult||(result.kind==='joint-defense'?(G.roundResults||[]).find(x=>x.round===G.round):null);
  G.life=Math.max(0,G.life-Math.max(0,result.lifeLoss||0));
  G.battleDone=true;G.lastBattleWin=!!result.win;G.shield=Math.max(0,result.shield||0);
  B.over=true;B.win=!!result.win;B.shield=G.shield;
  if(result.stats)B.stats={kills:(prior?.kills||0)+(result.stats.kills||0),leaks:(prior?.leaks||0)+(result.stats.leaks||0)};
  if(result.realTime!=null){
    G.runElapsed=Math.max(G.runElapsed||0,roomNetwork.startedElapsed+(result.realTime||0));
    B.roundTime=(prior?.battleSeconds||0)+result.realTime;
  }
  if(result.ownerSession){G.activeBonds=result.ownerSession.activeBonds;G.addLayers=result.ownerSession.addLayers;G._gar=result.ownerSession._gar;}
  for(const p of result.ownerSession?.tacticalPlacements||[]){const o=G.ops.find(o=>o.id===p.id);if(o)o.tacticalPlacement=p.placement;}
  G.roundResults=(G.roundResults||[]).filter(x=>x.round!==G.round);recordRoundResult(result.win);
  roomNetwork.shared=true;roomNetwork.settled=true;
}
function roomAlignChoices(){
  const choices=JSON.parse(__roomInput),mode=runModeData();
  for(const [round,index]of Object.entries(choices))roomAssert(mode.rounds.some(r=>r.round===Number(round)&&Number.isInteger(index)&&index>=0&&index<r.alternatives.length),'INVALID_CHOICE','回合源选项无效');
  const previous=G.roundChoices[G.round];G.roundChoices={...G.roundChoices,...choices};
  if(G.phase==='rest'&&previous!==G.roundChoices[G.round]){prepareSourceRound(G.round,{preserveFormation:true});refreshBoard();}
}
function roomNextRound(){
  const input=JSON.parse(__roomInput);
  roomAssert(G.phase==='battle'&&G.battleDone,'WRONG_PHASE','战斗尚未完成');
  if(input.roundChoices){__roomInput=JSON.stringify(input.roundChoices);roomAlignChoices();}
  const original=canEnterSecretCore;
  canEnterSecretCore=()=>hiddenBossEligibility(input.players).eligible;
  try{nextRound();}finally{canEnterSecretCore=original;}
  roomNetwork=roomNewNetwork();window.onBondGarrison=roomNativeGarrison;
}
function roomBattleLinks(){
  if(!B)return null;
  const refs=new Map();for(const key of ['operators','enemies','summoneds','traps'])for(const [index,entity]of (B[key]||[]).entries())refs.set(entity,{key,index});
  const ref=value=>refs.get(value)||null;
  return {leader:ref(B.leader),enemies:(B.enemies||[]).map(e=>({atkTarget:ref(e.atkTarget),atkTargets:(e.atkTargets||[]).map(ref)})),
    projectiles:(B.projectiles||[]).map(p=>({owner:ref(p.owner),target:ref(p.target)})),
    bossSkillEvents:(B.bossSkillEvents||[]).map(e=>({owner:ref(e.owner),targets:(e.targets||[]).map(ref)}))};
}
function roomRestoreBattleLinks(links){
  if(!B||!links)return;
  // JSON duplicates a buff's skillState object. Rebind it so skill end/death
  // removes the active skill buff, including infinite skills, after reconnect.
  for(const o of [...(B.operators||[]),...(B.summoneds||[])])if(o.skillState)for(const b of o.buffs||[])if(b.skillState)b.skillState=o.skillState;
  const at=ref=>ref&&B[ref.key]?.[ref.index];
  if(links.leader)B.leader=at(links.leader);
  for(const [index,link]of (links.enemies||[]).entries()){
    const enemy=B.enemies[index];if(!enemy)continue;
    if(link.atkTarget)enemy.atkTarget=at(link.atkTarget);
    if(enemy.atkTargets)enemy.atkTargets=enemy.atkTargets.map((target,i)=>at(link.atkTargets[i])||target);
  }
  for(const key of ['projectiles','bossSkillEvents'])for(const [index,link]of (links[key]||[]).entries()){
    const event=B[key]?.[index];if(!event)continue;
    for(const field of ['owner','target'])if(link[field])event[field]=at(link[field]);
    if(event.targets)event.targets=event.targets.map((target,i)=>at(link.targets[i])||target);
  }
}
function roomCapture(){return JSON.stringify({
  session:G,account:ACCOUNT,rng:ArkSim.snapshot(),traps:B?.traps||[],
  context:{CUR,curDiff,curMatch,curEnemyType,curBoss,curEnemyTypes,TEAM_AI,PLAYER_NAME},
  ui:{decisionPending:document.getElementById('decision-modal').style.display==='flex',decisionSelection:G?._decisionSelection??null,decisionResolvedRound:G?._decisionResolvedRound??null,deploymentCells:roomDeploymentCells()},
  board:B,level:BDATA.level,clock:__roomClock,network:roomNetwork,links:roomBattleLinks(),
  transient:{selectedHand,selectedEquip,selBoardOp,shopPreview,selectedBond,selected,drag,hover,bannerGen,bannerTimer,boss:!!window.__bossBattle}
});}
function roomRestore(){
  const p=JSON.parse(__roomInput),c=p.context,t=p.transient;
  buildRoster(BATTLE.operators,p.session.seasonId,p.session.diySelections||{});replaceGameSession(p.session,'room.restore');ACCOUNT=p.account;ArkSim.restore(p.rng);
  CUR=c.CUR;curDiff=c.curDiff;curMatch=c.curMatch;curEnemyType=c.curEnemyType;curBoss=c.curBoss;curEnemyTypes=c.curEnemyTypes;TEAM_AI=c.TEAM_AI;PLAYER_NAME=c.PLAYER_NAME;
  setupSeasonId=G.seasonId;setupStageKey=G.mapKey;GMODE='auto';__roomClock=p.clock;
  B=replaceEngineState('battle',p.board,'room.restore');
  roomRestoreBattleLinks(p.links);
  if(p.level)BDATA=replaceEngineState('catalog',{level:p.level,enemies:{...BATTLE.enemies,...battleSourceForRun()?.enemies}},'room.restore');
  roomNetwork=p.network||roomNewNetwork();
  selectedHand=t.selectedHand;selectedEquip=t.selectedEquip;selBoardOp=t.selBoardOp;shopPreview=t.shopPreview;selectedBond=t.selectedBond;selected=t.selected;drag=t.drag;hover=t.hover;bannerGen=t.bannerGen;bannerTimer=t.bannerTimer;window.__bossBattle=t.boss;
  document.getElementById('decision-modal').style.display=p.ui.decisionPending?'flex':'none';
}
function roomTacticalCommand(){
  const {payload:p,actor}=JSON.parse(__roomInput),saved=G,savedAccount=ACCOUNT,identity=window.__tacticalPlayerId;
  roomAssert(B&&!B.over&&['rest','battle'].includes(B.phase)&&!G.over,'WRONG_PHASE','当前不能操作召唤物');
  try{
    if(roomNetwork.shared){
      const owner=roomNetwork.owners.find(x=>x.id===actor);roomAssert(owner,'NOT_OWNED','不属于此战场席位');G=owner.session;ACCOUNT=owner.account||ACCOUNT;
    }
    window.__tacticalPlayerId=actor;
    roomOwnUnit(p.unitId);if(p.targetId)roomOwnUnit(p.targetId);
    if(B.phase==='rest')roomAssert(!G._mergeReward&&document.getElementById('decision-modal').style.display!=='flex','CHOICE_REQUIRED','请先完成选择');
    roomAssert(tacticalAction(p.action,p.unitId,p.row,p.col,p.dir,p.targetId,p.tokenId),'COMMAND_REJECTED','召唤物的归属、落点或当前状态不允许此操作');
    if(p.action==='place'&&B.phase==='battle'&&tacticalOwner(p.unitId)?.basicAttack?.tactician){
      const op=tacticalOwner(p.unitId),placement={...op.tacticalPlacement};
      if(op.side==='right'){const layout=roomLayout(roomNetwork.kind);placement.col=layout.left.start+(roomNetwork.kind==='boss'?layout.right.end-1-placement.col:placement.col-layout.right.start);if(roomNetwork.kind==='boss')placement.dir=({left:'right',right:'left',up:'up',down:'down'})[placement.dir];}
      G.ops.find(o=>o.id===p.unitId).tacticalPlacement=placement;
    }
  }finally{G=saved;ACCOUNT=savedAccount;window.__tacticalPlayerId=identity;}
}
function roomCommand(){
  const {type,payload:p}=JSON.parse(__roomInput);
  roomAssert(G&&G.phase==='rest'&&!G.over,'WRONG_PHASE','当前不是可操作的休整阶段');
  const decision=document.getElementById('decision-modal').style.display==='flex';
  roomAssert(!decision||type==='game/decision-preview'||type==='game/decision-confirm','CHOICE_REQUIRED','请先完成本轮决策');
  roomAssert(!G._mergeReward||type==='game/merge-reward','CHOICE_REQUIRED','请先领取晋升调配奖励');
  let changed=false;
  switch(type){
    case 'game/buy': {
      roomAssert(G.shop[p.index],'INVALID_INDEX','商品已不存在');
      const next=G.nextId;buyShop(p.index);changed=G.nextId>next;break;
    }
    case 'game/refresh': {const shop=G.shop;refreshShop();changed=G.shop!==shop;break;}
    case 'game/freeze': toggleFreeze();changed=true;break;
    case 'game/upgrade': {const level=G.level,confirm=!!G._upgradeConfirm;upgradeShop();changed=G.level!==level||!!G._upgradeConfirm!==confirm;break;}
    case 'game/cancel-upgrade': G._upgradeConfirm=false;changed=true;break;
    case 'game/sell': {const o=roomOwnUnit(p.unitId);if(o.row==null)sellHand(o.id);else onOpSell(o.id);changed=!G.ops.some(x=>x.id===p.unitId);break;}
    case 'game/deploy': {
      const o=roomOwnUnit(p.unitId);roomAssert(o.row==null,'INVALID_UNIT_STATE','该干员已经部署');roomCell(p.row,p.col,o);
      roomAssert(!G.ops.some(x=>x.row===p.row&&x.col===p.col),'OCCUPIED','目标格已有干员');
      onDeploy(o,p.row,p.col,p.dir);changed=G.ops.find(x=>x.id===p.unitId)?.row===p.row;break;
    }
    case 'game/move':case 'game/rotate': {
      const o=roomOwnUnit(p.unitId);roomAssert(o.row!=null,'INVALID_UNIT_STATE','该干员尚未部署');
      const row=type==='game/rotate'?o.row:p.row,col=type==='game/rotate'?o.col:p.col;roomCell(row,col,o);
      const other=G.ops.find(x=>x.id!==o.id&&x.row===row&&x.col===col);if(other)roomCell(o.row,o.col,other);
      onMoveOp(o.id,row,col,p.dir);changed=true;break;
    }
    case 'game/recall':case 'game/bench-recall': {
      const o=roomOwnUnit(p.unitId);roomAssert(o.row!=null,'INVALID_UNIT_STATE','该干员尚未部署');
      if(p.row!=null){roomBench(p.row,p.col);onBenchRecall(o.id,p.row,p.col);}else recallBoard(o.id);
      changed=G.ops.find(x=>x.id===o.id)?.row==null;break;
    }
    case 'game/bench-move': {
      roomBench(p.row,p.col);roomAssert(candidateItems().some(x=>(x.uid??x.id)===p.unitId),'NOT_OWNED','本席位没有该候选实体');
      onBenchMove(p.unitId,p.row,p.col);changed=true;break;
    }
    case 'game/equip': {
      roomOwnUnit(p.unitId);const eq=roomOwnEquip(p.equipId);roomAssert(!eq.kind||eq.kind==='stat'||eq.kind==='use','INVALID_EQUIPMENT','该物品不能穿戴');
      onEquipDeploy(eq.uid,p.unitId,p.slot);changed=!G.equipInv.some(e=>e.uid===eq.uid);break;
    }
    case 'game/sell-equip': {roomOwnEquip(p.equipId);sellEquip(p.equipId);changed=true;break;}
    case 'game/use-equip': {
      roomAssert(false,'TARGET_REQUIRED','请将消耗品拖到本人的干员身上使用');break;
    }
    case 'game/deploy-trap': {
      const eq=roomOwnEquip(p.equipId);roomAssert(eq.kind==='trap','INVALID_EQUIPMENT','该物品不是部署装置');roomCell(p.row,p.col);
      roomAssert(!B.traps?.some(t=>t.row===p.row&&t.col===p.col),'OCCUPIED','目标格已有装置');
      roomAssert(!G.ops.some(o=>o.row===p.row&&o.col===p.col),'OCCUPIED','目标格已有干员');
      onDeploy({id:eq.uid,charId:eq.charId,effectId:eq.effectId,isTrap:true},p.row,p.col,p.dir);changed=!G.equipInv.some(e=>e.uid===eq.uid);break;
    }
    case 'game/merge-reward': {
      roomAssert(G._mergeReward&&G.shop[p.index]?.type==='op','INVALID_INDEX','当前没有该晋升奖励');selectMergeReward(p.index);changed=true;break;
    }
    case 'game/decision-preview': changed=previewDecision(p.id)===true;break;
    case 'game/decision-confirm':
      roomAssert(G._decisionSelection?.round===G.round&&G._decisionSelection.id===p.id,'CHOICE_MISMATCH','先选择要确认的决策');changed=applyDecision(p.id)===true;break;
  }
  roomAssert(changed,'COMMAND_REJECTED',document.getElementById('flash').textContent||'当前无法执行该操作');
  roomAssert(G.phase==='rest'&&!G.over&&G.money>=0&&Number.isFinite(G.money),'INVALID_RESULT','运营规则返回了无效状态');
  return true;
}
`;

const COMMANDS=Object.freeze({
  'game/tactical':['action','unitId','row','col','dir','targetId','tokenId'],
  'game/buy':['index'],'game/refresh':[],'game/freeze':[],'game/upgrade':[],'game/cancel-upgrade':[],
  'game/sell':['unitId'],'game/deploy':['unitId','row','col','dir'],'game/move':['unitId','row','col','dir'],
  'game/rotate':['unitId','dir'],'game/recall':['unitId'],'game/bench-recall':['unitId','row','col'],'game/bench-move':['unitId','row','col'],
  'game/equip':['unitId','equipId','slot'],'game/sell-equip':['equipId'],'game/use-equip':['equipId'],
  'game/deploy-trap':['equipId','row','col','dir'],'game/merge-reward':['index'],
  'game/decision-preview':['id'],'game/decision-confirm':['id']
});
function validateCommand(type,payload){
  if(typeof type!=='string'||!Object.hasOwn(COMMANDS,type))fail('UNKNOWN_COMMAND','服务器未开放此游戏操作');
  exact(payload,COMMANDS[type],type==='game/recall'?['row','col']:[]);
  for(const key of ['unitId','equipId'])if(Object.hasOwn(payload,key))uint(payload[key],1);
  for(const key of ['row','col','index'])if(Object.hasOwn(payload,key))uint(payload[key],0,2000);
  if(type==='game/recall'&&Object.hasOwn(payload,'row')!==Object.hasOwn(payload,'col'))fail('INVALID_PAYLOAD','候选位置必须包含完整行列');
  if(Object.hasOwn(payload,'targetId'))uint(payload.targetId);
  if(Object.hasOwn(payload,'slot'))uint(payload.slot,0,1);
  if(Object.hasOwn(payload,'dir')&&!['up','down','left','right'].includes(payload.dir))fail('INVALID_PAYLOAD','朝向无效');
  if(Object.hasOwn(payload,'id'))textId(payload.id);
  if(type==='game/tactical'){
    if(!['place','retreat','copy-open','copy-target'].includes(payload.action)||typeof payload.tokenId!=='string'||payload.tokenId.length>512)fail('INVALID_PAYLOAD','召唤物命令无效');
  }
}
function sourceSettings(){return require('../../web/source_battles.json').seasons;}
function validateRoomSettings(config){
  exact(config,['seasonId','modeId','mapKey']);for(const value of Object.values(config))textId(value);
  if(!/^mode_(?:(?:single|multi)_(?:funny|normal|hard|abyss)|training_1)$/.test(config.modeId))fail('INVALID_CONFIG','请选择目录中的模拟难度。');
  const seasons=sourceSettings(),season=Object.hasOwn(seasons,config.seasonId)?seasons[config.seasonId]:null,mode=season?.modes?.[config.modeId];
  if(!mode||!mode.stageChoices.some(stage=>stage.levelKey===config.mapKey))fail('INVALID_CONFIG','赛季、难度或地图组合不存在。');
  return {seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey};
}
function defaultRoomSettings(){
  const seasonId='act2autochess',modeId='mode_multi_hard';
  // Season II also lists older maps first. The fresh-room default is its own
  // first supported map; explicit room settings never pass through this path.
  const map=sourceSettings()[seasonId]?.modes[modeId]?.stageChoices.find(stage=>stage.stageId.startsWith(seasonId+'_'));
  if(!map)fail('INVALID_CONFIG','默认的盟约Ⅱ绝境模拟地图未收录，请检查游戏数据。');
  return validateRoomSettings({seasonId,modeId,mapKey:map.levelKey});
}
function roomConfigForPlayers(settings,count){
  const config=validateRoomSettings(settings);uint(count,1,4);
  if(config.modeId==='mode_training_1'){
    if(count!==1)fail('MULTIPLAYER_UNSUPPORTED','入门协议只支持单人，请改选其他难度后再启动同盟。');
  }else config.modeId=config.modeId.replace(/^mode_(single|multi)_/,'mode_'+(count===1?'single':'multi')+'_');
  const mode=sourceSettings()[config.seasonId].modes[config.modeId];
  if(!mode)fail('PLAYER_COUNT_MODE_MISMATCH','所选难度不支持当前人数，请重新选择。');
  if(!mode.stageChoices.some(stage=>stage.levelKey===config.mapKey))fail('PLAYER_COUNT_MAP_MISMATCH','所选地图不支持当前人数的对应模式，请房主重新选择地图；不会自动换图。');
  return config;
}
function roomSetupInfo(config,choices,seed=0){
  return require('../../web/src/rules/run-setup').setupInfo({source:require('../../web/source_battles.json'),bonds:require('../../web/op_bonds.json'),tiers:require('../../web/operator_tiers.json'),rules:require('../../web/mode_rules.json'),operators:require('../../web/battle_data.json').operators,encounters:require('../../web/enemy_encounters.json')},config,choices,seed);
}
function validateConfig(config){exact(config,['seasonId','modeId','mapKey','bandId'],['skillChoices','diySelections']);
  if(config.diySelections!==undefined){
    try{const picks=require('../../web/src/rules/diy-roster').normalize(require('../../web/diy_roster.json'),config.seasonId,config.diySelections);if(config.modeId==='mode_training_1'&&Object.keys(picks).length)throw Error('入门协议不支持甄选');}
    catch(error){fail('INVALID_CONFIG',error.message);}
  }
  if(config.skillChoices!==undefined){
    const choices=require('../../web/skill_choices.json');
    if(!config.skillChoices||typeof config.skillChoices!=='object'||Array.isArray(config.skillChoices)||Object.keys(config.skillChoices).length>454)fail('INVALID_CONFIG','携带技能配置无效');
    for(const [id,index] of Object.entries(config.skillChoices))if(!choices[id]?.some(s=>s.index===index))fail('INVALID_CONFIG','携带技能不存在');
  }
validateRoomSettings({seasonId:config.seasonId,modeId:config.modeId,mapKey:config.mapKey});textId(config.bandId);}
async function catalogInfo(){
  if(!infoPromise)infoPromise=(async()=>{
    const machine=await boot();
    try{fingerprintOf(machine);return JSON.parse(machine.run(`JSON.stringify({catalog:catalogFingerprint(),schemaVersion:${SCHEMA_VERSION},seasons:Object.entries(SOURCE_BATTLES.seasons).map(([seasonId,s])=>({seasonId,bands:s.bands.map(b=>({bandId:b.bandId,name:b.name})),modes:Object.entries(s.modes).filter(([modeId])=>/^mode_(single_|multi_|training_1)/.test(modeId)).map(([modeId,m])=>({modeId,kind:modeId==='mode_training_1'?'training':modeId.startsWith('mode_multi_')?'multi':'single',name:s.modeConfigs[modeId]?.name||modeId,maps:m.stageChoices.map(c=>({mapKey:c.levelKey,stageId:c.stageId,name:playableLevels().find(l=>l.id===c.stageId)?.name||c.stageId}))}))}))})`));}
    finally{machine.dispose();}
  })().catch(e=>{infoPromise=null;throw e;});
  return clone(await infoPromise);
}
async function createPlayerRuntime(config,options={}){
  validateConfig(config);exact(options,[],['seed','name','bannedOperators','enemySeed']);
  const seed=options.seed??1,name=options.name??'博士';uint(seed);
  const enemySeed=options.enemySeed??seed;uint(enemySeed);
  if(typeof name!=='string'||!name.trim()||name.length>32||/[\u0000-\u001f\u007f]/.test(name))fail('INVALID_CONFIG','玩家名称无效');
  const fixedConfig=clone(config),secret=crypto.randomBytes(32);
  let machine=await boot();
  let disposed=false,revision=0;
  const sign=value=>crypto.createHmac('sha256',secret).update(JSON.stringify(value)).digest('hex');
  try{
    machine.context.__roomInput=JSON.stringify({config:fixedConfig,seed,enemySeed,name,bannedOperators:options.bannedOperators||[]});
    machine.run(`{
      const {config:c,seed,enemySeed,name}=JSON.parse(__roomInput),s=SOURCE_BATTLES.seasons[c.seasonId],m=s?.modes[c.modeId];
      roomAssert(m&&m.stageChoices.some(x=>x.levelKey===c.mapKey)&&s.bands.some(x=>x.bandId===c.bandId),'INVALID_CONFIG','赛季、模式、地图或策略组合不存在');
      window.__roomDiySelections=c.diySelections||{};
      setupSeasonId=c.seasonId;buildRoster();setupStageKey=c.mapKey;curDiff=c.modeId==='mode_training_1'?'training':Object.keys(DIFF_GAMEDATA).find(k=>DIFF_GAMEDATA[k].toLowerCase()===c.modeId.split('_').at(-1));curMatch=c.modeId.startsWith('mode_multi_')?'team':'solo';PLAYER_NAME=name;TEAM_AI=[];
      for(const [id,index] of Object.entries(c.skillChoices||{})) ACCOUNT.ops[id]={...getOpAccount(id),selectedSkill:index};
      BOND_BANS=[{ops:JSON.parse(__roomInput).bannedOperators}];window.__roomEnemySeed=enemySeed;ArkSim.seed(seed);chooseBand(c.bandId);roomAssert(G?.phase==='rest'&&G.modeId===c.modeId,'INVALID_CONFIG','无法进入所选同盟配置');
    }`);
  }catch(e){machine.dispose();throw e;}
  const fingerprint=fingerprintOf(machine);
  const active=()=>{if(disposed)fail('RUNTIME_DISPOSED','玩家运行时已结束');};
  const capture=()=>JSON.parse(machine.run('roomCapture()'));
  function restoreRaw(raw){machine.context.__roomInput=JSON.stringify(raw);machine.run('roomRestore()');}
  function snapshot(){
    active();const raw=capture();
    // Include enough context for network hydration even during pending choices.
    // The sealed checkpoint is server-only rollback material, never a client
    // patch API. A client may read it but cannot forge or cross-player restore it.
    const state={schemaVersion:SCHEMA_VERSION,fingerprint,config:clone(fixedConfig),revision,
      session:raw.session,context:raw.context,account:raw.account,rng:raw.rng,traps:raw.traps,ui:raw.ui,
      battle:raw.board,battleLevel:raw.level,
      checkpoint:{clock:raw.clock,board:raw.board,level:raw.level,network:raw.network,links:raw.links,transient:raw.transient}};
    return {...state,auth:sign(state)};
  }
  function command(type,payload={},actor=null){
    active();let before;const oldRevision=revision;
    try{
      validateCommand(type,payload);
      // A delayed preparation request can arrive after the room starts. Reject
      // before snapshot/restore so an invalid action cannot touch live objects.
      if(type!=='game/tactical'&&machine.run("G.phase!=='rest'||!!G.over"))fail('WRONG_PHASE','当前不是可操作的休整阶段');
      before=capture();machine.context.__roomClock=before.clock+1;
      machine.context.__roomInput=JSON.stringify({type,payload,actor});machine.run(type==='game/tactical'?'roomTacticalCommand()':'roomCommand()');revision++;
      return {ok:true,revision,state:snapshot()};
    }catch(e){
      if(before)restoreRaw(before);revision=oldRevision;
      return {ok:false,revision,state:snapshot(),error:{code:e.code||'RULE_ERROR',message:e.message||'运营操作失败'}};
    }
  }
  function restore(state){
    active();exact(state,['schemaVersion','fingerprint','config','revision','session','context','account','rng','traps','ui','battle','battleLevel','checkpoint','auth']);
    const {auth,...body}=state;
    if(typeof auth!=='string'||!/^\w{64}$/.test(auth)||!crypto.timingSafeEqual(Buffer.from(auth),Buffer.from(sign(body))))fail('INVALID_SNAPSHOT','快照不属于此运行时或已被修改');
    if(body.schemaVersion!==SCHEMA_VERSION||body.fingerprint!==fingerprint||JSON.stringify(body.config)!==JSON.stringify(fixedConfig))fail('INVALID_SNAPSHOT','快照目录或配置不一致');
    const before=capture(),oldRevision=revision;
    try{restoreRaw({...body,...body.checkpoint});revision=body.revision;return snapshot();}
    catch(e){restoreRaw(before);revision=oldRevision;throw e;}
  }
  function status(){active();return JSON.parse(machine.run('roomStatus()'));}
  function transition(statement,input={}){
    active();const before=capture(),oldRevision=revision;
    try{machine.context.__roomInput=JSON.stringify(input);machine.run(statement);revision++;return snapshot();}
    catch(e){restoreRaw(before);revision=oldRevision;throw e;}
  }
  function startBattle(){return transition('roomStartBattle()');}
  function advance(realSeconds){
    active();if(!Number.isFinite(realSeconds)||realSeconds<0||realSeconds>30)fail('INVALID_ELAPSED','每次推进必须在 0 至 30 秒内');
    machine.context.__roomElapsed=realSeconds;
    return JSON.parse(machine.run('roomAdvance(__roomElapsed)'));
  }
  function battleInput(playerId){active();textId(playerId);machine.context.__roomPlayerId=playerId;return JSON.parse(machine.run('roomBattleInput(__roomPlayerId)'));}
  function useSharedBattle(input){return transition('roomUseSharedBattle()',input);}
  function finishShared(result){return transition('roomFinishShared()',result);}
  function nextRound(input={}){return transition('roomNextRound()',input);}
  function alignRoundChoices(choices){return transition('roomAlignChoices()',choices);}
  return Object.freeze({fingerprint,config:clone(fixedConfig),snapshot,command,restore,
    status,startBattle,advance,battleInput,useSharedBattle,finishShared,nextRound,alignRoundChoices,
    describeConfig:()=>clone(fixedConfig),dispose(){if(!disposed){disposed=true;machine.dispose();machine=null;}}
  });
}
module.exports={createPlayerRuntime,catalogInfo,SCHEMA_VERSION,COMMANDS,validateRoomSettings,defaultRoomSettings,roomConfigForPlayers,roomSetupInfo};
