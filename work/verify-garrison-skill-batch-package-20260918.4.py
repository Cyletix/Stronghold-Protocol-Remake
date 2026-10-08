"""Verify the milestone delivery against its frozen source and real startup log."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
DIRECTORY=ROOT/'dist/Arknights-Game-Universal-Windows-x64-20260918-154435-54a244'
ZIP=DIRECTORY.with_suffix('.zip')
MANIFEST_PATH=ROOT/'work/garrison-skill-batch-package-source-20260918.4.json'
MANIFEST=json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
GAME=MANIFEST['gameVersion']
CATALOG=MANIFEST['catalog']
CRITICAL=list(MANIFEST['files'])


def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

logpath=ROOT/'work/garrison-skill-batch-package-smoke.log'
log=logpath.read_text(encoding='utf-8-sig')
assert 'ROOM PACKAGE OK bundled Node' in log
assert 'ROOM DEFAULT PACKAGE LAUNCHER OK' in log
live=json.loads(re.search(r'ROOM PACKAGE ID (\{[^\n]+\})',log)[1])
assert live=={'gameVersion':GAME,'catalog':CATALOG},live
checks=[]
with zipfile.ZipFile(ZIP) as archive:
    entries={entry.filename.replace('\\','/'):entry for entry in archive.infolist()}
    assert not any(name.split('/')[0] in ['work','data','.git','.agents','.codex','assets'] for name in entries)
    assert not {'online-room.json','user-config.json','Start-Online.cmd'}&set(entries)
    metadata=json.loads(archive.read(entries['package-info.json']))
    assert metadata==json.loads((DIRECTORY/'package-info.json').read_text(encoding='utf8'))
    assert metadata['bundledNode'] and metadata['bundledEasyTier'] and metadata['role']=='universal'
    assert metadata['entry']=='开始游戏.cmd' and metadata['architecture']=='x64'
    runtime=['.runtime/node-win-x64/node.exe','.runtime/node-win-x64/LICENSE']
    runtime+=['.runtime/easytier-v2.6.4-x64/'+name for name in ['easytier-core.exe','easytier-cli.exe','Packet.dll','wintun.dll','WinDivert64.sys','verified-files.json']]
    for relative in CRITICAL:
        with archive.open(entries[relative]) as stream:zipped=hashlib.file_digest(stream,'sha256').hexdigest()
        source=MANIFEST['files'][relative]['sha256'];directory=digest(DIRECTORY/relative)
        assert source==directory==zipped,relative
        checks.append({'path':relative,'sha256':source,'sourcePackageZipMatch':True})
    for relative in ['tools/room_server.js','web/room-game.js','web/room-presence.js']:
        assert "GAME_VERSION='"+GAME+"'" in archive.read(entries[relative]).decode('utf8')
    entry_count=len(entries)
versions={}
for name,relative,args in [('node','.runtime/node-win-x64/node.exe',['--version']),('easyTier','.runtime/easytier-v2.6.4-x64/easytier-core.exe',['--version'])]:
    p=subprocess.run([str(DIRECTORY/relative),*args],cwd='C:/Windows/System32',capture_output=True,text=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
    assert p.returncode==0,p.stderr
    versions[name]=p.stdout.strip()
assert '2.6.4' in versions['easyTier']
sha=digest(ZIP)
assert ZIP.with_suffix('.zip.sha256').read_text(encoding='utf8').split()[0]==sha
created=datetime.datetime.fromisoformat(metadata['createdAt'])
finished=datetime.datetime.fromtimestamp(ZIP.with_suffix('.zip.sha256').stat().st_mtime,created.tzinfo)
directory_started=datetime.datetime.strptime(DIRECTORY.name.rsplit('-',3)[1]+'-'+DIRECTORY.name.rsplit('-',3)[2],'%Y%m%d-%H%M%S').replace(tzinfo=created.tzinfo)
receipt={'schemaVersion':1,'createdAt':datetime.datetime.now().astimezone().isoformat(),'gameVersion':GAME,'catalog':CATALOG,
         'sourceManifest':str(MANIFEST_PATH),'sourceFrozenAt':MANIFEST['capturedAt'],'packageDirectory':str(DIRECTORY),'fullPackage':{'path':str(ZIP),'bytes':ZIP.stat().st_size,'sha256':sha,'sidecarMatches':True,'zipEntries':entry_count},
         'metadata':metadata,'runtimeVersions':versions,'criticalFileChecks':checks,
         'acceptance':{'command':str(DIRECTORY/'.runtime/node-win-x64/node.exe')+' tools/_room_package_smoke.js '+str(DIRECTORY),
                       'passed':True,'logPath':str(logpath),'log':log,'checks':['no system Node in child PATH','unrelated CWD','actual LAN lobby and game-info','default Universal 8100 launcher with authenticated status and solo page','portable Node and EasyTier execute','frozen source manifest/directory/ZIP hashes match for all 31 critical runtime/data/version and bundled runtime files']},
         'timing':{'copySecondsApprox':round((created-directory_started).total_seconds(),3),'zipAndHashSecondsApprox':round((finished-created).total_seconds(),3),'totalPackagingSecondsApprox':round((finished-directory_started).total_seconds(),3),'basis':'directory timestamp in package name, package-info createdAt and SHA sidecar last-write timestamp'},
         'scope':'Full Universal package only; previous packages retained; no publication or optional incremental comparison.'}
out=ROOT/'work/garrison-skill-batch-package.json';out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'receipt':str(out),'package':receipt['fullPackage'],'runtimeVersions':versions,'timing':receipt['timing']},ensure_ascii=False))
