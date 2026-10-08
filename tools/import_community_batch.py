"""Import whole external data families and rebuild their existing consumers in one run."""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', help='Current GameData source; defaults to the active source')
    parser.add_argument('--downloads', type=Path, default=ROOT / 'work/external-ready-data-20260914')
    parser.add_argument('--skip-dps', action='store_true', help='Rebuild only database and Web consumers')
    parser.add_argument('--force-evaluate', action='store_true', help='Force unresolved DPS slots through the cached template entry')
    parser.add_argument('--full-dps', action='store_true', help='Explicit full DPS regression instead of cached/pending-only evaluation')
    args = parser.parse_args()
    python = PARENT / '.venv/Scripts/python.exe'
    python = str(python) if python.is_file() else sys.executable
    node = shutil.which('node')
    if not node:
        raise SystemExit('Node.js is required for the existing Web build and DPS core.')
    source_args = ['--source', args.source] if args.source else []
    steps = [
        ('shared-database', PARENT, [python, 'tools/resources.py', 'import-community', str(args.downloads.resolve()), *source_args]),
        ('web-references', ROOT, [python, 'tools/build_community_references.py', *source_args]),
        ('web-combat', ROOT, [python, 'tools/build_external_combat_data.py', '--source', str(args.downloads.resolve() / 'Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator')]),
    ]
    if not args.skip_dps:
        evaluation_args = (['--force-evaluate'] if args.force_evaluate else []) + (['--full-dps'] if args.full_dps else [])
        steps.append(('dps-templates', ROOT, [python, 'tools/advance_community_templates.py', *source_args, *evaluation_args]))
    steps.append(('web-bundle', ROOT, [node, 'tools/build_mode.js']))
    receipt = {'schemaVersion': 1, 'completed': False, 'steps': []}
    target = ROOT / 'work/community-batch-integration.json'
    target.parent.mkdir(exist_ok=True)
    for name, cwd, command in steps:
        print(f'[{name}]', flush=True)
        result = subprocess.run(command, cwd=cwd, text=True, encoding='utf-8', capture_output=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
        receipt['steps'].append({'name': name, 'command': command, 'cwd': str(cwd),
                                 'returncode': result.returncode, 'output': result.stdout.strip()})
        if result.stdout:
            print(result.stdout.strip(), flush=True)
        if result.stderr:
            print(result.stderr.strip(), file=sys.stderr, flush=True)
        target.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if result.returncode:
            raise SystemExit(result.returncode)
    sys.path.insert(0, str(PARENT / 'src'))
    from arkresearch.community import CommunityStore
    database = CommunityStore(source_id=args.source).manifest
    read = lambda p: json.loads(p.read_text(encoding='utf-8'))
    combat = read(ROOT / 'work/external-combat-import-report.json')
    references = read(ROOT / 'web/community_references.json')
    receipt.update(completed=True, sourceId=database['source_id'], database={
        'counts': database['counts'], 'linkedGameIds': database['linked_game_ids'],
        'gapCounts': dict(Counter(row['reason'] for row in database['issues']))},
        webCombat={'counts': combat['counts'], 'gapCounts': combat['gapCounts']},
        webReferences=references['counts'])
    if not args.skip_dps:
        dps = read(PARENT / 'work/community-dps-coverage.json')
        receipt['dps'] = {'counts': dps['counts'], 'scope': dps['scope'],
                          'coverage': dps.get('coverage', {}), 'families': dps.get('families', {}),
                          'gapCounts': dict(Counter(row.get('reason', row['status'])
                                      for row in dps['results'] if row['status'] != 'calculated'))}
    target.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Completed: ' + str(target), flush=True)


if __name__ == '__main__':
    main()
