"""Closed source template for one delayed conditional hit, not a Buff VM."""
import json
from next_attack_compiler import Rejected, contract, digest, finite, require

N = 'Torappu.Battle.Action.Nodes+'
FINISH = {'_decCntIfStack': False, '_updateOverrideMap': True, '$type': N + 'FinishBuff'}
ATTRS = {k: [] for k in ('abnormalFlags', 'abnormalImmunes', 'abnormalAntis', 'abnormalCombos', 'abnormalComboImmunes', 'attributeModifiers')}
BUFF_FIXED = {**dict.fromkeys('''loadFromDB isDurableBuff isDamageMissable isSilenceable isStunnable
    isFreezable isLevitatable disableOverride overrideType refreshRemainingTimeWhenStackMax
    clearAllStackCntWhenTimeUp independentCharacterSource overrideOnEventPriority onEventPriority
    takeSnapshotWhenExtend lifeTime stripBlackboardParamsWithBuffKey enableInitDirectionFromSource'''.split(), 0),
    'attributes': ATTRS, 'statusResistable': 2, 'overrideKey': '', 'maxStackCnt': 1, 'maxValidStackCnt': -1,
    'overrideEffectKey': '', 'audioSignal': '', 'lifeTimeType': 2, 'durationKey': 'duration',
    'triggerLifeType': 1, 'triggerCnt': 1, 'waitFirstTriggerInterval': 1, 'priority': -1,
    'priorityBBKeys': [], 'blackboard': []}
CONDITION = {'_targetType': 'BUFF_OWNER', '_motionMask': 'FLY_ONLY', '_checkTargetAlive': False,
    '_checkApplyWay': False, '_checkTargetUnitType': False, '_unitType': 'ENEMY', '_applyWay': 'NONE',
    '_checkTargetFree': False, '$type': N + 'IfTarget'}
DAMAGE = {**dict.fromkeys('''_baseOnHostAtk _emitSourceOnCalculateDamage _forceUseProjectileCachedAtk
    _ignoreForSp _assignRealDamageToBB _assignFinalDamageToBB _skipModifierEvent _noSource
    _onlyUseSourceOnCalculateDamage _getCachedAtkFromBlackboard _setSharedFlag'''.split(), False),
    '_sourceType': 'SOURCE', '_targetType': 'TARGET', '_damageType': 'MAGICAL', '_defaultAtkScale': 1,
    '_applyWay': 'NONE', '_attackType': 'NORMAL', '_ignoreMissFlag': 'NONE', '_ignoreCancelReasonMask': 'NONE',
    '_modifierKey': '', '_cachedAtkKey': 'atk', '_sharedFlagIndex': 'IS_CONTINUOUS', '$type': N + 'AdvancedApplyDamage'}


