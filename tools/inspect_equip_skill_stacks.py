"""Reproduce bounded activation-stack native evidence from the existing JP snapshot."""
import hashlib, json, struct
from pathlib import Path
from inspect_autochess_native import Snapshot

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/client-logic/native-equip-stacks'
METHODS={63706,54818,81609,19824,19823,79778,78955,63859,63862,63863,60808,60811,60824,60832,60836}
TYPES={'Torappu.Battle.Action.Nodes+Dice','Torappu.Battle.Action.Nodes+FilterByBlackboardValue',
       'Torappu.Battle.Action.Nodes+CalculateBlackboardValueViaParams','Torappu.Battle.Action.Nodes+CreateBuff'}

def main():
    s=Snapshot();digest=hashlib.sha256(s.data).hexdigest()
    assert digest=='d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af'
    OUT.mkdir(parents=True,exist_ok=True)
    selected=[m for m in s.methods if m['index'] in METHODS]
    assert {m['index'] for m in selected}==METHODS
    records=[]
    for m in selected:
        lines=s.assembly(m['address'])
        filename=str(m['index'])+'.asm'
        (OUT/filename).write_text('; '+m['type']+'::'+m['name']+'\n'+'\n'.join(lines)+'\n',encoding='utf8')
        records.append(dict(index=m['index'],type=m['type'],method=m['name'],rva=hex(m['address']),instructions=len(lines),file=filename))
    # Read the real enum default, not the field's position in the class listing.
    raw=(ROOT/'work/client-logic/metadata/global-metadata.candidate.dat').read_bytes()
    h=struct.unpack_from('<64I',raw);sections=[h[i:i+2] for i in range(2,64,2)]
    event=next(t for t in s.types if t['fullName']=='Torappu.Battle.Buff+Event')
    field=next(f for f in event['fields'] if f['name']=='ON_SKILL_START')
    values=[]
    for p in range(sections[7][0],sum(sections[7]),12):
        i,ti,di=struct.unpack_from('<3i',raw,p)
        if i!=field['index'] or di<0:continue
        assert s.type_info(ti)['kind']==8
        v=raw[sections[8][0]+di];assert v<128
        values.append((v>>1)^-(v&1))
    assert values==[33]
    result=dict(client='JP 36.7.22',binarySha256=digest,metadataSha256=hashlib.sha256(raw).hexdigest(),
        event=dict(type=event['fullName'],name=field['name'],fieldIndex=field['index'],value=values[0]),
        methods=records,layouts=[s.layout(t) for t in s.types if t['fullName'] in TYPES],signatures=s.signatures(selected),
        verified=['Character.OnSkillStart calls BuffContainer.OnSkillStart at RVA 0x21bc8c4.',
            'Nodes.Dice reads the prob blackboard key and calls RandomExtensions.Dice(FP), which forwards to Dice(float).',
            'Dice(float) only rejects nonpositive probability before Range(0,1); probability one still draws, then MathUtil.LE compares the result.',
            'Source template puts Dice before the buff_cnt < atk_buff_cnt filter, so capped activations still draw.',
            'FilterByBlackboardValue reads the owner host buff blackboard; absent comparison key uses the configured valueToCompare fallback.'],
        unresolved=['BasicSkill.Cast, BasicSkill.OnSkillStart, OnCastSucceed and BuffContainer.OnSkillStart bodies are protected in this snapshot; no claim about same-cast instantaneous damage ordering.',
            'Duplicate equipment GlobalBuff COUNTING registration, verifier ownership rules and cross-buff event priorities are not recovered.',
            'JP native methods and CN season values are separate versioned evidence. Saved Web RNG reproduces this implementation, not the original RNG algorithm.'])
    (OUT/'evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('EQUIP STACK NATIVE:',len(records),'methods;',len(result['layouts']),'layouts; ON_SKILL_START=33; protected bodies retained')

if __name__=='__main__':main()
