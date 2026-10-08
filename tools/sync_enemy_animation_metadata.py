"""Supplement a frozen animation-gap cohort using explicit Ark-Models assetId mappings.

The original supplement is never changed. Resource names are read from assetList,
not derived from enemy IDs. Downloads and Spine parses reuse the existing blob cache.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import math
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from sync_enemy_animation_data import (
    PARSER, REPOSITORY, ROOT, STORE, get, install_reader, parse_blob, read, source_index, write,
)

OUTPUT = ROOT / 'work/enemy-animation-metadata-supplement.json'
REQUESTS = STORE / 'metadata-requests.json'
GAP_TAGS = {'spine-source-absent', 'animation-name-unresolved'}
JSON_PARSER = 'spine-asset-1.1.1-json-v1'


def load_metadata_supplement(path=OUTPUT):
    path = Path(path)
    return read(path) if path.is_file() else {}


def parse_json_blob(path):
    """Use the same package's JSON decoder for explicitly mapped JSON skeletons."""
    from spine_asset.v38.SkeletonJson import SkeletonJson
    data = path.read_bytes()
    skeleton = SkeletonJson().read_skeleton_data(data)
    if not skeleton.version or not skeleton.version.startswith('3.8.'):
        raise ValueError('Unsupported JSON skeleton version')
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
                sha256=hashlib.sha256(data).hexdigest(), parser=JSON_PARSER)


def resolve_metadata_sources(wanted, models, tree):
    """Join exact assetId, explicit assetList filename, and exact pinned tree path."""
    if tree.get('truncated'):
        raise ValueError('Truncated tree cannot establish resource absence')
    files = {row['path']: row for row in tree['tree'] if row.get('type') == 'blob'}
    index = defaultdict(list)
    for model_key, row in models['data'].items():
        if row.get('type') == 'Enemy' and row.get('assetId') in wanted:
            index[row['assetId']].append((model_key, row))
    directory = models.get('storageDirectory', {}).get('Enemy')
    if not isinstance(directory, str) or not directory:
        raise ValueError('Missing Enemy storageDirectory')
    matched, unresolved = {}, {}
    for enemy_id in sorted(wanted):
        candidates, reasons = [], []
        if enemy_id not in index:
            unresolved[enemy_id] = [{'reason': 'assetId-not-in-metadata'}]
            continue
        for model_key, model in index[enemy_id]:
            asset_list = model.get('assetList') or {}
            names = asset_list.get('.skel', [])
            if isinstance(names, str):
                names = [names]
            if not isinstance(names, list) or not names or any(not isinstance(n, str) or not n for n in names):
                reasons.append(dict(reason='no-explicit-skel-asset', modelKey=model_key, assetList=asset_list))
                continue
            for name in names:
                parts = [PurePosixPath(value) for value in (directory, model_key, name)]
                if any(value.is_absolute() or '..' in value.parts for value in parts):
                    reasons.append(dict(reason='invalid-resource-path', modelKey=model_key, asset=name))
                    continue
                path = str(parts[0] / parts[1] / parts[2])
                row = files.get(path)
                if not row:
                    reasons.append(dict(reason='explicit-asset-not-in-tree', modelKey=model_key, path=path))
                    continue
                candidates.append(dict(assetId=enemy_id, modelKey=model_key, assetList=asset_list,
                                       path=path, gitBlob=row['sha'], size=row.get('size')))
        if candidates:
            matched[enemy_id] = sorted(candidates, key=lambda row: (row['path'], row['gitBlob']))
        if reasons:
            unresolved[enemy_id] = reasons
    return matched, unresolved


