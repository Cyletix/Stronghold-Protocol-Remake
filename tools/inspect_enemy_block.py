"""Bounded JP blocking evidence. Preserve unreadable methods; never invent their bodies."""
from pathlib import Path
import hashlib, json, struct
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]


def main():
    s = Snapshot()
    out = ROOT/'work/client-logic/native-enemy-block'
    out.mkdir(parents=True, exist_ok=True)
    requested = {55865, 63675, 63676, 63682, 64092, 64093, 64094, 64095, 64096, 64097, 64152, 76086, 76087}
    rows = []
    for method in s.methods:
        if method['index'] not in requested:
            continue
        lines = s.assembly(method['address'])
        (out/(str(method['index'])+'.asm')).write_text('\n'.join(lines)+'\n', encoding='utf-8')
        rows.append(dict(index=method['index'], type=method['type'], method=method['name'], rva=hex(method['address']),
                         decodedInstructions=len(lines), first16=s.data[s.offset(method['address']):s.offset(method['address'])+16].hex()))
    raw = (ROOT/'work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
    h = struct.unpack_from('<64I', raw)
    sections = [h[i:i+2] for i in range(2, 64, 2)]
    def enum_values(name):
        enum = next(t for t in s.types if t['fullName'] == name)
        fields = {f['index']: f['name'] for f in enum['fields']}
        values = {}
        for pos in range(sections[7][0], sum(sections[7]), 12):
            index, type_index, value_index = struct.unpack_from('<3i', raw, pos)
            if index not in fields or value_index < 0:
                continue
            encoded = raw[sections[8][0]+value_index]
            assert encoded < 128
            kind = s.type_info(type_index)['kind']
            assert kind in (5, 8), 'Only source byte/int enums are decoded here'
            values[fields[index]] = encoded if kind == 5 else (encoded >> 1) ^ -(encoded & 1)
        return values
    defaults = enum_values('Torappu.AbnormalFlag')
    life_type = enum_values('Torappu.LifeType')
    assert defaults['BLOCK_FREE'] == 3
    assert defaults['FEARED'] == 33
    assert defaults['ATTRACTED'] == 41
    assert life_type['INFINITY'] == 2
    passive = next(t for t in s.types if t['fullName'] == 'Torappu.Battle.Abilities.PassiveBuffAbility')
    buffs_field = next(f for f in s.layout(passive)['fields'] if f['name'] == '_buffs')
    assert buffs_field['offset'] == 0x110
    result = dict(client='JP 36.7.22', binarySha256=hashlib.sha256(s.data).hexdigest(), methods=rows, abnormalFlags=defaults,
        lifeType=life_type, passiveBuffArray=buffs_field,
        verified=['Character._CheckBlockable invokes Enemy.CheckBlockable at 0x21b96d8.',
                  'Entity.get_isBlockFree tests AbnormalFlag values 3,33,41 in sequence, then an unresolved instance bool at +0x26.',
                  'Enemy.ReleaseFromBlocker invokes Character.RemoveBlockee.',
                  'PassiveBuffAbility.GetPassiveBuffs default branch returns this._buffs at +0x110; GetActiveBuffs returns null. Hotfix branches exist and are not executed by this static analysis.'],
        unresolved='Enemy.CheckBlockable, WithoutCheckRange, motion and special condition helpers at 0x21d0854..0x21d0b44 share undecodable page 0x21d0000. PropLikeEnemy origin of block-free behavior is not established.',
        nextRequirement='Obtain readable code for this page from this snapshot, an authorized running-memory snapshot, or a separately versioned client snapshot and re-establish method/field identity before comparison.')
    (out/'evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('ENEMY BLOCK NATIVE OK: BLOCK_FREE=3 and readable status/caller/release; PropLike blocking page remains explicitly unresolved')


if __name__ == '__main__':
    main()
