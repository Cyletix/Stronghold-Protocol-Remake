'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {selectImpact,functionChanges,splitFunctions,changedDataSlices}=require('./lib/implementation-contracts');
const {snapshot,readChanges,main,loadAcceptanceMap,parseArgs}=require('./check_impact');
const {checks:registered}=require('./check_game');
const root=path.resolve(__dirname,'..');
// Use the real registry plus independent sentinel consumers. A selector cannot
// make these tests pass by merely echoing the contract declarations it exports.
const checks=[...registered];
for(const [name,file]of [['new compiler','tools/_client_programs_smoke.js'],['impact','tools/_check_impact_smoke.js'],['runner','tools/_check_game_smoke.js'],['unrelated sentinel','tools/_unrelated_impact_sentinel.js'],['future source skill','tools/_future_skill_sentinel.js']])if(!checks.some(([,a])=>a[0]===file))checks.push([name,[file]]);
const navigation=[{id:'op/char_future/skill/skchr_future_1',tests:['tools/_future_skill_sentinel.js']},{id:'op/char_102_texas/fixed/act1/example',tests:['tools/_season_roster_smoke.js']}];
const change=(p,b,a)=>({path:p,before:b,after:a});
const select=changes=>selectImpact({changes,checks,acceptanceMap:navigation});
const paths=result=>result.checks.map(c=>c.args[0]);
const has=(r,p)=>assert.ok(paths(r).includes('tools/_'+p+'_smoke.js'),'missing '+p);
const lacks=(r,p)=>assert.ok(!paths(r).includes('tools/_'+p+'_smoke.js'),'unrelated '+p);
const untouched=JSON.stringify(navigation);

// Known shared function: dispatch consumers and future registered skill suite
// follow the event; fixed roster/economy and an unrelated sentinel do not.
let result=select([change('web/engine.js','function castSkill(o){return true;}\nfunction unrelated(){return 1;}','function castSkill(o){notify(o);return true;}\nfunction unrelated(){return 1;}')]);
has(result,'equip_skill_stacks');has(result,'client_programs');has(result,'medic_talents');
assert.ok(paths(result).includes('tools/_future_skill_sentinel.js'));lacks(result,'season_roster');lacks(result,'shop_economy');
assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));
assert.deepEqual(result.changes[0].functions,['castSkill']);assert.equal(result.unregisteredTests.length,0);
assert.ok(result.contracts.find(c=>c.id==='client-programs').reasons.some(r=>r.includes('skill-lifecycle')));

// Unknown additions, top-level state and incomplete parsing must keep a check
// that no known contract names. This guards against false-negative fallbacks.
for(const [before,after]of [
 ['function castSkill(){return 1;}','function castSkill(){return 1;}\nfunction unknown(){return 2;}'],
 ['const shared=1;function castSkill(){return shared;}','const shared=2;function castSkill(){return shared;}'],
 ['function castSkill(){return 1;}','function castSkill(){'],
 [undefined,'function castSkill(){return 1;}'],
 ]){
 result=select([change('web/engine.js',before,after)]);
 assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));
 assert.ok(result.changes[0].reasons.some(r=>/unknown|outside|refused/.test(r)));
}
result=select([change('web/src/simulation/unmapped-shared.js',null,'sharedHooks.push(newHook);')]);
assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));

