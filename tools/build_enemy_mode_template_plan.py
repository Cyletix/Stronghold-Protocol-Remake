"""Refine the fixed seven classes once and schedule work by shared operators."""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path

from enemy_mode_template_contracts import TEMPLATES, BATCHES
import enemy_mode_reborn_plan as reborn
import enemy_mode_trigger_plan as triggers
import enemy_mode_selection_plan as selection

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'work/enemy-mode-template-plan.json'
CATALOG = ROOT / 'work/enemy-mode-dispatch-catalog.json'
OWNERSHIP = ROOT / 'work/enemy-mode-ownership-overlay.json'
RULE = 'seven-mode-template-contracts-v1'
ANALYZERS = {'reborn': (reborn, reborn.analyze_reborn), 'triggers': (triggers, triggers.analyze_triggers),
             'selection': (selection, selection.analyze_selection)}
ALIASES = {'reborn-handler-lookup': 'named-ability-resolution',
           'buff-template-execution': 'buff-template-dispatch',
           'blackboard-consumer-resolution': 'bind-buff-mode-parameter'}
SOURCE_OPERATORS = {'named-ability-resolution','resolve-buff-template-graph','bind-buff-mode-parameter',
    'resolve-active-default-mode','bind-mode-attack-blackboard','resolve-enemy-skill-trigger',
    'resolve-entity-state-mode-call','confirm-cross-source-ownership'}
CONDITION_OPERATORS = {'reborn-budget-condition','reborn-buff-condition','reborn-wave-condition',
    'reborn-preset-selection','check-current-mode','conditional-action-tree','hp-ratio-checker',
    'buff-presence-checker','blocked-state-checker','abnormal-state-checker','tile-mask-checker',
    'compound-state-checker','state-toggle-checker','action-check-unit-alive'}
