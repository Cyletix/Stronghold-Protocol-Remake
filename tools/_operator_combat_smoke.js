'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),f=require('./_browser_fixture')();f.ctx.assert=assert;
(async()=>{
 await f.run('initMode()');
 f.run(`
 chooseBand('band_amiya');startBattleRound();window.onBattleEnd=()=>{};window.onBondGarrison=()=>{};
 function setup(cid='char_391_rosmon',skillIndex=null){
  B.over=false;B.phase='battle';B.time=0;B.roundTime=0;B.roundLimit=999;B.waveScheduler=null;B.spawn=[{at:999,enemyId:'none'}];B.enemies=[];B.projectiles=[];B.particles=[];B.summoneds=[];B.operatorZones=[];B.combatEffects=[];B.leader=null;B.leaderEnemyId=null;
  const profile=ArkAttackProfiles[cid];
  const o={id:1,charId:cid,name:cid,profession:'SNIPER',position:'RANGED',row:3,col:0,cells:[[3,1],[3,2],[3,3],[2,2]],range:3,atk:100,atkType:profile.damageType,
   attackTime:2.1,cd:0,hp:1000,maxHp:1000,def:50,blockCnt:1,events:[],buffs:[],deployed:true,deployAt:0,deployT:1,sp:0,
   basicAttack:{...profile,bb:profile.traits?.at(-1)?.bb||{},training:{evolve:2,level:1}},combatTalents:[]};
  if(skillIndex!=null){const source=SKILL_CHOICES[cid][skillIndex],v=source.normal;
   o.skill={...v,sourceId:source.skillId,name:v.name,realDesc:v.desc,blackboard:{...v.blackboard},effects:v.effects.map(e=>({...e})),ammoCount:v.durationType==='AMMO'?v.blackboard['attack@trigger_time']:null};
   ArkOperatorCombat.configure(o.skill);o.sp=o.skill.spCost;
  }
  B.operators=[o];return o;
 }
 function enemy(id,x,y=3,def=0,flying=false){const e={id,visualId:id,x,y,maxHp:10000,hp:10000,def,magicRes:0,dead:false,flying,stunUntil:999,canAttack:false,moveSpeed:0};B.enemies.push(e);return e;}
 function advance(seconds){for(let i=0;i<Math.round(seconds*30);i++)update(1/30,1/30);}
 // Actual attack -> travel -> landing -> delayed aftershock, with independent mitigation.
 let o=setup(),a=enemy(10,1,3,30),b=enemy(11,1.5,3,0),outside=enemy(12,2.1),air=enemy(13,1,3,0,true);
 update(0,0);assert.equal(a.hp,10000);assert.equal(B.projectiles.length,1);
 advance(4/30);assert.equal(a.hp,9930);assert.equal(b.hp,9900);assert.equal(outside.hp,10000);assert.equal(air.hp,10000);
 advance(.2);assert.equal(a.hp,9910,'half ATK minus DEF, not half mitigated hit');assert.equal(b.hp,9850);assert.equal(air.hp,10000);
 assert.ok(B.combatEffects.some(e=>e.aftershock));
 // S2 enlarges actual area, slows cadence, sends three independent aftershocks.
 o=setup('char_391_rosmon',1);a=enemy(10,1);b=enemy(11,2.4);outside=enemy(12,2.7);const skillAtk=o.skill.blackboard.atk;
 update(0,0);assert.ok(o.skillState);assert.ok(Math.abs(o.cd-3.15)<1e-8);advance(.8);
 assert.equal(a.hp,10000-100*(1+skillAtk)*2.5);assert.equal(b.hp,a.hp);assert.equal(outside.hp,10000);
 assert.equal(o.def,50,'equipment DEF cannot leak into caster');
 // S1 holds charge until an actual target, creates arts on the main impact only.
 o=setup('char_391_rosmon',0);update(1,1);assert.equal(o.sp,o.skill.spCost);a=enemy(10,1);a.magicRes=50;
 update(0,0);assert.equal(o.sp,0);advance(.4);assert.equal(a.hp,9800);assert.equal(o.buffs.length,0);
 // Launch coordinates persist when primary dies; nearby live enemies still take splash/aftershock.
 o=setup();a=enemy(10,1);b=enemy(11,1.3);update(0,0);a.dead=true;advance(.4);assert.equal(b.hp,9850);
 // Other branches share the same spatial execution.
 o=setup('char_219_meteo');a=enemy(10,1);b=enemy(11,1.9);outside=enemy(12,2.1);advance(.4);
 assert.equal(a.hp,9900);assert.equal(b.hp,9900);assert.equal(outside.hp,10000);
 o=setup('char_109_fmout');a=enemy(10,1);b=enemy(11,2.05);outside=enemy(12,2.2);advance(.4);assert.equal(b.hp,9900);assert.equal(outside.hp,10000);
 o=setup('char_017_huang');o.position='MELEE';o.blockCnt=2;a=enemy(10,.5);b=enemy(11,1);outside=enemy(12,2);
 o.cells=[[3,0],[3,1],[3,2]];update(0,0);assert.equal(a.hp,9900);assert.equal(b.hp,9900);assert.equal(outside.hp,10000);
 o=setup('char_172_svrash');o.position='MELEE';a=enemy(10,1,3,0,true);update(0,0);advance(.2);assert.equal(a.hp,9920,'Lord ranged attack can hit flying enemies with 80% ATK');
 // Chain hop radius, per-hop reduction, no double hit except Pudding S2.
 o=setup('char_306_leizi');o.cells=[[3,1]];a=enemy(10,1);b=enemy(11,2.5);const c=enemy(12,4),d=enemy(13,7);
 advance(.3);assert.equal(a.hp,9900);assert.equal(b.hp,9915);assert.equal(c.hp,9928);assert.equal(d.hp,10000);
 o=setup('char_4004_pudd',1);a=enemy(10,1);b=enemy(11,2);advance(.3);assert.equal(a.hp,9742);assert.equal(b.hp,9780);
 // A sustained multi-shot is applied on every attack, not a one-time cast nuke.
 o=setup('char_103_angel',1);a=enemy(10,1);b=enemy(11,2);castSkill(o);assert.equal(a.hp,10000);
 update(0,0);advance(.2);assert.equal(a.hp,9580);assert.equal(b.hp,10000);o.cd=0;update(0,0);advance(.2);assert.equal(a.hp,9160);
 o=setup('char_103_angel',0);a=enemy(10,1);advance(.2);assert.equal(a.hp,9661);assert.equal(o.sp,0);
 // Low HP AoE, nearby half damage and resistance reduction remain distinct.
 o=setup('char_180_amgoat',1);a=enemy(10,1);b=enemy(11,2.3);a.magicRes=40;b.magicRes=40;advance(.2);
 assert.equal(a.hp,9835);assert.equal(b.hp,9917);assert.equal(ArkOperatorCombat.resistance(a),.85);
 o=setup('char_2015_dusk',1);a=enemy(10,1);b=enemy(11,2);b.hp=4000;castSkill(o);update(0,0);
 assert.equal(a.hp,9871);assert.equal(b.hp,3845);
 // Spreadshooters hit the full shape, front-row damage boost, two hits/two ammo.
 o=setup('char_1013_chen2',2);o.dir='right';a=enemy(10,1);b=enemy(11,2);castSkill(o);update(0,0);
 assert.equal(a.hp,9534);assert.equal(b.hp,9534);assert.equal(o.skillState.ammo,30);assert.ok(B.operatorZones.length);
 // Fungible drone retains its ramp per target; changing targets resets it.
 o=setup('char_328_cammou');a=enemy(10,1);advance(.2);assert.equal(a.hp,9880);o.cd=0;update(0,0);advance(.2);assert.equal(a.hp,9745);
 a.dead=true;b=enemy(11,2);o.cd=0;update(0,0);advance(.3);assert.equal(b.hp,9880);
 // The caster itself must not attack during Mostima's periodic control skill.
 o=setup('char_213_mostma',1);a=enemy(10,1);a.stunUntil=0;castSkill(o);advance(2);assert.equal(a.hp,9800);assert.equal(B.projectiles.length,0);
 // Real source talent selection is propagated through the mode -> board path.
 G.skillChoices.char_391_rosmon=2;
 const resolved=finalizeOperator(ROSTER.char_391_rosmon,null,[],false);
 assert.ok(resolved.skill.combatMechanic);assert.ok(resolved.combatTalents.some(t=>t.name==='歼灭战装备'));
 assert.ok(ArkOperatorCombat.penetration(resolved)>=160);
 const eliteResolved=finalizeOperator(ROSTER.char_391_rosmon,null,[],true);
 assert.equal(ArkOperatorCombat.planFor(eliteResolved,null).aftershocks,2,'fixed-training module adds a second aftershock');
 assert.equal(ArkOperatorCombat.penetration(eliteResolved),220);
 assert.equal(ArkOperatorCombat.penetration(finalizeOperator(ROSTER.char_391_rosmon,null,[],false)),160,'elite resolution must not mutate source talents');
 o=setup('char_391_rosmon',2);
 BDATA.level={...BDATA.level,rows:6,cols:8,buildable:Array.from({length:6},()=>Array(8).fill('MELEE'))};
 BDATA.level.buildable[3][2]='RANGED';
 const ally={id:'right:2',row:2,col:2,hp:1000,maxHp:1000,blockCnt:1,deployAt:0,deployT:1,deployed:true,cd:999};B.operators.push(ally);
 a=enemy(10,1);b=enemy(11,2);const floating=enemy(12,1,3,0,true);
 castSkill(o);assert.equal(B.summoneds.length,2);
 assert.ok(B.summoneds.every(s=>s.canAttack===false&&s.blockCnt===2&&s.hp===5000));
 assert.ok(B.summoneds.every(s=>!(s.row===3&&s.col===2)&&!(s.row===2&&s.col===2)),'no high tile or occupied ally tile');
 const token=B.summoneds[0];a.x=token.col;a.y=token.row;ArkOperatorCombat.assignBlocks();
 assert.equal(a.blockerId,token.id);a.def=400;assert.equal(enemyDef(a),240);
 const charged=ArkOperatorCombat.planFor(o,o.skill);assert.ok(charged.blockedOnly);assert.equal(charged.targets,2);
 advance(.5);assert.equal(floating.hp,10000);assert.ok(a.hp<10000);
 endOperatorSkill(o);assert.ok(B.summoneds.every(s=>s.dead));ArkOperatorCombat.assignBlocks();assert.notEqual(a.blockerId,token.id);
 o.sp=o.skill.spCost;castSkill(o);assert.ok(B.summoneds.some(s=>!s.dead));tryKill(o);assert.ok(B.summoneds.every(s=>s.dead),'owner death retires equipment without DP/respawn');
 // Rosmontis + random present caster is selected once and is not a permanent self-only buff.
 o=setup();Object.assign(o,{...resolved,skill:null,id:1,charId:'char_391_rosmon',hp:resolved.maxHp,row:3,col:0,deployed:true,deployAt:0,cd:999});
 const caster={...ally,id:2,profession:'CASTER',atk:100};B.operators.push(caster);ArkOperatorCombat.update(.1);
 assert.equal(ArkOperatorCombat.attackBonus(o),.08);assert.equal(ArkOperatorCombat.attackBonus(caster),.08);
 tryKill(o);assert.equal(ArkOperatorCombat.attackBonus(caster),0);
 // Additional current-roster actions: guardians heal allies rather than cast
 // on enemy coordinates; sustain auras, conditional immortality and multishot.
 o=setup('char_202_demkni',0);o.position='MELEE';o.skill.rangeGrids=null;
 const patient={id:20,charId:'ordinary',row:3,col:1,hp:600,maxHp:1000,cd:999,deployAt:0,deployed:true};B.operators.push(patient);
 update(0,0);assert.equal(patient.hp,600);assert.equal(o.sp,o.skill.spCost);
 patient.hp=300;update(0,0);assert.equal(patient.hp,430);assert.equal(o.sp,0);
 o=setup('char_202_demkni',1);o.skill.rangeGrids=null;patient.hp=100;const patient2={...patient,id:21,col:2,hp:200};B.operators.push(patient,patient2);update(0,0);
 assert.equal(patient.hp,195);assert.equal(patient2.hp,295);
 o=setup('char_202_demkni',2);o.skill.rangeGrids=null;patient.hp=100;B.operators.push(patient);a=enemy(10,1);castSkill(o);advance(1);
 assert.ok(Math.abs(patient.hp-115)<1e-7);assert.equal(a.hp,10000);assert.equal(a.slowFactor,.4);assert.equal(ArkOperatorCombat.artsTaken(a),1.3);
 o=setup('char_140_whitew',1);o.position='MELEE';a=enemy(10,1,3,900);b=enemy(11,2,3,900);castSkill(o);advance(.4);assert.equal(a.hp,9825);assert.equal(b.hp,9825);
 o=setup('char_143_ghost',1);castSkill(o);o.hp=-300;tryKill(o);assert.equal(o.hp,1);assert.ok(!o.dead);endOperatorSkill(o);assert.equal(o.stunUntil,10);
 o=setup('char_222_bpipe',2);o.position='MELEE';a=enemy(10,1);castSkill(o);assert.equal(o.blockCnt,2);update(0,0);assert.equal(a.hp,9520);endOperatorSkill(o);assert.equal(o.blockCnt,1);
 o=setup('char_222_bpipe',2);castSkill(o);
 updateOperatorBaseStats(o,{atk:110,maxHp:1100,def:60,attackTime:2.1,range:3,blockCnt:2});
 assert.equal(o.blockCnt,3,'alliance stat refresh preserves active skill block increase');assert.equal(o.reviveChance,undefined);
 endOperatorSkill(o);assert.equal(o.blockCnt,2,'skill expiry returns to the refreshed alliance base');
 o=setup('char_293_thorns',2);castSkill(o);const firstAttack=buffMul(o).atk;
 assert.ok(Number.isFinite(o.skillState.until));endOperatorSkill(o);o.sp=o.skill.spCost;castSkill(o);
 assert.ok(buffMul(o).atk>firstAttack);assert.equal(o.skillState.until,Number.MAX_SAFE_INTEGER,'second cast becomes permanent');
 tryKill(o);assert.equal(o._thornsCasts,0);assert.equal(buffMul(o).atk,1,'death clears permanent skill and cast count');
 o=setup('char_4064_mlynar',1);o.position='MELEE';o._liberatorCharge=20;a=enemy(10,1);a.hp=1;
 castSkill(o);update(0,0);assert.ok(a.dead);endOperatorSkill(o);assert.equal(o._liberatorCharge,20,'S2 with a kill retains accumulated trait charge');
 o.sp=o.skill.spCost;castSkill(o);endOperatorSkill(o);assert.equal(o._liberatorCharge,0,'a later S2 without a kill clears charge');
 o=setup('char_291_aglina',1);o.sp=0;a=enemy(10,1);advance(.2);assert.equal(a.hp,10000);o.sp=o.skill.spCost;castSkill(o);advance(.4);assert.ok(a.hp<10000);
 o=setup('char_4058_pepe');o.position='MELEE';a=enemy(10,1);b=enemy(11,1.5);advance(.2);assert.equal(a.hp,9900);assert.equal(b.hp,9950);
 o=setup('char_437_mizuki');o.position='MELEE';a=enemy(10,1);b=enemy(11,2);update(0,0);assert.equal(a.hp,9900);assert.equal(b.hp,9900);assert.equal(operatorDodge(o),.5);
 console.log('OPERATOR COMBAT OK spatial damage, shot/skill lifecycle, source talent stats, token placement/block/DEF/removal');
 `);
 // The real server VM captures in-flight pulses and summoned entities, rather
 // than recreating them on reconnect. Restore must match uninterrupted damage.
 const filename=require.resolve('./lib/room-game-runtime'),source=fs.readFileSync(filename,'utf8'),m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source.replace('return Object.freeze({fingerprint,config:','return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const p=await m.exports.createPlayerRuntime({seasonId:'act2autochess',modeId:'mode_single_normal',mapKey:'activities/act2autochess/level_act2autochess_m01',bandId:'band_amiya'},{seed:11,name:'mechanics'});
 try{
  p.startBattle();p.__testMachine.run(f.run('setup.toString()')+'\n'+f.run('enemy.toString()'));
  p.__testMachine.run("setup('char_391_rosmon',1);enemy(10,1);enemy(11,1.6);");
  p.advance(.1);const checkpoint=p.snapshot();assert.ok(checkpoint.battle.projectiles.some(p=>p.kind==='operator-pulse'));
  const combatState=()=>({...p.snapshot().battle,particles:[]}); // cosmetic particles deliberately use a separate random stream
  p.advance(.4);const next=combatState(),nextRng=p.snapshot().rng;p.restore(checkpoint);p.advance(.4);assert.deepEqual(combatState(),next,'authenticated restore preserves pulse delay/damage/owner/RNG');assert.deepEqual(p.snapshot().rng,nextRng);
  p.__testMachine.run("setup('char_391_rosmon',2);BDATA.level={...BDATA.level,rows:6,cols:8,buildable:Array.from({length:6},()=>Array(8).fill('MELEE'))};enemy(10,1);castSkill(B.operators[0]);");
  const tokens=p.snapshot();assert.equal(tokens.battle.summoneds.length,2);p.advance(.2);const after=combatState();p.restore(tokens);p.advance(.2);assert.deepEqual(combatState(),after);
  p.__testMachine.run("setup('char_017_huang',1);enemy(10,1);castSkill(B.operators[0]);");
  const permanent=p.snapshot();assert.ok(Number.isFinite(permanent.battle.operators[0].skillState.until));p.restore(permanent);
  assert.ok(p.__testMachine.run('buffMul(B.operators[0]).atk')>1);
  p.__testMachine.run('endOperatorSkill(B.operators[0])');assert.equal(p.__testMachine.run('buffMul(B.operators[0]).atk'),1,'ending a restored permanent skill removes its associated buffs');
  console.log('OPERATOR SERVER OK: signed restore of delayed area attacks, equipment, blocker identity and RNG');
 }finally{p.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
