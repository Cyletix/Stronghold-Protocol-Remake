"""Bounded source/native evidence for achunt death cleanup and refused TARGET transfer."""
import hashlib
import json
import struct
from pathlib import Path

from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]


def main():
    snapshot = Snapshot()
    out = ROOT / 'work/client-logic/native-achunt-cleanup'
    out.mkdir(parents=True, exist_ok=True)
    selected = [78312, 80574, 55932, 54560, 54660, 54577]
    rows = []
    for index in selected:
        method = next(m for m in snapshot.methods if m['index'] == index)
        lines = snapshot.assembly(method['address'])
        (out / f'{index}.asm').write_text('\n'.join(lines) + '\n', encoding='utf-8')
        rows.append(dict(index=index, type=method['type'], method=method['name'],
                         rva=hex(method['address']), instructions=len(lines),
                         status='readable-body' if lines else 'no-decodable-entry'))
    assert next(r for r in rows if r['index'] == 80574)['instructions'] > 100
    assert next(r for r in rows if r['index'] == 55932)['instructions'] > 50
    metadata = (ROOT / 'work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
    header = struct.unpack_from('<64I', metadata)
    sections = [header[i:i+2] for i in range(2, 64, 2)]
    slots = {}
    for index, expected in [(55712, 38), (55977, 107)]:
        method = next(m for m in snapshot.methods if m['index'] == index)
        row = struct.unpack_from('<6I4H', metadata, sections[5][0] + index * 32)
        assert row[8] == expected
        slots[index] = dict(method=method['name'], slot=row[8],
                            vtableOffset=hex(0x138 + row[8]*16), parameters=method['parameters'])
    templates = json.loads((ROOT / 'work/client-logic/buff-templates.json').read_text(encoding='utf-8'))
    graphs = {key: {str(item['key']): item['value']['decodedActions']
                    for item in templates[key]['eventToActions']['_items']}
              for key in ['achunt_passive', 'kill_achunt_mark_boss', 'empty',
                          'actrpa_passive', 'actrpb_passive', 'actrpc_passive', 'actrpa_hp_trans']}
    previous = json.loads((ROOT / 'work/client-logic/native-enemy-transfer/evidence.json').read_text(encoding='utf-8'))
    assert previous['enums']['Torappu.Battle.Buff+Event']['ON_OWNER_KILLED'] == 3
    jump = snapshot.data[snapshot.offset(0x805947d):snapshot.offset(0x805947d)+11]
    result = dict(client='JP 36.7.22', binarySha256=hashlib.sha256(snapshot.data).hexdigest(),
                  methods=rows, virtualSlots=slots, graphs=graphs,
                  targetJumpTable=dict(rva='0x805947d', rawHex=jump.hex(),
                                       status='not-restored; raw targets include out-of-function destinations'),
                  verified=[
                      'Root PassiveBuffAbility for achunt and actrpa/b/c has a second permanent, non-silenceable achunt_mark using the empty template. It does not require achunt_mark_by_boss.',
                      'achunt_passive event3 ON_OWNER_KILLED creates kill_achunt_mark_boss on every eligible GlobalRange BossSelector result; selector has no max-target limit, level mask7, motion ALL and required achunt_mark.',
                      'InstantKill.Execute 0x268971c calls Entity.Suicide with noSource=false and skipReborn=false for this source graph.',
                      'Suicide checks virtual alive(slot38), constructs FP zero, then calls virtual SetHpInternal(slot107) with force=true and source skipReborn=false. This is direct HP assignment, not a damage modifier.',
                      'actrpa event7 is after DoApplyModifier; actrpb/c event10 is before it. All copy Modifier.value rather than actual remaining HP delta.'],
                  unresolved=[
                      'OnStart 0x4d9db50, _RunActions 0x4d9d6dc and Buff.OnAppliedModifier 0x4d9edac have no decodable entry in this snapshot. GetActionTarget dispatch table is not restored.',
                      'Therefore the TARGET context in actrpa_hp_trans is not proven equivalent to its new BUFF_OWNER. The three transfer graphs remain refused, including heal/non-HP modifier combinations.',
                      'achunt_mark_by_boss creation at periodic event2, achunt_summonee derived lifecycle, remaining active skills, full hatred ordering and active XLua overrides are outside this cleanup implementation.',
                      'Local tests verify the implementation contract, not original client event ordering or per-frame identity.'])
    (out / 'evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('ACHUNT NATIVE OK: permanent marks, owner-killed graph, direct HP zero with revive retained; TARGET transfer remains refused')


if __name__ == '__main__':
    main()
