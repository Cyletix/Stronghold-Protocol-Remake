"""Read existing JP snapshot to examine enemy passive modifier transfer, without executing it."""
import hashlib, json, struct
from pathlib import Path
from inspect_autochess_native import Snapshot

ROOT = Path(__file__).resolve().parents[1]


def main():
    s = Snapshot()
    out = ROOT/'work/client-logic/native-enemy-transfer'
    out.mkdir(parents=True, exist_ok=True)
    selected = {
        'Torappu.Battle.Action.Nodes+AssignModifierValueIntoBlackboard': ['Execute'],
        'Torappu.Battle.Action.Nodes+CreateBuffUseAbilitySelector': ['Execute'],
        'Torappu.Battle.Action.Nodes+FixedValueDamage': ['Execute'],
        'Torappu.Battle.AdvancedSelectorWithEnemyOptions': ['OnPostFilter'],
        'Torappu.Battle.Modifier': ['get_value','get_finalDelta'],
        'Torappu.Battle.Entity': ['ApplyModifier','_OnApplyingModifier','OnAppliedModifier','OnTakeDamage','DoApplyModifier'],
        'Torappu.Battle.Buff+BuffContainer': ['OnAppliedModifier','OnTakeDamage'],
        'Torappu.Battle.BattleUtil': ['CalculateDamageByAtkNoSource'],
    }
    rows=[]
    for m in s.methods:
        if m['type'] not in selected or m['name'] not in selected[m['type']]:
            continue
        lines=s.assembly(m['address'])
        (out/(str(m['index'])+'.asm')).write_text('\n'.join(lines)+'\n',encoding='utf8')
        rows.append(dict(type=m['type'],method=m['name'],index=m['index'],rva=hex(m['address']),instructions=len(lines)))
    layouts = [s.layout(t) for t in s.types if t['fullName'] in selected]
    (out/'layouts.json').write_text(json.dumps(layouts,ensure_ascii=False,indent=2),encoding='utf8')
    raw=(ROOT/'work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
    h=struct.unpack_from('<64I',raw); sections=[h[i:i+2] for i in range(2,64,2)]
    enums={}
    for name in ['Torappu.Battle.Buff+Event','Torappu.Battle.FilterUtil+FilterType','Torappu.Battle.SideType','Torappu.MotionMask','Torappu.Battle.EntityCategory']:
        types=[t for t in s.types if t['fullName']==name]
        if not types:continue
        fs={f['index']:f['name'] for f in types[0]['fields']}; values={}
        for p in range(sections[7][0],sum(sections[7]),12):
            i,ti,di=struct.unpack_from('<3i',raw,p)
            if i not in fs or di<0:continue
            v=raw[sections[8][0]+di];kind=s.type_info(ti)['kind']
            if kind not in (5,8) or (kind==8 and v>=128):
                values[fs[i]]=dict(status='outside-bounded-enum-reader',kind=kind,firstByte=v)
                continue
            values[fs[i]]=v if kind==5 else (v>>1)^-(v&1)
        enums[name]=values
    constants=[]
    for slot in [0xa6a7e60,0xa5d6068]:
        storage=s.words(slot,1)[0];encoded=s.words(storage,1)[0]
        assert encoded>>29==5
        index=(encoded&0x1fffffff)>>1
        length,start=struct.unpack_from('<2I',raw,sections[0][0]+index*8)
        value=raw[sections[1][0]+start:sections[1][0]+start+length].decode()
        constants.append(dict(slot=hex(slot),storage=hex(storage),encoded=hex(encoded),value=value))
    assert constants[0]['value']=='atk_scale' and constants[1]['value']=='ability_name'
    slots={}
    for index in [56057,56033]:
        row=struct.unpack_from('<6I4H',raw,sections[5][0]+index*32)
        slots[index]=dict(slot=row[8],vtableOffset=hex(0x138+row[8]*16))
    assert slots[56057]['vtableOffset']=='0x928'
    assert slots[56033]['vtableOffset']=='0x8b8'
    assert enums['Torappu.Battle.Buff+Event']['ON_TAKE_DAMAGE']==10
    assert enums['Torappu.Battle.Buff+Event']['ON_APPLIED_MODIFIER']==7
    result=dict(client='JP 36.7.22',binarySha256=hashlib.sha256(s.data).hexdigest(),methods=rows,enums=enums,constants=constants,virtualSlots=slots,
        verified=['Entity.ApplyModifier calls _OnApplyingModifier before virtual DoApplyModifier(slot120), then OnAppliedModifier if skip-event flag0x80 is absent.',
                  'Entity._OnApplyingModifier dispatches isDamage to virtual OnTakeDamage(slot127). OnTakeDamage invokes BuffContainer.OnTakeDamage after cancellation checks.',
                  'AssignModifierValueIntoBlackboard filters cancelled modifiers, then copies Modifier.value; it never reads realDelta/finalDelta.',
                  'CreateBuffUseAbilitySelector resolves ability_name with fallback BossSelector, FindTargets_DISPOSE, copies the current blackboard and adds the buff to each selected entity.',
                  'FixedValueDamage obtains hp_lose plus atk_scale(default1); no-source path calculates PURE modifier, adds skip-event bit7, applies to BUFF_OWNER.'],
        unresolved=['The actrpa ON_APPLIED_MODIFIER source differs from ON_TAKE_DAMAGE; TARGET/BUFF_OWNER contexts are not widened into this two-ID contract. The later inspect_achunt_cleanup.py proves permanent root achunt_mark and an independent owner-killed cleanup, but not the three TARGET transfer graphs.',
                    'HATRED_DES is identified, but duplicate marked-boss ordering is not recovered; the local consumer explicitly declines ambiguous boards.',
                    'This reads default native branches. Active XLua/server rewrites and exact FP/runtime combination semantics are not proven by local simulation tests.'])
    (out/'evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('ENEMY TRANSFER NATIVE OK:',len(rows),'methods; TAKE_DAMAGE=10, APPLIED_MODIFIER=7, source value, selector, PURE/skip-events and constants recorded')


if __name__=='__main__':main()
