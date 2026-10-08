'use strict';
// One isolated checklist preview. Source/provider files are read, never rebuilt.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),script=path.join(root,'tools/audit_implementation_checklist.js');
const out=spawnSync('python',['-c',"import sys,json;sys.path.insert(0,'tools');from build_garrison_skill_batches import report;print(json.dumps(report(),ensure_ascii=False))"],{cwd:root,encoding:'utf8',windowsHide:true});
assert.equal(out.status,0,out.stderr);const batch=JSON.parse(out.stdout),virtual=new Map(),written=new Map();
const normalize=p=>path.resolve(String(p));
const indexPath=path.join(root,'docs/checklists/implementation-checklist.json'),readmePath=path.join(root,'docs/checklists/README.md');
const old=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const history={id:'review/fixture-history',group:'batch',checked:true,basis:'1111111111111111',notes:['  - 记录：保留未在新生成器内注册的历史验收。']};
old.tasks.push(history);const owner=old.operators.find(o=>o.id==='char_290_vigna');owner.reviewOnlySentinel='preserve unrelated operator metadata';
virtual.set(indexPath,JSON.stringify(old));virtual.set(readmePath,fs.readFileSync(readmePath,'utf8')+'\n- [x] 历史验收保留 <!-- review:'+history.id+' basis:'+history.basis+' -->\n'+history.notes[0]+'\n');
virtual.set(path.join(root,'work/garrison-skill-batch-report.json'),JSON.stringify(batch));
const shim=Object.create(fs);
shim.readFileSync=(p,...args)=>virtual.has(normalize(p))?virtual.get(normalize(p)):fs.readFileSync(p,...args);
shim.existsSync=p=>virtual.has(normalize(p))||fs.existsSync(p);
shim.mkdirSync=()=>{};shim.writeFileSync=(p,text)=>{written.set(path.relative(root,normalize(p)).replaceAll('\\','/'),String(text));};
global.reviewFs=shim;process.argv.push('--scope-garrison-batches');
const source=fs.readFileSync(script,'utf8').replace("const fs=require('node:fs'),path=",'const fs=global.reviewFs,path=');
const injected=new Module(script,module);injected.filename=script;injected.paths=Module._nodeModulePaths(path.dirname(script));injected._compile(source,script);
process.on('beforeExit',()=>{
 assert.ok(written.size,'preview generated');
 const fresh=JSON.parse(written.get('docs/checklists/implementation-checklist.json')),audit=fresh.scopedAudits.garrisonBatches;
 const suffix={'client-programs':'source-body','next-attack':'source-next-attack-body','skill-modes':'source-mode-body'},selected=new Set();
 for(const m of audit.memberProviders){const base='op/'+m.charId+'/skill/'+m.skillId;selected.add(base);for(const p of m.providers)selected.add(base+'/'+suffix[p]);}
 const tasks=new Map(fresh.tasks.map(t=>[t.id,t]));
 for(const row of old.tasks)if(!selected.has(row.id))assert.deepEqual(tasks.get(row.id),row,'unrelated machine task '+row.id);
 for(const before of old.operators){const after=fresh.operators.find(o=>o.id===before.id),expected=structuredClone(before);for(const s of expected.skills)if(selected.has('op/'+before.id+'/skill/'+s.id))Object.assign(s,after.skills.find(x=>x.id===s.id));assert.deepEqual(after,expected,'only selected skill metadata '+before.id);}
 const {readProgress}=require('../tools/lib/checklist-progress');let unrelated=0,checked=0;
 for(const rel of ['docs/checklists/README.md','docs/checklists/operator-checklist.md','docs/checklists/library-checklist.md','docs/checklists/enemy-checklist.md','docs/checklists/mode-slot-checklist.md']){
  const before=readProgress(shim.readFileSync(path.join(root,rel),'utf8')),after=readProgress(written.get(rel));
  for(const [id,value]of before)if(!selected.has(id)){assert.deepEqual(after.get(id),value,'unrelated Markdown task '+id);unrelated++;checked+=Number(value.done);}
 }
 const migrations=[['char_017_huang','skchr_huang_1','source-next-attack-body'],['char_222_bpipe','skchr_bpipe_2','source-next-attack-body'],['char_017_huang','skchr_huang_2','source-mode-body'],['char_172_svrash','skchr_svrash_3','source-mode-body'],['char_290_vigna','skchr_vigna_1','source-mode-body'],['char_290_vigna','skchr_vigna_2','source-mode-body']];
 for(const [cid,sid,body]of migrations)assert.ok(selected.has('op/'+cid+'/skill/'+sid+'/'+body),'migration selected '+sid);
 for(const sid of ['skchr_vigna_1','skchr_vigna_2'])assert.ok(!selected.has('op/char_290_vigna/skill/'+sid+'/source-body'),'other provider body unchanged');
 assert.equal(fresh.stats.modeExplicitSkills,batch.stats.expandedExplicitAfter);assert.equal(fresh.stats.fixedExplicitSkills,batch.stats.fixedExplicitAfter);
 const receipt={passed:true,selectedTasks:selected.size,members:audit.memberProviders.length,checkedHistoricalTasksPreserved:checked,unrelatedTasksPreserved:unrelated,providerMigrationsVerified:migrations.length,unknownHistoricalTaskPreserved:true,unrelatedOperatorMetadataPreserved:true,counts:batch.stats};
 fs.writeFileSync(path.join(root,'work/garrison-checklist-scope-review.json'),JSON.stringify(receipt,null,2)+'\n');console.log('SCOPED CHECKLIST REVIEW '+JSON.stringify(receipt));
});
