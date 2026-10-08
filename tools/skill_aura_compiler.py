"""Isolated source-contract draft for maintained skill auras.

This module does not register a provider or emit web data. The audit command
freezes complete cached source records and a validated aura-layer IR, while
retaining separate mode/controller integration gaps. Candidate IDs select this
audit only; the compiler itself has no skill-ID branches.
"""
from collections import Counter
from copy import deepcopy
import argparse
import json
from pathlib import Path

from skill_mode_compiler import (ModeCompiler, Rejected, require, numeric, clean,
                                 shape, digest, C, A, FORMULAS)

ROOT=Path(__file__).resolve().parents[1]
AUDIT_IDS=('skchr_slbell_1','skchr_slbell_2','skchr_ceylon_2','skchr_accast_2','skchr_acsupo_3')
RULE='isolated-maintained-aura-source-contract-v1'
NULL={'m_FileID':0,'m_PathID':'0'}
META={'namedAsAlias':'','blackboardPrefix':''}
BASE={'m_Enabled':1,'_selector':NULL,'_metadata':META,'_attachPassiveBuffsOnDummy':1,
      '_ignoreIfOwnerDead':0,'_forceAsDmgOrHealAbility':0}
ATTRIBUTES={1:'atk',2:'def',3:'magic_resistance',7:'attack_speed',26:'one_minus_status_resistance'}
SYMBOLIC_ATTRIBUTES={name.upper():name for name in ATTRIBUTES.values()}
ATTACH_REMOVED=set('''_allowNoTarget _canCastDuringBorn _canSwitchDuringBorn _checkHasTargetBeforeDoCast
    _forceUseBaseShowRange _hasUniStackColor _hideRangeToShow _isRemoteControlled
    _onlyAvailableWhenTokenValid _rangeToShow _recoverSpIfNoTarget _resetAbilityCooldownWhenCastEnd
    _shouldCastLikeAttack _trigger _uninterruptibleOnAbilityPredelay _useTriggerInManualMode'''.split())
BUFF_ZERO='''loadFromDB isDurableBuff isDamageMissable isSilenceable isStunnable isFreezable
    isLevitatable disableOverride overrideType refreshRemainingTimeWhenStackMax clearAllStackCntWhenTimeUp
    independentCharacterSource overrideOnEventPriority onEventPriority takeSnapshotWhenExtend
    lifeTime stripBlackboardParamsWithBuffKey enableInitDirectionFromSource'''.split()
BUFF_BASE={**dict.fromkeys(BUFF_ZERO,0),'statusResistable':2,'overrideKey':'','maxStackCnt':1,
    'maxValidStackCnt':-1,'overrideEffectKey':'','audioSignal':'','lifeTimeType':2,'durationKey':'',
    'triggerLifeType':0,'triggerCnt':0,'triggerInterval':-1,'waitFirstTriggerInterval':1,
    'firstTriggerInterval':-1,'priority':-1,'priorityBBKeys':[],'blackboard':[]}
ATTR_FIELDS={'abnormalFlags','abnormalImmunes','abnormalAntis','abnormalCombos',
             'abnormalComboImmunes','attributeModifiers'}
BUFF_VARIABLE={'attributes','buffKey','templateKey','loadFromDB','isDamageMissable','disableOverride',
    'overrideKey','independentCharacterSource','overrideEffectKey','audioSignal','lifeTimeType',
    'durationKey','priorityBBKeys','stripBlackboardParamsWithBuffKey','blackboard'}


def exact(fields,fixed,variable=(),path=''):
    require(isinstance(fields,dict),'object-required',path)
    require(set(fields)==set(fixed)|set(variable),'unknown-or-missing-fields',path,
            {'extra':sorted(set(fields)-set(fixed)-set(variable)),
             'missing':sorted((set(fixed)|set(variable))-set(fields))})
    for key,value in fixed.items():
        require(fields[key]==value,'unsupported-field',path+'/'+key,fields[key])


def reference(value,path):
    exact(value,{'m_FileID':0},{'m_PathID'},path)
    require(str(value['m_PathID']).lstrip('-').isdigit(),'invalid-component-reference',path,value)
    return str(value['m_PathID'])


