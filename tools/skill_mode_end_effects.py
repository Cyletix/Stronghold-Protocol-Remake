"""Strict after-affecting owner statuses over already cached complete graphs.

This helper consumes one companion, not an entire skill. The caller must still
compile every remaining root/mode component and account for all level keys.
No skill identity participates in admission.
"""
from copy import deepcopy
import argparse
import hashlib
import json
from pathlib import Path

from direct_skill_compiler import BuffCompiler
from next_attack_compiler import Rejected as BuffRejected
from next_attack_hit_buffs import ATTRS, BUFF_FIXED

ROOT=Path(__file__).resolve().parents[1]
RULE='cast-armed-after-affecting-owner-status-v1'
TYPE='Torappu.Battle.Abilities.BuffAfterAffecting'
NATIVE_FILES=[f'work/client-logic/native-enemy-bomb/{name}' for name in (
    'evidence.json','77537_SetData.asm','77538_OnEvent.asm','77541_OnTick.asm','77542_OnStopAffect.asm')]
NATIVE_FILES.append('work/client-logic/native-enemy-skill-sp/Torappu.Battle.AbilityStandard_Event-enum.json')
BOUNDARIES=[
    'Cached native SetData clears the armed flag; ON_CAST_START (2) arms it. With onlyCheckOnStopAffect=false, OnTick clears the flag and adds owner Buffs once when the ability is no longer affecting. OnStopAffect does not add Buffs for this flag value.',
    'The native methods do not branch on a named completion reason. Mapping natural completion and live attached interruption/manual completion to the next not-affecting poll is a simulation lifecycle boundary; no unconditional generic skill-end stun is inferred.',
    'Death, retreat, removal and cancellation before cast start discard the simulation armed state. No status or deferred end action survives redeployment; native destruction-versus-tick ordering is not newly proved.',
    'The simulation removes active skill layers before resolving after-affecting status resistance. Exact native within-frame detach/poll ordering is not claimed.',
    'Finite status keeps its Buff key, owner source and own expiry, respects immunity and current status resistance, and survives ordinary active-mode restoration. Shared DEFAULT max-expiry refresh remains the existing simulation boundary.',
    'This companion certificate is not whole-skill admission. Remaining active Buffs, selected attacks, selectors, probabilities and all source level keys must still close in the parent mode compiler.',
    'JP cached component/native evidence applied to CN source levels is cross-snapshot inference. No APP extraction or native re-disassembly is performed by this compiler.',
]


def exact(value, fixed, variable=(), path=''):
    from skill_mode_compiler import require
    require(isinstance(value,dict),'end-effect-object-required',path)
    expected=set(fixed)|set(variable)
    require(set(value)==expected,'unknown-end-effect-fields',path,
            dict(extra=sorted(set(value)-expected),missing=sorted(expected-set(value))))
    for key,item in fixed.items():
        require(value[key]==item,'unsupported-end-effect-field',path+'/'+key,value[key])


