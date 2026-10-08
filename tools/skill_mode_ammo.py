"""Finite ammo over one effective main RangedAttack and its event counter."""
from copy import deepcopy
import json

AMMO_BOUNDARIES=[
    'AbilityStandard.Event 4 is natively ON_SPELL_ON. A single direct main actor consumes one round per accepted primary action in this model; protected counter getter/event bodies do not prove the exact coroutine phase.',
    'Only effective-main-attack (_fromMainRawAttack=0) with a same-object counter is admitted. Raw-main progress, nested ability groups, alternate counters and reset-at-attack-finish contracts remain rejected.',
    'The native single-target secondary selector retains the ranged-apply-way matching subset before target truncation. PostFilter 6 is named HATRED_DES_FLY_FIRST in metadata; flying-before-hatred comparator order remains an explicit simulation convention because the called FilterUtil comparator was not read.',
    'Ammo exhaustion, source death and programmatic skill end reuse the existing skill lifecycle. Source canDiscardRemaining is retained but no player manual-stop UI is added to automatic garrison battles.',
]


class AmmoCompiler:
    def __init__(self):
        from skill_mode_compiler import ROOT,C,A
        source=json.loads((ROOT/'work/skill-ammo-controller-contract.json').read_text(encoding='utf-8'))
        member=next(iter(source['members'].values()))
        self.controller=next(n['fields'] for n in member['source']['skillGraph'] if n['type']==C+'CastSkillWithLimitTimes')
        self.counter=next(n['fields'] for n in member['source']['selectedMode']['roles']['_attack'] if n['type']==A+'AbilityEventCounter')

    def cast(self,fields):
        from skill_mode_compiler import shape,require
        shape(fields,self.controller,('_modeIndex','_attackBlackboardModeIndex','_rangeIdModeIndex','_defaultModeIndex',
              '_playSkillBeginAnim','_beginAnim','_beginAnimDown','_beginEffect','_uninterruptibleOnAbilityPredelay'),'finite-ammo/controller')
        require(type(fields['_modeIndex']) is int and fields['_modeIndex']>0
                and fields['_attackBlackboardModeIndex']==fields['_modeIndex'],'ammo-progress-mode-mismatch')
        return dict(count={'key':'attack@trigger_time'},progressSource='effective-main-attack',sourceCountEvent=4,
            sourceEventName='ON_SPELL_ON',expendPerTrigger=1,finishOnEmpty=True,canDiscardRemaining=True,
            resetAfterEnd=True,resetImmediatelyWhenProgressEnd=False,resetWhenAttackFinished=False,
            modeIndex=fields['_modeIndex'])

    def actor(self,mode,ammo):
        from skill_mode_compiler import A,require,shape,exactly_one,digest
        actor=exactly_one(mode['roles']['_attack'],A+'RangedAttack','ammo/main-actor')
        counter=exactly_one(mode['roles']['_attack'],A+'AbilityEventCounter','ammo/counter')
        require(mode['fields']['_attack']['m_PathID']==actor['node_id'],'ammo-main-actor-is-indirect')
        require(actor['fields']['m_GameObject']==counter['fields']['m_GameObject'],'ammo-counter-owner-mismatch')
        shape(counter['fields'],self.counter,path='ammo/counter')
        require(mode['index']==ammo['modeIndex'],'ammo-progress-mode-mismatch')
        require(actor['fields']['_waitForProjectileInvalid']==0 and actor['fields']['_activeBuffs']==[],
                'unsupported-ammo-main-actor-side-effects')
        return dict(nodeId=counter['node_id'],actorNodeId=actor['node_id'],sourceSha256=digest(counter),
                    sourceEventName='ON_SPELL_ON',fromMainRawAttack=False)

    def level(self,level,prefab,bb):
        from skill_mode_compiler import numeric,require
        count=bb.get('attack@trigger_time')
        require(level['prefabId']==prefab and level['skillType'] in ('AUTO','MANUAL') and level['durationType']=='AMMO'
                and level['duration']==0 and level['spData']['spType'] in
                ('INCREASE_WITH_TIME','INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE') and level['spData']['spCost']>0,
                'unsupported-finite-ammo-level-controller')
        require(numeric(count) and int(count)==count and 0<count<=9007199254740991,'invalid-source-ammo-count')

    def bind(self,profile,program,ammo,counter):
        profile.update(capability='finite-ammo',activation='cast',lifetime={'kind':'until_ammo_depleted'},ammo=deepcopy(ammo))
        profile['plan']['ammo']=ammo['expendPerTrigger']
        program['controller'].update(kind='cast_skill_with_limit_times',duration_policy='ammo_count',ammo=deepcopy(ammo))
        source=profile['source'];source['ammoCounter']=counter
        source['nativeAmmoContract']='work/client-logic/native-ammo-controller/contract.json'
        source['nativeTargetContract']='work/client-logic/native-ammo-selector/contract.json'
        source['targetEnums']='work/client-logic/skill-ammo-target-enums.json'
        source['model_boundaries']=source['model_boundaries']+AMMO_BOUNDARIES
