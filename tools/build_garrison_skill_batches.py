"""One entry for source-driven Garrison skill batches; no extraction or DPS runs.

Provider compilers own complete eligibility checks and rejection diagnostics.
This command selects providers, runs each once, and joins their actual generated
bindings to the stable Garrison identity scope without changing manual progress.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from garrison_skill_scope import load_scope

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'work/garrison-skill-batch-baseline-20261003-023856.json'
OUTPUT = 'work/garrison-skill-batch-report.json'
PROVIDERS = {
    'client-programs': ('build_client_programs.py', 'web/client_program_data.js', 'work/client-program-batch-report.json'),
    'next-attack': ('build_next_attack_skill_data.py', 'web/next_attack_skill_data.js', 'work/next-attack-batch-report.json'),
    'skill-modes': ('build_skill_mode_data.py', 'web/skill_mode_data.js', 'work/skill-mode-batch-report.json'),
    'direct-actions': ('build_direct_skill_data.py', 'web/direct_skill_data.js', 'work/direct-skill-batch-report.json'),
}


def read_data(path):
    text = (ROOT / path).read_text(encoding='utf-8-sig')
    return json.loads(text.split('=', 1)[1].strip().removesuffix(';'))


def report():
    scope = load_scope()
    baseline = json.loads((ROOT / BASELINE).read_text(encoding='utf-8-sig'))
    if baseline['scope']['identities'] != scope['identities']:
        raise ValueError('Garrison identity scope changed; explicitly refresh the batch baseline')
    before = {(row['charId'], row['skillId']) for row in baseline['explicitAssociations']}
    bound, providers = {}, {}
    for name, (_, path, receipt) in PROVIDERS.items():
        data = read_data(path)
        profiles = data['profiles']
        previous = set(baseline['providerSkillIds'][path])
        if not previous <= set(profiles):
            raise ValueError('Existing provider bindings were removed: ' + name)
        if set(profiles) - previous - set(scope['skillIds']):
            raise ValueError('New binding outside Garrison scope: ' + name)
        members = []
        for identity in scope['identities']:
            for sid in identity['skillIds']:
                profile = profiles.get(sid)
                if not profile or identity['charId'] not in profile['charIds']:
                    continue
                member = (identity['charId'], sid)
                key = '/'.join(member)
                row = bound.setdefault(key, dict(charId=member[0], skillId=sid,
                    fixed=identity['fixed'], newExplicitPath=member not in before, providers=[]))
                row['providers'].append(name)
                members.append(key)
        previous_members = set(baseline['providerMemberIds'][path])
        if not previous_members <= set(members):
            raise ValueError('Existing provider identity bindings were removed: ' + name)
        providers[name] = dict(data=path, dataSha256=hashlib.sha256((ROOT / path).read_bytes()).hexdigest(),
            rejectionReport=receipt, reportPresent=(ROOT / receipt).is_file(),
            profileCount=len(profiles), newProfileIds=sorted(set(profiles) - previous),
            garrisonMemberIds=sorted(members))
    new = [row for row in bound.values() if row['newExplicitPath']]
    fixed_total = sum(len(row['skillIds']) for row in scope['identities'] if row['fixed'])
    expanded_total = sum(len(row['skillIds']) for row in scope['identities'])
    fixed_before = sum(row['fixed'] for row in baseline['explicitAssociations'])
    fixed_new = sum(row['fixed'] for row in new)
    return dict(schemaVersion=1, rule='garrison-provider-bindings-union-v1',
        scope=scope, baseline=BASELINE, providers=providers, members=bound,
        stats=dict(fixedAssociations=fixed_total, expandedAssociations=expanded_total,
            fixedExplicitBefore=fixed_before, fixedNewExplicit=fixed_new,
            fixedExplicitAfter=fixed_before + fixed_new, fixedPendingAfter=fixed_total - fixed_before - fixed_new,
            expandedExplicitBefore=len(before), expandedNewExplicit=len(new),
            expandedExplicitAfter=len(before) + len(new), expandedPendingAfter=expanded_total - len(before) - len(new)),
        boundaries=['Counts join generated profile ownership with Garrison identities. They are explicit execution paths, not whole-skill acceptance.',
            'Existing bindings must be preserved; all new skill IDs must belong to the Garrison source roster.',
            'Unknown or unsupported sibling behavior stays in provider rejection reports. No asset extraction, DPS regeneration or manual-checklist marking is performed.'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--providers', nargs='+', choices=PROVIDERS, default=list(PROVIDERS))
    parser.add_argument('--report-only', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.report_only:
        for name in dict.fromkeys(args.providers):
            command = [sys.executable, str(ROOT / 'tools' / PROVIDERS[name][0])]
            if args.check:
                command.append('--check')
            subprocess.run(command, cwd=ROOT, check=True)
    value = report()
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    output = ROOT / OUTPUT
    if args.check:
        if not output.is_file() or output.read_text(encoding='utf-8') != text:
            raise ValueError('Garrison batch report drift')
    else:
        output.write_text(text, encoding='utf-8')
    print(json.dumps(dict(**value['stats'], report=OUTPUT), ensure_ascii=False))


if __name__ == '__main__':
    main()
