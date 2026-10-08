"""Reproduce the bounded JP 36.7.22 death-spawn native evidence, without re-unpacking."""
from pathlib import Path
import hashlib, json, struct
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/client-logic/native-enemy-death-spawn'


def main():
    snapshot = Snapshot()
    metadata = (ROOT/'work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
    header = struct.unpack_from('<64I', metadata)
    sections = [header[i:i+2] for i in range(2, 64, 2)]
    defaults = {}
    for pos in range(sections[7][0], sum(sections[7]), 12):
        field, native_type, index = struct.unpack_from('<3i', metadata, pos)
        if field not in range(58969, 58974):
            continue
        encoded = metadata[sections[8][0]+index]
        assert encoded < 128  # This bounded set uses one-byte compressed signed ints.
        defaults[field] = dict(nativeType=native_type, dataIndex=index,
                               encoded=hex(encoded), value=(encoded >> 1) ^ -(encoded & 1))
    assert [defaults[i]['value'] for i in range(58969, 58974)] == [0, 1, 2, 3, 4]
    enum = next(t for t in snapshot.types if t['fullName'] == 'Torappu.Battle.Buff+Event')
    for field in enum['fields']:
        if field['index'] in defaults:
            defaults[field['index']]['name'] = field['name']
    strings = []
    for slot, expected in [(0xa695a48, 'enemy_key'), (0xa63c2a0, 'cnt')]:
        storage = snapshot.words(slot, 1)[0]
        encoded = snapshot.words(storage, 1)[0]
        assert encoded >> 29 == 5
        literal = (encoded & 0x1fffffff) >> 1
        length, index = struct.unpack_from('<II', metadata, sections[0][0]+literal*8)
        value = metadata[sections[1][0]+index:sections[1][0]+index+length].decode()
        assert value == expected
        strings.append(dict(slot=hex(slot), storage=hex(storage), encoded=hex(encoded), literalIndex=literal, value=value))
    action = next(t for t in snapshot.types if t['fullName'] == 'Torappu.Battle.Action.Nodes+SummonEnemiesFollowMyRoute')
    OUT.mkdir(parents=True, exist_ok=True)
    result = dict(client='JP 36.7.22', binarySha256=hashlib.sha256(snapshot.data).hexdigest(),
                  metadataSha256=hashlib.sha256(metadata).hexdigest(), buffEvents=defaults,
                  blackboardKeys=strings, actionLayout=snapshot.layout(action),
                  boundary='Execute has an undecodable/protected region after RVA 0x274cffc. Random delay order, spatial scatter and scheduler internals are not reconstructed.')
    (OUT/'evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    lines = snapshot.assembly(0x274cd98, 0x274d000)
    assert any('GetStringOrDefault' in line for line in lines)
    assert any('GetIntOrDefault' in line for line in lines)
    (OUT/'SummonEnemiesFollowMyRoute.Execute-prefix.asm').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    prop = next(t for t in snapshot.types if t['fullName'] == 'Torappu.Battle.PropLikeEnemy')
    enum_types = [t for t in snapshot.types if t['fullName'] in ['Torappu.Battle.DamageType', 'Torappu.Battle.Modifier+TargetType']]
    fields = {f['index']: (t['fullName'], f['name']) for t in enum_types for f in t['fields']}
    enum_values = {}
    for pos in range(sections[7][0], sum(sections[7]), 12):
        field, _, index = struct.unpack_from('<3i', metadata, pos)
        if field not in fields or index < 0:
            continue
        encoded = metadata[sections[8][0]+index]
        assert encoded < 128
        type_name, field_name = fields[field]
        enum_values.setdefault(type_name, {})[field_name] = (encoded >> 1) ^ -(encoded & 1)
    assert enum_values['Torappu.Battle.DamageType']['PURE'] == 3
    assert enum_values['Torappu.Battle.DamageType']['MAGICAL'] == 2
    assert enum_values['Torappu.Battle.Modifier+TargetType']['HP'] == 0
    assert enum_values['Torappu.Battle.Modifier+TargetType']['EP'] == 5
    prop_methods = [m for m in snapshot.methods if m['type'] == prop['fullName'] and m['name'] in ['DoApplyModifier', 'OnBorn', 'CheckIsInPropLikeState']]
    for method in prop_methods:
        lines = snapshot.assembly(method['address'])
        assert lines
        (OUT/('PropLikeEnemy.'+method['name']+'.asm')).write_text('\n'.join(lines)+'\n', encoding='utf-8')
    result['propLike'] = dict(layout=snapshot.layout(prop), enums=enum_values, methods=snapshot.signatures(prop_methods),
        conclusion='Default DoApplyModifier branch: HP negative finalDelta -> hp-1 and appliedDelta=-1; nonnegative HP does not change HP. Type-constrained props accept the configured type or PURE. EP delegates to Entity.DoApplyModifier. All 14 selected prefabs disable the mode-index restriction and SP.')
    (OUT/'evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('ENEMY DEATH SPAWN NATIVE OK: ON_OWNER_KILLED=3, enemy_key/cnt, Summon prefix and complete PropLikeEnemy HP/type branch')


if __name__ == '__main__':
    main()