def combine_variants(candidates, results):
    """Retain all variants; expose only names whose complete timing agrees in all."""
    variants, errors = [], []
    for row in candidates:
        parsed = results[row['gitBlob']]
        if parsed.get('error'):
            errors.append(dict(source=row, error=parsed['error'], reason=parsed.get('reason')))
            continue
        variants.append(dict(animations=parsed['animations'], source=dict(row,
            sha256=parsed['sha256'], spineVersion=parsed['version'], parser=parsed.get('parser', PARSER))))
    if errors or not variants:
        return None, variants, errors
    by_blob = {row['source']['gitBlob']: row for row in variants}
    unique = list(by_blob.values())
    if len(unique) == 1:
        result = dict(unique[0])
        result['source'] = dict(result['source'], references=[row['source'] for row in variants])
        return result, variants, []
    names = set().union(*(set(row['animations']) for row in unique))
    agreed = {}
    for name in sorted(names):
        values = [row['animations'].get(name) for row in unique]
        if all(value == values[0] for value in values) and values[0] is not None:
            agreed[name] = values[0]
        else:
            errors.append(dict(error='variant-animation-ambiguity', animation=name,
                               reason='Animation absent or timing differs between explicit variants'))
    result = dict(animations=agreed, source=dict(assetId=candidates[0]['assetId'],
        references=[row['source'] for row in variants], agreement='all-explicit-variants')) if agreed else None
    return result, variants, errors


def frozen_requests(source, tree, models, refresh_mapping=False):
    hashes = {name: hashlib.sha256((STORE / name).read_bytes()).hexdigest()
              for name in ('tree.json', 'models_data.json')}
    if REQUESTS.is_file():
        requests = read(REQUESTS)
        if not refresh_mapping and (requests['commit'] != source['commit'] or requests['indexHashes'] != hashes):
            raise ValueError('Frozen metadata requests use different source indexes; explicitly rebuild the cohort')
        if not refresh_mapping:
            return requests
        cohort = requests['cohort']
        catalog_sha256 = requests['catalogSha256']
    else:
        catalog_path = ROOT / 'work/enemy-action-template-catalog.json'
        catalog = read(catalog_path)
        catalog_sha256 = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
        cohort = {}
        for key, row in catalog['enemies'].items():
            if row.get('importGaps') and GAP_TAGS.intersection(row.get('tags', [])):
                evidence = row.get('evidence', {})
                cohort[key] = dict(inEncounterPool=bool(row.get('inEncounterPool')), tags=row['tags'],
                    missingAnimationKeys=evidence.get('missingAnimationKeys', []),
                    animationAliases=evidence.get('animationAliases', []))
    skipped = {key: dict(reason='no-explicit-missing-animation-name',
                         missingAnimationKeys=row['missingAnimationKeys'])
               for key, row in cohort.items()
               if not any(row['missingAnimationKeys']) and 'spine-source-absent' not in row['tags']}
    matched, unresolved = resolve_metadata_sources(set(cohort) - set(skipped), models, tree)
    return dict(schemaVersion=1, commit=source['commit'], indexHashes=hashes,
        catalogSha256=catalog_sha256, cohort=cohort,
        matched=matched, unresolved=unresolved, skipped=skipped)


