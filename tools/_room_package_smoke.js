'use strict';
// Run against an extracted distribution, with Node removed from the child PATH.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
async function main(){
  assert.equal(process.platform,'win32','Windows package acceptance runs on Windows');
  const packageRoot=path.resolve(process.argv[2]||'');
  assert.ok(process.argv[2]&&fs.existsSync(path.join(packageRoot,'package-info.json')),'pass an extracted package directory');
  const meta=JSON.parse(fs.readFileSync(path.join(packageRoot,'package-info.json'),'utf8'));
  assert.equal(meta.bundledNode,true);
  const required=[meta.entry,'tools/start-room.ps1','tools/start-room.js','tools/room_server.js','tools/lib/listen-port.js',`.runtime/node-win-${meta.architecture}/node.exe`,`.runtime/node-win-${meta.architecture}/LICENSE`];
  if(meta.role!=='join')required.push('web/room-lab.html','web/solo-session.js','web/src/rules/run-setup.js','web/source_battles.json','web/garrison_data.json');
  if(meta.bundledEasyTier){
    assert.equal(meta.role,'universal');
    assert.ok(!fs.existsSync(path.join(packageRoot,'online-room.json')),'no shared network credentials in distribution');
    assert.ok(!fs.existsSync(path.join(packageRoot,'user-config.json')),'recipient starts with their own profile, not the packager profile');
    assert.ok(!fs.existsSync(path.join(packageRoot,'Start-Online.cmd')),'one recipient entry');
    required.push('tools/room-online.js','tools/room-launcher.js','tools/lib/game-process.psm1','tools/lib/launcher-windows.js','web/launcher-window.js','tools/lib/room-share-code.js','tools/lib/room-profile.js','tools/lib/room-web-client.js','web/room-presence.js','web/room-start.html','web/room-start.js','tools/lib/room-easytier.psm1',`.runtime/easytier-v2.6.4-${meta.architecture}/easytier-core.exe`);
  }
  required.forEach(p=>assert.ok(fs.statSync(path.join(packageRoot,p)).isFile(),p));
  for(const name of ['data','work','.git','.agents','.codex','assets'])assert.ok(!fs.existsSync(path.join(packageRoot,name)),'research data excluded: '+name);
  const windows=process.env.SystemRoot||'C:\\Windows',system32=path.join(windows,'System32');
  const powershell=path.join(system32,'WindowsPowerShell','v1.0','powershell.exe');
  const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
  env.PATH=[system32,windows,path.dirname(powershell)].join(';');
  const setup=spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(packageRoot,'tools/start-room.ps1'),'-CheckOnly'],{cwd:system32,env,windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(setup.status,0,setup.stderr||setup.stdout||setup.error?.message);
  assert.match(setup.stdout,/\.runtime[\\/]node-win-/,'uses bundled runtime without a system Node');
  assert.ok(!/nodejs\.org|SHASUMS256/.test(setup.stdout),'cached runtime starts without download');
  if(meta.role==='join'){
    assert.ok(!fs.existsSync(path.join(packageRoot,'web')),'joining package does not ship game assets');
    const check=spawnSync(path.join(packageRoot,`.runtime/easytier-v2.6.4-${meta.architecture}/easytier-core.exe`),['--version'],{cwd:system32,env,windowsHide:true,encoding:'utf8',timeout:10000});
    assert.equal(check.status,0,check.stderr);assert.match(check.stdout,/2\.6\.4/);
    console.log('ROOM JOIN PACKAGE OK: no system Node; bundled EasyTier/DLLs verified; no game asset dependency');return;
  }
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const child=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(packageRoot,'tools/start-room.ps1'),'-LocalOnly','-NoBrowser','-BindAddress','127.0.0.1','-Port',String(port)],{cwd:system32,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',localUrl;
  try{
    localUrl=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Package startup timeout: '+output)),30000);
      const read=chunk=>{output+=chunk.toString();const m=output.match(/http:\/\/127\.0\.0\.1:\d+\/room-lab\.html/);if(m){clearTimeout(timeout);resolve(m[0]);}};
      child.stdout.on('data',read);child.stderr.on('data',read);
      child.once('error',e=>{clearTimeout(timeout);reject(e);});
      child.once('exit',code=>{clearTimeout(timeout);reject(Error('Package exited '+code+': '+output));});
    });
    const lobby=await fetch(localUrl,{signal:AbortSignal.timeout(15000)});assert.equal(lobby.status,200);assert.match(await lobby.text(),/同盟大厅/);
    const room=await (await fetch(new URL('/api/room-info',localUrl))).json();assert.equal(room.capacity,4);
    const response=await fetch(new URL('/api/game-info',localUrl),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
    const game=await response.json();assert.ok(game.gameVersion);assert.ok(game.catalogVersion||game.catalogFingerprint||game.catalog,'game catalog loaded from package');
    console.log('ROOM PACKAGE OK bundled Node '+meta.architecture+', no system Node, unrelated CWD, actual lobby and game runtime');
    console.log('ROOM PACKAGE ID '+JSON.stringify({gameVersion:game.gameVersion,catalog:game.catalogVersion||game.catalogFingerprint||game.catalog}));
  }finally{
    // The direct child handle avoids WMI/taskkill and cannot target unrelated rooms.
    if(child.pid&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  }
  if(meta.bundledEasyTier){
    // This is the default path used by 开始游戏.cmd. Do not supply a free port or
    // -LocalOnly: a passing LAN check cannot prove the real 8100 launcher starts.
    const launcher=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(packageRoot,'tools/start-room.ps1'),'-NoBrowser'],{cwd:system32,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let launcherOutput='';
    try{
      const homeUrl=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Default package launcher timeout: '+launcherOutput)),30000);
        const read=chunk=>{launcherOutput+=chunk.toString();const m=launcherOutput.match(/http:\/\/127\.0\.0\.1:\d+(?:\/)?(?=\s|$)/);if(m){clearTimeout(timeout);resolve(m[0]);}};
        launcher.stdout.on('data',read);launcher.stderr.on('data',read);
        launcher.once('error',e=>{clearTimeout(timeout);reject(e);});
        launcher.once('exit',code=>{clearTimeout(timeout);reject(Error('Default package launcher exited '+code+': '+launcherOutput));});
      });
      const home=await fetch(homeUrl,{signal:AbortSignal.timeout(15000)});assert.equal(home.status,200);
      const html=await home.text(),key=html.match(/name="launcher-key" content="([a-f0-9]{48})"/);
      assert.ok(key,'default launcher serves the actual game homepage with its session key');
      assert.match(html,/home-session\.js/,'game homepage, not only a launcher readiness response');
      const status=await fetch(new URL('/api/status',homeUrl),{headers:{'x-launcher-key':key[1]},signal:AbortSignal.timeout(15000)});
      assert.equal(status.status,200);assert.equal((await status.json()).phase,'idle');
      const solo=await fetch(new URL('/room-lab.html?mode=solo',homeUrl),{signal:AbortSignal.timeout(15000)});
      assert.equal(solo.status,200);assert.match(await solo.text(),/solo-session\.js/,'single-player configuration page is served by the default launcher');
      assert.ok(!/nodejs\.org|SHASUMS256/.test(launcherOutput),'default startup uses the packaged runtime without download');
      console.log('ROOM DEFAULT PACKAGE LAUNCHER OK preferred 8100 -> '+new URL(homeUrl).port+', no system Node, unrelated CWD, actual homepage, authenticated status and solo page');
    }finally{
      if(launcher.pid&&launcher.exitCode===null)await new Promise(resolve=>{launcher.once('exit',resolve);launcher.kill();});
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
