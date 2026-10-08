'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const f=require('./_browser_fixture')();f.ctx.assert=assert;
async function main(){
 await f.run('initMode()');
 f.run(`
 setSetupSeason('act2autochess');curDiff='extreme';chooseBand('band_justin');
 const item=G.equipInv.find(e=>e.id==='eff_acarm123');
 assert.ok(item,'Justin first-round reward follows the real strategy hook');
 assert.equal(item.name,'骑士储蓄罐');assert.equal(item.kind,'use');assert.equal(item.tier,1);
 assert.ok(renderEquipmentDetail(item).includes('1~6'));
 assert.ok(!renderEquipmentDetail(item).includes('chess_item_3_12'));
 assert.equal(equipIconPath(item.name),'equip_icons/'+encodeURIComponent('竞技投币机')+'.png');
 const uid=item.uid,money=G.money;onEquipBenchClick(uid);
 assert.equal(G.money,money);assert.ok(G.equipInv.some(e=>e.uid===uid),'click only opens details');
 onEquipDeploy(uid,-1,0);assert.equal(G.money,money);
 addOperator('char_102_texas',false);const op=G.ops.at(-1);op.equip=[{id:'equipped-left'},{id:'equipped-right'}];
 const slots=JSON.stringify(op.equip);onEquipDeploy(uid,op.id,0);
 assert.ok(G.money>=money+1&&G.money<=money+6);assert.equal(JSON.stringify(op.equip),slots,'consumable does not replace either occupied slot');
 assert.ok(!G.equipInv.some(e=>e.uid===uid));const usedMoney=G.money;onEquipDeploy(uid,op.id,0);assert.equal(G.money,usedMoney,'replayed drag cannot grant twice');
 op.equip=[];
 // Both source variants resolve their own effect ID and reward bounds.
 const originalRandom=gameRandom;
 for(const [id,minimum,maximum]of [['chess_item_3_12_e_a',1,6],['chess_item_3_12_e_b',2,12]])for(const [random,expected]of [[0,minimum],[.999999,maximum]]){
  rewardTrap(id);const e=G.equipInv.at(-1),before=G.money;gameRandom=()=>random;
  onEquipDeploy(e.uid,op.id,0);gameRandom=originalRandom;assert.equal(G.money,before+expected);
 }
 // A second source equipment reward must not become a deployable global buff.
 rewardTrap('chess_item_3_04_e_a');const dagger=G.equipInv.at(-1);
 assert.equal(dagger.name,'炎国短刀');assert.equal(dagger.kind,'reactive');assert.equal(dagger.id,'eff_acarm040');assert.equal(dagger.effectId,'eff_acarm040');assert.deepEqual(dagger.mods,{},'skill stacks start without a permanent attack bonus');G.equipInv=[];
 // Keep an already-owned legacy reward when loading a previous rest save.
 const legacy={uid:G.nextId++,id:'chess_item_3_12_e_a',charId:'trap_1123_acarm123',effectId:'eff_acarm123',name:'chess_item_3_12_e_a',mods:{},tier:1,kind:'trap'};
 G.equipInv.push(legacy);const saved=encodeRestSave(),balance=G.money,rng=JSON.stringify(ArkSim.snapshot());
 localStorage.setItem(RUN_SAVE_KEY,saved);assert.equal(loadRestRun(),true);
 const restored=G.equipInv.find(e=>e.uid===legacy.uid);assert.ok(restored);assert.equal(restored.name,'骑士储蓄罐');assert.equal(restored.id,'eff_acarm123');assert.equal(restored.kind,'use');
 assert.equal(G.money,balance);assert.equal(JSON.stringify(ArkSim.snapshot()),rng,'migration grants nothing and draws no random number');
 G.equipInv=[];for(const round of [2,3,4,7,10]){applyBandOnRound('band_justin',round);assert.equal(G.equipInv.length,[2,3].includes(round)?0:[4,7,10].indexOf(round)+1);}
 `);
 const icon=fs.readFileSync(path.join(__dirname,'../web',decodeURIComponent(f.run("equipIconPath('骑士储蓄罐')"))));
 assert.equal(icon.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const {createPlayerRuntime}=require('./lib/room-game-runtime');
 const p=await createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_multi_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_justin'},{seed:11,name:'储蓄罐测试'});
 try{
  const initial=p.snapshot(),item=initial.session.equipInv.find(e=>e.id==='eff_acarm123');assert.ok(item);assert.equal(item.kind,'use');
  assert.equal(p.command('game/use-equip',{equipId:item.uid}).ok,false);
  const index=initial.session.shop.findIndex(x=>x?.type==='op');assert.ok(index>=0);
  assert.equal(p.command('game/buy',{index}).ok,true);const ready=p.snapshot(),unitId=ready.session.ops[0].id;
  const result=p.command('game/equip',{equipId:item.uid,unitId,slot:0});assert.equal(result.ok,true);
  assert.ok(result.state.session.money>=ready.session.money+1&&result.state.session.money<=ready.session.money+6);
  assert.ok(!result.state.session.equipInv.some(e=>e.uid===item.uid));
  p.restore(ready);const replay=p.command('game/equip',{equipId:item.uid,unitId,slot:0});
  assert.equal(replay.state.session.money,result.state.session.money);assert.deepEqual(replay.state.rng,result.state.rng);
 }finally{p.dispose();}
 console.log('ITEMS OK: Justin schedule, correct name/icon/type, targeted consumption, both reward bounds, no replay, legacy save repair and authoritative room/RNG restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
