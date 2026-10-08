"""Complete appearance-triggered self Buff graphs on the shared mode IR."""
from copy import deepcopy

DEPLOYMENT_BOUNDARIES = [
    'AppearSkill castOnLocate selects entry or locate simulation phases once per deployment. Its native entry methods are protected; exact frame timing and emit_skill_started=false are simulation conventions.',
    'Native dynamic shield initialization, periodic subtraction from initial capacity and min-damage consumption are proven by the bounded deployment-node contract. waitFirst=false runs an immediate first periodic tick in this simulation.',
    'RemainingRatioToAttributeModifier computes the interpolated DEF value natively; its protected formula-dispatch branch is bound to the serialized MULTIPLIER field by inference. DEF samples the current remaining ratio each source period.',
]


def compile_appearance(c,sid,skill,char_id,prefab,rows):
    # Imported after ModeCompiler is initialized: this helper consumes its
    # validators and never maintains a second permissive graph reader.
    from skill_mode_compiler import ROOT,C,A,Rejected,require,numeric,shape,exactly_one,digest,BOUNDARIES
    contract=c.appearance_contract
    allowed={C+'AppearSkill',A+'ActiveBuffAbility',A+'SetAttributeAsDynamicVar'}
    require(all(r['type'] in allowed for r in rows),'unsupported-appearance-companions','skill/components',
            sorted({r['type'] for r in rows}-allowed))
    controller=exactly_one(rows,C+'AppearSkill');active=exactly_one(rows,A+'ActiveBuffAbility');cast=controller['fields'];body=active['fields']
    prototype=contract['members'][0]['controller']['fields']
    shape(cast,prototype,('_castOnLocate','_attackBlackboardModeIndex','_rangeIdModeIndex',
                         '_overrideStartEffect','_overrideAudioSignalId'),'AppearSkill')
    require(cast['_castOnLocate'] in (0,1) and cast['_overrideAudioSignalId'] in (0,1)
            and isinstance(cast['_overrideStartEffect'],str),'unsupported-appearance-controls')
    shape(body,c.active,('_buffs','_passiveBuffs','_waitForAttackEvent','_interruptAbilityOnDetach'),'appearance/ActiveBuffAbility')
    require(body['_waitForAttackEvent'] in (0,1) and body['_interruptAbilityOnDetach'] in (0,1),'unsupported-appearance-active-control')
    require(cast['m_GameObject']==body['m_GameObject'],'appearance-controller-owner-mismatch')
    require(bool(body['_buffs']),'empty-appearance-buffs')
    levels=skill['levels'];keys={b['key'] for b in levels[0]['blackboard']};consumed=set()
    if 'duration' in keys:consumed.add('duration')
    captures=[n for n in rows if n['type']==A+'SetAttributeAsDynamicVar'];used_captures=set()

    def template_kind(buff):
        value=c.templates.get(buff['templateKey'])
        require(isinstance(value,dict),'missing-appearance-template',buff['templateKey'])
        for key in ('def_atten','shield_atten','utage_s_2'):
            ref=deepcopy(contract['templates'][key]);ref['templateKey']=buff['templateKey']
            if value==ref:return key
        return None

    def special_buff(buff,index):
        kind=template_kind(buff)
        require(kind is not None,'unsupported-appearance-buff-template','buff/'+str(index),buff['templateKey'])
        ref=next(b for member in contract['members'] for b in member['active']['fields']['_buffs'] if b['templateKey']==kind)
        shape(buff,ref,('buffKey','templateKey','overrideEffectKey'),'appearance/buff/'+str(index))
        require(isinstance(buff['overrideEffectKey'],str) and isinstance(buff['buffKey'],str) and buff['buffKey'],
                'invalid-appearance-buff-identity')
        output=dict(id=buff['buffKey'],scope='self',lifetime={'kind':'timed','duration':{'key':'duration'}},
                    stacking={'max_stacks':1},modifiers=[])
        if kind=='def_atten':
            consumed.add('def');output['periodic']=deepcopy(contract['newBuffOperators']['periodic'])
        elif kind=='shield_atten':
            require(len(captures)==1,'appearance-shield-missing-dynamic-capture')
            capture=captures[0];f=capture['fields']
            require(f['m_GameObject']==body['m_GameObject'],'appearance-dynamic-owner-mismatch')
            source=next(n for member in contract['members'] for n in member['extraComponents'] if n['type']==A+'SetAttributeAsDynamicVar')
            shape(f,source['fields'],path='appearance/dynamic-capture');used_captures.add(capture['node_id'])
            consumed.add(f['_scaleVar']);output['shield']=deepcopy(contract['newBuffOperators']['shield'])
        else:
            consumed.add('hp_ratio');output['on_attach']=deepcopy(contract['newBuffOperators']['on_attach'])
        output['source']={'templateSha256':digest(c.templates[buff['templateKey']]),'buffSha256':digest(buff)}
        return output

    switches=[(i,b) for i,b in enumerate(body['_buffs']) if b['templateKey'] in ('switch_mode','switch_mode_restart_fsm')]
    require(len(switches)<=1,'multiple-appearance-mode-switches')
    mode_index=None;mode_buff_index=None;restart=False
    if switches:
        mode_buff_index,mode_buff=switches[0];restart=c.template(mode_buff['templateKey']);board=mode_buff['blackboard']
        require(not board or len(board)==1 and set(board[0])=={'key','value','valueStr'} and board[0]['key']=='mode'
                and board[0]['valueStr']=='' and numeric(board[0]['value']) and int(board[0]['value'])==board[0]['value'],
                'invalid-appearance-mode-blackboard')
        mode_index=int(board[0]['value']) if board else 1
    buffs=[]
    for index,buff in enumerate(body['_buffs']):
        if buff['templateKey'] in ('empty','switch_mode','switch_mode_restart_fsm'):
            output=c.buff_body(buff,consumed,'appearance/buff/'+str(index),index==mode_buff_index)
            require(output['lifetime']['kind']=='timed','appearance-requires-finite-buffs')
        else:output=special_buff(buff,index)
        buffs.append(output)
    require(len({b['id'] for b in buffs})==len(buffs),'duplicate-appearance-buff-identity')
    require({n['node_id'] for n in captures}==used_captures,'unused-appearance-dynamic-capture')

    passive=[]
    for raw in body['_passiveBuffs']:
        ref=next(b for member in contract['members'] for b in member['active']['fields']['_passiveBuffs'])
        shape(raw,ref,('buffKey','overrideEffectKey'),'appearance/passive')
        require(isinstance(raw['buffKey'],str) and raw['buffKey'] and isinstance(raw['overrideEffectKey'],str),
                'invalid-appearance-passive-identity')
        consumed.add('respawn_time');passive.extend(deepcopy(contract['programPassiveModifiers']))
    require(len(passive)<=1,'duplicate-appearance-passive-modifier')

    character=c.character(char_id);mode=None;actor=None;selector=None
    if mode_index is None:
        require(cast['_attackBlackboardModeIndex']==cast['_rangeIdModeIndex']==-1,'non-mode-appearance-parameter-routing')
        action='inherit';plan=None;selection=None
    else:
        mode=c.mode(character,mode_index)
        require(cast['_attackBlackboardModeIndex'] in (-1,mode_index) and cast['_rangeIdModeIndex'] in (-1,mode_index),
                'appearance-other-mode-parameter-owner')
        action,plan,selection,actor,selector=c.attack(mode,skill,consumed,character['modes'][0],trait_bindings=c.trait_bindings(char_id))
        require(actor['type'] in (A+'MeleeAttack',A+'MultiMeleeAttack'),'unsupported-appearance-ranged-delivery')
    require(keys==consumed,'unconsumed-appearance-blackboard',sid,dict(source=sorted(keys),consumed=sorted(consumed)))
    for level in levels:
        bb={b['key']:b['value'] for b in level['blackboard']};sp=level['spData'];duration=bb.get('duration',level['duration'])
        require(set(bb)==keys and len(bb)==len(level['blackboard']) and all(numeric(v) for v in bb.values()),'changed-appearance-blackboard')
        require(level['prefabId']==prefab and level['skillType']=='PASSIVE' and level['durationType']=='NONE' and level['rangeId'] is None
                and sp['spType']==8 and all(sp[k]==0 for k in ('spCost','initSp','maxChargeTime','increment'))
                and numeric(duration) and duration>0,'invalid-appearance-level-controller')
        require(all(bb.get(k,0)>=0 for k in ('def','hp_ratio','respawn_time')),'invalid-appearance-parameters')
        if any('shield' in b for b in buffs):require(bb['hp_ratio']>0,'invalid-appearance-shield-ratio')
        if any('on_attach' in b for b in buffs):require(0<=bb['hp_ratio']<=1,'invalid-appearance-hp-cost')
        for b in buffs:
            for m in b['modifiers']:
                value=m['value'];require('constant' in value or value['key'] in bb,'missing-appearance-modifier-parameter')
        if plan:
            get=lambda value:bb[value['key']] if isinstance(value,dict) and 'key' in value else value.get('constant',value.get('default')) if isinstance(value,dict) else value
            require(1<=get(plan['targets'])<=64 and int(get(plan['targets']))==get(plan['targets'])
                    and 1<=get(plan['hits'])<=32 and int(get(plan['hits']))==get(plan['hits']) and get(plan['scale'])>0,'invalid-appearance-plan')
    source=dict(graphSha256=digest(rows),modeGraphSha256=digest(mode) if mode else None,prefabId=prefab,
        characterPathId=character['characterPathId'],modePathId=mode['pathId'] if mode else None,
        bundle=character['bundle'],bundleSha256=character['bundleSha256'],
        attackNode=actor['node_id'] if actor else None,selectorNode=selector['node_id'] if selector else None,
        skillGraphPointer='work/client-logic/program-compilation.json#/rejections/'+prefab+'/components',
        sourceLevelsSha256=digest(levels),sourceVersion=c.evidence.manifest['source_version'],
        evidenceLevels=dict(serializedGraph='Verified',levelToGraph='cross-snapshot inference',nativeFrameEquivalence='unverified'),
        controller=dict(type=controller['type'],castOnLocate=bool(cast['_castOnLocate']),attackBlackboardModeIndex=cast['_attackBlackboardModeIndex'],
                        rangeIdModeIndex=cast['_rangeIdModeIndex'],restartFSM=restart),
        nativeDeploymentContract='work/client-logic/native-deployment-buffs/contract.json',
        model_boundaries=BOUNDARIES+DEPLOYMENT_BOUNDARIES)
    control=dict(kind='appear_skill_active_buffs',activation='deploy',duration_policy='max_buff_duration',cast_on_locate=bool(cast['_castOnLocate']),
        emit_skill_started=False,pre_delay=0,wait_for_casting=False,wait_for_attack_event=bool(body['_waitForAttackEvent']),
        interrupt_on_detach=bool(body['_interruptAbilityOnDetach']))
    profile=dict(prefabId=prefab,charIds=[char_id],blackboardKeys=sorted(keys),levelCount=len(levels),activation='deploy',modeIndex=mode_index,
        modeBuffIndex=mode_buff_index,lifetime={'kind':'timed','duration':{'key':'duration'}},action=action,plan=plan,selector=selection,
        disarmed=False,channeling=None,source=source)
    program=dict(controller=control,buffs=buffs,source=source)
    if passive:program['passive_modifiers']=passive
    return profile,program
