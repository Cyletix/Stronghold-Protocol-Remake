"""Reproducible, read-only-source closure preview of the frozen 18 flow candidates."""
import json
import hashlib
from collections import Counter
from skill_mode_compiler import ROOT,ModeCompiler,Rejected,A,digest
from skill_mode_flow import maybe_compile,finite_buff,sequence,BOUNDARIES,TIMING_SOURCES


def build():
    paths=['work/skill-controller-public-closures-20260918.json','work/operator-mode-next-group.json',
           'work/client-logic/program-compilation.json','work/client-logic/buff-templates.json',
           'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json']
    read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
    inventory,reference,graphs,templates,skills=map(read,paths);c=ModeCompiler(reference,graphs,templates)
    kinds={'AbilitySequenceGroup','AbilityParallelGroup','AbilityFirstSucceedGroup'};members={}
    for sid,old in inventory['members'].items():
        if not old['netNewCandidate'] or not kinds.intersection(old['rootComponentTypes']):continue
        skill=skills[sid];prefab=skill['levels'][0]['prefabId'];rows=c.components(prefab)
        report=dict(skillId=sid,charId=old['charId'],name=old['name'],skillName=old['skillName'],
            source=old['source'],graphSha256=digest(rows),sourceLevels=skill['levels'],
            componentRefs=old['componentRefs'],buffClosure=old['buffClosure'],
            frozenFollowingGates=old['completeFollowingGates'],leafChecks=[],controlChecks=[])
        try:
            p,g=maybe_compile(c,sid,skill,old['charId'],prefab,rows)
            report.update(accepted=True,profile=p,program=g)
        except Rejected as error:report.update(accepted=False,wholeRejection=error.record)
        for n in rows:
            if n['type']==A+'AbilitySequenceGroup':
                try:sequence(n['fields']);result={'accepted':True}
                except Rejected as error:result={'accepted':False,'rejection':error.record}
                report['controlChecks'].append({'nodeId':n['node_id'],'type':n['type'],**result})
            if n['type']==A+'ActiveBuffAbility':
                for i,b in enumerate(n['fields']['_buffs']):
                    try:
                        ir,mode,disarm=finite_buff(c,b,set(),'leaf/'+n['node_id']+'/'+str(i));result={'accepted':True,'ir':ir,'modeIndex':mode}
                    except Rejected as error:result={'accepted':False,'rejection':error.record}
                    report['leafChecks'].append({'nodeId':n['node_id'],'buffIndex':i,'sourceSha256':digest(b),**result})
            elif n['type'].startswith(A) and n['type'].rsplit('.',1)[-1] not in kinds|{'UberEffectEmitter','ThreePartChannelingAnimation'}:
                f=n['fields'];actions=f.get('_actions',{}).get('decodedActions',[]) if isinstance(f.get('_actions',{}),dict) else []
                report['leafChecks'].append({'nodeId':n['node_id'],'type':n['type'],'sourceSha256':digest(n),
                    'accepted':False,'existingLeafFamily':'direct/next actor schema' if n['type'].rsplit('.',1)[-1] in
                        {'MeleeAttack','RangedAttack','MultiMeleeAttack','MultiRangedAttack','Heal'} else None,
                    'reason':'Existing next/direct consumers require their own full controller, selector, clock and blackboard contracts; matching an actor type alone does not prove a flow child completion contract.',
                    'actionTypes':[a.get('$type') for a in actions or []],
                    'activeBuffKeys':[b.get('buffKey') for b in f.get('_activeBuffs',[])],
                    'selectorRef':f.get('_selector')})
        ch=c.character(old['charId'])
        for m in old['selectedModes']:
            index=m['index']
            if index==0:continue
            try:
                mode=c.mode(ch,index);consumed=set();action,plan,selection,_,_=c.attack(mode,skill,consumed,ch['modes'][0],trait_bindings=c.trait_bindings(old['charId']))
                result={'accepted':True,'action':action,'plan':plan,'selector':selection,'consumedKeys':sorted(consumed)}
            except Rejected as error:result={'accepted':False,'rejection':error.record}
            report['leafChecks'].append({'modeIndex':index,'type':'selected-character-mode',**result})
        members[sid]=report
    counts=dict(candidates=len(members),completeContracts=sum(r['accepted'] for r in members.values()),
        blockedWholeSkills=sum(not r['accepted'] for r in members.values()),
        distinctRootKinds=dict(Counter(k for r in members for k in kinds.intersection(inventory['members'][r]['rootComponentTypes']))))
    sourcepaths=paths+TIMING_SOURCES+['tools/skill_mode_flow.py','tools/audit_skill_flows.py']
    return dict(schemaVersion=1,rule='complete-source-flow-capability-preview',status='source-compiled-awaiting-runtime-validation',
        sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sourcepaths},counts=counts,members=members,
        boundaries=BOUNDARIES+['Control and leaf previews are independent and overlapping; accepted leaf checks do not count as additional bound skills. Full-source group acceptance alone authorizes binding. Existing frozen netNewCandidate determines this fixed inventory; current whole-provider statistics are maintained separately.'])


if __name__=='__main__':
    out=build();(ROOT/'work/skill-flow-batch-contract.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(out['counts'],ensure_ascii=False))