LIFECYCLE_OPERATORS = {'reborn-activation-registration','reborn-handler-lifecycle','reborn-mode-target',
    'reborn-hp-recharge','reborn-buff-lifecycle','reborn-effect-lifecycle','reborn-keep-alive',
    'finish-buff-by-id','toggle-buff-lifecycle','compile-mode-attributes','dispatch-ability-lifecycle-event'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def strict_values(value):
    if isinstance(value, float) and not math.isfinite(value):
        return {'sourceSpecialNumber': str(value)}
    if isinstance(value, dict):
        return {str(k): strict_values(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [strict_values(v) for v in value]
    return value


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(strict_values(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def input_state():
    files = [CATALOG, OWNERSHIP, Path(__file__), Path(__file__).with_name('enemy_mode_template_contracts.py')]
    files += [Path(module.__file__) for module, _ in ANALYZERS.values()]
    return dict(rule=RULE, files={path.relative_to(ROOT).as_posix(): digest(path) for path in files})


def batch_of(operator):
    if operator in SOURCE_OPERATORS:
        return 'bindings'
    if operator in CONDITION_OPERATORS:
        return 'conditions'
    if operator in LIFECYCLE_OPERATORS:
        return 'lifecycle'
    return 'actions'


def compile_plan(catalog, ownership, inputs, cached_selection=None):
    if ownership.get('source', {}).get('inventorySourceFingerprint') != catalog.get('sourceFingerprint'):
        raise ValueError('Ownership and frozen mode inventory belong to different source snapshots')
    members = catalog['memberIDs']
    if len(members) != len(set(members)) or set(members) != set(catalog['enemies']):
        raise ValueError('Frozen mode members must be unique and complete')
    labels, definitions = {}, {}
    for module, _ in ANALYZERS.values():
        labels.update(module.SUBCLASSES)
        for raw, definition in module.OPERATORS.items():
            canonical = ALIASES.get(raw, raw)
            target = definitions.setdefault(canonical, dict(**definition, rawOperatorIDs=[]))
            target['rawOperatorIDs'].append(raw)
    enemies = {}
    for key in members:
        row = catalog['enemies'][key]
        if row['primarySubclass'] not in TEMPLATES:
            raise ValueError('Unknown primary class; review the fixed contract table explicitly')
        analyses = {}
        for name, (_, function) in ANALYZERS.items():
            result = cached_selection.get(key) if name == 'selection' and cached_selection else None
            result = result or function(row, ownership.get('enemies', {}).get(key, {}))
            if result.get('applicable'):
                analyses[name] = result
        subclasses = sorted({item for result in analyses.values() for item in result['subclasses']})
        if not subclasses:
            raise ValueError('Every frozen member needs a concrete refinement: ' + key)
        operators = sorted({ALIASES.get(op, op) for result in analyses.values() for op in result['sharedOperators']})
        if any(op not in definitions for op in operators):
            raise ValueError('An operator lacks its shared implementation contract: ' + key)
        enemies[key] = dict(enemyId=key, name=row['name'], inEncounterPool=row['inEncounterPool'],
            primarySubclass=row['primarySubclass'], subclasses=subclasses, requiredOperators=operators,
            missingLinks=sorted({gap for result in analyses.values() for gap in result['missingLinks']}),
            modeIndices=[mode['modeIndex'] for mode in row['modes']], analyses=analyses,
            ownershipStatus=ownership.get('enemies', {}).get(key, {}).get('status', 'missing'),
            implementationReady=False)
    operators, templates = {}, {}
    for op, definition in sorted(definitions.items()):
        ids = [key for key in members if op in enemies[key]['requiredOperators']]
        if ids:
            operators[op] = dict(**definition, memberIDs=ids,
                encounterIDs=[key for key in ids if enemies[key]['inEncounterPool']],
                templateIDs=sorted({enemies[key]['primarySubclass'] for key in ids}), batch=batch_of(op),
                implementationState='pending-full-contract')
    for key, contract in TEMPLATES.items():
        ids = [eid for eid in members if enemies[eid]['primarySubclass'] == key]
        subclasses = {}
        for sub in sorted({s for eid in ids for s in enemies[eid]['subclasses']}):
            subset = [eid for eid in ids if sub in enemies[eid]['subclasses']]
            subclasses[sub] = dict(label=labels.get(sub, sub), memberIDs=subset,
                encounterIDs=[eid for eid in subset if enemies[eid]['inEncounterPool']])
        templates[key] = dict(**contract, memberIDs=ids,
            encounterIDs=[eid for eid in ids if enemies[eid]['inEncounterPool']], subclasses=subclasses,
            sharedOperators=sorted({op for eid in ids for op in enemies[eid]['requiredOperators']}))
    batches = {}
    for key, contract in BATCHES.items():
        ops = sorted([op for op, item in operators.items() if item['batch'] == key],
            key=lambda op: (-len(operators[op]['encounterIDs']), -len(operators[op]['templateIDs']), -len(operators[op]['memberIDs']), op))
        batches[key] = dict(**contract, operatorIDs=ops,
            memberIDs=sorted({eid for op in ops for eid in operators[op]['memberIDs']}))
    return dict(schemaVersion=1, rule=RULE, inputs=inputs, memberIDs=members,
        sourceFingerprints=dict(catalog=catalog['sourceFingerprint'], ownership=ownership['sourceFingerprint']),
        counts=dict(enemies=len(members), templates=len(templates), operators=len(operators),
            crossClassOperators=sum(len(op['templateIDs']) > 1 for op in operators.values()),
            subclasses=len({s for row in enemies.values() for s in row['subclasses']})),
        templates=templates, operators=operators, batches=batches, enemies=enemies,
        boundary='Refinement and dependency coverage are planning facts, not native runtime completion. Keep stable primary IDs; apply shared operators to their affected subsets, never one enemy at a time.')


def ensure_plan(refresh=False):
    state = input_state()
    old = read(OUTPUT) if OUTPUT.is_file() else None
    if old and old.get('inputs') == state:
        return old, True
    if old and not refresh:
        raise ValueError('Mode plan input changed; use --refresh once for the existing frozen cohort')
    catalog, ownership = read(CATALOG), read(OWNERSHIP)
    cached = None
    cached_path = ROOT / 'work/enemy-mode-selection-analysis.json'
    if cached_path.is_file():
        item = read(cached_path)
        hashes = {key.replace('\\','/'): value for key,value in item.get('sourceHashes', {}).items()}
        needed = [CATALOG, OWNERSHIP, Path(selection.__file__)]
        if item.get('rule') == selection.RULE and all(hashes.get(p.relative_to(ROOT).as_posix()) == state['files'][p.relative_to(ROOT).as_posix()] for p in needed):
            cached = item['enemies']
    result = compile_plan(catalog, ownership, state, cached)
    write(OUTPUT, result)
    return result, False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    plan, hit = ensure_plan(args.refresh)
    print(json.dumps(dict(cacheHit=hit, output=str(OUTPUT.relative_to(ROOT)), **plan['counts']), ensure_ascii=False))