class HitBuffCompiler:
    def __init__(self, templates, database=None):
        self.templates, self.database = templates, database or {}

    def compile(self, buffs):
        try:
            return self._compile(buffs)
        except Rejected as error:
            raise Rejected('active-buffs', error.detail) from error

    def _compile(self, buffs):
        require(len(buffs) == 1, 'active-buffs', 'one complete delayed-hit Buff required')
        buff = buffs[0]
        if buff.get('loadFromDB'):
            return self._loaded_attribute(buff)
        if buff.get('lifeTimeType') == 1 and buff.get('triggerLifeType') == 0:
            return self._inline_attribute(buff)
        contract(buff, BUFF_FIXED, {'buffKey', 'templateKey', 'triggerInterval', 'firstTriggerInterval'}, 'hit Buff')
        require(isinstance(buff['buffKey'], str) and buff['buffKey'] and finite(buff['triggerInterval'])
                and buff['triggerInterval'] > 0 and buff['firstTriggerInterval'] == buff['triggerInterval'],
                'active-buffs', 'invalid delayed one-shot schedule')
        template = self.templates.get(buff['templateKey'])
        require(isinstance(template, dict), 'active-buffs', 'missing template ' + str(buff['templateKey']))
        contract(template, {'templateKey': buff['templateKey'], 'effectKey': '', 'onEventPriority': 0}, {'eventToActions'}, 'hit template')
        require(set(template['eventToActions']) == {'_items'}, 'active-buffs', 'unknown event container')
        events = template['eventToActions']['_items']
        require(len(events) == 1 and set(events[0]) == {'key', 'value'} and events[0]['key'] == 2,
                'active-buffs', 'only ON_BUFF_TRIGGER may execute')
        event = events[0]['value']
        contract(event, {'SerializedObjectReferences': []}, {'SerializedState', 'decodedActions'}, 'hit event')
        require(json.loads(event['SerializedState']) == event['decodedActions'], 'active-buffs', 'decoded actions do not cover serialization')
        actions = event['decodedActions']
        require(len(actions) == 1, 'active-buffs', 'extra sibling actions')
        branch = actions[0]
        contract(branch, {'$type': N + 'IfElse', '_conditionNode': CONDITION, '_failNodes': [FINISH]}, {'_succeedNodes'}, 'conditional hit')
        succeed = branch['_succeedNodes']
        require(len(succeed) == 3 and succeed[1:] == [{'$type': N + 'AlwaysNext'}, FINISH], 'active-buffs', 'extra success actions')
        contract(succeed[0], DAMAGE, {'_atkScaleVar'}, 'conditional damage')
        scale = succeed[0]['_atkScaleVar']
        require(isinstance(scale, str) and scale, 'active-buffs', 'missing damage scale binding')
        return [dict(kind='delayed-conditional-hit', key=buff['buffKey'], delay=buff['triggerInterval'],
                     condition='flying', scaleKey=scale, damageType='arts', power='live-source-at-trigger',
                     maxStack=1, source=dict(templateKey=buff['templateKey'], templateSha256=digest(template), buffSha256=digest(buff)))]

    def _empty_template(self, key):
        template = self.templates.get(key)
        require(template == {'templateKey': key, 'effectKey': '', 'onEventPriority': 0, 'eventToActions': {'_items': []}},
                'active-buffs', 'attribute Buff has additional template events')
        return template

    def _inline_attribute(self, buff):
        fixed = dict(BUFF_FIXED, lifeTimeType=1, triggerLifeType=0, triggerCnt=0, triggerInterval=-1,
                     firstTriggerInterval=-1)
        for key in ('attributes', 'durationKey', 'independentCharacterSource', 'overrideEffectKey'):
            fixed.pop(key)
        contract(buff, fixed, {'buffKey', 'templateKey', 'attributes', 'durationKey',
                             'independentCharacterSource', 'overrideEffectKey'}, 'finite attribute Buff')
        require(buff['independentCharacterSource'] == 1 and buff['durationKey'] in ('', 'duration')
                and isinstance(buff['overrideEffectKey'], str), 'active-buffs', 'unsupported attribute ownership/duration')
        attrs = buff['attributes']
        contract(attrs, {k: [] for k in ATTRS if k != 'attributeModifiers'}, {'attributeModifiers'}, 'attribute Buff modifiers')
        modifiers = attrs['attributeModifiers']
        require(len(modifiers) == 1, 'active-buffs', 'one finite DEF modifier required')
        contract(modifiers[0], {'attributeType': 2, 'formulaItem': 3, 'value': 0, 'loadFromBlackboard': 1,
                               'fetchBaseValueFromSourceEntity': 0}, label='DEF final scaler')
        template = self._empty_template(buff['templateKey'])
        return [dict(kind='defense-multiplier', key=buff['buffKey'], valueKey='def', durationKey=buff['durationKey'] or 'duration',
                     independentSource=True, source=dict(templateKey=buff['templateKey'], templateSha256=digest(template), buffSha256=digest(buff)))]

    def _loaded_attribute(self, ref):
        fixed = dict(BUFF_FIXED, loadFromDB=1, lifeTimeType=1, durationKey='', triggerLifeType=0,
                     triggerCnt=0, triggerInterval=-1, firstTriggerInterval=-1)
        fixed.pop('attributes')
        contract(ref, fixed, {'buffKey', 'templateKey', 'attributes'}, 'database Buff reference')
        require(ref['templateKey'] == 'empty' and all(ref['attributes'].get(k) == [] for k in ATTRS if k != 'abnormalFlags')
                and set(ref['attributes']) == set(ATTRS) and ref['attributes']['abnormalFlags'] in ([], [0]),
                'active-buffs', 'nonstandard database Buff placeholder')
        loaded = self.database.get(ref['buffKey'])
        require(isinstance(loaded, dict), 'active-buffs', 'missing database Buff ' + str(ref['buffKey']))
        # loadFromDB replaces the placeholder, including its dummy STUNNED flag
        # and isDamageMissable. Only the loaded complete definition is executed.
        db_fixed = dict(fixed, loadFromDB=False, isDamageMissable=True, isGroundBoundable=False,
            statusResistable='AUTOMATIC', overrideKey=None, overrideType='DEFAULT', onEventPriority='DEFAULT',
            audioSignal=None, lifeTimeType='LIMITED', triggerLifeType='IMMEDIATELY', priorityBBKeys=None, blackboard=None)
        for key in ('durationKey', 'overrideEffectKey'):
            db_fixed.pop(key)
        db_fixed.update(buffKey=ref['buffKey'], templateKey='empty')
        contract(loaded, db_fixed, {'attributes', 'durationKey', 'overrideEffectKey'}, 'loaded finite attribute Buff')
        attrs = loaded['attributes']
        contract(attrs, {k: None for k in ATTRS if k != 'attributeModifiers'}, {'attributeModifiers'}, 'loaded attributes')
        modifiers = attrs['attributeModifiers']
        require(len(modifiers) == 1, 'active-buffs', 'one loaded move-speed scaler required')
        contract(modifiers[0], {'attributeType': 'MOVE_SPEED', 'formulaItem': 'FINAL_SCALER', 'loadFromBlackboard': False,
                               'fetchBaseValueFromSourceEntity': False}, {'value'}, 'loaded movement scaler')
        value = modifiers[0]['value']
        require(finite(value) and -1 < value < 0 and isinstance(loaded['durationKey'], str) and loaded['durationKey']
                and isinstance(loaded['overrideEffectKey'], str), 'active-buffs', 'invalid loaded speed/duration')
        template = self._empty_template(loaded['templateKey'])
        return [dict(kind='movement-multiplier', key=loaded['buffKey'], value=1+value, durationKey=loaded['durationKey'],
                     independentSource=False, damageMissable=True,
                     source=dict(databaseKey=loaded['buffKey'], databaseSha256=digest(loaded), templateSha256=digest(template), buffSha256=digest(ref)))]