def status(c, buff, levels, consumed, path):
    from skill_mode_compiler import require,numeric,digest
    fixed=dict(BUFF_FIXED,lifeTimeType=1,triggerLifeType=0,triggerCnt=0,
               triggerInterval=-1,firstTriggerInterval=-1)
    for key in ('attributes','durationKey','overrideEffectKey','lifeTime','loadFromDB'):
        fixed.pop(key)
    exact(buff,fixed,('buffKey','templateKey','attributes','durationKey','overrideEffectKey','lifeTime','loadFromDB'),path)
    require(isinstance(buff['buffKey'],str) and buff['buffKey'] and
            isinstance(buff['durationKey'],str) and isinstance(buff['overrideEffectKey'],str) and
            numeric(buff['lifeTime']) and buff['lifeTime']>=0 and
            type(buff['loadFromDB']) in (int,bool) and buff['loadFromDB'] in (0,1),
            'invalid-end-effect-status',path)
    database=c.hit_buffs.shared.database
    shared=BuffCompiler(c.templates,database)
    source=dict(buffSha256=digest(buff),rawLifetime=buff['lifeTime'])
    if buff['loadFromDB']:
        # A DB reference replaces all placeholder attributes and lifetime keys.
        require(buff['attributes']==ATTRS and buff['durationKey']=='' and
                buff['lifeTime']==0 and buff['overrideEffectKey']=='' and buff['templateKey']=='empty',
                'unsupported-end-effect-database-reference',path)
        try:effect=shared.loaded(buff['buffKey'])
        except BuffRejected as error:
            from skill_mode_compiler import Rejected
            raise Rejected('unsupported-end-effect-database',path,error.detail) from error
        require(effect['kind']=='stun','unsupported-end-effect-status-kind',path,effect['kind'])
        loaded=database[buff['buffKey']]
        key=effect['durationKey'];damage_missable=bool(loaded['isDamageMissable'])
        source.update(databaseKey=buff['buffKey'],databaseSha256=digest(loaded),rawLifetime=loaded['lifeTime'])
    else:
        require(buff['attributes']==dict(ATTRS,abnormalFlags=[0]),
                'unsupported-end-effect-status-body',path)
        key=buff['durationKey'];damage_missable=False
    template=c.templates.get(buff['templateKey'])
    require(template=={'templateKey':buff['templateKey'],'effectKey':'','onEventPriority':0,'eventToActions':{'_items':[]}},
            'unsupported-end-effect-template',path)
    require(isinstance(key,str) and key,'missing-end-effect-duration-key',path)
    require(isinstance(levels,list) and levels,'missing-end-effect-levels',path)
    for i,level in enumerate(levels):
        board=level.get('blackboard',[])
        require(isinstance(board,list) and len({b.get('key') for b in board})==len(board),
                'invalid-end-effect-level-blackboard',path+f'/levels/{i}')
        bb={b.get('key'):b.get('value') for b in board}
        require(key in bb and numeric(bb[key]) and bb[key]>0,
                'invalid-end-effect-duration',path+f'/levels/{i}/{key}',bb.get(key))
    consumed.add(key)
    source.update(templateKey=buff['templateKey'],templateSha256=digest(template))
    return dict(kind='stun',key=buff['buffKey'],duration={'key':key},target='owner',sourceId='owner',
                statusResistable='automatic',maxStack=1,independentSource=False,
                refresh='shared-max-expiry-model',damageMissable=damage_missable,source=source)


def compile_end_effects(c, rows, levels, consumed):
    """Return exact owner effects; consume duration keys only after full success."""
    from skill_mode_compiler import require,clean,digest
    matches=[row for row in rows if row['type']==TYPE]
    if not matches:return []
    require(len(matches)==1,'duplicate-end-effect-companion','skill/components')
    row=matches[0];fields=clean(row['fields'])
    exact(fields,{'m_Enabled':1,'_onlyCheckOnStopAffect':0},('_buffs',),'end-effects/component')
    require(isinstance(fields['_buffs'],list) and fields['_buffs'],'empty-end-effect-buffs')
    added=set()
    buffs=[status(c,buff,levels,added,f'end-effects/buffs/{i}') for i,buff in enumerate(fields['_buffs'])]
    require(len({buff['key'] for buff in buffs})==len(buffs),'duplicate-end-effect-buff-key')
    consumed.update(added)
    return [dict(kind='after-affecting',armEvent=2,pollWhileAttached=True,
                 onlyCheckOnStopAffect=False,oncePerCast=True,buffs=buffs,
                 source=dict(componentType=TYPE,componentId=row['node_id'],componentSha256=digest(row),
                             nativeRule=RULE,rawOnlyCheckOnStopAffect=0))]


