'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
const {spawnSync}=require('child_process');
function edit(p,fn){const before=fs.readFileSync(p,'utf8'),after=fn(before);fs.writeFileSync(p,after);}
for(const p of ['tools/room_server.js','web/room-game.js','web/room-presence.js'])edit(p,s=>s.replaceAll('room-game-20260914.14','room-game-20260914.15'));
const changed=['room-presence.js','enemy_death_spawn_data.js','enemy_passive_data.js','src/simulation/enemy-passives.js','src/simulation/elemental-operators.js','client_stat_buff_data.js','src/simulation/client-stat-buffs.js','engine.js','mode.js','room-game.js'];
edit('web/index.html',s=>s.replace(/src="([^"]+)\?v=[^"]+"/g,(all,p)=>changed.includes(p)?`src="${p}?v=20260914.15"`:all));
function build(){const r=spawnSync(process.execPath,['tools/build_mode.js'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());}
build();
(async()=>{
 const f=require('../tools/_browser_fixture')();await f.run('(async()=>{await initMode();})()');const fingerprint=f.run('catalogFingerprint()');
 assert.match(fingerprint,/^[a-f0-9]{16}$/);assert.notEqual(fingerprint,'8e3af03c5c2f0554');
 edit('web/mode/save.js',s=>{
  assert.ok(s.includes("'1023c11cf435e1a4':'8e3af03c5c2f0554'"),'expected previous release migration');
  return s.replace("const REST_CATALOG_MIGRATIONS={",`// Source attack-mode/DEF-zero, enemy transfer and riot-shield data rebind on rest.\n// Existing life, quoted stock and RNG are retained; training HP=45 applies only to a new run.\nconst REST_CATALOG_MIGRATIONS={'8e3af03c5c2f0554':'${fingerprint}',`).replaceAll(":'8e3af03c5c2f0554'",`:'${fingerprint}'`);
 });
 build();
 const fresh=require('../tools/_browser_fixture')();await fresh.run('(async()=>{await initMode();})()');assert.equal(fresh.run('catalogFingerprint()'),fingerprint);
 fs.writeFileSync('work/contract-release.json',JSON.stringify({version:'room-game-20260914.15',previousFingerprint:'8e3af03c5c2f0554',fingerprint},null,2)+'\n');
 console.log('CONTRACT RELEASE '+fingerprint);
})().catch(e=>{console.error(e);process.exitCode=1;});