// A specifically registered resistance helper can be introduced without
// blessing any other new top-level state, unknown helper or UI implementation.
const resistanceBefore='function operatorDefense(o){return o.def;}\nfunction enemyDamageToOperator(e,o){return e.atk-o.def;}\n';
const resistanceAfter='function operatorDefense(o){return o.def;}\nfunction operatorResistance(o){return o.magicRes||0;}\nfunction enemyDamageToOperator(e,o){return e.atk*(1-operatorResistance(o)/100);}\n';
result=select([change('web/engine.js',resistanceBefore,resistanceAfter)]);has(result,'client_programs');has(result,'elemental_sources');has(result,'equip_protection');
assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));assert.ok(result.changes[0].reasons.some(r=>r.includes('declared helper')));
for(const after of [resistanceAfter+'function surprise(){return 1;}\n',resistanceAfter+'globalMultiplier=2;\n'])assert.ok(paths(select([change('web/engine.js',resistanceBefore,after)])).includes('tools/_unrelated_impact_sentinel.js'));
const uiBefore='// ui\r\nfunction buildOperatorDetailModel(o){return o.atk;}\r\nfunction other(){return 1;}\r\n';
result=select([change('web/mode/ui.js',uiBefore,uiBefore.replace(/\r\n/g,'\n').replace('return o.atk','return operatorAttackPower(o)'))]);
assert.deepEqual(result.changes[0].functions,['buildOperatorDetailModel']);has(result,'client_programs');has(result,'roster_catalog');
assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));
result=select([change('web/mode/ui.js',uiBefore,uiBefore.replace('return 1','return 2'))]);assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));
assert.deepEqual(functionChanges(uiBefore,uiBefore.replace(/\r\n/g,'\n')),{changed:[],outside:false});

// Raw function bodies include ASI-sensitive line breaks; strings, regex braces,
// comments and nested template substitutions cannot end a function early.
const tricky='function castSkill(o){const r=/[{}]/g;const s=`a${{x:`b${o}`}.x}`;/* } */return s;}\nfunction extra(){return 1;}';
const split=splitFunctions(tricky);assert.equal(split.functions.size,2);assert.ok(split.functions.get('castSkill').endsWith('return s;}'));
assert.deepEqual(functionChanges(tricky,tricky.replace('return s;','return o;')),{changed:['castSkill'],outside:false});
assert.deepEqual(functionChanges('function castSkill(){return\n1;}','function castSkill(){return 1;}').changed,['castSkill']);
result=select([change('web/engine.js',tricky,tricky)]);assert.equal(result.checks.length,0);

// Dedicated program source changes include ID-level source hashes, while the
// selected checks cover its configuration/consumer contract rather than all IDs.
const data=id=>'window.ArkClientProgramData='+JSON.stringify({version:1,profiles:{skchr_a:{atk:id},skchr_b:{atk:2}}})+';';
result=select([change('web/client_program_data.js',data(1),data(3))]);
has(result,'client_programs');lacks(result,'enemy_death_spawn');lacks(result,'season_roster');
assert.deepEqual(result.changes[0].sourceSlices.map(s=>s.pointer),['/profiles/skchr_a']);
assert.notEqual(result.changes[0].beforeHash,result.changes[0].afterHash);
assert.equal(changedDataSlices('not JSON','also not JSON').length,0);
result=select([change('web/src/simulation/attributes.js','old','new')]);
has(result,'final_defense');has(result,'elemental_sources');has(result,'client_programs');lacks(result,'shop_economy');
result=select([change('web/mode/save.js','old','new')]);
has(result,'rest_save');has(result,'room_game_runtime');lacks(result,'funnel');
result=select([change('web/room-game.js',"const GAME_VERSION='v1'; function send(){return 1;}","const GAME_VERSION='v2'; function send(){return 1;}")]);
has(result,'room_game_runtime');assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));
result=select([change('web/room-game.js',"const GAME_VERSION='v1'; function send(){return 1;}","const GAME_VERSION='v2'; function send(){return 2;}")]);
assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));
for(const file of ['web/room-game.js','web/room-presence.js','tools/room_server.js']){
 result=select([change(file,"const GAME_VERSION='v16';\r\nfunction route(){return 1;}\r\n","const GAME_VERSION='v17';\nfunction route(){return 1;}\n")]);
 has(result,'room_game_runtime');has(result,'room_game_server');assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));
 result=select([change(file,"const GAME_VERSION='v16';\nfunction route(){return 1;}","const GAME_VERSION='v17';\nfunction route(){return 2;}")]);assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));
}