def audit():
    """Use the single frozen closure pass, not a fresh skill/character scan."""
    from types import SimpleNamespace
    from skill_mode_compiler import Rejected,digest
    paths=['work/skill-controller-public-closures-20260918.json',
           'work/client-logic/buff-templates.json',
           'data/ArknightsGameData/zh_CN/gamedata/buff_table.json',
           'data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json']
    closure,templates,database,skills=[json.loads((ROOT/path).read_text(encoding='utf-8-sig')) for path in paths]
    c=SimpleNamespace(templates=templates,hit_buffs=SimpleNamespace(shared=SimpleNamespace(database=database)))
    accepted,rejections={},{}
    for sid,member in closure['members'].items():
        if 'BuffAfterAffecting' not in member['rootComponentTypes']:continue
        rows=[closure['componentDictionary'][ref] for ref in member['componentRefs']]
        consumed=set()
        try:
            ir=compile_end_effects(c,rows,skills[sid]['levels'],consumed)
            accepted[sid]=dict(name=member['name'],skillName=member['skillName'],charId=member['charId'],
                netNewCandidate=member['netNewCandidate'],legacyExplicitHandler=member['legacyExplicitHandler'],
                wholeSkillAccepted=False,levelCount=len(skills[sid]['levels']),source=member['source'],
                completeCachedClosure=dict(path=paths[0],memberPointer='/members/'+sid,
                    componentRefs=member['componentRefs'],buffClosure=member['buffClosure'],
                    selectedModes=member['selectedModes']),
                rootComponents=[row for row in rows if row['type']==TYPE],
                endEffects=ir,consumedKeys=sorted(consumed),
                remainingLevelKeys=sorted({b['key'] for level in skills[sid]['levels'] for b in level['blackboard']}-consumed),
                remainingRootTypes={key:value for key,value in member['rootComponentTypes'].items() if key!='BuffAfterAffecting'},
                followingGates=member['completeFollowingGates'])
        except Rejected as error:
            rejections[sid]=dict(source=member['source'],**error.record)
    sources={path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in paths+NATIVE_FILES}
    result=dict(schemaVersion=1,rule=RULE,sources=sources,sourceFingerprint=digest(sources),
        nativeObservations=dict(reset='SetData clears offset 0x29',arm='OnEvent compares event 2 then sets offset 0x29',
            poll='OnTick onlyCheck offset 0x28 false + armed offset 0x29 true + ability not affecting; clears armed before AddBuff(owner,owner,ability.blackboard)',
            stop='OnStopAffect adds Buffs only if offset 0x28 true; all admitted source fields have false'),
        lifecycleModel=dict(arm='accepted cast start',emit='first live attached transition to not-affecting',
            completionReasons=['expire','live-manual-end','live-interruption'],
            discardReasons=['death','retreat','removed','pre-cast-cancel'],
            frameOrdering='restore active mode and detach skill layers before evaluating end-status resistance',
            nativeReasonDispatchProven=False),
        integration=dict(compiler='Call compile_end_effects before final all-level key equality; admit only its fully consumed companion type, then preserve all remaining parent graph checks.',
            programField='endEffects',runtimeState='A plain JSON per-cast armed state plus source-owned status records outside active clientProgramState.',
            runtimeApi={'validate':'validate(endEffects, blackboard)',
                'start':'start(unit,time) -> boolean; freeze durations into skillEndEffectState',
                'finish':'finish(unit,time,reason="end") -> added count; after active skill/program cleanup',
                'stunned':'stunned(unit,time) -> boolean; sourceSkillEndStatuses only, no raw timer writes',
                'hasBuff':'hasBuff(unit,key,time) -> exact-key boolean',
                'clear':'clear(unit,{cancelPending:false}); dispel keeps pending armed effect, death/reset passes true'},
            start='Arm only after successful cast start; no effect during construction, rejected cast or pre-cast cancellation.',
            finish='Consume once for a live attached owner after restoring active skill layers; discard armed state on death/removal/retreat.',
            consumers=[
                {'path':'web/engine.js','entry':'operatorCanAct','needed':'Read source-owned stun alongside legacy timers.'},
                {'path':'web/src/simulation/operator-combat.js','entry':'blockerAvailable','needed':'Stunned owners cannot maintain an available blocker.'},
                {'path':'web/engine.js','entry':'abnormalHealingState / performHealingAction abnormal-clear branch','needed':'Recognize owned stun for abnormal healing and clear its status record with the legacy timer; never leave a stale exact-key Buff after dispel.'},
                {'path':'web/engine.js','entry':'notifyGarrisonStatuses','needed':'Feed owned stun into status transition notifications and clear the observed state at expiry or dispel.'},
                {'path':'web/engine.js','entry':'tryKill / respawnOperators','needed':'Clear both per-cast armed state and owned end statuses; a later life cannot inherit either.'},
                {'path':'web/src/simulation/operator-combat.js','entry':'sourceBuffActive','needed':'If status storage is separate, exact-key queries must include the new owned record.'},
                {'path':'tools/lib/room-game-runtime.js','entry':'capture / restore','needed':'Plain IDs and times serialize through existing unit state; verify before-completion and after-status snapshots once.'},
            ],
            legacyProviderBoundary='Ghost S2 is already explicit and is a migration-only same-shape member. Do not run its legacy expire stun and the new endEffects contract simultaneously.'),
        counts=dict(companionAccepted=len(accepted),companionRejected=len(rejections),wholeSkillsAccepted=0),
        accepted=accepted,rejections=rejections,boundaries=BOUNDARIES)
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args();result=audit()
    path=ROOT/'work/skill-mode-end-effects-contract.json'
    content=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.check:
        if not path.is_file() or path.read_text(encoding='utf-8')!=content:raise ValueError('End effects contract drift')
    else:path.write_text(content,encoding='utf-8')
    print(json.dumps(dict(counts=result['counts'],accepted=list(result['accepted']),rejections=result['rejections']),ensure_ascii=False))


if __name__=='__main__':main()
