from pathlib import Path
import concurrent.futures, hashlib, json, urllib.request

repo = 'Yilegendoflink/garrison-protocol'
commit = '96e5b3382d0a3b6180739ab1ac0da8bdbf956c02'
base = Path('work/external-ready-data-20260914/Yilegendoflink-garrison-protocol')
prefix = 'data/prts/snapshots/2026-09-12-prts/'
expected = {
    'operators.json': (11744024, 'd71fecea054d303c9c6599e3f806b54b0ce906dbd6c50b13b8a3517e6c7523b6'),
    'enemies.json': (11929168, 'ab16bab6bf9c232fcae7ced2181c5c2c83cd80625416e833cf0cf85948a348d5'),
    'summons.json': (360861, 'dd15d02279826840a283c7f5c0baf4cf4b3dbe93eab72e798866c5a63c3fe68a'),
    'manifest.json': (218217, '8ef512922532d36fe7d9a929a58f664a84c6d78bfd249c4347151ba1851a5750'),
}
paths = [prefix + name for name in [*expected, 'coverage.json', 'inventory.json']]
paths += ['data/prts/README.md', 'scripts/prts-parser.mjs']

def fetch(name):
    dest = base / 'snapshot' / name
    url = f'https://raw.githubusercontent.com/{repo}/{commit}/{name}'
    if dest.exists():
        blob = dest.read_bytes()
    else:
        req = urllib.request.Request(url, headers={'User-Agent': 'ArknightsResearch-source-audit'})
        with urllib.request.urlopen(req, timeout=60) as response:
            blob = response.read()
    sha = hashlib.sha256(blob).hexdigest()
    if name.startswith(prefix) and name[len(prefix):] in expected:
        size, wanted = expected[name[len(prefix):]]
        if len(blob) != size or sha != wanted:
            raise ValueError(f'Independent checksum mismatch: {name}')
    if name.endswith('.json'):
        json.loads(blob)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(blob)
    return {'path': name, 'url': url, 'bytes': len(blob), 'sha256': sha}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    files = list(pool.map(fetch, paths))
manifest = {'repository': f'https://github.com/{repo}', 'commit': commit,
            'scope': 'PRTS normalized snapshots, provenance and parser source; no external code executed', 'files': files}
(base / 'download-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'files': len(files), 'bytes': sum(row['bytes'] for row in files), 'manifest': str(base / 'download-manifest.json')}))
