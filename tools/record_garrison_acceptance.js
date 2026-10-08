'use strict';
// Record an explicitly reviewed set of new provider subitems. This tool never
// infers acceptance from data presence, profile count, or a compiler result.
const fs=require('node:fs'),path=require('node:path');
const {readProgress}=require('./lib/checklist-progress');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const inputPath=process.argv[2];
if(!inputPath)throw Error('Pass a JSON record with batch, before, output, validations and tasks {reviewId: note}');
const input=read(inputPath),before=read(input.before),indexPath='docs/checklists/implementation-checklist.json',index=read(indexPath);
const ids=Object.keys(input.tasks||{}),old=new Map(before.tasks.map(t=>[t.id,t]));
if(!ids.length||!input.batch||!input.validations?.length||!/^work\/[^/]+\.json$/.test(input.output))throw Error('Incomplete acceptance record');
for(const file of input.validations)if(!fs.existsSync(path.join(root,file)))throw Error('Missing recorded validation '+file);
const suffix={'skill-modes':'source-mode-body','client-programs':'source-body','next-attack':'source-next-attack-body','direct-actions':'source-direct-body'};
const scope=input.scope||'garrison-batches';
if(!['garrison-batches','enemy-selectable-attacks','enemy-auras','enemy-attached-projectiles'].includes(scope))throw Error('Unknown explicit acceptance scope '+scope);
const enemyScope=scope.startsWith('enemy-');
const scoped=index.scopedAudits?.[scope==='enemy-attached-projectiles'?'enemyAttachedProjectiles':scope==='enemy-auras'?'enemyAuras':enemyScope?'enemySelectableAttacks':'garrisonBatches'];
if(!scoped)throw Error('Generate the selected scoped checklist before recording acceptance');
const allowed=new Set(enemyScope?scoped.taskIds:
 scoped.memberProviders.flatMap(m=>m.providers.map(p=>`op/${m.charId}/skill/${m.skillId}/${suffix[p]}`)));
if(scope==='enemy-selectable-attacks'&&[...allowed].some(id=>!/^enemy\/[^/]+\/basic\/source-selectable-attack-body$/.test(id)))throw Error('Unexpected enemy acceptance task scope');
if(scope==='enemy-auras'&&[...allowed].some(id=>!/^enemy\/[^/]+\/talent\/source-aura-body$/.test(id)))throw Error('Unexpected enemy Aura acceptance task scope');
if(scope==='enemy-attached-projectiles'&&[...allowed].some(id=>!/^enemy\/[^/]+\/basic\/source-attached-projectile-body$/.test(id)))throw Error('Unexpected attached projectile scope');
for(const id of ids){
 if(!allowed.has(id)||old.get(id)?.checked)throw Error('Not a newly reviewed scoped provider task: '+id);
 if(typeof input.tasks[id]!=='string'||!input.tasks[id].trim()||input.tasks[id].includes('\n'))throw Error('Use one concrete validation record per task');
}
const files=new Map(),found=new Set(),progress=new Map();
for(const file of enemyScope?['docs/checklists/enemy-checklist.md']:['docs/checklists/operator-checklist.md','docs/checklists/library-checklist.md']){
 const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/),next=[];
 for(let i=0;i<lines.length;i++){
  const match=/<!-- review:([^ ]+) basis:/.exec(lines[i]),id=match?.[1];
  if(!ids.includes(id)){next.push(lines[i]);continue;}
  if(found.has(id))throw Error('Duplicate selected task '+id);found.add(id);
  const notes=[];while((lines[i+1]||'').startsWith('  - 记录：'))notes.push(lines[++i]);
  // i may now point at a note; recover the task line by its exact block length.
  next.push(lines[i-notes.length].replace(/^- \[[ xX]\]/,'- [x]'));
  const note='  - 记录：'+input.tasks[id];if(!notes.includes(note))notes.push(note);next.push(...notes);
 }
 const text=next.join('\n');files.set(file,text);
 for(const [id,value]of readProgress(text))progress.set(id,value);
}
if(found.size!==ids.length)throw Error('Missing selected Markdown task');
for(const task of index.tasks)if(ids.includes(task.id)){
 const p=progress.get(task.id);task.checked=p.done;task.basis=p.basis;task.notes=p.notes;
}
const current=new Map(index.tasks.map(t=>[t.id,t]));
for(const task of before.tasks){
 const now=current.get(task.id);if(!now)throw Error('Historical task removed '+task.id);
 if(task.checked&&!now.checked)throw Error('Historical acceptance reopened '+task.id);
 if(!ids.includes(task.id)&&JSON.stringify(now.notes)!==JSON.stringify(task.notes))throw Error('Historical notes changed '+task.id);
 if(task.checked&&now.basis!==task.basis)throw Error('Historical accepted basis changed '+task.id);
}
const checked=index.tasks.filter(t=>t.checked),newIds=checked.filter(t=>!old.get(t.id)?.checked).map(t=>t.id).sort();
if(JSON.stringify(newIds)!==JSON.stringify(ids.slice().sort()))throw Error('Unexpected checked task outside this batch');
const receipt={batch:input.batch,before:input.before,newLimitedTasks:ids.slice().sort(),retainedHistoricalTasks:before.checkedIds,
 checkedBefore:before.checkedCount,checkedAfter:checked.length,notesPreserved:true,validations:input.validations,
 scope:'Explicitly reviewed provider subitems only; no whole skill/operator/enemy acceptance inferred.'};
const output=JSON.stringify(receipt,null,2)+'\n',dest=path.join(root,input.output);
if(fs.existsSync(dest)&&fs.readFileSync(dest,'utf8')!==output)throw Error('Conflicting existing acceptance receipt');
for(const [file,text]of files)fs.writeFileSync(path.join(root,file),text);
fs.writeFileSync(path.join(root,indexPath),JSON.stringify(index,null,2)+'\n');fs.writeFileSync(dest,output);
console.log(JSON.stringify({receipt:input.output,checkedBefore:before.checkedCount,checkedAfter:checked.length,newLimitedTasks:ids.length}));
