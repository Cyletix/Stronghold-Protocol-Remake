'use strict';
// A selector, not a checklist writer. --run uses only read-only check commands.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {selectImpact,hash}=require('./lib/implementation-contracts');
const project=path.resolve(__dirname,'..'),manifestName='.impact-baseline.json';
function relativeFile(value,root){
 const absolute=path.resolve(root,value),relative=path.relative(root,absolute).replace(/\\/g,'/');
 if(!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw Error('File must be inside the project: '+value);
 return relative;
}
function git(root,args,allowMissing=false){
 const result=spawnSync('git',['-c','core.quotepath=false',...args],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,windowsHide:true});
 if(result.error||result.status!==0){if(allowMissing&&result.status===128)return null;throw Error(result.error?.message||result.stderr.trim()||'Git failed');}
 return result.stdout;
}
function gitFiles(root,base){
 const changed=git(root,['diff','--name-only','-z',...(base==='INDEX'?[]:[base]),'--']);
 const untracked=git(root,['ls-files','--others','--exclude-standard','-z']);
 return [...new Set((changed+untracked).split('\0').filter(Boolean))].sort();
}
function readCurrent(root,p){const full=path.join(root,p);return fs.existsSync(full)&&fs.statSync(full).isFile()?fs.readFileSync(full,'utf8'):null;}
function beforeGit(root,base,p){
 const ref=base==='INDEX'?':'+p:base+':'+p;
 return git(root,['show',ref],true);
}
function loadAcceptanceMap(root){
 for(const relative of ['work/checklist-acceptance-map.json','work/heal-event-checklist-revalidation.json'])if(fs.existsSync(path.join(root,relative))){
  const data=JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
  if(!Array.isArray(data.mapped)||data.mapped.some(v=>typeof v.id!=='string'||!Array.isArray(v.tests)||v.tests.some(t=>typeof t!=='string')))throw Error('Invalid acceptance navigation');
  return {source:relative+' (navigation only)',rows:data.mapped};
 }
 const current=path.join(root,'docs/checklists/implementation-checklist.json');
 if(!fs.existsSync(current))return {source:'none; contract checks remain active',rows:[]};
 const data=JSON.parse(fs.readFileSync(current,'utf8'));
 return {source:'docs/checklists/implementation-checklist.json records (navigation only)',rows:(data.tasks||[]).filter(t=>t.checked).map(t=>({id:t.id,tests:[...new Set((t.notes||[]).join('\n').match(/tools\/[\w/-]+\.js/g)||[])]}))};
}
function parseArgs(args){
 const options={action:'list',base:'HEAD',files:[]};let action=false;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(['--list','--run','--snapshot'].includes(arg)){
   if(action)throw Error('Choose one of --list, --run or --snapshot');action=true;options.action=arg.slice(2);
   if(arg==='--snapshot'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('--snapshot requires a directory');options.snapshot=args[++i];}
  }else if(['--base','--before','--output'].includes(arg)){
   if(!args[i+1]||args[i+1].startsWith('--'))throw Error(arg+' requires a value');options[arg.slice(2)]=args[++i];
  }else if(arg==='--files'){
   const start=options.files.length;while(args[i+1]&&!args[i+1].startsWith('--'))options.files.push(args[++i]);if(options.files.length===start)throw Error('--files requires one or more project paths');
  }else if(arg==='--json')options.json=true;
  else if(arg==='--help')options.help=true;
  else throw Error('Unknown option '+arg);
 }
 if(options.before&&options.base!=='HEAD')throw Error('--before and --base are mutually exclusive');
 if(options.action==='snapshot'&&!options.files.length)throw Error('--snapshot requires --files; explicitly capture the intended batch');
 return options;
}
function readChanges(options,root=project){
 let files=options.files.map(p=>relativeFile(p,root)),manifest=null,beforeDir=null;
 if(options.before){
  beforeDir=path.resolve(root,options.before);const p=path.join(beforeDir,manifestName);
  if(fs.existsSync(p)){manifest=JSON.parse(fs.readFileSync(p,'utf8'));if(manifest.version!==1||!manifest.files||Array.isArray(manifest.files))throw Error('Unsupported impact baseline');}
  if(!files.length){if(!manifest)throw Error('--before without a manifest requires explicit --files');files=Object.keys(manifest.files).map(p=>relativeFile(p,root));}
 }else {
  // Validate the base once. A missing file is a real addition; a bad ref is not.
  git(root,['rev-parse','--verify',options.base==='INDEX'?'HEAD':options.base]);
  if(!files.length)files=gitFiles(root,options.base);
 }
 const changes=[];
 for(const p of [...new Set(files)].sort()){
  const after=readCurrent(root,p);let before;
  if(beforeDir){
   if(manifest&&Object.hasOwn(manifest.files,p)){
    const expected=manifest.files[p];before=expected===null?null:readCurrent(beforeDir,p);
    if(hash(before)!==expected)throw Error('Baseline copy missing or modified: '+p);
   }else {const file=path.join(beforeDir,p);before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):undefined;}
  }else before=beforeGit(root,options.base,p);
  changes.push({path:p,before,after});
 }
 return changes;
}
function snapshot(options,root=project){
 const directory=path.resolve(root,options.snapshot),manifest={version:1,files:{}};
 if(fs.existsSync(path.join(directory,manifestName)))throw Error('Baseline already exists; choose a fresh directory');
 const pending=[...new Set(options.files.map(p=>relativeFile(p,root)))].sort().map(p=>({p,text:readCurrent(root,p)}));
 for(const {p,text}of pending){const dest=path.resolve(directory,p);if(!dest.startsWith(directory+path.sep))throw Error('Invalid snapshot destination');if(fs.existsSync(dest))throw Error('Refusing to overwrite baseline copy '+p);manifest.files[p]=hash(text);}
 fs.mkdirSync(directory,{recursive:true});
 for(const {p,text}of pending)if(text!==null){const dest=path.join(directory,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
 fs.writeFileSync(path.join(directory,manifestName),JSON.stringify(manifest,null,2)+'\n');
 return {directory,files:pending.length,manifest:manifestName};
}
function main(args=process.argv.slice(2),{root=project,checks,runChecks,report=console.log}={}){
 const options=parseArgs(args);
 if(options.help){report('node tools/check_impact.js [--list|--run] [--base HEAD|INDEX|<ref> | --before <directory>] [--files <paths...>] [--json] [--output <json>]\nnode tools/check_impact.js --snapshot <new-directory> --files <paths...>\nDefault: compare working files (including untracked files) with HEAD. Snapshot manifest records absent paths for later additions. --before without a manifest requires --files; missing copies are unknown, not assumed new. No checklist state is changed.');return 0;}
 if(options.action==='snapshot'){report(JSON.stringify(snapshot(options,root)));return 0;}
 if(!checks||!runChecks){const runner=require('./check_game');checks??=runner.checks;runChecks??=runner.runChecks;}
 const navigation=loadAcceptanceMap(root),changes=readChanges(options,root);
 const result=selectImpact({changes,checks,acceptanceMap:navigation.rows});
 result.baseline=options.before?{directory:options.before}:{git:options.base};result.acceptanceMapSource=navigation.source;
 if(options.output){const dest=path.resolve(root,options.output);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');}
 if(options.json)report(JSON.stringify(result,null,2));
 else {
  report('IMPACT '+result.changes.length+' changed files; '+result.contracts.length+' contracts; '+result.checks.length+'/'+checks.length+' checks');
  for(const event of result.changes)report('CHANGE '+event.path+' ['+event.kind+'] '+event.reasons.join('; '));
  for(const row of result.checks)report('CHECK '+row.name+': node '+row.args.join(' ')+'\n  '+row.reasons.join('\n  '));
  if(result.unregisteredTests.length)report('UNREGISTERED '+result.unregisteredTests.join(', '));
 }
 if(result.unregisteredTests.length){if(options.action==='run')throw Error('Required contract tests are not registered; add them to check_game before running');return 2;}
 return options.action==='run'?runChecks(result.checks.map(c=>[c.name,c.args]),{report}):0;
}
if(require.main===module)try{process.exitCode=main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={relativeFile,gitFiles,loadAcceptanceMap,parseArgs,readChanges,snapshot,main};
