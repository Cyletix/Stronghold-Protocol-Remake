'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const pairs=require('../web/src/simulation/paired-battle');
const filename=path.join(__dirname,'lib/room-game-runtime.js'),source=fs.readFileSync(filename,'utf8');
const marker='return Object.freeze({fingerprint,config:';
assert.equal(source.split(marker).length,2);
const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
injected._compile(source.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
const config={seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},created=[];
async function player(seed=133,c=config){const p=await injected.exports.createPlayerRuntime(c,{seed,name:'战斗测试'});created.push(p);return p;}
function command(p,type,payload={}){const result=p.command(type,payload);assert.equal(result.ok,true,JSON.stringify(result.error));return result;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function main(){
  const medical=await player();medical.startBattle();
  medical.__testMachine.run(`{
    B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];B.enemies=[];
    const entry=ROSTER.char_108_silent,stats=finalizeOperator(entry,null,[],false);
    B.operators=[{...stats,id:1,charId:entry.charId,profession:'MEDIC',position:'RANGED',row:5,col:5,hp:stats.maxHp,cd:0,sp:0,buffs:[],cells:[[5,6]],deployed:true,_garrisonStarted:true,skill:null},
      {id:2,charId:'test',row:5,col:6,hp:100,maxHp:9999,cd:999,deployed:true,_garrisonStarted:true}];
  }`);
  const beforeMedical=medical.snapshot();medical.advance(.1);const healedMedical=medical.snapshot();
  assert.ok(healedMedical.battle.operators[1].hp>100);assert.equal(healedMedical.battle.projectiles.length,0);
  assert.ok(healedMedical.battle.combatEffects.some(e=>e.kind==='heal'),'green healing feedback is in authoritative snapshot');
  medical.restore(beforeMedical);medical.advance(.1);assert.deepEqual(medical.snapshot().battle,healedMedical.battle,'healing/cooldown/effects remain deterministic across authenticated restore');
  // Bomb payload, countdown and impact survive a real authenticated checkpoint.
  const bomber=await player();bomber.startBattle();
  bomber.__testMachine.run(`{
    const base=Object.values(SOURCE_BATTLES.levels).map(l=>l.enemies.enemy_1040_bombd).find(Boolean);
    B.waveScheduler=null;B.spawn=[{at:999,enemyId:'unused',route:0}];
    B.operators=[{id:1,charId:'char_002_amiya',row:3,col:3,hp:10000,maxHp:10000,def:50,atk:0,cd:999,deployT:5,deployed:true,deployAt:0,events:[]}];
    const e={...base,x:3,y:2,hp:base.maxHp,route:-1,cd:0,dead:false,visualId:77};setupEnemy(e,base);B.enemies=[e];
  }`);
  bomber.advance(.8);const airborne=bomber.snapshot();assert.equal(airborne.battle.projectiles.length,1);assert.equal(airborne.battle.projectiles[0].kind,'bomb');
  bomber.advance(.5);const impacted=bomber.snapshot();assert.equal(impacted.battle.combatEffects.length,1);assert.ok(impacted.battle.operators[0].hp<10000);
  bomber.restore(JSON.parse(JSON.stringify(airborne)));bomber.advance(.5);const replayed=bomber.snapshot();
  assert.equal(replayed.battle.operators[0].hp,impacted.battle.operators[0].hp);assert.deepEqual(replayed.battle.combatEffects,impacted.battle.combatEffects);assert.deepEqual(replayed.battle.damageFeedback,impacted.battle.damageFeedback);
  bomber.advance(5);assert.equal(bomber.snapshot().battle.operators[0].hp,replayed.battle.operators[0].hp,'restore cannot re-arm a spent bomber');
  const p=await player(),q=await player();
  const openingLimit=p.status().prepareRemaining;p.advance(2);close(p.status().prepareRemaining,openingLimit-2);assert.equal(p.status().phase,'rest');
  p.advance(30);p.advance(30);p.advance(30);assert.equal(p.status().prepareRemaining,0);assert.equal(p.status().phase,'rest','room controller owns auto-start');
  p.startBattle();q.startBattle();
  p.advance(1);q.advance(.25);q.advance(.25);q.advance(.5);
  close(p.status().realTime,1);close(p.status().simTime,2);close(p.snapshot().battle.dpProgress,0);
  assert.deepEqual(p.snapshot().battle,q.snapshot().battle,'fixed ticks do not depend on transport/host batch size');
  assert.equal(p.command('game/freeze').error.code,'WRONG_PHASE');
  assert.throws(()=>p.advance(Infinity),e=>e.code==='INVALID_ELAPSED');assert.throws(()=>p.advance(31),e=>e.code==='INVALID_ELAPSED');
  for(let i=0;i<15&&!p.status().done;i++)p.advance(10);
  const result=p.status();assert.equal(result.done,true);assert.ok(result.leaks>0);assert.ok(result.leakedEnemies.every(e=>e.enemyId&&e.route!=null));
  const ended=p.snapshot();p.advance(10);assert.deepEqual(p.snapshot(),ended,'finished battle never advances or starts next round locally');
  p.nextRound({players:[{id:'p',life:result.life,activeBonds:result.activeBonds}],roundChoices:{2:0}});
  assert.equal(p.status().round,2);assert.equal(p.status().phase,'rest');assert.equal(p.snapshot().session.roundResults.length,1);assert.equal(p.snapshot().context.TEAM_AI.length,0);
  p.__testMachine.run('startRound(3)');const remaining=p.status().prepareRemaining;p.advance(5);assert.equal(p.status().prepareRemaining,remaining,'decision pauses preparation countdown');assert.throws(()=>p.startBattle(),e=>e.code==='CHOICE_REQUIRED');

  const fresh=await player();command(fresh,'game/buy',{index:0});command(fresh,'game/deploy',{unitId:fresh.snapshot().session.ops[0].id,row:6,col:4,dir:'left'});fresh.startBattle();
  const opening=fresh.battleInput('fresh');
  fresh.__testMachine.run('Object.assign(B.operators[0],{atk:999999,stunUntil:99999,deployed:true,skillState:{until:99999},dead:true,hp:0});B.operators.length=0;G.addLayers={test:99};B.over=true;window.onBattleEnd(true,B.shield)');
  const freshInput=fresh.battleInput('fresh');assert.deepEqual(freshInput.units,opening.units,'joint defense uses resolved opening units even after ordinary removal/buffs');
  assert.deepEqual(freshInput.session.activeBonds,opening.session.activeBonds);assert.deepEqual(freshInput.session.addLayers,opening.session.addLayers);
  const freshGroup={id:'joint:1:0',kind:'joint-defense',seats:[{playerId:'fresh',side:'left'}]};
  fresh.useSharedBattle({...pairs.buildBattleInput(freshGroup,[freshInput],freshInput.layout),owners:[freshInput],traps:[],leakedEnemies:result.leakedEnemies,seatCount:1});
  const revived=fresh.snapshot().battle.operators[0];assert.equal(revived.atk,opening.units[0].atk);assert.equal(revived.hp,revived.maxHp);assert.equal(revived.dead,false);assert.equal(revived.stunUntil,undefined);assert.equal(revived.skillState,undefined);assert.equal(revived.deployed,undefined);

  // Ordinary zero-leak defender receives real leaked enemies reset to source
  // stats and follows a fresh joined route that respects WALK terrain.
  const j=await player();j.startBattle();
  j.useSharedBattle({kind:'joint-defense',units:[],traps:[],leakedEnemies:result.leakedEnemies,seatCount:2});
  const joint=j.snapshot(),lv=joint.battleLevel;
  assert.ok(joint.battle.spawn.length);assert.equal(lv.routes[0].segs[0][0].c,18);
  for(const route of lv.routes.filter(r=>r.motion==='WALK'))for(const segment of route.segs)for(const cell of segment)assert.ok(['ALL','WALK_ONLY'].includes(lv.passable[cell.r][cell.c]),'joint path cannot cross walls');
  const beforeLife=j.status().life;
  for(let i=0;i<20&&!j.status().done;i++)j.advance(10);
  const jointResult=j.status();assert.equal(jointResult.done,true);assert.equal(j.status().life,beforeLife,'shared simulation defers persistent life deduction');
  j.finishShared({...jointResult,kind:'joint-defense'});assert.equal(j.status().life,Math.max(0,beforeLife-jointResult.lifeLoss));
  const finished=j.snapshot();j.finishShared({...jointResult,kind:'joint-defense'});assert.deepEqual(j.snapshot().session,finished.session,'shared settlement is idempotent');

  const a=await player(),b=await player(134);
  for(const p of [a,b]){
    p.alignRoundChoices({14:0});p.__testMachine.run('startRound(14)');
    assert.ok(p.snapshot().ui.deploymentCells.some(c=>c.row===13&&c.col===4),'Boss preparation exposes source left cells');
    command(p,'game/buy',{index:0});command(p,'game/deploy',{unitId:p.snapshot().session.ops[0].id,row:13,col:4,dir:'right'});
    p.startBattle();
  }
  const ai=a.battleInput('a'),bi=b.battleInput('b'),group={id:'boss:14:0',kind:'boss',seats:[{playerId:'a',side:'left'},{playerId:'b',side:'right'}]};
  const combined=pairs.buildBattleInput(group,[ai,bi],ai.layout);
  a.useSharedBattle({...combined,owners:[ai,bi],traps:[]});
  let battle=a.snapshot().battle;
  assert.equal(battle.operators.length,2);assert.notEqual(battle.operators[0].id,battle.operators[1].id);
  assert.equal(battle.operators.find(o=>o.playerId==='b').col,16);assert.equal(battle.operators.find(o=>o.playerId==='b').dir,'left');
  assert.deepEqual(a.snapshot().session.ops,ai.session.ops,'combined board never adds teammate cards to own inventory');
  assert.deepEqual(b.snapshot().session.ops,bi.session.ops);
  // Exercise a real source ADD_BOND event on the right owner's equal numeric
  // unit ID. Native recalculation must not write either owner's layers/stats
  // through the other player's ID namespace.
  a.__testMachine.run(`{
    const rule=ROSTER_LIST.flatMap(o=>o.bondGarrison||[]).find(g=>g.kind==='ADD_BOND'&&g.bb?.bond_id&&/useskill|selfkillenemy|selfdead/.test(g.bb.key||''));
    roomAssert(rule,'FIXTURE_MISSING','source garrison fixture');
    const key=rule.bb.key,trigger=/useskill/.test(key)?'skill':/selfdead/.test(key)?'dead':'kill';
    const unit=B.operators.find(o=>o.playerId==='b');unit.garrisonAdd=[rule];
    const owner=roomNetwork.owners.find(o=>o.id==='b');
    // The real rule requires an activated bond; a lone fixture unit has none.
    const ids=(rule.bb.bond_id||'').split(',');
    for(const id of ids)owner.session.activeBonds[id]=1;
    for(let i=0;i<100;i++)window.onBondGarrison(trigger,unit);
  }`);
  const owners=a.status().ownerSessions;
  assert.ok(Object.values(owners.find(x=>x.id==='b').session.addLayers).some(n=>n>0));
  assert.deepEqual(owners.find(x=>x.id==='a').session.addLayers,ai.session.addLayers);
  assert.ok(a.snapshot().battle.operators.every(o=>typeof o.id==='string'&&o.playerId),'garrison callback restores world IDs');
  a.advance(.1);assert.ok(a.status().leader,'actual source Boss spawn');
  const machine=a.__testMachine;
  machine.run('B.leader.hp=B.leader.maxHp*0.74');a.advance(1/60);assert.deepEqual(a.status().milestones.map(m=>m.percent),[25]);
  machine.run('B.leader.hp=B.leader.maxHp*0.2');a.advance(1/60);assert.deepEqual(a.status().milestones.map(m=>m.percent),[25,50,75]);
  a.advance(.1);assert.equal(a.status().milestones.length,3,'threshold notifications happen once');
  assert.ok(a.status().milestones.every(m=>m.realTime>0&&Math.abs(m.simTime-m.realTime*2)<1e-8));
  for(let i=0;i<20&&!a.status().done;i++)a.advance(10);
  const shared=a.status();assert.equal(shared.done,true);
  for(const [id,p]of [['a',a],['b',b]])p.finishShared({...shared,kind:'boss',ownerSession:shared.ownerSessions.find(x=>x.id===id)?.session});
  assert.equal(a.status().life,b.status().life);assert.equal(a.snapshot().session.roundResults.length,1);assert.equal(b.snapshot().session.roundResults.length,1);
  assert.equal(a.snapshot().session.roundResults[0].battleSeconds,b.snapshot().session.roundResults[0].battleSeconds);
  const richA=await player(501),richB=await player(502);
  for(const p of [richA,richB]){
    p.alignRoundChoices({14:0});
    p.__testMachine.run(`startRound(14);for(const [i,entry]of ROSTER_LIST.filter(o=>o.position==='RANGED'&&o.profession==='SNIPER').slice(0,2).entries()){addOperator(entry.charId,false);const op=G.ops.at(-1);op.row=15+i;op.col=8;op.dir='right';}refreshBoard()`);
    p.startBattle();
  }
  const richInputs=[richA.battleInput('ra'),richB.battleInput('rb')],richGroup={id:'rich:14',kind:'boss',seats:[{playerId:'ra',side:'left'},{playerId:'rb',side:'right'}]},rich=pairs.buildBattleInput(richGroup,richInputs,richInputs[0].layout);
  // Elevated fixture attributes shorten the test while retaining real source
  // sniper ranges, attack profiles, projectiles and enemy targeting/skills.
  rich.units=rich.units.map(o=>({...o,atk:5000,maxHp:200000}));
  richA.useSharedBattle({...rich,owners:richInputs,traps:[]});
  const projectileOwners=new Set();let enemyTargets=false,enemyProjectiles=false,snapshots=0,restoredProjectiles=false;
  const primaryMoney=richA.snapshot().session.money,peerMoney=richB.snapshot().session.money;
  for(let i=0;i<1500&&!richA.status().done;i++){
    richA.advance(1/30);const snap=richA.snapshot();snapshots++;
    assert.doesNotThrow(()=>JSON.stringify(snap));
    for(const projectile of snap.battle.projectiles){if(projectile.enemy)enemyProjectiles=true;else if(projectile.owner?.playerId)projectileOwners.add(projectile.owner.playerId);}
    enemyTargets ||= snap.battle.enemies.some(e=>e.atkTarget?.playerId||e.atkTargets?.some(t=>t.playerId));
    if(!restoredProjectiles&&snap.battle.projectiles.some(p=>p.owner?.playerId)&&snap.battle.enemies.some(e=>e.atkTarget?.playerId)){
      const references=()=>richA.__testMachine.run('B.projectiles.every(p=>(!p.target||p.target.dead||(p.enemy?B.operators:B.enemies).includes(p.target))&&(!p.owner||p.owner.dead||(p.enemy?B.enemies:B.operators).includes(p.owner)))&&B.enemies.every(e=>!e.atkTarget||B.operators.includes(e.atkTarget))&&B.enemies.includes(B.leader)');
      assert.equal(references(),true);assert.deepEqual(richA.restore(snap),snap);assert.equal(references(),true,'private checkpoint restores engine reference identity');
      assert.equal(richA.command('game/freeze').error.code,'WRONG_PHASE');assert.equal(references(),true,'late preparation command cannot detach live attack targets');
      restoredProjectiles=true;
    }
    if(richA.status().milestones.length===3&&enemyTargets&&enemyProjectiles&&projectileOwners.size===2)break;
  }
  assert.ok(snapshots>30);assert.deepEqual([...projectileOwners].sort(),['ra','rb']);assert.ok(enemyTargets);assert.ok(enemyProjectiles);assert.ok(restoredProjectiles);
  assert.deepEqual(richA.status().milestones.map(m=>m.percent),[25,50,75],'real projectile damage crosses all source Boss thresholds');
  assert.equal(richA.snapshot().session.money,primaryMoney,'combat DP and damage cannot spend shop money');assert.equal(richB.snapshot().session.money,peerMoney,'shared callbacks cannot charge the peer shop');
  const info=await injected.exports.catalogInfo();
  for(const season of info.seasons)for(const map of season.modes.find(m=>m.modeId==='mode_multi_normal').maps){
    const x=await player(18,{...config,seasonId:season.seasonId,mapKey:map.mapKey});
    x.alignRoundChoices({14:0});x.__testMachine.run('startRound(14)');x.startBattle();
    const input=x.battleInput('layout');assert.equal(input.layout.sourceGeometry,true);assert.equal(input.layout.cols,21);
    assert.ok(x.snapshot().ui.deploymentCells.every(c=>c.col<10&&c.row>=13&&c.row<17));
  }
  console.log('ROOM BATTLE RUNTIME OK: authoritative fixed 30Hz/2x, real clocks, source completion, terrain-safe joint defense with fresh units, mirrored Boss/owned units, actual two-owner projectile 25/50/75 damage, safe live-target checkpoint/late-command handling');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>created.forEach(p=>p.dispose()));
