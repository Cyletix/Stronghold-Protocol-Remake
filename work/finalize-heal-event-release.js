'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),{spawnSync}=require('child_process');
function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
for(const p of ['tools/room_server.js','web/room-game.js','web/room-presence.js'])edit(p,s=>s.replaceAll('room-game-20260914.15','room-game-20260914.16'));
const changed=['room-presence.js','enemy_passive_data.js','src/simulation/enemy-passives.js','src/simulation/attributes.js','src/simulation/elemental-operators.js','client_stat_buff_data.js','equip-skill-stacks-data.js','src/simulation/equip-skill-stacks.js','engine.js','mode.js','room-game.js'];
edit('web/index.html',s=>s.replace(/src="([^"]+)\?v=[^"]+"/g,(all,p)=>changed.includes(p)?`src="${p}?v=20260914.16"`:all));
edit('tools/audit_implementation_checklist.js',s=>s.replace('覆写、落地原因','覆写、坠落原因'));
edit('docs/development/toolchain.md',s=>s.replace('掩护首领死亡清理','achunt首领死亡清理').replace('多件归并/同次瞬发优先级未核 |','`python -B tools/inspect_equip_skill_stacks.py`重建15方法/4布局。多件归并/同次瞬发优先级未核 |'));
function build(){const r=spawnSync(process.execPath,['tools/build_mode.js'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());}
build();
(async()=>{
 const f=require('../tools/_browser_fixture')();await f.run('(async()=>{await initMode();})()');const fingerprint=f.run('catalogFingerprint()');
 assert.match(fingerprint,/^[a-f0-9]{16}$/);assert.notEqual(fingerprint,'d1480e625b962d1a');
 edit('web/mode/save.js',s=>{
  assert.ok(s.includes("'8e3af03c5c2f0554':'d1480e625b962d1a'"));
  return s.replace('const REST_CATALOG_MIGRATIONS={',`// Final DEF, marked-death cleanup and source knife event data rebind only on rest.\n// Known legacy knife mods become zero-stack reactive items; quoted prices/life/RNG are preserved.\nconst REST_CATALOG_MIGRATIONS={'d1480e625b962d1a':'${fingerprint}',`).replaceAll(":'d1480e625b962d1a'",`:'${fingerprint}'`);
 });
 build();const fresh=require('../tools/_browser_fixture')();await fresh.run('(async()=>{await initMode();})()');assert.equal(fresh.run('catalogFingerprint()'),fingerprint);
 fs.writeFileSync('work/heal-event-release.json',JSON.stringify({version:'room-game-20260914.16',previousFingerprint:'d1480e625b962d1a',fingerprint},null,2)+'\n');
 console.log('HEAL EVENT RELEASE '+fingerprint);
})().catch(e=>{console.error(e);process.exitCode=1;});
