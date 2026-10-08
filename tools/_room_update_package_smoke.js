'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function ps(script){const result=spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout;}
function put(folder,name,value){const file=path.join(folder,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
function hashes(folder){const result={};function visit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())visit(file);else result[path.relative(folder,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}visit(folder);return result;}
function main(){
 assert.equal(process.platform,'win32');fs.mkdirSync(dist,{recursive:true});const fixture=fs.mkdtempSync(path.join(dist,'update-smoke-'));
 const base=path.join(fixture,'旧通用包'),next=path.join(fixture,'新版通用包'),applied=path.join(fixture,'覆盖验收'),zip=path.join(fixture,'小更新.zip');
 const packageScript=path.join(root,'tools/package-room-update.ps1');
 const invoke=(basePath=base,newPath=next,outputPath=zip)=>spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',packageScript,'-BasePath',basePath,'-NewPath',newPath,'-OutputPath',outputPath],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
 try{
  for(const folder of [base,next]){
   put(folder,'package-info.json',JSON.stringify({role:'universal',platform:'Windows',architecture:'x64',entry:'开始游戏.cmd',createdAt:folder===base?'old':'new'}));
   put(folder,'开始游戏.cmd','same launcher');put(folder,'web/保留.png',Buffer.alloc(1024*1024,7));put(folder,'web/game.js',folder===base?'old code':'new code');
   put(folder,'web/中文数据.json',folder===base?'old data':'new data');
   put(folder,'user-config.json',folder===base?'KEEP MY NAME AND PORTRAIT':'DO NOT DISTRIBUTE NEW PROFILE');
   put(folder,'.user-config.123.tmp','private temporary');put(folder,'online-room.json','secret');put(folder,'.runtime/online-room.json','another secret');
  }
  put(base,'room-session.json','private old-only session');put(next,'tools/lib/new-client.js','new helper');
  const oldHashes=hashes(base),newHashes=hashes(next);
  const generated=invoke();assert.equal(generated.status,0,generated.stderr||generated.stdout);assert.ok(fs.statSync(zip).size<10000,'unchanged one-megabyte image is omitted');assert.ok(fs.existsSync(zip+'.sha256'));
  assert.deepEqual(hashes(base),oldHashes,'old distribution remains unchanged');assert.deepEqual(hashes(next),newHashes,'new distribution remains unchanged');
  fs.cpSync(base,applied,{recursive:true});
  const entries=JSON.parse(ps(`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.IO.Compression.FileSystem;$archive=[IO.Compression.ZipFile]::OpenRead(${quote(zip)});$folder=[IO.Path]::GetFullPath(${quote(applied)});$names=@();try{foreach($entry in $archive.Entries){$names+=$entry.FullName;$destination=[IO.Path]::GetFullPath((Join-Path $folder $entry.FullName));if(-not $destination.StartsWith($folder+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'escape'};[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))|Out-Null;$inputStream=$entry.Open();$outputStream=[IO.File]::Create($destination);try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose();$inputStream.Dispose()}}}finally{$archive.Dispose()};ConvertTo-Json -InputObject $names -Compress`));
  assert.ok(entries.includes('package-info.json'));assert.ok(entries.includes('tools/lib/new-client.js'));assert.ok(entries.includes('web/中文数据.json'));assert.ok(!entries.includes('web/保留.png'));
  assert.ok(entries.every(name=>!/(?:^|\/)(?:user-config\.json|\.user-config\.|online-room\.json|room-session\.json)/.test(name)),'all known personal settings and network credentials are excluded');
  const appliedHashes=hashes(applied);
  for(const [name,hash]of Object.entries(newHashes))if(!/(?:^|\/)(?:user-config\.json|\.user-config\.|online-room\.json|room-session\.json)/.test(name))assert.equal(appliedHashes[name],hash,name+' equals complete new package after overlay');
  assert.equal(fs.readFileSync(path.join(applied,'user-config.json'),'utf8'),'KEEP MY NAME AND PORTRAIT');assert.equal(appliedHashes['online-room.json'],oldHashes['online-room.json']);assert.ok(fs.readFileSync(path.join(applied,'卫戍协议-覆盖更新说明.txt'),'utf8').includes('双方都完成更新'));
  const sourceBytes=fs.readFileSync(packageScript);assert.deepEqual([...sourceBytes.subarray(0,3)],[239,187,191],'PowerShell 5.1 reads the Chinese script with a UTF-8 BOM');
  const updateReadme=fs.readFileSync(path.join(applied,'卫戍协议-覆盖更新说明.txt'),'utf8');
  assert.ok(updateReadme.includes('重新双击 开始游戏.cmd'));assert.ok(!updateReadme.includes('Start-Room.cmd'),'instructions use the actual package entry');
  assert.notEqual(invoke(base,next,zip).status,0,'existing output cannot be overwritten');
  const escaped=path.join(fixture,'链接目录');fs.symlinkSync(base,escaped,'junction');assert.notEqual(invoke(escaped,next,path.join(fixture,'link.zip')).status,0,'package roots cannot be junctions');
  assert.notEqual(invoke(root,next,path.join(fixture,'outside.zip')).status,0,'sources outside dist are rejected');
  fs.unlinkSync(path.join(next,'web','game.js'));const removedZip=path.join(fixture,'unsupported-delete.zip');const removed=invoke(base,next,removedZip);assert.notEqual(removed.status,0);assert.ok(!fs.existsSync(removedZip),'a removed source file requires a full package, without creating a misleading update');
  console.log('ROOM UPDATE PACKAGE OK: PS5.1 BOM; small changed/new-only ZIP; full overlay hashes; private profile/credentials preserved; Chinese paths; read-only sources; output collisions; junction/outside-path/deletion rejection');
 }finally{
  const resolved=path.resolve(fixture);assert.ok(resolved.startsWith(path.resolve(dist)+path.sep)&&path.basename(resolved).startsWith('update-smoke-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
}
try{main();}catch(error){console.error(error);process.exitCode=1;}
