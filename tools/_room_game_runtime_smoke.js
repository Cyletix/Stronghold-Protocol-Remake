'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
// Expose the private VM only in this in-memory test copy. Production has no
// debug/patch/advance-round API. Fixtures below use the actual rules to reach
// future preparation phases without enabling server-side battle progression.
const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
const marker='return Object.freeze({fingerprint,config:';
assert.equal(source.split(marker).length,2,'test-only VM access point remains explicit');
const testModule=new Module(filename,module);testModule.filename=filename;testModule.paths=Module._nodeModulePaths(path.dirname(filename));
testModule._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
const {createPlayerRuntime,catalogInfo}=testModule.exports;
const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'};
// Isolated deployable fixture; source trapChessDataDict also contains equipment.
const trapFixture="G.equipInv.push({uid:G.nextId++,id:'fixture_trap',charId:'trap_1040_acarm040',effectId:'fixture_effect',name:'装置测试',mods:{},tier:1,kind:'trap'});refreshBoard()";
const state=x=>{const {auth,...s}=x;return s;};
const created=[];
async function player(c=config,seed=123){const p=await createPlayerRuntime(c,{seed,name:'运营测试'});created.push(p);return p;}
function accepted(p,type,payload={}){const r=p.command(type,payload);assert.equal(r.ok,true,type+': '+JSON.stringify(r.error));assert.equal(r.revision,r.state.revision);return r.state;}
function rejected(p,type,payload={},code){const before=p.snapshot(),r=p.command(type,payload);assert.equal(r.ok,false,type+' must be rejected');if(code)assert.equal(r.error.code,code);assert.deepEqual(p.snapshot(),before,'failure must preserve G, money, RNG, pending choices, board and revision');return r;}
async function main(){
  const info=await catalogInfo();assert.match(info.catalog,/^[0-9a-f]{16}$/);assert.equal(info.schemaVersion,1);
  assert.ok(info.seasons.every(s=>['single','multi','training'].every(kind=>s.modes.some(m=>m.kind===kind))));
  const copy=await catalogInfo();copy.seasons.length=0;assert.ok((await catalogInfo()).seasons.length,'catalog responses are detached');
  for(const bad of [{...config,modeId:'mode_unknown'},{...config,seasonId:'missing'},{...config,mapKey:'missing'},{...config,bandId:'missing'}])await assert.rejects(createPlayerRuntime(bad),e=>e.code==='INVALID_CONFIG');
  await assert.rejects(createPlayerRuntime({...config,money:999}),e=>e.code==='INVALID_PAYLOAD');
  await assert.rejects(createPlayerRuntime(config,{seed:-1}),e=>e.code==='INVALID_PAYLOAD');
  await assert.rejects(createPlayerRuntime(config,{name:''}),e=>e.code==='INVALID_CONFIG');
  const p=await player(),twin=await player(),other=await player(config,124),initial=p.snapshot();
  assert.equal(p.fingerprint,info.catalog);assert.deepEqual(state(twin.snapshot()),state(initial),'same real catalog/config/seed is deterministic');
  assert.notDeepEqual(other.snapshot().rng,initial.rng);assert.equal(initial.session.money,4,'the actual opening economy is used');
  assert.equal(initial.context.curMatch,'team');assert.deepEqual(initial.context.TEAM_AI,[],'do not invent teammates');
  assert.equal(initial.session.shop.length,3);assert.ok(initial.session.shop.every(x=>x.entry&&x.cost===2));
  const placement=initial.ui.deploymentCells,hasCell=(cells,row,col)=>cells.some(c=>c.row===row&&c.col===col);
  assert.ok(hasCell(placement,6,3));assert.ok(!hasCell(placement,6,11),'adjoining field is not advertised as deployable');
  assert.ok(!hasCell(placement,13,4),'offscreen Boss section is excluded');assert.ok(!hasCell(placement,11,4),'candidate cells are not battlefield cells');
  const tampered=structuredClone(initial);tampered.session.money=1000;assert.throws(()=>p.restore(tampered),e=>e.code==='INVALID_SNAPSHOT');
  assert.throws(()=>p.restore(twin.snapshot()),e=>e.code==='INVALID_SNAPSHOT','other player checkpoint cannot be restored');
  assert.throws(()=>p.restore({...initial,unknown:1}),e=>e.code==='INVALID_PAYLOAD');
  assert.deepEqual(p.snapshot(),initial);
  const detached=p.snapshot();detached.session.money=999;detached.session.shop[0].entry.name='changed';assert.deepEqual(p.snapshot(),initial);
  const vm=p.__testMachine;
  await assert.rejects(vm.context.fetch('../source_battles.json'),e=>e.code==='LOCAL_ASSET_ONLY');
  await assert.rejects(vm.context.fetch('https://example.com/leak.json'),e=>e.code==='LOCAL_ASSET_ONLY');
  await assert.rejects(vm.context.fetch('mode.js'),e=>e.code==='LOCAL_ASSET_ONLY');
  assert.equal(vm.run('typeof require'), 'undefined');assert.equal(vm.run('typeof process'),'undefined');
  assert.throws(()=>vm.run('Function("return 1")()'),/Code generation/);
  for(const [type,payload]of [
    ['game/start',{}],['game/debug-gold',{}],['game/debug-skip',{}],['game/debug-add',{charId:'char_002_amiya'}],['session/patch',{money:99}],['game/buy',{index:0,playerId:'other'}],['game/buy',{index:'0'}],
    ['game/buy',{index:-1}],['game/buy',{index:999}],['game/deploy',{unitId:1,row:6,col:4,dir:'north'}],
    ['game/sell',{unitId:999}],['game/sell',{unitId:1,amount:100}],['game/recall',{unitId:1,row:11}],
    ['game/freeze',{frozen:true}],['game/equip',{unitId:1,equipId:2,slot:2}]
  ])rejected(p,type,payload);
  rejected(p,'game/upgrade',{},'COMMAND_REJECTED');
  accepted(p,'game/freeze');assert.equal(p.snapshot().session.frozen,true);assert.deepEqual(twin.snapshot(),{...initial,auth:twin.snapshot().auth},'another player is unchanged');
  assert.deepEqual(p.restore(JSON.parse(JSON.stringify(initial))),initial,'checkpoint round trip is exact');
  accepted(p,'game/buy',{index:0});accepted(p,'game/buy',{index:0});
  let s=p.snapshot();assert.equal(s.session.money,0);assert.equal(s.session.ops.length,2);assert.equal(s.session.shop.length,1);
  rejected(p,'game/buy',{index:0},'COMMAND_REJECTED');rejected(p,'game/refresh',{},'COMMAND_REJECTED');
  const [a,b]=s.session.ops;
  for(const cell of [{row:13,col:4},{row:0,col:4},{row:6,col:11},{row:6,col:16},{row:11,col:4}])rejected(p,'game/deploy',{unitId:a.id,...cell,dir:'left'},'INVALID_CELL');
  accepted(p,'game/deploy',{unitId:a.id,row:6,col:3,dir:'left'});
  rejected(p,'game/deploy',{unitId:b.id,row:6,col:3,dir:'right'},'OCCUPIED');
  accepted(p,'game/deploy',{unitId:b.id,row:6,col:4,dir:'up'});
  assert.deepEqual(p.snapshot().ui.deploymentCells,placement,'occupied cells remain in the static ownership/terrain set');
  accepted(p,'game/move',{unitId:a.id,row:6,col:4,dir:'down'});
  s=p.snapshot();assert.equal(s.session.ops.find(x=>x.id===a.id).col,4);assert.equal(s.session.ops.find(x=>x.id===b.id).col,3);assert.equal(s.session.ops.find(x=>x.id===b.id).dir,'up','swap preserves the other unit direction');
  accepted(p,'game/rotate',{unitId:a.id,dir:'right'});assert.equal(p.snapshot().session.ops.find(x=>x.id===a.id).dir,'right');
  const beforeTrapCollision=p.snapshot();vm.run(trapFixture);
  const blockedTrap=p.snapshot().session.equipInv[0].uid;
  rejected(p,'game/deploy-trap',{equipId:blockedTrap,row:6,col:4,dir:'up'},'OCCUPIED');
  rejected(p,'game/deploy-trap',{equipId:blockedTrap,row:6,col:11,dir:'up'},'INVALID_CELL');
  rejected(p,'game/deploy-trap',{equipId:blockedTrap,row:13,col:4,dir:'up'},'INVALID_CELL');
  assert.deepEqual(p.snapshot().ui.deploymentCells,placement);p.restore(beforeTrapCollision);
  accepted(p,'game/bench-recall',{unitId:a.id,row:11,col:2});
  accepted(p,'game/recall',{unitId:b.id});
  accepted(p,'game/bench-move',{unitId:b.id,row:11,col:2});
  s=p.snapshot();assert.equal(s.session.ops.find(x=>x.id===b.id).bench.col,2);assert.notEqual(s.session.ops.find(x=>x.id===a.id).bench.col,2);
  rejected(p,'game/bench-move',{unitId:b.id,row:18,col:2},'INVALID_CELL');
  accepted(p,'game/sell',{unitId:a.id});assert.equal(p.snapshot().session.money,vm.run('shopPriceInfo(1,false).chessSoldPrice'));
  rejected(p,'game/sell',{unitId:a.id},'NOT_OWNED');
  assert.deepEqual(twin.snapshot().session,initial.session,'same numeric unit IDs in different VMs never share state');

  // Real refresh can consume a random free-refresh draw before finding that
  // funds are insufficient. A rejected operation must undo that draw too.
  vm.run('G.activeBonds={miraShip:1};G.money=0;ArkSim.seed(1)');
  rejected(p,'game/refresh',{},'COMMAND_REJECTED');
  vm.run('G.money=4');const saved=p.snapshot(),refreshed=accepted(p,'game/refresh');
  p.restore(saved);assert.deepEqual(accepted(p,'game/refresh'),refreshed,'rollback and replay preserves shop and RNG');
  vm.run('window.__testGenShop=genShop;genShop=function(){gameRandom();throw new Error("injected generation failure")};G.money=4');
  rejected(p,'game/refresh',{},'RULE_ERROR');vm.run('genShop=window.__testGenShop');

  // Compare dispatcher execution with the exact native functions in an
  // independently initialized VM, including real strategy initial grants.
  const oracle=twin.__testMachine;
  p.restore(initial);const r=accepted(p,'game/buy',{index:0});
  oracle.run('buyShop(0)');assert.deepEqual(r.session,JSON.parse(oracle.run('JSON.stringify(G)')));assert.deepEqual(r.rng,JSON.parse(oracle.run('JSON.stringify(ArkSim.snapshot())')));
  vm.run('startRound(2)');oracle.run('startRound(2)');
  accepted(p,'game/upgrade');oracle.run('upgradeShop()');assert.equal(p.snapshot().session.level,1);assert.equal(p.snapshot().session._upgradeConfirm,true);
  const beforeCancel=p.snapshot();accepted(p,'game/cancel-upgrade');assert.equal(p.snapshot().session._upgradeConfirm,false);assert.equal(p.snapshot().session.money,beforeCancel.session.money);
  accepted(p,'game/cancel-upgrade');accepted(p,'game/upgrade');assert.equal(p.snapshot().session.level,1,'canceled confirmation must require two clicks again');
  const confirm=p.snapshot();accepted(p,'game/upgrade');oracle.run('upgradeShop()');
  assert.equal(p.snapshot().session.level,2);assert.deepEqual(p.snapshot().session,JSON.parse(oracle.run('JSON.stringify(G)')));
  p.restore(confirm);accepted(p,'game/upgrade');assert.deepEqual(p.snapshot().session,JSON.parse(oracle.run('JSON.stringify(G)')),'pending upgrade checkpoint restores without double charge');

  // Equipment, including a half-filled two-slot array, must survive snapshots.
  vm.run('rewardEquip();refreshBoard()');s=p.snapshot();const opId=s.session.ops[0].id,eq=s.session.equipInv[0];
  accepted(p,'game/equip',{unitId:opId,equipId:eq.uid,slot:0});s=p.snapshot();
  assert.equal(s.session.ops[0].equip[0].uid,eq.uid);assert.equal(s.session.ops[0].equip[1],null);
  assert.deepEqual(p.restore(JSON.parse(JSON.stringify(s))),s,'network snapshot accepts real empty equipment slots');
  rejected(p,'game/equip',{unitId:opId,equipId:eq.uid,slot:0},'NOT_OWNED');
  accepted(p,'game/sell',{unitId:opId});assert.equal(p.snapshot().session.equipInv.length,1,'native sell returns equipped items');
  accepted(p,'game/sell-equip',{equipId:p.snapshot().session.equipInv[0].uid});
  // Source use-item fixture: the actual event grants one coin and destroys it.
  vm.run("const coinItem=SPECIAL_EQUIP_EVENTS.find(e=>e.id==='eff_acarm066');G.equipInv.push({uid:G.nextId++,id:coinItem.id,name:coinItem.name,kind:'use',mods:{},tier:1});refreshBoard()");
  const usable=p.snapshot(),useId=usable.session.equipInv[0].uid;
  rejected(p,'game/use-equip',{equipId:useId},'TARGET_REQUIRED');
  vm.run("addOperator('char_102_texas',false);refreshBoard()");
  const useTarget=p.snapshot().session.ops[0].id;
  accepted(p,'game/equip',{equipId:useId,unitId:useTarget,slot:0});assert.equal(p.snapshot().session.money,usable.session.money+1);assert.equal(p.snapshot().session.equipInv.length,0);
  rejected(p,'game/equip',{equipId:useId,unitId:useTarget,slot:0},'NOT_OWNED');
  vm.run(trapFixture);s=p.snapshot();const trap=s.session.equipInv[0];assert.equal(trap.kind,'trap');
  accepted(p,'game/deploy-trap',{equipId:trap.uid,row:6,col:3,dir:'up'});assert.equal(p.snapshot().traps[0].uid,trap.uid);
  assert.deepEqual(p.snapshot().ui.deploymentCells,placement,'deployed traps do not erase static field ownership');
  accepted(p,'game/refresh');assert.equal(p.snapshot().traps[0].uid,trap.uid,'board refresh must retain deployed traps');

  // Source special preparation, not a fabricated first-round decision.
  vm.run('startRound(3)');s=p.snapshot();assert.equal(s.ui.decisionPending,true);assert.equal(s.session.sourceIsSpPrepare,true);
  const decisionId=s.session._decisionOffer.options[0].id;
  rejected(p,'game/buy',{index:0},'CHOICE_REQUIRED');rejected(p,'game/decision-confirm',{id:decisionId},'CHOICE_MISMATCH');
  accepted(p,'game/decision-preview',{id:decisionId});const choice=p.snapshot();
  assert.equal(choice.ui.decisionSelection.id,decisionId);const chosen=accepted(p,'game/decision-confirm',{id:decisionId});
  assert.equal(chosen.ui.decisionPending,false);assert.equal(chosen.ui.decisionResolvedRound,3);
  p.restore(choice);assert.deepEqual(accepted(p,'game/decision-confirm',{id:decisionId}),chosen,'pending decision restore grants once with the same random item');
  rejected(p,'game/decision-confirm',{id:decisionId});

  // Three actual duplicate acquisitions enter the native promotion reward shop.
  vm.run("G.ops=[];const rewardChar=ROSTER_LIST.find(o=>o.tier===1).charId;addOperator(rewardChar,false);addOperator(rewardChar,false);addOperator(rewardChar,false);refreshBoard()");
  const reward=p.snapshot();assert.ok(reward.session._mergeReward);assert.ok(reward.session.ops[0].elite);assert.ok(reward.session.shop.every(x=>x.cost===0));
  rejected(p,'game/buy',{index:0},'CHOICE_REQUIRED');rejected(p,'game/merge-reward',{index:999});
  const taken=accepted(p,'game/merge-reward',{index:0});p.restore(reward);assert.deepEqual(accepted(p,'game/merge-reward',{index:0}),taken,'promotion choice is snapshot-safe without save.js pending-choice prohibition');

  const discount=await player({...config,bandId:'band_sciurus'}),dvm=discount.__testMachine;
  dvm.run("const b=runBandEffects().find(b=>b.bandId===G.band).mechs[0],bond=bbStr(b.bb,'bond'),e=ROSTER_LIST.find(e=>bandBondsOf(e).includes(bond));G.shop=[{type:'op',entry:e,cost:20}];G.money=0;G._firstBuyUsed=false");
  rejected(discount,'game/buy',{index:0},'COMMAND_REJECTED');assert.equal(discount.snapshot().session._firstBuyUsed,false,'failed native discounted buy cannot consume its one-time discount');
  const lee=await player({...config,bandId:'band_lmlee'});assert.equal(lee.snapshot().session.money,0,'source strategy opening overrides are reused');
  const second=await player({...config,seasonId:'act2autochess',modeId:'mode_multi_abyss',mapKey:'activities/act2autochess/level_act2autochess_m01'});
  assert.equal(second.snapshot().session.seasonId,'act2autochess');assert.equal(second.snapshot().context.curDiff,'ultimate');
  assert.ok(second.snapshot().ui.deploymentCells.some(c=>second.__testMachine.run('BDATA.level.buildable['+c.row+']['+c.col+']')==='RANGED'),'static cell set includes source high ground; unit-type checks remain separate');
  second.__testMachine.run(`G.ops=['MELEE','RANGED'].map((position,i)=>{const entry=ROSTER_LIST.find(e=>e.position===position);return {id:i+1,charId:entry.charId,entry,equip:[],row:null,col:null,dir:'up'};});refreshBoard();`);
  rejected(second,'game/deploy',{unitId:1,row:6,col:4,dir:'up'},'INVALID_CELL');
  accepted(second,'game/deploy',{unitId:2,row:6,col:4,dir:'up'});
  accepted(second,'game/deploy',{unitId:1,row:9,col:4,dir:'up'});
  rejected(second,'game/move',{unitId:1,row:6,col:4,dir:'up'},'INVALID_CELL');
  rejected(second,'game/move',{unitId:2,row:9,col:4,dir:'up'},'INVALID_CELL');
  second.__testMachine.run('G._deployBonus=2-deployLimit()');
  accepted(second,'game/move',{unitId:1,row:9,col:7,dir:'right'});
  second.__testMachine.run('G._deployBonus=0');
  for(const runtime of [p,second]){
    const sid=runtime.snapshot().session.seasonId,raw=require('../data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json').activity.AUTOCHESS_SEASON[sid];
    const expected=Object.values(raw.charShopChessDatas).filter(s=>!s.isHidden&&['PRESET','NORMAL'].includes(s.chessType));
    const actual=JSON.parse(runtime.__testMachine.run('JSON.stringify(ROSTER_LIST.map(e=>({id:e.charId,chessId:e.chessId,tier:e.tier,skill:validSkillIndex(e.charId)})))'));
    assert.equal(actual.length,expected.length,sid+' authority roster size');
    for(const s of expected){const e=actual.find(e=>e.id===s.charId);assert.ok(e,sid+' '+s.charId);assert.equal(e.chessId,s.chessId);assert.equal(e.tier,s.chessLevel);assert.equal(e.skill,s.defaultSkillIndex);}
    assert.ok(runtime.snapshot().session.shop.filter(x=>x?.entry).every(x=>x.entry.seasonId===sid),sid+' authority snapshot entries');
  }
  assert.ok(created.every(p=>p.snapshot().session.phase==='rest'),'no preparation action starts a battle or advances the clock');
  const final=p.snapshot();assert.equal(final.session.runElapsed,0);assert.equal(final.session.prepareRemaining,final.session.prepareLimit);
  second.__testMachine.run('startRound(3)');const timed=second.snapshot();assert.equal(timed.ui.decisionPending,true);
  const timedId=timed.session._decisionOffer.options[1].id;
  second.advance(8);assert.equal(second.snapshot().session._decisionRemaining,7);
  accepted(second,'game/decision-preview',{id:timedId});const checkpoint=second.snapshot();
  const untouched=twin.snapshot();second.advance(7);const expired=second.snapshot();
  assert.equal(expired.ui.decisionPending,false);assert.equal(expired.ui.decisionResolvedRound,3);
  assert.equal(expired.session.prepareRemaining,timed.session.prepareRemaining,'choice countdown does not consume preparation time');
  assert.deepEqual(twin.snapshot(),untouched,'one player timer does not advance another player');
  second.restore(checkpoint);second.advance(7);assert.deepEqual(second.snapshot(),expired,'reconnecting restores remaining selection time and grants exactly once');
  p.dispose();assert.throws(()=>p.snapshot(),e=>e.code==='RUNTIME_DISPOSED');
  console.log('ROOM GAME RUNTIME OK: real mode rules, both seasons, isolated players/RNG, strict commands and ownership, atomic failures, preparation placement, equipment/traps, and exact pending-choice restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>created.forEach(p=>p.dispose()));
