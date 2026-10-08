"""Freeze the delivered provider baseline for the next batch without new research.

Uses a verified package receipt and the completed union report. Existing snapshots
are immutable: a different payload at the same path is rejected, never overwritten.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def immutable(path, value):
    if path.exists():
        existing = read(path)
        comparable = dict(value)
        # Older manually frozen baselines use roster order. Keep their bytes;
        # association order has no meaning in this keyed union.
        if 'explicitAssociations' in value and 'explicitAssociations' in existing:
            order = lambda row: (row['charId'], row['skillId'])
            comparable['explicitAssociations'] = sorted(value['explicitAssociations'], key=order)
            existing['explicitAssociations'] = sorted(existing['explicitAssociations'], key=order)
        if existing != comparable:
            raise ValueError('Conflicting existing snapshot: ' + str(path))
    else:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def freeze(receipt_path, report_path, activate=False):
    receipt, report = read(receipt_path), read(report_path)
    package = Path(receipt['packageDirectory'])
    stamp = re.search(r'-(\d{8}-\d{6})-[0-9a-f]+$', package.name).group(1)
    previous = read(ROOT / report['baseline'])
    if previous['scope']['identities'] != report['scope']['identities']:
        raise ValueError('Identity scope changed')
    explicit = {(row['charId'], row['skillId']): row for row in previous['explicitAssociations']}
    for row in report['members'].values():
        explicit[(row['charId'], row['skillId'])] = {k: row[k] for k in ('charId', 'skillId', 'fixed')}
    stats = report['stats']
    if len(explicit) != stats['expandedExplicitAfter'] or sum(r['fixed'] for r in explicit.values()) != stats['fixedExplicitAfter']:
        raise ValueError('Explicit union does not match the completed batch')
    checks = {row['path']: row for row in receipt['criticalFileChecks']}
    hashes, skills, members = {}, {}, {}
    for provider in report['providers'].values():
        path = provider['data']
        raw = (package / path).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != provider['dataSha256'] or digest != checks[path]['sha256'] or not checks[path]['sourcePackageZipMatch']:
            raise ValueError('Provider differs from verified package: ' + path)
        data = json.loads(raw.decode('utf-8-sig').split('=', 1)[1].strip().removesuffix(';'))
        hashes[path] = digest
        skills[path] = sorted(data['profiles'])
        members[path] = sorted('/'.join((identity['charId'], sid)) for identity in report['scope']['identities']
            for sid in identity['skillIds'] if sid in data['profiles'] and identity['charId'] in data['profiles'][sid]['charIds'])
        if members[path] != sorted(provider['garrisonMemberIds']):
            raise ValueError('Package ownership differs from completed batch: ' + path)
    baseline = dict(scope=report['scope'], sourcePackage=str(Path(receipt['fullPackage']['path']).relative_to(ROOT)),
        sourceHashes=hashes, explicitAssociations=[explicit[key] for key in sorted(explicit)],
        providerSkillIds=skills, providerMemberIds=members)
    relative = f'work/garrison-skill-batch-baseline-{stamp}.json'
    immutable(ROOT / relative, baseline)
    immutable(ROOT / f'work/garrison-skill-batch-report-{stamp}.json', report)
    immutable(ROOT / f'work/garrison-skill-batch-package-{stamp}.json', receipt)
    if activate:
        builder = ROOT / 'tools/build_garrison_skill_batches.py'
        text, count = re.subn(r"^BASELINE = '[^']+'$", f"BASELINE = '{relative}'", builder.read_text(encoding='utf-8'), flags=re.M)
        if count != 1:
            raise ValueError('Missing unique baseline declaration')
        builder.write_text(text, encoding='utf-8', newline='\n')
    return dict(baseline=relative, activated=activate, fixed=stats['fixedExplicitAfter'], expanded=len(explicit))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-receipt', default='work/garrison-skill-batch-package.json')
    parser.add_argument('--report', default='work/garrison-skill-batch-report.json')
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    print(json.dumps(freeze(ROOT / args.package_receipt, ROOT / args.report, args.activate)))
