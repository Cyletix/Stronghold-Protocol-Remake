// Deployable tactical points use the existing candidate tiles and facing gesture.
// They are owned attachments, never shop cards, bond members or deployment slots.
function tacticalOwner(id) {
  return (B?.operators||[]).find(o=>(o.unitId??o.id)===id&&(!o.playerId||o.playerId===window.__tacticalPlayerId));
}
function tacticalOwned(s) { return !!s&&(!s.playerId||s.playerId===window.__tacticalPlayerId); }
function tacticalCandidates() {
  if(!G||!B)return [];
  const battle=B.phase==='battle',out=[];
  for(const o of G.ops){
    const drone=battle?tacticalOwner(o.id):null;
    if(window.ArkMedicDrone?.available(drone)){
      const d=drone.basicAttack.medicDrone,item=drone.medicDroneReserve??={};
      Object.assign(item,{id:'medic-drone-stock:'+o.id,ownerUnitId:o.id,charId:d.charId,name:d.name,position:d.position,isTactical:true,isMedicDrone:true,cost:ArkMedicDrone.stats(drone).cost,rangeGrids:ArkMedicDrone.stats(drone).rangeGrids});out.push(item);
    }
    const d=o.basicAttack?.tactician;
    if(!d||o.row==null)continue;
    const live=battle?tacticalOwner(o.id):null;
    if(battle?(!live?.deployed||live.dead||ArkTactician.point(live)):!!o.tacticalPlacement)continue;
    const item=o.tacticalReserve??={};
    Object.assign(item,{id:'tactical:'+o.id,ownerUnitId:o.id,charId:d.charId,name:d.name,position:d.position||'MELEE',isTactical:true,rangeGrids:d.phases[0].rangeGrids});
    out.push(item);
  }
  return out;
}
function tacticalBenchView(s) {return s.bench?{...s,...s.bench,bench:true}:null;}
function prepareTacticalPoints() {
  if(!B||B.phase!=='rest')return;
  B.summoneds=[];
  for(const o of B.operators){
    o.cells=rangeCellsFor(o);
    const saved=G.ops.find(x=>x.id===o.id),p=saved?.tacticalPlacement;
    if(!p||!o.basicAttack?.tactician)continue;
    if(!ArkTactician.legal(o,p.row,p.col)) {delete saved.tacticalPlacement;delete o.tacticalPlacement;continue;}
    const s=ArkTactician.create(o,p.row,p.col);s.dir=p.dir;s.cells=rangeCellsFor(s);s.preparation=true;
  }
}
function syncTacticalBench(force=false) {
  if(!G||!B||B.phase!=='battle'||window.__roomRemoteSimulation&&!force)return;
  const candidates=tacticalCandidates(),key=JSON.stringify([candidates.map(x=>x.id),G.ops.filter(o=>o.row==null).map(o=>o.id)]);
  if(B.tacticalBenchKey===key&&!force)return;
  B.tacticalBenchKey=key;assignBenchCells();
  B.bench=G.ops.filter(o=>o.row==null).map(benchView).concat(candidates.map(tacticalBenchView)).filter(Boolean);
  // Shared right-side view: allocate display cells on that side, preserving local IDs.
  if((B.operators||[]).some(o=>o.playerId===window.__tacticalPlayerId&&o.side==='right')){
    const cells=candidateCells(BDATA.level).filter(c=>c.col>=Math.floor(BDATA.level.cols/2));
    B.bench=B.bench.slice(0,cells.length).map((o,i)=>({...o,...cells[i]}));
  }
}
window.onTacticalBenchChanged=syncTacticalBench;
function tacticalCanPlace(id,row,col) {
  const owner=tacticalOwner(id);if(window.ArkMedicDrone?.supported(owner))return ArkMedicDrone.legal(owner,row,col);
  if(!owner?.basicAttack?.tactician||B.over)return false;
  const s=ArkTactician.point(owner);
  return (B.phase==='rest'||owner.deployed&&!owner.dead&&!s)&&ArkTactician.legal(owner,row,col,{ignoreId:B.phase==='rest'?s?.id:null});
}
// The same operation is executed locally and by the authenticated room runtime.
function tacticalAction(action,unitId,row=0,col=0,dir='up',targetId=0,tokenId='') {
  if(!G||!B||B.over||G.over||!['rest','battle'].includes(B.phase))return false;
  const live=tacticalOwner(unitId),run=G.ops.find(o=>o.id===unitId);
  if(!live||!run)return false;
  let s=tokenId?(B.summoneds||[]).find(x=>x.id===tokenId&&x.ownerId===live.id&&!x.removed):ArkTactician.point(live),ok=false;
  if(B.phase==='battle'&&window.ArkMedicDrone?.supported(live)){
    if(action==='place')ok=!!ArkMedicDrone.deploy(live,row,col,dir);
    else if(action==='retreat')ok=ArkMedicDrone.retreat(s);
  }else if(action==='place'&&tacticalCanPlace(unitId,row,col)){
    if(B.phase==='rest'){run.tacticalPlacement={row,col,dir};refreshBoard();ok=true;}
    else {ok=!!ArkTactician.deploy(live,row,col,dir);if(ok&&!live.playerId)run.tacticalPlacement={row,col,dir};}
  }else if(action==='retreat'&&s){
    // Preparation edits a blueprint; in combat the point stays put and recovers.
    if(B.phase==='rest'){delete run.tacticalPlacement;refreshBoard();ok=true;}
    else ok=ArkTactician.retreat(s);
  }else if(action==='copy-open'&&B.phase==='battle')ok=ArkFlowShape.open(s);
  else if(action==='copy-target'&&B.phase==='battle'&&ArkFlowShape.copying(s)){
    const preset=flowCopyPreset(run,targetId);if(preset)ok=ArkFlowShape.copy(s,preset);
  }
  if(ok){if(action==='place')playSfx('b_char_set');selectedHand=null;selBoardOp=action.startsWith('copy-')?s.id:null;setSelected(selBoardOp);B.tacticalBenchKey=null;syncTacticalBench();if(action.startsWith('copy-'))refreshTacticalDetail();else renderAll();}
  return ok;
}
function tacticalTokenAction(action) {
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed),o=s?ArkTactician.owner(s):null;
  return o&&tacticalOwned(s)?window.tacticalAction(action,o.unitId??o.id,0,0,'up',0,s.id):false;
}
function tacticalCopyTarget(row,col) {
  return (B?.summoneds||[]).find(s=>s.row===row&&s.col===col&&tacticalOwned(s)&&ArkFlowShape.copying(s));
}
function onTacticalDrop(op,row,col,dir='up') {
  if(op?.isTactical){window.tacticalAction('place',op.ownerUnitId,row,col,dir);return true;}
  const s=tacticalCopyTarget(row,col),donor=G?.ops.find(x=>x.id===op?.id&&x.row==null);
  if(!s||!donor)return false;
  const owner=ArkTactician.owner(s);window.tacticalAction('copy-target',owner.unitId??owner.id,0,0,'up',donor.id,s.id);return true;
}
function onTacticalSelect(s) {
  selBoardOp=s.id;selectedHand=null;selectedEquip=null;shopPreview=-1;setSelected(s.id);renderSelected();
}
function tacticalDetail() {
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed)||tacticalCandidates().find(x=>x.id===selectedHand);
  if(!s)return false;
  const hd=document.getElementById('hand-detail');if(!hd)return true;
  const live=s.isTactical?tacticalOwner(s.ownerUnitId):ArkTactician.owner(s),rest=B.phase==='rest',owned=tacticalOwned(s);
  const desc=s.isMedicDrone?'拖到己方空置地面或高台，拖出格子确认部署；消耗5部署费用，不占干员名额。治疗周围九格，10秒后消失。':
    s.medicDrone?'医疗无人机：治疗周围九格，剩余 '+Math.ceil(Math.max(0,s.expiresAt-B.time))+'秒。撤退后消失，不回候选区；赫默离场不影响已部署的无人机。':
    s.isTactical?'从候选区拖到主人攻击范围内，再拖出格子确认朝向。部署费用 0，不占干员名额。':
    s.tacticalDormant?'战术点恢复中：'+Math.ceil(Math.max(0,s.nextStackAt-B.time))+'秒后原位恢复；期间不能撤退。':
    s.tacticalToken&&!s.temporary?(rest?'已指定战术点；可拖动调整位置。':'撤退清空当前援军，按自身周期在原位恢复，不回候选区。'):'临时召唤物，撤退或被击倒后消失，不回候选区。';
  const flow=s.flow&&!s.temporary&&!rest,copying=flow&&ArkFlowShape.copying(s);
  hd.classList.add('equip','tactical-detail');hd.style.display='block';
  hd.innerHTML='<div class="bgfx"><div class="fade"></div></div><div class="txt"><h2>'+escapeHtml(s.name)+'</h2><p>所属：'+escapeHtml(live?.name||'')+'</p><p data-tactical-state>'+desc+'</p>'+
    (s.hp!=null?'<p data-tactical-life>生命 '+Math.ceil(s.hp)+' / '+s.maxHp+'</p>':'')+
    (flow?'<p data-tactical-copy>'+(copying?'复制窗口 '+Math.ceil(s.flow.copyUntil-B.time)+'秒 · 将候选干员拖到此流形，原干员保留。':'复制技力 '+Math.floor(s.flow.sp)+' / 100')+'</p><button data-tactical-open class="tactical-control" onclick="tacticalTokenAction(\'copy-open\')" '+(!owned||s.dead||(!copying&&(s.flow.sp<100||live?.skillState))?'disabled':'')+'>'+(copying?'取消复制':'开启复制窗口')+'</button>':'')+
    (!s.isTactical?'<button data-tactical-retreat class="tactical-control" onclick="tacticalTokenAction(\'retreat\')" '+(!owned||s.dead?'disabled':'')+'>'+(rest?'撤回战术点':'撤退召唤物')+'</button>':'')+'</div>';
  return true;
}
function refreshTacticalDetail(){
  const s=(B?.summoneds||[]).find(x=>x.id===selBoardOp&&!x.removed);if(!s)return;
  const hd=document.getElementById('hand-detail');if(!hd?.querySelector)return;
  const owned=tacticalOwned(s),live=ArkTactician.owner(s),copying=ArkFlowShape.copying(s);
  const put=(key,value)=>{const el=hd.querySelector('[data-tactical-'+key+']');if(el&&el.textContent!==value)el.textContent=value;return el;};
  put('life','生命 '+Math.ceil(s.hp)+' / '+s.maxHp);
  if(s.medicDrone)put('state','医疗无人机：治疗周围九格，剩余 '+Math.ceil(Math.max(0,s.expiresAt-B.time))+'秒。撤退后消失，不回候选区。');
  else if(s.tacticalDormant)put('state','战术点恢复中：'+Math.ceil(Math.max(0,s.nextStackAt-B.time))+'秒后原位恢复；期间不能撤退。');
  else if(!s.preparation)put('state',s.tacticalToken&&!s.temporary?'撤退清空当前援军，按自身周期在原位恢复，不回候选区。':'临时召唤物，撤退或被击倒后消失，不回候选区。');
  const retreat=hd.querySelector('[data-tactical-retreat]');if(retreat)retreat.disabled=!owned||s.dead;
  if(s.flow){
    put('copy',copying?'复制窗口 '+Math.ceil(s.flow.copyUntil-B.time)+'秒 · 将候选干员拖到此流形，原干员保留。':'复制技力 '+Math.floor(s.flow.sp)+' / 100');
    const button=put('open',copying?'取消复制':'开启复制窗口');if(button)button.disabled=!owned||s.dead||(!copying&&(s.flow.sp<100||!!live?.skillState));
  }
}