def main():
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=12)
    parser.add_argument('--retry-errors', action='store_true')
    parser.add_argument('--refresh-mapping', action='store_true',
        help='Rebuild exact metadata joins for the existing frozen cohort, including already integrated members')
    parser.add_argument('--dry-run', action='store_true', help='Report the frozen exact joins without writing or downloading')
    args = parser.parse_args()
    source, tree, models = source_index()
    requests = frozen_requests(source, tree, models, args.refresh_mapping)
    ordered = sorted(requests['matched'], key=lambda key: (not requests['cohort'][key]['inEncounterPool'], key))
    blobs = {}
    for key in ordered:
        for row in requests['matched'][key]:
            blobs.setdefault(row['gitBlob'], row)
    if args.dry_run:
        print(json.dumps(dict(wanted=len(requests['cohort']), mapped=len(requests['matched']),
            skipped=len(requests['skipped']), unresolved=len(requests['unresolved']), uniqueBlobs=len(blobs),
            cachedBlobs=sum((STORE / 'blobs' / (sha + '.skel')).is_file() for sha in blobs)), ensure_ascii=False))
        return
    if not REQUESTS.is_file() or args.refresh_mapping:
        write(REQUESTS, requests)
    parser_type, _ = install_reader()
    parsed_dir, blob_dir = STORE / 'parsed' / PARSER, STORE / 'blobs'
    parsed_dir.mkdir(parents=True, exist_ok=True)
    blob_dir.mkdir(parents=True, exist_ok=True)

    def process(item):
        sha, row = item
        local = blob_dir / (sha + '.skel')
        cache = parsed_dir / (sha + '.json')
        if local.is_file():
            with local.open('rb') as stream:
                is_json = stream.read(32).lstrip().startswith(b'{')
            if is_json:
                cache = STORE / 'parsed' / JSON_PARSER / (sha + '.json')
        if cache.is_file():
            cached = read(cache)
            if not (args.retry_errors and cached.get('error')):
                return sha, cached, True, False
        downloaded = False
        try:
            data = local.read_bytes() if local.is_file() else get(
                f'https://raw.githubusercontent.com/{REPOSITORY}/{source["commit"]}/{quote(row["path"], safe="/")}')
            if hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != sha:
                raise ValueError('Git blob mismatch')
            if not local.is_file():
                local.write_bytes(data)
                downloaded = True
            if data.lstrip().startswith(b'{'):
                cache = STORE / 'parsed' / JSON_PARSER / (sha + '.json')
                result = parse_json_blob(local)
            else:
                result = parse_blob(local, parser_type)
        except Exception as error:
            result = dict(error=type(error).__name__, reason=str(error), parser=PARSER)
        write(cache, result)
        return sha, result, False, downloaded

    results, cached_count, download_count = {}, 0, 0
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 16))) as pool:
        futures = [pool.submit(process, item) for item in blobs.items()]
        for future in as_completed(futures):
            sha, result, cached, downloaded = future.result()
            results[sha] = result
            cached_count += cached
            download_count += downloaded
            if len(results) % 25 == 0:
                print(json.dumps(dict(processed=len(results), total=len(blobs), cached=cached_count,
                                      downloaded=download_count)), flush=True)
    enemies, variants, errors = {}, {}, {}
    for key, candidates in requests['matched'].items():
        result, all_variants, failures = combine_variants(candidates, results)
        if key in requests['unresolved']:
            failures.append(dict(error='incomplete-explicit-variants',
                reason='At least one metadata resource cannot be resolved', sources=requests['unresolved'][key]))
            result = None
        if result:
            enemies[key] = result
        if len(candidates) > 1 or key in requests['unresolved']:
            variants[key] = all_variants
        if failures:
            errors[key] = failures
    report = dict(schemaVersion=1, source=dict(source, mapping='models_data.data.assetId -> assetList[.skel] -> exact tree path',
        indexHashes=requests['indexHashes'], gameDataVersion=models['gameDataVersionDescription'],
        region=models['gameDataServerRegion'], parsers=[PARSER, JSON_PARSER],
        license='Game assets copyright Hypergryph; local extraction for research'),
        counts=dict(wanted=len(requests['cohort']), matched=len(requests['matched']), parsedEnemies=len(enemies),
            uniqueBlobs=len(blobs), cachedBlobs=cached_count, downloadedBlobs=download_count,
            animations=sum(len(row['animations']) for row in enemies.values()),
            errors=len(errors), unresolved=len(requests['unresolved']), skipped=len(requests['skipped'])),
        enemies=enemies, variants=variants, errors=errors, unresolved=requests['unresolved'], skipped=requests['skipped'])
    write(OUTPUT, report)
    print(json.dumps(dict(output=str(OUTPUT), counts=report['counts'],
        errors=dict(Counter(failure['error'] for failures in errors.values() for failure in failures))), ensure_ascii=False))


if __name__ == '__main__':
    main()
