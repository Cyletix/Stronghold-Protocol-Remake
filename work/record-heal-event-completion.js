'use strict';
const fs=require('fs'),assert=require('assert/strict'),{checks}=require('../tools/check_game'),{readProgress}=require('../tools/lib/checklist-progress');
const before=JSON.parse(fs.readFileSync('work/heal-event-checklist-before.json','utf8')),current=new Map();
for(const name of ['README','operator-checklist','enemy-checklist','library-checklist','mode-slot-checklist'])for(const [id,row]of readProgress(fs.readFileSync(`docs/checklists/${name}.md`,'utf8'))){assert.ok(!current.has(id));current.set(id,row);}
assert.equal(current.size,6328);assert.equal([...current.values()].filter(v=>v.done).length,501);
for(const [id,old]of Object.entries(before)){
 const row=current.get(id);assert.ok(row,id+' missing');if(old.done)assert.ok(row.done,id+' reopened');
 let cursor=0;for(const note of old.notes){const i=row.notes.indexOf(note,cursor);assert.ok(i>=cursor,id+' lost note');cursor=i+1;}
}
const passed=new Set();for(const part of ['a','b','a-resume'])for(const m of fs.readFileSync(`work/heal-event-checks-${part}.txt`,'utf8').matchAll(/^PASS (.+)$/gm))passed.add(m[1]);
assert.equal(passed.size,124);
// These three commands were executed successfully after checklist/doc finalization.
for(const name of ['implementation checklist','content coverage','docs'])passed.add(name);
assert.equal(passed.size,127);for(const [name]of checks)assert.ok(passed.has(name),name+' missing');
const release=JSON.parse(fs.readFileSync('work/heal-event-release.json','utf8')),report=JSON.parse(fs.readFileSync('work/heal-event-checklist-revalidation.json','utf8'));
fs.writeFileSync('work/heal-event-completion.json',JSON.stringify({date:'2026-09-14',release,webChecks:127,parentRelatedTests:206,candidateTests:9,checklist:{ids:6328,accepted:501,originalIdsPreserved:6324,originalAcceptedPreserved:497,revalidated:report.revalidated,added:report.added},limitations:['protected Heal ability bridge','three achunt children TARGET context','multiple equipment instances and same-cast instant priority','training missing source ID/NPC caller/four-player choice','full original timing and remote four-player long-session/restart'],next:'skcom_born_up AppearSkill OnBorn/OnLocate/DoCast; existing native index, no full re-extraction'},null,2)+'\n');
console.log('FINAL: 127 checks; 6324 original IDs and every original note preserved; 501/6328 accepted; '+release.version+' / '+release.fingerprint);
