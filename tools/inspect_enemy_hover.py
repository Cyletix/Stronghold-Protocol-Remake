"""Freeze the reviewed garrison hovering enemy from existing source caches."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/enemy-hover-contract.json'
ENEMY = 'enemy_2025_syufo'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def main():
    paths = {
        'catalog': 'work/enemy-mode-dispatch-catalog.json',
        'ownership': 'work/enemy-mode-ownership-overlay.json',
        'bindings': 'work/enemy-mode-buff-bindings.json',
        'nativeTemplates': 'work/client-logic/buff-templates.json',
        'encounters': 'web/enemy_encounters.json',
        'levels': 'web/source_battles.json',
        'animations': 'work/external-ready-data-20260914/Tim23333-Arknights_timer/snapshot/Ark_emulator/ark_emulator/data_enemy_spine_events.json',
        'native': 'work/client-logic/native-enemy-hover/evidence.json',
    }
    source = dict(enemyId=ENEMY, catalog=read(paths['catalog'])['enemies'][ENEMY],
        ownership=read(paths['ownership'])['enemies'][ENEMY],
        flyTemplate=read(paths['bindings'])['templates']['enemy_syufo_fly']['payload'],
        nativeTemplate=read(paths['nativeTemplates'])['enemy_syufo_fly'],
        entity=read(paths['encounters'])['enemies'][ENEMY],
        animations=read(paths['animations'])[ENEMY])
    # Static pool labels and recommendation strings are historical observations.
    # They are not source fields or part of this mechanism's approval identity.
    source['catalog'] = {key: source['catalog'][key] for key in ('enemyId','entities','modes','components')}
    source['ownership'] = {key: source['ownership'][key] for key in ('modeGameObjects','components')}
    fingerprint = hashlib.sha256(json.dumps(source, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    native = read(paths['native'])
    for method in native['methods']:
        paths['method-' + str(method['index'])] = 'work/client-logic/native-enemy-hover/' + method['file']
    result = dict(schemaVersion=1, source=source, sourceFingerprint=fingerprint,
        inputs={key: dict(path=path, sha256=hashlib.sha256((ROOT/path).read_bytes()).hexdigest()) for key,path in paths.items()},
        native=native,
        verified=[
            'Mode 0 owns the fly Buff; its local blackboard is motion=1 and mode=1. Mode 1 owns the ground combat and visual-only Buff.',
            'Buff enable predicate reads isStunnable/isFreezable and owner stun/freeze; calls OnDisable on the falling edge.',
            'Enemy._AssignSkill lowercases component names, matches data entries, and disables an unmatched skill (0x21d9028..0x21d9038). Source skills is empty, so RecoverAnim is not enabled by this data.',
            'ChangeMotionMode reads an integer blackboard entry with serialized fallback before invoking motion change; reset restores the default.',
        ],
        inferred=[
            'Bind the native motion integer key to the sole local motion entry; map source FLY/WALK to existing flying/motion flags.',
            'Bridge Buff disabled event TARGET to its owning enemy; native OnDisable event dispatcher is unreadable.',
            'Tick-boundary status observation and current contact recomputation approximate native event/physics ordering.',
            'CN isGroundBoundable is accepted as a landing trigger; this newer condition is absent from the JP native predicate.',
        ],
        remaining=[
            'UpdateEnemyCurrentTile dynamic terrain/fall checks and native position/route recomputation are not implemented.',
            'UNBALANCE_IMMUNE flag is retained as evidence; general enemy displacement/unbalance mechanics are not complete.',
            'The original source effects and animation transition are not reproduced.',
            'RecoverAnim remains disabled without matching enemy or level skill data; do not manufacture a source skill entry.',
        ])
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(dict(path=str(OUT), sourceFingerprint=fingerprint)))


if __name__ == '__main__':
    main()
