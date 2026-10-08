"""Batch compile structurally supported replacement attacks in the Garrison roster."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from enemy_hit_sequences import load_script_types
from garrison_skill_scope import load_scope
from next_attack_compiler import CONTROLLERS, RULE, ProjectileCompiler, Rejected, compile_replacement, digest
from next_attack_hit_buffs import HitBuffCompiler

ROOT = Path(__file__).resolve().parents[1]
PATHS = ['work/client-logic/program-compilation.json',
         'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json',
         'data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json',
         'work/client-logic/bundles/battle/prefabs/[uc]projectiles.ab.json',
         'work/client-logic/script-types.json', 'work/client-logic/buff-templates.json',
         'data/ArknightsGameData/zh_CN/gamedata/buff_table.json',
         'work/client-logic/native-buff-refresh/contract.json',
         'work/client-logic/native-self-heal/evidence.json',
         'work/client-logic/native-enemy-skill-sp/Torappu.Battle.FilterUtil_FilterType-enum.json',
         'work/client-logic/native-deployment-buffs/contract.json']
BOUNDARY = ('Source multiplier, hit count, target budget, damage type, direct/projectile delivery, ordinary projectile speed/lifetime, charge use and closed delayed/finite hit Buffs. '
            'Existing basic-attack geometry, selection order, interruption and damage snapshot model remains. Native pre-delay/hit-frame/retarget phase, '
            'invalid-target SP refunds, projectile timeout forced-hit semantics, talent/module closure and original VFX are not claimed. '
            'Ordinary Projectile.ActionController attaches Buffs before body actions; this does not establish melee hit order. '
            'The protected DEFAULT/EXTEND switch remains unresolved: finite slow/stun use the shared max-expiry model, '
            'and finite DEF keeps the existing strongest-per-key/source-expiry model; these refresh/priority policies are implementation boundaries. '
            'Heal-to-node native bridge is protected: next-heal uses existing heal_scale and shared healing consumers; '
            'native heal event frames, live/cached power reconciliation and 3D paracurve trajectory are not claimed. '
            'Accepted means complete supported replacement-body graph within these shared-runtime boundaries, not whole-operator completion.')


def build():
    graph, skills, characters, bundle = [json.loads((ROOT / p).read_text(encoding='utf-8-sig')) for p in PATHS[:4]]
    scope = load_scope(ROOT)
    scoped = set(scope['skillIds'])
    candidates = {sid: row['components'] for sid, row in graph['rejections'].items()
                  if sid in scoped and any(c['type'] in CONTROLLERS for c in row.get('components', []))}
    projectile_compiler = ProjectileCompiler(bundle, load_script_types())
    hit_buff_compiler = HitBuffCompiler(json.loads((ROOT / PATHS[5]).read_text(encoding='utf-8-sig')),
                                      json.loads((ROOT / PATHS[6]).read_text(encoding='utf-8-sig')))
    buff_contract = json.loads((ROOT / PATHS[7]).read_text(encoding='utf-8'))
    event_contract=json.loads((ROOT/PATHS[-1]).read_text(encoding='utf-8'))
    assert event_contract['constants']['enums']['Torappu.Battle.Buff+Event']['ON_ABILITY_SPELL_ON']==18
    profiles, rejected, accepted = {}, {}, {}
    for sid, rows in sorted(candidates.items()):
        char_ids = [r['charId'] for r in scope['identities'] if sid in r['skillIds']]
        source = dict(componentTypes=dict(sorted(Counter(r['type'] for r in rows).items())), graphSha256=digest(rows),
                      blackboardKeys=sorted({b['key'] for lv in skills[sid]['levels'] for b in lv['blackboard']}),
                      charIds=char_ids, fixed=sid in scope['fixedSkillIds'])
        try:
            p = compile_replacement(sid, rows, skills[sid]['levels'], char_ids, projectile_compiler, hit_buff_compiler)
            for cid in char_ids:
                assert any(s['skillId'] == sid for s in characters[cid]['skills']), 'Roster skill/character source mismatch'
            profiles[sid] = p
            accepted[sid] = dict(**source, kind=p['kind'], targets=p['targets'], delivery=p['delivery'], hits=p['hits'], hitBuffs=p['hitBuffs'], levelCount=p['levelCount'], rule=RULE)
        except Rejected as error:
            rejected[sid] = dict(**source, category=error.category, detail=error.detail)
    sources = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in PATHS}
    sources.update(scope['sources'])
    for p in ['tools/build_next_attack_skill_data.py', 'tools/next_attack_compiler.py', 'tools/next_attack_compound.py', 'tools/next_attack_heal_compiler.py', 'tools/next_attack_hit_buffs.py', 'tools/enemy_chain_projectiles.py', 'tools/enemy_hit_sequences.py', 'tools/garrison_skill_scope.py']:
        sources[p] = hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
    extra_types = defaultdict(dict)
    deferred_override = []
    for sid in rejected:
        for c in candidates[sid]:
            extra_types[c['type']].setdefault(sid, []).append(dict(nodeId=c['node_id'],
                source=PATHS[0]+'#/rejections/'+sid+'/components', fields=c['fields']))
            for buff in c['fields'].get('_activeBuffs', []):
                if buff.get('overrideType') == 3 and buff.get('triggerLifeType') == 2:
                    deferred_override.append(dict(skillId=sid, nodeId=c['node_id'], buffKey=buff['buffKey'],
                        templateKey=buff['templateKey'], buffSha256=digest(buff),
                        source=PATHS[0]+'#/rejections/'+sid+'/components', reason='Periodic refresh needs the protected override dispatch; source graph retained, no repeat extraction planned.'))
    data = dict(version=2, rule=RULE, profiles=profiles, sources=sources, boundary=BOUNDARY)
    report = dict(schemaVersion=1, rule=RULE, scope='Garrison fixed and expanded roster only', boundary=BOUNDARY,
                  source=graph['source'], sources=sources, stats=dict(candidates=len(candidates), accepted=len(accepted),
                  acceptedFixed=sum(x['fixed'] for x in accepted.values()), rejected=len(rejected), sourceLevels=sum(p['levelCount'] for p in profiles.values())),
                  accepted=accepted, rejected=rejected, rejectionGroups=dict(sorted(Counter(r['category'] for r in rejected.values()).items())),
                  families=dict(sorted(Counter(p['kind'] for p in profiles.values()).items())),
                  compoundSourceBodies={sid:dict(profile=p,components=candidates[sid],levels=skills[sid]['levels'],
                      listenerTemplate=hit_buff_compiler.templates[p['source']['compound']['templateKey']],
                      eventEvidence=PATHS[-1]) for sid,p in profiles.items() if p.get('spellExtras')},
                  hitBuffContract=dict(evidence=PATHS[7], findings=buff_contract,
                      beforeBodyMembers=[sid for sid, p in profiles.items() if p['hitBuffs'] and p['delivery'] == 'projectile'
                                         and p['projectile']['controllerType'] == 'Torappu.Battle.Projectile+ActionController'],
                      deferredPeriodicOverride=deferred_override),
                  rejectedComponentsByType={t: dict(skillCount=len(members), members=members) for t, members in sorted(extra_types.items())})
    return data, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, report = build()
    outputs = {'web/next_attack_skill_data.js': '// Generated by tools/build_next_attack_skill_data.py; structural source replacement bodies.\nwindow.ArkNextAttackSkillData=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n',
               'work/next-attack-batch-report.json': json.dumps(report, ensure_ascii=False, indent=2) + '\n'}
    for relative, content in outputs.items():
        target = ROOT / relative
        if args.check:
            assert target.read_text(encoding='utf-8') == content, 'Next attack compiler output drift: ' + relative
        else:
            target.write_text(content, encoding='utf-8')
    print('NEXT ATTACK SKILL DATA OK', report['stats'], report['rejectionGroups'])
