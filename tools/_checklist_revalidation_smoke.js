'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {loadReceipt,canPreserve}=require('./lib/checklist-revalidation');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ark-checklist-receipt-'));
const from='a'.repeat(16),to='b'.repeat(16),sum=text=>crypto.createHash('sha256').update(text).digest('hex');
const write=(p,text)=>{const full=path.join(temp,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,text);};
const input={
 'tools/check_game.js':"module.exports={checks:[['source',['tools/check.js','--source-only']],['runtime',['tools/check.js']],['another',['tools/other.js']]]};",
 'tools/check.js':'// source and runtime share a script; arguments define the coverage\n',
 'tools/other.js':'// another fixture check\n',
 'web/program.js':'const programVersion=1;\n',
 'work/checks.txt':'PASS source\r\nPASS runtime\r\n',
};
const check=(name,args)=>({name,args});
const source=check('source',['tools/check.js','--source-only']),runtime=check('runtime',['tools/check.js']);
function fresh(){
 for(const [p,text]of Object.entries(input))write(p,text);
 return {schemaVersion:1,files:Object.fromEntries(Object.entries(input).map(([p,text])=>[p,sum(text)])),
  passedChecks:[{...source,log:'work/checks.txt'},{...runtime,log:'work/checks.txt'}],items:{
   'op/source-body':{fromBasis:from,toBasis:to,decision:'revalidated',evidence:'The original scope passes its source and runtime checks.',checks:[source,runtime]},
   'slot/unchanged':{fromBasis:from,toBasis:to,decision:'unaffected',evidence:'Only the unrelated runtime module changed; the bound source fields are unchanged.',evidenceFiles:['web/program.js']},
   'enemy/pending':{fromBasis:from,toBasis:to,decision:'needs-review',evidence:'No dependency mapping has been established.'},
  }};
}
function save(receipt){write('work/receipt.json',JSON.stringify(receipt));return loadReceipt(temp,'work/receipt.json');}
function rejected(change,pattern){const r=fresh();change(r);assert.throws(()=>save(r),pattern);}
try{
 const receipt=save(fresh());
 assert.ok(canPreserve(receipt,{id:'op/source-body',fromBasis:from,toBasis:to}));
 assert.ok(canPreserve(receipt,{id:'slot/unchanged',fromBasis:from,toBasis:to}));
 for(const id of ['enemy/pending','op/unknown'])assert.equal(canPreserve(receipt,{id,fromBasis:from,toBasis:to}),false);
 assert.equal(canPreserve(receipt,{id:'op/source-body',fromBasis:to,toBasis:from}),false,'both basis directions must match');
 assert.equal(canPreserve(receipt,{id:'op/source-body',fromBasis:from,toBasis:'c'.repeat(16)}),false);
 assert.equal(canPreserve(JSON.parse(JSON.stringify(receipt)),{id:'op/source-body',fromBasis:from,toBasis:to}),false,'serialized data must be reloaded and checked');
 assert.equal(canPreserve(null,{}),false);assert.equal(canPreserve(receipt,{}),false);
 assert.throws(()=>{receipt.items['enemy/pending'].decision='revalidated';},TypeError);
 assert.throws(()=>{receipt.passedChecks[0].args.pop();},TypeError);

 // Existing prose is outside this API. Applying its boolean must never need to
 // alter the old notes or create acceptance for an unlisted ID.
 const notes=['  - 记录：原始源图与版本边界。','  - 记录：此前有限验证，不代表完整角色。'];
 const before=JSON.stringify(notes);if(canPreserve(receipt,{id:'op/source-body',fromBasis:from,toBasis:to})){const rendered=['- [x] preserved scope',...notes];assert.deepEqual(rendered.slice(1),notes);}
 assert.equal(JSON.stringify(notes),before);

 rejected(r=>delete r.files['web/program.js'],/unknown evidence file/);
 rejected(r=>delete r.files['tools/check_game.js'],/must cover tools\/check_game/);
 rejected(r=>delete r.files['tools/check.js'],/must cover check code/);
 rejected(r=>delete r.files['work/checks.txt'],/must cover log/);
 rejected(r=>r.files['web/program.js']='0'.repeat(64),/stale SHA256/);
 rejected(r=>r.files['web/program.js']='bad-hash',/invalid SHA256/);
 rejected(r=>{write('web/program.js','changed after validation run');},/stale SHA256/);
 rejected(r=>{fs.unlinkSync(path.join(temp,'web/program.js'));},/missing file/);
 rejected(r=>{r.files['../outside.js']='0'.repeat(64);},/non-canonical project path/);
 rejected(r=>{r.files['C:\\outside.js']='0'.repeat(64);},/non-canonical project path/);
 rejected(r=>{r.passedChecks[0].args=['tools/check.js'];},/name\/args do not match registry/);
 rejected(r=>{r.passedChecks[1].name='source';},/name\/args do not match registry/);
 rejected(r=>{r.passedChecks[0].args=['tools/check.js','--source-only','--different'];},/name\/args do not match registry/);
 rejected(r=>{r.passedChecks.push({...runtime,log:'work/checks.txt'});},/duplicate passed command/);
 rejected(r=>{r.passedChecks=[{...source,log:'work/checks.txt'}];},/unpassed command/);
 rejected(r=>{r.passedChecks.push({name:'another',args:['tools/other.js'],log:'work/checks.txt'});},/no exact passing evidence/);
 rejected(r=>{write('work/checks.txt','NOT PASS source\nPASS runtime\n');r.files['work/checks.txt']=sum(fs.readFileSync(path.join(temp,'work/checks.txt')));},/no exact passing evidence/);
 rejected(r=>{r.items['op/source-body'].checks=[];},/requires passing checks/);
 rejected(r=>{r.items['op/source-body'].evidence='  ';},/invalid item\/evidence/);
 rejected(r=>{delete r.items['slot/unchanged'].evidenceFiles;},/requires evidenceFiles/);
 rejected(r=>{r.items['op/source-body'].fromBasis='wrong';},/invalid item\/evidence/);
 rejected(r=>{r.items['op/source-body'].decision='preserve-all';},/invalid item\/evidence/);
 rejected(r=>{r.schemaVersion=2;},/schemaVersion/);
 // Registry metadata is read from the hashed file, never an earlier require
 // cache; command arguments cannot be accepted against an obsolete registry.
 rejected(r=>{input['tools/check_game.js']="module.exports={checks:[['runtime',['tools/check.js','--source-only']]]};";write('tools/check_game.js',input['tools/check_game.js']);r.files['tools/check_game.js']=sum(input['tools/check_game.js']);},/name\/args do not match registry/);
 console.log('CHECKLIST RECEIPT OK: exact file hashes, registry/log evidence, full argument identity, dual basis, immutable loaded receipt, explicit unaffected scope and unknown refusal');
}finally{
 const resolved=fs.realpathSync(temp),parent=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(resolved).toLowerCase(),parent.toLowerCase());assert.ok(path.basename(resolved).startsWith('ark-checklist-receipt-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}
