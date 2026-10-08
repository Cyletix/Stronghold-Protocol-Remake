(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArkPairedBattle=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KINDS=new Set(['boss','joint-defense']),SIDES=new Set(['left','right']);
  function fail(code,message){throw Object.assign(new Error(message),{code});}
  function playerId(id){if(typeof id!=='string'||!id.trim()||id.length>128)fail('INVALID_PLAYER','Player ID must be a nonempty string.');return id;}
  function playersChecked(players){
    if(!Array.isArray(players)||players.length>4)fail('INVALID_PLAYERS','A room has at most four players.');
    const seen=new Set();for(const p of players){
      if(!p||typeof p!=='object')fail('INVALID_PLAYER','Player must be an object.');
      playerId(p.id);if(seen.has(p.id))fail('DUPLICATE_PLAYER','Player IDs must be unique.');seen.add(p.id);
      if(p.life!=null&&(!Number.isFinite(p.life)||p.life<0))fail('INVALID_PLAYER','Life must be a nonnegative number.');
      for(const key of ['alive','eliminated'])if(p[key]!=null&&typeof p[key]!=='boolean')fail('INVALID_PLAYER',key+' must be boolean.');
    }return players;
  }
  const alive=p=>p.alive!==false&&p.eliminated!==true&&(p.life==null||p.life>0);
  function kindChecked(kind){if(!KINDS.has(kind))fail('INVALID_KIND','Use boss or joint-defense.');return kind;}
  function topology(kind){return kind==='boss'?'symmetric-center':'right-to-left';}
  function randomStream(seed){let state=seed>>>0;return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function pairAlivePlayers(players,{seed,round,kind='boss'}={}){
    playersChecked(players);kindChecked(kind);
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isSafeInteger(round)||round<1)fail('INVALID_SEED','Pairing requires an explicit uint32 seed and positive round.');
    // ID ordering makes the result independent of arrival/map iteration order.
    // Disconnected players retain their game seat; elimination is a game state.
    const ids=players.filter(alive).map(p=>p.id).sort(),random=randomStream((seed^Math.imul(round,0x9e3779b1))>>>0);
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    const groups=[];
    for(let i=0;i<ids.length;i+=2)groups.push({id:kind+':'+round+':'+(i/2),kind,topology:topology(kind),seats:ids.slice(i,i+2).map((id,index)=>({playerId:id,side:index?'right':'left'}))});
    return {schemaVersion:1,seed,round,kind,groups,spectatorPlayerIds:players.filter(p=>!alive(p)).map(p=>p.id).sort()};
  }
  function groupChecked(group){
    if(!group||typeof group.id!=='string'||!group.id||!Array.isArray(group.seats)||group.seats.length<1||group.seats.length>2)fail('INVALID_GROUP','A battlefield has one or two seats.');
    kindChecked(group.kind);const ids=new Set(),sides=new Set();
    for(const s of group.seats){seatChecked(s);if(ids.has(s.playerId)||sides.has(s.side))fail('INVALID_GROUP','Duplicate battlefield player or side.');ids.add(s.playerId);sides.add(s.side);}
    if(!sides.has('left'))fail('INVALID_GROUP','The first living player occupies the left side.');
    return group;
  }
  function seatChecked(seat){if(!seat||!SIDES.has(seat.side))fail('INVALID_SEAT','Invalid battlefield side.');playerId(seat.playerId);return seat;}
  function layoutChecked(layout){
    if(!layout||!Number.isInteger(layout.rows)||layout.rows<1||layout.rows>256||!Number.isInteger(layout.cols)||layout.cols<2||layout.cols>512)fail('INVALID_LAYOUT','Invalid board dimensions.');
    kindChecked(layout.kind);
    const interval=range=>range&&Number.isInteger(range.start)&&Number.isInteger(range.end)&&range.start>=0&&range.end<=layout.cols&&range.start<range.end;
    if(!interval(layout.left)||!interval(layout.right)||layout.left.end>layout.right.start||layout.left.end-layout.left.start!==layout.right.end-layout.right.start)fail('INVALID_LAYOUT','Player column ranges must be disjoint and equal width.');
    // Extracted maps carry their own deployment geometry. A Boss's visual
    // footprint is not a rectangular ban on all five columns it overlaps.
    if(layout.kind==='boss'&&(!interval(layout.center)||(layout.sourceGeometry!==true&&layout.center.end-layout.center.start!==5)||layout.left.end!==layout.center.start||layout.right.start!==layout.center.end))fail('INVALID_LAYOUT','Boss layout needs an explicit central interval between its sides.');
    return layout;
  }
  function unitId(id){if((typeof id!=='string'||!id||id.length>128)&&(typeof id!=='number'||!Number.isSafeInteger(id)||id<0))fail('INVALID_UNIT','Unit ID must be a nonempty string or nonnegative integer.');return id;}
  function entityId(owner,id){playerId(owner);unitId(id);return JSON.stringify([owner,typeof id,id]);}
  function clone(value){try{return structuredClone(value);}catch{fail('INVALID_UNIT','Units must contain serializable data.');}}
  function direction(dir,mirrored){
    if(!['up','down','left','right'].includes(dir))fail('INVALID_DIRECTION','Direction must be up, down, left or right.');
    return mirrored?({left:'right',right:'left',up:'up',down:'down'})[dir]:dir;
  }
  function cellChecked(row,col,layout,range){if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=layout.rows||col<range.start||col>=range.end)fail('INVALID_CELL','Unit must be in its player deployment columns.');}
  function toWorldUnit(unit,seat,layout){
    seatChecked(seat);layoutChecked(layout);
    if(!unit||typeof unit!=='object')fail('INVALID_UNIT','Unit must be an object.');
    unitId(unit.id);
    for(const key of ['playerId','unitId','side'])if(Object.hasOwn(unit,key))fail('INVALID_UNIT','Local unit contains reserved ownership fields.');
    cellChecked(unit.row,unit.col,layout,layout.left);
    const mirrored=seat.side==='right'&&layout.kind==='boss',offset=unit.col-layout.left.start;
    const col=seat.side==='left'?unit.col:mirrored?layout.right.end-1-offset:layout.right.start+offset;
    const out={...clone(unit),id:entityId(seat.playerId,unit.id),unitId:unit.id,playerId:seat.playerId,side:seat.side,col,dir:direction(unit.dir,mirrored)};
    if(unit.tacticalPlacement){const p=unit.tacticalPlacement;cellChecked(p.row,p.col,layout,layout.left);out.tacticalPlacement={row:p.row,col:seat.side==='left'?p.col:mirrored?layout.right.end-1-(p.col-layout.left.start):layout.right.start+p.col-layout.left.start,dir:direction(p.dir,mirrored)};}
    return out;
  }
  function toLocalUnit(unit,seat,layout){
    seatChecked(seat);layoutChecked(layout);
    if(!unit||unit.playerId!==seat.playerId||unit.side!==seat.side||unit.id!==entityId(seat.playerId,unit.unitId))fail('OWNER_MISMATCH','Unit does not belong to this battlefield seat.');
    cellChecked(unit.row,unit.col,layout,layout[seat.side]);
    const mirrored=seat.side==='right'&&layout.kind==='boss';
    const col=seat.side==='left'?unit.col:layout.left.start+(mirrored?layout.right.end-1-unit.col:unit.col-layout.right.start);
    const out={...clone(unit),id:unit.unitId,col,dir:direction(unit.dir,mirrored)};
    if(unit.tacticalPlacement){const p=unit.tacticalPlacement;cellChecked(p.row,p.col,layout,layout[seat.side]);out.tacticalPlacement={row:p.row,col:seat.side==='left'?p.col:layout.left.start+(mirrored?layout.right.end-1-p.col:p.col-layout.right.start),dir:direction(p.dir,mirrored)};}
    delete out.unitId;delete out.playerId;delete out.side;return out;
  }
  function buildBattleInput(group,players,layout,{isDeployable}={}){
    groupChecked(group);playersChecked(players);layoutChecked(layout);
    if(group.kind!==layout.kind)fail('INVALID_LAYOUT','Battlefield and geometry topology differ.');
    if(isDeployable!=null&&typeof isDeployable!=='function')fail('INVALID_LAYOUT','Deployment validator must be a function.');
    const units=[],occupied=new Set(),memberIds=new Set(group.seats.map(s=>s.playerId));
    for(const seat of group.seats){
      const p=players.find(x=>x.id===seat.playerId);if(!p||!alive(p))fail('INACTIVE_PLAYER','Assigned player is missing or eliminated.');
      if(!Array.isArray(p.units)||p.units.length>64)fail('INVALID_UNITS','Player units must be an array with at most 64 entries.');
      const ids=new Set();
      for(const unit of p.units){
        if(!unit||typeof unit!=='object')fail('INVALID_UNIT','Unit must be an object.');
        const id=entityId(p.id,unit.id);if(ids.has(id))fail('DUPLICATE_UNIT','A player owns each unit ID only once.');ids.add(id);
        if(unit.row==null&&unit.col==null)continue;
        const world=toWorldUnit(unit,seat,layout),key=world.row+','+world.col;
        if(occupied.has(key))fail('COLLISION','Two units occupy the same deployment cell.');
        if(isDeployable&&!isDeployable(world.row,world.col,world))fail('INVALID_CELL','Source terrain rejects this deployment.');
        occupied.add(key);units.push(world);
      }
    }
    return {battleId:group.id,kind:group.kind,topology:topology(group.kind),seats:clone(group.seats),units,observerPlayerIds:players.filter(p=>!memberIds.has(p.id)).map(p=>p.id).sort()};
  }
  function viewingSeats(pairing,viewerId){
    playerId(viewerId);if(!pairing||!Array.isArray(pairing.groups))fail('INVALID_GROUP','Pairing must contain battlefield groups.');
    return pairing.groups.map(group=>{groupChecked(group);const own=group.seats.find(s=>s.playerId===viewerId);return {battleId:group.id,kind:group.kind,side:own?.side||'overview',canControl:!!own,seats:clone(group.seats)};});
  }
  function jointDefenseGroup(group,players){
    groupChecked(group);playersChecked(players);
    if(group.kind!=='joint-defense')fail('INVALID_KIND','Boss battles have no joint-defense stage.');
    const eligible=[];
    for(const seat of [...group.seats].sort((a,b)=>a.side===b.side?0:a.side==='left'?-1:1)){
      const player=players.find(p=>p.id===seat.playerId);
      if(!player||!Number.isSafeInteger(player.leakCount)||player.leakCount<0)fail('INVALID_RESULT','Joint defense needs each member\'s settled leak count.');
      if(alive(player)&&player.leakCount===0)eligible.push(player.id);
    }
    if(!eligible.length)return null;
    return {...clone(group),seats:eligible.map((id,index)=>({playerId:id,side:index?'right':'left'}))};
  }
  return {pairAlivePlayers,buildBattleInput,toWorldUnit,toLocalUnit,viewingSeats,jointDefenseGroup,entityId};
});
