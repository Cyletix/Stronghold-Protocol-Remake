"""Fetch only cached enemy animation gaps; parse each content blob once."""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib
import json
import math
from pathlib import Path
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / 'work/external-enemy-animations/ark-models'
OUTPUT = ROOT / 'work/enemy-animation-supplement.json'
REPOSITORY = 'isHarryh/Ark-Models'
PARSER = 'spine-asset-1.1.1-big-endian-v1'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ArknightsResearch-bulk-import'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def source_index():
    if not (STORE / 'source.json').is_file():
        commit = json.loads(get(f'https://api.github.com/repos/{REPOSITORY}/commits/HEAD'))
        sha = commit['sha']
        paths = {'tree.json': f'https://api.github.com/repos/{REPOSITORY}/git/trees/{sha}?recursive=1',
                 'models_data.json': f'https://raw.githubusercontent.com/{REPOSITORY}/{sha}/models_data.json',
                 'README.md': f'https://raw.githubusercontent.com/{REPOSITORY}/{sha}/README.md'}
        STORE.mkdir(parents=True, exist_ok=True)
        for name, url in paths.items():
            (STORE / name).write_bytes(get(url))
        write(STORE / 'source.json', dict(repository=REPOSITORY, commit=sha,
              date=commit['commit']['committer']['date'], urls=paths))
    source, tree, models = read(STORE / 'source.json'), read(STORE / 'tree.json'), read(STORE / 'models_data.json')
    if tree.get('truncated'):
        raise ValueError('Repository tree is truncated; do not declare unmatched resources absent.')
    return source, tree, models


def install_reader():
    """Spine 3.8 fixed-width values are big endian; varints are unchanged.

    spine-asset 1.1.1 defaults these methods to little endian. Keep its installed
    files untouched and replace only this parser module's reader factory.
    Format source: EsotericSoftware/spine-runtimes/3.8/spine-ts/core/src/SkeletonBinary.ts,
    BinaryInput.readFloat/readShort/readInt32 (DataView default big endian).
    """
    from spine_asset.utils import SkeletonBinaryReader
    class Reader(SkeletonBinaryReader):
        def read_float32(self): return struct.unpack('>f', self._stream.read(4))[0]
        def read_int16(self): return struct.unpack('>h', self._stream.read(2))[0]
        def read_int32(self): return struct.unpack('>i', self._stream.read(4))[0]
        def read_uint32(self): return struct.unpack('>I', self._stream.read(4))[0]
    module = importlib.import_module('spine_asset.v38.SkeletonBinary')
    module.SkeletonBinaryReader = Reader
    return module.SkeletonBinary, Reader


def parse_blob(path, parser_type):
    parser = parser_type()
    data = path.read_bytes()
    skeleton = parser.read_skeleton_data(data)
    if not skeleton.version.startswith('3.8.') or parser._reader._stream.tell() != len(data):
        raise ValueError('Unsupported version or incomplete binary parse')
    animations = {}
    for animation in skeleton.animations:
        duration = float(animation.duration)
        if not math.isfinite(duration) or not 0 <= duration <= 3600:
            raise ValueError('Invalid animation duration')
        events = []
        for timeline in animation.timelines:
            if type(timeline).__name__ == 'EventTimeline':
                for frame, event in zip(timeline.frames, timeline.events):
                    time = float(frame)
                    if not math.isfinite(time) or not 0 <= time <= duration + 1e-5:
                        raise ValueError('Event outside animation duration')
                    events.append(dict(event=event.data.name, t=round(time, 7)))
        animations[animation.name] = dict(duration=round(duration, 7), events=events)
    return dict(version=skeleton.version, animations=animations,
                sha256=hashlib.sha256(data).hexdigest(), parser=PARSER)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workers', type=int, default=12)
    ap.add_argument('--retry-errors', action='store_true', help='Retry failed blobs; successful downloads/parses stay cached')
    args = ap.parse_args()
    source, tree, models = source_index()
    request_path = STORE / 'requests.json'
    if request_path.is_file():
        requests = read(request_path)
        if requests['commit'] != source['commit']:
            raise ValueError('Frozen requests belong to another source commit')
    else:
        catalog = read(ROOT / 'work/enemy-action-template-catalog.json')
        files = {Path(row['path']).stem: row for row in tree['tree']
                 if row['path'].startswith('models_enemies/') and row['path'].endswith('.skel')}
        tags = {'spine-source-absent', 'animation-name-unresolved', 'onattack-event-absent'}
        wanted = {key for key, row in catalog['enemies'].items() if row['importGaps'] and tags.intersection(row['tags'])}
        requests = dict(commit=source['commit'], wanted=sorted(wanted),
            matched={key: files[key] for key in sorted(wanted & files.keys())},
            unmatched=sorted(wanted - files.keys()))
        write(request_path, requests)
    parser_type, _ = install_reader()
    blobs = {row['sha']: row for row in requests['matched'].values()}
    parsed_dir, blob_dir = STORE / 'parsed' / PARSER, STORE / 'blobs'
    parsed_dir.mkdir(parents=True, exist_ok=True); blob_dir.mkdir(parents=True, exist_ok=True)

    def process(item):
        sha, row = item
        cache = parsed_dir / (sha + '.json')
        if cache.is_file():
            cached = read(cache)
            if not (args.retry_errors and cached.get('error')):
                return sha, cached, True
        try:
            local = blob_dir / (sha + '.skel')
            if not local.is_file():
                data = get(f'https://raw.githubusercontent.com/{REPOSITORY}/{source["commit"]}/{row["path"]}')
                if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() != sha:
                    raise ValueError('Git blob mismatch')
                local.write_bytes(data)
            result = parse_blob(local, parser_type)
        except Exception as error:
            result = dict(error=type(error).__name__, reason=str(error), parser=PARSER)
        write(cache, result)
        return sha, result, False

    results, cached_count = {}, 0
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 16))) as pool:
        futures = [pool.submit(process, item) for item in blobs.items()]
        for future in as_completed(futures):
            sha, result, cached = future.result()
            results[sha] = result
            cached_count += cached
            if len(results) % 100 == 0:
                print(json.dumps(dict(processed=len(results), total=len(blobs), cached=cached_count)), flush=True)
    enemies, errors = {}, {}
    for key, row in requests['matched'].items():
        parsed = results[row['sha']]
        if parsed.get('error'):
            errors[key] = dict(parsed, path=row['path'])
        else:
            enemies[key] = dict(animations=parsed['animations'], source=dict(path=row['path'],
                gitBlob=row['sha'], sha256=parsed['sha256'], spineVersion=parsed['version']))
    report = dict(schemaVersion=1, source=dict(source,
        gameDataVersion=models['gameDataVersionDescription'], region=models['gameDataServerRegion'],
        license='Game assets copyright Hypergryph; local extraction for research', parser=PARSER),
        counts=dict(wanted=len(requests['wanted']), matched=len(requests['matched']),
                    parsedEnemies=len(enemies), uniqueBlobs=len(blobs), cachedBlobs=cached_count,
                    animations=sum(len(v['animations']) for v in enemies.values()), errors=len(errors)),
        enemies=enemies, errors=errors, unmatched=requests['unmatched'])
    write(OUTPUT, report)
    print(json.dumps(dict(output=str(OUTPUT), counts=report['counts'],
        errors=dict(Counter(e['error'] for e in errors.values()))), ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
