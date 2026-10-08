'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {buildCommonBuffCases,checkImportedCases,summary}=require('./lib/common-buff-cases');
const cases=buildCommonBuffCases();assert.deepEqual(checkImportedCases(cases),[]);
const f=require('./_browser_fixture')();Object.assign(f.ctx,{assert,buffCases:cases});
const helpers=`
function near(a,b,label){assert.ok(Math.abs(a-b)<1e-7,label+': '+a+' != '+b);}
function commonBoard(c){
 setupSeasonId=c.seasonId;setupStageKey=null;curMatch='solo';curDiff='extreme';BOND_BANS=[];localRunSetup=null;chooseBand('band_amiya');
 G.skillChoices[c.charId]=c.skillIndex;G.bannedOperators=[];G.ops=[];G.equipInv=[];
 const own=addOperator(c.charId,c.variant==='elite');G.ops=[own];own.row=3;own.col=3;own.dir='right';resolveBoard();
 const view=boardView(own);assert.ok(view.basicAttack,'real board retains branch profile');assert.ok(Array.isArray(view.combatTalents),'real board retains talent candidates');
 assert.ok(view.attributeBase,'real board retains attribute base');
 startBattle([view],[],100);B.waveScheduler=null;B.spawn=[{at:9999,enemyId:'unused',route:0}];B.enemies=[];B.roundLimit=9999;
 const o=B.operators[0];o.deployAt=0;o.deployed=true;o.deployT=2;o.cd=0;o.sp=0;return o;
}
function commonEnemy(o){
 const cell=(o.cells||[]).find(c=>c[0]!==o.row||c[1]!==o.col)||[o.row,o.col];
 const e={id:100,enemyId:'enemy_1002_nsabr',hp:1e8,maxHp:1e8,atk:0,def:0,magicRes:0,x:cell[1],y:cell[0],
  speed:0,moveSpeed:0,stunUntil:999,route:0,seg:0,segT:0,cd:999,attackTime:999,flying:false,canAttack:false,skills:[],effects:[],events:[],buffs:[]};
 B.enemies=[e];return e;
}
function commonAction(o){
 o.cd=0;o._droneTarget=null;o._droneHits=0;B.damageFeedback=[];B.projectiles=[];
 if(operatorAction(o)==='heal'){
  const cell=(o.cells||[]).find(c=>Math.hypot(c[0]-o.row,c[1]-o.col)===1)||[o.row,o.col];
  const ally={...o,id:200,charId:'test-ally',row:cell[0],col:cell[1],hp:1,maxHp:1e7,skill:null,skillState:null,events:[],buffs:[],garrisonAdd:null};
  B.operators=[o,ally];assert.equal(performHealingAction(o),true);B.operators=[o];return ally.hp-1;
 }
 const enemy=commonEnemy(o);assert.equal(ArkOperatorCombat.attack(o),true,o.name+' actually attacks');
 // Resolve the real emitted projectiles, preserving their original plan and owner.
 for(const p of B.projectiles.slice())if(p.basicAttack)ArkOperatorCombat.impact(p);
 B.projectiles=[];return enemy.maxHp-enemy.hp;
}
function commonStep(n){for(let i=0;i<n;i++)update(1/30,0);}
`;
async function main(){
 await f.run('initMode()');
 const receipts=f.run(`(()=>{
 ${helpers}
 const unknown={sourceId:'skcom_atk_up[99]',effects:[{type:'sentinel'}]};ArkCommonSkills.configure(unknown);assert.equal(unknown.effects[0].type,'sentinel');
 assert.throws(()=>ArkCommonSkills.configure({sourceId:'skcom_atk_up[2]',duration:25,blackboard:{atk:.3,unknown:1}}),/Invalid/);
 const done=[];
 for(const c of buffCases){
  const o=commonBoard(c),s=o.skill,b=c.expected.blackboard;
  assert.equal(s.sourceId,c.skillId,c.id);assert.equal(s.commonMechanic.kind,'stat-buff');assert.equal(s.commonMechanic.family,c.family);
  for(const key of ['spCost','initSp','spType','spIncrement','duration'])assert.equal(s[key],c.expected[key],c.id+'/'+key);
  assert.equal(s.realType,c.expected.skillType);
  assert.equal(JSON.stringify(s.blackboard),JSON.stringify(b));assert.equal(s.realRangeId,c.expected.rangeId);
  // Isolate this skill's contribution. Other talents/garrison triggers have their
  // own open review items; retain the real branch, training, static stats and module.
  o.combatTalents=[];o.events=[];o.attackCrit=null;o.garrisonAdd=null;
  const initial=JSON.parse(JSON.stringify({atk:o.atk,def:o.def,attackTime:o.attackTime,base:o.attributeBase}));
  const before=buffMul(o),powerBefore=o.atk*before.atk,defBefore=o.def*before.def,intervalBefore=ArkOperatorCombat.attackInterval(o,null);
  const plain=commonAction(o);assert.ok(plain>0,c.id+' baseline action');
  o.sp=s.spCost;const cells=JSON.stringify(o.cells);assert.equal(castSkill(o),true,c.id+' cast');assert.equal(o.sp,0);
  assert.equal(castSkill(o),false,'no second cast during same activation');assert.equal(JSON.stringify(o.cells),cells,'null source range preserves branch');
  const current=buffMul(o),powerAfter=powerBefore+initial.base.atk*(b.atk||0),defAfter=defBefore+initial.base.def*(b.def||0);
  near(o.atk*current.atk,powerAfter,c.id+' additive attack');near(o.def*current.def,defAfter,c.id+' additive defense');
  const expectedInterval=initial.attackTime*Math.max(.1,Math.min(6,initial.base.aspd))/Math.max(.1,Math.min(6,initial.base.aspd+(b.attack_speed||0)/100));
  near(ArkOperatorCombat.attackInterval(o,s),expectedInterval,c.id+' actual action interval');
  const actual=commonAction(o),heals=operatorAction(o)==='heal';
  // Independent before/after action oracle: same source attack shape, only the
  // additive attack contribution changes. Allow integer rounding per emitted hit.
  const expected=plain*powerAfter/powerBefore,tolerance=heals?1e-6:4;
  assert.ok(Math.abs(actual-expected)<=tolerance,c.id+' damage/heal '+actual+' expected '+expected);
  near(o.cd,expectedInterval,c.id+' action sets correct cooldown');
  const hit={atk:10000,atkType:'phys'};assert.equal(enemyDamageToOperator(hit,o),Math.max(1,Math.round(Math.max(500,10000-defAfter)*(o.dmgTaken||1))),c.id+' incoming physical damage');
  if(b.attack_speed)assert.ok(o.cd<intervalBefore,'speed improves actual action cadence');
  // Exact duration edge, locked SP, automatic cleanup, no accumulation on recast.
  B.enemies=[];o.cd=999;B.time=s.duration-1/30;update(0,0);assert.ok(o.skillState);assert.equal(o.sp,0);
  update(1/30,0);assert.equal(o.skillState,null);near(o.sp,0,'SP unlock starts only after duration');assert.equal(o.buffs.length,0);
  near(o.atk,initial.atk,'attack restored');near(o.def,initial.def,'defense restored');near(ArkOperatorCombat.attackInterval(o,null),intervalBefore,'interval restored');
  o.sp=s.spCost;assert.equal(castSkill(o),true);near(o.atk*buffMul(o).atk,powerAfter,'recast does not compound');
  const clock=B.time;B.phase='rest';update(2,0);assert.equal(B.time,clock);assert.ok(o.skillState);B.phase='battle';
  o.hp=0;tryKill(o);assert.equal(o.skillState,null);assert.equal(o.buffs.length,0);o.respawnAt=B.time;o.respawnCost=0;respawnOperators();
  assert.equal(o.dead,false);o.deployed=true;o.deployT=2;o.deployAt=0;o.sp=s.spCost;assert.equal(castSkill(o),true);near(o.atk*buffMul(o).atk,powerAfter,'fresh redeployment');
  done.push({id:c.id,reviewId:c.reviewId,name:c.name,family:c.family,checks:['source','board-profile','action','damage-or-heal','defense','cadence','SP-duration','recast','pause','death-redeploy']});
 }
 assert.equal(done.length,80);assert.equal(new Set(done.map(c=>c.reviewId)).size,27);
 // Algebra fixture is deliberately independent of imported or derived values.
 const u={atk:120,def:240,attributeBase:{atk:100,def:200,aspd:1.3},buffs:[{atk:1.3,def:1.4,aspd:1.2,until:10},{atk:1.4,def:1.1,aspd:1.3,until:10}]};
 let m=ArkAttributes.ratios(u,{},0);near(u.atk*m.atk,190,'20% static +30% +40% attack');near(u.def*m.def,340,'20% static +40% +10% defense');near(m.aspd,1.8/1.3,'static AS30 plus AS20+30');
 u.buffs.push({atk:.5,def:.6,until:10});m=ArkAttributes.ratios(u,{},0);near(u.atk*m.atk,95,'legacy final reduction remains separate');near(u.def*m.def,204,'defense final factor');
 near(ArkAttributes.ratios(u,{},10).atk,1,'stale expired records ignored');
 near(ArkAttributes.ratios({...u,attributeBase:{...u.attributeBase,aspd:8}}, {aspd:3},0).aspd,1,'AS600 cap includes static speed');
 near(ArkAttributes.ratios({...u,buffs:[],attributeBase:{...u.attributeBase,aspd:.05}}, {aspd:-1},0).aspd,1,'AS10 floor includes static speed');
 const changed=commonBoard(buffCases.find(c=>c.skillId==='skcom_atk_up[3]'));changed.combatTalents=[];changed.events=[];changed.attackCrit=null;changed.garrisonAdd=null;changed.sp=changed.skill.spCost;castSkill(changed);
 const src={...changed,atk:500,def:200,attributeBase:{atk:400,def:200,aspd:1.2},attackTime:2};updateOperatorBaseStats(changed,src);
 near(changed.atk*buffMul(changed).atk,500+400*changed.skill.blackboard.atk,'live base recomputation preserves separate active percentage');endOperatorSkill(changed);near(changed.atk,500,'expiry keeps updated base');
 // Strongest inspiration is added after ordinary percent buffs, never multiplied twice.
 const bard={...changed,id:99,charId:'char_1012_skadi2',atk:100,attributeBase:{atk:100,def:0,aspd:1},basicAttack:{action:'bard'},cells:[[changed.row,changed.col]],skillState:{},skill:{sourceId:'skchr_skadi2_3',blackboard:{atk:.5}},buffs:[]};
 B.operators.push(bard);near(operatorAttackPower(changed,2),1050,'final inspiration +50 after x2');
 changed.buffs=[{atk:1.3,until:999},{atk:.5,until:999}];
 near(operatorAttackPower(changed,buffMul(changed,0,.4).atk)*1.5,660,'critical +40% uses raw base, final reduction before inspiration, damage scale after inspiration');
 // The actual board path also carries the promoted hunter trait and source talent.
 const hunt=commonBoard({seasonId:'act1autochess',charId:'char_4211_snhunt',skillIndex:0,variant:'normal'});ArkHunter.ensure(hunt);assert.equal(hunt.hunter.max,8);assert.ok(hunt.combatTalents.length);
 G.phase='rest';G.ops[0].row=null;G.ops[0].col=null;const old=JSON.parse(encodeRestSave());old.catalog='0926c0d33f3cd9bb';const loaded=decodeRestSave(JSON.stringify(old));
 const fresh=finalizeOperator(loaded.session.ops[0].entry,null,[],false);assert.equal(fresh.attributeBase.version,ArkAttributes.version,'previous exact rest catalog rebuilds attribute layers');
 return done;
 })()`);
 const filename=path.join(__dirname,'lib/room-game-runtime.js'),sourceText=fs.readFileSync(filename,'utf8'),marker='return Object.freeze({fingerprint,config:';
 assert.equal(sourceText.split(marker).length,2);const injected=new Module(filename,module);injected.filename=filename;injected.paths=Module._nodeModulePaths(path.dirname(filename));
 injected._compile(sourceText.replace(marker,'return Object.freeze({__testMachine:machine,fingerprint,config:'),filename);
 const runtime=await injected.exports.createPlayerRuntime({seasonId:'act1autochess',modeId:'mode_multi_normal',mapKey:'activities/act1autochess/level_act1autochess_m01',bandId:'band_amiya'},{seed:887,name:'common-buffs'});
 try{
  runtime.startBattle();runtime.__testMachine.context.assert=assert;
  const c=cases.find(c=>c.family==='attack-and-speed'&&c.seasonId==='act1autochess');
  runtime.__testMachine.run(`${helpers}const first=commonBoard(${JSON.stringify(c)});first.playerId='one';first.sp=first.skill.spCost;const second={...first,id:2,playerId:'two',col:4,skill:JSON.parse(JSON.stringify(first.skill)),buffs:[]};B.operators.push(second);second.sp=0;castSkill(first);commonEnemy(first);`);
  runtime.advance(.35);const checkpoint=runtime.snapshot();assert.ok(checkpoint.battle.operators[0].skillState);assert.ok(!checkpoint.battle.operators[1].skillState);
  runtime.advance(.8);const after=runtime.snapshot();runtime.restore(JSON.parse(JSON.stringify(checkpoint)));runtime.advance(.8);const restored=runtime.snapshot();
  assert.deepEqual({...restored.battle,particles:[]},{...after.battle,particles:[]},'signed restore preserves owner, layers, active buff and cooldown');assert.deepEqual(restored.rng,after.rng);
  runtime.__testMachine.run('endOperatorSkill(B.operators[0])');assert.equal(runtime.snapshot().battle.operators[0].buffs.length,0,'restored skill removes its own serialized buffs');
 }finally{runtime.dispose();}
 const out=process.argv.indexOf('--receipts');if(out>=0){assert.ok(process.argv[out+1]);fs.writeFileSync(process.argv[out+1],JSON.stringify({date:'2026-09-12',scope:'fixed roster skill body; other skills/talents/modules are not accepted by this receipt',...summary(cases),receipts},null,2)+'\n');}
 console.log('COMMON BUFFS OK: 5 families, 9 IDs, 27 operators, 80 real season/variant cases; additive layers, actual action/defense/cadence, lifecycle and authenticated two-owner restore');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
