'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function wait(check,label){for(let n=0;n<200;n++){if(check())return;await pause(50);}throw Error('Timeout: '+label);}
async function main(){
 assert.equal(process.platform,'win32');const dir=fs.mkdtempSync(path.resolve('.runtime/process-job-')),pidFile=path.join(dir,'children.json'),childScript=path.join(dir,'child.js'),wrapper=path.join(dir,'job.ps1');let owner,pids=[];
 try{
  fs.writeFileSync(childScript,"const {spawn}=require('node:child_process'),fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});fs.writeFileSync(process.argv[2],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);");
  const q=s=>"'"+s.replaceAll("'","''")+"'";
  fs.writeFileSync(wrapper,"Import-Module "+q(path.resolve('tools/lib/game-process.psm1'))+" -Force\n$code = Start-OwnedGameProcess -Executable "+q(process.execPath)+" -Arguments @("+q(childScript)+","+q(pidFile)+") -WorkingDirectory "+q(dir)+"\nexit $code\n",'utf8');
  owner=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper],{windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';owner.stdout.on('data',s=>log+=s);owner.stderr.on('data',s=>log+=s);
  await wait(()=>{if(owner.exitCode!==null)throw Error(log);return fs.existsSync(pidFile);},'owned descendants');pids=JSON.parse(fs.readFileSync(pidFile));assert.ok(pids.every(alive));
  // Simulate a forced launcher/console termination. Only the handle we created.
  owner.kill();await wait(()=>pids.every(pid=>!alive(pid)),'Windows job cleanup after parent kill');
  console.log('GAME PROCESS OK: forcibly terminating the owned PowerShell launcher removes both Node descendants via its Windows job');
 }finally{if(owner&&owner.exitCode===null)owner.kill();for(const pid of pids)if(alive(pid))process.kill(pid);for(const f of [pidFile,childScript,wrapper])if(fs.existsSync(f))fs.unlinkSync(f);fs.rmdirSync(dir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
