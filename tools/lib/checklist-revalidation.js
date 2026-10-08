'use strict';
// Central receipts renew an existing, explicitly named acceptance scope. They
// neither infer completion nor edit checklist text. Load once per generation
// against frozen inputs; canPreserve is O(1), not another file hash per item.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const validated=new WeakMap(),registryFile='tools/check_game.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonempty=v=>typeof v==='string'&&v.trim().length>0&&!/[\r\n\0]/.test(v);
const basis=v=>typeof v==='string'&&/^[a-f0-9]{16,64}$/.test(v);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(message){throw Error('Invalid checklist receipt: '+message);}
function projectPath(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.includes('\0')||path.posix.isAbsolute(value)||path.win32.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..')||/^[a-z]:/i.test(value))fail('non-canonical project path '+JSON.stringify(value));
 return value;
}
function readInside(root,p){
 const filename=path.join(root,projectPath(p));let resolved;
 try{resolved=fs.realpathSync(filename);}catch{fail('missing file '+p);}
 const relative=path.relative(root,resolved);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('file escapes project '+p);
 if(!fs.statSync(resolved).isFile())fail('not a file '+p);
 return fs.readFileSync(resolved);
}
function command(value,label){
 if(!object(value)||!nonempty(value.name)||!Array.isArray(value.args)||!value.args.length||value.args.some(v=>typeof v!=='string'||/[\r\n\0]/.test(v)))fail('invalid command '+label);
 projectPath(value.args[0]);if(!/\.(?:js|cjs|mjs)$/.test(value.args[0]))fail('command is not a registered Node check '+label);
 return JSON.stringify([value.name,value.args]);
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function loadReceipt(root,receiptPath){
 const base=fs.realpathSync(path.resolve(root));
 let relative=receiptPath;if(path.isAbsolute(receiptPath))relative=path.relative(base,path.resolve(receiptPath)).replace(/\\/g,'/');
 let receipt;try{receipt=JSON.parse(readInside(base,relative).toString('utf8'));}catch(e){if(e.message.startsWith('Invalid checklist receipt:'))throw e;fail('unreadable JSON '+relative);}
 if(!object(receipt)||receipt.schemaVersion!==1||!object(receipt.files)||!Array.isArray(receipt.passedChecks)||!object(receipt.items))fail('schemaVersion/files/passedChecks/items');
 const bytes=new Map();
 for(const [p,expected]of Object.entries(receipt.files)){
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))fail('invalid SHA256 '+p);
  const content=readInside(base,p);if(sha(content)!==expected)fail('stale SHA256 '+p);bytes.set(p,content);
 }
 if(!bytes.has(registryFile))fail('files must cover '+registryFile);
 // Compile the exact hashed registry bytes, avoiding a stale require cache.
 // check_game exports metadata and does not run checks when imported.
 const filename=path.join(base,registryFile),registry=new Module(filename,module);registry.filename=filename;registry.paths=Module._nodeModulePaths(path.dirname(filename));
 try{registry._compile(bytes.get(registryFile).toString('utf8'),filename);}catch(e){fail('cannot read check registry: '+e.message);}
 if(!Array.isArray(registry.exports.checks))fail('missing check registry');
 const registered=new Set(registry.exports.checks.map(([name,args])=>command({name,args},'registry')));
 const passed=new Map(),logs=new Map();
 for(const entry of receipt.passedChecks){
  const key=command(entry,'passedChecks');if(passed.has(key))fail('duplicate passed command '+entry.name);
  if(!registered.has(key))fail('command name/args do not match registry: '+entry.name);
  if(!bytes.has(entry.args[0]))fail('files must cover check code '+entry.args[0]);
  const log=projectPath(entry.log);if(!bytes.has(log))fail('files must cover log '+log);
  if(!logs.has(log))logs.set(log,new Set(bytes.get(log).toString('utf8').split(/\r?\n/)));
  if(!logs.get(log).has('PASS '+entry.name))fail('no exact passing evidence for '+entry.name);
  passed.set(key,entry);
 }
 const decisions=new Map();
 for(const [id,item]of Object.entries(receipt.items)){
  if(!nonempty(id)||!object(item)||!basis(item.fromBasis)||!basis(item.toBasis)||!['revalidated','unaffected','needs-review'].includes(item.decision)||!nonempty(item.evidence))fail('invalid item/evidence '+id);
  const references=item.checks??[];if(!Array.isArray(references))fail('checks must be an array '+id);
  const keys=new Set();for(const reference of references){const key=command(reference,id);if(keys.has(key))fail('duplicate evidence command '+id);keys.add(key);if(!passed.has(key))fail('item requires an unpassed command '+id);}
  if(item.decision==='revalidated'&&!references.length)fail('revalidated item requires passing checks '+id);
  const evidenceFiles=item.evidenceFiles??[];
  if(!Array.isArray(evidenceFiles)||evidenceFiles.some(p=>typeof p!=='string'||!bytes.has(p)))fail('unknown evidence file '+id);
  if(item.decision==='unaffected'&&!evidenceFiles.length)fail('unaffected item requires evidenceFiles '+id);
  if(item.decision!=='needs-review')decisions.set(id,{fromBasis:item.fromBasis,toBasis:item.toBasis});
 }
 // The returned object is inspectable but cannot be edited or serialized and
 // re-used as authorization. A new process/run must call loadReceipt again.
 freeze(receipt);validated.set(receipt,{decisions});return receipt;
}
function canPreserve(receipt,{id,fromBasis,toBasis}={}){
 if(!object(receipt)||!nonempty(id)||!basis(fromBasis)||!basis(toBasis))return false;
 const row=validated.get(receipt)?.decisions.get(id);
 return !!row&&row.fromBasis===fromBasis&&row.toBasis===toBasis;
}
module.exports={loadReceipt,canPreserve};