// Document edits cause no game checks. An edited registered test is selected
// directly, retaining argument variants and deduplicating repeated consumers.
result=select([change('docs/research/new.md','before','after')]);
assert.deepEqual(result.checks.map(c=>c.name),['docs']);
result=select([change('tools/_client_stat_buff_smoke.js','old','new')]);
assert.ok(result.checks.some(c=>c.args.includes('--source-only')));assert.ok(result.checks.some(c=>c.args.length===1));
result=select([change('web/src/simulation/client-stat-buffs.js','old','new'),change('web/client_stat_buff_data.js','old','new')]);
assert.equal(paths(result).filter(p=>p==='tools/_client_stat_buff_smoke.js').length,2,'distinct command arguments survive; each command runs once');

// Script loading uses declared module contracts; unknown injected scripts and
// unmatched generated mode bundles conservatively expand.
result=select([change('web/index.html','<head>\n<script src="engine.js?v=1"></script>\n</head>','<head>\n<script src="src/simulation/client-programs.js?v=1"></script>\n<script src="engine.js?v=2"></script>\n</head>')]);
has(result,'client_programs');has(result,'room_game_runtime');lacks(result,'shop_economy');
result=select([change('web/index.html','<head></head>','<head><script src="unknown.js"></script></head>')]);assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));
result=select([change('web/mode.js','old','new')]);assert.ok(paths(result).includes('tools/_unrelated_impact_sentinel.js'));

// Missing registrations cannot silently turn a requested contract into green.
result=selectImpact({changes:[change('web/client_program_data.js',data(1),data(2))],checks:[],acceptanceMap:[]});
assert.ok(result.unregisteredTests.includes('tools/_client_programs_smoke.js'));
assert.equal(JSON.stringify(navigation),untouched);

// The real update loop may narrow only for this one added statement at its
// specified lifecycle position. Neighbor changes must retain the sentinel.
const tickBefore="function update(dt,realDt){\n  const damage=1;\n  if (o.skillState && o.skillState.until <= B.time + 1e-9) endOperatorSkill(o,'expire');\n  gainOperatorSp(o,dt);\n}",
 tickAfter=tickBefore.replace("endOperatorSkill(o,'expire');\n","endOperatorSkill(o,'expire');\n  window.ArkClientPrograms?.tick(o,B.time);\n");
result=select([change('web/engine.js',tickBefore,tickAfter)]);has(result,'client_programs');has(result,'skill_timing');
assert.ok(!paths(result).includes('tools/_unrelated_impact_sentinel.js'));assert.ok(result.contracts.some(c=>c.id==='program-tick-hook'));
for(const altered of [tickAfter.replace('damage=1','damage=2'),tickAfter.replace('tick(o,B.time)','tick(other,B.time)'),tickAfter.replace('tick(o,B.time)','tick(o,B.time+dt)'),tickAfter.replace('gainOperatorSp(o,dt)','gainOperatorSp(o,gameRandom())'),tickAfter.replace('  window.ArkClientPrograms?.tick(o,B.time);\n','').replace('  const damage=1;','  window.ArkClientPrograms?.tick(o,B.time);\n  const damage=1;')]){
 const bad=select([change('web/engine.js',tickBefore,altered)]);assert.ok(paths(bad).includes('tools/_unrelated_impact_sentinel.js'),'nonexclusive tick change must expand');
}
const quotedBefore='function update(){return `\n'+tickBefore.split('\n').slice(1,-1).join('\n')+'\n`;}';
const quotedAfter=quotedBefore.replace("endOperatorSkill(o,'expire');\n","endOperatorSkill(o,'expire');\n  window.ArkClientPrograms?.tick(o,B.time);\n");
assert.ok(paths(select([change('web/engine.js',quotedBefore,quotedAfter)])).includes('tools/_unrelated_impact_sentinel.js'),'text inside a template is not an executable hook');