def boolean(value,path):
    require(type(value) in (int,bool) and value in (0,1),'invalid-boolean',path,value)
    return bool(value)


class AuraCompiler:
    def __init__(self,mode,database):
        self.mode=mode;self.templates=mode.templates;self.database=database

    def controller(self,row):
        fields=row['fields'];kind=row['type']
        prototype=deepcopy(clean(self.mode.cast))
        if kind==C+'AttachOrDetachSkill':
            prototype={k:v for k,v in prototype.items() if k not in ATTACH_REMOVED}
            prototype['_isInfinity']=0
        else:require(kind==C+'CastSkill','unsupported-aura-controller',kind)
        shape(fields,prototype,('_switchToState','_defaultModeIndex','_attackBlackboardModeIndex','_rangeIdModeIndex'),'controller')
        f=clean(fields)
        require(f['_switchToState']==0 and f['_defaultModeIndex'] in (-1,0),
                'unsupported-aura-controller-state','controller',f)
        require(all(type(f[k]) is int and f[k]>=-1 for k in ('_attackBlackboardModeIndex','_rangeIdModeIndex')),
                'invalid-mode-owner-index')
        return {'kind':'attach-or-detach' if kind.endswith('AttachOrDetachSkill') else 'cast',
            'duration':{'key':'duration'},'infinity':False,'switchToState':0,
            'attackBlackboardModeIndex':f['_attackBlackboardModeIndex'],
            'rangeIdModeIndex':f['_rangeIdModeIndex'],'defaultModeIndex':f['_defaultModeIndex'],
            'activationBoundary':'reuse skill cast acceptance and source level duration; native frame phase not asserted'}

    def validator(self,row):
        require(row['type']==C+'TargetValidator','unsupported-aura-validator',row['type'])
        f=clean(row['fields']);exact(f,{'m_Enabled':1},{'_targetOptions'},'TargetValidator')
        zero='''ignoreTargetFree ignoreAllyTargetFree ignoreHealFree ignoreTargetSide excludeSomeAbnormalFlags
            excludeAbnormalFlag purposeMask checkUnitType unitTypeMask onlyIgnoreSomeOfTargetFreeCase
            abnormalFlag abnormalCombo'''.split()
        options=f['_targetOptions']
        exact(options,{**dict.fromkeys(zero,0),'targetCategory':1},
              {'targetSide','targetMotion','enableAdvancedOptions','professionMask'},'TargetValidator/options')
        require(options['targetSide'] in (1,2) and options['targetMotion'] in (1,3)
                and options['professionMask'] in (0,32),'unsupported-aura-target-mask',actual=options)
        boolean(options['enableAdvancedOptions'],'TargetValidator/enableAdvancedOptions')
        require(options['enableAdvancedOptions'] or options['professionMask']==0,'disabled-profession-mask')
        return dict(side='ally' if options['targetSide']==1 else 'enemy',motionMask=options['targetMotion'],
            categoryMask=1,professionMask=options['professionMask'],sourceOptions=deepcopy(options),
            respectTargetFree=True)

    def normalize_buff(self,buff):
        fixed={k:v for k,v in BUFF_BASE.items() if k not in BUFF_VARIABLE}
        exact(buff,fixed,BUFF_VARIABLE,'aura Buff reference')
        for key in ('loadFromDB','isDamageMissable','disableOverride','independentCharacterSource','stripBlackboardParamsWithBuffKey'):
            boolean(buff[key],'Buff/'+key)
        require(all(isinstance(buff[k],str) for k in ('buffKey','templateKey','durationKey','overrideKey','overrideEffectKey','audioSignal'))
                and buff['buffKey'],'invalid-Buff-identity')
        if not buff['loadFromDB']:return deepcopy(buff),{'inlineSha256':digest(buff)}
        require(buff['templateKey']=='empty' and not buff['blackboard'] and not buff['priorityBBKeys'],
                'nonstandard-loaded-Buff-placeholder')
        attrs=buff['attributes'];exact(attrs,{k:[] for k in ATTR_FIELDS if k!='attributeModifiers'},
                                          {'attributeModifiers'},'loaded placeholder attributes')
        for modifier in attrs['attributeModifiers']:
            self.modifier(modifier,buff,set(),'loaded placeholder')
        loaded=self.database.get(buff['buffKey'])
        require(isinstance(loaded,dict),'missing-database-Buff',buff['buffKey'])
        expected={k:v for k,v in BUFF_BASE.items() if k not in BUFF_VARIABLE}
        expected.update(isGroundBoundable=False,statusResistable='AUTOMATIC',overrideType='DEFAULT',
                        onEventPriority='DEFAULT',triggerLifeType='IMMEDIATELY')
        exact(loaded,expected,BUFF_VARIABLE,'loaded aura Buff')
        require(not loaded['loadFromDB'] and loaded['lifeTimeType']=='INFINITY'
                and loaded['durationKey'] is None and loaded['blackboard'] in (None,[])
                and loaded['overrideEffectKey'] in (None,'') and loaded['audioSignal'] in (None,''),
                'unsupported-loaded-aura-lifetime-or-events')
        normalized=deepcopy(loaded)
        normalized.pop('isGroundBoundable')
        normalized.update(statusResistable=2,overrideType=0,onEventPriority=0,triggerLifeType=0,
                          lifeTimeType=2,durationKey='',blackboard=[],overrideEffectKey='',audioSignal='')
        return normalized,dict(databaseKey=buff['buffKey'],databaseSha256=digest(loaded),referenceSha256=digest(buff))

    def modifier(self,modifier,buff,consumed,path):
        exact(modifier,{'value':0,'loadFromBlackboard':1,'fetchBaseValueFromSourceEntity':0},
              {'attributeType','formulaItem'},path)
        raw_attr=modifier['attributeType'];raw_formula=modifier['formulaItem']
        attr=ATTRIBUTES.get(raw_attr) if type(raw_attr) is int else SYMBOLIC_ATTRIBUTES.get(raw_attr)
        formula=FORMULAS.get(raw_formula) if type(raw_formula) is int else {v.upper():v for v in FORMULAS.values()}.get(raw_formula)
        require(attr is not None and formula in ('addition','multiplier','final_scaler'),
                'unsupported-aura-attribute-or-formula',path,modifier)
        require((attr,formula) in {('atk','multiplier'),('atk','final_scaler'),('def','final_scaler'),
                ('magic_resistance','final_scaler'),('attack_speed','addition'),
                ('one_minus_status_resistance','final_scaler')},
                'unproved-aura-attribute-formula-pair',path,modifier)
        key=(buff['buffKey']+'.' if buff['stripBlackboardParamsWithBuffKey'] else '')+attr
        consumed.add(key)
        result=dict(attribute=attr,formula=formula,value={'key':key})
        if formula=='final_scaler':result['evaluation']='raw < 0 ? 1 + raw : raw'
        return result

    def buff(self,original,scope,consumed):
        buff,source=self.normalize_buff(original)
        attrs=buff['attributes'];require(set(attrs)==ATTR_FIELDS,'unknown-aura-attribute-fields')
        require(all(not value for key,value in attrs.items() if key!='attributeModifiers'),
                'unsupported-aura-status-flags')
        modifiers=[self.modifier(m,buff,consumed,'Buff/attributeModifiers') for m in attrs['attributeModifiers'] or []]
        require(len({(m['attribute'],m['formula']) for m in modifiers})==len(modifiers),'duplicate-aura-modifier')
        template=self.templates.get(buff['templateKey']);require(template is not None,'missing-aura-template',buff['templateKey'])
        effects=[];mode=None
        if buff['templateKey']=='empty':
            require(template=={'templateKey':'empty','effectKey':'','onEventPriority':0,'eventToActions':{'_items':[]}},
                    'eventful-empty-template')
        elif scope=='owner' and buff['templateKey'] in ('switch_mode','switch_mode_restart_fsm'):
            restart=self.mode.template(buff['templateKey']);bb=buff['blackboard']
            require(len(bb)==1 and set(bb[0])=={'key','value','valueStr'} and bb[0]['key']=='mode'
                    and bb[0]['valueStr']=='' and numeric(bb[0]['value']) and int(bb[0]['value'])==bb[0]['value'],
                    'unsupported-aura-mode-blackboard',actual=bb)
            mode=dict(index=int(bb[0]['value']),restartFSM=restart,restoreDefaultOnDetach=True)
        elif buff['templateKey']=='damage_scale[input]':
            node={'_filterDamageType':True,'_damageMask':'ANY_ATTACK_EXCEPT_ELEMENT','_filterApplyWay':False,
                '_applyWayFilter':'NONE','_filterModifierKey':False,'_modifierKey':'','_isOneMinus':False,
                '_isStackable':False,'_isValidStackCnt':False,'_cachedDeltaValueToBBKey':'','_customKey':'',
                '$type':C+'Action.Nodes+DamageScale'}
            exact(template,{'templateKey':'damage_scale[input]','effectKey':'','onEventPriority':0},{'eventToActions'},'incoming damage template')
            exact(template['eventToActions'],{}, {'_items'},'incoming damage events')
            events=template['eventToActions']['_items']
            require(len(events)==1,'extra-aura-template-events')
            exact(events[0],{'key':10},{'value'},'incoming damage event')
            exact(events[0]['value'],{'SerializedObjectReferences':[],'decodedActions':[node]}, {'SerializedState'},'incoming damage action')
            require(json.loads(events[0]['value']['SerializedState'])==[node],'changed-serialized-damage-action')
            require(not modifiers,'damage-scale-template-has-extra-modifiers')
            consumed.add('damage_scale');effects=[dict(kind='incoming-damage-scale',value={'key':'damage_scale'},
                damageMask='ANY_ATTACK_EXCEPT_ELEMENT',sourceEvent=10,stackable=False)]
        else:raise Rejected('unsupported-aura-template',buff['templateKey'])
        require(mode is not None or not buff['blackboard'],'unconsumed-aura-local-blackboard')
        require(buff['lifeTimeType'] in (1,2) and buff['durationKey'] in ('','duration'),'unsupported-aura-Buff-lifetime')
        require(isinstance(buff['priorityBBKeys'],list) and all(isinstance(k,str) for k in buff['priorityBBKeys']),
                'unsupported-aura-priority-keys')
        consumed.update(buff['priorityBBKeys'])
        return dict(id=buff['buffKey'],referenceKey=original['buffKey'],scope=scope,
            lifetime={'kind':'until_detach'} if buff['lifeTimeType']==2 else {'kind':'timed','duration':{'key':'duration'}},
            modifiers=modifiers,effects=effects,mode=mode,stacking=dict(maxStacks=1,
                independentSource=bool(buff['independentCharacterSource']),disableOverride=bool(buff['disableOverride']),
                overrideKey=buff['overrideKey'] or buff['buffKey'],priority=buff['priority'],priorityKeys=buff['priorityBBKeys'],
                nativeOverrideDispatch='unverified-protected-default-table'),
            source={**source,'templateKey':buff['templateKey'],'templateSha256':digest(template)})

    def compile(self,rows,levels):
        allowed={C+'CastSkill',C+'AttachOrDetachSkill',A+'ActiveAbilityWrapper',A+'AuraAbility',A+'GlobalAuraAbility',
                 C+'TargetValidator',C+'AutoLoadBoxRange',A+'ThreePartChannelingAnimation',A+'UberEffectEmitter'}
        counts=Counter(n['type'] for n in rows)
        require(not set(counts)-allowed,'unsupported-aura-siblings',actual=sorted(set(counts)-allowed))
        require(all(v==1 for v in counts.values()),'duplicate-aura-components',actual=dict(counts))
        by_type={n['type']:n for n in rows};by_id={str(n['node_id']):n for n in rows}
        require(len(by_id)==len(rows),'duplicate-aura-node-identity')
        controls=[n for n in rows if n['type'] in (C+'CastSkill',C+'AttachOrDetachSkill')]
        auras=[n for n in rows if n['type'] in (A+'AuraAbility',A+'GlobalAuraAbility')]
        require(len(controls)==len(auras)==1,'required-single-aura-and-controller')
        controller=self.controller(controls[0]);node=auras[0];fields=clean(node['fields']);global_aura=node['type']==A+'GlobalAuraAbility'
        fixed=dict(BASE,_removeBuffWhenAbilityDetached=1)
        if global_aura:
            fixed.update({k:0 for k in '''_removeBuffIncludeReborning _onlyDetactTargetWhenStarted _onlyDetectCurrentMapLayer
                _listenUnitRebornEvent _tryRemoveBuffFirstWhenReborn _useDurableRallyPointLikeSwitch _forceRemoveAllBuffsByKey
                _forceTick _excludeReborningEntity _interval _clearBuffsWhenDisappear'''.split()})
        else:fixed.update(_removeBuffWhenTargetLeave=1,_onlyAddBuffOnceForEachTarget=0,_ignoreOwnerFakeDeath=0)
        exact(fields,fixed,{'_interruptAbilityOnDetach','_targetValidator','_selfOption','_effects','_buffs','_passiveBuffs'},'AuraAbility')
        boolean(fields['_interruptAbilityOnDetach'],'AuraAbility/interrupt')
        require(fields['_selfOption'] in (0,2),'unsupported-aura-self-option')
        require(isinstance(fields['_effects'],list) and all(isinstance(v,str) for v in fields['_effects']),'invalid-aura-effects')
        validator_id=reference(fields['_targetValidator'],'AuraAbility/validator')
        require(validator_id in by_id,'missing-aura-validator')
        selection=self.validator(by_id[validator_id]);selection['selfOption']=fields['_selfOption']
        require(C+'TargetValidator' in by_type and by_type[C+'TargetValidator'] is by_id[validator_id],
                'unconsumed-aura-validator')
        if global_aura:require(C+'AutoLoadBoxRange' not in by_type,'global-aura-has-extra-range')
        else:
            require(C+'AutoLoadBoxRange' in by_type,'missing-aura-range')
            exact(clean(by_type[C+'AutoLoadBoxRange']['fields']),{'m_Enabled':1,'_extendable':0},path='Aura range')
        wrapper=by_type.get(A+'ActiveAbilityWrapper')
        if controller['kind']=='cast':
            require(wrapper is not None,'missing-aura-wrapper');w=clean(wrapper['fields'])
            exact(w,{**BASE,'_interuptIfTargetDead':0,'_resetCdStrategy':1,'_isInfinity':0,'_preDelay':0,'_enableUpdateCooldown':0},
                  {'_interruptAbilityOnDetach','_waitForAttackEvent','_wrappedAbilities','_durationKey'},'ActiveAbilityWrapper')
            require(len(w['_wrappedAbilities'])==1 and reference(w['_wrappedAbilities'][0],'wrapper/ability')==str(node['node_id']),
                    'extra-or-wrong-wrapped-ability')
            boolean(w['_interruptAbilityOnDetach'],'wrapper/interrupt');boolean(w['_waitForAttackEvent'],'wrapper/wait')
            require(w['_durationKey'] in ('','duration'),'unsupported-wrapper-duration')
            controller.update(wrapperWaitForAttackEvent=bool(w['_waitForAttackEvent']),
                wrapperDurationKey=w['_durationKey'],wrapperInterruptOnDetach=bool(w['_interruptAbilityOnDetach']))
        else:require(wrapper is None,'attach-controller-has-extra-wrapper')
        channel=by_type.get(A+'ThreePartChannelingAnimation')
        if channel:
            # Facing the front changes presentation, not action timing. All event
            # and delay flags still pass the existing complete channel validator.
            original=channel['fields'];boolean(original['_faceToFront'],'channel/faceToFront')
            adapted=deepcopy(channel);adapted['fields']['_faceToFront']=0
            controller['channel']=self.mode.channel(adapted);controller['channel']['faceToFront']=bool(original['_faceToFront'])
        if A+'UberEffectEmitter' in by_type:self.mode.visual(by_type[A+'UberEffectEmitter'],'aura/emitter')
        consumed=set();targets=[self.buff(b,'target',consumed) for b in fields['_buffs']]
        owners=[self.buff(b,'owner',consumed) for b in fields['_passiveBuffs']]
        require(targets and len({b['id'] for b in targets})==len(targets),'missing-or-duplicate-aura-target-Buff')
        require(len({b['id'] for b in owners})==len(owners),'duplicate-aura-owner-Buff')
        modes=[b['mode'] for b in owners if b['mode']]
        require(len(modes)<=1,'multiple-aura-mode-switches')
        for level in levels:
            bb={b['key']:b['value'] for b in level['blackboard']}
            require(numeric(level['duration']) and level['duration']>0,'invalid-aura-duration')
            require(all(k in bb and numeric(bb[k]) for k in consumed),'missing-aura-blackboard',actual=sorted(consumed-set(bb)))
            require(len(bb)==len(level['blackboard']),'duplicate-aura-blackboard')
            for buff in targets+owners:
                for modifier in buff['modifiers']:
                    raw=bb[modifier['value']['key']];formula=modifier['formula']
                    if formula=='final_scaler':
                        normalized=1+raw if raw<0 else raw
                        require(normalized>=0,'negative-aura-final-scaler',actual=modifier)
                        if modifier['attribute']=='one_minus_status_resistance':
                            require(normalized<=1,'invalid-aura-status-resistance',actual=raw)
                    elif formula=='multiplier':
                        require(1+raw>=0,'negative-aura-attribute-multiplier',actual=modifier)
                for effect in buff['effects']:
                    require(bb[effect['value']['key']]>=0,'negative-aura-damage-scale')
        return dict(kind='maintained-aura',controller=controller,
            range={'kind':'global' if global_aura else 'operator-range','rangeSource':'skill/selected-mode range'},
            selection=selection,buffs=targets,ownerBuffs=owners,mode=modes[0] if modes else None,
            membership=dict(removeOnLeave=not global_aura,removeOnDetach=True,reevaluateWhileActive=True,
                            sourceScoped=True,onlyAddOnce=False),consumedKeys=sorted(consumed),
            remainingKeys=sorted({b['key'] for b in levels[0]['blackboard']}-consumed),
            sourceGraphSha256=digest(rows))


