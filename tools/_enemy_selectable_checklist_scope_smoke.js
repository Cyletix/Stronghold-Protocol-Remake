'use strict';
// Preview-only audit and in-memory acceptance tests. Never mark real checklists.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir='work/enemy-selectable-checklist-preview';
const indexPath='docs/checklists/implementation-checklist.json',enemyPath='docs/checklists/enemy-checklist.md';
const text=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(text(p));
const old=json(indexPath),oldText=text(enemyPath),oldTasks=new Map(old.tasks.map(t=>[t.id,t]));
cp.execFileSync(process.execPath,[path.join(__dirname,'audit_implementation_checklist.js'),'--scope-enemy-selectable-attacks','--output-dir',dir],{cwd:root,stdio:'pipe'});
const fresh=json(dir+'/'+indexPath),freshText=text(dir+'/'+enemyPath),scope=fresh.scopedAudits.enemySelectableAttacks;
const additions=fresh.tasks.filter(t=>!oldTasks.has(t.id));
assert.equal(scope.ordinaryProviderBindings,1);
assert.deepEqual(scope.enemyIds,['enemy_9021_acduml_2']);
for(const t of old.tasks)assert.deepEqual(fresh.tasks.find(n=>n.id===t.id),t,'historical task changed '+t.id);
for(const key of Object.keys(old))if(!['tasks','scopedAudits'].includes(key))assert.deepEqual(fresh[key],old[key],key);
for(const [key,value]of Object.entries(old.scopedAudits||{}))if(key!=='enemySelectableAttacks')assert.deepEqual(fresh.scopedAudits[key],value,key);
assert.equal(additions.length,scope.taskIds.filter(id=>!oldTasks.has(id)).length);
assert.ok(additions.every(t=>!t.checked&&!t.notes.length));
let removed=freshText;
for(const task of additions)removed=removed.split('\n').filter(line=>!line.includes('<!-- review:'+task.id+' basis:')).join('\n');
assert.equal(removed,oldText,'historical enemy Markdown changed');
assert.equal(text(indexPath),JSON.stringify(old,null,2)+'\n','real index modified');
assert.equal(text(enemyPath),oldText,'real enemy checklist modified');
const id=scope.taskIds[0],before={tasks:old.tasks,checkedIds:old.tasks.filter(t=>t.checked).map(t=>t.id),checkedCount:old.tasks.filter(t=>t.checked).length};
function acceptance(taskId=id,chosenScope='enemy-selectable-attacks'){
 const input={scope:chosenScope,batch:'isolated-tool-test',before:'work/checklist-selectable-test-before.json',
  output:'work/checklist-selectable-test-receipt.json',validations:['tools/_enemy_selective_attacks_contract_smoke.js'],
  tasks:{[taskId]:'Isolated acceptance-writer test; no actual task was accepted.'}};
 const memory=new Map([[path.join(root,'work/checklist-selectable-test-input.json'),JSON.stringify(input)],
  [path.join(root,input.before),JSON.stringify(before)],[path.join(root,indexPath),JSON.stringify(fresh)],
  [path.join(root,enemyPath),freshText]]),writes=new Map();
 const mock={...fs,readFileSync:(p,...args)=>memory.has(String(p))?memory.get(String(p)):fs.readFileSync(p,...args),
  existsSync:p=>memory.has(String(p))||fs.existsSync(p),
  writeFileSync:(p,value)=>{memory.set(String(p),value);writes.set(String(p),value);}};
 const script=text('tools/record_garrison_acceptance.js');
 vm.runInNewContext(script,{__dirname,require:name=>name==='node:fs'?mock:name.startsWith('./')?require(path.join(__dirname,name)):require(name),
  process:{argv:['node','record','work/checklist-selectable-test-input.json']},console:{log(){}}});
 return writes;
}
// Once the real child is already accepted, this writer must reject re-acceptance.
if(!oldTasks.get(id)?.checked){
 const writes=acceptance(),index=JSON.parse(writes.get(path.join(root,indexPath)));
 assert.deepEqual([...writes.keys()].sort(),[enemyPath,indexPath,'work/checklist-selectable-test-receipt.json'].map(p=>path.join(root,p)).sort());
 assert.equal(index.tasks.find(t=>t.id===id).checked,true);
 for(const task of old.tasks)if(task.id!==id)assert.deepEqual(index.tasks.find(t=>t.id===task.id),task);
}else assert.throws(()=>acceptance(),/Not a newly reviewed scoped provider task/);
assert.throws(()=>acceptance('enemy/enemy_9021_acduml_2/base'),/Not a newly reviewed scoped provider task/);
assert.throws(()=>acceptance(id,'unknown-scope'),/Unknown explicit acceptance scope/);
assert.equal(text(enemyPath),oldText);
console.log('ENEMY SELECTABLE CHECKLIST OK preview adds only scoped ordinary-provider task; all historical facts/basis/notes/checkboxes preserved; acceptance writes sandboxed and rejects parent/wrong scope');
