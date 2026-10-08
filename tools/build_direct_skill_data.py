"""Batch compile structurally supported direct CastSkill graphs in the Garrison roster."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from enemy_hit_sequences import load_script_types
from garrison_skill_scope import load_scope
from next_attack_compiler import ProjectileCompiler, Rejected, digest
from direct_skill_compiler import CONTROLLER, ATTACKS, RULE, BuffCompiler, DirectProjectileCompiler, compile_direct

ROOT = Path(__file__).resolve().parents[1]
PATHS = ['work/client-logic/program-compilation.json',
         'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json',
         'data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json',
         'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json',
         'work/client-logic/script-types.json', 'work/client-logic/buff-templates.json',
         'data/ArknightsGameData/zh_CN/gamedata/buff_table.json',
         'work/client-logic/native-enemy-skill-sp/Torappu.Battle.AbilityStandard_Event-enum.json',
         'work/client-logic/native-direct-selector/contract.json']
BOUNDARY = ('Complete source CastSkill numeric/target/action bodies; no unknown sibling action is discarded. '
            'JP 36.7.22 component graphs are bound to current CN source levels with exact key and prefab checks. '
            'Direct resolution uses shared geometry, targeting priority and damage/heal hooks. Timed source bodies consume preDelay, inter-spell intervals, per-spell target/power snapshots and complete delivery graphs; random birth delay uses the shared seeded uniform generator. '
            'Source preDelay/timeMode are retained; native protected animation hit-frame/lock and precise event phase are not recovered. '
            'ALL selector without a bound target key uses source descriptions plus the ALL enum; protected getter/tie-breaking are not claimed. '
            'Melee hit-Buff versus damage event order, shared status reapplication and hit-cancellation rules remain runtime boundaries until protected native paths are recovered. '
            'No basic-attack SP or onBasicAttackHit is generated. Talent/module closure is not whole-operator completion.')


def build():
    graph, skills, characters, bundle = [json.loads((ROOT / p).read_text(encoding='utf-8-sig')) for p in PATHS[:4]]
    scope = load_scope(ROOT)
    scoped = set(scope['skillIds'])
    candidates = {sid: row['components'] for sid, row in graph['rejections'].items()
                  if sid in scoped and any(c['type'] == CONTROLLER for c in row.get('components', [])) and any(c['type'] in ATTACKS or 'AnimatedAction' in c['type'] for c in row.get('components', []))}
    projectile_compiler = DirectProjectileCompiler(bundle, load_script_types())
    buff_compiler = BuffCompiler(json.loads((ROOT / PATHS[5]).read_text(encoding='utf-8-sig')),
                                      json.loads((ROOT / PATHS[6]).read_text(encoding='utf-8-sig')))
    profiles, rejected, accepted = {}, {}, {}
    for sid, rows in sorted(candidates.items()):
        char_ids = [r['charId'] for r in scope['identities'] if sid in r['skillIds']]
        source = dict(componentTypes=dict(sorted(Counter(r['type'] for r in rows).items())), graphSha256=digest(rows),
                      blackboardKeys=sorted({b['key'] for lv in skills[sid]['levels'] for b in lv['blackboard']}),
                      charIds=char_ids, fixed=sid in scope['fixedSkillIds'])
        try:
            p = compile_direct(sid, rows, skills[sid]['levels'], char_ids, projectile_compiler, buff_compiler)
            for cid in char_ids:
                assert any(s['skillId'] == sid for s in characters[cid]['skills']), 'Roster skill/character source mismatch'
            profiles[sid] = p
            accepted[sid] = dict(**source, targets=p['targets'], heal=p['heal'], hits=p['hits'], projectile=p['projectile'], castSchedule=p['castSchedule'], onHit=p['onHit'], onCast=p['onCast'], levelCount=p['levelCount'], rule=RULE)
        except Rejected as error:
            rejected[sid] = dict(**source, category=error.category, detail=error.detail)
    sources = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in PATHS}
    sources.update(scope['sources'])
    for p in ['tools/build_direct_skill_data.py', 'tools/direct_skill_compiler.py', 'tools/next_attack_compiler.py', 'tools/next_attack_hit_buffs.py', 'tools/enemy_chain_projectiles.py', 'tools/enemy_hit_sequences.py', 'tools/garrison_skill_scope.py']:
        sources[p] = hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
    extra_types = defaultdict(dict)
    for sid in rejected:
        for c in candidates[sid]:
            extra_types[c['type']].setdefault(sid, []).append(dict(nodeId=c['node_id'],
                source=PATHS[0]+'#/rejections/'+sid+'/components', fields=c['fields']))
    data = dict(version=2, rule=RULE, profiles=profiles, sources=sources, boundary=BOUNDARY)
    report = dict(schemaVersion=1, rule=RULE, scope='Garrison fixed and expanded roster only', boundary=BOUNDARY,
                  source=graph['source'], sources=sources, stats=dict(candidates=len(candidates), accepted=len(accepted),
                  acceptedFixed=sum(x['fixed'] for x in accepted.values()), rejected=len(rejected), sourceLevels=sum(p['levelCount'] for p in profiles.values())),
                  accepted=accepted, rejected=rejected, rejectionGroups=dict(sorted(Counter(r['category'] for r in rejected.values()).items())),
                  rejectedComponentsByType={t: dict(skillCount=len(members), members=members) for t, members in sorted(extra_types.items())})
    inventory_path=ROOT/'work/direct-skill-candidate-inventory-20260918.json'
    inventory=json.loads(inventory_path.read_text(encoding='utf-8-sig'))
    group=inventory['capability']
    inventory_rows={}
    for member in group['memberIds']:
        sid=member.split('/',1)[1]
        rows=graph['rejections'].get(sid,{}).get('components',[])
        inventory_rows[member]=dict(status='accepted' if sid in accepted else 'rejected' if sid in rejected else 'other-controller-provider',
            category=rejected.get(sid,{}).get('category'),detail=rejected.get(sid,{}).get('detail'),
            componentTypes=sorted({r['type'] for r in rows}))
    report['fixedPendingDirectInventory']=dict(input='work/direct-skill-candidate-inventory-20260918.json',sha256=hashlib.sha256(inventory_path.read_bytes()).hexdigest(),
        members=inventory_rows,counts=dict(Counter(x['status'] for x in inventory_rows.values())))
    receipt=ROOT/'work/direct-skill-batch-verification.json'
    if receipt.exists():
        evidence=json.loads(receipt.read_text(encoding='utf-8'))
        matches=all((ROOT/p).exists() and hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==sha for p,sha in evidence['inputs'].items())
        report['verification']=dict(receipt='work/direct-skill-batch-verification.json',inputsMatch=matches,
            status=evidence['status'] if matches else 'stale-inputs-recheck-affected-contract')
    return data, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, report = build()
    outputs = {'web/direct_skill_data.js': '// Generated by tools/build_direct_skill_data.py; structural source direct CastSkill bodies.\nwindow.ArkDirectSkillData=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n',
               'work/direct-skill-batch-report.json': json.dumps(report, ensure_ascii=False, indent=2) + '\n'}
    for relative, content in outputs.items():
        target = ROOT / relative
        if args.check:
            assert target.read_text(encoding='utf-8') == content, 'Direct skill compiler output drift: ' + relative
        else:
            target.write_text(content, encoding='utf-8')
    print('DIRECT SKILL DATA OK', report['stats'], report['rejectionGroups'])