// Integration fixture: the baseline names tracked, absent and unknown files;
// the real CLI honors --before rather than unrelated dirty git history.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ark-impact-'));
try{
 const write=(p,text)=>{const f=path.join(temp,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);};
 const exec=args=>{const r=spawnSync('git',args,{cwd:temp,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout;};
 exec(['init','-q']);exec(['config','user.email','impact-test@example.invalid']);exec(['config','user.name','Impact Fixture']);
 write('web/engine.js','function castSkill(){return 1;}');write('docs/note.md','old');
 exec(['add','.']);exec(['commit','-qm','fixture']);
 snapshot({snapshot:'baseline',files:['web/engine.js','web/client_program_data.js']},temp);
 write('web/engine.js','function castSkill(){return 2;}');write('web/client_program_data.js',data(1));write('docs/note.md','dirty historical docs');
 const captured=readChanges({before:'baseline',base:'HEAD',files:[]},temp);
 assert.equal(captured.length,2);assert.equal(captured.find(c=>c.path.endsWith('_data.js')).before,null);
 let called=null;const reports=[];
 assert.equal(main(['--run','--before','baseline'],{root:temp,checks,runChecks:list=>{called=list;return 0;},report:s=>reports.push(s)}),0);
 assert.ok(called.some(([,a])=>a[0]==='tools/_client_programs_smoke.js'));assert.ok(!called.some(([name])=>name==='docs'));
 assert.equal(fs.readFileSync(path.join(temp,'docs/note.md'),'utf8'),'dirty historical docs');
 assert.throws(()=>main(['--run','--before','baseline'],{root:temp,checks:[],runChecks:()=>{throw Error('must not run');},report:()=>{}}),/Required contract tests are not registered/);
 const gitDelta=readChanges({base:'HEAD',files:['web/engine.js','web/client_program_data.js']},temp);
 assert.equal(gitDelta.find(c=>c.path==='web/engine.js').before,'function castSkill(){return 1;}');
 assert.equal(gitDelta.find(c=>c.path.endsWith('_data.js')).before,null);
 exec(['add','web/engine.js']);write('web/engine.js','function castSkill(){return 3;}');
 assert.equal(readChanges({base:'INDEX',files:['web/engine.js']},temp)[0].before,'function castSkill(){return 2;}');
 assert.throws(()=>readChanges({base:'ref-that-does-not-exist',files:['web/engine.js']},temp),/ambiguous|revision|single revision/i);
 const unknown=readChanges({before:'baseline',base:'HEAD',files:['web/unrecorded.js']},temp)[0];
 assert.equal(unknown.before,undefined);assert.equal(unknown.after,null);
 assert.throws(()=>snapshot({snapshot:'baseline',files:['web/engine.js']},temp),/already exists/);
 assert.throws(()=>readChanges({before:'baseline',base:'HEAD',files:['../outside.js']},temp),/inside the project/);
 write('baseline/web/engine.js','changed baseline');assert.throws(()=>readChanges({before:'baseline',base:'HEAD',files:[]},temp),/Baseline copy missing or modified/);
}finally{
 // Resolve and verify the single test-owned temp directory before removal.
 const resolved=fs.realpathSync(temp),parent=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(resolved).toLowerCase(),parent.toLowerCase());
 assert.ok(path.basename(resolved).startsWith('ark-impact-'));fs.rmSync(resolved,{recursive:true,force:true});
}
assert.throws(()=>parseArgs(['--files']),/requires/);assert.throws(()=>parseArgs(['--run','--list']),/Choose one/);
const source=loadAcceptanceMap(root);assert.ok(source.rows.length>0);assert.ok(source.rows.some(r=>r.id.includes('/fixed/')));
// Real-source boundary checks are selection-only: never execute the game here.
// They ensure the small lexical boundary reader accepts the project's actual JS.
for(const [file,name]of [['web/engine.js','castSkill'],['web/src/simulation/operator-combat.js','attackInterval'],['web/mode/rules.js','finalizeOperator'],['web/mode/debug.js','debugTacticalEntry']]){
 const text=fs.readFileSync(path.join(root,file),'utf8'),body=splitFunctions(text).functions.get(name);assert.ok(body,file+'#'+name);
 const after=text.replace(body,body.slice(0,-1)+'\n/* selection fixture */\n}');
 assert.deepEqual(functionChanges(text,after),{changed:[name],outside:false});
 const actual=select([change(file,text,after)]);assert.ok(!paths(actual).includes('tools/_unrelated_impact_sentinel.js'),file+' should retain a bounded contract');
}
console.log('IMPACT SELECTION OK: shared event consumers, future skill mapping, unknown propagation, source slices, docs isolation, command deduplication, baseline additions and CLI execution');