def write_contract(path):
    read=lambda name:json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
    graphs=read('work/client-logic/program-compilation.json');templates=read('work/client-logic/buff-templates.json')
    database=read('data/ArknightsGameData/zh_CN/gamedata/buff_table.json')
    characters=read('data/ArknightsGameData/zh_CN/gamedata/excel/character_table.json')
    skills=read('data/ArknightsGameData/zh_CN/gamedata/excel/skill_table.json')
    mode=ModeCompiler(read('work/operator-mode-next-group.json'),graphs,templates);compiler=AuraCompiler(mode,database)
    members={};used_templates=set();used_database=set()
    for sid in AUDIT_IDS:
        cid=next(cid for cid,c in characters.items() if any(s['skillId']==sid for s in c['skills']))
        rows=graphs['rejections'][sid]['components'];skill=skills[sid]
        result=dict(charId=cid,name=characters[cid]['name'],skillName=skill['levels'][0]['name'],
            source=dict(graphPointer='work/client-logic/program-compilation.json#/rejections/'+sid+'/components',
                graphSha256=digest(rows),components=rows,levels=skill['levels'],levelSha256=digest(skill['levels'])),
            auraIR=None,integrationGaps=[],runtimeBound=False)
        try:
            ir=compiler.compile(rows,skill['levels']);result['auraIR']=ir
            for group in ('buffs','ownerBuffs'):
                for b in ir[group]:
                    used_templates.add(b['source']['templateKey'])
                    if 'databaseKey' in b['source']:used_database.add(b['source']['databaseKey'])
            consumed=set(ir['consumedKeys'])
            if ir['mode']:
                character=mode.character(cid);index=ir['mode']['index'];selected=character['modes'][index]
                result['source'].update(characterMode=selected,baseMode=character['modes'][0],
                    modeGraphSha256=digest(selected),characterBundle=character.get('bundle'))
                try:
                    checked=mode.mode(character,index)
                    action,plan,selector,actor,_=mode.attack(checked,skill,consumed,character['modes'][0],None,mode.trait_bindings(cid))
                    result['modeActionIR']=dict(action=action,plan=plan,selector=selector,actorType=actor['type'])
                except Rejected as error:result['integrationGaps'].append(error.record)
            else:result['modeActionIR']={'action':'preserve-base','reason':'no source mode-switch action'}
            remaining=sorted({b['key'] for b in skill['levels'][0]['blackboard']}-consumed)
            if remaining:result['integrationGaps'].append(dict(reason='unconsumed-skill-blackboard',keys=remaining))
            result['integrationGaps'].append(dict(reason='aura-controller-and-runtime-not-integrated',
                controller=ir['controller']['kind']))
        except Rejected as error:result['integrationGaps'].append(error.record)
        members[sid]=result
    report=dict(schemaVersion=1,rule=RULE,status='isolated-source-and-IR-draft-not-runtime-completion',
        classification={'primary':{'capability':'maintained attribute auras','candidateIds':list(AUDIT_IDS),'fixedCandidates':3,'expandedOnlyCandidates':2},
            'alternatives':[{'capability':'pure-switch ammo controller','candidateIds':['skchr_lemuen_1','skchr_lemuen_2','skchr_inside_1','skchr_inside_2']},
                {'capability':'requires-target cast gate','candidateIds':['skchr_kroos2_1','skchr_halo2_1','skchr_halo_2']}],
            'excludedFalseBatches':['BuffDuringSkill same name with different complete event graphs',
                '10 ammo first rejections are only 4 pure-switch candidates',
                '5 allowNoTarget first rejections include 2 extra eventful mechanisms']},
        sources={p:digest(read(p)) for p in ['work/garrison-batch-inventory.json','work/client-logic/program-compilation.json',
            'work/client-logic/buff-templates.json','data/ArknightsGameData/zh_CN/gamedata/buff_table.json',
            'work/skill-mode-batch-report.json','work/next-attack-batch-report.json','work/direct-skill-batch-report.json',
            'work/client-program-batch-report.json']},
        members=members,templates={k:templates[k] for k in sorted(used_templates)},
        databaseBuffs={k:database[k] for k in sorted(used_database)},
        counts={'candidates':len(members),'auraIRs':sum(m['auraIR'] is not None for m in members.values()),'newRuntimeBindings':0},
        sharedContracts={'formula':'Reuse ClientPrograms.calculate: FINAL_SCALER raw < 0 ? 1 + raw : raw.',
            'members':'Track each aura instance and target identity; remove only its owned Buffs on exit/detach.',
            'targetMasks':'Preserve complete TargetValidator options. SelfOption 0 follows validator; 2 excludes owner (metadata enum DEFAULT/INCLUDE/EXCLUDE, mapping follows existing source convention).',
            'stacking':'Preserve source disableOverride, independentCharacterSource, overrideKey, priorityBBKeys; do not collapse them to source Buff key.',
            'lifecycle':'Finite source duration. AttachOrDetachSkill owns attachment for its active lifetime; source exact fields retained for controller implementation.',
            'damageScale':'Source event 10 DamageScale excludes elemental damage; retain non-stackable priority group.',
            'boundaries':['No provider/runtime/checklist modifications by this draft.',
                'Source graph/fields verified from retained caches; native Aura/AttachOrDetach frame timing is not asserted.',
                'CN numeric levels with JP source graphs retain the existing cross-snapshot boundary.',
                'Native DEFAULT Buff override table remains protected; no renewed extraction.',
                'A compiled aura layer does not prove selected ordinary action, talent side effects, controller integration or whole-skill completion.']})
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'work/skill-aura-batch-contract.json')
    args=parser.parse_args();report=write_contract(args.output)
    print(json.dumps({'counts':report['counts'],'gaps':{k:v['integrationGaps'] for k,v in report['members'].items()}},ensure_ascii=False))
