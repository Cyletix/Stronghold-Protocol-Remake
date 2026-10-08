"""Freeze a milestone's runtime files, then verify its full ZIP and portable launcher.

No extraction, deletion, publication, or changes to previous packages. Reuses the
last accepted critical-file list plus explicit --extra files for new consumers.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from datetime import datetime
import zipfile

ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def immutable(p,v):
    if p.exists() and read(p)!=v:raise ValueError('Already frozen: '+str(p))
    write(p,v)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('phase',choices=['freeze','verify']);ap.add_argument('--version',required=True)
    ap.add_argument('--package',type=Path);ap.add_argument('--extra',nargs='*',default=[])
    a=ap.parse_args();assert re.fullmatch(r'\d{8}\.\d+',a.version)
    manifest=ROOT/f'work/garrison-skill-batch-package-source-{a.version}.json'
    if a.phase=='freeze':
        old=read(ROOT/'work/garrison-skill-batch-package.json')
        paths=list(dict.fromkeys([v['path'] for v in old['criticalFileChecks']]+a.extra))
        assert all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in paths)
        game='room-game-'+a.version
        for p in ['tools/room_server.js','web/room-game.js','web/room-presence.js']:assert game in (ROOT/p).read_text(encoding='utf-8')
        catalog=subprocess.check_output(['node','-e',"require('./tools/lib/room-game-runtime').catalogInfo().then(x=>console.log(x.catalog))"],cwd=ROOT,text=True).strip()
        v=dict(schemaVersion=1,capturedAt=datetime.now().astimezone().isoformat(),gameVersion=game,catalog=catalog,
               files={p:dict(sha256=sha((ROOT/p).read_bytes()),bytes=(ROOT/p).stat().st_size) for p in paths})
        immutable(manifest,v)
        immutable(ROOT/f'work/garrison-skill-batch-report-source-{a.version}.json',read(ROOT/'work/garrison-skill-batch-report.json'))
        print(json.dumps(dict(manifest=str(manifest),catalog=catalog,files=len(paths))))
        return
    assert a.package
    package=a.package.resolve();assert package.parent==ROOT/'dist' and package.is_dir()
    frozen=read(manifest);archive=package.with_suffix('.zip');digest=sha(archive.read_bytes())
    assert archive.with_suffix('.zip.sha256').read_text(encoding='utf-8-sig').split()[0]==digest
    checks=[]
    with zipfile.ZipFile(archive) as z:
        entries={i.filename.replace('\\','/'):i for i in z.infolist()}
        for p,v in frozen['files'].items():
            assert sha((package/p).read_bytes())==v['sha256']==sha(z.read(entries[p])),p
            checks.append(dict(path=p,sha256=v['sha256'],sourcePackageZipMatch=True))
        count=len(entries)
    meta=read(package/'package-info.json');assert meta['bundledNode'] and meta['bundledEasyTier'] and meta['role']=='universal'
    node=package/'.runtime/node-win-x64/node.exe'
    command=[str(node),str(ROOT/'tools/_room_package_smoke.js'),str(package)]
    run=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=180)
    log=run.stdout+run.stderr;print(log,end='')
    logpath=ROOT/f'work/garrison-skill-batch-package-smoke-{a.version}.log';logpath.write_text(log,encoding='utf-8')
    assert run.returncode==0,log
    identity=json.loads(re.search(r'ROOM PACKAGE ID (\{[^\n]+\})',log)[1])
    assert identity=={k:frozen[k] for k in ['gameVersion','catalog']}
    receipt=dict(schemaVersion=1,createdAt=datetime.now().astimezone().isoformat(),gameVersion=frozen['gameVersion'],catalog=frozen['catalog'],
        sourceManifest=str(manifest),sourceFrozenAt=frozen['capturedAt'],packageDirectory=str(package),
        fullPackage=dict(path=str(archive),bytes=archive.stat().st_size,sha256=digest,sidecarMatches=True,zipEntries=count),metadata=meta,
        criticalFileChecks=checks,acceptance=dict(command=command,passed=True,logPath=str(logpath),log=log),
        scope='Full Universal ZIP, frozen source/directory/ZIP critical hashes and actual default portable launcher. Previous packages retained.')
    write(ROOT/'work/garrison-skill-batch-package.json',receipt)
    print(json.dumps(dict(package=str(archive),sha256=digest,criticalFiles=len(checks)),ensure_ascii=False))

if __name__=='__main__':main()
